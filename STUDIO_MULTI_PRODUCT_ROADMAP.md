# خارطة الطريق المرجعية لتوسعة استوديو التصميم («صمم بنفسك») متعدد المنتجات
## KENDİN TASARLA — Multi-Product Design Studio Master Roadmap (Mugs • Hats • Phone Cases)

> **الغرض من هذا الملف المرجعي الدائم (`.md`):**
> وثيقة هندسية وتنفيذية شاملة تُستخدم كمرجع موحّد بين المالك ووكلاء التطوير (Agents) عبر جلسات العمل المتعددة. كل مرحلة تُنفَّذ وتُختبر ثم تُعلَّم هنا بعلامة `[x]` لضمان استمرارية دقيقة بدون فقدان أي سياق أو كسر للمنتجات القائمة.

---

## 1. القرار المعماري الاستراتيجي: استوديو موحّد مدفوع بـ «ملف قدرات المنتج»

### هل نفصل الصفحات أم نستخدم صفحة استوديو واحدة ذكية؟
✅ **القرار المعتمد: صفحة استوديو واحدة موحّدة (`/design-studio/[id]`) مع ملف قدرات ذكي لكل عائلة منتجات (`ProductStudioProfile`)**.

**لماذا هذا القرار هو المعيار العالمي (مثل Printful / Printify / Gelato / Canva Print):**
1. **عدم تكرار المحرك الأساسي (DRY):** محرك Fabric.js (الطبقات، التراجع/الإعادة، DPI 300Hz الحقيقي، المحاذاة المغناطيسية، قص الخلفية، الذكاء الاصطناعي، المفضلات، الرفع المباشر، والتصدير للطباعة) يعمل بكفاءة عالية ومرتبط بالمسودات (`localStorage`) والسلة (`cart`) وحفظ الإنتاج (`ProductionSnapshot`).
2. **تبديل ديناميكي للواجهة والأدوات فقط:** بمجرد دخول منتج للاستوديو، يقرأ النظام `resolveProductStudioProfile(productData)` ليحدد تلقائياً عائلة المنتج:
   - `'apparel'` (تيشيرتات `tshirt`، هوديز `hoodie`، سويت شيرت `sweatshirt`)
   - `'mug'` (أكواب سيراميك، أكواب سحرية، أكواب بمقبض/داخل ملون)
   - `'hat'` (قبعات / كابات)
   - `'phone_case'` (أغلفة حماية الهواتف)
   - `'generic'` (منتجات عامة مستقبلية)
3. **عزل آمن بنسبة 100% للملابس الحالية:** جميع قواعد مقاسات الملابس (`S–3XL`)، دليل المقاسات بالـ cm، موضع الياقة، والأكمام تظل مفعلة **حصراً** عندما يكون `studioProfile.family === 'apparel'`، وتختفي أو تتحول تلقائياً للمنتجات غير الملبسية.

---

## 2. مصفوفة قدرات المنتجات (Product Capability Profiles Matrix)

| الخاصية / الأداة | الملابس (`apparel`) | الأكواب (`mug`) | القبعات (`hat`) | أغلفة الهاتف (`phone_case`) |
| :--- | :---: | :---: | :---: | :---: |
| مقاسات الملابس (`S–3XL`) ودليل المقاسات (`Beden Tablosu`) | ✅ مفعلة | ❌ مخفية (استبدال بـ `Standard` / `11oz-15oz` + عداد كمية) | ❌ مخفية (استبدال بـ `One Size / Standard` + عداد كمية) | ❌ مخفية (استبدال بـ **موديل الهاتف** لاحقاً + عداد كمية) |
| حساب `offsetFromCollarCm` (المسافة من الياقة) | ✅ مفعل | ❌ مخفي | ❌ مخفي | ❌ مخفي |
| تبويب الأكمام (`Kollar / Sleeves`) | ✅ مفعل | ❌ مخفي | ❌ معاد تسميته إلى **الجوانب (`Yanlar / Sides`)** | ❌ مخفي |
| ألوان المنتج (`Swatches`) | ✅ متعددة | ✅ مكتمل: لون المقبض والداخل + طبقة السحر الحراري | ✅ متعددة | ✅ متعددة (شفاف/أسود/مطفي) |
| تقنية الطباعة الافتراضية | `DTF` (أو اختياري) | ✅ مكتمل: `Sublimation` (مع خيار Mirror الأفقي بالإنتاج) | `DTF` (وفي المرحلة 2: `Embroidery` تطريز) | `Sublimation` / UV |
| المعاينة ثلاثية الأبعاد / المتخصصة | موك أب ثنائي/متعدد الأوجه | ✅ مكتمل: **أسطوانة 3D تفاعلية 360° + محاكاة السكب الساخن** | 🔜 المرحلة 2: **تقوس النص + معاينة درز الكاب** | 🔜 المرحلة 3: **قناع فتحة الكاميرا + حلقة MagSafe** |

---

## 3. المرحلة 0: سد الفجوات التأسيسية (Foundation Gaps — قبل بناء أدوات كل منتج)

تم رصد 4 فجوات معمارية رئيسية تمنع أي منتج غير ملبسي من العمل بسلاسة داخل الاستوديو أو لوحة الإدارة. هذا جدول متابعتها:

