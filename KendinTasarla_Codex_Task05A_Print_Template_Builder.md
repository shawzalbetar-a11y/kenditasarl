# Kendin Tasarla — Codex Task 05A: Product Print Template Builder (Admin)

**Status:** APPROVED FOR LOCAL IMPLEMENTATION ONLY — no deployment, no production Firebase writes, no automatic migration.
**Date:** 2026-11-15
**Projects:** Store `D:\kenditasarl`; Admin `D:\kenditasarl\kenditasarl-admin`.
**Output report:** `PHASE5A_PRINT_TEMPLATE_BUILDER_IMPLEMENTATION_REPORT.md`

## 0. Goals and boundaries

Develop the **existing** store and admin, do not create a new application or replace the canvas/production subsystem. Build a professional **Print Template Builder in the Admin** that controls product-specific printable faces, physical print dimensions, coordinate frames, editor capabilities, and publication lifecycle. This is **05A only**. Do not implement the full pricing engine, quantity discounts, designer marketplace, family bundles, delivery zones, or any real payment. These are later tasks.

**Foundational invariants:**

1. Preserve all proven fixes in phases 01, 02, 03B, 04A and 04B. Run their regression suites.
2. The editor has THREE supported coordinate frames: `FULL_MOCKUP_NATIVE`, `PRINT_AREA_LOCAL` (only when independently proven), `STANDALONE_SURFACE`. Never infer an old frame from order timestamp, `snapshotVersion`, or canvas dimensions alone.
3. The storefront and admin already have product customization contracts (`customization_config`, `customizationConfig.ts`) and a production generator. **Extend by a compatibility adapter**; do not duplicate divergent interfaces or replace legacy documents in place.
4. Live order item snapshots, their artwork, price, print coordinates, file hashes, and production interpretation MUST remain immutable. New publication may affect future designs only.
5. An unproven legacy design is `NEEDS_REVIEW`. Do not retroactively tag it or claim it is ready to print.
6. Only locally authorized test/admin identities may edit drafts through a server-validated path. Never trust UI role flags, never expose Cloudinary secrets.
7. Do not publish to the real Firebase, host, CDN, Cloudinary, or payment provider; do not read actual customer information. Use synthetic data and Firebase Emulator.
8. Do not silently change `price`, `base_price`, `unit_price`, `settings/pricing`, checkout quotes, COD payment status, inventory stock documents, upload links or Cloudinary account selection. Phase 05B will handle pricing.

## 1. Pre-change inspection and decision gate

Inspect actual files at both project roots, especially:

- Store: `src/lib/customizationConfig.ts`, `src/lib/faceCoordinates.ts`, `src/lib/placementBounds.ts`, `src/lib/coordinateMapping.ts`, `src/components/editor/FabricCanvas.tsx`, `src/app/[locale]/design-studio/[[...productId]]/page.tsx`, `src/lib/server/checkoutArt.ts`, `src/lib/server/checkout.ts`, `src/lib/pricing.ts`.
- Admin: `src/lib/customizationConfig.ts`, `src/app/(admin)/products/[id]/edit/CustomizationSection.tsx`, `src/components/admin/PrintAreaEditorModal.tsx`, product create/edit pages, `src/lib/production-plan.ts`, `src/components/ProductionFileGenerator.tsx`, `src/lib/production-quality.ts`.
- Current Firestore paths and rules for `products/{id}`, `products/{id}/variants/{variantId}`, `design_assets`, and `settings/pricing`.

Report current canonical data shapes, mockup image mapping, existing face keys, nested print areas, variant constraints, form validation, and differences between store/admin schemas. Determine whether a product template should be embedded in product's `customization_config` or versioned in additional documents. **Prefer the smallest additive approach compatible with the real code and existing snapshot hashing**. If a safe versioning/publishing design cannot be achieved without breaking old orders, STOP and present options; do not guess.

Before editing: check `git status` in **both** repositories, note all uncommitted changes from previous phases, and create a tested local rollback of both working trees without including/exposing secret values in reports. No `git reset --hard`, clean, rebase, mass-format, auto-upgrade or broad migration. Make a focused branch if useful; a branch is not itself a backup of uncommitted files.

## 2. Product and print template contract

Define or adapt TypeScript + Zod contracts for these separate concepts:

