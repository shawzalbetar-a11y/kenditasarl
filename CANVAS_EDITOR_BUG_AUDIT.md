# Kendin Tasarla — تقرير التدقيق التشخيصي الشامل لمحرر Canvas (Phase 08A.0)

- **التاريخ:** 2026-11-17
- **المرحلة:** `Phase 08A.0 — Canvas Editor Bug Audit` (تدقيق تشخيصي فقط — بدون أي تعديل على ملفات الكود)
- **بيئة الاختبار الفعلي:** البيئة المحلية المعزولة (`scripts/dev-isolated.mjs`) — Store على `http://localhost:3000`، Admin على `http://localhost:3001`، محاكيات Firebase (`demo-kenditasarla-rules`: Auth `19099` + Firestore `18080`)، و`MOCK_CLOUDINARY=1` (صفر اتصال ببيئة الإنتاج `kanditasarl`).
- **الأدوات المستخدمة:** تشغيل حقيقي عبر Chrome Headless (`playwright-core`, `channel: "chrome"`) + فحص بصري للقطات الشاشة (`Desktop 1440×900`, `1280×800`, `Mobile 375×812`, `Mobile 430×932`، واللغات `tr`, `ar`, `en`) + فحص ثابت للكود المصدري.

---

## 1. خريطة مكونات محرر Canvas

### أ. مشروع المتجر (`D:\kenditasarl`)

| الملف | الحجم التقريبي | الدور والمسؤولية |
|---|---|---|
| `src/app/[locale]/design-studio/[[...productId]]/page.tsx` | 465 سطر | صفحة استوديو التصميم: تحميل المنتج والمتغيرات والقالب المنشور (`print_template_revisions`)، تطبيع أسماء الأوجه، تمرير `productData` إلى `FabricCanvas`، وقفل تمرير الصفحة على الجوال. |
| `src/components/editor/FabricCanvas.tsx` | 10,312 سطر | **المكوّن الأحادي الرئيسي للمحرر:** إدارة دورة حياة `fabric.Canvas`، الأوجه والألوان، مناطق الطباعة (`placementsByColor`, `isFreeMode`)، القص (`clipPath`)، Undo/Redo، الحفظ التلقائي (`localStorage`)، التصدير والحفظ إلى Firestore/السلة، التسعير الفوري، معاينة 2D/3D، وشرائط الأدوات للـ Desktop والـ Mobile. |
| `src/components/editor/ProductSelector.tsx` | 190 سطر | شاشة اختيار المنتج عند فتح `/design-studio` بدون `productId`. |
| `src/components/editor/AssetGalleryModal.tsx` | 317 سطر | نافذة معرض الرسومات والملصقات الكامل (بحث، تصنيفات، مجاني/مدفوع). |
| `src/components/editor/UserMediaSidebar.tsx` | 460 سطر | لوحة "تصاميمي / Tasarımlarım" العائمة فوق الكانفس (المرفوعات + الملصقات المستخدمة مؤخرًا). |
| `src/components/editor/GarmentPlacementGuide.tsx` | 1,018 سطر | دليل مناطق الطباعة المعتمدة للملابس والأكواب والقبعات وأغلفة الهواتف + التبديل للوضع الحر. |
| `src/components/editor/MugStudioControls.tsx` | — | شريط التحكم بأنماط طباعة الكوب (`Tam Çevre 360°`, `Tek Yüz`, `Çift Yüz`) وزر المعاينة ثلاثية الأبعاد. |
| `src/components/editor/Mug3DPreviewModal.tsx` + `Mug3DStage.tsx` | — | عارض الكوب التفاعلي ثلاثي الأبعاد (360° WebGL/Canvas). |
| `src/components/editor/MultiVariantMatrixModal.tsx` | — | مصفوفة اختيار عدة مقاسات وألوان وكميات + خيار المزامنة بين الألوان. |
| `src/components/editor/ValidationModal.tsx` | — | نافذة التحقق قبل الإضافة للسلة (العناصر خارج الحدود / النص الافتراضي). |
| `src/components/editor/tools/TextTools.tsx` | 498 سطر | خصائص النص لسطح المكتب (المحتوى، الخطوط، الحجم، الألوان، الظل، التحديد، التباعد). |
| `src/components/editor/tools/MobileTextToolbar.tsx` | 684 سطر | شريط تحرير النص السفلي المخصص للجوال. |
| `src/components/editor/tools/ImageTools.tsx` | 486 سطر | أدوات الصور والملصقات (التلوين، الممحاة السحرية `RemoveColor`، الفلاتر، القلب، التكرار، التوسيط، الملاءمة). |
| `src/components/editor/tools/LayerPanel.tsx` | 128 سطر | إدارة الطبقات (الترتيب للأمام/الخلف، الإظهار/الإخفاء، القفل، الحذف). |
| `src/components/editor/tools/PrecisionControls.tsx` | 246 سطر | أداة التحريك الدقيق بالبكسل (`1px/5px/15px`)، التدوير (`±15°`)، التكبير/التصغير، والتوسيط. |
| `src/lib/faceCoordinates.ts` | 108 أسطر | عقد الإحداثيات (`EditorFrame`, `faceCoordinates`, `serializeEditorFace`) وقائمة الخصائص المسلسلة `SERIALIZE_PROPERTIES`. |
| `src/lib/customizationConfig.ts` + `src/lib/placementBounds.ts` + `src/lib/printPlacementConfig.ts` | — | تعريف مناطق الطباعة القياسية والمعايرة الفيزيائية (`physicalWidthCm`, `targetDPI`). |
| `src/lib/categoryTranslations.ts` | 70 سطر | ترجمة أسماء تصنيفات مكتبة الملصقات بين `ar / tr / en`. |

### ب. مشروع الأدمن (`D:\kenditasarl\kenditasarl-admin`) — نقاط الترابط مع المحرر

| الملف | الدور ونقطة الترابط مع Canvas |
|---|---|
| `src/lib/production-plan.ts` | يتحقق صارمًا من `production_snapshot` و`canvas_json` و`coordinates` وتعيين كل عنصر (`assignedPlacementId` / `placementId`)؛ أي نقص أو تعارض يوقف التوليد بخطأ `MAPPING` أو `GEOMETRY` أو `NEEDS_REVIEW`. |
| `src/lib/production-renderer.ts` | يعيد تحميل `scene.objects` عبر `canvas.loadFromJSON({ objects: scene.objects })` ويطبّق `outputTransform` — يتأثر مباشرةً بتلف `src` أو `clipPath` غير المتزامن. |
| `src/components/ProductionFileGenerator.tsx` | واجهة توليد ملفات الإنتاج (PNG/ZIP) لقسم الطباعة في صفحة الطلب. |
| `src/components/admin/PrintTemplateBuilder.tsx` | أداة إنشاء ونشر قوالب الطباعة المعايرة (`print_template_revisions`). |

---

## 2. جدول الأخطاء المؤكدة (مرتبة حسب الأولوية: P0 / P1 / P2)

> **تمييز صارم:** هذا الجدول يحتوي فقط على **الأخطاء المؤكدة** بدليل مباشر (تشغيل متصفح حقيقي ولقطات شاشة و/أو قراءة مباشرة للسطور المسببة). المخاطر المحتملة والميزات غير المكتملة مفصولة في القسم الفرعي (2.ب) أدناه.

### 2.أ. الأخطاء المؤكدة (Confirmed Bugs)

