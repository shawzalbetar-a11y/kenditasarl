import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { test } from "node:test";

// Baseline evidence only. All geometry, objects, URLs and labels are synthetic.
const fixtureRequire = createRequire(
  new URL("../firestore/package.json", import.meta.url),
);
const { chromium } = fixtureRequire("playwright-core");
const { build } = fixtureRequire("esbuild");
const root = fileURLToPath(new URL("../../", import.meta.url));
const sharp = createRequire(new URL("../../package.json", import.meta.url))(
  "sharp",
);
const evidence = resolve(root, "docs/production/phase4-coordinate-proof.png");

test("two historical editor frames produce identical Fabric and 03B snapshots with different physical positions", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.route(/^https?:/, (route) => route.abort());
    await page.route("https://fixture.invalid/", r=>r.fulfill({contentType:"text/html",body:"<html></html>"}));
    await page.goto("https://fixture.invalid/");
    const bundle = await build({
      stdin: {
        contents: `
        import { fabric } from "fabric";
        import JSZip from "jszip";
        import { generateProductionZip } from "./production-zip";
        import { checkDesignQuality } from "./production-quality";
        import { renderProductionFile } from "./production-renderer";
        Object.assign(window,{fabric,JSZip,generateProductionZip,checkDesignQuality,renderProductionFile});
      `,
        resolveDir: resolve(root, "kenditasarl-admin/src/lib"),
      },
      bundle: true,
      write: false,
      platform: "browser",
      logLevel: "silent",
    });
    // Playwright serializes evaluate callbacks separately from the tsx module.
    await page.addScriptTag({content:"window.__name = (fn) => fn;"});
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const cases = await page.evaluate(async () => {
      const { fabric } = window;
      const views = [
        { width: 380, height: 532, panX: 90, panY: 126, cropX: 0, cropY: 0 },
        { width: 2000, height: 2000, panX: 0, panY: 0, cropX: 100, cropY: 120 },
      ];
      const result = [];
      for (const v of views) {
        const scene = new fabric.StaticCanvas(null, {
          width: v.width,
          height: v.height,
          enableRetinaScaling: false,
        });
        scene.setViewportTransform([1, 0, 0, 1, v.panX, v.panY]);
        scene.add(
          new fabric.Rect({
            left: 140,
            top: 160,
            width: 12,
            height: 12,
            strokeWidth: 0,
            fill: "#e00068",
          }),
        );
        const json = scene.toJSON(["name", "originalAssetId"]);
        const paper = document.createElement("canvas");
        paper.width = 200;
        paper.height = 280;
        scene.renderAll();
        paper
          .getContext("2d")
          .drawImage(
            scene.getElement(),
            v.panX + v.cropX,
            v.panY + v.cropY,
            200,
            280,
            0,
            0,
            200,
            280,
          );
        result.push({ json, png: paper.toDataURL("image/png").split(",")[1] });
        scene.dispose();
      }
      return result;
    });
    assert.equal(cases[0].json.version, "5.3.0");
    assert.deepEqual(cases[0].json, cases[1].json);
    const area = {
      left: 100,
      top: 120,
      width: 200,
      height: 280,
      nativeWidth: 2000,
      nativeHeight: 2000,
      physicalWidthCm: 5.08,
      physicalHeightCm: 7.112,
      targetDPI: 100,
    };
    const config = {
      enabled: true,
      garmentType: "tshirt",
      faces: {
        front: { enabled: true, printArea: area },
        back: { enabled: true, printArea: area },
      },
    };
    const snapshot = {
      snapshotVersion: 1,
      editorVersion: 1,
      customization_config: config,
      printAreas: { front: area, back: area },
    };
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const { artwork, digest } = await import(
      "../../src/lib/server/checkoutArt"
    );
    const locked = [];
    const panels = [];
    for (const [index, c] of cases.entries()) {
      const face = JSON.stringify(c.json);
      const design = {
        color: "red",
        canvas_json: JSON.stringify({
          "red:::front": face,
          "red:::back": face,
        }),
        production_snapshot: JSON.stringify(snapshot),
        print_area_config: JSON.stringify(
          index === 0 ? area : { left: 0, top: 0, width: 2000, height: 2000 },
        ),
      };
      const source = JSON.stringify(design);
      const { art } = await artwork(
        design,
        { color: "red" },
        "red",
        { customization_config: config },
        () => {
          throw Error("unexpected asset");
        },
      );
      assert.equal(JSON.stringify(design), source);
      assert.deepEqual(Object.keys(JSON.parse(art.canvas_json)).sort(), [
        "back",
        "front",
      ]);
      locked.push(art);
      const png = Buffer.from(c.png, "base64");
      const { data, info } = await sharp(png)
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.deepEqual([info.width, info.height, info.channels], [200, 280, 4]);
      const alpha = (x, y) => data[(y * 200 + x) * 4 + 3];
      assert.equal(alpha(40, 40), index === 1 ? 255 : 0);
      assert.equal(alpha(140, 160), index === 0 ? 255 : 0);
      panels.push(png);
    }
    assert.deepEqual(locked[0], locked[1]);
    assert.equal(digest(locked[0]), digest(locked[1]));

    // Exercise the actual admin code with a missing image, then inspect the resulting ZIP.
    const findings = await page.evaluate(
      async ({ area, face }) => {
        const url = "https://fixture.invalid/missing.png";
        const bitmap = {
          type: "image",
          src: url,
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          scaleX: 1,
          scaleY: 1,
        };
        const quality = await window.checkDesignQuality(
          JSON.stringify({ objects: [bitmap] }),
          area,
          200,
          280,
          "en",
        );
        const rendered = await window.renderProductionFile(
          JSON.stringify(face),
          area,
          2000,
          2000,
        );
        const makeZip = (sources) => window.generateProductionZip(
          "demo-order",
          "demo-design",
          "demo-shirt",
          "red",
          "1",
          [
            {
              face: "front",
              blob: rendered,
              config: area,
              pixelWidth: 200,
              pixelHeight: 280,
            },
          ],
          sources, ["front"], sources,
        );
        let rejected = false;
        try { await makeZip([{face:"front",url,type:"image"}]); } catch { rejected = true; }
        const zipBlob = await makeZip([]);
        const zip = await window.JSZip.loadAsync(await zipBlob.arrayBuffer());
        const manifest = JSON.parse(
          await zip.file("production-info.json").async("string"),
        );
        const missing = manifest.rawAssets.filter(
          (a) => a.localFileName && !zip.file(a.localFileName),
        ).length;
        const wrap = {
          physicalWidthCm: 23,
          physicalHeightCm: 9.5,
          targetDPI: 300,
        };
        const mug = await window.renderProductionFile(
          JSON.stringify(face),
          wrap,
          1840,
          760,
        );
        const image = await createImageBitmap(mug);
        const dimensions = [image.width, image.height];
        image.close();
        return {
          missingImageStatus: quality.status, rejected,
          missingManifestFiles: missing,
          mugPixels: dimensions,
        };
      },
      { area, face: cases[0].json },
    );
    assert.deepEqual(findings.mugPixels, [2717, 1122]);
    assert.equal(findings.missingImageStatus, "NOT_READY");
    assert.equal(findings.rejected, true);
    assert.equal(findings.missingManifestFiles, 0);
    // Reference montage. Titles and the paper background are outside both print files.
    const labels = Buffer.from(
      '<svg width="500" height="360" xmlns="http://www.w3.org/2000/svg"><g font-family="sans-serif" fill="#172337"><text x="18" y="26" font-size="17">Print-area origin</text><text x="260" y="26" font-size="17">Full-mockup origin</text><text x="18" y="345" font-size="14">Marker at (140, 160)</text><text x="260" y="345" font-size="14">Marker at (40, 40)</text></g><g fill="white" stroke="#597086"><rect x="18" y="39" width="202" height="282"/><rect x="260" y="39" width="202" height="282"/></g></svg>',
    );
    await mkdir(dirname(evidence), { recursive: true });
    if (process.env.WRITE_PHASE4_PROOF === "1") await writeFile(
      evidence,
      await sharp({
        create: { width: 500, height: 360, channels: 4, background: "#eef2f6" },
      })
        .composite([
          { input: labels, top: 0, left: 0 },
          { input: panels[0], top: 40, left: 19 },
          { input: panels[1], top: 40, left: 261 },
        ])
        .png()
        .toBuffer(),
    );
  } finally {
    await browser.close();
  }
});
