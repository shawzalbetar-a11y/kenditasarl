import assert from 'node:assert/strict';
import {
  nativeToReferencePrintArea,
  referenceToNativePrintArea,
  resolveImagePrintAreaGeometry,
  Rect,
} from './coordinateMapping';
import { CustomizationConfig, PrintArea } from './customizationConfig';

console.log('--- Running Step 2 Pure Coordinate Conversion & Resolver Tests ---');

// 1. Native → Reference Transformation
{
  const native = {
    nativeWidth: 2400,
    nativeHeight: 3000,
    left: 600,
    top: 900,
    width: 1200,
    height: 1500,
    targetWidth: 400,
    targetHeight: 500,
  };
  const ref = nativeToReferencePrintArea(native);
  assert.equal(ref.x, 100); // 600 * (400 / 2400) = 100
  assert.equal(ref.y, 150); // 900 * (500 / 3000) = 150
  assert.equal(ref.width, 200); // 1200 * (400 / 2400) = 200
  assert.equal(ref.height, 250); // 1500 * (500 / 3000) = 250
  console.log('✓ Test 1 Passed: Native → Reference Transformation');
}

// 2. Reference → Native Transformation
{
  const ref = {
    left: 100,
    top: 150,
    width: 200,
    height: 250,
    targetWidth: 400,
    targetHeight: 500,
    nativeWidth: 2400,
    nativeHeight: 3000,
  };
  const native = referenceToNativePrintArea(ref);
  assert.equal(native.x, 600); // 100 * (2400 / 400) = 600
  assert.equal(native.y, 900); // 150 * (3000 / 500) = 900
  assert.equal(native.width, 1200); // 200 * (2400 / 400) = 1200
  assert.equal(native.height, 1500); // 250 * (3000 / 500) = 1500
  console.log('✓ Test 2 Passed: Reference → Native Transformation');
}

// 3. Roundtrip Exact / Tolerance Check
{
  const originalNative: Rect = { x: 735.42, y: 1120.15, width: 1420.8, height: 1840.6 };
  const targetW = 650;
  const targetH = 800;
  const nativeW = 3200;
  const nativeH = 4000;

  const ref = nativeToReferencePrintArea({
    nativeWidth: nativeW,
    nativeHeight: nativeH,
    left: originalNative.x,
    top: originalNative.y,
    width: originalNative.width,
    height: originalNative.height,
    targetWidth: targetW,
    targetHeight: targetH,
  });

  const roundtripNative = referenceToNativePrintArea({
    left: ref.x,
    top: ref.y,
    width: ref.width,
    height: ref.height,
    targetWidth: targetW,
    targetHeight: targetH,
    nativeWidth: nativeW,
    nativeHeight: nativeH,
  });

  assert.ok(Math.abs(roundtripNative.x - originalNative.x) <= 0.1, `Roundtrip X difference too large: ${roundtripNative.x} vs ${originalNative.x}`);
  assert.ok(Math.abs(roundtripNative.y - originalNative.y) <= 0.1, `Roundtrip Y difference too large: ${roundtripNative.y} vs ${originalNative.y}`);
  assert.ok(Math.abs(roundtripNative.width - originalNative.width) <= 0.1, `Roundtrip Width difference too large: ${roundtripNative.width} vs ${originalNative.width}`);
  assert.ok(Math.abs(roundtripNative.height - originalNative.height) <= 0.1, `Roundtrip Height difference too large: ${roundtripNative.height} vs ${originalNative.height}`);
  console.log('✓ Test 3 Passed: Roundtrip Exact / Tolerance Check');
}

// 4. Portrait, Landscape, and Square Aspect Ratios
{
  // Landscape (Mug wrap 2400x1200 to 600x300)
  const mugNative = {
    nativeWidth: 2400,
    nativeHeight: 1200,
    left: 200,
    top: 100,
    width: 2000,
    height: 1000,
    targetWidth: 600,
    targetHeight: 300,
  };
  const mugRef = nativeToReferencePrintArea(mugNative);
  assert.equal(mugRef.x, 50);
  assert.equal(mugRef.y, 25);
  assert.equal(mugRef.width, 500);
  assert.equal(mugRef.height, 250);

  // Square (Hat 2000x2000 to 500x500)
  const hatNative = {
    nativeWidth: 2000,
    nativeHeight: 2000,
    left: 500,
    top: 500,
    width: 1000,
    height: 1000,
    targetWidth: 500,
    targetHeight: 500,
  };
  const hatRef = nativeToReferencePrintArea(hatNative);
  assert.equal(hatRef.x, 125);
  assert.equal(hatRef.y, 125);
  assert.equal(hatRef.width, 250);
  assert.equal(hatRef.height, 250);

  console.log('✓ Test 4 Passed: Portrait, Landscape, and Square Aspect Ratios');
}

