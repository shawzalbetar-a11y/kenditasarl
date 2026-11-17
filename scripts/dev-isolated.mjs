/**
 * Kendin Tasarla — Isolated Local Development & Multi-Account Cloudinary Runner
 * 
 * Runs:
 * - Firebase Auth Emulator (127.0.0.1:19099)
 * - Firestore Emulator (127.0.0.1:18080)
 * - Project ID: demo-kenditasarla-rules
 * - Store frontend: http://localhost:3000
 * - Admin dashboard: http://localhost:3001
 * - Mock Cloudinary Engine: 0 external network calls, zero real secret leakage
 */

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const ROOT_DIR = "D:\\kenditasarl";
const ADMIN_DIR = path.join(ROOT_DIR, "kenditasarl-admin");
const FIREBASE_BIN = path.join(ROOT_DIR, "tests", "firestore", "node_modules", ".bin", "firebase.cmd");
const FIREBASE_JSON = path.join(ROOT_DIR, "firebase.json");

export const ISOLATED_ENV = {
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-kenditasarla-rules",
  GCLOUD_PROJECT: "demo-kenditasarla-rules",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:18080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:19099",
  NEXT_PUBLIC_FIREBASE_EMULATOR: "1",
  NEXT_PUBLIC_CHECKOUT_EMULATOR: "1",
  MOCK_CLOUDINARY: "1",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", // Strictly unconfigured for complete isolation
};

// Apply isolated environment variables immediately to current process
Object.assign(process.env, ISOLATED_ENV);

export function checkPort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