| # | الأولوية | العنوان | الإثبات | الملف والدالة |
|---|---|---|---|---|
| **B-01** | **P0** | اختفاء جميع عناصر التصميم بصريًا بعد إعادة تحميل الصفحة (`Reload`) بسبب `clipPath` قديم على إحداثيات `1000×1000` | اختبار متصفح حقيقي (`wf-02-after-reload.png`) + قراءة كود | `FabricCanvas.tsx:2249-2275`, `2342-2360`, `3808-3835` |
| **B-02** | **P0** | تكرار العناصر (`Duplicate`) يحذف جميع بيانات الأصل والتسعير (`originalAssetId`, `assetPrice`, `assetVersion`, `isCustomUpload`) | قراءة كود + اختبار متصفح (`stepE`) | `FabricCanvas.tsx:6932-6954` (`handleDuplicateActive`) و`ImageTools.tsx:216-234` (`duplicate`) |
| **B-03** | **P0** | مسح `obj.src` إلى سلسلة فارغة `""` لملصقات المكتبة عند التطهير قبل الحفظ إذا تحولت إلى `data:image/` (لأن `originalAssetId` هو ID وليس URL) | قراءة كود مباشرة | `FabricCanvas.tsx:5497` + `FabricCanvas.tsx:6373-6376` |
| **B-04** | **P1** | عدم تهيئة منطقة طباعة الكوب الافتراضية (`mug_full_wrap`) عند استخدام اسم لون نصي (`white`) بسبب عدم تطابق مفتاح اللون (`white` مقابل `#ffffff`) | اختبار متصفح حقيقي (`desktop-mug-001.png`, `canvas_comprehensive_audit.json`) + قراءة كود | `FabricCanvas.tsx:507-518` مقابل `FabricCanvas.tsx:907-920` |
| **B-05** | **P1** | لوحة "Tasarımlarım / تصاميمي" العائمة مفتوحة افتراضيًا وتغطي 32% من الكانفس وتحجب منطقة `Sol Göğüs` وشريط الخامة وتتداخل مع شريط أدوات العنصر | اختبار متصفح حقيقي (`desktop-tshirt-initial.png`, `tool-01`, `audit-10-locale-ar.png`) | `UserMediaSidebar.tsx:141, 155-168, 226-232` |
| **B-06** | **P1** | `Undo` و`Redo` يستدعيان `saveDraft(canvas)` بينما `isRestoring.current === true` (مما يبطل الحفظ الفوري) ولا يعيدان تطبيق `clipPath` أو مسح `activeObject` | اختبار متصفح حقيقي (`stepE_toolbarUndoRedo`) + قراءة كود | `FabricCanvas.tsx:4002-4085` (`undo`, `redo`) + `1728` |
| **B-07** | **P1** | بقاء شريط أدوات العنصر العائم (`Ortala / Sil / الأسهم`) ظاهرًا بحالة قديمة بعد التبديل إلى وجه فارغ (`Arka Yüz`) | اختبار متصفح حقيقي (`tool-05-back-face.png`) + قراءة كود | `FabricCanvas.tsx:4127-4144` (`switchFace`) |
| **B-08** | **P1** | الكانفس على الجوال (`375px` و`430px`) يبدأ بتكبير افتراضي `150%` فيتجاوز عرض الشاشة (`500px` على `375px` و`582px` على `430px`) ويقص حواف القميص | اختبار متصفح حقيقي (`mobile-375-tshirt.png`, `mobile-430-tshirt.png`) + قراءة كود | `FabricCanvas.tsx:1851-1868` |
| **B-09** | **P1** | أدوات التوسيط والملاءمة في `ImageTools` و`PrecisionControls` توسّط العنصر على كامل الكانفس (`800×800`) وليس داخل منطقة الطباعة النشطة (مثلاً `Sol Göğüs`) | قراءة كود مباشرة | `ImageTools.tsx:236-263` و`PrecisionControls.tsx:78-102` |
| **B-10** | **P1** | خطأ ترجمة وقت التشغيل `IntlError: MISSING_MESSAGE: Editor.startDesigning` في `ProductSelector` (يظهر نص المفتاح الخام في DOM) | اختبار متصفح حقيقي (`ProductSelector-TR`, `canvas_comprehensive_audit.json:69-75`) | `ProductSelector.tsx:173` + `messages/{tr,ar,en}.json` |
| **B-11** | **P1** | عدم تطابق مفتاح اللون بين `facesData` (`white:::front`) و`placementsByColor` (`#ffffff`) في `localStorage` | اختبار متصفح حقيقي (`canvas_workflow_verify.json:225-235`) + قراءة كود | `FabricCanvas.tsx:1296-1303` (`getFaceStateKey`) مقابل `907-913` (`normalizeColorKey`) |
| **B-12** | **P1** | في `processImageFile`: استبدال `dataUrl` بـ `setSrc(httpsUrl)` بدون معالجة فشل التحميل يترك `obj.src = ""` ويفقد الصورة عند أي 404/CORS | اختبار متصفح حقيقي (`stepD_imageUpload`, `canvas_workflow_verify.json:202-205`) + قراءة كود | `FabricCanvas.tsx:5605-5622` |
| **B-13** | **P1** | في `LayerPanel`: أيقونة القفل (`<Lock />`) لا تظهر أبدًا بعد قفل الطبقة لأن `toggleLock` يبقي `selectable: true` بينما العرض يفحص `obj.selectable === false` | قراءة كود مباشرة | `LayerPanel.tsx:44-63` مقابل `LayerPanel.tsx:100` |
| **B-14** | **P1** | درج `Grafikler` على الجوال (`375px`) يعرض بطاقات الملصقات فارغة (بيضاء بدون صور) ويدفع شريط التنقل السفلي خارج الشاشة (`y=820 > 812`) ولا يغلق بزر `Escape` | اختبار متصفح حقيقي (`wf-03-mobile375-grafikler-drawer.png`, `canvas_workflow_verify.json:283-292`) | `FabricCanvas.tsx:7801-7829`, `7570-7640` |
| **B-15** | **P1** | فقدان رقم إصدار الأصل `assetVersion` عند الإدراج من الشريط الجانبي أو `AssetGalleryModal` (يعود دائمًا إلى `1`) | قراءة كود مباشرة | `FabricCanvas.tsx:7806` + `AssetGalleryModal.tsx:18-25` |
| **B-16** | **P2** | شارة `"SVG"` خاطئة على جميع الملصقات في `AssetGalleryModal` حتى لو كانت ملفات `.png` | اختبار متصفح حقيقي (`audit-03-asset-gallery-modal.png`) + قراءة كود | `AssetGalleryModal.tsx:282-286` |
| **B-17** | **P2** | أزرار `3D Canlı Önizleme` و`3D Önizleme` على التيشيرت/الهودي/القبعة تفتح معاينة **2D مسطحة** بدون WebGL، مع تكرار أزرار 3D (زران للملابس و3 أزرار للكوب) وأزرار Undo/Redo | اختبار متصفح حقيقي (`audit-07-tshirt-3d-preview.png`, `desktop-mug-001.png`) | `FabricCanvas.tsx:7437-7475`, `8066-8099` |
| **B-18** | **P2** | فشل تحميل شعار الموقع (`/favicon.svg` و`/images/logo-192.png` يعيدان `404`) في كل الصفحات (Desktop + Mobile) | اختبار متصفح حقيقي (`http404s`, جميع اللقطات) | `src/app/[locale]/layout.tsx:25-33`, `Header.tsx:155, 275, 355`, `Footer.tsx:24` |
| **B-19** | **P2** | عنوان الصفحة `<title>` ثابت ومختلط اللغات (`Kendin Tasarla \| صمم منتجك بنفسك`) في اللغات الثلاث (`tr`, `ar`, `en`) | اختبار متصفح حقيقي (`localeParity`) | `src/app/[locale]/layout.tsx:19` |
| **B-20** | **P2** | قصّ وتداخل عناصر واجهة متعددة: زر `+` لحجم الخط في `TextTools` مقصوص، تداخل `Henüz baskı alanı seçilmedi` مع `Baskı Alanı Rehberi` على `375px`، تداخل شريط الزوم مع مبدّل الأوجه في RTL (`ar`) ومع شارة `1:1 Gerçek Ölçek` في القبعة، وتغطية Toast لزر `Sepete Ekle` | اختبار متصفح حقيقي (`wf-01`, `mobile-375-tshirt.png`, `audit-10-locale-ar.png`, `desktop-hat-001.png`, `tool-01`) | `TextTools.tsx:262-300`, `FabricCanvas.tsx` |
| **B-21** | **P2** | تكرار عنوان `"Katman Yönetimi"` مرتين متتاليتين، وعرض اسم `"sticker"` / `"textbox"` العام بدل `assetName` أو نص الـ `textbox`، واستخدام `key={idx}` | اختبار متصفح حقيقي (`wf-01`, `tool-01`) + قراءة كود | `LayerPanel.tsx:96, 102, 106` + `FabricCanvas.tsx` |
| **B-22** | **P2** | تسرب لغوي ومخالفات توطين: تصنيفات إنجليزية (`Badges`, `Typography`) في التركية، `"Temel Hoodie Fiyatı"` بدل `"Kapüşonlu"`، `"KDV"` في العربية، وتسميات خطوط وألوان `MobileTextToolbar` بالعربية فقط | اختبار متصفح حقيقي (`desktop-hoodie-001.png`, `audit-10-locale-ar.png`) + قراءة كود | `categoryTranslations.ts`, `MobileTextToolbar.tsx:45-91`, `FabricCanvas.tsx` |
| **B-23** | **P2** | أحجام أهداف اللمس على الجوال (`15` زرًا أصغر من `40×40px` منها `28×28px` و`16×16px`) مخالفة لمعيار `44×44px` في `AGENTS.md` | اختبار متصفح حقيقي (`mobile375.metrics.smallButtonsSample`) | `FabricCanvas.tsx` (شريط الأدوات العلوي وشريط الزوم للجوال) |

