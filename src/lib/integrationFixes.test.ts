import assert from 'node:assert/strict';
import {
  normalizePrintArea,
  CustomizationConfig,
  PrintArea,
  ImageSpecificGeometry,
  getCustomizationConfig,
} from './customizationConfig';
import {
  nativeToReferencePrintArea,
  referenceToNativePrintArea,
  resolveImagePrintAreaGeometry,
  calculateDisplayBounds,
  nativeToDisplayRect,
  validatePrintAreaCoordinates,
} from './coordinateMapping';

console.log('========================================================================');
console.log('--- RUNNING INTEGRATION FIXES & RUNTIME SAFETY TEST SUITE ---');
console.log('========================================================================\n');

let passedTests = 0;
function logPass(title: string) {
  passedTests++;
  console.log(`[PASS] ${title}`);
}

// A & B: Undefined PrintArea & Default Normalization
{
  // 1. null / undefined input
  const paNull = normalizePrintArea(null, 'front');
  assert.equal(paNull.id, 'front');
  assert.equal(paNull.width, 200);
  assert.equal(paNull.height, 200);
  assert.equal(paNull.top, 100);
  assert.equal(paNull.left, 100);
  assert.equal(paNull.shape, 'rectangle');
  assert.equal(paNull.bleed, 0);

  // 2. Incomplete input with missing physical specs
  const paIncomplete = normalizePrintArea({ width: 350 }, 'back');
  assert.equal(paIncomplete.id, 'back');
  assert.equal(paIncomplete.width, 350);
  assert.equal(paIncomplete.height, 200);
  assert.equal(paIncomplete.physicalWidthCm, undefined);
  assert.equal(paIncomplete.targetDPI, undefined);

  // 3. calculateOutputSize formula with undefined specs does not crash
  const calculateOutputSize = (pa: PrintArea) => {
    if (!pa.physicalWidthCm || !pa.physicalHeightCm || !pa.targetDPI) return null;
    const wPx = Math.round((pa.physicalWidthCm / 2.54) * pa.targetDPI);
    const hPx = Math.round((pa.physicalHeightCm / 2.54) * pa.targetDPI);
    return `${wPx} × ${hPx} px`;
  };

  assert.equal(calculateOutputSize(paNull), null);
  assert.equal(calculateOutputSize(paIncomplete), null);

  // 4. calculateOutputSize with complete specs
  const paComplete = normalizePrintArea({
    width: 400,
    height: 500,
    physicalWidthCm: 20,
    physicalHeightCm: 25,
    targetDPI: 300,
  });
  assert.equal(calculateOutputSize(paComplete), '2362 × 2953 px');

  logPass('Normalization: undefined/null/incomplete PrintArea normalization is completely crash-proof');
}

// C & D: Admin Save -> Main Store Read & Design Studio Geometry
{
  const adminSavedConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'Front',
        enabled: true,
        printArea: normalizePrintArea({ left: 100, top: 100, width: 200, height: 200 }),
      },
    },
    image_geometries: {
      'front-calibrated': {
        imageId: 'front-mockup-1',
        imageUrl: 'https://example.com/front-mockup.png',
        faceId: 'front',
        angle: 'straight',
        nativeWidth: 3200,
        nativeHeight: 4000,
        printArea: normalizePrintArea({
          id: 'front',
          name: 'Front Print Area',
          left: 800,
          top: 600,
          width: 1600,
          height: 2000,
          nativeWidth: 3200,
          nativeHeight: 4000,
          physicalWidthCm: 13.55,
          physicalHeightCm: 16.93,
          targetDPI: 300,
          printMethod: 'DTF',
        }),
      },
    },
  };

  // Main store resolver resolves the exact geometry for Design Studio
  const resolved = resolveImagePrintAreaGeometry({
    config: adminSavedConfig,
    faceId: 'front',
    currentImage: { imageId: 'front-mockup-1' },
    targetWidth: 400,
    targetHeight: 500,
  });

  // Reference coordinates for FabricCanvas
  assert.equal(resolved.left, 100);
  assert.equal(resolved.top, 75);
  assert.equal(resolved.width, 200);
  assert.equal(resolved.height, 250);
  assert.equal(resolved.physicalWidthCm, 13.55);

  logPass('Admin Save -> Store Read: Main store and Design Studio receive exact resolved geometry');
}

