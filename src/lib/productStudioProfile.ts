export type ProductFamily = 'apparel' | 'mug' | 'hat' | 'phone_case' | 'generic';

export type NormalizedPlacementProductType =
  | 'tshirt'
  | 'hoodie'
  | 'sweatshirt'
  | 'mug'
  | 'hat'
  | 'phone_case'
  | 'generic';

export interface ProductStudioProfile {
  family: ProductFamily;
  normalizedPlacementType: NormalizedPlacementProductType;
  hasApparelSizes: boolean;
  hasGarmentSizeGuide: boolean;
  hasSleeves: boolean;
  hasCollarOffset: boolean;
  defaultVariantSizes: string[];
  defaultSelectedSize: string;
  getColorFieldLabel: (locale: string) => string;
  getBasePriceLabel: (locale: string) => string;
  getQuantitySectionLabel: (locale: string) => string;
  getMultiVariantButtonLabel: (locale: string, totalQty: number, activeCount: number) => string;
  getMobileVariantTabLabel: (locale: string) => string;
  getTopBarVariantButtonLabel: (locale: string, totalQty: number, activeCount: number) => string;
  getAiDescription: (locale: string) => string;
  getDpiTipDescription: (locale: string) => string;
  getPlacementGuideSubtitle: (locale: string) => string;
  getPrintSurfaceNoun: (locale: string) => string;
}

const APP_MUG_TOKENS = ['mug', 'mugs', 'cup', 'cups', 'kupa', 'كوب', 'أكواب'];
const APP_HAT_TOKENS = ['hat', 'hats', 'cap', 'caps', 'şapka', 'sapka', 'قبعة', 'قبعات'];
const APP_PHONE_TOKENS = [
  'phone_case',
  'phone_cases',
  'phone-case',
  'phone-cases',
  'phonecase',
  'phone',
  'case',
  'cases',
  'kılıf',
  'kilif',
  'telefon',
  'غلاف',
  'أغلفة',
  'جراب',
  'كفر',
];
const APP_HOODIE_TOKENS = ['hoodie', 'hoodies', 'sweatshirt', 'sweatshirts', 'sweat', 'kapüşonlu', 'kapusonlu', 'هودي', 'سويت'];
const APP_SHIRT_TOKENS = ['tshirt', 'tshirts', 't-shirt', 't-shirts', 'tee', 'tees', 'shirt', 'tişört', 'tisort', 'تيشيرت'];

function matchesAnyToken(text: string, tokens: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return tokens.some((tok) => lower.includes(tok));
}

export function normalizeStudioProductType(productTypeOrCategory?: string): NormalizedPlacementProductType {
  const norm = (productTypeOrCategory || '').trim().toLowerCase();
  if (!norm) return 'tshirt';
  if (matchesAnyToken(norm, APP_MUG_TOKENS)) return 'mug';
  if (matchesAnyToken(norm, APP_HAT_TOKENS)) return 'hat';
  if (matchesAnyToken(norm, APP_PHONE_TOKENS)) return 'phone_case';
  if (matchesAnyToken(norm, APP_HOODIE_TOKENS)) return 'hoodie';
  if (matchesAnyToken(norm, APP_SHIRT_TOKENS)) return 'tshirt';
  if (norm === 'generic') return 'generic';
  return 'tshirt';
}

export function resolveProductFamily(productData?: any): ProductFamily {
  if (!productData) return 'apparel';

  const candidates = [
    productData?.config?.garmentType,
    productData?.config?.productType,
    productData?.category_id,
    productData?.category,
    productData?.productType,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());

  for (const cand of candidates) {
    if (matchesAnyToken(cand, APP_MUG_TOKENS)) return 'mug';
    if (matchesAnyToken(cand, APP_HAT_TOKENS)) return 'hat';
    if (matchesAnyToken(cand, APP_PHONE_TOKENS)) return 'phone_case';
    if (matchesAnyToken(cand, APP_HOODIE_TOKENS) || matchesAnyToken(cand, APP_SHIRT_TOKENS)) return 'apparel';
    if (cand === 'generic') return 'generic';
  }

  return 'apparel';
}