- **Product:** catalog identity, category, published state, linked mockups, existing variants and baseline fields.
- **Product Variant:** stable SKU/identity, size/color/model, inventory in existing paths; allow different compatible template assignments only where necessary, without changing SKU IDs.
- **Print Template Draft:** editable admin definition, schema version, product reference, draft revision/updatedAt, provenance, lifecycle status.
- **Published Template Revision:** immutable snapshot of the complete printable geometry, physical dimensions, print method, mirror decision, face/mockup mapping and editor tool gates; canonical deterministic hash / revision identifier.
- **Face:** stable key such as `front`, `back`, `left_sleeve`, `right_sleeve`, `mug_full_wrap`; image/mockup identity, origin/surface dimensions, mode, optional compatibility filter on variants.
- **Print Placement:** stable placement ID, face ID, rectangle in **native logical canvas pixels** `{left,top,width,height}`, physically printable width/height in **centimeters**, DPI, print method, mirror `NONE|OUTPUT_HORIZONTAL`, optional safe/bleed/cut descriptors with units and reference system explicitly stated. Multiple placements per face supported.
- **Editor Policy:** allowed upload/text/sticker/layers capabilities for each product/template/placement, maximum uploads/elements; whether free mode is allowed; read-only special designer artwork restrictions reserved for a future task.

Do not mix display bounds with production dimensions. Do not reinterpret historical fields `top/left/width/height`, `nativeWidth/nativeHeight`, `mug_meta`, `base_images`, or face mappings. The new published template must capture everything needed to reproduce a print independently from changes to the live product.

Validation:

- finite, positive dimensions and DPI; explicit coordinate basis and face/surface match;
- all rectangles fall in their defined surface; no ambiguous unit conversion;
- geometry and physical aspect ratio consistent with the strict 04B tolerance or an explicit reviewed exception policy (no silent distortion);
- unique IDs and face names, defined placement-to-face relationships;
- valid mockup mapped to face, and no silent fallback into print output;
- explicit mirror and physical dimensions mandatory before **publish**; configurable drafting defaults may exist but cannot silently qualify for printing;
- unknown/legacy coordinate modes must not be auto-promoted;
- per-variant applicability cannot associate the same SKU with contradictory live templates;
- safe area and bleed are specified with their unit and coordinate frame; unresolved complex clipping must not be marked print-ready.

Use a single shared contract source if feasible without destabilizing the apps; if separate copies remain, add parity tests and explicit versioning. Do not create a new generic `mm` editor coordinate contract: retained editor contract is logical pixels; physical dimensions are centimeters.

## 3. Admin Template Builder UX

Build on current product edit/customization UI, with responsive editing on desktop and safe viewing on narrow screens. Required workflows:

1. Choose existing product and its relevant variant family.
2. View front/back/sleeves/mug wrap or product-provided surfaces.
3. Bind each surface to its existing product mockup/asset source; show its native coordinate dimensions.
4. Add/edit/delete/reorder allowed **print placements** using visual handles and precise numeric fields. Show overlay and local preview without changing original product images.
5. Set physical size in cm, DPI, print method, explicit mirroring and optionally rectangular safe area. Render expected pixel export dimensions as **derived values only**.
6. Enable/disable editing tools per template/placement (`allowCustomerUpload`, `allowText`, `allowStickers`, etc.), with clear reasoning when a disabled feature is unavailable in Canvas.
7. Distinguish `Save Draft`, `Validate`, `Preview`, `Publish New Revision`, `Archive` (where compatible) with role checks, confirmation on destructive actions and unsaved-change detection.
8. Display robust validation errors in Turkish, Arabic and English using the existing locale architecture. Do not hardcode untranslated new labels.
9. Show current published revision, which customer designs were created under it (aggregate/test evidence only), and how editing drafts does **not** mutate already published revisions.
10. Explicitly display states `DRAFT`, `VALID`, `PUBLISHED`, `NEEDS_REVIEW`/`INVALID` where relevant; do not imply that publishing proves a physical print is approved.

Prefer small focused components: template overview, surface selector, placement inspector, editor policy, publishing controls; avoid appending a large section to the already very large `FabricCanvas.tsx`.

## 4. Storefront runtime contract

- Expose safe **published** configuration for selected product/variant to the Design Studio; no admin drafts or secrets to clients.
- Dynamically show only allowed faces, placements, tools, text, customer uploads, and stickers. Display explicit unavailable states instead of invisible validation failures.
- Enforce enabled/allowed areas **on the server** during quote and checkout even if a client sends forged configuration or hidden tools.
- Continue to save a coordinate frame **per face** as required by 04A and accepted by 04B; restore older known drafts without mutating them. Unknown legacy must prompt review or new design path, never silently re-stamp.
- Preserve per-color/per-variant line art pricing path from 03B. Do NOT calculate new placement prices in this task. Existing pricing and checkout should remain behavior-compatible.
- Template publication after a customer has a draft should either pin that existing draft's revision (if still supported safely) or request explicit customer reconfiguration; do not silently alter artwork or price.
- Preserve ready-made catalog flow (no double charge for already printed designs) and blank/customizable flow.

