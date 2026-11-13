import assert from 'node:assert/strict';
import {
  computeSmartSnapping,
  computeScalingGuides,
  extractObjectBounds,
  deduplicateGuidelines,
  DEFAULT_SNAP_THRESHOLD,
  ObjectBounds,
  SmartGuideLine,
} from './fabricSmartGuides';

console.log('--- Running Upgraded Smart Alignment Guides & Magnetic Snapping Unit Tests ---');

// =========================================================================
// TEST 1: Canvas Center Snapping & Single Clean Primary Crosshair (Apparel)
// =========================================================================
const canvasWidth = 1000;
const canvasHeight = 1000;

// Near center sticker at (497, 502) -> center at (497 + 100, 502 + 100) = (597, 602)? No:
// left: 400, top: 400, width: 200, height: 200 -> center is at (500, 500)
const nearCenterObj: ObjectBounds = {
  left: 397,
  top: 402,
  width: 200,
  height: 200,
  id: 'sticker-center',
};

const centerSnapResult = computeSmartSnapping(nearCenterObj, [], canvasWidth, canvasHeight);
assert.equal(centerSnapResult.snappedX, true, 'Must snap to vertical canvas center');
assert.equal(centerSnapResult.snappedY, true, 'Must snap to horizontal canvas center');
assert.equal(centerSnapResult.deltaX, 3, 'Must adjust X by exactly +3px to align center at 500');
assert.equal(centerSnapResult.deltaY, -2, 'Must adjust Y by exactly -2px to align center at 500');

assert.equal(centerSnapResult.guidelines.length, 2, 'Must render exactly 2 guidelines (1 vertical, 1 horizontal)');
const vLines = centerSnapResult.guidelines.filter(g => g.type === 'vertical');
const hLines = centerSnapResult.guidelines.filter(g => g.type === 'horizontal');
assert.equal(vLines.length, 1, 'Only 1 vertical center line must exist (no duplicates!)');
assert.equal(hLines.length, 1, 'Only 1 horizontal center line must exist (no duplicates!)');
console.log('✓ Test 1 Passed: Single Clean Primary Crosshairs Verified (Zero Duplicate Lines)');

// =========================================================================
// TEST 2: Mug Panorama 3-Zone Snapping (Left • Center • Right Zones)
// =========================================================================
const panoW = 1840;
const panoH = 760;
const leftCenter = panoW * 0.185;   // 340.4
const centerCenter = panoW * 0.50;  // 920
const rightCenter = panoW * 0.815;  // 1499.6
const panoOptions = {
  isMugPanorama: true,
  panoramaZones: {
    leftCenter,
    centerCenter,
    rightCenter,
    dividers: [panoW * 0.35, panoW * 0.65], // 644, 1196
  },
};

// A. Sticker in Left Zone (center near 340.4px)
const leftZoneSticker: ObjectBounds = {
  left: 242,
  top: 280,
  width: 200,
  height: 200, // center X = 342 (diff = -1.6px from 340.4)
  id: 'sticker-left-zone',
};
const leftZoneResult = computeSmartSnapping(leftZoneSticker, [], panoW, panoH, panoOptions);
assert.equal(leftZoneResult.snappedX, true, 'Must snap to Left Zone center in panorama mode');
assert.ok(Math.abs(leftZoneResult.deltaX - (leftCenter - 342)) < 0.1);
const leftPanoGuide = leftZoneResult.guidelines.find(g => g.type === 'vertical' && Math.abs(g.axisCoord - leftCenter) < 1);
assert.ok(leftPanoGuide, 'Must render vertical guide at Left Zone center (340.4px)');
assert.equal(leftPanoGuide?.guideType, 'zone-center');

// B. Sticker in Right Zone (center near 1499.6px)
const rightZoneSticker: ObjectBounds = {
  left: 1402,
  top: 280,
  width: 200,
  height: 200, // center X = 1502 (diff = -2.4px from 1499.6)
  id: 'sticker-right-zone',
};
const rightZoneResult = computeSmartSnapping(rightZoneSticker, [], panoW, panoH, panoOptions);
assert.equal(rightZoneResult.snappedX, true, 'Must snap to Right Zone center in panorama mode');
const rightPanoGuide = rightZoneResult.guidelines.find(g => g.type === 'vertical' && Math.abs(g.axisCoord - rightCenter) < 1);
assert.ok(rightPanoGuide, 'Must render vertical guide at Right Zone center (1499.6px)');
assert.equal(rightPanoGuide?.guideType, 'zone-center');

