# Kendin Tasarla — Task 06B-R: Map Editor, Address Trust & Release Gate

**Date:** 2026-11-15  
**Execution environment:** Antigravity / Windows / local only  
**Store:** `D:\kenditasarl`  
**Admin:** `D:\kenditasarl\kenditasarl-admin`  
**Goal:** Close the remaining implementation, security, and recovery gaps in Phase 06B without starting Phase 07 or deploying anything live.

## Baseline and mandatory reading

Read `AGENTS.md` and the reports below before modifying code:

- `PHASE6B_EXPRESS_DELIVERY_ZONES_IMPLEMENTATION_REPORT.md`
- `PHASE6B_SHIPPING_ZONE_DATA_CONTRACT.md`
- `PHASE6B_RELEASE_AND_ROLLBACK_PLAN.md`
- `PHASE6A_R2_AUTH_TRUST_BOUNDARY_REPORT.md`
- `PHASE5B_FINAL_REVIEW_AND_HANDOFF.md`
- `PHASE4B_PRINT_GEOMETRY_VALIDATION_REPORT.md`

Inspect the actual source. Reports are claims, not proof of source behavior. Identify the current branches and both `git status` outputs. Do not discard any tracked or untracked work.

## Workstream A — Preserve and verify recovery

1. Create a NEW timestamped local restore point outside the repositories; include tracked modifications, all relevant untracked source/tests/reports, the git index, HEAD references, and an inventory. Do not include `.env*`, secrets, `node_modules`, temporary build caches, or customer data. Verify extraction and hashes.
2. Keep a clear distinction between the **pre-06B** checkpoint and a **post-06B-R** checkpoint. The pre-06B archive alone cannot restore newly implemented 06B.
3. The current rollback plan proposes `Expand-Archive ... -DestinationPath 'D:\kenditasarl' -Force`. Replace this unsafe in-place overwrite instruction with a recovery into a NEW directory, comparison against the current working tree, and selective, reviewed recovery. Never overwrite the working project automatically.
4. Document any possible gaps in restoration (ignored files, git history, encryption user binding) and recommend reviewed commits or protected branches. No `git reset`, `git clean`, blind checkout, or unrequested pushes.

## Workstream B — Admin map usability / actual geographic placement

1. Verify what `/(admin)/settings/shipping-zones` truly provides. The 06B report describes an SVG visualizer, coordinate table, and raw GeoJSON editor; do **not** present these as a full geographic map-drawing editor without evidence.
2. If the actual geographic basemap and draw/edit polygon controls are absent, implement a usable **interactive geographic map editor** in the existing admin page. It must support geographically grounded map tiles and polygon vertex placement, drag/edit, undo, remove vertex, closure, preview of holes if supported, and clear validation errors. Reuse suitable already-installed libraries; avoid introducing paid services/keys without asking for authorization. If online map tiles cannot be used in local tests, provide an offline mocked map adapter with real geometry tests and clearly document the limitation.
3. Keep the longitude/latitude convention GeoJSON `[longitude, latitude]`, verify correct initial geographic framing, and provide explicit safeguards against swapped coordinates.
4. Existing raw GeoJSON and numeric coordinate editing must remain available as advanced fallback; do not silently alter a saved polygon when switching editors. Support Turkish, Arabic and English terminology and keyboard/mobile accessibility where feasible.
5. Do not seed Kadıköy, Beşiktaş, or any other real operating zone automatically. Use synthetic polygons in tests; real operational regions and fees require the owner's explicit configuration.

## Workstream C — Trusted address eligibility and geometry