---

### تفاصيل الأخطاء الجوهرية (P0 و P1)

#### B-01 [P0] — اختفاء جميع عناصر التصميم بعد إعادة تحميل الصفحة (`Reload`)
- **الوصف:** عند وجود تصميم محفوظ في `localStorage` (ملصق + نص + صورة) وإعادة تحميل الصفحة، تُستعاد جميع العناصر في الذاكرة وتظهر في قائمة الطبقات ويُحسب سعرها (`285 ₺`)، لكنها تكون **مخفية بالكامل بصريًا** على الكانفس.
- **خطوات إعادة الإنتاج:**
  1. افتح `/tr/design-studio/tshirt-001`، اختر `Sol Göğüs Logosu`.
  2. أضف ملصقًا ونصًا (يتحقق الحفظ في `draft_design_tshirt-001` عند `left: 479.5, top: 251.5` على كانفس `800×800`).
  3. أعد تحميل الصفحة (`F5` / `page.reload()`).
- **النتيجة المتوقعة:** ظهور الملصق والنص في مكانهما الصحيح داخل مربع `Sol Göğüs Logosu`.
- **النتيجة الفعلية (`wf-02-after-reload.png`):** الطبقات الثلاث موجودة في `Katman Yönetimi` والسعر `285 ₺` صحيح، لكن منطقة `Sol Göğüs Logosu` على القميص **فارغة تمامًا بصريًا**.
- **السبب الجذري:**
  1. عند الـ mount، `mockupNaturalSize` يبدأ `{ width: 0, height: 0 }` (`FabricCanvas.tsx:2249`)، فيكون `nativeWidth = 1000, nativeHeight = 1000` (`2268-2274`).
  2. بعد `100ms` يعمل `initCanvas.loadFromJSON` (`3808`) ويستدعي `applyPrintBoundaryClip(obj)` (`3830`) بـ closure قديم يرى `1000×1000`، فيضع `clipPath` حول `left ≈ 540, top ≈ 255` بينما العناصر محفوظة على إحداثيات `800×800` (`left: 479.5`).
  3. عندما يكتمل تحميل صورة الـ mockup (`800×800`)، يقوم `useEffect` في `2342-2360` بتغيير أبعاد الكانفس إلى `800×800` واستدعاء `canvas.renderAll()` **دون استدعاء `applyAllPrintBoundaryClips(canvas)`**! فتبقى جميع العناصر مقصوصة خارج مستطيل `clipPath` ولا يُرسم منها بكسل واحد.
- **الملف والدالة:** `src/components/editor/FabricCanvas.tsx` — `useEffect` لمزامنة أبعاد الكانفس (`2342-2360`) + `initCanvas.loadFromJSON` (`3808-3835`).
- **الإصلاح المقترح:** استدعاء `applyAllPrintBoundaryClipsRef.current?.(canvas)` داخل `useEffect` تحديث `totalCanvasWidth / totalCanvasHeight` (`2352-2359`)، وتمرير `parsed.width / parsed.height` عند حساب `applyPrintBoundaryClip` أثناء الاستعادة، والتأكد من استخدام `applyPrintBoundaryClipRef.current` بدل الإغلاق القديم داخل `restoreTimer`.
- **تأثير الإصلاح على بقية النظام:** يحمي دقة `clipPath` المسلسَل في `canvas_json` قبل الحفظ إلى السلة والـ `Production Renderer` (`production-renderer.ts:26`) الذي يعيد تحميل `scene.objects` مباشرة؛ لا يؤثر على التسعير أو الـ Checkout.

#### B-02 [P0] — `Duplicate` يمسح بيانات الأصل والتسعير (`originalAssetId`, `assetPrice`, `assetVersion`, `isCustomUpload`)
- **الوصف:** تكرار أي ملصق مدفوع أو صورة مرفوعة عبر زر "Çoğalt" في الشريط العائم أو `ImageTools` ينتج نسخة منزوعة الخصائص المخصصة.
- **خطوات إعادة الإنتاج:**
  1. أضف ملصقًا مدفوعًا (`+35 ₺` — `Anadolu Kartalı`).
  2. اضغط زر التكرار (`Çoğalt`) في الشريط العائم أو في `ImageTools`.
  3. احذف النسخة الأصلية وأبقِ النسخة المكررة.
- **النتيجة المتوقعة:** احتفاظ النسخة المكررة بـ `originalAssetId`, `assetVersion`, `assetPrice`, `assetName`, `assetType`, `name` وبقاء السعر `+35 ₺`.
- **النتيجة الفعلية:** في Fabric.js v5، `obj.clone(callback)` بدون المعامل الثاني `SERIALIZE_PROPERTIES` يتجاهل كل الخصائص المخصصة. النتيجة: تجاوز سعر الملصق المدفوع (عند حذف الأصل) + فقدان `originalAssetId` و`assetVersion` في `production_snapshot`، وفي `ImageTools.tsx:218` يفقد حتى `assignedPlacementId` (ما قد يسبب خطأ `MAPPING` في `production-plan.ts:48-59`).
- **السبب الجذري:** `FabricCanvas.tsx:6938` (`obj.clone((cloned) => ...)`) و`ImageTools.tsx:218` (`activeObject.clone((cloned) => ...)`) لا يمرران `SERIALIZE_PROPERTIES`.
- **الإصلاح المقترح:** تمرير `SERIALIZE_PROPERTIES` كمعامل ثانٍ في كل استدعاءات `clone(callback, SERIALIZE_PROPERTIES)` في كلا الملفين، مع إعادة حساب السعر (`recalculatePrice`) وتطبيق `applyPrintBoundaryClip(cloned)`.
- **تأثير الإصلاح على بقية النظام:** يضمن اتساق التسعير الفوري مع تسعير الخادم (Phase 05B/07A) ويمنع فشل `production-plan.ts` عند التحقق من `assignedPlacementId`.

#### B-03 [P0] — تطهير الحفظ يمسح `obj.src` لملصقات المكتبة إذا كان `src` بصيغة `data:image/`
- **الوصف:** عند الحفظ إلى Firestore/السلة (`FabricCanvas.tsx:6373-6376`)، إذا كان لأي صورة `src` يبدأ بـ `data:image/` يقوم الكود باستبداله بـ `obj.originalAssetId` **فقط** إذا بدأ بـ `http`، وإلا يضعه `""`.
- **السبب الجذري:** في `addSticker` (`FabricCanvas.tsx:5497`) تم تعيين `originalAssetId: asset?.id || url` (وهو معرّف Firestore مثل `"sticker-eagle"` وليس رابط `http`). بالتالي أي حالة يتحول فيها `src` إلى `data:image/` (فلاتر/تصدير/تحويل) تؤدي إلى تصفير `obj.src = ""` نهائيًا في التصميم المحفوظ وملف الإنتاج!
- **الإصلاح المقترح:** حفظ `assetUrl` (أو استرجاع الرابط من `designAssets` عبر `originalAssetId`) قبل تصفير `src`، وعدم مسح `src` إذا لم يتوفر رابط بديل صالح إلا مع إظهار خطأ واضح للمستخدم بدل حفظ عنصر مكسور بصمت.
- **تأثير الإصلاح:** يمنع خروج طلبات إنتاج بملصقات فارغة في `production-renderer.ts`.

#### B-04 [P1] — كسر منطقة الطباعة الافتراضية للكوب (`mug_full_wrap`) عند بدء التشغيل
- **الوصف:** عند فتح صفحة الكوب `/tr/design-studio/mug-001`، يظهر تحذير `"Henüz baskı alanı seçilmedi"` ويعمل الكوب في وضع `Tek Yüz` بدل وضع البانوراما 360° المقصود.
- **خطوات إعادة الإنتاج:** افتح `/tr/design-studio/mug-001` بذاكرة محلية نظيفة (حيث لون المتغير الأول `"white"` وليس `"#ffffff"`).
- **النتيجة المتوقعة:** تفعيل `mug_full_wrap` تلقائيًا وظهور مساحة البانوراما 360°.
- **النتيجة الفعلية (`desktop-mug-001.png`):** عرض `"Henüz baskı alanı seçilmedi"` وعدم تفعيل مساحة البانوراما.
- **السبب الجذري:** في `FabricCanvas.tsx:513-517`، يُنشأ `placementsByColor` بالمفتاح الخام `resolvedInitialColor.trim().toLowerCase()` (`"white"`). لكن عند القراءة في `FabricCanvas.tsx:907-920` يُستخدم `activeColorKey = normalizeColorKey(selectedColor)` الذي يحوّل `"white"` إلى `"#ffffff"`. وبما أن `placementsByColor["#ffffff"]` غير موجود، يرجع `[]`! (نفس الخلل موجود في السطر `507`).
- **الإصلاح المقترح:** استخدام `COLOR_MAP[raw]?.toLowerCase() || raw` (أي نفس منطق `normalizeColorKey`) داخل تهيئة `useState` للـ `placementsByColor` في السطور `507` و`514`.
- **تأثير الإصلاح:** يصلح تشغيل استوديو الأكواب فورًا دون تعديل قواعد التسعير أو التخزين.

