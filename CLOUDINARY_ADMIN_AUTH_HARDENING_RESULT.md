# Kendin Tasarla — تقرير التعزيز الأمني لمصادقة لوحة الإدارة
## Cloudinary Admin Authentication Security Hardening Result

**التاريخ:** 15 نوفمبر 2026  
**المشاريع:** متجر Kendin Tasarla (`D:\kenditasarl`) ولوحة إدارة Kendin Tasarla (`D:\kenditasarl\kenditasarl-admin`)  
**الحالة:** تم التعزيز الأمني، تطبيق مبدأ Fail-Closed، دعم Google ADC، والتحقق الشامل من 55 اختبار تكامل (100% نجاح).

---

## 1. السبب الأمني والتعديل النهائي (Security Justification & Final Architecture)

### الثغرة السابقة (Vulnerability / Insecurity of Conditional checkRevoked):
في التحديث السابق، تم استخدام فحص شرطي:
```typescript
const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
const decoded = await auth.verifyIdToken(token, hasServiceAccount);
```
كان هذا المنطق يعاني من خطأين أمنيين ومعماريين جوهريين:
1. **تخفيض الأمان الصامت (Silent Security Degradation / Fail-Open):**  
   عند غياب متغير `FIREBASE_SERVICE_ACCOUNT_KEY`، كان الخادم يقوم بتعطيل فحص الجلسات الملغاة تلقائياً (`checkRevoked: false`) ويقبل الجلسة بفحص أضعف، بدلاً من التوقف الآمن (Fail-Closed).
2. **عدم دعم Google ADC (Application Default Credentials):**  
   في البيئات السحابية الموثوقة مثل Google Cloud Run أو GKE أو Compute Engine، أو أجهزة المطورين المعتمدة عبر `gcloud auth application-default login`، لا يتم استخدام ملف مفتاح خدمة JSON، بل يتم الاعتماد على هوية الخدمة المدمجة (Workload Identity / ADC). في تلك البيئات، يكون `FIREBASE_SERVICE_ACCOUNT_KEY` فارغاً، مما كان سيعطل فحص إلغاء الرموز دون مبرر رغم توفر بيانات اعتماد موثوقة تماماً.
3. **الاعتماد على فك تشفير JWT غير المتحقق منه (Unverified Decode Decision):**  
   كان الكود يستخرج `rawToken.split(".")[1]` ويقرأ حقل `aud` قبل التحقق التشفيري من التوقيع لاتخاذ قرار 401، وهو ما يخالف قواعد حدود الثقة التشفيرية، بالإضافة إلى طباعة تفاصيل داخلية للرمز في السجلات.

### المعمارية الأمنية المعززة والنهائية (Hardened Final Architecture):
1. **فحص الإلغاء الصريح والإلزامي (`checkRevoked: true` Always):**  
   تم إلغاء أي شرط، وأصبح استدعاء `auth.verifyIdToken(rawToken, true)` إلزامياً وثابتاً لجميع الطلبات دون أي تراجع.
2. **مبدأ الإغلاق الآمن عند غياب بيانات الاعتماد (Fail-Closed with HTTP 503):**  
   إذا كانت بيانات الاعتماد الخادمية اللازمة لإجراء فحص الإلغاء عبر Google Identity Toolkit أو قراءة صلاحيات المسؤول من Firestore غير متوفرة (مثل بيئة تطوير غير مهيأة ببيانات الخادم)، لا يتم التراجع لفحص أضعف؛ بل يتم إرجاع **HTTP 503 Service Unavailable** فوراً وبشكل صريح وآمن.
3. **الدعم الكامل لهوية Google ADC:**  
   تم ضبط `initializeApp` ليستخدم `applicationDefault()` من `firebase-admin/app` تلقائياً في حال عدم وجود `FIREBASE_SERVICE_ACCOUNT_KEY`، مما يدعم Cloud Run، GKE، وهويات GCP المعتمدة بصورة أصلية وموثوقة.
4. **الاعتماد الحصري على التحقق التشفيري:**  
   تمت إزالة فك التشفير غير المصدق للـ JWT. أصبحت جميع قرارات المصادقة تتخذ استناداً إلى نتائج استثناءات مكتبة Firebase Admin الموثقة تشفيرياً.
5. **نظافة السجلات (Zero Token Leakage in Logs):**  
   تم منع طباعة الرموز الخام أو أجزاء التوكن أو المطالبات الحساسة في السجلات؛ ويقتصر التسجيل على رموز الأخطاء التصنيفية العامة (مثل `auth/id-token-expired` و`auth/id-token-revoked`).

---

## 2. الملفات المعدلة (Modified Files)

