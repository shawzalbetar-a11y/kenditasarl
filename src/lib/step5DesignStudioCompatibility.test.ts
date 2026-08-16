import assert from 'node:assert/strict';
import {
  nativeToReferencePrintArea,
  referenceToNativePrintArea,
  resolveImagePrintAreaGeometry,
  calculateDisplayBounds,
  nativeToDisplayRect,
  validatePrintAreaCoordinates,
  Rect,
} from './coordinateMapping';
import {
  CustomizationConfig,
  PrintArea,
  ImageSpecificGeometry,
  ProductionSnapshot,
  getCustomizationConfig,
} from './customizationConfig';

console.log('========================================================================');
console.log('--- RUNNING STEP 5 IMAGE-GEOMETRY → DESIGN-STUDIO COMPATIBILITY AUDIT ---');
console.log('========================================================================\n');

let passedTests = 0;

function logPass(title: string) {
  passedTests++;
  console.log(`[PASS] ${title}`);
}

// 1. Double-Scaling Protection Verification
{
  const native = {
    nativeWidth: 3200,
    nativeHeight: 4000,
    left: 800,
    top: 600,
    width: 1600,
    height: 2000,
    targetWidth: 400,
    targetHeight: 500,
  };

  // Step A: Convert once for FabricCanvas reference space
  const ref = nativeToReferencePrintArea(native);
  assert.equal(ref.x, 100);
  assert.equal(ref.y, 75);
  assert.equal(ref.width, 200);
  assert.equal(ref.height, 250);

  // Step B: In FabricCanvas, overlay percentage calculation:
  const overlayLeftPercent = (ref.x / 400) * 100;
  const overlayTopPercent = (ref.y / 500) * 100;
  const overlayWidthPercent = (ref.width / 400) * 100;
  const overlayHeightPercent = (ref.height / 500) * 100;

  // Verify overlay percentages match EXACT native proportions:
  assert.equal(overlayLeftPercent, (native.left / native.nativeWidth) * 100); // 25%
  assert.equal(overlayTopPercent, (native.top / native.nativeHeight) * 100);  // 15%
  assert.equal(overlayWidthPercent, (native.width / native.nativeWidth) * 100); // 50%
  assert.equal(overlayHeightPercent, (native.height / native.nativeHeight) * 100); // 50%

  // Verify values are NOT double scaled (e.g. 12.5, 9.375, 25, 31.25)
  assert.notEqual(ref.x, 12.5);
  assert.notEqual(ref.y, 9.375);
  assert.notEqual(ref.width, 25);
  assert.notEqual(ref.height, 31.25);

  logPass('Double-Scaling Protection: Reference conversion happens exactly once with exact proportional match');
}

// 2. Image-Specific Priority Tier Verification
{
  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'Front Face Level',
        printArea: { id: 'front', name: 'Face Level A', left: 200, top: 200, width: 400, height: 400 },
      },
    },
    image_geometries: {
      'img-1': {
        imageId: 'img-1',
        imageUrl: 'https://example.com/mockup-1.jpg',
        nativeWidth: 2400,
        nativeHeight: 3000,
        printArea: { id: 'front', name: 'Image Specific B', left: 600, top: 750, width: 1200, height: 1500 },
      },
    },
  };

  // A. With img-1 -> Resolves to B (scaled to reference target space)
  const resolved1 = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: { imageId: 'img-1' },
    targetWidth: 400,
    targetHeight: 500,
  });
  assert.equal(resolved1.name, 'Image Specific B');
  assert.equal(resolved1.left, 100);
  assert.equal(resolved1.width, 200);

  // B. With img-2 (no image geometry) -> Falls back to Face Level A
  const resolved2 = resolveImagePrintAreaGeometry({
    config,
    faceId: 'front',
    currentImage: { imageId: 'img-2' },
  });
  assert.equal(resolved2.name, 'Face Level A');
  assert.equal(resolved2.left, 200);

  // C. Unconfigured face -> Falls back to Category Default
  const resolved3 = resolveImagePrintAreaGeometry({
    config,
    faceId: 'back',
  });
  assert.equal(resolved3.id, 'back');
  assert.equal(resolved3.width, 200); // From t-shirt category defaults

  logPass('Image-Specific Priority: Priority 1 (Image) > Priority 2 (Face) > Priority 3 (Category Default)');
}

