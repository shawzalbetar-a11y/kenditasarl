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
  nativeToReferencePrintArea,
  referenceToNativePrintArea,
  resolveImagePrintAreaGeometry,
  validatePrintAreaCoordinates,
  ResizeHandle,
  Rect,
} from './coordinateMapping';
import {
  getCustomizationConfig,
  CustomizationConfig,
  PrintArea,
} from './customizationConfig';

console.log('================================================================');
console.log('--- RUNNING PHASE 2 COMPREHENSIVE IMAGE-DRIVEN TEST SUITE ---');
console.log('================================================================\n');

const EPSILON = 0.1;

function assertApprox(actual: number, expected: number, msg?: string) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${msg || 'Value mismatch'}: expected ${expected} ± ${EPSILON}, got ${actual}`
  );
}

let totalPassed = 0;

function logPass(group: string, testName: string) {
  totalPassed++;
  console.log(`[PASS] [${group}] ${testName}`);
}

// ============================================================================
// A. IMAGE DIMENSIONS (Portrait, Landscape, Square)
// ============================================================================
{
  // 1. Portrait: 2400 x 3200
  const portrait = nativeToReferencePrintArea({
    nativeWidth: 2400,
    nativeHeight: 3200,
    left: 600,
    top: 800,
    width: 1200,
    height: 1600,
    targetWidth: 600,
    targetHeight: 800,
  });
  assertApprox(portrait.x, 150);
  assertApprox(portrait.y, 200);
  assertApprox(portrait.width, 300);
  assertApprox(portrait.height, 400);
  logPass('IMAGE_DIMENSIONS', 'Portrait image (2400x3200) conversion');

  // 2. Landscape: 3200 x 1800
  const landscape = nativeToReferencePrintArea({
    nativeWidth: 3200,
    nativeHeight: 1800,
    left: 800,
    top: 450,
    width: 1600,
    height: 900,
    targetWidth: 800,
    targetHeight: 450,
  });
  assertApprox(landscape.x, 200);
  assertApprox(landscape.y, 112.5);
  assertApprox(landscape.width, 400);
  assertApprox(landscape.height, 225);
  logPass('IMAGE_DIMENSIONS', 'Landscape image (3200x1800) conversion');

  // 3. Square: 2000 x 2000
  const square = nativeToReferencePrintArea({
    nativeWidth: 2000,
    nativeHeight: 2000,
    left: 500,
    top: 500,
    width: 1000,
    height: 1000,
    targetWidth: 500,
    targetHeight: 500,
  });
  assertApprox(square.x, 125);
  assertApprox(square.y, 125);
  assertApprox(square.width, 250);
  assertApprox(square.height, 250);
  logPass('IMAGE_DIMENSIONS', 'Square image (2000x2000) conversion');
}

// ============================================================================
// B. IMAGE ANGLES & ANGLE INVARIANCE
// ============================================================================
{
  const testAngles = ['straight', '3/4', 'perspective', 'angled', 'close-up'];
  const baseNativeRect = { left: 500, top: 600, width: 1000, height: 1200 };

  for (const angle of testAngles) {
    const config: CustomizationConfig = {
      version: 1,
      enabled: true,
      productType: 't-shirt',
      faces: {},
      image_geometries: {
        'angle-test': {
          imageId: `img-${angle}`,
          imageUrl: `https://example.com/mockups/${angle}.png`,
          angle,
          nativeWidth: 2400,
          nativeHeight: 3000,
          printArea: {
            id: 'front',
            name: `${angle.toUpperCase()} Print Area`,
            ...baseNativeRect,
          },
        },
      },
    };

    const resolved = resolveImagePrintAreaGeometry({
      config,
      faceId: 'front',
      currentImage: { imageId: `img-${angle}` },
      targetWidth: 480,
      targetHeight: 600,
    });

    // Verify coordinates are strictly mathematically converted and unaffected by angle label
    assertApprox(resolved.left, 100); // 500 * (480 / 2400) = 100
    assertApprox(resolved.top, 120);  // 600 * (600 / 3000) = 120
    assertApprox(resolved.width, 200); // 1000 * (480 / 2400) = 200
    assertApprox(resolved.height, 240); // 1200 * (600 / 3000) = 240
    logPass('IMAGE_ANGLES', `Angle invariant: "${angle}" does not alter geometry`);
  }
}

