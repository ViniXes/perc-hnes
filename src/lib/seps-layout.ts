// =============================================================================
// Estructura editable de un tabulador SEPS (por servicio, permanente).
// -----------------------------------------------------------------------------
// La plantilla del código es la BASE oficial. Encima se aplica un "layout" que el
// administrador guarda en Firestore (colección `sepsLayouts`, un documento por
// servicio) con los ajustes de estructura: tablas eliminadas o renombradas, filas
// ocultas o renombradas, filas y tablas agregadas.
//
// Es PERMANENTE: se ajusta una vez y todos los meses siguientes se arman con la
// matriz corregida, sin rehacer el trabajo cada mes. Los datos ya capturados no se
// tocan: ocultar una fila no borra su historial, solo deja de pedirla.
//
// Nació para el SEPS de la División de Enfermería, que es el más extenso y el que
// más cambia, pero funciona igual para cualquier otro servicio.
// =============================================================================
import type { SepsRow, SepsTable, SepsTemplate } from "@/lib/seps-templates";

/** Fila agregada a mano a una tabla existente. */
export type SepsLayoutExtraRow = {
  tableId: string;
  key: string;
  label: string;
  /** Fila tras la cual se inserta (hereda su grupo). Vacío = al final. */
  afterKey?: string;
  group?: string;
  /** Niveles de grupo PROPIOS (externo -> interno), p.ej. ["Chagas","Resultado"].
   * Si viene, manda sobre lo que herede del ancla: sirve para abrir un título
   * nuevo dentro de una tabla (Chagas) y colgarle sus filas (Reactiva, etc.). */
  groups?: string[];
  /** Fila de TOTAL: no se digita, se calcula sumando las filas de `sumOf`. */
  readOnly?: boolean;
  /** Claves de las filas que suma esta fila de total, día por día. */
  sumOf?: string[];
};

/** Columna propia de una tabla mensual creada por el administrador. */
export type SepsLayoutColumn = {
  key: string;
  label: string;
  /** Encabezado agrupador (se combina arriba, como "Resultado" en el Excel). */
  group?: string;
  /** Formula tipo Excel aplicada a todas las filas ("=SUMA(A:I)"). */
  formula?: string;
};

/** Tabla creada desde cero. */
export type SepsLayoutExtraTable = {
  id: string;
  title: string;
  subtitle?: string;
  detailLabel?: string;
  rows: { key: string; label: string; group?: string; groups?: string[] }[];
  /** true = tabla MENSUAL con columnas propias; ausente = tabla diaria. */
  monthly?: boolean;
  /** Columnas propias (solo si monthly). */
  columns?: SepsLayoutColumn[];
  /** Formula de una celda: "filaKey|columnaKey" -> "=A1+B1". */
  cellFormulas?: Record<string, string>;
};

export type SepsLayout = {
  serviceId: string;
  /** Ids de tablas eliminadas (con todas sus filas). */
  hiddenTables: string[];
  /** Claves de filas oficiales ocultas. */
  hiddenRows: string[];
  /** tableId -> nuevo título / subtítulo. */
  tableTitles: Record<string, { title?: string; subtitle?: string }>;
  /** rowKey -> nueva etiqueta (sirve para filas oficiales y agregadas). */
  rowLabels: Record<string, string>;
  extraRows: SepsLayoutExtraRow[];
  extraTables: SepsLayoutExtraTable[];
  /** tableId -> orden de las filas (por key). Lo que no esté listado queda al final,
   * en su orden original. Permite subir y bajar filas como en Excel. */
  rowOrder: Record<string, string[]>;
};

export function emptySepsLayout(serviceId: string): SepsLayout {
  return {
    serviceId,
    hiddenTables: [],
    hiddenRows: [],
    tableTitles: {},
    rowLabels: {},
    extraRows: [],
    extraTables: [],
    rowOrder: {},
  };
}

/** ¿El layout cambia algo respecto de la plantilla oficial? */
export function isSepsLayoutEmpty(layout: SepsLayout | null | undefined): boolean {
  if (!layout) return true;
  return (
    layout.hiddenTables.length === 0 &&
    layout.hiddenRows.length === 0 &&
    layout.extraRows.length === 0 &&
    layout.extraTables.length === 0 &&
    Object.keys(layout.tableTitles).length === 0 &&
    Object.keys(layout.rowLabels).length === 0 &&
    Object.keys(layout.rowOrder ?? {}).length === 0
  );
}

/** Normaliza lo que venga de Firestore a un layout completo y seguro. */
export function parseSepsLayout(serviceId: string, data: unknown): SepsLayout {
  const base = emptySepsLayout(serviceId);
  if (!data || typeof data !== "object") return base;
  const raw = data as Partial<SepsLayout>;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  return {
    serviceId,
    hiddenTables: strings(raw.hiddenTables),
    hiddenRows: strings(raw.hiddenRows),
    tableTitles:
      raw.tableTitles && typeof raw.tableTitles === "object"
        ? (raw.tableTitles as SepsLayout["tableTitles"])
        : {},
    rowLabels:
      raw.rowLabels && typeof raw.rowLabels === "object"
        ? (raw.rowLabels as SepsLayout["rowLabels"])
        : {},
    extraRows: Array.isArray(raw.extraRows)
      ? (raw.extraRows.filter(
          (row) => row && typeof row === "object" && typeof (row as SepsLayoutExtraRow).key === "string",
        ) as SepsLayoutExtraRow[])
      : [],
    extraTables: Array.isArray(raw.extraTables)
      ? (raw.extraTables.filter(
          (table) =>
            table && typeof table === "object" && typeof (table as SepsLayoutExtraTable).id === "string",
        ) as SepsLayoutExtraTable[])
      : [],
    rowOrder:
      raw.rowOrder && typeof raw.rowOrder === "object"
        ? (raw.rowOrder as SepsLayout["rowOrder"])
        : {},
  };
}

