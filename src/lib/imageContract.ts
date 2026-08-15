/**
 * Product Image Contract & Mockup Validation Engine
 * 
 * Enforces strict validation rules for product mockup / base images per face,
 * guaranteeing that images uploaded or selected meet production requirements
 * regarding resolution, aspect ratio, orientation, and MIME type before
 * entering the Visual Print Area Editor or Design Studio.
 * 
 * Invariants:
 * 1. Zero network or Firebase dependencies (100% pure utility).
 * 2. Does not mutate any input image or dimensions (no scaling, cropping, or upscaling).
 * 3. Rejects invalid, empty, or zero-dimension images deterministically.
 * 4. Separate from PrintArea coordinate logic.
 */

export type ImageFace =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'wrap'
  | string;

export type ImageOrientation =
  | 'portrait'
  | 'landscape'
  | 'square';

export interface NativeImageDimensions {
  width: number;
  height: number;
}

export interface FaceImageContract {
  enabled: boolean;
  required?: boolean;
  orientation?: ImageOrientation;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatio?: number;
  aspectRatioTolerance?: number;
  minPixels?: number;
  maxPixels?: number;
}

export interface ProductImageContract {
  version: number;
  allowedMimeTypes: string[];
  faces: {
    [face: string]: FaceImageContract;
  };
  requireExactDimensions?: boolean;
}

export interface ImageValidationError {
  code: string;
  message: string;
  actual?: unknown;
  expected?: unknown;
}

export interface ImageValidationWarning {
  code: string;
  message: string;
  actual?: unknown;
  expected?: unknown;
}

export interface ImageValidationResult {
  valid: boolean;
  errors: ImageValidationError[];
  warnings: ImageValidationWarning[];
  metadata?: {
    width: number;
    height: number;
    aspectRatio: number;
    orientation: ImageOrientation;
    mimeType: string;
  };
}

/**
 * Standard error codes returned by Image Contract validation
 */
export const IMAGE_ERROR_CODES = {
  INVALID_WIDTH: 'INVALID_WIDTH',
  INVALID_HEIGHT: 'INVALID_HEIGHT',
  MIN_WIDTH_FAILED: 'MIN_WIDTH_FAILED',
  MIN_HEIGHT_FAILED: 'MIN_HEIGHT_FAILED',
  MAX_WIDTH_FAILED: 'MAX_WIDTH_FAILED',
  MAX_HEIGHT_FAILED: 'MAX_HEIGHT_FAILED',
  MIN_PIXELS_FAILED: 'MIN_PIXELS_FAILED',
  MAX_PIXELS_FAILED: 'MAX_PIXELS_FAILED',
  INVALID_ASPECT_RATIO: 'INVALID_ASPECT_RATIO',
  INVALID_ORIENTATION: 'INVALID_ORIENTATION',
  INVALID_MIME_TYPE: 'INVALID_MIME_TYPE',
  FACE_NOT_CONFIGURED: 'FACE_NOT_CONFIGURED',
  FACE_DISABLED: 'FACE_DISABLED',
  REQUIRED_IMAGE_MISSING: 'REQUIRED_IMAGE_MISSING',
} as const;

/**
 * Calculates aspect ratio as width / height, rounded to 4 decimal places.
 * Returns 0 if height <= 0 or width <= 0.
 */
export function calculateImageAspectRatio(width: number, height: number): number {
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    return 0;
  }
  const ratio = width / height;
  return Math.round(ratio * 10000) / 10000;
}

/**
 * Detects image orientation based on dimensions.
 * Uses a strict ratio threshold (within ±0.5% of 1.0) to classify as 'square'.
 */
export function detectImageOrientation(
  width: number,
  height: number,
  squareThreshold: number = 0.005
): ImageOrientation {
  if (width <= 0 || height <= 0) return 'portrait';
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= squareThreshold) {
    return 'square';
  }
  return ratio > 1 ? 'landscape' : 'portrait';
}

/**
 * Validates MIME type against allowed list (case-insensitive).
 */
export function validateImageMimeType(
  mimeType: string,
  allowedMimeTypes: string[]
): { valid: boolean; error?: ImageValidationError } {
  if (!mimeType || typeof mimeType !== 'string') {
    return {
      valid: false,
      error: {
        code: IMAGE_ERROR_CODES.INVALID_MIME_TYPE,
        message: 'MIME type is missing or invalid',
        actual: mimeType,
        expected: allowedMimeTypes,
      },
    };
  }

  const normalized = mimeType.trim().toLowerCase();
  const normalizedAllowed = allowedMimeTypes.map(m => m.trim().toLowerCase());

  if (!normalizedAllowed.includes(normalized)) {
    return {
      valid: false,
      error: {
        code: IMAGE_ERROR_CODES.INVALID_MIME_TYPE,
        message: `MIME type "${mimeType}" is not allowed. Supported formats: ${allowedMimeTypes.join(', ')}`,
        actual: mimeType,
        expected: allowedMimeTypes,
      },
    };
  }

  return { valid: true };
}

/**
 * Validates aspect ratio against expected value within a tolerance.
 */
