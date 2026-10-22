export interface PrintDimensions {
  widthCm: number;
  heightCm: number;
  widthInches: number;
  heightInches: number;
  pixelsAt300Dpi: {
    width: number;
    height: number;
  };
}

export interface CanvasBoundingBox {
  /** النسبة المئوية للموضع الأفقي من زاوية الموك أب (0 - 100%) */
  leftPercent: number;
  /** النسبة المئوية للموضع الرأسي من أعلى الموك أب (0 - 100%) */
  topPercent: number;
  /** أقصى عرض مسموح به كنسبة مئوية من مساحة القطعة */
  maxWidthPercent: number;
  /** أقصى ارتفاع مسموح به كنسبة مئوية من مساحة القطعة */
  maxHeightPercent: number;
}

export interface PlacementSpec {
  id: string;
  targetFace: 'front' | 'back' | 'left' | 'right' | 'right_shoulder' | 'left_shoulder' | 'collar' | 'other';
  nameEn: string;
  nameAr: string;
  nameTr: string;
  descriptionAr: string;
  descriptionTr: string;
  descriptionEn: string;
  offsetFromCollarCm: number; // المسافة نزولاً من طوق الياقة بالسنتيمتر
  dimensions: {
    recommended: PrintDimensions;
    min: PrintDimensions;
    max: PrintDimensions;
  };
  canvasBox: CanvasBoundingBox;
  supportedMethods: ('DTF' | 'Sublimation')[];
}

export interface GarmentPrintConfig {
  garmentType: 'tshirt' | 'hoodie' | 'sweatshirt' | 'generic';
  nameAr: string;
  nameTr: string;
  nameEn: string;
  placements: PlacementSpec[];
}

