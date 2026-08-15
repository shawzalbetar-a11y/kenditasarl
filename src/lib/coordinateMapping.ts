/**
 * Coordinate Mapping & Geometry Engine
 * 
 * Pure mathematical functions for transforming coordinates and rectangles between
 * native image pixels, displayed screen coordinates, and physical print dimensions.
 * 
 * Invariants:
 * 1. Zero external side effects (100% pure functions).
 * 2. No screen-space coordinates are ever stored permanently.
 * 3. Rectangles are strictly bounded within [0, 0, nativeWidth, nativeHeight].
 * 4. Aspect ratios and letterbox offsets (object-fit: contain) are accounted for deterministically.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayBounds {
  containerWidth: number;
  containerHeight: number;
  nativeWidth: number;
  nativeHeight: number;
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface PhysicalDimensions {
  physicalWidthCm: number;
  physicalHeightCm: number;
}

export interface CoordinateValidationResult {
  isValid: boolean;
  errors: string[];
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * Calculates letterbox / contain bounds when an image is rendered inside a viewport
 * equivalent to CSS `object-fit: contain`.
 */
export function calculateDisplayBounds(
  containerWidth: number,
  containerHeight: number,
  nativeWidth: number,
  nativeHeight: number
): DisplayBounds {
  if (containerWidth <= 0 || containerHeight <= 0 || nativeWidth <= 0 || nativeHeight <= 0) {
    return {
      containerWidth: Math.max(0, containerWidth),
      containerHeight: Math.max(0, containerHeight),
      nativeWidth: Math.max(0, nativeWidth),
      nativeHeight: Math.max(0, nativeHeight),
      displayWidth: 0,
      displayHeight: 0,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    };
  }

  const scale = Math.min(containerWidth / nativeWidth, containerHeight / nativeHeight);
  const displayWidth = nativeWidth * scale;
  const displayHeight = nativeHeight * scale;
  const offsetX = (containerWidth - displayWidth) / 2;
  const offsetY = (containerHeight - displayHeight) / 2;

  return {
    containerWidth,
    containerHeight,
    nativeWidth,
    nativeHeight,
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
    scale,
  };
}

/**
 * Transforms a point from native image pixel coordinates to displayed container coordinates.
 */
export function nativeToDisplayPoint(point: Point, bounds: DisplayBounds): Point {
  return {
    x: bounds.offsetX + point.x * bounds.scale,
    y: bounds.offsetY + point.y * bounds.scale,
  };
}

/**
 * Transforms a point from displayed container coordinates to native image pixel coordinates.
 */
export function displayToNativePoint(point: Point, bounds: DisplayBounds): Point {
  if (bounds.scale <= 0) return { x: 0, y: 0 };
  return {
    x: (point.x - bounds.offsetX) / bounds.scale,
    y: (point.y - bounds.offsetY) / bounds.scale,
  };
}

/**
 * Transforms a rectangle from native image coordinates to displayed container coordinates.
 */
export function nativeToDisplayRect(rect: Rect, bounds: DisplayBounds): Rect {
  return {
    x: bounds.offsetX + rect.x * bounds.scale,
    y: bounds.offsetY + rect.y * bounds.scale,
    width: rect.width * bounds.scale,
    height: rect.height * bounds.scale,
  };
}

/**
 * Transforms a rectangle from displayed container coordinates to native image coordinates.
 */
export function displayToNativeRect(rect: Rect, bounds: DisplayBounds): Rect {
  if (bounds.scale <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: (rect.x - bounds.offsetX) / bounds.scale,
    y: (rect.y - bounds.offsetY) / bounds.scale,
    width: rect.width / bounds.scale,
    height: rect.height / bounds.scale,
  };
}

/**
 * Strictly clamps a rectangle inside native image boundaries [0, 0, nativeWidth, nativeHeight].
 * Enforces configurable minimum width and height without overflowing bounds.
 */
export function clampRectToNativeBounds(
  rect: Rect,
  nativeWidth: number,
  nativeHeight: number,
  minWidth: number = 20,
  minHeight: number = 20
): Rect {
  const safeNativeW = Math.max(1, nativeWidth);
  const safeNativeH = Math.max(1, nativeHeight);
  const safeMinW = Math.min(Math.max(1, minWidth), safeNativeW);
  const safeMinH = Math.min(Math.max(1, minHeight), safeNativeH);

  // Clamp dimensions
  let width = Math.max(safeMinW, Math.min(rect.width, safeNativeW));
  let height = Math.max(safeMinH, Math.min(rect.height, safeNativeH));

  // Clamp positions
  let x = Math.max(0, Math.min(rect.x, safeNativeW - width));
  let y = Math.max(0, Math.min(rect.y, safeNativeH - height));

  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
  };
}

/**
 * Applies a drag translation to a rectangle and clamps the result within native bounds.
 */
