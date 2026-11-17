# Phase 06B: Release & Rollback Plan
**Kendin Tasarla — Express Delivery Zones System**  
**Version:** `1.0.0`  
**Date:** 2026-11-15  
**Current Gate:** `LOCAL PHASE 06B: PASS` | `LIVE DEPLOYMENT: BLOCKED`

---

## 1. Overview & Operational Principles

This document defines the safe deployment, verification, and contingency rollback procedures for Phase 06B (Express Delivery Zones). In accordance with project governance, **no live deployments to Firebase, Cloudinary, or Vercel are executed autonomously**. All local engineering gates must pass before a deployment change request is submitted for explicit user authorization.

---

## 2. Pre-Release Checklist (Pre-Flight Gates)

All 6 pre-flight gates have been verified locally:

1. [x] **Non-Destructive Git Checkpoint:**
   - Pre-edit checkpoint verified at:
     `C:\Users\KADLO-X0X\.gemini\antigravity\brain\f61f5472-3080-4e52-9d4d-a10bd6954062\scratch\checkpoint_phase06b\kenditasarla_full_checkpoint.zip`
   - Checksum: `27E8040EA2D124BA9A874F7A3E21D37BE8D1A008CE9DAAE760C16B302DF2C694`.
2. [x] **TypeScript Compilation:**
   - Store: `npx tsc --noEmit` exited with code `0`.
   - Admin: `npx tsc --noEmit` exited with code `0`.
3. [x] **Local Test Execution:**
   - 15/15 Phase 06B automated tests in `tests/firestore/shipping-zones.test.mts` passed.
4. [x] **Full Regression Integrity:**
   - 94/94 regression tests across Phases 01 through 06A-R2 passed with 100% success.
5. [x] **Localization Compliance:**
   - Turkish apparel/POD terminology strictly adheres to `AGENTS.md` (no "Konum" for print areas; "Baskı Alanı", "Yerleşim", "Bölge" correctly applied).
   - 100% dictionary key parity across `tr.json`, `ar.json`, and `en.json`.
6. [x] **Shadow Mode Protection:**
   - Phase 05B Versioned Pricing remains strictly in Shadow Mode.

---

## 3. Deployment Procedure (When Explicitly Authorized)

When the user gives explicit consent to proceed with live release:

### Step 1: Firestore Security Rules Deployment
```powershell
firebase deploy --only firestore:rules --project kenditasarla
```
- Verifies that `/shipping_zone_policies/{policyId}` matches:
  - Public read for pointer and revisions.
  - Client direct writes blocked (`allow write: if false;`).
  - Drafts and audit collections restricted from direct client access.

### Step 2: Seed Baseline Istanbul Zones (Optional / Admin Controlled)
- Administrators navigate to `https://admin.kenditasarla.com/settings/shipping-zones`.
- Click **"Örnek Bölgeleri Yükle"** to populate baseline non-overlapping zones (Kadıköy and Beşiktaş).
- Click **"Yayına Al"** to atomically publish the first revision.

### Step 3: Deploy Store & Admin Applications
- Deploy Next.js Store frontend and Admin dashboard to production hosting.

---

## 4. Rollback Plan

If any unexpected behavior, network anomaly, or edge-case occurs post-deployment:

### Scenario A: Instantaneous Revision Rollback (Within Admin Panel)
1. Go to **Settings > Hızlı Teslimat Bölgeleri > Yayın Geçmişi**.
2. Select any previously verified revision.
3. Click **"استرجاع إلى المسودة" (Restore into Draft)**.
4. Click **"نشر الإصدار للعملاء" (Publish Revision)**.
- **Downtime:** 0 seconds.
- **Customer Impact:** Any active checkout quotes under the rolled-back revision cleanly trigger a refresh without order corruption.

### Scenario B: Emergency Kill-Switch (Immediate Fallback to Standard Shipping)
1. In Admin panel, toggle all express zones to **Pasif (Inactive)** or set active revision pointer to `null`.
2. The checkout engine automatically falls back to standard shipping:
   - `isExpressAvailable` evaluates to `false`.
   - Customers receive standard shipping options with zero checkout downtime.

### Scenario C: Complete Codebase Restore from Checkpoint
If an unrecoverable code regression occurs:
```powershell
powershell -Command "Expand-Archive -Path 'C:\Users\KADLO-X0X\.gemini\antigravity\brain\f61f5472-3080-4e52-9d4d-a10bd6954062\scratch\checkpoint_phase06b\kenditasarla_full_checkpoint.zip' -DestinationPath 'D:\kenditasarl' -Force"
```

---

## 5. Next Steps Gate

In accordance with project directives:
- Phase 06B local development is complete and verified.
- **Do not proceed to Phase 07 (Designer Marketplace) until explicit user review and authorization.**
