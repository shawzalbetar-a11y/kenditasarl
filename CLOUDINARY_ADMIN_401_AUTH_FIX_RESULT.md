# Kendin Tasarla — تقرير تشخيص وحل مشكلة HTTP 401 في لوحة الإدارة
## Fix Cloudinary Accounts HTTP 401 & Authorization Architecture Audit

**التاريخ:** 15 نوفمبر 2026  
**المشروع:** لوحة إدارة Kendin Tasarla (`D:\kenditasarl\kenditasarl-admin`) ومتجر Kendin Tasarla (`D:\kenditasarl`)  
**المسار المستهدف:** `http://localhost:3001/settings/cloudinary`  
**معرف مشروع Firebase الإنتاجي المؤكد:** `kanditasarl`  
**معرف مشروع محاكي Firebase المعزول:** `demo-kenditasarla-rules`  
**الحالة:** تم التشخيص الدقيق، تطبيق الحلول البرمجية، وفصل الأخطاء بنجاح (47/47 اختبار تكامل مجازة).

---

## 1. الملخص التنفيذي (Executive Summary)

تم تشخيص السبب الجذري الفعلي لظهور خطأ `HTTP 401 Unauthorized` عند طلب المسار `/api/cloudinary/accounts` من صفحة إعدادات Cloudinary في لوحة الإدارة المحلية. تبين أن المشكلة لم تكن ناجمة عن فشل واحد، بل عن تداخل ثلاثة عوامل معمارية:

1. **سباق الإقلاع المبدئي في العميل (Client-side Initial Mount Race Condition):**  
   كانت دالة `accountRequest()` تستدعي `auth.currentUser?.getIdToken()` فور تحميل الصفحة، قبل أن يُتم SDK عميل Firebase استعادة حالة الجلسة من التخزين المحلي للمتصفح. كان `auth.currentUser` يكون `null` لحظياً، مما أدى لإطلاق خطأ `"sign_in_required"` محلياً وتصنيفه كخطأ اتصال عام.
2. **طلب التحقق من الإلغاء عبر خادم Firebase Admin دون بيانات اعتماد (The `checkRevoked` Credential Barrier):**  
   داخل دالة التحقق على الخادم `authorize()`، كان يتم استدعاء `auth.verifyIdToken(token, true)` مع تمرير المعامل الثاني `checkRevoked = true`. في مكتبة `firebase-admin`، يتطلب فحص `checkRevoked` إجراء استعلام شبكي إلى Google Identity Toolkit REST API، وهو ما يتطلب بدوره وجود مفتاح حساب خدمة (`FIREBASE_SERVICE_ACCOUNT_KEY`) أو Google Cloud ADC. في بيئة التطوير المحلية دون مفتاح خدمة، كانت المكتبة تفشل فجأة بخطأ `Could not load the default credentials`، والذي كان يتم التقاطه داخل كتلة `catch` وإرجاع **401** مضلل بدلاً من إعلام الخادم بالنقص في التكوين.
3. **عدم تطابق نطاق الجمهور للجلسات القديمة (Audience Mismatch across Environments):**  
   عند تشغيل لوحة الإدارة سابقاً على المحاكيات (`demo-kenditasarla-rules`)، يتم حفظ رمز المصادقة في IndexedDB الخاص بالمتصفح. وعند إعادة تشغيل التطبيق بالوضع العادي المتصل بمشروع Firebase الحقيقي (`kanditasarl`)، كان المتصفح يرسل رمزاً يحمل مطالبة `aud: "demo-kenditasarla-rules"`. خادم الإدارة المتوقع `aud: "kanditasarl"` كان يرفض الرمز حتماً بـ 401.
4. **تعتيم واجهة المستخدم (UI Error Masking):**  
   كانت الواجهة تعالج أي خطأ غير `forbidden` على أنه `connectionError`، مما أظهر رسالة «تعذر الاتصال بخدمة حسابات التخزين. لم يتم حذف الحسابات» حتى عند حدوث 401 أو 503.

