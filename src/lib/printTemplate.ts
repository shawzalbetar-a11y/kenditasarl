import { resolveMugMeta, type MugMeta } from "./mugMeta";
import { z } from "zod/v3";
import {
  getPlacementsForGarment,
  isFaceMatching,
} from "./printPlacementConfig";

const key = z
  .string()
  .min(1)
  .max(150)
  .regex(/^[\w#.-]+$/)
  .refine(
    (s) =>
      ![".", "..", "prototype"].includes(s) &&
      !Object.hasOwn(Object.prototype, s),
  );
const px = z.number().finite().int().min(0).max(16384);
const cm = z.number().finite().min(0).max(1000);
const rectangle = z
  .object({ left: px, top: px, width: px, height: px })
  .strict();
export const policySchema = z
  .object({
    allowCustomerUpload: z.boolean(),
    allowText: z.boolean(),
    allowStickers: z.boolean(),
    allowLayers: z.boolean(),
    maxElements: z.number().int().min(1).max(500),
    maxUploads: z.number().int().min(0).max(500),
  })
  .strict();
export const initialPolicy = {
  allowCustomerUpload: true,
  allowText: true,
  allowStickers: true,
  allowLayers: true,
  maxElements: 100,
  maxUploads: 10,
};
export type Policy = z.infer<typeof policySchema>;
const placement = z
  .object({
    id: key,
    rect: rectangle,
    widthCm: cm,
    heightCm: cm,
    policy: policySchema,
  })
  .strict();
const face = z
  .object({
    id: z.enum([
      "front",
      "back",
      "left_shoulder",
      "right_shoulder",
      "other",
      "collar",
    ]),
    space: z.enum([
      "FULL_MOCKUP_NATIVE",
      "PRINT_AREA_LOCAL",
      "STANDALONE_SURFACE",
    ]),
    mockup: z.string().max(2048),
    nativeWidth: px,
    nativeHeight: px,
    dpi: z.number().finite().int().min(0).max(1200),
    mirror: z.enum(["NONE", "OUTPUT_HORIZONTAL"]).nullable(),
    safeArea: z
      .object({
        unit: z.literal("px"),
        reference: z.literal("SURFACE_TOP_LEFT"),
        rect: rectangle,
      })
      .strict()
      .optional(),
    placements: z.array(placement).max(24),
  })
  .strict();
export const templateSchema = z
  .object({
    schemaVersion: z.literal(1),
    productId: key,
    garmentType: z.enum([
      "tshirt",
      "hoodie",
      "sweatshirt",
      "mug",
      "hat",
      "phone_case",
      "generic",
    ]),
    variantIds: z.array(key).max(100),
    method: z.enum(["DTF", "Sublimation"]),
    allowFreeMode: z.boolean(),
    mugMeta: z
      .object({
        mugStyle: z.enum(["standard", "inner_color", "magic"]),
        mugCapacities: z.array(z.string().max(25)).max(20),
        magicRevealCoverColor: z.string().regex(/^#[a-f0-9]{3,8}$/i),
        handleMarginCm: z.number().positive().max(1),
        supportsFullWrap: z.boolean(),
      })
      .strict()
      .optional(),
    policy: policySchema,
    faces: z.array(face).max(8),
  })
  .strict();
const revisionId = z.string().regex(/^[a-f0-9]{64}$/);
export const publishedTemplateSchema = z
  .object({
    definition: templateSchema,
    status: z.literal("PUBLISHED"),
    revision: revisionId,
  })
  .strict();
export const draftTemplateSchema = z
  .object({
    revision: z.number().int().positive(),
    definition: templateSchema,
    updatedAt: z.unknown(),
    actor: z.string().min(1).max(128),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
    previousRevision: revisionId.nullable(),
  })
  .strict();
export type TemplateDraft = z.infer<typeof draftTemplateSchema>;
export type PublishedTemplateRevision = z.infer<typeof publishedTemplateSchema>;
export type PrintTemplate = z.infer<typeof templateSchema>;
export type Surface = PrintTemplate["faces"][number];
export type Placement = Surface["placements"][number];
export const catalogProductSchema = z
  .object({ id: key, category: z.string().max(160), published: z.boolean() })
  .strict();
export const catalogVariantSchema = z
  .object({
    id: key,
    sku: z.string().max(150),
    color: z.string().max(100),
    model: z.string().max(160),
    sizes: z.array(z.string().max(80)).max(100),
  })
  .strict();
export type Binding = {
  face: string;
  url: string;
  variantIds: string[];
  nativeWidth?: number;
  nativeHeight?: number;
};
export type Catalog = {
  product: z.infer<typeof catalogProductSchema>;
  variants: z.infer<typeof catalogVariantSchema>[];
  productId: string;
  garmentType: PrintTemplate["garmentType"];
  variantIds: string[];
  mugMeta?: MugMeta;
  bindings: Binding[];
};
export function safeMockup(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2048) return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash
    );
  } catch {
    return false;
  }
}
export function catalogBindings(
  productId: string,
  garmentType: Catalog["garmentType"],
  product: Record<string, any>,
  variants: Record<string, any>[],
): Catalog {
  const bindings: Binding[] = [];
  const ids = variants.map((v) => v.id);
  function bind(
    face: string,
    url: unknown,
    applicable: string[],
    geometry?: Record<string, any>,
  ) {
    if (!safeMockup(url) || !face || !applicable.length) return;
    face = isFaceMatching(face, "left")
      ? "left_shoulder"
      : isFaceMatching(face, "right")
        ? "right_shoulder"
        : face;
    const old = bindings.find((b) => b.face === face && b.url === url);
    if (old)
      old.variantIds = Array.from(new Set([...old.variantIds, ...applicable]));
    else
      bindings.push({
        face,
        url,
        variantIds: applicable,
        ...(geometry?.nativeWidth > 0 && geometry?.nativeHeight > 0
          ? {
              nativeWidth: geometry!.nativeWidth,
              nativeHeight: geometry!.nativeHeight,
            }
          : {}),
      });
  }
  for (const i of product.images || [])
    if (i?.type === "blank")
      bind(
        i.face,
        i.url,
        i.colorHex
          ? variants
              .filter((v) =>
                [v.hex, v.color].some(
                  (c) => c?.toLowerCase() === i.colorHex.toLowerCase(),
                ),
              )
              .map((v) => v.id)
          : ids,
        i.printArea,
      );
  for (const [f, url] of Object.entries(product.base_images || {}))
    bind(f, url, ids);
  for (const v of variants) {
    for (const [f, url] of Object.entries(v.base_images || {}))
      bind(f, url, [v.id]);
    bind("front", v.blank_image_front || v.mockup_front, [v.id]);
    bind("back", v.blank_image_back || v.mockup_back, [v.id]);
  }
  const skuVariants = variants.map((v) =>
    catalogVariantSchema.parse({
      id: v.id,
      sku: String(v.sku ?? v.id),
      color: String(v.hex || v.color || ""),
      model: String(v.model || ""),
      sizes: v.sizes ? Object.keys(v.sizes) : v.size ? [String(v.size)] : [],
    }),
  );
  const catalogProduct = catalogProductSchema.parse({
    id: productId,
    category: String(product.category_id || product.category || garmentType),
    published: product.is_active === true || product.isActive === true,
  });
  return {
    product: catalogProduct,
    variants: skuVariants,
    productId,
    garmentType,
    variantIds: ids,
    bindings,
    ...(garmentType === "mug" ? { mugMeta: resolveMugMeta(product) } : {}),
  };
}
export function validateTemplate(t: PrintTemplate, c: Catalog): string[] {
  const errors = new Set<string>(),
    seen = new Set<string>(),
    faces = new Set<string>();
  if (
    t.productId !== c.productId ||
    t.garmentType !== c.garmentType ||
    !t.variantIds.length ||
    new Set(t.variantIds).size !== t.variantIds.length ||
    t.variantIds.some((v) => !c.variantIds.includes(v))
  )
    errors.add("variant");
  if (
    (t.garmentType === "mug") !== !!t.mugMeta ||
    (t.mugMeta &&
      (t.mugMeta.supportsFullWrap !== c.mugMeta?.supportsFullWrap ||
        t.mugMeta.handleMarginCm !== c.mugMeta?.handleMarginCm))
  )
    errors.add("space");
  if (!t.faces.some((f) => f.id === "front")) errors.add("face");
  for (const f of t.faces) {
    if (faces.has(f.id) || !f.placements.length) errors.add("face");
    faces.add(f.id);
    const binding = c.bindings.find(
      (b) => b.url === f.mockup && b.face === f.id,
    );
    if (!binding || t.variantIds.some((id) => !binding.variantIds.includes(id)))
      errors.add("mockup");
    if (
      binding?.nativeWidth &&
      f.space === "FULL_MOCKUP_NATIVE" &&
      (f.nativeWidth !== binding.nativeWidth ||
        f.nativeHeight !== binding.nativeHeight)
    )
      errors.add("calibration");
    if (!f.nativeWidth || !f.nativeHeight || !f.dpi || f.mirror === null)
      errors.add("calibration");
    if (f.space === "PRINT_AREA_LOCAL") errors.add("space");
    if (
      t.allowFreeMode &&
      (f.placements.length !== 1 || f.space !== "FULL_MOCKUP_NATIVE")
    )
      errors.add("free");
    for (const p of f.placements) {
      const r = p.rect;
      if (
        seen.has(p.id) ||
        !getPlacementsForGarment(t.garmentType, f.id).some((s) => s.id === p.id)
      )
        errors.add("placement");
      seen.add(p.id);
      if (
        !r.width ||
        !r.height ||
        r.left + r.width > f.nativeWidth ||
        r.top + r.height > f.nativeHeight
      )
        errors.add("bounds");
      if (
        !p.widthCm ||
        !p.heightCm ||
        Math.abs(p.widthCm / p.heightCm / (r.width / r.height) - 1) > 0.001
      )
        errors.add("ratio");
      const [w, h] = outputSize(p, f);
      if (Math.min(w, h) < 1 || Math.max(w, h) > 16384 || w * h > 64000000)
        errors.add("output");
      if (f.safeArea) {
        const s = f.safeArea.rect;
        if (
          f.placements.length !== 1 ||
          r.left ||
          r.top ||
          r.width !== f.nativeWidth ||
          r.height !== f.nativeHeight ||
          !s.width ||
          !s.height ||
          s.left + s.width > r.width ||
          s.top + s.height > r.height
        )
          errors.add("safe");
      }
      const wrap = f.space === "STANDALONE_SURFACE";
      if (
        wrap !== (p.id === "mug_full_wrap") ||
        (wrap &&
          (!t.mugMeta?.supportsFullWrap ||
            f.id !== "front" ||
            f.nativeWidth !== 1840 ||
            f.nativeHeight !== 760 ||
            r.left ||
            r.top ||
            r.width !== 1840 ||
            r.height !== 760 ||
            p.widthCm !== 23 ||
            p.heightCm !== 9.5 ||
            t.faces.length !== 1))
      )
        errors.add("space");
    }
  }
  return Array.from(errors);
}
export const outputSize = (p: Placement, f: Surface) => [
  Math.round((p.widthCm / 2.54) * f.dpi),
  Math.round((p.heightCm / 2.54) * f.dpi),
];
export function effectivePolicy(base: Policy, placement?: Policy): Policy {
  if (!placement) return base;
  return {
    allowCustomerUpload:
      base.allowCustomerUpload && placement.allowCustomerUpload,
    allowStickers: base.allowStickers && placement.allowStickers,
    allowText: base.allowText && placement.allowText,
    allowLayers: base.allowLayers && placement.allowLayers,
    maxUploads: Math.min(base.maxUploads, placement.maxUploads),
    maxElements: Math.min(base.maxElements, placement.maxElements),
  };
}
// Feed the existing coordinate, checkout and production contracts from one immutable definition.
export function templateConfig(t: PrintTemplate, revision: string) {
  const calibratedPlacements = Object.fromEntries(
    t.faces.flatMap((f) =>
      f.placements.map((p) => [
        p.id,
        {
          placementId: p.id,
          x: p.rect.left,
          y: p.rect.top,
          width: p.rect.width,
          height: p.rect.height,
          nativeWidth: f.nativeWidth,
          nativeHeight: f.nativeHeight,
          physicalWidthCm: p.widthCm,
          physicalHeightCm: p.heightCm,
        },
      ]),
    ),
  );
  const faces = Object.fromEntries(
    t.faces.map((f) => {
      const p = f.placements[0];
      return [
        f.id,
        {
          name: f.id,
          enabled: true,
          printArea: {
            id: f.id,
            name: f.id,
            ...p.rect,
            ...(f.safeArea
              ? { safeArea: { ...f.safeArea.rect, shape: "rect" } }
              : {}),
            nativeWidth: f.nativeWidth,
            nativeHeight: f.nativeHeight,
            physicalWidthCm: p.widthCm,
            physicalHeightCm: p.heightCm,
            targetDPI: f.dpi,
            mirrorHorizontal: f.mirror === "OUTPUT_HORIZONTAL",
            printMethod: t.method,
          },
        },
      ];
    }),
  );
  return {
    builderRevision: revision,
    builderTemplate: t,
    ...(t.mugMeta ? { mug_meta: t.mugMeta } : {}),
    enabled: true,
    garmentType: t.garmentType,
    productType: t.garmentType,
    ...t.policy,
    allowFreeMode: t.allowFreeMode,
    defaultPrintMethod: t.method,
    allowedPrintMethods: [t.method],
    printStrategy:
      t.method === "DTF"
        ? ("dtf_only" as const)
        : ("sublimation_only" as const),
    allowedPlacements: Object.keys(calibratedPlacements),
    defaultPlacementId: t.faces.find((f) => f.id === "front")!.placements[0].id,
    faces,
    calibratedPlacements,
    freeModeBounds: t.allowFreeMode
      ? Object.fromEntries(
          t.faces.map((f) => [f.id, calibratedPlacements[f.placements[0].id]]),
        )
      : {},
  };
}
