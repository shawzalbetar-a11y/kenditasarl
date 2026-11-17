# Kendin Tasarla — تقرير تنفيذ المرحلة Phase 08A.2: Canvas State, Print Areas & Tools Synchronization

- **التاريخ:** 2026-11-17
- **المرحلة:** `Phase 08A.2 — Canvas State, Print Areas & Tools Synchronization`
- **المراجع:** `CANVAS_EDITOR_BUG_AUDIT.md`, `CANVAS_PHASE08A1_CORE_FIX_REPORT.md`
- **البيئة:** محلية معزولة بالكامل (`Store :3000`, `Admin :3001`, `Auth Emulator :19099`, `Firestore Emulator :18080`, `demo-kenditasarla-rules`, `MOCK_CLOUDINARY=1`).
- **القرار النهائي:** **PASS**

---

## 1. حالة الأخطاء المستهدفة (B-04, B-06, B-07, B-09, B-11, B-13 + تسعير المسودات القديمة)

| الرمز | الأولوية | الوصف | الحالة | إثبات التحقق |
|---|---|---|---|---|
| **B-04** | **P1** | عدم تفعيل `mug_full_wrap` افتراضيًا عند فتح `mug-001` بلون `white` بسبب اختلاف مفتاح اللون | **FIXED & VERIFIED** | اختبار Chrome على `mug-001` بلون `white` و`?color=%23ffffff`: تفعيل `Tam Çevre 360°` (`1840×760`) فورًا بدون تحذير + عمل `Mug3DPreviewModal` + تبديل `Tek Yüz (800)` ↔ `Tam Çevre (1840)` (`p08a2-01-mug-white-fullwrap.png`). |
| **B-11** | **P1** | عدم توحيد مفاتيح الألوان بين `facesData` (`white:::front`) و`placementsByColor` (`#ffffff`) | **FIXED & VERIFIED** | توحيد المفاتيح عبر `canonicalizeColorKey` و`normalizeFacesMap` و`normalizePlacementsMap`: `allFaceKeys: ["#ffffff:::front", "#ffffff:::back", "#000000:::front"]`, `allPlacementKeys: ["#ffffff", "#000000"]`؛ مع ترحيل آمن لمسودة قديمة (`white:::front` في مواجهة `#ffffff:::front` فارغ) دون الكتابة فوق تصميم المستخدم. |
| **B-06** | **P1** | فشل حفظ `Undo` / `Redo` فورًا إلى `localStorage` بسبب `isRestoring.current === true` + عدم إعادة تطبيق `clipPath` وحالة القفل | **FIXED & VERIFIED** | اختبار Chrome: إضافة نص (`2`) ← Undo (`localStorage` فورًا `1` ← Reload يبقى `1`) ← Redo (`localStorage` فورًا `2` ← Reload يبقى `2` ومرئي بصريًا) + Duplicate ← Undo (`3` ← `2`) + Unlock ← Undo (استعادة القفل). |
| **B-07** | **P1** | بقاء شريط أدوات العنصر العائم (`Ortala / Sil / الأسهم`) ظاهرًا عند التبديل إلى وجه فارغ (`Arka Yüz`) | **FIXED & VERIFIED** | اختبار Chrome: تحديد عنصر على `Ön Yüz` (`floatingToolbarOnFront: true`) ← تبديل إلى `Arka Yüz` (`staleToolbarOnEmptyBack: false`) ← تبديل سريع متكرر `Ön ↔ Arka ↔ Ön` (`toolbarAutoSelectedOnReturn: false`, `frontCountAfterRapidSwitch: 2`, `p08a2-04`). |
| **B-09** | **P1** | التوسيط والملاءمة في `ImageTools` و`PrecisionControls` يوسّطان على كامل الكانفس (`800×800`) بدل منطقة الطباعة النشطة، والتحريك قد يرحّل العنصر لمنطقة أخرى | **FIXED & VERIFIED** | اختبار Chrome على `Sol Göğüs Logosu`: إزاحة `+10px` (`489.5, 251.5`) ← توسيط عبر `PrecisionControls` أعاد العنصر بدقة إلى مركز `Sol Göğüs` (`479.5, 251.5`) مع بقاء `assignedPlacementId: "left_chest"` (`p08a2-02`)؛ بالإضافة لاختبار الحسابات والاحتواء على 6 مناطق طباعة (التيشيرت، الكوب، القبعة). |
| **B-13** | **P1** | تعطل أيقونة القفل في `LayerPanel` وتضارب `selectable: false` بعد Reload | **FIXED & VERIFIED** | اختبار Chrome: تبديل الأيقونة `lucide-lock-open` → `lucide-lock`، منع التحريك أثناء القفل، بقاء القفل والأيقونة بعد `page.reload()` (`p08a2-03`)، فك القفل من `LayerPanel` بنجاح (`lucide-lock-open`)، وعمل Undo لإعادة القفل. |
| **تسعير المسودات القديمة** | **P1** | تأخر تحديث سعر ملصق مدفوع في مسودة قديمة لا تحتوي `assetPrice` بعد تحميل `designAssets` | **FIXED & VERIFIED** | إضافة `designAssetsRef` وإعادة احتساب السعر عند وصول `designAssets` واستخدام `recalculatePriceRef.current` داخل `initCanvas.loadFromJSON`: مسودة قديمة (`white:::front` بدون `assetPrice`) عُرض سعرها تلقائيًا **`285 ₺`** (`250 + 35`, `p08a2-05-legacy-pricing-synced.png`). |

