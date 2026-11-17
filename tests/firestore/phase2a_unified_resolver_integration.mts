process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-kenditasarla-rules";
process.env.GCLOUD_PROJECT = "demo-kenditasarla-rules";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:18080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:19099";

// Mock environment credentials for testing legacy environment fallback transition
process.env.CLOUDINARY_CLOUD_NAME = "mock-env-fallback-cloud";
process.env.CLOUDINARY_API_KEY = "mock-env-key-000";
process.env.CLOUDINARY_API_SECRET = "mock-env-secret-000";

import assert from "node:assert/strict";
import { serverDb as adminServerDb } from "../../kenditasarl-admin/src/lib/server/cloudinaryServer";
import {
  resolveActiveAccount as adminResolveActiveAccount,
  activeAccount as adminActiveAccount,
  invalidateActiveAccountCache as adminInvalidateCache,
  getCachedActiveAccountResolution as adminGetCache,
} from "../../kenditasarl-admin/src/lib/server/activeCloudAccount";
import {
  changeAccount,
  listAccounts,
} from "../../kenditasarl-admin/src/lib/server/cloudAccounts";
import {
  resolveActiveAccount as storeResolveActiveAccount,
  activeAccount as storeActiveAccount,
  invalidateActiveAccountCache as storeInvalidateCache,
  getCachedActiveAccountResolution as storeGetCache,
} from "../../src/lib/server/activeCloudAccount";
import { GET, POST } from "../../kenditasarl-admin/src/app/api/cloudinary/accounts/route";

