import { spawn } from "node:child_process";
import { fixtureApp } from "./checkout-fixture.mjs";
const admin = process.argv[2] === "admin";
const { dir, env, bin, clean } = await fixtureApp(admin);
// Production bundles in temporary source copies; static builds do not initialize Firebase.
env.NEXT_PUBLIC_FIREBASE_API_KEY = "";
const child = spawn(
  process.execPath,
  [bin, "build", ...(admin ? ["--webpack"] : [])],
  { cwd: dir, env, stdio: "inherit", windowsHide: true },
);
child.on("exit", async (code) => {
  process.exitCode = code ?? 1;
  await clean();
});
