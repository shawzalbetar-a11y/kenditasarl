import assert from "node:assert/strict";
import { before, after, test, mock } from "node:test";
import { createRequire } from "node:module";
import { Writable } from "node:stream";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDocs, getDoc, setDoc, setLogLevel } from "firebase/firestore";
import sharp from "sharp";
import { POST as customerUpload } from "../../src/app/api/upload/route.ts";
import { POST as adminUpload } from "../../kenditasarl-admin/src/app/api/upload/route.ts";
import { GET, POST } from "../../kenditasarl-admin/src/app/api/cloudinary/accounts/route.ts";

const projectId = "demo-kenditasarla-rules";
const root = new URL("../../", import.meta.url);
const events = [];
const clients = [];
let env, admin, customer, guest, png, jpeg, webp;
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{fill:#abc}</style><path class="a" d="M0 0L2 2"/></svg>');
const account = { name: "Fixture", cloud_name: "fixture-cloud", api_key: "fixture-key", api_secret: "fixture-secret" };

async function identity(email?) {
  const response = await fetch("http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(email ? { email, password: "fixture-only-password", returnSecureToken: true } : { returnSecureToken: true }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
function request(body, id?, type?) {
  const headers = new Headers();
  if (id) headers.set("Authorization", "Bearer " + id);
  if (type) headers.set("Content-Type", type);
  return new Request("http://localhost/test", { method: "POST", headers, body });
}
function file(bytes, mime, folder?, extra = {}) {
  const body = new FormData();
  body.append("file", new Blob([bytes], { type: mime }), "fixture");
  if (folder) body.append("folder", folder);
  for (const [name, value] of Object.entries(extra)) body.append(name, value);
  return body;
}
const manage = (data, id) => POST(request(JSON.stringify(data), id, "application/json"));
const list = id => GET(new Request("http://localhost/test", { headers: id ? { Authorization: "Bearer " + id } : {} }));

before(async () => {
  setLogLevel("silent");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099");
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  Object.assign(process.env, { CLOUDINARY_API_KEY: "fixture-default-key", CLOUDINARY_API_SECRET: "fixture-default-secret", CLOUDINARY_CLOUD_NAME: "fixture-default" });
  for (const prefix of ["", "kenditasarl-admin/"]) {
    const localRequire = createRequire(new URL(prefix + "package.json", root));
    clients.push(localRequire("firebase-admin/app"));
    mock.method(localRequire("cloudinary").v2.uploader, "upload_stream", (options, cb) => {
      return new Writable({ write(bytes, encoding, done) {
        events.push({ folder: options.folder, cloud: options.cloud_name, resource: options.resource_type, size: bytes.length });
        done();
      }, final(done) {
        cb(null, { secure_url: "https://fixture.invalid/design.png", public_id: "fixture" });
        done();
      } });
    });
  }
  env = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 18080,
    rules: await readFile(new URL("firestore.rules", root), "utf8") } });
  admin = await identity("operator@example.invalid");
  customer = await identity("shopper@example.invalid");
  guest = await identity();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "admins", admin.localId), { role: "admin" });
    await setDoc(doc(db, "settings/storage/cloudinary/legacy"), { ...account, is_active: true });
    await setDoc(doc(db, "settings/pricing"), { active: true });
    await setDoc(doc(db, "designs/legacy"), { is_template: true, preview_image_url: "https://old-assets.invalid/unchanged.png" });
  });
  const pixel = sharp({ create: { width: 3, height: 3, channels: 4, background: "#0088ff" } });
  [png, jpeg, webp] = await Promise.all([pixel.clone().png().toBuffer(), pixel.clone().jpeg().toBuffer(), pixel.clone().webp().toBuffer()]);
});
after(async () => {
  await env?.cleanup();
  for (const sdk of clients) await Promise.all(sdk.getApps().map(a => sdk.deleteApp(a)));
  mock.restoreAll();
});

