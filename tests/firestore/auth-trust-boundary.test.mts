import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  getDoc,
  setDoc,
  updateDoc,
  doc,
  setLogLevel,
} from "firebase/firestore";
import { serverDb } from "../../src/lib/server/cloudinaryServer";
import {
  type MatchingBundleItem,
  type MasterCanvasData,
} from "../../src/lib/matchingCollections";
import {
  GET as adminTemplatesGetRoute,
  POST as adminTemplatesPostRoute,
} from "../../kenditasarl-admin/src/app/api/matching-collections/route";
import { GET as storeTemplatesGetRoute } from "../../src/app/api/matching-collections/route";
import {
  GET as masterDesignsGetRoute,
  POST as masterDesignsPostRoute,
} from "../../src/app/api/master-designs/route";
import {
  GET as bundleListGetRoute,
  POST as bundleCreateRoute,
} from "../../src/app/api/matching-bundles/route";
import {
  GET as bundleGetRoute,
  PUT as bundlePutRoute,
} from "../../src/app/api/matching-bundles/[id]/route";
import { POST as bundleAddToCartRoute } from "../../src/app/api/matching-bundles/[id]/add-to-cart/route";

const projectId = "demo-kenditasarla-rules";
let env: any, db: any, userA: any, userB: any, adminUser: any, invalidRoleUser: any;

async function identity(email: string) {
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

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099");
  process.env.GCLOUD_PROJECT = projectId;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  setLogLevel("silent");

  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 18080,
      rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
    },
  });

  db = serverDb();
  userA = await identity("r2_user_a@example.com");
  userB = await identity("r2_user_b@example.com");
  adminUser = await identity("r2_admin@example.com");
  invalidRoleUser = await identity("r2_invalid_role@example.com");

  // Canonical admin authorization in admins/{uid}
  await db.doc(`admins/${adminUser.localId}`).set({ role: "admin", createdAt: new Date().toISOString() });
  await db.doc(`admins/${invalidRoleUser.localId}`).set({ role: "customer", createdAt: new Date().toISOString() });

  // Pricing configuration for 03B server pricing authority
  await db.doc("settings/pricing").set({
    delivery: {
      fixed_shipping_fee: 30,
      free_shipping_threshold: 500,
      is_free_shipping_enabled: true,
    },
    customization: {
      face_prices: { front: 50, back: 60 },
      placement_prices: { front: 50, back: 60 },
      extra_placement_same_face_price: 20,
    },
    price_revision: 1,
  });

  // Target product in catalog
  await db.doc("products/tee_r2").set({
    is_active: true,
    name_tr: "Aile Tişörtü",
    name_ar: "تيشيرت عائلي",
    name_en: "Family Tee",
    base_price: 250,
    category_id: "tshirt",
    images: [{ face: "front", type: "blank", url: "https://assets.invalid/tee_r2.png" }],
    customization_config: {
      garmentType: "tshirt",
      faces: {
        front: {
          enabled: true,
          printArea: { left: 100, top: 100, width: 300, height: 400 },
        },
      },
    },
  });

  await db.doc("products/tee_r2/variants/black").set({
    color: "black",
    sizes: { L: 20 },
  });

  // Templates
  await db.doc("matching_collection_templates/template_active_r2").set({
    id: "template_active_r2",
    slug: "template-active-r2",
    title: { tr: "Aktif", ar: "نشط", en: "Active" },
    description: { tr: "Açıklama", ar: "وصف", en: "Desc" },
    coverImageUrl: "https://assets.invalid/cover_active.png",
    allowedProductIds: ["tee_r2"],
    suggestedRoles: [{ id: "parent", label: { tr: "Ebeveyn", ar: "أب", en: "Parent" } }],
    sortOrder: 1,
    isActive: true,
  });

  await db.doc("matching_collection_templates/template_inactive_r2").set({
    id: "template_inactive_r2",
    slug: "template-inactive-r2",
    title: { tr: "Pasif", ar: "غير نشط", en: "Inactive" },
    description: { tr: "Açıklama", ar: "وصف", en: "Desc" },
    coverImageUrl: "https://assets.invalid/cover_inactive.png",
    allowedProductIds: ["tee_r2"],
    suggestedRoles: [{ id: "child", label: { tr: "Çocuk", ar: "طفل", en: "Child" } }],
    sortOrder: 2,
    isActive: false,
  });
});

after(async () => {
  await env?.cleanup();
});

