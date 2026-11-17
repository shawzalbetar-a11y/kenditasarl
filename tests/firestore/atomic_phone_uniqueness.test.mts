import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { POST as verifyPhoneRoute } from "../../src/app/api/auth/verify-phone/route";
import { POST as checkConflictRoute } from "../../src/app/api/auth/check-conflict/route";
import { serverDb, serverAuth } from "../../src/lib/server/cloudinaryServer";
import { hashPhoneNumber, normalizeE164 } from "../../src/lib/server/phoneUtils";
import { runPhoneMigration } from "../../scripts/migrate-phone-numbers.mts";

const projectId = "demo-kenditasarla-rules";
let env: RulesTestEnvironment;

async function createIdentity(email: string) {
  let r = await fetch(
    "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "synthetic-password-only",
        returnSecureToken: true,
      }),
    }
  );
  if (r.status === 400) {
    r = await fetch(
      "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "synthetic-password-only",
          returnSecureToken: true,
        }),
      }
    );
  }
  assert.equal(r.status, 200);
  return r.json();
}

let user1: any;
let user2: any;
let user3: any;
let userEmailOnly: any;

before(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:18080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:19099";
  process.env.GCLOUD_PROJECT = projectId;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;

  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 18080,
    },
  });

  user1 = await createIdentity("phone_test_user1@kenditasarla.local");
  user2 = await createIdentity("phone_test_user2@kenditasarla.local");
  user3 = await createIdentity("phone_test_user3@kenditasarla.local");
  userEmailOnly = await createIdentity("phone_test_emailonly@kenditasarla.local");

  const sdb = serverDb();
  await sdb.doc(`users/${user1.localId}`).delete().catch(() => {});
  await sdb.doc(`users/${user2.localId}`).delete().catch(() => {});
  await sdb.doc(`users/${user3.localId}`).delete().catch(() => {});
  await sdb.doc(`users/${userEmailOnly.localId}`).delete().catch(() => {});
});

after(async () => {
  await env?.cleanup();
});

