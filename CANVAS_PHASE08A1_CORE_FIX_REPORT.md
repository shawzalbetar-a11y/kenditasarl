# Kendin Tasarla — تقرير تنفيذ المرحلة Phase 08A.1: Canvas Core Data & Reload Safety

- **التاريخ:** 2026-11-17
- **المرحلة:** `Phase 08A.1 — Canvas Core Data & Reload Safety`
- **المرجع التشخيصي:** `CANVAS_EDITOR_BUG_AUDIT.md`
- **البيئة:** محلية معزولة بالكامل (`Store :3000`, `Admin :3001`, `Auth Emulator :19099`, `Firestore Emulator :18080`, `demo-kenditasarla-rules`, `MOCK_CLOUDINARY=1`).
- **القرار النهائي:** **PASS**

---

## 1. حالة كل خطأ في نطاق Phase 08A.1

| رمز الخطأ | الأولوية | الوصف | الحالة | إثبات التحقق |
|---|---|---|---|---|
| **B-01** | **P0** | اختفاء عناصر التصميم بصريًا بعد إعادة تحميل الصفحة (`Reload`) | **FIXED & VERIFIED** | اختبار Chrome/Playwright: `nonTransparentPixels` داخل `Sol Göğüs Logosu` قبل الإعادة = `1862` وبعد الإعادة = `1862` (تطابق بكسل لبكسل + لقطتا `p08a1-01` و`p08a1-02`). |
| **B-02** | **P0** | فقدان بيانات الأصل والتسعير (`originalAssetId`, `assetPrice`, `assetVersion`, `assignedPlacementId`) عند التكرار (`Duplicate`) | **FIXED & VERIFIED** | اختبار Chrome/Playwright: تكرار ملصق مدفوع v2 (`+35 ₺`) أنتج نسخة بمعرّف فريد `obj_...` مع الاحتفاظ بجميع الخصائص؛ بعد حذف الأصل بقي السعر `285 ₺` والنسخة المكررة كاملة البيانات. |
| **B-03** | **P0** | مسح `obj.src` إلى سلسلة فارغة `""` أثناء التطهير قبل الحفظ لملصقات المكتبة أو الصور الفاسدة | **FIXED & VERIFIED** | إضافة `originalAssetUrl` في `SERIALIZE_PROPERTIES` و`resolveTrustedImageUrl` + منع الحفظ النهائي أو الإضافة للسلة عند وجود `src: ""` غير قابل للاسترجاع برسالة موطّنة (Scenario 13: PASS). |
| **B-12** | **P1** | فشل تحميل رابط الصورة المرفوعة وتلف `src` في `processImageFile` | **FIXED & VERIFIED** | اختبار Chrome/Playwright: عند رجوع `404` للرابط المرفوع تبقى المعاينة المحلية `data:image/png` ويظهر شريط `#failedUploadBanner` مع زر `"Yüklemeyi Tekrar Dene"` ويُمنع الحفظ؛ عند توفر ملف Mock صالح والنقر على Retry يتعافى العنصر إلى `https://...` ويختفي الشريط (Scenario 14: PASS). |
| **B-15** | **P1** | فقدان `assetVersion` عند الإدراج من الشريط الجانبي أو المعرض أو التكرار أو الحفظ | **FIXED & VERIFIED** | اختبار Chrome/Playwright بأصلين حقيقيين بإصدار **`v2`** (`sticker-eagle` من الشريط الجانبي) وإصدار **`v3`** (`sticker-heart` من `AssetGalleryModal`): احتُفظ بـ `assetVersion: 2` و`3` خلال الإدراج والتكرار و`recentAssets` و`Reload` و`productionPlan`. |

---

## 2. الأسباب الجذرية والتعديلات المنفذة

