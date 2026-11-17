import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  setLogLevel,
} from "firebase/firestore";
import { POST } from "../../kenditasarl-admin/src/app/api/print-templates/route";
import { POST as catalogOperation } from "../../kenditasarl-admin/src/app/api/order-operations/route";
import { serverDb } from "../../src/lib/server/cloudinaryServer";
import { checkoutRequest } from "../../src/lib/server/checkout";
import {
  templateConfig,
  templateSchema,
  validateTemplate,
  catalogBindings,
} from "../../src/lib/printTemplate";
import { artwork, digest } from "../../src/lib/server/checkoutArt";
import { serializeEditorFace } from "../../src/lib/faceCoordinates";
import { productionPlan } from "../../kenditasarl-admin/src/lib/production-plan";
const root = new URL("../../", import.meta.url);
const read = (p) => readFile(new URL(p, root), "utf8");
const tee = JSON.parse(
  await read("docs/print-templates/phase5a/sample-tee.json"),
);
const cap = JSON.parse(
  await read("docs/print-templates/phase5a/sample-cap.json"),
);
let env, db, staff, second, buyer, designer;
const base = "products/" + tee.productId,
  ref = (path) => db.doc(path);
async function identity(label) {
  let r = await fetch(
    "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: label + "@phase5a.invalid",
        password: "synthetic-only-password",
        returnSecureToken: true,
      }),
    },
  );
  if (r.status === 400) {
    r = await fetch(
      "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: label + "@phase5a.invalid",
          password: "synthetic-only-password",
          returnSecureToken: true,
        }),
      },
    );
  }
  assert.equal(r.status, 200);
  return r.json();
}
const req = (u, b) =>
  new Request("http://localhost/api/fixture", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(u ? { Authorization: "Bearer " + u.idToken } : {}),
    },
    body: JSON.stringify(b),
  });
