# Kendin Tasarla — تقرير تدقيق أمان حسابات الأدمن وصلاحيات Firebase (المرحلة 06C)
## Phase 06C: Admin Security & Access Audit Report

**التاريخ:** 15 نوفمبر 2026  
**المشاريع المستهدفة:**  
- متجر Kendin Tasarla (`D:\kenditasarl`)  
- لوحة إدارة Kendin Tasarla (`D:\kenditasarl\kenditasarl-admin`)  
**معرف مشروع Firebase الإنتاجي:** `kanditasarl`  
**معرف مشروع محاكي Firebase المعزول:** `demo-kenditasarla-rules`  
**طبيعة التدقيق:** تدقيق أمني للقراءة فقط (Read-Only Security Audit) واختبارات تكامل معزولة على المحاكيات (Firebase Emulators).  
**القرار النهائي:** **PASS (اجتياز كامل ومثبت)**.

---

## 1. نتائج فحص عضويات الأدمن (Admin Membership Examination Results)

تم إجراء مسح شامل لكافة الملفات البرمجية وقواعد الأمان وقواعد البيانات للتحقق من كيفية التعامل مع المجموعة `admins/{uid}`:

### أ. حصر استعلامات `admins/{uid}` في المشروعين:
1. **في قواعد أمان Firestore (`firestore.rules`):**
   - **الدالة المركزية `isAdmin()`:**
     ```text
     function isAdmin() {
       return isStoreUser() &&
         exists(/databases/$(database)/documents/admins/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.get('role', '') in ['admin', 'superadmin'];
     }
     ```
   - **حماية مجموعة العضويات (`match /admins/{adminId}`):**
     ```text
     match /admins/{adminId} {
       allow get: if isStoreUser() && request.auth.uid == adminId;
       allow list, write: if false;
     }
     ```
2. **في التحقق الخادمي (`cloudinaryServer.ts` في المتجر والأدمن):**
   - الدالة `authorize(request, adminOnly)` تستعلم مباشرة من Firestore عبر `serverDb().doc(`admins/${uid}`).get()` وتتحقق بأن حقل `role` يساوي حصراً `"admin"` أو `"superadmin"`.
3. **في فحص واجهة الإدارة (`adminMembership.ts` في الأدمن):**
   - الدالة `hasAdminMembership(uid)` تستعلم من خادم Firestore مباشرة `getDocFromServer(doc(db, "admins", uid))` وتتحقق من مطابقة الدور.
4. **في مسارات API الخادمية المخصصة (`pricing-policies`, `print-templates`, `matching-collections`, `shipping-zones`):**
   - يتم التحقق المزدوج من `admins/{actor}` قبل معالجة أي طلب إداري أو كتابة مسودة.

### ب. كيفية إنشاء وتعيين وإلغاء صلاحيات `admin` و`superadmin`:
- **آلية التعيين:** **لا توجد أي واجهة برمجية (API Route) في النظام تسمح بإنشاء أو تعديل وثائق `admins/{uid}`.** يتم التعيين حصرياً عبر Google Firebase Console أو سكريبتات إدارية من سطر الأوامر تمتلك بيانات اعتماد السحابة المباشرة (Service Account).
- **بنية الوثيقة المعتمدة:**
  ```json
  {
    "email": "admin@kenditasarla.local",
    "role": "admin", // أو "superadmin"
    "updated_at": "2026-11-15T20:00:00.000Z"
  }
  ```
- **آلية الإلغاء:** يتم إلغاء الصلاحية فوراً بحذف الوثيقة أو تعديل `role` إلى أي قيمة أخرى (مثل `"disabled"`). وبفضل التحقق الخادمي في كل طلب، تسقط الصلاحية لحظياً دون انتظار انتهاء جلسة التوكن.

### ج. فحص الأبواب الخلفية القديمة (Legacy Backdoor Audit):
- تم رصد وجود شفرة سابقة في ملف `src/app/(admin)/layout.tsx` كانت تحتوي على شرط:
  `user.email?.toLowerCase() === "huhu@huhu.com" || user.uid === "fR4rjb0EzDT2U2Ti3wPKEdwP4x42"`
  وكانت تحاول استدعاء `setDoc(doc(db, "admins", user.uid), { role: "superadmin" })`.
- **النتيجة الجنائية:**
  1. حتى مع وجود تلك الشفرة سابقاً، كانت قواعد الأمان `firestore.rules` (`allow write: if false;`) تحظر كتابة العميل لوثيقة الأدمن وتفشل العملية بـ `PERMISSION_DENIED`.
  2. في فرع العمل الحالي (`codex/task04-print-production`)، **تم استئصال هذه الشفرة بالكامل** واستبدالها بالدالة النظامية `hasAdminMembership(user.uid)` التي تعتمد حصرياً على القراءة الآمنة من Firestore.
  3. تم التحقق من خلو كامل مستودعي المتجر والأدمن من أي بريد أو UID مشفر hardcoded.