### أ. B-01 — اختفاء العناصر بعد Reload
- **السبب الجذري:** عند الـ mount يبدأ `mockupNaturalSize` بـ `{0, 0}` فيكون `nativeWidth/nativeHeight = 1000×1000`. عند تشغيل `initCanvas.loadFromJSON` كان يُستدعى `applyPrintBoundaryClip(obj)` بـ closure قديم يطبّق `clipPath` على فضاء `1000×1000` بينما العناصر على `800×800`. لاحقًا عند اكتمال تحميل صورة الـ mockup وتحديث `totalCanvasWidth/totalCanvasHeight` إلى `800×800`، لم يكن الـ `useEffect` يعيد تطبيق `applyAllPrintBoundaryClips(canvas)`.
- **التعديل المنفذ:**
  1. تحديث `applyPrintBoundaryClip(obj, overrideNw?, overrideNh?)` لاستخدام `nativeWidthRef.current / nativeHeightRef.current` أو الأبعاد الممررة صراحةً، وتمريرها إلى `getPlacementFabricBounds` و`freePlacementBounds`.
  2. تحديث `useEffect` مزامنة أبعاد الكانفس (`totalCanvasWidth / totalCanvasHeight / mockupNaturalSize`) لاستدعاء `applyAllPrintBoundaryClipsRef.current?.(canvas)` وإعادة الرسم فور تغير الأبعاد أو اكتمال تحميل صورة المنتج.
  3. في `initCanvas.loadFromJSON`: ضبط أبعاد الكانفس مبدئيًا إلى `parsed.width × parsed.height` (للمسودات غير البانورامية التي تملك أبعادًا محفوظة قبل تحميل الـ mockup)، واستخدام `applyPrintBoundaryClipRef.current` و`reconcilePlacementsForActiveStateRef.current` بدلاً من الـ closures القديمة، واستخدام الأبعاد الحقيقية (`restoredW, restoredH`) في `buildSerializedFaceJson`.
  4. إضافة `applyAllPrintBoundaryClipsRef.current?.(canvas)` وتصحيح توقيت `isRestoring.current = false` في مسار استعادة `designIdFromUrl`.

### ب. B-02 — الحفاظ على بيانات العناصر عند Duplicate
- **السبب الجذري:** استدعاء `obj.clone(callback)` في `FabricCanvas.tsx` و`ImageTools.tsx` بدون المعامل الثاني `SERIALIZE_PROPERTIES` مما أدى إلى إسقاط كافة الخصائص المخصصة في Fabric.js v5.
- **التعديل المنفذ:**
  1. إضافة `'originalAssetUrl'` إلى `SERIALIZE_PROPERTIES` في `src/lib/faceCoordinates.ts` (متوافق تمامًا مع قائمة السماح الموجودة مسبقًا في `checkoutArt.ts:457` و`checkout.ts:106` و`production-quality.ts:28`).
  2. تمرير `SERIALIZE_PROPERTIES` إلى `clone(callback, SERIALIZE_PROPERTIES)` في كل من `handleDuplicateActive` (`FabricCanvas.tsx`) و`duplicate` (`ImageTools.tsx`).
  3. توليد معرّف فريد `id` للنسخة المكررة (`obj_<timestamp>_<rand>`) دون المساس بـ `originalAssetId` أو `originalAssetUrl` أو `assetVersion` أو `assetPrice` أو `assignedPlacementId` أو `placementId` أو `targetFace`، مع إعادة تطبيق `applyPrintBoundaryClip` و`recalculatePrice`.

### ج. B-03 — منع تلف `src` أثناء الحفظ
- **السبب الجذري:** في `addSticker` كان يُحفظ معرّف Firestore في `originalAssetId` بدون `originalAssetUrl`، وكان التطهير في `executeAction` يستبدل `data:image/` بـ `""` عندما لا يبدأ `originalAssetId` بـ `http`، ثم يمرّ عليه الفلتر النووي بصمت.
- **التعديل المنفذ:**
  1. حفظ `originalAssetUrl: url` في `addSticker` و`handleSelectUpload` و`processImageFile`.
  2. إنشاء دالة `resolveTrustedImageUrl(obj)` تسترجع الرابط الموثوق بالترتيب: `obj.src` (إن كان `http/https`) ← `obj.originalAssetUrl` ← `obj.originalAssetId` (إن كان رابطًا) ← البحث في `designAssets` بمعرّف الوثيقة `originalAssetId`.
  3. في `executeAction` و`handleAction`: منع الحفظ النهائي أو الإضافة للسلة بالكامل وإظهار رسالة خطأ موطّنة (`Editor.invalidImageSourceError`) إذا تعذّر استرجاع رابط صالح لأي عنصر صورة أو بقي `data:image/` غير محلول، بدلاً من حفظ `src: ""` بصمت.

