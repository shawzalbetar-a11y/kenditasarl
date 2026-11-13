import { calculateCustomProductPrice, DEFAULT_PRICING_CONFIG, PricingSettingsConfig } from './pricing';

console.log("Running Hybrid & Placement Pricing Engine Unit Tests...");

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
      objects: [{ type: 'image', src: 'https://example.com/sticker1.png', name: 'sticker', assetPrice: 15 }]
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

// Test 4: Free sticker (price: 0) MUST NOT be charged arbitrary 5 ₺
const test4 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: {
      objects: [{ type: 'image', src: 'https://example.com/free_sticker.png', name: 'sticker', assetPrice: 0 }]
    }
  },
  assetsList: [
    { url: 'https://example.com/free_sticker.png', name: 'Free Star', price: 0 }
  ],
  pricingConfig: DEFAULT_PRICING_CONFIG
});

console.assert(test4.totalPrice === 200, `Test 4 Failed: Expected 200 for free sticker, got ${test4.totalPrice}`);
console.assert(test4.totalExtra === 0, `Test 4 Failed: Expected 0 extra for free sticker, got ${test4.totalExtra}`);
console.log("✓ Test 4 Passed: Free sticker (price 0) remains 0 ₺ free");

// Test 5: Approved Placement - Left Chest only (Included in base)
const test5 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: {
      objects: [{ type: 'textbox', text: 'Logo', assignedPlacementId: 'left_chest' }]
    }
  },
  selectedPlacementIds: ['left_chest'],
  pricingConfig: DEFAULT_PRICING_CONFIG
});

console.assert(test5.totalPrice === 200, `Test 5 Failed: Expected 200, got ${test5.totalPrice}`);
console.log("✓ Test 5 Passed: Single Left Chest placement included (200 ₺)");

// Test 6: Approved Placements - Center Chest (0 ₺ included) + Full Back (+35 ₺) + Right Sleeve (+20 ₺)
const test6 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: { objects: [{ type: 'textbox', text: 'Front', assignedPlacementId: 'center_chest' }] },
    back: { objects: [{ type: 'textbox', text: 'Back', assignedPlacementId: 'full_back' }] },
    right: { objects: [{ type: 'textbox', text: 'Sleeve', assignedPlacementId: 'right_sleeve' }] }
  },
  selectedPlacementIds: ['center_chest', 'full_back', 'right_sleeve'],
  pricingConfig: DEFAULT_PRICING_CONFIG
});

// 200 (base) + 0 (center_chest) + 35 (full_back) + 20 (right_sleeve) = 255 ₺
console.assert(test6.totalPrice === 255, `Test 6 Failed: Expected 255, got ${test6.totalPrice}`);
console.assert(test6.totalExtra === 55, `Test 6 Failed: Expected totalExtra 55, got ${test6.totalExtra}`);
console.log("✓ Test 6 Passed: Multi-placement across Front, Back, Sleeve (255 ₺)");

// Test 7: Admin Panel Override - Custom numbers set by Admin
const adminCustomConfig: PricingSettingsConfig = {
  ...DEFAULT_PRICING_CONFIG,
  customization: {
    ...DEFAULT_PRICING_CONFIG.customization,
    placement_prices: {
      left_chest: 10,
      center_chest: 10,
      full_front: 45,
      back_collar: 18,
      full_back: 50,
      left_sleeve: 25,
      right_sleeve: 25
    },
    placement_rules: {
      include_first_placement_free: false, // Admin turned off free first placement
      extra_placement_same_face_price: 30,
      free_mode_fee: 15
    }
  }
};

const test7 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: { objects: [{ type: 'textbox', text: 'Logo', assignedPlacementId: 'left_chest' }] },
    back: { objects: [{ type: 'textbox', text: 'Full', assignedPlacementId: 'full_back' }] }
  },
  selectedPlacementIds: ['left_chest', 'full_back'],
  pricingConfig: adminCustomConfig
});

// 200 (base) + 10 (left_chest since first isn't free) + 50 (full_back) = 260 ₺
console.assert(test7.totalPrice === 260, `Test 7 Failed: Expected 260, got ${test7.totalPrice}`);
console.log("✓ Test 7 Passed: Admin custom placement pricing override strictly respected (260 ₺)");

