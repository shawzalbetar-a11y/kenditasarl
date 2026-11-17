# PHASE 5B: VERSIONED PRICING ENGINE & ADMIN PRICING RULES
## Implementation and Verification Report

**تاريخ التنفيذ:** 15 نوفمبر 2026  
**الحالة:** مكتملة محلياً 100% (Local Staging / Shadow Mode Only)  
**المشاريع:**
- Store: `D:\kenditasarl` (Branch: `codex/task04-print-production`)
- Admin: `D:\kenditasarl\kenditasarl-admin` (Branch: `codex/task04-print-production`)

---

## 1. ملخص تنفيذي

تم بحمد الله وتوفيقه إنجاز **المرحلة 05B** كاملة وفقاً للمواصفات الصارمة المحددة في وثيقة `KendinTasarla_Codex_Task05B_Versioned_Pricing_Engine.md`:
1. **محرك تسعير نقي ومُصدّر (Versioned Pricing Engine):** تم بناء محرك تسعير يعتمد على الحساب الصحيح للأموال بالقرش التركي (Minor Units) دون أي أخطاء فاصلة عائمة (Floating-point)، مع دعم كامل لعقود التسعير الثلاثة: `blank` (سادة بدون طباعة)، و`ready` (جاهز بسعر شامل ولا يكرر تكلفة الطباعة أو التصميم أبداً)، و`custom` (مخصص بحسب مواضع الطباعة المستخدمة فعلاً والملصقات المدفوعة).
2. **عزل المسودات ونشر الإصدارات الثابتة (Immutable Revisions):** فصل مسار المسودة `pricing_policies/default/drafts/current` عن الإصدارات المنشورة الثابتة `pricing_policies/default/revisions/{hash}` والمؤشر النشط `pricing_policies/default`، مع توقيع كل إصدار برمز تشفير SHA-256 فريد وغير قابل للتعديل.
3. **أمان وقفل تفاؤلي متقدم (Optimistic Concurrency Locking 409):** حماية كاملة ضد تعديلات المسؤولين المتزامنة برمز HTTP 409 عند عدم تطابق رقم المراجعة `expectedRevision`، ومنع كامل للكتابة المباشرة عبر Firebase Client SDK في قواعد `firestore.rules`.
4. **واجهة إدارة تفاعلية ومحاكي أسعار (Admin UI & Price Simulator):** إضافة قسم مخصص لمحرك تسعير الإصدارات ضمن لوحة الإدارة `kenditasarl-admin/src/app/(admin)/settings/pricing/`، يشمل إدارة القواعد، وشرائح خصم الكميات، والتحقق، ومحاكي الأسعار الفوري، مع الاحتفاظ الكامل بواجهة `settings/pricing` التوافقية لضمان سلامة 03B.
5. **وضع المقارنة الصامتة (Shadow Quote Mode):** تشغيل المحرك الجديد داخل مسار Checkout الخادمي في وضع مقارنة صامت تماماً يسجل فروقات الأسعار للتحليل والرقابة (Telemetry) في وثائق `checkout_quotes` و`orders` دون أي تغيير في المبالغ المحصلة من العملاء حالياً.
6. **مطابقة تامة لمعايير AGENTS.md ولغات النظام الثلاث:** دعم كامل للغات الثلاث (`ar`, `tr`, `en`) بتطابق مفاتيح بنسبة 100% في ملفات القواميس، والالتزام بهوية "KENDİN TASARLA" والمصطلحات المعتمدة للملابس ("Baskı Alanı" و"Yerleşim") ومنع استخدام كلمة "Konum".
7. **اجتياز جميع الاختبارات:** اجتياز 12 اختباراً جديداً في Emulator بنسبة 100%، واجتياز 14 اختباراً لمسار Checkout و03B و04A و04B بنسبة 100%، واجتياز فحص TypeScript وبناء Next.js لكلا التطبيقين بنجاح تام.

---

