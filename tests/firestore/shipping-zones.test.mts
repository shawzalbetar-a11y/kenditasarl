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
  calculateRingArea,
  doSegmentsIntersect,
  isRingSelfIntersecting,
  isPointInPolygon,
  doPolygonsOverlap,
  validatePolicyGeometry,
  isWithinServiceHours,
  evaluateExpressEligibility,
  computePolicyFingerprint,
  getDefaultExpressZonePolicy,
  type ExpressZonePolicyDefinition,
  type ExpressDeliveryZone,
} from "../../src/lib/shippingZones";
import {
  GET as adminZonesGetRoute,
  POST as adminZonesPostRoute,
} from "../../kenditasarl-admin/src/app/api/shipping-zones/route";
import { POST as calculateDeliveryRoute } from "../../src/app/api/checkout/calculate-delivery/route";
import { checkoutRequest } from "../../src/lib/server/checkout";
import { issueServerAddressVerification } from "../../src/lib/server/addressVerification";

const projectId = "demo-kenditasarla-rules";
let env: any, db: any, userA: any, adminUser: any, regularUser: any;

const sampleArea = { left: 0, top: 0, width: 200, height: 200 };
const sampleConfig = {
  enabled: true,
  garmentType: "tshirt",
  faces: {
    front: { enabled: true, printArea: sampleArea },
    back: { enabled: true, printArea: sampleArea },
  },
};

const sampleShape = {
  type: "textbox",
  text: "Sample",
  left: 10,
  top: 10,
  width: 60,
  height: 20,
};

function createSampleDesign(uid: string) {
  return {
    user_id: uid,
    product_id: "shirt",
    color: "red",
    selected_placement_ids: [],
    production_snapshot: JSON.stringify({
      snapshotVersion: 1,
      printAreas: { front: sampleArea, back: sampleArea },
      customization_config: sampleConfig,
    }),
    canvas_json: JSON.stringify(
      JSON.stringify({
        "red:::front": JSON.stringify({ objects: [sampleShape] }),
      })
    ),
  };
}

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

const RealDate = globalThis.Date;

// Time isolation: Deterministic Wednesday 14:00 Europe/Istanbul time for zero-arg new Date()
// to prevent nocturnal OUTSIDE_SERVICE_HOURS failures during night test runs without altering production logic.
class MockDate extends RealDate {
  constructor(...args: [any?]) {
    if (args.length === 0) {
      super("2026-11-18T14:00:00+03:00");
    } else {
      // @ts-ignore
      super(...args);
    }
  }
}
MockDate.now = RealDate.now;
MockDate.UTC = RealDate.UTC;
MockDate.parse = RealDate.parse;

before(async () => {
  globalThis.Date = MockDate as any;
  setLogLevel("error");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099");
  process.env.GCLOUD_PROJECT = projectId;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 18080,
    },
  });

  adminUser = await createIdentity("shipping_admin@kenditasarla.local");
  regularUser = await createIdentity("customer_user@kenditasarla.local");

  const sdb = serverDb();
  await sdb.doc(`admins/${adminUser.localId}`).set({
    role: "admin",
    email: adminUser.email,
  });

  await sdb.doc("settings/pricing").set({
    delivery: {
      fixed_shipping_fee: 35,
      is_free_shipping_enabled: true,
      free_shipping_threshold: 400,
      express: {
        is_active: true,
        base_fee: 50,
      },
    },
  });
});

after(async () => {
  globalThis.Date = RealDate;
  if (env) await env.cleanup();
});

// ---------------------------------------------------------------------------
// 1. PURE GEOMETRY ENGINE TESTS
// ---------------------------------------------------------------------------
test("Geometry: calculateRingArea computes correct Shoelace area", () => {
  // 10x10 square (CCW: positive, CW: negative)
  const ccwSquare: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const area = calculateRingArea(ccwSquare);
  assert.equal(Math.abs(area), 100);
});

