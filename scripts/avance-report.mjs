import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

// --- Cargar variables desde .env.local ---
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const ADMIN_EMAIL = env.NEXT_PUBLIC_ADMIN_EMAIL || "hcardoza.admin@perc-hnes.app";
const ADMIN_PASSWORD = env.NEXT_PUBLIC_ADMIN_PASSWORD || "Cardoza1986";
const DB_ID = (env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID || "(default)").trim();

const PERIOD = process.argv[2] || "2026-06";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = DB_ID && DB_ID !== "(default)" ? getFirestore(app, DB_ID) : getFirestore(app);

const hasValue = (values) =>
  !!values &&
  Object.values(values).some((row) =>
    Object.values(row || {}).some((cell) => String(cell ?? "").trim() !== "")
  );

async function idsWithData(coll) {
  const snap = await getDocs(query(collection(db, coll), where("periodId", "==", PERIOD)));
  const out = new Map();
  snap.forEach((d) => {
    const data = d.data();
    if (typeof data.serviceId === "string") out.set(data.serviceId, hasValue(data.values));
  });
  return out;
}

(async () => {
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  const [perc, seps, horas] = await Promise.all([
    idsWithData("serviceTabulators"),
    idsWithData("sepsTabulators"),
    idsWithData("horasTabulators"),
  ]);
  const result = { period: PERIOD, perc: [...perc], seps: [...seps], horas: [...horas] };
  console.log("RESULT_JSON_START");
  console.log(JSON.stringify(result));
  console.log("RESULT_JSON_END");
  process.exit(0);
})().catch((e) => {
  console.error("ERROR:", e.code || "", e.message);
  process.exit(1);
});
