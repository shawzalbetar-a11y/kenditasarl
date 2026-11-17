# Kendin Tasarla — Task 04: Canvas Coordinate Compatibility & Production Reliability

**Status:** Ready for Codex — local-only implementation, with a mandatory compatibility gate  
**Date:** 2026-11-15  
**Prerequisites:** Phase 01 (admin membership), Phase 02 (Cloudinary), Phase 03B (secure checkout) remain present and passing.

## 0. Project locations and scope

- Store: `D:\kenditasarl`
- Admin: `D:\kenditasarl\kenditasarl-admin`
- Current working branch may be `codex/task03b-secure-checkout`; create dedicated task branches or checkpoints without losing previous uncommitted changes. Document the actual repository state before editing.
- **Do not** deploy, write to live Firebase/Cloudinary, rotate keys, call live payment/delivery providers, migrate historical data, change real orders, or upgrade Next.js/Fabric.js as part of this task.
- Use only synthetic fixtures and local test data. Never expose secrets, customer content, or original copyrighted assets in reports.

## 1. Why this task is necessary

Phase 0 audit found real coordinate-space differences:
- For most products, the Fabric editor canvas covers the **full product mockup image**, and print areas are placed within it.
- Some calibrated print areas use rectangles in native mockup pixels plus physical centimeter dimensions.
- The mug wrap has a dedicated `1840 × 760 px` design surface representing `23 × 9.5 cm`.
- Earlier design/snapshot documentation described **editor canvas equals print area**. Both representations may exist in historical data.
- Production generator sometimes reads physical dimensions from `customization_config.faces[face]` instead of nested `.printArea`; scales the full canvas rather than cropping/translating the selected print rectangle; and may use width-only scaling.
- Quality checks previously treated missing image assets as fake 1200×1200 sources, possibly returning READY; ZIP manifest could list a missing file.
- Phase 03B now creates per-order-line immutable art/pricing snapshots. **Production must use each order item's frozen snapshot**, not an editable design or current product settings.

Do not assume one coordinate interpretation for all orders. Resolve from explicit version metadata when present, otherwise create conservative, tested legacy inference with **fail-closed** ambiguous behavior.

## 2. Mandatory baseline inspection (before edits)

1. Record `git status`, branch, and changed files for both repositories, including whether Phase 01/02/03B changes are committed; do not reset or discard them.
2. Locate and inspect store `src/components/editor/FabricCanvas.tsx`, `src/lib/coordinateMapping.ts`, `src/lib/customizationConfig.ts`, `src/lib/placementBounds.ts`, `src/lib/server/checkoutArt.ts`.
3. Locate and inspect admin `src/lib/production-renderer.ts`, `src/lib/production-quality.ts`, `src/lib/production-zip.ts`, `src/components/ProductionFileGenerator.tsx`, `src/app/(admin)/orders/[id]/page.tsx`, `src/lib/customizationConfig.ts`, and font-loading code.
4. Document actual data shapes: `canvas_json`, `production_snapshot`, editor/native mockup sizes, face keys, `faces[face].printArea`, `snapshot.printAreas`, per-placement transforms, bleed/safe-area, printMethod, physical dimensions, targetDPI, and `is_immutable_snapshot`.
5. Identify any assumptions that conflict with historical data. Preserve contract-compatible use of Fabric.js 5.3.0 and its `originalAssetId` metadata/fallback.
6. Confirm exact Phase 03B item snapshot fields and whether preview/base images are mixed into production JSON.

## 3. Compatibility contract — implement only after understanding fixtures

Define a **versioned, explicit coordinate-space discriminator** for new artwork/snapshots, such as:
- `mockup_pixels`: Fabric coordinates relative to full native product mockup; requires a print-area rectangle on the same reference image.
- `print_area_pixels`: Fabric coordinates relative to printable area with origin `(0,0)`; requires editor print-area dimensions.
- `wrap_surface_pixels`: Fabric coordinates relative to the dedicated unwrapped mug surface; requires explicit physical dimensions and orientation.

Exact naming can differ if existing source already has a compatible versioned discriminator. Do not add conflicting alternative fields. Document the final TypeScript contract, current/legacy readers, and versioning plan shared between store and admin.

For **legacy** documents without a discriminator, derive only from reliable source attributes/version and fixtures. If ambiguity persists, mark production `NOT_READY` / `NEEDS_REVIEW`, explicitly state why, and provide a manual reconciliation process; **never silently assume default 30×40 cm or edit old orders**.

Always distinguish:
- `mockup/base_image`: customer preview only; **never** printed.
- `print area`: geographic rectangle on product image or a dedicated surface.
- `design layers`: intended print artwork.
- `production output`: transparent RGBA art, clipped to the selected printable area, physical pixel size determined by cm and DPI.

## 4. Coordinate transformation requirements

For `mockup_pixels`, crop/map **each configured print area** from native mockup coordinates. Translate artwork so print area's top-left is production origin, then scale to export dimensions. Clip artwork to bounds/bleed policy. If multiple independent placements share an image, export them independently as required.

