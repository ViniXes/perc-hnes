// AUTO-GENERADO desde "FARMACIA.xlsx" (hoja MES ACTUAL).
// Tabulador SEPS de Farmacia, servicio "servicio-farmaceutico".
import type { SepsTemplate } from "@/lib/seps-templates";

export const FARMACIA_TEMPLATE: SepsTemplate = {
  serviceId: "servicio-farmaceutico",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "fa1",
      title: "TABULADOR DIARIO DE SERVICIOS DE APOYO Y DIAGNOSTICO I",
      subtitle: "FARMACIA",
      detailLabel: "Detalle",
      rows: [
        { key: "fa_8", label: "1) Médico", group: "N° de Recetas despachadas · Consulta Externa" },
        { key: "fa_9", label: "2) Odontólogo", group: "N° de Recetas despachadas · Consulta Externa" },
        { key: "fa_10", label: "3) Nutricionista", group: "N° de Recetas despachadas · Consulta Externa" },
        { key: "fa_11", label: "4) Enfermeria", group: "N° de Recetas despachadas · Consulta Externa" },
        { key: "fa_12", label: "1) Médico", group: "N° de Recetas despachadas · Emergencia" },
        { key: "fa_13", label: "1) Médico", group: "N° de Recetas despachadas · Hospitalización" },
        { key: "fa_14", label: "Consulta ambulatoria", group: "N° de Recetas no despachadas" },
        { key: "fa_15", label: "Hospitalización", group: "N° de Recetas no despachadas" },
      ],
    },
  ],
};
