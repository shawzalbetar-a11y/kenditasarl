import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { POST as checkConflictRoute } from "../../src/app/api/auth/check-conflict/route";
import { POST as verifyPhoneRoute } from "../../src/app/api/auth/verify-phone/route";
import { serverDb, serverAuth } from "../../src/lib/server/cloudinaryServer";
import { getTrustedClientIp, checkDistributedRateLimit } from "../../src/lib/server/rateLimit";

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

let userAlpha: any;
let userBeta: any;
let userGamma: any;

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

  userAlpha = await createIdentity("blocker_user_alpha@kenditasarla.local");
  userBeta = await createIdentity("blocker_user_beta@kenditasarla.local");
  userGamma = await createIdentity("blocker_user_gamma@kenditasarla.local");

  const sdb = serverDb();
  // Clear any existing user documents for deterministic testing
  await sdb.doc(`users/${userAlpha.localId}`).delete().catch(() => {});
  await sdb.doc(`users/${userBeta.localId}`).delete().catch(() => {});
  await sdb.doc(`users/${userGamma.localId}`).delete().catch(() => {});
});

after(async () => {
  await env?.cleanup();
});

describe("Kendin Tasarla — Final Security Release Blockers Test Suite", () => {
  // =========================================================================
  // P0 — PHONE BINDING & VERIFICATION IMMUTABILITY
  // =========================================================================

  test("[P0-1] Legitimate user can register and create profile with positive allowlist", async () => {
    const db = env.authenticatedContext(userAlpha.localId).firestore();
    const profileRef = doc(db, "users", userAlpha.localId);

    await assertSucceeds(
      setDoc(profileRef, {
        full_name: "Alpha User",
        email: "blocker_user_alpha@kenditasarla.local",
        phone: "+905551112233",
        preferred_language: "tr",
        created_at: new Date().toISOString(),
      })
    );

    const snap = await getDoc(profileRef);
    assert.equal(snap.exists(), true);
    assert.equal(snap.data()?.full_name, "Alpha User");
  });

  test("[P0-2] Client CANNOT self-attest phone_verified, role, or administrative fields", async () => {
    const db = env.authenticatedContext(userAlpha.localId).firestore();
    const profileRef = doc(db, "users", userAlpha.localId);

    // Direct client attempt to inject phone_verified: true -> FAILS
    await assertFails(
      updateDoc(profileRef, {
        phone_verified: true,
      })
    );

    // Direct client attempt to grant admin role -> FAILS
    await assertFails(
      updateDoc(profileRef, {
        role: "admin",
      })
    );
  });

  test("[P0-3] Server verify-phone validates Auth record and confirms verification via Admin SDK", async () => {
    // 1. Authorize verified phone in Firebase Auth for userAlpha
    await serverAuth().updateUser(userAlpha.localId, {
      phoneNumber: "+905551112233",
    });

    // 2. Call server verify-phone route
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAlpha.idToken}`,
      },
      body: JSON.stringify({ phone: "+905551112233" }),
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.phone_verified, true);
    assert.equal(body.phone, "+905551112233");

    // Verify Firestore state
    const sdb = serverDb();
    const userDoc = await sdb.doc(`users/${userAlpha.localId}`).get();
    assert.equal(userDoc.data()?.phone_verified, true);
    assert.equal(userDoc.data()?.phone, "+905551112233");
  });

  test("[P0-4] Client CANNOT modify phone after verification while phone_verified=true", async () => {
    const db = env.authenticatedContext(userAlpha.localId).firestore();
    const profileRef = doc(db, "users", userAlpha.localId);

    // Attempting to change phone to a different number -> STRICTLY FORBIDDEN
    await assertFails(
      updateDoc(profileRef, {
        phone: "+905559998877",
      })
    );

    // Attempting to unset phone_verified while changing phone -> STRICTLY FORBIDDEN
    await assertFails(
      updateDoc(profileRef, {
        phone: "+905559998877",
        phone_verified: false,
      })
    );

    // Updating non-sensitive allowed fields (e.g. full_name) -> SUCCEEDS
    await assertSucceeds(
      updateDoc(profileRef, {
        full_name: "Alpha User Updated",
      })
    );

    const snap = await getDoc(profileRef);
    assert.equal(snap.data()?.full_name, "Alpha User Updated");
    assert.equal(snap.data()?.phone, "+905551112233");
    assert.equal(snap.data()?.phone_verified, true);
  });

  test("[P0-5] verify-phone rejects payload mismatch when requested phone != Auth verified phone", async () => {
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAlpha.idToken}`,
      },
      body: JSON.stringify({ phone: "+905550000000" }), // Mismatch with Auth phone (+905551112233)
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "PHONE_MISMATCH");
  });

  // =========================================================================
  // P1 — UNIQUENESS IN WRITING PATH & ANTI-HIJACKING
  // =========================================================================

  test("[P1-1] verify-phone enforces uniqueness in trusted write path (rejects already owned phone with 409)", async () => {
    const sdb = serverDb();
    const contestedPhone = "+905558887766";

    // 1. Pre-register this phone in Firestore for User Gamma
    await sdb.doc(`users/${userGamma.localId}`).set({
      full_name: "Gamma User",
      phone: contestedPhone,
      email: "gamma@kenditasarla.local",
    });

    // 2. Set this phone in Firebase Auth for User Beta
    await serverAuth().updateUser(userBeta.localId, {
      phoneNumber: contestedPhone,
    });

    // 3. User Beta calls verify-phone -> Server detects conflict with User Gamma in Firestore
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userBeta.idToken}`,
      },
      body: JSON.stringify({ phone: contestedPhone }),
    });

    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, "PHONE_ALREADY_IN_USE");

    // Verify User Beta's Firestore document was NOT created or modified with the hijacked phone
    const betaDoc = await sdb.doc(`users/${userBeta.localId}`).get();
    assert.equal(betaDoc.exists, false);
  });

  // =========================================================================
  // P1 — DISTRIBUTED RATE LIMITING & TRUSTED PROXY IP RESOLUTION
  // =========================================================================

  test("[P1-2] Trusted IP resolution ignores client-spoofed prefix in X-Forwarded-For", () => {
    // Attacker crafts header trying to impersonate 8.8.8.8, while reverse proxy appended 198.51.100.50
    const req = new Request("http://localhost/test", {
      headers: {
        "x-forwarded-for": "8.8.8.8, 198.51.100.50",
      },
    });

    const resolved = getTrustedClientIp(req);
    assert.equal(resolved, "198.51.100.50");
  });

  test("[P1-3] Trusted IP resolution prioritizes edge platform headers (Vercel, Cloudflare, x-real-ip)", () => {
    const reqVercel = new Request("http://localhost/test", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.10",
        "x-forwarded-for": "1.1.1.1",
      },
    });
    assert.equal(getTrustedClientIp(reqVercel), "203.0.113.10");

    const reqCf = new Request("http://localhost/test", {
      headers: {
        "cf-connecting-ip": "203.0.113.20",
        "x-forwarded-for": "1.1.1.1",
      },
    });
    assert.equal(getTrustedClientIp(reqCf), "203.0.113.20");
  });

  test("[P1-4] Distributed Rate Limiting separately enforces UID and IP quotas", async () => {
    const sdb = serverDb();
    const nonce = Date.now() % 100000;
    const testUid = "simulated_quota_user_" + nonce;
    const testIp = `192.0.2.${nonce % 200}`;

    // 1. UID quota: Max 3 for quick test
    for (let i = 0; i < 3; i++) {
      const res = await checkDistributedRateLimit(testUid, `192.0.2.${(i + 1) % 250}`, {
        uidMax: 3,
        ipMax: 10,
        db: sdb,
      });
      assert.equal(res.allowed, true);
    }

    // 4th request from same UID (even with DIFFERENT IP) is BLOCKED by UID limit
    const blockedUid = await checkDistributedRateLimit(testUid, `192.0.2.${(nonce + 99) % 250}`, {
      uidMax: 3,
      ipMax: 10,
      db: sdb,
    });
    assert.equal(blockedUid.allowed, false);
    assert.equal(blockedUid.reason, "UID_LIMIT");
    assert.ok(blockedUid.retryAfterSeconds > 0);

    // 2. IP quota: Max 3 for quick test
    const sharedIp = `198.51.${nonce % 200}.${(nonce + 5) % 200}`;
    for (let i = 0; i < 3; i++) {
      const res = await checkDistributedRateLimit(`diff_user_${i}_${nonce}`, sharedIp, {
        uidMax: 10,
        ipMax: 3,
        db: sdb,
      });
      assert.equal(res.allowed, true);
    }

    // 4th request from same IP (even with DIFFERENT UID) is BLOCKED by IP limit
    const blockedIp = await checkDistributedRateLimit(`brand_new_user_${Date.now()}`, sharedIp, {
      uidMax: 10,
      ipMax: 3,
      db: sdb,
    });
    assert.equal(blockedIp.allowed, false);
    assert.equal(blockedIp.reason, "IP_LIMIT");
    assert.ok(blockedIp.retryAfterSeconds > 0);
  });

  test("[P1-5] check-conflict endpoint enforces distributed rate limiting and uniform responses", async () => {
    // Repeated calls with userGamma to trigger UID limit
    let hitRateLimit = false;
    for (let i = 0; i < 12; i++) {
      const req = new Request("http://localhost:3000/api/auth/check-conflict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userGamma.idToken}`,
          "x-real-ip": `203.0.113.${100 + i}`,
        },
        body: JSON.stringify({ phone: `+9055577700${i.toString().padStart(2, "0")}` }),
      });
      const res = await checkConflictRoute(req);
      if (res.status === 429) {
        hitRateLimit = true;
        assert.ok(res.headers.get("Retry-After"));
        const body = await res.json();
        assert.equal(body.error, "TOO_MANY_REQUESTS");
        assert.equal(body.limitType, "UID_LIMIT");
        break;
      }
    }
    assert.equal(hitRateLimit, true);
  });

  // =========================================================================
  // P2 — PRICING & DESIGN MARKETPLACE INTEGRITY
  // =========================================================================

  test("[P2-1] Client CANNOT tamper with design approval or marketplace royalty fields", async () => {
    const db = env.authenticatedContext(userAlpha.localId).firestore();
    const designRef = doc(db, "designs", "design-alpha-market");

    // Client trying to create a self-approved design with custom royalty -> FAILS
    await assertFails(
      setDoc(designRef, {
        user_id: userAlpha.localId,
        title: "Alpha Art",
        is_approved: true, // Forged approval
        royalty_rate: 0.85, // Forged royalty
      })
    );

    // Legitimate custom design creation without administrative marketplace fields -> SUCCEEDS
    await assertSucceeds(
      setDoc(designRef, {
        user_id: userAlpha.localId,
        title: "Alpha Legitimate Art",
        product_id: "shirt",
      })
    );

    // Client trying to update existing design to set is_approved or royalty_rate -> FAILS
    await assertFails(
      updateDoc(designRef, {
        is_approved: true,
      })
    );

    await assertFails(
      updateDoc(designRef, {
        royalty_rate: 0.5,
      })
    );
  });

  test("[P2-2] Client SDK CANNOT write to settings/pricing or rate_limits", async () => {
    const custDb = env.authenticatedContext(userAlpha.localId).firestore();

    // Customer cannot write settings/pricing
    await assertFails(
      setDoc(doc(custDb, "settings", "pricing"), {
        tampered: true,
      })
    );

    // Customer cannot read or write rate_limits
    await assertFails(
      setDoc(doc(custDb, "rate_limits", "hack_limit"), {
        count: 0,
      })
    );

    await assertFails(
      getDoc(doc(custDb, "rate_limits", "any_limit"))
    );
  });
});
