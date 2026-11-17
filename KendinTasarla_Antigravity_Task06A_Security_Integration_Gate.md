# Kendin Tasarla — Task 06A-R: Security & Integration Gate Before Phase 06B

**Status:** Local review and targeted hardening only. **Do not start Phase 06B or 07.**

## Existing projects (verify before editing)

- Store: `D:\kenditasarl`
- Admin: `D:\kenditasarl\kenditasarl-admin`
- Current branch, per Phase 06A report: `codex/task04-print-production` in both repositories.
- Read `AGENTS.md`, the existing phase reports, and in particular:
  - `PHASE1_ADMIN_RULES_REPORT.md`
  - `PHASE3B_SECURE_CHECKOUT_IMPLEMENTATION_REPORT.md`
  - `PHASE4A_COORDINATE_CONTRACT_AND_PRODUCTION_GATES_REPORT.md`
  - `PHASE4B_PRINT_GEOMETRY_VALIDATION_REPORT.md`
  - `PHASE5A_PRINT_TEMPLATE_BUILDER_IMPLEMENTATION_REPORT.md`
  - `PHASE5B_FINAL_REVIEW_AND_HANDOFF.md`
  - `PHASE6A_MATCHING_COLLECTIONS_DATA_CONTRACT.md`
  - `PHASE6A_MATCHING_COLLECTIONS_IMPLEMENTATION_REPORT.md`
  - `PHASE6A_GIT_STATUS_AND_RECOVERY.md`

## Goal

Verify and, where required, fix regressions introduced by the Matching Collections feature without altering historical orders, Canvas coordinate contracts, checkout calculations, or production files. Do not assume the phase report proves the code. Inspect actual files, effective Firestore rule matches, and real API handlers.

## Gate A — Canonical admin authorization (critical)

1. Search BOTH apps and all related API endpoints, Firestore rules and helper functions for references to `admins/{uid}`, `user_roles/{uid}`, `isAdmin`, `isStoreAdmin`, custom claims, hardcoded administrator emails and profile roles.
2. Previous Phase 01 standardized admin eligibility on `admins/{uid}` with role `admin` or `superadmin`. Phase 06A report instead says the new admin endpoint reads `user_roles/{uid}.role == 'admin'`. Determine whether this is a **report-only error** or an **actual implementation mismatch**. Show file paths and relevant line numbers without exposing secrets.
3. Maintain one canonical, server-verified membership decision, and align admin login, templates API and rules. Never restore browser self-provisioning or public writes to admin membership.
4. Emulator tests: anonymous, ordinary user, owner, authorized `admin`, authorized `superadmin`, stale/invalid role, and user who only edits profile/custom claims. Ensure direct client requests and HTTP routes are tested independently.

## Gate B — Firestore rules and authorization

1. Inspect all overlapping `match` blocks in `firestore.rules`, especially rules for `matching_collection_templates`, `master_designs`, `matching_bundle_drafts`, and nested `items`. Remember that a permissive overlapping rule can override a restrictive one.
2. Phase 06A data contract currently shows `allow read: if true` for curated templates, even though `isActive` controls public visibility. Confirm whether inactive/unpublished templates are accessible directly through the Firestore Client SDK. If so, restrict public reads to published/active templates, while preserving authorized administration and the existing public API contract.
3. Determine whether client-side writes to master designs, bundle drafts, and nested items can bypass API validation, author/integrity checks or quotas. Fix safely: prefer server-only writes if all current clients use authenticated APIs; otherwise enforce critical ownership/field immutability in rules and perform complete server revalidation before any cart conversion.
4. On update, prevent changing `userId`, bundle ownership, template provenance, IDs, trust markers, or other privileged fields. Verify nested items cannot be created under nonexistent/foreign parents. Never trust `revisionHash`, asset license, paid/free status, template revision, `targetPlacement` or price solely because the browser supplied it.
5. Test direct Firestore SDK access, not only server API responses. Cover cross-user access, arbitrary owner fields, inactive templates, malformed shapes, extremely large arrays, forged assets, and concurrent writes.

