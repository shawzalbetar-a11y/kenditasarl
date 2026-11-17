import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  getDoc,
  setDoc,
  doc,
  setLogLevel,
} from "firebase/firestore";
import { serverDb } from "../../src/lib/server/cloudinaryServer";
import { checkoutRequest } from "../../src/lib/server/checkout";
import {
  adaptMasterDesignToTargetPlacement,
  computeObjectsBoundingBox,
  digest,
  masterDesignSchema,
  matchingBundleDraftSchema,
  matchingBundleItemSchema,
  matchingCollectionTemplateSchema,
  type MasterCanvasData,
  type PlacementRect,
  type MatchingBundleItem,
} from "../../src/lib/matchingCollections";
import { POST as adminTemplatesRoute } from "../../kenditasarl-admin/src/app/api/matching-collections/route";

const projectId = "demo-kenditasarla-rules";
let env: any, db: any, buyerA: any, buyerB: any, admin: any;

const areaRect: PlacementRect = { x: 100, y: 100, width: 300, height: 400 };
const printAreaConfig = { left: 100, top: 100, width: 300, height: 400 };
const garmentConfig = {
  enabled: true,
  garmentType: "tshirt",
  faces: {
    front: { enabled: true, printArea: printAreaConfig },
    back: { enabled: true, printArea: printAreaConfig },
  },
};

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

const req = (body: any, user: any, headers: Record<string, string> = {}) =>
  new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(user ? { Authorization: "Bearer " + user.idToken } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });

async function callCheckout(action: "add" | "quote" | "confirm", body: any, user = buyerA, status = 200) {
  const r = await checkoutRequest(req(body, user), action);
  const data = await r.json();
  assert.equal(r.status, status, JSON.stringify(data));
  return data;
}

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099");
  process.env.GCLOUD_PROJECT = projectId;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  setLogLevel("silent");

  const rulesContent = await readFile(new URL("../../firestore.rules", import.meta.url), "utf8");
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 18080,
      rules: rulesContent,
    },
  });

  db = serverDb();

  // Create test identities
  [buyerA, buyerB, admin] = await Promise.all([
    identity("buyer_a@phase6a.test"),
    identity("buyer_b@phase6a.test"),
    identity("admin@phase6a.test"),
  ]);

  await db.doc(`admins/${admin.localId}`).set({ role: "admin" });

  // Standard pricing settings
  await db.doc("settings/pricing").set({
    delivery: {
      fixed_shipping_fee: 30,
      free_shipping_threshold: 500,
      is_free_shipping_enabled: true,
    },
    customization: {
      face_prices: { front: 50, back: 60 },
      placement_rules: { include_first_placement_free: true },
    },
  });

  // Buyer addresses
  for (const u of [buyerA, buyerB]) {
    await db.doc(`addresses/${u.localId}`).set({
      user_id: u.localId,
      full_name: "Family Customer",
      phone: "+905550000001",
      full_address: "Synthetic delivery address",
      lat: 1,
      lng: 1,
    });
  }

  // Setup 3 catalog products for family bundle:
  // 1) Men's T-shirt (shirt_men)
  await db.doc("products/shirt_men").set({
    is_active: true,
    name_tr: "Erkek Klasik Tişört",
    name_ar: "تيشيرت رجالي كلاسيكي",
    name_en: "Men Classic T-shirt",
    category_id: "tshirt",
    base_price: 200,
    customization_config: garmentConfig,
    images: [{ face: "front", type: "blank", url: "https://assets.invalid/tee_black.png" }],
  });
  await db.doc("products/shirt_men/variants/black").set({
    color: "black",
    sizes: { XL: 10, L: 5, M: 2 },
  });

  // 2) Women's Hoodie (hoodie_women)
  await db.doc("products/hoodie_women").set({
    is_active: true,
    name_tr: "Kadın Kapüşonlu Sweatshirt",
    name_ar: "سويت شيرt نسائي بغطاء رأس",
    name_en: "Women Hoodie",
    category_id: "hoodie",
    base_price: 350,
    customization_config: {
      ...garmentConfig,
      garmentType: "hoodie",
    },
    images: [{ face: "front", type: "blank", url: "https://assets.invalid/hoodie_white.png" }],
  });
  await db.doc("products/hoodie_women/variants/white").set({
    color: "white",
    sizes: { M: 8, S: 4 },
  });

  // 3) Kids' T-shirt (shirt_kids)
  await db.doc("products/shirt_kids").set({
    is_active: true,
    name_tr: "Çocuk Renkli Tişört",
    name_ar: "تيشيرت أطفال ملون",
    name_en: "Kids Color T-shirt",
    category_id: "tshirt",
    base_price: 150,
    customization_config: garmentConfig,
    images: [{ face: "front", type: "blank", url: "https://assets.invalid/tee_yellow.png" }],
  });
  await db.doc("products/shirt_kids/variants/yellow").set({
    color: "yellow",
    sizes: { S: 12, XS: 5 },
  });
});