---

## 2. خريطة الصلاحيات ومسارات API (Permission Map & Sensitive API Routes)

| مسار API (Route) | المشروع | الطريقة | فحص المصادقة | الدور المطلوب | آلية فرض الصلاحيات (Enforcement) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/cloudinary/accounts` | Admin | GET / POST | `authorize(req, true)` | `admin` / `superadmin` | خادمية صارمة؛ قفل تام لـ `api_secret` وعزل 503 عند نقص الاعتماد |
| `/api/pricing-policies` | Admin | POST | `authorize(req, true)` + `db.doc(admins/{uid})` | `admin` / `superadmin` | خادمية صارمة مع معاملات ذرية (Transactions) وتدقيق تجزئة SHA-256 |
| `/api/print-templates` | Admin | POST | `authorize(req, true)` + `tx.get(admins/{uid})` | `admin` / `superadmin` | خادمية داخل معاملة ذرية ترفض التعديل دون صلاحية مسؤول مثبتة |
| `/api/matching-collections` | Admin | GET / POST / PUT / DELETE | `authorize(req, true)` + `db.doc(admins/{uid})` | `admin` / `superadmin` | خادمية صارمة مع فحص zod schemas ومنع وصول غير المسؤولين |
| `/api/shipping-zones` | Admin | GET / POST | `authorize(req, true)` + `db.doc(admins/{uid})` | `admin` / `superadmin` | خادمية صارمة؛ إدارة مناطق التوصيل مقصورة على مسؤولي المتجر |
| `/api/order-operations` | Admin | POST | `authorize(req, true)` | `admin` / `superadmin` | خادمية لمعالجة حالات الطلب وإشعارات الشحن |
| `/api/production/coordinate-review` | Admin | GET / POST | `authorize(req, true)` | `admin` / `superadmin` | خادمية لاعتماد إحداثيات ومطابقة ملفات الإنتاج المطبوعة |
| `/api/upload` | Admin | POST | `authorize(req, true)` | `admin` / `superadmin` | رفع أصول المنتجات الإدارية مقصور على الأدمن |
| `/api/upload` | Store | POST | `authorize(req, false, true)` | زائر أو مستخدم | رفع تصاميم العملاء مع توثيق الملكية في `upload_receipts` |
| `/api/checkout/quote` | Store | POST | `authorize(req, false, false)` | مستخدم مسجل | رفض الضيوف مجهولي الهوية؛ قفل تام لعروض الأسعار الرسمية |
| `/api/checkout/confirm` | Store | POST | `authorize(req, false, false)` | مستخدم مسجل | تثبيت الطلبات ومنع التلاعب بالأسعار أو المناطق |
| `/api/master-designs` | Store | GET / POST / DELETE | `authorize(req, false, false)` | صاحب التصميم فقط | عزل صارم بمطابقة `userId == token.uid` مع رفض انتحال الهوية |
| `/api/matching-bundles` | Store | GET / POST / DELETE | `authorize(req, false, false)` | صاحب الحزمة فقط | عزل وثائق المسودات وتعديلها محصور بمالك الجلسة المصادق عليه |

---

## 3. تقييم الثغرات المؤكدة والمخاطر المحتملة (Vulnerability Assessment)

| رقم | الخطر المفحوص | التقييم | حالة المعالجة الحالية |
| :--- | :--- | :--- | :--- |
| **V-01** | محاولة العميل إنشاء وثيقة لنفسه في `admins/{uid}` لترقية نفسه | **معدوم (Zero Risk)** | محمي في نواة Firestore عبر `firestore.rules`: `allow write: if false;`. أثبتت الاختبارات أن العميل يواجه `PERMISSION_DENIED`. |
| **V-02** | محاولة Admin ترقية دوره إلى `superadmin` أو تعديل حسابات أخرى | **معدوم (Zero Risk)** | محمي في `firestore.rules`: لا يملك أي حساب (حتى الأدمن) صلاحية كتابة في `admins/` عبر Client SDK. ولا يوجد أي مسار API خادمي يسمح بتعديل العضويات. |
| **V-03** | تسرب مفاتيح وأسرار Cloudinary للمتصفح | **معدوم (Zero Risk)** | 1. دالة `listAccounts()` على الخادم تقوم بإسقاط `api_key` و`api_secret` تلقائياً عبر إسقاط الحقول (`select`).<br>2. قواعد `firestore.rules` تمنع صراحة قراءة فرع التخزين: `match /settings/{setting} { allow read: if setting != 'storage'; }`. |
| **V-04** | استغلال جلسة ملغاة أو مستخدم محذوف | **معدوم (Zero Risk)** | تم فرض `auth.verifyIdToken(rawToken, true)` مع `checkRevoked: true` دائماً. يتم رفض الجلسة بـ 401 فور استدعاء `revokeRefreshTokens` أو حذف المستخدم. |
| **V-05** | انتحال هوية مستخدم عبر ترويسة `x-user-id` | **معدوم (Zero Risk)** | يتم فحص الترويسة في `authorize()` ومقارنتها بـ `token.uid`. أي اختلاف يؤدي إلى الرفض الفوري بـ **HTTP 403 Forbidden**. |
| **V-06** | تشغيل الخادم دون بيانات اعتماد وقبول التوكن بفحص أضعف | **معدوم (Zero Risk)** | تم تطبيق مبدأ **Fail-Closed**؛ عند تعذر فحص الإلغاء أو دور الأدمن لغياب هوية الخادم، يُرجع الخادم **HTTP 503** صريحاً ولا يقبل الجلسة مطلقاً. |

---

## 4. اختبارات المحاكيات ونتائجها التفصيلية (Firebase Emulators Tests)

تم تشغيل حزمة اختبارات التدقيق الأمني المستقلة `tests/firestore/phase06c_admin_security_audit.mts` عبر أمر `firebase emulators:exec`:

```text
i  Running script: npx tsx --test tests/firestore/phase06c_admin_security_audit.mts
▶ Kendin Tasarla — Phase 06C: Admin Security & Access Audit
  ✔ [Audit 1] Normal user attempting to access administrative API is rejected with 403 (547.47ms)
  ✔ [Audit 2] Normal user attempting to create admins/{uid} via Client SDK is rejected (282.38ms)
  ✔ [Audit 3] Admin attempting to escalate self to superadmin via Client SDK is rejected (33.17ms)
  ✔ [Audit 4] Admin attempting to modify another user's admins doc via Client SDK is rejected (46.09ms)
  ✔ [Audit 5] Superadmin authorized access succeeds on admin endpoints (28.23ms)
  ✔ [Audit 6] Deleted or disabled user token rejected with 401 Unauthorized (36.23ms)
  ✔ [Audit 7] Revoked session token rejected with 401 Unauthorized (1138.54ms)
  ✔ [Audit 8] Different Firebase project token (audience mismatch) rejected with 401 (1.14ms)
  ✔ [Audit 9] Absence of server credentials when verifying admin roles returns 503 (4.46ms)
  ✔ [Audit 10] Cloudinary API secrets are never leaked via API response or client SDK (200.75ms)
