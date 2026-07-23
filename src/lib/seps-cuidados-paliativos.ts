// AUTO-GENERADO desde "Cuidados paliativos .xlsx" (hoja TABLA GENERAL PARA PULSO).
// Tabla compartida de Cuidados Paliativos: cada área llena SOLO su bloque de color.
// El consolidado NO suma entre áreas: reúne los bloques en una sola tabla oficial
// (cada clave existe en un único servicio). Solo admin/supervisores ven el consolidado.
import type { SepsTemplate } from "@/lib/seps-templates";

export const CUIDADOS_PALIATIVOS_MEDICO_TEMPLATE: SepsTemplate = {
  serviceId: "cuidados-paliativos",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  displayName: "Cuidados Paliativos",
  tables: [
    {
      id: "cp_medico",
      title: "ATENCIONES ESPECÍFICAS DE DOLOR Y CUIDADOS PALIATIVOS",
      detailLabel: "Actividad",
      rows: [
        { key: "cp_i_necpal_pos", label: "NECPAL positivos", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas"] },
        { key: "cp_i_necpal_neg", label: "NECPAL negativo", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas"] },
        { key: "cp_i_ped_onco", label: "Oncologico", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas", "Paciente Pediatrico"] },
        { key: "cp_i_ped_noonco", label: "No Oncologico", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas", "Paciente Pediatrico"] },
        { key: "cp_i_adulto_onco", label: "Oncologico", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas", "Paciente Adulto"] },
        { key: "cp_i_adulto_noonco", label: "No Oncologico", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas", "Paciente Adulto"] },
        { key: "cp_i_herramienta", label: "Uso de la herramienta comunitaria", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas"] },
        { key: "cp_i_referido", label: "Referido por promotor de salud desde la comunidad", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas"] },
        { key: "cp_ii_med_ctrl", label: "Controlados", groups: ["II. Atención de primera y subsecuente", "Control de sintomas MEDICO"] },
        { key: "cp_ii_med_noctrl", label: "No controlados", groups: ["II. Atención de primera y subsecuente", "Control de sintomas MEDICO"] },
        { key: "cp_iii_domiciliares", label: "Domiciliares", groups: ["III. Exitus"] },
        { key: "cp_iii_hospitalarios", label: "Hospitalarios", groups: ["III. Exitus"] },
        { key: "cp_iv_reuniones", label: "Reuniones periodicas interdisciplinarias", groups: ["IV. Actividades"] },
        { key: "cp_iv_reunion_fam", label: "Reunión familiar", groups: ["IV. Actividades"] },
        { key: "cp_iv_planificacion", label: "Planificación compartida de los cuidados", groups: ["IV. Actividades"] },
      ],
    },
  ],
};

export const CUIDADOS_PALIATIVOS_ENFERMERIA_TEMPLATE: SepsTemplate = {
  serviceId: "cuidados-paliativos-enfermeria",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  displayName: "Cuidados Paliativos - Enfermería",
  tables: [
    {
      id: "cp_enfermeria",
      title: "ATENCIONES ESPECÍFICAS DE DOLOR Y CUIDADOS PALIATIVOS",
      detailLabel: "Actividad",
      rows: [
        { key: "cp_ii_enf_ctrl", label: "Controlados", groups: ["II. Atención de primera y subsecuente", "Control de sintomas ENFERMERIA"] },
        { key: "cp_ii_enf_noctrl", label: "No controlados", groups: ["II. Atención de primera y subsecuente", "Control de sintomas ENFERMERIA"] },
        { key: "cp_ii_proc_npac", label: "N° de pacientes", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_cateter", label: "Cateter subcutáneo", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_hipo", label: "Hipordermoclisis", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_curaciones", label: "Curaciones", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_parasentesis", label: "Parasentesis", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_destete", label: "Destete de opiodes", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_sedacion", label: "Sedacion paliativa", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_sedacion_int", label: "Sedación paliativa intermitente", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_medicamentos", label: "Cumplimiento de medicamentos", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_hidratacion", label: "Hidratación IV", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_iv_edu_pac", label: "Paciente", groups: ["IV. Actividades", "Educación"] },
        { key: "cp_iv_edu_fam", label: "Cuidador o familiar", groups: ["IV. Actividades", "Educación"] },
        { key: "cp_iv_edu_personal", label: "Personal de salud", groups: ["IV. Actividades", "Educación"] },
        { key: "cp_iv_cons_pac", label: "Paciente", groups: ["IV. Actividades", "Consejerias"] },
        { key: "cp_iv_cons_fam", label: "Cuidador o familiar", groups: ["IV. Actividades", "Consejerias"] },
        { key: "cp_iv_demo_pac", label: "Paciente", groups: ["IV. Actividades", "Demostraciones"] },
        { key: "cp_iv_demo_fam", label: "Cuidador o familiar", groups: ["IV. Actividades", "Demostraciones"] },
      ],
    },
  ],
};

export const CUIDADOS_PALIATIVOS_PSICOLOGO_TEMPLATE: SepsTemplate = {
  serviceId: "cuidados-paliativos-psicologo",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  displayName: "Cuidados Paliativos - Psicólogo",
  tables: [
    {
      id: "cp_psicologo",
      title: "ATENCIONES ESPECÍFICAS DE DOLOR Y CUIDADOS PALIATIVOS",
      detailLabel: "Actividad",
      rows: [
        { key: "cp_ii_sm_duelo", label: "No. Seguimientos de Duelo", groups: ["II. Atención de primera y subsecuente", "Salud mental"] },
        { key: "cp_ii_sm_crisis_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Salud mental", "Intervención en Crisis"] },
        { key: "cp_ii_sm_crisis_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Salud mental", "Intervención en Crisis"] },
        { key: "cp_ii_sm_conten_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Salud mental", "Contención"] },
        { key: "cp_ii_sm_conten_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Salud mental", "Contención"] },
      ],
    },
  ],
};

export const CUIDADOS_PALIATIVOS_FISIOTERAPIA_TEMPLATE: SepsTemplate = {
  serviceId: "cuidados-paliativos-fisioterapia",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  displayName: "Cuidados Paliativos - Fisioterapia",
  tables: [
    {
      id: "cp_fisioterapia",
      title: "ATENCIONES ESPECÍFICAS DE DOLOR Y CUIDADOS PALIATIVOS",
      detailLabel: "Actividad",
      rows: [
        { key: "cp_ii_rh_fisica", label: "Terapia fisica", groups: ["II. Atención de primera y subsecuente", "Rehabilitacion y habiltación"] },
        { key: "cp_ii_rh_ocupacional", label: "Terapia ocupacional", groups: ["II. Atención de primera y subsecuente", "Rehabilitacion y habiltación"] },
      ],
    },
  ],
};

export const CUIDADOS_PALIATIVOS_TS_TEMPLATE: SepsTemplate = {
  serviceId: "cuidados-paliativos-ts",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  displayName: "Cuidados Paliativos - Trabajo Social",
  tables: [
    {
      id: "cp_ts",
      title: "ATENCIONES ESPECÍFICAS DE DOLOR Y CUIDADOS PALIATIVOS",
      detailLabel: "Actividad",
      rows: [
        { key: "cp_ii_ts_pv_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Trabajo Social", "Atencion Primera vez"] },
        { key: "cp_ii_ts_pv_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Trabajo Social", "Atencion Primera vez"] },
        { key: "cp_ii_ts_seg_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Trabajo Social", "Seguimientos"] },
        { key: "cp_ii_ts_seg_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Trabajo Social", "Seguimientos"] },
      ],
    },
  ],
};