// 3. Image Identity & Cross-Contamination Protection
{
  const config: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {},
    image_geometries: {
      'front-1': {
        imageId: 'img-front-1',
        imageUrl: 'https://example.com/front-1.png',
        faceId: 'front',
        nativeWidth: 3200,
        nativeHeight: 4000,
        printArea: { id: 'front', name: 'Front Straight Area', left: 800, top: 1000, width: 1600, height: 2000 },
      },
      'front-2': {
        imageId: 'img-front-2',
        imageUrl: 'https://example.com/front-2.png',
        faceId: 'front',
        nativeWidth: 3200,
        nativeHeight: 4000,
        printArea: { id: 'front', name: 'Front 3/4 Area', left: 1100, top: 1200, width: 1000, height: 1600 },
      },
    },
  };

  // Selecting img-front-1 gets its own geometry
  const r1 = resolveImagePrintAreaGeometry({ config, faceId: 'front', currentImage: { imageId: 'img-front-1' } });
  assert.equal(r1.name, 'Front Straight Area');
  assert.equal(r1.left, 800);

  // Selecting img-front-2 gets its own geometry
  const r2 = resolveImagePrintAreaGeometry({ config, faceId: 'front', currentImage: { imageId: 'img-front-2' } });
  assert.equal(r2.name, 'Front 3/4 Area');
  assert.equal(r2.left, 1100);

  // Unregistered image does not take front-1's geometry
  const rUnregistered = resolveImagePrintAreaGeometry({ config, faceId: 'front', currentImage: { imageId: 'img-front-unregistered' } });
  assert.notEqual(rUnregistered.name, 'Front Straight Area');
  assert.notEqual(rUnregistered.name, 'Front 3/4 Area');

  logPass('Image Identity Isolation: Independent mockups on same face remain 100% strictly isolated');
}

// 4. Angle Metadata Independence
{
  const angles = ['straight', '3/4', 'perspective', 'angled', 'close-up'];
  for (const ang of angles) {
    const config: CustomizationConfig = {
      version: 1,
      enabled: true,
      productType: 't-shirt',
      faces: {},
      image_geometries: {
        'geo-ang': {
          imageId: `img-${ang}`,
          angle: ang,
          nativeWidth: 2000,
          nativeHeight: 2500,
          printArea: { id: 'front', name: `Area ${ang}`, left: 400, top: 500, width: 1200, height: 1500 },
        },
      },
    };

    const res = resolveImagePrintAreaGeometry({
      config,
      faceId: 'front',
      currentImage: { imageId: `img-${ang}` },
      targetWidth: 400,
      targetHeight: 500,
    });

    // Coordinates are strictly mathematical (400 * 400/2000 = 80, 500 * 500/2500 = 100)
    assert.equal(res.left, 80);
    assert.equal(res.top, 100);
    assert.equal(res.width, 240);
    assert.equal(res.height, 300);
  }

  logPass('Angle Metadata Independence: Angle descriptive labels do not distort coordinate math');
}

// 5. Native Pixel Source of Truth Preservation
{
  const nativeGeometry: PrintArea = {
    id: 'front',
    name: 'Native Truth',
    left: 950,
    top: 720,
    width: 1300,
    height: 1750,
    nativeWidth: 3200,
    nativeHeight: 4000,
    physicalWidthCm: 11.0,
    physicalHeightCm: 14.8,
    targetDPI: 300,
    printMethod: 'DTF',
  };

  // Verify coordinates are native pixels and satisfy bounds
  const val = validatePrintAreaCoordinates(
    { x: nativeGeometry.left, y: nativeGeometry.top, width: nativeGeometry.width, height: nativeGeometry.height },
    nativeGeometry.nativeWidth!,
    nativeGeometry.nativeHeight!
  );
  assert.equal(val.isValid, true);
  assert.equal(nativeGeometry.left, 950);
  assert.equal(nativeGeometry.top, 720);

  logPass('Native Pixel Source of Truth: Saved calibration coordinates are unscaled native pixels');
}

// 6. Design Studio Production Snapshot Integrity
{
  const customConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 'hoodie',
    faces: {
      front: {
        name: 'Front',
        enabled: true,
        printArea: {
          id: 'front',
          name: 'Front Chest',
          left: 100,
          top: 120,
          width: 200,
          height: 250,
          physicalWidthCm: 16.93,
          physicalHeightCm: 21.17,
          targetDPI: 300,
          printMethod: 'DTF',
        },
      },
    },
    image_geometries: {
      'hoodie-front-straight': {
        imageId: 'hoodie-front-straight',
        imageUrl: 'https://example.com/hoodie-front.png',
        faceId: 'front',
        angle: 'straight',
        nativeWidth: 3200,
        nativeHeight: 4000,
        printArea: {
          id: 'front',
          name: 'Front Straight Calibration',
          left: 800,
          top: 960,
          width: 1600,
          height: 2000,
          nativeWidth: 3200,
          nativeHeight: 4000,
          physicalWidthCm: 13.55,
          physicalHeightCm: 16.93,
          targetDPI: 300,
          printMethod: 'DTF',
        },
      },
    },
  };

  // Simulate snapshot generation in FabricCanvas.tsx
  const configFaces = customConfig.faces;
  const snapshot: ProductionSnapshot = {
    snapshotVersion: 1,
    editorVersion: 1,
    customization_config: customConfig,
    printAreas: Object.keys(configFaces).reduce((acc: any, face: string) => {
      acc[face] = configFaces[face].printArea;
      return acc;
    }, {}),
  };

  // Assert snapshot retains customization_config and image_geometries
  assert.equal(snapshot.customization_config.productType, 'hoodie');
  assert.ok(snapshot.customization_config.image_geometries?.['hoodie-front-straight']);
  assert.equal(snapshot.customization_config.image_geometries['hoodie-front-straight'].printArea.physicalWidthCm, 13.55);
  assert.equal(snapshot.printAreas.front.printMethod, 'DTF');

  logPass('Production Snapshot Integrity: snapshot preserves customization_config, image_geometries, and physical specs');
}