---

## 2. الملفات والدوال المعدلة

| الملف | الدوال / الأجزاء المعدلة |
|---|---|
| `src/components/editor/FabricCanvas.tsx` | `canonicalizeColorKey`, `countUserObjectsInFaceJson`, `normalizePlacementsMap`, `normalizeFacesMap`, `applyObjectLockState`؛ تهيئة `placementsByColor` (B-04)؛ `normalizeColorKey` و`getFaceStateKey` (B-11)؛ `designAssetsRef` + `useEffect` إعادة التسعير عند تحميل `designAssets` + `recalculatePrice`؛ تطبيع `fetchDesign` و`localStorage` restore؛ `handleObjectModified` (`skipPlacementSwitch`)؛ `initCanvas.loadFromJSON` (استعادة القفل الموحدة + `recalculatePriceRef.current` + `saveDraft`)؛ `applyRestoredHistorySnapshot`, `undo`, `redo` (B-06)؛ `switchFace` (B-07)؛ `switchColor` (B-11)؛ `handleAutoFitActiveObject` و`handleCenterInPlacement` (حماية القفل ودعم Free Mode)؛ `handleToggleLockActive` (B-13)؛ تمرير `getPrintZone` و`onAfterTransform` إلى `<PrecisionControls />` (B-09). |
| `src/components/editor/tools/LayerPanel.tsx` | `isObjectLocked`؛ الاستماع لحدث `layers:refresh`؛ `toggleLock` (إضافة `editable: !nextLocked` و`layers:refresh`)؛ استبدال `obj.selectable === false` بـ `isObjectLocked(obj)` في عرض الأيقونة. |
| `src/components/editor/tools/PrecisionControls.tsx` | إضافة `getPrintZone` و`onAfterTransform`؛ منع التعديل على العناصر المقفلة (`isLocked`)؛ توسيط `centerHorizontal` / `centerVertical` / `centerBoth` داخل منطقة الطباعة النشطة؛ تقييد `moveObject` داخل المنطقة النشطة؛ إطلاق `object:modified` مع `skipPlacementSwitch: true`. |
| `src/components/editor/tools/ImageTools.tsx` | إضافة `getPrintZone` و`onAfterTransform`؛ منع التعديل على العناصر المقفلة (`isObjectLocked`)؛ تحديث `center` و`fitToPrintArea` للعمل داخل `zone` الفعلي مع الحفاظ على `assignedPlacementId` وإطلاق `object:modified` مع `skipPlacementSwitch: true`. |

> **التزام النطاق:** لم تُعدَّل أي ملفات في Checkout 03B، Pricing 05B، Cloudinary، `.env.local`، `firestore.rules`، أو `kenditasarl-admin`، ولم تبدأ إصلاحات `08A.3` أو `08A.4`.

---

## 3. تفاصيل إصلاح Undo / Redo (B-06)

1. توحيد منطق الاستعادة في `applyRestoredHistorySnapshot(targetJson)` المستدعاة من `undo()` و`redo()`.
2. إلغاء أي مؤقت حفظ مؤجل (`saveDraftTimerRef.current`) قبل البدء لمنع سباق الحفظ.
3. أثناء بقاء `isRestoring.current = true` داخل callback `canvas.loadFromJSON(targetJson)`:
   - لا تُسجَّل أي خطوة تاريخ جديدة (بفضل حارس `if (isRestoring.current) return`).
   - تُستعاد خصائص القفل (`applyObjectLockState`) وتُعاد معايرة حدود القص (`applyAllPrintBoundaryClipsRef.current`).
   - يُمسح التحديد القديم (`canvas.discardActiveObject(); setActiveObject(null); setLiveDimensions(null);`).
   - يُحدَّث `facesData.current[currentKey]` (مع مراعاة `isPanoNow` ومزامنة الألوان إن كانت مفعلة)، ويُعاد حساب السعر، ويُطلَق حدث `layers:refresh` لتحديث `LayerPanel`.
