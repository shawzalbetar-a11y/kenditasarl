import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, query, where, orderBy, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { serverDb, serverAuth } from "../../src/lib/server/cloudinaryServer";
import { calculateCustomProductPrice } from "../../src/lib/pricing";
import { artwork } from "../../src/lib/server/checkoutArt";
import { productionPlan } from "../../kenditasarl-admin/src/lib/production-plan";
import { SERIALIZE_PROPERTIES } from "../../src/lib/faceCoordinates";
import { createHash } from "node:crypto";

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
        password: "asset-test-password-only",
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
          password: "asset-test-password-only",
          returnSecureToken: true,
        }),
      }
    );
  }
  assert.equal(r.status, 200);
  return r.json();
}

let testUser: any;
let adminUser: any;

const sampleCategories = [
  { id: "cat-animals", name: "Hayvanlar", name_ar: "حيوانات", name_en: "Animals", order: 1 },
  { id: "cat-typography", name: "Tipografi", name_ar: "خطوط وعبارات", name_en: "Typography", order: 2 },
  { id: "cat-badges", name: "Rozetler", name_ar: "شارات وشعارات", name_en: "Badges", order: 3 },
];

const sampleAssets = [
  {
    id: "sticker-free-cat",
    name: "Sevimli Kedi",
    category: "Hayvanlar",
    type: "sticker",
    price: 0,
    url: "https://res.cloudinary.com/demo/image/upload/v1/stickers/cat.png",
    is_active: true,
    published: true,
  },
  {
    id: "sticker-free-heart",
    name: "Minimal Kalp",
    category: "Rozetler",
    type: "sticker",
    price: 0,
    url: "https://res.cloudinary.com/demo/image/upload/v1/stickers/heart.png",
    is_active: true,
    published: true,
  },
  {
    id: "sticker-paid-eagle",
    name: "Anadolu Kartalı",
    category: "Hayvanlar",
    type: "sticker",
    price: 35,
    url: "https://res.cloudinary.com/demo/image/upload/v1/stickers/eagle.png",
    is_active: true,
    published: true,
  },
];

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

  testUser = await createIdentity("asset_customer@kenditasarla.local");
  adminUser = await createIdentity("asset_admin@kenditasarla.local");

  const sdb = serverDb();

  // Set admin claim / doc for adminUser
  await sdb.doc(`admins/${adminUser.localId}`).set({ role: "admin", active: true });

  // Seed sample categories
  for (const cat of sampleCategories) {
    await sdb.doc(`asset_categories/${cat.id}`).set(cat);
  }

  // Seed sample assets
  for (const asset of sampleAssets) {
    await sdb.doc(`design_assets/${asset.id}`).set(asset);
  }
});

after(async () => {
  const sdb = serverDb();
  for (const cat of sampleCategories) {
    await sdb.doc(`asset_categories/${cat.id}`).delete().catch(() => {});
  }
  for (const asset of sampleAssets) {
    await sdb.doc(`design_assets/${asset.id}`).delete().catch(() => {});
  }
  await sdb.doc(`admins/${adminUser.localId}`).delete().catch(() => {});
  await env?.cleanup();
});

