// CRITERIO UNICO DE ENTREGA por modulo (PERC, SEPS, Distribucion de Horas).
// Lo usan Monitoreo, tendencias, tarjetas del inicio y los recordatorios por
// correo (api/recordatorios), para que todos digan lo mismo. Sin dependencias
// de Firebase: sirve en el navegador y en el servidor.
import { percEntregado, tieneDatosPerc } from "./perc-entrega";

export type ModuloEntrega = "perc" | "sesps" | "distribucion";
export type EstadoEntrega = "entregado" | "en-digitacion" | "sin-iniciar";

// DISTRIBUCION DE HORAS COMPLETA: no basta con guardar. Cuenta como entregada
// cuando al menos el 90% de las personas de la lista tiene horas registradas.
export const HORAS_UMBRAL_COMPLETO = 0.9;

export function horasAvance(employees: unknown): { conHoras: number; total: number; pct: number; completo: boolean } {
  const lista = Array.isArray(employees) ? employees : [];
  let total = 0;
  let conHoras = 0;
  for (const item of lista) {
    const row = (item ?? {}) as { name?: unknown; dui?: unknown; comment?: unknown; hours?: Record<string, unknown> };
    const nombre = typeof row.name === "string" ? row.name.trim() : "";
    const dui = typeof row.dui === "string" ? row.dui.trim() : "";
    if (!nombre && !dui) continue;
    total += 1;
    // Cuenta como REGISTRADA si tiene horas, si se le puso 0 a proposito o si
    // tiene un comentario (licencia, vacaciones, incapacidad...).
    const valores = Object.values(row.hours ?? {}).map((valor) => String(valor ?? "").trim());
    const conValor = valores.some((v) => v !== "" && Number.isFinite(Number(v)));
    const comentario = typeof row.comment === "string" && row.comment.trim() !== "";
    if (conValor || comentario) conHoras += 1;
  }
  const pct = total > 0 ? conHoras / total : 0;
  return { conHoras, total, pct, completo: total > 0 && pct >= HORAS_UMBRAL_COMPLETO };
}

type Documento = Record<string, unknown> | undefined | null;

/** SEPS: igual que PERC. El autoguardado deja "borrador"; solo "Confirmar
 *  entrega" deja "entregado". Los documentos viejos (sin estadoEntrega) con
 *  datos conservan el criterio historico y cuentan como entregados. */
export function sepsEntregado(doc: Documento) {
  if (!doc) return false;
  const estado = doc.estadoEntrega;
  const values = doc.values as Record<string, Record<string, unknown>> | undefined;
  const tienePruebas = doc.serviceId === "laboratorio-clinico" && doc.laboratorioConDatos === true;
  return (estado === "entregado" || estado === undefined) && (tieneDatosPerc(values) || tienePruebas);
}

export function moduloEntregado(modulo: ModuloEntrega, doc: Documento): boolean {
  if (!doc) return false;
  if (modulo === "perc") return percEntregado(doc as Parameters<typeof percEntregado>[0]);
  if (modulo === "sesps") return sepsEntregado(doc);
  return horasAvance(doc.employees).completo;
}

/** Estado para mostrar a la jefatura: entregado, en digitacion (empezó pero no
 *  entregó) o sin iniciar. */
export function estadoModulo(modulo: ModuloEntrega, doc: Documento): EstadoEntrega {
  if (!doc) return "sin-iniciar";
  if (moduloEntregado(modulo, doc)) return "entregado";
  if (modulo === "distribucion") {
    return horasAvance(doc.employees).conHoras > 0 ? "en-digitacion" : "sin-iniciar";
  }
  const values = doc.values as Record<string, Record<string, unknown>> | undefined;
  return doc.estadoEntrega === "borrador" || tieneDatosPerc(values) ? "en-digitacion" : "sin-iniciar";
}
