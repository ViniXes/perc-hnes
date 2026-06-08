import { deleteApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firestoreDatabaseId =
  process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID?.trim() || "(default)";

// getApps() evita re-inicializar en hot-reload de desarrollo.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);

export function createSecondaryAuth() {
  const secondaryApp = initializeApp(
    firebaseConfig,
    `secondary-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  return {
    auth: getAuth(secondaryApp),
    async dispose() {
      await deleteApp(secondaryApp);
    },
  };
}

export default app;