4. **بعد اكتمال الاستعادة بالكامل:** يُرفع القفل (`isRestoring.current = false`) ثم يُستدعى **`saveDraftImmediate(canvas)`** فورًا بشكل متزامن بحيث يتطابق `localStorage` مع الكانفس المرئي لحظيًا دون انتظار debounce ودون حلقات حفظ متكررة.

---

## 4. تفاصيل توحيد مفاتيح الألوان (B-04 وB-11)

- **دالة موحدة:** `canonicalizeColorKey(color)` تحوّل أسماء الألوان المعروفة في `COLOR_MAP` (`white → #ffffff`, `black → #000000`, `navy → #1e3a8a`, ...) وتُستخدم في:
  - تهيئة `placementsByColor` (بما فيها الكوب الافتراضي `mug_full_wrap` مع احترام `allowedPlacements` و`defaultPlacementId` من إعدادات المنتج).
  - `normalizeColorKey` و`getFaceStateKey` (إنتاج `#ffffff:::front`, `#000000:::front` بشكل متطابق مع `placementsByColor["#ffffff"]` ومع `checkoutArt.ts:287-303`).
- **توافق المسودات القديمة وحماية التعارض:**
  - `normalizeFacesMap` ترحّل المفاتيح القديمة (`white:::front` ← `#ffffff:::front`) مع الحفاظ على المفاتيح الخالية من اللون (`front`) للتوافق الخلفي.
  - عند وجود تعارض بين مفتاح قديم وجديد لنفس اللون (مثل `white:::front` يحتوي تصميمًا و`#ffffff:::front` فارغ)، تُفضَّل النسخة غير الفارغة ولا تُكتب فوق بيانات المستخدم، ولا يُترك مفتاحان مترادفان معًا (مما يحمي شرط `checkoutArt.ts:289` `exact.length <= 1`).
  - الألوان المختلفة (`#ffffff` و`#000000`) تبقى مفصولة تمامًا (`whiteObjectsPreservedCount: 2`, `blackObjectsPreservedCount: 3`).

---

## 5. نتائج مناطق الطباعة والتوسيط (B-09)

- **اختبار المتصفح الحي على `Sol Göğüs Logosu` (`tshirt-001`):**
  - بعد إزاحة النص `+10px` إلى `(489.5, 251.5)` والنقر على أزرار التوسيط الأفقي والرأسي في `PrecisionControls`، عاد النص بدقة إلى **`(479.5, 251.5)`** (مركز `Sol Göğüs Logosu`، وليس مركز الكانفس `400, 400`) مع الحفاظ على `assignedPlacementId: "left_chest"` وعدم نقله إلى منطقة طباعة أخرى (`skipPlacementSwitch: true`).
- **التحقق الهندسي لمنطق `center` و`fitToPrintArea` عبر 6 مناطق طباعة (`phase08a2-imagetools-and-zones.mts`):**
  - `Sol Göğüs Logosu (left_chest)`: منطقة `(432, 204, 95×95)` ← مركز `(479.5, 251.5)`، حجم ملائم `87.4×87.4` — **PASS**.
  - `Tam Ön Baskı (full_front)`: منطقة `(258, 192, 284×378)` ← مركز `(400, 381)`، حجم ملائم `261.3×261.3` — **PASS**.
  - `Tam Sırt Baskı (full_back)`: منطقة `(249, 184, 303×397)` ← مركز `(400.5, 382.5)`، حجم ملائم `278.8×278.8` — **PASS**.
  - `Mug Full Wrap 360° (mug_full_wrap)`: منطقة `(0, 0, 1840×760)` ← مركز `(920, 380)`، حجم ملائم `699.2×699.2` — **PASS**.
  - `Mug Front Single (mug_front)`: منطقة `(272, 232, 304×352)` ← مركز `(424, 408)`، حجم ملائم `279.7×279.7` — **PASS**.
  - `Hat Front Crown (hat_front_crown)`: منطقة `(240, 272, 320×192)` ← مركز `(400, 368)`، حجم ملائم `176.6×176.6` — **PASS**.