## 2. جدول مقارنة مسار التسعير الحالي (03B) والجديد (05B)

| وجه المقارنة | مسار التسعير الحالي (03B) | مسار تسعير الإصدارات الجديد (05B) |
| :--- | :--- | :--- |
| **مصدر القواعد** | وثيقة واحدة ديناميكية في `settings/pricing` | مسودة خاصة + إصدارات ثابتة وموقعة بـ SHA-256 في `pricing_policies/default/revisions/{hash}` |
| **تخزين القواعد** | قيم عائمة مسطحة في كائن واحد | مصفوفة قواعد محددة النطاق (`global`, `product`, `variant`, `template`) مع أولوية صريحة |
| **التقريب التاريخي** | تقريب السعر الإجمالي لأقرب 100 قرش (1 ليرة) عبر بند `rounding` | كل المبالغ الصحيحة بالقرش من البداية بدون أخطاء فاصلة عائمة |
| **عقد المنتج الجاهز (`ready`)** | لا يضيف أوجهاً إضافية إلا إذا وُجدت | ضمان خادمي صارم: سعر معلن ثابت شامل للطباعة؛ **منع مضاعفة أو تكرار أي رسوم طباعة أو أصول** |
| **رسوم الأصول والملصقات** | رسم موحد مضاف لكل وجه | نطاق احتساب صريح: `PER_DESIGN_INSTANCE` (يُحسب مرة واحدة للملصق مهما تكرر على الأوجه)، أو `PER_UNIT`، أو `PER_LINE` |
| **خصومات الكميات (Bulk)** | غير مدعومة في محرك السعر | مدعومة بشرائح قابلة للتكوين مع نطاق تجميع صريح (`PER_PRODUCT` أو `PER_VARIANT`) ولا تخلط منتجات مختلفة |
| **الأمان وتضارب التعديل** | كتابة مباشرة أو تحديث جزئي | قفل تفاؤلي إلزامي (`expectedRevision`) برفض 409، وجميع الكتابات محصورة بالـ Server API |
| **حالة تفعيل العملاء** | **المسار النشط والمعتمد افتراضياً (100%)** | **وضع المقارنة الصامتة (Shadow Quote)** بدون تغيير مبالغ الدفع على العملاء |

---

## 3. تفاصيل البنية ونموذج البيانات في Firestore

### 3.1 المسارات المنظمة
```
pricing_policies/default                          # الوثيقة المرجعية للمؤشر النشط (activeRevisionId + version metadata)
pricing_policies/default/drafts/current           # مسودة الأدمن الحالية (server-only) مع عداد revision
pricing_policies/default/revisions/{hash}         # إصدار منشور ثابت وموقع بـ SHA-256 (immutable)
pricing_policies/default/audit/{eventId}          # سجل تدقيق إداري خادمي لكافة عمليات الحفظ والنشر
```

### 3.2 قواعد الأمان (`firestore.rules`)
تم تحديث `firestore.rules` لحماية مسارات التسعير الجديدة بالكامل:
- قراءة المؤشر النشط `/pricing_policies/default` والإصدارات المنشورة `/pricing_policies/default/revisions/{hash}` متاحة للعامة.
- **منع تام لكافة عمليات الكتابة** من خلال Client SDK (`allow write: if false;`).
- **حجب تام** للمسودات (`drafts/{document=**}`) وسجلات التدقيق (`audit/{document=**}`) عن Client SDK (`allow read, write: if false;`)، وحصرها بـ Firebase Admin SDK عبر API الإدارة الموثق فقط.

---

## 4. واجهة الإدارة وAPI العمليات (`kenditasarl-admin`)

