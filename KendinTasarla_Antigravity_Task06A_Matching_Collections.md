# Kendin Tasarla — Phase 06A
## Matching Collections, Family Bundles & Shared Design Instances

**Status:** Implementation task for Antigravity — NOT executed by this document  
**Context:** Local review of `PHASE5B_FINAL_REVIEW_AND_HANDOFF.md`, 15 November 2026  
**Store:** `D:\kenditasarl`  
**Admin:** `D:\kenditasarl\kenditasarl-admin`

## 0. Mandatory first checks and recovery

1. Read `AGENTS.md`, the Phase 03B / 04A / 04B / 05A / 05B reports and the actual current files in both repositories. Report any discrepancy between documents and code before making a risky change.
2. Run `git status --short`, `git branch --show-current`, `git rev-parse HEAD` **in each repository**. There are many modified/untracked files from prior phases. Do **not** use `git reset`, `git clean`, destructive checkout, forced rebase, overwrite, or mass formatting.
3. Create a recoverable, verified checkpoint that includes tracked changes and relevant untracked files; **exclude `.env*`, service-account credentials, private tokens, caches, customer files, and other secrets**. Document recovery steps and whether previous encrypted backups depend on the same Windows user. Do not make automatic pushes or commits containing secrets.
4. Confirm a clean local emulator/test setup. No real Firestore writes, Cloudinary operations, payment-provider calls, real notifications, or production deployment.
5. Do not change 05B from `Shadow Mode`. Continue to use **03B prices as authoritative** for customer checkout. No new bundle/volume discount may affect actual charges until separately reviewed and authorized.

If the prerequisite baseline cannot be reconstructed safely, **stop and report** instead of proceeding.

## 1. Objective

