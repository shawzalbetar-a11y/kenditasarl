# Kendin Tasarla — تقرير بوابة الخصوصية وحماية بيانات المستخدمين في قواعد Firestore
# Final Firestore Rules: Privacy Gate Validation Report (`kanditasarl`)

> **تاريخ الاعتماد:** 16 نوفمبر 2026  
> **حالة الاعتماد النهائية:** **`PASS (APPROVED FOR PRODUCTION DEPLOYMENT)`**  
> **بيئة الاختبار:** محاكي Firebase المحلي (`demo-kenditasarla-rules`) — Auth Port: `19099` | Firestore Port: `18080`  
> **المشروع الإنتاجي المستهدف:** `kanditasarl` (لم يتم النشر أو الربط مع الإنتاج - بانتظار الموافقة اليدوية)  
> **الملفات المرتبطة:**
> - القواعد المحصنة النهائية: [`firestore.rules`](file:///d:/kenditasarl/firestore.rules)
> - مسار فحص تكرار الحسابات الخادمي: [`src/app/api/auth/check-conflict/route.ts`](file:///d:/kenditasarl/src/app/api/auth/check-conflict/route.ts)
> - مكون المصادقة والتحقق: [`src/components/auth/AuthModal.tsx`](file:///d:/kenditasarl/src/components/auth/AuthModal.tsx)
> - جناح الاختبارات الشامل: [`tests/firestore/final_rules_validation.test.mts`](file:///d:/kenditasarl/tests/firestore/final_rules_validation.test.mts)

---

## 1. ملخص النتائج والتشخيص الأمني (Executive Summary)

استجابةً للتدقيق الأمني المتقدم لبوابة الخصوصية (Privacy Gate):
1. **تشخيص ثغرة القراءة العامة لـ `users/{userId}`:**  
   تبين أن القواعد السابقة كانت تمنح صلاحية القراءة لجميع المستخدمين المسجلين (`allow read: if isCustomer();`)، مما كان يتيح لأي مستخدم يملك حسابًا استعلام بيانات أي مستخدم آخر، أو استعلام مجموعة `users` لمعرفة أرقام الهواتف والبريد الإلكتروني للعملاء (Account Enumeration & Data Leakage).
2. **عزل الحسابات الفردية بالكامل (Owner-Only Access):**  
   تم إغلاق الوصول إلى `users/{userId}` تمامًا بحيث لا يستطيع أي عميل قراءة أو تعديل أو حذف أي ملف شخصي سوى ملفه الخاص المطابق لـ `request.auth.uid == userId`، مع الحفاظ فقط على حق المشرف المصرح به (`isAdmin()`) لقراءة بيانات العميل عند فحص الطلبات.
3. **تحويل فحص تكرار الهاتف والبريد إلى خادم موثوق (Server-Side Conflict Verification):**  
   تم استبدال استعلامات العميل المباشرة على مجموعة `users` في `AuthModal.tsx` بمسار API خادمي محمي وآمن (`/api/auth/check-conflict`). هذا المسار يتطلب جلسة مصادقة سارية، ويقوم بالفحص عبر Firebase Admin SDK، ويرجع نتيجة ثنائية (`{ conflict: true/false }`) دون كشف أي مستند أو هوية أو بيانات مستخدم.
4. **حظر تزوير الهوية وحماية الحقول الإدارية:**  
   تم منع كتابة أي وثيقة بـ `UID` غير مطابق للمستخدم، كما تم حظر تمرير أو تعديل أي حقول إدارية أو حساسة (`role`, `isAdmin`, `is_admin`, `permissions`) في وثائق المستخدمين عبر Client SDK.
5. **اعتماد قائمة سماح صريحة لإعدادات المتجر (Settings Allowlist):**  
   تم إلغاء القاعدة العامة السابقة التي كانت تتيح قراءة أي إعداد غير تخزيني (`setting != 'storage'`)، وحصر القراءة العامة للكتالوج والمتجر **فقط وحصريًا** في مستند التسعير المعتمد `settings/pricing`، مع بقاء أي إعدادات داخلية أخرى محصورة بالمشرفين (`isAdmin()`)، وبقاء شجرة `settings/storage` مغلقة بالكامل (100%) بوجه الجميع.
6. **عزل زمن اختبارات الشحن السريع (`shipping-zones.test.mts`):**  
   تم عزل الوقت الزمني داخل الاختبارات فقط عبر تثبيت توقيت عمل تركي وسطي (14:00 في أيام العمل) للاستدعاءات المباشرة دون لمس منطق الأعمال الحقيقي للإنتاج، مما جعل جميع اختبارات الشحن السريع الـ 20 تجتاز بنجاح تام (`20/20 PASS`).
7. **اجتياز جميع الاختبارات الأمنية:**  
   اجتازت المنظومة **38 اختبار أمان هجومي ودفاعي** على محاكي Firebase بنسبة نجاح 100% دون أي فشل.

---

## 2. النص النهائي المعتمد لقواعد `users` و `settings`

### أ. قواعد حماية الحسابات الشخصية والخصوصية (`users/{userId}`)
```javascript
    // =========================================================================
    // 3. ACCOUNT PROFILES (Privacy & Identity Protection)
    // Read: Owner only (request.auth.uid == userId) or authorized Admin.
    // Prevents cross-account data leakage and collection enumeration.
    // Create: Owner only, forbidden to set role/admin privilege fields.
    // Update: Owner (cannot modify role/admin fields) or Admin.
    // Delete: Owner or Admin.
    // =========================================================================
    match /users/{userId} {
      allow read: if isCustomer() && (request.auth.uid == userId || isAdmin());
      allow create: if isCustomer() && request.auth.uid == userId
        && !request.resource.data.keys().hasAny(['role', 'isAdmin', 'is_admin', 'permissions']);
      allow update: if isCustomer() && (
        (request.auth.uid == userId
          && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role', 'isAdmin', 'is_admin', 'permissions']))
        || isAdmin()
      );
      allow delete: if isCustomer() && (request.auth.uid == userId || isAdmin());
    }
```

### ب. قواعد الإعدادات والقائمة البيضاء الصريحة (`settings/{setting}`)
```javascript
    // =========================================================================
    // 10. SETTINGS & STORAGE SECURITY (Explicit Allowlist)
    // settings/storage tree is COMPLETELY CLOSED to ALL clients (including admins).
    // Public read is strictly restricted to explicit allowlist: ['pricing'].
    // Internal/admin settings require isAdmin(). All client writes require isAdmin().
    // =========================================================================
    match /settings/storage/{document=**} {
      allow read, write: if false;
    }

    match /settings/{setting} {
      allow read: if setting in ['pricing'] || (setting != 'storage' && isAdmin());
      allow write: if setting != 'storage' && isAdmin();
    }
```

---

## 3. المعالجة المعمارية لفحص تكرار الهواتف والبريد الإلكتروني

### المشكلة السابقة:
في [`AuthModal.tsx`](file:///d:/kenditasarl/src/components/auth/AuthModal.tsx):
- كان العميل يقوم باستعلام Firestore Client SDK:
  ```typescript
  const q = query(collection(db, 'users'), where('phone', '==', formattedPhone));
  const snap = await getDocs(q);
  ```
- هذا الاستعلام كان يتطلب فتح صلاحية `allow read: if isCustomer();` على مستوى المجموعة ككل، مما كان يسمح لأي مستخدم مسجل بقراءة وتعداد جميع بيانات المستخدمين.
- إغلاق القواعد إلى `request.auth.uid == userId` كان سيتسبب في تعطل عملية التسجيل وظهور خطأ `permission-denied` للعميل.

### الحل الخادمي المحصن:
1. **إنشاء مسار خادمي مخصص:** [`/api/auth/check-conflict`](file:///d:/kenditasarl/src/app/api/auth/check-conflict/route.ts).
   - يتطلب توكن مصادقة حقيقي من المستخدم عبر الترويسة: `Authorization: Bearer <idToken>`.
   - يستخدم Firebase Admin SDK من خلال `serverDb()` لفحص وجود رقم الهاتف أو البريد الإلكتروني.
   - إذا وجد مستندًا يملك معرفًا مغايرًا لمعرف الطالب (`doc.id !== uid`)، يرجع:
     ```json
     { "conflict": true, "type": "phone" }
     ```
   - لا يرجع المسار أسماء أو عناوين أو معرفات، مما يمنع تسريب أي معلومة.
2. **تحديث `AuthModal.tsx`:**  
   تم استبدال الاستعلامات المباشرة بالاستدعاء الخادمي الآمن:
   ```typescript
   const token = await user.getIdToken();
   const conflictRes = await fetch('/api/auth/check-conflict', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${token}`
     },
     body: JSON.stringify({ phone: formattedPhone })
   });
   const conflictData = await conflictRes.json().catch(() => ({}));
   if (conflictData.conflict) {
     await user.delete();
     await auth.signOut();
     throw new Error(t('phoneLinkedToGoogle'));
   }
   ```

---

## 4. مصفوفة التحقق من توافق المسارات (Routes Compatibility Matrix)

تم فحص كافة مسارات ومكونات المتجر والإدارة للتحقق من عدم حدوث أي تعارض مع القواعد المحصنة:

| المسار أو المكون | الملف البرمجي | طريقة الوصول | هل متوافق مع القواعد الجديدة؟ | ملاحظات الأمان والتوافق |
| :--- | :--- | :--- | :---: | :--- |
| **صفحة الحساب** | `src/app/[locale]/account/page.tsx` | `getDoc(doc(db, 'users', currentUser.uid))` | ✅ متوافق 100% | يقرأ ملفه الشخصي فقط (`auth.uid == userId`). |
| **تحديث الحساب** | `src/app/[locale]/account/page.tsx` | `updateDoc(doc(db, 'users', user.uid), updates)` | ✅ متوافق 100% | يحدث الاسم والهاتف فقط دون لمس حقول الرتب. |
| **نافذة المصادقة** | `src/components/auth/AuthModal.tsx` | `getDoc(doc(db, 'users', auth.currentUser.uid))` | ✅ متوافق 100% | فحص الإكمال الشخصي للمالك فقط. |
| **إنشاء الحساب** | `src/components/auth/AuthModal.tsx` | `setDoc(doc(db, 'users', currentUser.uid), ...)` | ✅ متوافق 100% | ينشئ ملفه الشخصي ببيانات عادية دون رتب. |
| **توثيق الهاتف** | `src/components/auth/PhoneVerificationModal.tsx` | `updateDoc(doc(db, 'users', auth.currentUser.uid))` | ✅ متوافق 100% | تحديث وثيقة الهاتف وحالة التوثيق للمالك. |
| **شريط الموقع (Header)** | `src/components/layout/Header.tsx` | `getDoc(doc(db, 'users', currentUser.uid))` | ✅ متوافق 100% | قراءة وثيقة المستخدم المسجل للتحقق من التسجيل. |
| **لوحة تفاصيل الطلب** | `kenditasarl-admin/.../orders/[id]/page.tsx` | `getDoc(doc(db, 'users', orderData.user_id))` | ✅ متوافق 100% | مسموح للمشرف حصريًا عبر `isAdmin()`. |
| **إشعارات الطلبات الخادمية** | `src/lib/server/orderNotifications.ts` | `db.collection("users").doc(order.user_id)` | ✅ متوافق 100% | وصول خادمي عبر بيئة Admin SDK الموثوقة. |
| **قراءة تسعير الكتالوج** | `src/lib/pricing.ts` | `doc(db, 'settings', 'pricing')` | ✅ متوافق 100% | مسموح عامة ضمن القائمة البيضاء (`setting in ['pricing']`). |
| **إدارة التسعير بالإدارة** | `kenditasarl-admin/.../settings/pricing/` | `doc(db, 'settings', 'pricing')` | ✅ متوافق 100% | قراءة وتعديل مسموح للمشرف عبر `isAdmin()`. |
| **إدارة حسابات التخزين** | `kenditasarl-admin/.../cloudAccounts.ts` | `serverDb().collection("settings/storage/...")` | ✅ متوافق 100% | وصول خادمي فقط ومحجوب 100% عن المتصفح. |

---

## 5. مصفوفة الاختبارات الهجومية والدفاعية (Offensive Test Matrix)

تم تنفيذ جميع الاختبارات على محاكي Firebase مع تفعيل محاكي Auth ومحاكي Firestore:

### نتائج الاختبارات المحدثة في `final_rules_validation.test.mts` (20/20):
```text
▶ Kendin Tasarla — Final Firestore Rules Validation Test Suite
  ✔ [Guest 1] Unauthenticated guest can read public catalog and public settings/pricing (242.8ms)
  ✔ [Guest 2] Anonymous visitor issued for guest uploads CANNOT read private store data (59.9ms)
  ✔ [Admins 1] Customer can check own membership, but cannot list or read other admins (68.1ms)
  ✔ [Admins 2] Client SDK CANNOT create, update or delete any admin membership (74.5ms)
  ✔ [Settings 1] settings/storage is COMPLETELY CLOSED to all clients including admins (110.8ms)
  ✔ [Products 1] Direct client modification of variants/stock is strictly DENIED (58.5ms)
  ✔ [Products 2] Admin client SDK cannot bypass print template revision publisher (60.6ms)
  ✔ [Cart 1] Cart items cannot be created directly by client (enforces /api/cart/add) (22.1ms)
  ✔ [Cart 2] Cart item owner can update ONLY quantity between 1 and 999 (116.8ms)
  ✔ [Orders 1] Client SDK cannot create, update, or delete orders or items (69.4ms)
  ✔ [Orders 2] Customer can read own order and items; others cannot (83.7ms)
  ✔ [Designs 1] Private designs are isolated; cannot be self-promoted to templates (87.3ms)
  ✔ [Addresses 1] Address ownership cannot be reassigned (67.8ms)
  ✔ [Internal 1] Counters and quotes are server-only (51.5ms)
  ✔ [Privacy 1] Customer A can read own profile; CANNOT read Customer B profile (62.3ms)
  ✔ [Privacy 2] Anonymous and unauthenticated visitors CANNOT read any user profile (47.6ms)
  ✔ [Privacy 3] Collection enumeration attack: Customer CANNOT list or query users collection (62.7ms)
  ✔ [Privacy 4] User cannot forge identity, create doc for different UID, or inject role/admin fields (112.1ms)
  ✔ [Privacy 5] Admin CAN read customer profiles for order processing (27.2ms)
  ✔ [Settings 2] Non-public internal settings are protected by explicit allowlist (88.5ms)
✔ Kendin Tasarla — Final Firestore Rules Validation Test Suite (3010.8ms)
```

### نتائج تدقيق أمان المشرفين في `admin.test.mjs` (8/8):
```text
✔ anonymous clients cannot read, list, create, edit or delete memberships (1648.2ms)
✔ customers can check their own membership but cannot discover or manage members (185.0ms)
✔ profile fields and token role claims confer no administrative authority (92.0ms)
✔ a membership with an invalid or absent role cannot authorize writes (unrecognized) (59.9ms)
✔ a membership with an invalid or absent role cannot authorize writes (no-role) (63.7ms)
✔ provisioned admin can log in and manage catalog data but cannot manage membership (118.1ms)
✔ provisioned superadmin can log in and manage catalog data but cannot manage membership (103.0ms)
✔ public catalog reads and private address ownership still work (160.1ms)
```

### نتائج تدقيق الجلسات والحسابات في `phase06c_admin_security_audit.mts` (10/10):
```text
✔ [Audit 1] Normal user attempting to access administrative API is rejected with 403 (447.7ms)
✔ [Audit 2] Normal user attempting to create admins/{uid} via Client SDK is rejected (84.9ms)
✔ [Audit 3] Admin attempting to escalate self to superadmin via Client SDK is rejected (19.6ms)
✔ [Audit 4] Admin attempting to modify another user's admins doc via Client SDK is rejected (23.1ms)
✔ [Audit 5] Superadmin authorized access succeeds on admin endpoints (14.7ms)
✔ [Audit 6] Deleted or disabled user token rejected with 401 Unauthorized (22.1ms)
✔ [Audit 7] Revoked session token rejected with 401 Unauthorized (1131.1ms)
✔ [Audit 8] Different Firebase project token (audience mismatch) rejected with 401 (0.7ms)
✔ [Audit 9] Absence of server credentials when verifying admin roles returns 503 (3.2ms)
✔ [Audit 10] Cloudinary API secrets are never leaked via API response or client SDK (42.0ms)
```

### نتائج اختبارات الشحن السريع بعد عزل التوقيت في `shipping-zones.test.mts` (20/20):
```text
✔ Geometry: calculateRingArea computes correct Shoelace area (1628.8ms)
✔ Geometry: doSegmentsIntersect detects intersecting and parallel segments (0.2ms)
✔ Geometry: isRingSelfIntersecting identifies bowtie/self-crossing ring (0.1ms)
✔ Geometry: isPointInPolygon ray casting handles inside, outside, vertex, edge, and hole (0.2ms)
✔ Geometry: doPolygonsOverlap detects intersecting polygons vs disjoint (0.1ms)
✔ Geometry: validatePolicyGeometry rejects overlapping active zones and self-intersections (0.4ms)
✔ ServiceHours: correctly evaluates Istanbul timezone windows and overnight shifts (12.7ms)
✔ Eligibility: rejects unverified or missing address coordinates (0.3ms)
✔ Eligibility: accepts verified Kadıköy address inside active zone and hours (0.3ms)
✔ Eligibility: rejects address outside all active zones (0.1ms)
✔ Security Rules: public can read active shipping pointer, client writes forbidden (364.5ms)
✔ Admin API: rejects non-admin users with 401/403 (528.3ms)
✔ Admin API: saves draft and publishes valid policy with optimistic concurrency check (182.7ms)
✔ Delivery Calculation Route: returns express availability, fee in TL and kuruş (76.3ms)
✔ Checkout Integration: handles express delivery quote and order confirmation with shipping snapshot (625.4ms)
✔ Security Gate: Client self-attested location_source is rejected without server verification record (236.7ms)
✔ Security Gate: Server address verification rejects coordinate mismatch and cross-user hijacking (348.0ms)
✔ Hole & Complex Geometry: Holes inside polygons exclude points and invalid holes are rejected on publish (40.7ms)
✔ Fingerprint & Isolation: Standard shipping quotes remain valid when express zone policy changes (409.7ms)
✔ Concurrency & Idempotency: Replaying checkout confirm with same idempotency key is safe and stock is decremented once (445.6ms)
```

### اختبارات الميزات السابقة (Regression Testing):
- **Versioned Pricing (Phase 05B):** 12/12 اجتازت بنجاح.
- **Print Templates (Phase 05A):** 7/7 اجتازت بنجاح.
- **Secure Checkout (Phase 03B):** 14/14 اجتازت بنجاح.
- **Auth Trust Boundary (Phase 06A):** 10/10 اجتازت بنجاح.

---

## 6. التحقق من سلامة البناء (TypeScript Verification)

```bash
# 1. فحص المتجر
npx tsc --noEmit
# Exit Code: 0 (Zero errors)

# 2. فحص لوحة الإدارة
cd kenditasarl-admin && npx tsc --noEmit
# Exit Code: 0 (Zero errors)
```

---

## 7. القرار النهائي وبوابة أمان النشر (Final Decision & Deployment Gate)

### القرار النهائي:
### ✅ **PASS — APPROVED FOR PRODUCTION DEPLOYMENT**

- **تمت معالجة بوابة الخصوصية (Privacy Gate) بنسبة 100%:**
  1. عزل تام لملفات المستخدمين؛ لا يستطيع مستخدم قراءة بيانات غيره.
  2. منع استعلام وتعداد مجموعة `users` كليًا من Client SDK.
  3. نقل فحص التكرار إلى الخادم الآمن `/api/auth/check-conflict`.
  4. حظر كتابة وتعديل الحقول الإدارية في ملفات المستخدمين.
  5. قصر القراءة العامة لـ `settings` على القائمة البيضاء الصريحة (`['pricing']`).
  6. عزل التوقيت الليلي داخل اختبارات الشحن السريع مع اجتياز 20/20 بنجاح.

### بوابة أمان الإنتاج (Production Safety Gate):
التزامًا بالتعليمات الصارمة:
- **لم يتم النشر أو إجراء أي تعديل على بيئة الإنتاج الفعلية (`kanditasarl`)**.
- **لم يتم تغيير أي مفتاح سري لـ Cloudinary**.
- **لم يتم إجراء Git Push**.
- ملف [`firestore.rules`](file:///d:/kenditasarl/firestore.rules) جاهز تمامًا ومختبر للنشر عند قرار الإدارة عبر الأمر اليدوي الموثق:
  ```bash
  firebase login
  firebase use kanditasarl
  firebase deploy --only firestore:rules
  ```