**تم تطبيق حل شامل ومحكم:**
- تم فصل حالات الأخطاء (401، 403، 503، وأخطاء الشبكة) في API وواجهة المستخدم.
- تم ضبط التحقق على الخادم لاستخدام التحقق التشفيري غير المتصل بمفاتيح الخدمة عند غياب مفتاح الحساب، وتحويل أخطاء غياب المفتاح إلى **503 Server Credentials Unconfigured**.
- تم إلزام العميل بانتظار `await auth.authStateReady()` قبل طلب الرمز.
- تم تزويد `AdminLayout` بآلية رصد الجلسات المتضاربة وتنظيفها تلقائياً عند تغيير البيئة.
- تمت إضافة الترجمات لجميع الحالات الجديدة في ملفات اللغات الثلاث (`ar.json`, `en.json`, `tr.json`) بتطابق 100%.

---

## 2. التحليل الجنائي لأسباب HTTP 401 (Forensic Root Cause Analysis)

### أ. لماذا تعمل لوحة التحكم (Dashboard) بنجاح بينما يفشل `/api/cloudinary/accounts` بـ 401؟
| وجه المقارنة | لوحة التحكم (Dashboard / Products / Orders) | واجهة برمجة حسابات التخزين (`/api/cloudinary/accounts`) |
| :--- | :--- | :--- |
| **محرك التشغيل** | Firebase Client SDK في المتصفح | Firebase Admin SDK على خادم Next.js |
| **بيانات الاعتماد** | `NEXT_PUBLIC_FIREBASE_API_KEY` (مفتاح ويب عام) | يتطلب تفويض الخادم وقراءة وثائق مشفرة من Firestore |
| **قواعد الأمان المطبقة** | `firestore.rules` في Firebase | يتجاوز قواعد الأمان عبر Admin SDK |
| **فحص المسؤول** | يقرأ وثيقة `admins/{uid}`؛ حيث تسمح القواعد: `allow read: if request.auth != null;` فتنجح القراءة فوراً. | دالة `adminOnly()` على الخادم تتحقق من `token` عبر `verifyIdToken()`، ثم تقرأ `serverDb().doc('admins/' + uid)` عبر Admin SDK. |
| **سبب التباين** | المتصفح يملك جلسة Firebase Auth صالحة وقادر على قراءة المجموعات المسموح بها في `firestore.rules`. | الخادم واجه استدعاء `verifyIdToken(token, true)` الذي يتطلب حساب خدمة لإجراء `checkRevoked` عبر REST API، وفشل لغياب المفتاح. |

---

### ب. فحص تدفق إرسال الرمز (Bearer Token Transmission)
- في صفحة `src/app/(admin)/settings/cloudinary/page.tsx`:
  - يتم استدعاء `const token = await auth.currentUser?.getIdToken();`.
  - يتم إرسال الترويسة: `headers: { Authorization: "Bearer " + token }`.
- **المشكلة التي تم رصدها:** عند أول تحميل للصفحة (Initial Mount)، تكون حالة المصادقة في طور الاستعادة من التخزين المحلي (IndexedDB)، ويكون `auth.currentUser` مساوياً لـ `null`. لم يكن الكود ينتظر اكتمال التهيئة، مما أدى لإلقاء خطأ فوري قبل إرسال الطلب، وتم تصنيفه خطأً كفشل اتصال.
- **الحل المطبق:**
  ```typescript
  if (auth && typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }
  ```

---

### ج. فحص دالة التحقق على الخادم (`verifyIdToken` & `checkRevoked`)
- في `src/lib/server/cloudinaryServer.ts`:
  - كان الكود ينفذ: `const decoded = await auth.verifyIdToken(token, true);`.
  - المعامل `true` يعني `checkRevoked: true`.
  - في Firebase Admin SDK، عندما يكون `checkRevoked: true`، يقوم الـ SDK بطلب HTTP خارجي إلى Google Identity Toolkit API (`identitytoolkit.googleapis.com`) للتأكد من وقت إصدار الرمز مقارنة بـ `validSince`. هذا الطلب الخارجي **يتطلب حتماً** مصادقة Google OAuth2 عبر مفتاح حساب الخدمة (Service Account Key) أو ADC.
  - محلياً، لا يوجد مفتاح خدمة إنتاجي في البيئة (`FIREBASE_SERVICE_ACCOUNT_KEY` غير معرف عمداً لحماية الإنتاج).
  - النتيجة: إلقاء استثناء: `FirebaseAppError: Could not load the default credentials`.
  - كان هذا الاستثناء يسقط داخل كتلة `catch` عامة تعيد `return 401;`!