// C. Sticker in Center Zone (center near 920px)
const centerZoneSticker: ObjectBounds = {
  left: 818,
  top: 280,
  width: 200,
  height: 200, // center X = 918 (diff = +2px from 920)
  id: 'sticker-center-zone',
};
const centerZoneResult = computeSmartSnapping(centerZoneSticker, [], panoW, panoH, panoOptions);
assert.equal(centerZoneResult.snappedX, true, 'Must snap to Center Zone in panorama mode');
const centerPanoGuide = centerZoneResult.guidelines.find(g => g.type === 'vertical' && Math.abs(g.axisCoord - centerCenter) < 1);
assert.ok(centerPanoGuide, 'Must render vertical guide at Center Zone (920px)');

// D. Single Horizontal Center Line in Panorama at Y = 380px (760 / 2)
const panoHSticker: ObjectBounds = {
  left: 240,
  top: 278,
  width: 200,
  height: 200, // center Y = 378 (diff = +2px from 380)
};
const panoHResult = computeSmartSnapping(panoHSticker, [], panoW, panoH, panoOptions);
assert.equal(panoHResult.snappedY, true);
assert.equal(panoHResult.deltaY, 2);
const panoHLines = panoHResult.guidelines.filter(g => g.type === 'horizontal');
assert.equal(panoHLines.length, 1, 'Exactly ONE horizontal line in panorama mode across full sheet');
assert.equal(panoHLines[0].axisCoord, 380, 'Horizontal line must be at exact Y=380');
assert.equal(panoHLines[0].startCoord, 0);
assert.equal(panoHLines[0].endCoord, 1840);
console.log('✓ Test 2 Passed: Mug Panorama 3-Zone Snapping (Left, Center, Right, Dividers) Verified');

// =========================================================================
// TEST 3: Strict 4px Proximity Deduplication (Prevents duplicate parallel lines)
// =========================================================================
const duplicateInput: SmartGuideLine[] = [
  { type: 'horizontal', guideType: 'canvas-center', axisCoord: 380, startCoord: 0, endCoord: 1000 },
  { type: 'horizontal', guideType: 'canvas-center', axisCoord: 382, startCoord: 50, endCoord: 800 }, // within 2px!
  { type: 'vertical', guideType: 'object-edge', axisCoord: 500, startCoord: 100, endCoord: 400 },
  { type: 'vertical', guideType: 'canvas-center', axisCoord: 501, startCoord: 0, endCoord: 1000 }, // within 1px!
];

const dedupedOutput = deduplicateGuidelines(duplicateInput);
assert.equal(dedupedOutput.length, 2, 'Must merge 4 lines into 2 unique guidelines');
const dedupedH = dedupedOutput.find(g => g.type === 'horizontal');
const dedupedV = dedupedOutput.find(g => g.type === 'vertical');
assert.ok(dedupedH && dedupedV);
assert.equal(dedupedH.startCoord, 0);
assert.equal(dedupedH.endCoord, 1000, 'Span must merge to cover 0..1000');
console.log('✓ Test 3 Passed: 4px Proximity Deduplication Verified');

// =========================================================================
// TEST 4: Object-to-Object Edge Snapping (Top, Bottom, Left, Right)
// =========================================================================
const existingStickerA: ObjectBounds = {
  id: 'sticker-a',
  left: 200,
  top: 200,
  width: 150,
  height: 150,
};

const draggedStickerB: ObjectBounds = {
  id: 'sticker-b',
  left: 203,
  top: 198,
  width: 120,
  height: 120,
};

const edgeSnapResult = computeSmartSnapping(draggedStickerB, [existingStickerA], canvasWidth, canvasHeight);
assert.equal(edgeSnapResult.snappedX, true);
assert.equal(edgeSnapResult.snappedY, true);
assert.equal(edgeSnapResult.deltaX, -3);
assert.equal(edgeSnapResult.deltaY, 2);
console.log('✓ Test 4 Passed: Object-to-Object Edge Snapping Verified');