### 4.1 واجهة إدارة التسعير المدمجة
تم تطوير صفحة `kenditasarl-admin/src/app/(admin)/settings/pricing/page.tsx` ومكون `VersionedPricingManager.tsx` لتوفير:
1. **مبدل المحركات (Engine Switcher):** التبديل بين واجهة 03B التوافقية وواجهة 05B الجديدة بسلاسة ودون مساس بالنظام الحالي.
2. **شريط الحالة والمراجعة:** عرض رمز التجزئة للإصدار النشط، ورقم مسودة التعديل الحالية، وتنبيه فوري للتعديلات غير المحفوظة.
3. **تبويب قواعد التسعير (Pricing Rules):** جدول تفاعلي لإضافة، تعديل، وحذف القواعد مع تحديد النطاق، والموضع، وطريقة الطباعة، والمبلغ بالقروش، والأولوية، وخيار الموضع الأول مجاناً.
4. **تبويب خصومات الكميات (Quantity Tiers):** إدارة شرائح الخصم بتحديد الحد الأدنى والأقصى، ونوع الخصم (نسبة مئوية أو مبلغ ثابت)، ونطاق التجميع.
5. **محاكي الأسعار المباشر (Price Simulator):** تجربة وحساب أسعار أي تركيبة من المنتجات والمتغيرات ومواضع الطباعة والملصقات والكميات بشكل فوري، وعرض تفصيل كامل للبنود والقواعد المطابقة دون المساس بأي سلة فعلية.
6. **سجل الإصدارات المنشورة (Revision History):** استعراض تاريخ الإصدارات المنشورة مع رموز التجزئة وتواريخ النشر وهوية الناشر.

### 4.2 مسار الـ API الخادمي (`/api/pricing-policies`)
يدعم العمليات التالية مع التحقق الكامل من هوية المسؤول وصلاحياته:
- `read`: قراءة المؤشر، والمسودة الحالية، والإصدار النشط، وتاريخ المراجعات.
- `save_draft`: التحقق بمخطط Zod، والتحقق من `expectedRevision` وإرجاع HTTP 409 في حال حدوث تضارب، وتسجيل العملية في سجل التدقيق.
- `validate`: فحص منطقي شامل (منع المبالغ السالبة، فحص تضارب الأولويات، التحقق من صحة العملة TRY، نسب الخصم <= 100%).
- `publish`: حساب تجزئة SHA-256 للمسودة، وحفظ وثيقة ثابتة في `revisions/{hash}`، وتحديث مؤشر `activeRevisionId`، وتسجيل العملية في `audit`.
- `simulate`: محاكاة تسعير السلة على المسودة أو الإصدار المنشور وإرجاع تفصيل كامل.

---

## 5. نتائج تسعير السلال النموذجية ومقارنة Shadow Quote

تم تقييم 5 حالات سلال تمثيلية ومقارنتها بدقة بين محرك 03B ومحرك 05B:

```
========================================================================================================
                                جدول مقارنة التسعير التجريبي (03B مقابل 05B)
========================================================================================================
الحالة                      | محرك 03B (الحالي) | محرك 05B (الجديد) | الفرق (Diff) | سبب النتيجة
--------------------------------------------------------------------------------------------------------
1. تيشيرت سادة (Blank)       | 20,000 قرش (200₺) | 20,000 قرش (200₺) | 0 قرش        | تطابق تام: سعر المنتج الأساسي فقط
2. مصفوفة ألوان 03B          | 43,500 قرش (435₺) | 43,500 قرش (435₺) | 0 قرش        | تطابق تام: أحمر أمام (200₺) + أزرق أمام وخلف (235₺)
3. هودي جاهز (Ready)         | 45,000 قرش (450₺) | 45,000 قرش (450₺) | 0 قرش        | تطابق تام: سعر معلن شامل يمنع مضاعفة تكلفة الطباعة
4. ملصق مدفوع على وجهين      | 25,500 قرش (255₺) | 25,500 قرش (255₺) | 0 قرش        | تم احتساب الملصق مرة واحدة (PER_DESIGN_INSTANCE)
5. طلب كمية (15 تيشيرت مخصص) | 300,000 قرش(3000₺)| 270,000 قرش(2700₺)| -30,000 قرش  | تطبيق خصم كمية 10% لشريحة 10-49 قطعة في 05B
========================================================================================================
```

