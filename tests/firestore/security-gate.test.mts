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
  deleteDoc,
  doc,
  collection,
  getDocs,
  setLogLevel,
} from "firebase/firestore";
import { serverDb } from "../../src/lib/server/cloudinaryServer";
import {
  adaptMasterDesignToTargetPlacement,
  computeObjectsBoundingBox,
  type MasterCanvasData,
  type PlacementRect,
  type MatchingBundleItem,
} from "../../src/lib/matchingCollections";
import { POST as adminTemplatesRoute, GET as adminTemplatesGetRoute } from "../../kenditasarl-admin/src/app/api/matching-collections/route";
import { POST as bundleAddToCartRoute } from "../../src/app/api/matching-bundles/[id]/add-to-cart/route";

const projectId = "demo-kenditasarla-rules";
let env: any, db: any, buyerA: any, buyerB: any, adminUser: any, superAdminUser: any, invalidRoleUser: any;

async function identity(email: string) {
  const r = await fetch(
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
  buyerA = await identity("gate_buyer_a@example.com");
  buyerB = await identity("gate_buyer_b@example.com");
  adminUser = await identity("gate_admin@example.com");
  superAdminUser = await identity("gate_superadmin@example.com");
  invalidRoleUser = await identity("gate_invalid_role@example.com");

  // Canonical admin authorization setup in admins/{uid}
  await db.doc(`admins/${adminUser.localId}`).set({ role: "admin", createdAt: new Date().toISOString() });
  await db.doc(`admins/${superAdminUser.localId}`).set({ role: "superadmin", createdAt: new Date().toISOString() });
  await db.doc(`admins/${invalidRoleUser.localId}`).set({ role: "customer", createdAt: new Date().toISOString() });

  // Curated templates: one active, one inactive
  await db.doc("matching_collection_templates/active_family").set({
    id: "active_family",
    slug: "active-family",
    title: { tr: "Aktif Aile", ar: "عائلة نشطة", en: "Active Family" },
    description: { tr: "Açıklama", ar: "وصف", en: "Description" },
    coverImageUrl: "https://example.com/cover1.png",
    allowedProductIds: ["synth_tee"],
    suggestedRoles: [{ id: "parent", label: { tr: "Ebeveyn", ar: "والد", en: "Parent" } }],
    sortOrder: 1,
    isActive: true,
  });

  await db.doc("matching_collection_templates/inactive_draft").set({
    id: "inactive_draft",
    slug: "inactive-draft",
    title: { tr: "Taslak Set", ar: "مجموعة مسودة", en: "Draft Set" },
    description: { tr: "Açıklama", ar: "وصف", en: "Description" },
    coverImageUrl: "https://example.com/cover2.png",
    allowedProductIds: ["synth_tee"],
    suggestedRoles: [{ id: "member", label: { tr: "Üye", ar: "عضو", en: "Member" } }],
    sortOrder: 2,
    isActive: false,
  });

  // Standard pricing settings
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
  await db.doc("products/synth_tee").set({
    is_active: true,
    name_tr: "Örnek Tişört",
    name_ar: "تيشيرت تجريبي",
    name_en: "Sample Tee",
    base_price: 200,
    category_id: "tshirt",
    images: [{ face: "front", type: "blank", url: "https://assets.invalid/synth_tee_black.png" }],
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

  await db.doc("products/synth_tee/variants/black").set({
    color: "black",
    sizes: { XL: 10 },
  });
});

after(async () => {
  await env?.cleanup();
});

// ============================================================================
// GATE A: Canonical Admin Authorization
// ============================================================================

test("Gate A1: Anonymous client cannot read admin documents or call admin API", async () => {
  const unauthDb = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(unauthDb, "admins", adminUser.localId)));

  const req = new Request("http://localhost/api/matching-collections", {
    method: "GET",
  });
  const res = await adminTemplatesGetRoute(req);
  assert.equal(res.status, 401);
});

test("Gate A2: Regular user cannot write to admins collection or call admin API", async () => {
  const buyerDb = env.authenticatedContext(buyerA.localId).firestore();
  await assertFails(setDoc(doc(buyerDb, "admins", buyerA.localId), { role: "admin" }));

  const req = new Request("http://localhost/api/matching-collections", {
    method: "GET",
    headers: { authorization: `Bearer ${buyerA.idToken}` },
  });
  const res = await adminTemplatesGetRoute(req);
  assert.equal(res.status, 403);
});

test("Gate A3: User with forged custom claims or invalid role is rejected", async () => {
  const forgedDb = env.authenticatedContext("forged_user", { role: "superadmin", admin: true }).firestore();
  await assertFails(setDoc(doc(forgedDb, "matching_collection_templates/forged"), { isActive: true }));

  const req = new Request("http://localhost/api/matching-collections", {
    method: "GET",
    headers: { authorization: `Bearer ${invalidRoleUser.idToken}` },
  });
  const res = await adminTemplatesGetRoute(req);
  assert.equal(res.status, 403);
});

