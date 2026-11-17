import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  collection,
} from "firebase/firestore";
import { POST as pricingPolicyRoute } from "../../kenditasarl-admin/src/app/api/pricing-policies/route";
import { serverDb } from "../../src/lib/server/cloudinaryServer";
import { checkoutRequest } from "../../src/lib/server/checkout";
import {
  calculateVersionedPrice,
  getDefaultPricingPolicy,
  hashPolicyDefinition,
  validatePricingPolicy,
  type PricingPolicyDefinition,
  type CartLineForPricing,
} from "../../src/lib/versionedPricing";

const projectId = "demo-kenditasarla-rules";
let env: any;
let db: any;
let adminUser: any;
let customerUser: any;
let secondAdminUser: any;

async function identity(label: string) {
  const r = await fetch(
    "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: label + "@phase5b.invalid",
        password: "synthetic-only-password",
        returnSecureToken: true,
      }),
    },
  );
  assert.equal(r.status, 200);
  return r.json();
}

const req = (u: any, b: any) =>
  new Request("http://localhost/api/pricing-policies", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(u ? { Authorization: "Bearer " + u.idToken } : {}),
    },
    body: JSON.stringify(b),
  });

async function api(body: any, user = adminUser, expectedStatus = 200) {
  const res = await pricingPolicyRoute(req(user, body));
  const data = await res.json();
  assert.equal(
    res.status,
    expectedStatus,
    `API call failed. Expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(data)}`,
  );
  return data;
}

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099");
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = process.env.GCLOUD_PROJECT;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 18080,
      rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
    },
  });

  adminUser = await identity("pricing-admin");
  secondAdminUser = await identity("pricing-admin-2");
  customerUser = await identity("pricing-customer");

  db = serverDb();

  // Seed Admin roles in Firestore admins collection
  await env.withSecurityRulesDisabled(async (context: any) => {
    const sdb = context.firestore();
    await setDoc(doc(sdb, `admins/${adminUser.localId}`), {
      email: adminUser.email,
      role: "admin",
    });
    await setDoc(doc(sdb, `admins/${secondAdminUser.localId}`), {
      email: secondAdminUser.email,
      role: "admin",
    });
  });
});

after(async () => {
  await env?.cleanup();
});

// ============================================================================
// 1. PURE ENGINE CONTRACT TESTS: blank, ready, custom
// ============================================================================

test("1. Commercial contract BLANK: base product/variant price only, zero placement and zero asset fees", () => {
  const policy = getDefaultPricingPolicy();
  const line: CartLineForPricing = {
    productId: "shirt_classic",
    variantId: "white_L",
    designType: "blank",
    basePriceMinor: 25000, // 250.00 TRY
    quantity: 2,
    selectedPlacementIds: ["full_front", "full_back"], // Even if passed, MUST BE IGNORED for blank
    assets: [{ id: "sticker_1", priceMinor: 1500 }], // MUST BE IGNORED for blank
  };

  const result = calculateVersionedPrice([line], policy);
  assert.equal(result.lines.length, 1);
  const l = result.lines[0];
  assert.equal(l.designType, "blank");
  assert.equal(l.breakdown.baseMinor, 25000);
  assert.equal(l.breakdown.placementsMinor, 0);
  assert.equal(l.breakdown.placementItems.length, 0);
  assert.equal(l.breakdown.assetsMinor, 0);
  assert.equal(l.breakdown.assetItems.length, 0);
  assert.equal(l.totalMinor, 50000); // 250.00 * 2 = 500.00 TRY (50000 minor)
  assert.equal(l.unitMinor, 25000);
});

test("2. Commercial contract READY: declared ready-made price with embedded print fees; NEVER duplicates print or asset fees", () => {
  const policy = getDefaultPricingPolicy();
  const line: CartLineForPricing = {
    productId: "hoodie_ready",
    variantId: "black_XL",
    designType: "ready",
    basePriceMinor: 35000, // Blank base is 350 TRY
    readyPriceMinor: 48000, // Declared ready-made price is 480.00 TRY
    quantity: 1,
    selectedPlacementIds: ["full_front"], // Already embedded in ready price
    assets: [{ id: "ready_artwork_1", priceMinor: 5000 }], // Already embedded in ready price
  };

  const result = calculateVersionedPrice([line], policy);
  assert.equal(result.lines.length, 1);
  const l = result.lines[0];
  assert.equal(l.designType, "ready");
  assert.equal(l.breakdown.baseMinor, 48000); // Uses declared ready price
  assert.equal(l.breakdown.placementsMinor, 0, "Ready-made products must NOT charge additional placement fees");
  assert.equal(l.breakdown.assetsMinor, 0, "Ready-made products must NOT charge additional design asset fees");
  assert.equal(l.totalMinor, 48000);
  assert.equal(l.unitMinor, 48000);
});