/** Reordena las filas de una tabla segun el orden guardado. */
function ordenarFilas(rows: SepsRow[], orden: string[] | undefined): SepsRow[] {
  if (!orden || orden.length === 0) return rows;
  const posicion = new Map(orden.map((key, index) => [key, index]));
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const pa = posicion.get(a.row.key);
      const pb = posicion.get(b.row.key);
      if (pa === undefined && pb === undefined) return a.index - b.index;
      if (pa === undefined) return 1;
      if (pb === undefined) return -1;
      return pa - pb;
    })
    .map((item) => item.row);
}

/**
 * Devuelve la plantilla EFECTIVA: la oficial con los ajustes aplicados. Todo lo
 * demás del sistema (captura, guardado, importación de Excel, consolidados) usa
 * esta, así que basta con aplicarla en un punto para que el cambio se propague.
 */
export function applySepsLayout(
  template: SepsTemplate | null,
  layout: SepsLayout | null | undefined,
): SepsTemplate | null {
  if (!template) return null;
  if (!layout || isSepsLayoutEmpty(layout)) return template;
  // El formato matricial (Laboratorio) no se ajusta por aquí.
  if (template.kind === "matrix" || !template.tables) return template;

  const hiddenTables = new Set(layout.hiddenTables);
  const hiddenRows = new Set(layout.hiddenRows);

  const tables: SepsTable[] = [];

  for (const table of template.tables) {
    if (hiddenTables.has(table.id)) continue;

    const rename = layout.tableTitles[table.id];
    const rows: SepsRow[] = [];

    for (const row of table.rows) {
      if (hiddenRows.has(row.key)) continue;
      const label = layout.rowLabels[row.key];
      rows.push(label ? { ...row, label } : { ...row });
    }

    // Filas agregadas a esta tabla: se insertan tras su ancla (heredando el grupo)
    // o al final si el ancla ya no existe.
    const extras = layout.extraRows.filter((extra) => extra.tableId === table.id);
    for (const extra of extras) {
      const label = layout.rowLabels[extra.key] ?? extra.label;
      const index = extra.afterKey ? rows.findIndex((row) => row.key === extra.afterKey) : -1;
      const anchor = index >= 0 ? rows[index] : undefined;
      const propios = Array.isArray(extra.groups)
        ? extra.groups.filter((g) => typeof g === "string" && g.trim() !== "")
        : [];
      const groups = propios.length > 0 ? propios : anchor?.groups;
      const group = propios.length > 0 ? undefined : extra.group ?? anchor?.group;
      const newRow: SepsRow = {
        key: extra.key,
        label,
        ...(groups ? { groups } : {}),
        ...(group ? { group } : {}),
        ...(extra.readOnly ? { readOnly: true } : {}),
        ...(extra.sumOf && extra.sumOf.length > 0 ? { sumOf: extra.sumOf } : {}),
      };
      if (index >= 0) rows.splice(index + 1, 0, newRow);
      else rows.push(newRow);
    }

    if (rows.length === 0) continue;

    tables.push({
      ...table,
      rows: ordenarFilas(rows, layout.rowOrder?.[table.id]),
      title: rename?.title ?? table.title,
      subtitle: rename?.subtitle ?? table.subtitle,
    });
  }

  // Tablas creadas desde cero, al final del tabulador.
  for (const extra of layout.extraTables) {
    if (hiddenTables.has(extra.id)) continue;
    const rename = layout.tableTitles[extra.id];
    const rows = extra.rows
      .filter((row) => !hiddenRows.has(row.key))
      .map((row) => ({
        key: row.key,
        label: layout.rowLabels[row.key] ?? row.label,
        ...(row.group ? { group: row.group } : {}),
      }));
    const extraRows = layout.extraRows.filter((row) => row.tableId === extra.id);
    for (const row of extraRows) {
      const propios = Array.isArray(row.groups)
        ? row.groups.filter((g) => typeof g === "string" && g.trim() !== "")
        : [];
      rows.push({
        key: row.key,
        label: layout.rowLabels[row.key] ?? row.label,
        ...(propios.length > 0 ? { groups: propios } : {}),
        ...(row.readOnly ? { readOnly: true } : {}),
        ...(row.sumOf && row.sumOf.length > 0 ? { sumOf: row.sumOf } : {}),
      });
    }
    tables.push({
      id: extra.id,
      title: rename?.title ?? extra.title,
      subtitle: rename?.subtitle ?? extra.subtitle,
      detailLabel: extra.detailLabel || "Detalle",
      rows: ordenarFilas(rows, layout.rowOrder?.[extra.id]),
      ...(extra.monthly
        ? {
            monthly: true,
            columns: (extra.columns ?? []).map((columna) => ({
              key: columna.key,
              label: layout.rowLabels[columna.key] ?? columna.label,
              ...(columna.group ? { group: columna.group } : {}),
              ...(columna.formula ? { formula: columna.formula } : {}),
            })),
            ...(extra.cellFormulas ? { cellFormulas: extra.cellFormulas } : {}),
          }
        : {}),
    });
  }

  return { ...template, tables };
}

/** Id del documento de estructura en Firestore. */
export function getSepsLayoutId(serviceId: string): string {
  return serviceId;
}
