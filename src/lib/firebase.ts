import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isEmulatorMode =
  firebaseConfig.projectId === "demo-kenditasarla-rules" ||
  process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1" ||
  process.env.NEXT_PUBLIC_CHECKOUT_EMULATOR === "1";

const effectiveApiKey = firebaseConfig.apiKey || (isEmulatorMode ? "fake-api-key" : undefined);
const effectiveConfig = { ...firebaseConfig, apiKey: effectiveApiKey };
const isConfigured = !!effectiveApiKey;
const app = isConfigured ? (!getApps().length ? initializeApp(effectiveConfig) : getApp()) : null as any;

export const auth = isConfigured ? getAuth(app) : null as any;
export const db = isConfigured ? getFirestore(app) : null as any;
export const storage = isConfigured ? getStorage(app) : null as any;

if (isConfigured && isEmulatorMode) {
  if (!auth.emulatorConfig) connectAuthEmulator(auth, "http://127.0.0.1:19099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 18080);
}

export default app;