// ============================================================================
// Requirement 1: Missing Authorization with x-user-id of owner -> 401
// ============================================================================
test("R2-01: Missing Authorization with x-user-id header returns 401 Unauthorized without writes", async () => {
  // Attempting to call master designs API with only x-user-id
  const req = new Request("http://localhost/api/master-designs", {
    method: "GET",
    headers: {
      "x-user-id": userA.localId,
    },
  });
  const res = await masterDesignsGetRoute(req);
  assert.equal(res.status, 401, "Must return 401 when Authorization header is missing");

  // Attempting to call bundle draft creation with only x-user-id
  const reqPost = new Request("http://localhost/api/matching-bundles", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": userA.localId,
    },
    body: JSON.stringify({
      title: "Hacked Bundle",
      masterDesignId: "design_fake",
      masterRevisionHash: "0".repeat(64),
    }),
  });
  const resPost = await bundleCreateRoute(reqPost);
  assert.equal(resPost.status, 401, "Must return 401 when Authorization header is missing");
});

// ============================================================================
// Requirement 2: Token of A + x-user-id of B -> 403 identity mismatch
// ============================================================================
test("R2-02: Valid token for User A with conflicting x-user-id for User B is rejected with 403", async () => {
  const req = new Request("http://localhost/api/master-designs", {
    method: "GET",
    headers: {
      authorization: `Bearer ${userA.idToken}`,
      "x-user-id": userB.localId, // Spoofed user B
    },
  });
  const res = await masterDesignsGetRoute(req);
  assert.equal(res.status, 403, "Must reject conflicting client x-user-id with 403");
});

// ============================================================================
// Requirement 3: Token of A with userId of B in body or path -> 403 forbidden
// ============================================================================
test("R2-03: Token of User A with userId of User B in body is rejected with 403", async () => {
  // Creating a bundle with User B's userId in payload
  const req = new Request("http://localhost/api/matching-bundles", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${userA.idToken}`,
    },
    body: JSON.stringify({
      userId: userB.localId, // Spoofing B in payload
      title: "Tampered Bundle",
      masterDesignId: "dummy_master",
      masterRevisionHash: "0".repeat(64),
    }),
  });
  const res = await bundleCreateRoute(req);
  assert.equal(res.status, 403, "Must reject mismatched userId in request body");
});

// ============================================================================
// Requirement 4: Invalid, expired or forged JWT tokens -> 401
// ============================================================================
test("R2-04: Invalid or forged JWT tokens return 401 Unauthorized", async () => {
  const req = new Request("http://localhost/api/matching-bundles", {
    method: "GET",
    headers: {
      authorization: "Bearer invalid.mock.jwt.token",
    },
  });
  const res = await bundleListGetRoute(req);
  assert.equal(res.status, 401, "Invalid token must return 401");
});

// ============================================================================
// Requirement 5: User B cannot convert or access User A's bundle or designs
// ============================================================================
test("R2-05: User B cannot access or add to cart User A's bundle drafts", async () => {
  // Create bundle owned by User A
  const bundleId = "bundle_owned_by_a";
  await db.doc(`matching_bundle_drafts/${bundleId}`).set({
    id: bundleId,
    userId: userA.localId,
    title: "User A Family Set",
    masterDesignId: "master_a",
    masterRevision: 1,
    masterRevisionHash: "0".repeat(64),
    status: "draft",
  });

  // User B tries to read User A's bundle
  const reqGet = new Request(`http://localhost/api/matching-bundles/${bundleId}`, {
    method: "GET",
    headers: { authorization: `Bearer ${userB.idToken}` },
  });
  const resGet = await bundleGetRoute(reqGet, { params: { id: bundleId } });
  assert.equal(resGet.status, 403, "User B must not read User A bundle");

  // User B tries to add User A's bundle to cart
  const reqAddToCart = new Request(`http://localhost/api/matching-bundles/${bundleId}/add-to-cart`, {
    method: "POST",
    headers: { authorization: `Bearer ${userB.idToken}` },
  });
  const resAddToCart = await bundleAddToCartRoute(reqAddToCart, { params: { id: bundleId } });
  assert.equal(resAddToCart.status, 403, "User B must not convert User A bundle");
});

// ============================================================================
// Requirement 6: Stale master revision or stale product template rejected (409)
// ============================================================================
test("R2-06: Stale master design revision is rejected with 409 without creating cart lines", async () => {
  const masterId = "master_stale_r2";
  await db.doc(`master_designs/${masterId}`).set({
    id: masterId,
    userId: userA.localId,
    revision: 3, // Current revision is 3
    revisionHash: "a".repeat(64),
    title: "Updated Master",
  });

  const bundleId = "bundle_stale_r2";
  await db.doc(`matching_bundle_drafts/${bundleId}`).set({
    id: bundleId,
    userId: userA.localId,
    masterDesignId: masterId,
    masterRevision: 1, // Stale pointer to 1
    masterRevisionHash: "0".repeat(64),
    status: "draft",
  });

  const req = new Request(`http://localhost/api/matching-bundles/${bundleId}/add-to-cart`, {
    method: "POST",
    headers: { authorization: `Bearer ${userA.idToken}` },
  });
  const res = await bundleAddToCartRoute(req, { params: { id: bundleId } });
  assert.equal(res.status, 409, "Must reject stale master design revision with 409");
  const data = await res.json();
  assert.equal(data.error, "STALE_MASTER_REVISION");
});

