export interface ProductImageItem {
  id: string;
  url: string;
  type: 'ready' | 'blank';
  face: 'front' | 'back' | 'right' | 'left' | 'right_shoulder' | 'left_shoulder' | 'collar' | 'other';
  angle?: 'straight' | 'tilted_45' | 'top_down' | 'bottom_up' | 'flat_lay' | 'hanging' | 'model';
  colorHex?: string;
  title?: string;
  printArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
    nativeWidth: number;
    nativeHeight: number;
    physicalWidthCm?: number;
    physicalHeightCm?: number;
    targetDPI?: number;
    printMethod?: string;
    bleed?: number;
    placementId?: string;
    offsetFromCollarCm?: number;
  };
}

export interface PrintArea {
  mirrorHorizontal?: boolean;
  id: string;
  name: string;
  width: number;
  height: number;
  top: number;
  left: number;
  shape?: 'rectangle' | 'circle';
  clipPath?: string;
  bleed?: number; // Bleed in millimeters (default 0)

  // High-Resolution Native Calibration coordinates (Unscaled Image Space)
  nativeWidth?: number;
  nativeHeight?: number;

  // Safe area within print boundaries
  safeArea?: {
    width: number;
    height: number;
    top: number;
    left: number;
    shape?: 'rect' | 'circle';
  };

  // Production / Manufacturing Settings
  physicalWidthCm?: number;   // Physical print width in centimeters (e.g. 30 cm)
  physicalHeightCm?: number;  // Physical print height in centimeters (e.g. 40 cm)
  targetDPI?: number;         // Print DPI resolution for factory output (e.g. 300 DPI)
  printMethod?: 'DTF' | 'DTG' | 'Sublimation' | 'ScreenPrint' | 'Embroidery' | string;
  placementId?: string;       // ID of approved placement (e.g. left_chest, center_chest, full_front)
  offsetFromCollarCm?: number;// Distance from collar in centimeters
}

export interface ImageSpecificGeometry {
  imageId: string;
  imageUrl?: string;
  faceId?: string;
  angle?: string;
  nativeWidth: number;
  nativeHeight: number;
  printArea: PrintArea;
}

export interface CalibratedPlacementRect {
  placementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nativeWidth: number;
  nativeHeight: number;
  physicalWidthCm?: number;
  physicalHeightCm?: number;
  offsetFromCollarCm?: number;
}

export interface FaceConfig {
  name: string;
  enabled?: boolean;
  printArea: PrintArea;
}

export type PrintStrategy = 'dtf_only' | 'sublimation_only' | 'customer_choice';
export type PrintMethodType = 'DTF' | 'Sublimation';

export interface CustomizationConfig {
  enabled: boolean;
  version?: number;

  allowCustomerUpload?: boolean;
  allowText?: boolean;
  allowStickers?: boolean;
  allowFreeMode?: boolean;

  // Print technology strategy
  printStrategy?: PrintStrategy;
  defaultPrintMethod?: PrintMethodType;
  allowedPrintMethods?: PrintMethodType[];

  productType?: string; // The normalized product category (e.g. 't-shirt', 'mug', 'hat', 'phone_case')
  garmentType?: 'tshirt' | 'hoodie' | 'sweatshirt' | 'mug' | 'hat' | 'phone_case' | 'generic';
  allowedPlacements?: string[]; // IDs of approved placements allowed for this product
  defaultPlacementId?: string;
  mug_meta?: {
    mugStyle: 'standard' | 'magic' | 'inner_color';
    mugCapacities: string[];
    magicRevealCoverColor?: string;
    handleMarginCm?: number;
    supportsFullWrap?: boolean;
  };

  // Custom calibrated placement coordinates per product (mapped by placementId)
  calibratedPlacements?: {
    [placementId: string]: CalibratedPlacementRect;
  };

  // Full face boundary configured for Free Mode per face
  freeModeBounds?: {
    [faceId: string]: {
      x: number;
      y: number;
      width: number;
      height: number;
      nativeWidth: number;
      nativeHeight: number;
    };
  };

  // Legacy / fallback face configurations
  faces: {
    [faceId: string]: FaceConfig;
  };

  // Image-driven geometry registry
  image_geometries?: {
    [imageKey: string]: ImageSpecificGeometry;
  };
}

