import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

// Activa o desactiva una cuenta (reversible). Desactivar = deshabilita el login
// en Firebase Auth y marca isActive:false en serviceUsers. Activar hace lo inverso.
type Body = {
  idToken?: string;
  targetUid?: string;
  active?: boolean;
};

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
      { ok: false, error: "Solo administradores o supervisores pueden gestionar cuentas." },
      { status: 403 },
    );
  }

  const targetUid = typeof body.targetUid === "string" ? body.targetUid : "";
  if (!targetUid) {
    return NextResponse.json({ ok: false, error: "Falta el usuario a gestionar." }, { status: 400 });
  }
  if (targetUid === callerUid) {
    return NextResponse.json({ ok: false, error: "No podés desactivar tu propia cuenta." }, { status: 400 });
  }

  const active = body.active !== false;

  // 2) Protección: no permitir desactivar una cuenta de administrador.
  const targetSnap = await adminDb.collection("serviceUsers").doc(targetUid).get();
  const targetRole = targetSnap.exists ? (targetSnap.data()?.role as string) : "";
  if (!active && targetRole === "admin") {
    return NextResponse.json(
      { ok: false, error: "No se puede desactivar una cuenta de administrador." },
      { status: 400 },
    );
  }

  try {
    await adminAuth.updateUser(targetUid, { disabled: !active });
    await adminDb
      .collection("serviceUsers")
      .doc(targetUid)
      .set({ isActive: active, updatedAt: new Date() }, { merge: true });
    return NextResponse.json({ ok: true, active });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo actualizar la cuenta." }, { status: 500 });
  }
}
