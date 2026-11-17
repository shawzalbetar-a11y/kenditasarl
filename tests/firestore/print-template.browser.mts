import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { fixtureApp, projectId } from "./checkout-fixture.mjs";
import { serverDb } from "../../src/lib/server/cloudinaryServer";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const evidence = new URL(
  "../../docs/print-templates/phase5a/",
  import.meta.url,
);
async function start(admin, port) {
  const a = await fixtureApp(admin);
  const build = spawn(
    process.execPath,
    [a.bin, "build", ...(admin ? ["--webpack"] : [])],
    { cwd: a.dir, env: a.env, windowsHide: true, stdio: "inherit" },
  );
  const [code] = await once(build, "exit");
  if (code) {
    await a.clean();
    throw Error("fixture build " + code);
  }
  const service = spawn(
    process.execPath,
    [a.bin, "start", "-H", "localhost", "-p", String(port)],
    { cwd: a.dir, env: a.env, windowsHide: true, stdio: "ignore" },
  );
  const origin = "http://localhost:" + port;
  async function close() {
    if (service.exitCode === null && process.platform === "win32")
      await once(
        spawn("taskkill", ["/pid", String(service.pid), "/t", "/f"], {
          windowsHide: true,
          stdio: "ignore",
        }),
        "exit",
      );
    else if (service.exitCode === null) service.kill();
    await a.clean();
  }
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/favicon.ico")).status < 500)
        return { origin, close };
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  await close();
  throw Error("fixture startup");
}
test(
  "admin edit link, measured tee and cap previews, draft/publish controls, public blank canvas and historical restart",
  { timeout: 300000 },
  async () => {
    assert.equal(process.env.GCLOUD_PROJECT, projectId);
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
    assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099");
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const db = serverDb(),
      tee = JSON.parse(
        await readFile(new URL("sample-tee.json", evidence), "utf8"),
      ),
      cap = JSON.parse(
        await readFile(new URL("sample-cap.json", evidence), "utf8"),
      );
    tee.productId += "-ui";
    cap.productId += "-ui";
    const signup = await fetch(
      "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "operator@browser05a.invalid",
          password: "synthetic-only-password",
          returnSecureToken: true,
        }),
      },
    );
    assert.equal(signup.status, 200);
    const user = await signup.json();
    await db.doc("admins/" + user.localId).set({ role: "admin" });
    await db.doc("users/" + user.localId).set({
      full_name: "Synthetic operator",
      email: user.email,
      phone: "+900000000000",
    });
    await db.doc("addresses/" + user.localId).set({
      user_id: user.localId,
      label: "Test",
      lat: 1,
      lng: 1,
      full_address: "Synthetic address",
    });
    const mug = structuredClone(cap);
    Object.assign(mug, {
      productId: "sample-wrap-ui",
      garmentType: "mug",
      method: "Sublimation",
      mugMeta: {
        mugStyle: "standard",
        mugCapacities: ["11oz"],
        magicRevealCoverColor: "#141414",
        handleMarginCm: 1,
        supportsFullWrap: true,
      },
    });
    Object.assign(mug.faces[0], {
      mockup:"https://assets.invalid/sample-wrap-front.png",
      space: "STANDALONE_SURFACE",
      nativeWidth: 1840,
      nativeHeight: 760,
    });
    Object.assign(mug.faces[0].placements[0], {
      id: "mug_full_wrap",
      widthCm: 23,
      heightCm: 9.5,
      rect: { left: 0, top: 0, width: 1840, height: 760 },
    });
    for (const t of [tee, cap, mug]) {
      const ref = db.doc("products/" + t.productId);
      await ref.set({
        name_en: t.productId,
        category_id: t.garmentType,
        is_active: true,
        base_price: 200,
        images: t.faces.map((f) => ({
          face: f.id,
          id: f.id,
          url: f.mockup,
          type: "blank",
        })),
      });
      await ref
        .collection("variants")
        .doc("navy")
        .set({ color: "navy", sizes: { M: 3 } });
      if (t !== tee)
        await ref
          .collection("print_template_private")
          .doc("draft")
          .set({ definition: t, revision: 1, status: "DRAFT" });
    }
    const apps = [],
      browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const admin = await start(true, 18412);
      apps.push(admin);
      const page = await browser.newPage({
        locale: "en-US",
        viewport: { width: 1440, height: 1080 },
      });
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => {
        // Report sanitized fixture diagnostics without request parameters or tokens.
        const frames = (e.stack || e.name).split("\n").slice(0, 4).map(s=>s.split("?")[0]);
        console.warn("fixture page", new URL(page.url()).pathname, frames.join(" "));
      });
      const mockup = async (url) => {
        const shape = url.includes("wrap")
          ? '<path fill="none" stroke-width="22" d="M335 195 C469 158 468 346 335 338"/><path d="M85 145 H348 V405 Q222 455 85 405 Z"/>'
          : url.includes("cap")
          ? '<path d="M73 333 Q92 143 240 142 Q361 135 402 300 L470 345 Q357 365 262 330 Z"/>'
          : '<path d="M155 55 Q250 112 345 55 L470 150 L399 230 L362 205 L366 550 L134 550 L138 205 L101 230 L30 150 Z"/>';
        return sharp(
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="600"><rect width="500" height="600" fill="#eef0ee"/><g fill="#31465b" stroke="#192c3e" stroke-width="3">' +
              shape +
              "</g></svg>",
          ),
        )
          .png()
          .toBuffer();
      };
      await page.route("**/*", async (r) => {
        const u = new URL(r.request().url());
        if (u.hostname === "assets.invalid")
          return r.fulfill({
            contentType: "image/png",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: await mockup(u.pathname),
          });
        return ["localhost", "127.0.0.1"].includes(u.hostname)
          ? r.continue()
          : r.abort();
      });
      await page.addInitScript((u) => {
        localStorage.setItem(
          "firebase:authUser:demo-key:[DEFAULT]",
          JSON.stringify({
            uid: u.localId,
            email: u.email,
            emailVerified: false,
            isAnonymous: false,
            providerData: [],
            apiKey: "demo-key",
            appName: "[DEFAULT]",
            stsTokenManager: {
              refreshToken: u.refreshToken,
              accessToken: u.idToken,
              expirationTime: Date.now() + 3600000,
            },
          }),
        );
        document.cookie = "NEXT_LOCALE=en; path=/";
      }, user);
      page.on("dialog", (d) => d.accept());
      await page.goto(admin.origin + "/products/" + tee.productId + "/edit");
      await page.getByRole("link", { name: "Print template builder" }).click();
      for (const f of tee.faces) {
        await page.getByLabel("Add face").selectOption(f.id);
        await page
          .getByRole("button", { name: "Use image dimensions" })
          .click();
        await page.getByLabel("Output mirroring").selectOption("NONE");
        const p = f.placements[0];
        await page.getByLabel("Add placement").selectOption(p.id);
        for (const [k, n] of [
          ["Width (px)", p.rect.width],
          ["Height (px)", p.rect.height],
          ["Left (px)", p.rect.left],
          ["Top (px)", p.rect.top],
          ["Print width (cm)", p.widthCm],
          ["Print height (cm)", p.heightCm],
        ])
          await page.getByLabel(k, { exact: true }).fill(String(n));
      }
      await page.getByRole("button", { name: "Front", exact: true }).click();
      const overlay = page.locator("[data-placement=full_front]"),
        box = await overlay.boundingBox();
      await page.mouse.move(box.x + 8, box.y + 8);
      await page.mouse.down();
      await page.mouse.move(box.x + 26, box.y + 20);
      await page.mouse.up();
      assert.ok(Number(await page.getByLabel("Left (px)").inputValue()) > 130);
      await page.getByLabel("Left (px)").fill("130");
      await page.getByLabel("Top (px)").fill("125");
      const handle = await overlay
        .locator("[data-handle=resize]")
        .boundingBox();
      await page.mouse.move(handle.x + 5, handle.y + 5);
      await page.mouse.down();
      await page.mouse.move(handle.x + 23, handle.y + 25);
      await page.mouse.up();
      assert.ok(
        Number(
          await page.getByLabel("Width (px)", { exact: true }).inputValue(),
        ) > 240,
      );
      await page.getByLabel("Width (px)", { exact: true }).fill("240");
      await page.getByLabel("Height (px)", { exact: true }).fill("320");
      await page.getByLabel("Add placement").selectOption("left_chest");
      await page.getByRole("button", { name: "Move earlier" }).click();
      assert.equal(
        await page
          .locator("[data-placement]")
          .first()
          .getAttribute("data-placement"),
        "left_chest",
      );
      await page.getByRole("button", { name: "Remove placement" }).click();
      assert.equal(await page.locator("[data-placement]").count(), 1);
      await page.getByRole("button", { name: "Save draft" }).click();
      await page.getByRole("button", { name: "Validate", exact: true }).click();
      await page.getByText(new RegExp(tee.productId + " · Valid")).waitFor();
      assert.equal(
        (await db.doc("products/" + tee.productId).get()).get(
          "print_template_revision",
        ),
        undefined,
      );
      await page.getByRole("button", { name: "Publish new revision" }).click();
      await page
        .getByText(new RegExp(tee.productId + " · Published"))
        .waitFor();
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      assert.match(
        await page.locator("[data-output]").innerText(),
        /2835 × 3780/,
      );
      await page.screenshot({
        path: fileURLToPath(new URL("tee-preview.png", evidence)),
        fullPage: true,
      });
      await page.goto(
        admin.origin + "/products/" + cap.productId + "/template",
      );
      await page.getByRole("button", { name: "Publish new revision" }).click();
      await page
        .getByText(new RegExp(cap.productId + " · Published"))
        .waitFor();
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      assert.match(
        await page.locator("[data-output]").innerText(),
        /1181 × 591/,
      );
      await page.screenshot({
        path: fileURLToPath(new URL("cap-preview.png", evidence)),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      const menuOverlay = page.locator("div.fixed.inset-0.md\\:hidden").last();
      if (await menuOverlay.isVisible())
        await page.locator("div.sticky.top-0 button").first().click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      await page.waitForFunction(()=>document.querySelector("aside")!.getBoundingClientRect().left>=window.innerWidth-1);
      await page.locator("[data-placement=hat_front_crown]").evaluate(el=>{
        const top=el.parentElement!.getBoundingClientRect().top+scrollY-84;
        window.scrollTo({top,behavior:"instant"});
      });
      await page.screenshot({
        path: fileURLToPath(new URL("cap-mobile.png", evidence)),
        fullPage: false,
      });
      await page.setViewportSize({ width: 1440, height: 1080 });
      await page.goto(
        admin.origin + "/products/" + mug.productId + "/template",
      );
      await page.getByRole("button", { name: "Publish new revision" }).click();
      await page
        .getByText(new RegExp(mug.productId + " · Published"))
        .waitFor();
      assert.equal(
        await page.locator("[data-placement=mug_full_wrap]").count(),
        1,
      );
      assert.equal(
        await page.getByRole("img", { name: "Blank mockup" }).isVisible(),
        true,
      );
      assert.match(
        await page.locator("[data-output]").innerText(),
        /2717 × 1122/,
      );
      const store = await start(false, 18413);
      apps.push(store);
      await page.goto(
        store.origin + "/en/design-studio/" + cap.productId + "?color=navy",
      );
      await page.locator(".upper-canvas").first().waitFor();
      assert.equal(await page.locator("#sidebarTabText").isDisabled(), true);
      assert.equal(await page.locator("#sidebarTabUpload").isDisabled(), true);
      assert.equal(
        await page.locator("#sidebarTabStickers").isDisabled(),
        false,
      );
      await page.addInitScript((id) => {
        if(sessionStorage.getItem("seed-historical-fixture"))return;
        sessionStorage.setItem("seed-historical-fixture","1");
        for (const k of Object.keys(localStorage))
          if (k.startsWith("draft_design_" + id + "@"))
            localStorage.removeItem(k);
        localStorage.setItem(
          "draft_design_" + id,
          JSON.stringify({ faces: { front: "historical" } }),
        );
      }, cap.productId);
      await page.reload();
      await page
        .getByRole("button", { name: "Start a separate design" })
        .click();
      await page.locator(".upper-canvas").first().waitFor();
      assert.match(
        await page.evaluate(
          (id) => localStorage.getItem("draft_design_" + id),
          cap.productId,
        ),
        /historical/,
      );
    } finally {
      await browser.close();
      for (const a of apps.reverse()) await a.close();
      const sdk = createRequire(new URL("../../package.json", import.meta.url))(
        "firebase-admin/app",
      );
      await Promise.all(sdk.getApps().map(sdk.deleteApp));
    }
  },
);
