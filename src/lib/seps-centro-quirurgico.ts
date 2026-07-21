// AUTO-GENERADO desde "SEPS CIRUGIA.xlsx" (hoja MES ACTUAL).
// Tabulador SEPS de Cirugía — servicio "centro-quirurgico" (Centro Quirúrgico).
// Columnas = días del mes; Total por fila (única suma =SUM). Fiel al Excel.
import type { SepsTemplate } from "@/lib/seps-templates";

export const CENTRO_QUIRURGICO_TEMPLATE: SepsTemplate = {
  serviceId: "centro-quirurgico",
  displayName: "Cirugías Menores",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "cq_hospitalizacion",
      title: "Hospitalización de Pacientes Agudos e Interconsultas (I y II)",
      detailLabel: "Actividad",
      rows: [
        { key: "cq_med_ingresos", label: "Ingresos", group: "Medicina" },
        { key: "cq_med_traslados_a", label: "Traslados a otros servicios", group: "Medicina" },
        { key: "cq_med_traslados_de", label: "Traslados de otros servicios", group: "Medicina" },
        { key: "cq_med_dias_pacientes", label: "Días pacientes (saldo)", group: "Medicina" },
        { key: "cq_med_dias_camas", label: "Días camas disponible", group: "Medicina" },
        { key: "cq_med_dotacion_camas", label: "Dotación de camas", group: "Medicina" },
      ],
    },
    {
      id: "cq_procedimientos",
      title: "Servicios de Apoyo I (2do y 3er Nivel de Atención) — Procedimientos",
      detailLabel: "Procedimiento",
      rows: [
        { key: "cq_cirugia_menor", label: "Cirugía menores (pequeña cirugía)" },
      ],
    },
    {
      id: "cq_apoyo_iv",
      title: "Servicios de Apoyo IV (2do y 3er Nivel de Atención)",
      detailLabel: "Actividad",
      rows: [
        { key: "cq_ap_bt_personas_mama_otras", label: "No. Personas con biopsia de mama y de otra partes del cuerpo(excluye cuello útero)", groups: ["Anatomia patológica", "Biopsias tomadas"] },
        { key: "cq_ap_bt_biopsia_mama", label: "1. No. de biopsia de mama", groups: ["Anatomia patológica", "Biopsias tomadas"] },
        { key: "cq_ap_bt_biopsia_otras", label: "2. No. de biopsias de otras partes del cuerpo(excluye cuello del útero y mama)", groups: ["Anatomia patológica", "Biopsias tomadas"] },
        { key: "cq_ap_bt_biopsia_tb", label: "3. No. de biopsias para descartar TB", groups: ["Anatomia patológica", "Biopsias tomadas"] },
        { key: "cq_ap_bt_personas_cuello", label: "No. de personas con biopsia de cuello del útero", groups: ["Anatomia patológica", "Biopsias tomadas"] },
        { key: "cq_ap_pos_condiloma", label: "1. Condiloma y displasia del cuello uterino", groups: ["Anatomia patológica", "Biopsias leídas positivas"] },
        { key: "cq_ap_pos_cancer_invasor", label: "2. Con cáncer invasor del cuello uterino", groups: ["Anatomia patológica", "Biopsias leídas positivas"] },
        { key: "cq_ap_autopsias", label: "No. de autopsias", groups: ["Anatomia patológica", "Autopsias"] },
      ],
    },
  ],
};
