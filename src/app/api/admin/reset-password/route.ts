import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { gestionaUsuarios, permiteReset } from "@/lib/permisos-cuentas";

export const runtime = "nodejs";

// Clave a la que se resetea (política del hospital). El usuario la cambia al entrar.
const RESET_PASSWORD = "123456";

type Body = {
  idToken?: string;
  targetUid?: string;
  scope?: "all-services";
};

export async function POST(req: NextRequest) {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) {
    return NextResponse.json(
      { ok: false, error: "El reset por servidor no está configurado (falta FIREBASE_SERVICE_ACCOUNT)." },
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
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
  }

  const callerSnap = await adminDb.collection("serviceUsers").doc(callerUid).get();
  const caller = callerSnap.data();
  if (!gestionaUsuarios(caller)) {
    return NextResponse.json(
      { ok: false, error: "Se requiere el permiso de gestión de usuarios." },
      { status: 403 },
    );
  }

  async function resetOne(uid: string): Promise<boolean> {
    try {
      await adminDb!
        .collection("serviceUsers")
        .doc(uid)
        .set({ mustChangePassword: true, updatedAt: new Date() }, { merge: true });
      await adminAuth!.updateUser(uid, { password: RESET_PASSWORD });
      await adminAuth!.revokeRefreshTokens(uid);
      return true;
    } catch {
      return false;
    }
  }

  // 2a) Reset masivo: todas las cuentas de servicio ya creadas.
  if (body.scope === "all-services") {
    const snap = await adminDb.collection("serviceUsers").where("role", "==", "service").get();
    let done = 0;
    for (const d of snap.docs) {
      const destino = await adminAuth.getUser(d.id).catch(() => null);
      if (permiteReset(caller, d.data(), destino?.email) && await resetOne(d.id)) done += 1;
    }
    return NextResponse.json({ ok: true, count: done, total: snap.size, password: RESET_PASSWORD });
  }

  // 2b) Reset individual.
  const targetUid = typeof body.targetUid === "string" ? body.targetUid : "";
  if (!targetUid) {
    return NextResponse.json({ ok: false, error: "Falta el usuario a resetear." }, { status: 400 });
  }
  const target = await adminDb.collection("serviceUsers").doc(targetUid).get();
  const cuenta = await adminAuth.getUser(targetUid).catch(() => null);
  if (!permiteReset(caller, target.data(), cuenta?.email)) {
    return NextResponse.json({ ok: false, error: "Esta cuenta no admite un reinicio ordinario." }, { status: 403 });
  }
  const ok = await resetOne(targetUid);
  return ok
    ? NextResponse.json({ ok: true, password: RESET_PASSWORD })
    : NextResponse.json({ ok: false, error: "No se pudo resetear ese usuario." }, { status: 500 });
}