- [x] **Gap 0.1 — فصل افتراضات الملابس داخل محرك الاستوديو (`D:\kenditasarl`)**
  - إنشاء [`src/lib/productStudioProfile.ts`](src/lib/productStudioProfile.ts) لتحديد `ProductFamily` وخصائص الواجهة والنصوص المترجمة (`ar` / `tr` / `en`) حسب نوع المنتج.
  - تحديث [`src/app/[locale]/design-studio/[[...productId]]/page.tsx`](src/app/[locale]/design-studio/[[...productId]]/page.tsx) لاشتقاق المقاسات من `variants` أو `profile.defaultVariantSizes` (`['Standard']`) بدلاً من حقن `['S', 'M', 'L', 'XL', '2XL']` و`'M'` قسراً في الأكواب والقبعات والأغلفة.
  - تحديث [`src/components/editor/FabricCanvas.tsx`](src/components/editor/FabricCanvas.tsx):
    - إخفاء شبكة `S–3XL` ورابط `دليل المقاسات / Beden Tablosu` ونافذة جدول المقاسات للملابس عندما يكون `!studioProfile.hasApparelSizes`.
    - عرض **عداد كمية مباشر (`-  الكمية  +`)** وزر طلب ألوان متعددة عند تعدد الألوان، وتمرير `hasApparelSizes={studioProfile.hasApparelSizes}` إلى [`MultiVariantMatrixModal.tsx`](src/components/editor/MultiVariantMatrixModal.tsx).
    - تعريب وتخصيص النصوص المصلوبة مثل `"سعر التيشيرت الأساسي"` و`"لون التيشيرت"` و`"الأدوات التوضيحية للـ AI / DPI"` لتتبع نوع المنتج الفعلي.

- [x] **Gap 0.2 — توسيع إعدادات مواضع الطباعة وقوالب التخصيص (`Storefront` + `Admin`)**
  - تحديث [`printPlacementConfig.ts`](src/lib/printPlacementConfig.ts) في المشروعين (`kenditasarl` و`kenditasarl-admin`):
    - توسيع `normalizeGarmentType()` ليشمل `'tshirt' | 'hoodie' | 'sweatshirt' | 'mug' | 'hat' | 'phone_case' | 'generic'`.
    - إضافة مواضع معيارية عالمية في `PRINT_CONFIG.mug` (`mug_full_wrap`, `mug_front`, `mug_back`), و`PRINT_CONFIG.hat` (`hat_front_crown`, `hat_left_side`, `hat_right_side`, `hat_back_arch`), و`PRINT_CONFIG.phone_case` (`phone_full_back`, `phone_lower_badge`), و`PRINT_CONFIG.generic`.
  - تحديث [`customizationConfig.ts`](src/lib/customizationConfig.ts) في المشروعين:
    - إضافة قالب `'phone_cases'` إلى `CATEGORY_CUSTOMIZATION_DEFAULTS` وتحديث `getCustomizationConfig()`.
    - ضبط افتراضيات `'mugs'` و`'hats'` لتفعيل الرفع والأدوات والمواضع الجديدة.
  - تحديث [`src/components/editor/GarmentPlacementGuide.tsx`](src/components/editor/GarmentPlacementGuide.tsx):
    - استبدال SVG القميص برسم متجه نظيف ومخصص للكوب والقبعة وغلاف الهاتف.
    - إخفاء تبويب «الأكمام / Kollar» وشارة «نزولاً X سم من الياقة» عن المنتجات غير الملبسية، وتبديل أسماء التبويبات حسب العائلة.

- [x] **Gap 0.3 — تحديث لوحة الإدارة (`D:\kenditasarl-admin`) لدعم المنتجات المتعددة**
  - تحديث [`CustomizationSection.tsx`](../kenditasarl-admin/src/app/(admin)/products/[id]/edit/CustomizationSection.tsx) لإضافة أزرار اختيار نوع المنتج كاملة (`تيشيرت`, `هودي`, `كوب`, `قبعة`, `غلاف هاتف`, `عام`) بدلاً من الاقتصار على زريّ التيشيرت والهودي، مع عرض تنبيهات ومواضع مناسبة لكل نوع.
  - تحديث [`PrintAreaEditorModal.tsx`](../kenditasarl-admin/src/components/admin/PrintAreaEditorModal.tsx) لإخفاء عبارة «نزولاً ... سم من الياقة» عندما تكون المسافة `<= 0` وعرض شارة «دوران كامل 360°» أو «موضع قياسي» بدلاً منها.
  - تحديث صفحتي إضافة وتعديل المنتج (`products/new/page.tsx` و`products/[id]/edit/page.tsx`) لإضافة تصنيف `phone_cases` وضبط منطق المخزون/الألوان واستراتيجية الطباعة الافتراضية (`sublimation_only` للأكواب والأغلفة).

- [x] **Gap 0.4 — إضافة قسم أغلفة الهواتف في محدد المنتجات وملفات اللغات (`ar` / `tr` / `en`)**
  - تحديث [`src/components/editor/ProductSelector.tsx`](src/components/editor/ProductSelector.tsx) بإضافة تصنيف `'phone_cases'` ومطابقته.
  - إضافة مفاتيح الترجمة المتطابقة في [`messages/ar.json`](messages/ar.json) و[`messages/tr.json`](messages/tr.json) و[`messages/en.json`](messages/en.json) مع الالتزام الصارم بقواعد [`AGENTS.md`](AGENTS.md) (منع استخدام `"Konum"` في التركية واعتماد `"Baskı Alanı"` / `"Yerleşim"` و`"KENDİN TASARLA"`).

---

## 4. المرحلة 1: استوديو الأكواب الاحترافي (Mugs Studio — ✅ مكتمل ومفحوص)

