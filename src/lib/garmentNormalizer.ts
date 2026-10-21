/**
 * Standard Garment Normalizer (Reference Size: Large - L, 1000x1000 Canvas)
 * 
 * Implements the 3-Step Physical-to-Digital calibration pipeline:
 * Step 1: Auto-Crop / Trim transparent padding around garment.
 * Step 2: Height Normalization (74 cm -> 740 px).
 * Step 3: Fixed Canvas Placement (1000x1000 Canvas, Centered horizontally, Top = 100 px).
 */

export const STANDARD_GARMENT_L_METRICS = {
  referenceSize: "L",
  canvas: {
    width: 1000,
    height: 1000,
    scalePixelsPerCm: 10,
  },
  garmentBounds: {
    realDimensionsCm: {
      length: 74,
      shoulderWidth: 47,
      chestWidth: 56,
      bottomHemWidth: 56,
      sleeveLength: 22,
    },
    boxInCanvas: {
      top: 100,
      left: 220,
      width: 560,
      height: 740,
    },
  },
  placements: {
    left_chest: {
      widthPx: 100,
      heightPx: 100,
      topPx: 210,
      leftPx: 600,
      widthCm: 10,
      heightCm: 10,
      offsetFromCollarCm: 8,
      leftPercent: 60,
      topPercent: 21,
      maxWidthPercent: 10,
      maxHeightPercent: 10,
    },
    full_front: {
      widthPx: 300,
      heightPx: 400,
      topPx: 195,
      leftPx: 350,
      widthCm: 30,
      heightCm: 40,
      offsetFromCollarCm: 6.5,
      leftPercent: 35,
      topPercent: 19.5,
      maxWidthPercent: 30,
      maxHeightPercent: 40,
    },
    center_chest: {
      widthPx: 240,
      heightPx: 160,
      topPx: 210,
      leftPx: 380,
      widthCm: 24,
      heightCm: 16,
      offsetFromCollarCm: 8,
      leftPercent: 38,
      topPercent: 21,
      maxWidthPercent: 24,
      maxHeightPercent: 16,
    },
    full_back: {
      widthPx: 320,
      heightPx: 420,
      topPx: 200,
      leftPx: 340,
      widthCm: 32,
      heightCm: 42,
      offsetFromCollarCm: 8,
      leftPercent: 34,
      topPercent: 20,
      maxWidthPercent: 32,
      maxHeightPercent: 42,
    },
    back_collar: {
      widthPx: 80,
      heightPx: 80,
      topPx: 150,
      leftPx: 460,
      widthCm: 8,
      heightCm: 8,
      offsetFromCollarCm: 4,
      leftPercent: 46,
      topPercent: 15,
      maxWidthPercent: 8,
      maxHeightPercent: 8,
    },
    left_sleeve: {
      widthPx: 200,
      heightPx: 200,
      topPx: 250,
      leftPx: 400,
      widthCm: 8,
      heightCm: 8,
      offsetFromCollarCm: 10,
      leftPercent: 40,
      topPercent: 25,
      maxWidthPercent: 20,
      maxHeightPercent: 20,
    },
    right_sleeve: {
      widthPx: 200,
      heightPx: 200,
      topPx: 250,
      leftPx: 400,
      widthCm: 8,
      heightCm: 8,
      offsetFromCollarCm: 10,
      leftPercent: 40,
      topPercent: 25,
      maxWidthPercent: 20,
      maxHeightPercent: 20,
    },
  },
} as const;

/**
 * Finds the bounding box of non-transparent pixels in an HTML canvas
 */
export function getNonTransparentBoundingBox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alphaThreshold = 15
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alphaIndex = (y * width + x) * 4 + 3;
      if (data[alphaIndex] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null; // Empty image or completely transparent
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Normalizes any garment mockup image (File, Blob, or Image Element)
 * into a standardized 1000x1000 PNG following the 3-step pipeline.
 */
export async function normalizeGarmentImage(
  imageSource: File | Blob | string | HTMLImageElement,
  options?: {
    targetCanvasSize?: number; // Default 1000
    targetGarmentHeight?: number; // Default 740
    targetTopOffset?: number; // Default 100
  }
): Promise<{
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalTrimmedBounds?: { width: number; height: number };
}> {
  const targetCanvasSize = options?.targetCanvasSize || 1000;
  const targetGarmentHeight = options?.targetGarmentHeight || 740;
  const targetTopOffset = options?.targetTopOffset || 100;

  // 1. Load image into memory
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof imageSource === 'object' && imageSource instanceof HTMLImageElement) {
      if (imageSource.complete) resolve(imageSource);
      else {
        imageSource.onload = () => resolve(imageSource);
        imageSource.onerror = reject;
      }
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;

    if (typeof imageSource === 'string') {
      image.src = imageSource;
    } else {
      image.src = URL.createObjectURL(imageSource);
    }
  });

  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;

  // 2. Draw to temporary canvas to inspect pixel data for transparency trimming
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = origWidth;
  tempCanvas.height = origHeight;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

  if (!tempCtx) {
    throw new Error('Could not create 2D canvas context for normalization');
  }

  tempCtx.drawImage(img, 0, 0);

  // 3. Step 1: Auto-Crop / Trim transparent edges
  const bbox = getNonTransparentBoundingBox(tempCtx, origWidth, origHeight);

  // If no transparent padding detected or image is solid, use full dimensions
  const cropX = bbox ? bbox.minX : 0;
  const cropY = bbox ? bbox.minY : 0;
  const cropW = bbox ? bbox.width : origWidth;
  const cropH = bbox ? bbox.height : origHeight;

  // 4. Step 2: Height Normalization
  // Scale garment so height is exactly targetGarmentHeight (740 px)
  const scale = targetGarmentHeight / cropH;
  const scaledWidth = Math.round(cropW * scale);
  const scaledHeight = targetGarmentHeight;

  // 5. Step 3: Fixed Canvas Placement on 1000x1000 Frame
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetCanvasSize;
  finalCanvas.height = targetCanvasSize;
  const finalCtx = finalCanvas.getContext('2d');

  if (!finalCtx) {
    throw new Error('Could not create final 1000x1000 canvas context');
  }

  // Clear canvas transparently
  finalCtx.clearRect(0, 0, targetCanvasSize, targetCanvasSize);
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';

  // Centered horizontally: X center = 500
  const finalLeft = Math.round((targetCanvasSize - scaledWidth) / 2);
  const finalTop = targetTopOffset; // 100 px

  // Draw the trimmed portion scaled and centered
  finalCtx.drawImage(
    tempCanvas,
    cropX, cropY, cropW, cropH,
    finalLeft, finalTop, scaledWidth, scaledHeight
  );

  // Output as PNG Blob and DataURL
  return await new Promise((resolve, reject) => {
    finalCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas normalization toBlob failed'));
          return;
        }
        const dataUrl = finalCanvas.toDataURL('image/png');
        resolve({
          blob,
          dataUrl,
          width: targetCanvasSize,
          height: targetCanvasSize,
          originalTrimmedBounds: { width: cropW, height: cropH },
        });
      },
      'image/png',
      1.0
    );
  });
}

/**
 * Normalizes a File instance (e.g. from an <input type="file">) and returns a clean File object
 */
export async function normalizeGarmentImageFile(file: File): Promise<File> {
  const result = await normalizeGarmentImage(file);
  const cleanName = file.name.replace(/\.[^/.]+$/, '') + '_standard_L_1000x1000.png';
  return new File([result.blob], cleanName, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}
