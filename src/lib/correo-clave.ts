import { APP_URL, envolverHtml, escaparHtml } from "@/lib/correo";

// =============================================================================
// Correo con la CLAVE TEMPORAL tras un reseteo hecho por un administrador
// (Usuarios > Resetear clave, o Resetear claves de todos los servicios).
// Sale por Brevo con enviarCorreo (remitente MAIL_FROM). La clave solo viaja en
// el correo y en la respuesta al admin: no se guarda ni se escribe en logs.
// =============================================================================
export function correoClaveReseteada(nombre: string, usuario: string, clave: string) {
  const asunto = "PULSO · Su contraseña fue restablecida";
  const texto = [
    `Estimado(a) ${nombre}:`,
    "",
    "Un administrador de PULSO restableció la contraseña de su cuenta.",
    "",
    "DATOS DE ACCESO",
    `Usuario: ${usuario}`,
    `Contraseña temporal: ${clave}`,
    `Ingrese en: ${APP_URL}`,
    "",
    "Escriba la contraseña tal como aparece (distingue mayúsculas y minúsculas).",
    "Al entrar, el sistema le pedirá cambiarla por una que solo usted conozca.",
    "",
    "Si usted no esperaba este cambio, comuníquese de inmediato con ESDOMED.",
    "",
    "Servicio de Estadística y Documentos Médicos (ESDOMED)",
    "Hospital Nacional El Salvador",
  ].join("\n");

  const interior = `
        <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">Estimado(a) <strong>${escaparHtml(nombre)}</strong>:</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:23px;color:#334155;">
          Un administrador de <strong>PULSO</strong> <strong style="color:#047857;">restableció</strong> la contraseña de su cuenta.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:22px 0;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
          <tr>
            <td style="padding:18px 20px;">
              <p style="margin:0 0 12px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#64748b;">Datos de acceso</p>
              <p style="margin:0 0 6px;font-size:14px;color:#0f172a;">Usuario: <strong style="font-family:Consolas,monospace;font-size:16px;">${escaparHtml(usuario)}</strong></p>
              <p style="margin:0;font-size:14px;color:#0f172a;">Contraseña temporal: <strong style="font-family:Consolas,monospace;font-size:16px;letter-spacing:1px;">${escaparHtml(clave)}</strong></p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 24px;text-align:center;">
          <a href="${APP_URL}" style="display:inline-block;padding:13px 30px;border-radius:10px;background:#0ea5e9;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Ingresar a PULSO</a>
        </p>
        <p style="margin:0 0 14px;font-size:14px;line-height:23px;color:#334155;">
          Escriba la contraseña tal como aparece (distingue mayúsculas y minúsculas). Al entrar, el
          sistema le pedirá <strong>cambiarla</strong> por una que solo usted conozca.
        </p>
        <p style="margin:0;font-size:13px;line-height:21px;color:#b91c1c;">
          Si usted no esperaba este cambio, comuníquese de inmediato con ESDOMED.
        </p>`;

  return { asunto, texto, html: envolverHtml(interior) };
}