// 5. Arbitrary Dynamic Target Dimensions (No hardcoded 400x500 assumption)
{
  const arbitrary = nativeToReferencePrintArea({
    nativeWidth: 1000,
    nativeHeight: 1000,
    left: 100,
    top: 200,
    width: 300,
    height: 400,
    targetWidth: 777,
    targetHeight: 999,
  });
  assert.equal(arbitrary.x, 77.7);
  assert.equal(arbitrary.y, 199.8);
  assert.equal(arbitrary.width, 233.1);
  assert.equal(arbitrary.height, 399.6);
  console.log('✓ Test 5 Passed: Arbitrary Dynamic Target Dimensions (No hardcoded constants)');
}

// 6. Priority 1: Image-Specific Geometry Resolution
{
  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'Front Face',
        enabled: true,
        printArea: {
          id: 'front',
          name: 'Default Face Front',
          left: 100,
          top: 100,
          width: 200,
          height: 200,
        },
      },
    },
    image_geometries: {
      'img-123': {
        imageId: 'img-123',
        imageUrl: 'https://example.com/mockup-front.png',
        nativeWidth: 2400,
        nativeHeight: 3000,
        printArea: {
          id: 'front',
          name: 'Custom Image Front',
          left: 600,
          top: 750,
          width: 1200,
          height: 1500,
          physicalWidthCm: 10.16,
          physicalHeightCm: 12.7,
          targetDPI: 300,
          printMethod: 'DTF',
        },
      },
    },
  };

  // Resolve by imageId without target reference (native space)
  const resolvedNative = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: { imageId: 'img-123' },
  });
  assert.equal(resolvedNative.name, 'Custom Image Front');
  assert.equal(resolvedNative.left, 600);
  assert.equal(resolvedNative.width, 1200);
  assert.equal(resolvedNative.physicalWidthCm, 10.16);

  // Resolve by imageUrl with reference target dimensions (400x500)
  const resolvedRef = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: 'https://example.com/mockup-front.png',
    targetWidth: 400,
    targetHeight: 500,
  });
  assert.equal(resolvedRef.name, 'Custom Image Front');
  assert.equal(resolvedRef.left, 100); // 600 * (400 / 2400) = 100
  assert.equal(resolvedRef.top, 125); // 750 * (500 / 3000) = 125
  assert.equal(resolvedRef.width, 200); // 1200 * (400 / 2400) = 200
  assert.equal(resolvedRef.height, 250); // 1500 * (500 / 3000) = 250
  assert.equal(resolvedRef.physicalWidthCm, 10.16); // Preserved physical specification

  console.log('✓ Test 6 Passed: Priority 1 Image-Specific Geometry Resolution');
}

// 7. Priority 2: Fallback to Face-Specific Geometry
{
  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'Face Specific Front',
        enabled: true,
        printArea: {
          id: 'front',
          name: 'Face Specific Front',
          left: 111,
          top: 222,
          width: 333,
          height: 444,
          physicalWidthCm: 15,
          physicalHeightCm: 20,
        },
      },
    },
    image_geometries: {}, // No matching image geometry
  };

  const resolved = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: 'https://example.com/unregistered-image.png',
  });
  assert.equal(resolved.name, 'Face Specific Front');
  assert.equal(resolved.left, 111);
  assert.equal(resolved.top, 222);
  assert.equal(resolved.width, 333);
  assert.equal(resolved.height, 444);
  console.log('✓ Test 7 Passed: Priority 2 Fallback to Face-Specific Geometry');
}

// 8. Priority 3: Fallback to Category Defaults
{
  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {}, // Empty faces
  };

  const resolved = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
  });
  assert.equal(resolved.id, 'front');
  assert.equal(resolved.width, 200); // From t-shirt default
  assert.equal(resolved.height, 280);
  assert.equal(resolved.top, 120);
  assert.equal(resolved.left, 100);
  console.log('✓ Test 8 Passed: Priority 3 Fallback to Category Defaults');
}

// 9. Two Images on the Same Face Have Independent Geometry
{
  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'Front',
        printArea: { id: 'front', name: 'Default', left: 0, top: 0, width: 100, height: 100 },
      },
    },
    image_geometries: {
      'front-straight': {
        imageId: 'img-front-straight',
        imageUrl: 'https://example.com/front-straight.jpg',
        angle: 'straight',
        nativeWidth: 2400,
        nativeHeight: 3000,
        printArea: { id: 'front', name: 'Straight Chest', left: 600, top: 800, width: 1200, height: 1600 },
      },
      'front-3-4': {
        imageId: 'img-front-3-4',
        imageUrl: 'https://example.com/front-3-4.jpg',
        angle: '3/4',
        nativeWidth: 2400,
        nativeHeight: 3000,
        printArea: { id: 'front', name: '3/4 Perspective Chest', left: 400, top: 900, width: 900, height: 1400 },
      },
    },
  };

  const straightResolved = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: { imageId: 'img-front-straight' },
  });
  const perspectiveResolved = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: { imageId: 'img-front-3-4' },
  });

  assert.equal(straightResolved.name, 'Straight Chest');
  assert.equal(straightResolved.left, 600);
  assert.equal(straightResolved.width, 1200);

  assert.equal(perspectiveResolved.name, '3/4 Perspective Chest');
  assert.equal(perspectiveResolved.left, 400);
  assert.equal(perspectiveResolved.width, 900);

  console.log('✓ Test 9 Passed: Two Images on the Same Face Have Independent Geometry');
}