// =========================================================================
// TEST 5: Multi-Element Alignment (3 Stickers sharing the same Bottom Edge)
// =========================================================================
const sticker1: ObjectBounds = { id: 's1', left: 100, top: 300, width: 100, height: 100 };
const sticker2: ObjectBounds = { id: 's2', left: 700, top: 250, width: 120, height: 150 };
const sticker3: ObjectBounds = { id: 's3', left: 400, top: 318, width: 100, height: 80 }; // bottom = 398 -> snap to 400

const multiElementResult = computeSmartSnapping(sticker3, [sticker1, sticker2], canvasWidth, canvasHeight);
assert.equal(multiElementResult.snappedY, true);
assert.equal(multiElementResult.deltaY, 2);
const sharedBottomGuide = multiElementResult.guidelines.find(g => g.type === 'horizontal' && g.axisCoord === 400);
assert.ok(sharedBottomGuide);
assert.ok(sharedBottomGuide.startCoord <= 100);
assert.ok(sharedBottomGuide.endCoord >= 820);
console.log('✓ Test 5 Passed: Multi-Element Connecting Line across 3 stickers Verified');

// =========================================================================
// TEST 6: Resizing / Scaling Guides Computation
// =========================================================================
const scalingActive: ObjectBounds = {
  left: 50,
  top: 200,
  width: 148,
  height: 100,
};
const scalingGuides = computeScalingGuides(scalingActive, [existingStickerA], canvasWidth, canvasHeight);
assert.ok(scalingGuides.length > 0);
console.log('✓ Test 6 Passed: Scaling & Resizing Smart Guides Verified');

// =========================================================================
// TEST 7: Feature Toggle (enabled = false disables all snapping and guides)
// =========================================================================
const disabledResult = computeSmartSnapping(nearCenterObj, [existingStickerA], canvasWidth, canvasHeight, {
  enabled: false,
});
assert.equal(disabledResult.snappedX, false);
assert.equal(disabledResult.guidelines.length, 0);
console.log('✓ Test 7 Passed: Feature Toggle (enabled=false) Verified');

// =========================================================================
// TEST 8: Print Placement Zone Snapping & Bounded Guidelines (Left Chest / White Box)
// =========================================================================
const leftChestZone = {
  left: 560,
  top: 220,
  width: 220,
  height: 260,
}; // Center = (670, 350)

// A. Near center of Left Chest
const stickerInLeftChest: ObjectBounds = {
  left: 618,
  top: 298,
  width: 100,
  height: 100, // center is at (668, 348), diff is +2 on X and +2 on Y
  id: 'sticker-left-chest',
};
const leftChestResult = computeSmartSnapping(stickerInLeftChest, [], canvasWidth, canvasHeight, {
  printZone: leftChestZone,
});

assert.equal(leftChestResult.snappedX, true, 'Must snap to Left Chest horizontal center (670)');
assert.equal(leftChestResult.snappedY, true, 'Must snap to Left Chest vertical center (350)');
assert.equal(leftChestResult.deltaX, 2, 'Must adjust +2px on X to reach 670');
assert.equal(leftChestResult.deltaY, 2, 'Must adjust +2px on Y to reach 350');

const vPlacementGuide = leftChestResult.guidelines.find(g => g.type === 'vertical' && g.axisCoord === 670);
assert.ok(vPlacementGuide, 'Must render vertical guide at Left Chest center (670px)');
assert.equal(vPlacementGuide.startCoord, 220, 'Vertical guide start must be bounded inside Left Chest top (220)');
assert.equal(vPlacementGuide.endCoord, 480, 'Vertical guide end must be bounded inside Left Chest bottom (480)');

const hPlacementGuide = leftChestResult.guidelines.find(g => g.type === 'horizontal' && g.axisCoord === 350);
assert.ok(hPlacementGuide, 'Must render horizontal guide at Left Chest center (350px)');
assert.equal(hPlacementGuide.startCoord, 560, 'Horizontal guide start must be bounded inside Left Chest left (560)');
assert.equal(hPlacementGuide.endCoord, 780, 'Horizontal guide end must be bounded inside Left Chest right (780)');

