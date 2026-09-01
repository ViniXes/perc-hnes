import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

// =============================================================================
// Aviso por correo al aprobar o rechazar una solicitud de registro.
// -----------------------------------------------------------------------------
// Lo llama el panel de "Nuevos jefes de servicio" despues de crear (o rechazar)
// la cuenta. Manda el USUARIO y la CLAVE GENERICA al correo que la persona puso
// en su solicitud, para no tener que avisarle una por una.
//
// Proveedor de envio (se elige solo, segun la variable que exista en Vercel):
//   BREVO_API_KEY    -> https://api.brevo.com/v3/smtp/email
//   RESEND_API_KEY   -> https://api.resend.com/emails
// Ademas:
//   MAIL_FROM        -> correo remitente ya verificado en el proveedor.
//   MAIL_FROM_NAME   -> nombre visible (por defecto "PULSO ...").
//
// Si no hay proveedor configurado, NO es un error: responde { ok:true, sent:false }
// para que aprobar una cuenta nunca falle por culpa del correo.
// =============================================================================

const APP_URL = "https://perc-hnes.vercel.app";
const DEFAULT_FROM_NAME = "PULSO · Hospital Nacional El Salvador";

type Body = {
  idToken?: string;
  to?: string;
  name?: string;
  username?: string;
  password?: string;
  roleLabel?: string;
  status?: "approved" | "rejected";
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

const HEADER_HTML = `
    <tr>
      <td style="background:#0e1626;padding:26px 30px;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7dd3fc;">Hospital Nacional El Salvador</p>
        <p style="margin:6px 0 0;font-size:26px;font-weight:700;letter-spacing:5px;color:#ffffff;">PULSO</p>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Plataforma Única de Logística y Servicios Operativos</p>
      </td>
    </tr>
    <tr>
      <td style="height:3px;background:linear-gradient(90deg,#22d3ee,#7c3aed);font-size:0;line-height:0;">&nbsp;</td>
    </tr>`;

const FOOTER_HTML = `
    <tr>
      <td style="padding:18px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:11px;line-height:18px;color:#64748b;">
          Servicio de Estadística y Documentos Médicos (ESDOMED) · Hospital Nacional El Salvador<br>
          Este es un mensaje automático; por favor no responda a esta dirección.
        </p>
      </td>
    </tr>`;

function wrapHtml(inner: string): string {
  return `
<div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,0.10);">
${HEADER_HTML}
    <tr>
      <td style="padding:30px;">
${inner}
      </td>
    </tr>
${FOOTER_HTML}
  </table>
</div>`.trim();
}

function buildApprovedEmail(name: string, username: string, password: string, roleLabel: string) {
  const subject = "PULSO · Su cuenta ya está activa";

  const text = [
    `Estimado(a) ${name}:`,
    "",
    "Su solicitud de acceso a PULSO, la plataforma de captura de producción del Hospital",
    "Nacional El Salvador, ha sido aprobada. Su cuenta ya se encuentra activa.",
    roleLabel ? `\nPerfil asignado: ${roleLabel}` : "",
    "",
    "DATOS DE ACCESO",
    `Usuario: ${username}`,
    `Contraseña temporal: ${password}`,
    `Ingrese en: ${APP_URL}`,
    "",
    "Al entrar por primera vez el sistema le pedirá cambiar la contraseña. Elija una que",
    "solo usted conozca y no la comparta: los datos que registre quedan a su nombre.",
    "",
    "Cada tabulador tiene una ventana de captura mensual. Una vez cerrada, reabrirla",
    "requiere la autorización de la jefatura de su división.",
    "",
    "Si necesita apoyo, utilice el Centro de Soporte dentro de PULSO o acérquese al",
    "servicio de ESDOMED.",
    "",
    "Servicio de Estadística y Documentos Médicos (ESDOMED)",
    "Hospital Nacional El Salvador",
    "",
    "Este es un mensaje automático; por favor no responda a esta dirección.",
  ].join("\n");

  const inner = `
        <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">Estimado(a) <strong>${escapeHtml(name)}</strong>:</p>

        <p style="margin:0 0 16px;font-size:14px;line-height:23px;color:#334155;">
          Su solicitud de acceso a <strong>PULSO</strong>, la plataforma de captura de producción
          del Hospital Nacional El Salvador, ha sido <strong style="color:#047857;">aprobada</strong>.
          Su cuenta ya se encuentra activa.
        </p>

        ${
          roleLabel
            ? `<p style="margin:0 0 16px;font-size:14px;line-height:23px;color:#334155;">Perfil asignado: <strong>${escapeHtml(roleLabel)}</strong>.</p>`
            : ""
        }

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:22px 0;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
          <tr>
            <td style="padding:18px 20px;">
              <p style="margin:0 0 12px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#64748b;">Datos de acceso</p>
              <p style="margin:0 0 6px;font-size:14px;color:#0f172a;">Usuario: <strong style="font-family:Consolas,monospace;font-size:16px;">${escapeHtml(username)}</strong></p>
              <p style="margin:0;font-size:14px;color:#0f172a;">Contraseña temporal: <strong style="font-family:Consolas,monospace;font-size:16px;">${escapeHtml(password)}</strong></p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 24px;text-align:center;">
          <a href="${APP_URL}" style="display:inline-block;padding:13px 30px;border-radius:10px;background:#0ea5e9;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Ingresar a PULSO</a>
        </p>

        <p style="margin:0 0 14px;font-size:14px;line-height:23px;color:#334155;">
          Al entrar por primera vez el sistema le pedirá <strong>cambiar la contraseña</strong>.
          Elija una que solo usted conozca y no la comparta: los datos que registre quedan a su nombre.
        </p>

        <p style="margin:0 0 14px;font-size:14px;line-height:23px;color:#334155;">
          Cada tabulador tiene una <strong>ventana de captura mensual</strong>. Una vez cerrada,
          reabrirla requiere la autorización de la jefatura de su división.
        </p>

        <p style="margin:0;font-size:14px;line-height:23px;color:#334155;">
          Si necesita apoyo, utilice el <strong>Centro de Soporte</strong> dentro de PULSO o
          acérquese al servicio de ESDOMED.
        </p>`;

  return { subject, text, html: wrapHtml(inner) };
}

function buildRejectedEmail(name: string) {
  const subject = "PULSO · Sobre su solicitud de acceso";

  const text = [
    `Estimado(a) ${name}:`,
    "",
    "Le informamos que su solicitud de acceso a PULSO no fue aprobada en esta ocasión.",
    "",
    "Esto normalmente responde a alguna de estas razones: los datos registrados no",
    "coinciden con los del servicio, el servicio ya cuenta con los usuarios autorizados,",
    "o la solicitud debe canalizarse por medio de la jefatura correspondiente.",
    "",
    "Si considera que se trata de un error, comuníquese con la jefatura de su servicio o",
    "con el servicio de ESDOMED para revisar el caso y, de ser procedente, registrarse",
    "nuevamente.",
    "",
    "Agradecemos su interés en el uso de la plataforma.",
    "",
    "Servicio de Estadística y Documentos Médicos (ESDOMED)",
    "Hospital Nacional El Salvador",
    "",
    "Este es un mensaje automático; por favor no responda a esta dirección.",
  ].join("\n");

  const inner = `
        <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">Estimado(a) <strong>${escapeHtml(name)}</strong>:</p>

        <p style="margin:0 0 16px;font-size:14px;line-height:23px;color:#334155;">
          Le informamos que su solicitud de acceso a <strong>PULSO</strong> no fue aprobada en
          esta ocasión.
        </p>

        <p style="margin:0 0 16px;font-size:14px;line-height:23px;color:#334155;">
          Esto normalmente responde a alguna de estas razones: los datos registrados no coinciden
          con los del servicio, el servicio ya cuenta con los usuarios autorizados, o la solicitud
          debe canalizarse por medio de la jefatura correspondiente.
        </p>

        <p style="margin:0 0 16px;font-size:14px;line-height:23px;color:#334155;">
          Si considera que se trata de un error, comuníquese con la <strong>jefatura de su
          servicio</strong> o con el servicio de <strong>ESDOMED</strong> para revisar el caso y,
          de ser procedente, registrarse nuevamente.
        </p>

        <p style="margin:0;font-size:14px;line-height:23px;color:#334155;">
          Agradecemos su interés en el uso de la plataforma.
        </p>`;

  return { subject, text, html: wrapHtml(inner) };
}

async function sendMail(
  to: string,
  toName: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ sent: boolean; error?: string }> {
  const fromEmail = (process.env.MAIL_FROM || "").trim();
  const fromName = (process.env.MAIL_FROM_NAME || DEFAULT_FROM_NAME).trim();
  const brevoKey = (process.env.BREVO_API_KEY || "").trim();
  const resendKey = (process.env.RESEND_API_KEY || "").trim();

  if (!fromEmail || (!brevoKey && !resendKey)) {
    return { sent: false, error: "correo no configurado" };
  }

  try {
    if (brevoKey) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: fromName },
          to: [{ email: to, name: toName || to }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
      });
      if (!res.ok) {
        return { sent: false, error: `Brevo ${res.status}` };
      }
      return { sent: true };
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      return { sent: false, error: `Resend ${res.status}` };
    }
    return { sent: true };
  } catch {
    return { sent: false, error: "No se pudo contactar al servicio de correo." };
  }
}

export async function POST(req: NextRequest) {
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

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ ok: true, sent: false, reason: "servidor no configurado" });
  }

  let callerUid = "";
  try {
    callerUid = (await adminAuth.verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
  }

  const callerSnap = await adminDb.collection("serviceUsers").doc(callerUid).get();
  const callerRole = callerSnap.exists ? (callerSnap.data()?.role as string) : "";
  if (callerRole !== "admin" && callerRole !== "supervisor") {
    return NextResponse.json({ ok: false, error: "Sin permisos." }, { status: 403 });
  }

  const to = (body.to || "").trim();
  if (!isEmail(to)) {
    return NextResponse.json({ ok: true, sent: false, reason: "sin correo válido" });
  }

  const name = (body.name || "").trim() || "usuario";
  const status = body.status === "rejected" ? "rejected" : "approved";

  const mail =
    status === "rejected"
      ? buildRejectedEmail(name)
      : buildApprovedEmail(
          name,
          (body.username || "").trim(),
          (body.password || "123456").trim(),
          (body.roleLabel || "").trim(),
        );

  const result = await sendMail(to, name, mail.subject, mail.html, mail.text);

  return NextResponse.json({ ok: true, sent: result.sent, reason: result.error });
}
