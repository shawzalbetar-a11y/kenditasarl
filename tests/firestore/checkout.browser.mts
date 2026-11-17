import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { setDoc, doc, getDocs, collection } from "firebase/firestore";
import { fixtureApp, projectId } from "./checkout-fixture.mjs";
test(
  "shopper explicitly accepts the requoted legacy price and sees one COD confirmation",
  { timeout: 300000 },
  async () => {
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
    assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:19099");
    const env = await initializeTestEnvironment({
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
    const response = await fetch(
      "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "browser@example.invalid",
          password: "synthetic-password",
          returnSecureToken: true,
        }),
      },
    );
    const user = await response.json();
    assert.equal(response.status, 200);
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await Promise.all(
        [
          [
            "products/shirt",
            { name_en: "Synthetic Shirt", is_active: true, base_price: 200 },
          ],
          ["products/shirt/variants/red", { color: "red", sizes: { M: 2 } }],
          [
            "users/" + user.localId,
            { full_name: "Fixture Shopper", email: "browser@example.invalid" },
          ],
          [
            "addresses/demo",
            {
              user_id: user.localId,
              label: "Demo",
              full_address: "Fixture address",
              lat: 1,
              lng: 1,
            },
          ],
          [
            "cart_items/demo",
            {
              user_id: user.localId,
              product_id: "shirt",
              variant_id: "red_M",
              quantity: 1,
              unit_price: 180,
              design_type: "blank",
              preview_image_url: "/favicon.svg",
            },
          ],
        ].map(([p, v]) => setDoc(doc(db, p), v)),
      );
    });
    const app = await fixtureApp();
    await new Promise((resolve, reject) => {
      const build = spawn(process.execPath, [app.bin, "build"], {
        cwd: app.dir,
        env: app.env,
        windowsHide: true,
        stdio: "inherit",
      });
      build.on("error", reject);
      build.on("exit", (code) =>
        code
          ? reject(Error("Browser fixture build " + code))
          : resolve(undefined),
      );
    });
    const service = spawn(
      process.execPath,
      [app.bin, "start", "-H", "localhost", "-p", "18402"],
      {
        cwd: app.dir,
        env: app.env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let tail = "";
    service.stdout.on("data", (b) => (tail = (tail + b).slice(-2500)));
    service.stderr.on("data", (b) => (tail = (tail + b).slice(-2500)));
    let browser;
    try {
      const origin = "http://localhost:18402";
      let ready = false;
      for (let i = 0; i < 65; i++) {
        if (service.exitCode !== null) throw Error(tail);
        try {
          const res = await fetch(origin + "/en/cart", {
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok) throw Error("Cart HTTP " + res.status);
          ready = true;
          break;
        } catch (e) {
          if (e.cause?.code !== "ECONNREFUSED")
            throw Error(e.message + " " + tail);
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      assert.ok(ready, tail);
      browser = await chromium.launch({
        channel: "chrome",
        headless: true,
        timeout: 15000,
      });
      const page = await browser.newPage();
      page.setDefaultTimeout(20000);
      await page.route("**/*", (r) =>
        ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
          ? r.continue()
          : r.abort(),
      );
      await page.addInitScript(
        (u) =>
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
          ),
        user,
      );
      await page.goto(origin + "/en/cart", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Proceed to Checkout" }).click();
      await page.getByRole("radio").first().check();
      await page.getByRole("button", { name: "Continue to Delivery" }).click();
      await page.getByRole("button", { name: "Confirm & Proceed" }).click();
      await page.getByText("Previous unit price", { exact: false }).waitFor();
      const buy = page.getByRole("button", { name: "Confirm COD order" });
      assert.equal(await buy.isEnabled(), false);
      await page.getByRole("checkbox").check();
      await buy.click();
      await page.waitForURL("**/order-confirmation/**");
      await env.withSecurityRulesDisabled(async (c) => {
        const orders = await getDocs(collection(c.firestore(), "orders"));
        assert.equal(orders.size, 1);
        assert.equal(orders.docs[0].get("total_minor"), 24500);
      });
    } finally {
      await browser?.close();
      if (process.platform === "win32" && service.exitCode === null) {
        await new Promise((resolve) =>
          spawn("taskkill", ["/pid", String(service.pid), "/t", "/f"], {
            windowsHide: true,
            stdio: "ignore",
          }).once("exit", resolve),
        );
      } else service.kill();
      await env.cleanup();
      await app.clean();
    }
  },
);