export function validateImageAspectRatio(
  width: number,
  height: number,
  expectedRatio: number,
  tolerance: number = 0.01
): { valid: boolean; actualRatio: number; error?: ImageValidationError } {
  const actualRatio = calculateImageAspectRatio(width, height);
  if (actualRatio === 0) {
    return {
      valid: false,
      actualRatio: 0,
      error: {
        code: IMAGE_ERROR_CODES.INVALID_ASPECT_RATIO,
        message: 'Cannot calculate aspect ratio from invalid dimensions',
        actual: actualRatio,
        expected: expectedRatio,
      },
    };
  }

  const diff = Math.abs(actualRatio - expectedRatio);
  if (diff > tolerance) {
    return {
      valid: false,
      actualRatio,
      error: {
        code: IMAGE_ERROR_CODES.INVALID_ASPECT_RATIO,
        message: `Image aspect ratio ${actualRatio} deviates from expected ratio ${expectedRatio} (tolerance: ±${tolerance})`,
        actual: actualRatio,
        expected: `${expectedRatio} (±${tolerance})`,
      },
    };
  }

  return { valid: true, actualRatio };
}

/**
 * Validates image orientation against expected orientation.
 */
export function validateImageOrientation(
  width: number,
  height: number,
  expectedOrientation: ImageOrientation
): { valid: boolean; actualOrientation: ImageOrientation; error?: ImageValidationError } {
  const actualOrientation = detectImageOrientation(width, height);
  if (actualOrientation !== expectedOrientation) {
    return {
      valid: false,
      actualOrientation,
      error: {
        code: IMAGE_ERROR_CODES.INVALID_ORIENTATION,
        message: `Image orientation "${actualOrientation}" does not match required orientation "${expectedOrientation}"`,
        actual: actualOrientation,
        expected: expectedOrientation,
      },
    };
  }
  return { valid: true, actualOrientation };
}

/**
 * Validates dimension boundaries (min/max width, height, total pixels).
 */