export const CUIDADOS_PALIATIVOS_ESPIRITUAL_TEMPLATE: SepsTemplate = {
  serviceId: "cuidados-paliativos-espiritual",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  displayName: "Cuidados Paliativos - Intervención Espiritual",
  tables: [
    {
      id: "cp_espiritual",
      title: "ATENCIONES ESPECÍFICAS DE DOLOR Y CUIDADOS PALIATIVOS",
      detailLabel: "Actividad",
      rows: [
        { key: "cp_ii_esp_pv_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Intervención espiritual", "Atencion Primera vez"] },
        { key: "cp_ii_esp_pv_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Intervención espiritual", "Atencion Primera vez"] },
        { key: "cp_ii_esp_seg_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Intervención espiritual", "Seguimientos"] },
        { key: "cp_ii_esp_seg_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Intervención espiritual", "Seguimientos"] },
      ],
    },
  ],
};

// Consolidado (solo lectura): reúne los 6 bloques. Solo admin/supervisores.
export const CUIDADOS_PALIATIVOS_CONSOLIDADO_TEMPLATE: SepsTemplate = {
  serviceId: "cuidados-paliativos-consolidado",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  displayName: "Cuidados Paliativos Consolidado",
  consolidatesFrom: ["cuidados-paliativos", "cuidados-paliativos-enfermeria", "cuidados-paliativos-psicologo", "cuidados-paliativos-fisioterapia", "cuidados-paliativos-ts", "cuidados-paliativos-espiritual"],
  tables: [
    {
      id: "cp_consolidado",
      title: "ATENCIONES ESPECÍFICAS DE DOLOR Y CUIDADOS PALIATIVOS",
      detailLabel: "Actividad",
      rows: [
        { key: "cp_i_necpal_pos", label: "NECPAL positivos", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas"] },
        { key: "cp_i_necpal_neg", label: "NECPAL negativo", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas"] },
        { key: "cp_i_ped_onco", label: "Oncologico", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas", "Paciente Pediatrico"] },
        { key: "cp_i_ped_noonco", label: "No Oncologico", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas", "Paciente Pediatrico"] },
        { key: "cp_i_adulto_onco", label: "Oncologico", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas", "Paciente Adulto"] },
        { key: "cp_i_adulto_noonco", label: "No Oncologico", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas", "Paciente Adulto"] },
        { key: "cp_i_herramienta", label: "Uso de la herramienta comunitaria", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas"] },
        { key: "cp_i_referido", label: "Referido por promotor de salud desde la comunidad", groups: ["I. Atención de primera vez", "Identificacion con necesidades paliativas"] },
        { key: "cp_ii_enf_ctrl", label: "Controlados", groups: ["II. Atención de primera y subsecuente", "Control de sintomas ENFERMERIA"] },
        { key: "cp_ii_enf_noctrl", label: "No controlados", groups: ["II. Atención de primera y subsecuente", "Control de sintomas ENFERMERIA"] },
        { key: "cp_ii_med_ctrl", label: "Controlados", groups: ["II. Atención de primera y subsecuente", "Control de sintomas MEDICO"] },
        { key: "cp_ii_med_noctrl", label: "No controlados", groups: ["II. Atención de primera y subsecuente", "Control de sintomas MEDICO"] },
        { key: "cp_ii_sm_duelo", label: "No. Seguimientos de Duelo", groups: ["II. Atención de primera y subsecuente", "Salud mental"] },
        { key: "cp_ii_sm_crisis_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Salud mental", "Intervención en Crisis"] },
        { key: "cp_ii_sm_crisis_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Salud mental", "Intervención en Crisis"] },
        { key: "cp_ii_sm_conten_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Salud mental", "Contención"] },
        { key: "cp_ii_sm_conten_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Salud mental", "Contención"] },
        { key: "cp_ii_rh_fisica", label: "Terapia fisica", groups: ["II. Atención de primera y subsecuente", "Rehabilitacion y habiltación"] },
        { key: "cp_ii_rh_ocupacional", label: "Terapia ocupacional", groups: ["II. Atención de primera y subsecuente", "Rehabilitacion y habiltación"] },
        { key: "cp_ii_ts_pv_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Trabajo Social", "Atencion Primera vez"] },
        { key: "cp_ii_ts_pv_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Trabajo Social", "Atencion Primera vez"] },
        { key: "cp_ii_ts_seg_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Trabajo Social", "Seguimientos"] },
        { key: "cp_ii_ts_seg_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Trabajo Social", "Seguimientos"] },
        { key: "cp_ii_esp_pv_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Intervención espiritual", "Atencion Primera vez"] },
        { key: "cp_ii_esp_pv_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Intervención espiritual", "Atencion Primera vez"] },
        { key: "cp_ii_esp_seg_pac", label: "Paciente", groups: ["II. Atención de primera y subsecuente", "Intervención espiritual", "Seguimientos"] },
        { key: "cp_ii_esp_seg_fam", label: "Cuidador o familiar", groups: ["II. Atención de primera y subsecuente", "Intervención espiritual", "Seguimientos"] },
        { key: "cp_ii_proc_npac", label: "N° de pacientes", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_cateter", label: "Cateter subcutáneo", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_hipo", label: "Hipordermoclisis", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_curaciones", label: "Curaciones", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_parasentesis", label: "Parasentesis", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_destete", label: "Destete de opiodes", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_sedacion", label: "Sedacion paliativa", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_sedacion_int", label: "Sedación paliativa intermitente", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_medicamentos", label: "Cumplimiento de medicamentos", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_ii_proc_hidratacion", label: "Hidratación IV", groups: ["II. Atención de primera y subsecuente", "procedimientos"] },
        { key: "cp_iii_domiciliares", label: "Domiciliares", groups: ["III. Exitus"] },
        { key: "cp_iii_hospitalarios", label: "Hospitalarios", groups: ["III. Exitus"] },
        { key: "cp_iv_reuniones", label: "Reuniones periodicas interdisciplinarias", groups: ["IV. Actividades"] },
        { key: "cp_iv_reunion_fam", label: "Reunión familiar", groups: ["IV. Actividades"] },
        { key: "cp_iv_planificacion", label: "Planificación compartida de los cuidados", groups: ["IV. Actividades"] },
        { key: "cp_iv_edu_pac", label: "Paciente", groups: ["IV. Actividades", "Educación"] },
        { key: "cp_iv_edu_fam", label: "Cuidador o familiar", groups: ["IV. Actividades", "Educación"] },
        { key: "cp_iv_edu_personal", label: "Personal de salud", groups: ["IV. Actividades", "Educación"] },
        { key: "cp_iv_cons_pac", label: "Paciente", groups: ["IV. Actividades", "Consejerias"] },
        { key: "cp_iv_cons_fam", label: "Cuidador o familiar", groups: ["IV. Actividades", "Consejerias"] },
        { key: "cp_iv_demo_pac", label: "Paciente", groups: ["IV. Actividades", "Demostraciones"] },
        { key: "cp_iv_demo_fam", label: "Cuidador o familiar", groups: ["IV. Actividades", "Demostraciones"] },
      ],
    },
  ],
};
