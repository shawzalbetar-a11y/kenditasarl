import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, inMemoryPersistence, setPersistence, signInAnonymously } from "firebase/auth";
import app, { auth } from "./firebase";

let pendingGuest: Promise<string> | undefined;

async function guestToken() {
  // A guest upload must not sign the shopper into the primary checkout session.
  const name = "guest-image-upload";
  const guestApp = getApps().some(a => a.name === name) ? getApp(name) : initializeApp(app.options, name);
  const guestAuth = getAuth(guestApp);
  if (guestApp.options.projectId === "demo-kenditasarla-rules" && process.env.NEXT_PUBLIC_CHECKOUT_EMULATOR === "1" && !guestAuth.emulatorConfig) connectAuthEmulator(guestAuth,"http://127.0.0.1:19099",{disableWarnings:true});
  await setPersistence(guestAuth, inMemoryPersistence);
  const guest = guestAuth.currentUser ?? (await signInAnonymously(guestAuth)).user;
  return guest.getIdToken();
}

export async function uploadCustomerImage(form: FormData) {
  await auth.authStateReady();
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken()
    : await (pendingGuest ??= guestToken().finally(() => { pendingGuest = undefined; }));
  const response = await fetch("/api/upload", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  if (!response.ok) throw new Error("upload_failed");
  return response;
}

export async function existingGuestUploadToken() {
  const guest = getApps().find(a => a.name === "guest-image-upload");
  return guest ? getAuth(guest).currentUser?.getIdToken() : undefined;
}