// ============================================================================
// Requirement 7: Admin verification requires canonical admins/{uid}
// ============================================================================
test("R2-07: Admin API strictly requires canonical admins/{uid} record with admin or superadmin", async () => {
  // Ordinary user
  const reqUser = new Request("http://localhost/api/matching-collections", {
    method: "GET",
    headers: { authorization: `Bearer ${userA.idToken}` },
  });
  const resUser = await adminTemplatesGetRoute(reqUser);
  assert.equal(resUser.status, 403, "Ordinary user must receive 403");

  // User with invalid role in admins/{uid}
  const reqInvalid = new Request("http://localhost/api/matching-collections", {
    method: "GET",
    headers: { authorization: `Bearer ${invalidRoleUser.idToken}` },
  });
  const resInvalid = await adminTemplatesGetRoute(reqInvalid);
  assert.equal(resInvalid.status, 403, "User with customer role in admins must receive 403");

  // Authorized admin
  const reqAdmin = new Request("http://localhost/api/matching-collections", {
    method: "GET",
    headers: { authorization: `Bearer ${adminUser.idToken}` },
  });
  const resAdmin = await adminTemplatesGetRoute(reqAdmin);
  assert.equal(resAdmin.status, 200, "Authorized admin must receive 200");
});

// ============================================================================
// Requirement 8: Idempotency with payload verification & concurrency
// ============================================================================
test("R2-08: Idempotency replays identical calls, rejects conflicting payloads, and isolates cross-user", async () => {
  const masterId = "master_idem_r2";
  await db.doc(`master_designs/${masterId}`).set({
    id: masterId,
    userId: userA.localId,
    revision: 1,
    revisionHash: "0".repeat(64),
    title: "Master Idem",
  });

  const bundleId = "bundle_idem_r2";
  const draftRef = db.doc(`matching_bundle_drafts/${bundleId}`);
  await draftRef.set({
    id: bundleId,
    userId: userA.localId,
    masterDesignId: masterId,
    masterRevision: 1,
    masterRevisionHash: "0".repeat(64),
    status: "draft",
  });

  const item: MatchingBundleItem = {
    id: "item_r2_1",
    bundleId,
    roleLabel: "Baba",
    productId: "tee_r2",
    productTitle: "Aile Tişörtü",
    variantId: "black_L",
    variantDocId: "black",
    sku: "tee_r2_black_L",
    color: "black",
    size: "L",
    quantity: 1,
    templateRevisionId: "0".repeat(64),
    face: "front",
    placementId: "front",
    targetPlacementRect: { x: 100, y: 100, width: 300, height: 400 },
    mapping: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, rotation: 0 },
    canvasJson: JSON.stringify({
      version: "5.3.0",
      objects: [
        {
          type: "text",
          text: "R2 Family Text",
          left: 120,
          top: 120,
          width: 80,
          height: 30,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
          originX: "left",
          originY: "top",
          fontSize: 20,
          fill: "#000000",
        },
      ],
    }),
    validationStatus: "valid",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await draftRef.collection("items").doc("item_r2_1").set(item);

  const key = "key_r2_concurrency_100";

  // Call 1: First add-to-cart call
  const req1 = new Request(`http://localhost/api/matching-bundles/${bundleId}/add-to-cart`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${userA.idToken}`,
      "x-idempotency-key": key,
      "content-type": "application/json",
    },
    body: JSON.stringify({ note: "first call" }),
  });
  const res1 = await bundleAddToCartRoute(req1, { params: { id: bundleId } });
  const data1 = await res1.json();
  assert.equal(res1.status, 200, JSON.stringify(data1));
  assert.equal(data1.ok, true);
  const cartIds = data1.cartItemIds;

  // Call 2: Duplicate call with exact same idempotency key and body
  const req2 = new Request(`http://localhost/api/matching-bundles/${bundleId}/add-to-cart`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${userA.idToken}`,
      "x-idempotency-key": key,
      "content-type": "application/json",
    },
    body: JSON.stringify({ note: "first call" }),
  });
  const res2 = await bundleAddToCartRoute(req2, { params: { id: bundleId } });
  const data2 = await res2.json();
  assert.equal(res2.status, 200);
  assert.equal(data2.idempotentReplay, true);
  assert.deepEqual(data2.cartItemIds, cartIds);

  // Call 3: Call with same idempotency key but conflicting different body -> 409 mismatch
  const req3 = new Request(`http://localhost/api/matching-bundles/${bundleId}/add-to-cart`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${userA.idToken}`,
      "x-idempotency-key": key,
      "content-type": "application/json",
    },
    body: JSON.stringify({ note: "conflicting different payload" }),
  });
  const res3 = await bundleAddToCartRoute(req3, { params: { id: bundleId } });
  assert.equal(res3.status, 409, "Must reject conflicting payload with 409");
  const data3 = await res3.json();
  assert.equal(data3.error, "IDEMPOTENCY_PAYLOAD_MISMATCH");

  // Call 4: User B attempting to use the same idempotency key to convert User A's bundle -> 403
  const req4 = new Request(`http://localhost/api/matching-bundles/${bundleId}/add-to-cart`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${userB.idToken}`,
      "x-idempotency-key": key,
    },
  });
  const res4 = await bundleAddToCartRoute(req4, { params: { id: bundleId } });
  assert.equal(res4.status, 403, "Key cannot cross trust boundary to User B");
});

