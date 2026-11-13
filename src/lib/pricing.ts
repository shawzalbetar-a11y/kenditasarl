import { db } from './firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

export interface PlacementPricesConfig {
  left_chest: number;
  center_chest: number;
  full_front: number;
  back_collar: number;
  full_back: number;
  left_sleeve: number;
  right_sleeve: number;
  mug_full_wrap?: number;
  mug_front?: number;
  mug_back?: number;
  hat_front_crown?: number;
  hat_left_side?: number;
  hat_right_side?: number;
  hat_back_arch?: number;
  phone_full_back?: number;
  phone_lower_badge?: number;
  generic_center?: number;
  [key: string]: number | undefined;
}

export interface PlacementRulesConfig {
  include_first_placement_free: boolean;
  extra_placement_same_face_price: number;
  free_mode_fee: number;
}

export interface PricingSettingsConfig {
  customization: {
    base_includes_first_face: boolean;
    face_prices: {
      front: number;
      back: number;
      left_shoulder: number;
      right_shoulder: number;
      collar: number;
      other: number;
      [key: string]: number;
    };
    placement_prices?: PlacementPricesConfig;
    placement_rules?: PlacementRulesConfig;
    extra_text_price: number;
    custom_upload_image_price: number;
  };
  delivery: {
    fixed_shipping_fee: number;
    is_free_shipping_enabled: boolean;
    free_shipping_threshold: number;
    express: {
      is_active: boolean;
      base_fee: number;
      flat_tier_fee: number;
      flat_tier_km: number;
      price_per_km: number;
      max_km: number;
    };
  };
  updated_at?: any;
}

export const DEFAULT_PRICING_CONFIG: PricingSettingsConfig = {
  customization: {
    base_includes_first_face: true,
    face_prices: {
      front: 0,
      back: 35,
      left_shoulder: 20,
      right_shoulder: 20,
      collar: 15,
      other: 20
    },
    placement_prices: {
      left_chest: 0,
      center_chest: 0,
      full_front: 25,
      back_collar: 20,
      full_back: 35,
      left_sleeve: 20,
      right_sleeve: 20,
      mug_full_wrap: 25,
      mug_front: 0,
      mug_back: 35,
      hat_front_crown: 0,
      hat_left_side: 20,
      hat_right_side: 20,
      hat_back_arch: 20,
      phone_full_back: 0,
      phone_lower_badge: 0,
      generic_center: 0
    },
    placement_rules: {
      include_first_placement_free: true,
      extra_placement_same_face_price: 20,
      free_mode_fee: 0
    },
    extra_text_price: 0,
    custom_upload_image_price: 0
  },
  delivery: {
    fixed_shipping_fee: 45,
    is_free_shipping_enabled: true,
    free_shipping_threshold: 500,
    express: {
      is_active: true,
      base_fee: 0,
      flat_tier_fee: 150,
      flat_tier_km: 3,
      price_per_km: 10,
      max_km: 25
    }
  }
};

let cachedPricingConfig: PricingSettingsConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 1000; // 5 seconds cache for fast response without blocking fresh settings

/**
 * Real-time subscription to centralized pricing settings from Firestore
 */
export function subscribeToPricingSettings(
  callback: (config: PricingSettingsConfig) => void
): () => void {
  if (!db) {
    callback(DEFAULT_PRICING_CONFIG);
    return () => { };
  }

  const docRef = doc(db, 'settings', 'pricing');
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as Partial<PricingSettingsConfig>;
      const config: PricingSettingsConfig = {
        customization: {
          ...DEFAULT_PRICING_CONFIG.customization,
          ...(data.customization || {}),
          face_prices: {
            ...DEFAULT_PRICING_CONFIG.customization.face_prices,
            ...(data.customization?.face_prices || {})
          },
          placement_prices: {
            ...DEFAULT_PRICING_CONFIG.customization.placement_prices!,
            ...(data.customization?.placement_prices || {})
          } as PlacementPricesConfig,
          placement_rules: {
            ...DEFAULT_PRICING_CONFIG.customization.placement_rules!,
            ...(data.customization?.placement_rules || {})
          } as PlacementRulesConfig
        },
        delivery: {
          ...DEFAULT_PRICING_CONFIG.delivery,
          ...(data.delivery || {}),
          express: {
            ...DEFAULT_PRICING_CONFIG.delivery.express,
            ...(data.delivery?.express || {})
          }
        }
      };
      cachedPricingConfig = config;
      lastFetchTime = Date.now();
      callback(config);
    } else {
      callback(DEFAULT_PRICING_CONFIG);
    }
  }, (err) => {
    console.warn("Could not listen to pricing settings from Firestore:", err);
    callback(DEFAULT_PRICING_CONFIG);
  });
}

