import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { APP_URL, enviarCorreo, envolverHtml, esCorreo, escaparHtml } from "@/lib/correo";
import {
  getCaptureWindow,
  getClosingPeriodId,
  getPeriodId,
  getPeriodLabel,
  getSepsWindow,
  isSameCalendarDay,
} from "@/lib/periodos";
import { SERVICE_DEFINITIONS } from "@/lib/tabulator-template";
import { getAreaById, type ModuleId } from "@/lib/modules";

export const runtime = "nodejs";
export const maxDuration = 60;

// =============================================================================
// RECORDATORIO DE CAPTURA
// -----------------------------------------------------------------------------
// Una vez al día, PULSO revisa si HOY es el último día hábil de la ventana de
// captura de algún módulo. Si lo es, le escribe SOLO a quien todavía no entregó
// su tablero, avisándole que ese mismo día a las 2:30 p. m. se cierra.
//
// Nadie más recibe copia: ni Dirección ni los jefes de división. Es un aviso de
// trabajo, no un reporte de incumplimiento.
//
// Quién lo llama:
//   GET  -> el cron de Vercel, con "Authorization: Bearer $CRON_SECRET".
//   POST -> un administrador desde el panel, para probar. Acepta { simular:true }
//           para ver a quién le tocaría SIN mandar nada.
//
// MODO PRUEBA (RECORDATORIOS_PRUEBA con un correo adentro): todos los correos
// se desvían a esa dirección, cada uno con un aviso arriba diciendo a quién le
// habría llegado. Así se revisa el texto y la lista sin escribirle al hospital.
// Para activarlo de verdad, se borra esa variable en Vercel.
// =============================================================================

type Pendiente = {
  serviceId: string;
  serviceName: string;
  modulo: string;
  periodo: string;
};

type Destinatario = {
  correo: string;
  nombre: string;
  pendientes: Pendiente[];
};

const ETIQUETA_MODULO: Record<ModuleId, string> = {
  perc: "PERC",
  sesps: "SEPS",
  distribucion: "Distribución de Horas",
};

const COLECCION_POR_MODULO: Record<ModuleId, string> = {
  perc: "serviceTabulators",
  sesps: "sepsTabulators",
  distribucion: "horasTabulators",
};

/** La hora de El Salvador, no la del servidor (que corre en UTC). */
function ahoraEnElSalvador(): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const buscar = (tipo: string) =>
    Number.parseInt(partes.find((p) => p.type === tipo)?.value ?? "0", 10);
  return new Date(
    buscar("year"),
    buscar("month") - 1,
    buscar("day"),
    buscar("hour"),
    buscar("minute"),
    0,
    0,
  );
}

/** Días bloqueados del año (feriados y asuetos que carga el administrador). */
async function diasBloqueados(
  db: FirebaseFirestore.Firestore,
  anio: number,
): Promise<string[]> {
  const snap = await db
    .collection("captureCalendar")
    .where("periodId", ">=", `${anio}-01`)
    .where("periodId", "<=", `${anio}-12`)
    .get();
  const fechas: string[] = [];
  snap.forEach((doc) => {
    const valor = doc.data()?.blockedDates;
    if (Array.isArray(valor)) {
      for (const f of valor) if (typeof f === "string") fechas.push(f);
    }
  });
  return fechas;
}

/** Servicios que YA entregaron ese módulo en ese periodo. */
async function entregados(
  db: FirebaseFirestore.Firestore,
  moduleId: ModuleId,
  periodo: string,
): Promise<Set<string>> {
  const snap = await db
    .collection(COLECCION_POR_MODULO[moduleId])
    .where("periodId", "==", periodo)
    .get();
  const ids = new Set<string>();
  snap.forEach((doc) => {
    const d = doc.data() as { serviceId?: unknown; values?: Record<string, Record<string, unknown>> };
    if (typeof d.serviceId !== "string") return;
    // En PERC un documento guardado pero VACIO no cuenta como entregado: es el
    // mismo criterio del monitoreo, para no dejar sin aviso a quien solo abrió.
    if (moduleId === "perc") {
      const hayAlgo = Object.values(d.values ?? {}).some((fila) =>
        Object.values(fila ?? {}).some((celda) => String(celda ?? "").trim() !== ""),
      );
      if (!hayAlgo) return;
    }
    ids.add(d.serviceId);
  });
  return ids;
}