بناءً على المواصفات المؤكدة من المالك:
- **أنواع الأكواب المدعومة:**
  1. **كوب سيراميك أبيض كلاسيكي** (`standard` — `11oz` / `15oz`).
  2. **كوب سحري حراري** (`magic` — طبقة حرارية داكنة قابلة للتخصيص `magicRevealCoverColor` تكشف التصميم عند سكب سائل ساخن).
  3. **كوب ملون المقبض والداخل** (`inner_color` — جسم أبيض للطباعة الواضحة مع مقبض وباطن ملون عبر `variants`).
- **أنماط الطباعة ومواضعها:**
  1. **طباعة بانورامية كاملة 360° حول الكوب (`mug_full_wrap`)**: قياس معياري `23 × 9.5 cm` (بأقصى سماحية `23.5 × 9.8 cm` للـ 11oz)، بمساحة تصميم بانورامية مفرودة (`1840×760 px`) على المحرر مع **خطوط إرشاد ذكية لثلاث مناطق**:
     - اليسار (جهة مسك اليد اليمنى)
     - المنتصف الأمامي (مقابل المقبض)
     - اليمين (جهة مسك اليد اليسرى)
     - منطقة أمان إجبارية قبل المقبض (`≤ 1.0 cm` هامش أبيض طبيعي بجانب يد الكوب).
  2. **وجه واحد (`mug_front`)**: `8.5 × 9 cm` مع خيار قلب الاتجاه (يميني/يساري).
  3. **وجهين متقابلين (`mug_front` + `mug_back`)**: كل وجه `8.5 × 9 cm` متاح للتصميم بشكل منفصل أو بنقرة «تكرار للجهة المقابلة».

### المهام التفصيلية للمرحلة 1 (مكتملة):
- [x] **1.1 توسيع بنية المنتج في Admin + Firestore للأكواب (`mug_meta` / `MugMeta`):**
  - حقول في إعدادات المنتج بالأدمن (`customizationConfig.ts` + `products/new` + `products/[id]/edit`): `mugStyle` (`'standard' | 'magic' | 'inner_color'`), `mugCapacities` (`'11oz' | '15oz'`), `magicRevealCoverColor` (افتراضي `#141414`), مع تفعيل ألوان المقبض والداخل تلقائياً لـ `inner_color` و`magic` وإدارة المخزون لكل سعة في جدول `variants`.
  - دعم `resolveMugMeta` في `src/lib/productStudioProfile.ts` وعرض سعة الكوب وشارة النوع في صفحة المنتج (`src/app/[locale]/products/[id]/page.tsx`) وإعداد الوجهين في صفحة الاستوديو (`src/app/[locale]/design-studio/[[...productId]]/page.tsx`).
- [x] **1.2 شريط أدوات الكوب المتخصص في الاستوديو + التسعير:**
  - مكون `MugStudioControlsBar` و`MugPanoramicGuidesOverlay` في `src/components/editor/MugStudioControls.tsx` ودمجهما في `FabricCanvas.tsx`.
  - منتقي نمط العرض السريع: `بانورامي 360°` / `وجه واحد` / `وجهان` مع ربط مباشر بتسعير `calculateCustomProductPrice` (`pricing.ts` — `mug_full_wrap: +25 ₺`, `mug_front: 0 ₺`, `mug_back: +35 ₺`) وبإعدادات التسعير في الأدمن (`settings/pricing/page.tsx`).
  - زر **«تكرار للجهة المقابلة / Her İki Yüze Uygula»** عند تصميم وجهين، وخطوط دليل البانوراما (`Left | Front Center | Right` + هوامش أمان اليد `≤ 1.0 cm`) كطبقة HTML لا تدخل في التصدير النهائي.
  - إضافة مفاتيح `MugStudio` في `messages/{ar,tr,en}.json` بتكافؤ كامل وفق `AGENTS.md`.
- [x] **1.3 المعاينة ثلاثية الأبعاد التفاعلية للكوب (`Mug3DPreviewModal`):**
  - إنشاء `src/components/editor/Mug3DPreviewModal.tsx` بأسطوانة 3D تفاعلية تدور 360° بالسحب واللمس مع أزرار زوايا الكاميرا السريعة وتدوير تلقائي ومقبض/باطن ملون يطابق اللون المختار.
  - في **الكوب السحري (`magic`)**: شريط محاكاة السكب الساخن (`0% بارد -> 100% ساخن`) يكشف التصميم الحرارياً من الأسفل للأعلى مع بخار تفاعلي قبل الشراء (في وضع المعاينة وتأكيد الإضافة للسلة).
- [x] **1.4 دعم الإنتاج والسبليميشن وبيانات اللقطة (`ProductionSnapshot`):**
  - حفظ `mug_meta` (النمط، السعة، لون التغطية الحراري) واللون المختار والمواضع في `production_snapshot` ومستند `designs`.
  - إضافة خيار **عكس السبليميشن الأفقي (`mirrorHorizontal`)** في `production-renderer.ts` و`ProductionFileGenerator.tsx` وتحديث شارة الوجه في تفاصيل الطلب بالأدمن (`orders/[id]/page.tsx`) لدعم `mug_full_wrap` ومواضع الأكمام.