test("Gate A4: Authorized admin and superadmin in admins/{uid} succeed", async () => {
  const adminDb = env.authenticatedContext(adminUser.localId).firestore();
  const superDb = env.authenticatedContext(superAdminUser.localId).firestore();

  // Admin can read admin doc
  await assertSucceeds(getDoc(doc(adminDb, "admins", adminUser.localId)));
  await assertSucceeds(getDoc(doc(superDb, "admins", superAdminUser.localId)));

  // Admin API call succeeds
  const req = new Request("http://localhost/api/matching-collections", {
    method: "GET",
    headers: { authorization: `Bearer ${adminUser.idToken}` },
  });
  const res = await adminTemplatesGetRoute(req);
  assert.equal(res.status, 200);
});

// ============================================================================
// GATE B: Firestore Rules, Curated Templates & Item Isolation
// ============================================================================

test("Gate B1: Active curated template is public; Inactive template is restricted to admin", async () => {
  const unauthDb = env.unauthenticatedContext().firestore();
  const buyerDb = env.authenticatedContext(buyerA.localId).firestore();
  const adminDb = env.authenticatedContext(adminUser.localId).firestore();

  // Active template: readable by public and buyer
  await assertSucceeds(getDoc(doc(unauthDb, "matching_collection_templates", "active_family")));
  await assertSucceeds(getDoc(doc(buyerDb, "matching_collection_templates", "active_family")));

  // Inactive template: blocked for public and buyer
  await assertFails(getDoc(doc(unauthDb, "matching_collection_templates", "inactive_draft")));
  await assertFails(getDoc(doc(buyerDb, "matching_collection_templates", "inactive_draft")));

  // Inactive template: readable by admin
  await assertSucceeds(getDoc(doc(adminDb, "matching_collection_templates", "inactive_draft")));
});

test("Gate B2: Direct client write to matching_collection_templates is rejected", async () => {
  const buyerDb = env.authenticatedContext(buyerA.localId).firestore();
  await assertFails(
    setDoc(doc(buyerDb, "matching_collection_templates", "malicious_template"), {
      id: "malicious_template",
      isActive: true,
    })
  );
});

test("Gate B3: Nested bundle items cannot be created under nonexistent or foreign bundle draft", async () => {
  const buyerDb = env.authenticatedContext(buyerA.localId).firestore();

  // Nonexistent parent draft
  await assertFails(
    setDoc(doc(buyerDb, "matching_bundle_drafts/nonexistent_draft/items/item_1"), {
      productId: "synth_tee",
    })
  );

  // Foreign parent draft (Buyer A creating under Buyer B's draft)
  await db.doc("matching_bundle_drafts/draft_of_buyer_b").set({
    userId: buyerB.localId,
    title: "Buyer B Set",
  });

  await assertFails(
    setDoc(doc(buyerDb, "matching_bundle_drafts/draft_of_buyer_b/items/item_hacked"), {
      productId: "synth_tee",
    })
  );
});

test("Gate B4: Master design and bundle draft ownership userId cannot be mutated on update", async () => {
  const buyerDb = env.authenticatedContext(buyerA.localId).firestore();

  await db.doc("master_designs/master_immutable_uid").set({
    id: "master_immutable_uid",
    userId: buyerA.localId,
    title: "Initial Title",
  });

  // Attempting to change userId to Buyer B
  await assertFails(
    updateDoc(doc(buyerDb, "master_designs/master_immutable_uid"), {
      userId: buyerB.localId,
    })
  );

  // Updating own allowed fields succeeds
  await assertSucceeds(
    updateDoc(doc(buyerDb, "master_designs/master_immutable_uid"), {
      title: "Updated Title",
    })
  );
});

// ============================================================================
// GATE C: Bundle-to-Cart Correctness, Idempotency & Fabric Transforms
// ============================================================================

test("Gate C1: Fabric rotation bounding box calculation detects out-of-bounds correctly", () => {
  const placement: PlacementRect = { x: 100, y: 100, width: 300, height: 400 };

  // Square 200x200 unrotated at center (250, 300) fits easily in (100, 100, 300, 400)
  const unrotatedBox = computeObjectsBoundingBox([
    { type: "rect", left: 250, top: 300, width: 200, height: 200, originX: "center", originY: "center", angle: 0 },
  ]);
  assert.equal(unrotatedBox.width, 200);
  assert.equal(unrotatedBox.height, 200);

  // When rotated 45 degrees, diagonal = 200 * sqrt(2) ~= 282.84
  const rotatedBox = computeObjectsBoundingBox([
    { type: "rect", left: 250, top: 300, width: 200, height: 200, originX: "center", originY: "center", angle: 45 },
  ]);
  assert(rotatedBox.width > 280 && rotatedBox.width < 285);
  assert(rotatedBox.height > 280 && rotatedBox.height < 285);

  // Adaptation engine strictly prevents out-of-bounds on rotated artwork
  const masterCanvasRotated: MasterCanvasData = {
    version: "5.3.0",
    referenceBounds: { width: 1000, height: 1000 },
    objects: [
      { type: "rect", left: 500, top: 500, width: 900, height: 900, originX: "center", originY: "center", angle: 45 },
    ],
  };

  const adapted = adaptMasterDesignToTargetPlacement({ canvasData: masterCanvasRotated }, placement, {
    scaleMultiplier: 1.5, // Force oversize
  });
  assert.equal(adapted.validationStatus, "out_of_bounds");
});