- **الوضع الحر (Free Mode):** `handleCenterInPlacement` و`PrecisionControls` و`ImageTools` تتراجع إلى `freePrintZone` عندما يكون `isFreeMode` مفعّلًا.

---

## 6. نتائج قفل الطبقات (B-13)

في اختبار المتصفح الحي على `tshirt-001`:
- قبل القفل: أيقونة `LayerPanel` هي `lucide-lock-open`.
- بعد النقر على القفل في `LayerPanel`: تغيرت الأيقونة فورًا إلى **`lucide-lock`** (`iconChangedToLock: true`) وحُفظت `isLocked: true, lockMovementX: true` في المسودة.
- محاولة تحريك العنصر المقفل عبر `PrecisionControls`: **مُنعت بالكامل** (`movementBlockedWhileLocked: true`).
- بعد `page.reload()`: استُعيد القفل بخصائص `isLocked: true, lockMovementX: true, selectable: true` وبقيت أيقونة القفل **`lucide-lock`** ظاهرة (`p08a2-03-locked-layer-after-reload.png`).
- فك القفل من `LayerPanel`: نجح وعادت الأيقونة إلى **`lucide-lock-open`** (`unlockedFromLayerPanel: true`, `iconChangedBackToUnlock: true`).
- الضغط على `Undo` بعد فك القفل: أعاد حالة القفل (`undoRestoredLockState: true`).
- **توافق الإنتاج:** `productionPlan()` على JSON يحتوي عنصرًا مقفلًا + ملصقًا مدفوعًا v2 اجتاز بـ **`productionPlanWithLockedPass: true`**.

---

## 7. نتائج اختبار تسعير المسودات القديمة

- **المشكلة السابقة:** كانت استدعاءات `recalculatePrice` داخل `initCanvas` `useEffect` تلتقط closure قديم بـ `designAssets = []` مما أبقي سعر ملصق مدفوع بدون `assetPrice` على `250 ₺` بدل `285 ₺`.
- **الحل:** ربط `recalculatePrice` بـ `designAssetsRef.current` + `useEffect` يعيد الاحتساب عند وصول `designAssets` + استخدام `recalculatePriceRef.current` في `initCanvas.loadFromJSON`.
- **نتيجة الاختبار الفعلي (مسودة قديمة `white:::front` تحتوي `sticker-eagle` بدون حقل `assetPrice`):**
  - عرض السعر المصحّح تلقائيًا: **`Genel Toplam: 285₺`** و**`Sepete Ekle 285 ₺`** (`priceCorrectedTo285AfterAssetsLoad: true`).
  - اختبارات `Scenario 15` القديمة في 08A.1 أصبحت أيضًا تعرض `price285: true` (`nonTransparentPixels: 2068`).
  - التحقق الخادمي للسعر في Checkout 03B / Pricing 05B بقي كما هو دون اعتماد على `assetPrice` من العميل.

---

## 8. اختبارات المتصفح ولقطات الشاشة

نُفذت جميع الاختبارات الـ 15 على Chrome Headless (`playwright-core`, `channel: "chrome"`) ضد `http://localhost:3000`:

| الاختبار | المنتج | النتيجة | اللقطة |
|---|---|---|---|
| 1. تهيئة الكوب الأبيض و`#ffffff` + 3D + تبديل الأوضاع | `mug-001` | **PASS** | `screenshots/p08a2-01-mug-white-fullwrap.png` |
| 2. تبديل الألوان (`#ffffff` ↔ `#000000`) وفصل المفاتيح | `tshirt-001` | **PASS** | — |
| 3. استعادة مسودة قديمة متعارضة (`white:::front` vs `#ffffff:::front`) + التسعير | `tshirt-001` | **PASS** | `screenshots/p08a2-05-legacy-pricing-synced.png` |
| 4. `Undo` و`Redo` + حفظ `localStorage` فورًا + Reload بعدهما | `tshirt-001` | **PASS** | — |
| 5. تبديل `Front ↔ Back` سريع بدون شريط أدوات قديم أو تحديد تلقائي | `tshirt-001` | **PASS** | `screenshots/p08a2-04-back-face-no-stale-toolbar.png` |
| 6–7. التوسيط داخل `Sol Göğüs Logosu` + Fit على 6 مناطق | `tshirt-001` + 6 zones | **PASS** | `screenshots/p08a2-02-centered-sol-gogus.png` |
| 8–10. قفل الطبقة + منع الحركة + Reload + فك القفل + Undo | `tshirt-001` | **PASS** | `screenshots/p08a2-03-locked-layer-after-reload.png` |
| 11–12. استمرار ظهور العناصر بعد Reload + بقاء بيانات الملصق v2 المدفوع | `tshirt-001` | **PASS** | `screenshots/p08a1-02-after-reload.png` |
| 13. صفر أخطاء Console أو Page Errors جديدة | جميع المنتجات | **PASS (`0` errors)** | — |
| 14. فحص `hoodie-001` و`hat-001` وفحص سلامة الجوال `375×812` | `hoodie-001`, `hat-001`, Mobile | **PASS** | — |
| 15. توافق `productionPlan` مع JSON الناتج (بما فيه العنصر المقفل) | Store → Admin | **PASS** | — |