- [x] **1.5 معايرة وتوحيد مقاس الأكواب في محرر الإدارة ومزامنتها مع الاستوديو:**
  - تطوير [`PrintAreaEditorModal.tsx`](../kenditasarl-admin/src/components/admin/PrintAreaEditorModal.tsx) ليتكيّف ديناميكياً مع نوع المنتج (الأكواب / القبعات / أغلفة الهواتف / الملابس)، بإظهار واجهات الكوب الثلاث (`front` / `back` / `other`) ومقاساته الفيزيائية الحقيقية (`23×9.5 cm` للبانوراما و`8.5×9 cm` للوجه المفرد)، مع منتقي اتجاه المقبض وإخفاء إعدادات الياقة والأكتاف للمنتجات غير الملبسية.
  - إضافة `detectMugOrientationAndBounds` و`normalizeMugImage` / `normalizeMugImageFile` في [`garmentNormalizer.ts`](../kenditasarl-admin/src/lib/garmentNormalizer.ts) لتوحيد مقاس صور الأكواب (`1000×1000`) وحساب الحافة العلوية وموضع المقبض تلقائياً لجميع أنواع الأكواب (`standard` / `inner_color` / `magic`).
  - تحديث [`FabricCanvas.tsx`](src/components/editor/FabricCanvas.tsx) ليقرأ أولاً `calibratedPlacements` ثم `faces[activeFace].printArea` ثم نسب `canvasBox` المحدثة بدلاً من مقياس الصدر الخاص بالملابس (`55 cm`) مع ظهور إطار البانوراما على الأوجه الثلاثة.
- [x] **1.6 ترقية الوضع البانورامي الاحترافي للأكواب (Unwrapped `23×9.5 cm` Sheet + Live 3D Wrap + 300 DPI Pipeline):**
  - **مساحة تصميم بانورامية حقيقية (`1840×760 px` = `23×9.5 cm @ 80 px/cm`):** عند تفعيل وضع `mug_full_wrap` داخل [`FabricCanvas.tsx`](src/components/editor/FabricCanvas.tsx)، يتحوّل مسرح العمل تلقائياً من موك أب الواجهة المربعة إلى **شريط بانوراما مفرود بزاوية 360° (`MugPanoramicSheetBackdrop`)** بنسبة العرض إلى الارتفاع الحقيقية (`23:9.5`) مع مقابض جانبية بصرية توضح منطقة الأمان بجوار المقبض (`≤ 1.0 cm`) وتقسيم الأعمدة الثلاثة (`اليسار 35%` | `المنتصف 30% • مقابل المقبض` | `اليمين 35%`) عبر [`MugPanoramicGuidesOverlay`](src/components/editor/MugStudioControls.tsx).
  - **محرك معاينة أسطواني ثلاثي الأبعاد حي متزامن (`Live 3D Cylindrical Stage`):** استخلاص محرك الالتفاف الأسطواني المشترك في [`Mug3DStage.tsx`](src/components/editor/Mug3DStage.tsx) (`renderMugSceneToContext`, `Mug3DCanvas`, `MugLivePanoramaPanel`, `renderMugWrapThumbnailDataUrl`) وربطه بنافذة المعاينة الكاملة [`Mug3DPreviewModal.tsx`](src/components/editor/Mug3DPreviewModal.tsx) مع تحديث حي دون وميض عبر `canvas.toCanvasElement(0.5)` أثناء السحب والتحجيم والتدوير والتراجع/الإعادة (`undo`/`redo`).
  - **شريط أدوات البانوراما السريعة والتنقل للموبايل (`MugPanoramicQuickBar`):** إضافة أزرار [`MugPanoramicQuickBar`](src/components/editor/MugStudioControls.tsx) لملء البانوراما بنقرة واحدة (`actionFillPanorama` عبر `handleFillPanoramaWrap`) أو المحاذاة الفورية للمناطق الثلاث (`actionSnapLeft` / `actionSnapCenter` / `actionSnapRight` عبر `handleSnapPanoramaZone`) مع تدوير تلقائي للكاميرا ثلاثية الأبعاد وتبديل فوري في شاشات الموبايل بين `لوحة البانوراما (23×9.5)` و`معاينة الكوب 360°`.
  - **التحويل التناسبي الذكي للأنماط ومصغّرات السلة/الإنتاج:** تطبيق `remapUserObjectsBetweenBoxes` داخل `handleSelectMugMode` لنقل التصاميم بسلاسة بين الوضع المفرد/الوجهين والشريط البانورامي ذهاباً وإياباً، وتوليد صورة الموك أب ثلاثية الأبعاد الأسطوانية عبر `renderMugWrapThumbnailDataUrl` في `exportDesignData` و`generateFaceMockupPreviewDetailed` (بدون قص مربع في `prepareMugCroppedSlides`)، وختم `buildSerializedFaceJson` ببيانات `{ width: 1840, height: 760, mugPanoramaSheet: true }` مع معالجته مباشرة في [`ProductionFileGenerator.tsx`](../kenditasarl-admin/src/components/ProductionFileGenerator.tsx) لتصدير ملف سبليميشن `300 DPI` بمقاس `2717×1122 px` (`23×9.5 cm`).
  - **توحيد القواميس متعددة اللغات (`AR / TR / EN`):** إضافة مفاتيح البانوراما الحيّة بالكامل في [`ar.json`](messages/ar.json) و[`tr.json`](messages/tr.json) و[`en.json`](messages/en.json) بالتوافق التام مع معايير `AGENTS.md`.