test("Gate C2: Add-to-cart rejects stale master revision or stolen master design", async () => {
  // Create master design owned by Buyer B
  await db.doc("master_designs/master_foreign_gate").set({
    id: "master_foreign_gate",
    userId: buyerB.localId,
    revision: 1,
    revisionHash: "0".repeat(64),
    title: "Buyer B Art",
  });

  // Buyer A draft trying to reference Buyer B's master design
  await db.doc("matching_bundle_drafts/draft_stolen").set({
    id: "draft_stolen",
    userId: buyerA.localId,
    masterDesignId: "master_foreign_gate",
    masterRevision: 1,
    masterRevisionHash: "0".repeat(64),
    status: "draft",
  });

  const reqStolen = new Request("http://localhost/api/matching-bundles/draft_stolen/add-to-cart", {
    method: "POST",
    headers: { authorization: `Bearer ${buyerA.idToken}` },
  });
  const resStolen = await bundleAddToCartRoute(reqStolen, { params: { id: "draft_stolen" } });
  assert.equal(resStolen.status, 403);

  // Master design owned by Buyer A but with stale revision
  await db.doc("master_designs/master_stale_gate").set({
    id: "master_stale_gate",
    userId: buyerA.localId,
    revision: 2, // Incremented to 2
    revisionHash: "1".repeat(64),
    title: "Buyer A Art",
  });

  await db.doc("matching_bundle_drafts/draft_stale").set({
    id: "draft_stale",
    userId: buyerA.localId,
    masterDesignId: "master_stale_gate",
    masterRevision: 1, // Still points to 1
    masterRevisionHash: "0".repeat(64),
    status: "draft",
  });

  const reqStale = new Request("http://localhost/api/matching-bundles/draft_stale/add-to-cart", {
    method: "POST",
    headers: { authorization: `Bearer ${buyerA.idToken}` },
  });
  const resStale = await bundleAddToCartRoute(reqStale, { params: { id: "draft_stale" } });
  assert.equal(resStale.status, 409);
});

test("Gate C3: Concurrent / duplicate add-to-cart is idempotent and does not duplicate cart lines", async () => {
  // Valid master design
  await db.doc("master_designs/master_valid_gate").set({
    id: "master_valid_gate",
    userId: buyerA.localId,
    revision: 1,
    revisionHash: "0".repeat(64),
    title: "Valid Master",
  });

  const draftRef = db.doc("matching_bundle_drafts/draft_idempotent");
  await draftRef.set({
    id: "draft_idempotent",
    userId: buyerA.localId,
    masterDesignId: "master_valid_gate",
    masterRevision: 1,
    masterRevisionHash: "0".repeat(64),
    status: "draft",
  });

  const item: MatchingBundleItem = {
    id: "item_idem_1",
    bundleId: "draft_idempotent",
    roleLabel: "Baba",
    productId: "synth_tee",
    productTitle: "Örnek Tişört",
    variantId: "black_XL",
    variantDocId: "black",
    sku: "synth_tee_black_XL",
    color: "black",
    size: "XL",
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
          text: "Gate Family",
          left: 150,
          top: 150,
          width: 100,
          height: 40,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
          originX: "left",
          originY: "top",
          fontSize: 24,
          fill: "#111827",
        },
      ],
    }),
    validationStatus: "valid",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await draftRef.collection("items").doc("item_idem_1").set(item);

  const idempotencyKey = "idem_key_synth_999";

  // First request: adds to cart
  const req1 = new Request("http://localhost/api/matching-bundles/draft_idempotent/add-to-cart", {
    method: "POST",
    headers: {
      authorization: `Bearer ${buyerA.idToken}`,
      "x-idempotency-key": idempotencyKey,
    },
  });
  const res1 = await bundleAddToCartRoute(req1, { params: { id: "draft_idempotent" } });
  const data1 = await res1.json();
  assert.equal(res1.status, 200, JSON.stringify(data1));
  assert.equal(data1.ok, true);
  assert.equal(data1.itemCount, 1);
  const firstCartItemIds = data1.cartItemIds;

  // Second duplicate request with identical idempotency key: must replay without duplicating
  const req2 = new Request("http://localhost/api/matching-bundles/draft_idempotent/add-to-cart", {
    method: "POST",
    headers: {
      authorization: `Bearer ${buyerA.idToken}`,
      "x-idempotency-key": idempotencyKey,
    },
  });
  const res2 = await bundleAddToCartRoute(req2, { params: { id: "draft_idempotent" } });
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.ok, true);
  assert.equal(data2.idempotentReplay, true);
  assert.deepEqual(data2.cartItemIds, firstCartItemIds);
});