function cuerpoDelCorreo(destino: Destinatario, cierre: string) {
  const lista = destino.pendientes
    .map(
      (p) =>
        `<li style="margin:0 0 6px;"><strong>${escaparHtml(p.modulo)}</strong> · ${escaparHtml(
          p.serviceName,
        )} <span style="color:#64748b;">(${escaparHtml(p.periodo)})</span></li>`,
    )
    .join("");

  const asunto =
    destino.pendientes.length === 1
      ? `PULSO · Hoy cierra la captura de ${destino.pendientes[0].modulo}`
      : "PULSO · Hoy cierra la captura de sus tableros";

  const texto = [
    `Estimado(a) ${destino.nombre}:`,
    "",
    `Hoy es el último día para entregar la captura del mes y el sistema cierra a las ${cierre}.`,
    "",
    "PENDIENTE:",
    ...destino.pendientes.map((p) => `- ${p.modulo} · ${p.serviceName} (${p.periodo})`),
    "",
    `Puede ingresar en: ${APP_URL}`,
    "",
    "Si ya lo entregó por otro medio, ignore este mensaje.",
  ].join("\n");

  const interior = `
        <p style="margin:0 0 14px;font-size:15px;color:#0f172a;">Estimado(a) ${escaparHtml(
          destino.nombre,
        )}:</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#334155;">
          Hoy es el <strong>último día</strong> para entregar la captura del mes.
          El sistema cierra a las <strong>${escaparHtml(cierre)}</strong>.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
          <tr>
            <td style="padding:16px 18px;">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#64748b;">Le falta entregar</p>
              <ul style="margin:0;padding-left:18px;font-size:14px;line-height:22px;color:#0f172a;">${lista}</ul>
            </td>
          </tr>
        </table>
        <p style="margin:22px 0 0;text-align:center;">
          <a href="${APP_URL}" style="display:inline-block;background:#1f6f68;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 26px;border-radius:12px;">Entrar a PULSO</a>
        </p>
        <p style="margin:20px 0 0;font-size:12px;line-height:19px;color:#64748b;">
          Si ya lo entregó por otro medio (correo o papel), ignore este mensaje.
        </p>`;

  return { asunto, texto, html: envolverHtml(interior) };
}

