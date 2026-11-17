import { z } from "zod/v3";
import { PRINT_CONFIG } from "./printPlacementConfig";

export const pricingRuleFeeTypeSchema = z.enum([
  "base",
  "variant",
  "placement",
  "face",
  "asset",
  "designer_license",
  "extra",
]);
export type PricingRuleFeeType = z.infer<typeof pricingRuleFeeTypeSchema>;

export const pricingChargeScopeSchema = z.enum([
  "PER_UNIT",
  "PER_LINE",
  "PER_DESIGN_INSTANCE",
]);
export type PricingChargeScope = z.infer<typeof pricingChargeScopeSchema>;

export const pricingRuleScopeSchema = z.enum([
  "global",
  "category",
  "product",
  "variant",
  "template",
]);
export type PricingRuleScope = z.infer<typeof pricingRuleScopeSchema>;

export const pricingRuleSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z
      .object({
        ar: z.string().optional(),
        tr: z.string().optional(),
        en: z.string().optional(),
      })
      .optional(),
    feeType: pricingRuleFeeTypeSchema,
    scope: pricingRuleScopeSchema,
    productId: z.string().max(150).optional(),
    variantId: z.string().max(150).optional(),
    templateRevisionId: z.string().max(150).optional(),
    face: z.string().max(50).optional(),
    placementId: z.string().max(100).optional(),
    printMethod: z.string().max(50).optional(),
    assetId: z.string().max(300).optional(),
    amountMinor: z.number().int().min(0).max(10000000), // in kuruş (e.g. 2500 = 25.00 TRY)
    currency: z.literal("TRY"),
    chargeScope: pricingChargeScopeSchema,
    priority: z.number().int().min(0).max(1000),
    enabled: z.boolean(),
  })
  .strict();
export type PricingRule = z.infer<typeof pricingRuleSchema>;

export const quantityTierSchema = z
  .object({
    id: z.string().min(1).max(100),
    minQty: z.number().int().min(1).max(100000),
    maxQty: z.number().int().min(1).max(100000).optional(),
    discountType: z.enum(["percentage", "fixed_amount"]),
    discountValue: z.number().min(0).max(10000000), // percentage: 1..100, fixed_amount in minor kuruş
    aggregationScope: z.enum(["PER_PRODUCT", "PER_VARIANT"]),
    eligibleComponents: z
      .array(z.enum(["base", "placements", "assets", "all"]))
      .min(1),
  })
  .strict();
export type QuantityTier = z.infer<typeof quantityTierSchema>;

export const pricingPolicyDefinitionSchema = z
  .object({
    policyId: z.string().min(1).max(100),
    rules: z.array(pricingRuleSchema),
    quantityTiers: z.array(quantityTierSchema),
    defaultBasePriceMinor: z.number().int().min(0).max(10000000),
    includeFirstPlacementFree: z.boolean(),
    metadata: z.record(z.any()).optional(),
  })
  .strict();
export type PricingPolicyDefinition = z.infer<
  typeof pricingPolicyDefinitionSchema
>;

export const publishedPricingPolicySchema = z
  .object({
    revisionId: z.string().regex(/^[a-f0-9]{64}$/),
    revisionHash: z.string().regex(/^[a-f0-9]{64}$/),
    definition: pricingPolicyDefinitionSchema,
    publishedAt: z.string(),
    publishedBy: z.string(),
    schemaVersion: z.literal(1),
  })
  .strict();
export type PublishedPricingPolicy = z.infer<
  typeof publishedPricingPolicySchema
>;

export const pricingPolicyDraftSchema = z
  .object({
    revision: z.number().int().min(0),
    definition: pricingPolicyDefinitionSchema,
    updatedAt: z.string(),
    updatedBy: z.string(),
  })
  .strict();
export type PricingPolicyDraft = z.infer<typeof pricingPolicyDraftSchema>;

export const pricingPolicyPointerSchema = z
  .object({
    activeRevisionId: z.string().regex(/^[a-f0-9]{64}$/),
    revisionHash: z.string().regex(/^[a-f0-9]{64}$/),
    updatedAt: z.any().optional(),
    updatedBy: z.string().optional(),
  })
  .passthrough();
export type PricingPolicyPointer = z.infer<typeof pricingPolicyPointerSchema>;

