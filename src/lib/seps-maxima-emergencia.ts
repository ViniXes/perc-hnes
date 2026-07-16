// AUTO-GENERADO desde "SEPS EMERGENCIA.xlsx" (hoja MES ACTUAL).
// Tabulador SEPS de Máxima Urgencia (Emergencia), servicio "maxima-emergencia".
// Columnas = días del mes; Total por fila (única suma). Fiel al Excel.
import type { SepsTemplate } from "@/lib/seps-templates";

export const MAXIMA_EMERGENCIA_TEMPLATE: SepsTemplate = {
  serviceId: "maxima-emergencia",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "em_maxima_urgencia",
      title: "Tabulador Diario de Servicios · Máxima Urgencia",
      detailLabel: "Actividad",
      rows: [
        { key: "em_admisiones", label: "ADMISIONES", group: "MEDICINA" },
        { key: "em_traslados", label: "TRASLADOS", group: "MEDICINA" },
        { key: "em_muertes", label: "MUERTES", group: "MEDICINA" },
      ],
    },
  ],
};
