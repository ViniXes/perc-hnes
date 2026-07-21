// AUTO-GENERADO desde "SEPS RRHH.xlsx" (hoja MES ACTUAL).
// Tabulador SEPS de Recursos Humanos (Salud Mental I), servicio "rrhh".
// Columnas = días del mes; Total por fila (única suma =SUM). Fiel al Excel.
import type { SepsTemplate } from "@/lib/seps-templates";

export const RRHH_TEMPLATE: SepsTemplate = {
  serviceId: "rrhh",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "rrhh_salud_mental_i",
      title: "Tabulador Diario de Atenciones Grupales de Salud Mental I",
      detailLabel: "Actividad",
      rows: [
        { key: "rrhh_autocuidado_masculino", label: "Masculino", groups: ["ATENCION ESPECIALIZADA", "2. Jornada de autocuidado"] },
        { key: "rrhh_autocuidado_femenino", label: "Femenino", groups: ["ATENCION ESPECIALIZADA", "2. Jornada de autocuidado"] },
        { key: "rrhh_autocuidado_jornadas", label: "N° Jornadas realizadas", groups: ["ATENCION ESPECIALIZADA", "2. Jornada de autocuidado"] },
      ],
    },
  ],
};
