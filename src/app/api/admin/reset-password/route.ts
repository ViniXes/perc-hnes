import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

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

  // 1) Verificar que QUIEN llama sea admin o supervisor.
  let callerUid = "";
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
  }

  const callerSnap = await adminDb.collection("serviceUsers").doc(callerUid).get();
  const callerRole = callerSnap.exists ? (callerSnap.data()?.role as string) : "";
  if (callerRole !== "admin" && callerRole !== "supervisor") {
    return NextResponse.json(
      { ok: false, error: "Solo administradores o supervisores pueden resetear claves." },
      { status: 403 },
    );
  }

  async function resetOne(uid: string): Promise<boolean> {
    try {
      await adminAuth!.updateUser(uid, { password: RESET_PASSWORD });
      await adminDb!
        .collection("serviceUsers")
        .doc(uid)
        .set({ mustChangePassword: true, updatedAt: new Date() }, { merge: true });
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
      if (await resetOne(d.id)) done += 1;
    }
    return NextResponse.json({ ok: true, count: done, total: snap.size, password: RESET_PASSWORD });
  }

  // 2b) Reset individual.
  const targetUid = typeof body.targetUid === "string" ? body.targetUid : "";
  if (!targetUid) {
    return NextResponse.json({ ok: false, error: "Falta el usuario a resetear." }, { status: 400 });
  }
  const ok = await resetOne(targetUid);
  return ok
    ? NextResponse.json({ ok: true, password: RESET_PASSWORD })
    : NextResponse.json({ ok: false, error: "No se pudo resetear ese usuario." }, { status: 500 });
}