#### B-05 [P1] — لوحة `UserMediaSidebar` ("Tasarımlarım") تحجب 32% من الكانفس افتراضيًا
- **الوصف:** اللوحة البيضاء العائمة تفتح تلقائيًا فوق الكانفس في سطح المكتب، فتغطي منطقة `Sol Göğüs Logosu`، تقطع شريط `MALZEME` البرتقالي، وتتصادم مع الشريط الأسود العائم للأدوات (وتشطر عنوان `"Tasarımlarım"` نصفين كما ظهر في `tool-01-sticker-added.png` و`tool-02-text-added.png`). وحتى بعد طيّها إلى زر صغير (`audit-02-paid-sticker-added.png`)، لا يزال الزر المطوي يغطي طرف شريط `MALZEME`.
- **السبب الجذري:** `UserMediaSidebar.tsx:141, 164` يضع `isCollapsed = false` افتراضيًا لـ `>= 1024px` مع تموضع `absolute top-3 end-3 z-40 w-80` داخل حاوية الكانفس نفسها.
- **الإصلاح المقترح:** جعل اللوحة مطوية افتراضيًا (`isCollapsed = true`)، أو دمجها ضمن تبويب `"Dosya Yükle"` في الشريط الجانبي الأيسر، وإزالة تموضعها العائم فوق الكانفس/شريط الخامة.
- **تأثير الإصلاح:** تحسين جذري لوضوح منطقة العمل في اللغات الثلاث (LTR وRTL) دون أي تأثير على منطق Canvas أو الحفظ.

#### B-06 [P1] — خلل مزامنة الحفظ والقص والتحديد في `Undo` / `Redo`
- **الوصف:** في اختبار المتصفح (`stepE_toolbarUndoRedo`)، بعد تكرار عنصر (3 ← 4) والضغط على `Geri Al`، بقيت المسودة في `localStorage` تحتوي 4 عناصر (لم يُحفظ التراجع إلا بالصدفة عند `beforeunload` قبل إعادة التحميل). كما أن `undo` و`redo` لا يعيدان تطبيق `applyAllPrintBoundaryClips` ولا `isLocked` ولا يصفّران `activeObject`.
- **السبب الجذري:** في `FabricCanvas.tsx:4033-4037` و`4076-4080`، يُستدعى `saveDraft(canvas)` **قبل** `isRestoring.current = false`، بينما `saveDraftImmediate` (`1728`) يرفض الحفظ تمامًا إذا كان `isRestoring.current === true`!
- **الإصلاح المقترح:** ضبط `isRestoring.current = false` قبل استدعاء `saveDraft(canvas)`، واستدعاء `applyAllPrintBoundaryClips(canvas)` و`setActiveObject(null)` داخل callback كل من `undo` و`redo`.

#### B-07 [P1] — بقاء شريط أدوات العنصر العائم بعد التبديل إلى وجه فارغ
- **الوصف:** عند تحديد عنصر في `Ön Yüz` ثم التبديل إلى `Arka Yüz` الفارغ، يبقى الشريط الأسود العائم (`Ortala | Sil | ← ↑ ↓ →`) ظاهرًا فوق الوجه الخلفي (`tool-05-back-face.png`).
- **السبب الجذري:** `switchFace` (`FabricCanvas.tsx:4127-4144`) لا تستدعي `canvas.discardActiveObject()` ولا `setActiveObject(null)`.
- **الإصلاح المقترح:** إضافة `canvas?.discardActiveObject(); setActiveObject(null);` في بداية `switchFace`.

#### B-08 [P1] — تجاوز عرض الكانفس لعرض الشاشة على الجوال بسبب الزوم الافتراضي `150%`
- **الوصف:** على `375px` يظهر الكانفس بعرض `500px` (`x: -62px`)، وعلى `430px` بعرض `582px` (`x: -76px`)، مما يقص جانبي القميص من أول لحظة (`mobile-375-tshirt.png`, `mobile-430-tshirt.png`).
- **السبب الجذري:** `FabricCanvas.tsx:1866` يفرض `setZoomLevel(1.5)` افتراضيًا لأي شاشة `< 1024px`.
- **الإصلاح المقترح:** البدء بـ `zoomLevel = 1` (100% — احتواء كامل للمنتج داخل الشاشة) مع إبقاء أزرار `+ / -` للتكبير عند رغبة المستخدم.

#### B-09 [P1] — التوسيط والملاءمة في `ImageTools` و`PrecisionControls` يتجاهلان منطقة الطباعة النشطة
- **الوصف:** أزرار `center`, `fitToPrintArea` (`ImageTools.tsx:236-263`) و`centerHorizontal`, `centerVertical`, `centerBoth` (`PrecisionControls.tsx:78-102`) تستدعي `canvas.centerObject(activeObject)` الذي ينقل العنصر إلى منتصف القميص (`400, 400`) حتى لو كانت المنطقة المختارة هي `Sol Göğüs Logosu` (`432..527, 204..299`)، فيُقص العنصر ويختفي خلف الـ `clipPath`! كما أن `PrecisionControls.moveObject` لا يطبّق قيود الحدود ولا يطلق `object:modified`.
- **الإصلاح المقترح:** تمرير دالة/مستطيل `activePrintZone` (من `getActiveObjectPrintZone`) إلى كلا المكوّنين للتوسيط والملاءمة داخل مستطيل المنطقة النشطة، وإطلاق `canvas.fire('object:modified', { target: activeObject })` بعد كل تحريك/تحجيم.

#### B-10 [P1] — مفتاح ترجمة مفقود `Editor.startDesigning` يرمي `IntlError`
- **الوصف:** فتح `/tr/design-studio` يسجّل خطأ `IntlError: MISSING_MESSAGE: Could not resolve Editor.startDesigning` في وحدة التحكم، ويعرض النص الخام `"Editor.startDesigning"` عند تمرير المؤشر على بطاقة المنتج.
- **السبب الجذري:** المفتاح `Editor.startDesigning` غير موجود في `messages/{tr,ar,en}.json`، كما أن الكود في `ProductSelector.tsx:173` (و~25 موضعًا آخر في `FabricCanvas.tsx` و`LayerPanel.tsx`) يستخدم `t('key', { fallback: '...' })` وهي صيغة غير صالحة في `next-intl` (المعامل الثاني هو لمتغيرات الاستبدال وليس نصًا بديلًا).
- **الإصلاح المقترح:** إضافة `Editor.startDesigning` في القواميس الثلاثة (`tr: "Tasarlamaya Başla"`, `ar: "ابدأ التصميم"`, `en: "Start Designing"`)، وتدقيق وإزالة جميع استخدامات `{ fallback: ... }` غير المدعومة.

#### B-11 [P1] — عدم توحيد مفتاح اللون بين `facesData` و`placementsByColor`
- **الوصف:** في `localStorage` يُحفظ وجه التصميم بمفتاح `"white:::front"` (`getFaceStateKey` يستخدم النص الخام) بينما تُحفظ مناطق الطباعة بمفتاح `"#ffffff"` (`normalizeColorKey`).
- **التأثير:** خطر فقدان الربط بين الأوجه ومناطق الطباعة عند تبديل الألوان أو استرجاع المسودات القديمة أو تطابق أسماء الألوان المترجمة (`Beyaz` / `أبيض` / `white` / `#ffffff`).
- **الإصلاح المقترح:** توحيد التطبيع عبر `normalizeColorKey` في كل من `getFaceStateKey` و`placementsByColor` مع دعم قراءة المفاتيح القديمة للخلفية (`backward compatibility`).

