import assert from 'node:assert/strict';
import {
  calculateImageAspectRatio,
  detectImageOrientation,
  validateImageMimeType,
  validateImageAspectRatio,
  validateImageOrientation,
  validateImageDimensions,
  validateProductImage,
  DEFAULT_TSHIRT_CONTRACT,
  DEFAULT_MUG_CONTRACT,
  DEFAULT_HAT_CONTRACT,
  IMAGE_ERROR_CODES,
  ProductImageContract,
} from './imageContract';

console.log('--- Running imageContract Unit Tests ---');

// 1. Valid Portrait Image
{
  const result = validateProductImage({ width: 2400, height: 3000 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, true, 'Valid 2400x3000 portrait PNG should pass');
  assert.equal(result.errors.length, 0);
  assert.equal(result.metadata?.orientation, 'portrait');
  assert.equal(result.metadata?.aspectRatio, 0.8);
  console.log('✓ Test 1 Passed: Valid Portrait Image');
}

// 2. Valid Landscape Image (Mug Wrap)
{
  const result = validateProductImage({ width: 2400, height: 1200 }, 'image/webp', DEFAULT_MUG_CONTRACT, 'wrap');
  assert.equal(result.valid, true, 'Valid 2400x1200 landscape WebP should pass Mug contract');
  assert.equal(result.errors.length, 0);
  assert.equal(result.metadata?.orientation, 'landscape');
  assert.equal(result.metadata?.aspectRatio, 2.0);
  console.log('✓ Test 2 Passed: Valid Landscape Image');
}

// 3. Valid Square Image (Hat Front)
{
  const result = validateProductImage({ width: 1500, height: 1500 }, 'image/jpeg', DEFAULT_HAT_CONTRACT, 'front');
  assert.equal(result.valid, true, 'Valid 1500x1500 square JPEG should pass Hat contract');
  assert.equal(result.errors.length, 0);
  assert.equal(result.metadata?.orientation, 'square');
  assert.equal(result.metadata?.aspectRatio, 1.0);
  console.log('✓ Test 3 Passed: Valid Square Image');
}

// 4. Invalid MIME Type (e.g. image/gif or application/pdf)
{
  const result = validateProductImage({ width: 2000, height: 2500 }, 'image/gif', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false, 'GIF MIME type should be rejected');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_MIME_TYPE));
  console.log('✓ Test 4 Passed: Invalid MIME Type');
}

// 5. MIME Case-Insensitivity & Whitespace
{
  const result = validateImageMimeType('  IMAGE/PNG  ', ['image/png', 'image/jpeg']);
  assert.equal(result.valid, true, 'Uppercase/whitespace MIME should be normalized and accepted');
  console.log('✓ Test 5 Passed: MIME Case-Insensitivity');
}

// 6. Width Below Minimum (1999 vs 2000)
{
  const result = validateProductImage({ width: 1999, height: 2500 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false, 'Width 1999 should fail min width requirement');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.MIN_WIDTH_FAILED));
  console.log('✓ Test 6 Passed: Width Below Minimum');
}

// 7. Height Below Minimum (2499 vs 2500)
{
  const result = validateProductImage({ width: 2000, height: 2499 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false, 'Height 2499 should fail min height requirement');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.MIN_HEIGHT_FAILED));
  console.log('✓ Test 7 Passed: Height Below Minimum');
}

// 8. Width Above Maximum
{
  const contractWithMax: ProductImageContract = {
    version: 1,
    allowedMimeTypes: ['image/png'],
    faces: {
      front: { enabled: true, maxWidth: 3000 },
    },
  };
  const result = validateProductImage({ width: 3500, height: 2000 }, 'image/png', contractWithMax, 'front');
  assert.equal(result.valid, false, 'Width 3500 should fail maxWidth 3000');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.MAX_WIDTH_FAILED));
  console.log('✓ Test 8 Passed: Width Above Maximum');
}

