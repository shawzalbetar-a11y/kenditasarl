import { getExpandedProductsFromData } from './products';

export function testProductsExpansion() {
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
  if (expanded.length !== 3) {
    throw new Error(`Expected 3 items, got ${expanded.length}`);
  }
}
