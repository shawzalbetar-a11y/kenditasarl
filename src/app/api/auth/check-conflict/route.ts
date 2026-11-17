import { NextResponse } from "next/server";
import { authorize, serverDb } from "../../../../lib/server/cloudinaryServer";
import { getTrustedClientIp, checkDistributedRateLimit } from "../../../../lib/server/rateLimit";
import { normalizeE164, isValidE164, hashPhoneNumber } from "../../../../lib/server/phoneUtils";

// Validation Regular Expressions
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export async function POST(request: Request) {
  // 1. Authenticate caller: Must be a verified, signed, non-anonymous Firebase session
  const uid = await authorize(request, false, false);
  if (typeof uid === "number") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: uid });
  }

  // 2. Distributed Rate Limiting Check (Fail-Closed on sensitive conflict check endpoint)
  const clientIp = getTrustedClientIp(request);
  const rateLimit = await checkDistributedRateLimit(uid, clientIp, {
    uidMax: 10, // Max 10 conflict checks per minute per authenticated user
    ipMax: 15,  // Max 15 conflict checks per minute per IP address
    windowMs: 60_000,
    failClosed: true, // FAIL-CLOSED when shared storage is lost to protect sensitive enumeration
  });

  if (!rateLimit.allowed) {
    const isUnavailable = rateLimit.reason === "SERVICE_UNAVAILABLE";
    return NextResponse.json(
      {
        error: isUnavailable ? "SERVICE_UNAVAILABLE" : "TOO_MANY_REQUESTS",
        message: isUnavailable
          ? "Authentication verification service is temporarily unavailable. Please retry shortly."
          : "Too many checks. Please wait before retrying.",
        limitType: rateLimit.reason,
      },
      {
        status: isUnavailable ? 503 : 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    const { phone, email } = body as { phone?: string; email?: string };

    if (!phone && !email) {
      return NextResponse.json({ error: "MISSING_IDENTIFIER" }, { status: 400 });
    }

    const db = serverDb();
    let isConflict = false;

    // 3. Strict Phone validation and conflict check (Checks atomic phone_numbers and legacy users)
    if (phone !== undefined) {
      if (typeof phone !== "string") {
        return NextResponse.json({ error: "INVALID_PHONE_FORMAT" }, { status: 400 });
      }
      const formattedPhone = normalizeE164(phone);

      if (!isValidE164(formattedPhone)) {
        return NextResponse.json({ error: "INVALID_PHONE_FORMAT" }, { status: 400 });
      }

      // Check atomic phone_numbers reservation collection first
      const phoneHash = hashPhoneNumber(formattedPhone);
      const reservationDoc = await db.collection("phone_numbers").doc(phoneHash).get();
      if (reservationDoc.exists) {
        if (reservationDoc.data()?.uid !== uid) {
          isConflict = true;
        }
      }

      // If not flagged in reservations, check legacy users collection for backward compatibility
      if (!isConflict) {
        const snap = await db
          .collection("users")
          .where("phone", "==", formattedPhone)
          .limit(2)
          .get();

        for (const d of snap.docs) {
          if (d.id !== uid) {
            isConflict = true;
            break;
          }
        }
      }
    }

    // 4. Strict Email validation and conflict check
    if (!isConflict && email !== undefined) {
      if (typeof email !== "string") {
        return NextResponse.json({ error: "INVALID_EMAIL_FORMAT" }, { status: 400 });
      }
      const normalizedEmail = email.trim().toLowerCase();

      if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 254) {
        return NextResponse.json({ error: "INVALID_EMAIL_FORMAT" }, { status: 400 });
      }

      const snap = await db
        .collection("users")
        .where("email", "==", normalizedEmail)
        .limit(2)
        .get();

      for (const d of snap.docs) {
        if (d.id !== uid) {
          isConflict = true;
          break;
        }
      }
    }

    // Uniform response structure: No user IDs, names, or metadata ever leaked
    return NextResponse.json({ conflict: isConflict });
  } catch (err: any) {
    console.error("[AUTH_CHECK_CONFLICT] Error:", err?.message || err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