- [x] **1.7 معالجة خطأ تبديل وضع البانوراما وإعادة تنظيم تخطيط الاستوديو دون تداخل:**
  - **تأمين تبديل الوضع المباشر (`handleSelectMugMode`):** التحقق من جاهزية الكانفاس ووجود `lowerCanvasEl` و`canvas.getContext?.()` قبل تغيير الأبعاد أو إعادة التموضع لمنع خطأ التشغيل `TypeError: Cannot set properties of undefined (setting 'width')` عند الانتقال من الوجه الأمامي/المتقابل إلى وضع `mug_full_wrap` مباشرة عبر دليل المواضع.
  - **نقل شريط التنبيه الإرشادي (`typewriterHintBanner`) ومُدمج التحكم بالعنصر:** نقل الشريط البرتقالي الإرشادي إلى فراغ شريط الأدوات العلوي (`top toolbar`) بحيث لا يظهر فوق العناصر، ونقل وتصغير شريط التحكم بالعنصر النشط (`renderActiveObjectToolbar('docked')`) داخل `centerSlot` في [`MugStudioControlsBar`](src/components/editor/MugStudioControls.tsx) بجانب زر `إخفاء المعاينة الحيّة`.
  - **إزالة الفاصل وإتاحة المساحة العمودية الكاملة:** حذف الشريط الوسيط الزائد أعلى شريط البانوراما ورفع منطقة التصميم للأعلى لمنع اختفاء أسفلها خلف أزرار الأوجه السفلية (`الواجهة الأمامية` / `الجهة الخلفية` / `أخرى`).
  - **إعادة تموضع أزرار البانوراما وزر «تصاميمي»:** تحويل [`MugPanoramicQuickBar`](src/components/editor/MugStudioControls.tsx) إلى شريط عمودي على يسار/جانب مسرح العمل في الشاشات الكبيرة (`lg:end-3 xl:end-4 lg:top-[54%] lg:-translate-y-1/2 lg:flex-col`) مع الإبقاء عليه أفقياً في الموبايل، ونقل زر ودرج [`UserMediaSidebar`](src/components/editor/UserMediaSidebar.tsx) إلى الزاوية العلوية المقابلة (`top-3 sm:top-4 end-3 xl:end-4`).
  - **إصلاح شريط القياس الحيّ (`Live HUD`):** رفع مستوى الظهور (`z-50`) ليظهر بوضوح فوق لوحة المعاينة الحيّة ثلاثية الأبعاد أثناء السحب والتحجيم دون اختفاء خلفها، وتقييد احتساب وعرض بُعد الياقة (`collarOffsetCm`) بفحص `studioProfile.family === 'apparel'` داخل `computeLiveMetrics` في [`FabricCanvas.tsx`](src/components/editor/FabricCanvas.tsx) كي لا يظهر `سم ياقة` للمنتجات غير الملبسية مثل الأكواب.
- [x] **1.8 مطابقة العرض ثلاثي الأبعاد `1:1` مع الكانفاس وتوسيع الشريط البانورامي (`23 × 9.5 cm`) بهامش مقبض `≤ 1.0 cm`:**
  - **تعويض المنظور الأسطواني الحقيقي (`True 1:1 3D Wrap`):** تحديث `resolveCylinderTextureLayer` و`renderMugSceneToContext` في [`Mug3DStage.tsx`](src/components/editor/Mug3DStage.tsx) بتطبيق معامل تعويض الميل (`cosTilt = Math.max(0.84, Math.cos(tiltRad))` و`surfaceDrawH = maxDrawH / cosTilt`) وضبط نسبة ارتفاع الأسطوانة الحقيقية (`cylH = R * (isLarge15oz ? 2.58 : 2.30)`) وتوسيع زاوية الالتفاف القصوى إلى `324°` للبانوراما (`maxHeightRatio`: `0.975` للـ 11oz و`0.85` للـ 15oz) و`136°` للوجه المفرد/المتقابل، مع ربط مستمر لمقبض الكوب (`attachX = cx + handleSinX * R * 0.96`).
  - **هامش أمان مقبض احترافي `≤ 1.0 cm` وشريط `1840×760 px`:** ترقية أبعاد الشريط المفرود إلى `23 × 9.5 cm` (`MUG_PANORAMA_SHEET_WIDTH = 1840`، `MUG_PANORAMA_SHEET_HEIGHT = 760`) في [`FabricCanvas.tsx`](src/components/editor/FabricCanvas.tsx)، وضبط الحد الأقصى لـ `handleMarginCm` عند `1.0` في [`productStudioProfile.ts`](src/lib/productStudioProfile.ts)، وتقليص الأشرطة الجانبية البصرية إلى `2%` (`≤{handleMarginCm}cm`) في [`MugPanoramicGuidesOverlay`](src/components/editor/MugStudioControls.tsx)، وتحديث مراكز المحاذاة السريعة في `handleSnapPanoramaZone` (`left: 0.185`, `center: 0.50`, `right: 0.815`).
  - **الترقية التلقائية للمسودات القديمة (`1600×760` ← `1840×760`):** إضافة الدالة [`migrateLegacyMugPanoramaObjects`](src/components/editor/FabricCanvas.tsx) واستدعاؤها في `fetchDesign` و`initCanvas` وتصدير `staticCanvas` لإعادة توسيط العناصر المحفوظة وتوسيع خلفيات البانوراما الكاملة بشكل متناسق دون تمدد.
  - **مزامنة المتجر ولوحة الإدارة والترجمات:** تحديث قياس `mug_full_wrap` (`23 × 9.5 cm` = `2717×1122 px @ 300 DPI` والحد الأقصى `23.5 × 9.8 cm` = `2776×1157 px`) و`handleMarginCm: 1.0` عبر [`printPlacementConfig.ts`](src/lib/printPlacementConfig.ts) و[`customizationConfig.ts`](src/lib/customizationConfig.ts) ونظيريهما في [`kenditasarl-admin`](../kenditasarl-admin/src/lib/printPlacementConfig.ts) إضافة إلى [`garmentNormalizer.ts`](../kenditasarl-admin/src/lib/garmentNormalizer.ts) و[`ProductionFileGenerator.tsx`](../kenditasarl-admin/src/components/ProductionFileGenerator.tsx) و[`PrintAreaEditorModal.tsx`](../kenditasarl-admin/src/components/admin/PrintAreaEditorModal.tsx) وصفحات المنتجات والتسعير (`products/new/page.tsx`، `products/[id]/edit/page.tsx`، `settings/pricing/page.tsx`)، مع تطابق `564` مفتاحاً (`47` مفتاحاً في `MugStudio`) عبر `messages/{ar,tr,en}.json`.