#### B-12 [P1] — تلف الصورة المرفوعة (`src: ""`) عند فشل `setSrc` في `processImageFile`
- **الوصف:** عند رفع صورة، تُعرض محليًا بـ `dataUrl` ثم تُرفع بالخلفية ويُستدعى `imgObj.setSrc(httpsUrl, ...)` (`FabricCanvas.tsx:5606`). إذا فشل تحميل الرابط (404 / خطأ شبكة / CORS)، لا يوجد معالج خطأ ويُحفظ العنصر في المسودة بـ `src: ""` (مؤكد في `stepD_imageUpload`).
- **الإصلاح المقترح:** التحقق من تحميل `httpsUrl` مسبقًا عبر `new Image()` مع `crossOrigin = 'anonymous'` قبل استبدال `dataUrl`؛ وإذا فشل التحميل، إبقاء النسخة المحلية مؤقتًا مع تنبيه المستخدم وإعادة محاولة الرفع.

#### B-13 [P1] — تعطل حالة أيقونة القفل في `LayerPanel`
- **الوصف:** النقر على زر القفل في `LayerPanel.tsx:44-63` يقفل حركة وتحجيم العنصر ويضع `selectable: true` (ليتمكن المستخدم من تحديده وفك قفله)، لكن السطر `100` يفحص `const isLocked = obj.selectable === false;` — فتبقى الأيقونة `<Unlock />` دائمًا ولا تعكس حالة القفل! (وبالمقابل، عند إعادة التحميل في `FabricCanvas.tsx:3816` يضع `selectable: false, evented: false` مما يمنع فك القفل من الكانفس!).
- **الإصلاح المقترح:** توحيد فحص القفل في `LayerPanel.tsx:100` إلى `const isLocked = (obj as any).isLocked === true || obj.selectable === false || (obj as any).lockMovementX === true;` وتوحيد سلوك القفل عند الاستعادة في `FabricCanvas.tsx:3815`.

#### B-14 [P1] — مشاكل درج `Grafikler` على الجوال (`375px` و`430px`)
- **الوصف:** عند فتح تبويب `Grafikler` على الجوال (`wf-03-mobile375-grafikler-drawer.png`):
  1. تظهر بطاقات الملصقات الأربعة **فارغة تمامًا (مربعات بيضاء)** بدون الصور مع ظهور شارات الأسعار `+35 ₺ / +15 ₺` فقط.
  2. ينزاح شريط التنقل السفلي (`Yerleşim`, `Metin`...) خارج حدود الشاشة (`y = 820px` مقابل `windowHeight = 812px`).
  3. الضغط على `Escape` لا يغلق الدرج.
- **السبب الجذري:** استخدام `loading="lazy"` على صور الملصقات داخل حاوية درج متحركة + ارتفاع الدرج الثابت دون مراعاة `dvh` وشريط التنقل السفلي.

#### B-15 [P1] — عدم تمرير `assetVersion` عند إدراج الملصقات
- **الوصف:** الشريط الجانبي (`FabricCanvas.tsx:7806`) لا يمرر `version: sticker.version` داخل `assetPayload`، وواجهة `GalleryAsset` في `AssetGalleryModal.tsx:18-25` لا تحتوي أصلًا حقل `version`.
- **التأثير:** أي أصل يتم تحديث إصداره في الأدمن (`version: 2+`) يُحفظ على الكانفس بإصدار خاطئ `assetVersion: 1`.

---

### 2.ب. المخاطر المحتملة والميزات غير المكتملة / المضلّلة

| التصنيف | البند | التفاصيل والموقع |
|---|---|---|
| **خطر محتمل (أداء وذاكرة)** | إعادة إنشاء `fabric.Canvas` بالكامل عند كل تبديل وجه أو لون | `FabricCanvas.tsx:3107-3925` (`useEffect(..., [activeFace, selectedColor])`) يدمر (`dispose()`) ويعيد بناء `fabric.Canvas` كاملًا عند كل نقرة وجه أو لون، مع وجود ملف أحادي ضخم (10,312 سطرًا) و3 مستمعي `window.addEventListener('keydown')` منفصلين (`1945`, `4112`, `6241`). التنظيف (`cleanup`) موجود لكن إعادة الإنشاء المتكررة ترفع زمن الاستجابة وخطر حالات السباق (`race conditions` مع `restoreTimer` 100ms). |
| **خطر محتمل (قوالب الطباعة)** | استرجاع مسودة بعد تغيير أبعاد صورة الـ mockup | إذا تغيّرت أبعاد الصورة الأصلية للمنتج بدون `print_template_revision` منشور، قد تنزاح الإحداثيات لأن `nativeWidth/nativeHeight` يعتمد على `img.naturalWidth`. |
| **ميزة مضلّلة / غير مكتملة** | أزرار `"3D Canlı Önizleme"` و`"3D Önizleme"` للملابس والقبعات | على الأكواب (`mug-001`) تفتح معاينة 3D حقيقية تفاعلية (`Mug3DPreviewModal`). أما على التيشيرت والهودي والقبعة فتفتح نافذة **معاينة 2D مسطحة** (`audit-07-tshirt-3d-preview.png`, `webglCanvasCount: 0`) رغم تسمية الزرين `"3D"`. يجب تغيير التسمية للملابس إلى `"Önizleme / معاينة التصميم"` بدل `"3D"` حتى لا يُضلَّل المستخدم. |
| **ميزة غير مكتملة** | تبويب `"Yapay Zeka / AI Studio"` | ظاهر كأحد التبويبات الأربعة الرئيسية وكتذييل في الشريط الأيسر — لم يتم فحص تكامل الخلفية الخاص به ضمن نطاق هذا التدقيق؛ يجب التأكد من إخفائه أو ربطه بوضوح قبل الإطلاق. |

---

## 3. مشاكل الواجهة وتجربة المستخدم (Desktop و Mobile)

### أ. سطح المكتب (`1440×900` و`1280×800`)
1. **حجب الكانفس بـ `UserMediaSidebar` (P1):** تغطي 32% من مساحة الكانفس افتراضيًا وتتصادم مع الشريط الأسود العائم (`Ortala / Sil`) وشريط الخامة `MALZEME`.
2. **قصّ زر `+` لحجم الخط في `TextTools` (P2):** في `wf-01-sticker-and-text.png`، عرض النص `"Montserrat, Arial, sans-serif"` يدفع صندوق حجم الخط ليتجاوز الحافة اليمنى للبطاقة ويقص زر `+`.
3. **ازدواجية عناصر التحكم (P2):**
   - أزرار `Undo / Redo` مكررة في شريطين متقاربين (الشريط العلوي + شريط الكانفس).
   - أزرار `3D` مكررة مرتين للملابس و**ثلاث مرات** للأكواب (`3D Canlı Önizleme`, `3D Önizleme`, `3D Kupa Önizleme`).
   - عنوان `"Katman Yönetimi"` مكرر مرتين متتاليتين عند وجود طبقات.
4. **تداخل إشعارات الـ Toast مع زر `Sepete Ekle` (P2):** كما ظهر في `tool-01-sticker-added.png`.
5. **تداخل في وضع العربية RTL (`1440×900`) (P2):** في `audit-10-locale-ar.png`، شريط التحكم بالزوم (`+ 100% - ✋ ↺`) يتداخل مباشرة فوق زر تبديل الوجه `الواجهة الأمامية`.
6. **تداخل في منتج القبعة (`desktop-hat-001.png`) (P2):** شريط الزوم يتداخل مع شارة `1:1 Gerçek Ölçek • DTF Termal Baskı`.
7. **شعار الموقع المكسور (P2):** أيقونة صورة مكسورة في شريط التنقل الجانبي (بسبب 404 لـ `/favicon.svg` و`/images/logo-192.png`).
8. **تجربة البداية للملابس (P2):** عدم اختيار منطقة طباعة افتراضية للملابس يجبر المستخدم على نافذة منبثقة حاجبة (`Lütfen Önce Baskı Alanını Seçin`) عند أول نقرة على أي ملصق أو نص.
9. **عند عرض `1280×800`:** لا يوجد overflow أفقي (`scrollWidth === 1280`)، والكانفس يتقلص إلى `422×422px` بنجاح، لكن مع بقاء `UserMediaSidebar` (عرض `320px`) مفتوحة ستغطي قرابة ~65% من الكانفس على شاشات اللابتوب `1280px`!

