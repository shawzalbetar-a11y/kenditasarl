import { calculateCustomProductPrice, DEFAULT_PRICING_CONFIG, PricingSettingsConfig } from './pricing';

console.log("Running Hybrid Pricing Engine Unit Tests...");

// Test 1: Single Front Face (Included in base price)
const test1 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: {
      objects: [{ type: 'textbox', text: 'Hello', name: 'text_1' }]
    }
  },
  pricingConfig: DEFAULT_PRICING_CONFIG
});

console.assert(test1.totalPrice === 200, `Test 1 Failed: Expected 200, got ${test1.totalPrice}`);
console.assert(test1.totalExtra === 0, `Test 1 Failed: Expected totalExtra 0, got ${test1.totalExtra}`);
console.log("✓ Test 1 Passed: Single Front Face included in base price (200 ₺)");

// Test 2: Front + Back Face (+35 ₺)
const test2 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: {
      objects: [{ type: 'textbox', text: 'Front Text', name: 'text_1' }]
    },
    back: {
      objects: [{ type: 'textbox', text: 'Back Text', name: 'text_2' }]
    }
  },
  pricingConfig: DEFAULT_PRICING_CONFIG
});

console.assert(test2.totalPrice === 235, `Test 2 Failed: Expected 235, got ${test2.totalPrice}`);
console.assert(test2.totalExtra === 35, `Test 2 Failed: Expected totalExtra 35, got ${test2.totalExtra}`);
console.log("✓ Test 2 Passed: Front + Back Face calculates extra fee (+35 ₺ = 235 ₺)");

// Test 3: Front + Back + Left Shoulder + Premium Sticker (+15 ₺)
const test3 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: {
      objects: [{ type: 'image', src: 'https://example.com/sticker1.png', name: 'sticker' }]
    },
    back: {
      objects: [{ type: 'textbox', text: 'Back Text', name: 'text_2' }]
    },
    left_shoulder: {
      objects: [{ type: 'textbox', text: 'Left Sleeve', name: 'text_3' }]
    }
  },
  assetsList: [
    { url: 'https://example.com/sticker1.png', name: 'Lion Premium', price: 15 }
  ],
  pricingConfig: DEFAULT_PRICING_CONFIG
});

// 200 (base) + 35 (back) + 20 (left) + 15 (sticker) = 270 ₺
console.assert(test3.totalPrice === 270, `Test 3 Failed: Expected 270, got ${test3.totalPrice}`);
console.assert(test3.totalExtra === 70, `Test 3 Failed: Expected totalExtra 70, got ${test3.totalExtra}`);
console.log("✓ Test 3 Passed: Multi-face + Premium sticker calculates total accurately (270 ₺)");

console.log("All Pricing Engine Unit Tests Passed Successfully! 🎉");
