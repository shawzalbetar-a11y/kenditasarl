# Kendin Tasarla — Task 03: Checkout, Pricing, Orders and Inventory Security

Version: 1.0 — 2026-11-15

## Context

Existing projects reported by Phase 0 audit:
- Store: `D:\kenditasarl`
- Admin: `D:\kenditasarl\kenditasarl-admin`

Task 01 (admin membership) and Task 02 (Cloudinary/security) have been implemented **locally**; do not presume deployed Firebase rules, credentials, or production environment match local code. Preserve both tasks' changes.

## Objective

Make order creation, cart ownership, server pricing, and stock reservation safe against untrusted clients, without breaking current legitimate flows or modifying existing order history.

## Hard constraints

1. Work locally with a branch for each affected repository. Do not deploy to Firebase, production, Cloudinary, or live payment providers.
2. Do not rotate, print, commit, or copy any secrets; do not display PII from real orders. Use Emulator and synthetic fixtures.
3. Do not simply deny writes to orders/cart/stock until a working authorized server path (with tests) replaces the client pathway. Explain the rollout dependency.
4. Do not change Canvas coordinates, print templates, production renderer, or user design JSON formats in this task, except a narrowly necessary compatibility adapter that is documented.
5. Keep compatibility with existing Firestore data, `orders/{orderId}/items`, legacy cart and product variants, and immutable `production_snapshot` fields.
6. Do not upgrade Next.js, Fabric, Firebase, or alter Cloudinary configurations as part of this task.
7. Prioritize protections that can be tested against a local backend and deployed safely with a client/server/rules release sequence.

## Step A — Read-only audit and architecture decision

- Inventory all paths that read or write `cart_items`, `orders`, `orders/{id}/items`, `counters/orders`, product variants/stock, `designs`, `settings/pricing` and shipping quote or checkout values.
- Identify guest/anonymous and authenticated cart flows, checkout routes, API routes, and any external payment callbacks.
- Compare `FabricCanvas` client-side calculations, `/api/cart/add` and checkout rules; document price inconsistencies and stringified `canvas_json` handling.
- Identify whether actual payment is integrated and which order states can be considered paid. Do not infer payment from a client-controlled boolean.
- Outline the minimal safe server-based order creation architecture before changing code.

## Step B — Server-side trust boundary

- Authenticate Firebase ID token server-side and verify ownership of cart, design, address and any related resources.
- Produce a canonical server-side price quote from trusted product/variant prices, active print pricing rules, allowed paid assets, quantities, legitimate discounts, shipping rules and any approved taxes. Ignore client-submitted totals, commission, and fees except as hints for UI display.
- Return quote lines with itemized price, rule versions and a short-lived quote identifier/expiry when needed. Store amounts in integer minor units.
- Validate print area and design constraints and presence/version of necessary production snapshot for personalized orders.
- Ensure stock is checked and reserved/deducted with aggregated quantity per SKU (same variant in multiple cart entries), under a transaction or equally safe concurrency mechanism. Prevent negative inventory.
- Implement idempotency for repeated checkout submissions and retried webhooks. Avoid duplicate order numbers, duplicate charges, duplicate inventory movements, and duplicate royalties.
- Where a payment provider is involved, do not assume a Firestore transaction spans provider and database. Use explicit pending/payment-confirmed state machine, verified provider webhook and idempotent reconciliation.
- For unintegrated payments, use emulator/test checkout states only. Do not claim genuine payment confirmation.

## Step C — Firestore rules, staged compatibility

- Use deny-by-default for unauthorized access to orders and items; enforce customer ownership on reads and prohibit client modification of trusted order snapshots, price totals and statuses.
- For cart documents, enforce ownership for authenticated/anonymous Firebase sessions, document shape constraints and minimal permissions; never make another user's cart readable/writable.
- Restrict counters, inventory and finance movements to trusted server operations.
- Maintain approved admin read behavior while disallowing unauthorized role escalation.
- Add a transition/rollout plan for deployed legacy clients. Never ship restrictive rules first if they break the current checkout; plan versioned cutover with ready server endpoints.

## Step D — Tests

Use local Firebase Auth and Firestore Emulator plus service route tests where applicable:
- Anonymous/unrelated user cannot read or edit another customer's cart/order or items.
- Client cannot forge price, discount, paid status, owner, design license, order number, stock or immutable snapshot.
- Cross-user design and address references rejected.
- Two cart lines for same SKU are aggregated before checking stock.
- Concurrent checkout for last available stock allows at most the permitted amount.
- Checkout retry with same idempotency key does not duplicate order, stock adjustment, payment effect, or royalty.
- Missing production snapshot/invalid print area rejects custom item without deleting original data.
- Legacy read compatibility and legitimate ready-made/blank/custom flows are preserved.
- Failed payment does not release an order as paid or create a payable royalty.
- TypeScript checks in both apps; build if safely feasible; report skipped tests honestly.

## Deliverables

1. Code changes and migration/compatibility adapters where necessary.
2. Rule and integration tests using synthetic fixtures.
3. `docs/security/PHASE3_CHECKOUT_PRICING_ORDERS_REPORT.md` describing inspected paths, threat model, changed files, test outcomes, unresolved risks and release dependencies.
4. A production deployment runbook covering Firebase rules + both clients + server endpoints in proper order, staging checks and rollback; **no production deploy**.
5. A concise list of user/admin actions needed before deployment, without exposing secrets.

Stop and report if the current payment flow or data model is too ambiguous to implement safely. In that case, complete the audit and proposed migration plan rather than inventing business logic.