test("Geometry: doSegmentsIntersect detects intersecting and parallel segments", () => {
  const p1: [number, number] = [0, 0];
  const p2: [number, number] = [10, 10];
  const p3: [number, number] = [0, 10];
  const p4: [number, number] = [10, 0];
  assert.equal(doSegmentsIntersect(p1, p2, p3, p4), true);

  // Parallel non-intersecting
  const p5: [number, number] = [0, 2];
  const p6: [number, number] = [10, 12];
  assert.equal(doSegmentsIntersect(p1, p2, p5, p6), false);
});

test("Geometry: isRingSelfIntersecting identifies bowtie/self-crossing ring", () => {
  // Simple square (not self-intersecting)
  const cleanRing: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  assert.equal(isRingSelfIntersecting(cleanRing), false);

  // Bowtie (self-intersecting)
  const bowtieRing: [number, number][] = [
    [0, 0],
    [10, 10],
    [10, 0],
    [0, 10],
    [0, 0],
  ];
  assert.equal(isRingSelfIntersecting(bowtieRing), true);
});

test("Geometry: isPointInPolygon ray casting handles inside, outside, vertex, edge, and hole", () => {
  const polygonWithHole = {
    type: "Polygon" as const,
    coordinates: [
      // Outer 100x100
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ] as [number, number][],
      // Hole 40x40 in center
      [
        [30, 30],
        [70, 30],
        [70, 70],
        [30, 70],
        [30, 30],
      ] as [number, number][],
    ],
  };

  // Inside outer, outside hole -> true
  assert.equal(isPointInPolygon([10, 10], polygonWithHole), true);

  // Outside outer -> false
  assert.equal(isPointInPolygon([150, 50], polygonWithHole), false);

  // Inside hole -> false
  assert.equal(isPointInPolygon([50, 50], polygonWithHole), false);

  // On outer edge -> true
  assert.equal(isPointInPolygon([0, 50], polygonWithHole), true);

  // On outer vertex -> true
  assert.equal(isPointInPolygon([0, 0], polygonWithHole), true);
});

test("Geometry: doPolygonsOverlap detects intersecting polygons vs disjoint", () => {
  const polyA = {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ] as [number, number][],
    ],
  };

  const polyBOverlapping = {
    type: "Polygon" as const,
    coordinates: [
      [
        [5, 5],
        [15, 5],
        [15, 15],
        [5, 15],
        [5, 5],
      ] as [number, number][],
    ],
  };

  const polyCDisjoint = {
    type: "Polygon" as const,
    coordinates: [
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
        [20, 20],
      ] as [number, number][],
    ],
  };

  assert.equal(doPolygonsOverlap(polyA, polyBOverlapping), true);
  assert.equal(doPolygonsOverlap(polyA, polyCDisjoint), false);
});

test("Geometry: validatePolicyGeometry rejects overlapping active zones and self-intersections", () => {
  const baseline = getDefaultExpressZonePolicy();
  const validRes = validatePolicyGeometry(baseline);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.errors.length, 0);

  // Add duplicate active zone that overlaps
  const brokenPolicy: ExpressZonePolicyDefinition = {
    ...baseline,
    zones: [
      ...baseline.zones,
      {
        ...baseline.zones[0],
        id: "duplicate_overlapping_zone",
        title: { tr: "Çakışan Bölge", ar: "منطقة متداخلة", en: "Overlapping Zone" },
      },
    ],
  };

  const brokenRes = validatePolicyGeometry(brokenPolicy);
  assert.equal(brokenRes.valid, false);
  assert.ok(brokenRes.errors.some((e) => e.includes("overlap")));
});

