// AUTO-GENERADO desde "CARDIOLOGIA SEPS.xlsx" (hoja MES ACTUAL).
// Tabulador SEPS de Cardiología (Servicios de Apoyo II), servicio "cardiologia".
// Columnas = días del mes; Total por fila (única suma =SUM). Fiel al Excel.
import type { SepsTemplate } from "@/lib/seps-templates";

export const CARDIOLOGIA_TEMPLATE: SepsTemplate = {
  serviceId: "cardiologia",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "card_apoyo_ii",
      title: "TABULADOR DIARIO DE SERVICIOS DE APOYO II (2do y 3er Nivel de Atención)",
      detailLabel: "Actividad",
      rows: [
        { key: "card_ecg_personas", label: "No. de personas", groups: ["PROCEDIMIENTO", "Cardiología", "Electrocardiograma"] },
        { key: "card_ecg_trazos", label: "No. de trazos", groups: ["PROCEDIMIENTO", "Cardiología", "Electrocardiograma"] },
        { key: "card_ecocardiograma", label: "Ecocardiograma", groups: ["PROCEDIMIENTO", "Cardiología", "Ecocardiograma"] },
        { key: "card_prueba_esfuerzo", label: "Prueba de esfuerzo", groups: ["PROCEDIMIENTO", "Cardiología", "Pruebas de esfuerzo"] },
        { key: "card_prueba_holter", label: "Prueba holter", groups: ["PROCEDIMIENTO", "Cardiología", "Prueba holter"] },
      ],
    },
  ],
};
