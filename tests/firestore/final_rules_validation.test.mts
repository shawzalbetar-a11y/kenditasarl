import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection, doc, getDocFromServer, getDocsFromServer, setDoc, updateDoc, deleteDoc, query, where
} from "firebase/firestore";

const projectId = "demo-kenditasarla-rules";
let env: any;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 18080,
      rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
    },
  });

  // Seed baseline data via bypass
  await env.withSecurityRulesDisabled(async (context: any) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "admins/admin-user"), { role: "admin" }),
      setDoc(doc(db, "admins/superadmin-user"), { role: "superadmin" }),
      setDoc(doc(db, "users/cust-a"), { full_name: "Customer A", phone: "+905551112233", email: "a@example.com" }),
      setDoc(doc(db, "users/cust-b"), { full_name: "Customer B", phone: "+905559998877", email: "b@example.com" }),
      setDoc(doc(db, "products/prod-01"), { name: "Test Shirt", print_template_revision: "rev-hash-123" }),
      setDoc(doc(db, "products/prod-01/variants/var-red"), { color: "red", stock: 20 }),
      setDoc(doc(db, "settings/pricing"), { active: true }),
      setDoc(doc(db, "settings/internal_config"), { secret_flag: true, max_batch: 50 }),
      setDoc(doc(db, "settings/keys"), { private_jwt: "supersecret" }),
      setDoc(doc(db, "settings/storage/cloudinary/main"), { api_key: "secret", api_secret: "secret" }),
      setDoc(doc(db, "orders/order-100"), { user_id: "cust-a", total: 500 }),
      setDoc(doc(db, "orders/order-100/items/line-1"), { product_id: "prod-01", qty: 2 }),
      setDoc(doc(db, "cart_items/cart-a1"), { user_id: "cust-a", quantity: 2, price: 200 }),
      setDoc(doc(db, "designs/design-private"), { user_id: "cust-a", product_id: "prod-01", is_template: false, title: "Private Art" }),
      setDoc(doc(db, "designs/design-template"), { is_template: true, title: "Public Template" }),
      setDoc(doc(db, "addresses/addr-a"), { user_id: "cust-a", city: "Istanbul" }),
      setDoc(doc(db, "wishlists/wish-a"), { user_id: "cust-a", product_id: "prod-01" }),
      setDoc(doc(db, "user_uploads/up-a"), { user_id: "cust-a", url: "https://example.com/up.png" }),
      setDoc(doc(db, "counters/orders"), { current_value: 1000, next_number: 1001 }),
      // Versioned pricing & shipping policies baseline
      setDoc(doc(db, "pricing_policies/default"), { activeRevisionId: "rev-active-price" }),
      setDoc(doc(db, "pricing_policies/default/revisions/rev-active-price"), { version: 1, name: "Active Price" }),
      setDoc(doc(db, "pricing_policies/default/revisions/rev-draft-price"), { version: 2, name: "Unpublished Price" }),
      setDoc(doc(db, "shipping_zone_policies/default"), { activeRevisionId: "rev-active-ship" }),
      setDoc(doc(db, "shipping_zone_policies/default/revisions/rev-active-ship"), { version: 1, name: "Active Ship" }),
      setDoc(doc(db, "shipping_zone_policies/default/revisions/rev-draft-ship"), { version: 2, name: "Unpublished Ship" }),
    ]);
  });
});

after(async () => {
  await env?.cleanup();
});

