import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { serverDb } from "./cloudinaryServer";

// =========================================================================
// PRODUCTION-GRADE DISTRIBUTED RATE LIMITER & TRUSTED PROXY IP RESOLUTION
// =========================================================================

export type ProxyProvider = "vercel" | "cloudflare" | "custom" | "none" | "auto";

export interface ProxyTrustConfig {
  provider: ProxyProvider;
  trustedProxies?: string[];       // Explicit upstream proxy IPs for "custom"
  trustHopCount?: number;          // Number of trusted hops from the right in X-Forwarded-For (default: 1)
  cloudflareSecretHeader?: string; // Optional secret header name if validating Cloudflare origin pull
  cloudflareSecretValue?: string;  // Expected secret value
}

export interface ClientIpResolution {
  ip: string | null;
  isTrusted: boolean;
  provider: ProxyProvider;
  ipFamily?: "IPv4" | "IPv6";
  sourceHeader?: string;
}

/**
 * Validates IPv4 or IPv6 format using standard Node.js net.isIP parser.
 * Immune to regular expression Denial of Service (ReDoS) and malicious header injection.
 */
export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;
  return isIP(ip.trim()) !== 0;
}

/**
 * Returns IP family ("IPv4" or "IPv6") or null if invalid.
 */
export function getIpFamily(ip: string): "IPv4" | "IPv6" | null {
  if (!ip || typeof ip !== "string") return null;
  const version = isIP(ip.trim());
  if (version === 4) return "IPv4";
  if (version === 6) return "IPv6";
  return null;
}

/**
 * Produces a deterministic, truncated SHA-256 hash of the normalized IP address.
 * Used for Firestore rate limit document keys to preserve customer privacy (GDPR / PII minimization).
 */
export function hashIpForRateLimit(ip: string): string {
  const normalized = ip.trim().toLowerCase();
  return createHash("sha256").update(`kenditasarl_ip_${normalized}`).digest("hex").slice(0, 24);
}

/**
 * Resolves current environment proxy trust configuration.
 */
export function getProxyTrustConfig(override?: Partial<ProxyTrustConfig>): ProxyTrustConfig {
  if (override?.provider) {
    return {
      provider: override.provider,
      trustedProxies: override.trustedProxies || [],
      trustHopCount: override.trustHopCount ?? 1,
      cloudflareSecretHeader: override.cloudflareSecretHeader,
      cloudflareSecretValue: override.cloudflareSecretValue,
    };
  }

  const envProvider = process.env.TRUST_PROXY_PROVIDER?.toLowerCase() as ProxyProvider | undefined;
  if (envProvider && ["vercel", "cloudflare", "custom", "none", "auto"].includes(envProvider)) {
    return {
      provider: envProvider,
      trustedProxies: process.env.TRUSTED_PROXY_IPS ? process.env.TRUSTED_PROXY_IPS.split(",").map((s) => s.trim()) : [],
      trustHopCount: process.env.TRUSTED_PROXY_HOPS ? parseInt(process.env.TRUSTED_PROXY_HOPS, 10) : 1,
      cloudflareSecretHeader: process.env.CLOUDFLARE_SECRET_HEADER,
      cloudflareSecretValue: process.env.CLOUDFLARE_SECRET_VALUE,
    };
  }

  // Auto-detect Vercel environment
  if (process.env.VERCEL === "1") {
    return { provider: "vercel", trustHopCount: 1 };
  }

  // Default to adaptive auto-mode for local dev / backward compatibility
  return { provider: "auto", trustHopCount: 1 };
}

/**
 * Resolves client IP address strictly according to the configured environment trust policy.
 * Refuses to accept forged headers when outside the verified proxy environment.
 */
