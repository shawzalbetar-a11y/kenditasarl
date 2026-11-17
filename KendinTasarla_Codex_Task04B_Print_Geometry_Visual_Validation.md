# Kendin Tasarla — Task 04B: Print Geometry, Visual Validation & Physical Proof

**Status:** Authorized for local implementation and testing only, subject to the constraints below.  
**Prepared:** 2026-11-15  
**Store:** `D:\kenditasarl`  
**Admin:** `D:\kenditasarl\kenditasarl-admin`

## Context and prerequisites

Read these reports and the actual source before making changes:
- `PHASE3B_SECURE_CHECKOUT_IMPLEMENTATION_REPORT.md`
- `PHASE4_CANVAS_PRODUCTION_COMPATIBILITY_REPORT.md`
- `PHASE4A_COORDINATE_CONTRACT_AND_PRODUCTION_GATES_REPORT.md`
- Actual source: `src/lib/faceCoordinates.ts`, `src/lib/server/checkoutArt.ts`, `src/lib/placementBounds.ts`, `src/lib/coordinateMapping.ts`, `src/components/editor/FabricCanvas.tsx` in Store, plus `src/lib/production-plan.ts`, `src/lib/production-renderer.ts`, `src/lib/production-quality.ts`, `src/lib/production-job.ts`, `src/lib/production-zip.ts`, `src/lib/coordinate-review.ts`, `src/lib/fonts.ts`, `src/components/ProductionFileGenerator.tsx` in Admin.
- Preserve Task 01, Task 02, Task 03B and Task 04A work. Verify local git status and identify uncommitted work in BOTH repositories before editing. Do not reset or overwrite it. The rollback ZIP is not a substitute for checking its contents and preservation of current work.

**Known 04A boundary:** Production export is conservatively restricted to a single placement covering the full canvas at matching aspect ratio, with explicit dimensions/DPI/print method/mirror. 04B must extend this safely; never bypass a gate merely to make tests pass.

## Core goal

Demonstrate that for a *specific order item and each selected face/placement*, the renderer produces the correct transparent, physically dimensioned artwork using a reliable per-face coordinate contract, independent of canvas zoom, screen DPI, current product data, or edits made after checkout. Cover shirts (front, back, sleeves), mugs (standalone full wrap), and multiple placements.

### Hard requirements

1. The authoritative inputs are `orders/{orderId}/items/{itemId}` immutable artwork + `production_snapshot.coordinateFaces[face]` and any authorized, separately stored coordinate-review record bound to the order-item artwork fingerprint. Do not silently reinterpret old artwork or read live product state for a new order's production geometry.
2. Recognize `FULL_MOCKUP_NATIVE`, `PRINT_AREA_LOCAL`, and `STANDALONE_SURFACE` explicitly. Unlabeled/ambiguous legacy items remain `NEEDS_REVIEW` and unavailable for production. Do not infer coordinate space from date, dimensions, face names, or image previews.
3. Each placement specifies `rect.{left,top,width,height}` in its declared reference frame, plus physical output size, target DPI, print method and `mirror`. Reject missing or contradictory requirements; missing mirror must NOT default silently to `NONE`.
4. Do not modify historical order items, prices, inventory, art fingerprints, existing design JSON or the definition of `art_version`. Do not overwrite prior order data. If a version extension is unavoidable, implement a backward-compatible explicit schema and document migration/compatibility; no automatic migration.
5. Do not touch production Firebase, Cloudinary or live payment providers; no actual customer images or orders in tests. Do not publish or rotate live credentials.
6. No external links/assets are needed for tests; construct deterministic synthetic fixtures. Keep uploaded assets and secrets out of reports and git. Do not print secrets.

## A — Geometry and coordinate transforms

- Implement/test a pure, traceable transform from source-frame pixel coordinates to a specific placement's local pixel coordinates, followed by physical output pixels.
- For `FULL_MOCKUP_NATIVE`, placement-local coordinates subtract the placement rectangle origin, and crop/mask to its bounds. For `PRINT_AREA_LOCAL`, do not subtract the full-mockup origin. For `STANDALONE_SURFACE`, follow the standalone surface's explicitly declared frame and placement.
- Define and enforce one transform order for Fabric objects/groups/rotations/flips, viewport/zoom independence, clipping, safe area, bleed, output mirroring and antialiasing. If an operation cannot be interpreted reliably, fail closed with a specific reason. Avoid multiplying transforms twice.
- Output dimensions: `round(widthCm / 2.54 * targetDPI)` × `round(heightCm / 2.54 * targetDPI)`. Validate dimension limits and unit conversion, preserve transparent pixels outside artwork, and ensure mockup/base-image layers are NOT in the printable output.
- Handle multiple placements on a single face as independently named PNGs. Never fuse them into a single output unless the print contract explicitly requires it. Define stable, collision-free filenames and output metadata for order-item/face/placement.
- Ensure coordinate review records are respected only if authorized and bound to the *current* art fingerprint / face / order item. Old reviews must not apply when the artwork changes.

## B — Mirroring, mug wrap, typography and color

- `mirror=NONE`: no flip. `mirror=OUTPUT_HORIZONTAL`: flip **the final placement output once**, not just an object or mockup. Validate asymmetric fixtures to detect double/no flips.
- For mug full wrap, test the declared 23 × 9.5 cm fixture at 300 DPI, including orientation of left/right ends, safe area near handle, and the seam continuity in a test image. Do not claim physical mug quality based on pixel tests alone.
- Test Turkish characters (`ğ, ş, ı, İ, ö, ü, ç`) and Arabic shaping in approved fonts; ensure font assets truly load and glyph coverage is demonstrated with a deterministic visual reference. Unknown/missing fonts or glyphs must block printing, not silently fall back. Check nested/grouped text and transformations.
- Treat color spaces and printing ICC/DTF device profiles as *not yet approved* unless specifically verified. Never promise press-ready color merely because RGBA PNG has 300-DPI metadata.

