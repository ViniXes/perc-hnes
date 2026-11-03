import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { APP_URL, enviarCorreo, envolverHtml, esCorreo, escaparHtml } from "@/lib/correo";

export const runtime = "nodejs";

// =============================================================================
// RECUPERACION DE ACCESO ("¿Olvidaste tu usuario o contraseña?")
// -----------------------------------------------------------------------------
// La persona llena el formulario del login -> queda un documento en
// accessRecoveryRequests. Un administrador, desde el menu Solicitudes, elige la
// cuenta que corresponde y llama a esta ruta, que:
//   1) verifica que quien llama sea administrador,
//   2) pone una CLAVE TEMPORAL aleatoria en esa cuenta (Admin SDK) y marca
//      mustChangePassword para que la cambie al entrar,
//   3) envia por correo el USUARIO y la clave temporal al correo de la solicitud,
//   4) marca la solicitud como resuelta.
// Si el correo no esta configurado (BREVO_API_KEY / RESEND_API_KEY + MAIL_FROM),
// la clave igual se restablece y se devuelve para entregarla a mano.
// =============================================================================

type Body = {
  idToken?: string;
  requestId?: string;
  targetUid?: string;
};

// Sin caracteres que se confunden (0/O, 1/l/I).
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function claveTemporal(): string {
  let out = "";
  for (let i = 0; i < 8; i += 1) out += ALFABETO[randomInt(ALFABETO.length)];
  // Garantiza al menos un numero.
  return out.slice(0, 7) + String(randomInt(2, 10));
}

function correoRecuperacion(nombre: string, usuario: string, clave: string) {
  const asunto = "PULSO · Recuperación de acceso";
  const texto = [
    `Estimado(a) ${nombre}:`,
    "",
    "Recibimos su solicitud para recuperar el acceso a PULSO. Su contraseña fue",
    "restablecida por un administrador.",
    "",
    "DATOS DE ACCESO",
    `Usuario: ${usuario}`,
    `Contraseña temporal: ${clave}`,
    `Ingrese en: ${APP_URL}`,
    "",
    "Al entrar, el sistema le pedirá cambiar la contraseña. Elija una que solo usted",
    "conozca y no la comparta.",
    "",
    "Si usted no hizo esta solicitud, comuníquese de inmediato con ESDOMED.",
    "",
    "Servicio de Estadística y Documentos Médicos (ESDOMED)",
    "Hospital Nacional El Salvador",
  ].join("\n");

  const interior = `
        <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">Estimado(a) <strong>${escaparHtml(nombre)}</strong>:</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:23px;color:#334155;">
          Recibimos su solicitud para recuperar el acceso a <strong>PULSO</strong>. Su contraseña
          fue <strong style="color:#047857;">restablecida</strong> por un administrador.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:22px 0;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
          <tr>
            <td style="padding:18px 20px;">
              <p style="margin:0 0 12px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#64748b;">Datos de acceso</p>
              <p style="margin:0 0 6px;font-size:14px;color:#0f172a;">Usuario: <strong style="font-family:Consolas,monospace;font-size:16px;">${escaparHtml(usuario)}</strong></p>
              <p style="margin:0;font-size:14px;color:#0f172a;">Contraseña temporal: <strong style="font-family:Consolas,monospace;font-size:16px;">${escaparHtml(clave)}</strong></p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 24px;text-align:center;">
          <a href="${APP_URL}" style="display:inline-block;padding:13px 30px;border-radius:10px;background:#0ea5e9;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Ingresar a PULSO</a>
        </p>
        <p style="margin:0 0 14px;font-size:14px;line-height:23px;color:#334155;">
          Al entrar, el sistema le pedirá <strong>cambiar la contraseña</strong>. Elija una que solo
          usted conozca y no la comparta.
        </p>
        <p style="margin:0;font-size:13px;line-height:21px;color:#b91c1c;">
          Si usted no hizo esta solicitud, comuníquese de inmediato con ESDOMED.
        </p>`;

  return { asunto, texto, html: envolverHtml(interior) };
}

export async function POST(req: NextRequest) {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) {
    return NextResponse.json(
      { ok: false, error: "El servidor no está configurado (falta FIREBASE_SERVICE_ACCOUNT)." },
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
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const targetUid = typeof body.targetUid === "string" ? body.targetUid.trim() : "";
  if (!idToken) {
    return NextResponse.json({ ok: false, error: "Falta autenticación." }, { status: 401 });
  }
  if (!requestId || !targetUid) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud o la cuenta." }, { status: 400 });
  }

  // 1) Solo administradores.
  let callerUid = "";
  try {
    callerUid = (await adminAuth.verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
  }
  const callerSnap = await adminDb.collection("serviceUsers").doc(callerUid).get();
  const caller = callerSnap.exists ? (callerSnap.data() as Record<string, unknown>) : {};
  const callerPerms = (caller.permissions || {}) as Record<string, unknown>;
  if (caller.role !== "admin" && callerPerms.canManageUsers !== true) {
    return NextResponse.json(
      { ok: false, error: "Solo un administrador puede restablecer el acceso." },
      { status: 403 },
    );
  }
  const callerName =
    String(caller.name || `${caller.firstName || ""} ${caller.lastName || ""}`).trim() || "Administrador";

  // 2) La solicitud.
  const reqRef = adminDb.collection("accessRecoveryRequests").doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) {
    return NextResponse.json({ ok: false, error: "La solicitud ya no existe." }, { status: 404 });
  }
  const solicitud = reqSnap.data() as Record<string, unknown>;
  if (solicitud.status !== "pending") {
    return NextResponse.json({ ok: false, error: "Esa solicitud ya fue atendida." }, { status: 409 });
  }
  const para = String(solicitud.email || "").trim();
  const nombre = String(solicitud.fullName || "").trim() || "usuario";

  // 3) La cuenta: usuario = parte local del correo de acceso (lo que se escribe en el login).
  let usuario = "";
  try {
    const authUser = await adminAuth.getUser(targetUid);
    const correoAcceso = (authUser.email || "").toLowerCase();
    usuario = correoAcceso.endsWith("@perc-hnes.app") ? correoAcceso.split("@")[0] : correoAcceso;
  } catch {
    return NextResponse.json({ ok: false, error: "Esa cuenta no existe en el sistema de acceso." }, { status: 404 });
  }
  if (!usuario) {
    const perfil = await adminDb.collection("serviceUsers").doc(targetUid).get();
    usuario = String(perfil.data()?.username || "");
  }

  // 4) Clave temporal.
  const clave = claveTemporal();
  try {
    await adminAuth.updateUser(targetUid, { password: clave });
    await adminDb
      .collection("serviceUsers")
      .doc(targetUid)
      .set({ mustChangePassword: true, updatedAt: new Date() }, { merge: true });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo restablecer la clave de esa cuenta." }, { status: 500 });
  }

  // 5) Correo (nunca hace fallar el restablecimiento).
  let enviado = false;
  let motivo = "";
  if (esCorreo(para)) {
    const mail = correoRecuperacion(nombre, usuario, clave);
    const r = await enviarCorreo(para, nombre, mail.asunto, mail.html, mail.texto);
    enviado = r.enviado;
    motivo = r.error || "";
  } else {
    motivo = "sin correo válido";
  }

  await reqRef.set(
    {
      status: "resolved",
      resolvedUid: targetUid,
      resolvedUsername: usuario,
      resolvedByUid: callerUid,
      resolvedByName: callerName,
      mailSent: enviado,
      mailError: enviado ? "" : motivo,
      resolvedAt: new Date(),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, username: usuario, password: clave, sent: enviado, reason: motivo });
}
