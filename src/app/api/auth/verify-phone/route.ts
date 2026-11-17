import { NextResponse } from "next/server";
import { authorize, serverDb, serverAuth } from "../../../../lib/server/cloudinaryServer";
import { normalizeE164, isValidE164, hashPhoneNumber } from "../../../../lib/server/phoneUtils";

export async function POST(request: Request) {
  // 1. Authenticate caller: Must be a valid, signed, non-anonymous Firebase session
  const uid = await authorize(request, false, false);
  if (typeof uid === "number") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: uid });
  }

  try {
    // 2. Query Firebase Auth authority directly to verify that this phone was indeed verified by Google SMS OTP
    const userRecord = await serverAuth().getUser(uid);
    if (!userRecord || !userRecord.phoneNumber) {
      return NextResponse.json(
        { error: "PHONE_NOT_VERIFIED_IN_AUTH", message: "No verified phone number found in authentication provider." },
        { status: 400 }
      );
    }

    const verifiedPhone = normalizeE164(userRecord.phoneNumber);
    if (!isValidE164(verifiedPhone)) {
      return NextResponse.json(
        { error: "INVALID_PHONE_FORMAT", message: "Phone number from authentication provider is not a valid E.164 format." },
        { status: 400 }
      );
    }

    // Optional payload verification: if caller supplied a phone, ensure it strictly matches Auth record
    const body = await request.json().catch(() => null);
    if (body && typeof body === "object" && typeof body.phone === "string") {
      const requestedPhone = normalizeE164(body.phone);
      if (requestedPhone !== verifiedPhone) {
        return NextResponse.json(
          { error: "PHONE_MISMATCH", message: "Provided phone number does not match authentic verified phone." },
          { status: 400 }
        );
      }
    }

    const db = serverDb();

    // 3. Pre-transaction legacy check: Check if an unmigrated legacy user profile owns this phone
    const legacySnap = await db
      .collection("users")
      .where("phone", "==", verifiedPhone)
      .limit(2)
      .get();

    for (const doc of legacySnap.docs) {
      if (doc.id !== uid) {
        return NextResponse.json(
          { error: "PHONE_ALREADY_IN_USE", message: "This phone number is already registered to another account." },
          { status: 409 }
        );
      }
    }

    // 4. Atomic Phone Reservation & User Profile Update (Firestore Transaction)
    // Document ID is the SHA-256 hash of the normalized E.164 phone to preserve privacy in Firestore paths.
    const newPhoneHash = hashPhoneNumber(verifiedPhone);
    const newPhoneDocRef = db.collection("phone_numbers").doc(newPhoneHash);
    const userDocRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
      // --- ALL READS MUST PRECEDE ALL WRITES ---
      const newPhoneDoc = await tx.get(newPhoneDocRef);
      const userDoc = await tx.get(userDocRef);

      // Check if user currently holds a different verified phone number (Phone change scenario)
      const currentPhone = userDoc.exists && userDoc.data()?.phone ? normalizeE164(userDoc.data()?.phone) : null;
      const isChangingPhone = currentPhone && currentPhone !== verifiedPhone;

      let oldPhoneDoc = null;
      let oldPhoneDocRef = null;
      if (isChangingPhone) {
        const oldPhoneHash = hashPhoneNumber(currentPhone);
        oldPhoneDocRef = db.collection("phone_numbers").doc(oldPhoneHash);
        oldPhoneDoc = await tx.get(oldPhoneDocRef);
      }

      // --- CONFLICT & IDEMPOTENCY CHECKS ---
      if (newPhoneDoc.exists) {
        const existingOwner = newPhoneDoc.data()?.uid;
        if (existingOwner && existingOwner !== uid) {
          throw new Error("PHONE_ALREADY_IN_USE");
        }
        // If existingOwner === uid, idempotent re-confirmation
      }

      // --- ALL WRITES ---
      const now = new Date().toISOString();

      // If user had a previously reserved phone under their own account, release the old reservation atomically
      if (oldPhoneDocRef && oldPhoneDoc?.exists && oldPhoneDoc.data()?.uid === uid) {
        tx.delete(oldPhoneDocRef);
      }

      // Create or update atomic reservation in phone_numbers
      const existingCreatedAt = newPhoneDoc.exists ? newPhoneDoc.data()?.created_at : undefined;
      tx.set(
        newPhoneDocRef,
        {
          uid,
          created_at: existingCreatedAt || now,
          updated_at: now,
          phone_hash: newPhoneHash,
        },
        { merge: true }
      );

      // Update user document with verified phone credentials
      tx.set(
        userDocRef,
        {
          phone: verifiedPhone,
          phone_verified: true,
          phone_verified_at: now,
        },
        { merge: true }
      );
    });

    return NextResponse.json({
      ok: true,
      phone: verifiedPhone,
      phone_verified: true,
      phone_hash: newPhoneHash,
    });
  } catch (err: any) {
    if (err?.message === "PHONE_ALREADY_IN_USE") {
      return NextResponse.json(
        { error: "PHONE_ALREADY_IN_USE", message: "This phone number is already registered to another account." },
        { status: 409 }
      );
    }
    console.error("[AUTH_VERIFY_PHONE] Server verification failed:", err?.message || err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to confirm phone verification on server." },
      { status: 500 }
    );
  }
}
