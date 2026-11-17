import { serverDb } from "./cloudinaryServer";
import { createHash } from "node:crypto";

export interface ServerAddressVerification {
  addressId: string;
  userId: string;
  lat: number;
  lng: number;
  addressHash: string;
  verificationSource: "admin_verified" | "carrier_geocoded" | "google_places_server";
  verifiedBy: string;
  verifiedAt: string;
  expiresAt?: string;
  status: "verified" | "revoked";
}

export function computeAddressHash(rawAddress: string, lat: number, lng: number): string {
  const normalized = `${rawAddress.trim().toLowerCase()}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Creates or updates an authoritative server-controlled verification record for an address.
 * Only callable by server routes (admin or authorized server-side geocoding flows).
 */
export async function issueServerAddressVerification(params: {
  addressId: string;
  userId: string;
  lat: number;
  lng: number;
  rawAddress: string;
  verificationSource: "admin_verified" | "carrier_geocoded" | "google_places_server";
  verifiedBy: string;
  ttlHours?: number;
}): Promise<ServerAddressVerification> {
  const db = serverDb();
  const now = new Date();
  const addressHash = computeAddressHash(params.rawAddress, params.lat, params.lng);

  const verification: ServerAddressVerification = {
    addressId: params.addressId,
    userId: params.userId,
    lat: params.lat,
    lng: params.lng,
    addressHash,
    verificationSource: params.verificationSource,
    verifiedBy: params.verifiedBy,
    verifiedAt: now.toISOString(),
    status: "verified",
  };

  if (params.ttlHours && params.ttlHours > 0) {
    const expires = new Date(now.getTime() + params.ttlHours * 3600 * 1000);
    verification.expiresAt = expires.toISOString();
  }

  await db.doc(`address_verifications/${params.addressId}`).set(verification);
  return verification;
}

export type AddressVerificationCheckResult =
  | { verified: true; record: ServerAddressVerification }
  | {
      verified: false;
      reason:
        | "NO_SERVER_VERIFICATION"
        | "COORDINATE_MISMATCH"
        | "USER_MISMATCH"
        | "EXPIRED"
        | "REVOKED";
    };

/**
 * Validates whether an address has an authoritative, unexpired, matching server verification record.
 */
export async function verifyServerAddress(params: {
  addressId: string;
  userId: string;
  lat: number;
  lng: number;
  toleranceDegrees?: number;
}): Promise<AddressVerificationCheckResult> {
  const db = serverDb();
  const docSnap = await db.doc(`address_verifications/${params.addressId}`).get();

  if (!docSnap.exists) {
    return { verified: false, reason: "NO_SERVER_VERIFICATION" };
  }

  const record = docSnap.data() as ServerAddressVerification;

  if (record.status !== "verified") {
    return { verified: false, reason: "REVOKED" };
  }

  if (record.userId !== params.userId) {
    return { verified: false, reason: "USER_MISMATCH" };
  }

  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    return { verified: false, reason: "EXPIRED" };
  }

  const tolerance = params.toleranceDegrees ?? 1e-4; // ~11 meters tolerance
  if (
    Math.abs(record.lat - params.lat) > tolerance ||
    Math.abs(record.lng - params.lng) > tolerance
  ) {
    return { verified: false, reason: "COORDINATE_MISMATCH" };
  }

  return { verified: true, record };
}