// ---------------------------------------------------------------------------
// 2. SERVICE HOURS EVALUATION
// ---------------------------------------------------------------------------
test("ServiceHours: correctly evaluates Istanbul timezone windows and overnight shifts", () => {
  const standardHours = {
    timezone: "Europe/Istanbul" as const,
    days: [1, 2, 3, 4, 5], // Monday through Friday
    start: "10:00",
    end: "20:00",
  };

  // Wednesday at 15:00 UTC (18:00 Istanbul) -> Inside
  const wednesday1800Istanbul = new Date("2026-11-18T15:00:00Z");
  assert.equal(isWithinServiceHours(standardHours, wednesday1800Istanbul), true);

  // Wednesday at 02:00 UTC (05:00 Istanbul) -> Outside
  const wednesday0500Istanbul = new Date("2026-11-18T02:00:00Z");
  assert.equal(isWithinServiceHours(standardHours, wednesday0500Istanbul), false);

  // Sunday at 15:00 UTC -> Outside because Sunday is excluded
  const sunday1800Istanbul = new Date("2026-11-15T15:00:00Z");
  assert.equal(isWithinServiceHours(standardHours, sunday1800Istanbul), false);

  // Overnight window: 21:00 to 03:00 (next day)
  const overnightHours = {
    timezone: "Europe/Istanbul" as const,
    days: [1, 2, 3, 4, 5, 6, 7],
    start: "21:00",
    end: "03:00",
  };
  // 23:30 Istanbul -> Inside
  const night2330Istanbul = new Date("2026-11-18T20:30:00Z");
  assert.equal(isWithinServiceHours(overnightHours, night2330Istanbul), true);

  // 01:30 Istanbul -> Inside
  const early0130Istanbul = new Date("2026-11-18T22:30:00Z");
  assert.equal(isWithinServiceHours(overnightHours, early0130Istanbul), true);

  // 12:00 Istanbul -> Outside
  const noonIstanbul = new Date("2026-11-18T09:00:00Z");
  assert.equal(isWithinServiceHours(overnightHours, noonIstanbul), false);
});

// ---------------------------------------------------------------------------
// 3. ADDRESS TRUST & EXPRESS EVALUATION
// ---------------------------------------------------------------------------
test("Eligibility: rejects unverified or missing address coordinates", () => {
  const policy = getDefaultExpressZonePolicy();

  // Missing coords
  const res1 = evaluateExpressEligibility({
    policy,
    address: { lat: undefined, lng: undefined, location_source: "google_places" },
    basketSubtotalMinor: 50000,
  });
  assert.equal(res1.eligible, false);
  assert.equal(res1.reasonCode, "INVALID_ADDRESS");

  // Unverified location source
  const res2 = evaluateExpressEligibility({
    policy,
    address: { lat: 40.99, lng: 29.03, location_source: "manual_text" },
    basketSubtotalMinor: 50000,
  });
  assert.equal(res2.eligible, false);
  assert.equal(res2.reasonCode, "ADDRESS_VERIFICATION_REQUIRED");
});

test("Eligibility: accepts verified Kadıköy address inside active zone and hours", () => {
  const policy = getDefaultExpressZonePolicy();
  // Moda/Kadıköy coordinates: 40.985, 29.028
  const kadikoyAddress = {
    lat: 40.985,
    lng: 29.028,
    location_source: "pin_verified",
  };

  // Target mid-day Istanbul time
  const midDayTime = new Date("2026-11-18T12:00:00Z");

  const res = evaluateExpressEligibility({
    policy,
    address: kadikoyAddress,
    basketSubtotalMinor: 50000, // 500.00 TL
    currentDate: midDayTime,
  });

  assert.equal(res.eligible, true);
  assert.equal(res.zoneId, "zone_kadikoy");
  assert.equal(res.feeMinor, 15000); // 150.00 TL
});

test("Eligibility: rejects address outside all active zones", () => {
  const policy = getDefaultExpressZonePolicy();
  // Ankara coordinates: 39.93, 32.85
  const ankaraAddress = {
    lat: 39.93,
    lng: 32.85,
    location_source: "google_places",
  };

  const res = evaluateExpressEligibility({
    policy,
    address: ankaraAddress,
    basketSubtotalMinor: 50000,
  });

  assert.equal(res.eligible, false);
  assert.equal(res.reasonCode, "OUTSIDE_ZONE");
});

