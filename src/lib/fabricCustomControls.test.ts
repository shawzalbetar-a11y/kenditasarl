import assert from 'node:assert/strict';
import {
  clampCornerControlsMap,
  clipPolygonToRect,
} from './fabricCustomControls';

// 1. Inside-bounds polygon stays completely intact
const innerBox = [
  { x: 200, y: 100 },
  { x: 600, y: 100 },
  { x: 600, y: 500 },
  { x: 200, y: 500 },
];
assert.deepEqual(
  clipPolygonToRect(innerBox, 4, 1836, 4, 756),
  innerBox,
  'Inner selection box must remain unchanged'
);

// 2. Top-overflowing sticker (y < 0) closes top border cleanly along minY=4
const topOverflowBox = [
  { x: 580, y: -60 },
  { x: 1260, y: -60 },
  { x: 1260, y: 720 },
  { x: 580, y: 720 },
];
const clippedTop = clipPolygonToRect(topOverflowBox, 4, 1836, 4, 756);
assert.equal(clippedTop.length, 4, 'Top-clipped box must preserve closed 4-vertex perimeter');
assert.ok(clippedTop.every((p) => p.y >= 4 && p.y <= 756), 'Clipped box must remain inside visible Y bounds');
assert.ok(
  clippedTop.some((p) => p.x === 580 && p.y === 4) &&
  clippedTop.some((p) => p.x === 1260 && p.y === 4),
  'Top border edge endpoints must lie cleanly on y=4'
);

// 3. Full-bleed overflowing sticker across all 4 panorama edges clamps to visible frame perimeter
const fullBleedOverflow = [
  { x: -120, y: -320 },
  { x: 1960, y: -320 },
  { x: 1960, y: 1080 },
  { x: -120, y: 1080 },
];
const clippedFull = clipPolygonToRect(fullBleedOverflow, 4, 1836, 4, 756);
assert.equal(clippedFull.length, 4, 'Full-bleed clipped box must have 4 corners');
for (const expectedPt of [
  { x: 4, y: 4 },
  { x: 1836, y: 4 },
  { x: 1836, y: 756 },
  { x: 4, y: 756 },
]) {
  assert.ok(
    clippedFull.some((p) => p.x === expectedPt.x && p.y === expectedPt.y),
    `Expected clipped corner ${JSON.stringify(expectedPt)}`
  );
}

// 4. Rotated diamond extending outside top border produces a valid 5-vertex clipped polygon
const rotatedDiamond = [
  { x: 920, y: -80 },
  { x: 1120, y: 120 },
  { x: 920, y: 320 },
  { x: 720, y: 120 },
];
const clippedRotated = clipPolygonToRect(rotatedDiamond, 4, 1836, 4, 756);
assert.equal(clippedRotated.length, 5, 'Rotated polygon clipped at one corner yields 5 vertices');
assert.ok(clippedRotated.every((p) => p.y >= 4 && p.x >= 4 && p.x <= 1836));

// 5. Corner controls clamping keeps all 4 handles visible inside canvas margins
const fullBleedCoords = {
  tl: { x: -100, y: -250 },
  tr: { x: 1940, y: -250 },
  bl: { x: -100, y: 1010 },
  br: { x: 1940, y: 1010 },
};
const fullFlags = clampCornerControlsMap(fullBleedCoords, 1840, 760, 44, 80);
assert.deepEqual(fullFlags, { tl: true, tr: true, bl: true, br: true });
assert.deepEqual(fullBleedCoords.tl, { x: 44, y: 44 });
assert.deepEqual(fullBleedCoords.tr, { x: 1796, y: 44 });
assert.deepEqual(fullBleedCoords.bl, { x: 44, y: 716 });
assert.deepEqual(fullBleedCoords.br, { x: 1796, y: 716 });

// 6. Clamped handles crowded near the right wall maintain minimum separation so icons never stack
const rightWallCrowded = {
  tl: { x: 1790, y: 180 },
  tr: { x: 2080, y: 180 },
  bl: { x: 1790, y: 540 },
  br: { x: 2080, y: 540 },
};
const rightFlags = clampCornerControlsMap(rightWallCrowded, 1840, 760, 44, 80);
assert.equal(rightFlags.tr, true);
assert.equal(rightFlags.br, true);
assert.equal(rightWallCrowded.tr.x, 1796);
assert.equal(rightWallCrowded.tl.x, 1716);
assert.equal(rightWallCrowded.br.x, 1796);
assert.equal(rightWallCrowded.bl.x, 1716);

console.log('✓ All 6 fabricCustomControls clipping & clamping unit tests passed!');