describe("Kendin Tasarla — Final Firestore Rules Validation Test Suite", () => {

  // =========================================================================
  // GUEST / ANONYMOUS ACCESS TESTS
  // =========================================================================
  test("[Guest 1] Unauthenticated guest can read public catalog and public settings/pricing", async () => {
    const guestDb = env.unauthenticatedContext().firestore();
    assert.equal((await assertSucceeds(getDocFromServer(doc(guestDb, "products/prod-01")))).exists(), true);
    assert.equal((await assertSucceeds(getDocFromServer(doc(guestDb, "products/prod-01/variants/var-red")))).exists(), true);
    assert.equal((await assertSucceeds(getDocFromServer(doc(guestDb, "designs/design-template")))).exists(), true);
    assert.equal((await assertSucceeds(getDocFromServer(doc(guestDb, "settings/pricing")))).exists(), true);
  });

  test("[Guest 2] Anonymous visitor issued for guest uploads CANNOT read private store data", async () => {
    const anonDb = env.authenticatedContext("anon-visitor", {
      firebase: { sign_in_provider: "anonymous" }
    }).firestore();
    // Denied reading private addresses, orders, cart, or user accounts
    await assertFails(getDocFromServer(doc(anonDb, "addresses/addr-a")));
    await assertFails(getDocFromServer(doc(anonDb, "orders/order-100")));
    await assertFails(getDocFromServer(doc(anonDb, "cart_items/cart-a1")));
    await assertFails(getDocFromServer(doc(anonDb, "admins/admin-user")));
  });

  // =========================================================================
  // ADMIN MEMBERSHIP TESTS
  // =========================================================================
  test("[Admins 1] Customer can check own membership, but cannot list or read other admins", async () => {
    const custDb = env.authenticatedContext("cust-a").firestore();
    const own = doc(custDb, "admins/cust-a");
    const other = doc(custDb, "admins/admin-user");
    assert.equal((await assertSucceeds(getDocFromServer(own))).exists(), false);
    await assertFails(getDocFromServer(other));
    await assertFails(getDocsFromServer(collection(custDb, "admins")));
  });

  test("[Admins 2] Client SDK CANNOT create, update or delete any admin membership", async () => {
    const custDb = env.authenticatedContext("cust-a").firestore();
    const adminDb = env.authenticatedContext("admin-user").firestore();
    // Normal user cannot grant role
    await assertFails(setDoc(doc(custDb, "admins/cust-a"), { role: "admin" }));
    await assertFails(setDoc(doc(custDb, "admins/new-admin"), { role: "admin" }));
    // Admin cannot escalate self to superadmin or delete other admins via client SDK
    await assertFails(updateDoc(doc(adminDb, "admins/admin-user"), { role: "superadmin" }));
    await assertFails(deleteDoc(doc(adminDb, "admins/superadmin-user")));
  });

  // =========================================================================
  // SETTINGS & STORAGE PROTECTION
  // =========================================================================
  test("[Settings 1] settings/storage is COMPLETELY CLOSED to all clients including admins", async () => {
    const adminDb = env.authenticatedContext("admin-user").firestore();
    const custDb = env.authenticatedContext("cust-a").firestore();
    const guestDb = env.unauthenticatedContext().firestore();
    const storageDoc = doc(adminDb, "settings/storage/cloudinary/main");

    await assertFails(getDocFromServer(storageDoc));
    await assertFails(getDocFromServer(doc(custDb, "settings/storage/cloudinary/main")));
    await assertFails(getDocFromServer(doc(guestDb, "settings/storage/cloudinary/main")));
    await assertFails(setDoc(doc(adminDb, "settings/storage/cloudinary/leak"), { api_key: "hacked" }));
  });

  // =========================================================================
  // PRODUCTS & VARIANTS (STOCK INTEGRITY)
  // =========================================================================
  test("[Products 1] Direct client modification of variants/stock is strictly DENIED", async () => {
    const custDb = env.authenticatedContext("cust-a").firestore();
    const adminDb = env.authenticatedContext("admin-user").firestore();
    const variantDoc = doc(adminDb, "products/prod-01/variants/var-red");

    await assertFails(updateDoc(variantDoc, { stock: 9999 }));
    await assertFails(updateDoc(doc(custDb, "products/prod-01/variants/var-red"), { stock: 0 }));
    await assertFails(setDoc(doc(adminDb, "products/prod-01/variants/var-new"), { stock: 10 }));
  });

  test("[Products 2] Admin client SDK cannot bypass print template revision publisher", async () => {
    const adminDb = env.authenticatedContext("admin-user").firestore();
    // Cannot directly mutate print_template_revision
    await assertFails(updateDoc(doc(adminDb, "products/prod-01"), { print_template_revision: "forged-rev" }));
    await assertFails(setDoc(doc(adminDb, "products/prod-tampered"), { name: "Tampered", print_template_revision: "fake" }));
  });

  // =========================================================================
  // CART & CHECKOUT INTEGRITY
  // =========================================================================
  test("[Cart 1] Cart items cannot be created directly by client (enforces /api/cart/add)", async () => {
    const custDb = env.authenticatedContext("cust-a").firestore();
    await assertFails(
      setDoc(doc(custDb, "cart_items/fake-cart"), { user_id: "cust-a", price: 1, quantity: 10 }),
      "Direct client creation of cart items must be rejected"
    );
  });

  test("[Cart 2] Cart item owner can update ONLY quantity between 1 and 999", async () => {
    const custDb = env.authenticatedContext("cust-a").firestore();
    const otherDb = env.authenticatedContext("cust-b").firestore();
    const itemDoc = doc(custDb, "cart_items/cart-a1");

    // Owner can update quantity to valid number
    await assertSucceeds(updateDoc(itemDoc, { quantity: 5 }));
    // Owner CANNOT alter price or user_id
    await assertFails(updateDoc(itemDoc, { price: 50 }));
    await assertFails(updateDoc(itemDoc, { user_id: "cust-b" }));
    // Other customer cannot read, update, or delete
    await assertFails(getDocFromServer(doc(otherDb, "cart_items/cart-a1")));
    await assertFails(updateDoc(doc(otherDb, "cart_items/cart-a1"), { quantity: 1 }));
    await assertFails(deleteDoc(doc(otherDb, "cart_items/cart-a1")));
  });

  // =========================================================================
  // ORDERS & IMMUTABILITY
  // =========================================================================
  test("[Orders 1] Client SDK cannot create, update, or delete orders or items", async () => {
    const custDb = env.authenticatedContext("cust-a").firestore();
    const adminDb = env.authenticatedContext("admin-user").firestore();

    await assertFails(setDoc(doc(custDb, "orders/new-fake"), { user_id: "cust-a", status: "delivered" }));
    await assertFails(updateDoc(doc(custDb, "orders/order-100"), { status: "cancelled" }));
    await assertFails(updateDoc(doc(adminDb, "orders/order-100"), { status: "shipped" }));
    await assertFails(deleteDoc(doc(custDb, "orders/order-100")));
  });

  test("[Orders 2] Customer can read own order and items; others cannot", async () => {
    const custDb = env.authenticatedContext("cust-a").firestore();
    const otherDb = env.authenticatedContext("cust-b").firestore();
    const adminDb = env.authenticatedContext("admin-user").firestore();

    assert.equal((await assertSucceeds(getDocFromServer(doc(custDb, "orders/order-100")))).exists(), true);
    assert.equal((await assertSucceeds(getDocFromServer(doc(custDb, "orders/order-100/items/line-1")))).exists(), true);
    // Other customer denied
    await assertFails(getDocFromServer(doc(otherDb, "orders/order-100")));
    await assertFails(getDocFromServer(doc(otherDb, "orders/order-100/items/line-1")));
    // Admin allowed
    assert.equal((await assertSucceeds(getDocFromServer(doc(adminDb, "orders/order-100")))).exists(), true);
  });

  // =========================================================================
  // DESIGNS, ADDRESSES & WISHLISTS
  // =========================================================================
  test("[Designs 1] Private designs are isolated; cannot be self-promoted to templates", async () => {
    const custDb = env.authenticatedContext("cust-a").firestore();
    const otherDb = env.authenticatedContext("cust-b").firestore();

    // Owner reads private design
    assert.equal((await assertSucceeds(getDocFromServer(doc(custDb, "designs/design-private")))).exists(), true);
    // Other cannot read private design
    await assertFails(getDocFromServer(doc(otherDb, "designs/design-private")));
    // Cannot promote to template
    await assertFails(updateDoc(doc(custDb, "designs/design-private"), { is_template: true }));
    await assertFails(setDoc(doc(custDb, "designs/new-fake-tpl"), { user_id: "cust-a", is_template: true }));
  });

  test("[Addresses 1] Address ownership cannot be reassigned", async () => {
    const custDb = env.authenticatedContext("cust-a").firestore();
    const otherDb = env.authenticatedContext("cust-b").firestore();

    // Owner can update
    await assertSucceeds(updateDoc(doc(custDb, "addresses/addr-a"), { city: "Ankara" }));
    // Cannot reassign to another UID
    await assertFails(updateDoc(doc(custDb, "addresses/addr-a"), { user_id: "cust-b" }));
    // Other user cannot read or delete
    await assertFails(getDocFromServer(doc(otherDb, "addresses/addr-a")));
    await assertFails(deleteDoc(doc(otherDb, "addresses/addr-a")));
  });

  // =========================================================================
  // FINANCIAL COUNTERS & INTERNAL COLLECTIONS
  // =========================================================================
  test("[Internal 1] Counters and quotes are server-only", async () => {
    const custDb = env.authenticatedContext("cust-a").firestore();
    const adminDb = env.authenticatedContext("admin-user").firestore();

    await assertFails(getDocFromServer(doc(custDb, "counters/orders")));
    await assertFails(updateDoc(doc(adminDb, "counters/orders"), { next_number: 1 }));
    await assertFails(getDocFromServer(doc(custDb, "checkout_quotes/fake-quote")));
  });

  // =========================================================================
  // USER PRIVACY, ISOLATION & ENUMERATION PREVENTION TESTS
  // =========================================================================
  test("[Privacy 1] Customer A can read own profile; CANNOT read Customer B profile", async () => {
    const custDbA = env.authenticatedContext("cust-a").firestore();
    const custDbB = env.authenticatedContext("cust-b").firestore();

    // Owner reads own profile
    const ownDoc = await assertSucceeds(getDocFromServer(doc(custDbA, "users/cust-a")));
    assert.equal(ownDoc.exists(), true);
    assert.equal(ownDoc.data()?.full_name, "Customer A");

    // Cross-user read is strictly denied
    await assertFails(getDocFromServer(doc(custDbA, "users/cust-b")));
    await assertFails(getDocFromServer(doc(custDbB, "users/cust-a")));
  });

  test("[Privacy 2] Anonymous and unauthenticated visitors CANNOT read any user profile", async () => {
    const guestDb = env.unauthenticatedContext().firestore();
    const anonDb = env.authenticatedContext("anon-visitor", {
      firebase: { sign_in_provider: "anonymous" },
    }).firestore();

    await assertFails(getDocFromServer(doc(guestDb, "users/cust-a")));
    await assertFails(getDocFromServer(doc(anonDb, "users/cust-a")));
  });

  test("[Privacy 3] Collection enumeration attack: Customer CANNOT list or query users collection", async () => {
    const custDbA = env.authenticatedContext("cust-a").firestore();

    // Direct collection query / listing
    await assertFails(getDocsFromServer(collection(custDbA, "users")));

    // Filter query by phone or email (enumeration probe)
    await assertFails(
      getDocsFromServer(query(collection(custDbA, "users"), where("phone", "==", "+905559998877")))
    );
    await assertFails(
      getDocsFromServer(query(collection(custDbA, "users"), where("email", "==", "b@example.com")))
    );
  });

  test("[Privacy 4] Positive allowlist: Client cannot forge identity, set verification proof, or inject unallowed fields", async () => {
    const custDbA = env.authenticatedContext("cust-a").firestore();
    const custDbNew = env.authenticatedContext("cust-new").firestore();

    // Cannot create doc for another UID
    await assertFails(
      setDoc(doc(custDbA, "users/cust-other"), { full_name: "Attacker", phone: "+905001112233" })
    );

    // Cannot self-attest phone_verified during creation (must be server Admin SDK)
    await assertFails(
      setDoc(doc(custDbNew, "users/cust-new"), {
        full_name: "Attacker",
        phone: "+905550001122",
        phone_verified: true,
      })
    );

    // Cannot inject role, isAdmin or unallowed status during creation
    await assertFails(
      setDoc(doc(custDbNew, "users/cust-new"), { full_name: "Hacker", role: "admin" })
    );
    await assertFails(
      setDoc(doc(custDbNew, "users/cust-new"), { full_name: "Hacker", status: "vip" })
    );

    // Owner CAN create profile with EXACT positive allowlist fields
    await assertSucceeds(
      setDoc(doc(custDbNew, "users/cust-new"), {
        full_name: "New Customer",
        email: "new@example.com",
        phone: "+905551234567",
        preferred_language: "tr",
        created_at: "2026-11-16T00:00:00Z",
      })
    );

    // Cannot self-attest phone_verified via update
    await assertFails(updateDoc(doc(custDbA, "users/cust-a"), { phone_verified: true }));

    // Cannot escalate self via update with role, isAdmin, or arbitrary keys
    await assertFails(updateDoc(doc(custDbA, "users/cust-a"), { role: "admin" }));
    await assertFails(updateDoc(doc(custDbA, "users/cust-a"), { isAdmin: true }));
    await assertFails(updateDoc(doc(custDbA, "users/cust-a"), { status: "vip" }));
    await assertFails(updateDoc(doc(custDbA, "users/cust-a"), { permissions: ["all"] }));

    // Owner CAN update legitimate personal profile fields
    await assertSucceeds(
      updateDoc(doc(custDbA, "users/cust-a"), { full_name: "Customer A Updated", phone: "+905559990000" })
    );
  });

  test("[Privacy 5] Admin CAN read customer profiles for order processing", async () => {
    const adminDb = env.authenticatedContext("admin-user").firestore();
    const userDoc = await assertSucceeds(getDocFromServer(doc(adminDb, "users/cust-a")));
    assert.equal(userDoc.exists(), true);
    assert.equal(userDoc.data()?.full_name, "Customer A Updated");
  });

  test("[Addresses 2] Delivery eligibility and verification fields are protected from client forgery", async () => {
    const custDbA = env.authenticatedContext("cust-a").firestore();
    const addrDoc = doc(custDbA, "addresses/addr-a");

    // Client CANNOT forge is_fast_delivery_eligible on creation
    await assertFails(
      setDoc(doc(custDbA, "addresses/addr-fake-express"), {
        user_id: "cust-a",
        city: "Istanbul",
        is_fast_delivery_eligible: true,
      })
    );

    // Client CANNOT forge location_source or verified_by on creation
    await assertFails(
      setDoc(doc(custDbA, "addresses/addr-fake-source"), {
        user_id: "cust-a",
        city: "Istanbul",
        location_source: "admin_verified",
      })
    );

    // Client CANNOT forge verification fields via update
    await assertFails(updateDoc(addrDoc, { is_fast_delivery_eligible: true }));
    await assertFails(updateDoc(addrDoc, { location_source: "admin_verified" }));
    await assertFails(updateDoc(addrDoc, { verified_by: "system" }));
    await assertFails(updateDoc(addrDoc, { verification_id: "fake_verif" }));

    // Client CAN update legitimate address details
    await assertSucceeds(updateDoc(addrDoc, { city: "Bursa" }));
  });

  test("[Uploads & Designs 1] Metadata allowlist on uploads and immutability of product_id on custom designs", async () => {
    const custDbA = env.authenticatedContext("cust-a").firestore();

    // Client CAN create user_uploads with allowed metadata keys
    await assertSucceeds(
      setDoc(doc(custDbA, "user_uploads/up-new"), {
        user_id: "cust-a",
        url: "https://example.com/art.png",
        name: "Artwork",
        size: 2048,
        created_at: "2026-11-16T00:00:00Z",
      })
    );

    // Client CANNOT inject arbitrary server receipts or trust tokens into user_uploads
    await assertFails(
      setDoc(doc(custDbA, "user_uploads/up-tampered"), {
        user_id: "cust-a",
        url: "https://example.com/art.png",
        verified_receipt: true,
      })
    );

    // user_uploads are immutable (update is strictly denied)
    await assertFails(updateDoc(doc(custDbA, "user_uploads/up-a"), { name: "Renamed" }));

    // Custom designs: cannot reassign product_id on an existing design
    await assertFails(updateDoc(doc(custDbA, "designs/design-private"), { product_id: "prod-other" }));

    // Custom designs: owner CAN update normal design content (title, canvas_json)
    await assertSucceeds(updateDoc(doc(custDbA, "designs/design-private"), { title: "Updated Art Title" }));
  });

  test("[Policies 1] Public read is restricted to active published revision and rejects unpublished revisions", async () => {
    const guestDb = env.unauthenticatedContext().firestore();
    const custDbA = env.authenticatedContext("cust-a").firestore();
    const adminDb = env.authenticatedContext("admin-user").firestore();

    // 1. Pricing Policy Revisions
    // Active published revision can be read by public and customers
    assert.equal(
      (await assertSucceeds(getDocFromServer(doc(guestDb, "pricing_policies/default/revisions/rev-active-price")))).exists(),
      true
    );
    assert.equal(
      (await assertSucceeds(getDocFromServer(doc(custDbA, "pricing_policies/default/revisions/rev-active-price")))).exists(),
      true
    );

    // Unpublished draft revision is REJECTED for guest and customer
    await assertFails(getDocFromServer(doc(guestDb, "pricing_policies/default/revisions/rev-draft-price")));
    await assertFails(getDocFromServer(doc(custDbA, "pricing_policies/default/revisions/rev-draft-price")));

    // Customer CANNOT list revisions (prevents discovery of historical/unpublished policies)
    await assertFails(getDocsFromServer(collection(custDbA, "pricing_policies/default/revisions")));

    // Admin CAN read unpublished revisions and list revisions
    const adminPriceRev = await assertSucceeds(
      getDocFromServer(doc(adminDb, "pricing_policies/default/revisions/rev-draft-price"))
    );
    assert.equal(adminPriceRev.exists(), true);
    await assertSucceeds(getDocsFromServer(collection(adminDb, "pricing_policies/default/revisions")));

    // 2. Shipping Zone Policy Revisions
    // Active published shipping revision is readable
    assert.equal(
      (await assertSucceeds(getDocFromServer(doc(guestDb, "shipping_zone_policies/default/revisions/rev-active-ship")))).exists(),
      true
    );
    // Unpublished draft shipping revision is REJECTED for guest and customer
    await assertFails(getDocFromServer(doc(guestDb, "shipping_zone_policies/default/revisions/rev-draft-ship")));
    await assertFails(getDocFromServer(doc(custDbA, "shipping_zone_policies/default/revisions/rev-draft-ship")));

    // Admin CAN read unpublished shipping revisions
    const adminShipRev = await assertSucceeds(
      getDocFromServer(doc(adminDb, "shipping_zone_policies/default/revisions/rev-draft-ship"))
    );
    assert.equal(adminShipRev.exists(), true);
  });

  test("[Settings 2] Non-public internal settings are protected by explicit allowlist", async () => {
    const guestDb = env.unauthenticatedContext().firestore();
    const custDbA = env.authenticatedContext("cust-a").firestore();
    const adminDb = env.authenticatedContext("admin-user").firestore();

    // Public allowlist includes ONLY pricing
    assert.equal((await assertSucceeds(getDocFromServer(doc(guestDb, "settings/pricing")))).exists(), true);
    assert.equal((await assertSucceeds(getDocFromServer(doc(custDbA, "settings/pricing")))).exists(), true);

    // Non-allowlisted internal settings rejected for guest and regular customer
    await assertFails(getDocFromServer(doc(guestDb, "settings/internal_config")));
    await assertFails(getDocFromServer(doc(custDbA, "settings/internal_config")));
    await assertFails(getDocFromServer(doc(custDbA, "settings/keys")));

    // Admin CAN read internal settings
    const internalDoc = await assertSucceeds(getDocFromServer(doc(adminDb, "settings/internal_config")));
    assert.equal(internalDoc.exists(), true);

    // settings/storage remains COMPLETELY CLOSED even to admin
    await assertFails(getDocFromServer(doc(adminDb, "settings/storage/cloudinary/main")));
  });
});