/**
 * Retrieves pricing settings from Firestore with in-memory caching and fallback to defaults
 */
export async function getPricingSettings(forceRefresh = false): Promise<PricingSettingsConfig> {
  const now = Date.now();
  if (!forceRefresh && cachedPricingConfig && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedPricingConfig;
  }

  try {
    if (!db) return DEFAULT_PRICING_CONFIG;
    const docRef = doc(db, 'settings', 'pricing');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<PricingSettingsConfig>;
      cachedPricingConfig = {
        customization: {
          ...DEFAULT_PRICING_CONFIG.customization,
          ...(data.customization || {}),
          face_prices: {
            ...DEFAULT_PRICING_CONFIG.customization.face_prices,
            ...(data.customization?.face_prices || {})
          },
          placement_prices: {
            ...DEFAULT_PRICING_CONFIG.customization.placement_prices!,
            ...(data.customization?.placement_prices || {})
          } as PlacementPricesConfig,
          placement_rules: {
            ...DEFAULT_PRICING_CONFIG.customization.placement_rules!,
            ...(data.customization?.placement_rules || {})
          } as PlacementRulesConfig
        },
        delivery: {
          ...DEFAULT_PRICING_CONFIG.delivery,
          ...(data.delivery || {}),
          express: {
            ...DEFAULT_PRICING_CONFIG.delivery.express,
            ...(data.delivery?.express || {})
          }
        }
      };
      lastFetchTime = now;
      return cachedPricingConfig!;
    }
  } catch (error) {
    console.warn("Could not fetch pricing settings from Firestore, using default fallback:", error);
  }

  return DEFAULT_PRICING_CONFIG;
}

export interface PriceBreakdownItem {
  id: string;
  type: 'base' | 'extra_face' | 'placement' | 'premium_asset' | 'custom_upload' | 'extra_text' | 'free_mode';
  name: string;
  face?: string;
  placementId?: string;
  price: number;
}

export interface PriceCalculationResult {
  totalPrice: number;
  basePrice: number;
  totalExtra: number;
  breakdown: PriceBreakdownItem[];
}

interface PlacementMeta {
  targetFace: 'front' | 'back' | 'left' | 'right';
  nameAr: string;
  nameTr: string;
  nameEn: string;
}

