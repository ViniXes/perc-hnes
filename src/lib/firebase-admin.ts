// Inicializa Firebase Admin SDK (solo servidor). Se usa para acciones que la SDK
// de cliente NO puede hacer por seguridad: p.ej. resetear la contraseña de OTRO
// usuario. Requiere la credencial de una cuenta de servicio en el entorno:
//   FIREBASE_SERVICE_ACCOUNT = el JSON completo de la cuenta de servicio (una sola
//   línea o con \n escapados). En Vercel: Project Settings -> Environment Variables.
// Si la variable no está, las funciones devuelven null y el endpoint degrada con
// gracia (no rompe el build ni el resto de la app).
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | null = null;

function readServiceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    // La private_key suele venir con \n escapados: los normalizamos a saltos reales.
    if (parsed.private_key && parsed.private_key.includes("\\n")) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getAdminApp(): App | null {
  if (cachedApp) return cachedApp;
  const existing = getApps();
  if (existing.length > 0) {
    cachedApp = existing[0];
    return cachedApp;
  }
  const svc = readServiceAccount();
  if (!svc) return null;
  cachedApp = initializeApp({
    credential: cert({
      projectId: svc.project_id,
      clientEmail: svc.client_email,
      privateKey: svc.private_key,
    }),
    projectId: svc.project_id,
  });
  return cachedApp;
}

export function getAdminAuth(): Auth | null {
  const app = getAdminApp();
  return app ? getAuth(app) : null;
}

export function getAdminDb(): Firestore | null {
  const app = getAdminApp();
  if (!app) return null;
  const databaseId = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID?.trim();
  return databaseId && databaseId !== "(default)"
    ? getFirestore(app, databaseId)
    : getFirestore(app);
}