/** Arma la lista de a quién habría que escribirle hoy. */
async function calcularEnvios(db: FirebaseFirestore.Firestore) {
  const hoy = ahoraEnElSalvador();
  const bloqueados = await diasBloqueados(db, hoy.getFullYear());

  // ¿De qué módulos cierra HOY la ventana?
  const modulos: { moduleId: ModuleId; periodo: string }[] = [];
  for (const moduleId of ["perc", "sesps", "distribucion"] as const) {
    if (moduleId === "sesps") {
      const ventana = getSepsWindow(hoy, bloqueados);
      const ultimo = ventana.closeDays[ventana.closeDays.length - 1];
      if (ultimo && isSameCalendarDay(ultimo, hoy)) {
        modulos.push({ moduleId, periodo: ventana.periodId });
      }
      continue;
    }
    const ventana = getCaptureWindow(hoy, bloqueados, moduleId);
    if (ventana.lastOpenDay && isSameCalendarDay(ventana.lastOpenDay, hoy)) {
      modulos.push({ moduleId, periodo: getClosingPeriodId(hoy) });
    }
  }

  if (modulos.length === 0) {
    return { hoy, modulos: [], destinatarios: [] as Destinatario[] };
  }

  // Quién es responsable de cada servicio (cuentas activas, con correo).
  const usuarios = await db.collection("serviceUsers").get();
  const porServicio = new Map<string, { correo: string; nombre: string }>();
  usuarios.forEach((doc) => {
    const d = doc.data() as {
      serviceId?: unknown;
      contactEmail?: unknown;
      email?: unknown;
      name?: unknown;
      isActive?: unknown;
      noCapture?: unknown;
    };
    if (typeof d.serviceId !== "string" || !d.serviceId) return;
    if (d.isActive === false || d.noCapture === true) return;
    // El correo de CONTACTO, no el de acceso: "bmejia@perc-hnes.app" es una
    // identidad interna, no un buzon al que le llegue nada.
    const contacto = typeof d.contactEmail === "string" ? d.contactEmail.trim() : "";
    const alterno = typeof d.email === "string" ? d.email.trim() : "";
    const correo = esCorreo(contacto) ? contacto : alterno;
    if (!esCorreo(correo) || correo.toLowerCase().endsWith("@perc-hnes.app")) return;
    porServicio.set(d.serviceId, {
      correo,
      nombre: (typeof d.name === "string" && d.name.trim()) || correo,
    });
  });

  // Pendientes de cada módulo que cierra hoy, agrupados por persona.
  const porCorreo = new Map<string, Destinatario>();
  for (const { moduleId, periodo } of modulos) {
    const yaEstan = await entregados(db, moduleId, periodo);
    for (const servicio of SERVICE_DEFINITIONS) {
      const suyos = getAreaById(servicio.id)?.modules ?? [];
      if (!suyos.includes(moduleId)) continue;
      if (yaEstan.has(servicio.id)) continue;
      const persona = porServicio.get(servicio.id);
      if (!persona) continue;
      const clave = persona.correo.toLowerCase();
      const actual = porCorreo.get(clave) ?? {
        correo: persona.correo,
        nombre: persona.nombre,
        pendientes: [],
      };
      actual.pendientes.push({
        serviceId: servicio.id,
        serviceName: servicio.name,
        modulo: ETIQUETA_MODULO[moduleId],
        periodo: getPeriodLabel(periodo),
      });
      porCorreo.set(clave, actual);
    }
  }

  return {
    hoy,
    modulos: modulos.map((m) => ETIQUETA_MODULO[m.moduleId]),
    destinatarios: [...porCorreo.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  };
}

async function ejecutar(simular: boolean, origen: string) {
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Servidor no configurado." }, { status: 500 });
  }

  const { hoy, modulos, destinatarios } = await calcularEnvios(db);
  const fechaClave = getPeriodId(hoy) + "-" + String(hoy.getDate()).padStart(2, "0");

  if (modulos.length === 0) {
    return NextResponse.json({
      ok: true,
      enviados: 0,
      motivo: "Hoy no cierra la ventana de ningún módulo.",
      fecha: fechaClave,
    });
  }

  const desvio = (process.env.RECORDATORIOS_PRUEBA || "").trim();
  const enPrueba = esCorreo(desvio);

  if (simular) {
    return NextResponse.json({
      ok: true,
      simulado: true,
      fecha: fechaClave,
      modulos,
      enPrueba,
      desvio: enPrueba ? desvio : null,
      destinatarios: destinatarios.map((d) => ({
        correo: d.correo,
        nombre: d.nombre,
        pendientes: d.pendientes.map((p) => `${p.modulo} · ${p.serviceName}`),
      })),
    });
  }

  // Una sola tanda por día: si el cron se repite, no se escribe dos veces.
  const marca = db.collection("documentControl").doc("recordatorios");
  const previo = await marca.get();
  const yaEnviado = previo.exists ? (previo.data()?.[fechaClave] as unknown) : null;
  if (yaEnviado && origen === "cron") {
    return NextResponse.json({
      ok: true,
      enviados: 0,
      motivo: "Los recordatorios de hoy ya se habían enviado.",
      fecha: fechaClave,
    });
  }

  let enviados = 0;
  const fallidos: string[] = [];
  const cierre = "2:30 p. m.";

  for (const destino of destinatarios) {
    const { asunto, texto, html } = cuerpoDelCorreo(destino, cierre);
    const aviso = enPrueba
      ? `<div style="margin:0 0 14px;padding:10px 14px;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;font-size:12px;color:#92400e;">
           MODO PRUEBA · Este correo le habría llegado a <strong>${escaparHtml(destino.nombre)}</strong> (${escaparHtml(destino.correo)}).
         </div>`
      : "";
    const resultado = await enviarCorreo(
      enPrueba ? desvio : destino.correo,
      enPrueba ? "Prueba" : destino.nombre,
      enPrueba ? `[PRUEBA] ${asunto}` : asunto,
      aviso ? html.replace("<td style=\"padding:30px;\">", `<td style="padding:30px;">${aviso}`) : html,
      enPrueba ? `[PRUEBA · para ${destino.correo}]\n\n${texto}` : texto,
    );
    if (resultado.enviado) enviados += 1;
    else fallidos.push(`${destino.correo}: ${resultado.error ?? "error"}`);
  }

  await marca.set(
    {
      [fechaClave]: {
        modulos,
        destinatarios: destinatarios.length,
        enviados,
        enPrueba,
        origen,
        at: new Date().toISOString(),
      },
    },
    { merge: true },
  );

  return NextResponse.json({
    ok: true,
    fecha: fechaClave,
    modulos,
    enPrueba,
    destinatarios: destinatarios.length,
    enviados,
    fallidos: fallidos.slice(0, 10),
  });
}

/** Lo llama el cron de Vercel una vez al día. */
export async function GET(req: NextRequest) {
  const secreto = (process.env.CRON_SECRET || "").trim();
  const cabecera = req.headers.get("authorization") || "";
  if (!secreto || cabecera !== `Bearer ${secreto}`) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  return ejecutar(false, "cron");
}

/** Prueba manual desde el panel de administración. */
export async function POST(req: NextRequest) {
  let body: { idToken?: string; simular?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!idToken || !adminAuth || !adminDb) {
    return NextResponse.json({ ok: false, error: "Falta autenticación." }, { status: 401 });
  }

  let uid = "";
  try {
    uid = (await adminAuth.verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });
  }

  const quien = await adminDb.collection("serviceUsers").doc(uid).get();
  if (!quien.exists || quien.data()?.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Sin permisos." }, { status: 403 });
  }

  return ejecutar(body.simular !== false ? true : false, "manual");
}
