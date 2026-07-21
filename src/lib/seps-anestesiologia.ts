// AUTO-GENERADO desde "ANESTESIA SEPS" (imagen). Servicios de Apoyo I.
// Tabulador SEPS de Anestesiología, servicio "anestesiologia".
// Columnas = días del mes; Total por fila (única suma =SUM). Fiel al cuadro.
import type { SepsTemplate } from "@/lib/seps-templates";

export const ANESTESIOLOGIA_TEMPLATE: SepsTemplate = {
  serviceId: "anestesiologia",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "anes_apoyo_i",
      title: "TABULADOR DIARIO DE SERVICIOS DE APOYO I (2do y 3er Nivel de Atención)",
      detailLabel: "Actividad",
      rows: [
        { key: "anes_quir_general", label: "1. General", groups: ["PROCEDIMIENTOS (QUIRÓFANOS)", "Tipo de procedimiento o de anestesia", "Tipo de procedimiento o de anestesia"] },
        { key: "anes_quir_regional", label: "2. Regional", groups: ["PROCEDIMIENTOS (QUIRÓFANOS)", "Tipo de procedimiento o de anestesia", "Tipo de procedimiento o de anestesia"] },
        { key: "anes_quir_sedacion", label: "3. Sedación", groups: ["PROCEDIMIENTOS (QUIRÓFANOS)", "Tipo de procedimiento o de anestesia", "Tipo de procedimiento o de anestesia"] },
        { key: "anes_quir_bloqueo", label: "4. Bloqueo nervio periférico", groups: ["PROCEDIMIENTOS (QUIRÓFANOS)", "Tipo de procedimiento o de anestesia", "Tipo de procedimiento o de anestesia"] },
        { key: "anes_quir_local", label: "5. Anestesia local", groups: ["PROCEDIMIENTOS (QUIRÓFANOS)", "Tipo de procedimiento o de anestesia", "Tipo de procedimiento o de anestesia"] },
        { key: "anes_fuera_general", label: "1. General", groups: ["PROCEDIMIENTOS (FUERA DE QUIRÓFANO)", "Tipo de procedimiento o de anestesia", "Tipo de procedimiento o de anestesia"] },
        { key: "anes_fuera_sedacion", label: "2. Sedación", groups: ["PROCEDIMIENTOS (FUERA DE QUIRÓFANO)", "Tipo de procedimiento o de anestesia", "Tipo de procedimiento o de anestesia"] },
        { key: "anes_fuera_puncion", label: "3. Punción lumbar", groups: ["PROCEDIMIENTOS (FUERA DE QUIRÓFANO)", "Tipo de procedimiento o de anestesia", "Tipo de procedimiento o de anestesia"] },
        { key: "anes_fuera_vad", label: "4. Asistencia VAD", groups: ["PROCEDIMIENTOS (FUERA DE QUIRÓFANO)", "Tipo de procedimiento o de anestesia", "Tipo de procedimiento o de anestesia"] },
        { key: "anes_fuera_evaluaciones", label: "5. Evaluaciones", groups: ["PROCEDIMIENTOS (FUERA DE QUIRÓFANO)", "Tipo de procedimiento o de anestesia", "Tipo de procedimiento o de anestesia"] },
        { key: "anes_sexo_masculino", label: "Masculino", groups: ["", "", "SEXO"] },
        { key: "anes_sexo_femenino", label: "Femenino", groups: ["", "", "SEXO"] },
        { key: "anes_edad_12_18", label: "12-18 años", groups: ["", "", "GRUPO ETARIO"] },
        { key: "anes_edad_19_30", label: "19-30 años", groups: ["", "", "GRUPO ETARIO"] },
        { key: "anes_edad_31_60", label: "31-60 años", groups: ["", "", "GRUPO ETARIO"] },
        { key: "anes_edad_60mas", label: "> 60 años", groups: ["", "", "GRUPO ETARIO"] },
        { key: "anes_asa_1", label: "ASA 1", groups: ["", "", "CLASIFICACION ASA"] },
        { key: "anes_asa_2", label: "ASA 2", groups: ["", "", "CLASIFICACION ASA"] },
        { key: "anes_asa_3", label: "ASA 3", groups: ["", "", "CLASIFICACION ASA"] },
        { key: "anes_asa_4", label: "ASA 4", groups: ["", "", "CLASIFICACION ASA"] },
        { key: "anes_asa_5", label: "ASA 5", groups: ["", "", "CLASIFICACION ASA"] },
      ],
    },
  ],
};