export async function waitForPort(port, host = "127.0.0.1", timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkPort(port, host)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

export async function seedEmulators() {
  console.log("\n[SEED] Initializing isolated mock data in Firebase Emulators...");
  const appName = "local-dev-seeder";
  const existing = getApps().find(a => a.name === appName);
  const app = existing || initializeApp({ projectId: "demo-kenditasarla-rules" }, appName);

  const auth = getAuth(app);
  const db = getFirestore(app);

  // 1. Mock Admin User
  const adminEmail = "admin@kenditasarla.local";
  const adminPassword = "AdminPassword123!";
  let adminUid = "mock-admin-01";
  try {
    const existingUser = await auth.getUserByEmail(adminEmail);
    adminUid = existingUser.uid;
    console.log(`[SEED] Admin user already exists in Auth Emulator (UID: ${adminUid})`);
  } catch {
    const newUser = await auth.createUser({
      uid: adminUid,
      email: adminEmail,
      password: adminPassword,
      displayName: "Kendin Tasarla Mock Admin",
    });
    console.log(`[SEED] Created new Admin user in Auth Emulator (UID: ${newUser.uid})`);
  }

  // 2. Set admin role in Firestore Emulator
  await db.doc(`admins/${adminUid}`).set({
    role: "admin",
    email: adminEmail,
    displayName: "Kendin Tasarla Mock Admin",
    updated_at: new Date(),
  }, { merge: true });
  console.log(`[SEED] Assigned role: 'admin' to admins/${adminUid}`);

  // 3. Seed Cloudinary Mock Accounts
  const collection = db.collection("settings/storage/cloudinary");

  // Account A (Active)
  await collection.doc("mock_account_a").set({
    name: "حساب ألف التجريبي (Mock Cloudinary A)",
    cloud_name: "mock-cloud-a",
    api_key: "mock-key-alpha-12345",
    api_secret: "mock-secret-alpha-99999",
    is_active: true,
    created_at: new Date(),
  });

  // Account B (Inactive)
  await collection.doc("mock_account_b").set({
    name: "حساب باء التجريبي (Mock Cloudinary B)",
    cloud_name: "mock-cloud-b",
    api_key: "mock-key-beta-67890",
    api_secret: "mock-secret-beta-88888",
    is_active: false,
    created_at: new Date(),
  });

  console.log("[SEED] Successfully seeded Mock Account A (Active) and Mock Account B (Inactive)!");
  return { adminUid, adminEmail, adminPassword };
}

export async function ensureEmulators() {
  let emuAuth = await checkPort(19099);
  let emuFirestore = await checkPort(18080);
  if (!emuAuth || !emuFirestore) {
    console.log("[RUNNER] Starting Firebase Emulators (Auth: 19099, Firestore: 18080)...");
    const emuChild = spawn(FIREBASE_BIN, [
      "emulators:start",
      "--only", "auth,firestore",
      "--project", "demo-kenditasarla-rules",
      "--config", FIREBASE_JSON,
    ], {
      cwd: ROOT_DIR,
      env: ISOLATED_ENV,
      stdio: "pipe",
      shell: true,
    });
    emuChild.stdout.on("data", d => {
      const s = d.toString();
      if (s.includes("All emulators ready") || s.includes("Firestore Emulator UI")) {
        process.stdout.write("[EMU] " + s);
      }
    });
    emuChild.stderr.on("data", d => process.stderr.write("[EMU ERR] " + d));

    const [fsReady, authReady] = await Promise.all([
      waitForPort(18080, "127.0.0.1", 35000),
      waitForPort(19099, "127.0.0.1", 35000),
    ]);
    if (!fsReady || !authReady) {
      throw new Error(`Emulators failed to start in time (Firestore: ${fsReady}, Auth: ${authReady})`);
    }
    console.log("[RUNNER] Firebase Emulators are ready!");
  } else {
    console.log("[RUNNER] Firebase Emulators are active on ports 19099 and 18080.");
  }
}

export async function runPracticalTests() {
  console.log("\n=======================================================");
  console.log("=== PHASE 2D: PRACTICAL REQUIREMENTS VERIFICATION ===");
  console.log("=======================================================\n");

  // 1. Check or start emulators
  await ensureEmulators();
  console.log("✓ Gate 1: Emulators active on 19099 and 18080.");

  // 2. Ensure seeded data
  const { adminEmail, adminPassword, adminUid } = await seedEmulators();

  // 3. Sign in to get ID token
  const signInUrl = "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key";
  const signRes = await fetch(signInUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword, returnSecureToken: true }),
  });
  if (!signRes.ok) throw new Error("Failed to sign in via Auth Emulator");
  const { idToken } = await signRes.json();
  console.log(`✓ Gate 2: Admin signed in on Auth Emulator (Token length: ${idToken.length})`);

  // Direct route handlers from Admin codebase
  const accountsRoute = await import("../kenditasarl-admin/src/app/api/cloudinary/accounts/route.ts");
  const uploadRoute = await import("../kenditasarl-admin/src/app/api/upload/route.ts");

  // Requirement 8.1: GET accounts - zero secret leakage
  const getReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const getRes = await accountsRoute.GET(getReq);
  const accountsList = await getRes.json();
  if (getRes.status !== 200 || !Array.isArray(accountsList) || accountsList.length < 2) {
    throw new Error(`Failed to list accounts. Status: ${getRes.status}`);
  }
  for (const acc of accountsList) {
    if ("api_key" in acc || "api_secret" in acc) {
      throw new Error(`Security violation: secret or key leaked in GET projection: ${JSON.stringify(acc)}`);
    }
  }
  console.log(`✓ Gate 3: GET /api/cloudinary/accounts returned ${accountsList.length} accounts with ZERO secret leakage.`);

  // Requirement 8.2: Add a new mock account without auto-activation
  const addPayload = {
    action: "add",
    name: "حساب جيم التجريبي (Mock Cloudinary C)",
    cloud_name: "mock-cloud-c",
    api_key: "mock-key-gamma-33333",
    api_secret: "mock-secret-gamma-77777",
    activate: false,
  };
  const addReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(addPayload),
  });
  const addRes = await accountsRoute.POST(addReq);
  if (addRes.status !== 200) throw new Error(`Add account failed with status ${addRes.status}`);
  
  // Verify it was added as inactive
  const postAddList = await (await accountsRoute.GET(getReq)).json();
  const addedAcc = postAddList.find(a => a.cloud_name === "mock-cloud-c");
  if (!addedAcc || addedAcc.is_active !== false) {
    throw new Error("Newly added account must have is_active: false");
  }
  console.log("✓ Gate 4: Successfully added Account C without auto-activating it.");

  // Requirement 8.3: Atomic switching between accounts
  const accB = postAddList.find(a => a.cloud_name === "mock-cloud-b");
  if (!accB) throw new Error("Account B not found");
  const switchReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "activate", id: accB.id }),
  });
  const switchRes = await accountsRoute.POST(switchReq);
  if (switchRes.status !== 200) throw new Error("Switching active account failed");

  const postSwitchList = await (await accountsRoute.GET(getReq)).json();
  const activeCount = postSwitchList.filter(a => a.is_active).length;
  const newActive = postSwitchList.find(a => a.is_active);
  if (activeCount !== 1 || newActive.cloud_name !== "mock-cloud-b") {
    throw new Error(`Atomic activation failed. Active count: ${activeCount}, Active: ${newActive?.cloud_name}`);
  }
  console.log("✓ Gate 5: Atomic activation verified: Exactly 1 active account (Account B).");

  // Requirement 8.4: Prevention of deleting active account
  const deleteReq = new Request("http://localhost:3001/api/cloudinary/accounts", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "remove", id: accB.id }),
  });
  const deleteRes = await accountsRoute.POST(deleteReq);
  const deleteJson = await deleteRes.json();
  if (deleteRes.status !== 400 || deleteJson.error !== "cannot_delete_active_account") {
    throw new Error(`Failed to block deletion of active account: ${JSON.stringify(deleteJson)}`);
  }
  console.log("✓ Gate 6: Deleting active account strictly forbidden with 400 cannot_delete_active_account.");

  // Requirement 8.5: Upload route uses Mock Cloudinary without external network
  const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const dummyPng = Buffer.from(VALID_PNG_BASE64, "base64");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(dummyPng)], { type: "image/png" }), "test.png");
  form.append("folder", "products/gallery");

  const uploadReq = new Request("http://localhost:3001/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "x-user-id": adminUid,
    },
    body: form,
  });
  const uploadRes = await uploadRoute.POST(uploadReq);
  const uploadJson = await uploadRes.json();
  if (uploadRes.status !== 200 || !uploadJson.success || !uploadJson.url.includes("mock-cloud-b")) {
    throw new Error(`Upload test failed: status ${uploadRes.status}, body: ${JSON.stringify(uploadJson)}`);
  }
  console.log(`✓ Gate 7: Safe Mock upload succeeded to active Account B: ${uploadJson.url}`);

  // Requirement 8.6: Language Parity (AR, TR, EN)
  for (const lang of ["ar", "tr", "en"]) {
    const filePath = path.join(ADMIN_DIR, "messages", `${lang}.json`);
    const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!content.CloudStorage || !content.CloudStorage.title || !content.CloudStorage.retry || !content.CloudStorage.cannotDeleteActive) {
      throw new Error(`Language file missing required CloudStorage keys: ${lang}.json`);
    }
  }
  console.log("✓ Gate 8: Multi-language parity verified across ar.json, tr.json, and en.json.");

  console.log("\n=======================================================");
  console.log(" ALL 8 PHASE 2D PRACTICAL REQUIREMENTS PASSED 100%! ");
  console.log("=======================================================\n");
}