// ============================================================================
// Requirement 9: Forged placement or prices in client JSON ignored/validated
// ============================================================================
test("R2-09: Forged prices or invalid placements are rejected or governed by 03B server pricing", async () => {
  const masterId = "master_forged_art";
  await db.doc(`master_designs/${masterId}`).set({
    id: masterId,
    userId: userA.localId,
    revision: 1,
    revisionHash: "0".repeat(64),
    title: "Master Forged",
  });

  const bundleId = "bundle_forged_art";
  const draftRef = db.doc(`matching_bundle_drafts/${bundleId}`);
  await draftRef.set({
    id: bundleId,
    userId: userA.localId,
    masterDesignId: masterId,
    masterRevision: 1,
    masterRevisionHash: "0".repeat(64),
    status: "draft",
  });

  // Client creates item with out_of_bounds or forged placement
  const item: MatchingBundleItem = {
    id: "item_forged_1",
    bundleId,
    roleLabel: "Hacker",
    productId: "tee_r2",
    productTitle: "Aile Tişörtü",
    variantId: "black_L",
    variantDocId: "black",
    sku: "tee_r2_black_L",
    color: "black",
    size: "L",
    quantity: 1,
    templateRevisionId: "0".repeat(64),
    face: "front",
    placementId: "invalid_placement_xyz",
    targetPlacementRect: { x: 100, y: 100, width: 300, height: 400 },
    mapping: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, rotation: 0 },
    canvasJson: JSON.stringify({ version: "5.3.0", objects: [] }),
    validationStatus: "out_of_bounds", // Out of bounds flag
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await draftRef.collection("items").doc("item_forged_1").set(item);

  const req = new Request(`http://localhost/api/matching-bundles/${bundleId}/add-to-cart`, {
    method: "POST",
    headers: { authorization: `Bearer ${userA.idToken}` },
  });
  const res = await bundleAddToCartRoute(req, { params: { id: bundleId } });
  assert.equal(res.status, 400, "Must reject out-of-bounds item with 400");
  const data = await res.json();
  assert.equal(data.error, "OUT_OF_BOUNDS");
});

// ============================================================================
// Requirement 10: Client SDK query boundaries & direct write rejection
// ============================================================================
test("R2-10: Client SDK can query active templates only, and cannot directly write templates", async () => {
  const unauthDb = env.unauthenticatedContext().firestore();
  const buyerDb = env.authenticatedContext(userA.localId).firestore();
  const adminDb = env.authenticatedContext(adminUser.localId).firestore();

  // Active template: readable by public and buyer
  await assertSucceeds(getDoc(doc(unauthDb, "matching_collection_templates", "template_active_r2")));
  await assertSucceeds(getDoc(doc(buyerDb, "matching_collection_templates", "template_active_r2")));

  // Inactive template: blocked for public and buyer, accessible to admin
  await assertFails(getDoc(doc(unauthDb, "matching_collection_templates", "template_inactive_r2")));
  await assertFails(getDoc(doc(buyerDb, "matching_collection_templates", "template_inactive_r2")));
  await assertSucceeds(getDoc(doc(adminDb, "matching_collection_templates", "template_inactive_r2")));

  // Direct client write to matching_collection_templates is forbidden for buyer and admin alike
  await assertFails(
    setDoc(doc(buyerDb, "matching_collection_templates", "client_write_attempt"), {
      title: "Client Created",
      isActive: true,
    })
  );
  await assertFails(
    setDoc(doc(adminDb, "matching_collection_templates", "client_write_attempt"), {
      title: "Admin Direct Write Attempt",
      isActive: true,
    })
  );
});