export function validateImageDimensions(
  dimensions: NativeImageDimensions,
  contract: ProductImageContract,
  face: string
): { valid: boolean; errors: ImageValidationError[]; warnings: ImageValidationWarning[] } {
  const errors: ImageValidationError[] = [];
  const warnings: ImageValidationWarning[] = [];
  const { width, height } = dimensions;

  if (!Number.isFinite(width) || width <= 0) {
    errors.push({
      code: IMAGE_ERROR_CODES.INVALID_WIDTH,
      message: `Image width must be a positive number (received: ${width})`,
      actual: width,
      expected: '> 0',
    });
  }

  if (!Number.isFinite(height) || height <= 0) {
    errors.push({
      code: IMAGE_ERROR_CODES.INVALID_HEIGHT,
      message: `Image height must be a positive number (received: ${height})`,
      actual: height,
      expected: '> 0',
    });
  }

  // If basic dimensions are invalid, return early
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const faceContract = contract.faces[face];
  if (!faceContract) {
    errors.push({
      code: IMAGE_ERROR_CODES.FACE_NOT_CONFIGURED,
      message: `Face "${face}" is not configured in the image contract`,
      actual: face,
      expected: Object.keys(contract.faces),
    });
    return { valid: false, errors, warnings };
  }

  if (!faceContract.enabled) {
    errors.push({
      code: IMAGE_ERROR_CODES.FACE_DISABLED,
      message: `Face "${face}" is disabled in the image contract`,
      actual: face,
      expected: 'enabled: true',
    });
    return { valid: false, errors, warnings };
  }

  // Check minimum dimensions
  if (faceContract.minWidth !== undefined && width < faceContract.minWidth) {
    errors.push({
      code: IMAGE_ERROR_CODES.MIN_WIDTH_FAILED,
      message: `Image width ${width}px is below minimum required width ${faceContract.minWidth}px`,
      actual: width,
      expected: faceContract.minWidth,
    });
  }

  if (faceContract.minHeight !== undefined && height < faceContract.minHeight) {
    errors.push({
      code: IMAGE_ERROR_CODES.MIN_HEIGHT_FAILED,
      message: `Image height ${height}px is below minimum required height ${faceContract.minHeight}px`,
      actual: height,
      expected: faceContract.minHeight,
    });
  }

  // Check maximum dimensions
  if (faceContract.maxWidth !== undefined && width > faceContract.maxWidth) {
    errors.push({
      code: IMAGE_ERROR_CODES.MAX_WIDTH_FAILED,
      message: `Image width ${width}px exceeds maximum allowed width ${faceContract.maxWidth}px`,
      actual: width,
      expected: faceContract.maxWidth,
    });
  }

  if (faceContract.maxHeight !== undefined && height > faceContract.maxHeight) {
    errors.push({
      code: IMAGE_ERROR_CODES.MAX_HEIGHT_FAILED,
      message: `Image height ${height}px exceeds maximum allowed height ${faceContract.maxHeight}px`,
      actual: height,
      expected: faceContract.maxHeight,
    });
  }

  // Check total pixels (width * height)
  const totalPixels = width * height;
  if (faceContract.minPixels !== undefined && totalPixels < faceContract.minPixels) {
    errors.push({
      code: IMAGE_ERROR_CODES.MIN_PIXELS_FAILED,
      message: `Total image resolution ${totalPixels} pixels (${width}×${height}) is below minimum ${faceContract.minPixels} pixels`,
      actual: totalPixels,
      expected: faceContract.minPixels,
    });
  }

  if (faceContract.maxPixels !== undefined && totalPixels > faceContract.maxPixels) {
    errors.push({
      code: IMAGE_ERROR_CODES.MAX_PIXELS_FAILED,
      message: `Total image resolution ${totalPixels} pixels (${width}×${height}) exceeds maximum ${faceContract.maxPixels} pixels`,
      actual: totalPixels,
      expected: faceContract.maxPixels,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Main Product Image Validation Gate
 * Combines MIME, dimension, aspect ratio, and orientation checks into a single structured result.
 */
export function validateProductImage(
  dimensions: NativeImageDimensions,
  mimeType: string,
  contract: ProductImageContract,
  face: string
): ImageValidationResult {
  const errors: ImageValidationError[] = [];
  const warnings: ImageValidationWarning[] = [];

  // 1. Validate MIME Type
  const mimeResult = validateImageMimeType(mimeType, contract.allowedMimeTypes);
  if (!mimeResult.valid && mimeResult.error) {
    errors.push(mimeResult.error);
  }

  // 2. Validate Dimensions & Face Configuration
  const dimResult = validateImageDimensions(dimensions, contract, face);
  errors.push(...dimResult.errors);
  warnings.push(...dimResult.warnings);

  const { width, height } = dimensions;
  const actualRatio = calculateImageAspectRatio(width, height);
  const actualOrientation = detectImageOrientation(width, height);

  // If basic dimensions are valid, check aspect ratio and orientation against face contract
  if (width > 0 && height > 0 && contract.faces[face]?.enabled) {
    const faceContract = contract.faces[face];

    // 3. Validate Orientation
    if (faceContract.orientation) {
      const orientResult = validateImageOrientation(width, height, faceContract.orientation);
      if (!orientResult.valid && orientResult.error) {
        errors.push(orientResult.error);
      }
    }

    // 4. Validate Aspect Ratio
    if (faceContract.aspectRatio !== undefined) {
      const tolerance = faceContract.aspectRatioTolerance ?? 0.01;
      const ratioResult = validateImageAspectRatio(width, height, faceContract.aspectRatio, tolerance);
      if (!ratioResult.valid && ratioResult.error) {
        errors.push(ratioResult.error);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      width: Math.max(0, width || 0),
      height: Math.max(0, height || 0),
      aspectRatio: actualRatio,
      orientation: actualOrientation,
      mimeType: (mimeType || '').trim().toLowerCase(),
    },
  };
}

/**
 * Default contracts for standard product categories.
 * Used as test baselines and default fallbacks when a product has no custom contract.
 */
export const DEFAULT_TSHIRT_CONTRACT: ProductImageContract = {
  version: 1,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  faces: {
    front: {
      enabled: true,
      required: true,
      orientation: 'portrait',
      minWidth: 2000,
      minHeight: 2500,
      aspectRatio: 0.8,
      aspectRatioTolerance: 0.02,
      minPixels: 5000000,
    },
    back: {
      enabled: true,
      required: false,
      orientation: 'portrait',
      minWidth: 2000,
      minHeight: 2500,
      aspectRatio: 0.8,
      aspectRatioTolerance: 0.02,
      minPixels: 5000000,
    },
    left: {
      enabled: true,
      required: false,
      orientation: 'portrait',
      minWidth: 1000,
      minHeight: 1200,
    },
    right: {
      enabled: true,
      required: false,
      orientation: 'portrait',
      minWidth: 1000,
      minHeight: 1200,
    },
  },
};

export const DEFAULT_MUG_CONTRACT: ProductImageContract = {
  version: 1,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  faces: {
    wrap: {
      enabled: true,
      required: true,
      orientation: 'landscape',
      minWidth: 2400,
      minHeight: 1200,
      aspectRatio: 2.0,
      aspectRatioTolerance: 0.05,
    },
  },
};

export const DEFAULT_HAT_CONTRACT: ProductImageContract = {
  version: 1,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  faces: {
    front: {
      enabled: true,
      required: true,
      orientation: 'square',
      minWidth: 1500,
      minHeight: 1500,
      aspectRatio: 1.0,
      aspectRatioTolerance: 0.02,
    },
  },
};

/**
 * Returns default contract based on normalized product category
 */
export function getDefaultImageContract(category?: string): ProductImageContract {
  if (!category) return DEFAULT_TSHIRT_CONTRACT;
  const lower = category.toLowerCase();
  if (lower.includes('mug') || lower.includes('kupa') || lower.includes('كوب')) {
    return DEFAULT_MUG_CONTRACT;
  }
  if (lower.includes('hat') || lower.includes('cap') || lower.includes('قبعة')) {
    return DEFAULT_HAT_CONTRACT;
  }
  return DEFAULT_TSHIRT_CONTRACT;
}