export const PRINT_CONFIG: Record<string, GarmentPrintConfig> = {
  tshirt: {
    garmentType: 'tshirt',
    nameAr: 'تيشيرت كلاسيك',
    nameTr: 'Klasik Tişört',
    nameEn: 'Classic T-Shirt',
    placements: [
      {
        id: 'left_chest',
        targetFace: 'front',
        nameEn: 'Left Chest',
        nameAr: 'شعار الصدر الأيسر',
        nameTr: 'Sol Göğüs Logosu',
        descriptionAr: 'يبدأ من 7 إلى 9 سم أسفل طوق الرقبة بمحاذاة فتحة العنق اليسرى',
        descriptionTr: 'Yaka ribanasının 7-9 cm altında, sol yaka hizasında başlar',
        descriptionEn: 'Starts 7-9 cm below the collar aligned with the left neckline',
        offsetFromCollarCm: 8,
        dimensions: {
          recommended: {
            widthCm: 10,
            heightCm: 10,
            widthInches: 3.94,
            heightInches: 3.94,
            pixelsAt300Dpi: { width: 1181, height: 1181 }
          },
          min: {
            widthCm: 6,
            heightCm: 6,
            widthInches: 2.36,
            heightInches: 2.36,
            pixelsAt300Dpi: { width: 708, height: 708 }
          },
          max: {
            widthCm: 12,
            heightCm: 12,
            widthInches: 4.72,
            heightInches: 4.72,
            pixelsAt300Dpi: { width: 1417, height: 1417 }
          }
        },
        canvasBox: {
          leftPercent: 60,
          topPercent: 21,
          maxWidthPercent: 10,
          maxHeightPercent: 10
        },
        supportedMethods: ['DTF', 'Sublimation']
      },
      {
        id: 'center_chest',
        targetFace: 'front',
        nameEn: 'Center Chest',
        nameAr: 'وسط الصدر',
        nameTr: 'Orta Göğüs',
        descriptionAr: 'شعار أو عبارة ممركزة في وسط الصدر أسفل الياقة بـ 8 سم',
        descriptionTr: 'Yakanın 8 cm altında, göğüs ortasında merkezlenmiş logo',
        descriptionEn: 'Centered logo or phrase on chest, 8 cm below the collar',
        offsetFromCollarCm: 8,
        dimensions: {
          recommended: {
            widthCm: 24,
            heightCm: 16,
            widthInches: 9.45,
            heightInches: 6.3,
            pixelsAt300Dpi: { width: 2835, height: 1890 }
          },
          min: {
            widthCm: 15,
            heightCm: 10,
            widthInches: 5.9,
            heightInches: 3.94,
            pixelsAt300Dpi: { width: 1771, height: 1181 }
          },
          max: {
            widthCm: 26,
            heightCm: 18,
            widthInches: 10.24,
            heightInches: 7.08,
            pixelsAt300Dpi: { width: 3071, height: 2126 }
          }
        },
        canvasBox: {
          leftPercent: 38,
          topPercent: 21,
          maxWidthPercent: 24,
          maxHeightPercent: 16
        },
        supportedMethods: ['DTF', 'Sublimation']
      },
      {
        id: 'full_front',
        targetFace: 'front',
        nameEn: 'Full Front',
        nameAr: 'الصدر بالكامل',
        nameTr: 'Tam Ön Baskı',
        descriptionAr: 'تصميم عريض يغطي الصدر بالكامل ويبدأ 5 إلى 7.5 سم أسفل الياقة',
        descriptionTr: 'Göğsü tamamen kaplayan, yakanın 5-7.5 cm altından başlayan baskı',
        descriptionEn: 'Wide graphic covering front chest, starts 5-7.5 cm below collar',
        offsetFromCollarCm: 6.5,
        dimensions: {
          recommended: {
            widthCm: 30,
            heightCm: 40,
            widthInches: 11.81,
            heightInches: 15.74,
            pixelsAt300Dpi: { width: 3543, height: 4724 }
          },
          min: {
            widthCm: 25,
            heightCm: 30,
            widthInches: 9.84,
            heightInches: 11.81,
            pixelsAt300Dpi: { width: 2952, height: 3543 }
          },
          max: {
            widthCm: 35,
            heightCm: 45,
            widthInches: 13.78,
            heightInches: 17.71,
            pixelsAt300Dpi: { width: 4133, height: 5315 }
          }
        },
        canvasBox: {
          leftPercent: 35,
          topPercent: 19.5,
          maxWidthPercent: 30,
          maxHeightPercent: 40
        },
        supportedMethods: ['DTF', 'Sublimation']
      },
      {
        id: 'full_back',
        targetFace: 'back',
        nameEn: 'Full Back',
        nameAr: 'الظهر بالكامل',
        nameTr: 'Tam Sırt Baskı',
        descriptionAr: 'تصميم كامل على الظهر يبدأ 8 إلى 10 سم أسفل الياقة الخلفية',
        descriptionTr: 'Arka yakanın 8-10 cm altından başlayan tam sırt baskısı',
        descriptionEn: 'Full back graphic, starts 8-10 cm below back neckline',
        offsetFromCollarCm: 8,
        dimensions: {
          recommended: {
            widthCm: 32,
            heightCm: 42,
            widthInches: 12.6,
            heightInches: 16.53,
            pixelsAt300Dpi: { width: 3779, height: 4960 }
          },
          min: {
            widthCm: 28,
            heightCm: 35,
            widthInches: 11.02,
            heightInches: 13.78,
            pixelsAt300Dpi: { width: 3307, height: 4133 }
          },
          max: {
            widthCm: 35,
            heightCm: 48,
            widthInches: 13.78,
            heightInches: 18.9,
            pixelsAt300Dpi: { width: 4133, height: 5669 }
          }
        },
        canvasBox: {
          leftPercent: 34,
          topPercent: 20,
          maxWidthPercent: 32,
          maxHeightPercent: 42
        },
        supportedMethods: ['DTF', 'Sublimation']
      },
      {
        id: 'back_collar',
        targetFace: 'back',
        nameEn: 'Back Collar / Neck',
        nameAr: 'أعلى الظهر (أسفل الرقبة)',
        nameTr: 'Ense / Üst Sırt',
        descriptionAr: 'شعار صغير يبدأ من 3 إلى 5 سم أسفل حافة طوق الرقبة الخلفي',
        descriptionTr: 'Arka yaka ribanasının 3-5 cm altında küçük logo',
        descriptionEn: 'Small logo starting 3-5 cm below back neck ribbing',
        offsetFromCollarCm: 4,
        dimensions: {
          recommended: {
            widthCm: 8,
            heightCm: 8,
            widthInches: 3.15,
            heightInches: 3.15,
            pixelsAt300Dpi: { width: 944, height: 944 }
          },
          min: {
            widthCm: 5,
            heightCm: 5,
            widthInches: 1.96,
            heightInches: 1.96,
            pixelsAt300Dpi: { width: 590, height: 590 }
          },
          max: {
            widthCm: 10,
            heightCm: 10,
            widthInches: 3.94,
            heightInches: 3.94,
            pixelsAt300Dpi: { width: 1181, height: 1181 }
          }
        },
        canvasBox: {
          leftPercent: 46,
          topPercent: 15,
          maxWidthPercent: 8,
          maxHeightPercent: 8
        },
        supportedMethods: ['DTF', 'Sublimation']
      },
      {
        id: 'left_sleeve',
        targetFace: 'left',
        nameEn: 'Left Sleeve',
        nameAr: 'الكتف / الكم الأيسر',
        nameTr: 'Sol Kol / Omuz',
        descriptionAr: 'شعار كم التيشيرت الأيسر فوق حاشية الكم بـ 3 إلى 5 سم',
        descriptionTr: 'Sol kol dikişinin 3-5 cm üzerinde kol logosu',
        descriptionEn: 'T-shirt left sleeve logo placed 3-5 cm above the sleeve hem',
        offsetFromCollarCm: 10,
        dimensions: {
          recommended: {
            widthCm: 8,
            heightCm: 8,
            widthInches: 3.15,
            heightInches: 3.15,
            pixelsAt300Dpi: { width: 944, height: 944 }
          },
          min: {
            widthCm: 5,
            heightCm: 5,
            widthInches: 1.96,
            heightInches: 1.96,
            pixelsAt300Dpi: { width: 590, height: 590 }
          },
          max: {
            widthCm: 10,
            heightCm: 10,
            widthInches: 3.94,
            heightInches: 3.94,
            pixelsAt300Dpi: { width: 1181, height: 1181 }
          }
        },
        canvasBox: {
          leftPercent: 40,
          topPercent: 25,
          maxWidthPercent: 20,
          maxHeightPercent: 20
        },
        supportedMethods: ['DTF', 'Sublimation']
      },
      {
        id: 'right_sleeve',
        targetFace: 'right',
        nameEn: 'Right Sleeve',
        nameAr: 'الكتف / الكم الأيمن',
        nameTr: 'Sağ Kol / Omuz',
        descriptionAr: 'شعار كم التيشيرت الأيمن فوق حاشية الكم بـ 3 إلى 5 سم',
        descriptionTr: 'Sağ kol dikişinin 3-5 cm üzerinde kol logosu',
        descriptionEn: 'T-shirt right sleeve logo placed 3-5 cm above the sleeve hem',
        offsetFromCollarCm: 10,
        dimensions: {
          recommended: {
            widthCm: 8,
            heightCm: 8,
            widthInches: 3.15,
            heightInches: 3.15,
            pixelsAt300Dpi: { width: 944, height: 944 }
          },
          min: {
            widthCm: 5,
            heightCm: 5,
            widthInches: 1.96,
            heightInches: 1.96,
            pixelsAt300Dpi: { width: 590, height: 590 }
          },
          max: {
            widthCm: 10,
            heightCm: 10,
            widthInches: 3.94,
            heightInches: 3.94,
            pixelsAt300Dpi: { width: 1181, height: 1181 }
          }
        },
        canvasBox: {
          leftPercent: 40,
          topPercent: 25,
          maxWidthPercent: 20,
          maxHeightPercent: 20
        },
        supportedMethods: ['DTF', 'Sublimation']
      }
    ]
  },
  hoodie: {
    garmentType: 'hoodie',
    nameAr: 'هودي بغطاء رأس',
    nameTr: 'Kapüşonlu Sweatshirt (Hoodie)',
    nameEn: 'Hooded Sweatshirt (Hoodie)',
    placements: [
      {
        id: 'left_chest_hoodie',
        targetFace: 'front',
        nameEn: 'Left Chest',
        nameAr: 'شعار الصدر الأيسر',
        nameTr: 'Sol Göğüs Logosu',
        descriptionAr: 'شعار صغير على الصدر الأيسر يبدأ من 8 إلى 9 سم أسفل الياقة',
        descriptionTr: 'Yakanın 8-9 cm altında sol göğüs logosu',
        descriptionEn: 'Small logo on left chest, 8-9 cm below collar',
        offsetFromCollarCm: 8.5,
        dimensions: {
          recommended: {
            widthCm: 10,
            heightCm: 10,
            widthInches: 3.94,
            heightInches: 3.94,
            pixelsAt300Dpi: { width: 1181, height: 1181 }
          },
          min: {
            widthCm: 6,
            heightCm: 6,
            widthInches: 2.36,
            heightInches: 2.36,
            pixelsAt300Dpi: { width: 708, height: 708 }
          },
          max: {
            widthCm: 12,
            heightCm: 12,
            widthInches: 4.72,
            heightInches: 4.72,
            pixelsAt300Dpi: { width: 1417, height: 1417 }
          }
        },
        canvasBox: {
          leftPercent: 62,
          topPercent: 26,
          maxWidthPercent: 18,
          maxHeightPercent: 18
        },
        supportedMethods: ['DTF']
      },
      {
        id: 'center_chest_hoodie',
        targetFace: 'front',
        nameEn: 'Center Chest (Above Pocket)',
        nameAr: 'وسط الصدر (فوق الجيب)',
        nameTr: 'Orta Göğüs (Cep Üstü)',
        descriptionAr: 'محصور بين طوق الرقبة وحافة جيب الكنغر العلوية',
        descriptionTr: 'Yaka ile kanguru cebin üst çizgisi arasında hizalı',
        descriptionEn: 'Centered between neckline and upper kangaroo pocket edge',
        offsetFromCollarCm: 9,
        dimensions: {
          recommended: {
            widthCm: 25,
            heightCm: 20,
            widthInches: 9.84,
            heightInches: 7.87,
            pixelsAt300Dpi: { width: 2952, height: 2362 }
          },
          min: {
            widthCm: 18,
            heightCm: 12,
            widthInches: 7.08,
            heightInches: 4.72,
            pixelsAt300Dpi: { width: 2125, height: 1417 }
          },
          max: {
            widthCm: 28,
            heightCm: 25,
            widthInches: 11.02,
            heightInches: 9.84,
            pixelsAt300Dpi: { width: 3307, height: 2952 }
          }
        },
        canvasBox: {
          leftPercent: 32,
          topPercent: 26,
          maxWidthPercent: 36,
          maxHeightPercent: 25
        },
        supportedMethods: ['DTF']
      },
      {
        id: 'full_back_hoodie',
        targetFace: 'back',
        nameEn: 'Full Back (Below Hood)',
        nameAr: 'الظهر بالكامل (أسفل القبعة)',
        nameTr: 'Tam Sırt (Kapüşon Altı)',
        descriptionAr: 'يبدأ من 12 إلى 15 سم أسفل الرقبة لضمان عدم حجب التصميم بغطاء الرأس',
        descriptionTr: 'Kapüşonun tasarımı kapatmaması için yakadan 12-15 cm aşağıda başlar',
        descriptionEn: 'Starts 12-15 cm below neck to ensure hood does not obstruct graphic',
        offsetFromCollarCm: 14,
        dimensions: {
          recommended: {
            widthCm: 32,
            heightCm: 40,
            widthInches: 12.6,
            heightInches: 15.74,
            pixelsAt300Dpi: { width: 3779, height: 4724 }
          },
          min: {
            widthCm: 26,
            heightCm: 32,
            widthInches: 10.23,
            heightInches: 12.6,
            pixelsAt300Dpi: { width: 3070, height: 3779 }
          },
          max: {
            widthCm: 35,
            heightCm: 45,
            widthInches: 13.78,
            heightInches: 17.71,
            pixelsAt300Dpi: { width: 4133, height: 5315 }
          }
        },
        canvasBox: {
          leftPercent: 28,
          topPercent: 30,
          maxWidthPercent: 44,
          maxHeightPercent: 50
        },
        supportedMethods: ['DTF']
      },
      {
        id: 'back_collar_hoodie',
        targetFace: 'back',
        nameEn: 'Back (Under Hood)',
        nameAr: 'أعلى الظهر',
        nameTr: 'Üst Sırt',
        descriptionAr: 'شعار أعلى الظهر يظهر عند رفع قبعة الهودي',
        descriptionTr: 'Kapüşon kaldırıldığında görünen üst sırt logosu',
        descriptionEn: 'Upper back graphic visible when hood is worn',
        offsetFromCollarCm: 6,
        dimensions: {
          recommended: {
            widthCm: 10,
            heightCm: 10,
            widthInches: 3.94,
            heightInches: 3.94,
            pixelsAt300Dpi: { width: 1181, height: 1181 }
          },
          min: {
            widthCm: 6,
            heightCm: 6,
            widthInches: 2.36,
            heightInches: 2.36,
            pixelsAt300Dpi: { width: 708, height: 708 }
          },
          max: {
            widthCm: 12,
            heightCm: 12,
            widthInches: 4.72,
            heightInches: 4.72,
            pixelsAt300Dpi: { width: 1417, height: 1417 }
          }
        },
        canvasBox: {
          leftPercent: 44,
          topPercent: 20,
          maxWidthPercent: 12,
          maxHeightPercent: 10
        },
        supportedMethods: ['DTF']
      },
      {
        id: 'left_sleeve_hoodie',
        targetFace: 'left',
        nameEn: 'Left Sleeve',
        nameAr: 'الكتف / الكم الأيسر',
        nameTr: 'Sol Kol / Omuz',
        descriptionAr: 'شعار أو نص ممتد على كم الهودي الأيسر',
        descriptionTr: 'Sol kol üzerinde logo veya metin',
        descriptionEn: 'Left sleeve graphic or text along hoodie arm',
        offsetFromCollarCm: 20,
        dimensions: {
          recommended: {
            widthCm: 8,
            heightCm: 25,
            widthInches: 3.15,
            heightInches: 9.84,
            pixelsAt300Dpi: { width: 944, height: 2952 }
          },
          min: {
            widthCm: 6,
            heightCm: 15,
            widthInches: 2.36,
            heightInches: 5.9,
            pixelsAt300Dpi: { width: 708, height: 1771 }
          },
          max: {
            widthCm: 10,
            heightCm: 35,
            widthInches: 3.94,
            heightInches: 13.78,
            pixelsAt300Dpi: { width: 1181, height: 4133 }
          }
        },
        canvasBox: {
          leftPercent: 40,
          topPercent: 28,
          maxWidthPercent: 20,
          maxHeightPercent: 35
        },
        supportedMethods: ['DTF']
      },
      {
        id: 'right_sleeve_hoodie',
        targetFace: 'right',
        nameEn: 'Right Sleeve',
        nameAr: 'الكتف / الكم الأيمن',
        nameTr: 'Sağ Kol / Omuz',
        descriptionAr: 'شعار أو نص ممتد على كم الهودي الأيمن',
        descriptionTr: 'Sağ kol üzerinde logo veya metin',
        descriptionEn: 'Right sleeve graphic or text along hoodie arm',
        offsetFromCollarCm: 20,
        dimensions: {
          recommended: {
            widthCm: 8,
            heightCm: 25,
            widthInches: 3.15,
            heightInches: 9.84,
            pixelsAt300Dpi: { width: 944, height: 2952 }
          },
          min: {
            widthCm: 6,
            heightCm: 15,
            widthInches: 2.36,
            heightInches: 5.9,
            pixelsAt300Dpi: { width: 708, height: 1771 }
          },
          max: {
            widthCm: 10,
            heightCm: 35,
            widthInches: 3.94,
            heightInches: 13.78,
            pixelsAt300Dpi: { width: 1181, height: 4133 }
          }
        },
        canvasBox: {
          leftPercent: 40,
          topPercent: 28,
          maxWidthPercent: 20,
          maxHeightPercent: 35
        },
        supportedMethods: ['DTF']
      }
    ]
  }
};

