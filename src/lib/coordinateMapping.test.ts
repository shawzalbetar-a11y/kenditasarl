import assert from 'node:assert/strict';
import {
  calculateDisplayBounds,
  nativeToDisplayPoint,
  displayToNativePoint,
  nativeToDisplayRect,
  displayToNativeRect,
  clampRectToNativeBounds,
  moveRectWithClamp,
  resizeRectWithHandle,
  pixelsToCm,
  cmToPixels,
  calculatePhysicalDimensions,
  calculatePixelDimensions,
  validatePrintAreaCoordinates,
  Rect,
} from './coordinateMapping';

console.log('--- Running coordinateMapping Unit Tests ---');

// 1. Portrait Image Display Bounds (2400x3200 inside 600x600 container)
{
  const bounds = calculateDisplayBounds(600, 600, 2400, 3200);
  // Scale constrained by height: 600 / 3200 = 0.1875
  assert.equal(bounds.scale, 0.1875, 'Portrait scale should be 0.1875');
  assert.equal(bounds.displayHeight, 600, 'Display height should fill container height');
  assert.equal(bounds.displayWidth, 450, 'Display width should be 2400 * 0.1875 = 450');
  assert.equal(bounds.offsetX, 75, 'Horizontal letterbox offset should be (600 - 450) / 2 = 75');
  assert.equal(bounds.offsetY, 0, 'Vertical offset should be 0');
  console.log('✓ Test 1 Passed: Portrait Image Display Bounds');
}

// 2. Landscape Image Display Bounds (3200x1600 inside 800x600 container)
{
  const bounds = calculateDisplayBounds(800, 600, 3200, 1600);
  // Scale constrained by width: 800 / 3200 = 0.25
  assert.equal(bounds.scale, 0.25, 'Landscape scale should be 0.25');
  assert.equal(bounds.displayWidth, 800, 'Display width should fill container width');
  assert.equal(bounds.displayHeight, 400, 'Display height should be 1600 * 0.25 = 400');
  assert.equal(bounds.offsetX, 0, 'Horizontal offset should be 0');
  assert.equal(bounds.offsetY, 100, 'Vertical letterbox offset should be (600 - 400) / 2 = 100');
  console.log('✓ Test 2 Passed: Landscape Image Display Bounds');
}

// 3. Square Image Display Bounds (2000x2000 inside 800x600 container)
{
  const bounds = calculateDisplayBounds(800, 600, 2000, 2000);
  // Scale constrained by height: 600 / 2000 = 0.3
  assert.equal(bounds.scale, 0.3, 'Square scale should be 0.3');
  assert.equal(bounds.displayWidth, 600, 'Display width should be 600');
  assert.equal(bounds.displayHeight, 600, 'Display height should be 600');
  assert.equal(bounds.offsetX, 100, 'Horizontal offset should be (800 - 600) / 2 = 100');
  assert.equal(bounds.offsetY, 0, 'Vertical offset should be 0');
  console.log('✓ Test 3 Passed: Square Image Display Bounds');
}

// 4. Native <-> Display Point Conversion Roundtrip
{
  const bounds = calculateDisplayBounds(600, 600, 2400, 3200);
  const nativePt = { x: 1200, y: 1600 };
  const dispPt = nativeToDisplayPoint(nativePt, bounds);
  assert.equal(dispPt.x, 75 + 1200 * 0.1875, 'Display X should account for offset and scale');
  assert.equal(dispPt.y, 0 + 1600 * 0.1875, 'Display Y should account for offset and scale');

  const roundtripPt = displayToNativePoint(dispPt, bounds);
  assert.equal(Math.round(roundtripPt.x), nativePt.x, 'Roundtrip X should match original');
  assert.equal(Math.round(roundtripPt.y), nativePt.y, 'Roundtrip Y should match original');
  console.log('✓ Test 4 Passed: Point Conversion Roundtrip');
}

// 5. Native <-> Display Rect Conversion Roundtrip
{
  const bounds = calculateDisplayBounds(800, 600, 3200, 1600);
  const nativeRect: Rect = { x: 800, y: 400, width: 1600, height: 800 };
  const dispRect = nativeToDisplayRect(nativeRect, bounds);
  
  assert.equal(dispRect.x, 800 * 0.25, 'Display rect X');
  assert.equal(dispRect.y, 100 + 400 * 0.25, 'Display rect Y with offset');
  assert.equal(dispRect.width, 1600 * 0.25, 'Display rect width');
  assert.equal(dispRect.height, 800 * 0.25, 'Display rect height');

  const roundtripRect = displayToNativeRect(dispRect, bounds);
  assert.equal(Math.round(roundtripRect.x), nativeRect.x, 'Roundtrip Rect X');
  assert.equal(Math.round(roundtripRect.y), nativeRect.y, 'Roundtrip Rect Y');
  assert.equal(Math.round(roundtripRect.width), nativeRect.width, 'Roundtrip Rect Width');
  assert.equal(Math.round(roundtripRect.height), nativeRect.height, 'Roundtrip Rect Height');
  console.log('✓ Test 5 Passed: Rect Conversion Roundtrip');
}