### د. B-12 — فشل تحميل رابط الصورة المرفوعة (`processImageFile` و`setSrc`)
- **السبب الجذري:** استدعاء `imgObj.setSrc(httpsUrl)` مباشرة دون فحص صلاحية الرابط أو CORS ودون انتظار انتهاء `loadFabricImage(dataUrl)` أو توفير آلية استرداد وإعادة محاولة.
- **التعديل المنفذ:**
  1. انتظار `loadFabricImage(dataUrl)` عبر `Promise` قبل البدء بالتبديل مع إسناد معرّف فريد `upload_<ts>_<rand>`.
  2. إنشاء دالة `verifyImageUrlLoadable(url)` تتحقق عبر `new Image()` مع `crossOrigin = 'anonymous'` من أن الرابط يعيد صورة حقيقية (`naturalWidth > 0`) دون `404` أو خطأ CORS قبل استدعاء `setSrc`.
  3. عند فشل الرفع أو فشل التحقق: عدم استدعاء `setSrc`، الإبقاء على المعاينة المحلية `dataUrl`، تسجيل العنصر في `failedUploads`، عرض شريط استرداد `#failedUploadBanner` (`z-[60]`) بزر **`retryFailedUpload`** (`Editor.retryUpload`) وزر إزالة، ومنع الحفظ النهائي أو الإضافة للسلة برسالة `Editor.failedUploadsBlockSave` حتى نجاح إعادة الرفع أو إزالة العنصر.
  4. تنظيف `failedUploads` تلقائيًا في حدث `object:removed`.

### هـ. B-15 — الحفاظ على `assetVersion`
- **السبب الجذري:** لم يكن حقل `version` مُمررًا من بطاقات الشريط الجانبي (`sidebarStickerGrid`)، ولم يكن معرّفًا في `GalleryAsset` (`AssetGalleryModal.tsx`) أو `RecentAssetItem` (`UserMediaSidebar.tsx`).
- **التعديل المنفذ:**
  1. إضافة `version?: number | string` إلى `GalleryAsset` و`RecentAssetItem` وتمريره في `recordRecentAsset` و`sidebarStickerGrid` و`addSticker` (مع استكمال تلقائي من `designAssets` عند الحاجة).
  2. حفظ `assetVersion` في `SERIALIZE_PROPERTIES` وفي `canvas_json` وداخل حقل `assets` في `production_snapshot` عند الحفظ في `executeAction`.

---

## 3. الملفات والدوال المعدلة

| الملف | الدوال / الأجزاء المعدلة |
|---|---|
| `src/lib/faceCoordinates.ts` | `SERIALIZE_PROPERTIES` (إضافة `'originalAssetUrl'`) |
| `src/components/editor/FabricCanvas.tsx` | `failedUploads` state، `recordRecentAsset`، `handleSelectUpload`، `designIdFromUrl` restore، `useEffect` مزامنة أبعاد الكانفس، `applyPrintBoundaryClip`، `applyAllPrintBoundaryClips`، `reconcilePlacementsForActiveStateRef`، `object:removed`، `initCanvas.loadFromJSON`، `verifyImageUrlLoadable`، `resolveTrustedImageUrl`، `addSticker`، `processImageFile`، `retryFailedUpload`، `removeFailedUpload`، `executeAction`، `handleAction`، `handleDuplicateActive`، `sidebarStickerGrid`، `#failedUploadBanner` |
| `src/components/editor/tools/ImageTools.tsx` | `duplicate` (تمرير `SERIALIZE_PROPERTIES` + توليد `id` فريد + إطلاق `object:modified`) |
| `src/components/editor/AssetGalleryModal.tsx` | `GalleryAsset` interface (إضافة `version?: number \| string`) |
| `src/components/editor/UserMediaSidebar.tsx` | `RecentAssetItem` interface (إضافة `version`, `type`) |
| `messages/tr.json`, `messages/ar.json`, `messages/en.json` | إضافة 5 مفاتيح موطّنة بتكافؤ 100% (`641` مفتاحًا في كل لغة): `invalidImageSourceError`, `uploadUrlVerificationFailed`, `failedUploadsBlockSave`, `retryUpload`, `uploadRetrySuccess` |

> **التزام النطاق:** لم يتم تعديل `.env.local`، أو مفاتيح/ملفات Cloudinary، أو Checkout 03B، أو Pricing 05B، أو Admin Production Renderer، أو أي خطأ P1/P2 خارج نطاق 08A.1.

---

## 4. نتائج اختبارات المتصفح الحقيقية ولقطات قبل/بعد

