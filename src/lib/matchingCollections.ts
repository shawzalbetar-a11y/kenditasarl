import { z } from "zod/v3";

/**
 * Kendin Tasarla — Matching Collections & Family Bundles Data Contract
 * Phase 06A authoritative schema definitions and adaptation engine.
 */

export function digest(data: unknown): string {
  const content = typeof data === "string" ? data : JSON.stringify(data);
  try {
    // Dynamic runtime resolve to ensure client bundle builds cleanly in Next.js webpack
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = eval("require")("crypto");
    if (nodeCrypto && typeof nodeCrypto.createHash === "function") {
      return nodeCrypto.createHash("sha256").update(content).digest("hex");
    }
  } catch {
    // Browser fallback
  }
  return "".padStart(64, "0");
}

// ---------------------------------------------------------------------------
// 1. Curated Collection Templates (Admin-managed)
// ---------------------------------------------------------------------------

export const localizedStringSchema = z
  .object({
    tr: z.string().min(1).max(200),
    ar: z.string().min(1).max(200),
    en: z.string().min(1).max(200),
  })
  .strict();
export type LocalizedString = z.infer<typeof localizedStringSchema>;

export const suggestedRoleSchema = z
  .object({
    id: z.string().min(1).max(50),
    label: localizedStringSchema,
    defaultProductId: z.string().max(100).optional(),
  })
  .strict();
export type SuggestedRole = z.infer<typeof suggestedRoleSchema>;

export const matchingCollectionTemplateSchema = z
  .object({
    id: z.string().min(1).max(100),
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    title: localizedStringSchema,
    description: localizedStringSchema,
    badge: localizedStringSchema.optional(),
    coverImageUrl: z.string().url().max(1000),
    allowedProductIds: z.array(z.string().min(1).max(100)).min(1).max(50),
    suggestedRoles: z.array(suggestedRoleSchema).min(1).max(20),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(10000),
    createdAt: z.string().max(100),
    updatedAt: z.string().max(100),
  })
  .strict();
export type MatchingCollectionTemplate = z.infer<
  typeof matchingCollectionTemplateSchema
>;

// ---------------------------------------------------------------------------
// 2. Master Design (Customer-owned reusable logical artwork)
// ---------------------------------------------------------------------------

export const masterAssetSchema = z
  .object({
    id: z.string().min(1).max(150),
    type: z.enum(["sticker", "upload", "text", "shape"]),
    url: z.string().max(1000).optional(),
    priceMinor: z.number().int().min(0).max(1000000).optional(),
    name: z.string().max(200).optional(),
    placementUsage: z.array(z.string().max(50)).optional(),
  })
  .strict();
export type MasterAsset = z.infer<typeof masterAssetSchema>;

export const masterCanvasDataSchema = z
  .object({
    version: z.string().max(50).optional(),
    objects: z.array(z.record(z.any())).max(500),
    referenceBounds: z
      .object({
        width: z.number().finite().positive().max(16384),
        height: z.number().finite().positive().max(16384),
      })
      .strict(),
  })
  .strict();
export type MasterCanvasData = z.infer<typeof masterCanvasDataSchema>;

export const masterDesignSchema = z
  .object({
    id: z.string().min(1).max(100),
    userId: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    revision: z.number().int().min(1).max(100000),
    revisionHash: z.string().length(64),
    canvasData: masterCanvasDataSchema,
    assets: z.array(masterAssetSchema).max(500),
    previewUrl: z.string().max(1000).optional(),
    createdAt: z.string().max(100),
    updatedAt: z.string().max(100),
  })
  .strict();
export type MasterDesign = z.infer<typeof masterDesignSchema>;

// ---------------------------------------------------------------------------
// 3. Bundle Item / Target Design Instance
// ---------------------------------------------------------------------------

export const placementRectSchema = z
  .object({
    x: z.number().finite().min(0).max(16384),
    y: z.number().finite().min(0).max(16384),
    width: z.number().finite().positive().max(16384),
    height: z.number().finite().positive().max(16384),
  })
  .strict();
export type PlacementRect = z.infer<typeof placementRectSchema>;

