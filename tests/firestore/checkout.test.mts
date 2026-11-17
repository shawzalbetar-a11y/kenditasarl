import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { deliverOrderChannel } from "../../src/lib/server/orderNotifications";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  getDoc,
  setDoc,
  updateDoc,
  doc,
  setLogLevel,
} from "firebase/firestore";
import { serverDb } from "../../src/lib/server/cloudinaryServer";
import { checkoutRequest } from "../../src/lib/server/checkout";
import { POST as ops } from "../../kenditasarl-admin/src/app/api/order-operations/route";
const projectId = "demo-kenditasarla-rules";
let env, db, a, b, admin, guest;
const area = { left: 0, top: 0, width: 200, height: 200 };
const config = {
  enabled: true,
  garmentType: "tshirt",
  faces: {
    front: { enabled: true, printArea: area },
    back: { enabled: true, printArea: area },
  },
};
const shape = {
  type: "textbox",
  text: "Sample",
  left: 10,
  top: 10,
  width: 60,
  height: 20,
};
function design(uid, faces) {
  return {
    user_id: uid,
    product_id: "shirt",
    color: "red",
    selected_placement_ids: [],
    production_snapshot: JSON.stringify({
      snapshotVersion: 1,
      printAreas: { front: area, back: area },
      customization_config: config,
    }),
    canvas_json: JSON.stringify(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(faces).map(([k, v]) => [
            k,
            JSON.stringify({ objects: v }),
          ]),
        ),
      ),
    ),
  };
}
async function identity(email?) {
  let r = await fetch(
    "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        email
          ? {
              email,
              password: "synthetic-fixture-only",
              returnSecureToken: true,
            }
          : { returnSecureToken: true },
      ),
    },
  );
  if (r.status === 400 && email) {
    r = await fetch(
      "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "synthetic-fixture-only",
          returnSecureToken: true,
        }),
      },
    );
  }
  assert.equal(r.status, 200);
  return r.json();
}
const request = (body, user) =>
  new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(user ? { Authorization: "Bearer " + user.idToken } : {}),
    },
    body: JSON.stringify(body),
  });
async function call(action, body, user = a, status = 200) {
  const r = await checkoutRequest(request(body, user), action);
  const data = await r.json();
  assert.equal(r.status, status, JSON.stringify(data));
  return data;
}
const intent = (color, type = "blank", design_id = null) => ({
  product_id: "shirt",
  variant_id: color + "_M",
  size: "M",
  color,
  quantity: 1,
  design_type: type,
  design_id,
});
const quote = (user = a) =>
  call(
    "quote",
    { address_id: user.localId, method: "shipping", locale: "en" },
    user,
  );
const confirm = (q, key = crypto.randomUUID(), user = a, status = 200) =>
  call("confirm", { accepted: true, key, quote_id: q.quote_id }, user, status);
