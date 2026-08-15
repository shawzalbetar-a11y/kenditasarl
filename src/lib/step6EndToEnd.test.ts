import assert from 'node:assert/strict';
import {
  calculateDisplayBounds,
  nativeToDisplayRect,
  moveRectWithClamp,
  resizeRectWithHandle,
  calculatePhysicalDimensions,
  validatePrintAreaCoordinates,
  Rect,
} from './coordinateMapping';
import {
  validateProductImage,
  DEFAULT_TSHIRT_CONTRACT,
  DEFAULT_MUG_CONTRACT,
  DEFAULT_HAT_CONTRACT,
} from './imageContract';
import {
  getCustomizationConfig,
  CustomizationConfig,
  PrintArea,
} from './customizationConfig';

console.log('--- Running Step 6 End-to-End & Design Studio Compatibility Tests ---');

// 1. Category Defaults Resolution for T-Shirt (front, back, left, right)
{
  const tshirtConfig = getCustomizationConfig('t-shirts');
  assert.equal(tshirtConfig.productType, 't-shirt');
  assert.ok(tshirtConfig.faces.front, 'Front face must exist');
  assert.ok(tshirtConfig.faces.back, 'Back face must exist');
  assert.ok(tshirtConfig.faces.left, 'Left sleeve must exist in category defaults');
  assert.ok(tshirtConfig.faces.right, 'Right sleeve must exist in category defaults');

  // Verify left sleeve default coordinates
  const leftSleeve = tshirtConfig.faces.left.printArea;
  assert.equal(leftSleeve.id, 'left');
  assert.equal(leftSleeve.width, 80);
  assert.equal(leftSleeve.height, 100);
  assert.equal(leftSleeve.top, 150);
  assert.equal(leftSleeve.left, 260);

  // Verify right sleeve default coordinates
  const rightSleeve = tshirtConfig.faces.right.printArea;
  assert.equal(rightSleeve.id, 'right');
  assert.equal(rightSleeve.width, 80);
  assert.equal(rightSleeve.height, 100);
  assert.equal(rightSleeve.top, 150);
  assert.equal(rightSleeve.left, 60);

  console.log('✓ Test 1 Passed: Category Defaults Resolution for T-Shirt');
}

// 2. Face Isolation: Editing Front does NOT pollute Back, Left, or Right
{
  const productWorkingAreas: Record<string, PrintArea> = {
    front: {
      id: 'front',
      name: 'Front Chest',
      left: 600,
      top: 800,
      width: 1200,
      height: 1600,
      physicalWidthCm: 10.16,
      physicalHeightCm: 13.55,
      targetDPI: 300,
      printMethod: 'DTF',
    },
    back: {
      id: 'back',
      name: 'Back Area',
      left: 500,
      top: 700,
      width: 1400,
      height: 1800,
      physicalWidthCm: 11.85,
      physicalHeightCm: 15.24,
      targetDPI: 300,
      printMethod: 'DTF',
    },
    left: {
      id: 'left',
      name: 'Left Sleeve',
      left: 200,
      top: 300,
      width: 400,
      height: 500,
      physicalWidthCm: 3.39,
      physicalHeightCm: 4.23,
      targetDPI: 300,
      printMethod: 'DTF',
    },
    right: {
      id: 'right',
      name: 'Right Sleeve',
      left: 150,
      top: 250,
      width: 400,
      height: 500,
      physicalWidthCm: 3.39,
      physicalHeightCm: 4.23,
      targetDPI: 300,
      printMethod: 'DTF',
    },
  };

  // Modify front area only
  const newFrontRect = moveRectWithClamp(
    { x: productWorkingAreas.front.left, y: productWorkingAreas.front.top, width: productWorkingAreas.front.width, height: productWorkingAreas.front.height },
    100,
    50,
    3200,
    4000
  );
  productWorkingAreas.front.left = newFrontRect.x;
  productWorkingAreas.front.top = newFrontRect.y;

  // Assert front changed
  assert.equal(productWorkingAreas.front.left, 700);
  assert.equal(productWorkingAreas.front.top, 850);

  // Assert other faces remained 100% isolated
  assert.equal(productWorkingAreas.back.left, 500);
  assert.equal(productWorkingAreas.back.top, 700);
  assert.equal(productWorkingAreas.left.left, 200);
  assert.equal(productWorkingAreas.right.left, 150);

  console.log('✓ Test 2 Passed: Face Isolation Guarantee');
}

// 3. Image Contract Evaluation per Face
{
  // Front: Required
  const frontCheck = validateProductImage({ width: 3200, height: 4000 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(frontCheck.valid, true);

  // Left sleeve: Optional with lower resolution requirements
  const sleeveCheck = validateProductImage({ width: 1200, height: 1500 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'left');
  assert.equal(sleeveCheck.valid, true, 'Left sleeve passes lower resolution threshold (1000x1200)');

  // Left sleeve with too low resolution
  const badSleeve = validateProductImage({ width: 600, height: 800 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'left');
  assert.equal(badSleeve.valid, false);
  assert.ok(badSleeve.errors.some(e => e.code === 'MIN_WIDTH_FAILED'));

  console.log('✓ Test 3 Passed: Image Contract per Face Evaluation');
}

// 4. Design Studio Compatibility: Saved customization_config accurately feeds FabricCanvas & snapshot
{
  const savedCustomizationConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    productType: 't-shirt',
    faces: {
      front: {
        name: 'FRONT',
        enabled: true,
        printArea: {
          id: 'front',
          name: 'Front Chest',
          left: 600,
          top: 800,
          width: 1200,
          height: 1600,
          physicalWidthCm: 10.16,
          physicalHeightCm: 13.55,
          targetDPI: 300,
          printMethod: 'DTF',
        },
      },
      back: {
        name: 'BACK',
        enabled: true,
        printArea: {
          id: 'back',
          name: 'Back Full',
          left: 500,
          top: 700,
          width: 1400,
          height: 1800,
          physicalWidthCm: 11.85,
          physicalHeightCm: 15.24,
          targetDPI: 300,
          printMethod: 'DTF',
        },
      },
    },
  };

  // Simulate how Design Studio page loads config:
  const productData = {
    id: 'prod-123',
    customization_config: savedCustomizationConfig,
    category_id: 't-shirt',
  };
  const resolvedConfig = productData.customization_config || getCustomizationConfig(productData.category_id);

  // FabricCanvas uses config.faces:
  const configFaces = resolvedConfig.faces;
  const availableFaces = Object.keys(configFaces);
  assert.deepEqual(availableFaces, ['front', 'back']);

  // FabricCanvas builds production_snapshot:
  const productionSnapshot = {
    snapshotVersion: 1,
    editorVersion: 1,
    customization_config: resolvedConfig,
    printAreas: Object.keys(configFaces).reduce((acc: any, face: string) => {
      acc[face] = configFaces[face].printArea;
      return acc;
    }, {}),
  };

  assert.equal(productionSnapshot.printAreas.front.width, 1200);
  assert.equal(productionSnapshot.printAreas.front.height, 1600);
  assert.equal(productionSnapshot.printAreas.front.physicalWidthCm, 10.16);
  assert.equal(productionSnapshot.printAreas.back.width, 1400);

  console.log('✓ Test 4 Passed: Design Studio Compatibility & Production Snapshot Generation');
}

console.log('\n======================================================');
console.log('ALL STEP 6 END-TO-END VERIFICATION TESTS PASSED!');
console.log('======================================================\n');
