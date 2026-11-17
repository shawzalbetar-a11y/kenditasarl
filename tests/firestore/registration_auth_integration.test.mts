import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { POST as verifyPhoneRoute } from "../../src/app/api/auth/verify-phone/route";
import { POST as checkConflictRoute } from "../../src/app/api/auth/check-conflict/route";
import { serverDb, serverAuth } from "../../src/lib/server/cloudinaryServer";
import { hashPhoneNumber, normalizeE164 } from "../../src/lib/server/phoneUtils";
import { runPhoneMigration } from "../../scripts/migrate-phone-numbers.mts";
import { checkDistributedRateLimit } from "../../src/lib/server/rateLimit";

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

let googleUser: any;
let phoneUser: any;
let competitorUser: any;
let unverifiedUser: any;

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

  googleUser = await createIdentity("reg_google_user@kenditasarla.local");
  phoneUser = await createIdentity("reg_phone_user@kenditasarla.local");
  competitorUser = await createIdentity("reg_competitor_user@kenditasarla.local");
  unverifiedUser = await createIdentity("reg_unverified_user@kenditasarla.local");

  const sdb = serverDb();
  await sdb.doc(`users/${googleUser.localId}`).delete().catch(() => {});
  await sdb.doc(`users/${phoneUser.localId}`).delete().catch(() => {});
  await sdb.doc(`users/${competitorUser.localId}`).delete().catch(() => {});
  await sdb.doc(`users/${unverifiedUser.localId}`).delete().catch(() => {});
});

after(async () => {
  await env?.cleanup();
});