// ============================================================================
// C. EDGE PLACEMENT & BOUNDARY CONDITIONS
// ============================================================================
{
  const nativeW = 3000;
  const nativeH = 4000;

  // 9. Top Edge (top = 0)
  const topEdge = clampRectToNativeBounds({ x: 500, y: 0, width: 1000, height: 1000 }, nativeW, nativeH);
  assert.equal(topEdge.y, 0);
  assert.equal(topEdge.height, 1000);
  logPass('EDGE_PLACEMENT', 'Print area flush with top edge (y = 0)');

  // 10. Bottom Edge (y + height = nativeH)
  const bottomEdge = clampRectToNativeBounds({ x: 500, y: 3000, width: 1000, height: 1000 }, nativeW, nativeH);
  assert.equal(bottomEdge.y, 3000);
  assert.equal(bottomEdge.y + bottomEdge.height, nativeH);
  logPass('EDGE_PLACEMENT', 'Print area flush with bottom edge');

  // 11. Left Edge (x = 0)
  const leftEdge = clampRectToNativeBounds({ x: 0, y: 500, width: 1000, height: 1000 }, nativeW, nativeH);
  assert.equal(leftEdge.x, 0);
  assert.equal(leftEdge.width, 1000);
  logPass('EDGE_PLACEMENT', 'Print area flush with left edge (x = 0)');

  // 12. Right Edge (x + width = nativeW)
  const rightEdge = clampRectToNativeBounds({ x: 2000, y: 500, width: 1000, height: 1000 }, nativeW, nativeH);
  assert.equal(rightEdge.x, 2000);
  assert.equal(rightEdge.x + rightEdge.width, nativeW);
  logPass('EDGE_PLACEMENT', 'Print area flush with right edge');

  // 13. Full Image Coverage (x=0, y=0, w=nativeW, h=nativeH)
  const fullCover = clampRectToNativeBounds({ x: 0, y: 0, width: nativeW, height: nativeH }, nativeW, nativeH);
  assert.equal(fullCover.x, 0);
  assert.equal(fullCover.y, 0);
  assert.equal(fullCover.width, nativeW);
  assert.equal(fullCover.height, nativeH);
  logPass('EDGE_PLACEMENT', 'Full image coverage print area');

  // 14. Tiny Minimal Dimensions (within min bounds)
  const tiny = clampRectToNativeBounds({ x: 100, y: 100, width: 25, height: 25 }, nativeW, nativeH, 20, 20);
  assert.equal(tiny.width, 25);
  assert.equal(tiny.height, 25);
  logPass('EDGE_PLACEMENT', 'Smallest valid print area');
}

// ============================================================================
// D. INVALID GEOMETRY & VALIDATION REJECTION
// ============================================================================
{
  const nativeW = 2000;
  const nativeH = 3000;

  // 15. left < 0
  const val1 = validatePrintAreaCoordinates({ x: -10, y: 50, width: 500, height: 500 }, nativeW, nativeH);
  assert.equal(val1.isValid, false);
  assert.ok(val1.errors.some(e => e.includes('negative')));
  logPass('INVALID_GEOMETRY', 'left < 0 rejected');

  // 16. top < 0
  const val2 = validatePrintAreaCoordinates({ x: 50, y: -20, width: 500, height: 500 }, nativeW, nativeH);
  assert.equal(val2.isValid, false);
  assert.ok(val2.errors.some(e => e.includes('negative')));
  logPass('INVALID_GEOMETRY', 'top < 0 rejected');

  // 17. width <= 0
  const val3 = validatePrintAreaCoordinates({ x: 50, y: 50, width: 0, height: 500 }, nativeW, nativeH);
  assert.equal(val3.isValid, false);
  assert.ok(val3.errors.some(e => e.includes('Width must be greater than 0')));
  logPass('INVALID_GEOMETRY', 'width <= 0 rejected');

  // 18. height <= 0
  const val4 = validatePrintAreaCoordinates({ x: 50, y: 50, width: 500, height: -5 }, nativeW, nativeH);
  assert.equal(val4.isValid, false);
  assert.ok(val4.errors.some(e => e.includes('Height must be greater than 0')));
  logPass('INVALID_GEOMETRY', 'height <= 0 rejected');

  // 19. Right overflow (x + width > nativeW)
  const val5 = validatePrintAreaCoordinates({ x: 1800, y: 50, width: 500, height: 500 }, nativeW, nativeH);
  assert.equal(val5.isValid, false);
  assert.ok(val5.errors.some(e => e.includes('overflows image width')));
  logPass('INVALID_GEOMETRY', 'Right overflow rejected');

  // 20. Bottom overflow (y + height > nativeH)
  const val6 = validatePrintAreaCoordinates({ x: 50, y: 2800, width: 500, height: 500 }, nativeW, nativeH);
  assert.equal(val6.isValid, false);
  assert.ok(val6.errors.some(e => e.includes('overflows image height')));
  logPass('INVALID_GEOMETRY', 'Bottom overflow rejected');

  // 21. nativeWidth <= 0 / 22. nativeHeight <= 0 in Resolver
  const badConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'Fallback Front',
        printArea: { id: 'front', name: 'Fallback Front', left: 100, top: 120, width: 200, height: 280 },
      },
    },
    image_geometries: {
      'bad-dims': {
        imageId: 'img-bad-dims',
        nativeWidth: 0,
        nativeHeight: -500,
        printArea: { id: 'front', name: 'Bad Dims Area', left: 100, top: 100, width: 200, height: 200 },
      },
    },
  };
  const resolvedBadDims = resolveImagePrintAreaGeometry({
    config: badConfig,
    faceId: 'front',
    currentImage: { imageId: 'img-bad-dims' },
  });
  assert.equal(resolvedBadDims.name, 'Fallback Front', 'Invalid native dimensions must trigger safe fallback');
  logPass('INVALID_GEOMETRY', 'Invalid native dimensions rejected with safe fallback');
}

