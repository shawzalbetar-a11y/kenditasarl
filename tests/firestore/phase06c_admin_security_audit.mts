import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDocFromServer, getDocsFromServer, collection, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { authorize } from "../../kenditasarl-admin/src/lib/server/cloudinaryServer.js";
import { listAccounts } from "../../kenditasarl-admin/src/lib/server/cloudAccounts.js";

const PROJECT_ID = "demo-kenditasarla-rules";
const AUTH_EMU = "127.0.0.1:19099";
const FIRESTORE_EMU = "127.0.0.1:18080";

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMU;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMU;
process.env.ISOLATED_DEV_MODE = "1";

describe("Kendin Tasarla — Phase 06C: Admin Security & Access Audit", () => {
  let adminApp: any;
  let auth: any;
  let db: any;
  let rulesEnv: any;

  let normalUid: string;
  let normalToken: string;
  let adminUid: string;
  let adminToken: string;
  let superadminUid: string;
  let superadminToken: string;

  before(async () => {
    // 1. Initialize Firebase Admin SDK for seeding and server tests
    const existing = getApps().find(a => a.name === "phase06c-audit");
    adminApp = existing || initializeApp({ projectId: PROJECT_ID }, "phase06c-audit");
    auth = getAuth(adminApp);
    db = getFirestore(adminApp);

    // 2. Initialize Rules Test Environment for client-side security rules enforcement
    rulesEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: "127.0.0.1",
        port: 18080,
        rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
      },
    });

    // 3. Seed Normal Customer
    const normalEmail = `customer-06c-${Date.now()}@test.local`;
    const normalUser = await auth.createUser({ email: normalEmail, password: "PassWord123!" });
    normalUid = normalUser.uid;
    const normalCustom = await auth.createCustomToken(normalUid);
    const normalRes = await fetch(`http://${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: normalCustom, returnSecureToken: true }),
    });
    normalToken = (await normalRes.json()).idToken;

    // 4. Seed Admin
    const adminEmail = `admin-06c-${Date.now()}@kenditasarla.local`;
    const adminUser = await auth.createUser({ email: adminEmail, password: "AdminPass123!" });
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
    adminToken = (await adminRes.json()).idToken;

    // 5. Seed Superadmin
    const superEmail = `superadmin-06c-${Date.now()}@kenditasarla.local`;
    const superUser = await auth.createUser({ email: superEmail, password: "SuperPass123!" });
    superadminUid = superUser.uid;
    await db.doc(`admins/${superadminUid}`).set({
      email: superEmail,
      role: "superadmin",
      updated_at: new Date().toISOString(),
    });
    const superCustom = await auth.createCustomToken(superadminUid);
    const superRes = await fetch(`http://${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: superCustom, returnSecureToken: true }),
    });
    superadminToken = (await superRes.json()).idToken;

    // 6. Seed mock Cloudinary account for zero-leak audit
    await db.doc("settings/storage/cloudinary/acc-audit-01").set({
      name: "Main Production Account",
      cloud_name: "prod-cloud-audit",
      api_key: "REAL_SECRET_KEY_999",
      api_secret: "SUPER_SECRET_SIGNING_KEY_XYZ",
      is_active: true,
      created_at: new Date().toISOString(),
    });
  });

  after(async () => {
    try {
      if (normalUid) await auth.deleteUser(normalUid);
      if (adminUid) {
        await auth.deleteUser(adminUid);
        await db.doc(`admins/${adminUid}`).delete();
      }
      if (superadminUid) {
        await auth.deleteUser(superadminUid);
        await db.doc(`admins/${superadminUid}`).delete();
      }
      await db.doc("settings/storage/cloudinary/acc-audit-01").delete();
    } catch {}
    await rulesEnv?.cleanup();
  });

  // Test 1: Normal user trying to access admin API -> 403 Forbidden
  test("[Audit 1] Normal user attempting to access administrative API is rejected with 403", async () => {
    const req = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: { Authorization: `Bearer ${normalToken}` },
    });
    const result = await authorize(req, true);
    assert.equal(result, 403, "Normal user must be forbidden (403) from accessing admin routes");
  });

  // Test 2: Normal user trying to create admins/{uid} via Client SDK -> PERMISSION_DENIED
  test("[Audit 2] Normal user attempting to create admins/{uid} via Client SDK is rejected", async () => {
    const clientDb = rulesEnv.authenticatedContext(normalUid).firestore();
    const ownAdminDoc = doc(clientDb, `admins/${normalUid}`);
    await assertFails(
      setDoc(ownAdminDoc, { role: "admin", email: "hacker@test.local" }),
      "Client SDK must never allow normal user to create admins/{uid}"
    );
  });

  // Test 3: Admin trying to upgrade self to superadmin via Client SDK -> PERMISSION_DENIED
  test("[Audit 3] Admin attempting to escalate self to superadmin via Client SDK is rejected", async () => {
    const adminClientDb = rulesEnv.authenticatedContext(adminUid).firestore();
    const ownAdminDoc = doc(adminClientDb, `admins/${adminUid}`);
    await assertFails(
      updateDoc(ownAdminDoc, { role: "superadmin" }),
      "Client SDK must never allow admin to escalate role to superadmin"
    );
  });

  // Test 4: Admin trying to modify another user's permissions -> PERMISSION_DENIED
  test("[Audit 4] Admin attempting to modify another user's admins doc via Client SDK is rejected", async () => {
    const adminClientDb = rulesEnv.authenticatedContext(adminUid).firestore();
    const otherAdminDoc = doc(adminClientDb, `admins/${normalUid}`);
    await assertFails(
      setDoc(otherAdminDoc, { role: "admin" }),
      "Admin cannot grant or alter permissions for another user via Client SDK"
    );
    await assertFails(
      deleteDoc(doc(adminClientDb, `admins/${superadminUid}`)),
      "Admin cannot delete superadmin membership via Client SDK"
    );
  });

  // Test 5: Superadmin authorized access succeeds
  test("[Audit 5] Superadmin authorized access succeeds on admin endpoints", async () => {
    const req = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    const result = await authorize(req, true);
    assert.equal(result, superadminUid, "Superadmin must successfully authorize and return UID");
  });

  // Test 6: Deleted or disabled user -> 401 Unauthorized
  test("[Audit 6] Deleted or disabled user token rejected with 401 Unauthorized", async () => {
    const tempUser = await auth.createUser({ email: `del-${Date.now()}@test.local`, password: "TempPassword123!" });
    await db.doc(`admins/${tempUser.uid}`).set({ role: "admin" });
    const custom = await auth.createCustomToken(tempUser.uid);
    const res = await fetch(`http://${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    });
    const { idToken } = await res.json();

    // Delete the user from Auth
    await auth.deleteUser(tempUser.uid);
    await db.doc(`admins/${tempUser.uid}`).delete();

    // Verify token rejected with checkRevoked: true
    const req = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const result = await authorize(req, true);
    assert.equal(result, 401, "Deleted user token must be rejected with 401 Unauthorized");
  });

  // Test 7: Revoked session -> 401 Unauthorized
  test("[Audit 7] Revoked session token rejected with 401 Unauthorized", async () => {
    const tempUser = await auth.createUser({ email: `rev-${Date.now()}@test.local`, password: "TempPassword123!" });
    await db.doc(`admins/${tempUser.uid}`).set({ role: "admin" });
    const custom = await auth.createCustomToken(tempUser.uid);
    const res = await fetch(`http://${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    });
    const { idToken } = await res.json();

    await new Promise(r => setTimeout(r, 1100));
    await auth.revokeRefreshTokens(tempUser.uid);

    const req = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const result = await authorize(req, true);
    assert.equal(result, 401, "Revoked session must be rejected with 401 Unauthorized");

    await auth.deleteUser(tempUser.uid);
    await db.doc(`admins/${tempUser.uid}`).delete();
  });

  // Test 8: Different Firebase project token -> 401 Unauthorized
  test("[Audit 8] Different Firebase project token (audience mismatch) rejected with 401", async () => {
    const foreignPayload = Buffer.from(JSON.stringify({
      aud: "foreign-firebase-project",
      iss: "https://securetoken.google.com/foreign-firebase-project",
      sub: adminUid,
      user_id: adminUid,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    })).toString("base64url");
    const foreignToken = `eyJhbGciOiJSUzI1NiIsImtpZCI6ImZha2UifQ.${foreignPayload}.c2lnbmF0dXJl`;

    const req = new Request("http://localhost:3001/api/cloudinary/accounts", {
      headers: { Authorization: `Bearer ${foreignToken}` },
    });
    const result = await authorize(req, true);
    assert.equal(result, 401, "Different project token must be rejected with 401 Unauthorized");
  });

  // Test 9: Absence of server identity -> 503 Fail-Closed
  test("[Audit 9] Absence of server credentials when verifying admin roles returns 503", async () => {
    const credError = new Error("Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.");
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
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const result = await authorize(req, true);
      assert.equal(result, 503, "Missing server credentials must fail-closed with 503 Service Unavailable");
    } finally {
      serverDbInstance.doc = originalDoc;
    }
  });

  // Test 10: Prevention of Cloudinary secrets leakage
  test("[Audit 10] Cloudinary API secrets are never leaked via API response or client SDK", async () => {
    // 10A: Server listAccounts() API response must NEVER include api_key or api_secret
    const accounts = await listAccounts();
    const auditAccount = accounts.find((a: any) => a.cloud_name === "prod-cloud-audit");
    assert.ok(auditAccount, "Audit account must be listed for admin");
    assert.equal((auditAccount as any).api_key, undefined, "api_key MUST be stripped from response");
    assert.equal((auditAccount as any).api_secret, undefined, "api_secret MUST be stripped from response");

    // 10B: Client SDK reading settings/storage/cloudinary must be strictly DENIED by security rules
    const adminClientDb = rulesEnv.authenticatedContext(adminUid).firestore();
    await assertFails(
      getDocFromServer(doc(adminClientDb, "settings/storage/cloudinary/acc-audit-01")),
      "Client SDK MUST be rejected when attempting to read settings/storage/cloudinary"
    );
    await assertFails(
      getDocsFromServer(collection(adminClientDb, "settings/storage/cloudinary")),
      "Client SDK MUST be rejected when attempting to list settings/storage/cloudinary"
    );
  });
});
