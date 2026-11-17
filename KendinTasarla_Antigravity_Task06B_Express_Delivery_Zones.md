# Kendin Tasarla — Antigravity Task 06B
## Express Delivery Zones, Map Editor & Secure Checkout Shipping

**Execution type:** Implement only Phase 06B locally; no live deployment.
**Store:** `D:\kenditasarl`
**Admin:** `D:\kenditasarl\kenditasarl-admin`
**Reference gate:** `PHASE6A_R2_AUTH_TRUST_BOUNDARY_REPORT.md` (local gate passed, production blocked).
**Business locale:** Türkiye; Turkish primary, Arabic and English supported.

> This is an implementation task for the **existing** applications, not permission to create another project, overwrite historical data, or deploy. Inspect real code before applying any example schema below. Keep 05B in Shadow Mode and 03B as the authoritative pricing and checkout path.

## 0. Safety and inventory before editing

1. Read `AGENTS.md`, reports for 03B, 05A, 05B, 06A, 06A-R, and 06A-R2, and the latest `firestore.rules`. Verify both Windows paths, branches, HEAD, dirty tracked files, **untracked files**, dependencies, and existing tests. Do not assume descriptions in prior reports perfectly match current code.
2. Create a **verified, restorable, non-destructive checkpoint** covering both repositories' tracked changes, new/untracked project files, and relevant commit identifiers. Exclude `.env*`, credentials, `node_modules`, `.next`, customer data, private tokens, and other secrets. Keep the checkpoint outside tracked source. Record its SHA-256 and instructions to restore to a *separate directory*. A `git diff` alone does **not** back up untracked files.
3. No `git reset`, `git clean`, force-checkout, unapproved destructive migrations, production reads/writes, outbound notifications, external billing calls, or secret printing. Do not commit exposed secrets. If a safe checkpoint cannot be created, stop with a concrete blocker.
4. Examine existing `delivery_zones`, `settings/pricing`, shipping/admin UX, `DeliveryMethodModal.tsx`, `/api/checkout/calculate-delivery`, `src/lib/server/checkout.ts`, `shippingDistance.ts`, cart/checkout/addresses, and any map components/providers. Prefer incremental integration, not parallel competing shipping engines.

## 1. Goal and business flow

Build an admin-configurable **express-delivery geography** for Istanbul and other configured service areas:

- Admin can visually draw/edit **polygon boundaries** on a map, name zones in TR/AR/EN, define a fixed fee in integer Turkish kuruş, enable/disable a zone, choose express service hours and optional minimum basket conditions, save draft and publish a version.
- Customer selects a **saved address they own** during checkout. The backend computes express availability using a trusted address/location record, the **published** zone policy, and authoritative cart subtotal; if eligible, display `Express delivery`, its fee, and any configurable ETA description. If not eligible, explain why and allow ordinary delivery where available.
- A quote/confirmation cannot trust client-supplied `zoneId`, price, point-in-zone result, distance, priority, or ETA. Server chooses the zone and amount; Checkout 03B retains final authority and consent on shipping changes.
- This phase covers shipping **eligibility and pricing**, not a dispatch fleet, guaranteed travel times, courier tracking, route optimization, or payment integrations.

## 2. Data contracts and Firestore versioning

First audit and reuse the existing shipping data model. Propose and document a normalized `ExpressZonePolicyV1` / published revision, or an equivalent compatible extension. Minimum fields:

- `schemaVersion`, policy revision/hash, `status` (`draft` / `published`), `createdAt`, `updatedAt`, actor ID, and audit event metadata. Preserve old `delivery_zones` documents for reads and rollout fallback; **no automatic migration of live collections**.
- For each zone: stable immutable ID, `title: {tr,ar,en}`, `description` optional, enabled flag, `geometry` as validated GeoJSON Polygon (lon,lat pairs with closed ring) or the exact chosen equivalent, priority/overlap policy, `feeMinor` nonnegative integer TRY kuruş, optional `minimumSubtotalMinor`, timezone `Europe/Istanbul`, explicit availability days/windows and optional descriptive ETA (not a promise), and operational caps.
- Maintain draft, immutable published revisions, pointer to one active revision, and a restricted audit trail (adapt the 05A/05B draft-and-publish model if appropriate). Never overwrite a published revision; publishing must atomically validate/update the active pointer and detect concurrent admin changes (HTTP 409).
- Version and cache semantics: any new quote uses the current published shipping revision. A confirmed order stores a **shipping snapshot**: method, zone ID/name, policy revision, feeMinor, customer address ID and trustworthy location proof/source, calculated time, relevant express conditions. Old orders remain unchanged.
- Firestore rules: ordinary clients cannot edit zones, draft policies, revision pointers, audit entries, or pricing. Public reads must reveal only intentionally public **active** data, not draft/inactive private policy; consider server-only access for complete geometry. Admin writes use verified server routes and canonical `admins/{uid}` (`admin`/`superadmin`). Check other broader matching rules for unintended access.