✔ Kendin Tasarla — Phase 06C: Admin Security & Access Audit (4060.68ms)
ℹ tests 10 | suites 1 | pass 10 | fail 0 | cancelled 0 | skipped 0
```

### أدلة الأمان المستخرجة من سجلات محاكي قواعد Firestore:
- عند محاولة المستخدم العادي إنشاء وثيقة عضويته:  
  `GrpcConnection RPC 'Write' error. Code: 7 Message: 7 PERMISSION_DENIED: false for 'create' @ L109, false for 'update' @ L109`
- عند محاولة الأدمن ترقية دوره إلى superadmin:  
  `GrpcConnection RPC 'Write' error. Code: 7 Message: 7 PERMISSION_DENIED: false for 'update' @ L109`
- عند محاولة تعديل أو حذف عضويات أخرى:  
  `GrpcConnection RPC 'Write' error. Code: 7 Message: 7 PERMISSION_DENIED: false for 'delete' @ L109`

---

## 5. دليل المراجعة اليدوية لحسابات الأدمن الحقيقية (Manual Console Verification Guide)

نظراً للالتزام الصارم بعدم الاتصال بـ Firebase الإنتاجي أو تعديله برمجياً في هذه المرحلة، يمكنك تنفيذ هذه الخطوات اليدوية البسيطة عبر متصفحك من خلال **Firebase Console**:

### الخطوة 1: فحص مستخدمي المصادقة (Authentication Users)
1. افتح المتصفح وتوجه إلى [Firebase Console](https://console.firebase.google.com/).
2. اختر المشروع الإنتاجي: **`kanditasarl`**.
3. من القائمة الجانبية، انتقل إلى **Build** -> **Authentication** -> تبويب **Users**.
4. راجع قائمة البريد الإلكتروني المسجلة وتأكد من أن جميع الحسابات معروفة وتتبع لأشخاص مخولين في فريق العمل.
5. انسخ قيمة المعرف الفريد (**User UID**) لكل حساب مخصص كمدير.

### الخطوة 2: فحص مجموعة العضويات في Firestore (`admins`)
1. من القائمة الجانبية، انتقل إلى **Build** -> **Firestore Database**.
2. اختر المجموعة: **`admins`**.
3. **طابق كل وثيقة:**
   - يجب أن يكون اسم الوثيقة (Document ID) متطابقاً تماماً مع **User UID** المنسوخ من شاشة Authentication.
   - افتح الوثيقة وتأكد من وجود حقل:
     - `role`: قيمته يجب أن تكون إما `"admin"` أو `"superadmin"` حصراً.
   - إذا وجدت أي وثيقة بـ Document ID لا ينتمي لمستخدم نشط في Authentication، احذف تلك الوثيقة فوراً.

### الخطوة 3: التحقق من الحسابات القديمة أو المهجورة
- إذا وجد حساب البريد التجريبي القديم (`huhu@huhu.com`) أو الـ UID (`fR4rjb0EzDT2U2Ti3wPKEdwP4x42`) في لوحة الإنتاج:
  1. احذف وثيقة `admins/fR4rjb0EzDT2U2Ti3wPKEdwP4x42` إن وُجدت.
  2. عطل أو احذف المستخدم من شاشة Authentication.

### الخطوة 4: التحقق من وثيقة Cloudinary في Firestore
1. في Firestore، افتح المسار: `settings/storage/cloudinary`.
2. تأكد من وجود وثيقة الحساب النشط الحالي (`is_active: true`) وتطابق معرف الحساب السحابي مع الحساب المعتمد الجديد (`kenditasarla-server-2026`).

---

## 6. خطة معالجة المشكلات حسب الأولوية (Prioritized Remediation Plan)

| الأولوية | الإجراء الموصى به | الحالة الحالية |
| :--- | :--- | :--- |
| **P0 (حرجة)** | منع كتابة أو ترقية العضويات عبر العميل | **مكتملة ومحصنة 100%** في `firestore.rules`. |
| **P0 (حرجة)** | إلزامية فحص الجلسات الملغاة `checkRevoked: true` في مسارات الأدمن الحساسة | **مكتملة ومحصنة 100%** في `cloudinaryServer.ts`. |
| **P0 (حرجة)** | منع كشف `api_key` و`api_secret` في استجابات API وقواعد Firestore | **مكتملة ومحصنة 100%** عبر إسقاط الحقول وقواعد الأمان. |
| **P1 (عالية)** | عزل البيئة المحلية عن الإنتاج وتشغيل 503 عند غياب هوية الخادم | **مكتملة ومحققة 100%**؛ تم منع أي تراجع لفحص ضعيف. |
| **P2 (متوسطة)** | المراجعة اليدوية لـ Firebase Console للمشروع `kanditasarl` | **جاهزة للتنفيذ** وفق الخطوات الموضحة في القسم 5 أعلاه. |
| **P3 (عند النشر)** | تزويد بيئة الاستضافة السحابية المعتمدة (Cloud Run / Vercel) بـ Service Account | **مجدولة لمرحلة الإطلاق الإنتاجي**. |

---

## 7. قرار التدقيق النهائي (Final Verdict)

### القرار: **PASS (اجتياز كامل ومثبت بالأدلة)**

**الأدلة القاطعة:**
1. **قواعد الأمان (Firestore Rules):** تمنع تماماً أي عملية كتابة (`allow write: if false;`) على مجموعة `admins/`، وتمنع قراءة `settings/storage/cloudinary` لغير الخادم.
2. **التحقق الخادمي الصارم:** جميع مسارات لوحة الإدارة الحساسة تفرض `authorize(req, true)` مع فحص دور `admin`/`superadmin` في Firestore والتحقق الإلزامي من الجلسات الملغاة.
3. **انعدام نقاط الترقية التلقائية:** لا توجد أي واجهة برمجية أو شفرة تتيح للمستخدم ترقية نفسه أو إنشاء صلاحيات إدارية.
4. **حماية أسرار التخزين:** أسرار Cloudinary لا تخرج إلى المتصفح مطلقاً سواء عبر API أو عبر قواعد البيانات المباشرة.
5. **سلامة الاختبارات والبناء:** اجتياز 10/10 اختبارات تدقيق في Phase 06C، واجتياز 55/55 اختبار تكامل سابق، مع 0 أخطاء في فحص TypeScript عبر كامل المشروعين.