const PLACEMENTS_METADATA: Record<string, PlacementMeta> = {
  left_chest: {
    targetFace: 'front',
    nameAr: 'شعار الصدر الأيسر (Left Chest)',
    nameTr: 'Sol Göğüs Logosu',
    nameEn: 'Left Chest Logo'
  },
  center_chest: {
    targetFace: 'front',
    nameAr: 'وسط الصدر (Center Chest)',
    nameTr: 'Orta Göğüs Baskısı',
    nameEn: 'Center Chest Print'
  },
  full_front: {
    targetFace: 'front',
    nameAr: 'الصدر بالكامل A3 (Full Front)',
    nameTr: 'Tam Ön Baskı (A3)',
    nameEn: 'Full Front Print (A3)'
  },
  back_collar: {
    targetFace: 'back',
    nameAr: 'أعلى الظهر / أسفل الرقبة (Back Collar)',
    nameTr: 'Ense Altı Logosu',
    nameEn: 'Back Collar / Neck Print'
  },
  full_back: {
    targetFace: 'back',
    nameAr: 'الظهر بالكامل A3 (Full Back)',
    nameTr: 'Tam Sırt Baskısı (A3)',
    nameEn: 'Full Back Print (A3)'
  },
  left_sleeve: {
    targetFace: 'left',
    nameAr: 'الكتف / الكم الأيسر (Left Sleeve)',
    nameTr: 'Sol Kol Baskısı',
    nameEn: 'Left Sleeve Print'
  },
  right_sleeve: {
    targetFace: 'right',
    nameAr: 'الكتف / الكم الأيمن (Right Sleeve)',
    nameTr: 'Sağ Kol Baskısı',
    nameEn: 'Right Sleeve Print'
  },
  // Mugs
  mug_full_wrap: {
    targetFace: 'front',
    nameAr: 'طباعة بانورامية حول الكوب (360°)',
    nameTr: 'Tam Çevre Kupa Baskısı (360°)',
    nameEn: 'Mug Full Wrap (360° Panoramic)'
  },
  mug_front: {
    targetFace: 'front',
    nameAr: 'الوجه الأمامي للكوب',
    nameTr: 'Kupa Ön Yüz Baskısı',
    nameEn: 'Mug Front Side Print'
  },
  mug_back: {
    targetFace: 'back',
    nameAr: 'الوجه المقابل للكوب (وجهان)',
    nameTr: 'Kupa Arka Yüz Baskısı',
    nameEn: 'Mug Opposite Side Print'
  },
  // Hats & Caps
  hat_front_crown: {
    targetFace: 'front',
    nameAr: 'مقدمة القبعة (التاج)',
    nameTr: 'Şapka Ön Taç Baskısı',
    nameEn: 'Hat Front Crown'
  },
  hat_left_side: {
    targetFace: 'left',
    nameAr: 'الجانب الأيسر للقبعة',
    nameTr: 'Şapka Sol Yan Baskısı',
    nameEn: 'Hat Left Side'
  },
  hat_right_side: {
    targetFace: 'right',
    nameAr: 'الجانب الأيمن للقبعة',
    nameTr: 'Şapka Sağ Yan Baskısı',
    nameEn: 'Hat Right Side'
  },
  hat_back_arch: {
    targetFace: 'back',
    nameAr: 'خلفية القبعة (القوس الخلفي)',
    nameTr: 'Şapka Arka Kemer Baskısı',
    nameEn: 'Hat Back Arch'
  },
  // Phone Cases
  phone_full_back: {
    targetFace: 'front',
    nameAr: 'طباعة كاملة على ظهر الغلاف',
    nameTr: 'Tam Kılıf Baskısı',
    nameEn: 'Full Phone Case Print'
  },
  phone_lower_badge: {
    targetFace: 'front',
    nameAr: 'منطقة الشعار السفلية',
    nameTr: 'Alt Logo Alanı',
    nameEn: 'Lower Badge Area'
  },
  // Generic
  generic_center: {
    targetFace: 'front',
    nameAr: 'طباعة في المنتصف',
    nameTr: 'Orta Baskı Alanı',
    nameEn: 'Center Print Area'
  }
};

function activeOrSelectedHasPrefix(ids: string[] | undefined, prefix: string): boolean {
  return Array.isArray(ids) && ids.some(id => typeof id === 'string' && id.startsWith(prefix));
}

/**
 * Standard hybrid pricing calculation function
 * Evaluates approved print placements, designed faces, stickers, custom uploads, and extra texts
 */
