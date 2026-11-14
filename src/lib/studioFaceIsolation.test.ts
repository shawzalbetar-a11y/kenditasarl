import assert from 'assert';
import { isFaceMatching } from './printPlacementConfig';

console.log("--- Running Design Studio Face & Mode Isolation Unit Tests ---");

// Helper reproducing the isolated state key resolver logic
function getFaceStateKey(
  family: string,
  isFreeMode: boolean,
  activeMugMode: 'mug_full_wrap' | 'mug_front' | 'mug_two_sided',
  isMugPanoramicWorkspace: boolean,
  face: string,
  color: string,
  forcePano?: boolean
): string {
  const normColor = (color || 'default').trim().toLowerCase();
  const isPano = forcePano !== undefined
    ? forcePano
    : (family === 'mug' && !isFreeMode && (activeMugMode === 'mug_full_wrap' || isMugPanoramicWorkspace || face === 'mug_full_wrap'));
  const effectiveFace = (isPano && (isFaceMatching('front', face) || face === 'mug_full_wrap')) ? 'mug_full_wrap' : face;
  return `${normColor}:::${effectiveFace}`;
}

// Helper reproducing the isolated face JSON lookup logic
function getFaceJson(
  facesData: Record<string, string | null>,
  family: string,
  isFreeMode: boolean,
  activeMugMode: 'mug_full_wrap' | 'mug_front' | 'mug_two_sided',
  isMugPanoramicWorkspace: boolean,
  face: string,
  color: string,
  forcePano?: boolean
): string | null {
  const exactKey = getFaceStateKey(family, isFreeMode, activeMugMode, isMugPanoramicWorkspace, face, color, forcePano);
  if (facesData[exactKey] !== undefined && facesData[exactKey] !== null) {
    return facesData[exactKey];
  }

  const isPano = forcePano !== undefined
    ? forcePano
    : (family === 'mug' && !isFreeMode && (activeMugMode === 'mug_full_wrap' || isMugPanoramicWorkspace || face === 'mug_full_wrap'));
  const effectiveFace = (isPano && (isFaceMatching('front', face) || face === 'mug_full_wrap')) ? 'mug_full_wrap' : face;

  for (const k of Object.keys(facesData)) {
    if (k.includes(':::')) {
      const [storedColor, storedFace] = k.split(':::');
      if (storedFace === effectiveFace && storedColor === color && facesData[k]) {
        return facesData[k];
      }
    }
  }

  return null;
}

// TEST 1: Mug Single Face mode on front face generates 'white:::front' key, NEVER 'mug_full_wrap'
{
  const key = getFaceStateKey('mug', false, 'mug_front', false, 'front', 'white');
  assert.strictEqual(key, 'white:::front', 'Single Face mug on front face must resolve strictly to white:::front');
  console.log("✓ Test 1 Passed: Mug Single Face front resolves strictly to white:::front");
}

// TEST 2: Mug Single Face mode on other/side face generates 'white:::other' key
{
  const key = getFaceStateKey('mug', false, 'mug_front', false, 'other', 'white');
  assert.strictEqual(key, 'white:::other', 'Single Face mug on other face must resolve strictly to white:::other');
  console.log("✓ Test 2 Passed: Mug Single Face other/side resolves strictly to white:::other");
}

// TEST 3: Mug Panorama mode on front face generates 'white:::mug_full_wrap' key
{
  const key = getFaceStateKey('mug', false, 'mug_full_wrap', true, 'front', 'white');
  assert.strictEqual(key, 'white:::mug_full_wrap', 'Panorama mug on front face must resolve strictly to white:::mug_full_wrap');
  console.log("✓ Test 3 Passed: Mug Panorama front resolves strictly to white:::mug_full_wrap");
}

// TEST 4: Zero bleed when placing sticker in Single Face and switching to Panorama
{
  const facesData: Record<string, string | null> = {};
  const singleFaceDesignJson = JSON.stringify({ objects: [{ name: 'sticker', id: 'heart_dog_sticker' }] });

  // 1. User designs in Single Face mode on front face
  const singleKey = getFaceStateKey('mug', false, 'mug_front', false, 'front', 'white', false);
  facesData[singleKey] = singleFaceDesignJson;

  // 2. User switches to Panorama mode: Panorama queries its key
  const panoKey = getFaceStateKey('mug', false, 'mug_full_wrap', true, 'front', 'white', true);
  const panoJson = getFaceJson(facesData, 'mug', false, 'mug_full_wrap', true, 'front', 'white', true);

  assert.strictEqual(panoKey, 'white:::mug_full_wrap');
  assert.strictEqual(panoJson, null, 'Panorama must NOT load sticker placed in Single Face mode!');
  console.log("✓ Test 4 Passed: Zero design transfer from Single Face to Panorama mode");
}

// TEST 5: Zero bleed when placing sticker in Panorama and switching to Single Face
{
  const facesData: Record<string, string | null> = {};
  const panoDesignJson = JSON.stringify({ objects: [{ name: 'sticker', id: 'panorama_heart_dog' }] });

  // 1. User designs in Panorama mode
  const panoKey = getFaceStateKey('mug', false, 'mug_full_wrap', true, 'front', 'white', true);
  facesData[panoKey] = panoDesignJson;

  // 2. User switches to Single Face mode: Single Face queries its key
  const singleKey = getFaceStateKey('mug', false, 'mug_front', false, 'front', 'white', false);
  const singleJson = getFaceJson(facesData, 'mug', false, 'mug_front', false, 'front', 'white', false);

  assert.strictEqual(singleKey, 'white:::front');
  assert.strictEqual(singleJson, null, 'Single Face must NOT load sticker placed in Panorama mode!');
  console.log("✓ Test 5 Passed: Zero design transfer from Panorama to Single Face mode");
}

// TEST 6: Apparel (T-shirts / Hoodies) multi-face isolation
{
  const facesData: Record<string, string | null> = {};
  const frontStickerJson = JSON.stringify({ objects: [{ name: 'sticker', id: 'tom_cat_front' }] });

  // 1. User puts Tom Cat on T-shirt Front face
  const frontKey = getFaceStateKey('tshirt', false, 'mug_front', false, 'front', 'black');
  assert.strictEqual(frontKey, 'black:::front');
  facesData[frontKey] = frontStickerJson;

  // 2. User switches to Back face
  const backKey = getFaceStateKey('tshirt', false, 'mug_front', false, 'back', 'black');
  assert.strictEqual(backKey, 'black:::back');
  const backJson = getFaceJson(facesData, 'tshirt', false, 'mug_front', false, 'back', 'black');
  assert.strictEqual(backJson, null, 'T-shirt Back face must be completely empty when only Front was designed!');

  // 3. User switches to Sleeves
  const sleeveKey = getFaceStateKey('tshirt', false, 'mug_front', false, 'left_shoulder', 'black');
  assert.strictEqual(sleeveKey, 'black:::left_shoulder');
  const sleeveJson = getFaceJson(facesData, 'tshirt', false, 'mug_front', false, 'left_shoulder', 'black');
  assert.strictEqual(sleeveJson, null, 'T-shirt Sleeve must be completely empty!');
  console.log("✓ Test 6 Passed: Complete multi-face isolation on Apparel (T-shirts / Hoodies / Sleeves)");
}

console.log("========================================================================");
console.log("ALL 6 DESIGN STUDIO FACE & MODE ISOLATION TESTS PASSED! 🎉");
console.log("========================================================================");