// 10. Angle Metadata Does Not Affect Geometry Calculations
{
  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {},
    image_geometries: {
      'angle-test': {
        imageId: 'img-angle',
        imageUrl: 'https://example.com/angle.jpg',
        angle: 'perspective',
        nativeWidth: 2000,
        nativeHeight: 2000,
        printArea: { id: 'front', name: 'Raw Rectangle', left: 200, top: 300, width: 1000, height: 1200 },
      },
    },
  };

  const resolved = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: { imageId: 'img-angle' },
  });

  // Coordinates are strictly unaltered
  assert.equal(resolved.left, 200);
  assert.equal(resolved.top, 300);
  assert.equal(resolved.width, 1000);
  assert.equal(resolved.height, 1200);
  console.log('✓ Test 10 Passed: Angle Metadata Does Not Alter Geometry');
}

// 11. Invalid Native Dimensions / Out-of-Bounds Rejection (Falls back safely)
{
  const invalidConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'Safe Fallback Face',
        printArea: { id: 'front', name: 'Safe Fallback Face', left: 100, top: 120, width: 200, height: 280 },
      },
    },
    image_geometries: {
      'bad-overflow': {
        imageId: 'bad-1',
        nativeWidth: 1000,
        nativeHeight: 1000,
        printArea: { id: 'front', name: 'Bad Overflow', left: 600, top: 600, width: 800, height: 800 }, // 600+800 = 1400 > 1000!
      },
      'bad-negative': {
        imageId: 'bad-2',
        nativeWidth: 1000,
        nativeHeight: 1000,
        printArea: { id: 'front', name: 'Bad Negative', left: -50, top: 100, width: 400, height: 400 },
      },
      'bad-zero-dims': {
        imageId: 'bad-3',
        nativeWidth: 0,
        nativeHeight: 1000,
        printArea: { id: 'front', name: 'Bad Zero Dim', left: 100, top: 100, width: 200, height: 200 },
      },
    },
  };

  const res1 = resolveImagePrintAreaGeometry({ config: invalidConfig, faceId: 'front', currentImage: { imageId: 'bad-1' } });
  assert.equal(res1.name, 'Safe Fallback Face', 'Overflow must fall back to face geometry');

  const res2 = resolveImagePrintAreaGeometry({ config: invalidConfig, faceId: 'front', currentImage: { imageId: 'bad-2' } });
  assert.equal(res2.name, 'Safe Fallback Face', 'Negative coordinate must fall back to face geometry');

  const res3 = resolveImagePrintAreaGeometry({ config: invalidConfig, faceId: 'front', currentImage: { imageId: 'bad-3' } });
  assert.equal(res3.name, 'Safe Fallback Face', 'Zero native dimension must fall back to face geometry');

  console.log('✓ Test 11 Passed: Invalid Native Dimensions & Out-of-Bounds Rejection');
}

// 12. Immutability Guarantee (Never mutates config inputs)
{
  const originalPrintArea: PrintArea = {
    id: 'front',
    name: 'Original Object',
    left: 500,
    top: 500,
    width: 1000,
    height: 1000,
  };

  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    faces: {
      front: {
        name: 'Front',
        printArea: originalPrintArea,
      },
    },
    image_geometries: {
      'img-immut': {
        imageId: 'img-immut',
        nativeWidth: 2000,
        nativeHeight: 2000,
        printArea: originalPrintArea,
      },
    },
  };

  const resolved = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: { imageId: 'img-immut' },
    targetWidth: 400,
    targetHeight: 400,
  });

  // Returned object is scaled
  assert.equal(resolved.left, 100);
  assert.equal(resolved.width, 200);

  // Original object in config remains pristine
  assert.equal(originalPrintArea.left, 500);
  assert.equal(originalPrintArea.width, 1000);
  assert.notEqual(resolved, originalPrintArea);

  console.log('✓ Test 12 Passed: Immutability Guarantee');
}

console.log('\n======================================================');
console.log('ALL STEP 2 PURE CONVERSION & RESOLVER TESTS PASSED!');
console.log('======================================================\n');