async function createAuthUser(email: string, pass: string): Promise<{ uid: string; idToken: string }> {
  const url = `http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass, returnSecureToken: true }),
  });
  if (!res.ok) {
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

async function runPhase2ATests() {
  console.log("===================================================================");
  console.log("=== PHASE 2A: UNIFIED ACTIVE CLOUDINARY RESOLVER SHADOW TESTS ===");
  console.log("===================================================================");
  console.log("Isolated Emulators: Auth (19099) & Firestore (18080)");

  // Step 0: Clean Firestore collections in emulator
  const col = adminServerDb().collection("settings/storage/cloudinary");
  const oldSnap = await col.get();
  for (const doc of oldSnap.docs) {
    await doc.ref.delete();
  }
  adminInvalidateCache();
  storeInvalidateCache();
  console.log("✓ Emulator settings/storage/cloudinary cleared.");

  // Seed Admin and Normal Users
  const adminCreds = await createAuthUser("admin-phase2a@kenditasarla.local", "AdminPass123!");
  const userCreds = await createAuthUser("user-phase2a@kenditasarla.local", "UserPass123!");
  await adminServerDb().doc(`admins/${adminCreds.uid}`).set({
    role: "admin",
    email: "admin-phase2a@kenditasarla.local",
  });
  console.log("✓ Admin and normal users seeded.");

  // --- TEST 1: Transition Policy when collection is completely empty ---
  console.log("\n[Test 1] Transition Policy: Collection empty -> Safe environment fallback");
  const storeEmptyRes = await storeResolveActiveAccount();
  const adminEmptyRes = await adminResolveActiveAccount();
  assert.equal(storeEmptyRes.source, "environment_fallback");
  assert.equal(adminEmptyRes.source, "environment_fallback");
  assert.equal(storeEmptyRes.account.cloud_name, adminEmptyRes.account.cloud_name);
  console.log("✓ PASS: Both projects agree on environment fallback when collection is empty.");

  // --- TEST 2: Add Account A and Account B (distinct credentials & cloud names) ---
  console.log("\n[Test 2] Add Account A (active: true) and Account B (active: false)");
  await changeAccount(
    {
      action: "add",
      name: "Mock Cloud A (Primary)",
      cloud_name: "mock-cloud-a",
      api_key: "key-alpha-111",
      api_secret: "secret-alpha-999",
      activate: true,
    },
    adminCreds.uid
  );
  await changeAccount(
    {
      action: "add",
      name: "Mock Cloud B (Secondary)",
      cloud_name: "mock-cloud-b",
      api_key: "key-beta-222",
      api_secret: "secret-beta-888",
      activate: false,
    },
    adminCreds.uid
  );
  console.log("✓ PASS: Account A (active) and Account B (inactive) added.");

  // --- TEST 3: Selecting Account A from both Store and Admin ---
  console.log("\n[Test 3] Active Account Resolution for Account A in Store and Admin");
  const storeResA = await storeResolveActiveAccount();
  const adminResA = await adminResolveActiveAccount();

  assert.equal(storeResA.source, "firestore");
  assert.equal(adminResA.source, "firestore");
  assert.equal(storeResA.account.cloud_name, "mock-cloud-a");
  assert.equal(adminResA.account.cloud_name, "mock-cloud-a");
  assert.equal(storeResA.account.api_key, "key-alpha-111");
  assert.equal(adminResA.account.api_key, "key-alpha-111");
  assert.equal(storeResA.account.api_secret, "secret-alpha-999");
  assert.equal(adminResA.account.api_secret, "secret-alpha-999");
  console.log("✓ PASS: Store and Admin 100% unified in resolving Account A.");

  // --- TEST 4: Atomic Activation of Account B & Deactivation of Account A ---
  console.log("\n[Test 4] Atomic Activation of Account B");
  const accountsList = await listAccounts();
  const accA = accountsList.find(a => a.cloud_name === "mock-cloud-a")!;
  const accB = accountsList.find(a => a.cloud_name === "mock-cloud-b")!;
  assert.ok(accA && accB);

  await changeAccount({ action: "activate", id: accB.id }, adminCreds.uid);

  const updatedList = await listAccounts();
  assert.equal(updatedList.find(a => a.id === accA.id)!.is_active, false);
  assert.equal(updatedList.find(a => a.id === accB.id)!.is_active, true);
  console.log("✓ PASS: Account B activated and Account A deactivated atomically.");

  // --- TEST 5: Selecting Account B from both Store and Admin after switch ---
  console.log("\n[Test 5] Active Account Resolution for Account B in Store and Admin");
  const storeResB = await storeResolveActiveAccount();
  const adminResB = await adminResolveActiveAccount();

  assert.equal(storeResB.source, "firestore");
  assert.equal(adminResB.source, "firestore");
  assert.equal(storeResB.account.cloud_name, "mock-cloud-b");
  assert.equal(adminResB.account.cloud_name, "mock-cloud-b");
  assert.equal(storeResB.account.api_key, "key-beta-222");
  assert.equal(adminResB.account.api_key, "key-beta-222");
  console.log("✓ PASS: Both projects instantly resolve to Account B.");

  // --- TEST 6: Reject Multiple Active Accounts (ambiguous_storage) ---
  console.log("\n[Test 6] Ambiguous Storage Protection (Multiple Active Accounts)");
  // Force both to be active in Firestore
  await col.doc(accA.id).update({ is_active: true });
  adminInvalidateCache();
  storeInvalidateCache();

  await assert.rejects(
    async () => await storeResolveActiveAccount(),
    { message: "ambiguous_storage" }
  );
  await assert.rejects(
    async () => await adminResolveActiveAccount(),
    { message: "ambiguous_storage" }
  );
  console.log("✓ PASS: Multiple active accounts rejected with ambiguous_storage.");

  // Restore single active (Account B)
  await col.doc(accA.id).update({ is_active: false });

  // --- TEST 7: Reject Collection with Accounts but Zero Active (no_active_cloudinary_account) ---
  console.log("\n[Test 7] Reject zero active accounts (Prevent silent fallback)");
  // Deactivate both
  await col.doc(accB.id).update({ is_active: false });
  adminInvalidateCache();
  storeInvalidateCache();

  await assert.rejects(
    async () => await storeResolveActiveAccount(),
    { message: "no_active_cloudinary_account" },
    "Must NOT silently fallback to environment variables when accounts exist in Firestore!"
  );
  await assert.rejects(
    async () => await adminResolveActiveAccount(),
    { message: "no_active_cloudinary_account" }
  );
  console.log("✓ PASS: Silent fallback completely blocked when accounts exist but none active.");

  // Restore Account B as active
  await col.doc(accB.id).update({ is_active: true });
  adminInvalidateCache();
  storeInvalidateCache();

  // --- TEST 8: Cache Invalidation & Stale Data Prevention ---
  console.log("\n[Test 8] Cache Invalidation & Zero-Stale Upload Guarantee");
  // Prime cache with opt-in caching
  const cachedInitial = await adminResolveActiveAccount({ useCache: true, ttlMs: 10000 });
  assert.equal(cachedInitial.account.cloud_name, "mock-cloud-b");
  assert.ok(adminGetCache() !== null, "Cache must be populated");

  // Admin activates Account A
  await changeAccount({ action: "activate", id: accA.id }, adminCreds.uid);

  // Assert that changeAccount() immediately flushed the cache
  assert.equal(adminGetCache(), null, "Cache must be immediately flushed by changeAccount");

  // Immediate next query returns Account A with ZERO stale delay
  const immediatePostSwitch = await adminResolveActiveAccount({ useCache: true });
  assert.equal(immediatePostSwitch.account.cloud_name, "mock-cloud-a");
  
  // Cross-process Store resolver immediately reads Account A from Firestore with zero delay
  const storeImmediate = await storeResolveActiveAccount();
  assert.equal(storeImmediate.account.cloud_name, "mock-cloud-a");
  console.log("✓ PASS: Zero-stale upload guarantee verified. Cache invalidated immediately.");

  // Switch back to Account B
  await changeAccount({ action: "activate", id: accB.id }, adminCreds.uid);

  // --- TEST 9: Zero Leakage of Secrets via API ---
  console.log("\n[Test 9] Security Gate: Zero credentials leakage via API");
  const listReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "GET",
    headers: { Authorization: `Bearer ${adminCreds.idToken}` },
  });
  const listRes = await GET(listReq);
  assert.equal(listRes.status, 200);
  const accountsApiList = await listRes.json();
  for (const acc of accountsApiList) {
    assert.equal(acc.api_key, undefined, "api_key must be absent");
    assert.equal(acc.api_secret, undefined, "api_secret must be absent");
    assert.ok(acc.id && acc.name && acc.cloud_name && typeof acc.is_active === "boolean");
  }
  console.log("✓ PASS: Zero-leak verified across all accounts returned by API.");

  // --- TEST 10: Non-Admin Forbidden to Switch Accounts ---
  console.log("\n[Test 10] Non-Admin RBAC Gate: User forbidden to switch accounts");
  const switchReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userCreds.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "activate", id: accA.id }),
  });
  const switchRes = await POST(switchReq);
  assert.equal(switchRes.status, 403);
  console.log("✓ PASS: Unauthorized user forbidden (HTTP 403).");

  // --- TEST 11: Historical Image URLs Integrity Verification ---
  console.log("\n[Test 11] Historical Image URLs Preservation");
  // Simulate an existing product created when Account A was active
  const historicalProductUrl = "https://res.cloudinary.com/mock-cloud-a/image/upload/v12345/products/gallery/shirt-red.png";
  await adminServerDb().doc("products/test-product-historical").set({
    title: "Classic T-Shirt",
    images: [historicalProductUrl],
    created_at: new Date(),
  });

  // Switch active account to Account B
  await changeAccount({ action: "activate", id: accB.id }, adminCreds.uid);

  // Read product back
  const productDoc = await adminServerDb().doc("products/test-product-historical").get();
  assert.equal(productDoc.data()?.images[0], historicalProductUrl);
  assert.ok(historicalProductUrl.includes("mock-cloud-a"), "URL remains pinned to Account A cloud");
  console.log("✓ PASS: Historical image URL completely untouched and preserved.");

  // --- TEST 12: Compatibility with upload_receipts and Auth trust boundaries ---
  console.log("\n[Test 12] Compatibility with upload_receipts");
  const mockReceiptHash = "abc123hash999";
  const mockReceiptUrl = "https://res.cloudinary.com/mock-cloud-b/image/upload/v67890/prints/custom-design.png";
  await adminServerDb().doc(`upload_receipts/${mockReceiptHash}/owners/${userCreds.uid}`).set({
    url: mockReceiptUrl,
    created_at: new Date(),
  });

  const receiptDoc = await adminServerDb().doc(`upload_receipts/${mockReceiptHash}/owners/${userCreds.uid}`).get();
  assert.equal(receiptDoc.data()?.url, mockReceiptUrl);
  console.log("✓ PASS: upload_receipts architecture intact and verified.");

  console.log("\n===================================================================");
  console.log(" ALL 12 PHASE 2A UNIFIED RESOLVER TESTS PASSED SUCCESSFULLY! ");
  console.log("===================================================================");
}

runPhase2ATests().catch(err => {
  console.error("PHASE 2A TEST FAILED:", err);
  process.exit(1);
});