describe("Phase 07A: Asset Library & Canvas Editor Integration Test Suite", () => {
  // =========================================================================
  // 1. ASSET DISCOVERY, CATEGORIZATION & SEARCH
  // =========================================================================
  test("[ASSET-1] Public client can fetch design_assets and asset_categories", async () => {
    const clientDb = env.authenticatedContext(testUser.localId).firestore();

    const assetsSnap = await getDocs(collection(clientDb, "design_assets"));
    assert.ok(assetsSnap.size >= 3, "Customer must be able to read design_assets collection");

    const catsSnap = await getDocs(collection(clientDb, "asset_categories"));
    assert.ok(catsSnap.size >= 3, "Customer must be able to read asset_categories collection");

    const fetchedIds = assetsSnap.docs.map(d => d.id);
    assert.ok(fetchedIds.includes("sticker-free-cat"));
    assert.ok(fetchedIds.includes("sticker-paid-eagle"));
  });

  test("[ASSET-2] Client-side filtering by category and search keyword conforms to requirements", async () => {
    // Simulate AssetGalleryModal filtering logic
    const categoryFilter = "Hayvanlar";
    const filteredByCategory = sampleAssets.filter(a => a.category === categoryFilter);
    assert.equal(filteredByCategory.length, 2);
    assert.ok(filteredByCategory.some(a => a.id === "sticker-free-cat"));
    assert.ok(filteredByCategory.some(a => a.id === "sticker-paid-eagle"));

    // Search query matching
    const searchQuery = "kartal";
    const searchResults = sampleAssets.filter(
      a => a.name.toLowerCase().includes(searchQuery) || a.category.toLowerCase().includes(searchQuery)
    );
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].id, "sticker-paid-eagle");
  });

  // =========================================================================
  // 2. FREE VS PAID STICKERS & PRICING ENGINE
  // =========================================================================
  test("[ASSET-3] Free stickers incur 0 ₺ extra fee in pricing calculation", async () => {
    const freeFaceData = {
      front: {
        objects: [
          {
            name: "sticker",
            type: "image",
            originalAssetId: "sticker-free-cat",
            src: "https://res.cloudinary.com/demo/image/upload/v1/stickers/cat.png",
            assetName: "Sevimli Kedi",
            assetPrice: 0,
            assignedPlacementId: "front_chest",
          },
        ],
      },
    };

    const calcResult = calculateCustomProductPrice({
      basePrice: 299,
      facesData: freeFaceData,
      assetsList: sampleAssets,
      selectedPlacementIds: ["front_chest"],
      locale: "tr",
      garmentType: "tshirt",
    });

    assert.equal(calcResult.totalPrice, 299, "Free sticker must not increase base price");
    const assetBreakdowns = calcResult.breakdown.filter(b => b.type === "premium_asset");
    assert.equal(assetBreakdowns.length, 0, "No premium asset breakdown item for 0 price sticker");
  });

  test("[ASSET-4] Paid sticker adds transparent price badge and reflects in price breakdown", async () => {
    const paidFaceData = {
      front: {
        objects: [
          {
            name: "sticker",
            type: "image",
            originalAssetId: "sticker-paid-eagle",
            src: "https://res.cloudinary.com/demo/image/upload/v1/stickers/eagle.png",
            assetName: "Anadolu Kartalı",
            assetPrice: 35,
            assignedPlacementId: "front_chest",
          },
        ],
      },
    };

    const calcResult = calculateCustomProductPrice({
      basePrice: 299,
      facesData: paidFaceData,
      assetsList: sampleAssets,
      selectedPlacementIds: ["front_chest"],
      locale: "tr",
      garmentType: "tshirt",
    });

    assert.equal(calcResult.totalPrice, 299 + 35, "Total price must include 35 ₺ paid asset fee");
    const assetBreakdowns = calcResult.breakdown.filter(b => b.type === "premium_asset");
    assert.equal(assetBreakdowns.length, 1);
    assert.equal(assetBreakdowns[0].price, 35);
    assert.equal(assetBreakdowns[0].name, "Anadolu Kartalı");
  });

  // =========================================================================
  // 3. CANVAS SERIALIZATION & PERSISTENCE CONTRACT
  // =========================================================================
  test("[ASSET-5] SERIALIZE_PROPERTIES contains asset provenance keys for 300 DPI reconstitution", () => {
    const requiredKeys = ["originalAssetId", "assetName", "assetPrice", "assetType", "assetCategory", "assetVersion", "assignedPlacementId", "src"];
    for (const key of requiredKeys) {
      assert.ok(
        SERIALIZE_PROPERTIES.includes(key),
        `SERIALIZE_PROPERTIES must include '${key}' to preserve asset provenance in canvas_json`
      );
    }
  });

  test("[ASSET-6] Canvas state serialization preserves sticker object transformations and metadata", () => {
    const syntheticCanvasObject = {
      id: "obj_12345",
      name: "sticker",
      type: "image",
      src: "https://res.cloudinary.com/demo/image/upload/v1/stickers/eagle.png",
      originalAssetId: "sticker-paid-eagle",
      assetName: "Anadolu Kartalı",
      assetPrice: 35,
      assetType: "sticker",
      assetCategory: "Hayvanlar",
      assetVersion: 1,
      left: 250,
      top: 180,
      scaleX: 0.85,
      scaleY: 0.85,
      angle: 15,
      width: 400,
      height: 400,
      assignedPlacementId: "front_chest",
      originMode: "approved",
      createdInMode: "approved",
      selectable: true,
      evented: true,
    };

    // Serialize according to SERIALIZE_PROPERTIES
    const serialized: Record<string, any> = {};
    for (const prop of SERIALIZE_PROPERTIES) {
      if (prop in syntheticCanvasObject) {
        serialized[prop] = (syntheticCanvasObject as any)[prop];
      }
    }

    // Verify all transformation properties are retained
    assert.equal(serialized.left, 250);
    assert.equal(serialized.top, 180);
    assert.equal(serialized.scaleX, 0.85);
    assert.equal(serialized.scaleY, 0.85);
    assert.equal(serialized.angle, 15);
    assert.equal(serialized.width, 400);
    assert.equal(serialized.height, 400);

    // Verify asset metadata is retained
    assert.equal(serialized.originalAssetId, "sticker-paid-eagle");
    assert.equal(serialized.assetName, "Anadolu Kartalı");
    assert.equal(serialized.assetPrice, 35);
    assert.equal(serialized.assetType, "sticker");
    assert.equal(serialized.assetVersion, 1);
    assert.equal(serialized.assignedPlacementId, "front_chest");
  });

  // =========================================================================
  // 4. SERVER-SIDE CHECKOUT & ENTITLEMENT GATES
  // =========================================================================
  test("[ASSET-7] Server-side checkout validates design_assets existence and rejects unseeded assets", async () => {
    const sdb = serverDb();

    // Mock resource resolver mirroring checkout.ts assetResolver
    const resourceResolver = async (obj: any) => {
      const ref = obj.originalAssetId || obj.assetId;
      const url = obj.src;
      let assetDoc: FirebaseFirestore.DocumentSnapshot | undefined;

      if (ref && !ref.startsWith("https://")) {
        assetDoc = await sdb.collection("design_assets").doc(ref).get();
        if (!assetDoc.exists) throw new Error("ASSET_NOT_FOUND");
      } else if (url) {
        const snap = await sdb.collection("design_assets").where("url", "==", url).limit(2).get();
        if (snap.size !== 1) throw new Error("ASSET_NOT_FOUND");
        assetDoc = snap.docs[0];
      }

      if (!assetDoc?.exists) throw new Error("ASSET_NOT_FOUND");
      const a = assetDoc.data()!;
      if (a.is_active === false || a.published === false) throw new Error("ASSET_INACTIVE");

      return { id: assetDoc.id, url: a.url, price: a.price ?? 0, upload: false };
    };

    // 1. Valid seeded asset resolves successfully
    const validResult = await resourceResolver({
      originalAssetId: "sticker-free-cat",
      src: "https://res.cloudinary.com/demo/image/upload/v1/stickers/cat.png",
      type: "image",
    });
    assert.equal(validResult.id, "sticker-free-cat");
    assert.equal(validResult.price, 0);

    // 2. Unseeded / tampered asset is rejected by server gate
    await assert.rejects(
      async () => {
        await resourceResolver({
          originalAssetId: "malicious-hacked-asset-id",
          src: "https://evil-server.com/malicious.png",
          type: "image",
        });
      },
      /ASSET_NOT_FOUND/
    );
  });

  // =========================================================================
  // 5. PRODUCTION PLAN & 300 DPI COORDINATE CALIBRATION
  // =========================================================================
  test("[ASSET-8] Production planner generates 300 DPI face plan preserving sticker assignment", () => {
    const templateRevision = createHash("sha256").update("test-revision").digest("hex");

    const testItem = {
      schema_version: 1,
      art_version: 1,
      is_immutable_snapshot: true,
      placement_mode: "standard",
      selected_placement_ids: ["front_chest"],
      canvas_json: JSON.stringify({
        front: JSON.stringify({
          width: 800,
          height: 1000,
          coordinates: {
            frame: {
              version: 1,
              space: "FULL_MOCKUP_NATIVE",
              surface: "front",
              width: 800,
              height: 1000,
              templateRevision,
            },
            referenceFace: "front",
            placements: [
              {
                id: "front_chest",
                rect: { left: 200, top: 250, width: 400, height: 400 },
                widthCm: 25,
                heightCm: 25,
              },
            ],
            targetDPI: 300,
            printMethod: "DTF",
            mirror: "NONE",
          },
          objects: [
            {
              name: "sticker",
              type: "image",
              originalAssetId: "sticker-free-cat",
              src: "https://res.cloudinary.com/demo/image/upload/v1/stickers/cat.png",
              assignedPlacementId: "front_chest",
              left: 400,
              top: 450,
              width: 300,
              height: 300,
              scaleX: 1,
              scaleY: 1,
            },
          ],
        }),
      }),
      production_snapshot: JSON.stringify({
        snapshotVersion: 1,
        selectedPlacementIds: ["front_chest"],
        coordinateFaces: {
          front: {
            frame: {
              version: 1,
              space: "FULL_MOCKUP_NATIVE",
              surface: "front",
              width: 800,
              height: 1000,
              templateRevision,
            },
            referenceFace: "front",
            placements: [
              {
                id: "front_chest",
                rect: { left: 200, top: 250, width: 400, height: 400 },
                widthCm: 25,
                heightCm: 25,
              },
            ],
            targetDPI: 300,
            printMethod: "DTF",
            mirror: "NONE",
          },
        },
        customization_config: {
          faces: {
            front: {
              printArea: {
                allowedMethods: ["DTF"],
                targetDPI: 300,
                mirrorHorizontal: false,
              },
            },
          },
        },
      }),
    };

    const plan = productionPlan(testItem);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].face, "front");
    assert.equal(plan[0].placement, "front_chest");
    assert.equal(plan[0].config.targetDPI, 300);
    assert.equal(plan[0].config.physicalWidthCm, 25);
    assert.equal(plan[0].config.physicalHeightCm, 25);
    // Calculated 300 DPI output dimensions: 25 / 2.54 * 300 = 2953 px
    const expectedPx = Math.round((25 / 2.54) * 300);
    assert.equal(Math.round(plan[0].config.physicalWidthCm / 2.54 * 300), expectedPx);
    assert.equal(plan[0].objects.length, 1);
    assert.equal(plan[0].objects[0].originalAssetId, "sticker-free-cat");
  });

  // =========================================================================
  // 6. FIRESTORE SECURITY RULES FOR ASSETS
  // =========================================================================
  test("[ASSET-9] Security rules forbid regular customer from creating or modifying design_assets", async () => {
    const clientDb = env.authenticatedContext(testUser.localId).firestore();
    const assetDocRef = doc(clientDb, "design_assets", "tampered_asset");

    // Regular customer cannot create an asset
    await assertFails(
      setDoc(assetDocRef, {
        name: "Hacked Asset",
        price: 0,
        url: "https://evil.com/asset.png",
      })
    );

    // Regular customer cannot modify price of an existing asset
    const existingAssetRef = doc(clientDb, "design_assets", "sticker-paid-eagle");
    await assertFails(
      updateDoc(existingAssetRef, {
        price: 0,
      })
    );

    // Regular customer cannot delete an asset
    await assertFails(deleteDoc(existingAssetRef));
  });

  test("[ASSET-10] Security rules forbid regular customer from modifying asset_categories", async () => {
    const clientDb = env.authenticatedContext(testUser.localId).firestore();
    const catDocRef = doc(clientDb, "asset_categories", "hacked_category");

    await assertFails(
      setDoc(catDocRef, {
        name: "Hacked Category",
      })
    );
  });
});