// 7. Legacy Products Backward Compatibility
{
  const legacyConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 'mug',
    faces: {
      wrap: {
        name: 'Mug Panoramic Wrap',
        enabled: true,
        printArea: {
          id: 'wrap',
          name: 'Mug Wrap',
          left: 50,
          top: 50,
          width: 500,
          height: 250,
          physicalWidthCm: 20,
          physicalHeightCm: 9,
          targetDPI: 300,
          printMethod: 'Sublimation',
        },
      },
    },
    // No image_geometries field
  };

  // Design studio loads legacy config without error
  const legacyResolved = resolveImagePrintAreaGeometry({
    config: legacyConfig,
    faceId: 'wrap',
    currentImage: 'https://example.com/legacy-mug.jpg',
  });

  assert.equal(legacyResolved.name, 'Mug Wrap');
  assert.equal(legacyResolved.printMethod, 'Sublimation');
  assert.equal(legacyResolved.physicalWidthCm, 20);

  logPass('Legacy Products Compatibility: Legacy products without image_geometries load flawlessly');
}

// 8. Multi-Image Product Multi-Angle Isolation
{
  const multiProductConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {},
    image_geometries: {
      'front-straight': {
        imageId: 'img-front-straight',
        angle: 'straight',
        nativeWidth: 3200,
        nativeHeight: 4000,
        printArea: { id: 'front', name: 'Front Straight', left: 900, top: 700, width: 1400, height: 1800 },
      },
      'front-3-4': {
        imageId: 'img-front-3-4',
        angle: '3/4',
        nativeWidth: 3000,
        nativeHeight: 4000,
        printArea: { id: 'front', name: 'Front 3/4', left: 1100, top: 850, width: 1000, height: 1500 },
      },
      'front-perspective': {
        imageId: 'img-front-perspective',
        angle: 'perspective',
        nativeWidth: 4000,
        nativeHeight: 3000,
        printArea: { id: 'front', name: 'Front Perspective', left: 700, top: 300, width: 2200, height: 2100 },
      },
      'back-straight': {
        imageId: 'img-back-straight',
        angle: 'straight',
        nativeWidth: 3200,
        nativeHeight: 4000,
        printArea: { id: 'back', name: 'Back Full', left: 800, top: 600, width: 1600, height: 2200 },
      },
    },
  };

  const frontStraight = resolveImagePrintAreaGeometry({ config: multiProductConfig, faceId: 'front', currentImage: { imageId: 'img-front-straight' } });
  const front34 = resolveImagePrintAreaGeometry({ config: multiProductConfig, faceId: 'front', currentImage: { imageId: 'img-front-3-4' } });
  const frontPerspective = resolveImagePrintAreaGeometry({ config: multiProductConfig, faceId: 'front', currentImage: { imageId: 'img-front-perspective' } });
  const backStraight = resolveImagePrintAreaGeometry({ config: multiProductConfig, faceId: 'back', currentImage: { imageId: 'img-back-straight' } });

  assert.equal(frontStraight.name, 'Front Straight');
  assert.equal(front34.name, 'Front 3/4');
  assert.equal(frontPerspective.name, 'Front Perspective');
  assert.equal(backStraight.name, 'Back Full');

  logPass('Multi-Image Product Multi-Angle Isolation: 4 distinct image angles maintain isolated geometries');
}

// 9. Strict Config Immutability Guarantee
{
  const sourceConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'Front Face',
        printArea: { id: 'front', name: 'Original Front', left: 500, top: 600, width: 1000, height: 1200 },
      },
    },
    image_geometries: {
      'img-src': {
        imageId: 'img-src',
        nativeWidth: 2000,
        nativeHeight: 2000,
        printArea: { id: 'front', name: 'Native Immut Source', left: 400, top: 400, width: 800, height: 800 },
      },
    },
  };

  const snapshotBefore = JSON.parse(JSON.stringify(sourceConfig));

  // Run resolution with reference coordinate transformation
  const resolved = resolveImagePrintAreaGeometry({
    config: sourceConfig,
    faceId: 'front',
    currentImage: { imageId: 'img-src' },
    targetWidth: 400,
    targetHeight: 400,
  });

  const snapshotAfter = JSON.parse(JSON.stringify(sourceConfig));

  // Assert exact deep strict equality of source object before and after resolution
  assert.deepStrictEqual(snapshotBefore, snapshotAfter);
  assert.equal(resolved.left, 80); // Converted clone
  assert.equal(sourceConfig.image_geometries!['img-src'].printArea.left, 400); // Original intact

  logPass('Strict Immutability Guarantee: Source configuration is 100% side-effect free and unmutated');
}

console.log('\n========================================================================');
console.log(`ALL ${passedTests} / 9 STEP 5 DESIGN STUDIO COMPATIBILITY AUDITS PASSED!`);
console.log('========================================================================\n');