### آلية الـ Shadow Quote في مسار Checkout:
- عند استدعاء `/api/checkout/quote` أو تحضير الطلب، يقوم الخادم بحساب السعر المعتمد وفق 03B (وهو السعر الذي يُلزم ويدفعه العميل).
- بالتوازي، يقرأ الخادم الإصدار النشط من `pricing_policies/default` ويحسب سعر 05B التجريبي.
- يتم حفظ كائن `shadow_quote` كاملاً متضمناً `engine_03b_subtotal_minor` و`engine_05b_subtotal_minor` و`diff_minor` وقائمة السطور في وثيقة عرض السعر للرقابة والتحليل.
- يتم إدراج `pricing_policy_revision` ضمن بصمة العرض (fingerprint)، بحيث إذا تغيرت سياسة التسعير المنشورة، يتم رفض تأكيد العرض القديم ويُطلب من العميل التحديث الصريح (`REFRESH`).

---

## 6. تقرير الاختبارات والتحقق البرمجي

### 6.1 اختبارات Firebase Emulator (`tests/firestore`)
```bash
> test:pricing (versioned-pricing.test.mts)
✔ 1. Commercial contract BLANK: base product/variant price only, zero placement and zero asset fees
✔ 2. Commercial contract READY: declared ready-made price with embedded print fees; NEVER duplicates print or asset fees
✔ 3. Commercial contract CUSTOM: base + placement fees actually used + authorized paid asset fees
✔ 4. 03B regression test: Red front-only (200 TRY) and Blue front+back (235 TRY) -> Total 435 TRY (43,500 minor)
✔ 5. Paid asset with PER_DESIGN_INSTANCE charges once even if placed on multiple faces or layers
✔ 6. Scope priority resolution: Variant-specific rule overrides Product-specific rule, which overrides Global rule
✔ 7. Validation check: Priority collision detection prevents two active rules with identical scope/target and equal priority
✔ 8. Quantity discounts: boundaries minQty-1, minQty, minQty+1; no cross-product discounting, floor at 0
✔ 9. Admin API: read, save draft, optimistic locking 409 conflict, and immutable publish
✔ 10. Security rules: Client SDK cannot write pricing policies or read private drafts/audits
✔ 11. Checkout integration: quote generates shadow_quote telemetry without altering customer charge
✔ 12. Shadow pricing comparison: 5 representative cases evaluated side-by-side between 03B and 05B engines
Total: 12 passed, 0 failed (100% PASS)

> test:checkout (checkout.test.mts)
✔ 14/14 tests passed (100% PASS)
- Matrix pricing per SKU, COD atomic reservation, ready all-in, revision invalidation, 04A contracts, and 04B rendering intact.

> test (admin.test.mjs)
✔ 8/8 tests passed (100% PASS)
```

### 6.2 فحص الأنواع وبناء التطبيقات (TypeScript & Next.js Build)
- **Store (`D:\kenditasarl`):**
  - `npx tsc --noEmit` -> نجح دون أي أخطاء (Code 0).
  - `npm run build` -> نجح بالكامل وأنتج الصفحات ومسارات الـ API (Code 0).
- **Admin (`D:\kenditasarl\kenditasarl-admin`):**
  - `npx tsc --noEmit` -> نجح دون أي أخطاء (Code 0).
  - `npm run build` -> نجح بالكامل مع Next.js 16.3 Turbopack (Code 0).

---

## 7. الملفات المعدلة والمنشأة وحالة Git

### 7.1 متجر المتسوق (Store: `D:\kenditasarl`)
- `src/lib/versionedPricing.ts` (جديد): المحرك النقي، مخططات Zod، التحقق، وحساب الأسعار.
- `src/lib/server/checkout.ts` (معدل): إضافة حساب الـ Shadow Quote وتضمين المراجعات والرقابة.
- `firestore.rules` (معدل): قواعد الحماية الصارمة لمسارات `pricing_policies`.
- `tests/firestore/versioned-pricing.test.mts` (جديد): 12 اختباراً شاملاً لكافة متطلبات المرحلة.
- `tests/firestore/package.json` (معدل): إضافة سكريبت `test:pricing`.

