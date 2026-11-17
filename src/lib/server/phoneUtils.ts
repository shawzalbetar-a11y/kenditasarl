import { createHash } from "node:crypto";

/**
 * Standard E.164 phone regex: '+' followed by 7 to 15 digits (ITU-T E.164)
 */
export const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Normalizes any phone string into strict E.164 representation by stripping whitespace,
 * dashes, dots, and parentheses, and ensuring a leading '+' sign.
 */
export function normalizeE164(phone: string): string {
  if (!phone || typeof phone !== "string") return "";
  let cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, "");
  if (!cleaned.startsWith("+")) {
    cleaned = `+${cleaned}`;
  }
  return cleaned;
}

/**
 * Validates whether the normalized phone strictly conforms to E.164 specification.
 */
export function isValidE164(phone: string): boolean {
  return E164_PHONE_REGEX.test(phone) && phone.length <= 16;
}

/**
 * Produces a deterministic, one-way cryptographic SHA-256 hash of the normalized E.164 phone.
 * Used as the document ID for /phone_numbers/{phoneHash} to preserve phone number privacy in Firestore keys.
 */
export function hashPhoneNumber(phone: string): string {
  const normalized = normalizeE164(phone);
  return createHash("sha256").update(normalized).digest("hex");
}