export function resolveClientIp(
  request: Request,
  configOverride?: Partial<ProxyTrustConfig>
): ClientIpResolution {
  const config = getProxyTrustConfig(configOverride);

  // 1. Vercel Trusted Environment
  // On Vercel, the edge router unconditionally sets x-vercel-forwarded-for with the real client IP.
  if (config.provider === "vercel") {
    const vercelHeader = request.headers.get("x-vercel-forwarded-for");
    if (vercelHeader) {
      const candidate = vercelHeader.split(",")[0].trim();
      if (isValidIp(candidate)) {
        return {
          ip: candidate,
          isTrusted: true,
          provider: "vercel",
          ipFamily: getIpFamily(candidate)!,
          sourceHeader: "x-vercel-forwarded-for",
        };
      }
    }
    // If x-vercel-forwarded-for is missing, this request did not traverse Vercel edge router
    return { ip: null, isTrusted: false, provider: "vercel" };
  }

  // 2. Cloudflare Trusted Environment
  // Behind Cloudflare, cf-connecting-ip is trusted only when origin isolation/secret is validated.
  if (config.provider === "cloudflare") {
    if (config.cloudflareSecretHeader && config.cloudflareSecretValue) {
      const secret = request.headers.get(config.cloudflareSecretHeader);
      if (secret !== config.cloudflareSecretValue) {
        return { ip: null, isTrusted: false, provider: "cloudflare" };
      }
    }

    const cfIp = request.headers.get("cf-connecting-ip");
    if (cfIp) {
      const candidate = cfIp.trim();
      if (isValidIp(candidate)) {
        return {
          ip: candidate,
          isTrusted: true,
          provider: "cloudflare",
          ipFamily: getIpFamily(candidate)!,
          sourceHeader: "cf-connecting-ip",
        };
      }
    }
    return { ip: null, isTrusted: false, provider: "cloudflare" };
  }

  // 3. Custom Reverse Proxy Environment
  // Inspects X-Forwarded-For at configured trust depth, or x-real-ip
  if (config.provider === "custom") {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
      const targetIndex = parts.length - (config.trustHopCount ?? 1);
      const candidate = targetIndex >= 0 ? parts[targetIndex] : null;
      if (candidate && isValidIp(candidate)) {
        return {
          ip: candidate,
          isTrusted: true,
          provider: "custom",
          ipFamily: getIpFamily(candidate)!,
          sourceHeader: "x-forwarded-for",
        };
      }
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp && isValidIp(realIp.trim())) {
      return {
        ip: realIp.trim(),
        isTrusted: true,
        provider: "custom",
        ipFamily: getIpFamily(realIp.trim())!,
        sourceHeader: "x-real-ip",
      };
    }
    return { ip: null, isTrusted: false, provider: "custom" };
  }

  // 4. Untrusted / Direct Origin / None Provider
  // Outside any verified proxy, all client-sent proxy headers are strictly rejected as untrusted
  if (config.provider === "none") {
    return { ip: null, isTrusted: false, provider: "none" };
  }

  // 5. Adaptive Auto Mode (Default in non-configured environments)
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp) {
    const candidate = vercelIp.split(",")[0].trim();
    if (isValidIp(candidate)) {
      return {
        ip: candidate,
        isTrusted: true,
        provider: "vercel",
        ipFamily: getIpFamily(candidate)!,
        sourceHeader: "x-vercel-forwarded-for",
      };
    }
  }

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    const candidate = cfIp.trim();
    if (isValidIp(candidate)) {
      return {
        ip: candidate,
        isTrusted: true,
        provider: "cloudflare",
        ipFamily: getIpFamily(candidate)!,
        sourceHeader: "cf-connecting-ip",
      };
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    const candidate = realIp.trim();
    if (isValidIp(candidate)) {
      return {
        ip: candidate,
        isTrusted: true,
        provider: "custom",
        ipFamily: getIpFamily(candidate)!,
        sourceHeader: "x-real-ip",
      };
    }
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (isValidIp(parts[i])) {
        return {
          ip: parts[i],
          isTrusted: true,
          provider: "custom",
          ipFamily: getIpFamily(parts[i])!,
          sourceHeader: "x-forwarded-for",
        };
      }
    }
  }

  return { ip: null, isTrusted: false, provider: "none" };
}

/**
 * Extracts the real client IP string if and only if trusted by current environment policy.
 * Returns null if IP is untrusted, invalid, or missing.
 */
export function getTrustedClientIp(
  request: Request,
  configOverride?: Partial<ProxyTrustConfig>
): string | null {
  const result = resolveClientIp(request, configOverride);
  return result.isTrusted ? result.ip : null;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: "UID_LIMIT" | "IP_LIMIT" | "SERVICE_UNAVAILABLE";
  retryAfterSeconds: number;
  uidCount: number;
  ipCount: number;
}

export interface RateLimitOptions {
  uidMax?: number;        // Max requests per window per authenticated UID (default: 10)
  ipMax?: number;         // Max requests per window per trusted IP (default: 15)
  windowMs?: number;      // Fixed window in milliseconds (default: 60,000 ms)
  failClosed?: boolean;   // If true, denies requests if Firestore and fallback fail (default: false)
  db?: any;               // Optional custom Firestore DB instance (useful for unit tests)
}

// In-Memory Fallback Rate Limiter for Database Degraded States
interface MemoryBucket {
  count: number;
  resetAt: number;
}
const memoryRateLimiter = new Map<string, MemoryBucket>();

