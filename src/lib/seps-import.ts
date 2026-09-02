// =============================================================================
// Importación de un tabulador SEPS desde el Excel ORIGINAL del servicio.
// -----------------------------------------------------------------------------
// A diferencia del importador clásico (que lee una sola hoja y ubica las filas
// por su POSICIÓN), este recorre TODAS las hojas del libro y reconoce cada fila
// por su TEXTO: la etiqueta de la actividad más el contexto que la acompaña a la
// izquierda (componente, grupo de atención, bloque). Así el archivo del servicio
// se puede subir tal como ellos lo llenan, y sigue calzando aunque agreguen o
// muevan filas.
//
// Se usa hoy en el tabulador de la División de Enfermería, cuyo libro trae la
// hoja del tabulador diario, seis hojas de promoción de la salud y la de visita
// domiciliar.
// =============================================================================
import type { SepsTemplate } from "@/lib/seps-templates";

/** Texto comparable: sin acentos, sin signos y en mayúsculas. */
export function normalizeLabel(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

/** Fila de la plantilla, ya preparada para comparar. */
type TargetRow = {
  key: string;
  label: string;
  /** Grupo(s) de la fila (p. ej. "0 - 7 años"). */
  groups: string[];
  /** Pistas tomadas del título de la tabla (p. ej. "MEDICINA"). */
  tableHints: string[];
  used: boolean;
};

/**
 * Del título "PROMOCIÓN DE LA SALUD · SALUD BUCAL" saca "SALUD BUCAL": el bloque
 * al que pertenece la tabla. Es lo que distingue una fila "Hombres · 0 - 7 años"
 * de Salud bucal de la idéntica de Diabetes, así que se compara de forma estricta
 * y NO se usa el subtítulo, que es igual en todas y solo introduce ruido.
 */
function tableHintsOf(title: string): string[] {
  const parts = title
    .split(/[·–—]|(?: - )/)
    .map((part) => normalizeLabel(part))
    .filter((part) => part.length >= 4);
  if (parts.length === 0) return [];
  const last = parts[parts.length - 1];
  const hints = [last];
  const full = normalizeLabel(title);
  if (full && full !== last) hints.push(full);
  return hints;
}

function buildTargets(template: SepsTemplate): TargetRow[] {
  const targets: TargetRow[] = [];
  for (const table of template.tables ?? []) {
    // Las tablas mensuales no vienen en el Excel diario.
    if (table.monthly) continue;
    const hints = tableHintsOf(table.title);
    for (const row of table.rows) {
      if (row.readOnly) continue;
      const groups = row.groups && row.groups.length > 0 ? row.groups : row.group ? [row.group] : [];
      targets.push({
        key: row.key,
        label: normalizeLabel(row.label),
        groups: groups.map(normalizeLabel).filter(Boolean),
        tableHints: hints,
        used: false,
      });
    }
  }
  return targets;
}

/** Una fila de datos encontrada en el Excel. */
type SourceRow = {
  label: string;
  /** Todo el texto que la acompaña a la izquierda (arrastrado hacia abajo). */
  context: string[];
  /** Valores por día, en el orden de las columnas de día. */
  values: string[];
};

/** Localiza la fila con la secuencia 1, 2, 3… y devuelve dónde empieza el día 1. */
function findDayHeader(aoa: unknown[][], from: number): { row: number; col: number } | null {
  for (let r = from; r < aoa.length; r += 1) {
    const row = aoa[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      if (Number(row[c]) !== 1) continue;
      let consecutive = 1;
      for (let k = 1; k <= 4; k += 1) {
        if (Number(row[c + k]) === k + 1) consecutive += 1;
        else break;
      }
      if (consecutive >= 5) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

/**
 * Lee una hoja: encuentra su cabecera de días y devuelve las filas de datos con
 * su etiqueta, su contexto (columnas de texto a la izquierda, arrastradas) y sus
 * valores por día.
 */
function readSheet(aoa: unknown[][], dayCount: number): SourceRow[] {
  const header = findDayHeader(aoa, 0);
  if (!header) return [];

  const out: SourceRow[] = [];
  // Valor vigente de cada columna de texto (se arrastra hacia abajo, como en el
  // Excel, donde el componente solo se escribe en la primera fila del bloque).
  const carried: string[] = [];

  for (let r = header.row + 1; r < aoa.length; r += 1) {
    const row = aoa[r] || [];

    // Si aparece otra cabecera de días (varias tablas en la misma hoja), se salta.
    if (Number(row[header.col]) === 1 && Number(row[header.col + 1]) === 2) {
      continue;
    }

    let label = "";
    for (let c = 0; c < header.col; c += 1) {
      const raw = row[c];
      const text = typeof raw === "string" ? raw.trim() : raw === null || raw === undefined ? "" : String(raw).trim();
      if (text) {
        carried[c] = text;
        label = text;
      }
    }
    if (!label) continue;

    const values: string[] = [];
    let hasValue = false;
    for (let d = 0; d < dayCount; d += 1) {
      const raw = row[header.col + d];
      const text = raw === null || raw === undefined ? "" : String(raw).trim();
      values.push(text);
      if (text !== "") hasValue = true;
    }
    if (!hasValue) continue;

    const context = carried
      .filter((value) => typeof value === "string" && value.trim() !== "")
      .map(normalizeLabel);

    out.push({ label: normalizeLabel(label), context, values });
  }

  return out;
}

export type SepsImportResult = {
  /** rowKey -> { día -> valor } */
  values: Record<string, Record<string, string>>;
  /** Cuántas celdas con dato se reconocieron. */
  filled: number;
  /** Filas del Excel que no se pudieron ubicar en la plantilla. */
  unmatched: string[];
};

/**
 * Importa el libro completo contra la plantilla. `sheets` es cada hoja ya
 * convertida a matriz (incluidas las filas en blanco).
 */
export function importSepsWorkbookByLabels(
  template: SepsTemplate,
  sheets: unknown[][][],
  dayColumns: string[],
): SepsImportResult {
  const targets = buildTargets(template);
  const values: Record<string, Record<string, string>> = {};
  const unmatched: string[] = [];
  let filled = 0;

  for (const aoa of sheets) {
    const rows = readSheet(aoa, dayColumns.length);

    for (const source of rows) {
      // Candidatas: misma etiqueta y todavía sin usar.
      const candidates = targets.filter((t) => !t.used && t.label === source.label);
      if (candidates.length === 0) {
        if (source.label && !unmatched.includes(source.label)) {
          unmatched.push(source.label);
        }
        continue;
      }

      // Se elige la que mejor encaja con el contexto: primero el grupo, luego el
      // bloque al que pertenece la tabla.
      let best = candidates[0];
      let bestScore = -1;
      for (const candidate of candidates) {
        let score = 0;
        for (const group of candidate.groups) {
          if (source.context.some((ctx) => ctx === group || ctx.includes(group) || group.includes(ctx))) {
            score += 3;
          }
        }
        for (const hint of candidate.tableHints) {
          // Estricto a proposito: el contexto del Excel debe CONTENER el nombre del
          // bloque. Antes se aceptaba tambien al reves y bloques distintos empataban.
          if (source.context.some((ctx) => ctx === hint || ctx.includes(hint))) {
            score += 5;
            break;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      best.used = true;
      const cells: Record<string, string> = {};
      source.values.forEach((raw, index) => {
        const day = dayColumns[index];
        if (!day) return;
        const clean = raw.replace(/[^0-9.,-]/g, "").replace(",", ".");
        const numeric = Number.parseFloat(clean);
        if (!Number.isFinite(numeric)) return;
        cells[day] = String(numeric);
        filled += 1;
      });
      if (Object.keys(cells).length > 0) {
        values[best.key] = { ...(values[best.key] || {}), ...cells };
      }
    }
  }

  return { values, filled, unmatched };
}
