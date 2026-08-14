import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

// Elimina una cuenta POR COMPLETO (irreversible): borra el usuario de Firebase Auth
// y su documento en serviceUsers, y libera la asignación de servicio si la tenía.
type Body = { idToken?: string; targetUid?: string };

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
    const decoded = await adminAuth.verifyIdToken(idToken);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
  }

  const callerSnap = await adminDb.collection("serviceUsers").doc(callerUid).get();
  const callerRole = callerSnap.exists ? (callerSnap.data()?.role as string) : "";
  if (callerRole !== "admin" && callerRole !== "supervisor") {
    return NextResponse.json(
      { ok: false, error: "Solo administradores o supervisores pueden eliminar cuentas." },
      { status: 403 },
    );
  }

  const targetUid = typeof body.targetUid === "string" ? body.targetUid : "";
  if (!targetUid) {
    return NextResponse.json({ ok: false, error: "Falta el usuario a eliminar." }, { status: 400 });
  }
  if (targetUid === callerUid) {
    return NextResponse.json({ ok: false, error: "No podés eliminar tu propia cuenta." }, { status: 400 });
  }

  const targetSnap = await adminDb.collection("serviceUsers").doc(targetUid).get();
  const targetData = targetSnap.exists ? targetSnap.data() : null;
  const targetRole = targetData ? (targetData.role as string) : "";
  if (targetRole === "admin") {
    return NextResponse.json(
      { ok: false, error: "No se puede eliminar una cuenta de administrador." },
      { status: 400 },
    );
  }

  try {
    // Liberar la asignación de servicio si le pertenecía.
    const serviceId = targetData && typeof targetData.serviceId === "string" ? targetData.serviceId : "";
    if (serviceId) {
      const assignSnap = await adminDb.collection("serviceAssignments").doc(serviceId).get();
      if (assignSnap.exists && String(assignSnap.data()?.uid || "") === targetUid) {
        await adminDb.collection("serviceAssignments").doc(serviceId).delete();
      }
    }
    await adminDb.collection("serviceUsers").doc(targetUid).delete();
    try {
      await adminAuth.deleteUser(targetUid);
    } catch {
      // La cuenta de Auth ya no existía; el doc igual se borró.
    }
    // Limpiar los registros de solicitud (historial) asociados a este usuario,
    // para que no quede ningún rastro que afecte.
    const username = targetData && typeof targetData.username === "string" ? targetData.username : "";
    if (username) {
      try {
        const reqSnap = await adminDb
          .collection("signupRequests")
          .where("createdUsername", "==", username)
          .get();
        for (const d of reqSnap.docs) {
          await d.ref.delete();
        }
      } catch {
        // Si falla la limpieza del historial, la cuenta igual quedó eliminada.
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo eliminar la cuenta." }, { status: 500 });
  }
}