// ============================================================================
// E. DRAG & RESIZE MATH (8 Handles & Boundary Clamping)
// ============================================================================
{
  const nativeW = 2000;
  const nativeH = 3000;
  const initialRect: Rect = { x: 500, y: 500, width: 600, height: 800 };

  // 23. Drag inside bounds
  const movedInside = moveRectWithClamp(initialRect, 100, 200, nativeW, nativeH);
  assert.equal(movedInside.x, 600);
  assert.equal(movedInside.y, 700);
  logPass('DRAG_RESIZE', 'Drag inside native bounds');

  // 24. Drag outside bounds -> clamp
  const movedOutside = moveRectWithClamp(initialRect, 2000, 3000, nativeW, nativeH);
  assert.equal(movedOutside.x, 1400); // 2000 - 600 = 1400
  assert.equal(movedOutside.y, 2200); // 3000 - 800 = 2200
  logPass('DRAG_RESIZE', 'Drag outside bounds strictly clamped');

  // 25. Resize inside bounds (SE handle)
  const resizedInside = resizeRectWithHandle(initialRect, 'se', 100, 100, nativeW, nativeH, 30, 30);
  assert.equal(resizedInside.width, 700);
  assert.equal(resizedInside.height, 900);
  logPass('DRAG_RESIZE', 'Resize inside bounds');

  // 26. Resize outside bounds -> clamp (SE handle)
  const resizedOutside = resizeRectWithHandle(initialRect, 'se', 5000, 5000, nativeW, nativeH, 30, 30);
  assert.equal(resizedOutside.width, 1500); // 2000 - 500 = 1500
  assert.equal(resizedOutside.height, 2500); // 3000 - 500 = 2500
  logPass('DRAG_RESIZE', 'Resize outside bounds strictly clamped');

  // 27. All 8 Directions Tested
  const handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  for (const handle of handles) {
    const res = resizeRectWithHandle(initialRect, handle, 50, 50, nativeW, nativeH, 30, 30);
    assert.ok(res.width >= 30, `Handle ${handle} width must be >= 30`);
    assert.ok(res.height >= 30, `Handle ${handle} height must be >= 30`);
    assert.ok(res.x >= 0 && res.x + res.width <= nativeW, `Handle ${handle} X in bounds`);
    assert.ok(res.y >= 0 && res.y + res.height <= nativeH, `Handle ${handle} Y in bounds`);
  }
  logPass('DRAG_RESIZE', 'All 8 resize handles (NW, N, NE, E, SE, S, SW, W) verified');
}