---

## 9. نتائج اختبارات Regression (شاملة الاختبارات الفاشلة بوضوح)

| المجموعة الاختبارية | النتيجة | الملاحظات |
|---|---|---|
| **Phase 08A.1 Browser Regression** (`phase08a1-acceptance-tests.mjs` + `scenarios-13-15.mjs` + `production-plan-check.mts`) | **PASS (100%)** | جميع إصلاحات `B-01`, `B-02`, `B-03`, `B-12`, `B-15` ناجحة بدون أي Regression، و`Scenario 15` أصبح `price285: true`. |
| **Phase 07A — Asset Library** (`asset_library_integration.test.mts`) | **10 / 10 PASS** | — |
| **Checkout 03B + 04A + 04B Production Renderer** (`checkout.test.mts`) | **14 / 14 PASS** | شاملة ثبات `production_snapshot` وإعادة تصيير PNG مطابق في 04B. |
| **Print Template 05A** (`print-template.test.mts` — تشغيل متسلسل) | **7 / 7 PASS** | — |
| **Pricing 05B** (`versioned-pricing.test.mts` — تشغيل متسلسل) | **12 / 12 PASS** | شاملة مقارنة Shadow Pricing 03B vs 05B. |
| **Pricing Engine Unit Tests** (`src/lib/pricing.test.ts`) | **15 / 15 PASS** | — |
| **Cloudinary Multi-Account** (`cloudinary.test.mts`) | **5 / 7 PASS — 2 FAIL (فشل موروث سابق)** | فشل نفس الاختبارين الموروثين المذكورين مسبقًا (`cloudinary.test.mts:126` توقع `fixture-default` بدل `fixture-cloud`، و`cloudinary.test.mts:172` حالة 400 بدل 200). **لا يُعتبران نجاحًا، ولم تُعدَّل ملفات Cloudinary وفق قيود المرحلة.** |

---

## 10. نتائج TypeScript

- **Store (`D:\kenditasarl`):** `npx tsc --noEmit` ← **`STORE_TSC=0`** (صفر أخطاء).
- **Admin (`D:\kenditasarl\kenditasarl-admin`):** `npx tsc --noEmit` ← **`ADMIN_TSC=0`** (صفر أخطاء).

---

## 11. المشكلات المتبقية (خارج نطاق Phase 08A.2)

- **الاختباران الموروثان في `cloudinary.test.mts`** (فشل سابق بسبب `fixture-default` vs `fixture-cloud` — خارج نطاق محرر Canvas).
- **نطاق `Phase 08A.3` (المؤجل حسب الخطة):** `B-05` (`UserMediaSidebar` تفتح افتراضيًا)، `B-08` (زوم الجوال 150%)، `B-14` (درج الجوال `Grafikler`)، `B-17` (ازدواجية أزرار Undo/3D وتسمية 3D للملابس)، `B-20` (تداخلات UI)، `B-21` (تكرار عنوان الطبقات وعرض `assetName`)، `B-23` (أحجام أهداف اللمس على الجوال).
- **نطاق `Phase 08A.4` (المؤجل حسب الخطة):** `B-10` (`Editor.startDesigning`), `B-16` (شارة `SVG` على PNG), `B-18` (`/favicon.svg` و`/images/logo-192.png`), `B-19` (`<title>` المختلط), `B-22` (توطين التصنيفات و`MobileTextToolbar`).

---

## 12. القرار النهائي

**القرار: `PASS`**

اجتازت جميع تعديلات `Phase 08A.2` (`B-04`, `B-06`, `B-07`, `B-09`, `B-11`, `B-13`، وتسعير المسودات القديمة) اختبارات المتصفح الفعلي واختبارات التوافق مع `Phase 08A.1` و`07A` و`03B` و`05A` و`05B` و`Production Renderer` و`TypeScript` بصفر أخطاء جديدة.

**متوقفون هنا دون البدء بـ `Phase 08A.3` بانتظار توجيهك.**
