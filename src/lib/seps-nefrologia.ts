// AUTO-GENERADO desde "NEFROLOGIA SEPS" (imagen). Servicios de Apoyo II.
// Tabulador SEPS de Nefrología (parte de Medicina Interna, servicio aparte).
// Columnas = días del mes; Total por fila (única suma =SUM). Fiel al cuadro.
import type { SepsTemplate } from "@/lib/seps-templates";

export const NEFROLOGIA_TEMPLATE: SepsTemplate = {
  serviceId: "nefrologia",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "nefro_apoyo_ii",
      title: "TABULADOR DIARIO DE SERVICIOS DE APOYO II (2do y 3er Nivel de Atención)",
      detailLabel: "Actividad",
      rows: [
        { key: "nefro_personas_1ra_vez", label: "No. de personas de 1ra. vez en la vida en hemodiálisis", groups: ["Procedimientos", "Nefrología", "Nefrología"] },
        { key: "nefro_hemodialisis", label: "No. hemodiálisis (incluye procedimientos realizados a personas de 1ra. vez y control subsecuente)", groups: ["Procedimientos", "Nefrología", "Nefrología"] },
      ],
    },
  ],
};