### ب. الجوال (`375×812` و`430×932`)
1. **زوم افتراضي `150%` يقص المنتج (P1):** الكانفس بعرض `500px` على شاشة `375px` و`582px` على `430px`.
2. **تداخل شريط الحالة على `375px` (P2):** شارة `"Henüz baskı alanı seçilmedi"` تتعرض للقص والتداخل مع زر `"Baskı Alanı Rehberi"` (`"Henüz baskı alanı seçilm"`).
3. **درج `Grafikler` يعرض مربعات ملصقات بيضاء فارغة ويدفع شريط التنقل السفلي خارج الشاشة (P1).**
4. **أهداف لمس صغيرة (P2):** تم قياس **15 زرًا** بأبعاد أقل من `40×40px` (منها `28×28px`, `30×30px`, `16×16px`) في الشريط العلوي وأدوات الزوم، خلافًا لمعيار `44×44px` في `AGENTS.md`.
5. **`MobileTextToolbar` غير مترجم للتركية والإنجليزية (P2):** أسماء الخطوط والألوان مكتوبة بالعربية فقط داخل `MobileTextToolbar.tsx:45-91`.

---

## 4. مشاكل مناطق الطباعة (Print Areas)

1. **تعطل تهيئة الكوب الافتراضية `mug_full_wrap` (B-04 — P1):** بسبب مقارنة مفتاح اللون الخام `"white"` بمفتاح اللون المطبع `"#ffffff"`.
2. **قص العناصر المستعادة بإحداثيات `1000×1000` قديمة (B-01 — P0):** عدم إعادة حساب `applyAllPrintBoundaryClips` بعد تحديث `mockupNaturalSize`.
3. **توسيط/ملاءمة العنصر على مركز الكانفس بدل مركز منطقة الطباعة (B-09 — P1):** `ImageTools` و`PrecisionControls` يطردان العناصر خارج مناطق الطباعة الجانبية مثل `Sol Göğüs Logosu`.
4. **تجاوز حدود المنطقة عبر `PrecisionControls` (P1):** التحريك بالأسهم في `PrecisionControls` لا يستدعي فحص الحدود `checkObjectBounds` ولا `object:modified`.
5. **نقطة إيجابية مؤكدة:** بعد اختيار `Sol Göğüs Logosu` وإضافة عنصر، تُرسم المنطقة المتقطعة وتُحفظ `assignedPlacementId: "left_chest"` و`clipPath` بدقة متطابقة مع أبعاد المنطقة (`95×95px` على كانفس `800×800`).

---

## 5. مشاكل الحفظ والاسترجاع (Save & Restore)

1. **اختفاء العناصر بصريًا بعد `page.reload()` (B-01 — P0):** الإحداثيات (`left: 479.5, top: 251.5, scaleX: 0.1577`) والأسعار (`285 ₺`) و`originalAssetId` (`sticker-eagle`) تُحفظ وتُستعاد رقميًا بدقة 100% في `localStorage`، **لكن `clipPath` القديم يخفيها تمامًا من الشاشة**.
2. **`Undo` / `Redo` يفشلان في تحديث `localStorage` فورًا (B-06 — P1):** استدعاء `saveDraft` قبل فتح قفل `isRestoring.current = false`.
3. **انفصال مفاتيح الألوان في `localStorage` (B-11 — P1):** `draft_design_*` يستخدم `"white:::front"` بينما `studio_saved_placements_*` يستخدم `"#ffffff"`.
4. **تصفير `obj.src` لصور الرفع الفاشلة وملصقات المكتبة (B-03 — P0، B-12 — P1):** `processImageFile` لا يتحقق من نجاح تحميل الرابط السحابي قبل `setSrc`، ومطهر الحفظ (`6375`) يمسح `src` إذا لم يبدأ `originalAssetId` بـ `http`.
5. **فقدان الخصائص المخصصة عند التكرار (B-02 — P0):** النسخ المكررة تفقد `originalAssetId`, `assetVersion`, `assetPrice`, `isCustomUpload`.
6. **نقطة إيجابية مؤكدة:** حالة طي `UserMediaSidebar` (`studio_user_media_collapsed`) تُحفظ وتُستعاد بنجاح بعد إعادة التحميل، وكذلك `studio_recent_library_assets`.

---

## 6. مشاكل مكتبة الملصقات والأصول (Asset Library & Stickers)

1. **فقدان `assetVersion` عند الإدراج (B-15 — P1):** لا يُمرَّر `version` من الشريط الجانبي ولا من `AssetGalleryModal`.
2. **فقدان بيانات الأصل والسعر عند التكرار `Duplicate` (B-02 — P0).**
3. **شارة `"SVG"` مضللة على ملفات PNG في `AssetGalleryModal` (B-16 — P2).**
4. **ملصقات درج الجوال فارغة بصريًا (B-14 — P1):** بطاقات بيضاء فارغة في `wf-03-mobile375-grafikler-drawer.png`.
5. **اتجاه بحث المعرض ثابت لليمين في اللغات LTR (P2):** `AssetGalleryModal.tsx:156, 167, 255`.
6. **تسرب تصنيفات إنجليزية إلى التركية (B-22 — P2):** `Badges` و`Typography` غير موجودين في `CATEGORY_TRANSLATIONS` (`src/lib/categoryTranslations.ts`).
7. **عرض `"sticker"` العام في `LayerPanel` بدل `assetName` (B-21 — P2).**
8. **نقاط إيجابية مؤكدة في الاختبار الفعلي:**
   - تحميل الملصقات المجانية والمدفوعة من Firestore Emulator نجح (`4` أصول).
   - إدراج ملصق مدفوع (`+35 ₺`) حدّث السعر الإجمالي فورًا من `250 ₺` إلى `285 ₺` في كل من زر `Sepete Ekle` و`Genel Toplam` و`Baskı ve Ekstra Alanlar (+35 ₺)`.
   - نافذة `AssetGalleryModal` تفتح بسلاسة، البحث فيها يعمل (`"Kedi"` أعاد نتيجة مطابقة)، وتُغلق بزر `Escape`.

---

## 7. نتائج الاختبارات التي نُفذت فعليًا

> **ملاحظة منهجية:** جميع بنود القسم (7.أ) هي اختبارات **متصفح حي حقيقية** عبر `playwright-core` + Chrome Headless ضد الخادم المحلي المعزول (`http://localhost:3000`) وقاعدة Firestore Emulator المزروعة ببيانات تجريبية. بنود القسم (7.ب) هي **فحص ثابت للكود** ومصنّفة بوضوح كذلك.

### 7.أ. الاختبارات المنفذة فعليًا في المتصفح (Live Headless Chrome)