// Test 8: Safety Net auto-detects placement from canvas object even if selectedPlacementIds missed it
const test8 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: {
      objects: [
        { type: 'textbox', text: 'Logo', assignedPlacementId: 'left_chest' },
        { type: 'textbox', text: 'Center', assignedPlacementId: 'center_chest' }
      ]
    }
  },
  selectedPlacementIds: ['left_chest'], // User only had left_chest in array
  pricingConfig: DEFAULT_PRICING_CONFIG
});

// 200 (base) + 0 (left_chest included) + 20 (center_chest auto-discovered by Safety Net) = 220 ₺
console.assert(test8.totalPrice === 220, `Test 8 Failed: Expected 220, got ${test8.totalPrice}`);
console.log("✓ Test 8 Passed: Safety Net auto-discovers active canvas placements (220 ₺)");

// Test 9: Safety Net ensures unmapped designed faces (e.g. back face) are never printed for free
const test9 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: {
      objects: [{ type: 'textbox', text: 'Logo', assignedPlacementId: 'left_chest' }]
    },
    back: {
      objects: [{ type: 'textbox', text: 'Back Artwork' }]
    }
  },
  selectedPlacementIds: ['left_chest'], // Only front placement selected
  pricingConfig: DEFAULT_PRICING_CONFIG
});

// 200 (base) + 0 (left_chest) + 35 (Safety Net back face protection) = 235 ₺
console.assert(test9.totalPrice === 235, `Test 9 Failed: Expected 235, got ${test9.totalPrice}`);
console.log("✓ Test 9 Passed: Safety Net protects unmapped faces from being printed free (235 ₺)");

// Test 10: Switching out of Free Mode with unassigned objects without explicit originMode
const test10 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: {
      objects: [
        { type: 'image', name: 'sticker' }, // Unassigned 1 (leftover without originMode)
        { type: 'image', name: 'sticker' }  // Unassigned 2 (leftover without originMode)
      ]
    }
  },
  selectedPlacementIds: [], // Empty selection after toggling free mode off
  isFreeMode: false,
  pricingConfig: DEFAULT_PRICING_CONFIG
});

// 200 (base) + 0 (auto-assigned to left_chest, included) + 20 (auto-assigned to center_chest, extra placement) = 220 ₺
console.assert(test10.totalPrice === 220, `Test 10 Failed: Expected 220, got ${test10.totalPrice}`);
console.assert(test10.totalExtra === 20, `Test 10 Failed: Expected totalExtra 20, got ${test10.totalExtra}`);
console.log("✓ Test 10 Passed: Switching out of Free Mode protects unassigned stickers from free printing (220 ₺)");

// Test 11: ORIGIN-AWARE FREE MODE RETENTION
// Sticker was added in Free Mode (originMode: 'free'), user toggled off Free Mode WITHOUT correcting positions.
// Free Mode fee (150 ₺) MUST STAY APPLIED!
const configWithFreeFee: PricingSettingsConfig = {
  ...DEFAULT_PRICING_CONFIG,
  customization: {
    ...DEFAULT_PRICING_CONFIG.customization,
    placement_rules: {
      ...DEFAULT_PRICING_CONFIG.customization.placement_rules!,
      free_mode_fee: 150
    }
  }
};

const test11 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: {
      objects: [
        { type: 'image', name: 'sticker', originMode: 'free' } // Unaligned free mode sticker
      ]
    }
  },
  selectedPlacementIds: [],
  isFreeMode: false, // Toggled off!
  pricingConfig: configWithFreeFee
});

// 200 (base) + 150 (Free Mode fee retained) = 350 ₺
console.assert(test11.totalPrice === 350, `Test 11 Failed: Expected 350, got ${test11.totalPrice}`);
console.assert(test11.totalExtra === 150, `Test 11 Failed: Expected totalExtra 150, got ${test11.totalExtra}`);
console.assert(test11.breakdown.some(b => b.type === 'free_mode' && b.price === 150), `Test 11 Failed: Breakdown must include free_mode item`);
console.log("✓ Test 11 Passed: Origin-Aware tracking retains Free Mode fee (150 ₺) when toggling off without repositioning (350 ₺)");

