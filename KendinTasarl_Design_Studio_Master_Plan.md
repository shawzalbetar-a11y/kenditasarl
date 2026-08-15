# KendinTasarl — Product Customization & Print-on-Demand Studio
## Master Product Specification v1.0

> هذا المستند هو المرجع الرئيسي لتنفيذ استوديو التخصيص في مشروع **KendinTasarl**.
> يجب على الـ Agent قراءة المشروع الحالي وFirebase أولًا، ثم تطبيق هذه المواصفات فوق البنية الموجودة، دون اختراع Collections أو IDs أو إعادة بناء أجزاء لا علاقة لها بالميزة.

---

# 1. تعريف المشروع


1. منتجات تحتوي على تصاميم جاهزة ويمكن شراؤها مباشرة.
2. إمكانية اختيار نفس المنتج والضغط على **"صمم بنفسك"** للدخول إلى محرر تصميم احترافي.
3. إنشاء تصميم مخصص للعميل مرتبط بنفس المنتج والـ variant.
4. حفظ التصميم كبيانات قابلة لإعادة التحرير، وليس كصورة فقط.
5. التحقق من جودة التصميم قبل الطلب.
6. إنشاء ملفات إنتاج مناسبة للطباعة وربطها بالطلب.

المبدأ الأساسي:

```text
Product ≠ Design

Product + Ready Design = Ready-to-buy item
Product + Custom Design = Custom-to-buy item
```

يجب ألا يتم إنشاء منتج جديد فقط لأن العميل اختار التخصيص.

---

# 2. رحلة العميل الأساسية

## المسار A — شراء تصميم جاهز

```text
Home / Category
    ↓
Ready Design Product
    ↓
Product Page
    ↓
Color / Size / Quantity
    ↓
Add to Cart
    ↓
Checkout
    ↓
Order
```

لا يدخل العميل إلى المحرر في هذا المسار.

## المسار B — تصميم من الصفر

```text
Product Page
    ↓
"صمم بنفسك"
    ↓
Customization Studio
    ↓
نفس المنتج بدون التصميم الجاهز
    ↓
اختيار Print Area
    ↓
Upload / Text / Icons / Shapes
    ↓
Edit
    ↓
Quality Check
    ↓
Product Preview
    ↓
Save Design
    ↓
Add to Cart
    ↓
Checkout
    ↓
Production Files
```

## المسار C — تخصيص تصميم جاهز مستقبلًا

إذا كان التصميم الجاهز محفوظًا كـ Design JSON:

```text
Ready Design
    ↓
"تخصيص هذا التصميم"
    ↓
Load Ready Design JSON
    ↓
Edit
    ↓
Save as Custom Design
    ↓
Cart
```

هذا المسار يجب أن تكون البنية قادرة على دعمه، حتى لو لم يكن جزءًا من أول MVP.

---

# 3. القاعدة المعمارية الأساسية

لا تفصل المنتجات إلى:

```text
T-Shirt Ready
T-Shirt Custom
```

بل:

```text
Product
 ├── Variants
 ├── Base Product Assets
 ├── Print Configuration
 └── Ready Designs

Custom Design
 └── references Product + Variant + Print Areas
```

مثال منطقي:

```text
Product: TSH-001
Variant: black-xl
Design Type: CUSTOM
Design ID: KT-DES-xxxxx
```

يجب أن تبقى هوية المنتج الأصلية كما هي.

---

# 4. قاعدة مهمة جدًا للـ Agent

قبل أي تعديل:

1. افحص بنية المشروع الحالية.
2. افحص Next.js / React / TypeScript الموجودة.
3. افحص Firebase initialization.
4. افحص Collections الحالية.
5. افحص product schema.
6. افحص product category / category_id أو أي بديل موجود فعليًا.
7. افحص طريقة تحميل المنتج في صفحة المنتج الحالية.
8. افحص نظام السلة الحالي.
9. افحص نظام الطلبات الحالي.
10. افحص Cloudinary / Storage إن كان موجودًا.
11. افحص نظام اللغات الحالي.
12. افحص المكتبات الموجودة بالفعل.

**لا تخترع IDs أو Collections أو أسماء حقول جديدة إذا كان هناك نظام قائم يؤدي الوظيفة نفسها.**

إذا كان هناك حقل أو Collection مناسب بالفعل، استخدمه ووسعه بدل إنشاء بديل.