async function reset() {
  await db.recursiveDelete(db.collection("cart_items"));
  await db
    .doc("products/shirt/variants/red")
    .set({ color: "red", sizes: { M: 4 } });
  await db
    .doc("products/shirt/variants/blue")
    .set({ color: "blue", size: "M", stock: 4 });
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099");
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  setLogLevel("silent");
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 18080,
      rules: await readFile(
        new URL("../../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
  [a, b, admin, guest] = await Promise.all([
    identity("buyer-a@example.invalid"),
    identity("buyer-b@example.invalid"),
    identity("staff@example.invalid"),
    identity(),
  ]);
  db = serverDb();
  await db.doc("products/shirt").set({
    base_price: 200,
    is_active: true,
    customization_config: config,
    linked_ready_designs: ["ready"],
  });
  await db.doc("admins/" + admin.localId).set({ role: "admin" });
  for (const u of [a, b])
    await db.doc("addresses/" + u.localId).set({
      user_id: u.localId,
      lat: 1,
      lng: 1,
      full_address: "Synthetic delivery address",
    });
  await db.doc("designs/matrix").set(
    design(a.localId, {
      "red:::front": [shape],
      "blue:::front": [shape],
      "blue:::back": [shape],
    }),
  );
  await db
    .doc("design_assets/sticker")
    .set({ price: 15, url: "https://assets.invalid/sticker.png" });
  const sticker = {
    ...shape,
    type: "image",
    name: "sticker",
    src: "https://assets.invalid/sticker.png",
    assetPrice: 0,
  };
  await db.doc("designs/premium").set(
    design(a.localId, {
      "red:::front": [{ ...shape, type: "group", objects: [sticker] }],
    }),
  );
  await db.doc("designs/ready").set({
    ...design(admin.localId, { "red:::front": [sticker] }),
    is_template: true,
  });
});
after(async () => {
  await env?.cleanup();
  for (const p of [
    "../../package.json",
    "../../kenditasarl-admin/package.json",
  ]) {
    const sdk = createRequire(new URL(p, import.meta.url))(
      "firebase-admin/app",
    );
    await Promise.all(sdk.getApps().map(sdk.deleteApp));
  }
});
test("matrix prices and immutable artwork are per SKU; COD retry and stock movements are atomic", async () => {
  await reset();
  await call("add", {
    lines: [
      intent("blue", "custom", "matrix"),
      intent("red", "custom", "matrix"),
    ],
  });
  const q = await quote();
  assert.equal(q.subtotal, 43500);
  assert.equal(q.shipping, 4500);
  const key = crypto.randomUUID();
  const first = await confirm(q, key);
  assert.deepEqual(await confirm(q, key), first);
  const order = db.doc("orders/" + first.order_id);
  assert.equal((await order.get()).get("payment_status"), "pending_cod");
  const items = await order.collection("items").get();
  assert.equal(items.size, 2);
  for (const row of items.docs) {
    const red = row.get("color") === "red";
    assert.deepEqual(
      Object.keys(JSON.parse(row.get("canvas_json"))).sort(),
      red ? ["front"] : ["back", "front"],
    );
    assert.equal(row.get("unit_minor"), red ? 20000 : 23500);
  }
  assert.equal(
    (await db.doc("products/shirt/variants/red").get()).get("sizes.M"),
    3,
  );
  assert.equal(
    (await db.doc("products/shirt/variants/blue").get()).get("stock"),
    3,
  );
  assert.equal(
    (
      await db
        .collection("order_notifications")
        .where("order_id", "==", first.order_id)
        .get()
    ).size,
    1,
  );
});
test("ready all-in, blank base, nested catalog sticker from server; cross-owner and forged intent rejected", async () => {
  await reset();
  await call("add", {
    lines: [
      intent("red", "ready", "ready"),
      intent("red"),
      intent("red", "custom", "premium"),
    ],
  });
  const q = await quote();
  assert.equal(q.subtotal, 61500);
  for (const u of [b, guest])
    await call("add", { lines: [intent("red", "custom", "matrix")] }, u, 403);
  await call(
    "quote",
    { address_id: b.localId, method: "shipping", locale: "en" },
    a,
    403,
  );
  await call("add", { lines: [{ ...intent("red"), unit_price: 0 }] }, a, 400);
  await call(
    "confirm",
    { quote_id: q.quote_id, key: crypto.randomUUID(), accepted: false },
    a,
    400,
  );
  await confirm(q);
  assert.equal(
    (await db.doc("products/shirt/variants/red").get()).get("sizes.M"),
    1,
  );
});
test("address, stock, cart, rule and design revisions invalidate confirmation; review preserves the cart", async () => {
  await reset();
  const { ids } = await call("add", {
    lines: [intent("red", "custom", "matrix")],
  });
  for (const [path, patch] of [
    ["addresses/" + a.localId, { label: "Changed" }],
    ["products/shirt/variants/red", { sizes: { M: 3 } }],
    ["settings/pricing", { revision: 2 }],
    ["cart_items/" + ids[0], { quantity: 2 }],
    ["designs/matrix", { updated_at: "test-revision" }],
  ]) {
    const q = await quote();
    await db.doc(path).set(patch, { merge: true });
    await confirm(q, crypto.randomUUID(), a, 409);
  }
  await db.doc("designs/matrix").update({ production_snapshot: "{}" });
  assert.equal((await quote()).lines[0].minor, 20000);
  // An old line without a server-materialized version needs the original snapshot.
  await db.doc("checkout_art/" + ids[0]).delete();
  const err = await call(
    "quote",
    { address_id: a.localId, method: "shipping", locale: "en" },
    a,
    409,
  );
  assert.equal(err.line, ids[0]);
  assert.ok((await db.doc("cart_items/" + ids[0]).get()).exists);
});
test("legacy mismatch and ambiguous mapping, last unit contention and stale admin save", async () => {
  await reset();
  await db
    .doc("products/shirt/variants/red")
    .set({ color: "red", sizes: { M: 1 } });
  await db
    .doc("cart_items/legacy")
    .set({ ...intent("red"), user_id: a.localId, unit_price: 180 });
  await call("add", { lines: [intent("red")] }, b);
  const [qa, qb] = await Promise.all([quote(a), quote(b)]);
  assert.equal(qa.lines[0].old_minor, 18000);
  assert.equal(qa.lines[0].minor, 20000);
  const res = await Promise.all(
    [qa, qb].map((q, i) =>
      checkoutRequest(
        request(
          { quote_id: q.quote_id, key: crypto.randomUUID(), accepted: true },
          [a, b][i],
        ),
        "confirm",
      ),
    ),
  );
  assert.deepEqual(res.map((r) => r.status).sort(), [200, 409]);
  const catalog = {
    action: "catalog",
    product_id: "shirt",
    product: { name_en: "Shirt" },
    expected: { red: { sizes: { M: 1 } }, blue: { size: "M", stock: 4 } },
    variants: [{ id: "red", data: { hex: "red", sizes: { M: 1 } } }],
  };
  assert.equal((await ops(request(catalog, admin))).status, 409);
  assert.equal(
    (await db.doc("products/shirt/variants/red").get()).get("sizes.M"),
    0,
  );
  await db
    .doc("products/shirt/variants/duplicate")
    .set({ color: "red", sizes: { M: 1 } });
  await call("add", { lines: [intent("red")] }, a, 409);
  await db.doc("products/shirt/variants/duplicate").delete();
  const orderId = (await res.find((r) => r.status === 200).json()).order_id;
  const status = {
    action: "status",
    order_id: orderId,
    previous: "pending",
    status: "packed",
    shipping_code: "demo",
  };
  assert.equal((await ops(request(status, b))).status, 403);
  assert.equal((await ops(request(status, admin))).status, 200);
  assert.equal(
    (await db.doc("orders/" + orderId).get()).get("payment_status"),
    "pending_cod",
  );
});
test("rules isolate carts, owned designs, addresses, orders, snapshots and stock from every browser", async () => {
  const owner = env.authenticatedContext(a.localId).firestore(),
    other = env.authenticatedContext(b.localId).firestore();
  const staff = env.authenticatedContext(admin.localId).firestore();
  await db
    .doc("orders/old")
    .set({ user_id: a.localId, total: 200, status: "pending" });
  await db.doc("orders/old/items/old").set({ unit_price: 200 });
  await db
    .doc("cart_items/private")
    .set({ ...intent("red"), user_id: a.localId });
  for (const client of [
    other,
    env.unauthenticatedContext().firestore(),
    env
      .authenticatedContext("upload-only", {
        firebase: { sign_in_provider: "anonymous" },
      })
      .firestore(),
  ]) {
    for (const path of [
      "orders/old",
      "orders/old/items/old",
      "cart_items/private",
      "designs/matrix",
      "addresses/" + a.localId,
    ])
      await assertFails(getDoc(doc(client, path)));
  }
  for (const path of ["orders/old", "orders/old/items/old"]) {
    await assertSucceeds(getDoc(doc(owner, path)));
    await assertSucceeds(getDoc(doc(staff, path)));
    for (const client of [owner, other, staff])
      await assertFails(
        setDoc(doc(client, path), { total: 0, payment_status: "paid" }),
      );
  }
  await assertSucceeds(
    updateDoc(doc(owner, "cart_items/private"), { quantity: 2 }),
  );
  for (const fields of [
    { quantity: 0 },
    { unit_price: 0 },
    { user_id: b.localId },
    { production_snapshot: {} },
    { license: true },
  ])
    await assertFails(updateDoc(doc(owner, "cart_items/private"), fields));
  await assertFails(
    updateDoc(doc(other, "cart_items/private"), { quantity: 2 }),
  );
  await assertFails(
    updateDoc(doc(owner, "designs/matrix"), { is_template: true }),
  );
  await assertFails(
    updateDoc(doc(owner, "addresses/" + a.localId), { user_id: b.localId }),
  );
  for (const path of [
    "counters/orders",
    "products/shirt/variants/red",
    "checkout_art/private",
    "checkout_quotes/private",
    "order_notifications/old",
  ])
    await assertFails(setDoc(doc(staff, path), { stock: 200 }));
  await assertSucceeds(getDoc(doc(other, "designs/ready")));
});

test("price decreases require consent, reservation shortfalls roll back and a replay key cannot change intent", async () => {
  await reset();
  await db
    .doc("cart_items/old-price")
    .set({ ...intent("red"), user_id: a.localId, unit_price: 250 });
  const q = await quote(),
    key = crypto.randomUUID();
  assert.equal(q.lines[0].old_minor, 25000);
  assert.equal(q.lines[0].minor, 20000);
  await call("confirm", { accepted: false, key, quote_id: q.quote_id }, a, 400);
  const first = await confirm(q, key);
  assert.deepEqual(await confirm(q, key), first);
  await call("add", { lines: [intent("red"), intent("red")] });
  const second = await quote();
  await confirm(second, key, a, 409);
  const before = (await db.collection("orders").get()).size;
  await db.doc("products/shirt/variants/red").update({ "sizes.M": 1 });
  await confirm(second, crypto.randomUUID(), a, 409);
  assert.equal((await db.collection("orders").get()).size, before);
  assert.equal((await db.collection("cart_items").get()).size, 2);
  assert.equal(
    (await db.doc("products/shirt/variants/red").get()).get("sizes.M"),
    1,
  );
});

test("guest upload receipt must be proven by its own token, and old art has deterministic inheritance", async () => {
  await reset();
  const url = "https://assets.invalid/owned.png",
    hash = createHash("sha256").update(url).digest("hex");
  await db
    .doc("upload_receipts/" + hash + "/owners/" + guest.localId)
    .set({ url });
  await db.doc("designs/receipt").set(
    design(a.localId, {
      "blue:::front": [{ ...shape, type: "image", src: url }],
    }),
  );
  const body = { lines: [intent("red", "custom", "receipt")] };
  await call("add", body, a, 409);
  const req = request(body, a);
  req.headers.set("X-Upload-Session", guest.idToken);
  assert.equal((await checkoutRequest(req, "add")).status, 200);
  const q = await quote();
  await confirm(q);
  await db
    .doc("designs/ambiguous")
    .set(
      design(a.localId, { "white:::front": [shape], "blue:::front": [shape] }),
    );
  await call("add", { lines: [intent("red", "custom", "ambiguous")] }, a, 409);
  await call("add", {
    lines: [{ ...intent("red", "custom", "ambiguous"), art_source: "white" }],
  });
  // A missing production snapshot on an old cart requires the buyer to reselect it.
  await db.doc("designs/incomplete").set({
    ...design(a.localId, { "red:::front": [shape] }),
    production_snapshot: null,
  });
  await db
    .doc("cart_items/incomplete")
    .set({ ...intent("red", "custom", "incomplete"), user_id: a.localId });
  const review = await call(
    "quote",
    { address_id: a.localId, method: "shipping", locale: "en" },
    a,
    409,
  );
  assert.equal(review.line, "incomplete");
});

test("catalog-ready publication, native print bounds, and successful admin compare-and-set", async () => {
  await reset();
  await call("add", { lines: [intent("red", "ready")] }, a, 409);
  await db.doc("products/shirt").update({
    images: [
      {
        type: "ready",
        face: "front",
        colorHex: "red",
        url: "https://assets.invalid/ready.png",
      },
    ],
  });
  await call("add", { lines: [intent("red", "ready")] });
  const q = await quote();
  assert.equal(q.subtotal, 20000);
  const purchase = await confirm(q);
  const ready = (
    await db
      .doc("orders/" + purchase.order_id)
      .collection("items")
      .get()
  ).docs[0];
  assert.equal(
    JSON.parse(ready.get("production_snapshot")).ready_assets[0].face,
    "front",
  );
  const expected = {
    red: { sizes: { M: 3 }, rev: 1 },
    blue: { size: "M", stock: 4 },
  };
  const action = {
    action: "catalog",
    product_id: "shirt",
    product: { name_en: "Fixture" },
    expected,
    variants: [
      { id: "red", data: { hex: "red", sizes: { M: 8 } } },
      { id: "blue", data: { hex: "blue", sizes: { M: 4 } } },
    ],
  };
  assert.equal((await ops(request(action, b))).status, 403);
  assert.equal((await ops(request(action, admin))).status, 200);
  assert.equal((await ops(request(action, admin))).status, 409);
  assert.equal(
    (await db.doc("products/shirt/variants/red").get()).get("sizes.M"),
    8,
  );
  const calibrated = {
    ...config,
    calibratedPlacements: {
      left_chest: {
        x: 10,
        y: 10,
        width: 70,
        height: 30,
        nativeWidth: 200,
        nativeHeight: 200,
      },
    },
  };
  await db.doc("products/shirt").update({ customization_config: calibrated });
  const placed = { ...shape, assignedPlacementId: "left_chest" };
  await db
    .doc("designs/inside")
    .set(design(a.localId, { "red:::front": [placed] }));
  await call("add", { lines: [intent("red", "custom", "inside")] });
  await db
    .doc("designs/outside")
    .set(design(a.localId, { "red:::front": [{ ...placed, left: 135 }] }));
  await call("add", { lines: [intent("red", "custom", "outside")] }, a, 409);
});

test("server shipping settings, address distance, expiration and financial input boundaries", async () => {
  await reset();
  process.env.GOOGLE_MAPS_SERVER_KEY = "";
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "";
  process.env.STORE_ORIGIN_LAT = "1";
  process.env.STORE_ORIGIN_LNG = "1";
  await db.doc("settings/pricing").set(
    {
      delivery: {
        express: {
          max_km: 1,
          flat_tier_fee: 70,
          base_fee: 10,
          is_active: true,
        },
      },
    },
    { merge: true },
  );
  await call("add", { lines: [{ ...intent("red"), quantity: 3 }] });
  const regular = await quote();
  assert.equal(regular.shipping, 0);
  const input = { address_id: a.localId, method: "express", locale: "tr" };
  const express = await call("quote", input);
  assert.equal(express.shipping, 8000);
  await call("quote", { ...input, shipping: 0, lat: 0, lng: 0 }, a, 400);
  await db.doc("checkout_quotes/" + express.quote_id).update({ expires: 1 });
  await confirm(express, crypto.randomUUID(), a, 409);
  await db.doc("addresses/" + a.localId).update({ lng: 5 });
  await call("quote", input, a, 409);
  await db.doc("addresses/" + a.localId).update({ full_address: " " });
  await call("quote", { ...input, method: "shipping" }, a, 409);
});
test("an interrupted delivery and concurrent retry claim each notification channel once", async () => {
  const event = db.doc("order_notifications/demo-dispatch");
  await event.set({ order_id: "demo-order" });
  let sends = 0;
  const send = async () => {
    sends++;
    return true;
  };
  await Promise.all([
    deliverOrderChannel(event, "email", send),
    deliverOrderChannel(event, "email", send),
  ]);
  assert.equal(sends, 1);
  await assert.rejects(
    deliverOrderChannel(event, "whatsapp", async () => {
      throw Error("uncertain");
    }),
  );
  await deliverOrderChannel(event, "whatsapp", send);
  assert.equal(sends, 1);
  assert.equal((await event.get()).get("whatsapp"), "review");
});

test("changing the studio's active color preserves line totals and an unrelated change cannot replace locked art", async () => {
  await reset();
  await db
    .doc("addresses/" + a.localId)
    .update({ full_address: "Fixture", lng: 1 });
  const faces = {
    "red:::front": [shape],
    "blue:::front": [shape],
    "blue:::back": [shape],
  };
  const ref = db.doc("designs/colors");
  await ref.set(design(a.localId, faces));
  const lines = [
    intent("red", "custom", "colors"),
    intent("blue", "custom", "colors"),
  ];
  await call("add", { lines });
  const first = await quote();
  await reset();
  await ref.update({ color: "blue" });
  await call("add", { lines });
  const next = await quote();
  assert.equal(first.subtotal, 43500);
  assert.equal(next.subtotal, 43500);
  const versions = (q) =>
    q.lines.map((l) => l.color + "=" + l.art_version).sort();
  assert.deepEqual(versions(first), versions(next));
  await ref.update({
    canvas_json: design(a.localId, { "blue:::back": [shape] }).canvas_json,
  });
  await confirm(next, crypto.randomUUID(), a, 409);
  const refreshed = await quote();
  assert.deepEqual(versions(next), versions(refreshed));
  const purchase = await confirm(refreshed);
  const items = await db
    .doc("orders/" + purchase.order_id)
    .collection("items")
    .get();
  assert.deepEqual(
    items.docs.map((i) => i.get("color") + "=" + i.get("art_version")).sort(),
    versions(first),
  );
});

test("an admin stock save racing a checkout never overwrites its reservation",async()=>{
  await reset();
  const intentRow=intent("red");
  await call("add",{lines:[intentRow]});
  const q=await quote();
  const expected={red:{sizes:{M:4}},blue:{size:"M",stock:4}};
  const catalog={action:"catalog",product_id:"shirt",product:{name_en:"Synthetic Shirt"},expected,variants:[
    {id:"red",data:{hex:"red",sizes:{M:8}}},{id:"blue",data:{hex:"blue",sizes:{M:4}}}]};
  const [buy,edit]=await Promise.all([
    checkoutRequest(request({quote_id:q.quote_id,key:crypto.randomUUID(),accepted:true},a),"confirm"),
    ops(request(catalog,admin))]);
  assert.deepEqual([buy.status,edit.status].sort(),[200,409]);
  assert.equal((await db.doc("products/shirt/variants/red").get()).get("sizes.M"),buy.ok?3:8);
  const draft=design(a.localId,{"red:::front":[shape]});
  draft.canvas_json=JSON.stringify({"red:::front":{width:20000,objects:[shape]}});
  await db.doc("designs/bad-dimensions").set(draft);
  await call("add",{lines:[intent("red","custom","bad-dimensions")]},a,409);
});


test("04A freezes verified face contracts at each SKU price and binds create-only reviews to the immutable line", async () => {
  await reset();
  const {editorFrame,faceCoordinates,templateRevision} = await import("../../src/lib/faceCoordinates");
  const {productionPlan} = await import("../../kenditasarl-admin/src/lib/production-plan");
  const {itemFingerprint} = await import("../../kenditasarl-admin/src/lib/coordinate-review");
  const review = await import("../../kenditasarl-admin/src/app/api/production/coordinate-review/route");
  const pa = {...area,nativeWidth:200,nativeHeight:200,physicalWidthCm:10,physicalHeightCm:10,targetDPI:300,mirrorHorizontal:false,printMethod:"DTF"};
  const catalog = {...config,defaultPrintMethod:"DTF",faces:{front:{printArea:pa},back:{printArea:pa}}};
  const product = db.doc("products/shirt");
  await product.update({customization_config:catalog});
  const rev = await templateRevision(catalog);
  const reference = face => faceCoordinates(editorFrame(face,false,200,200,rev),catalog,"apparel","tshirt",[],false,"DTF");
  const art = key => JSON.stringify({width:200,height:200,objects:[shape],...(key ? {coordinates:reference(key)} : {})});
  const designDoc = db.doc("designs/04a");
  const data = {...design(a.localId,{}), print_method:"DTF",production_snapshot:JSON.stringify({snapshotVersion:1,customization_config:catalog}),
    canvas_json:JSON.stringify({"red:::front":art("front"),"blue:::front":art("front"),"blue:::back":art(null)})};
  await designDoc.set(data);
  await call("add",{lines:["red","blue"].map(c=>intent(c,"custom","04a"))});
  const q = await quote(), purchase = await confirm(q);
  const rows = await db.collection("orders/"+purchase.order_id+"/items").get();
  await designDoc.update({canvas_json:"{}"});
  await product.update({customization_config:config});
  for (const row of rows.docs) {
    const item = row.data(), snap = JSON.parse(item.production_snapshot);
    assert.equal(snap.coordinateFaces.front.frame.templateRevision,rev);
    assert.equal(item.unit_minor,item.color==="red" ? 20000 : 23500);
    if (item.color==="red") { assert.equal(productionPlan(item)[0].config.targetDPI,300); continue; }
    assert.throws(()=>productionPlan(item),/NEEDS_REVIEW/);
    const fingerprint = await itemFingerprint(item);
    const payload = {face:"back",fingerprint,evidence:"synthetic reference sheet B",evidenceDigest:"a".repeat(64),coordinates:reference("back")};
    const endpoint = "http://localhost/api/production/coordinate-review?order="+purchase.order_id+"&item="+row.id;
    function req(who,body?) { return new Request(endpoint,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+who.idToken},...(body?{body:JSON.stringify(body)}:{})}); }
    assert.equal((await review.POST(req(a,payload))).status,403);
    assert.equal((await review.POST(req(admin,{...payload,fingerprint:"0".repeat(64)}))).status,409);
    assert.equal((await review.POST(req(admin,payload))).status,200);
    assert.equal((await review.POST(req(admin,payload))).status,409);
    const receipt = await (await review.GET(req(admin))).json();
    assert.equal(receipt.fingerprint,fingerprint);
    assert.deepEqual(productionPlan(item,receipt.faces).map(p=>p.face).sort(),["back","front"]);
    assert.equal(receipt.order,purchase.order_id);
    assert.equal(receipt.line,row.id);
    assert.equal(receipt.refs.back,createHash("sha256").update(JSON.stringify([purchase.order_id,row.id,fingerprint,"back"])).digest("hex"));
    assert.equal((await review.GET(req(a))).status,403);
    // Use a disposable synthetic line to test replay isolation without altering the checkout's order item.
    const cloneRef=row.ref.parent.doc("demo-review-replay");
    await cloneRef.create(item);
    const cloneRequest=body=>new Request(endpoint.replace("item="+row.id,"item="+cloneRef.id),{
      method:body?"POST":"GET",headers:{Authorization:"Bearer "+admin.idToken},...(body?{body:JSON.stringify(body)}:{})});
    assert.deepEqual((await (await review.GET(cloneRequest())).json()).faces,{});
    assert.equal((await review.POST(cloneRequest(payload))).status,200);
    await cloneRef.update({art_version:"synthetic-updated-fingerprint"});
    assert.deepEqual((await (await review.GET(cloneRequest())).json()).faces,{});
    assert.equal((await review.POST(cloneRequest(payload))).status,409);
    assert.deepEqual((await row.ref.get()).data(), item);
  }
});