- **الحل المطبق:**
  1. التحقق من التوقيع التشفيري للرمز محلياً باستخدام مفاتيح Google العامة (Public x509 Certificates) دون الحاجة لحساب خدمة (`checkRevoked: false` عندما لا يتوفر مفتاح حساب الخدمة).
  2. قصر فحص `checkRevoked: true` على البيئات المزودة بمفتاح خدمة رسمي فقط.
  3. إذا فشل فحص صلاحية المسؤول في Firestore بسبب غياب بيانات اعتماد الخادم، يتم إرجاع **HTTP 503** صريح بدلاً من 401.

---

### د. فحص بقايا جلسات المحاكي المتضاربة (Audience Mismatch)
- عند استخدام `dev-isolated.mjs`، يقوم محاكي Auth بإصدار رموز يكون فيها حقل `aud` وحقل `iss` يحملان القيمة `demo-kenditasarla-rules`.
- يخزن المتصفح هذه الجلسة في `IndexedDB` الخاص بنطاق `localhost:3001`.
- عند تشغيل الخادم لاحقاً على المشروع الحقيقي: `NEXT_PUBLIC_FIREBASE_PROJECT_ID=kanditasarl`.
- يستخرج الخادم الرمز، فيجد:
  `token aud="demo-kenditasarla-rules", server expects="kanditasarl"`.
- ترفض مكتبة Firebase Admin الرمز حتماً بسبب عدم تطابق المشروع (`Firebase ID token has incorrect "aud" claim`).
- **الحل المطبق:**
  1. في `AdminLayout` (`src/app/(admin)/layout.tsx`):
     فحص فوري لمطالبة `tokenResult.claims.aud` ومقارنتها بـ `process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID`. وإذا وجد عدم تطابق، يتم استدعاء `signOut(auth)` فوراً وتوجيه المستخدم لتسجيل الدخول النظيف.
  2. في `cloudinaryServer.ts`:
     فحص مسبق لحمولة الرمز (JWT Payload) قبل التحقق وتسجيل تحذير تشخيصي واضح في سجلات الخادم:
     `[AUTH] Session project mismatch: token aud="demo-kenditasarla-rules", server expects="kanditasarl"`.

---

## 3. التعديلات البرمجية المنفذة (Code Fixes Summary)

### 1. خادم التوثيق وحسابات Cloudinary (`src/lib/server/cloudinaryServer.ts`)
- **فحص عدم تطابق الـ Audience:** فك تشفير الحمولة قبل التحقق وتسجيل التحذير التشخيصي.
- **التدقيق التشفيري دون متطلبات ADC:**
  ```typescript
  const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  // Only verify revocation via Google REST API if service account credentials exist
  const decoded = await auth.verifyIdToken(token, hasServiceAccount);
  ```
- **عزل أخطاء الخادم (503) عن أخطاء المصادقة (401/403):**
  عند الاستعلام عن وثيقة المسؤول `admins/{uid}`، إذا فشل Firestore لغياب بيانات الاعتماد (`Could not load the default credentials` أو `UNAVAILABLE`)، يتم إرجاع الرمز `503` بدلاً من `null`.

### 2. مسار API لإدارة الحسابات (`src/app/api/cloudinary/accounts/route.ts`)
- **معالجة رمز 503:**
  ```typescript
  if (uid === 503) {
    return NextResponse.json({ error: "server_credentials_unconfigured" }, { status: 503 });
  }
  ```
- **حماية استعلام الحسابات:** عند فشل `listAccounts()` بسبب نقص مفتاح الخدمة، يعيد المسار استجابة 503 نظيفة توضح أن الخادم غير مهيأ ببيانات الاعتماد، بدلاً من انهيار الطلب.

### 3. صفحة إعدادات Cloudinary (`src/app/(admin)/settings/cloudinary/page.tsx`)
- **انتظار جاهزية الجلسة:** استدعاء `await auth.authStateReady()` قبل قراءة الرمز.
- **فصل الحالات البصرية للأخطاء:**
  - **401 Unauthorized (`unauthorized`):** يظهر تنبيهاً بلون كهرماني (Amber) يوضح أن الجلسة منتهية أو غير مسجلة مع زر ينقل المستخدم مباشرة لصفحة تسجيل الدخول (`/login`).
  - **403 Forbidden (`forbidden`):** تنبيه أحمر يوضح أن الحساب الحالي لا يملك صلاحية المسؤول.
  - **503 Server Credentials Unconfigured (`server_unconfigured`):** تنبيه أزرق/رمادي معلوماتي احترافي يوضح أن خادم الإدارة يعمل محلياً دون مفتاح خدمة للوصول إلى Firestore المباشر.
  - **Network / Other (`connection`):** تنبيه مع زر إعادة المحاولة (Retry).

