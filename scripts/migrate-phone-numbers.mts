import { serverDb, serverAuth } from "../src/lib/server/cloudinaryServer";
import { normalizeE164, isValidE164, hashPhoneNumber } from "../src/lib/server/phoneUtils";

export interface MigrationOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

export interface MigrationResult {
  dryRun: boolean;
  totalUsersScanned: number;
  usersWithPhone: number;
  verifiedUsers: number;
  alreadyMigrated: number;
  cleanToMigrate: number;
  migratedCount: number;
  duplicatePhoneConflicts: Array<{ phone: string; uids: string[]; error: string }>;
  authMismatches: Array<{ uid: string; firestorePhone: string; authPhone: string | null }>;
  invalidFormatUsers: Array<{ uid: string; rawPhone: string }>;
}

export async function runPhoneMigration(options: MigrationOptions = {}): Promise<MigrationResult> {
  const dryRun = options.dryRun ?? true; // SAFE BY DEFAULT
  const db = serverDb();
  const auth = serverAuth();

  const result: MigrationResult = {
    dryRun,
    totalUsersScanned: 0,
    usersWithPhone: 0,
    verifiedUsers: 0,
    alreadyMigrated: 0,
    cleanToMigrate: 0,
    migratedCount: 0,
    duplicatePhoneConflicts: [],
    authMismatches: [],
    invalidFormatUsers: [],
  };

  const usersSnap = await db.collection("users").get();
  result.totalUsersScanned = usersSnap.size;

  // 1. Group users by normalized phone to detect duplicates across users collection
  const phoneToUids = new Map<string, string[]>();
  const userDocsList: Array<{ uid: string; data: any }> = [];

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    userDocsList.push({ uid: doc.id, data });

    if (data.phone) {
      result.usersWithPhone++;
      if (data.phone_verified === true) {
        result.verifiedUsers++;
      }

      const normalized = normalizeE164(data.phone);
      if (!isValidE164(normalized)) {
        result.invalidFormatUsers.push({ uid: doc.id, rawPhone: data.phone });
        continue;
      }

      const existingList = phoneToUids.get(normalized) || [];
      existingList.push(doc.id);
      phoneToUids.set(normalized, existingList);
    }
  }

  // 2. Identify duplicate phone occurrences
  const duplicatePhones = new Set<string>();
  for (const [phone, uids] of phoneToUids.entries()) {
    if (uids.length > 1) {
      duplicatePhones.add(phone);
      result.duplicatePhoneConflicts.push({
        phone,
        uids,
        error: "DUPLICATE_ACROSS_FIRESTORE_PROFILES",
      });
    }
  }

  // 3. Process candidate users for migration
  for (const { uid, data } of userDocsList) {
    if (!data.phone || data.phone_verified !== true) {
      continue;
    }

    const normalized = normalizeE164(data.phone);
    if (!isValidE164(normalized)) {
      continue;
    }

    // If duplicate phone was detected, do NOT automatically claim for any user (Safe Gate)
    if (duplicatePhones.has(normalized)) {
      continue;
    }

    // Verify Firebase Auth identity match
    let authUserRecord: any = null;
    try {
      authUserRecord = await auth.getUser(uid);
    } catch (err: any) {
      // User might not exist in Auth
      result.authMismatches.push({
        uid,
        firestorePhone: normalized,
        authPhone: null,
      });
      continue;
    }

    const authPhone = authUserRecord.phoneNumber ? normalizeE164(authUserRecord.phoneNumber) : null;
    if (authPhone !== normalized) {
      result.authMismatches.push({
        uid,
        firestorePhone: normalized,
        authPhone,
      });
      continue;
    }

    // Check if phone_numbers document already exists
    const phoneHash = hashPhoneNumber(normalized);
    const phoneDocRef = db.collection("phone_numbers").doc(phoneHash);
    const existingPhoneDoc = await phoneDocRef.get();

    if (existingPhoneDoc.exists) {
      const ownerUid = existingPhoneDoc.data()?.uid;
      if (ownerUid === uid) {
        result.alreadyMigrated++;
        continue;
      } else {
        result.duplicatePhoneConflicts.push({
          phone: normalized,
          uids: [uid, ownerUid],
          error: "ALREADY_RESERVED_BY_ANOTHER_UID",
        });
        continue;
      }
    }

    // Clean to migrate
    result.cleanToMigrate++;

    if (!dryRun) {
      const now = new Date().toISOString();
      await db.runTransaction(async (tx) => {
        const docSnap = await tx.get(phoneDocRef);
        if (docSnap.exists && docSnap.data()?.uid !== uid) {
          throw new Error("CONCURRENT_RESERVATION_CONFLICT");
        }
        tx.set(
          phoneDocRef,
          {
            uid,
            created_at: now,
            updated_at: now,
            phone_hash: phoneHash,
          },
          { merge: true }
        );
      });
      result.migratedCount++;
    }
  }

  if (options.verbose) {
    console.log("=== Phone Numbers Migration Summary ===");
    console.log(`Mode: ${dryRun ? "DRY-RUN (No writes)" : "APPLY (Writes executed)"}`);
    console.log(`Total users scanned: ${result.totalUsersScanned}`);
    console.log(`Users with phone: ${result.usersWithPhone}`);
    console.log(`Verified users: ${result.verifiedUsers}`);
    console.log(`Already migrated: ${result.alreadyMigrated}`);
    console.log(`Clean candidates: ${result.cleanToMigrate}`);
    console.log(`Migrated: ${result.migratedCount}`);
    console.log(`Duplicate phone conflicts: ${result.duplicatePhoneConflicts.length}`);
    console.log(`Auth mismatches: ${result.authMismatches.length}`);
    console.log(`Invalid format: ${result.invalidFormatUsers.length}`);
  }

  return result;
}

// Direct CLI invocation
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const isApply = process.argv.includes("--apply");
  runPhoneMigration({ dryRun: !isApply, verbose: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