test("client rules hide storage credentials and selection; public pricing remains readable", async () => {
  for (const ctx of [env.unauthenticatedContext(), env.authenticatedContext(customer.localId), env.authenticatedContext(admin.localId)]) {
    const db = ctx.firestore();
    await assertFails(getDocs(collection(db, "settings/storage/cloudinary")));
    await assertFails(getDoc(doc(db, "settings/storage/cloudinary/legacy")));
    await assertFails(setDoc(doc(db, "settings/storage/cloudinary/legacy"), { is_active: false }));
    await assertFails(getDoc(doc(db, "settings/storage")));
    await assertFails(setDoc(doc(db, "settings/storage"), { active: true }));
    await assertSucceeds(getDoc(doc(db, "settings/pricing")));
  }
});
test("unauthenticated and invalid sessions are rejected; customer cannot manage accounts or use admin upload", async () => {
  const initial = events.length;
  for (const route of [adminUpload, customerUpload]) {
    for (const id of [undefined, "invalid"]) assert.equal((await route(request(file(png, "image/png"), id))).status, 401);
  }
  for (const id of [customer.idToken, guest.idToken]) {
    assert.equal((await adminUpload(request(file(png, "image/png", "prints"), id))).status, 403);
    assert.equal((await list(id)).status, 403);
    assert.equal((await manage({ action: "activate", id: "legacy" }, id)).status, 403);
  }
  assert.equal((await list(undefined)).status, 401);
  assert.equal(events.length, initial);
});
test("the guest upload identity keeps visitor-only access in the store database", async () => {
  // Use the actual Auth emulator token and rules via the emulator REST endpoint.
  const base = "http://127.0.0.1:18080/v1/projects/" + projectId + "/databases/(default)/documents/";
  for (const path of ["orders", "cart_items", "users", "admins/" + guest.localId]) {
    assert.equal((await fetch(base + path, { headers: { Authorization: "Bearer " + guest.idToken } })).status, 403);
  }
  assert.equal((await fetch(base + "settings/pricing", { headers: { Authorization: "Bearer " + guest.idToken } })).status, 200);
});
test("guest and signed-in shopper upload artwork and preview; JSON data URL remains compatible", async () => {
  for (const [bytes, mime, id] of [[png, "image/png", guest.idToken], [jpeg, "image/jpeg", customer.idToken], [webp, "image/webp", customer.idToken], [svg, "image/svg+xml", guest.idToken]]) {
    const result = await customerUpload(request(file(bytes, mime), id));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { success: true, url: "https://fixture.invalid/design.png", public_id: "fixture" });
    assert.equal(events.at(-1).folder, "kenditasarl_products");
    assert.equal(events.at(-1).cloud, "fixture-default");
  }
  const json = JSON.stringify({ dataUrl: "data:image/png;base64," + png.toString("base64") });
  assert.equal((await customerUpload(request(json, customer.idToken, "application/json"))).status, 200);
});
test("admin uploads to existing product, sticker and print folders with server-selected credentials", async () => {
  for (const [folder, bytes, mime] of [["products/gallery", jpeg, "image/jpeg"], ["stickers", svg, "image/svg+xml"], ["prints", png, "image/png"]]) {
    assert.equal((await adminUpload(request(file(bytes, mime, folder), admin.idToken))).status, 200);
    assert.deepEqual(events.at(-1), { cloud: account.cloud_name, folder, resource: "image", size: bytes.length });
  }
});
test("rejects unsupported content, malformed files, unsafe SVG, oversized bodies and upload overrides before Cloudinary", async () => {
  const initial = events.length;
  for (const [body, expected] of [
    [file(Buffer.from("not an image"), "image/png"), 415], [file(png, "image/jpeg"), 415],
    [file(jpeg, "application/pdf"), 415], [file(Buffer.from("<svg"), "image/svg+xml"), 415],
    [file(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), "image/svg+xml"), 415],
    [file(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://fixture.invalid/a"/></svg>'), "image/svg+xml"), 415],
    [file(Buffer.alloc(10 * 1024 * 1024 + 1), "image/png"), 413],
    [file(png, "image/png", "stickers"), 400], [file(png, "image/png", undefined, { upload_preset: "test" }), 400],
  ]) assert.equal((await customerUpload(request(body, customer.idToken))).status, expected);
  for (const data of [file(png, "image/png", "other"), file(png, "image/png", "prints", { cloud_name: "other" })])
    assert.equal((await adminUpload(request(data, admin.idToken))).status, 400);
  assert.equal((await customerUpload(request(JSON.stringify({ image: "https://fixture.invalid/image" }), customer.idToken, "application/json"))).status, 415);
  const tooLarge = request(Buffer.alloc(1), customer.idToken, "application/json");
  tooLarge.headers.set("content-length", String(16 * 1024 * 1024));
  assert.equal((await customerUpload(tooLarge)).status, 413);
  assert.equal(events.length, initial);
});
test("server account administration preserves legacy accounts, switches atomically and never returns secrets", async () => {
  const id = admin.idToken;
  const catalog = async () => {
    const response = await list(id);
    assert.equal(response.status, 200);
    const rows = await response.json();
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ["cloud_name", "id", "is_active", "name"]);
    return rows;
  };
  assert.equal((await catalog())[0].id, "legacy");
  assert.equal((await manage({ ...account, action: "add", cloud_name: "second" }, id)).status, 200);
  const second = (await catalog()).find(a => a.cloud_name === "second");
  assert.equal(second.is_active, false);
  assert.equal((await manage({ action: "activate", id: second.id }, id)).status, 200);
  assert.deepEqual((await catalog()).filter(a => a.is_active).map(a => a.id), [second.id]);
  assert.equal((await adminUpload(request(file(png, "image/png", "prints"), id))).status, 200);
  assert.equal(events.at(-1).cloud, "second");
  assert.equal((await manage({ action: "remove", id: second.id }, id)).status, 200);
  assert.equal((await adminUpload(request(file(png, "image/png", "prints"), id))).status, 200);
  assert.equal(events.at(-1).cloud, "fixture-default");
  assert.equal((await manage({ action: "activate", id: "../bad" }, id)).status, 400);
  const legacy = await getDoc(doc(env.unauthenticatedContext().firestore(), "designs/legacy"));
  assert.equal(legacy.data().preview_image_url, "https://old-assets.invalid/unchanged.png");
});
