export const COLOR_TRANSLATIONS: Record<string, { ar: string; tr: string; en: string }> = {
  white: { ar: 'أبيض', tr: 'Beyaz', en: 'White' },
  '#ffffff': { ar: 'أبيض', tr: 'Beyaz', en: 'White' },
  '#fff': { ar: 'أبيض', tr: 'Beyaz', en: 'White' },
  black: { ar: 'أسود', tr: 'Siyah', en: 'Black' },
  '#000000': { ar: 'أسود', tr: 'Siyah', en: 'Black' },
  '#000': { ar: 'أسود', tr: 'Siyah', en: 'Black' },
  navy: { ar: 'كحلي', tr: 'Lacivert', en: 'Navy' },
  '#1e3a8a': { ar: 'كحلي', tr: 'Lacivert', en: 'Navy' },
  '#1e40af': { ar: 'كحلي داكن', tr: 'Koyu Lacivert', en: 'Dark Navy' },
  '#000080': { ar: 'كحلي', tr: 'Lacivert', en: 'Navy' },
  red: { ar: 'أحمر', tr: 'Kırmızı', en: 'Red' },
  '#dc2626': { ar: 'أحمر', tr: 'Kırmızı', en: 'Red' },
  '#ef4444': { ar: 'أحمر فاتح', tr: 'Açık Kırmızı', en: 'Light Red' },
  '#991b1b': { ar: 'عنابي', tr: 'Bordo', en: 'Burgundy' },
  burgundy: { ar: 'عنابي', tr: 'Bordo', en: 'Burgundy' },
  gray: { ar: 'رمادي', tr: 'Gri', en: 'Gray' },
  grey: { ar: 'رمادي', tr: 'Gri', en: 'Gray' },
  '#4b5563': { ar: 'رمادي', tr: 'Gri', en: 'Gray' },
  '#374151': { ar: 'رمادي غامق', tr: 'Koyu Gri', en: 'Dark Gray' },
  '#1f2937': { ar: 'فحمي', tr: 'Antrasit', en: 'Charcoal' },
  '#9ca3af': { ar: 'رمادي فاتح', tr: 'Açık Gri', en: 'Light Gray' },
  '#e5e7eb': { ar: 'فضي', tr: 'Gümüş', en: 'Silver' },
  blue: { ar: 'أزرق', tr: 'Mavi', en: 'Blue' },
  '#2563eb': { ar: 'أزرق ملكي', tr: 'Kraliyet Mavisi', en: 'Royal Blue' },
  '#3b82f6': { ar: 'أزرق سماوي', tr: 'Açık Mavi', en: 'Sky Blue' },
  '#0284c7': { ar: 'أزرق بحري', tr: 'Deniz Mavisi', en: 'Ocean Blue' },
  green: { ar: 'أخضر', tr: 'Yeşil', en: 'Green' },
  '#16a34a': { ar: 'أخضر', tr: 'Yeşil', en: 'Green' },
  '#22c55e': { ar: 'أخضر زمردي', tr: 'Zümrüt Yeşili', en: 'Emerald Green' },
  '#065f46': { ar: 'زيتي', tr: 'Haki Yeşil', en: 'Olive Green' },
  '#14532d': { ar: 'أخضر غامق', tr: 'Koyu Yeşil', en: 'Dark Green' },
  yellow: { ar: 'أصفر', tr: 'Sarı', en: 'Yellow' },
  '#eab308': { ar: 'أصفر', tr: 'Sarı', en: 'Yellow' },
  '#facc15': { ar: 'أصفر ذهبي', tr: 'Altın Sarısı', en: 'Gold Yellow' },
  orange: { ar: 'برتقالي', tr: 'Turuncu', en: 'Orange' },
  '#ea580c': { ar: 'برتقالي', tr: 'Turuncu', en: 'Orange' },
  '#f97316': { ar: 'برتقالي مشرق', tr: 'Canlı Turuncu', en: 'Bright Orange' },
  purple: { ar: 'بنفسجي', tr: 'Mor', en: 'Purple' },
  '#9333ea': { ar: 'بنفسجي', tr: 'Mor', en: 'Purple' },
  '#7e22ce': { ar: 'أرجواني', tr: 'Koyu Mor', en: 'Deep Purple' },
  pink: { ar: 'وردي', tr: 'Pembe', en: 'Pink' },
  '#ec4899': { ar: 'وردي', tr: 'Pembe', en: 'Pink' },
  '#f472b6': { ar: 'زهري فاتح', tr: 'Açık Pembe', en: 'Light Pink' },
  beige: { ar: 'بيج', tr: 'Bej', en: 'Beige' },
  '#f5f5dc': { ar: 'بيج', tr: 'Bej', en: 'Beige' },
  '#d2b48c': { ar: 'بيج رملي', tr: 'Kum Beji', en: 'Tan' },
  brown: { ar: 'بني', tr: 'Kahverengi', en: 'Brown' },
  '#78350f': { ar: 'بني', tr: 'Kahverengi', en: 'Brown' },
  '#451a03': { ar: 'شوكولاتة', tr: 'Çikolata Kahve', en: 'Chocolate Brown' },
};

export function getLocalizedColorName(color: string, locale: string = 'ar'): string {
  if (!color) return '';
  const clean = color.trim().toLowerCase();
  const entry = COLOR_TRANSLATIONS[clean];
  if (entry) {
    if (locale.startsWith('tr')) return entry.tr;
    if (locale.startsWith('en')) return entry.en;
    return entry.ar;
  }
  return color;
}