- [x] **1.9 إبقاء حدود التحديد ومقابض التحجيم مرئية عند تجاوز الملصق لحدود البانوراما والكانفاس:**
  - تطوير [`fabricCustomControls.ts`](src/lib/fabricCustomControls.ts) لقص إطار التحديد بخوارزمية Sutherland–Hodgman (`clipPolygonToRect`) داخل `drawBorders` حتى يظل الإطار المتقطع محيطاً بالمساحة المرئية على حافة الكانفاس عند تمدد الملصق خارج حدود البانوراما.
  - إضافة `clampCornerControlsMap` و`separateClampedPair` ضمن `calcOCoords` لتثبيت مقابض الأركان والتدوير داخل الحيز المرئي القابل للنقر، وتطوير `clampedCornerScaleAction` / `smartScalingAction` لتكبير وتصغير الملصقات الممتلئة بسلاسة دون قفز مع حارس HMR (`__modernClampedControlsPatched`).
  - توثيق واختبار الآلية عبر [`fabricCustomControls.test.ts`](src/lib/fabricCustomControls.test.ts) (`6 / 6` اختبارات ناجحة) مع اجتياز فحص TypeScript (`npx tsc --noEmit`) في كلٍّ من المتجر ولوحة الإدارة وكافة حزم الاختبارات (`22/22` في `crossProjectIntegration.test.ts`، `15/15` في `pricing.test.ts`، `5/5` في `integrationFixes.test.ts`، `10/10` في `coordinateMapping.test.ts`، واجتياز `productsExpansion.test.ts`).
