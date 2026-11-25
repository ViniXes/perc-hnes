import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { gestionaUsuarios, permiteReset } from "@/lib/permisos-cuentas";
import { generarClaveTemporal } from "@/lib/clave-temporal";

export const runtime = "nodejs";

// Cada reseteo pone una clave temporal ALEATORIA y distinta por cuenta. Solo se
// devuelve al admin que reseteó (nunca se guarda ni se escribe en logs). El
// usuario la cambia al entrar (mustChangePassword).

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

  async function resetOne(uid: string): Promise<string | null> {
    const clave = generarClaveTemporal();
    try {
      await adminDb!
        .collection("serviceUsers")
        .doc(uid)
        .set({ mustChangePassword: true, updatedAt: new Date() }, { merge: true });
      await adminAuth!.updateUser(uid, { password: clave });
      await adminAuth!.revokeRefreshTokens(uid);
      return clave;
    } catch {
      return null;
    }
  }

  // 2a) Reset masivo: todas las cuentas de servicio ya creadas.
  if (body.scope === "all-services") {
    const snap = await adminDb.collection("serviceUsers").where("role", "==", "service").get();
    const cuentas: { usuario: string; nombre: string; clave: string }[] = [];
    for (const d of snap.docs) {
      const destino = await adminAuth.getUser(d.id).catch(() => null);
      if (!permiteReset(caller, d.data(), destino?.email)) continue;
      const clave = await resetOne(d.id);
      if (!clave) continue;
      const perfil = d.data();
      const correo = (destino?.email || "").toLowerCase();
      const usuario = String(perfil.username || (correo.endsWith("@perc-hnes.app") ? correo.split("@")[0] : correo));
      const nombre = String(perfil.serviceName || perfil.name || "");
      cuentas.push({ usuario, nombre, clave });
    }
    cuentas.sort((a, b) => a.usuario.localeCompare(b.usuario));
    return NextResponse.json({ ok: true, count: cuentas.length, total: snap.size, cuentas });
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
  const clave = await resetOne(targetUid);
  return clave
    ? NextResponse.json({ ok: true, password: clave })
    : NextResponse.json({ ok: false, error: "No se pudo resetear ese usuario." }, { status: 500 });
}