---

# 5. Product Model

المنتج يجب أن يكون المصدر الأساسي لمعلومات:

- الاسم
- الوصف
- الصور
- اللون
- المقاسات
- السعر
- variants
- نوع المنتج
- قابلية التخصيص
- إعدادات مناطق الطباعة
- طريقة الطباعة
- mockups

يجب أن تكون إعدادات التخصيص Data-Driven.

---

# 6. Product Configuration

لكل منتج قابل للتخصيص يجب أن توجد Configuration تحدد:

```text
customization.enabled
productType
printAreas
safeAreas
bleed
maxDesignSize
minDesignSize
supportedOperations
printMethod
previewAssets
```

لا تجعل المحرر يعتمد على:

```text
if productType === "tshirt"
```

في عشرات الأماكن.

المحرر يجب أن يقرأ Configuration المنتج.

---

# 7. Print Areas

أمثلة:

## T-Shirt

```text
front
back
leftSleeve
rightSleeve
```

## Hat

```text
front
```

## Mug

```text
wrap
```

كل Print Area يجب أن يحتوي على إعدادات مستقلة مثل:

```text
id
name
width
height
position
safeArea
bleed
maxResolution
minResolution
printMethod
enabled
```

الـ Admin يجب أن يستطيع تعديل هذه القيم مستقبلًا.

---

# 8. Base Product Assets

عند الضغط على "صمم بنفسك":

**يجب استخدام صورة المنتج الأساسية بدون التصميم الجاهز.**

لا تعتمد على AI لإزالة التصميم من صورة المنتج.

لكل variant قابل للتخصيص يفضل وجود:

```text
base front
base back
base side / sleeve حسب الحاجة
mockup
```

التصميم الجاهز شيء منفصل عن Base Product.

---

# 9. Design Studio

المحرر المقترح:

```text
Product Preview
+
Design Canvas
+
Toolbar
+
Properties Panel
+
Layers
+
Print Area
+
Quality Indicator
```

يجب أن يكون Product Preview منفصلًا منطقيًا عن Design Canvas.

---

# 10. Editor Core Features

## Images

- Upload
- Drag & Drop
- Move
- Resize
- Rotate
- Crop
- Flip
- Opacity
- Duplicate
- Delete
- Replace
- Fit to Print Area
- Center

## Text

- Arabic
- Turkish
- English
- RTL
- LTR
- Font
- Size
- Color
- Bold
- Italic
- Alignment
- Letter spacing
- Line height
- Rotation
- Opacity

## Shapes

- Rectangle
- Circle
- Line
- Triangle
- Star
- Heart

## Layers

- Select
- Hide
- Lock
- Bring Forward
- Send Backward
- Delete
- Rename if useful

## History

- Undo
- Redo
- Keyboard shortcuts on desktop

---

# 11. Typography

يجب أن يدعم المحرر النص العربي بشكل صحيح.

يجب اكتشاف اتجاه النص:

```text
Arabic → RTL
Turkish → LTR
English → LTR
```

ويجب أن تكون الخطوط منظمة وقابلة للبحث.

لا تضف مكتبة ضخمة من الخطوط دون الحاجة.

يجب التأكد من أن الخط يدعم الأحرف المطلوبة قبل استخدامه.

---

# 12. Upload System

الصيغ الأساسية:

- PNG
- JPG / JPEG
- WEBP
- SVG

يمكن دعم PDF في مرحلة متقدمة إذا كانت البنية الحالية تسمح بذلك بشكل آمن وموثوق.

لا تجعل الهدف "كل الصيغ"؛ الهدف هو دعم الصيغ المناسبة للطباعة مع Validation واضح.

---

# 13. Image Quality Engine

بعد رفع أي صورة، افحص:

- MIME type
- dimensions
- transparency
- physical print size
- effective resolution
- scaling factor
- file size

اعرض للعميل:

```text
🟢 ممتازة للطباعة
🟡 جيدة
🟠 منخفضة
🔴 غير مناسبة
```

لا تجبر العميل على فهم DPI.

استخدم رسالة بسيطة:

> جودة التصميم مناسبة للطباعة بهذا الحجم.

أو:

> دقة الصورة منخفضة وقد تظهر أقل وضوحًا عند الطباعة بهذا الحجم.