// 6. Boundary Clamping (Left, Top, Right, Bottom overflow)
{
  const nativeW = 2000;
  const nativeH = 2000;

  // Negative coordinates
  const clampedNeg = clampRectToNativeBounds({ x: -100, y: -50, width: 400, height: 500 }, nativeW, nativeH);
  assert.equal(clampedNeg.x, 0, 'Negative X must clamp to 0');
  assert.equal(clampedNeg.y, 0, 'Negative Y must clamp to 0');

  // Bottom-right overflow
  const clampedOverflow = clampRectToNativeBounds({ x: 1800, y: 1700, width: 500, height: 600 }, nativeW, nativeH);
  assert.equal(clampedOverflow.x, 1500, 'Overflow X must clamp so x + width <= nativeW');
  assert.equal(clampedOverflow.y, 1400, 'Overflow Y must clamp so y + height <= nativeH');
  assert.equal(clampedOverflow.width, 500, 'Width preserved when within nativeW');
  assert.equal(clampedOverflow.height, 600, 'Height preserved when within nativeH');

  // Rect bigger than image
  const clampedHuge = clampRectToNativeBounds({ x: 0, y: 0, width: 3000, height: 4000 }, nativeW, nativeH);
  assert.equal(clampedHuge.width, nativeW, 'Width capped at nativeW');
  assert.equal(clampedHuge.height, nativeH, 'Height capped at nativeH');
  assert.equal(clampedHuge.x, 0);
  assert.equal(clampedHuge.y, 0);
  console.log('✓ Test 6 Passed: Boundary Clamping');
}

// 7. Drag Translation with Clamping
{
  const initialRect: Rect = { x: 500, y: 500, width: 600, height: 800 };
  const nativeW = 2000;
  const nativeH = 2000;

  // Move inside bounds
  const moved = moveRectWithClamp(initialRect, 100, 200, nativeW, nativeH);
  assert.equal(moved.x, 600);
  assert.equal(moved.y, 700);

  // Move too far right
  const movedTooFarRight = moveRectWithClamp(initialRect, 1500, 0, nativeW, nativeH);
  assert.equal(movedTooFarRight.x, 1400, 'x clamped to nativeW - width = 2000 - 600 = 1400');

  // Move too far left
  const movedTooFarLeft = moveRectWithClamp(initialRect, -1000, 0, nativeW, nativeH);
  assert.equal(movedTooFarLeft.x, 0, 'x clamped to 0');
  console.log('✓ Test 7 Passed: Drag Translation Clamping');
}

// 8. Resize Handles (All 8 Handles)
{
  const initialRect: Rect = { x: 500, y: 500, width: 600, height: 800 };
  const nativeW = 2000;
  const nativeH = 2000;

  // 'se' handle (expand bottom-right)
  const se = resizeRectWithHandle(initialRect, 'se', 200, 100, nativeW, nativeH);
  assert.equal(se.x, 500);
  assert.equal(se.y, 500);
  assert.equal(se.width, 800);
  assert.equal(se.height, 900);

  // 'nw' handle (move top-left)
  const nw = resizeRectWithHandle(initialRect, 'nw', -100, -200, nativeW, nativeH);
  assert.equal(nw.x, 400);
  assert.equal(nw.y, 300);
  assert.equal(nw.width, 700);
  assert.equal(nw.height, 1000);

  // 'e' handle (east only)
  const e = resizeRectWithHandle(initialRect, 'e', 100, 0, nativeW, nativeH);
  assert.equal(e.width, 700);
  assert.equal(e.height, 800);

  // 's' handle (south only)
  const s = resizeRectWithHandle(initialRect, 's', 0, 150, nativeW, nativeH);
  assert.equal(s.width, 600);
  assert.equal(s.height, 950);

  // Minimum dimension constraint check
  const shrinkMin = resizeRectWithHandle(initialRect, 'se', -1000, -1000, nativeW, nativeH, 50, 50);
  assert.equal(shrinkMin.width, 50, 'Width clamped to minWidth = 50');
  assert.equal(shrinkMin.height, 50, 'Height clamped to minHeight = 50');
  console.log('✓ Test 8 Passed: Resize Handles & Minimum Dimensions');
}

// 9. Physical Dimension Conversions (cm <-> pixels @ 300 DPI)
{
  // 300 DPI: 1 inch = 2.54 cm = 300 px -> 1 cm = 300 / 2.54 = ~118.11 px
  // 25.4 cm = 10 inches = 3000 px
  const px = cmToPixels(25.4, 300);
  assert.equal(px, 3000, '25.4 cm at 300 DPI should be exactly 3000 px');

  const cm = pixelsToCm(3000, 300);
  assert.equal(cm, 25.4, '3000 px at 300 DPI should be 25.4 cm');

  // Combined physical dimensions
  const dims = calculatePhysicalDimensions(1200, 1600, 300);
  // 1200 * 2.54 / 300 = 10.16 cm
  // 1600 * 2.54 / 300 = 13.55 cm
  assert.equal(dims.physicalWidthCm, 10.16);
  assert.equal(dims.physicalHeightCm, 13.55);

  const pxDims = calculatePixelDimensions(10.16, 13.55, 300);
  assert.equal(pxDims.width, 1200);
  assert.equal(pxDims.height, 1600);
  console.log('✓ Test 9 Passed: Physical Dimensions & DPI Calculation');
}

// 10. Invariant Validation (validatePrintAreaCoordinates)
{
  const valid = validatePrintAreaCoordinates({ x: 100, y: 100, width: 800, height: 1000 }, 2000, 2000);
  assert.equal(valid.isValid, true, 'Valid rect should pass validation');
  assert.equal(valid.errors.length, 0);

  const invalid = validatePrintAreaCoordinates({ x: -10, y: 50, width: 0, height: 2500 }, 2000, 2000);
  assert.equal(invalid.isValid, false, 'Invalid rect should fail validation');
  assert.equal(invalid.errors.length, 3, 'Should catch negative X, 0 width, and height overflow');
  console.log('✓ Test 10 Passed: Invariant Validation');
}

console.log('\n========================================');
console.log('ALL 10 COORDINATE MAPPING TESTS PASSED!');
console.log('========================================\n');
