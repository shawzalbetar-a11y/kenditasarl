import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { POST as checkConflictRoute } from "../../src/app/api/auth/check-conflict/route";
import { POST as verifyPhoneRoute } from "../../src/app/api/auth/verify-phone/route";
import { serverDb } from "../../src/lib/server/cloudinaryServer";

const projectId = "demo-kenditasarla-rules";

async function createIdentity(email: string) {
  let r = await fetch(
    "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "synthetic-password-only",
        returnSecureToken: true,
      }),
    }
  );
  if (r.status === 400) {
    r = await fetch(
      "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "synthetic-password-only",
          returnSecureToken: true,
        }),
      }
    );
  }
  assert.equal(r.status, 200);
  return r.json();
}

let userA: any;
let userB: any;

before(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:18080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:19099";
  process.env.GCLOUD_PROJECT = projectId;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;

  userA = await createIdentity("endpoint_user_a@kenditasarla.local");
  userB = await createIdentity("endpoint_user_b@kenditasarla.local");

  const sdb = serverDb();
  await sdb.doc(`users/${userB.localId}`).set({
    full_name: "User B",
    phone: "+905559876543",
    email: "user_b_conflict@kenditasarla.local",
  });
});

describe("Auth Endpoints Security & Rate Limiting Suite", () => {
  test("[Conflict 1] Unauthenticated request returns 401", async () => {
    const req = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+905551234567" }),
    });
    const res = await checkConflictRoute(req);
    assert.equal(res.status, 401);
  });

  test("[Conflict 2] Rejects malformed phone format with 400", async () => {
    const req = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.idToken}`,
      },
      body: JSON.stringify({ phone: "12345" }), // Not E.164
    });
    const res = await checkConflictRoute(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "INVALID_PHONE_FORMAT");
  });

  test("[Conflict 3] Rejects malformed email format with 400", async () => {
    const req = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.idToken}`,
      },
      body: JSON.stringify({ email: "invalid-email-no-domain" }),
    });
    const res = await checkConflictRoute(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "INVALID_EMAIL_FORMAT");
  });

  test("[Conflict 4] Detects conflict when phone or email belongs to another user", async () => {
    // Phone conflict check
    const reqPhone = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.idToken}`,
      },
      body: JSON.stringify({ phone: "+905559876543" }), // belongs to userB
    });
    const resPhone = await checkConflictRoute(reqPhone);
    assert.equal(resPhone.status, 200);
    const dataPhone = await resPhone.json();
    assert.equal(dataPhone.conflict, true);

    // Email conflict check
    const reqEmail = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.idToken}`,
      },
      body: JSON.stringify({ email: "user_b_conflict@kenditasarla.local" }), // belongs to userB
    });
    const resEmail = await checkConflictRoute(reqEmail);
    assert.equal(resEmail.status, 200);
    const dataEmail = await resEmail.json();
    assert.equal(dataEmail.conflict, true);
  });

  test("[Conflict 5] Returns conflict: false when phone and email are unique", async () => {
    const req = new Request("http://localhost:3000/api/auth/check-conflict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.idToken}`,
      },
      body: JSON.stringify({
        phone: "+905551113355",
        email: "brand_new_unique@kenditasarla.local",
      }),
    });
    const res = await checkConflictRoute(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.conflict, false);
  });

  test("[Conflict 6] Rate limiting: Rapid repeated requests trigger 429 Too Many Requests", async () => {
    // We already made ~5 requests with userA. Let's make 6 more to exceed 10 per minute
    let lastStatus = 200;
    for (let i = 0; i < 7; i++) {
      const req = new Request("http://localhost:3000/api/auth/check-conflict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userA.idToken}`,
        },
        body: JSON.stringify({ phone: `+90555000000${i}` }),
      });
      const res = await checkConflictRoute(req);
      lastStatus = res.status;
      if (lastStatus === 429) {
        assert.ok(Number(res.headers.get("Retry-After")) > 0);
        break;
      }
    }
    assert.equal(lastStatus, 429);
  });

  test("[VerifyPhone 1] Unauthenticated request to verify-phone returns 401", async () => {
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 401);
  });

  test("[VerifyPhone 2] Caller without verified phone in Firebase Auth returns 400", async () => {
    // userB was registered with email/password, so has no verified phone number in Auth provider
    const req = new Request("http://localhost:3000/api/auth/verify-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.idToken}`,
      },
    });
    const res = await verifyPhoneRoute(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "PHONE_NOT_VERIFIED_IN_AUTH");
  });
});