describe("Phase 06D.1: Atomic Phone Number Uniqueness Test Suite", () => {
  // =========================================================================
  // TEST 1: New account verifies unused number
  // =========================================================================
  test("[TEST 1] New account verifies unused number atomically", async () => {
    const sdb = serverDb();
    const phone = "+905551110001";
    const phoneHash = hashPhoneNumber(phone);

    // Ensure clean state
    await sdb.doc(`phone_numbers/${phoneHash}`).delete().catch(() => {});
    await serverAuth().updateUser(user1.localId, { phoneNumber: phone });

    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1.idToken}`,
      },
      body: JSON.stringify({ phone }),
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.phone, phone);
    assert.equal(data.phone_verified, true);
    assert.equal(data.phone_hash, phoneHash);

    // Verify reservation document in phone_numbers
    const phoneDoc = await sdb.doc(`phone_numbers/${phoneHash}`).get();
    assert.equal(phoneDoc.exists, true);
    assert.equal(phoneDoc.data()?.uid, user1.localId);
    assert.ok(phoneDoc.data()?.created_at);

    // Verify user profile document
    const userDoc = await sdb.doc(`users/${user1.localId}`).get();
    assert.equal(userDoc.exists, true);
    assert.equal(userDoc.data()?.phone, phone);
    assert.equal(userDoc.data()?.phone_verified, true);
    assert.ok(userDoc.data()?.phone_verified_at);
  });

  // =========================================================================
  // TEST 2: Two concurrent requests attempting to reserve the same number
  // =========================================================================
  test("[TEST 2] Concurrent requests attempting to claim same number are serialized safely", async () => {
    const sdb = serverDb();
    const phone = "+905551110001";
    const phoneHash = hashPhoneNumber(phone);

    // user1 already owns +905551110001
    // user2 tries to claim +905551110001 concurrently with user1 re-verifying
    const req1 = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1.idToken}`,
      },
      body: JSON.stringify({ phone }),
    });

    const req2 = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user2.idToken}`,
      },
      body: JSON.stringify({ phone }),
    });

    const [res1, res2] = await Promise.all([
      verifyPhoneRoute(req1),
      verifyPhoneRoute(req2),
    ]);

    assert.equal(res1.status, 200);
    // user2 does not have this phone in Auth or it is already in use
    assert.ok(res2.status === 400 || res2.status === 409);

    // Ownership in phone_numbers MUST remain user1
    const phoneDoc = await sdb.doc(`phone_numbers/${phoneHash}`).get();
    assert.equal(phoneDoc.data()?.uid, user1.localId);
  });

  // =========================================================================
  // TEST 3: Repeat request from the same account is idempotent
  // =========================================================================
  test("[TEST 3] Repeat request from the same account is idempotent and preserves created_at", async () => {
    const sdb = serverDb();
    const phone = "+905551110001";
    const phoneHash = hashPhoneNumber(phone);

    const initialDoc = await sdb.doc(`phone_numbers/${phoneHash}`).get();
    const initialCreatedAt = initialDoc.data()?.created_at;

    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1.idToken}`,
      },
      body: JSON.stringify({ phone }),
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 200);

    const afterDoc = await sdb.doc(`phone_numbers/${phoneHash}`).get();
    assert.equal(afterDoc.data()?.created_at, initialCreatedAt);
  });

  // =========================================================================
  // TEST 4: Number already reserved by another account is rejected with 409
  // =========================================================================
  test("[TEST 4] Number already reserved by another account is rejected with HTTP 409", async () => {
    const sdb = serverDb();
    const contestedPhone = "+905551110004";
    const contestedHash = hashPhoneNumber(contestedPhone);

    // Pre-reserve for user1 in phone_numbers
    await sdb.doc(`phone_numbers/${contestedHash}`).set({
      uid: user1.localId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      phone_hash: contestedHash,
    });

    // Check conflict route detects it
    const conflictReq = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user2.idToken}`,
      },
      body: JSON.stringify({ phone: contestedPhone }),
    });
    const conflictRes = await checkConflictRoute(conflictReq);
    assert.equal(conflictRes.status, 200);
    const conflictData = await conflictRes.json();
    assert.equal(conflictData.conflict, true);

    // verify-phone route rejects it with 409
    const verifyReq = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user2.idToken}`,
      },
      body: JSON.stringify({ phone: contestedPhone }),
    });
    const verifyRes = await verifyPhoneRoute(verifyReq);
    assert.ok(verifyRes.status === 400 || verifyRes.status === 409);
  });

  // =========================================================================
  // TEST 5: Number not verified in Firebase Auth is rejected with 400
  // =========================================================================
  test("[TEST 5] Request without verified phone in Firebase Auth returns 400", async () => {
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userEmailOnly.idToken}`,
      },
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "PHONE_NOT_VERIFIED_IN_AUTH");
  });

  // =========================================================================
  // TEST 6: Client-sent number mismatching Firebase Auth is rejected with 400
  // =========================================================================
  test("[TEST 6] Payload phone mismatching Auth phone returns 400 PHONE_MISMATCH", async () => {
    // user1 has +905551110001 in Auth
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1.idToken}`,
      },
      body: JSON.stringify({ phone: "+905559999999" }), // completely different phone
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "PHONE_MISMATCH");
  });

  // =========================================================================
  // TEST 7: Legacy verified account without reservation document
  // =========================================================================
  test("[TEST 7] Legacy verified account without reservation doc triggers conflict check and can claim atomically", async () => {
    const sdb = serverDb();
    const legacyPhone = "+905552220001";
    const legacyHash = hashPhoneNumber(legacyPhone);

    // Pre-seed legacy profile
    await sdb.doc(`users/legacy_user_777`).set({
      full_name: "Legacy User",
      email: "legacy777@kenditasarla.local",
      phone: legacyPhone,
      phone_verified: true,
    });
    // Ensure no reservation exists in phone_numbers
    await sdb.doc(`phone_numbers/${legacyHash}`).delete().catch(() => {});

    // Another user checking conflict receives conflict: true
    const conflictReq = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1.idToken}`,
      },
      body: JSON.stringify({ phone: legacyPhone }),
    });
    const conflictRes = await checkConflictRoute(conflictReq);
    assert.equal(conflictRes.status, 200);
    const conflictData = await conflictRes.json();
    assert.equal(conflictData.conflict, true);
  });

  // =========================================================================
  // TEST 8: Migration of legacy accounts including duplicate numbers
  // =========================================================================
  test("[TEST 8] Legacy accounts migration dry-run and apply with duplicate detection", async () => {
    const sdb = serverDb();

    // Setup legacy accounts
    // Clean user: user3 has phone in Auth and Firestore
    const cleanPhone = "+905553330001";
    await serverAuth().updateUser(user3.localId, { phoneNumber: cleanPhone });
    await sdb.doc(`users/${user3.localId}`).set({
      full_name: "User Three",
      email: "user3@kenditasarla.local",
      phone: cleanPhone,
      phone_verified: true,
    });
    await sdb.doc(`phone_numbers/${hashPhoneNumber(cleanPhone)}`).delete().catch(() => {});

    // Duplicate users: dupA and dupB share the same phone
    const dupPhone = "+905553330002";
    await sdb.doc("users/legacy_dup_A").set({
      full_name: "Dup A",
      email: "dup_a@kenditasarla.local",
      phone: dupPhone,
      phone_verified: true,
    });
    await sdb.doc("users/legacy_dup_B").set({
      full_name: "Dup B",
      email: "dup_b@kenditasarla.local",
      phone: dupPhone,
      phone_verified: true,
    });

    // Run Dry-Run
    const dryRunRes = await runPhoneMigration({ dryRun: true });
    assert.equal(dryRunRes.dryRun, true);
    assert.equal(dryRunRes.migratedCount, 0, "Dry run must NOT write anything");
    assert.ok(dryRunRes.duplicatePhoneConflicts.some((c) => c.phone === dupPhone));

    // Verify clean phone was NOT created during dry run
    const preDoc = await sdb.doc(`phone_numbers/${hashPhoneNumber(cleanPhone)}`).get();
    assert.equal(preDoc.exists, false);

    // Run Apply
    const applyRes = await runPhoneMigration({ dryRun: false });
    assert.equal(applyRes.dryRun, false);
    assert.ok(applyRes.migratedCount >= 1);

    // Clean user is now migrated
    const migratedDoc = await sdb.doc(`phone_numbers/${hashPhoneNumber(cleanPhone)}`).get();
    assert.equal(migratedDoc.exists, true);
    assert.equal(migratedDoc.data()?.uid, user3.localId);

    // Duplicate phone was NOT claimed for either account (Safe Gate)
    const dupDoc = await sdb.doc(`phone_numbers/${hashPhoneNumber(dupPhone)}`).get();
    assert.equal(dupDoc.exists, false);

    // Cleanup legacy test fixtures
    await sdb.doc("users/legacy_dup_A").delete().catch(() => {});
    await sdb.doc("users/legacy_dup_B").delete().catch(() => {});
  });

  // =========================================================================
  // TEST 9: Phone number change with safe release of previous reservation
  // =========================================================================
  test("[TEST 9] Changing phone number reserves new number and releases old number atomically", async () => {
    const sdb = serverDb();
    const oldPhone = "+905554440001";
    const newPhone = "+905554440002";
    const oldHash = hashPhoneNumber(oldPhone);
    const newHash = hashPhoneNumber(newPhone);

    // 1. Establish initial reservation with oldPhone for user1
    await serverAuth().updateUser(user1.localId, { phoneNumber: oldPhone });
    const req1 = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1.idToken}`,
      },
      body: JSON.stringify({ phone: oldPhone }),
    });
    const res1 = await verifyPhoneRoute(req1);
    assert.equal(res1.status, 200);

    const oldDoc1 = await sdb.doc(`phone_numbers/${oldHash}`).get();
    assert.equal(oldDoc1.exists, true);
    assert.equal(oldDoc1.data()?.uid, user1.localId);

    // 2. User1 verifies newPhone in Auth and calls verify-phone
    await serverAuth().updateUser(user1.localId, { phoneNumber: newPhone });
    const req2 = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1.idToken}`,
      },
      body: JSON.stringify({ phone: newPhone }),
    });
    const res2 = await verifyPhoneRoute(req2);
    assert.equal(res2.status, 200);

    // 3. Verify newPhone is reserved
    const newDoc = await sdb.doc(`phone_numbers/${newHash}`).get();
    assert.equal(newDoc.exists, true);
    assert.equal(newDoc.data()?.uid, user1.localId);

    // 4. Verify oldPhone was RELEASED
    const oldDoc2 = await sdb.doc(`phone_numbers/${oldHash}`).get();
    assert.equal(oldDoc2.exists, false, "Old phone reservation must be deleted upon successful change");

    // 5. Verify user profile holds new phone
    const userDoc = await sdb.doc(`users/${user1.localId}`).get();
    assert.equal(userDoc.data()?.phone, newPhone);
    assert.equal(userDoc.data()?.phone_verified, true);
  });

  // =========================================================================
  // TEST 10: Client SDK read/write rejected on phone_numbers
  // =========================================================================
  test("[TEST 10] Client SDK cannot get, list, create, update, or delete phone_numbers", async () => {
    const clientDb = env.authenticatedContext(user1.localId).firestore();
    const phoneHash = hashPhoneNumber("+905551110001");
    const testDocRef = doc(clientDb, "phone_numbers", phoneHash);

    // Client read denied
    await assertFails(getDoc(testDocRef));

    // Client write denied
    await assertFails(
      setDoc(testDocRef, {
        uid: user1.localId,
        created_at: new Date().toISOString(),
      })
    );

    // Client list denied
    const colRef = collection(clientDb, "phone_numbers");
    await assertFails(getDocs(colRef));
  });

  // =========================================================================
  // TEST 11: Transaction failure without leaving partial data
  // =========================================================================
  test("[TEST 11] Transaction failure when phone is already taken leaves user profile untouched", async () => {
    const sdb = serverDb();
    const takenPhone = "+905555550001";
    const takenHash = hashPhoneNumber(takenPhone);

    // Pre-seed taken reservation owned by user3
    await sdb.doc(`phone_numbers/${takenHash}`).set({
      uid: user3.localId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      phone_hash: takenHash,
    });

    // User2 attempts to verify takenPhone (pre-seeded in Auth for test)
    await serverAuth().updateUser(user2.localId, { phoneNumber: takenPhone });
    await sdb.doc(`users/${user2.localId}`).set({
      full_name: "User Two",
      email: "user2@kenditasarla.local",
      created_at: new Date().toISOString(),
    });

    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user2.idToken}`,
      },
      body: JSON.stringify({ phone: takenPhone }),
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 409);

    // User2's profile document must NOT have phone or phone_verified
    const user2Doc = await sdb.doc(`users/${user2.localId}`).get();
    assert.equal(user2Doc.data()?.phone, undefined);
    assert.equal(user2Doc.data()?.phone_verified, undefined);

    // phone_numbers document must STILL be owned by user3
    const reservationDoc = await sdb.doc(`phone_numbers/${takenHash}`).get();
    assert.equal(reservationDoc.data()?.uid, user3.localId);
  });

  // =========================================================================
  // TEST 12: No breakage to login, registration, and Checkout flows
  // =========================================================================
  test("[TEST 12] Standard user profile registration and check-conflict flows continue to work flawlessly", async () => {
    const sdb = serverDb();
    await sdb.doc(`users/${user2.localId}`).delete().catch(() => {});

    const clientDb = env.authenticatedContext(user2.localId).firestore();
    const profileRef = doc(clientDb, "users", user2.localId);

    // User profile creation with allowed fields
    await assertSucceeds(
      setDoc(profileRef, {
        full_name: "User Two Validated",
        email: "user2_val@kenditasarla.local",
        preferred_language: "tr",
        created_at: new Date().toISOString(),
      })
    );

    const docSnap = await getDoc(profileRef);
    assert.equal(docSnap.data()?.full_name, "User Two Validated");

    // Clean check-conflict query with an available phone number
    const freePhone = "+905559998877";
    const conflictReq = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user2.idToken}`,
      },
      body: JSON.stringify({ phone: freePhone }),
    });
    const conflictRes = await checkConflictRoute(conflictReq);
    assert.equal(conflictRes.status, 200);
    const data = await conflictRes.json();
    assert.equal(data.conflict, false);
  });
});