---

# 14. Background Removal

ميزة اختيارية:

```text
Remove Background
```

بعد التنفيذ:

```text
Before / After
Undo
Restore
```

لا تجعلها شرطًا لكل الصور.

---

# 15. Safe Area / Print Area / Bleed

يجب التفريق بين:

### Print Area
المنطقة الفعلية التي يمكن الطباعة داخلها.

### Safe Area
المنطقة الموصى بوضع العناصر المهمة داخلها.

### Bleed / Risk Area
منطقة تحذير قرب الحدود حسب متطلبات المنتج والطباعة.

### Clip Path
للتحكم البصري في العناصر.

### Validation
للتحقق الحقيقي قبل إضافة المنتج للسلة.

لا تعتمد على clipPath وحده.

---

# 16. Smart Guides

يجب دعم:

- Horizontal center
- Vertical center
- Edge alignment
- Snap
- Center indicators

ويمكن أن تكون هذه ميزة V1 إذا كان تنفيذها مستقرًا.

---

# 17. Auto Fit

زر:

```text
Fit to Print Area
```

يقوم بتصغير التصميم ووضعه داخل المنطقة الآمنة قدر الإمكان.

لا يغير التصميم بشكل مدمر.

---

# 18. Design Validation

قبل Add to Cart:

```text
✓ Product selected
✓ Variant selected
✓ Print area valid
✓ Design within printable area
✓ Resolution acceptable
✓ No invalid objects
✓ Required assets available
```

إذا توجد مشكلة:

```text
⚠️ Design quality is low
```

أو:

```text
⚠️ Design exceeds the safe area
```

يمكن السماح بالمتابعة مع تحذير حسب نوع المشكلة.

---

# 19. Free Mode

لا تستخدم صياغة قانونية مبالغًا فيها.

الوضع:

```text
Safe Mode
Free Mode
```

في Free Mode:

> يمكنك وضع التصميم خارج منطقة الطباعة المقترحة. قد يؤثر ذلك على موضع التصميم أو جزء منه في المنتج النهائي.

يتم حفظ:

```text
customizationMode = "FREE"
```

مع التصميم.

---

# 20. Design Data

لا تحفظ Preview فقط.

يجب حفظ:

```text
design JSON
preview
production assets
metadata
```

مثال منطقي:

```text
KT-DES-xxxxx
 ├── design.json
 ├── preview.webp
 ├── front.png
 ├── back.png
 └── metadata.json
```

ويجب أن يكون JSON قابلًا لإعادة فتح التصميم داخل المحرر.

---

# 21. Cart Integration

Cart Item يجب أن يحتفظ على الأقل بـ:

```text
productId
variantId
quantity
designId
designType
price
preview
```

إذا كان التصميم مخصصًا:

```text
designType = CUSTOM
```

إذا كان جاهزًا:

```text
designType = READY
```

لا تعتمد على Preview وحده لاستعادة التصميم.

---

# 22. Re-edit

من السلة أو حساب العميل مستقبلًا:

```text
Edit Design
```

يتم:

```text
Load Design JSON
↓
Restore Canvas
↓
Continue Editing
```

---

# 23. Production Output

عند تأكيد الطلب، يجب إنشاء ملفات إنتاج مستقلة عن صور الموكاب.

مثلاً:

```text
front.png
back.png
left-sleeve.png
right-sleeve.png
```

حسب مناطق المنتج.

ملف الإنتاج:

- بدون صورة المنتج
- بخلفية شفافة عند الحاجة
- بالحجم الصحيح
- بالدقة المطلوبة
- مرتبط بالـ Order وDesign ID

---

# 24. Ready Designs

التصميمات الجاهزة ليست مجرد صور.

إذا أمكن، يجب تخزينها أيضًا كـ Design JSON.

بذلك يمكن مستقبلًا:

```text
Buy Ready Design
Customize Ready Design
```

دون إعادة إنشاء التصميم.

---

# 25. Pricing

السعر يجب أن يكون Server-validated.

يمكن أن يعتمد على:

```text
Base Product
+
Print Areas
+
Print Method
+
Extra Services
```

لا تعتمد على السعر الذي يأتي من Client فقط.

---

# 26. Production Flow

