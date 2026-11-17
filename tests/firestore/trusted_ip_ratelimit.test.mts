import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { serverDb } from "../../src/lib/server/cloudinaryServer";
import {
  isValidIp,
  getIpFamily,
  hashIpForRateLimit,
  resolveClientIp,
  getTrustedClientIp,
  checkDistributedRateLimit,
} from "../../src/lib/server/rateLimit";
import { POST as checkConflictRoute } from "../../src/app/api/auth/check-conflict/route";

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

let testUser: any;

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

  testUser = await createIdentity("trusted_ip_user@kenditasarla.local");
});

after(async () => {
  await env?.cleanup();
});

describe("Phase 06D.2: Trusted Client IP & Distributed Rate Limiting Test Suite", () => {
  // =========================================================================
  // TEST 1: Trusted IP from Hosting Platform
  // =========================================================================
  test("[TEST 1] Trusted IP extracted correctly under designated provider policy", () => {
    // Vercel deployment with authentic edge header
    const reqVercel = new Request("http://localhost/api", {
      headers: { "x-vercel-forwarded-for": "203.0.113.10" },
    });
    const resVercel = resolveClientIp(reqVercel, { provider: "vercel" });
    assert.equal(resVercel.isTrusted, true);
    assert.equal(resVercel.ip, "203.0.113.10");
    assert.equal(resVercel.provider, "vercel");
    assert.equal(resVercel.ipFamily, "IPv4");

    // Cloudflare deployment with authentic edge header
    const reqCf = new Request("http://localhost/api", {
      headers: { "cf-connecting-ip": "198.51.100.20" },
    });
    const resCf = resolveClientIp(reqCf, { provider: "cloudflare" });
    assert.equal(resCf.isTrusted, true);
    assert.equal(resCf.ip, "198.51.100.20");
    assert.equal(resCf.provider, "cloudflare");
    assert.equal(resCf.ipFamily, "IPv4");
  });

  // =========================================================================
  // TEST 2: Spoofed X-Forwarded-For from Client
  // =========================================================================
  test("[TEST 2] Spoofed X-Forwarded-For is rejected when outside trusted reverse proxy", () => {
    const req = new Request("http://localhost/api", {
      headers: { "x-forwarded-for": "1.1.1.1, 8.8.8.8" },
    });
    const res = resolveClientIp(req, { provider: "none" });
    assert.equal(res.isTrusted, false);
    assert.equal(res.ip, null);
    assert.equal(getTrustedClientIp(req, { provider: "none" }), null);
  });

  // =========================================================================
  // TEST 3: Spoofed CF-Connecting-IP Outside Trusted Cloudflare Environment
  // =========================================================================
  test("[TEST 3] CF-Connecting-IP is rejected as spoofed when provider is not Cloudflare", () => {
    const req = new Request("http://localhost/api", {
      headers: {
        "cf-connecting-ip": "198.51.100.99",
        "x-forwarded-for": "1.1.1.1",
      },
    });

    // In an environment where provider is 'none' or 'vercel', CF header must be untrusted!
    const resNone = resolveClientIp(req, { provider: "none" });
    assert.equal(resNone.isTrusted, false);
    assert.equal(resNone.ip, null);

    const resVercel = resolveClientIp(req, { provider: "vercel" });
    assert.equal(resVercel.isTrusted, false);
    assert.equal(resVercel.ip, null);
  });

  // =========================================================================
  // TEST 4: Valid IPv4 Format
  // =========================================================================
  test("[TEST 4] Validates standard IPv4 addresses accurately", () => {
    assert.equal(isValidIp("203.0.113.195"), true);
    assert.equal(getIpFamily("203.0.113.195"), "IPv4");
    assert.equal(isValidIp("127.0.0.1"), true);
    assert.equal(isValidIp("10.0.0.1"), true);
    assert.equal(isValidIp("255.255.255.255"), true);
  });

  // =========================================================================
  // TEST 5: Valid IPv6 Format
  // =========================================================================
  test("[TEST 5] Validates standard and compressed IPv6 addresses accurately", () => {
    assert.equal(isValidIp("2001:db8::8a2e:370:7334"), true);
    assert.equal(getIpFamily("2001:db8::8a2e:370:7334"), "IPv6");
    assert.equal(isValidIp("::1"), true);
    assert.equal(getIpFamily("::1"), "IPv6");
    assert.equal(isValidIp("fe80::1ff:fe23:4567:890a"), true);
    assert.equal(isValidIp("::ffff:192.0.2.128"), true); // IPv4-mapped IPv6
  });

  // =========================================================================
  // TEST 6: Invalid or Missing IP
  // =========================================================================
  test("[TEST 6] Invalid or missing IP addresses evaluate to untrusted null", () => {
    assert.equal(isValidIp("999.999.999.999"), false);
    assert.equal(isValidIp("192.168.1.500"), false);
    assert.equal(isValidIp("not-an-ip"), false);
    assert.equal(isValidIp(""), false);
    assert.equal(isValidIp("1.2.3.4, 5.6.7.8"), false);

    const reqEmpty = new Request("http://localhost/api");
    const resEmpty = resolveClientIp(reqEmpty, { provider: "vercel" });
    assert.equal(resEmpty.ip, null);
    assert.equal(resEmpty.isTrusted, false);
  });

  // =========================================================================
  // TEST 7: Rotating IP with Static UID (UID Limit Triggers)
  // =========================================================================
  test("[TEST 7] Rotating IP with static UID triggers UID_LIMIT independently", async () => {
    const sdb = serverDb();
    const nonce = Date.now() % 100000;
    const testUid = `rot_ip_user_${nonce}`;

    // Execute 4 requests with distinct IPs, uidMax = 4
    for (let i = 0; i < 4; i++) {
      const res = await checkDistributedRateLimit(testUid, `198.51.100.${i + 1}`, {
        uidMax: 4,
        ipMax: 20,
        db: sdb,
      });
      assert.equal(res.allowed, true);
    }

    // 5th request with a brand new IP is STILL BLOCKED by UID limit
    const blockedRes = await checkDistributedRateLimit(testUid, `198.51.100.99`, {
      uidMax: 4,
      ipMax: 20,
      db: sdb,
    });
    assert.equal(blockedRes.allowed, false);
    assert.equal(blockedRes.reason, "UID_LIMIT");
    assert.ok(blockedRes.retryAfterSeconds > 0);
  });

  // =========================================================================
  // TEST 8: Rotating UID with Static IP (IP Limit Triggers)
  // =========================================================================
  test("[TEST 8] Rotating UID with static trusted IP triggers IP_LIMIT independently", async () => {
    const sdb = serverDb();
    const nonce = Date.now() % 100000;
    const sharedIp = `203.0.113.${nonce % 240}`;

    // Execute 4 requests with distinct UIDs from same IP, ipMax = 4
    for (let i = 0; i < 4; i++) {
      const res = await checkDistributedRateLimit(`rot_uid_${i}_${nonce}`, sharedIp, {
        uidMax: 20,
        ipMax: 4,
        db: sdb,
      });
      assert.equal(res.allowed, true);
    }

    // 5th request with a brand new UID from same IP is BLOCKED by IP limit
    const blockedRes = await checkDistributedRateLimit(`rot_uid_new_${nonce}`, sharedIp, {
      uidMax: 20,
      ipMax: 4,
      db: sdb,
    });
    assert.equal(blockedRes.allowed, false);
    assert.equal(blockedRes.reason, "IP_LIMIT");
    assert.ok(blockedRes.retryAfterSeconds > 0);
  });

  // =========================================================================
  // TEST 9: Concurrent Requests from Multiple Server Instances
  // =========================================================================
  test("[TEST 9] Concurrent requests across instances serialize atomically without lost updates", async () => {
    const sdb = serverDb();
    const nonce = Date.now() % 100000;
    const concurrentUid = `concurrent_worker_uid_${nonce}`;
    const concurrentIp = `192.0.2.${nonce % 240}`;

    // Launch 5 concurrent rate-check transactions
    const results = await Promise.all([
      checkDistributedRateLimit(concurrentUid, concurrentIp, { uidMax: 10, ipMax: 10, db: sdb }),
      checkDistributedRateLimit(concurrentUid, concurrentIp, { uidMax: 10, ipMax: 10, db: sdb }),
      checkDistributedRateLimit(concurrentUid, concurrentIp, { uidMax: 10, ipMax: 10, db: sdb }),
      checkDistributedRateLimit(concurrentUid, concurrentIp, { uidMax: 10, ipMax: 10, db: sdb }),
      checkDistributedRateLimit(concurrentUid, concurrentIp, { uidMax: 10, ipMax: 10, db: sdb }),
    ]);

    for (const r of results) {
      assert.equal(r.allowed, true);
    }

    // Next request must see exactly count = 5
    const nextCheck = await checkDistributedRateLimit(concurrentUid, concurrentIp, {
      uidMax: 10,
      ipMax: 10,
      db: sdb,
    });
    assert.equal(nextCheck.uidCount, 6);
  });

  // =========================================================================
  // TEST 10: Firestore Service Failure Graceful Degradation
  // =========================================================================
  test("[TEST 10] Firestore degradation falls back safely to in-memory quota without open bypass", async () => {
    const failingDb = {
      collection: () => ({
        doc: () => {
          throw new Error("Simulated Firestore Network Failure");
        },
      }),
      runTransaction: async () => {
        throw new Error("Simulated Firestore Unreachable");
      },
    };

    const failingUid = `failing_db_user_${Date.now()}`;

    // Should fall back to in-memory limiter:
    // First 3 requests succeed
    for (let i = 0; i < 3; i++) {
      const res = await checkDistributedRateLimit(failingUid, null, {
        uidMax: 3,
        db: failingDb,
      });
      assert.equal(res.allowed, true);
    }

    // 4th request on the same instance is caught and BLOCKED by memory fallback
    const blockedRes = await checkDistributedRateLimit(failingUid, null, {
      uidMax: 3,
      db: failingDb,
    });
    assert.equal(blockedRes.allowed, false);
    assert.equal(blockedRes.reason, "UID_LIMIT");
  });

  // =========================================================================
  // TEST 11: Privacy & Zero Raw IP Leakage in Firestore Records
  // =========================================================================
  test("[TEST 11] Raw IP addresses are hashed and never stored in plaintext in Firestore documents", async () => {
    const sdb = serverDb();
    const rawIp = "203.0.113.123";
    const ipHash = hashIpForRateLimit(rawIp);
    const testUid = `privacy_user_${Date.now()}`;

    await checkDistributedRateLimit(testUid, rawIp, { db: sdb });

    const now = Date.now();
    const windowIndex = Math.floor(now / 60_000);
    const ipDoc = await sdb.doc(`rate_limits/auth_chk_ip_${ipHash}_${windowIndex}`).get();

    assert.equal(ipDoc.exists, true);
    const docData = ipDoc.data();

    // Verify key_hash is stored, and raw IP is NOT stored
    assert.equal(docData?.key_hash, ipHash);
    assert.equal(docData?.ip, undefined, "Raw IP address must NOT be stored in document");
    assert.equal(docData?.key, undefined, "Unsanitized key must NOT be stored");
    assert.ok(docData?.expiresAt > now, "TTL expiration field must be populated");
  });

  // =========================================================================
  // TEST 12: Integrated API Endpoint Enforcement (/api/auth/check-conflict)
  // =========================================================================
  test("[TEST 12] check-conflict endpoint enforces distributed rate limit and returns 429", async () => {
    // Make rapid requests to exceed endpoint limit
    let lastStatus = 200;
    for (let i = 0; i < 12; i++) {
      const req = new Request("http://localhost:3000/api/auth/check-conflict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testUser.idToken}`,
        },
        body: JSON.stringify({ phone: `+9055500000${i.toString().padStart(2, "0")}` }),
      });
      const res = await checkConflictRoute(req);
      lastStatus = res.status;
      if (lastStatus === 429) {
        assert.ok(Number(res.headers.get("Retry-After")) > 0);
        break;
      }
    }
    assert.equal(lastStatus, 429);
  });
});
