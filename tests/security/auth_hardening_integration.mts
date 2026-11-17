import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { authorize } from "../../kenditasarl-admin/src/lib/server/cloudinaryServer.js";

const PROJECT_ID = "demo-kenditasarla-rules";
const AUTH_EMU = "127.0.0.1:19099";
const FIRESTORE_EMU = "127.0.0.1:18080";

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMU;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMU;
process.env.ISOLATED_DEV_MODE = "1";

describe("Kendin Tasarla — Cloudinary Admin Authentication Security Hardening", () => {
  let app: any;
  let auth: any;
  let db: any;
  let adminUid: string;
  let normalUid: string;
  let adminIdToken: string;
  let normalIdToken: string;

  before(async () => {
    const existing = getApps().find(a => a.name === "test-harness");
    app = existing || initializeApp({ projectId: PROJECT_ID }, "test-harness");
    auth = getAuth(app);
    db = getFirestore(app);

    // 1. Seed Admin user
    const adminEmail = `admin-hardening-${Date.now()}@kenditasarla.local`;
    const adminUser = await auth.createUser({ email: adminEmail, password: "HardenedPass123!" });
    adminUid = adminUser.uid;
    await db.doc(`admins/${adminUid}`).set({
      email: adminEmail,
      role: "admin",
      updated_at: new Date().toISOString(),
    });

    const adminCustom = await auth.createCustomToken(adminUid);
    const adminRes = await fetch(`http://${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: adminCustom, returnSecureToken: true }),
    });
    const adminData = await adminRes.json();
    adminIdToken = adminData.idToken;

    // 2. Seed Normal Customer user
    const normalEmail = `customer-hardening-${Date.now()}@test.local`;
    const normalUser = await auth.createUser({ email: normalEmail, password: "CustomerPass123!" });
    normalUid = normalUser.uid;

    const normalCustom = await auth.createCustomToken(normalUid);
    const normalRes = await fetch(`http://${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: normalCustom, returnSecureToken: true }),
    });
    const normalData = await normalRes.json();
    normalIdToken = normalData.idToken;
  });

  after(async () => {
    try {
      if (adminUid) {
        await auth.deleteUser(adminUid);
        await db.doc(`admins/${adminUid}`).delete();
      }
      if (normalUid) {
        await auth.deleteUser(normalUid);
      }
    } catch {}
  });

  test("Gate 1: Valid admin token succeeds and returns UID", async () => {
    const req = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: {
        Authorization: `Bearer ${adminIdToken}`,
      },
    });

    const result = await authorize(req, true);
    assert.equal(typeof result, "string", "Admin authorization must return UID string");
    assert.equal(result, adminUid, "Returned UID must match admin UID");
  });

  test("Gate 2: Expired token rejected with 401 Unauthorized", async () => {
    // Construct expired JWT payload
    const expiredPayload = Buffer.from(JSON.stringify({
      aud: PROJECT_ID,
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      sub: adminUid,
      user_id: adminUid,
      exp: Math.floor(Date.now() / 1000) - 300, // expired 5 minutes ago
      iat: Math.floor(Date.now() / 1000) - 3900,
    })).toString("base64url");
    const expiredToken = `eyJhbGciOiJSUzI1NiIsImtpZCI6ImZha2UifQ.${expiredPayload}.c2lnbmF0dXJl`;

    const req = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });

    const result = await authorize(req, true);
    assert.equal(result, 401, "Expired token must be rejected with 401 Unauthorized");
  });

  test("Gate 3: Token from different project (aud mismatch) rejected with 401 Unauthorized", async () => {
    const wrongAudPayload = Buffer.from(JSON.stringify({
      aud: "completely-different-project-id",
      iss: "https://securetoken.google.com/completely-different-project-id",
      sub: adminUid,
      user_id: adminUid,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    })).toString("base64url");
    const wrongAudToken = `eyJhbGciOiJSUzI1NiIsImtpZCI6ImZha2UifQ.${wrongAudPayload}.c2lnbmF0dXJl`;

    const req = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: {
        Authorization: `Bearer ${wrongAudToken}`,
      },
    });

    const result = await authorize(req, true);
    assert.equal(result, 401, "Cross-project token must be rejected with 401 Unauthorized");
  });

  test("Gate 4: Revoked session token rejected with 401 Unauthorized (checkRevoked enforced)", async () => {
    // Create dedicated user for revocation test
    const tempEmail = `temp-revoked-${Date.now()}@kenditasarla.local`;
    const tempUser = await auth.createUser({ email: tempEmail, password: "TempPassword123!" });
    await db.doc(`admins/${tempUser.uid}`).set({ role: "admin" });

    const customToken = await auth.createCustomToken(tempUser.uid);
    const res = await fetch(`http://${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    const { idToken } = await res.json();

    // Verify token works initially
    const initialReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const initialResult = await authorize(initialReq, true);
    assert.equal(initialResult, tempUser.uid, "Token must be valid before revocation");

    // Wait 1.1 seconds so issued-at timestamp is strictly before revocation timestamp
    await new Promise(r => setTimeout(r, 1100));

    // Revoke all refresh tokens for this user
    await auth.revokeRefreshTokens(tempUser.uid);

    // Verify token is now rejected because checkRevoked=true is strictly enforced
    const revokedReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const revokedResult = await authorize(revokedReq, true);
    assert.equal(revokedResult, 401, "Revoked token must be rejected with 401 Unauthorized");

    // Cleanup
    await auth.deleteUser(tempUser.uid);
    await db.doc(`admins/${tempUser.uid}`).delete();
  });

  test("Gate 5: Normal non-admin user rejected with 403 Forbidden for admin-only routes", async () => {
    const req = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: {
        Authorization: `Bearer ${normalIdToken}`,
      },
    });

    // With adminOnly = true -> Must return 403 Forbidden
    const adminCheckResult = await authorize(req, true);
    assert.equal(adminCheckResult, 403, "Non-admin must be rejected with 403 Forbidden on adminOnly routes");

    // With adminOnly = false -> Must succeed and return normal user UID
    const normalCheckResult = await authorize(req, false);
    assert.equal(normalCheckResult, normalUid, "Non-admin user succeeds on non-admin routes");
  });

  test("Gate 6: Server credentials failure returns 503 Service Unavailable (Fail-Closed)", async () => {
    // When credentials needed for Firestore or verification are unconfigured/unavailable
    // (Simulate an actor whose admin doc cannot be fetched due to credentials failure)
    const originalGet = db.doc(`admins/${adminUid}`).get;
    const credError = new Error("Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.");

    // Temporarily mock serverDb to simulate credential absence
    const cloudinaryModule = await import("../../kenditasarl-admin/src/lib/server/cloudinaryServer.js");
    const serverDbInstance = cloudinaryModule.serverDb();
    const originalDoc = serverDbInstance.doc.bind(serverDbInstance);

    serverDbInstance.doc = (path: string) => {
      if (path.startsWith("admins/")) {
        return {
          get: async () => { throw credError; },
        } as any;
      }
      return originalDoc(path);
    };

    try {
      const req = new Request("http://localhost:3001/api/cloudinary/accounts", {
        headers: { Authorization: `Bearer ${adminIdToken}` },
      });
      const result = await authorize(req, true);
      assert.equal(result, 503, "Missing server credentials must fail-closed with HTTP 503");
    } finally {
      serverDbInstance.doc = originalDoc;
    }
  });

  test("Gate 7: ADC credentials integration loads via applicationDefault() without errors", async () => {
    const { applicationDefault } = await import("firebase-admin/app");
    const adc = applicationDefault();
    assert.ok(adc, "applicationDefault() must instantiate ApplicationDefaultCredential");
  });

  test("Gate 8: User ID spoofing rejected with 403 (x-user-id != token.uid)", async () => {
    const spoofReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: {
        Authorization: `Bearer ${adminIdToken}`,
        "x-user-id": "spoofed-different-uid",
      },
    });

    const result = await authorize(spoofReq, true);
    assert.equal(result, 403, "Conflicting x-user-id header must be rejected with 403 Forbidden");
  });
});