```text
Cart
 ↓
Checkout
 ↓
Payment
 ↓
Order
 ↓
Production Job
 ↓
Generate / verify production assets
 ↓
Printing
 ↓
Quality Check
 ↓
Packaging
 ↓
Shipping
```

---

# 27. Admin Requirements

يجب أن يستطيع Admin مستقبلًا:

## Product

- Enable / disable customization
- Product type
- Base assets
- Variants
- Colors
- Sizes

## Print Areas

- Add
- Edit
- Remove
- Enable / disable
- Dimensions
- Safe area
- Bleed
- Print method
- Resolution rules

## Ready Designs

- Create
- Edit
- Assign to products
- Preview
- Activate / deactivate

## Production

- View design
- View preview
- Download production files
- Change production status

---

# 28. Mobile UX

المحرر Mobile First.

Desktop:

```text
Toolbar | Canvas | Properties
```

Mobile:

```text
Preview
Canvas
Bottom Toolbar
Bottom Sheet Properties
```

لا تحاول فقط تصغير Desktop UI.

---

# 29. MVP Scope

يجب أن يركز أول إصدار احترافي على:

1. Product → Customize flow
2. Base Product بدون تصميم
3. T-Shirt / Hat / Mug حسب البيانات الموجودة فعليًا
4. Print Areas
5. Upload
6. PNG/JPG/WEBP/SVG
7. Text
8. Arabic/Turkish/English
9. Fonts
10. Move / Resize / Rotate
11. Layers
12. Undo / Redo
13. Safe Area
14. Quality Indicator
15. Product Preview
16. Save Design
17. Design JSON
18. Add to Cart
19. Order linkage
20. Production-ready output

---

# 30. لاحقًا

## V2

- Background Removal
- Smart Guides
- Auto Fit
- Saved Designs
- Re-edit
- Mug Wrap Preview
- Better mockups
- More products

## V3

- 3D Preview
- AI Design Generation
- AI Upscaling
- AI cleanup
- AI background removal
- Advanced automation

---

# 31. Non-Negotiable Rules

1. لا تكسر وظائف المتجر الحالية.
2. لا تنشئ Collections مكررة إذا كانت البيانات موجودة بالفعل.
3. لا تنشئ IDs عشوائية تتعارض مع النظام الحالي.
4. افحص Firebase الحالي قبل تعديل Schema.
5. استخدم أسماء الحقول الموجودة حيثما أمكن.
6. اجعل التخصيص Data-Driven.
7. لا تربط المحرر بمنطق خاص بمنتج واحد.
8. لا تحفظ التصميم كصورة فقط.
9. لا تعتمد على Client-side price.
10. لا تجعل Preview هو Production File.
11. لا تعتمد على clipPath وحده للتحقق.
12. لا تجعل AI شرطًا لعمل المحرر.
13. لا تطبق تغييرات كبيرة خارج نطاق الميزة.
14. بعد كل مرحلة شغّل Build / Typecheck / Lint المناسب للمشروع.
15. اختبر Product → Customize → Cart → Order قبل الانتقال للمرحلة التالية.
16. إذا وجدت بنية حالية أفضل من المقترحة، استخدم البنية الحالية مع الحفاظ على نفس السلوك والنتيجة.
17. لا تعيد كتابة المشروع من الصفر.
18. لا تغير تصميم الموقع الحالي إلا عندما يكون التغيير ضروريًا لتجربة التخصيص.
19. حافظ على دعم اللغات الحالي.
20. قبل تنفيذ أي خطوة، اقرأ الملفات المرتبطة فعليًا بالميزة.

---

# 32. معيار النجاح النهائي

يعتبر النظام ناجحًا عندما يستطيع العميل:

```text
فتح منتج جاهز
↓
اختيار "صمم بنفسك"
↓
فتح نفس المنتج بدون تصميم
↓
اختيار منطقة الطباعة
↓
رفع صورة
↓
الحصول على تقييم جودة
↓
تحريك / تكبير / تدوير الصورة
↓
إضافة نص عربي أو تركي أو إنجليزي
↓
اختيار الخط واللون والحجم
↓
معاينة المنتج
↓
اجتياز Validation
↓
حفظ التصميم
↓
إضافته للسلة
↓
إتمام الطلب
↓
وصول Design JSON + Production Files إلى نظام الإنتاج
```

هذا هو الـ Definition of Done الأساسي لـ KendinTasarl.