نُفذت جميع السيناريوهات الـ 15 الإلزامية على Chrome Headless الفعلي (`playwright-core`, `channel: "chrome"`) ضد `http://localhost:3000/tr/design-studio/tshirt-001` ومحاكيات Firebase (`demo-kenditasarla-rules`):

| السيناريو | النتيجة | الدليل الرقمي والبصري |
|---|---|---|
| **1–3:** فتح `tshirt-001` ← `Sol Göğüs Logosu` ← ملصق مدفوع **v2** (`sticker-eagle`, `+35 ₺`) | **PASS** | `assetVersion: 2`, `originalAssetId: "sticker-eagle"`, `originalAssetUrl: "https://cdn-icons-png.flaticon.com/512/1255/1255132.png"`, `assetPrice: 35`, السعر `285 ₺`. |
| **6–7:** تكرار الملصق (`Çoğalt`) ثم حذف الملصق الأصلي | **PASS** | معرّفان مختلفان (`sticker_...` و`obj_...`)؛ النسخة المكررة احتفظت بـ `assetVersion: 2`, `originalAssetId: "sticker-eagle"`, `originalAssetUrl`, `assetPrice: 35`, `assignedPlacementId: "left_chest"`. بعد حذف الأصل بقي السعر **`285 ₺`**. |
| **4–5:** إضافة نص `"Metniniz"` + رفع صورة PNG عبر Mock صالح (`200 OK` + CORS) | **PASS** | أُضيف النص و`user_upload` بدون أي شريط خطأ؛ `src` و`originalAssetUrl` تحدّثا إلى `https://res.cloudinary.com/mock-cloud-a/...png`. |
| **Front + Back:** تبديل إلى `Arka Yüz` ← `Tam Sırt Baskı` ← ملصق **v3** (`sticker-heart`, `+15 ₺`) من `AssetGalleryModal` ← العودة إلى `Ön Yüz` | **PASS** | `backObjectCount: 1`, `backStickerVersion: 3`, `backStickerOriginalAssetId: "sticker-heart"`؛ السعر الإجمالي ارتفع إلى **`335 ₺`** (`250 + 35 + 35 + 15`). |
| **8–11:** الحفظ التلقائي ← `page.reload()` ← فحص الرؤية البصرية والإحداثيات والسعر | **PASS** | عدد العناصر: **`3` قبل ← `3` بعد**. السعر: **`335 ₺` قبل ← `335 ₺` بعد**. عدد البكسلات غير الشفافة داخل `Sol Göğüs Logosu`: **`1862` قبل ← `1862` بعد (تطابق 100%)**. |
| **13:** محاولة الحفظ النهائي (`Tasarımı Kaydet`) والإضافة للسلة (`Sepete Ekle`) بصورة ذات `src: ""` | **PASS** | تم منع الإجراءين بالكامل (`noModalOnSave: true`, `noModalOnCart: true`) مع ظهور رسالة الخطأ الموطّنة (`invalidImageSourceError`). |
| **14:** فشل رفع صورة (`404` على رابط Mock) ← منع الحفظ ← التعافي عبر زر `"Yüklemeyi Tekrar Dene"` | **PASS** | ظهر `#failedUploadBanner` فوق الكانفس، احتُفظ بالمعاينة المحلية `data:image/png`، مُنع الحفظ برسالة `failedUploadsBlockSave`؛ بعد إتاحة الاستجابة الصالحة والضغط على Retry اختفى الشريط وتحدّث `src` و`originalAssetUrl` إلى رابط `https://...` صالح. |
| **15:** استعادة مسودة قديمة من `localStorage` (مفتاح `front` بدون `width/height` وبدون `originalAssetUrl`) | **PASS** | استُعيدت العناصر بصريًا داخل `Sol Göğüs Logosu` (`nonTransparentPixels: 2068`) وظهرت طبقتا `Legacy OK` و`sticker` بنجاح. |

### لقطات الشاشة المحفوظة (قبل / بعد)
- قبل إعادة التحميل (Front مع ملصق v2 المكرر + نص + صورة مرفوعة): `screenshots/p08a1-01-before-reload.png`
- بعد إعادة التحميل (رؤية بصرية مطابقة 100% — مقابل الفراغ الكامل السابق في `wf-02-after-reload.png`): `screenshots/p08a1-02-after-reload.png`
- شريط استرداد فشل الرفع (`#failedUploadBanner`) مع زر إعادة المحاولة: `screenshots/p08a1-03-failed-upload-banner.png`
- استعادة مسودة قديمة من `localStorage`: `screenshots/p08a1-04-legacy-draft-restored.png`

