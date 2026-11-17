# Kendin Tasarla — Phase 07A: Asset Library & Canvas Editor Integration Report

**Date:** 2026-11-17  
**Branch:** `codex/task04-print-production`  
**Environments Tested:** Local Firebase Emulators (`demo-kenditasarla-rules`) — Auth (19099), Firestore (18080)  
**Production Gate Status:** `PASS` (Phase 07A Implementation & Acceptance Verified Locally)

---

## 1. Executive Summary

Phase 07A integrates the digital asset and sticker library into the core Design Studio canvas editor (`FabricCanvas.tsx`) of **Kendin Tasarla**. This implementation strictly reuses existing Firestore collections (`design_assets`, `asset_categories`) and editor infrastructure, avoiding duplicate systems or architectural fragmentation.

Key outcomes achieved in Phase 07A:
1. **Asset Discovery & Category Browsing:** Responsive category pills, real-time search filtering, instant SVG/raster previews, and localized empty states.
2. **Free vs. Paid Asset Distinction:** Free stickers are highlighted with green badges (`Ücretsiz` / `Free` / `مجاني`) and incur zero extra charges; paid stickers clearly display amber price badges (`+{price} ₺`) and automatically register a `premium_asset` line item fee.
3. **Print Area Insertion & Clamping:** Stickers auto-scale within the active placement zone (85% bounding box safety margin), center automatically, magnetically snap to alignment axes, and clamp to print boundaries.
4. **Provenance & 300 DPI Production Snapshot:** Extended `SERIALIZE_PROPERTIES` with provenance fields (`originalAssetId`, `assetName`, `assetPrice`, `assetType`, `assetCategory`, `assetVersion`) to ensure zero-loss 300 DPI high-resolution production output via `productionPlan`.
5. **Server Entitlement & Checkout Gate:** Re-verified server-side `assetResolver` in `checkout.ts` to strictly validate `design_assets` document existence, active/published status, and prevent checkouts with forged or unseeded asset URLs.
6. **Special Acceptance Test (Google SSO Phone Linking):** Dedicated integration test confirming that a Google SSO user verifies their phone number without losing or altering their original `user.uid` (5/5 tests passed).

---

## 2. Component & Architecture Inventory

| Component / Subsystem | Path | Role & Integration |
|---|---|---|
| **Canvas Design Studio** | `src/components/editor/FabricCanvas.tsx` | Main Fabric.js canvas editor; handles tool tabs, placement clamping, `addSticker`, and canvas state serialization. |
| **Asset Gallery Modal** | `src/components/editor/AssetGalleryModal.tsx` | Modal browsing UI with category filtering, search, and asset selection for desktop & mobile. |
| **Serialization Contract** | `src/lib/faceCoordinates.ts` | Exports `SERIALIZE_PROPERTIES` ensuring provenance attributes survive canvas to JSON export. |
| **Hybrid Pricing Engine** | `src/lib/pricing.ts` | Calculates custom product pricing, factoring in `basePrice`, placement fees, and paid asset fees. |
| **Server Checkout Gate** | `src/lib/server/checkout.ts` | Server-side `assetResolver` validates `design_assets` in Firestore, rejecting invalid or unseeded assets. |
| **Production Planner** | `kenditasarl-admin/src/lib/production-plan.ts` | Transforms `canvas_json` and `production_snapshot` into calibrated 300 DPI print-ready production faces. |
| **Admin Asset Manager** | `kenditasarl-admin/src/app/(admin)/assets/page.tsx` | Admin CRUD interface for uploading stickers to Cloudinary and managing categories/prices in Firestore. |

---

## 3. Functional Capabilities & Implementation Details

### A. Asset Gallery Modal & Sidebar Grid
- **Category Filter & Search:** Real-time client filtering by category name (localized via `categoryTranslations.ts`) and substring search across asset names and categories.
- **Visual Distinction:**
  - Free assets: `Ücretsiz` (TR) / `Free` (EN) / `مجاني` (AR) in emerald badges.
  - Paid assets: `+{price} ₺` in high-contrast amber badges.
  - Format badges: `SVG` tag for vector stickers.
- **Selection Interaction:** Clicking an asset triggers a green checkmark confirmation overlay, closes the modal on mobile, and adds the sticker to the focused or active garment placement.