export const bundleItemMappingSchema = z
  .object({
    scale: z.number().finite().positive().max(100),
    offsetX: z.number().finite().min(-10000).max(10000),
    offsetY: z.number().finite().min(-10000).max(10000),
    rotation: z.number().finite().min(-360).max(360).default(0),
    targetPlacementRect: placementRectSchema,
  })
  .strict();
export type BundleItemMapping = z.infer<typeof bundleItemMappingSchema>;

export const matchingBundleItemSchema = z
  .object({
    id: z.string().min(1).max(100),
    bundleId: z.string().min(1).max(100),
    roleLabel: z.string().max(100).optional(), // Presentation only: Father, Mother, etc. Never infers size or gender!
    productId: z.string().min(1).max(100),
    productTitle: z.string().min(1).max(200),
    variantId: z.string().min(1).max(100),
    variantDocId: z.string().min(1).max(100),
    sku: z.string().min(1).max(100),
    color: z.string().min(1).max(100),
    colorHex: z.string().max(50).optional(),
    size: z.string().min(1).max(50),
    quantity: z.number().int().min(1).max(30),
    templateRevisionId: z.string().length(64),
    face: z.string().min(1).max(50),
    placementId: z.string().min(1).max(100),
    targetPlacementRect: placementRectSchema,
    mapping: bundleItemMappingSchema,
    canvasJson: z.string().min(2).max(1000000), // Fabric JSON for target placement
    previewUrl: z.string().max(1000).optional(),
    productionSnapshot: z.any().optional(),
    validationStatus: z.enum([
      "valid",
      "out_of_bounds",
      "missing_template",
      "missing_asset",
    ]),
    validationError: z.string().max(500).optional(),
    createdAt: z.string().max(100),
    updatedAt: z.string().max(100),
  })
  .strict();
export type MatchingBundleItem = z.infer<typeof matchingBundleItemSchema>;

// ---------------------------------------------------------------------------
// 4. Matching Bundle Draft (Customer Draft)
// ---------------------------------------------------------------------------

export const matchingBundleDraftSchema = z
  .object({
    id: z.string().min(1).max(100),
    userId: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    occasion: z.string().max(100).optional(),
    templateId: z.string().max(100).optional(),
    masterDesignId: z.string().min(1).max(100),
    masterRevision: z.number().int().min(1).max(100000),
    masterRevisionHash: z.string().length(64),
    status: z.enum(["draft", "ready", "converting", "added_to_cart", "ordered"]),
    cartItemIds: z.array(z.string()).max(100).optional(),
    lastIdempotencyKey: z.string().max(200).optional(),
    lastPayloadHash: z.string().max(200).optional(),
    conversionStartedAt: z.string().max(100).optional(),
    items: z.array(matchingBundleItemSchema).max(30),
    createdAt: z.string().max(100),
    updatedAt: z.string().max(100),
  })
  .strict();
export type MatchingBundleDraft = z.infer<typeof matchingBundleDraftSchema>;