/**
 * Normalizes garment category key from product type or title
 */
export function normalizeGarmentType(productTypeOrCategory?: string): 'tshirt' | 'hoodie' | 'sweatshirt' | 'generic' {
  const norm = (productTypeOrCategory || '').toLowerCase();
  if (norm.includes('hoodie') || norm.includes('sweatshirt') || norm.includes('sweat')) {
    return 'hoodie';
  }
  if (norm.includes('tshirt') || norm.includes('t-shirt') || norm.includes('tee') || norm.includes('shirt')) {
    return 'tshirt';
  }
  return 'tshirt';
}

/**
 * Checks if targetFace matches current garment face
 */
export function isFaceMatching(targetFace?: string, currentFace?: string): boolean {
  if (!targetFace || !currentFace) return false;
  const tf = targetFace.trim().toLowerCase();
  const cf = currentFace.trim().toLowerCase();
  if (tf === cf) return true;
  if (
    (tf === 'left' || tf === 'left_shoulder' || tf === 'left_sleeve') &&
    (cf === 'left' || cf === 'left_shoulder' || cf === 'left_sleeve')
  ) return true;
  if (
    (tf === 'right' || tf === 'right_shoulder' || tf === 'right_sleeve') &&
    (cf === 'right' || cf === 'right_shoulder' || cf === 'right_sleeve')
  ) return true;
  return false;
}