## 3. Geometry and map editor

Admin UX must make location management easy without requiring the operator to type coordinates:

1. Show a usable interactive map (existing stack/provider preferred; otherwise select a maintained compatible library and document attribution/license/hosting constraints), default viewport Istanbul, with zone list and drawn boundaries. Support adding vertices, moving vertices, editing polygon, previewing coverage, deletion, and undo/cancel. Show a meaningful no-map/provider-unavailable state with numeric geometry editing as a fallback; do not falsely claim the map loads if it does not.
2. Validate coordinates and bounds on both client and **server**: longitude/latitude order; valid ranges; ring closure; >=3 unique points; nonzero area; no self-intersection; sane vertex/zone limits; reject malformed geometry and unreasonable global extents. Explicitly define boundary-edge behavior.
3. Handle overlap deterministically: preferably **reject overlapping enabled zones on publish** in v1. If support for overlap is essential, define stable priority and tie rejection instead; never choose a zone by arbitrary Firestore enumeration order.
4. Compute point-in-polygon on the server with a tested geometry routine. The polygon, not simply radius or straight-line distance, must control express eligibility. Avoid uncontrolled external API calls in Firestore transaction retries.
5. Use Istanbul for sample map data and tests, but do **not** invent live service coverage, prices, hours, or courier availability. All sample areas/prices must remain synthetic and unpublished; default active express service to **off** if no approved policy exists.

## 4. Address trust and availability policy

- Re-read the selected address server-side; verify authenticated UID owns it, it is current, and the location source is available and coherent. A front-end map pin or pasted coordinate alone does not prove physical delivery address. Document what location proof is actually available (verified geocode, trusted admin confirmation, explicit customer-pin plus validation, etc.).
- If the available data cannot establish reliable delivery eligibility, return `EXPRESS_REQUIRES_ADDRESS_VERIFICATION` (or equivalent) and do **not** make express available by silently trusting arbitrary client coordinates. Ordinary delivery should remain available according to its existing rules.
- Distinguish `OUTSIDE_ZONE`, `NO_ACTIVE_POLICY`, `OUTSIDE_SERVICE_HOURS`, `MINIMUM_NOT_MET`, `INVALID_ADDRESS`, and `ADDRESS_VERIFICATION_REQUIRED` in UI and API. Show translated customer-friendly explanations.
- Time rules use `Europe/Istanbul` and test opening/closing boundaries, overnight windows if supported, and exact inclusion behavior. If there is no reliable capacity/dispatch feed, do **not** promise an exact arrival time or “courier available now.”
- Client inputs may request `shippingMethod=express` and `addressId` but **never set** express availability or a shipping fee. Do not expose geocoding keys or service credentials in the browser.

## 5. Checkout 03B integration, quote locking and backward compatibility

1. Keep existing ordinary shipping, historical COD orders, quantity/pricing calculations, checkout snapshots, 05B shadow analytics, and order idempotency unchanged except for narrowly necessary integration.
2. Extend server quote computation to derive express eligibility/fee from the **published policy**, approved address, and authoritative basket. Include shipping policy revision, trusted address version/coordinates source, method, zone, and fee in the quote fingerprint. Ensure 05B **shadow pricing revision** still cannot invalidate an otherwise unchanged 03B financial quote.
3. At confirm, revalidate address ownership, published policy version, zone eligibility, service-hours rule, and all financial fields inside the established quote/confirm protection pattern. If changed, return a clear `REFRESH` / consent-required response; never silently upgrade method or charge.
4. Keep idempotency stable across network interruptions: one order, one stock movement, one shipping charge. Persist shipping snapshot without putting private map/provider secrets in customer-readable records.
5. If express becomes unavailable between quote and confirm, fail safely and let the customer explicitly choose another shipping method. **Never silently convert express to ordinary** or proceed with an unapproved price.
6. Preserve historic `delivery_zones`/distance fallback only where appropriate for **ordinary delivery**. Express zone membership must not fall back to approximate distance if the polygon check or trustworthy address fails.
7. Do not refactor or re-enable old client-side order writes. Do not alter print template, Canvas coordinates, production ZIP, ownership/provenance rules or designer licensing.

