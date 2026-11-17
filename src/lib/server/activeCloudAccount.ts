import { environmentAccount, serverDb, type CloudAccount } from "./cloudinaryServer";

export type { CloudAccount };

export type ActiveAccountResolution = {
  account: CloudAccount;
  source: "firestore" | "environment_fallback";
  accountId?: string;
  accountName?: string;
};

let cachedResolution: { data: ActiveAccountResolution; expiresAt: number } | null = null;

export function invalidateActiveAccountCache(): void {
  cachedResolution = null;
}

export function getCachedActiveAccountResolution(): ActiveAccountResolution | null {
  if (cachedResolution && Date.now() < cachedResolution.expiresAt) {
    return cachedResolution.data;
  }
  return null;
}

/**
 * Resolves the active Cloudinary account from Firestore (`settings/storage/cloudinary`).
 * 
 * By default, queries Firestore directly to ensure zero-stale consistency across
 * independent server processes (Store on port 3000 and Admin on port 3001).
 * 
 * If `options.useCache` is explicitly enabled, it caches the resolution for `ttlMs`
 * (default 1000ms), but will immediately flush if `invalidateActiveAccountCache()` is called.
 */
export async function resolveActiveAccount(options?: {
  useCache?: boolean;
  ttlMs?: number;
}): Promise<ActiveAccountResolution> {
  const now = Date.now();
  if (options?.useCache && cachedResolution && now < cachedResolution.expiresAt) {
    return cachedResolution.data;
  }

  const collection = serverDb().collection("settings/storage/cloudinary");

  // Query up to 2 active accounts to detect ambiguous configurations
  const activeSnap = await collection.where("is_active", "==", true).limit(2).get();

  if (activeSnap.size > 1) {
    throw new Error("ambiguous_storage");
  }

  if (activeSnap.empty) {
    const anySnap = await collection.limit(1).get();
    if (anySnap.empty) {
      // Transition Policy: Collection is completely empty (legacy unmigrated system).
      // Fall back strictly to environment credentials.
      const envAcc = environmentAccount();
      const resolution: ActiveAccountResolution = {
        account: envAcc,
        source: "environment_fallback",
      };
      if (options?.useCache) {
        cachedResolution = { data: resolution, expiresAt: now + (options.ttlMs ?? 1000) };
      }
      return resolution;
    }
    // Accounts exist in Firestore, but none is active. Reject silent fallback.
    throw new Error("no_active_cloudinary_account");
  }

  const doc = activeSnap.docs[0];
  const data = doc.data();
  const cloud_name = data.cloud_name;
  const api_key = data.api_key;
  const api_secret = data.api_secret;

  if (
    typeof cloud_name !== "string" || !cloud_name.trim() || !/^[a-z\d_-]+$/i.test(cloud_name) ||
    typeof api_key !== "string" || !api_key.trim() ||
    typeof api_secret !== "string" || !api_secret.trim()
  ) {
    throw new Error("storage_unconfigured");
  }

  const resolution: ActiveAccountResolution = {
    account: {
      cloud_name: cloud_name.trim(),
      api_key: api_key.trim(),
      api_secret: api_secret.trim(),
    },
    source: "firestore",
    accountId: doc.id,
    accountName: typeof data.name === "string" ? data.name : undefined,
  };

  if (options?.useCache) {
    cachedResolution = { data: resolution, expiresAt: now + (options.ttlMs ?? 1000) };
  }
  return resolution;
}

export async function activeAccount(options?: { useCache?: boolean; ttlMs?: number }): Promise<CloudAccount> {
  const resolution = await resolveActiveAccount(options);
  return resolution.account;
}