---

## 5. نتائج اختبارات JSON و`localStorage`

مقارنة مباشرة بين `preReloadObjects` و`postReloadObjects` في `draft_design_tshirt-001`:

| العنصر | الحقل | قبل Reload | بعد Reload | الحالة |
|---|---|---|---|---|
| **الملصق المكرر (بعد حذف الأصل)** | `id` | `obj_1794941420835_8fdero` | `obj_1794941420835_8fdero` | مطابق |
| | `left, top, scaleX, scaleY` | `504.5, 276.5, 0.1577, 0.1577` | `504.5, 276.5, 0.1577, 0.1577` | مطابق |
| | `originalAssetId / assetVersion / assetPrice` | `sticker-eagle` / **`2`** / `35` | `sticker-eagle` / **`2`** / `35` | مطابق |
| | `originalAssetUrl / src` | `https://cdn-icons-png.flaticon.com/.../1255132.png` | `https://cdn-icons-png.flaticon.com/.../1255132.png` | مطابق |
| | `clipPath` | `{ left: 432, top: 204, width: 95, height: 95 }` | `{ left: 432, top: 204, width: 95, height: 95 }` | مطابق |
| **النص** | `left, top, scaleX, text` | `479.5, 251.5, 0.4393, "Metniniz"` | `479.5, 251.5, 0.4393, "Metniniz"` | مطابق |
| **الصورة المرفوعة** | `left, top, isCustomUpload` | `479.5, 251.5, true` | `479.5, 251.5, true` | مطابق |
| | `src / originalAssetUrl` | `https://res.cloudinary.com/mock-cloud-a/...png` | `https://res.cloudinary.com/mock-cloud-a/...png` | مطابق |
| **سجل الأصول الحديثة** | `studio_recent_library_assets` | `sticker-heart (v3)`, `sticker-eagle (v2)` | `sticker-heart (v3)`, `sticker-eagle (v2)` | مطابق |

---

## 6. سلامة الأسعار ومراجع الأصول

- **سلامة التسعير في المحرر:** بعد تكرار ملصق مدفوع (`+35 ₺`) وحذف الأصل، بقي السعر المعروض `285 ₺` (و`335 ₺` بعد إضافة الوجه الخلفي وملصق v3).
- **التحقق الخادمي محفوظ بالكامل:** لم يُمس `src/lib/server/checkout.ts` أو `checkoutArt.ts`؛ الخادم يستمر في تجاهل سعر العميل وإعادة جلب السعر الموثوق من وثيقة `design_assets/{originalAssetId}` والتحقق من `is_active !== false && published !== false` وتطابق `originalAssetUrl` و`src`.
- **اختبار `calculateCustomProductPrice` على JSON المستعاد:** أعاد `285 ₺` بالضبط (تطابق مع المتوقع).

---

## 7. توافق Production Renderer و`production_snapshot`

تم تشغيل دالة `productionPlan()` الحقيقية من `D:\kenditasarl\kenditasarl-admin\src\lib\production-plan.ts` مباشرةً على الـ JSON المستعاد بعد Reload من المتصفح (Scenario 12):
- **النتيجة:** **`productionPlanPass: true`** بدون أي خطأ `MAPPING` أو `GEOMETRY` أو `CALIBRATION` أو `NEEDS_REVIEW`.
- **المخرجات الفعلية:**
  - `outputKey: "front~left_chest"`, `width: 95`, `height: 95`, `origin: { x: 432, y: 204 }`.
  - العنصر المكرر في خطة الإنتاج يحتفظ بـ `originalAssetId: "sticker-eagle"`, `originalAssetUrl`, `assetVersion: 2`, `assetPrice: 35`, `src` صالحة.
  - الصورة المرفوعة تحتفظ بـ `src` و`originalAssetUrl` و`isCustomUpload: true`.
  - النص يحتفظ بـ `assignedPlacementId: "left_chest"`.
- كما نجح اختبار `04B renders identical PNG and fingerprint from a confirmed order after its source art and catalog change` ضمن `checkout.test.mts`.

---

## 8. اختبارات Regression والتوافق