| الاختبار | النتيجة | الدليل / المخرجات الفعلية |
|---|---|---|
| فتح `/tr/design-studio` (`ProductSelector`) | **FAIL** | خطأ `IntlError: MISSING_MESSAGE: Editor.startDesigning` في Console + نص خام في DOM + 404 لـ `/favicon.svg` و`/images/logo-192.png` (`audit-00-product-selector.png`). |
| تحميل `/tr/design-studio/tshirt-001` (`1440×900`) | **PARTIAL FAIL** | الكانفس يتهيأ (`800×800`, حاوية `582×582`)، لكن `UserMediaSidebar` تغطي `32%` من الكانفس افتراضيًا + 404 للـ favicon/logo + `<title>` مختلط (`desktop-tshirt-initial.png`). |
| تحميل `/tr/design-studio/hoodie-001` (`1440×900`) | **PARTIAL FAIL** | الكانفس والأوجه (`Ön Yüz`, `Arka Yüz`) تعمل، لكن نفس مشاكل `UserMediaSidebar` + تسرب `"Temel Hoodie Fiyatı"` + تصنيفات إنجليزية (`desktop-hoodie-001.png`). |
| تحميل `/tr/design-studio/mug-001` (`1440×900`) | **FAIL** | يظهر `"Henüz baskı alanı seçilmedi"` رغم وجود منطق افتراضي لـ `mug_full_wrap` + 3 أزرار 3D مكررة. فتح `3D Kupa Önizleme` نجح وعرض WebGL/Canvas 3D تفاعلي (`desktop-mug-001.png`, `audit-08-mug-3d-preview.png`). |
| تحميل `/tr/design-studio/hat-001` (`1440×900`) | **PARTIAL FAIL** | الكانفس جاهز، تداخل شريط الزوم مع شارة `1:1 Gerçek Ölçek`. (ملاحظة: صورة الـ mockup المكسورة كانت بسبب رابط Unsplash التجريبي المزروع في السكربت وليست خطأ في كود المتجر). |
| إغلاق `Tasarımlarım` + اختيار `Sol Göğüs Logosu` + إدراج ملصق مدفوع (`+35 ₺`) | **PASS (وظيفيًا)** | تم الإدراج، السعر ارتفع فورًا من `250 ₺` إلى `285 ₺`، حُفظ `originalAssetId: "sticker-eagle"`, `assetPrice: 35`, `assetVersion: 1`. (الزر المطوي لا يزال يغطي طرف شريط `MALZEME`). |
| فتح `AssetGalleryModal` + البحث + إغلاق بـ `Escape` | **PARTIAL PASS** | الفتح والبحث (`"Kedi"`) والإغلاق بـ `Escape` نجحت، لكن جميع البطاقات عرضت شارة `"SVG"` خاطئة على صور PNG (`audit-03-asset-gallery-modal.png`). |
| إضافة نص (`Metin Ekle` ← `+ Yeni Metin Ekle`) | **PARTIAL PASS** | أُضيف `i-text` بنجاح داخل `Sol Göğüs Logosu` مع `assignedPlacementId: "left_chest"`، لكن زر `+` لحجم الخط في `TextTools` مقصوص خارج البطاقة (`wf-01-sticker-and-text.png`). |
| رفع صورة (`Dosya Yükle` ← `test-upload.png` مع `MOCK_CLOUDINARY=1`) | **FAIL (استمرارية الصورة)** | أُضيف `user_upload` إلى الكانفس (العدد 2 ← 3)، لكن بعد رد رابط mock السحابي (`404`) تحول `obj.src` إلى `""` في المسودة (`canvas_workflow_verify.json:202-205`). |
| التكرار (`Çoğalt`) + `Undo` (`Geri Al`) | **FAIL** | التكرار زاد العناصر 3 ← 4، لكن الضغط على `Geri Al` لم يحدّث `localStorage` فورًا (`countAfterUndo: 4`) بسبب استدعاء `saveDraft` أثناء `isRestoring === true`. |
| التبديل بين الأوجه (`Ön Yüz` ↔ `Arka Yüz`) | **PARTIAL FAIL** | حفظ واسترجاع عناصر `Ön Yüz` نجح (`count: 4`)، لكن عند وجود عنصر محدد يبقى الشريط العائم ظاهرًا بحالة قديمة فوق `Arka Yüz` الفارغ (`tool-05-back-face.png`). |
| تغيير حجم النافذة (`1440×900` ← `1280×800`) | **PASS** | تكيف حجم الكانفس (`582` ← `422px`) دون overflow أفقي (`scrollWidth === 1280`). |
| إعادة تحميل الصفحة (`page.reload()`) مع عناصر محفوظة | **FAIL (P0)** | الطبقات والسعر (`285 ₺`) والبيانات استُعيدت رقميًا بدون انزياح إحداثيات (`479.5, 251.5`)، لكن **جميع العناصر اختفت بصريًا تمامًا** على القميص (`wf-02-after-reload.png`). |
| معاينة `3D Canlı Önizleme` للتيشيرت | **PARTIAL FAIL** | تفتح نافذة معاينة 2D فقط (`webglCanvasCount: 0`) رغم اسم الزر `3D` (`audit-07-tshirt-3d-preview.png`). |
| عرض الجوال (`375×812` و`430×932`) + درج `Grafikler` | **FAIL** | زوم ابتدائي `150%` يقص القميص (`500px` على `375px`، `582px` على `430px`)، تداخل `Henüz baskı alanı seçilmedi` مع `Baskı Alanı Rehberi`، 15 زرًا `< 40px`، بطاقات الملصقات بيضاء فارغة في درج `Grafikler` ودفع شريط التنقل السفلي خارج الشاشة (`wf-03-mobile375-grafikler-drawer.png`). |
| اختبار اللغات `ar` (RTL) و`en` (`1440×900`) | **PARTIAL FAIL** | `dir="rtl"` يعمل ولا توجد مفاتيح خام على صفحة الاستوديو، لكن `<title>` مختلط في اللغتين، وشريط الزوم يتداخل فوق مبدّل الأوجه في `ar`، و`UserMediaSidebar` تحجب 32% من الكانفس، وتظهر كلمة `KDV` في العربية (`audit-10-locale-ar.png`, `audit-10-locale-en.png`). |

### 7.ب. التحقق عبر الفحص الثابت للكود (Static Code Inspection — لم يُشغّل كاختبار متصفح مستقل)
- اكتشاف إسقاط `SERIALIZE_PROPERTIES` في `FabricCanvas.tsx:6938` و`ImageTools.tsx:218` (B-02).
- اكتشاف مسح `obj.src = ""` في `FabricCanvas.tsx:6375` عند `originalAssetId` غير المبدوء بـ `http` (B-03).
- اكتشاف توسيط `canvas.centerObject` على كامل الكانفس في `ImageTools.tsx:236-263` و`PrecisionControls.tsx:78-102` (B-09).
- اكتشاف تعطل شرط أيقونة القفل في `LayerPanel.tsx:100` (B-13).
- اكتشاف غياب تمرير `assetVersion` في `FabricCanvas.tsx:7806` و`AssetGalleryModal.tsx:18-25` (B-15).
- اكتشاف نصوص عربية صلبة في `MobileTextToolbar.tsx:45-91` (B-22).
- فحص الترابط مع `kenditasarl-admin/src/lib/production-plan.ts` و`production-renderer.ts`.
- فحص القواميس الثلاثة `messages/{tr,ar,en}.json` برمجيًا للتأكد من المفاتيح المفقودة (`Editor.startDesigning` فقط).

---

## 8. الملفات المتأثرة في المشروع

### مشروع المتجر (`D:\kenditasarl`)
1. `src/components/editor/FabricCanvas.tsx` (B-01, B-02, B-03, B-04, B-06, B-07, B-08, B-11, B-12, B-14, B-15, B-17, B-20, B-21, B-22, B-23)
2. `src/components/editor/UserMediaSidebar.tsx` (B-05)
3. `src/components/editor/tools/ImageTools.tsx` (B-02, B-09)
4. `src/components/editor/tools/PrecisionControls.tsx` (B-09)
5. `src/components/editor/tools/LayerPanel.tsx` (B-13, B-21)
6. `src/components/editor/tools/TextTools.tsx` (B-20)
7. `src/components/editor/tools/MobileTextToolbar.tsx` (B-22)
8. `src/components/editor/AssetGalleryModal.tsx` (B-15, B-16, اتجاه البحث)
9. `src/components/editor/ProductSelector.tsx` (B-10)
10. `src/lib/categoryTranslations.ts` (B-22)
11. `messages/tr.json`, `messages/ar.json`, `messages/en.json` (B-10, B-22)
12. `src/app/[locale]/layout.tsx`, `src/components/layout/Header.tsx`, `src/components/layout/Footer.tsx` (B-18, B-19 — إضافة الأيقونات المفقودة في `public/` أو تصحيح المسار وتوطين `<title>`)

### مشروع الأدمن (`D:\kenditasarl\kenditasarl-admin`)
- لا توجد أخطاء مؤكدة تتطلب تعديلًا فوريًا داخل الأدمن؛ لكن يجب اختبار توافق `production-plan.ts` و`production-renderer.ts` مع أي إصلاح يمس `SERIALIZE_PROPERTIES` أو `clipPath` أو `originalAssetId` لضمان عدم كسر `production_snapshot`.

---

## 9. قائمة الإصلاحات المقترحة مرتبة بالأولوية

### أولوية قصوى — P0 (تمنع فقدان التصميم أو إفساد الإنتاج أو تجاوز التسعير)
1. **[B-01]** إعادة تطبيق `applyAllPrintBoundaryClips(canvas)` عند تحديث `totalCanvasWidth / totalCanvasHeight` (`mockupNaturalSize`) وتمرير الأبعاد الصحيحة عند استعادة `loadFromJSON`.
2. **[B-02]** تمرير `SERIALIZE_PROPERTIES` في كل استدعاءات `clone()` في `FabricCanvas.tsx:6938` و`ImageTools.tsx:218` + إعادة حساب السعر والـ `clipPath`.
3. **[B-03]** إصلاح تطهير `obj.src` في `FabricCanvas.tsx:6373-6376` بحيث لا يمسح `src` لملصقات المكتبة (التي يحمل `originalAssetId` فيها معرّف الوثيقة) بل يحفظ/يسترجع الرابط الأصلي.