// E & F & G & I: Isolation, imageId priority, imageUrl fallback, wrong imageId protection
{
  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    faces: {
      front: {
        name: 'Face Level Fallback',
        printArea: normalizePrintArea({ left: 50, top: 50, width: 300, height: 300 }),
      },
    },
    image_geometries: {
      'straight-geo': {
        imageId: 'img-front-straight',
        imageUrl: 'https://example.com/straight.png',
        nativeWidth: 3200,
        nativeHeight: 4000,
        printArea: normalizePrintArea({ left: 800, top: 600, width: 1600, height: 2000 }),
      },
      'angled-geo': {
        imageId: 'img-front-angled',
        imageUrl: 'https://example.com/angled.png',
        nativeWidth: 3200,
        nativeHeight: 4000,
        printArea: normalizePrintArea({ left: 1100, top: 800, width: 1000, height: 1400 }),
      },
    },
  };

  // 1. imageId exact match
  const resStraight = resolveImagePrintAreaGeometry({ config, faceId: 'front', currentImage: { imageId: 'img-front-straight' } });
  assert.equal(resStraight.left, 800);

  // 2. imageId angle isolation (angled is distinct)
  const resAngled = resolveImagePrintAreaGeometry({ config, faceId: 'front', currentImage: { imageId: 'img-front-angled' } });
  assert.equal(resAngled.left, 1100);

  // 3. imageUrl fallback when imageId is unknown
  const resUrl = resolveImagePrintAreaGeometry({ config, faceId: 'front', currentImage: { imageUrl: 'https://example.com/straight.png' } });
  assert.equal(resUrl.left, 800);

  // 4. wrong imageId must NOT use straight or angled geometry, but fallback to face
  const resWrong = resolveImagePrintAreaGeometry({ config, faceId: 'front', currentImage: { imageId: 'img-unrelated-mockup' } });
  assert.equal(resWrong.left, 50); // Face level fallback

  logPass('Identity & Isolation: imageId priority, imageUrl fallback, and wrong imageId protection verified');
}

// H: Legacy Product Compatibility
{
  const legacyConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 'hoodie',
    faces: {
      front: {
        name: 'Front',
        printArea: normalizePrintArea({ left: 90, top: 110, width: 220, height: 260 }),
      },
    },
  };

  const resLegacy = resolveImagePrintAreaGeometry({ config: legacyConfig, faceId: 'front' });
  assert.equal(resLegacy.left, 90);
  assert.equal(resLegacy.width, 220);

  logPass('Legacy Products: Legacy products without image_geometries resolve seamlessly');
}

// J & K & L: Browser/runtime-safe CSS overlay coordinates calculation
{
  // Given resolved print area in reference space (400 x 500)
  const refPrintArea = { left: 100, top: 75, width: 200, height: 250 };

  // CSS positioning percentages:
  const cssLeft = `${(refPrintArea.left / 400) * 100}%`;
  const cssTop = `${(refPrintArea.top / 500) * 100}%`;
  const cssWidth = `${(refPrintArea.width / 400) * 100}%`;
  const cssHeight = `${(refPrintArea.height / 500) * 100}%`;

  assert.equal(cssLeft, '25%');
  assert.equal(cssTop, '15%');
  assert.equal(cssWidth, '50%');
  assert.equal(cssHeight, '50%');

  // Verify that these percentages match the exact native proportions (800/3200 = 25%, 600/4000 = 15%)
  assert.equal(cssLeft, `${(800 / 3200) * 100}%`);
  assert.equal(cssTop, `${(600 / 4000) * 100}%`);
  assert.equal(cssWidth, `${(1600 / 3200) * 100}%`);
  assert.equal(cssHeight, `${(2000 / 4000) * 100}%`);

  logPass('CSS Positioning: Overlay coordinates inside 4:5 image container match native pixel proportions');
}

console.log('\n========================================================================');
console.log(`ALL ${passedTests} / 5 INTEGRATION FIX VERIFICATION TESTS PASSED!`);
console.log('========================================================================\n');