- [x] **1.10 محرك الخطوط الإرشادية الذكية والمحاذاة المغناطيسية عبر كامل الاستوديو ولكافة المنتجات (Smart Alignment Guides & Magnetic Snapping):**
  - **المحاذاة التلقائية حسب حدود موضع الطباعة النشط (Placement-Aware Dynamic Snapping):** تطوير دالة `getActiveObjectPrintZone` في [`FabricCanvas.tsx`](src/components/editor/FabricCanvas.tsx) لربط العنصر النشط آلياً بموضع الطباعة المعتمد الذي يتواجد فوقه (مثل الصدر الأيسر `sol_gogus`، الصدر الأوسط `orta_gogus`، الطباعة الأمامية الكاملة `tam_on_baski`، الظهر `tam_sirt_baski`، أو أي موضع في الواجهة الأمامية أو الخلفية لكافة المنتجات).
  - **حصر الخطوط الإرشادية حصراً داخل حدود صندوق الموضع الأبيض (Strict Guide Bounding):** حصر امتداد الخطوط الإرشادية الأفقية والرأسية تماماً داخل حدود المستطيل المنقط الأبيض لموضع الطباعة (`startCoord` إلى `endCoord` مطابقة لـ `printZone.top..top+height` و `printZone.left..left+width`)، مما يمنع نهائياً امتداد الخطوط خارج حدود منطقة الطباعة أو ظهورها فوق ياقة القميص أو الأكمام.
  - **شبكة تقسيم موضع الطباعة لأربعة أقسام متساوية ومحاذاة الزوايا (4-Quadrant 2x2 Grid Snapping):** عند سحب الملصق باتجاه أي زاوية من زوايا موضع الطباعة الأربع (الأعلى يساراً، الأعلى يميناً، الأسفل يساراً، والأسفل يميناً):
    - تظهر تلقائياً خطوط تقسيم الموضع لـ 4 أقسام متساوية (`zone-divider` بلون أزرق متقطع على المحورين الرأسي والأفقي لمنتصف الموضع).
    - ينجذب الملصق مغناطيسياً لمركز ذلك الربع المحدد بدقة (`25%` و `75%` عرضاً وارتفاعاً) مع إظهار خطوط تقاطع خاصة بمركز الربع (`zone-center`).
    - يتيح ذلك للعميل تنظيم وتوزيع ما يصل إلى 4 تصاميم أو ملصقات متوازنة ومتساوية تماماً داخل الأقسام الأربعة للموضع.
  - **المحاذاة المغناطيسية لحواف ومراكز موضع الطباعة (Placement Center & Edge Snapping):** محاذاة العنصر لمركز موضع الطباعة المحدد بدقة بكسل واحدة، مع دعم الجذب المغناطيسي للحواف الأربعة لموضع الطباعة (الأعلى، الأسفل، اليمين، اليسار).
  - **منع التكرار وازدواجية الخطوط (Proximity Deduplication & Single Primary Center):** دمج وإلغاء أي خطوط إرشادية متقاربة بمقدار أقل من `4px` لمنع ظهور خطين متوازيين متقاربين، وتوحيد مركز منطقة الطباعة مع مركز الكانفاس لمنع تنافس المراكز.
  - **محاذاة مواضع بانوراما الكوب الثلاثية (Mug Panorama 3-Zone Snapping):** دعم المحاذاة المغناطيسية الفورية للمواضع الثلاثة في الكوب البانورامي: اليسار (`340.4px` / Yaw -90°)، المنتصف المقابل للمقبض (`920px` / Yaw 0°)، اليمين (`1499.6px` / Yaw +90°)، بالإضافة إلى خطوط الفواصل الإرشادية (`644px` و`1196px`).
  - **المحاذاة الذكية متعددة العناصر (Object-to-Object Smart Alignment):** مقارنة حدود العنصر النشط مع كافة العناصر والملصقات الأخرى على الكانفاس، ودعم المحاذاة للحواف العليا والسفلى واليمنى واليسرى والمراكز الأفقية والرأسية مع حصر الخطوط بين العناصر داخل موضع الطباعة.
  - **ربط العناصر المتعددة المتطابقة بخط إرشادي موحد (Multi-Element Alignment):** عند محاذاة عنصرين أو ثلاثة ملصقات على نفس الحافة أو المنتصف، يتم رسم خط إرشادي متقطع متصل يمتد من أول عنصر إلى آخر عنصر ليرى المستخدم بوضوح تام اصطفاف العناصر على نفس الخط مع علامات ارتكاز بصرية (`ticks`).
  - **محرك خفيف فائق السرعة (60fps) وحذف قطعي للخطوط فور الإفلات (Anti-Ghosting contextTop Wipe):** بناء المحرك في [`src/lib/fabricSmartGuides.ts`](src/lib/fabricSmartGuides.ts) ليرسم الخطوط حصراً على `canvas.contextTop` أثناء السحب والتحجيم فقط، ومسح طبقة `contextTop` فورياً بالكامل عند الإفلات (`mouse:up` / `touchend` / `object:modified` / `selection:cleared` ومستمعات النافذة العامة `pointerup` / `mouseup`) وحراسة فحص التفاعل `isInteractingCheck` على دورة `after:render` لضمان عدم بقاء أي خطوط شبحية بعد إفلات الملصق.
  - **الربط مع زر المحاذاة في شريط الأدوات العلوي:** الربط المباشر مع مفتاح التفعيل `☑ Hizalama / Align / محاذاة` (`smartAlignmentEnabled`) في [`FabricCanvas.tsx`](src/components/editor/FabricCanvas.tsx) ودعم إيماءات اللمس على الموبايل والماوس على الحواسيب عبر كافة عائلات المنتجات (الملابس، الأكواب، القبعات، أغلفة الهواتف، والمنتجات العامة).
  - **تغطية شاملة باختبارات الوحدة:** إنشاء وتمرير حزمة اختبارات كاملة في [`src/lib/fabricSmartGuides.test.ts`](src/lib/fabricSmartGuides.test.ts) بنجاح `9 / 9` اختبارات لوظائف الجذب المغناطيسي، عدم ازدواجية الخطوط، المحاذاة البانورامية الثلاثية، حصر الخطوط داخل حدود موضع الطباعة، شبكة الأرباع الأربعة 2x2، واصطفاف العناصر المتعددة.
- [x] **1.11 استراتيجية وحساب تسعير الأكواب وتأمين اختيار الواجهات ونافذة حل التعارض الذكية (Mugs Pricing Strategy & Single-Face Conflict Resolution):**
  - **استراتيجية التسعير الثلاثية المعتمدة للأكواب:**
    1. **بانوراما 360° (`mug_full_wrap`):** شريط طباعة كامل يلتف حول الكوب بالكامل (`23×9.5 cm`) برسم ترقية محدد (+25 ₺ أو حسب تسعير الأدمن).
    2. **وجه واحد (`mug_front`):** مشمول في السعر الأساسي (0 ₺ إضافية)، ويتيح للعميل 3 زوايا رؤية (`الواجهة الأمامية`، `الجهة الخلفية`، `أخرى`).
    3. **وجهان متقابلان (`mug_two_sided`):** طباعة الوجهين الأمامي والخلفي (+35 ₺)، مع تمييز الواجهتين فورياً باللون الأزرق الملكي وشارات الاختيار النشطة في شريط التنقل السفلي.
  - **نافذة تأمين النزاهة وحل التعارض عند التصميم على أكثر من واجهة (`MugSingleFaceConflictModal`):**
    - عند قيام العميل بالتصميم على أكثر من واجهة وهو في وضع "وجه واحد" ثم الضغط على "إضافة للسلة":
    - يتم اعتراض العملية تلقائياً وعرض نافذة تفاعلية ودية باللغات الثلاث (`AR / TR / EN`):
      - **خيار الترقية الفورية (Recommended):** زر «ترقية إلى وجهان (+35 ₺)» يفعّل وضع الوجهين ويحدّث التسعير والمعاينة ثلاثية الأبعاد فوراً.
      - **خيار الاحتفاظ بواجهة واحدة فقط:** عرض أزرار مخصصة للواجهات التي صمم عليها العميل، وبالضغط على إحداها يتم تثبيتها وحذف تصاميم الواجهات الأخرى تلقائياً لضمان الدقة وتجنب الغموض في الطباعة.
  - **معمارية التسعير والشحن المرتكزة على تصنيف المنتج في لوحة الإدارة (`Admin Category-Based Pricing`):**
    - تقسيم تسعير المواضع والأوجه حسب تصنيف المنتج (`apparel`, `mugs`, `hats`, `phone_cases`).
    - توفير تسعيرات مستقلة لكل عائلة لمنع تداخل أسعار التيشيرتات مع الأكواب أو القبعات.