test("3. Commercial contract CUSTOM: base + placement fees actually used + authorized paid asset fees", () => {
  const policy = getDefaultPricingPolicy();
  const line: CartLineForPricing = {
    productId: "shirt_classic",
    variantId: "black_M",
    designType: "custom",
    basePriceMinor: 20000, // 200.00 TRY
    quantity: 1,
    selectedPlacementIds: ["left_chest", "full_back"],
    assets: [
      { id: "free_clipart", priceMinor: 0 },
      { id: "paid_skull_art", priceMinor: 1500 }, // 15.00 TRY
    ],
  };

  const result = calculateVersionedPrice([line], policy);
  assert.equal(result.lines.length, 1);
  const l = result.lines[0];
  assert.equal(l.designType, "custom");
  assert.equal(l.breakdown.baseMinor, 20000);
  // First placement (left_chest) is free in default policy -> 0
  // Second placement (full_back) rule is 35.00 TRY -> 3500 minor
  assert.equal(l.breakdown.placementsMinor, 3500);
  assert.equal(l.breakdown.placementItems.length, 2);
  assert.equal(l.breakdown.placementItems[0].minor, 0); // first free
  assert.equal(l.breakdown.placementItems[1].minor, 3500); // full_back
  assert.equal(l.breakdown.assetsMinor, 1500);
  // Total: 200.00 + 35.00 + 15.00 = 250.00 TRY = 25000 minor
  assert.equal(l.totalMinor, 25000);
});

// ============================================================================
// 2. 03B REGRESSION TEST: Red front-only = 200 TRY, Blue front+back = 235 TRY -> Sum = 435 TRY
// ============================================================================

test("4. 03B regression test: Red front-only (200 TRY) and Blue front+back (235 TRY) -> Total 435 TRY (43,500 minor)", () => {
  const policy = getDefaultPricingPolicy();
  const lines: CartLineForPricing[] = [
    {
      lineId: "cart_red",
      productId: "shirt",
      variantId: "red_M",
      designType: "custom",
      basePriceMinor: 20000, // 200.00 TRY
      quantity: 1,
      selectedPlacementIds: ["left_chest"], // First placement free -> 0
    },
    {
      lineId: "cart_blue",
      productId: "shirt",
      variantId: "blue_M",
      designType: "custom",
      basePriceMinor: 20000, // 200.00 TRY
      quantity: 1,
      selectedPlacementIds: ["left_chest", "full_back"], // first free (0) + back (3500)
    },
  ];

  const result = calculateVersionedPrice(lines, policy);
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0].totalMinor, 20000, "Red shirt front-only must be exactly 200.00 TRY (20000 minor)");
  assert.equal(result.lines[1].totalMinor, 23500, "Blue shirt front+back must be exactly 235.00 TRY (23500 minor)");
  assert.equal(result.subtotalMinor, 43500, "Combined subtotal must be exactly 435.00 TRY (43500 minor)");
});

// ============================================================================
// 3. ASSET PRICING & SCOPE TESTS (PER_DESIGN_INSTANCE vs PER_UNIT)
// ============================================================================