// ---------------------------------------------------------------------------
// 4. SECURITY & FIRESTORE RULES TESTS
// ---------------------------------------------------------------------------
test("Security Rules: public can read active shipping pointer, client writes forbidden", async () => {
  const anonDb = env.unauthenticatedContext().firestore();
  const clientDb = env.authenticatedContext(regularUser.localId).firestore();

  // Set default pointer on server
  const sdb = serverDb();
  await sdb.doc("shipping_zone_policies/default").set({
    schemaVersion: 1,
    id: "default",
    activeRevisionId: "rev_baseline",
    updatedAt: new Date().toISOString(),
  });

  // Client reads active pointer -> Succeeds
  const snap = await getDoc(doc(anonDb, "shipping_zone_policies/default"));
  assert.equal(snap.exists(), true);

  // Client attempts direct write to pointer -> Fails
  await assertFails(
    setDoc(doc(clientDb, "shipping_zone_policies/default"), { hacked: true })
  );

  // Client attempts direct write to revisions -> Fails
  await assertFails(
    setDoc(doc(clientDb, "shipping_zone_policies/default/revisions/rev_hack"), {
      schemaVersion: 1,
      definition: {},
    })
  );
});

// ---------------------------------------------------------------------------
// 5. ADMIN API (GET, SAVE DRAFT, PUBLISH, CONCURRENCY 409)
// ---------------------------------------------------------------------------
test("Admin API: rejects non-admin users with 401/403", async () => {
  // Unauthenticated
  const reqUnauth = new Request("http://localhost:3000/api/shipping-zones", {
    method: "GET",
  });
  const resUnauth = await adminZonesGetRoute(reqUnauth);
  assert.equal(resUnauth.status, 401);

  // Regular user (not admin)
  const reqReg = new Request("http://localhost:3000/api/shipping-zones", {
    method: "GET",
    headers: { Authorization: `Bearer ${regularUser.idToken}` },
  });
  const resReg = await adminZonesGetRoute(reqReg);
  assert.equal(resReg.status, 403);
});

