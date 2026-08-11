import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only if config is present (prevents crash on empty .env)
const isConfigured = !!firebaseConfig.apiKey;
const app = isConfigured ? (!getApps().length ? initializeApp(firebaseConfig) : getApp()) : null as any;

export const auth = isConfigured ? getAuth(app) : null as any;
export const db = isConfigured ? getFirestore(app) : null as any;
export const storage = isConfigured ? getStorage(app) : null as any;

export default app;
