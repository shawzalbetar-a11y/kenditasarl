import { mkdtemp, cp, mkdir, writeFile, access, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectId = "demo-kenditasarla-rules";
export async function fixtureApp(admin = false) {
  const root = fileURLToPath(
    new URL(admin ? "../../kenditasarl-admin/" : "../../", import.meta.url),
  );
  await mkdir(path.join(root, ".next"), { recursive: true });
  const dir = await mkdtemp(path.join(root, ".next", "checkout-fixture-"));
  for (const entry of [
    "src",
    "public",
    "messages",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.mjs",
    "next.config.ts",
    "postcss.config.js",
    "postcss.config.mjs",
    "tailwind.config.ts",
    "next-env.d.ts",
    "eslint.config.mjs",
  ]) {
    try {
      await access(path.join(root, entry));
    } catch {
      continue;
    }
    await cp(path.join(root, entry), path.join(dir, entry), {
      recursive: true,
    });
  }
  const font = path.join(dir, "font-fixture.cjs");
  await writeFile(
    font,
    "module.exports = new Proxy({}, {get: () => \"@font-face { font-family: 'IBM Plex Sans Arabic'; src: local('Arial'); }\"});",
  );
  const env = {
    ...process.env,
    NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
    NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app",
    NEXT_PUBLIC_CHECKOUT_EMULATOR: "1",
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: font,
    NEXT_TELEMETRY_DISABLED: "1",
    GCE_METADATA_HOST: "127.0.0.1:9",
    GOOGLE_MAPS_SERVER_KEY: "",
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "",
    FIREBASE_SERVICE_ACCOUNT_KEY: "",
    GCLOUD_PROJECT: projectId,
  };
  async function clean() {
    if (
      path.dirname(path.resolve(dir)) !== path.resolve(root, ".next") ||
      !/^checkout-fixture-[\w-]+$/.test(path.basename(dir))
    )
      throw Error("Unexpected fixture path");
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
  return {
    dir,
    env,
    clean,
    bin: path.join(root, "node_modules/next/dist/bin/next"),
  };
}