export interface ProductionSnapshot {
  snapshotVersion: number;
  editorVersion: number;

  customization_config: CustomizationConfig;

  // Flattened for easy access by Production Renderer
  printAreas: {
    [faceId: string]: PrintArea;
  };
}

/**
 * Recursively removes all `undefined` values from an object before saving to Firestore.
 * Preserves Firestore FieldValue instances (serverTimestamp, deleteField, etc.) and Dates.
 */
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (obj instanceof Date) {
    return obj;
  }
  if (typeof obj === 'object' && obj !== null && (obj as any)._methodName) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore).filter((v) => v !== undefined) as any;
  }
  if (typeof obj === 'object') {
    if (obj.constructor && obj.constructor.name !== 'Object') {
      return obj;
    }
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * Normalizes a PrintArea object defensively to guarantee valid numbers and prevent runtime errors
 */
export function normalizePrintArea(pa?: Partial<PrintArea> | null, defaultId: string = 'front'): PrintArea {
  const result: PrintArea = {
    id: pa?.id || defaultId,
    name: pa?.name || defaultId.toUpperCase(),
    width: Number(pa?.width) > 0 ? Number(pa?.width) : 200,
    height: Number(pa?.height) > 0 ? Number(pa?.height) : 200,
    top: typeof pa?.top === 'number' && !isNaN(pa.top) ? pa.top : 100,
    left: typeof pa?.left === 'number' && !isNaN(pa.left) ? pa.left : 100,
    shape: pa?.shape || 'rectangle',
    bleed: typeof pa?.bleed === 'number' && !isNaN(pa.bleed) ? pa.bleed : 0,
  };

  if (typeof pa?.physicalWidthCm === 'number') {
    result.physicalWidthCm = pa.physicalWidthCm;
  }
  if (typeof pa?.physicalHeightCm === 'number') {
    result.physicalHeightCm = pa.physicalHeightCm;
  }
  if (typeof pa?.mirrorHorizontal === 'boolean') result.mirrorHorizontal = pa.mirrorHorizontal;
  if (typeof pa?.targetDPI === 'number') {
    result.targetDPI = pa.targetDPI;
  }
  if (pa?.printMethod) {
    result.printMethod = pa.printMethod;
  }
  if (pa?.placementId) {
    result.placementId = pa.placementId;
  }
  if (typeof pa?.offsetFromCollarCm === 'number') {
    result.offsetFromCollarCm = pa.offsetFromCollarCm;
  }

  if (pa?.clipPath) {
    result.clipPath = pa.clipPath;
  }
  if (typeof pa?.nativeWidth === 'number') {
    result.nativeWidth = pa.nativeWidth;
  }
  if (typeof pa?.nativeHeight === 'number') {
    result.nativeHeight = pa.nativeHeight;
  }
  if (pa?.safeArea) {
    result.safeArea = {
      width: Number(pa.safeArea.width) > 0 ? Number(pa.safeArea.width) : (Number(pa?.width) > 0 ? Number(pa.width) * 0.9 : 180),
      height: Number(pa.safeArea.height) > 0 ? Number(pa.safeArea.height) : (Number(pa?.height) > 0 ? Number(pa.height) * 0.9 : 180),
      top: typeof pa.safeArea.top === 'number' && !isNaN(pa.safeArea.top) ? pa.safeArea.top : 110,
      left: typeof pa.safeArea.left === 'number' && !isNaN(pa.safeArea.left) ? pa.safeArea.left : 110,
      shape: pa.safeArea.shape || 'rect',
    };
  }

  return result;
}

/**
 * Default Category Customization Configurations
 */
export const CATEGORY_CUSTOMIZATION_DEFAULTS: Record<string, CustomizationConfig> = {
  'tshirts': {
    enabled: true,
    productType: 't-shirt',
    garmentType: 'tshirt',
    printStrategy: 'dtf_only',
    defaultPrintMethod: 'DTF',
    allowedPrintMethods: ['DTF'],
    allowCustomerUpload: true,
    allowText: true,
    allowStickers: true,
    allowFreeMode: true,
    allowedPlacements: ['center_chest', 'left_chest', 'full_front', 'back_collar', 'full_back', 'right_sleeve', 'left_sleeve'],
    defaultPlacementId: 'center_chest',
    faces: {
      front: {
        name: 'Front',
        enabled: true,
        printArea: {
          id: 'front',
          name: 'Front Area',
          width: 1000,
          height: 1000,
          top: 0,
          left: 0,
          nativeWidth: 1000,
          nativeHeight: 1000,
          printMethod: 'DTF'
        }
      },
      back: {
        name: 'Back',
        enabled: true,
        printArea: {
          id: 'back',
          name: 'Back Area',
          width: 1000,
          height: 1000,
          top: 0,
          left: 0,
          nativeWidth: 1000,
          nativeHeight: 1000,
          printMethod: 'DTF'
        }
      },
      left: {
        name: 'Left Sleeve',
        enabled: true,
        printArea: {
          id: 'left',
          name: 'Left Sleeve Area',
          width: 1000,
          height: 1000,
          top: 0,
          left: 0,
          nativeWidth: 1000,
          nativeHeight: 1000,
          printMethod: 'DTF'
        }
      },
      right: {
        name: 'Right Sleeve',
        enabled: true,
        printArea: {
          id: 'right',
          name: 'Right Sleeve Area',
          width: 1000,
          height: 1000,
          top: 0,
          left: 0,
          nativeWidth: 1000,
          nativeHeight: 1000,
          printMethod: 'DTF'
        }
      }
    }
  },
  'hoodies': {
    enabled: true,
    productType: 'hoodie',
    garmentType: 'hoodie',
    printStrategy: 'dtf_only',
    defaultPrintMethod: 'DTF',
    allowedPrintMethods: ['DTF'],
    allowCustomerUpload: true,
    allowText: true,
    allowStickers: true,
    allowFreeMode: true,
    allowedPlacements: ['left_chest_hoodie', 'center_chest_hoodie', 'front_pocket_hoodie', 'full_back_hoodie', 'back_collar_hoodie', 'left_sleeve_hoodie', 'right_sleeve_hoodie'],
    defaultPlacementId: 'center_chest_hoodie',
    faces: {
      front: {
        name: 'Front',
        enabled: true,
        printArea: {
          id: 'front',
          name: 'Front Area',
          width: 1000,
          height: 1000,
          top: 0,
          left: 0,
          nativeWidth: 1000,
          nativeHeight: 1000,
          printMethod: 'DTF'
        }
      },
      back: {
        name: 'Back',
        enabled: true,
        printArea: {
          id: 'back',
          name: 'Back Area',
          width: 1000,
          height: 1000,
          top: 0,
          left: 0,
          nativeWidth: 1000,
          nativeHeight: 1000,
          printMethod: 'DTF'
        }
      },
      left: {
        name: 'Left Sleeve',
        enabled: true,
        printArea: {
          id: 'left',
          name: 'Left Sleeve Area',
          width: 1000,
          height: 1000,
          top: 0,
          left: 0,
          nativeWidth: 1000,
          nativeHeight: 1000,
          printMethod: 'DTF'
        }
      },
      right: {
        name: 'Right Sleeve',
        enabled: true,
        printArea: {
          id: 'right',
          name: 'Right Sleeve Area',
          width: 1000,
          height: 1000,
          top: 0,
          left: 0,
          nativeWidth: 1000,
          nativeHeight: 1000,
          printMethod: 'DTF'
        }
      }
    }
  },
  'mugs': {
    enabled: true,
    productType: 'mug',
    garmentType: 'mug',
    printStrategy: 'sublimation_only',
    defaultPrintMethod: 'Sublimation',
    allowedPrintMethods: ['Sublimation'],
    allowCustomerUpload: true,
    allowText: true,
    allowStickers: true,
    allowFreeMode: true,
    allowedPlacements: ['mug_full_wrap', 'mug_front', 'mug_back'],
    defaultPlacementId: 'mug_full_wrap',
    faces: {
      front: {
        name: 'Wrap Around',
        enabled: true,
        printArea: {
          id: 'front',
          name: 'Wrap Area',
          width: 280,
          height: 140,
          top: 180,
          left: 60,
          bleed: 3,
          physicalWidthCm: 23,
          physicalHeightCm: 9.5,
          targetDPI: 300,
          printMethod: 'Sublimation'
        }
      }
    }
  },
  'hats': {
    enabled: true,
    productType: 'hat',
    garmentType: 'hat',
    printStrategy: 'dtf_only',
    defaultPrintMethod: 'DTF',
    allowedPrintMethods: ['DTF'],
    allowCustomerUpload: true,
    allowText: true,
    allowStickers: true,
    allowFreeMode: true,
    allowedPlacements: ['hat_front_crown', 'hat_left_side', 'hat_right_side', 'hat_back_arch'],
    defaultPlacementId: 'hat_front_crown',
    faces: {
      front: {
        name: 'Front Patch',
        enabled: true,
        printArea: {
          id: 'front',
          name: 'Front Panel',
          width: 140,
          height: 80,
          top: 180,
          left: 130,
          bleed: 2,
          physicalWidthCm: 11,
          physicalHeightCm: 5.5,
          targetDPI: 300,
          printMethod: 'DTF'
        }
      }
    }
  },
  'phone_cases': {
    enabled: true,
    productType: 'phone_case',
    garmentType: 'phone_case',
    printStrategy: 'sublimation_only',
    defaultPrintMethod: 'Sublimation',
    allowedPrintMethods: ['Sublimation', 'DTF'],
    allowCustomerUpload: true,
    allowText: true,
    allowStickers: true,
    allowFreeMode: true,
    allowedPlacements: ['phone_full_back', 'phone_lower_badge'],
    defaultPlacementId: 'phone_full_back',
    faces: {
      front: {
        name: 'Full Back Case',
        enabled: true,
        printArea: {
          id: 'front',
          name: 'Phone Case Back',
          width: 240,
          height: 480,
          top: 60,
          left: 80,
          bleed: 3,
          physicalWidthCm: 7.5,
          physicalHeightCm: 15.5,
          targetDPI: 300,
          printMethod: 'Sublimation'
        }
      }
    }
  },
  'generic': {
    enabled: true,
    productType: 'generic',
    garmentType: 'generic',
    printStrategy: 'dtf_only',
    defaultPrintMethod: 'DTF',
    allowedPrintMethods: ['DTF'],
    allowCustomerUpload: true,
    allowText: true,
    allowStickers: true,
    allowFreeMode: true,
    allowedPlacements: ['generic_center'],
    defaultPlacementId: 'generic_center',
    faces: {
      front: {
        name: 'Front',
        enabled: true,
        printArea: {
          id: 'front',
          name: 'Print Area',
          width: 200,
          height: 200,
          top: 100,
          left: 100,
          bleed: 5,
          physicalWidthCm: 30,
          physicalHeightCm: 30,
          targetDPI: 300,
          printMethod: 'DTF'
        }
      }
    }
  }
};

/**
 * Gets a clean, deep-cloned customization config for a product category
 */
export function getCustomizationConfig(categoryId?: string): CustomizationConfig {
  const normalizedKey = (categoryId || '').toLowerCase();

  if (normalizedKey.includes('tshirt') || normalizedKey.includes('t-shirt') || normalizedKey.includes('tee')) {
    return JSON.parse(JSON.stringify(CATEGORY_CUSTOMIZATION_DEFAULTS.tshirts));
  }
  if (normalizedKey.includes('hoodie') || normalizedKey.includes('sweatshirt')) {
    return JSON.parse(JSON.stringify(CATEGORY_CUSTOMIZATION_DEFAULTS.hoodies));
  }
  if (normalizedKey.includes('mug') || normalizedKey.includes('cup') || normalizedKey.includes('kupa') || normalizedKey.includes('كوب')) {
    return JSON.parse(JSON.stringify(CATEGORY_CUSTOMIZATION_DEFAULTS.mugs));
  }
  if (normalizedKey.includes('hat') || normalizedKey.includes('cap') || normalizedKey.includes('şapka') || normalizedKey.includes('قبعة')) {
    return JSON.parse(JSON.stringify(CATEGORY_CUSTOMIZATION_DEFAULTS.hats));
  }
  if (
    normalizedKey.includes('phone') ||
    normalizedKey.includes('case') ||
    normalizedKey.includes('kılıf') ||
    normalizedKey.includes('kilif') ||
    normalizedKey.includes('telefon') ||
    normalizedKey.includes('غلاف')
  ) {
    return JSON.parse(JSON.stringify(CATEGORY_CUSTOMIZATION_DEFAULTS.phone_cases));
  }

  return JSON.parse(JSON.stringify(CATEGORY_CUSTOMIZATION_DEFAULTS.generic));
}
