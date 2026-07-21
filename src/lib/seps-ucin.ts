// AUTO-GENERADO desde "SEPS UCIN.xlsx" (hoja MES ACTUAL).
// Unidad de Cuidados Intermedios (UCIN): 3 subunidades que llenan el MISMO cuadro
// (Hospitalización, grupo Medicina). Total por fila (=SUM). Fiel al Excel.
// El consolidado (suma de las 3) se maneja aparte (solo admin/supervisores).
import type { SepsTemplate, SepsTable } from "@/lib/seps-templates";

// Mismo cuadro para las 3 subunidades (claves compartidas -> facilita el consolidado).
const UCIN_TABLES: SepsTable[] = [
  {
    id: "ucin_hospitalizacion",
    title: "TABULADOR DIARIO DE SERVICIOS HOSPITALIZACION",
    detailLabel: "Actividad",
    rows: [
      { key: "ucin_med_ingresos", label: "Ingresos", group: "Medicina" },
      { key: "ucin_med_traslados_a", label: "Traslados a otros servicios", group: "Medicina" },
      { key: "ucin_med_traslados_de", label: "Traslados de otros servicios", group: "Medicina" },
      { key: "ucin_med_dias_pacientes", label: "Días pacientes (saldo)", group: "Medicina" },
      { key: "ucin_med_dias_camas", label: "Días camas disponible", group: "Medicina" },
      { key: "ucin_med_dotacion_camas", label: "Dotación de camas", group: "Medicina" },
    ],
  },
];

export const UCIN_AISLADOS_TEMPLATE: SepsTemplate = {
  serviceId: "ucin-aislados",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: UCIN_TABLES,
};

export const UCIN_CRONICOS_TEMPLATE: SepsTemplate = {
  serviceId: "ucin-cronicos",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: UCIN_TABLES,
};

export const UCIN_TEMPLATE: SepsTemplate = {
  serviceId: "ucin",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: UCIN_TABLES,
};

// Consolidado (solo lectura): suma los SEPS de las 3 subunidades. Solo admin/supervisores.
export const UCIN_CONSOLIDADO_TEMPLATE: SepsTemplate = {
  serviceId: "ucin-consolidado",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  displayName: "UCIN Consolidado",
  tables: UCIN_TABLES,
  consolidatesFrom: ["ucin-aislados", "ucin-cronicos", "ucin"],
};
