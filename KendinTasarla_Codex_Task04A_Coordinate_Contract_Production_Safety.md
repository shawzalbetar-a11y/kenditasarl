# Kendin Tasarla — Task 04A: Explicit Coordinate Contract & Production Safety Gates

**Status:** Approved next local development task following `PHASE4_CANVAS_PRODUCTION_COMPATIBILITY_REPORT.md` (15 November 2026).

## Working directories
- Store: `D:\kenditasarl`
- Admin: `D:\kenditasarl\kenditasarl-admin`

Use the *actual directories detected in the workspace* and report if inaccessible. Preserve all work from Tasks 01, 02, 03B and the Phase 4 diagnostic. Neither branch name nor Git HEAD alone guarantees uncommitted changes are backed up: inspect `git status` in both repositories and create a safe rollback point before editing. Do not discard, reset or overwrite user changes.

## The approved technical decision

**New designs must state the coordinate reference explicitly for every face/surface. Existing unlabeled designs are legacy and never receive a guessed reference.**

The source audit proves three supported geometries are relevant:
- **PRINT_AREA_LOCAL:** Fabric element positions are measured from the origin of the printable region (old print-area canvas).
- **FULL_MOCKUP_NATIVE:** Fabric positions are measured from the native top-left of the product mockup (current typical editor).
- **STANDALONE_SURFACE:** Fabric positions are measured from a separately defined design surface, e.g. the 1840 × 760 mug wrap.

The names are suggestions; choose one consistent typed enum after examining actual code. Do not confuse design coordinates with CSS viewport transforms or physical print dimensions. Keep existing pixels for editor coordinates and centimeters for production measurements; *do not* globally convert saved Fabric JSON into millimeters.

The referenced proof demonstrates that the **same Fabric JSON** with an element at `(140,160)` produces different correct output coordinates: `(140,160)` for PRINT_AREA_LOCAL and `(40,40)` for FULL_MOCKUP_NATIVE with a print-area offset `(100,120)`. The old `snapshotVersion: 1` and `editorVersion: 1` are not reliable coordinate indicators. Git commit dates or checkout dates are not sufficient either.

## Scope A — Contract and writers/readers

1. Audit the actual store/admin TypeScript definitions and the writers/readers for `customization_config`, `production_snapshot`, `canvas_json`, `printAreas`, multi-colour `faces`, `checkoutArt.ts`, `checkout.ts`, and `ProductionFileGenerator.tsx`. Reuse the existing contracts where possible rather than creating competing contracts.
2. Introduce an **explicit, versioned, per-face metadata contract** that includes:
   - coordinate-space enum and originating surface/face ID;
   - native/editor basis width and height in pixels;
   - printable rectangle/placement and calibration/reference surface, with stable identifiers;
   - physical output width and height (cm), target DPI and print method;
   - whether mirroring/flip is required and its semantics;
   - reference to the *exact* template/configuration version at design/checkout time.
   Validate positive dimensions and relative placement geometry. Represent multiple print placements without silently merging them into one print area. Store mockup preview references separately from print-only elements.
3. Have the **active editor writer** emit metadata from its actual current geometry mode for newly saved faces. For the known current editor mode, record FULL_MOCKUP_NATIVE when appropriate; record STANDALONE_SURFACE for the independent panoramic mug surface. Do not tag old, already saved faces with the current mode merely because they are loaded and resaved. Explicit conversion requires a proven, reviewed source and preservation of visual appearance.
4. Validate and freeze this metadata in the **server-side order-item snapshot** using existing 03B trust rules. Never accept arbitrary client metadata as authoritative without comparing it with the product/configuration and active editor path. The saved order item must remain immutable. Keep per-colour/variant art and prices aligned with each line item.
5. Preserve old document fields, existing `originalAssetId`/`src` fallbacks, and the existing per-item `is_immutable_snapshot` behavior. Do not run automatic data migration or rewrite old snapshots. For an old/unlabeled face without independent reliable evidence, use `NEEDS_REVIEW` and block generation or release. Historical designs may still be previewed/read where possible.
6. Where separately verifiable reference evidence exists for a historical order, design a **separate immutable review/override record** keyed to the order-item/art fingerprint, the face, reviewer, approval evidence and time. Do not silently overwrite original snapshots. Implement only the minimal safe hook and tests for this, not a mass remediation workflow.

## Scope B — Fail-closed production integrity (safe, independently testable)

7. Remove the `1200 × 1200` fallback that makes a failed required image fetch pass `checkDesignQuality`; a required missing or unreadable asset must lead to `NOT_READY` (or an equivalent blocking status), including in nested Fabric objects where supported. Distinguish optional preview assets from required printable assets. Unsupported or missing critical fonts must fail safely rather than silently substituting production text.
8. Fix `production-zip.ts` so the manifest describes **files actually included**. If a required source asset or required output is missing, reject the *entire* production package or return a blocking error; never return a successful but incomplete ZIP. Preserve the old successful ZIP format for complete jobs.
9. Ensure `ProductionFileGenerator` cannot mark an ambiguous or incomplete result as `READY`/`COMPLETED`. Surface the reason in the admin. This must respect 03B's server-controlled order permissions; do not reintroduce direct Firestore writes forbidden by the new rules.
10. Correctly read nested `faces[face].printArea` rather than accidentally interpreting the enclosing face object as print-area data. **Do not substitute invented dimensions** to pass output. If geometry is ambiguous, block and report it rather than trying to fix the mapping implicitly.

## Outside scope (must not happen in this task)

- No bulk conversion of old coordinates, no migration of actual customer orders, no rewriting images, no changes to live Firebase/Cloudinary, no deployment or credential rotation.
- No global refactor of the 10k-line Fabric component unless essential to the scoped contract.
- No deployment to production or addition of designer marketplace/group orders/rapid delivery features.
- Do **not** claim visual/physical output correctness until Task 04B. Keep 04B reserved for full placement-crop mapping, visual comparisons of multiple faces, mirrored output, font accuracy, physical sampling (shirt and mug), and printer-specific checks.

## Required test coverage

- Two *identical* saved Fabric JSON documents with different explicit coordinate references have distinct, correctly interpreted output geometry; missing reference produces `NEEDS_REVIEW` (not a silently chosen mode).
- New current-editor face and mug panoramic face save correct explicit metadata; loading an unlabeled legacy design never adds unverified metadata.
- Multi-colour and multi-placement order line items preserve the selected art, reference, template version and price, and production reads the frozen order item rather than current product/design state.
- Required image fetch failure => `NOT_READY`; missing print font => blocking result; optional mockup/preview absent does not invalidate print-only output.
- Missing required asset/PNG => no successful ZIP and no manifest entry pretending a file is present.
- Existing 01/02/03B security, quote/confirm, idempotency, stock concurrency, checkout browser tests, TypeScript and isolated production builds continue passing. Include negative and regression cases.

## Report and stop conditions

Write `PHASE4A_COORDINATE_CONTRACT_AND_PRODUCTION_GATES_REPORT.md` containing:
1. Files changed, and evidence for every current editor geometry mode.
2. The exact final per-face schema and compatibility rules.
3. Tests executed, passing/failing cases, and commands to rerun.
4. What is still `NEEDS_REVIEW` and why.
5. Whether ZIP/quality failures now block production.
6. Residual risks and concrete, bounded Task 04B recommendations.
7. Confirmation that no production data was touched or deployed.

**Stop before implementation if an essential historical interpretation cannot be resolved safely without changing existing orders or inventing metadata.** Deliver the diagnosis/options instead. Once the scoped tests pass, stop and return the report; do not proceed automatically to 04B.
