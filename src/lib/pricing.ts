import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

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
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache for fast client-side performance

/**
 * Retrieves pricing settings from Firestore with in-memory caching and fallback to defaults
 */
export async function getPricingSettings(): Promise<PricingSettingsConfig> {
  const now = Date.now();
  if (cachedPricingConfig && (now - lastFetchTime) < CACHE_TTL_MS) {
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
          }
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
      return cachedPricingConfig;
    }
  } catch (error) {
    console.warn("Could not fetch pricing settings from Firestore, using default fallback:", error);
  }

  return DEFAULT_PRICING_CONFIG;
}

export interface PriceBreakdownItem {
  id: string;
  type: 'base' | 'extra_face' | 'premium_asset' | 'custom_upload' | 'extra_text';
  name: string;
  face?: string;
  price: number;
}

export interface PriceCalculationResult {
  totalPrice: number;
  basePrice: number;
  totalExtra: number;
  breakdown: PriceBreakdownItem[];
}

/**
 * Standard hybrid pricing calculation function
 * Evaluates designed faces, premium stickers, custom uploads, and extra texts
 */
export function calculateCustomProductPrice(params: {
  basePrice: number;
  facesData: Record<string, any>;
  assetsList?: { id?: string; url?: string; name?: string; price?: number }[];
  pricingConfig?: PricingSettingsConfig;
}): PriceCalculationResult {
  const { basePrice, facesData, assetsList = [], pricingConfig = DEFAULT_PRICING_CONFIG } = params;
  const breakdown: PriceBreakdownItem[] = [];

  // 1. Base Garment Price (includes front face design by default)
  breakdown.push({
    id: 'base_product',
    type: 'base',
    name: 'سعر المنتج الأساسي',
    price: Number(basePrice) || 0
  });

  let totalExtra = 0;
  const facePrices = pricingConfig.customization.face_prices || DEFAULT_PRICING_CONFIG.customization.face_prices;
  const isFirstFaceIncluded = pricingConfig.customization.base_includes_first_face !== false;

  // Identify active designed faces
  const activeFaces = Object.keys(facesData).filter(faceKey => {
    const faceContent = facesData[faceKey];
    if (!faceContent) return false;
    
    // Check if objects array exists and has designer elements
    if (typeof faceContent === 'object' && Array.isArray(faceContent.objects)) {
      return faceContent.objects.some((obj: any) => 
        obj.name !== 'background' && obj.name !== 'mockup' && obj.name !== 'print_area_guide'
      );
    }
    return false;
  });

  // 2. Extra Face Fees
  // If first face is included, only additional faces (beyond the first one, or specifically non-front faces) are charged
  const canonicalFaceKey = (f: string) => {
    const clean = (f || '').trim().toLowerCase();
    if (clean === 'left' || clean === 'left_side' || clean === 'image_left' || clean === 'left_sleeve' || clean === 'left_shoulder') return 'left_shoulder';
    if (clean === 'right' || clean === 'right_side' || clean === 'image_right' || clean === 'right_sleeve' || clean === 'right_shoulder') return 'right_shoulder';
    if (clean === 'front' || clean === 'front_face' || clean === 'image_front') return 'front';
    if (clean === 'back' || clean === 'back_face' || clean === 'image_back') return 'back';
    return clean;
  };

  activeFaces.forEach((face) => {
    const faceKey = canonicalFaceKey(face);
    
    // Front face is included in base price if base_includes_first_face is true
    if (faceKey === 'front' && isFirstFaceIncluded) {
      return;
    }

    const facePrice = typeof facePrices[faceKey] === 'number' 
      ? facePrices[faceKey] 
      : (facePrices.other || 20);

    if (facePrice > 0) {
      let faceLabel = 'وجه إضافي';
      if (faceKey === 'back') faceLabel = 'طباعة الوجه الخلفي (الظهر)';
      else if (faceKey === 'left_shoulder') faceLabel = 'طباعة الكتف/الكم الأيسر';
      else if (faceKey === 'right_shoulder') faceLabel = 'طباعة الكتف/الكم الأيمن';
      else if (faceKey === 'collar') faceLabel = 'طباعة الياقة';

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

  // 3. Premium Assets, Stickers & Custom Uploads on Active Faces
  const assetPriceMap = new Map<string, number>();
  assetsList.forEach(a => {
    if (a.price && a.price > 0) {
      if (a.url) assetPriceMap.set(a.url, a.price);
      if (a.id) assetPriceMap.set(a.id, a.price);
    }
  });

  activeFaces.forEach(faceKey => {
    const faceContent = facesData[faceKey];
    if (faceContent && Array.isArray(faceContent.objects)) {
      faceContent.objects.forEach((obj: any, idx: number) => {
        if (obj.name === 'background' || obj.name === 'mockup' || obj.name === 'print_area_guide') return;

        // A. Premium Assets / Stickers (from Gallery or standard sticker library)
        const isSticker = obj.name === 'sticker' || (obj.type === 'image' && !obj.isCustomUpload);
        const assetUrl = obj.src || obj.originalAssetId;
        const directPrice = typeof obj.assetPrice === 'number' && obj.assetPrice > 0 ? obj.assetPrice : null;
        const mappedPrice = (assetUrl && assetPriceMap.has(assetUrl)) ? assetPriceMap.get(assetUrl)! : null;
        const defaultStickerPrice = (pricingConfig.customization as any).sticker_price ?? 5;
        const premiumFee = directPrice ?? mappedPrice ?? (isSticker ? defaultStickerPrice : null);

        if (premiumFee && premiumFee > 0) {
          breakdown.push({
            id: `premium_asset_${faceKey}_${idx}`,
            type: 'premium_asset',
            face: faceKey,
            name: obj.assetName || (isSticker ? 'ملصق تصميم' : 'عنصر مميز'),
            price: premiumFee
          });
          totalExtra += premiumFee;
        }

        // B. Custom Uploads
        if (obj.type === 'image' && obj.isCustomUpload && pricingConfig.customization.custom_upload_image_price > 0) {
          const uploadFee = pricingConfig.customization.custom_upload_image_price;
          breakdown.push({
            id: `custom_upload_${faceKey}_${idx}`,
            type: 'custom_upload',
            face: faceKey,
            name: 'صورة مخصصة مرفوعة',
            price: uploadFee
          });
          totalExtra += uploadFee;
        }

        // C. Extra Texts
        if ((obj.type === 'textbox' || obj.type === 'i-text') && pricingConfig.customization.extra_text_price > 0) {
          const textFee = pricingConfig.customization.extra_text_price;
          breakdown.push({
            id: `extra_text_${faceKey}_${idx}`,
            type: 'extra_text',
            face: faceKey,
            name: 'نص إضافي',
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
