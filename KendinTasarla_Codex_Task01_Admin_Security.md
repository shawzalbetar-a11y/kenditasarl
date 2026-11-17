# Kendin Tasarla — Codex Task 01

## Objective
Close the **admin self-privilege-escalation risk** in the local Firestore security rules and add repeatable Firebase Emulator tests. This is the first narrowly scoped implementation step after Phase 0. Do **not** deploy anything.

## Repositories discovered by Work
- Store: `D:\kenditasarl`
- Admin: `D:\kenditasarl\kenditasarl-admin`

Verify these paths exist in the Codex workspace. Do not assume the previously mentioned `E:\...` paths are valid.

## Source of truth
- Read the existing local `firestore.rules`, `firebase.json`, relevant admin authorization checks, existing tests/scripts, and admin-management flows before making changes.
- Use the **actual code** as evidence. Phase 0 reported that the `admins` collection allows an authenticated user to create/update their own admin document, while `isAdmin()` trusts existence of such a document. Confirm the finding and identify all code paths dependent on it.
- Phase 0 examined local rules/code, **not** the currently deployed Firebase rules. Never claim that deployed rules were verified.

## Authorized scope
1. In local Firestore rules, prevent unauthenticated users and ordinary authenticated users from creating, editing, or deleting `admins/{uid}` (including their own document).
2. Ensure an admin client cannot arbitrarily grant roles or alter admin membership. Provisioning or revocation should use a privileged, auditable path (e.g., separate trusted server/Admin SDK utility or controlled console procedure), **not** an untrusted browser write.
3. Preserve legitimate read access required by the existing admin login/check flow, with the least permissive rules practical.
4. Check for any admin-provisioning UI/client writes which would stop working under the new rules. Report and safely address the dependency only within scope; do not break production flows silently. If a secure replacement requires infrastructure outside this task, explain the blocker and provide a minimal migration plan instead of inventing a workaround.
5. Add local Firebase Firestore Emulator rules tests, reusing the current framework where possible; if needed, add `@firebase/rules-unit-testing` and a minimal deterministic test command without automatically updating unrelated dependencies.
6. Keep the store and admin applications compiling for the scope touched; do not refactor unrelated code.

## Mandatory tests
- Unauthenticated user cannot read protected admin membership beyond what is explicitly needed, nor create/update/delete admin documents.
- A normal signed-in user cannot create `admins/{theirUid}`.
- A normal signed-in user cannot create `admins/{someoneElseUid}` or change any existing `admins` document.
- A normal signed-in user cannot self-promote through admin-profile fields or claim changes, if such paths exist.
- A legitimate, pre-provisioned admin can still access the admin data necessary for login and normal operation.
- Even an authenticated admin client cannot add a new admin by writing directly to Firestore (unless an explicitly proven secure privilege delegation mechanism already exists and is reviewed).
- Existing non-admin rules behavior is not accidentally broadened.

Use local emulator fixtures (`withSecurityRulesDisabled` only for setting up privileged fixture data), and test client operations with appropriate mock auth contexts. Make tests run without contacting or modifying production Firebase.

## Strict safeguards
- **No deployment**, no Firebase console writes, no real project data modifications, and no database migration.
- **No secrets** in messages, reports, committed files or test fixtures. Never print service account keys, Cloudinary credentials, `.env` values, tokens, or actual personal data.
- Do not change product prices, checkout/payment code, production renderer, Canvas coordinate handling, or existing order snapshot structures in this task.
- Do **not** immediately lock down all `orders` or `cart_items` writes: Phase 0 identified client-side checkout flows that must receive a server-side replacement before those rules can safely be tightened.
- Do not run upgrade/migration commands on unrelated packages.
- Work on a new Git branch or make a checkpoint before editing; never discard uncommitted user changes.

## Deliverables
1. Minimal reviewed diff for local `firestore.rules` and any necessary supporting local files.
2. Positive/negative emulator test suite and a documented command to run it.
3. `docs/security/PHASE1_ADMIN_RULES_REPORT.md` describing: the original issue, exact modifications, test results, remaining risks, local vs deployed status, admin provisioning impact, and any next actions.
4. Final summary listing changed files, tests run, pass/fail, blockers, and explicit confirmation **nothing was deployed or written to live Firebase**.

## Definition of done
The emulator proves ordinary users cannot grant themselves or others admin rights; legitimate pre-provisioned admins still function; no deployed rules or user data are modified; and the solution does not create a new unauthenticated or client-writable admin-provisioning path.

Stop and request review after producing these deliverables. Next tasks (Cloudinary secrets, protected order APIs, pricing, coordinate/production fixes) are **out of scope** for Task 01.