export function calculateCustomProductPrice(params: {
  basePrice: number;
  facesData: Record<string, any>;
  assetsList?: { id?: string; url?: string; name?: string; price?: number }[];
  pricingConfig?: PricingSettingsConfig;
  selectedPlacementIds?: string[];
  isFreeMode?: boolean;
  locale?: string;
  garmentType?: string;
}): PriceCalculationResult {
  const {
    basePrice,
    facesData,
    assetsList = [],
    pricingConfig = DEFAULT_PRICING_CONFIG,
    selectedPlacementIds,
    isFreeMode = false,
    locale = 'ar',
    garmentType = ''
  } = params;

  const normalizedType = (garmentType || '').toLowerCase();
  const isMugProduct = normalizedType === 'mug' || normalizedType === 'mugs' || activeOrSelectedHasPrefix(selectedPlacementIds, 'mug_');
  const isHatProduct = normalizedType === 'hat' || normalizedType === 'hats' || normalizedType === 'cap' || activeOrSelectedHasPrefix(selectedPlacementIds, 'hat_');
  const isPhoneCaseProduct = normalizedType === 'phone_case' || normalizedType === 'phone_cases' || activeOrSelectedHasPrefix(selectedPlacementIds, 'phone_');

  const breakdown: PriceBreakdownItem[] = [];

  const baseLabel = locale === 'tr' ? 'Temel Ürün Fiyatı' : locale === 'en' ? 'Base Garment Price' : 'سعر المنتج الأساسي';
  breakdown.push({
    id: 'base_product',
    type: 'base',
    name: baseLabel,
    price: Number(basePrice) || 0
  });

  let totalExtra = 0;
  const facePrices = pricingConfig.customization.face_prices || DEFAULT_PRICING_CONFIG.customization.face_prices;
  const placementPrices = pricingConfig.customization.placement_prices || DEFAULT_PRICING_CONFIG.customization.placement_prices!;
  const placementRules = pricingConfig.customization.placement_rules || DEFAULT_PRICING_CONFIG.customization.placement_rules!;

  const includeFirstPlacementFree = placementRules.include_first_placement_free !== false;
  const extraSameFacePrice = placementRules.extra_placement_same_face_price ?? 20;

  // Identify active designed faces
  const activeFaces = Object.keys(facesData).filter(faceKey => {
    const faceContent = facesData[faceKey];
    if (!faceContent) return false;
    if (typeof faceContent === 'object' && Array.isArray(faceContent.objects)) {
      return faceContent.objects.some((obj: any) =>
        obj.name !== 'background' && obj.name !== 'mockup' && obj.name !== 'print_area_guide'
      );
    }
    return false;
  });

  const canonicalFaceKey = (f: string) => {
    const clean = (f || '').trim().toLowerCase();
    if (clean === 'left' || clean === 'left_side' || clean === 'image_left' || clean === 'left_sleeve' || clean === 'left_shoulder') return 'left_shoulder';
    if (clean === 'right' || clean === 'right_side' || clean === 'image_right' || clean === 'right_sleeve' || clean === 'right_shoulder') return 'right_shoulder';
    if (clean === 'front' || clean === 'front_face' || clean === 'image_front') return 'front';
    if (clean === 'back' || clean === 'back_face' || clean === 'image_back') return 'back';
    return clean;
  };

  // Determine active placement IDs
  const activePlacementIds: string[] = [];
  const seenPlacements: Record<string, boolean> = {};

  // 1. Initial user-selected placements
  if (Array.isArray(selectedPlacementIds) && selectedPlacementIds.length > 0) {
    selectedPlacementIds.forEach(id => {
      if (!seenPlacements[id]) {
        seenPlacements[id] = true;
        activePlacementIds.push(id);
      }
    });
  }

  // 2. ORIGIN-AWARE MODE TRACKING & LOOPHOLE PROTECTION:
  // Detect if any artwork/sticker was created in Free Mode and has not yet been aligned to an approved placement
  let hasUnalignedFreeModeObjects = false;
  if (!isFreeMode) {
    activeFaces.forEach(faceKey => {
      const faceContent = facesData[faceKey];
      if (faceContent && Array.isArray(faceContent.objects)) {
        faceContent.objects.forEach((obj: any) => {
          if (!obj || obj.name === 'background' || obj.name === 'mockup' || obj.name === 'print_area_guide') return;
          const pid = obj.assignedPlacementId || obj.placementId;
          if (obj.originMode === 'free' && !pid) {
            hasUnalignedFreeModeObjects = true;
          }
        });
      }
    });
  }

  const effectiveIsFreeMode = isFreeMode || hasUnalignedFreeModeObjects;

  // 3. SAFETY NET: Auto-discover placements for any approved object present on the canvas
  if (!effectiveIsFreeMode) {
    activeFaces.forEach(faceKey => {
      const faceContent = facesData[faceKey];
      if (faceContent && Array.isArray(faceContent.objects)) {
        const userObjs = faceContent.objects.filter((obj: any) =>
          obj && obj.name !== 'background' && obj.name !== 'mockup' && obj.name !== 'print_area_guide'
        );

        let unassignedCount = 0;
        userObjs.forEach((obj: any) => {
          const pid = obj.assignedPlacementId || obj.placementId;
          if (pid && PLACEMENTS_METADATA[pid]) {
            if (!seenPlacements[pid]) {
              seenPlacements[pid] = true;
              activePlacementIds.push(pid);
            }
          } else {
            unassignedCount++;
          }
        });

        // Loophole protection: If there are unassigned objects on this face
        // Ensure this face has at least its primary placement, plus additional placements for extra unassigned objects
        if (unassignedCount > 0) {
          const canon = canonicalFaceKey(faceKey);
          if (canon === 'front') {
            const hasAnyFront =
              seenPlacements['left_chest'] ||
              seenPlacements['center_chest'] ||
              seenPlacements['full_front'] ||
              seenPlacements['mug_front'] ||
              seenPlacements['mug_full_wrap'] ||
              seenPlacements['hat_front_crown'] ||
              seenPlacements['phone_full_back'] ||
              seenPlacements['phone_lower_badge'] ||
              seenPlacements['generic_center'];

            if (!hasAnyFront) {
              const defaultFrontId = isMugProduct
                ? 'mug_front'
                : isHatProduct
                  ? 'hat_front_crown'
                  : isPhoneCaseProduct
                    ? 'phone_full_back'
                    : 'left_chest';
              seenPlacements[defaultFrontId] = true;
              activePlacementIds.push(defaultFrontId);
              unassignedCount--;
            }
            while (unassignedCount > 0 && !isMugProduct && !isHatProduct && !isPhoneCaseProduct) {
              if (!seenPlacements['center_chest']) {
                seenPlacements['center_chest'] = true;
                activePlacementIds.push('center_chest');
              } else if (!seenPlacements['full_front']) {
                seenPlacements['full_front'] = true;
                activePlacementIds.push('full_front');
              } else {
                break;
              }
              unassignedCount--;
            }
          } else if (canon === 'back') {
            if (!seenPlacements['full_back'] && !seenPlacements['back_collar'] && !seenPlacements['mug_back'] && !seenPlacements['hat_back_arch']) {
              const defaultBackId = isMugProduct
                ? 'mug_back'
                : isHatProduct
                  ? 'hat_back_arch'
                  : 'full_back';
              seenPlacements[defaultBackId] = true;
              activePlacementIds.push(defaultBackId);
            }
          } else if (canon === 'left_shoulder') {
            const leftId = isHatProduct ? 'hat_left_side' : 'left_sleeve';
            if (!seenPlacements[leftId]) {
              seenPlacements[leftId] = true;
              activePlacementIds.push(leftId);
            }
          } else if (canon === 'right_shoulder') {
            const rightId = isHatProduct ? 'hat_right_side' : 'right_sleeve';
            if (!seenPlacements[rightId]) {
              seenPlacements[rightId] = true;
              activePlacementIds.push(rightId);
            }
          }
        }
      }
    });
  }

  // A. APPROVED PLACEMENT PRICING (if placements are chosen)
  if (!effectiveIsFreeMode && activePlacementIds.length > 0) {
    const frontList: string[] = [];
    const backList: string[] = [];
    const sleeveList: string[] = [];

    activePlacementIds.forEach(pId => {
      const meta = PLACEMENTS_METADATA[pId];
      if (meta) {
        if (meta.targetFace === 'front') frontList.push(pId);
        else if (meta.targetFace === 'back') backList.push(pId);
        else sleeveList.push(pId);
      }
    });

    // 1. Front Placements
    frontList.forEach((pId, idx) => {
      const meta = PLACEMENTS_METADATA[pId];
      const name = locale === 'tr' ? meta.nameTr : locale === 'en' ? meta.nameEn : meta.nameAr;
      const basePlacementCost = placementPrices[pId] ?? 0;

      if (idx === 0) {
        // First front placement
        if (includeFirstPlacementFree) {
          // If placement has an explicit premium upgrade (e.g. Full Front A3 = 25 ₺)
          const charge = basePlacementCost;
          if (charge > 0) {
            const upgradeLabel =
              pId === 'mug_full_wrap'
                ? (locale === 'tr' ? '360° Çevre Baskı Farkı' : locale === 'en' ? '360° Wrap Upgrade' : 'ترقية الطباعة البانورامية 360°')
                : (locale === 'tr' ? 'Büyük Baskı Farkı' : locale === 'en' ? 'A3 Size Upgrade' : 'ترقية مقاس A3');
            breakdown.push({
              id: `placement_${pId}`,
              type: 'placement',
              placementId: pId,
              face: 'front',
              name: `${name} (${upgradeLabel})`,
              price: charge
            });
            totalExtra += charge;
          } else {
            breakdown.push({
              id: `placement_${pId}`,
              type: 'placement',
              placementId: pId,
              face: 'front',
              name: `${name} (${locale === 'tr' ? 'Ürüne Dahil' : locale === 'en' ? 'Included' : 'مشمول مع المنتج'})`,
              price: 0
            });
          }
        } else {
          const charge = basePlacementCost;
          if (charge > 0) {
            breakdown.push({
              id: `placement_${pId}`,
              type: 'placement',
              placementId: pId,
              face: 'front',
              name,
              price: charge
            });
            totalExtra += charge;
          }
        }
      } else {
        // Additional placement on the same front face
        const extraCharge = basePlacementCost > 0 ? basePlacementCost : extraSameFacePrice;
        if (extraCharge > 0) {
          breakdown.push({
            id: `placement_${pId}_extra`,
            type: 'placement',
            placementId: pId,
            face: 'front',
            name: `${name} (${locale === 'tr' ? 'Ek Ön Baskı Alanı' : locale === 'en' ? 'Extra Front Placement' : 'موضع أمامي إضافي'})`,
            price: extraCharge
          });
          totalExtra += extraCharge;
        }
      }
    });

    // 2. Back Placements
    backList.forEach((pId, idx) => {
      const meta = PLACEMENTS_METADATA[pId];
      const name = locale === 'tr' ? meta.nameTr : locale === 'en' ? meta.nameEn : meta.nameAr;
      let charge = placementPrices[pId] ?? (facePrices.back ?? 35);

      if (idx > 0 && extraSameFacePrice > 0 && charge === 0) {
        charge = extraSameFacePrice;
      }

      if (charge > 0) {
        breakdown.push({
          id: `placement_${pId}`,
          type: 'placement',
          placementId: pId,
          face: 'back',
          name,
          price: charge
        });
        totalExtra += charge;
      }
    });

    // 3. Sleeve Placements
    sleeveList.forEach(pId => {
      const meta = PLACEMENTS_METADATA[pId];
      const name = locale === 'tr' ? meta.nameTr : locale === 'en' ? meta.nameEn : meta.nameAr;
      const charge = placementPrices[pId] ?? 20;

      if (charge > 0) {
        breakdown.push({
          id: `placement_${pId}`,
          type: 'placement',
          placementId: pId,
          face: meta.targetFace,
          name,
          price: charge
        });
        totalExtra += charge;
      }
    });

    // 4. SAFETY NET: Ensure designed faces outside the chosen placements are NEVER printed for free
    activeFaces.forEach(faceKey => {
      const canon = canonicalFaceKey(faceKey);
      if (canon === 'front') return;

      if (canon === 'back' && backList.length === 0) {
        const backCharge = isMugProduct
          ? (placementPrices.mug_back ?? (facePrices.back ?? 35))
          : (placementPrices.full_back ?? placementPrices.back_collar ?? (facePrices.back ?? 35));
        if (backCharge > 0) {
          const backLabel = isMugProduct
            ? (locale === 'tr' ? 'Kupa Arka Yüz Baskısı' : locale === 'en' ? 'Mug Opposite Side Print' : 'طباعة الجهة المقابلة للكوب')
            : (locale === 'tr' ? 'Arka Yüz Baskısı' : locale === 'en' ? 'Back Face Print' : 'طباعة الوجه الخلفي (الظهر)');
          breakdown.push({
            id: 'safety_net_back_face',
            type: 'extra_face',
            face: 'back',
            name: backLabel,
            price: backCharge
          });
          totalExtra += backCharge;
        }
      } else if (canon === 'left_shoulder' && !sleeveList.includes('left_sleeve')) {
        const sleeveCharge = placementPrices.left_sleeve ?? (facePrices.left_shoulder ?? 20);
        if (sleeveCharge > 0) {
          const sleeveLabel = locale === 'tr' ? 'Sol Kol Baskısı' : locale === 'en' ? 'Left Sleeve Print' : 'طباعة الكم الأيسر';
          breakdown.push({
            id: 'safety_net_left_sleeve',
            type: 'extra_face',
            face: 'left_shoulder',
            name: sleeveLabel,
            price: sleeveCharge
          });
          totalExtra += sleeveCharge;
        }
      } else if (canon === 'right_shoulder' && !sleeveList.includes('right_sleeve')) {
        const sleeveCharge = placementPrices.right_sleeve ?? (facePrices.right_shoulder ?? 20);
        if (sleeveCharge > 0) {
          const sleeveLabel = locale === 'tr' ? 'Sağ Kol Baskısı' : locale === 'en' ? 'Right Sleeve Print' : 'طباعة الكم الأيمن';
          breakdown.push({
            id: 'safety_net_right_sleeve',
            type: 'extra_face',
            face: 'right_shoulder',
            name: sleeveLabel,
            price: sleeveCharge
          });
          totalExtra += sleeveCharge;
        }
      }
    });
  } else if (effectiveIsFreeMode) {
    // B. FREE MODE PRICING
    if (placementRules.free_mode_fee > 0) {
      const freeModeLabel = hasUnalignedFreeModeObjects && !isFreeMode
        ? (locale === 'tr'
          ? 'Serbest Tasarım Modu (Hizalanmamış Ögeler)'
          : locale === 'en'
            ? 'Free Design Mode (Unaligned Elements)'
            : 'رسوم الوضع الحر (ملصقات غير محاذاة لموضع معتمد)')
        : (locale === 'tr'
          ? 'Serbest Tasarım Modu Ücreti'
          : locale === 'en'
            ? 'Free Design Mode Fee'
            : 'رسوم وضع التصميم الحر (Free Mode)');

      breakdown.push({
        id: 'free_mode_fee',
        type: 'free_mode',
        name: freeModeLabel,
        price: placementRules.free_mode_fee
      });
      totalExtra += placementRules.free_mode_fee;
    }

    // Charge additional faces in free mode based on face_prices
    activeFaces.forEach(face => {
      const faceKey = canonicalFaceKey(face);
      if (faceKey === 'front') return; // Front covered in base
      const facePrice = typeof facePrices[faceKey] === 'number' ? facePrices[faceKey] : (facePrices.other || 20);
      if (facePrice > 0) {
        let faceLabel = locale === 'tr' ? 'Ek Yüz Baskısı' : locale === 'en' ? 'Extra Face Print' : 'طباعة وجه إضافي';
        if (faceKey === 'back') faceLabel = locale === 'tr' ? 'Arka Yüz (Sırt)' : locale === 'en' ? 'Back Face' : 'طباعة الوجه الخلفي (الظهر)';
        else if (faceKey === 'left_shoulder') faceLabel = locale === 'tr' ? 'Sol Kol / Omuz' : locale === 'en' ? 'Left Sleeve' : 'طباعة الكتف/الكم الأيسر';
        else if (faceKey === 'right_shoulder') faceLabel = locale === 'tr' ? 'Sağ Kol / Omuz' : locale === 'en' ? 'Right Sleeve' : 'طباعة الكتف/الكم الأيمن';

        breakdown.push({
          id: `face_${faceKey}`,
          type: 'extra_face',
          face: faceKey,
          name: faceLabel,
          price: facePrice
        });
        totalExtra += facePrice;
      }
    });
  } else {
    // C. LEGACY / FALLBACK FACE-BASED PRICING
    const isFirstFaceIncluded = pricingConfig.customization.base_includes_first_face !== false;
    activeFaces.forEach((face) => {
      const faceKey = canonicalFaceKey(face);
      if (faceKey === 'front' && isFirstFaceIncluded) return;

      const facePrice = typeof facePrices[faceKey] === 'number'
        ? facePrices[faceKey]
        : (facePrices.other || 20);

      if (facePrice > 0) {
        let faceLabel = locale === 'tr' ? 'Ek Yüz Baskısı' : locale === 'en' ? 'Extra Face' : 'وجه إضافي';
        if (faceKey === 'back') faceLabel = locale === 'tr' ? 'Arka Yüz Baskısı' : locale === 'en' ? 'Back Face Print' : 'طباعة الوجه الخلفي (الظهر)';
        else if (faceKey === 'left_shoulder') faceLabel = locale === 'tr' ? 'Sol Kol Baskısı' : locale === 'en' ? 'Left Sleeve Print' : 'طباعة الكتف/الكم الأيسر';
        else if (faceKey === 'right_shoulder') faceLabel = locale === 'tr' ? 'Sağ Kol Baskısı' : locale === 'en' ? 'Right Sleeve Print' : 'طباعة الكتف/الكم الأيمن';
        else if (faceKey === 'collar') faceLabel = locale === 'tr' ? 'Yaka Baskısı' : locale === 'en' ? 'Collar Print' : 'طباعة الياقة';

        breakdown.push({
          id: `face_${faceKey}`,
          type: 'extra_face',
          face: faceKey,
          name: faceLabel,
          price: facePrice
        });
        totalExtra += facePrice;
      }
    });
  }

  // D. STICKERS & ASSETS PRICING (STRATEGY UNCHANGED: individual asset.price in DB, 0 = free, >0 = charged)
  const assetPriceMap = new Map<string, number>();
  assetsList.forEach(a => {
    if (typeof a.price === 'number' && a.price > 0) {
      if (a.url) assetPriceMap.set(a.url, a.price);
      if (a.id) assetPriceMap.set(a.id, a.price);
    }
  });

  activeFaces.forEach(faceKey => {
    const faceContent = facesData[faceKey];
    if (faceContent && Array.isArray(faceContent.objects)) {
      faceContent.objects.forEach((obj: any, idx: number) => {
        if (obj.name === 'background' || obj.name === 'mockup' || obj.name === 'print_area_guide') return;

        // 1. Stickers & Design Assets
        const isSticker = obj.name === 'sticker' || (obj.type === 'image' && !obj.isCustomUpload);
        const assetUrl = obj.src || obj.originalAssetId;
        const directPrice = typeof obj.assetPrice === 'number' && obj.assetPrice > 0 ? obj.assetPrice : null;
        const mappedPrice = (assetUrl && assetPriceMap.has(assetUrl)) ? assetPriceMap.get(assetUrl)! : null;
        const premiumFee = directPrice ?? mappedPrice ?? null;

        if (premiumFee && premiumFee > 0) {
          const stickerLabel = locale === 'tr' ? 'Özel Tasarım Çıkartması' : locale === 'en' ? 'Premium Sticker' : 'ملصق تصميم مميز';
          breakdown.push({
            id: `premium_asset_${faceKey}_${idx}`,
            type: 'premium_asset',
            face: faceKey,
            name: obj.assetName || stickerLabel,
            price: premiumFee
          });
          totalExtra += premiumFee;
        }

        // 2. Custom Uploads
        if (obj.type === 'image' && obj.isCustomUpload && pricingConfig.customization.custom_upload_image_price > 0) {
          const uploadFee = pricingConfig.customization.custom_upload_image_price;
          const uploadLabel = locale === 'tr' ? 'Yüklenen Özel Resim' : locale === 'en' ? 'Custom Upload Image' : 'صورة شخصية مرفوعة';
          breakdown.push({
            id: `custom_upload_${faceKey}_${idx}`,
            type: 'custom_upload',
            face: faceKey,
            name: uploadLabel,
            price: uploadFee
          });
          totalExtra += uploadFee;
        }

        // 3. Extra Texts
        if ((obj.type === 'textbox' || obj.type === 'i-text') && pricingConfig.customization.extra_text_price > 0) {
          const textFee = pricingConfig.customization.extra_text_price;
          const textLabel = locale === 'tr' ? 'Ek Metin' : locale === 'en' ? 'Extra Text' : 'نص إضافي';
          breakdown.push({
            id: `extra_text_${faceKey}_${idx}`,
            type: 'extra_text',
            face: faceKey,
            name: textLabel,
            price: textFee
          });
          totalExtra += textFee;
        }
      });
    }
  });

  const rawTotal = (Number(basePrice) || 0) + totalExtra;
  const totalPrice = Math.round(rawTotal);

  return {
    totalPrice,
    basePrice: Number(basePrice) || 0,
    totalExtra,
    breakdown
  };
}