// B. Near left edge of Left Chest
const stickerNearEdge: ObjectBounds = {
  left: 562, // 2px from 560
  top: 298,
  width: 100,
  height: 100,
  id: 'sticker-edge',
};
const edgeResult = computeSmartSnapping(stickerNearEdge, [], canvasWidth, canvasHeight, {
  printZone: leftChestZone,
});
assert.equal(edgeResult.snappedX, true, 'Must snap to Left Chest left boundary (560)');
assert.equal(edgeResult.deltaX, -2, 'Must adjust -2px to align left edge at 560');
const edgeGuide = edgeResult.guidelines.find(g => g.type === 'vertical' && g.axisCoord === 560);
assert.ok(edgeGuide, 'Must render edge guide at 560');
assert.equal(edgeGuide.startCoord, 220, 'Must be bounded inside Left Chest top (220)');
assert.equal(edgeGuide.endCoord, 480, 'Must be bounded inside Left Chest bottom (480)');

console.log('✓ Test 8 Passed: Print Placement Area (White Bounding Box) Snapping & Bounded Guidelines Verified');

// =========================================================================
// TEST 9: 4-Quadrant Snapping (2x2 Grid) & 4-Quadrant Divider Lines inside Placement Box
// =========================================================================
// Top-Left Quadrant center: X = 560 + 220*0.25 = 615, Y = 220 + 260*0.25 = 285
// Placement Box main center dividers: X = 670, Y = 350
const topLeftCornerSticker: ObjectBounds = {
  left: 573,
  top: 243,
  width: 80,
  height: 80, // center = (613, 283), diff = +2 on X and +2 on Y from (615, 285)
  id: 'sticker-top-left-corner',
};
const qResult = computeSmartSnapping(topLeftCornerSticker, [], canvasWidth, canvasHeight, {
  printZone: leftChestZone,
});

assert.equal(qResult.snappedX, true, 'Must snap to Top-Left Quadrant horizontal center (615)');
assert.equal(qResult.snappedY, true, 'Must snap to Top-Left Quadrant vertical center (285)');
assert.equal(qResult.deltaX, 2, 'Must adjust +2px to align center at 615');
assert.equal(qResult.deltaY, 2, 'Must adjust +2px to align center at 285');

// Check Quadrant center guidelines
const vQGuide = qResult.guidelines.find(g => g.type === 'vertical' && g.axisCoord === 615);
assert.ok(vQGuide, 'Must render vertical quadrant guideline at 615');
assert.equal(vQGuide.guideType, 'zone-center');
assert.equal(vQGuide.startCoord, 220);
assert.equal(vQGuide.endCoord, 480);

const hQGuide = qResult.guidelines.find(g => g.type === 'horizontal' && g.axisCoord === 285);
assert.ok(hQGuide, 'Must render horizontal quadrant guideline at 285');
assert.equal(hQGuide.guideType, 'zone-center');
assert.equal(hQGuide.startCoord, 560);
assert.equal(hQGuide.endCoord, 780);

// Check 4-Quadrant Divider lines (dividing the placement box into 4 equal quarters)
const vDivider = qResult.guidelines.find(g => g.type === 'vertical' && g.axisCoord === 670 && g.guideType === 'zone-divider');
assert.ok(vDivider, 'Must render vertical 4-quadrant divider line down the middle of the placement box (670)');
assert.equal(vDivider.startCoord, 220);
assert.equal(vDivider.endCoord, 480);

const hDivider = qResult.guidelines.find(g => g.type === 'horizontal' && g.axisCoord === 350 && g.guideType === 'zone-divider');
assert.ok(hDivider, 'Must render horizontal 4-quadrant divider line across the middle of the placement box (350)');
assert.equal(hDivider.startCoord, 560);
assert.equal(hDivider.endCoord, 780);

console.log('✓ Test 9 Passed: 4-Quadrant Snapping (2x2 Grid) & 4-Quadrant Dividers Verified');

console.log('========================================================================');
console.log('ALL 9 UPGRADED SMART GUIDES & PANORAMA TESTS PASSED! 🎯');
console.log('========================================================================');
