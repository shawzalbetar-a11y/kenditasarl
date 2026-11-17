import { NextResponse } from "next/server";
import { authorize, serverDb } from "../../../../../lib/server/cloudinaryServer";
import { checkoutRequest } from "../../../../../lib/server/checkout";
import { getPlacementsForGarment } from "../../../../../lib/printPlacementConfig";
import {
  type MatchingBundleDraft,
  type MatchingBundleItem,
  digest,
} from "../../../../../lib/matchingCollections";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const uid = await authorize(request, false, false);
  if (typeof uid === "number") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: uid });
  }

  try {
    let body: any = null;
    try {
      const text = await request.text();
      if (text && text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    if (body && typeof body === "object") {
      if (body.userId && body.userId !== uid) {
        return NextResponse.json({ error: "FORBIDDEN", message: "User ID mismatch" }, { status: 403 });
      }
    }

    const db = serverDb();
    const bundleRef = db.collection("matching_bundle_drafts").doc(params.id);
    const snap = await bundleRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const bundleData = snap.data() as MatchingBundleDraft;
    if (bundleData.userId !== uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Gate C.3 & R2: Idempotency & duplicate submission check
    const idempotencyKey =
      request.headers.get("x-idempotency-key") ||
      request.headers.get("idempotency-key") ||
      null;

    const payloadHash = digest({
      bundleId: params.id,
      body: body || null,
    });

    const bundleAny = bundleData as any;
    if (
      bundleData.status === "added_to_cart" &&
      Array.isArray(bundleAny.cartItemIds) &&
      bundleAny.cartItemIds.length > 0
    ) {
      if (idempotencyKey && bundleAny.lastIdempotencyKey === idempotencyKey) {
        if (bundleAny.lastPayloadHash && bundleAny.lastPayloadHash !== payloadHash) {
          return NextResponse.json(
            {
              error: "IDEMPOTENCY_PAYLOAD_MISMATCH",
              message: "Aynı idempotency anahtarı farklı bir istek gövdesi ile tekrar kullanılamaz",
            },
            { status: 409 }
          );
        }
        return NextResponse.json({
          ok: true,
          cartItemIds: bundleAny.cartItemIds,
          bundleId: params.id,
          itemCount: bundleAny.cartItemIds.length,
          idempotentReplay: true,
        });
      }
      return NextResponse.json(
        {
          error: "BUNDLE_ALREADY_CONVERTED",
          message: "Bu koleksiyon zaten sepete eklendi",
        },
        { status: 409 }
      );
    }

    if (bundleData.status === "converting") {
      return NextResponse.json(
        {
          error: "CONVERSION_IN_PROGRESS",
          message: "Koleksiyon sepete dönüştürülüyor, lütfen bekleyin",
        },
        { status: 409 }
      );
    }

    // Gate C.1: Verify master design ownership and revision integrity server-side
    const masterRef = db.collection("master_designs").doc(bundleData.masterDesignId);
    const masterSnap = await masterRef.get();
    if (!masterSnap.exists) {
      return NextResponse.json(
        { error: "MASTER_DESIGN_NOT_FOUND", message: "Ortak tasarım bulunamadı" },
        { status: 400 }
      );
    }
    const masterData = masterSnap.data()!;
    if (masterData.userId !== uid) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Ortak tasarım sahibi değilsiniz" },
        { status: 403 }
      );
    }
    if (
      masterData.revision !== bundleData.masterRevision ||
      masterData.revisionHash !== bundleData.masterRevisionHash
    ) {
      return NextResponse.json(
        {
          error: "STALE_MASTER_REVISION",
          message: "Ortak tasarım revizyonu güncel değil, lütfen tasarımı yenileyin",
        },
        { status: 409 }
      );
    }

    const itemsSnap = await bundleRef.collection("items").get();
    const items = itemsSnap.docs.map((d) => d.data() as MatchingBundleItem);

    if (items.length === 0) {
      return NextResponse.json(
        { error: "EMPTY_BUNDLE", message: "Koleksiyonda en az 1 ürün bulunmalıdır" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const lines = [];

    // Step 1: Validate each item and persist target design instance
    for (const item of items) {
      if (item.validationStatus === "out_of_bounds") {
        return NextResponse.json(
          {
            error: "OUT_OF_BOUNDS",
            message: `${item.roleLabel || item.productTitle}: ${item.validationError || "Tasarım baskı alanı dışına taşıyor"}`,
            itemId: item.id,
          },
          { status: 400 }
        );
      }

      // Check product and variant existence
      const prodDoc = await db.collection("products").doc(item.productId).get();
      if (!prodDoc.exists) {
        return NextResponse.json(
          { error: "PRODUCT_NOT_FOUND", message: `Ürün bulunamadı: ${item.productId}` },
          { status: 400 }
        );
      }

      // Verify template revision is still valid
      const publishedRevision = prodDoc.data()?.print_template_revision;
      if (publishedRevision && item.templateRevisionId) {
        if (publishedRevision !== item.templateRevisionId) {
          return NextResponse.json(
            {
              error: "TEMPLATE_STALE",
              message: `${item.productTitle}: Baskı şablonu güncellenmiş, lütfen tasarımı yenileyin`,
              itemId: item.id,
            },
            { status: 409 }
          );
        }
      }

      const variantDoc = await db
        .collection(`products/${item.productId}/variants`)
        .doc(item.variantDocId)
        .get();
      if (!variantDoc.exists) {
        return NextResponse.json(
          { error: "VARIANT_NOT_FOUND", message: `Varyant bulunamadı: ${item.variantDocId}` },
          { status: 400 }
        );
      }

      const variantData = variantDoc.data()!;
      const stock = variantData.sizes?.[item.size] ?? variantData.stock ?? 0;
      if (stock < item.quantity) {
        return NextResponse.json(
          {
            error: "OUT_OF_STOCK",
            message: `${item.productTitle} (${item.size}) için yetersiz stok: mevcut ${stock}`,
            itemId: item.id,
          },
          { status: 400 }
        );
      }

      // Create target design instance in designs collection
      const targetDesignId = `bundle_${params.id}_${item.id}`;
      const targetDesignRef = db.collection("designs").doc(targetDesignId);
      
      const productFaces = prodDoc.data()?.customization_config?.faces || {};
      const printArea = productFaces[item.face]?.printArea || {
        left: item.targetPlacementRect.x,
        top: item.targetPlacementRect.y,
        width: item.targetPlacementRect.width,
        height: item.targetPlacementRect.height,
      };

      const customizationConfig = {
        enabled: true,
        garmentType:
          prodDoc.data()?.customization_config?.garmentType ||
          prodDoc.data()?.category_id ||
          "tshirt",
        faces: {
          ...productFaces,
          [item.face]: {
            enabled: true,
            printArea,
            activePlacements: [item.placementId],
            mockup: prodDoc.data()?.images?.[0]?.url || "",
          },
        },
      };

      const productionSnapshot =
        item.productionSnapshot ||
        JSON.stringify({
          snapshotVersion: 1,
          printAreas: { [item.face]: printArea },
          customization_config: customizationConfig,
        });

      const parsedCanvas = (() => {
        try {
          let c =
            typeof item.canvasJson === "string"
              ? JSON.parse(item.canvasJson)
              : item.canvasJson;
          while (typeof c === "string") {
            c = JSON.parse(c);
          }
          return c?.objects ? c : { objects: [] };
        } catch {
          return { objects: [] };
        }
      })();

      const formattedCanvasJson = JSON.stringify(
        JSON.stringify({
          [`${item.color}:::${item.face}`]: JSON.stringify(parsedCanvas),
        })
      );

      const garmentPlacements = getPlacementsForGarment(
        prodDoc.data()?.customization_config?.garmentType ||
          prodDoc.data()?.category_id ||
          "tshirt"
      );
      const matchedPlacement = garmentPlacements.find(
        (p) => p.id === item.placementId
      );
      const selectedPlacementIds = matchedPlacement ? [matchedPlacement.id] : [];

      await targetDesignRef.set(
        {
          user_id: uid,
          product_id: item.productId,
          is_template: false,
          canvas_json: formattedCanvasJson,
          production_snapshot: productionSnapshot,
          placement_mode: "custom",
          selected_placement_ids: selectedPlacementIds,
          color: item.color,
          preview_image_url: item.previewUrl || null,
          preview_images: item.previewUrl ? { [item.face]: item.previewUrl } : {},
          updated_at: now,
          created_at: now,
          // Provenance metadata
          master_design_id: bundleData.masterDesignId,
          master_revision: bundleData.masterRevision,
          master_revision_hash: bundleData.masterRevisionHash,
          bundle_id: params.id,
          bundle_item_id: item.id,
          role_label: item.roleLabel || null,
        },
        { merge: true }
      );

      lines.push({
        product_id: item.productId,
        variant_id: `${item.color}_${item.size}`,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        design_id: targetDesignId,
        design_type: "custom",
        bundle_id: params.id,
        bundle_item_id: item.id,
        role_label: item.roleLabel || undefined,
        master_design_id: bundleData.masterDesignId,
        master_revision: bundleData.masterRevision,
        master_revision_hash: bundleData.masterRevisionHash,
        instance_revision_id: item.templateRevisionId,
      });
    }

    // Claim conversion atomically to prevent concurrent race conditions
    await bundleRef.update({
      status: "converting",
      lastIdempotencyKey: idempotencyKey || null,
      lastPayloadHash: payloadHash,
      conversionStartedAt: now,
      updatedAt: now,
    });

    // Step 2: Invoke authoritative 03B checkoutRequest "add"
    const addReq = new Request("http://localhost/api/cart/add", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: request.headers.get("authorization") || "",
      },
      body: JSON.stringify({ lines }),
    });

    const addRes = await checkoutRequest(addReq, "add");
    const result = await addRes.json();

    if (addRes.status !== 200 || result.error) {
      // Roll back conversion status on failure
      await bundleRef.update({
        status: "draft",
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
      return NextResponse.json(
        { error: result.error || "ADD_TO_CART_FAILED", line: result.line },
        { status: addRes.status || 400 }
      );
    }

    // Mark bundle as added_to_cart with recorded cartItemIds and idempotency key
    await bundleRef.update({
      status: "added_to_cart",
      cartItemIds: result.ids,
      lastIdempotencyKey: idempotencyKey || null,
      lastPayloadHash: payloadHash,
      updatedAt: now,
    });

    return NextResponse.json({
      ok: true,
      cartItemIds: result.ids,
      bundleId: params.id,
      itemCount: lines.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to add bundle to cart" },
      { status: 500 }
    );
  }
}
