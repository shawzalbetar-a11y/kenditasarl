process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-kenditasarla-rules";
process.env.GCLOUD_PROJECT = "demo-kenditasarla-rules";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:18080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:19099";

import assert from "node:assert/strict";
import { serverDb } from "../../kenditasarl-admin/src/lib/server/cloudinaryServer";
import { activeAccount, listAccounts } from "../../kenditasarl-admin/src/lib/server/cloudAccounts";
import { GET, POST } from "../../kenditasarl-admin/src/app/api/cloudinary/accounts/route";

async function createAuthUser(email: string, pass: string): Promise<{ uid: string; idToken: string }> {
  const url = `http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass, returnSecureToken: true }),
  });
  if (!res.ok) {
    // If user already exists, sign in
    const signInUrl = `http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
    const signInRes = await fetch(signInUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass, returnSecureToken: true }),
    });
    const data = await signInRes.json();
    return { uid: data.localId, idToken: data.idToken };
  }
  const data = await res.json();
  return { uid: data.localId, idToken: data.idToken };
}

async function runTests() {
  console.log("=== PHASE 1: CLOUDINARY MULTI-ACCOUNT INTEGRATION TESTS ===");
  console.log("Environment: Isolated Firebase Emulators (demo-kenditasarla-rules)");

  // 1. Clean existing test data in emulator Firestore
  const existingDocs = await serverDb().collection("settings/storage/cloudinary").get();
  for (const doc of existingDocs.docs) {
    await doc.ref.delete();
  }
  console.log(" Cleaned emulator settings/storage/cloudinary collection.");

  // 2. Create Test Admin and Normal User
  const adminCreds = await createAuthUser("admin-phase1@kenditasarla.local", "AdminPass123!");
  const userCreds = await createAuthUser("user-phase1@kenditasarla.local", "UserPass123!");

  await serverDb().doc(`admins/${adminCreds.uid}`).set({
    role: "admin",
    email: "admin-phase1@kenditasarla.local",
    createdAt: new Date(),
  });
  console.log(" Admin test user seeded in Auth & Firestore:", adminCreds.uid);
  console.log(" Normal test user seeded in Auth:", userCreds.uid);

  // --- TEST 1: Unauthenticated GET (401) ---
  console.log("\n[Test 1] Unauthenticated GET /api/cloudinary/accounts");
  const unauthReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "GET",
  });
  const unauthRes = await GET(unauthReq);
  assert.equal(unauthRes.status, 401, "Must return HTTP 401 for missing token");
  const unauthBody = await unauthRes.json();
  assert.deepEqual(unauthBody, { error: "unauthorized" }, "Must return error: unauthorized");
  console.log(" PASS: 401 unauthorized returned.");

  // --- TEST 2: Non-Admin GET (403) ---
  console.log("\n[Test 2] Non-Admin GET /api/cloudinary/accounts");
  const forbiddenReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "GET",
    headers: { Authorization: `Bearer ${userCreds.idToken}` },
  });
  const forbiddenRes = await GET(forbiddenReq);
  assert.equal(forbiddenRes.status, 403, "Must return HTTP 403 for non-admin");
  const forbiddenBody = await forbiddenRes.json();
  assert.deepEqual(forbiddenBody, { error: "forbidden" }, "Must return error: forbidden");
  console.log(" PASS: 403 forbidden returned.");

  // --- TEST 3: Admin GET on empty collection (200, []) ---
  console.log("\n[Test 3] Admin GET on empty collection");
  const emptyReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "GET",
    headers: { Authorization: `Bearer ${adminCreds.idToken}` },
  });
  const emptyRes = await GET(emptyReq);
  assert.equal(emptyRes.status, 200, "Must return HTTP 200");
  const emptyBody = await emptyRes.json();
  assert.ok(Array.isArray(emptyBody) && emptyBody.length === 0, "Must return empty array");
  console.log(" PASS: 200 [] returned.");

  // --- TEST 4: Invalid Action POST (400) ---
  console.log("\n[Test 4] Invalid action payload");
  const invalidReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminCreds.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "malformed" }),
  });
  const invalidRes = await POST(invalidReq);
  assert.equal(invalidRes.status, 400, "Must return HTTP 400 for invalid action");
  console.log(" PASS: 400 invalid_action returned.");

  // --- TEST 5: Add First Account A (with explicit activate: true) ---
  console.log("\n[Test 5] Add Account A (first account with explicit activate: true)");
  const addAReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminCreds.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "add",
      name: "Mock Primary Cloud A",
      cloud_name: "mock-cloud-a",
      api_key: "mock-key-alpha-111",
      api_secret: "mock-secret-alpha-999",
      activate: true,
    }),
  });
  const addARes = await POST(addAReq);
  assert.equal(addARes.status, 200, "Must return HTTP 200 on add");
  console.log(" PASS: Account A added successfully.");

  // --- TEST 6: Add Second Account B without activate (must remain inactive) ---
  console.log("\n[Test 6] Add Account B (second account, default inactive)");
  const addBReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminCreds.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "add",
      name: "Mock Secondary Cloud B",
      cloud_name: "mock-cloud-b",
      api_key: "mock-key-beta-222",
      api_secret: "mock-secret-beta-888",
      activate: false,
    }),
  });
  const addBRes = await POST(addBReq);
  assert.equal(addBRes.status, 200, "Must return HTTP 200 on add");
  console.log(" PASS: Account B added successfully.");

  // --- TEST 7: GET Accounts & Zero-Leak Verification ---
  console.log("\n[Test 7] Verify List & Zero-Leak of API Secrets");
  const listReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "GET",
    headers: { Authorization: `Bearer ${adminCreds.idToken}` },
  });
  const listRes = await GET(listReq);
  assert.equal(listRes.status, 200);
  const accounts = (await listRes.json()) as Array<{
    id: string;
    name: string;
    cloud_name: string;
    is_active: boolean;
    api_key?: string;
    api_secret?: string;
  }>;

  assert.equal(accounts.length, 2, "Must return exactly 2 accounts");
  const accountA = accounts.find(a => a.cloud_name === "mock-cloud-a")!;
  const accountB = accounts.find(a => a.cloud_name === "mock-cloud-b")!;
  assert.ok(accountA, "Account A must exist");
  assert.ok(accountB, "Account B must exist");

  assert.equal(accountA.is_active, true, "Account A must be active");
  assert.equal(accountB.is_active, false, "Account B must be inactive");

  // STRICT ZERO-LEAK VERIFICATION
  for (const acc of accounts) {
    assert.equal(acc.api_key, undefined, `API key must NOT be leaked for ${acc.name}`);
    assert.equal(acc.api_secret, undefined, `API secret must NOT be leaked for ${acc.name}`);
  }
  console.log(" PASS: Account A is active, Account B is inactive.");
  console.log(" PASS: ZERO-LEAK verified: No api_key or api_secret returned in API response.");

  // --- TEST 8: Verify activeAccount() points to Account A ---
  console.log("\n[Test 8] activeAccount() resolution");
  const currentActive = await activeAccount();
  assert.equal(currentActive.cloud_name, "mock-cloud-a");
  assert.equal(currentActive.api_key, "mock-key-alpha-111");
  console.log(" PASS: activeAccount() correctly resolves to Account A.");

  // --- TEST 9: Atomic Activation of Account B ---
  console.log("\n[Test 9] Atomic Activation of Account B");
  const activateReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminCreds.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "activate", id: accountB.id }),
  });
  const activateRes = await POST(activateReq);
  assert.equal(activateRes.status, 200, "Activation must return HTTP 200");

  const listAfterActivate = await listAccounts();
  const updatedA = listAfterActivate.find(a => a.id === accountA.id)!;
  const updatedB = listAfterActivate.find(a => a.id === accountB.id)!;
  assert.equal(updatedA.is_active, false, "Account A must now be inactive");
  assert.equal(updatedB.is_active, true, "Account B must now be active");

  const newActive = await activeAccount();
  assert.equal(newActive.cloud_name, "mock-cloud-b");
  assert.equal(newActive.api_key, "mock-key-beta-222");
  console.log(" PASS: Atomic switch successful. Account B is active, Account A is inactive.");

  // --- TEST 10: Prevention of Active Account Deletion ---
  console.log("\n[Test 10] Attempting to remove active Account B (must be rejected)");
  const removeActiveReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminCreds.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "remove", id: accountB.id }),
  });
  const removeActiveRes = await POST(removeActiveReq);
  assert.equal(removeActiveRes.status, 400, "Deleting active account must be rejected with HTTP 400");
  const removeActiveBody = await removeActiveRes.json();
  assert.deepEqual(removeActiveBody, { error: "cannot_delete_active_account" });

  const checkB = (await listAccounts()).find(a => a.id === accountB.id);
  assert.ok(checkB && checkB.is_active === true, "Account B must still exist and be active");
  console.log(" PASS: Active account removal forbidden and prevented.");

  // --- TEST 11: Removing Inactive Account A (allowed) ---
  console.log("\n[Test 11] Remove Inactive Account A");
  const removeInactiveReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminCreds.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "remove", id: accountA.id }),
  });
  const removeInactiveRes = await POST(removeInactiveReq);
  assert.equal(removeInactiveRes.status, 200, "Deleting inactive account must return HTTP 200");

  const listAfterRemove = await listAccounts();
  assert.equal(listAfterRemove.length, 1, "Must have exactly 1 account left");
  assert.equal(listAfterRemove[0].id, accountB.id, "Remaining account must be Account B");
  console.log(" PASS: Inactive account removed cleanly.");

  // --- TEST 12: Non-Admin attempt to modify accounts ---
  console.log("\n[Test 12] Non-Admin attempt to modify accounts");
  const nonAdminAddReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userCreds.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "activate", id: accountB.id }),
  });
  const nonAdminAddRes = await POST(nonAdminAddReq);
  assert.equal(nonAdminAddRes.status, 403, "Non-admin modifications must return HTTP 403");
  console.log(" PASS: Non-admin modifications blocked with 403.");

  // --- TEST 13: Add Account with Explicit activate: true ---
  console.log("\n[Test 13] Add Account C with explicit activate: true");
  const addCReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminCreds.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "add",
      name: "Mock Cloud C",
      cloud_name: "mock-cloud-c",
      api_key: "mock-key-gamma-333",
      api_secret: "mock-secret-gamma-777",
      activate: true,
    }),
  });
  const addCRes = await POST(addCReq);
  assert.equal(addCRes.status, 200);

  const listAfterC = await listAccounts();
  const accC = listAfterC.find(a => a.cloud_name === "mock-cloud-c")!;
  const accB = listAfterC.find(a => a.id === accountB.id)!;
  assert.equal(accC.is_active, true, "Account C must be active");
  assert.equal(accB.is_active, false, "Account B must have been deactivated");
  console.log(" PASS: Account C added and activated atomically, Account B deactivated.");

  console.log("\n========================================================");
  console.log(" ALL 13 PHASE 1 INTEGRATION TESTS PASSED SUCCESSFULLY! ");
  console.log("========================================================");
}

runTests().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