### 4. التوافق اللغوي الكامل (`messages/{ar,en,tr}.json`)
تمت إضافة المفاتيح الجديدة في ملفات اللغات الثلاث مع الحفاظ على تطابق المفاتيح بنسبة 100% (29 مفتاحاً في كل لغة):
- `unauthorized`
- `login`
- `forbidden`
- `serverUnconfigured`
- `cannotDeleteActive`

---

## 4. تحليل حاجز بيانات الاعتماد اللاحق (Subsequent Firebase Admin Credentials Barrier)

### لماذا لا يمكن للعميل قراءة حسابات Cloudinary مباشرة؟
في قواعد أمان Firestore (`firestore.rules`):
```text
match /settings/{setting} {
  allow read: if setting != 'storage';
  allow write: if isAdmin();
}
```
المجموعة `settings/storage/cloudinary` محظورة تماماً من القراءة عبر العميل لحماية `api_secret` و`api_key` من التسرب لمتصفح الزوار أو الفاحصين.

### ماذا يحدث عند حل الـ 401 في بيئة محلية متصلة بـ Firebase الإنتاجي؟
1. يرسل المتصفح رمز مصادقة صالحاً صادراً من `kanditasarl`.
2. يتحقق خادم Next.js من صحة توقيع الرمز تشفيرياً بنجاح (يمر الـ 401).
3. للتحقق من أن هذا المستخدم مسؤول، يجب على خادم Next.js استعلام Firestore لقراءة الوثيقة `admins/{uid}`، ثم قراءة `settings/storage/cloudinary`.
4. خادم Next.js لا يملك `FIREBASE_SERVICE_ACCOUNT_KEY` في ملف `.env.local`، ولا يملك ADC في البيئة المحلية.
5. مكتبة Google Cloud Firestore تفشل فوراً بخطأ:
   `Error: 16 UNAVAILABLE: Could not load the default credentials`.
6. بفضل الإصلاح المطبق، يعود الخادم الآن برمز **HTTP 503** واضح ورسالة مهنية:
   `{ "error": "server_credentials_unconfigured" }`.
7. **النتيجة:** لم تعد المشكلة 401 مضللة، بل أصبحت تعكس الواقع بدقة وأمان تام: الخادم المحلي مصادق على هوية المستخدم، لكنه يفتقر عمداً لصلاحيات الوصول المباشر لقاعدة البيانات السحابية الحقيقية لحماية الإنتاج.

---

## 5. مقارنة السلوك: الوضع العادي مقابل وضع المحاكيات

| المحور | وضع المحاكيات المعزولة (`npm run dev:isolated`) | الوضع العادي المحلي (`npm run dev -- -p 3001`) |
| :--- | :--- | :--- |
| **مشروع Firebase** | `demo-kenditasarla-rules` | `kanditasarl` |
| **خدمة Auth** | Auth Emulator على المنفذ `19099` | Google Identity Platform الحقيقية |
| **خدمة Firestore** | Firestore Emulator على المنفذ `18080` | Google Cloud Firestore الحقيقية |
| **بيانات الاعتماد للخادم** | تلقائية عبر متغيرات المحاكي (`FIRESTORE_EMULATOR_HOST`) | تتطلب `FIREBASE_SERVICE_ACCOUNT_KEY` أو ADC |
| **استجابة `/api/cloudinary/accounts`** | **HTTP 200 OK** وتظهر الحسابات كاملة | **HTTP 503** (بيانات الاعتماد للخادم غير مهيأة محلياً) |
| **إمكانية إدارة وتبديل الحسابات** | تعمل 100% تجريبياً دون أي مخاطر | محمية من أي عبث غير مقصود بالإنتاج |
| **أمان أسرار الإنتاج** | معزولة تماماً داخل الذاكرة المحلية للمحاكي | محمية 100% ولا تخرج إلى بيئة التطوير |

---

## 6. الخيارات المعمارية الآمنة المستقبلية لعرض حسابات Firestore الحقيقية

