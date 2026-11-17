# Kendin Tasarla — Task 03B
## Approved business decisions and secure checkout implementation

Date: 2026-11-15
Status: Owner-approved business policy for implementation planning; **LOCAL DEVELOPMENT ONLY — NO LIVE DEPLOYMENT**
Prerequisite: Review `PHASE3_CHECKOUT_PRICING_ORDERS_REPORT.md` and preserve Phase 1 + Phase 2 security fixes.

### Projects (confirm actual accessible paths)
- Store: `D:\kenditasarl`
- Admin: `D:\kenditasarl\kenditasarl-admin`

## 1. Business decisions — approved; do not request these again

1. **Per-line pricing:** Price each purchasable line according to its own product, variant (size/color/SKU), effective printable artwork, activated print areas, applicable assets, and quantity. Never use the *currently selected Canvas color* to price other colors.
2. **Per-line artwork:** Every distinct color/variant/print configuration in the matrix has an explicit saved artwork version/snapshot associated with its cart line and eventual order item. If a face inherits another face/color, resolve inheritance explicitly on the server into the concrete effective printable artwork for that line. A changed original design must not silently mutate previously locked purchased artwork.
3. **Old carts:** Requote each existing cart line on the server. If a price differs, show itemized new price and require explicit acceptance before order confirmation. If legacy face/color/variant cannot be mapped to the intended artwork without ambiguity, preserve the source data, mark the line as requiring user action, and require re-selection/editing. Do not invent a fallback face or silently use active color.
4. **Ready vs blank vs custom:** A ready-printed product has a published all-in unit selling price (excluding shipping) and does not pay print charges again unless an explicitly priced modification is made; blank uses its base price; custom uses base + authorized print/asset/design charges by policy. Future designer licensing is not implemented by fabricating a customer-side license flag.
5. **Money:** Use integer minor units (kuruş) in server calculations. Preserve existing rounding behavior unless carefully documented, tested, and visibly accepted by the user. Do not introduce a new tax/discount policy silently; preserve existing displayed behavior where applicable. Quantity discounts and group bundles are later scoped work, not prerequisites for this security fix.
6. **Delivery:** Calculate shipping from server-validated owned address, cart value, selected method, and trusted shipping settings; do not trust coordinates, fees, or amounts submitted from Zustand/browser. Fast delivery polygon zones are a separate later feature.
7. **Payment:** Current checkout is COD / pending_cod. An order created successfully is NOT a confirmed online payment, no payout/royalty is earned, and no external payment gateway integration is invented in this task.

## 2. Scope — implement safe replacement BEFORE tightening Rules

### A. Establish current compatibility contract
- Inspect actual current code, previous Phase 3 report, Firestore schema, legacy JSON formats, `customization_config`, `production_snapshot`, matrix flows, ready template authorizations and live-client behavior.
- Create versioned validated schemas for normalized cart line, materialized production design per line, server quote, order snapshot, stable SKU, and idempotency record. Prefer focused shared modules/tests over adding more logic to `FabricCanvas.tsx` (~10k lines).
- Preserve legacy key names and read paths where necessary; do not migrate old production data or change Canvas coordinates in this task.
- Document all assumptions explicitly. Treat absent or ambiguous production metadata as `NEEDS_REVIEW` rather than filling in defaults.

### B. Trusted cart and price quotation
- Accept authenticated user intent only (product/variant IDs, quantity, permitted print selections/design reference). Ignore or reject submitted owner IDs, prices, fees, license flags, stock counts, print readiness, and privileged state.
- Server resolves canonical SKU, active product, verified published ready design vs owned custom design, valid print areas/template version, all referenced assets (including nested and double-encoded legacy Fabric JSON), and authorized license/publication state.
- Resolve exact artwork for **each** color/variant line; resolve inheritance deterministically and persist immutable version or exact digest/snapshot for the chosen line. Clarify/write down how images, fonts, and upload ownership are validated.
- Recompute full itemized price server-side using trusted catalog and settings; include base, print areas, paid assets, any currently supported design charges, total and shipping separately.
- Issue a short-lived quote associated with user, cart revisions, design versions, delivery address/method and trusted price-rule versions. Compare again at confirmation. For old cart mismatch, show old vs new price and require explicit acceptance.
- Keep user experience accessible in Turkish/Arabic/English and display meaningful errors requiring re-selection for ambiguous old carts.