Add a reusable **Matching Collection / Family Bundle** feature to the **existing** Kendin Tasarla store and admin, not a new project. A customer can create a shared design and apply it consistently to multiple physical products (e.g. father's men's T-shirt, mother's women's hoodie, child's T-shirt), while choosing different colors, sizes, print areas, positioning, and quantities for each item. Each physical item must become a **separately validated, priced, immutable order line** compatible with the existing 03B Checkout and 04A/04B production renderer.

This task is about multi-product shared customer art, NOT the designer marketplace (Phase 07), royalties, or express delivery zones (Phase 06B).

## 2. Commercial and design rules

- A **master design** is the user's editable logical composition. It is never treated as a printable face in an arbitrary target product merely because it shares a visual preview.
- Each **bundle item / design instance** must point to the master design revision, the target `productId`, the actual variant/SKU/size/color, a published compatible `print_template_revision`, selected face(s)/placement(s), and explicit target-local artwork transforms.
- The instance may reposition or rescale the shared artwork for each product, but must retain the common design identity. Never copy pixel coordinates blindly from one template to a geometrically incompatible template.
- Display a side-by-side or carousel preview of the individual member products with the same design. Editing one item's placement/size must not mutate the other items or the saved master.
- If a template is unavailable, its revision changed, fonts/assets unavailable, print bounds invalid, or coordinates ambiguous, block the affected item and explain why. Do not guess defaults for production.
- Start with ready-to-customize apparel using supported `FULL_MOCKUP_NATIVE` templates; a mug may be supported only via an explicit `STANDALONE_SURFACE` mapping already validated. Support heterogenous items in the data model even if initial UI examples use apparel.
- Offer group role labels (e.g., father, mother, child, partner) as **optional presentation metadata only**; do not infer gender, age, or size from these labels. All product choices are editable.
- Customer can choose quantity per item. Price per physical item/line is authoritative from **03B server quote**; show a breakdown of product, placements, existing paid assets and shipping as calculated by the existing system.
- 05B bundle and quantity discount rules can be simulated/shadowed only. **Do not show a discounted payable amount unless the active authoritative server quote includes it.** Do not invent a new discount path.
- Scope of paid stickers must remain consistent with the currently active engine; do not accidentally charge twice on repeated previews, or silently omit charges. Document any business policy conflict and stop if a price change is required.
- No downloading original artwork owned by designers or unlicensed assets. Phase 07 licensing is out of scope.

## 3. Compatibility contracts and data proposal (verify before implementation)

Do not create duplicate live collections blindly. First inspect current `products`, `products/{id}/variants`, `designs`, `cart_items`, `checkout_art`, `orders/{id}/items`, template revision paths, and existing API contracts.

Propose an additive, versioned schema with at least:

- `matching_collection_templates` (admin-controlled optional curated collection: cover, translations, allowed product families/roles, display status), preferably as draft/revision if publication affects a product contract.
- `matching_bundle_drafts/{bundleId}` (private, owned by an authenticated customer): schema version, title, optional occasion, creation timestamps, current `masterDesignRevisionId`, status and per-item references. Use nested documents for large item arrays where necessary; avoid Firestore 1 MiB document overflow.
- `master_designs/{masterId}` (private reusable source, immutable master revisions or equivalent): vector/text/image layer metadata, asset references, owner, revision/hash. Use protected asset storage for large data, not embedded base64 images in Firestore.
- `matching_bundle_drafts/{bundleId}/items/{itemId}` (or an equivalent existing consistent path): product ID, stable SKU/variant, size, color, qty, published template revision, face/placement IDs, per-item transform/mapping, snapshot status and referenced master revision.
- Existing confirmed `orders/{orderId}/items/{itemId}` remains the **production source of truth**. Add optional bundle provenance (`bundleId`, `bundleItemId`, `masterRevisionId`, `instanceRevisionId`) as metadata only; preserve all 03B snapshot fields and 04A coordinates.

Add `zod`/TypeScript schema versions and a compatibility reader. Keep the current contract between store/admin consistent; avoid a new incompatible unit system. Existing pixel-coordinate + physical-centimeter interpretation remains unchanged.

## 4. Workflow and UI

1. Customer opens a Matching Collection landing page (couples/family/occasion) or chooses 'Create matching set'.
2. Add 2–N members/items (use a configured, safe maximum after inspecting existing 03B limit of 30 lines). Each item selects real product, SKU, size, color, qty, and supported print template.
3. Create or select a **customer-owned master design** using existing Canvas capabilities; preserve original assets and verified ownership. Create a new master revision for meaningful edits.
4. Choose supported placement(s) separately for each item. Generate target-specific design instances, validating the mappings using the current 05A template and 04B coordinate/production contracts.
5. Display previews for every item, show differences/invalidity explicitly, and allow individualized placement changes without modifying the master artwork.
6. Save/resume private draft. On template or inventory changes, revalidate before quote; never silently transplant old coordinates.
7. Add items to cart through authorized server operations, quote each line using 03B, request price-change consent when needed, and confirm via existing idempotent Checkout. Ensure all items originate from the approved art revision and have their own immutable production snapshots.
8. Admin can configure curated collection landing cards, images, titles and supported product families, but may not edit a customer's confirmed order or master artwork in place. Keep admin CRUD authorization server-side.

Keep user-facing copy in **Turkish primary, Arabic and English**; responsive layout for ~390px mobile as well as desktop, with accessible labels and keyboard/touch controls.

## 5. API / security requirements

- Derive customer UID from authenticated Firebase token on the server, never trust client-supplied owner IDs.
- Authorize owner access for reads, writes and asset references; block cross-customer bundle/design/asset access and forged `is_template` or royalty fields.
- Use allowlisted IDs, strict validation, server-side checks for published SKU/template/asset and per-item quantities.
- Keep production snapshots immutable. If edits happen after order confirmation, create a new customer draft/revision, never rewrite an order line or art blob.
- Prevent stale master revisions and stale price quotes from slipping into confirmation. Reuse 03B idempotency and inventory aggregation logic for repeated SKUs across multiple bundle items.
- Keep anonymous/guest-upload identities isolated as already designed in Phase 02/03B; don't merge identity or ownership based only on a string token or a client field.
- No privilege escalation through new admin routes, no public Firestore writes to protected drafts, and no broadening of existing `firestore.rules` to bypass a failing test.
- Store only minimal information in telemetry; do not log customer image data or secret credentials.

## 6. Tests — minimum acceptance matrix

Write new tests and rerun regression suites; use emulator/test-only synthetic data.

1. Father: black men's T-shirt XL, front design; mother: white women's hoodie M, front; child: colored T-shirt S, front. One logical master design, **three distinct** target instances and confirmed order lines with correct variants and quantities.
2. Change one member's size, color and placement: the other two retain their design, SKU and price. Changing the shared master creates a new revision with deterministic propagation to new drafts but does not mutate already-confirmed orders.
3. Two different print-area shapes: refuse invalid automatic mapping; provide explicit repositioning and previews consistent with the corresponding published template.
4. Verify every generated order line has the correct coordinate face, placement membership, original asset references and immutable snapshot. Generate per-item PNG/ZIP through 04B and verify dimensions/manifest/transparent background.
5. Confirm that 03B independently prices the three lines; 05B Shadow Mode never changes payable amount, or invalidates an unchanged quote when the shadow policy is published.
6. Repeat an SKU across members and compete for the last inventory unit: no overselling or duplicate orders. Replay idempotency key after simulated response loss returns one order.
7. Reject forged owner, template revision, upload ownership, paid sticker price, bundle discount, size/variant, and misplaced or missing assets.
8. Old `blank`, `ready`, `custom`, legacy designs and single-item Checkout remain functional. A ready product never receives print charges a second time.
9. Test Turkish/Arabic/English translations, RTL and mobile layout, keyboard and touch interaction, draft re-open, empty states and invalid item errors.
10. Run both TypeScript checks and independent Next.js builds plus Firestore/Auth Emulator, existing Checkout/browser, 05A, 04A/04B print suites. Report exact commands/results; never claim any test passed without running it.

## 7. Strict non-goals

- No live Firebase/Cloudinary calls or production deployment.
- No marketplace designer enrollment, payment splits, payouts, licensing checkout or royalty ledger (Phase 07).
- No express-delivery map polygons (Phase 06B).
- No migration or automatic rewriting of existing designs/orders.
- No Next.js/React/Fabric mass upgrades, replacing current Checkout, rewriting `FabricCanvas.tsx` wholesale, or switching coordinate units.
- No change to existing 05B Shadow Mode or customer-price cutover.
- No automatic printing/claim of physical print readiness without actual workshop proof.

## 8. Stop conditions

Stop **before** modifying pricing semantics if group discounts are required for active checkout. Stop if a mixed-product master design cannot be mapped with explicit geometric evidence, or if existing snapshots would be modified. Stop on unsafe Git state, inadequate authorization, or an undocumented conflict with Phase 04A/04B/05A. Provide the conflicting alternatives and what decision is required; do not guess.

## 9. Deliverables and handoff

Create:

1. `PHASE6A_MATCHING_COLLECTIONS_IMPLEMENTATION_REPORT.md`: architecture decisions, schemas, changed file list, security considerations, sample flows, test commands/results, remaining risks and stop/rollout decision.
2. `PHASE6A_MATCHING_COLLECTIONS_DATA_CONTRACT.md`: schemas, versioning, references, ownership, art-instance coordinate mapping and backwards compatibility.
3. A short table listing old vs new routes/collections and examples of **three independent order lines** derived from a single master design, with synthetic IDs only.
4. A reproducible mobile screenshot and fixture images from synthetic examples where feasible. Never include private customer imagery.
5. `PHASE6A_GIT_STATUS_AND_RECOVERY.md`: branch/HEAD and checkpoint/recovery details for each repository; list uncommitted/untracked changes and blocked decisions.

Stop after Phase 06A reporting. **Do not start Phase 06B, Phase 07 or any production rollout without the owner's separate approval.**