test("5. Paid asset with PER_DESIGN_INSTANCE charges once even if placed on multiple faces or layers", () => {
  const policy = getDefaultPricingPolicy();
  const line: CartLineForPricing = {
    productId: "shirt",
    variantId: "white_M",
    designType: "custom",
    basePriceMinor: 20000,
    quantity: 1,
    selectedPlacementIds: ["left_chest", "full_back"],
    assets: [
      { id: "gold_crest", face: "front", placementId: "left_chest", priceMinor: 2000 },
      { id: "gold_crest", face: "back", placementId: "full_back", priceMinor: 2000 }, // Same asset ID on another face
      { id: "gold_crest", face: "front", placementId: "left_chest", priceMinor: 2000 }, // Duplicate layer on front
    ],
  };

  const result = calculateVersionedPrice([line], policy);
  const l = result.lines[0];
  // Under PER_DESIGN_INSTANCE, "gold_crest" must be charged exactly once (2000 minor)!
  assert.equal(l.breakdown.assetsMinor, 2000);
  assert.equal(l.breakdown.assetItems.length, 1);
  assert.equal(l.breakdown.assetItems[0].assetId, "gold_crest");
  assert.equal(l.breakdown.assetItems[0].chargeScope, "PER_DESIGN_INSTANCE");
});

// ============================================================================
// 4. SCOPE PRIORITY RESOLUTION: Variant > Product > Global & Collision Checks
// ============================================================================

test("6. Scope priority resolution: Variant-specific rule overrides Product-specific rule, which overrides Global rule", () => {
  const policy: PricingPolicyDefinition = {
    policyId: "priority_test",
    defaultBasePriceMinor: 20000,
    includeFirstPlacementFree: false, // Turn off first free to test raw placement resolution
    rules: [
      {
        id: "global_full_front",
        feeType: "placement",
        scope: "global",
        placementId: "full_front",
        amountMinor: 2500, // 25 TRY
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 10,
        enabled: true,
      },
      {
        id: "product_full_front",
        feeType: "placement",
        scope: "product",
        productId: "hoodie_premium",
        placementId: "full_front",
        amountMinor: 4000, // 40 TRY for premium hoodie
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 30,
        enabled: true,
      },
      {
        id: "variant_full_front_gold",
        feeType: "placement",
        scope: "variant",
        productId: "hoodie_premium",
        variantId: "gold_XL",
        placementId: "full_front",
        amountMinor: 6000, // 60 TRY for gold XL variant
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 50,
        enabled: true,
      },
    ],
    quantityTiers: [],
  };

  // Case A: Standard shirt -> hits Global rule (2500 minor)
  const lineA: CartLineForPricing = {
    productId: "standard_shirt",
    variantId: "black_M",
    designType: "custom",
    basePriceMinor: 20000,
    quantity: 1,
    selectedPlacementIds: ["full_front"],
  };
  const resA = calculateVersionedPrice([lineA], policy);
  assert.equal(resA.lines[0].breakdown.placementsMinor, 2500);
  assert.equal(resA.lines[0].breakdown.placementItems[0].ruleId, "global_full_front");

  // Case B: Premium Hoodie regular variant -> hits Product rule (4000 minor)
  const lineB: CartLineForPricing = {
    productId: "hoodie_premium",
    variantId: "black_L",
    designType: "custom",
    basePriceMinor: 30000,
    quantity: 1,
    selectedPlacementIds: ["full_front"],
  };
  const resB = calculateVersionedPrice([lineB], policy);
  assert.equal(resB.lines[0].breakdown.placementsMinor, 4000);
  assert.equal(resB.lines[0].breakdown.placementItems[0].ruleId, "product_full_front");

  // Case C: Premium Hoodie gold XL variant -> hits Variant rule (6000 minor)
  const lineC: CartLineForPricing = {
    productId: "hoodie_premium",
    variantId: "gold_XL",
    designType: "custom",
    basePriceMinor: 30000,
    quantity: 1,
    selectedPlacementIds: ["full_front"],
  };
  const resC = calculateVersionedPrice([lineC], policy);
  assert.equal(resC.lines[0].breakdown.placementsMinor, 6000);
  assert.equal(resC.lines[0].breakdown.placementItems[0].ruleId, "variant_full_front_gold");
});

test("7. Validation check: Priority collision detection prevents two active rules with identical scope/target and equal priority", () => {
  const invalidPolicy: PricingPolicyDefinition = {
    policyId: "collision_test",
    defaultBasePriceMinor: 20000,
    includeFirstPlacementFree: true,
    rules: [
      {
        id: "rule_1",
        feeType: "placement",
        scope: "global",
        placementId: "full_front",
        amountMinor: 2500,
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
      {
        id: "rule_2",
        feeType: "placement",
        scope: "global",
        placementId: "full_front",
        amountMinor: 3000,
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20, // COLLISION: Same criteria and same priority!
        enabled: true,
      },
    ],
    quantityTiers: [],
  };

  const validation = validatePricingPolicy(invalidPolicy);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.some((e) => e.includes("Priority collision detected")),
    `Expected collision error, got: ${JSON.stringify(validation.errors)}`,
  );
});