test("04B renders identical PNG and fingerprint from a confirmed order after its source art and catalog change",async()=>{
  await reset();
  const {editorFrame,faceCoordinates,templateRevision}=await import("../../src/lib/faceCoordinates");
  const pa={...area,nativeWidth:200,nativeHeight:200,physicalWidthCm:5.08,physicalHeightCm:5.08,targetDPI:100,mirrorHorizontal:false,printMethod:"DTF"};
  const catalog={...config,defaultPrintMethod:"DTF",faces:{front:{printArea:pa}}};
  const product=db.doc("products/shirt"),designDoc=db.doc("designs/04b-proof");
  await product.update({customization_config:catalog});
  const frame=editorFrame("front",false,200,200,await templateRevision(catalog));
  const coordinates=faceCoordinates(frame,catalog,"apparel","tshirt",[],false,"DTF");
  const scene={width:200,height:200,coordinates,objects:[{type:"rect",left:20,top:30,width:50,height:40,strokeWidth:0,fill:"blue"}]};
  await designDoc.set({...design(a.localId,{}),print_method:"DTF",production_snapshot:JSON.stringify({snapshotVersion:1,customization_config:catalog}),
    canvas_json:JSON.stringify({"red:::front":JSON.stringify(scene)})});
  await call("add",{lines:[intent("red","custom","04b-proof")]});
  const purchase=await confirm(await quote()),order=db.doc("orders/"+purchase.order_id);
  const row=(await order.collection("items").get()).docs[0];
  const {fileURLToPath}=await import("node:url");
  const require=createRequire(import.meta.url);
  const script=await require("esbuild").build({entryPoints:[fileURLToPath(new URL("../production/phase4b-browser.mts",import.meta.url))],
    bundle:true,platform:"browser",write:false,define:{"process.env":"{}"}});
  const browser=await require("playwright-core").chromium.launch({channel:"chrome",headless:true});
  try {
    const page=await browser.newPage();
    await page.route("**/*",route=>route.request().url()==="https://print.fixture.invalid/" ?
      route.fulfill({contentType:"text/html",body:"<html></html>"}) : route.abort());
    await page.goto("https://print.fixture.invalid/");
    await page.addScriptTag({content:script.outputFiles[0].text});
    const render=async()=>page.evaluate(async ({id,item})=>{
      const {zip}=await window.buildPackage(id,item);
      const archive=await window.proofZip.loadAsync(await zip.arrayBuffer());
      const m=JSON.parse(await archive.file("production-info.json").async("string"));
      return [m.source.fingerprint,m.source.artVersion,m.files[0].sha256];
    },{id:purchase.order_id,item:{...(await row.ref.get()).data(),id:row.id}});
    const before=await render();
    assert.ok(before.every(s=>/^[a-f0-9]{64}$/.test(s)));
    await designDoc.update({canvas_json:"{}"});
    await product.update({customization_config:config});
    assert.deepEqual(await render(),before);
    assert.deepEqual((await row.ref.get()).data(),row.data());
  } finally {await browser.close();}
});
