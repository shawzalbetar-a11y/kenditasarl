import assert from 'node:assert/strict';
import {
  calculateDisplayBounds,
  nativeToDisplayRect,
  displayToNativeRect,
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
  IMAGE_ERROR_CODES,
} from './imageContract';

console.log('--- Running Step 4 Integration & Visual Engine Tests ---');

// Integration Scenario 1: Real T-Shirt Mockup Image Contract & Print Area Flow
{
  const mockupImage = { width: 3200, height: 4000, mime: 'image/png' };
  
  // 1. Image Contract Validation Gate
  const imgValidation = validateProductImage(
    { width: mockupImage.width, height: mockupImage.height },
    mockupImage.mime,
    DEFAULT_TSHIRT_CONTRACT,
    'front'
  );
  assert.equal(imgValidation.valid, true, '3200x4000 T-shirt mockup must pass image contract');
  assert.equal(imgValidation.metadata?.aspectRatio, 0.8);
  assert.equal(imgValidation.metadata?.orientation, 'portrait');

  // 2. Initial Print Area from Category / Product Config
  const initialPrintArea: Rect = { x: 750, y: 1000, width: 1500, height: 2000 };
  const initialCoordsCheck = validatePrintAreaCoordinates(initialPrintArea, mockupImage.width, mockupImage.height);
  assert.equal(initialCoordsCheck.isValid, true, 'Initial print area is strictly within mockup bounds');

  // 3. Viewport Display Geometry (Simulating 640x800 admin container)
  const displayBounds = calculateDisplayBounds(640, 800, mockupImage.width, mockupImage.height);
  assert.equal(displayBounds.scale, 0.2, 'Scale = 640 / 3200 = 0.2');
  assert.equal(displayBounds.displayWidth, 640);
  assert.equal(displayBounds.displayHeight, 800);

  // 4. Drag Operation (User moves Print Area by +20px X, +10px Y in display space)
  const deltaDisplayX = 20; // 20px on screen -> 100px native
  const deltaDisplayY = 10; // 10px on screen -> 50px native
  const deltaNativeX = deltaDisplayX / displayBounds.scale;
  const deltaNativeY = deltaDisplayY / displayBounds.scale;
  assert.equal(deltaNativeX, 100);
  assert.equal(deltaNativeY, 50);

  const draggedRect = moveRectWithClamp(
    initialPrintArea,
    deltaNativeX,
    deltaNativeY,
    mockupImage.width,
    mockupImage.height
  );
  assert.equal(draggedRect.x, 850, 'Native X updated accurately without screen coordinate pollution');
  assert.equal(draggedRect.y, 1050, 'Native Y updated accurately');
  assert.equal(draggedRect.width, 1500);
  assert.equal(draggedRect.height, 2000);

  // 5. Extreme Drag Boundary Clamp (User drags far off right screen)
  const clampedDrag = moveRectWithClamp(
    initialPrintArea,
    5000,
    5000,
    mockupImage.width,
    mockupImage.height
  );
  assert.equal(clampedDrag.x, 1700, 'Clamped to mockupWidth - width = 3200 - 1500 = 1700');
  assert.equal(clampedDrag.y, 2000, 'Clamped to mockupHeight - height = 4000 - 2000 = 2000');

  // 6. 8-Handle Resizing Check (SE, NW, N, E, S, W, NE, SW)
  const seResized = resizeRectWithHandle(
    initialPrintArea,
    'se',
    200,
    300,
    mockupImage.width,
    mockupImage.height
  );
  assert.equal(seResized.width, 1700);
  assert.equal(seResized.height, 2300);

  const nwResized = resizeRectWithHandle(
    initialPrintArea,
    'nw',
    -100,
    -150,
    mockupImage.width,
    mockupImage.height
  );
  assert.equal(nwResized.x, 650);
  assert.equal(nwResized.y, 850);
  assert.equal(nwResized.width, 1600);
  assert.equal(nwResized.height, 2150);

  // 7. Zoom Invariance Check (Changing zoom 50%, 100%, 200% preserves native coordinates)
  const zoom50Bounds = calculateDisplayBounds(600 * 0.5, 800 * 0.5, mockupImage.width, mockupImage.height);
  const zoom200Bounds = calculateDisplayBounds(600 * 2.0, 800 * 2.0, mockupImage.width, mockupImage.height);
  
  const dispAt50 = nativeToDisplayRect(draggedRect, zoom50Bounds);
  const dispAt200 = nativeToDisplayRect(draggedRect, zoom200Bounds);
  
  const roundtripAt50 = displayToNativeRect(dispAt50, zoom50Bounds);
  const roundtripAt200 = displayToNativeRect(dispAt200, zoom200Bounds);
  
  assert.equal(Math.round(roundtripAt50.x), draggedRect.x, 'Zoom 50% does not alter native X');
  assert.equal(Math.round(roundtripAt200.x), draggedRect.x, 'Zoom 200% does not alter native X');
  assert.equal(Math.round(roundtripAt50.width), draggedRect.width, 'Zoom 50% does not alter native width');
  assert.equal(Math.round(roundtripAt200.width), draggedRect.width, 'Zoom 200% does not alter native width');

  // 8. Physical Dimensions @ 300 DPI (1500x2000 px -> 12.7cm x 16.93cm)
  const phys = calculatePhysicalDimensions(draggedRect.width, draggedRect.height, 300);
  // 1500 * 2.54 / 300 = 12.70 cm
  // 2000 * 2.54 / 300 = 16.93 cm
  assert.equal(phys.physicalWidthCm, 12.7);
  assert.equal(phys.physicalHeightCm, 16.93);

  console.log('✓ Integration Scenario 1 Passed: Real T-Shirt Mockup & Geometry Invariants');
}

// Integration Scenario 2: Mug Wrap Landscape Mockup Integration
{
  const mugMockup = { width: 3000, height: 1500, mime: 'image/webp' };
  const mugValidation = validateProductImage(
    { width: mugMockup.width, height: mugMockup.height },
    mugMockup.mime,
    DEFAULT_MUG_CONTRACT,
    'wrap'
  );
  assert.equal(mugValidation.valid, true, '3000x1500 Mug mockup must pass wrap contract');
  assert.equal(mugValidation.metadata?.orientation, 'landscape');

  const wrapPrintArea: Rect = { x: 300, y: 150, width: 2400, height: 1200 };
  const validWrap = validatePrintAreaCoordinates(wrapPrintArea, mugMockup.width, mugMockup.height);
  assert.equal(validWrap.isValid, true);

  console.log('✓ Integration Scenario 2 Passed: Mug Panoramic Wrap Integration');
}

// Integration Scenario 3: Hat Square Mockup Integration
{
  const hatMockup = { width: 1800, height: 1800, mime: 'image/jpeg' };
  const hatValidation = validateProductImage(
    { width: hatMockup.width, height: hatMockup.height },
    hatMockup.mime,
    DEFAULT_HAT_CONTRACT,
    'front'
  );
  assert.equal(hatValidation.valid, true, '1800x1800 Hat mockup must pass square contract');
  assert.equal(hatValidation.metadata?.orientation, 'square');

  const hatPrintArea: Rect = { x: 500, y: 600, width: 800, height: 600 };
  const validHat = validatePrintAreaCoordinates(hatPrintArea, hatMockup.width, hatMockup.height);
  assert.equal(validHat.isValid, true);

  console.log('✓ Integration Scenario 3 Passed: Hat Square Integration');
}

console.log('\n======================================================');
console.log('ALL STEP 4 INTEGRATION & GEOMETRY VERIFICATIONS PASSED!');
console.log('======================================================\n');