// ============================================================================
// 5. QUANTITY TIER DISCOUNT TESTS
// ============================================================================

test("8. Quantity discounts: boundaries minQty-1, minQty, minQty+1; no cross-product discounting, floor at 0", () => {
  const policy: PricingPolicyDefinition = {
    policyId: "bulk_test",
    defaultBasePriceMinor: 20000, // 200.00 TRY
    includeFirstPlacementFree: true,
    rules: [],
    quantityTiers: [
      {
        id: "tier_10_plus",
        minQty: 10,
        maxQty: 19,
        discountType: "percentage",
        discountValue: 10, // 10%
        aggregationScope: "PER_PRODUCT",
        eligibleComponents: ["base"],
      },
    ],
  };

  // 1. minQty - 1 = 9 units -> No discount (0%)
  const line9: CartLineForPricing = {
    productId: "shirt",
    variantId: "red_M",
    designType: "blank",
    basePriceMinor: 20000,
    quantity: 9,
  };
  const res9 = calculateVersionedPrice([line9], policy);
  assert.equal(res9.lines[0].breakdown.quantityDiscountMinor, 0);
  assert.equal(res9.lines[0].totalMinor, 180000); // 9 * 20000

  // 2. minQty = 10 units -> 10% discount on base
  const line10: CartLineForPricing = {
    productId: "shirt",
    variantId: "red_M",
    designType: "blank",
    basePriceMinor: 20000,
    quantity: 10,
  };
  const res10 = calculateVersionedPrice([line10], policy);
  // Gross: 10 * 20000 = 200000 minor. 10% = 20000 minor discount. Net: 180000 minor.
  assert.equal(res10.lines[0].breakdown.quantityDiscountMinor, 20000);
  assert.equal(res10.lines[0].totalMinor, 180000);

  // 3. minQty + 1 = 11 units -> 10% discount on base
  const line11: CartLineForPricing = {
    productId: "shirt",
    variantId: "red_M",
    designType: "blank",
    basePriceMinor: 20000,
    quantity: 11,
  };
  const res11 = calculateVersionedPrice([line11], policy);
  // Gross: 11 * 20000 = 220000 minor. 10% = 22000 minor discount. Net: 198000 minor.
  assert.equal(res11.lines[0].breakdown.quantityDiscountMinor, 22000);
  assert.equal(res11.lines[0].totalMinor, 198000);

  // 4. No cross-product aggregation: 5 shirts + 5 mugs = 0 discount on both!
  const crossLines: CartLineForPricing[] = [
    { productId: "shirt", variantId: "red_M", designType: "blank", basePriceMinor: 20000, quantity: 5 },
    { productId: "mug", variantId: "white_std", designType: "blank", basePriceMinor: 10000, quantity: 5 },
  ];
  const resCross = calculateVersionedPrice(crossLines, policy);
  assert.equal(resCross.lines[0].breakdown.quantityDiscountMinor, 0, "Shirt quantity is only 5 (< 10)");
  assert.equal(resCross.lines[1].breakdown.quantityDiscountMinor, 0, "Mug quantity is only 5 (< 10)");
});

// ============================================================================
// 6. ADMIN API & OPTIMISTIC CONCURRENCY LOCKING
// ============================================================================

