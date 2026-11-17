import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";

function app() {
  const name = "cloudinary-server";
  const existing = getApps().find(candidate => candidate.name === name);
  if (existing) return existing;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "demo-kenditasarla-rules";
  if (!projectId) throw new Error("project_unconfigured");

  const isDemo = projectId.startsWith("demo-") || process.env.ISOLATED_DEV_MODE === "1";
  if (isDemo) {
    if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new Error("isolated_dev_guard: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are required in isolated mode");
    }
    return initializeApp({ projectId }, name);
  }

  // Server credentials resolution:
  // 1. Explicit Service Account Key JSON if provided in env
  // 2. Otherwise Google Application Default Credentials (ADC) for trusted environments (Cloud Run, GKE, VM, gcloud auth)
  let credential = undefined;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
    } catch {
      console.error("[AUTH] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON");
    }
  } else {
    try {
      credential = applicationDefault();
    } catch {
      // In local unconfigured dev mode without ADC, credential remains undefined.
      // Calls requiring server-side verification will fail-closed with 503.
    }
  }

  return initializeApp({
    projectId,
    ...(credential ? { credential } : {}),
  }, name);
}

export function serverAuth() { return getAuth(app()); }

export function serverDb() {
  return getFirestore(app());
}

function isServerCredentialError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string | number })?.code;

  if (
    typeof msg === "string" && (
      msg.includes("Could not load the default credentials") ||
      msg.includes("default credentials") ||
      msg.includes("The incoming token has expired") ||
      msg.includes("UNAUTHENTICATED") ||
      msg.includes("metadata.google.internal") ||
      msg.includes("Failed to get credentials")
    )
  ) {
    return true;
  }

  if (
    code === "app/invalid-credential" ||
    code === "auth/invalid-credential" ||
    code === "auth/credential-error" ||
    code === 16 // UNAVAILABLE
  ) {
    return true;
  }

  return false;
}

export async function authorize(request: Request, adminOnly: boolean, allowGuest = true): Promise<string | number> {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") || "");
  if (!match) return 401;

  const rawToken = match[1];
  const auth = getAuth(app());
  let uid: string;

  try {
    // Explicit security policy: checkRevoked is ALWAYS true.
    // It is NEVER disabled or downgraded when credentials are absent.
    const token = await auth.verifyIdToken(rawToken, true);
    if (!allowGuest && token.firebase.sign_in_provider === "anonymous") return 403;
    uid = token.uid;
  } catch (err) {
    if (isServerCredentialError(err)) {
      console.error("[AUTH] Server credentials unavailable to verify token revocation: returning 503");
      return 503;
    }
    // Token validation failure: expired, revoked, invalid signature, or wrong project audience
    const errCode = (err as { code?: string })?.code || "invalid_token";
    console.warn(`[AUTH] verifyIdToken rejected: ${errCode}`);
    return 401;
  }

  // Trust boundary enforcement: reject client spoofing if x-user-id conflicts with token UID
  const clientProvidedUid = request.headers.get("x-user-id");
  if (clientProvidedUid && clientProvidedUid !== uid) {
    return 403;
  }

  if (adminOnly) {
    try {
      const adminDoc = await serverDb().doc(`admins/${uid}`).get();
      if (!adminDoc.exists) return 403;
      const role = adminDoc.get("role");
      if (role !== "admin" && role !== "superadmin") return 403;
    } catch (err) {
      if (isServerCredentialError(err)) {
        console.error("[AUTH] Server credentials unavailable to verify admin role: returning 503");
        return 503;
      }
      console.error("[AUTH] serverDb admin check failed:", (err as { code?: string })?.code || "error");
      return 503;
    }
  }

  return uid;
}

export type CloudAccount = { cloud_name: string; api_key: string; api_secret: string };

export function environmentAccount(): CloudAccount {
  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
  if (!cloud_name || !api_key || !api_secret) throw new Error("storage_unconfigured");
  return { cloud_name, api_key, api_secret };
}

export function sendImage(bytes: Buffer, folder: string, account: CloudAccount) {
  if (process.env.MOCK_CLOUDINARY === "1") {
    const crypto = require("node:crypto");
    const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    return Promise.resolve({
      url: `https://res.cloudinary.com/${account.cloud_name}/image/upload/v1700000000/${folder}/mock_${hash}.png`,
      public_id: `${folder}/mock_${hash}`,
    });
  }

  return new Promise<{ url: string; public_id: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream({
      ...account, folder, resource_type: "image", overwrite: false,
      allowed_formats: ["png", "jpg", "webp", "svg"],
    }, (error, result) => {
      if (error || !result?.secure_url?.startsWith("https://")) return reject(new Error("upload_failed"));
      resolve({ url: result.secure_url, public_id: result.public_id });
    }).end(bytes);
  });
}