export function resolveProductStudioProfile(productData?: any): ProductStudioProfile {
  const family = resolveProductFamily(productData);

  const rawTypeHint =
    productData?.config?.garmentType ||
    productData?.config?.productType ||
    productData?.category_id ||
    productData?.category ||
    productData?.productType ||
    (family === 'apparel' ? 'tshirt' : family);

  const normalizedPlacementType =
    family === 'mug'
      ? 'mug'
      : family === 'hat'
        ? 'hat'
        : family === 'phone_case'
          ? 'phone_case'
          : family === 'generic'
            ? 'generic'
            : normalizeStudioProductType(String(rawTypeHint));

  const isHoodie = normalizedPlacementType === 'hoodie' || normalizedPlacementType === 'sweatshirt';
  const hasApparelSizes = family === 'apparel';

  return {
    family,
    normalizedPlacementType,
    hasApparelSizes,
    hasGarmentSizeGuide: family === 'apparel',
    hasSleeves: family === 'apparel',
    hasCollarOffset: family === 'apparel',
    defaultVariantSizes: hasApparelSizes ? ['S', 'M', 'L', 'XL', '2XL'] : ['Standard'],
    defaultSelectedSize: hasApparelSizes ? 'M' : 'Standard',

    getColorFieldLabel: (locale: string) => {
      if (family === 'mug') {
        return locale === 'tr' ? 'Kupa Rengi:' : locale === 'en' ? 'Mug Color:' : 'لون الكوب:';
      }
      if (family === 'hat') {
        return locale === 'tr' ? 'Şapka Rengi:' : locale === 'en' ? 'Hat Color:' : 'لون القبعة:';
      }
      if (family === 'phone_case') {
        return locale === 'tr' ? 'Kılıf Rengi:' : locale === 'en' ? 'Case Color:' : 'لون الغلاف:';
      }
      if (family === 'generic') {
        return locale === 'tr' ? 'Ürün Rengi:' : locale === 'en' ? 'Product Color:' : 'لون المنتج:';
      }
      if (isHoodie) {
        return locale === 'tr' ? 'Renk:' : locale === 'en' ? 'Color:' : 'لون الهودي:';
      }
      return locale === 'tr' ? 'Renk:' : locale === 'en' ? 'Color:' : 'لون التيشيرت:';
    },

    getBasePriceLabel: (locale: string) => {
      if (family === 'mug') {
        return locale === 'tr' ? 'Temel Kupa Fiyatı:' : locale === 'en' ? 'Base Mug Price:' : 'سعر الكوب الأساسي:';
      }
      if (family === 'hat') {
        return locale === 'tr' ? 'Temel Şapka Fiyatı:' : locale === 'en' ? 'Base Hat Price:' : 'سعر القبعة الأساسي:';
      }
      if (family === 'phone_case') {
        return locale === 'tr' ? 'Temel Kılıf Fiyatı:' : locale === 'en' ? 'Base Case Price:' : 'سعر الغلاف الأساسي:';
      }
      if (family === 'generic') {
        return locale === 'tr' ? 'Temel Ürün Fiyatı:' : locale === 'en' ? 'Base Product Price:' : 'سعر المنتج الأساسي:';
      }
      if (isHoodie) {
        return locale === 'tr' ? 'Temel Hoodie Fiyatı:' : locale === 'en' ? 'Base Hoodie Price:' : 'سعر الهودي الأساسي:';
      }
      return locale === 'tr' ? 'Temel Tişört Fiyatı:' : locale === 'en' ? 'Base Garment Price:' : 'سعر التيشيرت الأساسي:';
    },

    getQuantitySectionLabel: (locale: string) => {
      if (family === 'mug') {
        return locale === 'tr' ? 'Sipariş Adedi:' : locale === 'en' ? 'Quantity:' : 'الكمية المطلوبة:';
      }
      if (family === 'hat') {
        return locale === 'tr' ? 'Şapka Adedi (Standart Beden):' : locale === 'en' ? 'Quantity (One Size):' : 'الكمية (مقاس قياسي):';
      }
      if (family === 'phone_case') {
        return locale === 'tr' ? 'Kılıf Adedi:' : locale === 'en' ? 'Quantity:' : 'الكمية المطلوبة:';
      }
      return locale === 'tr' ? 'Adet:' : locale === 'en' ? 'Quantity:' : 'الكمية:';
    },

    getMultiVariantButtonLabel: (locale: string, totalQty: number, activeCount: number) => {
      if (activeCount > 1) {
        return locale === 'tr'
          ? `${totalQty} Adet (${activeCount} varyant)`
          : locale === 'en'
            ? `${totalQty} Pcs (${activeCount} variants)`
            : `${totalQty} قطع (${activeCount} خيارات)`;
      }
      if (!hasApparelSizes) {
        return locale === 'tr'
          ? 'Çoklu Renk & Adet Seçimi'
          : locale === 'en'
            ? 'Multi-Color & Quantity'
            : 'تعدد الألوان والكميات';
      }
      return locale === 'tr'
        ? 'Çoklu Beden & Adet Matrisi Seç'
        : locale === 'en'
          ? 'Multi-Size & Quantity Matrix'
          : 'تعدد المقاسات والكميات';
    },

    getMobileVariantTabLabel: (locale: string) => {
      if (!hasApparelSizes) {
        return locale === 'tr' ? 'Adet' : locale === 'en' ? 'Qty' : 'الكمية';
      }
      return locale === 'tr' ? 'Beden' : locale === 'en' ? 'Sizes' : 'المقاسات';
    },

    getTopBarVariantButtonLabel: (locale: string, totalQty: number, activeCount: number) => {
      if (activeCount > 1) {
        return locale === 'tr'
          ? `${totalQty} Adet Seçildi`
          : locale === 'en'
            ? `${totalQty} Pcs Selected`
            : `${totalQty} قطع مختارة`;
      }
      if (!hasApparelSizes) {
        return locale === 'tr'
          ? 'Adet & Renkler'
          : locale === 'en'
            ? 'Qty & Colors'
            : 'الكمية والألوان';
      }
      return locale === 'tr'
        ? 'Çoklu Beden & Adet'
        : locale === 'en'
          ? 'Multi-Size & Qty'
          : 'تعدد المقاسات والكميات';
    },

    getAiDescription: (locale: string) => {
      if (family === 'mug') {
        return locale === 'tr'
          ? 'Fikrinizi yazın, yapay zekamız kupanız için yüksek çözünürlüklü baskıya hazır şeffaf grafik hazırlasın.'
          : locale === 'en'
            ? 'Describe your idea and AI will generate an optimized transparent graphic for your mug.'
            : 'اكتب فكرتك أو الشعار الذي تتخيله، وسيقوم الذكاء الاصطناعي بتوليد رسمة عالية الدقة ومناسبة للطباعة على الكوب.';
      }
      if (family === 'hat') {
        return locale === 'tr'
          ? 'Fikrinizi yazın, yapay zekamız şapkanız için net hatlı şeffaf grafik hazırlasın.'
          : locale === 'en'
            ? 'Describe your idea and AI will generate a crisp transparent graphic tailored for your hat.'
            : 'اكتب فكرتك أو الشعار الذي تتخيله، وسيقوم الذكاء الاصطناعي بتوليد رسمة مفرغة وواضحة للطباعة على القبعة.';
      }
      if (family === 'phone_case') {
        return locale === 'tr'
          ? 'Fikrinizi yazın, yapay zekamız telefon kılıfınıza uygun yüksek çözünürlüklü tasarım hazırlasın.'
          : locale === 'en'
            ? 'Describe your idea and AI will generate a vibrant high-resolution graphic for your phone case.'
            : 'اكتب فكرتك أو التصميم الذي تتخيله، وسيقوم الذكاء الاصطناعي بتوليد رسمة مفرغة ومتناسقة لغلاف الهاتف.';
      }
      if (family === 'generic') {
        return locale === 'tr'
          ? 'Fikrinizi veya istediğiniz resmi yazın, yapay zekamız ürününüze uygun şeffaf vektör hazırlasın.'
          : locale === 'en'
            ? 'Describe your idea and AI will generate an optimized transparent graphic for your product.'
            : 'اكتب فكرتك أو الشعار الذي تتخيله، وسيقوم الذكاء الاصطناعي بتوليد رسمة مفرغة ومناسبة للطباعة الفورية.';
      }
      return locale === 'tr'
        ? 'Fikrinizi veya istediğiniz resmi yazın, yapay zekamız tişörtünüze uygun şeffaf vektör hazırlasın.'
        : locale === 'en'
          ? 'Describe your idea and AI will generate an optimized transparent graphic.'
          : 'اكتب فكرتك أو الشعار الذي تتخيله، وسيقوم الذكاء الاصطناعي بتوليد رسمة مفرغة ومناسبة للطباعة الفورية.';
    },

    getDpiTipDescription: (locale: string) => {
      if (!hasApparelSizes) {
        return locale === 'tr'
          ? 'Tasarımı baskı alanında büyüttüğünüzde piksel sayısı değişmediği için DPI düşer. Net bir sonuç için yüksek çözünürlüklü görseller tercih edin.'
          : locale === 'en'
            ? 'Enlarging an image on the print area reduces its DPI because the pixel count stays fixed. Use high-resolution files for razor-sharp output.'
            : 'كلما قمت بتكبير الصورة على سطح الطباعة ينخفض الـ DPI لأن عدد البكسلات ثابت. استخدم صوراً عالية الدقة للحصول على أوضح طباعة.';
      }
      return locale === 'tr'
        ? 'Tasarımı kumaş üzerinde büyüttüğünüzde piksel sayısı değişmediği için DPI düşer. Örneğin 30 cm genişlikte bir baskı için görselinizin en az 3500 piksel genişlikte olması önerilir.'
        : locale === 'en'
          ? 'Enlarging an image on the fabric reduces its DPI because the pixel count stays fixed. For example, a 30 cm print requires roughly 3500 pixels in width for ultra HD.'
          : 'كلما قمت بتكبير الصورة على القطعة ينخفض الـ DPI لأن عدد البكسلات ثابت. مثلاً لطول 30 سم تحتاج صورة بعرض 3500 بكسل على الأقل للحصول على دقة فائقة.';
    },

    getPlacementGuideSubtitle: (locale: string) => {
      if (family === 'mug') {
        return locale === 'tr'
          ? 'Kupa baskı alanları (360° tam çevre veya ön/arka yüz) ya da serbest yerleşim modu'
          : locale === 'en'
            ? 'Standard mug print zones (Full 360° Wrap or Front/Back) or free placement mode'
            : 'مواضع الطباعة القياسية للكوب (بانورامي 360° أو وجه/وجهين) أو وضع التصميم الحر';
      }
      if (family === 'hat') {
        return locale === 'tr'
          ? 'Şapka baskı alanları (ön panel, yan paneller, arka) ya da serbest yerleşim modu'
          : locale === 'en'
            ? 'Standard hat print zones (Front crown, Side panels, Back arch) or free mode'
            : 'مواضع الطباعة القياسية للقبعة (الواجهة، الجانبين، الخلف) أو وضع التصميم الحر';
      }
      if (family === 'phone_case') {
        return locale === 'tr'
          ? 'Telefon kılıfı baskı alanları ya da serbest yerleşim modu'
          : locale === 'en'
            ? 'Phone case full-back or safe-center print areas or free placement mode'
            : 'مواضع الطباعة المعتمدة لغلاف الهاتف أو وضع التصميم الحر';
      }
      return locale === 'tr'
        ? 'Standart onaylı baskı alanları veya serbest yerleşim modu'
        : locale === 'en'
          ? 'Standard approved placements or free design mode'
          : 'المواضع القياسية المعتمدة أو وضع التصميم الحر';
    },

    getPrintSurfaceNoun: (locale: string) => {
      if (family === 'mug') return locale === 'tr' ? 'Kupa Yüzeyi' : locale === 'en' ? 'Mug Surface' : 'سطح الكوب';
      if (family === 'hat') return locale === 'tr' ? 'Şapka Yüzeyi' : locale === 'en' ? 'Hat Surface' : 'سطح القبعة';
      if (family === 'phone_case') return locale === 'tr' ? 'Kılıf Yüzeyi' : locale === 'en' ? 'Case Surface' : 'سطح الغلاف';
      return locale === 'tr' ? 'Kumaş' : locale === 'en' ? 'Fabric' : 'القماش';
    },
  };
}

export { resolveMugMeta, type MugStyle, type MugMeta } from "./mugMeta";