1. `kenditasarl-admin/src/lib/server/cloudinaryServer.ts`:
   - استيراد `applicationDefault` من `firebase-admin/app`.
   - ضبط `app()` لدعم `cert()` عند وجود المتغير أو `applicationDefault()` كمعيار أساسي لـ ADC.
   - إضافة دالة `isServerCredentialError(err)` لرصد أخطاء نقص بيانات الاعتماد وعزلها.
   - جعل `auth.verifyIdToken(rawToken, true)` إلزامياً دائماً.
   - إرجاع 503 عند نقص بيانات الاعتماد اللازمة لفحص الإلغاء أو دور المسؤول.
   - حذف فك تشفير الـ JWT غير المتحقق منه.
2. `src/lib/server/cloudinaryServer.ts` (متجر Kendin Tasarla):
   - تحديث متطابق بنسبة 100% مع لوحة الإدارة لضمان بقاء المنطق المعماري موحداً بين المتجر والأدمن.
3. `kenditasarl-admin/src/app/(admin)/layout.tsx`:
   - تنظيف رسالة السجل التشخيصية وحذف طباعة تفاصيل المطالبات الخاصة بالمشروع لمنع أي تسريب في سجلات المتصفح.
4. `tests/security/auth_hardening_integration.mts`:
   - ملف اختبارات تكاملية أمنية شاملة مبني على معايير Node.js Test Runner وFirebase Emulators.

---

## 3. نتائج الاختبارات الأمنية (Security Test Results)

تم تنفيذ حزمة الاختبارات الجديدة `tests/security/auth_hardening_integration.mts` على محاكيات Firebase:

```text
▶ Kendin Tasarla — Cloudinary Admin Authentication Security Hardening
  ✔ Gate 1: Valid admin token succeeds and returns UID (1443.75ms)
  ✔ Gate 2: Expired token rejected with 401 Unauthorized (0.91ms)
  ✔ Gate 3: Token from different project (aud mismatch) rejected with 401 Unauthorized (0.35ms)
  ✔ Gate 4: Revoked session token rejected with 401 Unauthorized (checkRevoked enforced) (1167.28ms)
  ✔ Gate 5: Normal non-admin user rejected with 403 Forbidden for admin-only routes (21.72ms)
  ✔ Gate 6: Server credentials failure returns 503 Service Unavailable (Fail-Closed) (3.81ms)
  ✔ Gate 7: ADC credentials integration loads via applicationDefault() without errors (0.40ms)
  ✔ Gate 8: User ID spoofing rejected with 403 (x-user-id != token.uid) (1.74ms)
✔ Kendin Tasarla — Cloudinary Admin Authentication Security Hardening (3698.16ms)
ℹ tests 8 | suites 1 | pass 8 | fail 0
```

### إثبات فحص الجلسات الملغاة (Live Revocation Verification):
> **ملاحظة أمنية دقيقة:** تم التحقق الفعلي من عمل فحص الإلغاء `checkRevoked: true` على محاكي Firebase Auth Emulator؛ حيث تم إنشاء مستخدم، إصدار رمز صالح، استدعاء `auth.revokeRefreshTokens(uid)`، وإعادة التحقق من الرمز بعد مهلة زمنية. ألقت المكتبة خطأ **`auth/id-token-revoked`**، وتم رفض الطلب فوراً بـ **401 Unauthorized**. هذا إثبات قاطع بأن الفحص يعمل حقيقة وبشكل صارم.

### استمرار نجاح اختبارات Cloudinary السابقة (Regression Test Suite):
- **Phase 1 (إدارة الحسابات المتعددة والأسرار):** 13/13 اجتياز (100%).
- **Phase 2A (توحيد معالج الحساب النشط):** 12/12 اجتياز (100%).
- **Phase 2B (عمليات الرفع والتبديل المتزامن):** 14/14 اجتياز (100%).
- **Phase 2D (متطلبات التشغيل المحلي العملي):** 8/8 اجتياز (100%).
- **Hardening Suite (بوابات التعزيز الأمني للمصادقة):** 8/8 اجتياز (100%).

**المجموع الإجمالي:** **55 اختبار تكامل اجتيزت بنجاح كامل (0 فشل).**

---

## 4. سلوك رموز الحالة (HTTP 401 vs 403 vs 503 Behavior)