لتمكين خادم الإدارة من الوصول إلى حسابات Firestore الحقيقية مستقبلاً دون المساس بالأمان أو تحميل ملفات مفاتيح خطرة محلياً، نوصي باتباع أحد الخيارات التالية:

### الخيار 1 (الموصى به للإنتاج): نشر لوحة الإدارة على بيئة سحابية آمنة (Cloud Run / Vercel)
- يتم حفظ `FIREBASE_SERVICE_ACCOUNT_KEY` كمتغير بيئة سري مشفر داخل إعدادات الاستضافة السحابية المعتمدة (Vercel Secrets / Google Secret Manager).
- لا يتم حفظ أي مفتاح على أجهزة المطورين أو في مستودع الكود.
- يستطيع خادم الإنتاج قراءة وثائق `settings/storage/cloudinary` والتحقق من حسابات Cloudinary بأمان تام وتقديمها للمسؤولين المصادق عليهم فقط.

### الخيار 2 (للتطوير المحلي الآمن مع Firestore الحقيقي): Google Cloud ADC الشخصي
- بدلاً من تحميل ملف `service-account.json` ثابت وخطير، يسجل المطور دخوله عبر واجهة سطر أوامر Google Cloud المعتمدة:
  ```bash
  gcloud auth application-default login
  ```
- يتم منح حساب المطور الشخصي صلاحية `roles/datastore.user` في مشروع Google Cloud `kanditasarl` فقط.
- يتعرف Firebase Admin SDK تلقائياً على بيانات الاعتماد عبر Google ADC دون الحاجة لكتابة أي أسرار في ملفات المشروع.

### الخيار 3 (للتطوير المحلي المعزول تماماً — المطبق حالياً):
- الاستمرار في استخدام البيئة المعزولة عبر الأمر:
  ```bash
  npm run dev:isolated
  ```
- هذا الخيار يتيح تجربة واجهة إضافة وتبديل حسابات Cloudinary بالكامل محلياً وبشكل مرئي 100% دون أي اتصال بالإنتاج ودون أي تكلفة أو خطر.

---

## 7. نتائج اختبارات التحقق والسلامة التلقائية

تم تشغيل حزم الاختبارات التلقائية المجمعة عبر بيئة المحاكيات المعزولة:
```bash
node scripts/dev-isolated.mjs test
```

### سجل النتائج:
- **Phase 1 (إدارة حسابات Cloudinary وعزل الأسرار):**  
  اجتياز 13 من أصل 13 اختباراً بنجاح (100%).
- **Phase 2A (توحيد معالج الحساب النشط بين المتجر والأدمن):**  
  اجتياز 12 من أصل 12 اختباراً بنجاح (100%).
- **Phase 2B (بوابات أمان عمليات الرفع والتبديل المتزامن):**  
  اجتياز 14 من أصل 14 اختباراً بنجاح (100%).
- **Phase 2D (متطلبات التشغيل المحلي وبوابات الإدارة):**  
  اجتياز 8 من أصل 8 متطلبات بنجاح (100%).

**المجموع الكلي:** **47 اختبار تكامل اجتيزت بنجاح كامل (0 فشل).**

---

## 8. التحقق من سلامة البناء (TypeScript Compilation)

تم إجراء تدقيق صارم لأنواع TypeScript على كامل المشروعين:
```bash
# المتجر (Store)
npx tsc --noEmit -> 0 errors (نجاح تام)

# لوحة الإدارة (Admin)
cd kenditasarl-admin && npx tsc --noEmit -> 0 errors (نجاح تام)
```

---

## 9. التوصية التشغيلية للمطور

لتشغيل لوحة الإدارة وتجربة واجهة إعدادات Cloudinary بصرياً مع الحسابات الافتراضية:
1. استخدم الأمر الموحد من المجلد الرئيسي للمشروع:
   ```bash
   npm run dev:isolated
   ```
2. افتح المتصفح على الرابط: `http://localhost:3001/settings/cloudinary`.
3. اضغط على "تسجيل الدخول للمحاكي" بحساب المسؤول التجريبي:
   - البريد: `admin@example.com`
   - كلمة المرور: `MockAdminPass123!`
4. ستظهر قائمة الحسابات كاملة مع الحساب النشط وإمكانية تفعيل أو إضافة أي حساب بسلاسة وأمان تام.