### B. Print Area Placement & Geometry Clamping
- **Auto-Scaling & Centering:** `prepareAndAddObject` calculates the bounding box of the active placement (`fabricLeft`, `fabricTop`, `fabricWidth`, `fabricHeight`) and scales the sticker to fit within an 85% safety margin:
  $$\text{scaleFactor} = \min\left(\frac{0.85 \cdot W_{\text{placement}}}{W_{\text{object}}}, \frac{0.85 \cdot H_{\text{placement}}}{H_{\text{object}}}\right)$$
- **Boundary Clamping:** `validateAndSnap` ensures the object stays within canvas bounds (minimum 20px visible margin) and fires real-time out-of-bounds warning banners when extending outside print area safe margins.
- **Magnetic Alignment:** Centerline snapping aligns stickers along the vertical axis unless placed in asymmetrical placement zones (e.g. `left_chest`, `right_sleeve`).

### C. Provenance & Canvas Serialization (`SERIALIZE_PROPERTIES`)
To prevent resolution loss when rendering for 300 DPI DTF/sublimation print production, all asset instances preserve provenance metadata in the serialized Fabric canvas JSON:
```typescript
export const SERIALIZE_PROPERTIES = [
  'id', 'name', 'selectable', 'evented', 'src', 'originalAssetId', 'crossOrigin',
  'isCustomUpload', 'assetName', 'assetPrice', 'assetType', 'assetCategory', 'assetVersion',
  'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'underline', 'fill', 'stroke',
  'strokeWidth', 'textAlign', 'lineHeight', 'charSpacing', 'opacity', 'scaleX', 'scaleY',
  'angle', 'left', 'top', 'width', 'height', 'flipX', 'flipY',
  'assignedPlacementId', 'placementId', 'targetFace', 'originMode', 'createdInMode',
  'isLocked', 'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY',
  'hasControls', 'hasBorders'
];
```
When restored from JSON or ingested by `productionPlan`, the sticker references its verified `originalAssetId` and calibrated physical dimensions ($W_{\text{cm}} \times H_{\text{cm}}$), maintaining vector clarity and high-DPI rasterization.

### D. Server-Side Entitlement & Checkout Security Gate
- Client-side manipulation of `assetPrice` in canvas JSON is strictly prevented from affecting checkout totals.
- In `src/lib/server/checkout.ts`, the `assetResolver` queries `db.collection("design_assets").doc(id(ref))` inside a transaction:
  1. Verifies the document exists in Firestore.
  2. Asserts `is_active !== false` and `published !== false`.
  3. Validates that the URL matches the canonical database record.
  4. Enforces that the verified `a.price ?? 0` is charged via the commercial pricing contract.
  5. Unseeded or tampered asset references fail closed with `check()` assertion errors.

---

## 4. Special Acceptance Test: Google User Phone Verification UID Preservation

### Objective
Verify that when a user registers or signs in via Google SSO (creating an initial account and profile with a specific `UID`), linking and verifying their phone number via SMS OTP:
1. **Preserves the exact original `user.uid`** across Firebase Auth and Firestore.
2. Does NOT create an orphaned account or secondary user document.
3. Atomically reserves the phone number in `phone_numbers/{hash}` mapped to this exact `UID`.
4. Merges phone verification status (`phone_verified: true`, `phone_verified_at`) into `users/{originalUid}` without overwriting existing Google profile attributes (`full_name`, `email`, `preferred_language`, `created_at`).
5. Forbids client-side forgery of phone fields and rejects duplicate phone verification by competitor accounts.

### Test Execution Results (`google_user_phone_linking.test.mts`)
```
▶ Special Registration Acceptance Test: Google User Phone Verification UID Preservation
  ✔ [GOOGLE-UID-1] Initial Google Sign-in creates profile bound to original UID (444ms)
  ✔ [GOOGLE-UID-2] Phone linking and server verification preserves exact original user.uid (130ms)
  ✔ [GOOGLE-UID-3] Client cannot tamper with phone_verified on original UID doc (86ms)
  ✔ [GOOGLE-UID-4] Second user cannot hijack the phone number verified by Google user (18ms)
  ✔ [GOOGLE-UID-5] Check-conflict endpoint confirms phone is registered to Google user (24ms)
✔ Special Registration Acceptance Test: Google User Phone Verification UID Preservation (2833ms)
ℹ tests 5
ℹ suites 1
ℹ pass 5
ℹ fail 0
```