test("Admin API: saves draft and publishes valid policy with optimistic concurrency check", async () => {
  const policy = getDefaultExpressZonePolicy();

  // 1. Admin saves draft
  const draftReq = new Request("http://localhost:3000/api/shipping-zones", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminUser.idToken}`,
    },
    body: JSON.stringify({
      action: "save_draft",
      definition: policy,
    }),
  });
  const draftRes = await adminZonesPostRoute(draftReq);
  if (draftRes.status !== 200) {
    const errText = await draftRes.clone().text();
    console.error("ADMIN POST ERROR:", draftRes.status, errText);
  }
  assert.equal(draftRes.status, 200);
  const draftBody = await draftRes.json();
  assert.equal(draftBody.ok, true);

  // 2. Admin publishes valid policy
  const pubReq = new Request("http://localhost:3000/api/shipping-zones", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminUser.idToken}`,
    },
    body: JSON.stringify({
      action: "publish",
      definition: policy,
    }),
  });
  const pubRes = await adminZonesPostRoute(pubReq);
  assert.equal(pubRes.status, 200);
  const pubBody = await pubRes.json();
  assert.equal(pubBody.ok, true);
  const publishedRevId = pubBody.revisionId;
  assert.ok(publishedRevId);

  // 3. Stale revision publication returns 409 CONCURRENT_MODIFICATION
  const staleReq = new Request("http://localhost:3000/api/shipping-zones", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminUser.idToken}`,
    },
    body: JSON.stringify({
      action: "publish",
      definition: policy,
      clientRevision: "stale_old_rev_id",
    }),
  });
  const staleRes = await adminZonesPostRoute(staleReq);
  assert.equal(staleRes.status, 409);
});

// ---------------------------------------------------------------------------
// 6. DELIVERY CALCULATION API TEST
// ---------------------------------------------------------------------------
test("Delivery Calculation Route: returns express availability, fee in TL and kuruş", async () => {
  const sdb = serverDb();
  await issueServerAddressVerification({
    addressId: "calc_test_addr",
    userId: regularUser.localId,
    lat: 40.985,
    lng: 29.028,
    rawAddress: "Moda Cd. No:10 Kadıköy",
    verificationSource: "admin_verified",
    verifiedBy: "system_test",
  });

  // Inside Kadıköy with subtotal
  const req = new Request("http://localhost:3000/api/checkout/calculate-delivery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      addressId: "calc_test_addr",
      userId: regularUser.localId,
      lat: 40.985,
      lng: 29.028,
      location_source: "admin_verified",
      subtotal: 500,
    }),
  });

  const res = await calculateDeliveryRoute(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.isExpressAvailable, true);
  assert.equal(data.expressFee, 150);
  assert.equal(data.expressFeeMinor, 15000);
  assert.equal(data.zoneId, "zone_kadikoy");
});

// Helper to ensure clean cart and stock setup
async function ensureCartItem(uid: string) {
  const sdb = serverDb();
  const existing = await sdb.collection("cart_items").where("user_id", "==", uid).get();
  for (const doc of existing.docs) {
    await doc.ref.delete();
  }
  await sdb.doc("products/shirt").set({
    name: "T-Shirt",
    base_price: 250,
    is_active: true,
    customization_config: sampleConfig,
  });
  await sdb.doc("products/shirt/variants/red").set({
    color: "red",
    sizes: { M: 10 },
  });
  const designRef = await sdb.collection("designs").add(createSampleDesign(uid));
  await sdb.collection("cart_items").add({
    user_id: uid,
    product_id: "shirt",
    variant_id: "red_M",
    size: "M",
    color: "red",
    quantity: 1,
    design_type: "custom",
    design_id: designRef.id,
  });
}

// ---------------------------------------------------------------------------
// 7. CHECKOUT INTEGRATION (03B AUTHORITATIVE & 05B SHADOW MODE)
// ---------------------------------------------------------------------------
test("Checkout Integration: handles express delivery quote and order confirmation with shipping snapshot", async () => {
  const sdb = serverDb();
  const uid = regularUser.localId;

  await ensureCartItem(uid);

  // Save address for user
  await sdb.doc("addresses/" + uid).set({
    user_id: uid,
    lat: 40.985,
    lng: 29.028,
    location_source: "pin_verified",
    full_address: "Moda Cd. No:10 Kadıköy",
  });

  // Issue authoritative server verification for the address (Phase 06B-R Trust Gate)
  await issueServerAddressVerification({
    addressId: uid,
    userId: uid,
    lat: 40.985,
    lng: 29.028,
    rawAddress: "Moda Cd. No:10 Kadıköy",
    verificationSource: "admin_verified",
    verifiedBy: "system_test",
  });

  // Create sample design and cart item
  const designRef = await sdb.collection("designs").add(createSampleDesign(uid));
  await sdb.collection("cart_items").add({
    user_id: uid,
    product_id: "shirt",
    variant_id: "red_M",
    size: "M",
    color: "red",
    quantity: 1,
    design_type: "custom",
    design_id: designRef.id,
  });

  // 1. Quote with express delivery
  const quoteReq = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${regularUser.idToken}`,
    },
    body: JSON.stringify({
      address_id: uid,
      method: "express",
      locale: "tr",
    }),
  });

  const quoteRes = await checkoutRequest(quoteReq, "quote");
  const quoteData = await quoteRes.json();
  if (quoteRes.status !== 200) {
    console.error("CHECKOUT QUOTE ERROR:", quoteRes.status, quoteData);
  }

  assert.equal(quoteRes.status, 200);
  assert.equal(quoteData.shipping_snapshot?.method, "express");
  assert.equal(quoteData.shipping, 15000); // 15000 kuruş (150 TL)
  assert.ok(quoteData.shipping_policy_revision);
  assert.ok(quoteData.shipping_snapshot);
  assert.equal(quoteData.shipping_snapshot.zoneId, "zone_kadikoy");

  // 2. Confirm order with quote fingerprint
  const confirmReq = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${regularUser.idToken}`,
    },
    body: JSON.stringify({
      accepted: true,
      key: "test_key_zones_1",
      quote_id: quoteData.quote_id,
    }),
  });

  const confirmRes = await checkoutRequest(confirmReq, "confirm");
  const confirmData = await confirmRes.json();
  if (confirmRes.status !== 200) {
    console.error("CHECKOUT CONFIRM ERROR:", confirmRes.status, confirmData);
  }

  assert.equal(confirmRes.status, 200);
  assert.ok(confirmData.order_id);

  // Verify stored order document contains shipping snapshot & policy revision
  const orderDoc = await sdb.doc(`orders/${confirmData.order_id}`).get();
  assert.equal(orderDoc.exists, true);
  const orderData = orderDoc.data();
  assert.equal(orderData.delivery_method, "express");
  assert.equal(orderData.delivery_fee, 150);
  assert.equal(orderData.delivery_minor, 15000);
  assert.ok(orderData.shipping_snapshot);
  assert.equal(orderData.shipping_snapshot.zoneId, "zone_kadikoy");
  assert.ok(orderData.shipping_policy_revision);

  // Verify Shadow Mode pricing result is present without altering 03B pricing
  assert.ok(orderData.shadow_quote_summary);
  assert.ok(orderData.shadow_quote_summary.policy_revision_id);
});

// ---------------------------------------------------------------------------
// 7. TASK 06B-R ATTACK & TRUST BOUNDARY TEST CASES
// ---------------------------------------------------------------------------

test("Security Gate: Client self-attested location_source is rejected without server verification record", async () => {
  const sdb = serverDb();
  const uid = regularUser.localId;
  await ensureCartItem(uid);
  const forgedAddrId = "forged_address_" + Date.now();

  // Attacker creates address claiming admin_verified directly in client-writable addresses collection
  await sdb.doc("addresses/" + forgedAddrId).set({
    user_id: uid,
    lat: 40.985,
    lng: 29.028,
    location_source: "admin_verified", // Self-attestation spoof
    full_address: "Attacker Spoofed Address Kadıköy",
  });

  // Ensure NO record exists in /address_verifications/forgedAddrId
  const vDoc = await sdb.doc("address_verifications/" + forgedAddrId).get();
  assert.equal(vDoc.exists, false);

  // Attempt checkout quote with express delivery -> MUST FAIL CLOSED
  const quoteReq = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${regularUser.idToken}`,
    },
    body: JSON.stringify({
      address_id: forgedAddrId,
      method: "express",
      locale: "tr",
    }),
  });

  const quoteRes = await checkoutRequest(quoteReq, "quote");
  assert.equal(quoteRes.status, 400);
  const quoteErr = await quoteRes.json();
  assert.equal(quoteErr.error, "ADDRESS_VERIFICATION_REQUIRED");

  // Also test calculate-delivery API route
  const calcReq = new Request("http://localhost/api/checkout/calculate-delivery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      addressId: forgedAddrId,
      userId: uid,
      lat: 40.985,
      lng: 29.028,
      subtotal: 500,
    }),
  });
  const calcRes = await calculateDeliveryRoute(calcReq);
  const calcData = await calcRes.json();
  assert.equal(calcRes.status, 200);
  assert.equal(calcData.isExpressAvailable, false);
  assert.equal(calcData.expressReasonCode, "ADDRESS_VERIFICATION_REQUIRED");
});

