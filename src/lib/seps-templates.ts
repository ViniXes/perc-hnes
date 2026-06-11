// =============================================================================
// Plantillas de captura SEPS (tabuladores diarios).
// -----------------------------------------------------------------------------
// A diferencia de Distribucion de Horas (filas = conceptos, columnas = centros de
// costo), los SEPS son tabuladores DIARIOS: columnas = dias del mes (1..N) + Total
// auto-sumado. Cada servicio tiene una plantilla propia (las hojas Excel difieren).
//
// Para agregar un SEPS nuevo en el futuro: añade una entrada a SEPS_TEMPLATES con
// sus tablas/filas. El motor de render y guardado no se vuelve a tocar.
// =============================================================================

export type SepsRow = {
  /** Id estable para guardar (no cambia aunque cambie la etiqueta). */
  key: string;
  /** Etiqueta visible en la columna "Detalle". */
  label: string;
  /** Sangria visual (0 = sin sangria; 1 = a/b; etc.). */
  indent?: number;
  /** Etiqueta de grupo (p.ej. "0 a 7 años") que agrupa filas consecutivas. */
  group?: string;
  /** Fila calculada (solo lectura): no se captura. */
  readOnly?: boolean;
  /** Si readOnly: por cada dia, suma los valores de estas filas (keys). */
  sumOf?: string[];
};

export type SepsTable = {
  id: string;
  title: string;
  subtitle?: string;
  /** Etiqueta de la primera columna (por defecto "Detalle"). */
  detailLabel?: string;
  rows: SepsRow[];
};

export type SepsTemplate = {
  serviceId: string;
  /** Establecimiento fijo que va en el encabezado. */
  establishment: string;
  tables: SepsTable[];
};

// -----------------------------------------------------------------------------
// Trabajo Social
// -----------------------------------------------------------------------------

const TRABAJO_SOCIAL: SepsTemplate = {
  serviceId: "trabajo-social",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "ts_apoyo",
      title: "Tabulador diario de Servicios de Apoyo IV",
      detailLabel: "Detalle",
      rows: [
        {
          key: "casos_atendidos",
          label: "1- Casos atendidos (a+b)",
          readOnly: true,
          sumOf: ["casos_nuevos", "casos_reabiertos"],
        },
        { key: "casos_nuevos", label: "a) Casos nuevos", indent: 1 },
        { key: "casos_reabiertos", label: "b) Casos reabiertos", indent: 1 },
        { key: "casos_resueltos", label: "2- Casos resueltos" },
        { key: "casos_no_resueltos", label: "3- Casos no resueltos" },
        { key: "seguimiento_dia", label: "4- Seguimiento del dia" },
      ],
    },
    {
      id: "ts_salud_mental",
      title: "Tabulador diario de Atenciones Grupales de Salud Mental III",
      subtitle: "Atencion especializada — 9. Otras intervenciones (gestiones de asilo)",
      detailLabel: "Grupo de edad / Sexo",
      rows: buildAgeSexRows(),
    },
  ],
};

// Genera las 14 filas (7 grupos de edad × Masculino/Femenino) de la Tabla 2.
function buildAgeSexRows(): SepsRow[] {
  const ageGroups: { id: string; label: string }[] = [
    { id: "0_7", label: "0 a 7 años" },
    { id: "8_9", label: "8 a 9 años" },
    { id: "10_11", label: "10 a 11 años" },
    { id: "12_17", label: "12 a 17 años" },
    { id: "18_19", label: "18 a 19 años" },
    { id: "20_59", label: "20 a 59 años" },
    { id: "60_mas", label: "60 años a mas" },
  ];

  const rows: SepsRow[] = [];
  for (const age of ageGroups) {
    rows.push({ key: `edad_${age.id}_m`, label: "Masculino", group: age.label, indent: 1 });
    rows.push({ key: `edad_${age.id}_f`, label: "Femenino", group: age.label, indent: 1 });
  }
  return rows;
}

// -----------------------------------------------------------------------------
// Registro y helpers
// -----------------------------------------------------------------------------

export const SEPS_TEMPLATES: Record<string, SepsTemplate> = {
  "trabajo-social": TRABAJO_SOCIAL,
};

export function getSepsTemplate(serviceId: string | null | undefined): SepsTemplate | null {
  if (!serviceId) {
    return null;
  }

  return SEPS_TEMPLATES[serviceId] || null;
}

export function hasSepsTemplate(serviceId: string | null | undefined): boolean {
  return !!serviceId && serviceId in SEPS_TEMPLATES;
}

/** Todas las filas de todas las tablas de una plantilla (orden estable). */
export function getSepsRows(template: SepsTemplate): SepsRow[] {
  return template.tables.flatMap((table) => table.rows);
}

/** Numero de dias del mes de un periodo "YYYY-MM" (1..28/29/30/31). */
export function getMonthDays(periodId: string): number {
  const [yearText, monthText] = periodId.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return 31;
  }

  // Dia 0 del mes siguiente = ultimo dia del mes actual.
  return new Date(year, month, 0).getDate();
}

/** Lista de dias [1..N] como strings, para usar como claves de columna. */
export function getDayColumns(periodId: string): string[] {
  return Array.from({ length: getMonthDays(periodId) }, (_, index) => String(index + 1));
}