export function moveRectWithClamp(
  initialRect: Rect,
  deltaXNative: number,
  deltaYNative: number,
  nativeWidth: number,
  nativeHeight: number
): Rect {
  const targetRect: Rect = {
    x: initialRect.x + deltaXNative,
    y: initialRect.y + deltaYNative,
    width: initialRect.width,
    height: initialRect.height,
  };

  return clampRectToNativeBounds(
    targetRect,
    nativeWidth,
    nativeHeight,
    initialRect.width,
    initialRect.height
  );
}

/**
 * Resizes a rectangle using one of the 8 resize handles, enforcing min dimensions and boundaries.
 */
export function resizeRectWithHandle(
  initialRect: Rect,
  handle: ResizeHandle,
  deltaXNative: number,
  deltaYNative: number,
  nativeWidth: number,
  nativeHeight: number,
  minWidth: number = 20,
  minHeight: number = 20
): Rect {
  const safeMinW = Math.min(Math.max(1, minWidth), nativeWidth);
  const safeMinH = Math.min(Math.max(1, minHeight), nativeHeight);

  let { x, y, width, height } = initialRect;
  const initialRight = x + width;
  const initialBottom = y + height;

  // Handle horizontal resizing
  if (handle === 'w' || handle === 'nw' || handle === 'sw') {
    const proposedLeft = Math.max(0, Math.min(x + deltaXNative, initialRight - safeMinW));
    width = initialRight - proposedLeft;
    x = proposedLeft;
  } else if (handle === 'e' || handle === 'ne' || handle === 'se') {
    const proposedRight = Math.min(nativeWidth, Math.max(initialRight + deltaXNative, x + safeMinW));
    width = proposedRight - x;
  }

  // Handle vertical resizing
  if (handle === 'n' || handle === 'nw' || handle === 'ne') {
    const proposedTop = Math.max(0, Math.min(y + deltaYNative, initialBottom - safeMinH));
    height = initialBottom - proposedTop;
    y = proposedTop;
  } else if (handle === 's' || handle === 'sw' || handle === 'se') {
    const proposedBottom = Math.min(nativeHeight, Math.max(initialBottom + deltaYNative, y + safeMinH));
    height = proposedBottom - y;
  }

  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
  };
}

/**
 * Converts pixel dimensions to physical centimeters based on target DPI.
 * Formula: cm = (pixels * 2.54) / DPI
 */
export function pixelsToCm(pixels: number, dpi: number = 300, precision: number = 2): number {
  if (dpi <= 0 || pixels <= 0) return 0;
  const cm = (pixels * 2.54) / dpi;
  const factor = Math.pow(10, precision);
  return Math.round(cm * factor) / factor;
}

/**
 * Converts physical centimeters to pixel dimensions based on target DPI.
 * Formula: pixels = (cm / 2.54) * DPI
 */
export function cmToPixels(cm: number, dpi: number = 300): number {
  if (dpi <= 0 || cm <= 0) return 0;
  const pixels = (cm / 2.54) * dpi;
  return Math.round(pixels);
}

/**
 * Calculates physical dimensions (in cm) from pixel width, height, and target DPI.
 */
export function calculatePhysicalDimensions(
  widthPx: number,
  heightPx: number,
  dpi: number = 300,
  precision: number = 2
): PhysicalDimensions {
  return {
    physicalWidthCm: pixelsToCm(widthPx, dpi, precision),
    physicalHeightCm: pixelsToCm(heightPx, dpi, precision),
  };
}

/**
 * Calculates pixel dimensions from physical cm width, height, and target DPI.
 */
export function calculatePixelDimensions(
  physicalWidthCm: number,
  physicalHeightCm: number,
  dpi: number = 300
): Dimensions {
  return {
    width: cmToPixels(physicalWidthCm, dpi),
    height: cmToPixels(physicalHeightCm, dpi),
  };
}

/**
 * Validates whether a PrintArea rectangle strictly obeys all coordinate invariants.
 */
export function validatePrintAreaCoordinates(
  rect: Rect,
  nativeWidth: number,
  nativeHeight: number
): CoordinateValidationResult {
  const errors: string[] = [];

  if (rect.width <= 0) {
    errors.push(`Width must be greater than 0 (received: ${rect.width})`);
  }
  if (rect.height <= 0) {
    errors.push(`Height must be greater than 0 (received: ${rect.height})`);
  }
  if (rect.x < 0) {
    errors.push(`X coordinate cannot be negative (received: ${rect.x})`);
  }
  if (rect.y < 0) {
    errors.push(`Y coordinate cannot be negative (received: ${rect.y})`);
  }
  if (rect.x + rect.width > nativeWidth + 0.01) {
    errors.push(
      `Print area overflows image width: ${rect.x} + ${rect.width} = ${rect.x + rect.width} > ${nativeWidth}`
    );
  }
  if (rect.y + rect.height > nativeHeight + 0.01) {
    errors.push(
      `Print area overflows image height: ${rect.y} + ${rect.height} = ${rect.y + rect.height} > ${nativeHeight}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