| رمز الحالة | المعنى الدلالي | الحالات التي يُرجع فيها | السلوك في الواجهة (UI) |
| :--- | :--- | :--- | :--- |
| **HTTP 401** | `Unauthorized` | - غياب ترويسة `Authorization`<br>- رمز JWT منتهي الصلاحية (`auth/id-token-expired`)<br>- رمز ملغى (`auth/id-token-revoked`)<br>- رمز لمشروع آخر (`aud !== projectId`)<br>- رمز مزور أو توقيع تشفيري تالف | تنبيه كهرماني (Amber) احترافي مع زر ينقل المستخدم فوراً لصفحة تسجيل الدخول (`/login`). |
| **HTTP 403** | `Forbidden` | - مستخدم مسجل ومصادق عليه لكنه ليس مسؤولاً (لا يملك `role: admin` أو `superadmin`)<br>- محاولة انتحال هوية مستخدم (`x-user-id !== token.uid`)<br>- مستخدم مجهول (Anonymous) في مسار محمي | تنبيه أحمر يفيد بعدم توفر الصلاحيات الكافية للمسؤول. |
| **HTTP 503** | `Service Unavailable` | - غياب بيانات اعتماد الخادم (ADC أو Service Account) للتحقق من الإلغاء<br>- غياب بيانات اعتماد الخادم للوصول إلى Firestore للتحقق من وثيقة المسؤول أو حسابات التخزين<br>- فشل الاتصال بخدمات Google السحابية بسبب نقص الهوية الخادمية | تنبيه معلوماتي يوضح أن الخادم يعمل دون بيانات اعتماد حساب الخدمة في هذه البيئة، مع منع التسريب. |

---

## 5. حالة فحص الأنواع (TypeScript Compilation Status)

تم إجراء الفحص الصارم للأنواع على المشروعين:
```bash
# Store (المتجر)
npx tsc --noEmit
# النتيجة: 0 أخطاء (نجاح تام)

# Admin (لوحة الإدارة)
cd kenditasarl-admin && npx tsc --noEmit
# النتيجة: 0 أخطاء (نجاح تام)
```

---

## 6. أثر التعديل على محاكيات Firebase (Impact on Emulators)

- **توافق أصيل وكامل 100%:** محاكيات Firebase Auth وFirestore تدعم التحقق من الإلغاء واستدعاءات Admin SDK دون الحاجة إلى مفاتيح خارجية.
- **عزل تام:** لا توجد أي بيانات أو أسرار حقيقية معرضة للمحاكيات.
- **تجربة التطوير:** الأمر الموحد `npm run dev:isolated` يعمل بكامل طاقته وميزاته بصرياً وبرمجياً دون أي عوائق.

---

## 7. هل يمكن عرض حسابات الإنتاج محلياً دون هوية خادمية مخولة؟

### الإجابة الهندسية والأمنية القاطعة: **لا، ومستحيل معمارياً (Fail-Closed by Design).**

**السبب:**
1. في قواعد أمان Firestore السحابية (`firestore.rules`):
   ```text
   match /settings/{setting} {
     allow read: if setting != 'storage';
     allow write: if isAdmin();
   }
   ```
   قراءة وثائق `settings/storage/cloudinary` محظورة ومقفلة تماماً أمام عميل المتصفح Web Client SDK لمنع تسرب `api_secret` و`api_key` لأي مستخدم أو متصفح.
2. الطريقة الوحيدة لقراءة تلك الحسابات هي عبر **Firebase Admin SDK** على الخادم.
3. مكتبة Firebase Admin SDK عند اتصالها بمشروع إنتاجي حقيقي (`kanditasarl`) تتطلب بالضرورة الرياضية والتشفيرية إثبات هوية خادمية موثوقة إما عبر:
   - `FIREBASE_SERVICE_ACCOUNT_KEY`
   - أو Google ADC (`GOOGLE_APPLICATION_CREDENTIALS` أو `gcloud auth application-default login` أو Workload Identity).
4. إذا لم تتوفر إحدى هاتين الهويتين على الجهاز المحلي، فإن الخادم سيرفض الطلب حتماً ويعيد **HTTP 503**.
5. أي محاولة لعرض حسابات الإنتاج محلياً دون هوية خادمية تتطلب إما:
   - فتح قواعد الأمان وقراءة الأسرار في المتصفح (وهذا خرق أمني فادح ومرفوض).
   - أو تعطيل التحقق وتخمين البيانات (وهذا عبث غير مقبول).

لذلك، فإن ظهور الخطأ **503** على الجهاز المحلي غير المزود بهوية خادمية هو **السلوك الصحيح والآمن 100%** الذي يحمي أصول المتجر وحسابات التخزين الإنتاجية من أي وصول غير مخول.

---

## 8. العوائق المتبقية وخطة الإنتاج (Remaining Barriers & Production Path)

- **محلياً (Local Development):**
  - لا توجد أي عوائق برمجية أو أمنية. البيئة المعزولة (`npm run dev:isolated`) توفر منصة عمل متكاملة بنسبة 100%.
- **عند النشر الإنتاجي (Production Deployment):**
  - يتم تزويد منصة الاستضافة الخادمة (سواء كانت Cloud Run أو Vercel) بمتغير `FIREBASE_SERVICE_ACCOUNT_KEY` أو تفعيل Workload Identity / ADC.
  - بمجرد توفر الهوية الخادمة في البيئة المنشورة، سيعمل مسار `/api/cloudinary/accounts` فوراً ويعيد حساب Cloudinary النشط الحقيقي دون الحاجة لتغيير أي سطر في الكود.