test("9. Admin API: read, save draft, optimistic locking 409 conflict, and immutable publish", async () => {
  // A. Non-admin customer cannot access API -> 403 Forbidden
  const forbiddenRes = await pricingPolicyRoute(
    req(customerUser, { action: "read" }),
  );
  assert.equal(forbiddenRes.status, 403);

  // B. Read initial state
  const readData = await api({ action: "read" }, adminUser);
  assert.ok(readData.draft);
  const currentRevision = readData.draft.revision;

  // C. Save draft with correct expectedRevision -> 200 OK
  const samplePolicy = getDefaultPricingPolicy();
  const saveRes = await api(
    {
      action: "save_draft",
      expectedRevision: currentRevision,
      definition: samplePolicy,
    },
    adminUser,
  );
  assert.equal(saveRes.success, true);
  assert.equal(saveRes.revision, currentRevision + 1);

  // D. Stale admin tries to save draft with outdated expectedRevision -> 409 Conflict!
  const staleRes = await pricingPolicyRoute(
    req(secondAdminUser, {
      action: "save_draft",
      expectedRevision: currentRevision, // Outdated!
      definition: samplePolicy,
    }),
  );
  assert.equal(staleRes.status, 409, "Stale revision must be rejected with HTTP 409 Conflict");

  // E. Publish immutable revision
  const pubRes = await api(
    {
      action: "publish",
      expectedRevision: currentRevision + 1,
      definition: samplePolicy,
    },
    adminUser,
  );
  assert.equal(pubRes.success, true);
  assert.ok(pubRes.revisionHash);
  assert.equal(pubRes.revisionHash, hashPolicyDefinition(samplePolicy));

  // Verify published revision doc in Firestore
  const publishedDoc = await db
    .doc(`pricing_policies/default/revisions/${pubRes.revisionHash}`)
    .get();
  assert.ok(publishedDoc.exists);
  assert.equal(publishedDoc.get("revisionId"), pubRes.revisionHash);
  const originalPublishedAt = publishedDoc.get("publishedAt");

  // Verify immutability: re-publishing identical definition leaves original publishedAt untouched
  await api(
    {
      action: "publish",
      definition: samplePolicy,
    },
    adminUser,
  );
  const recheckDoc = await db
    .doc(`pricing_policies/default/revisions/${pubRes.revisionHash}`)
    .get();
  assert.equal(recheckDoc.get("publishedAt"), originalPublishedAt, "Published revision must remain permanently immutable");

  // Verify active pointer updated
  const pointerDoc = await db.doc("pricing_policies/default").get();
  assert.equal(pointerDoc.get("activeRevisionId"), pubRes.revisionHash);
});

// ============================================================================
// 7. FIRESTORE SECURITY RULES
// ============================================================================

test("10. Security rules: Client SDK cannot write pricing policies or read private drafts/audits", async () => {
  const customerDb = env.authenticatedContext(customerUser.localId).firestore();
  const unauthDb = env.unauthenticatedContext().firestore();

  // A. Client cannot write to pricing_policies/default
  await assertFails(
    setDoc(doc(customerDb, "pricing_policies/default"), {
      activeRevisionId: "injected_hack",
    }),
  );

  // B. Client cannot write to revisions subcollection
  await assertFails(
    setDoc(doc(customerDb, "pricing_policies/default/revisions/fake_hash"), {
      hacked: true,
    }),
  );

  // C. Client cannot read private drafts
  await assertFails(getDoc(doc(customerDb, "pricing_policies/default/drafts/current")));
  await assertFails(getDoc(doc(unauthDb, "pricing_policies/default/drafts/current")));

  // D. Client cannot read audit logs
  await assertFails(getDoc(doc(customerDb, "pricing_policies/default/audit/any_event")));

  // E. Client CAN read public active pointer and published revisions
  const defaultPolicy = getDefaultPricingPolicy();
  const hash = hashPolicyDefinition(defaultPolicy);
  await assertSucceeds(getDoc(doc(customerDb, "pricing_policies/default")));
  await assertSucceeds(getDoc(doc(customerDb, `pricing_policies/default/revisions/${hash}`)));
});

// ============================================================================
// 8. CHECKOUT SHADOW QUOTE INTEGRATION
// ============================================================================