## 6. Required tests and acceptance evidence

Use Firebase Auth/Firestore Emulator, simulated addresses and mock maps/geocoding as necessary; **no live Firebase, real addresses, or external courier calls**.

**Geometry and publishing**
- A point clearly inside zone A, outside all zones, exactly on the boundary, and near adjacent polygons; verify documented boundary semantics.
- Reject self-crossing, unclosed, wrong coordinate order, huge/invalid polygons, overlapping active zones, duplicate IDs, malicious payloads, and excessive number of vertices.
- Concurrent admin draft updates yield 409; unauthorized admin/customer cannot write; inactive/draft policies do not leak; revision published immutably; audit event created with server actor.

**Shipping security and financial correctness**
- Customer A cannot quote from Customer B's address; spoofed `x-user-id`, body `userId`, zone ID, point, price, method or fee are ignored/rejected, with authorization from verified Bearer JWT.
- Inside-zone verified address and eligible time gives correct TRY minor-unit fee; normal shipping unaffected; missing trusted location, outside zone, off hours, missing policy, and modified address fail closed for express.
- Changed policy, minimum basket, address or delivery method between quote/confirm triggers re-quote and explicit customer consent; no shipment charged without successful order.
- Two checkout retries yield one order, one stock deduction, one shipping charge; concurrent last-stock purchase remains safe. Family bundle of three independently priced products uses one shipping decision for the overall checkout (unless documented existing fulfillment semantics require otherwise).
- Published zone revisions do not alter already-confirmed orders. Historical orders show their original shipping amount/status.

**UI and regression**
- Browser smoke: admin draws/saves/validates/publishes an active sample zone; checkout displays express only for a verified simulated address in polygon, shows its fee, refuses spoofed fee, and completes one COD purchase; outside address still offers ordinary method.
- Verify mobile map/editor usability and TR/AR/EN translation parity. Provide screenshot or brief screen evidence from real app, not invented assets.
- Re-run test suites 01, 02, 03B, 04A/04B PNG/ZIP, 05A, 05B Shadow, 06A, 06A-R and 06A-R2; run TypeScript and full builds in both apps; disclose every missing test and any unresolved mismatch.

## 7. Deliverables

Provide these files in the existing Store repository, plus links/paths in the final message:

1. `PHASE6B_EXPRESS_DELIVERY_ZONES_IMPLEMENTATION_REPORT.md`: exact files changed, API endpoints and roles, business rules and unknowns, schema, test commands/results, screenshot references, outstanding limitations and deployment blockers.
2. `PHASE6B_SHIPPING_ZONE_DATA_CONTRACT.md`: versioned schema, geometry rules, policy and address trust model, precedence, price minor units, failure codes, quote/order snapshot, compatibility and migration plan.
3. `PHASE6B_RELEASE_AND_ROLLBACK_PLAN.md`: staged rollout for Store/Admin/rules, observation, effects on open quotes, safe rollback without reopening unauthorized writes, secrets review, IAM and operational owner checklist.
4. Tested fixtures (e.g., Istanbul-region synthetic polygons), test suite files, and admin/checkout screenshots from the local emulator. Never describe a screenshot or test as completed unless genuinely created/executed.
5. Document actual Git worktree status and verified checkpoint manifest including **untracked** source files. Don't paste secrets or private customer data.

## 8. Stop condition

- Perform **Phase 06B only**, locally. No production deploy; no changing 05B to active pricing; no payment-gateway activation; no courier-dispatch system; no Phase 07 marketplace.
- If the current address records or delivery map cannot prove location trust safely, deliver the validated admin map/editor and **disabled express checkout** with a blocker report rather than opening a spoofable shipping method.
- If a requested feature would require breaking historical snapshots or customer checkout, stop at the smallest safe implementation and report the decision required from the owner.
- Once complete, provide a `LOCAL PASS / BLOCKED` verdict for 06B and separately a `LIVE DEPLOYMENT BLOCKED` status until the owner addresses Cloudinary credential rotation, actual live security rules/staged rollout, physical print proofing and any operational prerequisites.
