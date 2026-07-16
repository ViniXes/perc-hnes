// AUTO-GENERADO desde "Enfermeria seps.xlsx" (hoja MES ACTUAL).
// Tabulador SEPS de la División de Enfermería, servicio "enfermeria".
// Columnas = días del mes; Total por fila (única suma). Fiel al Excel.
import type { SepsTemplate } from "@/lib/seps-templates";

export const ENFERMERIA_TEMPLATE: SepsTemplate = {
  serviceId: "enfermeria",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "enf_actividades",
      title: "SERVICIOS DE APOYO III (2do y 3er Nivel de Atención)",
      subtitle: "Actividades y Procedimientos",
      detailLabel: "Actividad",
      rows: [
        { key: "enf_cur_personas", label: "No. de personas", group: "Curaciones" },
        { key: "enf_cur_cantidad", label: "No. de curaciones", group: "Curaciones" },
        { key: "enf_iny_personas", label: "No. de personas", group: "Inyecciones" },
        { key: "enf_iny_cantidad", label: "No. de inyecciones", group: "Inyecciones" },
      ],
    },
    {
      id: "enf_endoscopia",
      title: "ENDOSCOPIA",
      subtitle: "Actividades y Procedimientos",
      detailLabel: "Actividad",
      rows: [
        { key: "enf_endo_digestiva", label: "Digestiva alta", group: "Endoscopia" },
        { key: "enf_endo_colonoscopia", label: "Colonoscopía", group: "Endoscopia" },
        { key: "enf_endo_otras", label: "Otras endoscopías", group: "Endoscopia" },
      ],
    },
    {
      id: "enf_hospitalizacion",
      title: "HOSPITALIZACIÓN DE PACIENTES AGUDOS E INTERCONSULTAS (I y II)",
      detailLabel: "Actividad",
      rows: [
        { key: "enf_disp_cateter_central", label: "Catéter central", group: "Días uso de dispositivos" },
        { key: "enf_disp_cateter_periferico", label: "Catéter periférico", group: "Días uso de dispositivos" },
        { key: "enf_disp_ventilador", label: "Ventilador mecánico", group: "Días uso de dispositivos" },
        { key: "enf_disp_sonda_vesical", label: "Sonda vesical", group: "Días uso de dispositivos" },
        { key: "enf_ic_medicina", label: "Medicina", group: "Interconsultas dentro del hospital" },
        { key: "enf_ic_cirugia", label: "Cirugía", group: "Interconsultas dentro del hospital" },
        { key: "enf_ref_medicina", label: "Medicina", group: "Paciente ingresado que se envía a interconsulta a otro hospital" },
        { key: "enf_ref_cirugia", label: "Cirugía", group: "Paciente ingresado que se envía a interconsulta a otro hospital" },
      ],
    },
    {
      id: "enf_detalle_medicina",
      title: "DETALLE - MEDICINA",
      detailLabel: "Actividad",
      rows: [
        { key: "enf_med_ingresos", label: "INGRESOS" },
        { key: "enf_med_dias_pacientes", label: "DIAS PACIENTES (SALDO)" },
        { key: "enf_med_dias_camas", label: "DIAS CAMAS DISPONIBLES" },
        { key: "enf_med_dotacion_camas", label: "DOTACION DE CAMAS" },
        { key: "enf_med_traslado_a", label: "TRASLADO A OTROS SERVICIOS" },
        { key: "enf_med_traslado_de", label: "TRASLADO DE OTROS SERVICIOS" },
      ],
    },
    {
      id: "enf_detalle_cirugia",
      title: "DETALLE - CIRUGÍA",
      detailLabel: "Actividad",
      rows: [
        { key: "enf_cir_ingresos", label: "INGRESOS" },
        { key: "enf_cir_dias_pacientes", label: "DIAS PACIENTES (SALDO)" },
        { key: "enf_cir_dias_camas", label: "DIAS CAMAS DISPONIBLES" },
        { key: "enf_cir_dotacion_camas", label: "DOTACION DE CAMAS" },
        { key: "enf_cir_traslado_a", label: "TRASLADO A OTROS SERVICIOS" },
        { key: "enf_cir_traslado_de", label: "TRASLADO DE OTROS SERVICIOS" },
      ],
    },
    {
      id: "enf_detalle_bienestar",
      title: "DETALLE - BIENESTAR MAGISTERIAL",
      detailLabel: "Actividad",
      rows: [
        { key: "enf_bien_ingresos", label: "INGRESOS" },
        { key: "enf_bien_dias_pacientes", label: "DIAS PACIENTES (SALDO)" },
        { key: "enf_bien_dias_camas", label: "DIAS CAMAS DISPONIBLES" },
        { key: "enf_bien_dotacion_camas", label: "DOTACION DE CAMAS" },
        { key: "enf_bien_traslado_a", label: "TRASLADO A OTROS SERVICIOS" },
        { key: "enf_bien_traslado_de", label: "TRASLADO DE OTROS SERVICIOS" },
      ],
    },
  ],
};