// Deterministic Canonical JSON SHA-256
export function hashPolicyDefinition(definition: PricingPolicyDefinition): string {
  const json = JSON.stringify(definition, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
  try {
    // Dynamic runtime resolve to ensure client bundle builds cleanly in webpack
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = eval("require")("crypto");
    if (nodeCrypto && typeof nodeCrypto.createHash === "function") {
      return nodeCrypto.createHash("sha256").update(json).digest("hex");
    }
  } catch {
    // Browser fallback
  }
  return "".padStart(64, "0");
}

// Known placement set for validation
export function getKnownPlacementIds(): Set<string> {
  const set = new Set<string>();
  for (const config of Object.values(PRINT_CONFIG)) {
    for (const p of config.placements) {
      set.add(p.id);
    }
  }
  // Standard studio aliases
  set.add("left_chest");
  set.add("center_chest");
  set.add("full_front");
  set.add("back_collar");
  set.add("full_back");
  set.add("left_sleeve");
  set.add("right_sleeve");
  set.add("mug_full_wrap");
  set.add("mug_front");
  set.add("mug_back");
  set.add("hat_front_crown");
  set.add("hat_left_side");
  set.add("hat_right_side");
  set.add("hat_back_arch");
  set.add("phone_full_back");
  set.add("phone_lower_badge");
  set.add("generic_center");
  return set;
}

export function validatePricingPolicy(
  definition: PricingPolicyDefinition,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = pricingPolicyDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`Schema error at ${issue.path.join(".")}: ${issue.message}`);
    }
    return { valid: false, errors, warnings };
  }

  const knownPlacements = getKnownPlacementIds();
  const seenRuleSignatures = new Map<string, number>();

  for (const rule of definition.rules) {
    if (rule.amountMinor < 0) {
      errors.push(`Rule ${rule.id} has negative amount: ${rule.amountMinor}`);
    }
    if (rule.currency !== "TRY") {
      errors.push(`Rule ${rule.id} has invalid currency: ${rule.currency}`);
    }
    if (rule.placementId && !knownPlacements.has(rule.placementId)) {
      warnings.push(`Rule ${rule.id} references non-standard placement: ${rule.placementId}`);
    }

    // Priority collision check for active rules
    if (rule.enabled) {
      const sig = [
        rule.feeType,
        rule.scope,
        rule.productId ?? "*",
        rule.variantId ?? "*",
        rule.templateRevisionId ?? "*",
        rule.face ?? "*",
        rule.placementId ?? "*",
        rule.printMethod ?? "*",
        rule.assetId ?? "*",
      ].join("::");

      const existingPriority = seenRuleSignatures.get(sig);
      if (existingPriority !== undefined && existingPriority === rule.priority) {
        errors.push(
          `Priority collision detected: Rule "${rule.id}" shares priority ${rule.priority} with another rule for identical criteria (${sig})`,
        );
      } else {
        seenRuleSignatures.set(sig, rule.priority);
      }
    }
  }

  // Validate Quantity Tiers
  const productTiers: QuantityTier[] = [];
  const variantTiers: QuantityTier[] = [];

  for (const tier of definition.quantityTiers) {
    if (tier.minQty < 1) {
      errors.push(`Quantity tier ${tier.id} minQty must be >= 1`);
    }
    if (tier.maxQty !== undefined && tier.maxQty < tier.minQty) {
      errors.push(`Quantity tier ${tier.id} maxQty (${tier.maxQty}) cannot be less than minQty (${tier.minQty})`);
    }
    if (tier.discountType === "percentage" && (tier.discountValue <= 0 || tier.discountValue > 100)) {
      errors.push(`Quantity tier ${tier.id} percentage discount must be between 1 and 100%`);
    }
    if (tier.discountType === "fixed_amount" && tier.discountValue < 0) {
      errors.push(`Quantity tier ${tier.id} fixed discount cannot be negative`);
    }

    if (tier.aggregationScope === "PER_PRODUCT") productTiers.push(tier);
    else variantTiers.push(tier);
  }

  const checkOverlaps = (tiers: QuantityTier[], scope: string) => {
    for (let i = 0; i < tiers.length; i++) {
      for (let j = i + 1; j < tiers.length; j++) {
        const a = tiers[i];
        const b = tiers[j];
        const aMax = a.maxQty ?? Infinity;
        const bMax = b.maxQty ?? Infinity;
        if (a.minQty <= bMax && b.minQty <= aMax) {
          warnings.push(
            `Quantity tiers ${a.id} and ${b.id} overlap in ${scope} scope (${a.minQty}-${aMax} vs ${b.minQty}-${bMax}). Highest discount will apply.`,
          );
        }
      }
    }
  };

  checkOverlaps(productTiers, "PER_PRODUCT");
  checkOverlaps(variantTiers, "PER_VARIANT");

  return { valid: errors.length === 0, errors, warnings };
}