test("11. Checkout integration: quote generates shadow_quote telemetry without altering customer charge", async () => {
  const buyerId = customerUser.localId;

  // Setup test customer address & cart item
  await env.withSecurityRulesDisabled(async (context: any) => {
    const sdb = context.firestore();
    await setDoc(doc(sdb, `addresses/addr_${buyerId}`), {
      user_id: buyerId,
      full_address: "Bagdat Cad. No: 42, Kadikoy, Istanbul",
      label: "Ev",
      phone: "+905551234567",
      full_name: "Test Customer",
    });

    await setDoc(doc(sdb, "products/test_shirt"), {
      is_active: true,
      name_tr: "Test Tişört",
      name_en: "Test Shirt",
      name_ar: "تيشيرت تجريبي",
      base_price: 200,
    });

    await setDoc(doc(sdb, "products/test_shirt/variants/black_L"), {
      color: "black",
      size: "L",
      stock: 50,
      price: 200,
    });

    await setDoc(doc(sdb, `cart_items/cart_test_${buyerId}`), {
      user_id: buyerId,
      product_id: "test_shirt",
      variant_id: "black_L",
      variant_doc_id: "black_L",
      color: "black",
      size: "L",
      quantity: 1,
      design_type: "blank",
      unit_price: 200,
      unit_minor: 20000,
    });
  });

  // Call quote API
  const quoteReq = new Request("http://localhost/api/checkout/quote", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer " + customerUser.idToken,
    },
    body: JSON.stringify({
      address_id: `addr_${buyerId}`,
      method: "shipping",
      locale: "tr",
    }),
  });

  const quoteRes = await checkoutRequest(quoteReq, "quote");
  assert.equal(quoteRes.status, 200);
  const quoteData = await quoteRes.json();

  // Authoritative customer subtotal remains 20000 (200.00 TRY)
  assert.equal(quoteData.subtotal, 20000);
  assert.ok(quoteData.quote_id);

  // Inspect the persisted quote document in Firestore
  const quoteDoc = await db.collection("checkout_quotes").doc(quoteData.quote_id).get();
  assert.ok(quoteDoc.exists);
  const shadow = quoteDoc.get("shadow_quote");
  assert.ok(shadow, "Quote document must include shadow_quote telemetry");
  assert.equal(shadow.engine_03b_subtotal_minor, 20000);
  assert.equal(shadow.engine_05b_subtotal_minor, 20000);
  assert.equal(shadow.diff_minor, 0);
  assert.equal(shadow.line_count, 1);

  // Verify that an admin publishing a 05B pricing revision while in Shadow Mode
  // DOES NOT unnecessarily invalidate the customer's active 03B quote!
  const updatedPolicy = getDefaultPricingPolicy();
  updatedPolicy.rules.push({
    id: "shadow_rule_test",
    feeType: "extra",
    scope: "global",
    amountMinor: 500,
    currency: "TRY",
    chargeScope: "PER_UNIT",
    priority: 99,
    enabled: true,
  });
  await api({ action: "publish", definition: updatedPolicy }, adminUser);

  // Customer confirms the quote created before the shadow policy was published
  const confirmReq = new Request("http://localhost/api/checkout/confirm", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer " + customerUser.idToken,
    },
    body: JSON.stringify({
      quote_id: quoteData.quote_id,
      key: "test-idempotency-key-12345678",
      accepted: true,
    }),
  });

  const confirmRes = await checkoutRequest(confirmReq, "confirm");
  assert.equal(
    confirmRes.status,
    200,
    "Shadow mode policy change must NOT invalidate active customer checkout quotes",
  );
  const confirmData = await confirmRes.json();
  assert.ok(confirmData.order_id);

  // Verify the order recorded the pricing policy revision and shadow quote summary
  const orderDoc = await db.collection("orders").doc(confirmData.order_id).get();
  assert.ok(orderDoc.exists);
  assert.equal(orderDoc.get("subtotal_minor"), 20000, "Customer must still be charged 100% 03B price");
  assert.ok(orderDoc.get("pricing_policy_revision"));
  assert.ok(orderDoc.get("shadow_quote_summary"));
});

// ============================================================================
// 9. SHADOW PRICING COMPARISON TABLE (4-5 Representative Cart Cases)
// ============================================================================