// ============================================================================
// F. ROUNDTRIP ACROSS DYNAMIC TARGET DIMENSIONS
// ============================================================================
{
  const targetSizes = [
    { w: 300, h: 600, label: '300x600' },
    { w: 600, h: 300, label: '600x300' },
    { w: 800, h: 800, label: '800x800' },
    { w: 1024, h: 768, label: '1024x768' },
  ];

  const mockups = [
    { nw: 2400, nh: 3200, label: 'Portrait' },
    { nw: 3200, nh: 1800, label: 'Landscape' },
    { nw: 2000, nh: 2000, label: 'Square' },
  ];

  for (const m of mockups) {
    for (const t of targetSizes) {
      const origRect: Rect = { x: m.nw * 0.2, y: m.nh * 0.25, width: m.nw * 0.5, height: m.nh * 0.4 };

      // Native -> Reference
      const ref = nativeToReferencePrintArea({
        nativeWidth: m.nw,
        nativeHeight: m.nh,
        left: origRect.x,
        top: origRect.y,
        width: origRect.width,
        height: origRect.height,
        targetWidth: t.w,
        targetHeight: t.h,
      });

      // Reference -> Native
      const roundtrip = referenceToNativePrintArea({
        left: ref.x,
        top: ref.y,
        width: ref.width,
        height: ref.height,
        targetWidth: t.w,
        targetHeight: t.h,
        nativeWidth: m.nw,
        nativeHeight: m.nh,
      });

      assertApprox(roundtrip.x, origRect.x, `Roundtrip X on ${m.label} -> ${t.label}`);
      assertApprox(roundtrip.y, origRect.y, `Roundtrip Y on ${m.label} -> ${t.label}`);
      assertApprox(roundtrip.width, origRect.width, `Roundtrip W on ${m.label} -> ${t.label}`);
      assertApprox(roundtrip.height, origRect.height, `Roundtrip H on ${m.label} -> ${t.label}`);
    }
  }
  logPass('ROUNDTRIP', 'Native ↔ Reference roundtrip on Portrait, Landscape, Square across 4 dynamic target sizes');
}

// ============================================================================
// G. ZOOM INVARIANCE (50%, 100%, 200%)
// ============================================================================
{
  const nativeWidth = 2400;
  const nativeHeight = 3000;
  const nativePrintArea: Rect = { x: 600, y: 750, width: 1200, height: 1500 };

  const zoomLevels = [0.5, 1.0, 2.0];
  const baseViewport = { width: 600, height: 600 };

  for (const zoom of zoomLevels) {
    const containerW = baseViewport.width * zoom;
    const containerH = baseViewport.height * zoom;

    const bounds = calculateDisplayBounds(containerW, containerH, nativeWidth, nativeHeight);
    const displayRect = nativeToDisplayRect(nativePrintArea, bounds);
    const convertedNative = displayToNativeRect(displayRect, bounds);

    assertApprox(convertedNative.x, nativePrintArea.x, `Zoom ${zoom * 100}% X invariant`);
    assertApprox(convertedNative.y, nativePrintArea.y, `Zoom ${zoom * 100}% Y invariant`);
    assertApprox(convertedNative.width, nativePrintArea.width, `Zoom ${zoom * 100}% Width invariant`);
    assertApprox(convertedNative.height, nativePrintArea.height, `Zoom ${zoom * 100}% Height invariant`);
    logPass('ZOOM_INVARIANCE', `Zoom ${zoom * 100}% preserves exact native coordinates`);
  }
}