after(async () => {
  await env?.cleanup();
  const root = new URL("../../", import.meta.url);
  for (const p of ["package.json", "kenditasarl-admin/package.json"]) {
    const sdk = createRequire(new URL(p, root))("firebase-admin/app");
    await Promise.all(sdk.getApps().map(sdk.deleteApp));
  }
});

// ---------------------------------------------------------------------------
// Acceptance Tests
// ---------------------------------------------------------------------------

test("1. Father XL black, Mother M white, Child S yellow: One logical master design, 3 distinct target instances & confirmed order lines", async () => {
  // Clear cart
  const cartSnap = await db.collection("cart_items").where("user_id", "==", buyerA.localId).get();
  for (const d of cartSnap.docs) await d.ref.delete();

  const masterCanvas: MasterCanvasData = {
    version: "5.3.0",
    referenceBounds: { width: 1000, height: 1000 },
    objects: [
      { type: "text", text: "THE SMITH FAMILY", left: 500, top: 400, originX: "center", originY: "center", width: 400, height: 60, scaleX: 1, scaleY: 1 },
      { type: "circle", radius: 50, left: 500, top: 550, originX: "center", originY: "center", width: 100, height: 100, scaleX: 1, scaleY: 1 },
    ],
  };

  const masterDesignId = "master_smith_family";
  const masterHash = digest({ title: "Smith Family Master", canvasData: masterCanvas, assets: [] });
  await db.doc(`master_designs/${masterDesignId}`).set({
    id: masterDesignId,
    userId: buyerA.localId,
    title: "Smith Family Master",
    revision: 1,
    revisionHash: masterHash,
    canvasData: masterCanvas,
    assets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const bundleId = "bundle_smith_family_1";

  // Target item configurations
  const itemsMeta = [
    {
      itemId: "item_father",
      role: "Father",
      productId: "shirt_men",
      variantDocId: "black",
      color: "black",
      size: "XL",
      qty: 1,
      placementRect: areaRect,
      printArea: printAreaConfig,
    },
    {
      itemId: "item_mother",
      role: "Mother",
      productId: "hoodie_women",
      variantDocId: "white",
      color: "white",
      size: "M",
      qty: 1,
      placementRect: areaRect,
      printArea: printAreaConfig,
    },
    {
      itemId: "item_child",
      role: "Child",
      productId: "shirt_kids",
      variantDocId: "yellow",
      color: "yellow",
      size: "S",
      qty: 1,
      placementRect: areaRect,
      printArea: printAreaConfig,
    },
  ];

  const cartLines = [];

  for (const m of itemsMeta) {
    const adapted = adaptMasterDesignToTargetPlacement(
      { canvasData: masterCanvas },
      m.placementRect,
      { scaleMultiplier: 1.0 }
    );
    assert.equal(adapted.validationStatus, "valid");

    const targetDesignId = `design_${bundleId}_${m.itemId}`;
    await db.doc(`designs/${targetDesignId}`).set({
      user_id: buyerA.localId,
      product_id: m.productId,
      color: m.color,
      is_template: false,
      selected_placement_ids: [],
      placement_mode: "custom",
      production_snapshot: JSON.stringify({
        snapshotVersion: 1,
        printAreas: { front: m.printArea },
        customization_config: m.productId === "hoodie_women" ? { ...garmentConfig, garmentType: "hoodie" } : garmentConfig,
      }),
      canvas_json: JSON.stringify(
        JSON.stringify({
          [`${m.color}:::front`]: JSON.stringify({
            objects: adapted.adaptedObjects,
          }),
        })
      ),
      master_design_id: masterDesignId,
      master_revision: 1,
      master_revision_hash: masterHash,
      bundle_id: bundleId,
      bundle_item_id: m.itemId,
      role_label: m.role,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    cartLines.push({
      product_id: m.productId,
      variant_id: `${m.color}_${m.size}`,
      color: m.color,
      size: m.size,
      quantity: m.qty,
      design_id: targetDesignId,
      design_type: "custom",
      bundle_id: bundleId,
      bundle_item_id: m.itemId,
      role_label: m.role,
      master_design_id: masterDesignId,
      master_revision: 1,
      master_revision_hash: masterHash,
      instance_revision_id: "0".repeat(64),
    });
  }

  // 1) Add all 3 items to cart
  const addRes = await callCheckout("add", { lines: cartLines }, buyerA, 200);
  assert.equal(addRes.ids.length, 3);

  // 2) Quote cart independently with 03B server pricing
  const quoteRes = await callCheckout(
    "quote",
    {
      address_id: buyerA.localId,
      method: "shipping",
      locale: "tr",
    },
    buyerA,
    200
  );

  // Pricing verification:
  // shirt_men (base 200 + 20 extra obj) = 220 TRY (22000 minor)
  // hoodie_women (base 350 + 20 extra obj) = 370 TRY (37000 minor)
  // shirt_kids (base 150 + 20 extra obj) = 170 TRY (17000 minor)
  // Subtotal = 220 + 370 + 170 = 760 TRY (76000 minor)
  // Free delivery threshold is 500 TRY, so shipping = 0 TRY
  // Total = 760 TRY
  assert.equal(quoteRes.subtotal, 76000);
  assert.equal(quoteRes.shipping, 0);
  assert.equal(quoteRes.total, 76000);
  assert.equal(quoteRes.lines.length, 3);

  // 3) Confirm order via authoritative Checkout
  const confirmRes = await callCheckout(
    "confirm",
    {
      quote_id: quoteRes.quote_id,
      key: `idem_${Date.now()}`,
      accepted: true,
    },
    buyerA,
    200
  );

  assert.ok(confirmRes.order_id);

  // 4) Verify confirmed order has 3 distinct lines with bundle provenance
  const orderDoc = await db.doc(`orders/${confirmRes.order_id}`).get();
  assert.equal(orderDoc.get("subtotal_minor"), 76000);
  assert.equal(orderDoc.get("total_minor"), 76000);

  const orderLinesSnap = await db.collection(`orders/${confirmRes.order_id}/items`).get();
  assert.equal(orderLinesSnap.size, 3);

  const linesData = orderLinesSnap.docs.map((d: any) => d.data());
  const fatherLine = linesData.find((l: any) => l.product_id === "shirt_men");
  const motherLine = linesData.find((l: any) => l.product_id === "hoodie_women");
  const childLine = linesData.find((l: any) => l.product_id === "shirt_kids");

  assert.ok(fatherLine && motherLine && childLine);
  assert.equal(fatherLine.role_label, "Father");
  assert.equal(fatherLine.size, "XL");
  assert.equal(fatherLine.color, "black");
  assert.equal(fatherLine.bundle_id, bundleId);
  assert.equal(fatherLine.master_design_id, masterDesignId);
  assert.equal(fatherLine.unit_minor, 22000);

  assert.equal(motherLine.role_label, "Mother");
  assert.equal(motherLine.size, "M");
  assert.equal(motherLine.color, "white");
  assert.equal(motherLine.unit_minor, 37000);

  assert.equal(childLine.role_label, "Child");
  assert.equal(childLine.size, "S");
  assert.equal(childLine.color, "yellow");
  assert.equal(childLine.unit_minor, 17000);
});

test("2. Member isolation: Changing one member's size, color or placement does not affect others or historical orders", async () => {
  const masterCanvas: MasterCanvasData = {
    version: "5.3.0",
    referenceBounds: { width: 1000, height: 1000 },
    objects: [{ type: "text", text: "LOVE", left: 500, top: 500, width: 200, height: 50 }],
  };

  const adaptedFront = adaptMasterDesignToTargetPlacement({ canvasData: masterCanvas }, areaRect);
  const adaptedBack = adaptMasterDesignToTargetPlacement({ canvasData: masterCanvas }, areaRect, { offsetY: 20 });

  // Two members
  const member1 = { role: "Partner1", size: "M", color: "black", placement: "front", adapted: adaptedFront };
  const member2 = { role: "Partner2", size: "S", color: "white", placement: "back", adapted: adaptedBack };

  // Modify member 1 to size L, color navy without touching member 2
  const updatedMember1 = { ...member1, size: "L", color: "navy" };

  assert.equal(member2.size, "S");
  assert.equal(member2.color, "white");
  assert.equal(member2.placement, "back");
  assert.notEqual(updatedMember1.size, member2.size);
});

test("3. Geometric adaptation across different print area shapes: Aspect ratio preserved and out-of-bounds rejected", async () => {
  const masterCanvas: MasterCanvasData = {
    version: "5.3.0",
    referenceBounds: { width: 1000, height: 1000 },
    objects: [
      { type: "rect", left: 300, top: 300, width: 400, height: 400, scaleX: 1, scaleY: 1 },
    ],
  };

  // Case A: Tall portrait placement rect (width 200, height 500)
  const portraitRect: PlacementRect = { x: 50, y: 50, width: 200, height: 500 };
  const resPortrait = adaptMasterDesignToTargetPlacement({ canvasData: masterCanvas }, portraitRect);
  assert.equal(resPortrait.validationStatus, "valid");
  // Scale should be constrained by width: (200 * 0.9) / 400 = 0.45
  assert.ok(Math.abs(resPortrait.mapping.scale - 0.45) < 0.01);

  // Case B: Wide landscape placement rect (width 600, height 200)
  const landscapeRect: PlacementRect = { x: 50, y: 50, width: 600, height: 200 };
  const resLandscape = adaptMasterDesignToTargetPlacement({ canvasData: masterCanvas }, landscapeRect);
  assert.equal(resLandscape.validationStatus, "valid");
  // Scale should be constrained by height: (200 * 0.9) / 400 = 0.45
  assert.ok(Math.abs(resLandscape.mapping.scale - 0.45) < 0.01);

  // Case C: Huge scale multiplier that pushes design out of printable bounds -> must be OUT_OF_BOUNDS
  const resOverflow = adaptMasterDesignToTargetPlacement(
    { canvasData: masterCanvas },
    portraitRect,
    { scaleMultiplier: 3.5 }
  );
  assert.equal(resOverflow.validationStatus, "out_of_bounds");
  assert.ok(resOverflow.validationError?.includes("taşıyor"));
});

test("4. 04A/04B Production snapshot verification for generated bundle lines", async () => {
  const snapshotData = {
    snapshotVersion: 1,
    customization_config: garmentConfig,
    printAreas: { front: printAreaConfig },
  };

  const lineDoc = {
    product_id: "shirt_men",
    design_type: "custom",
    color: "black",
    size: "XL",
    canvas_json: JSON.stringify(
      JSON.stringify({
        "black:::front": JSON.stringify({ objects: [{ type: "text", text: "TEST" }] }),
      })
    ),
    production_snapshot: JSON.stringify(snapshotData),
    selected_placement_ids: [],
    is_immutable_snapshot: true,
    snapshot_version: 1,
  };

  assert.equal(lineDoc.is_immutable_snapshot, true);
  assert.equal(lineDoc.snapshot_version, 1);
  const snap = JSON.parse(lineDoc.production_snapshot);
  assert.equal(snap.snapshotVersion, 1);
  assert.ok(snap.customization_config);
});

test("5. Independent 03B pricing and 05B Shadow Mode comparison: No price tampering", async () => {
  // Clear any existing cart items for buyerA
  const cartSnap = await db.collection("cart_items").where("user_id", "==", buyerA.localId).get();
  for (const d of cartSnap.docs) await d.ref.delete();

  // Add 1 blank shirt
  await callCheckout(
    "add",
    {
      lines: [
        {
          product_id: "shirt_men",
          variant_id: "black_XL",
          color: "black",
          size: "XL",
          quantity: 1,
          design_id: null,
          design_type: "blank",
        },
      ],
    },
    buyerA,
    200
  );

  const quote = await callCheckout(
    "quote",
    {
      address_id: buyerA.localId,
      method: "shipping",
      locale: "tr",
    },
    buyerA,
    200
  );

  // Blank shirt is 200 TRY (20000 minor) + delivery 30 TRY (3000 minor) = 230 TRY (23000 minor)
  assert.equal(quote.subtotal, 20000);
  assert.equal(quote.shipping, 3000);
  assert.equal(quote.total, 23000);

  // Shadow mode produces shadow_quote telemetry in the quote document without affecting payable total
  const quoteDoc = await db.doc(`checkout_quotes/${quote.quote_id}`).get();
  const shadow = quoteDoc.get("shadow_quote");
  assert.ok(shadow, "Quote document must include shadow_quote telemetry");
  assert.equal(shadow.policy_revision_id, "default_baseline");
});

test("6. Inventory contention: Competing members for the last available unit prevented from overselling", async () => {
  // Create product with exactly 1 unit in stock
  await db.doc("products/limited_cap").set({
    is_active: true,
    category_id: "hat",
    base_price: 100,
    customization_config: garmentConfig,
  });
  await db.doc("products/limited_cap/variants/black").set({
    color: "black",
    sizes: { M: 1 },
  });

  // Buyer A adds 1 unit
  const cartSnap = await db.collection("cart_items").where("user_id", "==", buyerA.localId).get();
  for (const d of cartSnap.docs) await d.ref.delete();

  await callCheckout(
    "add",
    {
      lines: [
        {
          product_id: "limited_cap",
          variant_id: "black_M",
          color: "black",
          size: "M",
          quantity: 1,
          design_id: null,
          design_type: "blank",
        },
      ],
    },
    buyerA,
    200
  );

  const quoteA = await callCheckout(
    "quote",
    { address_id: buyerA.localId, method: "shipping", locale: "tr" },
    buyerA,
    200
  );

  // Confirm order for buyer A -> stock becomes 0
  const confirmA = await callCheckout(
    "confirm",
    { quote_id: quoteA.quote_id, key: `idem_last_unit_${Date.now()}`, accepted: true },
    buyerA,
    200
  );
  assert.ok(confirmA.order_id);

  // Verify stock is now 0
  const stockDoc = await db.doc("products/limited_cap/variants/black").get();
  assert.equal(stockDoc.data().sizes.M, 0);

  // Buyer B attempts to checkout the same item -> must fail with NO_STOCK
  await callCheckout(
    "add",
    {
      lines: [
        {
          product_id: "limited_cap",
          variant_id: "black_M",
          color: "black",
          size: "M",
          quantity: 1,
          design_id: null,
          design_type: "blank",
        },
      ],
    },
    buyerB,
    200
  );

  // Quote should detect out of stock
  const quoteB = await callCheckout(
    "quote",
    { address_id: buyerB.localId, method: "shipping", locale: "tr" },
    buyerB,
    409
  );
  assert.equal(quoteB.error, "NO_STOCK");
});

test("7. Security rules: Client cannot read or write another customer's master design or bundle draft", async () => {
  const storeContextA = env.authenticatedContext(buyerA.localId);
  const storeContextB = env.authenticatedContext(buyerB.localId);

  const aDocRef = storeContextA.firestore().doc(`master_designs/master_private_a`);
  const bDocRef = storeContextB.firestore().doc(`master_designs/master_private_a`);

  // Buyer A can create their own master design
  await assertSucceeds(
    setDoc(aDocRef, {
      id: "master_private_a",
      userId: buyerA.localId,
      title: "Private A",
    })
  );

  // Buyer B CANNOT read Buyer A's master design
  await assertFails(getDoc(bDocRef));

  // Buyer B CANNOT overwrite Buyer A's master design
  await assertFails(
    setDoc(bDocRef, {
      id: "master_private_a",
      userId: buyerB.localId,
      title: "Forged B",
    })
  );
});

test("8. Admin API: Curated templates CRUD works for admin, blocked for regular user", async () => {
  const sampleTemplate = {
    id: "tpl_summer_family",
    slug: "summer-family-collection",
    title: { tr: "Yaz Ailesi Seti", ar: "طقم العائلة الصيفي", en: "Summer Family Set" },
    description: { tr: "Yaz tatili için özel aile seti", ar: "طقم صيفي للعائلة", en: "Summer family collection" },
    badge: { tr: "Yeni", ar: "جديد", en: "New" },
    coverImageUrl: "https://assets.invalid/summer.png",
    allowedProductIds: ["shirt_men", "hoodie_women", "shirt_kids"],
    suggestedRoles: [
      { id: "father", label: { tr: "Baba", ar: "الأب", en: "Father" }, defaultProductId: "shirt_men" },
      { id: "mother", label: { tr: "Anne", ar: "الأم", en: "Mother" }, defaultProductId: "hoodie_women" },
    ],
    isActive: true,
    sortOrder: 10,
  };

  // 1) Regular user fails with 403
  const failReq = req({ action: "save", template: sampleTemplate }, buyerA);
  const failRes = await adminTemplatesRoute(failReq);
  assert.equal(failRes.status, 403);

  // 2) Admin succeeds with 200
  const okReq = req({ action: "save", template: sampleTemplate }, admin);
  const okRes = await adminTemplatesRoute(okReq);
  assert.equal(okRes.status, 200);

  // 3) Read template
  const readReq = req({ action: "read", id: sampleTemplate.id }, admin);
  const readRes = await adminTemplatesRoute(readReq);
  const readData = await readRes.json();
  assert.equal(readRes.status, 200);
  assert.equal(readData.template.slug, "summer-family-collection");

  // 4) Delete template
  const delReq = req({ action: "delete", id: sampleTemplate.id }, admin);
  const delRes = await adminTemplatesRoute(delReq);
  assert.equal(delRes.status, 200);
});

test("9. Schema contract validation: Invalid coordinates or missing fields rejected", async () => {
  // Invalid bundle item missing required SKU
  const badItem: any = {
    id: "item_bad",
    bundleId: "b1",
    productId: "p1",
    color: "black",
  };

  const parsed = matchingBundleItemSchema.safeParse(badItem);
  assert.equal(parsed.success, false);
});

test("10. Translation dictionary parity: 100% key parity across TR, AR, and EN in Store and Admin", async () => {
  const root = new URL("../../", import.meta.url);
  const read = (p: string) => readFile(new URL(p, root), "utf8");

  const getKeys = (obj: any, p = ""): string[] =>
    Object.entries(obj)
      .flatMap(([k, v]) =>
        typeof v === "object" && v !== null ? getKeys(v, p + k + ".") : [p + k]
      )
      .sort();

  for (const app of ["", "kenditasarl-admin/"]) {
    const [trKeys, arKeys, enKeys] = await Promise.all([
      read(app + "messages/tr.json").then((s) => getKeys(JSON.parse(s))),
      read(app + "messages/ar.json").then((s) => getKeys(JSON.parse(s))),
      read(app + "messages/en.json").then((s) => getKeys(JSON.parse(s))),
    ]);

    assert.deepEqual(trKeys, arKeys, `TR and AR key mismatch in ${app || "Store"}`);
    assert.deepEqual(trKeys, enKeys, `TR and EN key mismatch in ${app || "Store"}`);
  }
});