test("Security Gate: Server address verification rejects coordinate mismatch and cross-user hijacking", async () => {
  const sdb = serverDb();
  const uid = regularUser.localId;
  await ensureCartItem(uid);
  const victimUid = adminUser.localId;
  const mismatchedAddrId = "mismatched_addr_" + Date.now();

  // User sets address with coordinates [40.985, 29.028]
  await sdb.doc("addresses/" + mismatchedAddrId).set({
    user_id: uid,
    lat: 40.985,
    lng: 29.028,
    full_address: "Tampered Address Kadıköy",
  });

  // Server verification has completely different coordinates [41.050, 29.000]
  await issueServerAddressVerification({
    addressId: mismatchedAddrId,
    userId: uid,
    lat: 41.050,
    lng: 29.000,
    rawAddress: "Original Address Beşiktaş",
    verificationSource: "admin_verified",
    verifiedBy: "admin",
  });

  // Attempt checkout quote: coordinate mismatch must fail closed
  const quoteReq = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${regularUser.idToken}`,
    },
    body: JSON.stringify({
      address_id: mismatchedAddrId,
      method: "express",
      locale: "tr",
    }),
  });

  const quoteRes = await checkoutRequest(quoteReq, "quote");
  assert.equal(quoteRes.status, 400);
  const quoteErr = await quoteRes.json();
  assert.equal(quoteErr.error, "ADDRESS_VERIFICATION_REQUIRED");

  // Cross-user hijacking test: verification belongs to victimUid, but address owned by uid
  const crossUserAddrId = "cross_user_" + Date.now();
  await sdb.doc("addresses/" + crossUserAddrId).set({
    user_id: uid,
    lat: 40.985,
    lng: 29.028,
    full_address: "Hijack Attempt",
  });
  await issueServerAddressVerification({
    addressId: crossUserAddrId,
    userId: victimUid, // belongs to victim!
    lat: 40.985,
    lng: 29.028,
    rawAddress: "Victim Address",
    verificationSource: "admin_verified",
    verifiedBy: "admin",
  });

  const hijackReq = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${regularUser.idToken}`,
    },
    body: JSON.stringify({
      address_id: crossUserAddrId,
      method: "express",
      locale: "tr",
    }),
  });
  const hijackRes = await checkoutRequest(hijackReq, "quote");
  assert.equal(hijackRes.status, 400);
  const hijackErr = await hijackRes.json();
  assert.equal(hijackErr.error, "ADDRESS_VERIFICATION_REQUIRED");
});