// 03B-Compatible Default Baseline Policy
export function getDefaultPricingPolicy(): PricingPolicyDefinition {
  return {
    policyId: "default",
    defaultBasePriceMinor: 20000, // 200.00 TRY
    includeFirstPlacementFree: true,
    rules: [
      // Standard Face Base Rules
      {
        id: "face_front_default",
        name: { ar: "الواجهة الأمامية", tr: "Ön Yüz", en: "Front Face" },
        feeType: "face",
        scope: "global",
        face: "front",
        amountMinor: 0,
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 10,
        enabled: true,
      },
      {
        id: "face_back_default",
        name: { ar: "الجهة الخلفية", tr: "Arka Yüz", en: "Back Face" },
        feeType: "face",
        scope: "global",
        face: "back",
        amountMinor: 3500, // 35.00 TRY
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 10,
        enabled: true,
      },
      {
        id: "face_left_shoulder_default",
        name: { ar: "الكتف / الكم الأيسر", tr: "Sol Kol", en: "Left Sleeve" },
        feeType: "face",
        scope: "global",
        face: "left_shoulder",
        amountMinor: 2000, // 20.00 TRY
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 10,
        enabled: true,
      },
      {
        id: "face_right_shoulder_default",
        name: { ar: "الكتف / الكم الأيمن", tr: "Sağ Kol", en: "Right Sleeve" },
        feeType: "face",
        scope: "global",
        face: "right_shoulder",
        amountMinor: 2000, // 20.00 TRY
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 10,
        enabled: true,
      },
      // Standard Placement Rules
      {
        id: "placement_left_chest",
        name: { ar: "شعار الصدر الأيسر", tr: "Sol Göğüs Logosu", en: "Left Chest" },
        feeType: "placement",
        scope: "global",
        placementId: "left_chest",
        amountMinor: 0,
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
      {
        id: "placement_center_chest",
        name: { ar: "وسط الصدر", tr: "Orta Göğüs", en: "Center Chest" },
        feeType: "placement",
        scope: "global",
        placementId: "center_chest",
        amountMinor: 0,
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
      {
        id: "placement_full_front",
        name: { ar: "الصدر بالكامل", tr: "Tam Ön Baskı", en: "Full Front" },
        feeType: "placement",
        scope: "global",
        placementId: "full_front",
        amountMinor: 2500, // 25.00 TRY
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
      {
        id: "placement_back_collar",
        name: { ar: "أعلى الظهر / ياقة خلفية", tr: "Ense Altı", en: "Back Collar" },
        feeType: "placement",
        scope: "global",
        placementId: "back_collar",
        amountMinor: 2000, // 20.00 TRY
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
      {
        id: "placement_full_back",
        name: { ar: "الظهر بالكامل", tr: "Tam Sırt Baskı", en: "Full Back" },
        feeType: "placement",
        scope: "global",
        placementId: "full_back",
        amountMinor: 3500, // 35.00 TRY
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
      {
        id: "placement_left_sleeve",
        name: { ar: "الكم الأيسر", tr: "Sol Kol", en: "Left Sleeve" },
        feeType: "placement",
        scope: "global",
        placementId: "left_sleeve",
        amountMinor: 2000,
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
      {
        id: "placement_right_sleeve",
        name: { ar: "الكم الأيمن", tr: "Sağ Kol", en: "Right Sleeve" },
        feeType: "placement",
        scope: "global",
        placementId: "right_sleeve",
        amountMinor: 2000,
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
      // Mug Placements
      {
        id: "placement_mug_front",
        name: { ar: "الوجه الأمامي للكوب", tr: "Kupa Ön Yüz", en: "Mug Front" },
        feeType: "placement",
        scope: "global",
        placementId: "mug_front",
        amountMinor: 0,
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
      {
        id: "placement_mug_back",
        name: { ar: "الوجه الخلفي للكوب", tr: "Kupa Arka Yüz", en: "Mug Back" },
        feeType: "placement",
        scope: "global",
        placementId: "mug_back",
        amountMinor: 3500,
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
      {
        id: "placement_mug_full_wrap",
        name: { ar: "بانوراما 360 للكوب", tr: "Kupa 360 Panorama", en: "Mug Full Wrap" },
        feeType: "placement",
        scope: "global",
        placementId: "mug_full_wrap",
        amountMinor: 2500,
        currency: "TRY",
        chargeScope: "PER_UNIT",
        priority: 20,
        enabled: true,
      },
    ],
    quantityTiers: [
      {
        id: "tier_bulk_10",
        minQty: 10,
        maxQty: 49,
        discountType: "percentage",
        discountValue: 10, // 10%
        aggregationScope: "PER_PRODUCT",
        eligibleComponents: ["base", "placements"],
      },
      {
        id: "tier_bulk_50",
        minQty: 50,
        maxQty: 99,
        discountType: "percentage",
        discountValue: 15, // 15%
        aggregationScope: "PER_PRODUCT",
        eligibleComponents: ["base", "placements"],
      },
      {
        id: "tier_bulk_100",
        minQty: 100,
        discountType: "percentage",
        discountValue: 20, // 20%
        aggregationScope: "PER_PRODUCT",
        eligibleComponents: ["base", "placements"],
      },
    ],
  };
}

// Interfaces for Price Calculation
export interface CartAssetInput {
  id: string;
  url?: string;
  face?: string;
  placementId?: string;
  priceMinor?: number; // Pre-validated asset price in minor units
}

export interface CartLineForPricing {
  lineId?: string;
  productId: string;
  productName?: string;
  variantId: string; // e.g. "red_M"
  variantDocId?: string;
  color?: string;
  size?: string;
  designType: "blank" | "ready" | "custom";
  basePriceMinor: number;
  readyPriceMinor?: number; // Declared ready-made price if set
  quantity: number;
  // Custom design details
  selectedPlacementIds?: string[];
  faces?: string[];
  printMethod?: string;
  templateRevisionId?: string;
  assets?: CartAssetInput[];
}

export interface LinePlacementBreakdown {
  placementId: string;
  face?: string;
  minor: number;
  ruleId: string;
  ruleName?: string;
}

export interface LineAssetBreakdown {
  assetId: string;
  minor: number;
  chargeScope: PricingChargeScope;
  ruleId?: string;
}

export interface LinePricingBreakdown {
  baseMinor: number;
  variantMinor: number;
  placementsMinor: number;
  placementItems: LinePlacementBreakdown[];
  assetsMinor: number;
  assetItems: LineAssetBreakdown[];
  quantityDiscountMinor: number;
  discountDetails?: {
    tierId: string;
    discountType: string;
    discountValue: number;
    aggregationScope: string;
  };
  subtotalMinor: number;
}

export interface LinePricingResult {
  lineId: string;
  productId: string;
  variantId: string;
  designType: "blank" | "ready" | "custom";
  quantity: number;
  unitMinor: number;
  totalMinor: number;
  breakdown: LinePricingBreakdown;
  appliedRules: string[];
}

export interface VersionedPricingResult {
  policyRevisionId?: string;
  currency: "TRY";
  lines: LinePricingResult[];
  subtotalMinor: number;
  totalQuantity: number;
  appliedTiers: string[];
}

// Pure Calculation Function
export function calculateVersionedPrice(
  lines: CartLineForPricing[],
  policy: PricingPolicyDefinition,
): VersionedPricingResult {
  const activeRules = policy.rules.filter((r) => r.enabled);

  // Group quantities for aggregation scopes
  const productQuantities = new Map<string, number>();
  const variantQuantities = new Map<string, number>();

  for (const line of lines) {
    productQuantities.set(
      line.productId,
      (productQuantities.get(line.productId) ?? 0) + line.quantity,
    );
    const varKey = `${line.productId}::${line.variantId}`;
    variantQuantities.set(
      varKey,
      (variantQuantities.get(varKey) ?? 0) + line.quantity,
    );
  }

  const resultLines: LinePricingResult[] = [];
  const appliedTiersSet = new Set<string>();

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineId = line.lineId ?? `line_${idx}`;
    const appliedRules: string[] = [];

    // 1. Commercial Contract: BLANK
    if (line.designType === "blank") {
      const baseMinor = line.basePriceMinor;
      const variantMinor = 0;
      const placementsMinor = 0;
      const assetsMinor = 0;

      // Quantity discount check on blank
      const aggQty =
        productQuantities.get(line.productId) ?? line.quantity;
      const tier = resolveQuantityTier(
        policy.quantityTiers,
        aggQty,
        line.productId,
        line.variantId,
        productQuantities,
        variantQuantities,
      );

      let discountMinor = 0;
      let discountDetails: LinePricingBreakdown["discountDetails"];
      if (tier && (tier.eligibleComponents.includes("base") || tier.eligibleComponents.includes("all"))) {
        appliedTiersSet.add(tier.id);
        discountMinor = calculateDiscount(baseMinor * line.quantity, tier);
        discountDetails = {
          tierId: tier.id,
          discountType: tier.discountType,
          discountValue: tier.discountValue,
          aggregationScope: tier.aggregationScope,
        };
      }

      const lineGross = baseMinor * line.quantity;
      const lineNet = Math.max(0, lineGross - discountMinor);
      const unitMinor = Math.round(lineNet / line.quantity);

      resultLines.push({
        lineId,
        productId: line.productId,
        variantId: line.variantId,
        designType: "blank",
        quantity: line.quantity,
        unitMinor,
        totalMinor: lineNet,
        appliedRules: [],
        breakdown: {
          baseMinor,
          variantMinor,
          placementsMinor,
          placementItems: [],
          assetsMinor,
          assetItems: [],
          quantityDiscountMinor: discountMinor,
          discountDetails,
          subtotalMinor: lineNet,
        },
      });
      continue;
    }

    // 2. Commercial Contract: READY
    if (line.designType === "ready") {
      // READY product has an embedded, declared ready price!
      // NEVER duplicate placement fees or asset fees on ready products!
      const readyPrice = line.readyPriceMinor ?? line.basePriceMinor;
      const baseMinor = readyPrice;
      const variantMinor = 0;
      const placementsMinor = 0;
      const assetsMinor = 0;

      const aggQty =
        productQuantities.get(line.productId) ?? line.quantity;
      const tier = resolveQuantityTier(
        policy.quantityTiers,
        aggQty,
        line.productId,
        line.variantId,
        productQuantities,
        variantQuantities,
      );

      let discountMinor = 0;
      let discountDetails: LinePricingBreakdown["discountDetails"];
      if (tier && (tier.eligibleComponents.includes("base") || tier.eligibleComponents.includes("all"))) {
        appliedTiersSet.add(tier.id);
        discountMinor = calculateDiscount(readyPrice * line.quantity, tier);
        discountDetails = {
          tierId: tier.id,
          discountType: tier.discountType,
          discountValue: tier.discountValue,
          aggregationScope: tier.aggregationScope,
        };
      }

      const lineGross = readyPrice * line.quantity;
      const lineNet = Math.max(0, lineGross - discountMinor);
      const unitMinor = Math.round(lineNet / line.quantity);

      resultLines.push({
        lineId,
        productId: line.productId,
        variantId: line.variantId,
        designType: "ready",
        quantity: line.quantity,
        unitMinor,
        totalMinor: lineNet,
        appliedRules: [],
        breakdown: {
          baseMinor,
          variantMinor,
          placementsMinor,
          placementItems: [],
          assetsMinor,
          assetItems: [],
          quantityDiscountMinor: discountMinor,
          discountDetails,
          subtotalMinor: lineNet,
        },
      });
      continue;
    }

    // 3. Commercial Contract: CUSTOM
    const baseMinor = line.basePriceMinor;
    const variantMinor = 0;

    // Placements Calculation
    const placementItems: LinePlacementBreakdown[] = [];
    const usedPlacements = line.selectedPlacementIds ?? [];
    let placementsMinor = 0;

    for (let pIdx = 0; pIdx < usedPlacements.length; pIdx++) {
      const placementId = usedPlacements[pIdx];

      // If policy includes first placement free, the first placement fee is 0
      if (policy.includeFirstPlacementFree && pIdx === 0) {
        placementItems.push({
          placementId,
          minor: 0,
          ruleId: "first_placement_free",
          ruleName: "İlk Baskı Alanı Dahil (Ücretsiz)",
        });
        continue;
      }

      // Find matching rule with highest priority
      const rule = resolvePlacementRule(activeRules, {
        placementId,
        productId: line.productId,
        variantId: line.variantId,
        templateRevisionId: line.templateRevisionId,
        printMethod: line.printMethod,
      });

      if (rule) {
        appliedRules.push(rule.id);
        placementsMinor += rule.amountMinor;
        placementItems.push({
          placementId,
          minor: rule.amountMinor,
          ruleId: rule.id,
          ruleName: rule.name?.tr ?? rule.name?.ar ?? rule.name?.en ?? rule.id,
        });
      } else {
        // Fallback default placement price (35.00 TRY if not specified)
        const defaultMinor = 3500;
        placementsMinor += defaultMinor;
        placementItems.push({
          placementId,
          minor: defaultMinor,
          ruleId: "default_fallback",
          ruleName: "Ek Baskı Alanı",
        });
      }
    }

    // Assets / Stickers Calculation
    const assetItems: LineAssetBreakdown[] = [];
    let assetsMinor = 0;
    const seenAssetInstances = new Set<string>();

    for (const asset of line.assets ?? []) {
      // Find rule or pre-validated price
      const rule = resolveAssetRule(activeRules, asset.id, line.productId);
      const feeMinor = rule ? rule.amountMinor : (asset.priceMinor ?? 0);
      const chargeScope = rule ? rule.chargeScope : "PER_DESIGN_INSTANCE";

      if (feeMinor > 0) {
        if (chargeScope === "PER_DESIGN_INSTANCE") {
          // Charged only once per distinct asset instance in the design
          if (!seenAssetInstances.has(asset.id)) {
            seenAssetInstances.add(asset.id);
            assetsMinor += feeMinor;
            assetItems.push({
              assetId: asset.id,
              minor: feeMinor,
              chargeScope,
              ruleId: rule?.id,
            });
            if (rule) appliedRules.push(rule.id);
          }
        } else if (chargeScope === "PER_UNIT") {
          // Multiplied by quantity later or tracked per unit
          assetsMinor += feeMinor;
          assetItems.push({
            assetId: asset.id,
            minor: feeMinor,
            chargeScope,
            ruleId: rule?.id,
          });
          if (rule) appliedRules.push(rule.id);
        } else if (chargeScope === "PER_LINE") {
          // Fixed per line
          if (!seenAssetInstances.has(asset.id)) {
            seenAssetInstances.add(asset.id);
            assetItems.push({
              assetId: asset.id,
              minor: feeMinor,
              chargeScope,
              ruleId: rule?.id,
            });
            if (rule) appliedRules.push(rule.id);
          }
        }
      }
    }

    // Calculate per-unit components
    const unitGross = baseMinor + variantMinor + placementsMinor;
    // Quantity discount check
    const aggQty =
      productQuantities.get(line.productId) ?? line.quantity;
    const tier = resolveQuantityTier(
      policy.quantityTiers,
      aggQty,
      line.productId,
      line.variantId,
      productQuantities,
      variantQuantities,
    );

    let eligibleTotalForDiscount = 0;
    if (tier) {
      if (tier.eligibleComponents.includes("all")) {
        eligibleTotalForDiscount = unitGross * line.quantity + assetsMinor;
      } else {
        if (tier.eligibleComponents.includes("base")) {
          eligibleTotalForDiscount += baseMinor * line.quantity;
        }
        if (tier.eligibleComponents.includes("placements")) {
          eligibleTotalForDiscount += placementsMinor * line.quantity;
        }
        if (tier.eligibleComponents.includes("assets")) {
          eligibleTotalForDiscount += assetsMinor;
        }
      }
    }

    let discountMinor = 0;
    let discountDetails: LinePricingBreakdown["discountDetails"];
    if (tier && eligibleTotalForDiscount > 0) {
      appliedTiersSet.add(tier.id);
      discountMinor = calculateDiscount(eligibleTotalForDiscount, tier);
      discountDetails = {
        tierId: tier.id,
        discountType: tier.discountType,
        discountValue: tier.discountValue,
        aggregationScope: tier.aggregationScope,
      };
    }

    const totalGross = unitGross * line.quantity + assetsMinor;
    const lineNet = Math.max(0, totalGross - discountMinor);
    const unitMinor = Math.round(lineNet / line.quantity);

    resultLines.push({
      lineId,
      productId: line.productId,
      variantId: line.variantId,
      designType: "custom",
      quantity: line.quantity,
      unitMinor,
      totalMinor: lineNet,
      appliedRules,
      breakdown: {
        baseMinor,
        variantMinor,
        placementsMinor,
        placementItems,
        assetsMinor,
        assetItems,
        quantityDiscountMinor: discountMinor,
        discountDetails,
        subtotalMinor: lineNet,
      },
    });
  }

  const subtotalMinor = resultLines.reduce((acc, l) => acc + l.totalMinor, 0);
  const totalQuantity = resultLines.reduce((acc, l) => acc + l.quantity, 0);

  return {
    currency: "TRY",
    lines: resultLines,
    subtotalMinor,
    totalQuantity,
    appliedTiers: Array.from(appliedTiersSet),
  };
}

// Rule Resolution Helpers
function resolvePlacementRule(
  rules: PricingRule[],
  context: {
    placementId: string;
    productId: string;
    variantId?: string;
    templateRevisionId?: string;
    printMethod?: string;
  },
): PricingRule | undefined {
  const matches = rules.filter((r) => {
    if (r.feeType !== "placement" && r.feeType !== "face") return false;
    if (r.placementId && r.placementId !== context.placementId) return false;
    if (r.printMethod && context.printMethod && r.printMethod.toLowerCase() !== context.printMethod.toLowerCase()) {
      return false;
    }
    if (r.scope === "variant" && r.variantId && r.variantId !== context.variantId) return false;
    if (r.scope === "product" && r.productId && r.productId !== context.productId) return false;
    if (r.scope === "template" && r.templateRevisionId && r.templateRevisionId !== context.templateRevisionId) {
      return false;
    }
    return true;
  });

  if (matches.length === 0) return undefined;

  // Sort by priority descending. Variant > Product > Template > Global
  matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const scopeWeights: Record<PricingRuleScope, number> = {
      variant: 50,
      product: 40,
      template: 30,
      category: 20,
      global: 10,
    };
    return scopeWeights[b.scope] - scopeWeights[a.scope];
  });

  return matches[0];
}

function resolveAssetRule(
  rules: PricingRule[],
  assetId: string,
  productId: string,
): PricingRule | undefined {
  const matches = rules.filter((r) => {
    if (r.feeType !== "asset") return false;
    if (r.assetId && r.assetId !== assetId) return false;
    if (r.scope === "product" && r.productId && r.productId !== productId) return false;
    return true;
  });

  if (matches.length === 0) return undefined;
  matches.sort((a, b) => b.priority - a.priority);
  return matches[0];
}

function resolveQuantityTier(
  tiers: QuantityTier[],
  quantity: number,
  productId: string,
  variantId: string,
  productQuantities: Map<string, number>,
  variantQuantities: Map<string, number>,
): QuantityTier | undefined {
  const eligibleTiers = tiers.filter((t) => {
    const aggQty =
      t.aggregationScope === "PER_PRODUCT"
        ? (productQuantities.get(productId) ?? quantity)
        : (variantQuantities.get(`${productId}::${variantId}`) ?? quantity);

    if (aggQty < t.minQty) return false;
    if (t.maxQty !== undefined && aggQty > t.maxQty) return false;
    return true;
  });

  if (eligibleTiers.length === 0) return undefined;

  // Choose tier with highest discount value
  eligibleTiers.sort((a, b) => b.discountValue - a.discountValue);
  return eligibleTiers[0];
}

function calculateDiscount(grossMinor: number, tier: QuantityTier): number {
  if (tier.discountType === "percentage") {
    const disc = Math.round(grossMinor * (tier.discountValue / 100));
    return Math.min(grossMinor, Math.max(0, disc));
  } else {
    // Fixed amount in minor units
    return Math.min(grossMinor, Math.max(0, Math.round(tier.discountValue)));
  }
}
