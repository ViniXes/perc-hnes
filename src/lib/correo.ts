/**
 * ENVIO DE CORREO DE PULSO
 *
 * Una sola puerta de salida para todo el correo del sistema: avisos de cuenta y
 * recordatorios de captura. El proveedor se elige solo segun la variable que
 * exista en Vercel:
 *
 *   BREVO_API_KEY   -> https://api.brevo.com/v3/smtp/email
 *   RESEND_API_KEY  -> https://api.resend.com/emails
 *   MAIL_FROM       -> remitente YA verificado en el proveedor (obligatorio).
 *   MAIL_FROM_NAME  -> nombre visible del remitente.
 *
 * Si no hay proveedor configurado NO se rompe nada: devuelve { enviado:false }
 * con el motivo, y quien llama decide. Ninguna accion del hospital debe fallar
 * porque el correo no este configurado.
 */

export const APP_URL = "https://perc-hnes.vercel.app";
const NOMBRE_REMITENTE = "PULSO · Hospital Nacional El Salvador";

export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function esCorreo(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
}

/** ¿Hay proveedor y remitente configurados? Sirve para avisar en pantalla. */
export function correoConfigurado(): { listo: boolean; proveedor: string; remitente: string } {
  const remitente = (process.env.MAIL_FROM || "").trim();
  const brevo = (process.env.BREVO_API_KEY || "").trim();
  const resend = (process.env.RESEND_API_KEY || "").trim();
  return {
    listo: !!remitente && (!!brevo || !!resend),
    proveedor: brevo ? "brevo" : resend ? "resend" : "ninguno",
    remitente: remitente || "(sin MAIL_FROM)",
  };
}

const ENCABEZADO_HTML = `
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

const PIE_HTML = `
    <tr>
      <td style="padding:18px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:11px;line-height:18px;color:#64748b;">
          Servicio de Estadística y Documentos Médicos (ESDOMED) · Hospital Nacional El Salvador<br>
          Este es un mensaje automático; por favor no responda a esta dirección.
        </p>
      </td>
    </tr>`;

/** Envuelve el contenido en la plantilla de PULSO (cabecera, cuerpo y pie). */
export function envolverHtml(interior: string): string {
  return `
<div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,0.10);">
${ENCABEZADO_HTML}
    <tr>
      <td style="padding:30px;">
${interior}
      </td>
    </tr>
${PIE_HTML}
  </table>
</div>`.trim();
}

export async function enviarCorreo(
  para: string,
  nombre: string,
  asunto: string,
  html: string,
  texto: string,
): Promise<{ enviado: boolean; error?: string }> {
  const remitente = (process.env.MAIL_FROM || "").trim();
  const nombreRemitente = (process.env.MAIL_FROM_NAME || NOMBRE_REMITENTE).trim();
  const brevoKey = (process.env.BREVO_API_KEY || "").trim();
  const resendKey = (process.env.RESEND_API_KEY || "").trim();

  if (!remitente || (!brevoKey && !resendKey)) {
    return { enviado: false, error: "correo no configurado" };
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
          sender: { email: remitente, name: nombreRemitente },
          to: [{ email: para, name: nombre || para }],
          subject: asunto,
          htmlContent: html,
          textContent: texto,
        }),
      });
      if (!res.ok) {
        const detalle = (await res.text()).slice(0, 160);
        return { enviado: false, error: `Brevo ${res.status}: ${detalle}` };
      }
      return { enviado: true };
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${nombreRemitente} <${remitente}>`,
        to: [para],
        subject: asunto,
        html,
        text: texto,
      }),
    });
    if (!res.ok) {
      const detalle = (await res.text()).slice(0, 160);
      return { enviado: false, error: `Resend ${res.status}: ${detalle}` };
    }
    return { enviado: true };
  } catch {
    return { enviado: false, error: "No se pudo contactar al servicio de correo." };
  }
}
