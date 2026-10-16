import { getExpandedProductsFromData } from '../src/lib/products';

function runTests() {
  console.log("=== Testing getExpandedProductsFromData ===");

  const mockProduct = {
    id: 'prod_123',
    name_ar: 'تيشيرت قطن فاخر',
    name_en: 'Premium Cotton T-Shirt',
    name_tr: 'Premium Pamuk Tişört',
    base_price: 250,
    images: [
      { id: '1', url: 'https://cdn/white_front_ready.png', type: 'ready', face: 'front', colorHex: '#ffffff' },
      { id: '2', url: 'https://cdn/white_back_ready.png', type: 'ready', face: 'back', colorHex: '#ffffff' },
      { id: '3', url: 'https://cdn/white_front_blank.png', type: 'blank', face: 'front', colorHex: '#ffffff' },
      { id: '4', url: 'https://cdn/black_front_blank.png', type: 'blank', face: 'front', colorHex: '#000000' }
    ]
  };

  const expanded = getExpandedProductsFromData([mockProduct]);
  console.log(`Generated ${expanded.length} expanded products.`);
  
  if (expanded.length !== 3) {
    throw new Error(`Expected 3 expanded items, got ${expanded.length}`);
  }

  const readyWhite = expanded.find(p => p.id.includes('type=ready') && p.specificColor === '#ffffff');
  if (!readyWhite || readyWhite.media.front !== 'https://cdn/white_front_ready.png' || readyWhite.isCustomizable !== false) {
    throw new Error("Ready white item assertion failed: " + JSON.stringify(readyWhite));
  }
  console.log("✓ Ready white item verified");

  const blankWhite = expanded.find(p => p.id.includes('type=blank') && p.specificColor === '#ffffff');
  if (!blankWhite || blankWhite.media.front !== 'https://cdn/white_front_blank.png' || blankWhite.isCustomizable !== true) {
    throw new Error("Blank white item assertion failed: " + JSON.stringify(blankWhite));
  }
  console.log("✓ Blank white item verified");

  const blankBlack = expanded.find(p => p.id.includes('type=blank') && p.specificColor === '#000000');
  if (!blankBlack || blankBlack.media.front !== 'https://cdn/black_front_blank.png' || blankBlack.isCustomizable !== true) {
    throw new Error("Blank black item assertion failed: " + JSON.stringify(blankBlack));
  }
  console.log("✓ Blank black item verified");

  console.log("\nALL EXPANSION UNIT TESTS PASSED SUCCESSFULLY! ✅");
}

runTests();