test("Hole & Complex Geometry: Holes inside polygons exclude points and invalid holes are rejected on publish", async () => {
  // Point inside hole must evaluate to false
  const polyWithHole = {
    type: "Polygon" as const,
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], // outer 10x10
      [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],      // inner hole 4x4
    ] as CoordinatePair[][],
  };

  // Inside outer ring and outside hole -> true
  assert.equal(isPointInPolygon([1, 1], polyWithHole), true);
  // Inside hole -> false
  assert.equal(isPointInPolygon([5, 5], polyWithHole), false);
  // Boundary of hole -> false (deterministic rule: hole boundary is excluded)
  assert.equal(isPointInPolygon([3, 5], polyWithHole), false);

  // Policy validation test: Hole outside outer ring is rejected
  const policyWithInvalidHole: ExpressZonePolicyDefinition = {
    ...getDefaultExpressZonePolicy(),
    zones: [
      {
        id: "zone_invalid_hole",
        title: { tr: "Geçersiz Delik", ar: "فتحة غير صالحة", en: "Invalid Hole" },
        isActive: true,
        priority: 1,
        feeMinor: 5000,
        serviceHours: { start: "09:00", end: "22:00", days: [1, 2, 3, 4, 5, 6, 7], timezone: "Europe/Istanbul" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
            [[15, 15], [20, 15], [20, 20], [15, 20], [15, 15]], // Hole completely outside outer ring
          ],
        },
      },
    ],
  };

  const validation = validatePolicyGeometry(policyWithInvalidHole);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("not fully enclosed")));

  // Publishing invalid hole policy via admin route must return 400
  const pubReq = new Request("http://localhost/api/shipping-zones", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${adminUser.idToken}`,
    },
    body: JSON.stringify({
      action: "publish",
      definition: policyWithInvalidHole,
      expectedRevisionId: "dummy_rev",
    }),
  });

  const pubRes = await adminZonesPostRoute(pubReq);
  assert.equal(pubRes.status, 400);
  const pubErr = await pubRes.json();
  assert.ok(pubErr.errors && pubErr.errors.length > 0);
});

test("Fingerprint & Isolation: Standard shipping quotes remain valid when express zone policy changes", async () => {
  const sdb = serverDb();
  const uid = regularUser.localId;
  await ensureCartItem(uid);

  // 1. Request standard shipping quote
  const stdQuoteReq = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${regularUser.idToken}`,
    },
    body: JSON.stringify({
      address_id: uid,
      method: "shipping",
      locale: "tr",
    }),
  });

  const stdQuoteRes = await checkoutRequest(stdQuoteReq, "quote");
  assert.equal(stdQuoteRes.status, 200);
  const stdQuoteData = await stdQuoteRes.json();
  assert.equal(stdQuoteData.shipping_snapshot?.method, "shipping");
  // Standard shipping quotes do not bind to express shipping policy revision
  assert.equal(stdQuoteData.shipping_policy_revision, null);

  // 2. Admin publishes a NEW express zone policy revision
  const newExpressPolicy: ExpressZonePolicyDefinition = {
    ...getDefaultExpressZonePolicy(),
    zones: [
      {
        id: "zone_updated",
        title: { tr: "Güncellenmiş Kadıköy", ar: "كاديكوي محدثة", en: "Updated Kadikoy" },
        isActive: true,
        priority: 1,
        feeMinor: 20000, // Changed to 200 TL
        serviceHours: { start: "08:00", end: "23:00", days: [1, 2, 3, 4, 5, 6, 7], timezone: "Europe/Istanbul" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [[29.00, 40.97], [29.08, 40.97], [29.08, 41.03], [29.00, 41.03], [29.00, 40.97]],
          ],
        },
      },
    ],
  };

  const currentPointer = await sdb.doc("shipping_zone_policies/default").get();
  const activeRevId = currentPointer.get("activeRevisionId");

  const pubReq = new Request("http://localhost/api/shipping-zones", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${adminUser.idToken}`,
    },
    body: JSON.stringify({
      action: "publish",
      definition: newExpressPolicy,
      expectedRevisionId: activeRevId,
    }),
  });
  const pubRes = await adminZonesPostRoute(pubReq);
  assert.equal(pubRes.status, 200);

  // 3. Confirm the previously issued standard shipping quote
  const confirmReq = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${regularUser.idToken}`,
    },
    body: JSON.stringify({
      accepted: true,
      key: "test_key_standard_isolation_" + Date.now(),
      quote_id: stdQuoteData.quote_id,
    }),
  });

  const confirmRes = await checkoutRequest(confirmReq, "confirm");
  const confirmData = await confirmRes.json();
  assert.equal(confirmRes.status, 200);
  assert.ok(confirmData.order_id);

  const orderDoc = await sdb.doc(`orders/${confirmData.order_id}`).get();
  assert.equal(orderDoc.data().delivery_method, "shipping");
});