### أولوية عالية — P1 (أعطال وظيفية وتجربة استخدام حرجة)
4. **[B-04 + B-11]** توحيد `normalizeColorKey` في تهيئة `placementsByColor` (`507`, `514`) وفي `getFaceStateKey` (`1296-1303`) لإصلاح الكوب الافتراضي ومنع انفصال مفاتيح الألوان.
5. **[B-06]** تصحيح ترتيب `isRestoring.current = false` قبل `saveDraft` في `undo`/`redo`، مع إعادة تطبيق `applyAllPrintBoundaryClips` وتصفير `activeObject`.
6. **[B-07]** استدعاء `canvas.discardActiveObject()` و`setActiveObject(null)` داخل `switchFace`.
7. **[B-12]** التحقق من تحميل `httpsUrl` مسبقًا قبل `imgObj.setSrc` في `processImageFile` لمنع تلف `src: ""`.
8. **[B-09]** ربط التوسيط والملاءمة في `ImageTools` و`PrecisionControls` بمستطيل منطقة الطباعة النشطة وإطلاق `object:modified`.
9. **[B-05]** طي `UserMediaSidebar` افتراضيًا (أو نقلها لخارج الكانفس) وإزالة تداخلها مع الكانفس وشريط الأدوات العائم.
10. **[B-08 + B-14]** ضبط زوم الجوال الافتراضي إلى `100%` (`1.0`) وإصلاح عرض صور الملصقات وارتفاع درج الجوال (`Grafikler`) وإغلاقه بـ `Escape`.
11. **[B-10]** إضافة `Editor.startDesigning` في القواميس الثلاثة وإزالة `{ fallback: ... }` غير المدعومة.
12. **[B-13 + B-15]** إصلاح شرط أيقونة القفل في `LayerPanel` وتمرير `assetVersion` من الشريط الجانبي و`AssetGalleryModal`.

### أولوية متوسطة — P2 (تحسينات UI/UX وتوطين وجودة بصرية)
13. **[B-16]** عرض شارة نوع الملف الحقيقية (`.svg` فقط لـ SVG) بدل عرض `SVG` لجميع الملصقات في `AssetGalleryModal` وتصحيح اتجاه أيقونة البحث بـ `start/end`.
14. **[B-17]** إزالة الازدواجية في أزرار Undo/Redo و3D، وتصحيح تسمية زر المعاينة للملابس (2D بدل 3D).
15. **[B-18 + B-19]** توفير `/favicon.svg` و`/images/logo-192.png` (أو ربط المسار الموجود فعليًا في `public/`) وتوطين `<title>` حسب الـ `locale`.
16. **[B-20 + B-21 + B-22 + B-23]** إصلاح قص زر `+` في `TextTools`، تداخل الزوم مع مبدل الأوجه في RTL ومع شارة القبعة، تداخل Toast مع `Sepete Ekle`، تداخل شريط الجوال على `375px`، تكرار عنوان `Katman Yönetimi` وعرض `assetName`، ترجمة `Badges`/`Typography`/`Hoodie`/`MobileTextToolbar`/`KDV`، ورفع أهداف اللمس على الجوال إلى `≥ 44×44px`.

---

## 10. خطة التنفيذ المقترحة على مراحل صغيرة (دون إعادة بناء)

| المرحلة | النطاق | الملفات المستهدفة | التحقق المطلوب |
|---|---|---|---|
| **Phase 08A.1 (P0 Core Data & Reload Safety)** | إصلاح `B-01`, `B-02`, `B-03`, `B-12`, `B-15` (استعادة الـ `clipPath` بعد reload، الحفاظ على البيانات عند `Duplicate`، حماية `src` و`assetVersion`) | `FabricCanvas.tsx`, `ImageTools.tsx`, `AssetGalleryModal.tsx` | اختبار Playwright حقيقي: إضافة ملصق مدفوع + نص + رفع صورة ← تكرار ← `page.reload()` ← تأكيد الرؤية البصرية باللقطة + فحص `localStorage` + `production-plan` unit test. |
| **Phase 08A.2 (P1 State, Print Areas & Tools Sync)** | إصلاح `B-04`, `B-06`, `B-07`, `B-09`, `B-11`, `B-13` (مفتاح لون الكوب، `Undo/Redo`، `switchFace`، توسيط منطقة الطباعة، أيقونة قفل الطبقات) | `FabricCanvas.tsx`, `ImageTools.tsx`, `PrecisionControls.tsx`, `LayerPanel.tsx` | اختبار Playwright على `mug-001` و`tshirt-001`: تأكيد فتح البانوراما 360° تلقائيًا، Undo/Redo فوري في `localStorage`، اختفاء الشريط العائم عند تبديل الوجه، وتوسيط داخل `Sol Göğüs`. |
| **Phase 08A.3 (P1/P2 Desktop & Mobile UX + Overlap Fixes)** | إصلاح `B-05`, `B-08`, `B-14`, `B-17`, `B-20`, `B-21`, `B-23` (طي/نقل `UserMediaSidebar`، زوم الجوال 100%، صور درج الجوال، قص `TextTools`، تداخل RTL والـ Toast، إزالة تكرار الأزرار والعناوين، أهداف اللمس `44px`) | `UserMediaSidebar.tsx`, `FabricCanvas.tsx`, `TextTools.tsx`, `LayerPanel.tsx` | اختبار Playwright بصري على `1440px`, `1280px`, `375px`, `430px` في اللغات `tr` و`ar` مع فحص عدم التداخل وأحجام الأزرار. |
| **Phase 08A.4 (P1/P2 Localization, Metadata & Static Assets)** | إصلاح `B-10`, `B-16`, `B-18`, `B-19`, `B-22` (`Editor.startDesigning`، شارة `SVG`، الشعار/Favicon، `<title>` الموطّن، ترجمة التصنيفات و`MobileTextToolbar`) | `ProductSelector.tsx`, `AssetGalleryModal.tsx`, `MobileTextToolbar.tsx`, `categoryTranslations.ts`, `messages/{tr,ar,en}.json`, `layout.tsx`, `Header.tsx`, `Footer.tsx` | اختبار Playwright على `tr/ar/en`: صفر `IntlError`، صفر `404`، مطابقة كاملة لقواعد `AGENTS.md` + `tsc --noEmit`. |

---

## 11. حالة `git status` الحالية (بدون أي تعديل في المرحلة 08A.0)

> لم يتم تعديل أو إنشاء أو حذف أي ملف برمجي في المشروع خلال المرحلة `08A.0` باستثناء إنشاء هذا التقرير التشخيصي `CANVAS_EDITOR_BUG_AUDIT.md`. التعديلات والملفات غير المتتبعة أدناه تعود بالكامل للمراحل السابقة (`03B`–`07A`).

### Store (`D:\kenditasarl` — الفرع الحالي: `codex/task04-print-production`)
- **ملفات معدّلة سابقًا (28 ملفًا):** `.gitignore`, `firebase.json`, `firestore.rules`, `messages/{ar,en,tr}.json`, `package.json`, `package-lock.json`, `src/app/[locale]/{account,cart,checkout,design-studio/[[...productId]],order-confirmation/[orderId],products/[id]}/page.tsx`, `src/app/api/{cart/add,checkout/calculate-delivery,email/order-confirmation,upload,whatsapp/order-status}/route.ts`, `src/components/auth/{AuthModal,PhoneVerificationModal}.tsx`, `src/components/checkout/DeliveryMethodModal.tsx`, `src/components/editor/{FabricCanvas,MugStudioControls,MultiVariantMatrixModal}.tsx`, `src/lib/{customizationConfig,firebase,productStudioProfile}.ts`.
- **ملفات ومجلدات غير متتبعة سابقة:** تقارير المراحل `01`–`07A`، `docs/`، `kenditasarl-admin/`، `scripts/`، `tests/`، مسارات API ومكتبات المراحل `03B`–`06D`، وملف هذا التقرير `CANVAS_EDITOR_BUG_AUDIT.md`.

### Admin (`D:\kenditasarl\kenditasarl-admin`)
- **ملفات معدّلة سابقًا (21 ملفًا):** `package.json`, `package-lock.json`, `src/app/(admin)/layout.tsx`, `orders/[id]/page.tsx`, `products/[id]/edit/page.tsx`, `products/new/page.tsx`, `settings/{cloudinary,pricing}/page.tsx`, `src/app/api/{upload,whatsapp/order-status}/route.ts`, `src/app/login/page.tsx`, `src/components/ProductionFileGenerator.tsx`, `src/lib/{cloudinary-upload,customizationConfig,firebase,fonts,png-dpi,printPlacementConfig,production-quality,production-renderer,production-zip}.ts`.
- **ملفات ومجلدات غير متتبعة سابقة:** `messages/`, `public/production-fonts/`, مسارات ومكوّنات المراحل `04A`–`06C`.

---

**الحالة النهائية للمرحلة 08A.0:** اكتمل التدقيق التشخيصي بالمتصفح الحقيقي والفحص الثابت للكود. **متوقفون هنا بانتظار موافقتك على خطة الإصلاح (Phase 08A.1–08A.4) قبل تعديل أي سطر كود.**