### 7.2 لوحة الإدارة (Admin: `D:\kenditasarl\kenditasarl-admin`)
- `src/lib/versionedPricing.ts` (جديد): مطابق تماماً لنسخة المتجر.
- `src/app/api/pricing-policies/route.ts` (جديد): مسار الـ API الخادمي الموثق للقراءة والمسودات والنشر والمحاكاة.
- `src/components/admin/VersionedPricingManager.tsx` (جديد): واجهة الإدارة والمحاكي والتحقق وسجل الإصدارات.
- `src/app/(admin)/settings/pricing/page.tsx` (معدل): دمج مبدل المحركات لدعم 03B و05B جنباً إلى جنب.
- `messages/tr.json` (معدل): إضافة مفاتيح `VersionedPricing` التركية.
- `messages/ar.json` (معدل): إضافة مفاتيح `VersionedPricing` العربية المطابقة.
- `messages/en.json` (معدل): إضافة مفاتيح `VersionedPricing` الإنجليزية المطابقة.

---

## 8. قرارات السياسة التجارية المطلوبة من مالك المشروع (Owner Decisions)

قبل الانتقال المستقبلي من وضع المقارنة الصامتة (Shadow Mode) إلى تفعيل التسعير الجديد فعلياً للعملاء، يلزم اعتماد القرارات التالية من الإدارة:
1. **نطاق احتساب رسوم الملصقات (Sticker Fee Scope):** الاعتماد النهائي لخيار `PER_DESIGN_INSTANCE` (احتساب الملصق المدفوع مرة واحدة للتصميم حتى لو طُبع على الصدر والظهر معاً) مقابل احتسابه على كل قطعة أو كل وجه.
2. **سياسة التقريب (Rounding Policy):** في 03B كان المجموع يُقرب لأقرب 100 قرش (1 ليرة كاملة) عبر بند `rounding`. في 05B الحساب دقيق بالقروش (مثلاً 221.96 ₺). هل ترغب الإدارة في إبقاء التقريب لأقرب ليرة صحيحة أم اعتماد القروش الدقيقة؟
3. **مكونات خصم الكميات المشمولة (Eligible Components for Quantity Discount):** حالياً تم ضبط الخصم افتراضياً على سعر المنتج الأساسي ومواضع الطباعة (`["base", "placements"]`) مع استثناء رسوم الملصقات المدفوعة ورسوم التراخيص من الخصم لحماية هوامش المبدعين.
4. **أولوية الموضع الأول مجاناً (First Placement Free):** تم تضمين خيار "أول موضع طباعة مجاني" للتوافق مع عروض التيشيرتات الحالية.

---

## 9. خطة الإطلاق والرجوع الآمن (Rollout & Safe Rollback)

- **الوضع الحالي:** المحرك الجديد يعمل في وضع المقارنة الصامتة فقط (Shadow Mode) دون أي تأثير مالي على العملاء.
- **في حال حدوث أي طارئ:** لا توجد أي بيانات طلبات أو حسابات عملاء متأثرة بالمحرك الجديد؛ النظام القديم (03B) يعمل باستقلالية تامة وكاملة.
- **شروط التفعيل المباشر المستقبلي:** تتطلب موافقة كتابية صريحة من المالك وتحديد تاريخ Cutover منسق بعد مراجعة تقرير الفروقات.

---

## 10. قرار التوقف (Stop Decision)

تم إنهاء المرحلة **05B** بنجاح تام وفقاً للتعليمات الصريحة:
- **توقف العمل الآن.**
- **لن يتم البدء في المرحلة 06 دون توجيه وموافقة صريحة وجديدة من المستخدم.**