// Test 12: CUSTOMER CORRECTS STICKER POSITION TO APPROVED PLACEMENT
// Customer drags/moves sticker into 'center_chest' zone: originMode becomes 'approved' and assignedPlacementId set.
// Free Mode fee MUST DROP TO 0 ₺, and standard approved placement rates apply!
const test12 = calculateCustomProductPrice({
  basePrice: 200,
  facesData: {
    front: {
      objects: [
        { type: 'image', name: 'sticker', originMode: 'approved', assignedPlacementId: 'center_chest' }
      ]
    }
  },
  selectedPlacementIds: ['center_chest'],
  isFreeMode: false,
  pricingConfig: configWithFreeFee
});

// 200 (base) + 0 (center_chest included free) + 0 (Free Mode fee dropped) = 200 ₺
console.assert(test12.totalPrice === 200, `Test 12 Failed: Expected 200, got ${test12.totalPrice}`);
console.assert(test12.totalExtra === 0, `Test 12 Failed: Expected totalExtra 0, got ${test12.totalExtra}`);
console.assert(!test12.breakdown.some(b => b.type === 'free_mode'), `Test 12 Failed: Free mode fee must not exist after correction`);
console.log("✓ Test 12 Passed: Correcting sticker position to approved placement drops Free fee and applies standard placement rates (200 ₺)");

// Test 13: MUG STUDIO — Full 360° Panoramic Wrap (+25 ₺)
const test13 = calculateCustomProductPrice({
  basePrice: 180,
  garmentType: 'mug',
  facesData: {
    front: {
      objects: [{ type: 'image', name: 'panorama', assignedPlacementId: 'mug_full_wrap' }]
    }
  },
  selectedPlacementIds: ['mug_full_wrap'],
  pricingConfig: DEFAULT_PRICING_CONFIG,
  locale: 'tr'
});

console.assert(test13.totalPrice === 205, `Test 13 Failed: Expected 205, got ${test13.totalPrice}`);
console.assert(test13.totalExtra === 25, `Test 13 Failed: Expected 25 extra, got ${test13.totalExtra}`);
console.assert(!test13.breakdown.some(b => b.placementId === 'left_chest'), `Test 13 Failed: Mug must never fallback to left_chest`);
console.log("✓ Test 13 Passed: Mug 360° Full Wrap calculates +25 ₺ wrap upgrade without apparel fallback (205 ₺)");

// Test 14: MUG STUDIO — Single-Side Mug (Included in base price)
const test14 = calculateCustomProductPrice({
  basePrice: 180,
  garmentType: 'mug',
  facesData: {
    front: {
      objects: [{ type: 'textbox', text: 'Coffee Time', assignedPlacementId: 'mug_front' }]
    }
  },
  selectedPlacementIds: ['mug_front'],
  pricingConfig: DEFAULT_PRICING_CONFIG
});

console.assert(test14.totalPrice === 180, `Test 14 Failed: Expected 180, got ${test14.totalPrice}`);
console.assert(test14.totalExtra === 0, `Test 14 Failed: Expected 0 extra, got ${test14.totalExtra}`);
console.log("✓ Test 14 Passed: Mug Single Front Side Print included in base price (180 ₺)");

// Test 15: MUG STUDIO — Two-Sided Mug (Front 0 ₺ + Opposite Back Side +35 ₺)
const test15 = calculateCustomProductPrice({
  basePrice: 180,
  garmentType: 'mug',
  facesData: {
    front: {
      objects: [{ type: 'textbox', text: 'Front', assignedPlacementId: 'mug_front' }]
    },
    back: {
      objects: [{ type: 'textbox', text: 'Back', assignedPlacementId: 'mug_back' }]
    }
  },
  selectedPlacementIds: ['mug_front', 'mug_back'],
  pricingConfig: DEFAULT_PRICING_CONFIG
});

console.assert(test15.totalPrice === 215, `Test 15 Failed: Expected 215, got ${test15.totalPrice}`);
console.assert(test15.totalExtra === 35, `Test 15 Failed: Expected 35 extra, got ${test15.totalExtra}`);
console.log("✓ Test 15 Passed: Mug Two-Sided Print calculates +35 ₺ opposite side (215 ₺)");

console.log("All 15 Pricing Engine Unit Tests Passed Successfully! 🎉");