For `print_area_pixels`, map from configured editor print area (origin 0,0), without mockup offset.

For `wrap_surface_pixels`, map the dedicated mug design surface to its declared physical size; test seam/orientation/mirror rules explicitly. Do not inherit mockup crop assumptions.

Use `Math.round((cm / 2.54) * targetDPI)` per axis. Define one consistent, documented policy for nonmatching x/y aspect ratios: preserve physical scaling with separately derived axes where technically correct, or refuse invalid template aspect ratios. Avoid unintentional stretching, missing content, or silent padding. Test rotations, flipped objects, text, nested images, and edge clipping. Any print-method-specific mirroring must be explicit and recorded in export metadata.

Ensure no preview/mockup pixels or checkerboard are present in exported transparent PNG. Verify pixel dimensions, alpha, and DPI metadata; DPI metadata alone is not evidence of source image quality.

## 5. Production quality & asset integrity

- Missing or inaccessible user/sticker assets are **NOT_READY**, never READY by using fabricated image dimensions.
- For each placed bitmap, compute effective DPI from **its real native source pixels**, its transformed physical dimensions, and scale/crop. Respect intentional rotation/transform. Flag undersized sources using the existing, documented threshold policy; do not fake quality via high export resolution.
- Load allowed fonts before render; if missing/unsupported, report actionable failure or warning, not silent font substitution. Verify at least Turkish and Arabic text fixture.
- Handle image URL/CORS errors without outputting incomplete ready-to-print assets. Do not turn private originals into publicly accessible URLs.
- ZIP manifest must list exactly the included files with matching dimensions, hashes, areas and statuses. Missing required files => block completion/ZIP or record an unambiguous failed package, never a `COMPLETED` package that claims files not included.
- Keep memory bounded: generate one face/area at a time, dispose Fabric canvases, revoke object URLs as appropriate.

## 6. Immutable orders and backward compatibility

- For Phase 03B **new orders**, production reads solely from the order line's frozen design/production snapshot, never current mutable `designs`, live product config, or an altered preview.
- For **legacy orders**, preserve the existing clearly labeled fallback, but never claim immutable provenance and never infer dimensions without trusted data. `NOT_READY` when critical source is missing.
- Do not change SKU, prices, delivery, checkout APIs, Firestore rules, or customer orders in this task unless a necessary bug fix is explicitly documented and tested.
- Maintain existing preview routes/UI and historical face-key syntax (e.g. `#ffffff:::front`) via compatibility adapters.
- Preserve `originalAssetId` through Fabric JSON and legacy `obj.src` fallback, without treating URL alone as proof of ownership.

## 7. Required testing / acceptance gates

Implement **real assertions** (never placeholder `assert.ok(true)`) and fixtures for all relevant modes:

1. Full-mockup example: fixed 200×280 px print rectangle at a non-zero offset within larger image; output contains artwork translated to (0,0) with correct clipping.
2. Print-area-origin example: no extra offset applied.
3. Mug wrap surface 1840×760 px / 23×9.5 cm; export has exact expected pixel dimensions at declared DPI and proper orientation.
4. Reuse one graphic across two print areas: independent output for each area without mockup imagery.
5. Multiple colors/face keys: order item's selected color/art only, not current studio color or another order item.
6. Rotation, flip, Arabic and Turkish text, transparent PNG, aspect ratio policy, and real pixel dimensions.
7. Missing original upload/sticker/font: appropriate `NOT_READY` or controlled `WARNING`, no fake READY.
8. ZIP package integrity: every manifest file exists, output hash/dimensions agree, and missing files block success.
9. Immutable snapshot test: edit original design/current product *after* synthetic order creation and verify identical production result/hash.
10. Ambiguous legacy snapshot => `NOT_READY` / explicit review, without altering the source document.
11. Run prior Phase 01/02/03B test suites, both TypeScript checks, and both Next.js builds where feasible; document any known blockers and don't quietly waive them.

Where output correctness is visual, generate side-by-side **synthetic** fixture proof images and document an independent inspection. If an existing local printer/ICC/DTF profile is unavailable, clearly state that physical print verification is still outstanding.

## 8. Delivery and stop conditions

- Target report: `docs/production/PHASE4_CANVAS_PRODUCTION_COMPATIBILITY_REPORT.md` (or an equivalent documented path).
- Report: what was changed, exact code files, contract additions/compatibility mapping, fixture list, before/after evidence, tests and builds, unresolved issues, and any required manual review/deployment steps.
- If the legacy coordinate mode cannot be reliably determined, **stop before performing a breaking rewrite**, provide exact evidence and 2–3 non-destructive options. Do not invent a mapping or silently migrate data.
- No live deployment, no direct writes to customers' Firebase data, no secret rotation, no production account connections. Changes remain local and ready for independent review.
- At the end, provide a brief next-step recommendation: Phase 04B production visual QA / controlled staging verification if needed.