function checkMemoryFallback(key: string, max: number, windowMs: number): { allowed: boolean; count: number; retryAfter: number } {
  const now = Date.now();
  const bucket = memoryRateLimiter.get(key);

  if (!bucket || now >= bucket.resetAt) {
    memoryRateLimiter.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, count: 1, retryAfter: 0 };
  }

  if (bucket.count >= max) {
    return { allowed: false, count: bucket.count, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count++;
  return { allowed: true, count: bucket.count, retryAfter: 0 };
}

/**
 * Distributed rate limiter for authenticated endpoints.
 * Separately enforces UID quotas and trusted IP quotas across all serverless/container instances via Firestore.
 * 
 * Safe Unknown IP Policy:
 * If clientIp is null or untrusted, UID limit is strictly enforced while avoiding
 * lumping unknown callers into a shared IP bucket (preventing collateral mass blocking).
 */
export async function checkDistributedRateLimit(
  uid: string,
  clientIp: string | null | undefined,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  const windowMs = options?.windowMs ?? 60_000;
  const uidMax = options?.uidMax ?? 10;
  const ipMax = options?.ipMax ?? 15;
  const now = Date.now();
  const windowIndex = Math.floor(now / windowMs);

  try {
    const db = options?.db || serverDb();

    // Validate IP parameter
    const validIp = clientIp && isValidIp(clientIp) ? clientIp : null;
    const ipHash = validIp ? hashIpForRateLimit(validIp) : null;

    const uidRef = db.collection("rate_limits").doc(`auth_chk_uid_${uid}_${windowIndex}`);
    const ipRef = ipHash ? db.collection("rate_limits").doc(`auth_chk_ip_${ipHash}_${windowIndex}`) : null;

    // Retry loop with jitter for concurrent Firestore transaction contention
    let lastError: any = null;
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await db.runTransaction(async (tx: any) => {
          // 1. ALL READS
          const uidSnap = await tx.get(uidRef);
          const ipSnap = ipRef ? await tx.get(ipRef) : null;

          const uidCount = uidSnap.exists ? Number(uidSnap.data()?.count || 0) : 0;
          const ipCount = ipSnap && ipSnap.exists ? Number(ipSnap.data()?.count || 0) : 0;

          const windowEndMs = (windowIndex + 1) * windowMs;
          const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - now) / 1000));

          // 2. EVALUATION
          if (uidCount >= uidMax) {
            return {
              allowed: false,
              reason: "UID_LIMIT" as const,
              retryAfterSeconds,
              uidCount,
              ipCount,
            };
          }

          if (ipRef && ipCount >= ipMax) {
            return {
              allowed: false,
              reason: "IP_LIMIT" as const,
              retryAfterSeconds,
              uidCount,
              ipCount,
            };
          }

          // 3. ALL WRITES
          const expiresAt = new Date(now + windowMs * 2); // Native Timestamp for Firestore TTL policy

          tx.set(
            uidRef,
            {
              key: uid,
              type: "uid",
              count: uidCount + 1,
              windowIndex,
              expiresAt,
              updatedAt: now,
            },
            { merge: true }
          );

          if (ipRef && ipHash) {
            tx.set(
              ipRef,
              {
                key_hash: ipHash,
                type: "ip",
                count: ipCount + 1,
                windowIndex,
                expiresAt,
                updatedAt: now,
              },
              { merge: true }
            );
          }

          return {
            allowed: true,
            retryAfterSeconds: 0,
            uidCount: uidCount + 1,
            ipCount: ipRef ? ipCount + 1 : 0,
          };
        });
      } catch (txnErr: any) {
        lastError = txnErr;
        // Jittered backoff if contention
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 40 + 25 * (attempt + 1))));
          continue;
        }
        throw txnErr;
      }
    }

    throw lastError || new Error("Rate limit transaction failed");
  } catch (err: any) {
    // Database degradation fallback: Enforce local memory quota to prevent flood attacks
    const memRes = checkMemoryFallback(`uid_${uid}`, uidMax, windowMs);
    if (!memRes.allowed) {
      return {
        allowed: false,
        reason: "UID_LIMIT" as const,
        retryAfterSeconds: memRes.retryAfter,
        uidCount: memRes.count,
        ipCount: 0,
      };
    }

    if (options?.failClosed) {
      return {
        allowed: false,
        reason: "SERVICE_UNAVAILABLE" as const,
        retryAfterSeconds: 30,
        uidCount: 0,
        ipCount: 0,
      };
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      uidCount: memRes.count,
      ipCount: 0,
    };
  }
}