// ---------------------------------------------------------------------------
// 5. Adaptation Engine: Pure Geometric Mapping
// ---------------------------------------------------------------------------

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export function computeObjectsBoundingBox(
  objects: Array<Record<string, any>>,
  fallbackBounds: { width: number; height: number } = { width: 1000, height: 1000 }
): BoundingBox {
  if (!objects || objects.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: fallbackBounds.width,
      maxY: fallbackBounds.height,
      width: fallbackBounds.width,
      height: fallbackBounds.height,
      centerX: fallbackBounds.width / 2,
      centerY: fallbackBounds.height / 2,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of objects) {
    const scaleX = typeof obj.scaleX === "number" ? obj.scaleX : 1;
    const scaleY = typeof obj.scaleY === "number" ? obj.scaleY : 1;
    const w = (typeof obj.width === "number" ? obj.width : 50) * Math.abs(scaleX);
    const h = (typeof obj.height === "number" ? obj.height : 50) * Math.abs(scaleY);

    let cx = typeof obj.left === "number" ? obj.left : 0;
    let cy = typeof obj.top === "number" ? obj.top : 0;

    // Convert Fabric.js origin to center of object
    if (obj.originX === "left" || !obj.originX) {
      cx += w / 2;
    } else if (obj.originX === "right") {
      cx -= w / 2;
    }

    if (obj.originY === "top" || !obj.originY) {
      cy += h / 2;
    } else if (obj.originY === "bottom") {
      cy -= h / 2;
    }

    // Fabric-accurate rotation handling for rotated, flipped, and grouped objects
    const angle = typeof obj.angle === "number" ? (obj.angle * Math.PI) / 180 : 0;
    let objMinX: number;
    let objMaxX: number;
    let objMinY: number;
    let objMaxY: number;

    if (angle === 0) {
      objMinX = cx - w / 2;
      objMaxX = cx + w / 2;
      objMinY = cy - h / 2;
      objMaxY = cy + h / 2;
    } else {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const hw = w / 2;
      const hh = h / 2;
      const corners = [
        { x: cx + (-hw * cos - -hh * sin), y: cy + (-hw * sin + -hh * cos) },
        { x: cx + (hw * cos - -hh * sin), y: cy + (hw * sin + -hh * cos) },
        { x: cx + (hw * cos - hh * sin), y: cy + (hw * sin + hh * cos) },
        { x: cx + (-hw * cos - hh * sin), y: cy + (-hw * sin + hh * cos) },
      ];
      objMinX = Math.min(...corners.map((c) => c.x));
      objMaxX = Math.max(...corners.map((c) => c.x));
      objMinY = Math.min(...corners.map((c) => c.y));
      objMaxY = Math.max(...corners.map((c) => c.y));
    }

    if (objMinX < minX) minX = objMinX;
    if (objMinY < minY) minY = objMinY;
    if (objMaxX > maxX) maxX = objMaxX;
    if (objMaxY > maxY) maxY = objMaxY;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX) {
    minX = 0;
    maxX = fallbackBounds.width;
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY) {
    minY = 0;
    maxY = fallbackBounds.height;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

export interface AdaptMasterDesignOptions {
  fitMode?: "contain" | "custom";
  scaleMultiplier?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  paddingFactor?: number; // e.g. 0.90 for 90% printable fill
}

export interface AdaptResult {
  canvasJson: string;
  adaptedObjects: Array<Record<string, any>>;
  mapping: BundleItemMapping;
  validationStatus: "valid" | "out_of_bounds" | "missing_template" | "missing_asset";
  validationError?: string;
}

/**
 * Adapt a Master Design to a Target Product Placement.
 * Pure function: Does NOT mutate master objects.
 * Calculates proportional scaleToFit, centers in target placement rect,
 * and verifies bounds constraints.
 */
export function adaptMasterDesignToTargetPlacement(
  masterDesign: {
    canvasData: MasterCanvasData;
  },
  targetPlacementRect: PlacementRect,
  options: AdaptMasterDesignOptions = {}
): AdaptResult {
  const masterObjects = masterDesign.canvasData.objects ?? [];
  const refBounds = masterDesign.canvasData.referenceBounds || {
    width: 1000,
    height: 1000,
  };

  const masterBox = computeObjectsBoundingBox(masterObjects, refBounds);

  // Target printable dimensions
  const targetW = targetPlacementRect.width;
  const targetH = targetPlacementRect.height;
  const targetCenterX = targetPlacementRect.x + targetW / 2;
  const targetCenterY = targetPlacementRect.y + targetH / 2;

  const paddingFactor = options.paddingFactor ?? 0.9;
  const usableW = targetW * paddingFactor;
  const usableH = targetH * paddingFactor;

  // Proportional fit calculation
  const baseScale = Math.min(usableW / masterBox.width, usableH / masterBox.height);
  const scaleMultiplier = options.scaleMultiplier ?? 1.0;
  const finalScale = baseScale * scaleMultiplier;

  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  const rotation = options.rotation ?? 0;

  const finalCenterX = targetCenterX + offsetX;
  const finalCenterY = targetCenterY + offsetY;

  // Transform each object proportionally
  const adaptedObjects: Array<Record<string, any>> = masterObjects.map(
    (orig) => {
      const copy = JSON.parse(JSON.stringify(orig));
      const origScaleX = typeof copy.scaleX === "number" ? copy.scaleX : 1;
      const origScaleY = typeof copy.scaleY === "number" ? copy.scaleY : 1;
      const origAngle = typeof copy.angle === "number" ? copy.angle : 0;

      copy.scaleX = origScaleX * finalScale;
      copy.scaleY = origScaleY * finalScale;
      copy.angle = origAngle + rotation;

      // Calculate position relative to master bounding box center
      const dx = (copy.left ?? 0) - masterBox.centerX;
      const dy = (copy.top ?? 0) - masterBox.centerY;

      copy.left = finalCenterX + dx * finalScale;
      copy.top = finalCenterY + dy * finalScale;

      return copy;
    }
  );

  const adaptedBox = computeObjectsBoundingBox(adaptedObjects, {
    width: targetPlacementRect.x + targetW,
    height: targetPlacementRect.y + targetH,
  });

  // Verify boundaries: Must fit within targetPlacementRect with small tolerance
  const tolerance = 2.0; // 2px rounding tolerance
  const minAllowedX = targetPlacementRect.x - tolerance;
  const minAllowedY = targetPlacementRect.y - tolerance;
  const maxAllowedX = targetPlacementRect.x + targetPlacementRect.width + tolerance;
  const maxAllowedY = targetPlacementRect.y + targetPlacementRect.height + tolerance;

  let validationStatus: AdaptResult["validationStatus"] = "valid";
  let validationError: string | undefined = undefined;

  if (
    adaptedBox.minX < minAllowedX ||
    adaptedBox.minY < minAllowedY ||
    adaptedBox.maxX > maxAllowedX ||
    adaptedBox.maxY > maxAllowedY
  ) {
    validationStatus = "out_of_bounds";
    validationError = `Tasarım baskı alanı sınırlarının dışına taşıyor (${Math.round(
      Math.max(
        minAllowedX - adaptedBox.minX,
        adaptedBox.maxX - maxAllowedX,
        minAllowedY - adaptedBox.minY,
        adaptedBox.maxY - maxAllowedY,
        0
      )
    )}px)`;
  }

  const mapping: BundleItemMapping = {
    scale: Number(finalScale.toFixed(4)),
    offsetX: Math.round(offsetX),
    offsetY: Math.round(offsetY),
    rotation: Math.round(rotation),
    targetPlacementRect,
  };

  const canvasJsonObj = {
    version: masterDesign.canvasData.version ?? "5.3.0",
    objects: adaptedObjects,
  };

  return {
    canvasJson: JSON.stringify(canvasJsonObj),
    adaptedObjects,
    mapping,
    validationStatus,
    validationError,
  };
}

/**
 * Validates a single bundle item before cart/checkout submission.
 */
export function validateBundleItemBeforeCart(
  item: MatchingBundleItem,
  product: { id: string; is_active?: boolean; print_template_revision?: string },
  variant: { docId: string; color: string; sizes: Record<string, number> }
): { valid: boolean; error?: string } {
  if (item.productId !== product.id) {
    return { valid: false, error: "Product ID mismatch" };
  }
  if (product.is_active === false) {
    return { valid: false, error: "Product is inactive" };
  }
  if (item.variantDocId !== variant.docId) {
    return { valid: false, error: "Variant mismatch" };
  }
  const stock = variant.sizes?.[item.size] ?? 0;
  if (stock < item.quantity) {
    return { valid: false, error: `Yetersiz stok (${item.size}): mevcut ${stock}, talep ${item.quantity}` };
  }
  if (product.print_template_revision && product.print_template_revision !== item.templateRevisionId) {
    return { valid: false, error: "Baskı şablonu güncellenmiş; lütfen yerleşimi onaylayın" };
  }
  if (item.validationStatus === "out_of_bounds") {
    return { valid: false, error: item.validationError ?? "Tasarım baskı alanı dışına taşıyor" };
  }
  return { valid: true };
}