## C — Safety and package integrity

- Existing hard-fail for missing/corrupt required image, missing fonts, absent faces, blank scene, inconsistent placement dimensions, corrupt PNG or incomplete ZIP MUST remain.
- Confirm each PNG can be decoded, has exact intended dimensions, valid transparency and appropriate DPI metadata. ZIP must contain every expected placement and required raw asset; manifest must reflect included entries exactly and include production provenance (art fingerprint, immutable source, template revision, coordinate contract, dimensions, method, mirror and review reference if any) without secrets.
- Specify rules for `READY`, `WARNING`, `NOT_READY`, `NEEDS_REVIEW` and operator override. A low-DPI warning may be overrideable ONLY per explicit policy, with operator identity/reason; coordinate ambiguity, missing assets or missing required fonts cannot be overridden. Highlight the 04A behavior permitting an override below 120 DPI: assess safety and document whether it should be blocked by default or require a separately privileged approval. Do not silently relax quality thresholds.
- Print preview/download links should be shown only after **all placements in the order item** pass gates. A display-only mockup preview is not a production asset.
- Audit content-addressed or immutable asset provenance. If original Cloudinary URLs may serve mutable bytes, propose (and if feasible implement locally) a secure, versioned provenance check. Do not falsely claim long-term byte immutability when not ensured.

## D — Tests and evidence

Create a **golden test fixture matrix** and reference images with pixel-level and visual assertions:

| Fixture | Mandatory assertions |
| --- | --- |
| Print-area-local vs full-mockup origin | Same JSON / different contract => expected marker at (140,160) vs (40,40), using previous Phase 4 proof |
| Shifted front placement | Origin subtraction and cropping exact, outside pixels transparent |
| Two placements on one face | Two correctly labeled independent PNGs and manifest entries |
| Front + back + sleeve | Independent face/frame geometry and no leakage between surfaces |
| Mug standalone 1840×760, 23×9.5 cm | Correct dimensions at 300 DPI, seam/orientation test |
| Mirror=NONE and OUTPUT_HORIZONTAL | Asymmetric text/marker visibly reversed exactly once |
| Nested images/rotated groups and nested text | Transform and source resolution checks |
| Turkish and Arabic strings | Correct glyph/shaping appearance under real approved fonts |
| High-resolution original vs degraded/missing original | Effective DPI and fail-closed behavior |
| Legacy unknown origin, missing mirror, changed template revision | `NEEDS_REVIEW` / blocked export |
| Immutable order art after editing source design | Identical production fingerprint/PNG from same order snapshot |
| Corrupt/partial ZIP and missing asset | No download and truthful manifest |

Run visual comparisons at normal and high screen device pixel ratio; generate PNG proof sheets with labels, metadata and pixel samples. If strict pixel equality is unstable due to browser rendering, use documented tolerance and nonvisual geometry assertions; do NOT replace meaningful assertions with `assert.ok(true)`.

Re-run relevant Firebase Emulator, checkout-browser, TypeScript and builds for Store/Admin. Use only local synthetic data and safe test ports. Include exact commands and counts, plus failures and unresolved items in the report.

## E — Physical proof: separate owner-assisted acceptance

Prepare a **print proof checklist** (do not claim the physical tests happened):
- One real T-shirt sample with a front and/or back placement and a measured registration marker.
- One real mug wrap with seam/handle alignment and mirror policy appropriate to actual process.
- Measure print width/height, position, margins and orientation with a ruler and photograph the results; compare against approved expected dimensions and placement.
- Record printer / transfer method (e.g. DTF or sublimation), DPI, substrate, color profile and operator approval as evidence.
- Determine acceptable tolerances **with the shop owner and equipment**, not by inventing a universal tolerance.
- Any product/template without approved physical proof remains marked not physically certified.

## Scope control & stop conditions

- Build the geometry and automated validation that can be grounded in the current code. If the semantics of a placement type, bleed or real-print mirroring are underdetermined, do not guess: stop that subcase with a documented `NEEDS_REVIEW` and continue safe independent fixtures. Stop full implementation if making the change safely requires destroying legacy behavior or mutating historical orders.
- Do not begin Task 05 (pricing/template builder), Task 06 (groups/delivery), or Task 07 (marketplace).
- Do not deploy, sync, write production data or initiate any actual printing. No changes to pricing, payment, inventory or admin membership except strictly necessary regressions with tests.
- Maintain a rollback point that includes uncommitted changes and both workspaces. Do not expose secrets in the backup.

## Deliverables

1. Local code changes limited to 04B and associated tests, with `git status` and list of changed files per repository.
2. `PHASE4B_PRINT_GEOMETRY_VALIDATION_REPORT.md` with: before/after behavior, contract changes, test matrix outcomes, commands, visual proof sheet locations, known limitations and a go/no-go decision **for software validation only**.
3. `PHASE4B_PHYSICAL_PRINT_CHECKLIST.md` for the owner, clearly labeled **NOT PERFORMED** until real printing and measurement.
4. A short list of security/release blockers from Task 01–03B still outstanding, especially Cloudinary credential rotation and coordinated deployment.

**Success is not a blanket approval to print every historical order or every product.** Approved fixtures may pass software checks; ambiguous legacy, unverified physical processes and incomplete assets remain blocked.

After completion, **stop and report**. Wait for explicit approval before touching live systems or launching another phase.
