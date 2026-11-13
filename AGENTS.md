# Agent Directives & Project Standards (AGENTS.md)

This repository follows strict architectural, localization, and UI/UX standards for a high-end Next.js e-commerce and Print-on-Demand (POD) web application. All autonomous agents, contributors, and assistants MUST adhere to the rules below without exception.

---

## 1. Multi-Language (i18n) Mandate

1. **Three Languages Parity:** Every user-facing feature, button, modal, alert, or text string MUST support three languages simultaneously:
   - Arabic (`ar`)
   - Turkish (`tr`)
   - English (`en`)
2. **Dictionary Files:** Located in `/messages/{ar,tr,en}.json`.
   - All three files MUST maintain 100% key parity (identical structure, identical keys).
   - NEVER alter JSON key names or delete keys.
   - NEVER touch or rename dynamic interpolation placeholders (e.g. `{count}`, `{name}`, `{current}`, `{total}`, `{{price}}`).
3. **Zero Hardcoded Text:** Strictly forbidden to hardcode raw text in `.tsx` or `.ts` components. Always access messages via `useTranslations()` / `getTranslations()` or pass localized props according to active `locale`.

---

## 2. Turkish Fashion & Print-on-Demand (POD) Localization Standards

Antigravity and all developer agents must operate with the precision of a native Turkish Principal UX Copywriter & Localization Architect specialized in the Turkish apparel and POD market.

### A. Brand Identity
- **Always use:** `"KENDİN TASARLA"` (Title/Logo/Header/Footer/Studio) or `"Kendin Tasarla"` (Title Case).
- **Strictly Banned:** `"KENDİ TASARLA"` / `"Kendi Tasarla"`.

### B. Print Placements & POD Studio Terminology
- **STRICT BAN ON "Konum" FOR PRINT AREAS:**
  - In Turkish, *"Konum"* exclusively means geographic GPS coordinates/map location (e.g., Google Maps delivery pin).
  - Using *"Konum"* for a t-shirt or garment print placement is unnatural and forbidden.
- **Approved Print Terminology:**
  - **Titles, Headings, Alerts, and Placement Guides:** Use `"Baskı Alanı"` or `"Baskı Yeri"`.
    - *Examples:* `"Baskı Alanı Rehberi"`, `"Onaylı Baskı Alanları"`, `"Henüz baskı alanı seçilmedi"`, `"DTF Baskı ve Yerleşim Rehberi"`, `"Baskı Alanına Sığdır"`.
  - **Short UI Buttons, Navigation Tabs, and Positioning Modes:** Use `"Yerleşim"`.
    - *Examples:* Bottom bar tab `"Yerleşim"`, `"Serbest Yerleşim Modu"`, `"Yeni Baskı Alanı Ekle"`, `"+ Alan Ekle"`.
- **Garment Faces & Standard Placement Areas:**
  - Front: `"Ön Yüz"`
  - Back: `"Arka Yüz"`
  - Sleeves: `"Sağ Kol"` and `"Sol Kol"` (*NEVER* use `"Sağ Omuz"` or `"Sol Omuz"` for sleeve prints).
  - Chest areas: `"Sol Göğüs"`, `"Sağ Göğüs"`, `"Orta Göğüs"`, `"Tam Ön Baskı"`.
  - Neck / Collar: `"Ense Altı"` (or `"Ense Altı Logosu"`), `"Tam Sırt Baskı"`.

### C. General Store, Catalog & Apparel Specifications
- **Navigation & Menus:**
  - `"Koleksiyonlar"`, `"Yeni Gelenler"`, `"Çok Satanlar"`, `"Kendin Tasarla"`, `"Tüm Ürünler"`.
- **Fabric & Sizing Specs:**
  - Sizing Guide: `"Beden Tablosu"` or `"Beden Rehberi"` (Dimensions: `"Göğüs Genişliği"`, `"Boy Uzunluğu"`).
  - Garment Fit: `"Oversize Kalıp"`, `"Standart Kalıp"`, `"Rahat Kesim"`.
  - Fabric Quality: `"%100 Pamuk"`, `"Birinci Sınıf Penye Kumaş"`, `"240 GSM Ağır Gramaj Pamuk"`.
  - Care: `"Yıkama Talimatları"`.
- **Stock Availability:**
  - Available: `"Stokta Var"` (*never* literal `"Mevcut"`).
  - Out of stock: `"Tükendi"` (*never* `"Stokta Yok"`).

### D. Cart, Checkout, Shipping & Orders
- **E-Commerce Actions & Summaries:**
  - Cart: `"Sepetim"`
  - Add to Cart: `"Sepete Ekle"`
  - Order Summary: `"Sipariş Özeti"`
  - Subtotal: `"Ara Toplam"`
  - Free Shipping: `"Ücretsiz Kargo"`
  - Discount / Promo Code: `"İndirim Kodu"`
  - Proceed to Checkout: `"Ödemeye Geç"`
  - Delivery Address: `"Teslimat Adresi"`
  - Payment Method: `"Ödeme Yöntemi"`
- **Order Lifecycle Statuses:**
  - Pending: `"Siparişiniz Alındı"`
  - Production ready: `"Üretime Hazır"`
  - Processing: `"Hazırlanıyor"`
  - Printing / Manufacturing: `"Baskıda / Üretimde"`
  - Quality inspection: `"Kalite Kontrolü"`
  - Packed: `"Paketlendi"`
  - Shipped: `"Kargoya Verildi"`
  - Delivered: `"Teslim Edildi"`
  - Tracking: `"Kargo Takibi"`

### E. Account & System Messaging
- **Auth & Profile:**
  - `"Giriş Yap"`, `"Kayıt Ol"`, `"Hesabım"`, `"Siparişlerim"`, `"Adreslerim"`, `"Doğrulama Kodu"`, `"Kodu Doğrula"`.
- **System & Validation Messages:**
  - Write courteous, conversational, natural Turkish error states and helper tooltips.
  - Avoid robotic, direct literal translations from English or Arabic.

---

## 3. UI/UX & Mobile Viewport Constraints

1. **Short Labels on Mobile:**
   - Always ensure button copy, tab titles, and floating controls remain short and punchy so they never wrap awkwardly or clip on compact smartphone screens (360px - 414px width).
2. **Visual Hierarchy:**
   - High-contrast touch targets (minimum 44x44px).
   - Toolbars and placement badges must never overlap active design zones.
   - Presets and styles in Design Studio must be localized across AR, EN, and TR.
