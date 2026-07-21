// AUTO-GENERADO desde "UCI SEPS.xlsx". Unidad de Cuidados Intensivos (UCI):
// varias subunidades que llenan el MISMO cuadro (Hospitalización, grupo Medicina).
// Total por fila (=SUM). El consolidado suma las subunidades (solo lectura, admin/sup).
import type { SepsTemplate, SepsTable } from "@/lib/seps-templates";

const UCI_TABLES: SepsTable[] = [
  {
    id: "uci_hospitalizacion",
    title: "TABULADOR DIARIO DE SERVICIOS HOSPITALIZACION",
    detailLabel: "Actividad",
    rows: [
      { key: "uci_med_ingresos", label: "Ingresos", group: "Medicina" },
      { key: "uci_med_traslados_a", label: "Traslados a otros servicios", group: "Medicina" },
      { key: "uci_med_traslados_de", label: "Traslados de otros servicios", group: "Medicina" },
      { key: "uci_med_dias_pacientes", label: "Días pacientes (saldo)", group: "Medicina" },
      { key: "uci_med_dias_camas", label: "Días camas disponible", group: "Medicina" },
      { key: "uci_med_dotacion_camas", label: "Dotación de camas", group: "Medicina" },
    ],
  },
];

function uciTemplate(serviceId: string): SepsTemplate {
  return {
    serviceId,
    establishment: "HOSPITAL NACIONAL EL SALVADOR",
    tables: UCI_TABLES,
  };
}

export const UCI_AISLADOS_TEMPLATE = uciTemplate("uci-aislados");
export const UCI_CARDIOVASCULAR_TEMPLATE = uciTemplate("uci-cardiovascular");
export const UCI_EXTRACORPOREA_TEMPLATE = uciTemplate("uci-extracorporea");
export const UCI_GENERAL_1_TEMPLATE = uciTemplate("uci-general-1");
export const UCI_GENERAL_2_TEMPLATE = uciTemplate("uci-general-2");
export const UCI_NEUROCRITICOS_TEMPLATE = uciTemplate("uci-neurocriticos");
export const UCI_QUIRURGICA_TEMPLATE = uciTemplate("uci-quirurgica");

// Consolidado (solo lectura): suma los SEPS de todas las subunidades UCI.
export const UCI_CONSOLIDADO_TEMPLATE: SepsTemplate = {
  serviceId: "uci-consolidado",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  displayName: "UCI Consolidado",
  tables: UCI_TABLES,
  consolidatesFrom: [
    "uci-aislados",
    "uci-cardiovascular",
    "uci-extracorporea",
    "uci-general-1",
    "uci-general-2",
    "uci-neurocriticos",
    "uci-quirurgica",
  ],
};