---

## 5. Comprehensive Test Results

All test suites were executed against local Firebase Emulators (`demo-kenditasarla-rules`).

| Test Suite | File | Tests Run | Result | Notes |
|---|---|---|---|---|
| **Phase 07A: Asset Library Integration** | `tests/firestore/asset_library_integration.test.mts` | 10 | **PASS (10/10)** | Discovery, pricing, serialization, checkout entitlement, rules. |
| **Google Phone Linking Acceptance** | `tests/firestore/google_user_phone_linking.test.mts` | 5 | **PASS (5/5)** | Preserves `user.uid`, profile data, atomic phone reservation. |
| **Phase 06D.3: Registration & Auth** | `tests/firestore/registration_auth_integration.test.mts` | 13 | **PASS (13/13)** | Full lifecycle, fail-closed rate limit, translation error parity. |
| **Phase 06D.1: Atomic Phone Uniqueness** | `tests/firestore/atomic_phone_uniqueness.test.mts` | 12 | **PASS (12/12)** | Concurrency serialization, migration script, rules denial. |
| **Phase 03B: Secure Checkout Engine** | `tests/firestore/checkout.test.mts` | 14 | **PASS (14/14)** | SKU matrix, stock concurrency, COD retry, snapshot immutability. |
| **Phase 05B: Versioned Pricing Engine** | `tests/firestore/versioned-pricing.test.mts` | 12 | **PASS (12/12)** | Commercial contracts, scope hierarchy, shadow pricing telemetry. |
| **Phase 06B: Express Shipping Zones** | `tests/firestore/shipping-zones.test.mts` | 20 | **PASS (20/20)** | Ray casting, Kadıköy polygon, address trust boundary, checkout quotes. |
| **Total Automated Tests** | | **86** | **86 / 86 PASS (100%)** | Zero regressions detected across all modules. |

---

## 6. TypeScript Compilation & Multi-Language (i18n) Audit

### TypeScript Compilation
- **Store Project (`D:\kenditasarl`):** `npx tsc --noEmit` $\rightarrow$ **0 errors**
- **Admin Project (`D:\kenditasarl\kenditasarl-admin`):** `npx tsc --noEmit` $\rightarrow$ **0 errors**

### Multi-Language Parity (`messages/{tr,ar,en}.json`)
- **Key Count Parity:** 636 keys in `tr.json`, 636 keys in `ar.json`, 636 keys in `en.json` (100% key parity, 0 missing keys).
- **Terminology Compliance (`AGENTS.md`):**
  - Brand Name: `"KENDİN TASARLA"` / `"Kendin Tasarla"`.
  - Print Placement: `"Baskı Alanı"`, `"Baskı Yeri"`, tab `"Yerleşim"` (strict ban on *"Konum"* maintained).
  - Apparel & Specs: `"Beden Tablosu"`, `"Ön Yüz"`, `"Arka Yüz"`, `"Sol Kol"`, `"Sağ Kol"`, `"Stokta Var"`, `"Tükendi"`.
  - Asset Library: `"Tasarım ve Çıkartma Galerisi"`, `"Tüm Kategoriler"`, `"Ücretsiz"`.

---

## 7. Operational & Security Boundary Review

1. **Client Read Permissions:** `design_assets` and `asset_categories` remain public read in `firestore.rules` for browsing and preview in Design Studio.
2. **Client Write Lockdown:** All write operations (`create`, `update`, `delete`) on `design_assets` and `asset_categories` are strictly locked to admin users (`isAdmin()`), preventing malicious client asset creation or price manipulation.
3. **High-Res Source Asset Protection:** Public records store display/preview URLs (`url`); server production rendering resolves high-DPI assets using verified server-side identifiers during production job execution.
4. **Environment Safety:** All verification was performed exclusively against local emulators (`demo-kenditasarla-rules`). Zero production credentials modified; zero production deployments triggered.

---

## 8. Final Verdict

$$\mathbf{PASS}$$

Phase 07A (Asset Library & Canvas Editor Integration) and the Special Google SSO Phone Verification UID Preservation Acceptance Test meet all functional, architectural, security, and localization requirements.
