export type MugStyle = 'standard' | 'magic' | 'inner_color';

export interface MugMeta {
  mugStyle: MugStyle;
  mugCapacities: string[];
  magicRevealCoverColor: string;
  handleMarginCm: number;
  supportsFullWrap: boolean;
}

/**
 * Normalizes mug-specific product metadata (Classic, Magic Heat-Reveal, Colored Handle/Inner Rim,
 * available capacities like 11oz / 15oz) from Firestore product documents or studio snapshot configs.
 */
export function resolveMugMeta(productData?: any): MugMeta {
  const rawMeta =
    productData?.mug_meta ||
    productData?.mugMeta ||
    productData?.customization_config?.mug_meta ||
    productData?.customization_config?.mugMeta ||
    productData?.config?.mug_meta ||
    {};

  const rawStyle = String(
    rawMeta?.mugStyle ?? rawMeta?.mug_style ?? productData?.mug_style ?? ''
  ).toLowerCase();

  let mugStyle: MugStyle = 'standard';
  if (rawStyle === 'magic' || rawStyle === 'color_changing' || rawStyle === 'sihirli') {
    mugStyle = 'magic';
  } else if (rawStyle === 'inner_color' || rawStyle === 'colored_handle' || rawStyle === 'two_tone') {
    mugStyle = 'inner_color';
  } else {
    const titleHint = [
      productData?.title_ar,
      productData?.title_tr,
      productData?.title_en,
      productData?.title,
      productData?.slug
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (/(magic|sihirli|سحري|سحرى|حراري)/i.test(titleHint)) {
      mugStyle = 'magic';
    } else if (/(inner|colored handle|renkli kulp|مقبض ملون|ملون الداخل)/i.test(titleHint)) {
      mugStyle = 'inner_color';
    }
  }

  const rawCaps = Array.isArray(rawMeta?.mugCapacities)
    ? rawMeta.mugCapacities
    : Array.isArray(rawMeta?.capacities)
      ? rawMeta.capacities
      : ['11oz'];
  const normalizedCaps = rawCaps
    .map((c: any) => String(c || '').trim())
    .filter(Boolean);

  const magicRevealCoverColor =
    typeof rawMeta?.magicRevealCoverColor === 'string' && rawMeta.magicRevealCoverColor.trim()
      ? rawMeta.magicRevealCoverColor.trim()
      : '#141414';

  const rawHandleMargin = Number(rawMeta?.handleMarginCm);
  const handleMarginCm =
    Number.isFinite(rawHandleMargin) && rawHandleMargin > 0
      ? Math.min(1.0, rawHandleMargin)
      : 1.0;

  return {
    mugStyle,
    mugCapacities: normalizedCaps.length > 0 ? normalizedCaps : ['11oz'],
    magicRevealCoverColor,
    handleMarginCm,
    supportsFullWrap: rawMeta?.supportsFullWrap !== false,
  };
}