### C. Idempotent server checkout and inventory
- New server checkout must authenticate Firebase ID token and resolve owner from token. No trusted `user_id` from request.
- A client-generated idempotency key must be bound to current user and logical checkout intent. Retries return **same** order/result; conflicting reuse is rejected.
- Aggregate quantities of duplicate lines for each stable SKU, handle stock shape `sizes[size]` and `size/stock` safely, and read relevant stocks before transactional writes.
- Transaction should atomically validate quote/revisions and available stock, decrement each SKU once by aggregate quantity, create order plus **each distinct item and its immutable production snapshot**, and record idempotency + counter movement. Clean only the checked-out cart revision (or a correctly isolated checked-out set) atomically or with an explicitly proven safe alternative. Never double-reserve or double-decrement on retry.
- Limit order size within Firestore transaction/batch capacity. If a reliable single transaction cannot be achieved without changing architecture, STOP with a concrete safe design instead of a partial insecure path.
- The invoice/order price and currency must come entirely from server quote; separate COD pending status from payment confirmed; do not produce payout entries in this phase.

### D. Admin and Firestore authorization migration
- Before disabling old direct writes, create and test trusted admin APIs for stock changes/variant edits and order operational status changes. Preserve existing UI behavior via updated calls and stable SKU IDs.
- Avoid admin's stale product edit overwriting live stock; use revision/compare-and-set or explicit stock delta and conflict message. Do not silently delete/recreate variants with different IDs.
- Review ALL overlapping Firestore rules patterns: cart, orders, nested items, order counters, products and variants, design owner fields, templates and upload identities. A broad recursive allow can undermine a narrow deny.
- Only after new server and client paths have passing tests, tighten Rules to enforce ownership and block client writes to financial totals, orders, counters, inventory, snapshot data and admin-only assets. For order item reads ensure ownership of parent order. Preserve approved admin operations through authenticated server routes.
- Legacy orders remain readable with correct auth while immutable financial/production fields may not be changed client-side.

### E. Verification (minimum acceptance gates)
- Emulator: anonymous/guest (including Phase 2 isolated upload identity), customer A, customer B, authorized admin; cross-user access denied for cart/order/item/design/address; manipulation of owner, price, stock, paid assets, template status and snapshots denied.
- Price parity: 200 TRY front-only red + 235 TRY front+back blue must be 435 TRY before shipping. Change active Canvas color: totals unchanged. Printed content for each line matches version priced.
- Ready product incurs no extra existing-print fee. Blank and customized lines price separately; a paid sticker price is read from trusted catalog, not Fabric `assetPrice`.
- Legacy designs: nested/double-serialized JSON, face inheritance, old `production_snapshot`, missing/ambiguous variant -> safe handling without mutation.
- Inventory: two simultaneous checkouts for last unit; duplicate SKU in multiple lines; stock shapes `sizes[size]` and `size/stock`; concurrent admin stock update; incomplete response after commit and retry. Exactly one order and one stock reduction for idempotent retry.
- Quote: changing address, quantity, artwork, pricing settings or stock between quote and commit triggers safe refresh/reject; explicit user acceptance on price increase or decrease.
- Notification: no duplicate order messages, no claim of online payment, no designer royalty for COD pending.
- Existing Phase 1 tests (8/8) and Phase 2 tests (7/7) must remain passing. Run typecheck in both apps, `next build` where safe, plus browser end-to-end test with mock data when possible.

## 3. Execution sequence and stop conditions

1. Create plan/impact matrix from actual source with paths and risks. Verify current branches and uncommitted work; do not discard Phase 1/2 changes.
2. Implement local server quotation and per-line art/version contract with tests. Demonstrate red/blue example.
3. Implement authenticated, idempotent checkout and synchronized inventory/admin transitions with tests.
4. Update relevant UI consumers and tight Firestore rules **together**; perform full emulator and browser tests. Do not deploy.
5. Deliver `PHASE3B_SECURE_CHECKOUT_IMPLEMENTATION_REPORT.md` detailing changed files, behavior, exact commands, tests passed/failed, known blockers, environment needs, and coordinated staging/production rollout + rollback plan. Avoid secrets and customer data.

**Stop and report before any dangerous action:** destructive migration; missing reliable SKU mapping; production-only credential requirement; irreversible data cleanup; live database access; production deployment; secret rotation; unexpected ambiguity changing contract/pricing beyond decisions above. Do not silently change policies. Never change existing paid order data, Canvas coordinate mapping, or production renderer in this task unless required for an isolated compatibility fix with clear evidence and tests.

## 4. Safety reminder

Phase 1 admin-membership rules and Phase 2 Cloudinary upload fixes are still local until an explicitly approved coordinated production rollout. Exposed Cloudinary credentials found in Git history must be rotated through a separate controlled owner-led process; do not treat this implementation as addressing live exposure.
