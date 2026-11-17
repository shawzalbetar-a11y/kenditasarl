import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { POST as verifyPhoneRoute } from "../../src/app/api/auth/verify-phone/route";
import { POST as checkConflictRoute } from "../../src/app/api/auth/check-conflict/route";
import { serverDb, serverAuth } from "../../src/lib/server/cloudinaryServer";
import { hashPhoneNumber } from "../../src/lib/server/phoneUtils";

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
        password: "google-flow-synthetic-password",
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
          password: "google-flow-synthetic-password",
          returnSecureToken: true,
        }),
      }
    );
  }
  assert.equal(r.status, 200);
  return r.json();
}

let googleUser: any;
let secondUser: any;

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

  googleUser = await createIdentity("google_sso_customer@kenditasarla.local");
  secondUser = await createIdentity("second_attempt_user@kenditasarla.local");

  const sdb = serverDb();
  await sdb.doc(`users/${googleUser.localId}`).delete().catch(() => {});
  await sdb.doc(`users/${secondUser.localId}`).delete().catch(() => {});
});

after(async () => {
  await env?.cleanup();
});

describe("Special Registration Acceptance Test: Google User Phone Verification UID Preservation", () => {
  const originalUid = () => googleUser.localId;
  const testPhone = "+905321234567";
  const phoneHash = hashPhoneNumber(testPhone);

  test("[GOOGLE-UID-1] Initial Google Sign-in creates profile bound to original UID", async () => {
    const uid = originalUid();
    assert.ok(uid, "Google user must have a valid UID");

    const clientDb = env.authenticatedContext(uid).firestore();
    const userDocRef = doc(clientDb, "users", uid);

    // Initial registration profile payload created upon Google Sign-In
    const createdAt = new Date().toISOString();
    await assertSucceeds(
      setDoc(userDocRef, {
        full_name: "Ahmet Yılmaz (Google SSO)",
        email: "google_sso_customer@kenditasarla.local",
        preferred_language: "tr",
        created_at: createdAt,
      })
    );

    const snap = await getDoc(userDocRef);
    assert.equal(snap.exists(), true);
    assert.equal(snap.id, uid, "User document ID must match Google account UID");
    assert.equal(snap.data()?.full_name, "Ahmet Yılmaz (Google SSO)");
    assert.equal(snap.data()?.email, "google_sso_customer@kenditasarla.local");
    assert.equal(snap.data()?.preferred_language, "tr");
    assert.equal(snap.data()?.phone_verified, undefined);
  });

  test("[GOOGLE-UID-2] Phone linking and server verification preserves exact original user.uid", async () => {
    const uidBeforeVerification = originalUid();
    const sdb = serverDb();

    // Clean any prior reservation for this phone
    await sdb.doc(`phone_numbers/${phoneHash}`).delete().catch(() => {});

    // In client app: user calls linkWithPhoneNumber() which updates auth record on the same user account
    await serverAuth().updateUser(uidBeforeVerification, { phoneNumber: testPhone });

    // Client invokes /api/auth/verify-phone with their existing Auth token
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${googleUser.idToken}`,
      },
      body: JSON.stringify({ phone: testPhone }),
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 200, "Verification route must succeed with 200");
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.phone, testPhone);
    assert.equal(body.phone_verified, true);

    // 1. Assert Auth record UID is strictly unchanged
    const authRecord = await serverAuth().getUser(uidBeforeVerification);
    assert.equal(authRecord.uid, uidBeforeVerification, "Google Auth user UID must remain identical");
    assert.equal(authRecord.phoneNumber, testPhone);

    // 2. Assert Firestore user profile document remains under original UID with all fields intact
    const userDocSnap = await sdb.doc(`users/${uidBeforeVerification}`).get();
    assert.equal(userDocSnap.exists, true, "User document under original UID must exist");
    const userData = userDocSnap.data();

    // Verified phone attributes added
    assert.equal(userData?.phone, testPhone);
    assert.equal(userData?.phone_verified, true);
    assert.ok(userData?.phone_verified_at, "phone_verified_at timestamp must be recorded");

    // Original Google profile fields MUST NOT be wiped out
    assert.equal(userData?.full_name, "Ahmet Yılmaz (Google SSO)");
    assert.equal(userData?.email, "google_sso_customer@kenditasarla.local");
    assert.equal(userData?.preferred_language, "tr");
    assert.ok(userData?.created_at, "Original created_at must be preserved");

    // 3. Assert phone_numbers collection holds the SHA-256 reservation mapped to the EXACT original UID
    const reservationSnap = await sdb.doc(`phone_numbers/${phoneHash}`).get();
    assert.equal(reservationSnap.exists, true, "Atomic reservation document must exist");
    assert.equal(reservationSnap.data()?.uid, uidBeforeVerification, "Reservation must be owned by the original Google UID");
  });

  test("[GOOGLE-UID-3] Client cannot tamper with phone_verified on original UID doc", async () => {
    const uid = originalUid();
    const clientDb = env.authenticatedContext(uid).firestore();
    const userDocRef = doc(clientDb, "users", uid);

    // Attempting to overwrite phone_verified from Client SDK must be rejected by security rules
    await assertFails(
      updateDoc(userDocRef, {
        phone_verified: false,
      })
    );

    // Attempting to change phone number directly via Client SDK must be rejected
    await assertFails(
      updateDoc(userDocRef, {
        phone: "+905329999999",
      })
    );
  });

  test("[GOOGLE-UID-4] Second user cannot hijack the phone number verified by Google user", async () => {
    const attackerUid = secondUser.localId;
    await serverAuth().updateUser(attackerUid, { phoneNumber: testPhone }).catch(() => {});

    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secondUser.idToken}`,
      },
      body: JSON.stringify({ phone: testPhone }),
    });

    const res = await verifyPhoneRoute(req);
    assert.ok(res.status === 409 || res.status === 400, "Must reject duplicate phone verification");

    // Ensure original reservation remains intact
    const sdb = serverDb();
    const reservationSnap = await sdb.doc(`phone_numbers/${phoneHash}`).get();
    assert.equal(reservationSnap.data()?.uid, originalUid(), "Reservation must remain owned by original Google user");
  });

  test("[GOOGLE-UID-5] Check-conflict endpoint confirms phone is registered to Google user", async () => {
    const req = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secondUser.idToken}`,
      },
      body: JSON.stringify({ phone: testPhone }),
    });

    const res = await checkConflictRoute(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.conflict, true, "Must signal phone conflict to other users");
  });
});
