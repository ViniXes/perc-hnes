import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

// =============================================================================
// Cambia el NOMBRE DE USUARIO de una cuenta (su identidad de acceso).
// -----------------------------------------------------------------------------
// El usuario es la parte antes del arroba del correo de acceso:
//   "nvarela"  ->  nvarela@perc-hnes.app
// Por eso no basta con renombrar el campo en Firestore: hay que cambiar tambien
// el correo en Firebase Auth. Eso solo se puede desde el servidor (Admin SDK).
//
// La CONTRASENA no se toca: la persona entra con su misma clave, solo cambia el
// usuario que escribe.
// =============================================================================

const LOGIN_DOMAIN = "perc-hnes.app";

type Body = { idToken?: string; targetUid?: string; username?: string };

function normalizeUsername(value: string): string {
  return (value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export async function POST(req: NextRequest) {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) {
    return NextResponse.json(
      { ok: false, error: "La gestión por servidor no está configurada (falta FIREBASE_SERVICE_ACCOUNT)." },
      { status: 503 },
    );
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  if (!idToken) {
    return NextResponse.json({ ok: false, error: "Falta autenticación." }, { status: 401 });
  }

  let callerUid = "";
  try {
    callerUid = (await adminAuth.verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
  }

  const callerSnap = await adminDb.collection("serviceUsers").doc(callerUid).get();
  const callerRole = callerSnap.exists ? (callerSnap.data()?.role as string) : "";
  if (callerRole !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Solo un administrador puede cambiar el nombre de usuario." },
      { status: 403 },
    );
  }

  const targetUid = typeof body.targetUid === "string" ? body.targetUid : "";
  if (!targetUid) {
    return NextResponse.json({ ok: false, error: "Falta el usuario a renombrar." }, { status: 400 });
  }

  const username = normalizeUsername(body.username || "");
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "El usuario debe tener entre 3 y 40 caracteres: solo letras, números, punto, guion y guion bajo, sin espacios ni acentos.",
      },
      { status: 400 },
    );
  }

  const nextEmail = `${username}@${LOGIN_DOMAIN}`;

  const targetSnap = await adminDb.collection("serviceUsers").doc(targetUid).get();
  if (!targetSnap.exists) {
    return NextResponse.json({ ok: false, error: "Esa cuenta ya no existe." }, { status: 404 });
  }

  // Que no choque con otra cuenta ya existente.
  try {
    const existing = await adminAuth.getUserByEmail(nextEmail);
    if (existing.uid !== targetUid) {
      return NextResponse.json(
        { ok: false, error: `El usuario "${username}" ya está ocupado por otra cuenta.` },
        { status: 409 },
      );
    }
  } catch {
    // No existe: el usuario está libre.
  }

  try {
    const dupes = await adminDb
      .collection("serviceUsers")
      .where("loginEmail", "==", nextEmail)
      .get();
    const otro = dupes.docs.find((d) => d.id !== targetUid);
    if (otro) {
      return NextResponse.json(
        { ok: false, error: `El usuario "${username}" ya está ocupado por otra cuenta.` },
        { status: 409 },
      );
    }
  } catch {
    // Si la consulta falla, seguimos: Auth ya validó el choque real.
  }

  try {
    await adminAuth.updateUser(targetUid, { email: nextEmail });
    await adminDb
      .collection("serviceUsers")
      .doc(targetUid)
      .set({ username, loginEmail: nextEmail, updatedAt: new Date() }, { merge: true });

    return NextResponse.json({ ok: true, username, loginEmail: nextEmail });
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudo cambiar el nombre de usuario." },
      { status: 500 },
    );
  }
}
