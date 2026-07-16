// AUTO-GENERADO desde "medicina interna seps Hospitalizacion.xlsx" (hoja MES ACTUAL).
// Tabulador SEPS de Hospitalización — Medicina Interna, servicio "medicina-interna".
// Columnas = días del mes; Total por fila (única suma). Fiel al Excel.
import type { SepsTemplate } from "@/lib/seps-templates";

export const MEDICINA_INTERNA_TEMPLATE: SepsTemplate = {
  serviceId: "medicina-interna",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "mi_hospitalizacion",
      title: "TABULADOR DIARIO DE SERVICIOS HOSPITALIZACION",
      detailLabel: "Actividad",
      rows: [
        { key: "mi_med_ingresos", label: "Ingresos", group: "Medicina" },
        { key: "mi_med_traslados_a", label: "Traslados a otros servicios", group: "Medicina" },
        { key: "mi_med_traslados_de", label: "Traslados de otros servicios", group: "Medicina" },
        { key: "mi_med_dias_pacientes", label: "Días pacientes (saldo)", group: "Medicina" },
        { key: "mi_med_dias_camas", label: "Días camas disponible", group: "Medicina" },
        { key: "mi_med_dotacion_camas", label: "Dotación de camas", group: "Medicina" },
      ],
    },
  ],
};