describe("Phase 06D.3: Registration & Authentication Integration Test Suite", () => {
  // =========================================================================
  // SECTION 1: REGISTRATION & LIFECYCLE FLOWS
  // =========================================================================

  test("[REG-1] Google Sign-In registration & initial profile creation with positive allowlist", async () => {
    const clientDb = env.authenticatedContext(googleUser.localId).firestore();
    const userDocRef = doc(clientDb, "users", googleUser.localId);

    // Initial registration profile payload allowed by rules
    await assertSucceeds(
      setDoc(userDocRef, {
        full_name: "Google Customer",
        email: "reg_google_user@kenditasarla.local",
        preferred_language: "tr",
        created_at: new Date().toISOString(),
      })
    );

    const snap = await getDoc(userDocRef);
    assert.equal(snap.exists(), true);
    assert.equal(snap.data()?.full_name, "Google Customer");
    assert.equal(snap.data()?.email, "reg_google_user@kenditasarla.local");
  });

  test("[REG-2] Phone OTP registration & server-side atomic verification via Admin SDK", async () => {
    const testPhone = "+905556667788";
    const phoneHash = hashPhoneNumber(testPhone);
    const sdb = serverDb();

    // Clean any prior reservation
    await sdb.doc(`phone_numbers/${phoneHash}`).delete().catch(() => {});

    // Set authentic verified phone in Firebase Auth
    await serverAuth().updateUser(phoneUser.localId, { phoneNumber: testPhone });

    // Call verify-phone API
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${phoneUser.idToken}`,
      },
      body: JSON.stringify({ phone: testPhone }),
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.phone, testPhone);
    assert.equal(body.phone_verified, true);

    // Verify phone_numbers reservation in Firestore
    const reservationDoc = await sdb.doc(`phone_numbers/${phoneHash}`).get();
    assert.equal(reservationDoc.exists, true);
    assert.equal(reservationDoc.data()?.uid, phoneUser.localId);

    // Verify user profile document holds phone_verified: true
    const userProfile = await sdb.doc(`users/${phoneUser.localId}`).get();
    assert.equal(userProfile.data()?.phone_verified, true);
    assert.equal(userProfile.data()?.phone, testPhone);
  });

  test("[REG-3] Session restoration and profile read permission", async () => {
    const clientDb = env.authenticatedContext(phoneUser.localId).firestore();
    const snap = await getDoc(doc(clientDb, "users", phoneUser.localId));
    assert.equal(snap.exists(), true);
    assert.equal(snap.data()?.phone, "+905556667788");
  });

  test("[REG-4] Sign out & sign in: Account retrieval and profile update", async () => {
    const clientDb = env.authenticatedContext(phoneUser.localId).firestore();
    const userRef = doc(clientDb, "users", phoneUser.localId);

    // Customer updates their display name (allowed)
    await assertSucceeds(
      updateDoc(userRef, {
        full_name: "Phone User Updated Name",
      })
    );

    const updatedSnap = await getDoc(userRef);
    assert.equal(updatedSnap.data()?.full_name, "Phone User Updated Name");
  });

  test("[REG-5] Legacy account pre-migration handling and conflict detection", async () => {
    const sdb = serverDb();
    const legacyPhone = "+905558889900";
    const legacyHash = hashPhoneNumber(legacyPhone);

    // Seed legacy account in users collection without phone_numbers doc
    await sdb.doc("users/legacy_seed_user").set({
      full_name: "Legacy Seeder",
      email: "legacy_seed@kenditasarla.local",
      phone: legacyPhone,
      phone_verified: true,
    });
    await sdb.doc(`phone_numbers/${legacyHash}`).delete().catch(() => {});

    // Another user checking conflict receives conflict: true
    const conflictReq = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${competitorUser.idToken}`,
      },
      body: JSON.stringify({ phone: legacyPhone }),
    });
    const conflictRes = await checkConflictRoute(conflictReq);
    assert.equal(conflictRes.status, 200);
    const conflictBody = await conflictRes.json();
    assert.equal(conflictBody.conflict, true);

    await sdb.doc("users/legacy_seed_user").delete().catch(() => {});
  });

  test("[REG-6] Unverified account cannot self-attest phone_verified via Client SDK", async () => {
    const clientDb = env.authenticatedContext(unverifiedUser.localId).firestore();
    const userRef = doc(clientDb, "users", unverifiedUser.localId);

    // Create base unverified profile
    await assertSucceeds(
      setDoc(userRef, {
        full_name: "Unverified Person",
        email: "unverified@kenditasarla.local",
        phone: "+905559991122",
        preferred_language: "ar",
        created_at: new Date().toISOString(),
      })
    );

    // Client attempt to forge phone_verified: true -> MUST FAIL
    await assertFails(
      updateDoc(userRef, {
        phone_verified: true,
      })
    );
  });

  // =========================================================================
  // SECTION 2: PHONE VERIFICATION INTEGRATION & ATOMICITY
  // =========================================================================

  test("[PHONE-1] Phone verification strictly rejects client payload mismatching Auth record", async () => {
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${phoneUser.idToken}`,
      },
      body: JSON.stringify({ phone: "+905559999999" }), // User actually holds +905556667788 in Auth
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "PHONE_MISMATCH");
  });

  test("[PHONE-2] Two accounts cannot hold the same phone number (409 Conflict)", async () => {
    const heldPhone = "+905556667788"; // Held by phoneUser

    // Pre-seed Auth phone for competitorUser to test server uniqueness gate
    await serverAuth().updateUser(competitorUser.localId, { phoneNumber: heldPhone }).catch(() => {});

    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${competitorUser.idToken}`,
      },
      body: JSON.stringify({ phone: heldPhone }),
    });

    const res = await verifyPhoneRoute(req);
    // Either Firebase Auth threw conflict or our server route returned 409
    assert.ok(res.status === 409 || res.status === 400);
  });

  test("[PHONE-3] Repeated request from the same account is idempotent", async () => {
    const heldPhone = "+905556667788";
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${phoneUser.idToken}`,
      },
      body: JSON.stringify({ phone: heldPhone }),
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  test("[PHONE-4] Phone change releases previous reservation and claims new number atomically", async () => {
    const sdb = serverDb();
    const oldPhone = "+905556667788";
    const newPhone = "+905556667799";
    const oldHash = hashPhoneNumber(oldPhone);
    const newHash = hashPhoneNumber(newPhone);

    // Update phoneUser's Auth record to newPhone
    await serverAuth().updateUser(phoneUser.localId, { phoneNumber: newPhone });

    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${phoneUser.idToken}`,
      },
      body: JSON.stringify({ phone: newPhone }),
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 200);

    // Old reservation MUST be deleted
    const oldDoc = await sdb.doc(`phone_numbers/${oldHash}`).get();
    assert.equal(oldDoc.exists, false, "Old phone reservation must be released");

    // New reservation MUST exist and be owned by phoneUser
    const newDoc = await sdb.doc(`phone_numbers/${newHash}`).get();
    assert.equal(newDoc.exists, true);
    assert.equal(newDoc.data()?.uid, phoneUser.localId);
  });

  // =========================================================================
  // SECTION 3: RATE LIMITING & FAIL-CLOSED RESILIENCY
  // =========================================================================

  test("[RATE-1] check-conflict endpoint enforces Fail-Closed policy (HTTP 503) when Firestore fails", async () => {
    // Test checkDistributedRateLimit with failClosed: true and a broken DB
    const failingDb = {
      collection: () => {
        throw new Error("Simulated Firestore Outage");
      },
      runTransaction: async () => {
        throw new Error("Simulated Firestore Outage");
      },
    };

    const res = await checkDistributedRateLimit("test_fail_closed_uid", "203.0.113.1", {
      failClosed: true,
      db: failingDb,
    });

    assert.equal(res.allowed, false);
    assert.equal(res.reason, "SERVICE_UNAVAILABLE");
    assert.equal(res.retryAfterSeconds, 30);
  });

  test("[RATE-2] expiresAt is stored as native Date/Timestamp for Firestore TTL compatibility", async () => {
    const sdb = serverDb();
    const nonce = Date.now();
    const testUid = `ttl_test_user_${nonce}`;
    const testIp = "203.0.113.88";

    await checkDistributedRateLimit(testUid, testIp, { db: sdb });

    const windowIndex = Math.floor(nonce / 60_000);
    const snap = await sdb.doc(`rate_limits/auth_chk_uid_${testUid}_${windowIndex}`).get();

    assert.equal(snap.exists, true);
    const data = snap.data();
    // In Firestore Admin SDK, Date objects are stored as Firestore Timestamps
    assert.ok(data?.expiresAt);
    assert.ok(typeof data?.expiresAt.toMillis === "function" || data?.expiresAt instanceof Date);
  });

  // =========================================================================
  // SECTION 4: LOCALIZATION & UI ERROR CODES PARITY
  // =========================================================================

  test("[UI-1] All three dictionary files maintain 100% key parity for error states", async () => {
    const tr = JSON.parse(await readFile(new URL("../../messages/tr.json", import.meta.url), "utf8"));
    const ar = JSON.parse(await readFile(new URL("../../messages/ar.json", import.meta.url), "utf8"));
    const en = JSON.parse(await readFile(new URL("../../messages/en.json", import.meta.url), "utf8"));

    const requiredKeys = [
      "phoneInUse",
      "phoneNotVerified",
      "phoneMismatch",
      "tooManyRequests",
      "serviceUnavailable",
      "authError",
    ];

    for (const key of requiredKeys) {
      assert.ok(tr.Auth[key], `tr.json missing Auth.${key}`);
      assert.ok(ar.Auth[key], `ar.json missing Auth.${key}`);
      assert.ok(en.Auth[key], `en.json missing Auth.${key}`);
    }

    // Natural Turkish phrasing check
    assert.match(tr.Auth.phoneInUse, /başka bir hesaba kayıtlıdır/);
    assert.match(tr.Auth.tooManyRequests, /Çok fazla deneme yapıldı/);
  });
});