// 9. Height Above Maximum
{
  const contractWithMax: ProductImageContract = {
    version: 1,
    allowedMimeTypes: ['image/png'],
    faces: {
      front: { enabled: true, maxHeight: 3000 },
    },
  };
  const result = validateProductImage({ width: 2000, height: 3500 }, 'image/png', contractWithMax, 'front');
  assert.equal(result.valid, false, 'Height 3500 should fail maxHeight 3000');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.MAX_HEIGHT_FAILED));
  console.log('✓ Test 9 Passed: Height Above Maximum');
}

// 10. Minimum Pixel Count Failure
{
  const contractWithPixels: ProductImageContract = {
    version: 1,
    allowedMimeTypes: ['image/png'],
    faces: {
      front: { enabled: true, minPixels: 6000000 }, // 6 MP
    },
  };
  // 2000 x 2500 = 5,000,000 (5 MP) -> fails 6 MP requirement
  const result = validateProductImage({ width: 2000, height: 2500 }, 'image/png', contractWithPixels, 'front');
  assert.equal(result.valid, false, '5MP image should fail 6MP minPixels requirement');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.MIN_PIXELS_FAILED));
  console.log('✓ Test 10 Passed: Minimum Pixel Count Failure');
}

// 11. Correct Aspect Ratio (3200x4000 = 0.8)
{
  const ratioResult = validateImageAspectRatio(3200, 4000, 0.8, 0.01);
  assert.equal(ratioResult.valid, true, '3200x4000 aspect ratio should match 0.8 exactly');
  assert.equal(ratioResult.actualRatio, 0.8);
  console.log('✓ Test 11 Passed: Correct Aspect Ratio');
}

// 12. Aspect Ratio Outside Tolerance (3200x3000 = 1.0667 vs 0.8)
{
  const result = validateProductImage({ width: 3200, height: 3000 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false, '3200x3000 should fail aspect ratio (1.0667 vs expected 0.8)');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_ASPECT_RATIO));
  console.log('✓ Test 12 Passed: Aspect Ratio Outside Tolerance');
}

// 13. Correct Orientation Detection
{
  assert.equal(detectImageOrientation(2000, 3000), 'portrait');
  assert.equal(detectImageOrientation(3000, 2000), 'landscape');
  assert.equal(detectImageOrientation(2000, 2000), 'square');
  console.log('✓ Test 13 Passed: Correct Orientation Detection');
}

// 14. Wrong Orientation (Landscape when Portrait is expected)
{
  const result = validateProductImage({ width: 4000, height: 3200 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false, 'Landscape image should fail portrait requirement');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_ORIENTATION));
  console.log('✓ Test 14 Passed: Wrong Orientation');
}

// 15. Zero Width
{
  const result = validateProductImage({ width: 0, height: 2500 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false, 'Zero width must fail');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_WIDTH));
  console.log('✓ Test 15 Passed: Zero Width');
}

// 16. Zero Height
{
  const result = validateProductImage({ width: 2000, height: 0 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false, 'Zero height must fail');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_HEIGHT));
  console.log('✓ Test 16 Passed: Zero Height');
}

// 17. Negative Width
{
  const result = validateProductImage({ width: -500, height: 2500 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false, 'Negative width must fail');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_WIDTH));
  console.log('✓ Test 17 Passed: Negative Width');
}

// 18. Negative Height
{
  const result = validateProductImage({ width: 2000, height: -500 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false, 'Negative height must fail');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_HEIGHT));
  console.log('✓ Test 18 Passed: Negative Height');
}

// 19. Unknown Face
{
  const result = validateProductImage({ width: 2000, height: 2500 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'sleeve_custom');
  assert.equal(result.valid, false, 'Unconfigured face must fail');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.FACE_NOT_CONFIGURED));
  console.log('✓ Test 19 Passed: Unknown Face');
}