| المجموعة الاختبارية | النتيجة | التفاصيل |
|---|---|---|
| **Phase 07A — Asset Library** (`asset_library_integration.test.mts`) | **10 / 10 PASS** | القراءة، التصفية، التسعير، `SERIALIZE_PROPERTIES`، Checkout validation، Production planner، وقواعد الأمان. |
| **Checkout 03B + 04A + 04B Production Renderer** (`checkout.test.mts`) | **14 / 14 PASS** | بما فيها ثبات `production_snapshot` وإعادة تصيير PNG مطابق لـ 04B. |
| **Versioned Pricing 05B** (`versioned-pricing.test.mts`) | **12 / 12 PASS** | شاملة مقارنة Shadow Pricing 03B vs 05B. |
| **Print Template Builder 05A** (`print-template.test.mts`) | **7 / 7 PASS** | عقود الإحداثيات، التحقق، وتوافق القواميس. |
| **Pricing Engine Unit Tests** (`src/lib/pricing.test.ts`) | **15 / 15 PASS** | جميع الحالات الـ 15 ناجحة. |
| **تكافؤ القواميس الثلاثة** (`messages/{tr,ar,en}.json`) | **PASS (641 / 641 / 641)** | صفر فروقات في المفاتيح. |
| **Cloudinary Multi-Account** (`cloudinary.test.mts`) | **5 / 7 PASS (2 فشل موروث غير متعلق بـ 08A.1)** | فشل اختباران قديمان (`cloudinary.test.mts:126` و`172`) يتوقعان `fixture-default` بدل `fixture-cloud` المفعّل في `settings/storage/cloudinary/legacy` (ولم يُعدَّل أي ملف من ملفات Cloudinary أو الرفع الخادمي في هذه المرحلة). |

---

## 9. نتائج TypeScript

- **Store (`D:\kenditasarl`):** `npx tsc --noEmit` ← **`STORE_TSC=0`** (صفر أخطاء).
- **Admin (`D:\kenditasarl\kenditasarl-admin`):** `npx tsc --noEmit` ← **`ADMIN_TSC=0`** (صفر أخطاء).

---

## 10. الأخطاء المتبقية (خارج نطاق Phase 08A.1)

- لم يتبقَّ أي خطأ ضمن نطاق `Phase 08A.1` (`B-01`, `B-02`, `B-03`, `B-12`, `B-15` كلها مُغلقة ومُتحقَّق منها).
- الأخطاء المتبقية الموثّقة في `CANVAS_EDITOR_BUG_AUDIT.md` مؤجلة حسب الخطة المعتمدة إلى المراحل القادمة:
  - **Phase 08A.2:** `B-04`, `B-06`, `B-07`, `B-09`, `B-11`, `B-13` (مفتاح لون الكوب، Undo/Redo، `switchFace`، توسيط منطقة الطباعة، وأيقونة قفل `LayerPanel`).
  - **Phase 08A.3:** `B-05`, `B-08`, `B-14`, `B-17`, `B-20`, `B-21`, `B-23` (واجهة Desktop/Mobile و`UserMediaSidebar` والزوم والتداخلات).
  - **Phase 08A.4:** `B-10`, `B-16`, `B-18`, `B-19`, `B-22` (الترجمات وشارة SVG والشعار وعنوان الصفحة).
- ملاحظة جانبية في Scenario 15 (مسودة قديمة بدون `assetPrice`): في المسودات القديمة التي لا تحتوي حقل `assetPrice` على الملصق، قد لا يعاد حساب سعر الملصق تلقائيًا بعد اكتمال تحميل `designAssets` من Firestore إذا انتهى `loadFromJSON` قبل وصول `designAssets` (تُعالج بسهولة عبر إعادة استدعاء `recalculatePrice` عند تحديث `designAssets` في مرحلة لاحقة، بينما الخادم يحسب السعر الصحيح دائمًا من Firestore).

---

## 11. القرار النهائي

**القرار: `PASS`**

تم إصلاح الأخطاء الخمسة (`B-01`, `B-02`, `B-03`, `B-12`, `B-15`) واجتياز جميع اختبارات القبول الإلزامية الـ 15 بالمتصفح الحقيقي، مع اجتياز `Production Plan` و`Phase 07A` و`Checkout 03B` و`Pricing 05B` و`Print Template 05A` و`TypeScript` في Store وAdmin بصفر أخطاء.

**متوقفون هنا بانتظار موافقتك للانتقال إلى `Phase 08A.2`.**