## Gate C — Bundle-to-cart correctness

1. Inspect `/api/matching-bundles/[id]/add-to-cart/route.ts` and integration with 03B server cart/quote/confirm. Ensure server authentication, ownership, pinned master revision, current published target template, SKU/color/size/stock validation, image ownership and paid-asset licenses.
2. Confirm each item is adapted to the **server-approved** face and print placement. Use Fabric-accurate bounds for rotated, grouped, scaled and flipped objects; check the actual rendered bounds rather than assuming simple `left + width` always describes a transform.
3. Verify retry behavior: two identical concurrent add-to-cart requests must not silently duplicate bundle items. Implement/use a user-scoped idempotency key and atomic conversion, preserving valid existing cart items. Do not assume existing checkout idempotency also covers this earlier stage.
4. Confirm provenance (`bundle_id`, `bundle_item_id`, `master_revision_hash`, `instance_revision_id`) is derived and verified on the server, not trusted from arbitrary client payloads. Confirm changing the master design after conversion cannot change confirmed order line snapshots.
5. Keep 03B pricing **authoritative**; 05B remains **Shadow Mode**, including quote fingerprint isolation. Do not enable new bulk discounts in live prices.
6. Confirm that production generates one correct print package per independent order line and that historical and custom products still work.

## Gate D — Realistic end-to-end and regression evidence

Run the relevant existing suites plus targeted new tests. At minimum:

- 06A 10 acceptance cases; 05B pricing; 05A template revisions; 03B checkout and browser flow; Phase 01 admin memberships; Phase 02 Cloudinary; 04A/04B production and ZIP tests.
- Real browser (local emulator): publish a curated collection as admin; create a 3-member family design as a user; edit one member; save draft; add to cart; inspect individual prices; confirm COD; open order in admin; export print-ready PNG and ZIP for each line. Record any parts of this flow that cannot be automated and why.
- Negative tests: two different users, attempts to open inactive curated templates, forged admin role, altered master revision/asset license, malformed/rotated/grouped Fabric objects, stale template, duplicate add-to-cart, competing requests, and missing printing assets.
- TypeScript checks and isolated production builds for BOTH apps; verify TR/AR/EN key parity. Preserve all prior passed behavior. Clearly distinguish emulator/unit tests, browser tests, and physical print testing (NOT performed).

## Gate E — Git safety and deployment boundaries

1. Start with `git status --short`, current branch, HEAD and working-tree inventory in BOTH repositories. Phase 06A reports extensive uncommitted work; **do not** label the worktree clean if it is not.
2. Create and verify a recoverable local snapshot of the full relevant **tracked and untracked project changes** (excluding secrets, `.env*`, and customer files) BEFORE edits; document restore instructions and checksum. Avoid overwriting prior DPAPI archives or changing Git history.
3. No `git reset`, `git clean`, destructive checkout, broad formatter, force push, secret logging, live database changes, Cloudinary changes, deploy, payment transactions, or physical print approval.
4. Do not stage/commit unrelated files or push automatically. Provide a proposed grouping of reviewed commits as a separate handoff. Maintain previous code and data contracts.

## Required deliverable

Create **`PHASE6A_SECURITY_INTEGRATION_GATE_REPORT.md`** including:

- Critical issues found and whether each was real, report-only or unverified;
- Exact code references and concise diffs for any repairs;
- Authorization matrix for `admins`, `user_roles`, templates, master designs, draft items, and HTTP APIs;
- Test names, commands, pass/fail counts, including browser and actual PNG/ZIP tests;
- Changes made to Git, recovery path and checksum, remaining uncommitted inventory;
- Explicit launch blockers: Cloudinary credential rotation, deployed rules verification, physical print approval, and immutable source-asset content, if still outstanding;
- Final verdict: **PASS/FAIL for beginning local Phase 06B** versus **NOT READY for live deployment**.

**Stop immediately and report rather than weakening security or inventing historical data when a required proof cannot be established.** Do not start Phase 06B automatically.