1. Trace address creation/editing, `location_source`, `lat/lng`, `pin_verified`, `google_places`, `admin_verified`, `/api/checkout/calculate-delivery`, `/api/checkout/quote`, and `/api/checkout/confirm` end to end.
2. A browser-controlled `location_source` flag or latitude/longitude cannot authorize express delivery on its own. Verify that a **server-controlled verification record** is issued or validated and bound to the address owner, persisted coordinates, and relevant address version. If no such proof exists, block express (`ADDRESS_VERIFICATION_REQUIRED`) until a trusted verification flow exists; keep normal delivery available. Do not claim a customer-set pin proves the physical address.
3. Ensure `verifyIdToken(token, true)` and token-derived `uid` are used for private address and checkout operations. Reject cross-user address references and unauthenticated writes; validate address version and shipping policy revision at confirmation.
4. Test polygons with holes, holes outside outer rings, holes intersecting each other/outer rings, duplicate or near-collinear segments, self-touching rings, boundary points, overlapping active zones including containment, large/invalid numeric values, GeoJSON closure and swapped lat/lng. Reject ambiguous policies on publish. Document the chosen deterministic boundary rule.
5. Test service windows in `Europe/Istanbul`: weekday boundaries, overnight windows spanning two days, week transitions, no available service, and server-controlled time. Do not use browser-provided time to claim eligibility.
6. Verify quote fingerprints: pricing and zone changes must not silently affect confirmed orders. Evaluate whether a change in express policy unnecessarily invalidates **standard-shipping-only** quotes; if so, fix without weakening express revalidation. `05B` remains Shadow Mode.
7. Add concurrency and duplicate confirm tests including updated address, changed zone revision, insufficient stock, and replay of the idempotency key. No double order or double stock reduction.

## Workstream D — Publication, permissions and rollback

1. Check actual Firestore rules for pointer, revisions, drafts and audits; active revision documents must be immutable through client SDK and the authenticated admin publishing API. Confirm admin role via `admins/{uid}`, never profile role claims.
2. Reconcile release order with the existing 03B server-cutover policy. **Do not deploy stricter Firestore rules alone before compatible Store and Admin servers/clients are available.** Propose a coordinated staging-to-production plan, including old-client handling and rollback that never reopens insecure writes.
3. Correct claims of guaranteed `0 seconds` rollback downtime; report conditions and observable verification instead of invented guarantees.
4. Specify how to disable express safely (via authenticated admin operation and revisioning), without breaking standard delivery or modifying confirmed shipping snapshots.
5. Explicitly retain live launch blockers: exposed Cloudinary credentials and rotation, deployed rules verification, authorized admin identities, real shipping-provider/address checks, physical tee/mug production signoff, and actual storefront/browser validation. Never invoke any live service or deploy command in this task.

## Required verification

Execute and record exact commands and exit codes, on isolated demo emulators and test HTTP routes:

- New attack/authorization test cases for forged address verification flags, address owner/coordinate mismatch, outside polygon and holes, polygon geometry validity, malicious zones, and stale shipping revisions.
- Store cart -> checkout delivery selection -> express quote -> confirm -> order immutable shipping snapshot in a browser; a second scenario with no express availability and safe standard shipping.
- Admin browser test creating/editing a polygon **on a geographic map**, saving draft, validating, publishing a revision, and handling `409` concurrent edits.
- Re-run `test:zones`, `test:r2`, `test:gate`, `test:matching`, `test:pricing`, `test:checkout`, `test:template`, `test:cloudinary`, `test` (admin rules), production `phase4a`, `phase4-compatibility`, `phase4b`, representative browser E2E, TypeScript and both Next.js builds. Do not count suites you did not execute.
- Review all differences in source contracts between Store and Admin, plus Arabic/Turkish/English dictionary parity.

If a test cannot be run because of a missing actual map provider, hardware, or external service, explicitly mark **NOT TESTED**, not PASS. Do not fabricate visual evidence.

## Deliverables

1. `PHASE6B_R_MAP_TRUST_RELEASE_GATE_REPORT.md` — findings, exact edits, vulnerabilities demonstrated/fixed, test matrix with commands and evidence, and CLEAR `LOCAL GO/BLOCKED` / `LIVE BLOCKED` decisions.
2. `PHASE6B_SAFE_RELEASE_AND_RECOVERY_PLAN_v2.md` — corrected deploy and non-destructive rollback strategy; no actual deployment.
3. `PHASE6B_ADMIN_MAP_ACCEPTANCE.md` — screenshots/test fixtures and instructions for manually inspecting a real basemap, vertices, holes, overlapping zones, service hours, and address flow.
4. Update the original 06B release plan only if it can be done non-destructively, with a documented diff; otherwise leave it intact and issue the new v2 document.

## Explicit stop conditions

- Preserve Phases 01–06B, immutable order data, and published template revisions.
- No live Firebase, Cloudinary, hosting, or payment operations; no customer records; no seeded real Istanbul delivery zones or prices.
- Do not activate 05B pricing; do not begin Phase 07.
- If a required address trust guarantee cannot be implemented safely, report `BLOCKED` with a concrete remediation design instead of presenting incomplete express delivery as production-ready.
- Stop after the three deliverables and request owner approval before any further phase.