---

## 5. المرحلة 2: استوديو القبعات الاحترافي (Hats & Caps Studio)

- **أنماط القبعات:** Baseball / Dad Hat، Trucker (شبك خلفي)، Snapback، Beanie (تخصص من Admin).
- **أنماط الطباعة المدعومة:**
  - طباعة `DTF` عالية الدقة (مناسبة للتدرجات والصور).
  - وضع **التطريز (`Embroidery` — خيار في Admin):** فرض قيود السماكة الدنيا (`>= 1.5 mm` للخطوط)، عداد أقصى لعدد ألوان الخيط (مثلاً حتى 6–8 ألوان)، وفلتر محاكاة الغرز.
- **مواضع الطباعة الخاصة بالقبعة:**
  - `hat_front_crown` (الجبهة الأمامية `11 × 5.5 cm`)
  - `hat_left_side` / `hat_right_side` (الألواح الجانبية `6 × 4 cm`)
  - `hat_back_arch` (القوس الخلفي فوق حزام الإغلاق `8 × 3 cm`)
- **المهام الهندسية للمرحلة 2:**
  - [ ] أداة **النص المقوّس (`Curved Text / Arch`)** لضبط انحناء النص ليتبع قوس الجبهة أو الفتحة الخلفية.
  - [ ] خط إرشاد درز الوسط (`Center Seam Indicator`) للقبعات ذات 6 ألواح (6-panel caps).
  - [ ] دعم حقول `hatMeta` في Admin + معاينة القبعة في الاستوديو.

---

## 6. المرحلة 3: استوديو أغلفة حماية الهواتف (Phone Cases Studio)

- **الموديلات المدعومة (تُدار ديناميكياً من Admin لكل منتج):**
  - مصفوفة `phoneModels`: مثل `iPhone 16 Pro Max`, `iPhone 15 Pro`, `iPhone 14`, `Samsung S24 Ultra`... حيث يحمل كل موديل: الأبعاد الفيزيائية بالـ cm، وصورة موك أب أو قالب، وإحداثيات **فتحة الكاميرا (`cameraCutout`)** + خيار حلقة `MagSafe`.
- **المواضع والأدوات الهندسية للمرحلة 3:**
  - [ ] **منتقي موديل الهاتف الذكي** داخل الاستوديو (يحل محل مقاسات الملابس، ويغيّر إطار القصّ والكاميرا فوراً مع الحفاظ على تصميم العميل وإعادة توسيطه بأمان).
  - [ ] **قناع حماية الكاميرا (`Camera Island Overlay`)**: طبقة إرشادية و`clipPath` تمنع ظهور التصميم فوق عدسات الكاميرا والفلاش مع إظهار حدود الهوامش الجانبية (`Wrap Bleed 2–3 mm`).
  - [ ] **قوالب الكولاج الشبكية (`Photo Grid / Collage`)** + خلفية متدرجة جاهزة + خيار نوع الغلاف (شفاف `Clear` / صدمات أسود `Shockproof` / `MagSafe`).

---

## 7. معايير الجودة والإلزام (Checklist في كل جلسة قادمة)

1. **تعدد اللغات الإلزامي (AR / TR / EN):** كل واجهة أو زر أو رسالة خطأ تُكتب باللغات الثلاث وبنفس المفاتيح في `messages/{ar,tr,en}.json`.
2. **معايير `AGENTS.md` التركية:**
   - العلامة دائماً `"KENDİN TASARLA"` (ممنوع `"KENDİ TASARLA"`).
   - ممنوع `"Konum"` لمواضع الطباعة؛ استخدم `"Baskı Alanı"` / `"Yerleşim"`.
   - تسميات قصيرة ومتجاوبة لشاشات الموبايل `360px–414px` وهدف لمس لا يقل عن `44x44px`.
3. **التطابق التام بين المشروعين:** أي تعديل في `printPlacementConfig.ts` أو `customizationConfig.ts` يُطبق على `D:\kenditasarl` و`D:\kenditasarl-admin` معاً.
4. **التحقق بعد كل تعديل:**
   - تشغيل `npx tsc --noEmit` في `D:\kenditasarl` و`D:\kenditasarl-admin`.
   - تشغيل `npx tsx src/lib/crossProjectIntegration.test.ts` (وكافة اختبارات `src/lib/*.test.ts` ذات الصلة).
   - **عدم** تشغيل `npm run build` في `D:\kenditasarl-admin` أثناء عمل سيرفر التطوير.

---

## 8. بروتوكول استئناف العمل بين الجلسات (Session Handoff Protocol)

عند فتح جلسة جديدة لاستكمال المرحلة التالية، انسخ الرسالة التالية مع تحديد رقم المرحلة:

```text
مرحباً، نستكمل مشروع توسعة الاستوديو متعدد المنتجات وفق الملف المرجعي:
D:\kenditasarl\STUDIO_MULTI_PRODUCT_ROADMAP.md

المطلوب في هذه الجلسة:
[نفّذ المرحلة 1: استوديو الأكواب بالكامل / أو المرحلة 2: القبعات / أو المرحلة 3: أغلفة الهواتف]
مع الالتزام التام بقواعد AGENTS.md (AR/TR/EN)، المعاينة التفاعلية، ربط Admin Panel، وتحديث ملف خارطة الطريق بعد التحقق من TypeScript والاختبارات.
```
