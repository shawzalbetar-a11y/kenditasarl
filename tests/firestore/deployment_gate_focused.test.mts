import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { POST as verifyPhoneRoute } from "../../src/app/api/auth/verify-phone/route";
import { serverDb, serverAuth } from "../../src/lib/server/cloudinaryServer";
import { getTrustedClientIp } from "../../src/lib/server/rateLimit";

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

  user1 = await createIdentity("gate_concurrent_1@kenditasarla.local");
  user2 = await createIdentity("gate_concurrent_2@kenditasarla.local");

  const sdb = serverDb();
  await sdb.doc(`users/${user1.localId}`).delete().catch(() => {});
  await sdb.doc(`users/${user2.localId}`).delete().catch(() => {});
});

after(async () => {
  await env?.cleanup();
});

describe("Deployment Gate Focused Verification Suite", () => {
  // =========================================================================
  // FOCUS TEST 1: CONCURRENT PHONE RESERVATION & UNIQUENESS AUDIT
  // =========================================================================

  test("[GATE-1A] Firebase Auth natively prevents duplicate phone registration", async () => {
    const testPhone = "+905559990001";
    
    // Assign phone to user 1 in Auth
    await serverAuth().updateUser(user1.localId, { phoneNumber: testPhone });
    
    // Attempt to assign the exact same phone to user 2 in Auth -> Firebase Auth throws auth/phone-number-already-exists
    let threwConflict = false;
    try {
      await serverAuth().updateUser(user2.localId, { phoneNumber: testPhone });
    } catch (err: any) {
      if (err.code === "auth/phone-number-already-exists") {
        threwConflict = true;
      }
    }
    assert.equal(threwConflict, true, "Firebase Auth should enforce phone uniqueness at identity layer");
  });

  test("[GATE-1B] Concurrent verify-phone execution audit", async () => {
    // Audit scenario: Two requests executed simultaneously
    // Case 1: user1 claims testPhone via verify-phone
    const testPhone = "+905559990001";
    const req1 = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1.idToken}`,
      },
      body: JSON.stringify({ phone: testPhone }),
    });

    // Case 2: user2 tries to claim testPhone
    const req2 = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user2.idToken}`,
      },
      body: JSON.stringify({ phone: testPhone }),
    });

    const [res1, res2] = await Promise.all([
      verifyPhoneRoute(req1),
      verifyPhoneRoute(req2),
    ]);

    // user1 has verified phone in auth -> succeeds (200)
    assert.equal(res1.status, 200);

    // user2 cannot claim it: either rejected with 400 (not verified in Auth) or 409 (already in use in DB)
    // Both ensure user2 CANNOT claim user1's phone!
    assert.ok(res2.status === 400 || res2.status === 409, `User2 must be rejected, got ${res2.status}`);

    const sdb = serverDb();
    const user2Doc = await sdb.doc(`users/${user2.localId}`).get();
    assert.equal(user2Doc.data()?.phone, undefined, "User 2 must not have hijacked user 1's phone");
  });

  // =========================================================================
  // FOCUS TEST 2: TRUSTED CLIENT IP RESOLUTION & ANTI-SPOOFING
  // =========================================================================

  test("[GATE-2A] Anti-spoofing: X-Forwarded-For ignores client injected fake IP prefix", () => {
    // Attacker sends: X-Forwarded-For: 1.1.1.1, 8.8.8.8, 203.0.113.195
    // 203.0.113.195 was appended by reverse proxy
    const req = new Request("http://localhost/test", {
      headers: {
        "x-forwarded-for": "1.1.1.1, 8.8.8.8, 203.0.113.195",
      },
    });

    const ip = getTrustedClientIp(req);
    assert.equal(ip, "203.0.113.195", "Must select rightmost proxy-appended IP and ignore attacker's client prefix");
  });

  test("[GATE-2B] Anti-spoofing: Edge proxy headers take precedence over X-Forwarded-For", () => {
    // Vercel deployment edge header
    const reqVercel = new Request("http://localhost/test", {
      headers: {
        "x-vercel-forwarded-for": "198.51.100.22",
        "x-forwarded-for": "10.0.0.1, 1.2.3.4",
      },
    });
    assert.equal(getTrustedClientIp(reqVercel), "198.51.100.22");

    // Cloudflare edge header
    const reqCloudflare = new Request("http://localhost/test", {
      headers: {
        "cf-connecting-ip": "198.51.100.33",
        "x-forwarded-for": "10.0.0.1, 1.2.3.4",
      },
    });
    assert.equal(getTrustedClientIp(reqCloudflare), "198.51.100.33");

    // x-real-ip header
    const reqRealIp = new Request("http://localhost/test", {
      headers: {
        "x-real-ip": "198.51.100.44",
        "x-forwarded-for": "10.0.0.1, 1.2.3.4",
      },
    });
    assert.equal(getTrustedClientIp(reqRealIp), "198.51.100.44");
  });
});