// ============================================================================
// H. RESOLVER PRIORITY & MULTI-IMAGE ISOLATION
// ============================================================================
{
  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'Face Level Front',
        printArea: { id: 'front', name: 'Face Level Front', left: 150, top: 150, width: 300, height: 300 },
      },
    },
    image_geometries: {
      'front-straight': {
        imageId: 'img-front-straight',
        imageUrl: 'https://example.com/front-straight.jpg',
        angle: 'straight',
        nativeWidth: 3000,
        nativeHeight: 4000,
        printArea: { id: 'front', name: 'Straight Chest', left: 750, top: 1000, width: 1500, height: 2000 },
      },
      'front-perspective': {
        imageId: 'img-front-perspective',
        imageUrl: 'https://example.com/front-perspective.jpg',
        angle: '3/4',
        nativeWidth: 3000,
        nativeHeight: 4000,
        printArea: { id: 'front', name: '3/4 Perspective Chest', left: 500, top: 1100, width: 1100, height: 1600 },
      },
    },
  };

  // 32. Image-Specific Priority (Straight)
  const resStraight = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: { imageId: 'img-front-straight' },
  });
  assert.equal(resStraight.name, 'Straight Chest');
  assert.equal(resStraight.left, 750);
  assert.equal(resStraight.width, 1500);
  logPass('RESOLVER_PRIORITY', 'Priority 1: Image-Specific Geometry selected');

  // Multi-image on same face isolation (3/4 Perspective)
  const resPerspective = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: { imageId: 'img-front-perspective' },
  });
  assert.equal(resPerspective.name, '3/4 Perspective Chest');
  assert.equal(resPerspective.left, 500);
  assert.equal(resPerspective.width, 1100);
  logPass('RESOLVER_PRIORITY', 'Multi-image on same face maintains strictly isolated geometry');

  // ImageUrl fallback matching
  const resUrlMatch = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: 'https://example.com/front-straight.jpg',
  });
  assert.equal(resUrlMatch.name, 'Straight Chest');
  logPass('RESOLVER_PRIORITY', 'ImageUrl fallback matching works seamlessly');

  // 33. Face-Specific Fallback (Unregistered image on configured face)
  const resFaceFallback = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: 'https://example.com/unregistered-photo.jpg',
  });
  assert.equal(resFaceFallback.name, 'Face Level Front');
  assert.equal(resFaceFallback.left, 150);
  assert.equal(resFaceFallback.width, 300);
  logPass('RESOLVER_PRIORITY', 'Priority 2: Face-specific geometry fallback');

  // 34. Category Default Fallback (Unconfigured face)
  const resCategoryFallback = resolveImagePrintAreaGeometry({
    config,
    faceId: 'back', // Not in config.faces or image_geometries
  });
  assert.equal(resCategoryFallback.id, 'back');
  assert.equal(resCategoryFallback.width, 200); // From t-shirt category defaults
  assert.equal(resCategoryFallback.height, 250);
  logPass('RESOLVER_PRIORITY', 'Priority 3: Category default fallback');
}

// ============================================================================
// I. IMMUTABILITY GUARANTEE
// ============================================================================
{
  const originalConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'Front',
        printArea: { id: 'front', name: 'Face Front', left: 100, top: 100, width: 200, height: 200 },
      },
    },
    image_geometries: {
      'test-immut': {
        imageId: 'img-immut',
        nativeWidth: 2000,
        nativeHeight: 2000,
        printArea: { id: 'front', name: 'Native Immut', left: 400, top: 400, width: 800, height: 800 },
      },
    },
  };

  const snapshotBefore = JSON.stringify(originalConfig);

  const resolved = resolveImagePrintAreaGeometry({
    config: originalConfig,
    faceId: 'front',
    currentImage: { imageId: 'img-immut' },
    targetWidth: 400,
    targetHeight: 400,
  });

  const snapshotAfter = JSON.stringify(originalConfig);

  assert.equal(snapshotBefore, snapshotAfter, 'Config object must not be mutated during resolution');
  assert.equal(resolved.left, 80); // 400 * (400 / 2000) = 80
  assert.equal(originalConfig.image_geometries!['test-immut'].printArea.left, 400, 'Original printArea.left remains native 400');
  logPass('IMMUTABILITY', 'Resolver is 100% side-effect free and preserves input immutability');
}

// ============================================================================
// J. LEGACY COMPATIBILITY
// ============================================================================
{
  const legacyConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 'hoodie',
    faces: {
      front: {
        name: 'Front',
        printArea: { id: 'front', name: 'Legacy Hoodie Front', left: 90, top: 110, width: 220, height: 260 },
      },
    },
    // image_geometries is completely undefined in legacy documents
  };

  const resolvedLegacy = resolveImagePrintAreaGeometry({
    config: legacyConfig,
    faceId: 'front',
    currentImage: 'https://example.com/legacy-hoodie.jpg',
  });

  assert.equal(resolvedLegacy.name, 'Legacy Hoodie Front');
  assert.equal(resolvedLegacy.left, 90);
  assert.equal(resolvedLegacy.width, 220);
  logPass('LEGACY_COMPATIBILITY', 'Legacy config without image_geometries functions flawlessly');
}

console.log('\n================================================================');
console.log(`ALL ${totalPassed} PHASE 2 IMAGE-DRIVEN TESTS PASSED SUCCESSFULLY!`);
console.log('================================================================\n');