export async function startAll() {
  console.log("============================================================");
  console.log("   KENDIN TASARLA — UNIFIED ISOLATED LOCAL DEV RUNNER       ");
  console.log("============================================================");

  // 1. Check or start emulators
  let emuAuth = await checkPort(19099);
  let emuFirestore = await checkPort(18080);

  if (!emuAuth || !emuFirestore) {
    console.log("[RUNNER] Starting Firebase Emulators (Auth: 19099, Firestore: 18080)...");
    const emuChild = spawn(FIREBASE_BIN, [
      "emulators:start",
      "--only", "auth,firestore",
      "--project", "demo-kenditasarla-rules",
      "--config", FIREBASE_JSON,
    ], {
      cwd: ROOT_DIR,
      env: ISOLATED_ENV,
      stdio: "pipe",
      shell: true,
    });
    emuChild.stdout.on("data", d => process.stdout.write("[EMU] " + d));
    emuChild.stderr.on("data", d => process.stderr.write("[EMU ERR] " + d));

    const ready = await waitForPort(18080, "127.0.0.1", 30000);
    if (!ready) {
      console.error("[ERROR] Emulators failed to start in time. Aborting.");
      process.exit(1);
    }
    console.log("[RUNNER] Firebase Emulators are ready!");
  } else {
    console.log("[RUNNER] Firebase Emulators are active on ports 19099 and 18080.");
  }

  // 2. Seed mock data
  await seedEmulators();

  // 3. Start Store on port 3000
  console.log("[RUNNER] Starting Store frontend on http://localhost:3000...");
  const storeBin = path.join(ROOT_DIR, "node_modules", ".bin", "next.cmd");
  const storeChild = spawn(storeBin, ["dev", "-p", "3000", "-H", "0.0.0.0"], {
    cwd: ROOT_DIR,
    env: ISOLATED_ENV,
    stdio: "pipe",
    shell: true,
  });
  storeChild.stdout.on("data", d => {
    const s = d.toString();
    if (s.includes("Ready in") || s.includes("started server on") || s.includes("compiled") || s.includes("error")) {
      process.stdout.write("[STORE] " + s);
    }
  });
  storeChild.stderr.on("data", d => process.stderr.write("[STORE ERR] " + d));

  // 4. Start Admin on port 3001
  console.log("[RUNNER] Starting Admin dashboard on http://localhost:3001...");
  const adminBin = path.join(ADMIN_DIR, "node_modules", ".bin", "next.cmd");
  const adminChild = spawn(adminBin, ["dev", "-p", "3001"], {
    cwd: ADMIN_DIR,
    env: ISOLATED_ENV,
    stdio: "pipe",
    shell: true,
  });
  adminChild.stdout.on("data", d => {
    const s = d.toString();
    if (s.includes("Ready in") || s.includes("started server on") || s.includes("compiled") || s.includes("error")) {
      process.stdout.write("[ADMIN] " + s);
    }
  });
  adminChild.stderr.on("data", d => process.stderr.write("[ADMIN ERR] " + d));

  console.log("[RUNNER] Waiting for Next.js servers to listen on ports 3000 and 3001...");
  const [storeReady, adminReady] = await Promise.all([
    waitForPort(3000, "127.0.0.1", 45000),
    waitForPort(3001, "127.0.0.1", 45000),
  ]);

  if (!storeReady || !adminReady) {
    console.error(`[ERROR] Timeout waiting for dev servers (Store: ${storeReady}, Admin: ${adminReady})`);
  }

  console.log("\n------------------------------------------------------------");
  console.log("🚀 LOCAL DEVELOPMENT ENVIRONMENT IS RUNNING!");
  console.log("------------------------------------------------------------");
  console.log("• Store Frontend:       http://localhost:3000");
  console.log("• Admin Dashboard:      http://localhost:3001");
  console.log("• Cloudinary Settings:  http://localhost:3001/settings/cloudinary");
  console.log("• Auth Emulator:        http://127.0.0.1:19099");
  console.log("• Firestore Emulator:   http://127.0.0.1:18080");
  console.log("• Firebase Project ID:  demo-kenditasarla-rules");
  console.log("• Mock Admin Login:     admin@kenditasarla.local");
  console.log("• Mock Admin Password:  AdminPassword123!");
  console.log("• Production Status:    COMPLETELY ISOLATED (0 real credentials used)");
  console.log("------------------------------------------------------------\n");

  const shutdown = () => {
    console.log("\n[RUNNER] Shutting down local servers...");
    try { storeChild.kill(); } catch {}
    try { adminChild.kill(); } catch {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// CLI entrypoint
const cmd = process.argv[2] || "status";
if (cmd === "seed") {
  seedEmulators().catch(console.error);
} else if (cmd === "test") {
  runPracticalTests().catch(e => { console.error("\n❌ Test failure:", e); process.exit(1); });
} else if (cmd === "start") {
  startAll().catch(console.error);
} else {
  Promise.all([checkPort(3000), checkPort(3001), checkPort(19099), checkPort(18080)]).then(([s3000, s3001, s19099, s18080]) => {
    console.log(`Ports status: Store(3000): ${s3000}, Admin(3001): ${s3001}, Auth(19099): ${s19099}, Firestore(18080): ${s18080}`);
  });
}