// 20. Disabled Face
{
  const contractWithDisabled: ProductImageContract = {
    version: 1,
    allowedMimeTypes: ['image/png'],
    faces: {
      left: { enabled: false },
    },
  };
  const result = validateProductImage({ width: 2000, height: 2500 }, 'image/png', contractWithDisabled, 'left');
  assert.equal(result.valid, false, 'Disabled face must fail');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.FACE_DISABLED));
  console.log('✓ Test 20 Passed: Disabled Face');
}

// 21. Required Face Validation
{
  assert.equal(DEFAULT_TSHIRT_CONTRACT.faces.front.required, true, 'Front face is required for T-shirt');
  assert.equal(DEFAULT_TSHIRT_CONTRACT.faces.back.required, false, 'Back face is optional for T-shirt');
  console.log('✓ Test 21 Passed: Required Face Flag');
}

// 22. Multiple Simultaneous Errors (Bad MIME + Negative Width + Zero Height)
{
  const result = validateProductImage({ width: -100, height: 0 }, 'application/pdf', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_MIME_TYPE), 'Should flag MIME');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_WIDTH), 'Should flag negative width');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_HEIGHT), 'Should flag zero height');
  console.log('✓ Test 22 Passed: Multiple Simultaneous Errors');
}

// 23. Metadata Returned Correctly
{
  const result = validateProductImage({ width: 2000, height: 2500 }, 'image/jpeg', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.deepEqual(result.metadata, {
    width: 2000,
    height: 2500,
    aspectRatio: 0.8,
    orientation: 'portrait',
    mimeType: 'image/jpeg',
  });
  console.log('✓ Test 23 Passed: Metadata Accuracy');
}

// 24. Exact Boundary Values Accepted (2000x2500 = exactly minWidth and minHeight)
{
  const result = validateProductImage({ width: 2000, height: 2500 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, true, 'Exact min boundary 2000x2500 must PASS');
  assert.equal(result.errors.length, 0);
  console.log('✓ Test 24 Passed: Exact Boundary Values Accepted');
}

// 25. Boundary Just Outside Rejected (1999x2500 -> FAIL)
{
  const result = validateProductImage({ width: 1999, height: 2500 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, false, '1999x2500 must FAIL minWidth check');
  assert.ok(result.errors.some(e => e.code === IMAGE_ERROR_CODES.MIN_WIDTH_FAILED));
  console.log('✓ Test 25 Passed: Boundary Just Outside Rejected');
}

// 26. High-Res Scaling Test (3200x4000 = PASS)
{
  const result = validateProductImage({ width: 3200, height: 4000 }, 'image/png', DEFAULT_TSHIRT_CONTRACT, 'front');
  assert.equal(result.valid, true, 'High resolution 3200x4000 with 0.8 ratio must PASS');
  console.log('✓ Test 26 Passed: High-Res Scaled Image');
}

// 27. Mug Panoramic Wrap Aspect Ratio Tolerance
{
  // Expected: 2.0 (±0.05). Test 2400x1220 = 1.9672 (within tolerance 2.0 ± 0.05)
  const resultPass = validateProductImage({ width: 2400, height: 1220 }, 'image/png', DEFAULT_MUG_CONTRACT, 'wrap');
  assert.equal(resultPass.valid, true, '2400x1220 ratio 1.9672 is within tolerance ±0.05');

  // Test 2400x1100 = 2.1818 (outside tolerance 2.0 ± 0.05)
  const resultFail = validateProductImage({ width: 2400, height: 1100 }, 'image/png', DEFAULT_MUG_CONTRACT, 'wrap');
  assert.equal(resultFail.valid, false, '2400x1100 ratio 2.1818 is outside tolerance ±0.05');
  assert.ok(resultFail.errors.some(e => e.code === IMAGE_ERROR_CODES.INVALID_ASPECT_RATIO));
  console.log('✓ Test 27 Passed: Mug Aspect Ratio Tolerance');
}

console.log('\n========================================');
console.log('ALL 27 IMAGE CONTRACT TESTS PASSED!');
console.log('========================================\n');
