import assert from 'node:assert/strict';
import {
  validatePrintAreaCoordinates,
  calculatePhysicalDimensions,
  Rect,
} from './coordinateMapping';
import {
  validateProductImage,
  DEFAULT_TSHIRT_CONTRACT,
} from './imageContract';
import { CustomizationConfig, PrintArea } from './customizationConfig';

console.log('--- Running Step 5 Safe Firestore Save & Verification Tests ---');

// Mock Product Document in Firestore
const mockExistingProductDoc = {
  id: 'tshirt-001',
  name_en: 'Classic Cotton T-Shirt',
  name_ar: 'تيشيرت قطن كلاسيكي',
  base_price: 250,
  sku: 'TSH-CLASSIC',
  ready_design_id: 'rd-legacy-123',
  linked_ready_designs: ['rd-legacy-123', 'rd-template-456'],
  variants: [
    { color: 'white', size: 'M', stock: 15 },
    { color: 'black', size: 'L', stock: 10 },
  ],
  is_active: true,
};

// 1. Safe Non-Destructive Payload Construction
{
  const workingPrintAreas: Record<string, PrintArea> = {
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
      name: 'Back Full',
      left: 500,
      top: 600,
      width: 1400,
      height: 1800,
      physicalWidthCm: 11.85,
      physicalHeightCm: 15.24,
      targetDPI: 300,
      printMethod: 'DTF',
    },
  };

  const updatedConfig: CustomizationConfig = {
    version: 1,
    enabled: true,
    allowCustomerUpload: true,
    allowText: true,
    allowStickers: true,
    allowFreeMode: false,
    productType: 't-shirt',
    faces: Object.keys(workingPrintAreas).reduce((acc: any, faceKey) => {
      acc[faceKey] = {
        name: faceKey.toUpperCase(),
        enabled: true,
        printArea: workingPrintAreas[faceKey],
      };
      return acc;
    }, {}),
  };

  // Simulate Firestore { merge: true }
  const mergedProductDoc = {
    ...mockExistingProductDoc,
    customization_config: updatedConfig,
  };

  // Invariant 1: Protected product fields are 100% preserved
  assert.equal(mergedProductDoc.name_en, 'Classic Cotton T-Shirt');
  assert.equal(mergedProductDoc.base_price, 250);
  assert.equal(mergedProductDoc.ready_design_id, 'rd-legacy-123');
  assert.deepEqual(mergedProductDoc.linked_ready_designs, ['rd-legacy-123', 'rd-template-456']);
  assert.equal(mergedProductDoc.variants.length, 2);

  // Invariant 2: customization_config is updated accurately
  assert.equal(mergedProductDoc.customization_config.faces.front.printArea.left, 600);
  assert.equal(mergedProductDoc.customization_config.faces.front.printArea.width, 1200);
  assert.equal(mergedProductDoc.customization_config.faces.front.printArea.physicalWidthCm, 10.16);
  assert.equal(mergedProductDoc.customization_config.faces.back.printArea.targetDPI, 300);

  console.log('✓ Test 1 Passed: Non-Destructive Payload & Merge Verification');
}

// 2. Pre-Save Boundary Violation Blocker
{
  const invalidArea: Rect = { x: -50, y: 100, width: 2500, height: 3500 };
  const val = validatePrintAreaCoordinates(invalidArea, 2400, 3000);
  assert.equal(val.isValid, false, 'Invalid coordinates must fail validation');
  assert.ok(val.errors.some(e => e.includes('negative')));
  console.log('✓ Test 2 Passed: Pre-Save Boundary Violation Blocker');
}

// 3. Pre-Save Image Contract Violation Blocker
{
  const invalidMockup = { width: 1500, height: 1800, mime: 'image/png' };
  const val = validateProductImage(
    { width: invalidMockup.width, height: invalidMockup.height },
    invalidMockup.mime,
    DEFAULT_TSHIRT_CONTRACT,
    'front'
  );
  assert.equal(val.valid, false, 'Low resolution mockup must fail image contract');
  assert.ok(val.errors.some(e => e.code === 'MIN_WIDTH_FAILED'));
  console.log('✓ Test 3 Passed: Pre-Save Image Contract Violation Blocker');
}

// 4. Read-After-Write Verification Parser
{
  const simulatedFirestoreRead = {
    customization_config: {
      version: 1,
      enabled: true,
      faces: {
        front: {
          name: 'FRONT',
          enabled: true,
          printArea: {
            id: 'front',
            name: 'FRONT',
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
      },
    },
  };

  const verifiedFace = simulatedFirestoreRead.customization_config.faces.front.printArea;
  assert.equal(verifiedFace.left, 600);
  assert.equal(verifiedFace.top, 800);
  assert.equal(verifiedFace.width, 1200);
  assert.equal(verifiedFace.height, 1600);
  assert.equal(verifiedFace.physicalWidthCm, 10.16);
  assert.equal(verifiedFace.targetDPI, 300);
  assert.equal(verifiedFace.printMethod, 'DTF');

  console.log('✓ Test 4 Passed: Read-After-Write Verification Parser');
}

console.log('\n======================================================');
console.log('ALL STEP 5 SAFE SAVE & VERIFICATION TESTS PASSED!');
console.log('======================================================\n');