## 5. Security, persistence, lifecycle

- Treat Admin membership as a server-verified authorization; ordinary users cannot edit `products`, template drafts, pricing, or published revisions.
- Use a protected write API / transaction or existing equivalently secure server path; do not introduce direct client writes that bypass tightened rules from 03B.
- Publish revisions atomically, validate schema and prevent simultaneous edit conflicts with an expected draft revision / optimistic concurrency check.
- Preserve audit fields (actor ID, timestamp, previous revision ID, change summary) in an admin-only log. Avoid putting secrets in documents or logs.
- Create an additive compatibility layer for older products without overwriting all existing product documents. Dry-run any proposed migration and obtain separate approval before writing live data.
- Enforce reference integrity: production code still consumes confirmed order-item `production_snapshot` and verified `coordinateFaces`, never a mutable current template at render time.
- Distinguish template completeness from physical production approval; all outputs remain **NOT PHYSICALLY APPROVED** until actual signed checklist for product/material/device/method.

## 6. Mandatory tests / acceptance criteria

Run focused unit tests, Firestore Auth emulator integration tests, Chrome UI checks where practical, both-app TypeScript, both-app Next.js isolated builds, existing 01/02/03B/04A/04B regression suites, translation key parity.

Required synthetic acceptance cases:

1. Existing printed catalog product still purchasable with existing price, and blank product opens a new empty canvas.
2. Admin adds a new tee with native mockup face + front and back placements; correct preview and expected output dimensions.
3. Another product (hat or mug) exposes only its allowed tools/faces/placements and its physical settings.
4. Editing placements while unpublished changes draft **only**, not store/checkout/production.
5. Publish revision `v2` from valid `v1`, verify `v1` remains immutable and existing saved design/order outputs remain hash-stable.
6. A separate user and a normal designer cannot write draft or publish; admin can using server authority, and client cannot forge `role`.
7. Template with missing mirror, invalid dimensions, out-of-bounds placement, mismatched aspect ratio or ambiguous coordinate frame cannot be published.
8. Two admins updating the same draft: second stale save must fail safely, not overwrite.
9. Fake forged client `allowedTools` or a disabled placement is refused during server validation/quote.
10. Per-color checkout pricing and idempotent stock decrement remain unchanged (regression from 03B).
11. Order production from 04B for known coordinate modes continues producing matching PNG/ZIP hashes.
12. Unknown historical face is left unchanged and marked `NEEDS_REVIEW`, no silent migration.
13. Existing Cloudinary protected uploads / images remain operational in emulator tests; no new secrets exposed.
14. 3-language labels and validation errors have parity.
15. No new direct Firestore write path lets customers modify admin drafts or catalog documents.

All failures must stop claiming success. Tests should assert meaningful behavior (never placeholder `assert.ok(true)`).

## 7. Deliverables / report

Save `PHASE5A_PRINT_TEMPLATE_BUILDER_IMPLEMENTATION_REPORT.md` under project docs or an explicitly referenced report path with:

- Exact list of modified files in **both** apps and their Git status/commit refs;
- Before/after data contracts with actual field names and Firestore paths, and compatibility matrix;
- Security/permission details; draft/publish protocol; UI screenshots and two example product templates;
- Real commands + pass/fail counts, limitations of mocks, manual verification notes;
- Which 04B output types are supported vs remain `NEEDS_REVIEW`;
- Impact on 03B checkout and existing pricing, confirming no new charges introduced;
- Risks, any stopped decisions, and precise proposal for **Phase 05B Pricing Engine**;
- Clear statement: no production deployment, no actual physical printing or customer data writes.

Stop after Task 05A; do not implement 05B or market features without a separate go-ahead.

## 8. Parallel owner actions (not for Codex to perform)

- Arrange actual shirt and mug printing using `PHASE4B_PHYSICAL_PRINT_CHECKLIST.md` and evidence from local test ZIPs. Record RIP settings, tape/placement, cm measurements, seam/handle clearance, ICC, and signed pass/fail.
- Independently plan staged Firebase Rules release and Cloudinary credential rotation discovered in phases 01/02. Never share raw credentials in chat.
- Plan server-upload asset content hashes and immutable version references before any **commercial production** involving customer/designer artwork.
- Protect unfinished changes with reviewed local commits/secure backups; DPAPI rollback archive may only decrypt under its original Windows user context.
