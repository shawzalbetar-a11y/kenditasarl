export const CATEGORY_TRANSLATIONS: Record<string, { ar: string; tr: string; en: string }> = {
  'all': { ar: 'الكل', tr: 'Tümü', en: 'All' },
  'الكل': { ar: 'الكل', tr: 'Tümü', en: 'All' },
  'جميع الأقسام': { ar: 'جميع الأقسام', tr: 'Tüm Kategoriler', en: 'All Categories' },
  'تصاميم عربية': { ar: 'تصاميم عربية', tr: 'Arapça Tasarımlar', en: 'Arabic Designs' },
  'خطوط وعبارات': { ar: 'خطوط وعبارات', tr: 'Kaligrafi ve Yazılar', en: 'Typography & Quotes' },
  'خطوط عربية': { ar: 'خطوط عربية', tr: 'Arapça Kaligrafi', en: 'Arabic Calligraphy' },
  'عبارات': { ar: 'عبارات', tr: 'Yazılar & Sözler', en: 'Quotes & Typography' },
  'رياضة': { ar: 'رياضة', tr: 'Spor', en: 'Sports' },
  'حيوانات': { ar: 'حيوانات', tr: 'Hayvanlar', en: 'Animals' },
  'مضحك': { ar: 'مضحك', tr: 'Komik', en: 'Funny' },
  'رموز وإيموجي': { ar: 'رموز وإيموجي', tr: 'Emojiler ve Simgeler', en: 'Symbols & Emojis' },
  'إيموجي': { ar: 'إيموجي', tr: 'Emojiler', en: 'Emojis' },
  'أخرى': { ar: 'أخرى', tr: 'Diğer', en: 'Other' },
  'عام': { ar: 'عام', tr: 'Genel', en: 'General' },
  'زخارف': { ar: 'زخارف', tr: 'Motifler', en: 'Ornaments' },
  'زخارف إسلامية': { ar: 'زخارف إسلامية', tr: 'İslami Motifler', en: 'Islamic Ornaments' },
  'طبيعة': { ar: 'طبيعة', tr: 'Doğa', en: 'Nature' },
  'موسيقى': { ar: 'موسيقى', tr: 'Müzik', en: 'Music' },
  'سيارات': { ar: 'سيارات', tr: 'Arabalar', en: 'Cars' },
  'ألعاب': { ar: 'ألعاب', tr: 'Oyun', en: 'Gaming' },
  'أفلام ومسلسلات': { ar: 'أفلام ومسلسلات', tr: 'Film & Dizi', en: 'Movies & Series' },
  'طعام ومشروبات': { ar: 'طعام ومشروبات', tr: 'Yiyecek & İçecek', en: 'Food & Drinks' },
  'حب وعاطفة': { ar: 'حب وعاطفة', tr: 'Aşk & Sevgi', en: 'Love & Romance' },
  'سفر ومعالم': { ar: 'سفر ومعالم', tr: 'Seyahat & Yapılar', en: 'Travel & Landmarks' },
  'أطفال': { ar: 'أطفال', tr: 'Çocuk', en: 'Kids' },
  'فن تجريدي': { ar: 'فن تجريدي', tr: 'Soyut Sanat', en: 'Abstract Art' },
};

export function getCategoryLocalizedName(
  category: { id?: string; name: string; name_ar?: string; name_tr?: string; name_en?: string } | string,
  locale: string = 'ar'
): string {
  if (!category) return '';

  const catObj = typeof category === 'string' ? { name: category } : category;
  const rawName = catObj.name || '';

  // 1. If category object has explicit translation for the requested locale
  if (locale === 'tr' && catObj.name_tr) return catObj.name_tr;
  if (locale === 'en' && catObj.name_en) return catObj.name_en;
  if (locale === 'ar' && catObj.name_ar) return catObj.name_ar;

  // 2. Check in standard translations dictionary
  const normalized = rawName.trim().toLowerCase();
  
  // Direct match in dictionary
  if (CATEGORY_TRANSLATIONS[rawName]) {
    const entry = CATEGORY_TRANSLATIONS[rawName];
    return locale === 'tr' ? entry.tr : locale === 'en' ? entry.en : entry.ar;
  }

  // Reverse search through dictionary (e.g. if rawName is in English or Turkish)
  for (const key of Object.keys(CATEGORY_TRANSLATIONS)) {
    const entry = CATEGORY_TRANSLATIONS[key];
    if (
      entry.ar.toLowerCase() === normalized ||
      entry.tr.toLowerCase() === normalized ||
      entry.en.toLowerCase() === normalized ||
      key.toLowerCase() === normalized
    ) {
      return locale === 'tr' ? entry.tr : locale === 'en' ? entry.en : entry.ar;
    }
  }

  // 3. Fallback to name for current locale or raw name
  if (locale === 'tr') return catObj.name_tr || catObj.name_en || rawName;
  if (locale === 'en') return catObj.name_en || catObj.name_tr || rawName;
  return catObj.name_ar || rawName;
}