/**
 * Get placements for a garment type, optionally filtered by face
 */
export function getPlacementsForGarment(garmentType?: string, faceId?: string): PlacementSpec[] {
  const type = normalizeGarmentType(garmentType);
  const garment = PRINT_CONFIG[type] || PRINT_CONFIG.tshirt;
  if (!faceId) return garment.placements;

  return garment.placements.filter((p) => isFaceMatching(p.targetFace, faceId));
}

/**
 * Find placement by its ID across garment configurations
 */
export function getPlacementById(placementId: string, garmentType?: string): PlacementSpec | undefined {
  if (garmentType) {
    const type = normalizeGarmentType(garmentType);
    const garment = PRINT_CONFIG[type];
    const match = garment?.placements.find((p) => p.id === placementId);
    if (match) return match;
  }
  for (const garment of Object.values(PRINT_CONFIG)) {
    const match = garment.placements.find((p) => p.id === placementId);
    if (match) return match;
  }
  return undefined;
}

/**
 * Converts placement canvasBox percentages into native pixel rect for a mockup image
 */
export function placementToNativeRect(
  placement: PlacementSpec,
  nativeWidth: number,
  nativeHeight: number
): { x: number; y: number; width: number; height: number } {
  const safeNw = Math.max(1, nativeWidth);
  const safeNh = Math.max(1, nativeHeight);
  const { leftPercent, topPercent, maxWidthPercent, maxHeightPercent } = placement.canvasBox;

  return {
    x: Math.round((leftPercent / 100) * safeNw),
    y: Math.round((topPercent / 100) * safeNh),
    width: Math.round((maxWidthPercent / 100) * safeNw),
    height: Math.round((maxHeightPercent / 100) * safeNh),
  };
}

export { STANDARD_GARMENT_L_METRICS } from './garmentNormalizer';