test("12. Shadow pricing comparison: 5 representative cases evaluated side-by-side between 03B and 05B engines", () => {
  const policy = getDefaultPricingPolicy();

  // Case 1: Single blank t-shirt
  const case1Lines: CartLineForPricing[] = [
    {
      productId: "shirt",
      variantId: "white_M",
      designType: "blank",
      basePriceMinor: 20000,
      quantity: 1,
    },
  ];
  const case1_05B = calculateVersionedPrice(case1Lines, policy);
  const case1_03B = 20000;

  // Case 2: 03B multi-color matrix (Red front-only + Blue front+back)
  const case2Lines: CartLineForPricing[] = [
    {
      productId: "shirt",
      variantId: "red_M",
      designType: "custom",
      basePriceMinor: 20000,
      quantity: 1,
      selectedPlacementIds: ["left_chest"],
    },
    {
      productId: "shirt",
      variantId: "blue_M",
      designType: "custom",
      basePriceMinor: 20000,
      quantity: 1,
      selectedPlacementIds: ["left_chest", "full_back"],
    },
  ];
  const case2_05B = calculateVersionedPrice(case2Lines, policy);
  const case2_03B = 43500;

  // Case 3: Ready-made hoodie
  const case3Lines: CartLineForPricing[] = [
    {
      productId: "hoodie_ready",
      variantId: "black_L",
      designType: "ready",
      basePriceMinor: 30000,
      readyPriceMinor: 45000, // 450 TRY all-inclusive
      quantity: 1,
      selectedPlacementIds: ["full_front"],
    },
  ];
  const case3_05B = calculateVersionedPrice(case3Lines, policy);
  const case3_03B = 45000;

  // Case 4: Custom t-shirt with paid sticker placed on two faces (PER_DESIGN_INSTANCE)
  const case4Lines: CartLineForPricing[] = [
    {
      productId: "shirt",
      variantId: "black_M",
      designType: "custom",
      basePriceMinor: 20000,
      quantity: 1,
      selectedPlacementIds: ["left_chest", "full_back"],
      assets: [
        { id: "paid_crest", face: "front", priceMinor: 2000 },
        { id: "paid_crest", face: "back", priceMinor: 2000 }, // same sticker on back
      ],
    },
  ];
  const case4_05B = calculateVersionedPrice(case4Lines, policy);
  // 03B would charge: 200 (base) + 35 (back) + 20 (sticker) = 255.00 TRY (25500 minor)
  const case4_03B = 25500;

  // Case 5: Bulk order of 15 custom t-shirts (qualifies for 10% quantity discount)
  const case5Lines: CartLineForPricing[] = [
    {
      productId: "shirt",
      variantId: "white_XL",
      designType: "custom",
      basePriceMinor: 20000,
      quantity: 15,
      selectedPlacementIds: ["left_chest"],
    },
  ];
  const case5_05B = calculateVersionedPrice(case5Lines, policy);
  // 03B has no quantity tier discount -> 15 * 20000 = 300,000 minor (3,000.00 TRY)
  const case5_03B = 300000;
  // 05B applies 10% bulk discount on eligible base -> 300,000 - 30,000 = 270,000 minor (2,700.00 TRY)

  console.log("\n==========================================================================");
  console.log("             SHADOW PRICING COMPARISON TABLE (03B vs 05B)");
  console.log("==========================================================================");
  console.log(`Case 1: Single Blank Shirt:       03B = ${case1_03B} kuruş | 05B = ${case1_05B.subtotalMinor} kuruş | Diff = ${case1_05B.subtotalMinor - case1_03B} kuruş`);
  console.log(`Case 2: 03B Multi-Color Matrix:   03B = ${case2_03B} kuruş | 05B = ${case2_05B.subtotalMinor} kuruş | Diff = ${case2_05B.subtotalMinor - case2_03B} kuruş`);
  console.log(`Case 3: Ready-Made Hoodie:        03B = ${case3_03B} kuruş | 05B = ${case3_05B.subtotalMinor} kuruş | Diff = ${case3_05B.subtotalMinor - case3_03B} kuruş`);
  console.log(`Case 4: Paid Sticker Multi-Face:  03B = ${case4_03B} kuruş | 05B = ${case4_05B.subtotalMinor} kuruş | Diff = ${case4_05B.subtotalMinor - case4_03B} kuruş`);
  console.log(`Case 5: Bulk 15 Custom Shirts:    03B = ${case5_03B} kuruş | 05B = ${case5_05B.subtotalMinor} kuruş | Diff = ${case5_05B.subtotalMinor - case5_03B} kuruş (10% Tier applied)`);
  console.log("==========================================================================\n");

  assert.equal(case1_05B.subtotalMinor, case1_03B);
  assert.equal(case2_05B.subtotalMinor, case2_03B);
  assert.equal(case3_05B.subtotalMinor, case3_03B);
  assert.equal(case4_05B.subtotalMinor, 25500);
  assert.equal(case5_05B.subtotalMinor, 270000, "15 shirts with 10% discount must equal 270,000 minor");
});