test("Concurrency & Idempotency: Replaying checkout confirm with same idempotency key is safe and stock is decremented once", async () => {
  const sdb = serverDb();
  const uid = regularUser.localId;

  await ensureCartItem(uid);
  await sdb.doc("products/shirt/variants/red").update({
    sizes: { M: 5 },
  });

  // Request express quote
  const quoteReq = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${regularUser.idToken}`,
    },
    body: JSON.stringify({
      address_id: uid,
      method: "express",
      locale: "tr",
    }),
  });
  const quoteRes = await checkoutRequest(quoteReq, "quote");
  assert.equal(quoteRes.status, 200);
  const quoteData = await quoteRes.json();

  const idempotencyKey = "idempotent_test_key_" + Date.now();

  // First confirm
  const confirmReq1 = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${regularUser.idToken}`,
    },
    body: JSON.stringify({
      accepted: true,
      key: idempotencyKey,
      quote_id: quoteData.quote_id,
    }),
  });
  const res1 = await checkoutRequest(confirmReq1, "confirm");
  const data1 = await res1.json();
  assert.equal(res1.status, 200);
  assert.ok(data1.order_id);

  // Check stock decreased from 5 to 4
  const varSnap1 = await sdb.doc("products/shirt/variants/red").get();
  assert.equal(varSnap1.data()?.sizes?.M, 4);

  // Second confirm replay with identical key and quote
  const confirmReq2 = new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${regularUser.idToken}`,
    },
    body: JSON.stringify({
      accepted: true,
      key: idempotencyKey,
      quote_id: quoteData.quote_id,
    }),
  });
  const res2 = await checkoutRequest(confirmReq2, "confirm");
  const data2 = await res2.json();
  assert.equal(res2.status, 200);
  assert.equal(data2.order_id, data1.order_id); // Replayed same order!

  // Stock must STILL be 4 (not decremented twice!)
  const varSnap2 = await sdb.doc("products/shirt/variants/red").get();
  assert.equal(varSnap2.data()?.sizes?.M, 4);
});