async function api(action, body = {}, user = staff, status = 200) {
  const res = await POST(
      req(user, { action, productId: tee.productId, ...body }),
    ),
    data = await res.json();
  assert.equal(res.status, status, JSON.stringify(data));
  return data;
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099");
  assert.equal(process.env.GCLOUD_PROJECT, "demo-kenditasarla-rules");
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = process.env.GCLOUD_PROJECT;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  setLogLevel("silent");
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT,
    firestore: {
      host: "127.0.0.1",
      port: 18080,
      rules: await read("firestore.rules"),
    },
  });
  db = serverDb();
  [staff, second, buyer, designer] = await Promise.all(
    ["staff", "staff2", "buyer", "designer"].map(identity),
  );
  for (const u of [staff, second])
    await ref("admins/" + u.localId).set({ role: "admin" });
  await ref("users/" + designer.localId).set({ role: "designer" });
  await ref("addresses/" + buyer.localId).set({
    user_id: buyer.localId,
    lat: 1,
    lng: 1,
    full_address: "Fixture",
  });
  for (const t of [tee, cap]) {
    await ref("products/" + t.productId).set({
      is_active: true,
      category_id: t.garmentType,
      base_price: 200,
      images: t.faces
        .map((f) => ({ face: f.id, type: "blank", url: f.mockup }))
        .concat([
          {
            face: "front",
            type: "ready",
            url: "https://assets.invalid/ready.png",
          },
        ]),
    });
    await ref("products/" + t.productId + "/variants/navy").set({
      color: "navy",
      sizes: { M: 10 },
    });
  }
});
after(async () => {
  await env?.cleanup();
  for (const p of ["package.json", "kenditasarl-admin/package.json"]) {
    const sdk = createRequire(new URL(p, root))("firebase-admin/app");
    await Promise.all(sdk.getApps().map(sdk.deleteApp));
  }
});
test("contracts and complete translation dictionary keys agree across builds", async () => {
  assert.equal(
    await read("src/lib/printTemplate.ts"),
    await read("kenditasarl-admin/src/lib/printTemplate.ts"),
  );
  assert.equal(
    await read("src/lib/mugMeta.ts"),
    await read("kenditasarl-admin/src/lib/mugMeta.ts"),
  );
  const placementCatalog = await read("src/lib/printPlacementConfig.ts");
  const adminCatalog = await read(
    "kenditasarl-admin/src/lib/printPlacementConfig.ts",
  );
  assert.equal(
    placementCatalog.replaceAll("\r\n", "\n"),
    adminCatalog.replaceAll("\r\n", "\n"),
  );
  const keys = (obj, p = "") =>
    Object.entries(obj)
      .flatMap(([k, v]) =>
        typeof v === "object" ? keys(v, p + k + ".") : [p + k],
      )
      .sort();
  for (const app of ["", "kenditasarl-admin/"]) {
    const langs = await Promise.all(
      ["en", "ar", "tr"].map(async (l) =>
        keys(JSON.parse(await read(app + "messages/" + l + ".json"))),
      ),
    );
    assert.deepEqual(langs[0], langs[1]);
    assert.deepEqual(langs[0], langs[2]);
  }
});
test("local frame, calibration, native bounds, 04B ratio, explicit mirror and output limits are publication gates", async () => {
  const c = (await api("read")).catalog;
  for (const [k, modify] of [
    ["calibration", (f) => (f.mirror = null)],
    ["calibration", (f) => (f.dpi = 0)],
    ["ratio", (f) => (f.placements[0].widthCm = 2)],
    ["bounds", (f) => (f.placements[0].rect.left = 490)],
    ["space", (f) => (f.space = "PRINT_AREA_LOCAL")],
    ["mockup", (f) => (f.mockup = tee.faces[1].mockup)],
    ["output", (f) => (f.placements[0].heightCm = 890)],
    ["placement", (f) => (f.placements[0].id = "unknown")],
    ["variant", (_, t) => (t.variantIds = ["missing"])],
  ]) {
    const t = structuredClone(tee);
    modify(t.faces[0], t);
    assert.ok(validateTemplate(t, c).includes(k));
  }
  const safe = structuredClone(tee),
    f = safe.faces[0];
  f.safeArea = {
    reference: "SURFACE_TOP_LEFT",
    unit: "px",
    rect: { left: 10, top: 10, width: 450, height: 540 },
  };
  assert.ok(validateTemplate(safe, c).includes("safe"));
  Object.assign(f.placements[0], {
    rect: { left: 0, top: 0, width: 500, height: 600 },
    widthCm: 25,
    heightCm: 30,
  });
  assert.deepEqual(validateTemplate(safe, c), []);
  assert.deepEqual(
    templateConfig(safe, "fixture").faces.front.printArea.safeArea,
    { ...f.safeArea.rect, shape: "rect" },
  );
  const bound = catalogBindings(
    tee.productId,
    "tshirt",
    {
      images: [
        { type: "blank", face: "front", url: f.mockup, colorHex: "#223344" },
      ],
    },
    [
      { id: "navy", hex: "#223344" },
      { id: "red", hex: "#ff0000" },
    ],
  );
  assert.deepEqual(bound.bindings[0].variantIds, ["navy"]);
  const multi = structuredClone(tee);
  multi.faces[0].placements.push({
    ...multi.faces[0].placements[0],
    id: "left_chest",
    rect: { left: 55, top: 80, width: 40, height: 40 },
    widthCm: 4,
    heightCm: 4,
  });
  assert.deepEqual(validateTemplate(multi, c), []);
  const multiConfig = templateConfig(multi, digest(multi));
  const selected = ["full_front", "left_chest"];
  const face = serializeEditorFace(
    {
      objects: selected.map((id, i) => ({
        type: "rect",
        left: i ? 61 : 150,
        top: i ? 86 : 150,
        width: 14,
        height: 14,
        assignedPlacementId: id,
      })),
    },
    {
      face: "front",
      panorama: false,
      nativeWidth: 500,
      nativeHeight: 600,
      canvasWidth: 500,
      canvasHeight: 600,
    },
    {
      revision: digest(multiConfig),
      config: multiConfig,
      family: "apparel",
      garment: "tshirt",
      selected,
      free: false,
      method: "DTF",
    },
  );
  const normalized = await artwork(
    {
      ...design(multi, digest(multi)),
      canvas_json: JSON.stringify({ "navy:::front": face }),
      selected_placement_ids: selected,
    },
    { color: "navy" },
    "navy",
    { category: "tshirt", customization_config: multiConfig },
    async () => {
      throw Error("unexpected asset");
    },
  );
  const multiPlan = productionPlan({
    ...normalized.art,
    schema_version: 1,
    art_version: digest(normalized.art),
    is_immutable_snapshot: true,
  });
  assert.deepEqual(
    multiPlan.map((r) => [r.placement, r.width, r.height]).sort(),
    [
      ["full_front", 240, 320],
      ["left_chest", 40, 40],
    ],
  );
  const unsafe = structuredClone(tee);
  unsafe.faces[0].bleed = 4;
  assert.equal(templateSchema.safeParse(unsafe).success, false);
  const t = structuredClone(tee);
  t.faces[0].mirror = null;
  await api("save", { expected: 0, definition: t });
  assert.ok(
    (await api("publish", { expected: 1 }, staff, 422)).issues.includes(
      "calibration",
    ),
  );
  assert.equal(
    (await ref(base).get()).get("print_template_revision"),
    undefined,
  );
});
test("rules and authenticated operations separate customer, designer and two competing admins", async () => {
  for (const u of [buyer, designer]) {
    await api("save", { expected: 1, definition: tee, role: "admin" }, u, 403);
    await api("publish", { expected: 1 }, u, 403);
  }
  for (const u of [buyer, designer, staff]) {
    const client = env.authenticatedContext(u.localId).firestore();
    for (const path of [
      base + "/print_template_private/draft",
      base + "/print_template_revisions/fake",
      base + "/print_template_audit/fake",
    ]) {
      await assertFails(setDoc(doc(client, path), { role: "admin" }));
      await assertFails(getDoc(doc(client, path)));
    }
    await assertFails(
      updateDoc(doc(client, base), { print_template_revision: "fake" }),
    );
  }
  const result = await Promise.all(
    [staff, second].map((u) =>
      POST(
        req(u, {
          action: "save",
          productId: tee.productId,
          definition: tee,
          expected: 1,
        }),
      ),
    ),
  );
  assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await api("read")).revision, 2);
  const forged = await catalogOperation(
    req(staff, {
      action: "catalog",
      product_id: tee.productId,
      product: { print_template_revision: "fake" },
      expected: {},
      variants: [],
    }),
  );
  assert.equal(forged.status, 400);
});
const intent = (kind, id = null) => ({
  product_id: tee.productId,
  variant_id: "navy_M",
  size: "M",
  color: "navy",
  quantity: 1,
  design_type: kind,
  design_id: id,
});
async function checkout(a, b, status = 200) {
  const r = await checkoutRequest(req(buyer, b), a),
    j = await r.json();
  assert.equal(r.status, status, JSON.stringify(j));
  return j;
}
function design(t, revision) {
  const c = templateConfig(t, revision),
    f = t.faces[0],
    p = f.placements[0];
  const face = serializeEditorFace(
    {
      objects: [
        {
          type: "textbox",
          fontFamily: "Cairo",
          text: "Sample",
          width: 40,
          height: 14,
          left: 150,
          top: 150,
          assignedPlacementId: p.id,
        },
      ],
    },
    {
      face: "front",
      panorama: false,
      nativeWidth: 500,
      nativeHeight: 600,
      canvasWidth: 500,
      canvasHeight: 600,
    },
    {
      revision: digest(c),
      config: c,
      family: "apparel",
      garment: "tshirt",
      selected: [p.id],
      free: false,
      method: "DTF",
    },
  );
  return {
    product_id: t.productId,
    user_id: buyer.localId,
    color: "navy",
    selected_placement_ids: [p.id],
    canvas_json: JSON.stringify({ "navy:::front": JSON.stringify(face) }),
    production_snapshot: JSON.stringify({
      snapshotVersion: 1,
      customization_config: c,
      printAreas: { front: c.faces.front.printArea },
    }),
  };
}
async function renderHashes(orderId, itemId, item) {
  const deps = createRequire(import.meta.url),
    browser = await deps("playwright-core").chromium.launch({
      channel: "chrome",
      headless: true,
      // Compare publication revisions with the same software rasterizer. GPU/Skia
      // runtime selection can change an antialiased edge between fresh processes.
      args: ["--disable-gpu", "--disable-skia-runtime-opts"],
    });
  try {
    const page = await browser.newPage();
    await page.route("**/*", async (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== "https://print.fixture.invalid") return r.abort();
      if (u.pathname === "/")
        return r.fulfill({ contentType: "text/html", body: "<html></html>" });
      if (/^\/production-fonts\/[\w-]+\.woff$/.test(u.pathname))
        return r.fulfill({
          contentType: "font/woff",
          body: await readFile(
            new URL("kenditasarl-admin/public" + u.pathname, root),
          ),
        });
      return r.abort();
    });
    await page.goto("https://print.fixture.invalid/");
    await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
    const script = await deps("esbuild").build({
      entryPoints: [
        fileURLToPath(
          new URL("../production/phase4b-browser.mts", import.meta.url),
        ),
      ],
      bundle: true,
      platform: "browser",
      write: false,
      define: { "process.env": "{}" },
    });
    await page.addScriptTag({ content: script.outputFiles[0].text });
    return await page.evaluate(
      async ({ id, row }) => {
        const { zip } = await window.buildPackage(id, row),
          bytes = await zip.arrayBuffer(),
          archive = await window.proofZip.loadAsync(bytes);
        const m = JSON.parse(
          await archive.file("production-info.json").async("string"),
        );
        const zipHash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        return [zipHash, m.source.fingerprint, ...m.files.map((f) => f.sha256)];
      },
      { id: orderId, row: { ...item, id: itemId } },
    );
  } finally {
    await browser.close();
  }
}
test("v2 preserves v1 order/accepted cart; new checkout rejects stale art, forbidden tools and placements", async () => {
  const v1 = (await api("publish", { expected: 2 })).active;
  assert.equal(v1, digest(tee));
  const revisionDoc = ref(base + "/print_template_revisions/" + v1),
    original = (await revisionDoc.get()).data();
  const reader = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(reader, revisionDoc.path)));
  const originalDesign = { ...design(tee, v1), print_template_revision: v1 };
  await ref("designs/v1-synthetic").set(originalDesign);
  assert.equal((await api("read")).designCount, 1);
  await checkout("add", {
    lines: [intent("custom", "v1-synthetic"), intent("ready"), intent("blank")],
  });
  const q = await checkout("quote", {
    address_id: buyer.localId,
    method: "shipping",
    locale: "en",
  });
  const confirmed = await checkout("confirm", {
    accepted: true,
    key: crypto.randomUUID(),
    quote_id: q.quote_id,
  });
  const lines = await ref("orders/" + confirmed.order_id)
    .collection("items")
    .get();
  const itemDoc = lines.docs.find((d) => d.get("design_id") === "v1-synthetic"),
    item = itemDoc.data();
  assert.deepEqual(
    productionPlan(item).map((p) => [
      p.width,
      p.height,
      p.config.physicalWidthCm,
      p.config.physicalHeightCm,
    ]),
    [[240, 320, 24, 32]],
  );
  const frozen = digest(item),
    plan = digest(productionPlan(item));
  const output = await renderHashes(confirmed.order_id, itemDoc.id, item);
  assert.equal(output.length, 3);
  assert.ok(output.every((hash) => /^[0-9a-f]{64}$/.test(hash)));
  await checkout("add", { lines: [intent("custom", "v1-synthetic")] });
  const v2t = structuredClone(tee);
  v2t.faces[0].placements[0].policy.allowText = false;
  v2t.faces[0].placements[0].rect.left += 5;
  const draft = await api("save", { expected: 3, definition: v2t });
  assert.equal(draft.active, v1);
  const v2 = (await api("publish", { expected: 4 })).active;
  assert.notEqual(v2, v1);
  assert.equal((await api("read")).designCount, 0);
  assert.ok(
    (
      await checkout("quote", {
        address_id: buyer.localId,
        method: "shipping",
        locale: "en",
      })
    ).quote_id,
  );
  await checkout("add", { lines: [intent("custom", "v1-synthetic")] }, 409);
  for (const forged of [false, true]) {
    const d = design(v2t, v2);
    d.allowedTools = { allowText: true };
    if (forged) d.selected_placement_ids = ["left_chest"];
    await ref("designs/v2-forged").set(d);
    await checkout("add", { lines: [intent("custom", "v2-forged")] }, 409);
  }
  assert.deepEqual((await revisionDoc.get()).data(), original);
  assert.equal(digest((await itemDoc.ref.get()).data()), frozen);
  assert.equal(digest(productionPlan((await itemDoc.ref.get()).data())), plan);
  assert.deepEqual(
    await renderHashes(
      confirmed.order_id,
      itemDoc.id,
      (await itemDoc.ref.get()).data(),
    ),
    output,
  );
  assert.deepEqual(
    (await ref("designs/v1-synthetic").get()).data(),
    originalDesign,
  );
  await assertFails(getDoc(doc(reader, revisionDoc.path)));
  assert.equal((await api("archive", { expected: 5 })).active, v2);
  assert.equal(
    (await ref(base).collection("print_template_audit").get()).size,
    6,
  );
});
test("nested objects, verified resource class, layer and upload quotas apply to each placement", async () => {
  const t = structuredClone(tee),
    policy = t.faces[0].placements[0].policy;
  Object.assign(policy, {
    allowText: false,
    allowCustomerUpload: false,
    allowStickers: true,
    maxUploads: 1,
  });
  const run = async (objects, upload = false) => {
    const rev = digest(t),
      d = design(t, rev),
      map = JSON.parse(d.canvas_json),
      s = JSON.parse(map["navy:::front"]);
    s.objects = objects;
    d.canvas_json = JSON.stringify({ "navy:::front": s });
    d.allowedTools = { allowText: true, allowCustomerUpload: true };
    return artwork(
      d,
      { color: "navy" },
      "navy",
      { category: "tshirt", customization_config: templateConfig(t, rev) },
      async () => ({
        id: "owned-test-asset",
        price: 0,
        url: "https://assets.invalid/a.png",
        upload,
      }),
    );
  };
  const image = {
    type: "image",
    left: 150,
    top: 150,
    width: 24,
    height: 24,
    src: "https://assets.invalid/a.png",
    isCustomUpload: false,
  };
  const text = {
    type: "textbox",
    text: "fixture",
    left: 150,
    top: 150,
    width: 24,
    height: 24,
  };
  await assert.rejects(
    run([{ ...image, type: "group", src: undefined, objects: [text] }]),
    /NEEDS_REVIEW/,
  );
  const accepted = await run([image]);
  assert.equal(accepted.flat.front.objects[0].name, "sticker");
  await assert.rejects(run([image], true), /NEEDS_REVIEW/);
  policy.allowCustomerUpload = true;
  await assert.rejects(run([image, image], true), /NEEDS_REVIEW/);
  policy.allowLayers = false;
  await assert.rejects(run([image, image]), /NEEDS_REVIEW/);
  policy.allowLayers = true;
  policy.maxElements = 1;
  await assert.rejects(run([image, image]), /NEEDS_REVIEW/);
});
test("free mode remains calibrated and standalone mug uses the fixed wrap with frozen handle metadata", async () => {
  const t = structuredClone(tee);
  t.allowFreeMode = true;
  const c = templateConfig(t, digest(t)),
    d = design(t, digest(t)),
    area = t.faces[0].placements[0];
  const face = serializeEditorFace(
    {
      objects: [
        {
          type: "rect",
          left: 150,
          top: 150,
          width: 24,
          height: 24,
          assignedPlacementId: area.id,
        },
      ],
    },
    {
      face: "front",
      panorama: false,
      nativeWidth: 500,
      nativeHeight: 600,
      canvasWidth: 500,
      canvasHeight: 600,
    },
    {
      revision: digest(c),
      config: c,
      family: "apparel",
      garment: "tshirt",
      selected: [area.id],
      free: true,
      method: "DTF",
    },
  );
  const free = await artwork(
    {
      ...d,
      placement_mode: "free",
      canvas_json: JSON.stringify({ "navy:::front": face }),
    },
    { color: "navy" },
    "navy",
    { category: "tshirt", customization_config: c },
    async () => {
      throw Error("unexpected asset");
    },
  );
  const plan = productionPlan({
    ...free.art,
    schema_version: 1,
    art_version: digest(free.art),
    is_immutable_snapshot: true,
  });
  assert.deepEqual(
    [plan[0].placement, plan[0].width, plan[0].height],
    ["free", 240, 320],
  );
  const mug = structuredClone(cap);
  mug.garmentType = "mug";
  mug.method = "Sublimation";
  const f = mug.faces[0],
    p = f.placements[0];
  Object.assign(f, {
    space: "STANDALONE_SURFACE",
    nativeWidth: 1840,
    nativeHeight: 760,
  });
  Object.assign(p, {
    id: "mug_full_wrap",
    widthCm: 23,
    heightCm: 9.5,
    rect: { left: 0, top: 0, width: 1840, height: 760 },
  });
  const catalog = catalogBindings(
    mug.productId,
    "mug",
    {
      images: [{ face: "front", type: "blank", url: f.mockup }],
      mug_meta: { handleMarginCm: 0.7 },
    },
    [{ id: "navy" }],
  );
  mug.mugMeta = catalog.mugMeta;
  assert.deepEqual(validateTemplate(mug, catalog), []);
  assert.equal(templateConfig(mug, digest(mug)).mug_meta.handleMarginCm, 0.7);
  p.widthCm = 24;
  assert.ok(validateTemplate(mug, catalog).includes("space"));
});
test("cap publishes its single native face, numerical output and narrower placement policy", async () => {
  const productId = cap.productId;
  await api("save", { productId, definition: cap, expected: 0 });
  const res = await api("publish", { productId, expected: 1 });
  const config = templateConfig(
    (
      await ref(
        "products/" + productId + "/print_template_revisions/" + res.active,
      ).get()
    ).get("definition"),
    res.active,
  );
  assert.deepEqual(config.allowedPlacements, ["hat_front_crown"]);
  assert.deepEqual(Object.keys(config.faces), ["front"]);
  assert.equal(
    config.builderTemplate.faces[0].placements[0].policy.allowCustomerUpload,
    false,
  );
  assert.equal(
    Math.round(
      (config.calibratedPlacements.hat_front_crown.physicalWidthCm / 2.54) *
        300,
    ),
    1181,
  );
});
