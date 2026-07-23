export type ServiceDefinition = {
  id: string;
  name: string;
  rows: string[];
};

export const TABULATOR_HEADERS = [
  "66-Hospitalizacion medicina interna",
  "95-Hospitalizacion cirugia general",
  "745-Hospitalizacion servicios por convenios",
  "166-Unidad de cuidados intensivos",
  "179-Unidad de cuidados intermedios",
  "201-Emergencias",
  "743-Clinica empresarial",
  "806-Centro quirurgico",
  "767-Unidad de cuidados especiales",
  "766-Servicio de apoyo a riiss",
  "398-Vacunacion",
  "518-Laboratorio clinico",
  "530-Laboratorio de biologia molecular",
  "538-Resonancia magnetica",
  "541-Tomografia",
  "791-Estudio de radiologia",
  "559-Ultrasonografia",
  "776-Estudios gastroclinicos",
  "562-Terapia fisica",
  "566-Terapia respiratoria",
  "570-Rehabilitacion pulmonar",
  "575-Banco de sangre",
  "579-Unidad de hemodinamia",
  "268-Hemodialisis",
  "593-Servicio farmaceutico",
  "803-Rehablitacion psicosocial",
  "750-Alimentacion enteral",
  "760-Nutricion parenteral",
  "662-Central de esterilizacion",
  "761-Saneamiento ambiental",
  "648-Aseo",
  "721-Almacen",
  "652-Servicio de alimentacion",
  "659-Lavanderia",
  "664-Transporte general",
  "665-Mantenimiento",
  "713-Trabajo social",
  "670-Administracion",
  "702-Docencia e investigacion",
] as const;

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    id: "vacunacion",
    name: "Vacunacion",
    rows: ["398_1-Vacunacion | Actividad", "398_2-Vacunacion | Dosis aplicada"],
  },
  {
    // Laboratorio clinico incluye tambien Biologia molecular (530_1).
    id: "laboratorio-clinico",
    name: "Laboratorio clinico",
    rows: [
      "518_1-Laboratorio clinico | Examen",
      "518_2-Laboratorio clinico | Prueba",
      "530_1-Laboratorio de biologia molecular | Examen",
    ],
  },
  {
    // Radiologia: un solo servicio que agrupa Resonancia, Tomografia, Estudio de
    // radiologia y Ultrasonografia (todas sus filas juntas).
    id: "radiologia",
    name: "Radiologia",
    rows: [
      "538_1-Resonancia magnetica | Estudio",
      "538_2-Resonancia magnetica | Placas",
      "541_1-Tomografia | Estudio",
      "541_2-Tomografia | Placas",
      "791_1-Estudio de radiologia | Estudio",
      "559_1-Ultrasonografia | Estudio",
    ],
  },
  {
    id: "estudios-gastroclinicos",
    name: "Estudios gastroclinicos",
    rows: ["776_1-Estudios gastroclinicos | Procedimiento"],
  },
  {
    // Fisioterapia: servicio propio (Terapia fisica).
    id: "terapia-fisica",
    name: "Fisioterapia",
    rows: ["562_1-Terapia fisica | Sesion"],
  },
  {
    // Terapia Respiratoria agrupa Terapia respiratoria y Rehabilitacion pulmonar.
    id: "terapia-respiratoria",
    name: "Terapia respiratoria",
    rows: [
      "566_1-Terapia respiratoria | Sesion",
      "566_2-Terapia respiratoria | Atencion",
      "566_3-Terapia respiratoria | Nebulizacion",
      "570_1-Rehabilitacion pulmonar | Sesion",
    ],
  },
  {
    id: "banco-de-sangre",
    name: "Banco de sangre",
    rows: [
      "575_1-Banco de sangre | Unidad",
      "575_2-Banco de sangre | Examen",
      "575_3-Banco de sangre | Hemocomponentes procesados",
      "575_4-Banco de sangre | Bolsas de sangre",
    ],
  },
  {
    id: "unidad-de-hemodinamia",
    name: "Hemodinamia",
    rows: [
      "579_1-Unidad de hemodinamia | Procedimiento",
      "579_2-Unidad de hemodinamia | Estudio",
    ],
  },
  // Hemodialisis se divide en DOS servicios/areas que capturan por separado las
  // MISMAS filas 268_* (uno por UCI, otro por Medicina interna). En el consolidado
  // oficial ambos se SUMAN columna por columna en el unico bloque "268-Hemodialisis"
  // (ver downloadAdminExcelReport). Por eso las filas son identicas en ambos.
  {
    id: "hemodialisis",
    name: "UCI Extracorporea",
    rows: [
      "268_1-Hemodialisis | Procedimiento",
      "268_2-Hemodialisis | Paciente",
      "268_3-Hemodialisis | Sesion",
      "268_4-Hemodialisis | Tratamiento",
    ],
  },
  {
    id: "hemodialisis-medicina-interna",
    name: "MI/Extracorporea",
    rows: [
      "268_1-Hemodialisis | Procedimiento",
      "268_2-Hemodialisis | Paciente",
      "268_3-Hemodialisis | Sesion",
      "268_4-Hemodialisis | Tratamiento",
    ],
  },
  {
    id: "servicio-farmaceutico",
    name: "Farmacia",
    rows: [
      "593_1-Servicio farmaceutico | Receta",
      "593_2-Servicio farmaceutico | Prescripcion",
      "593_3-Servicio farmaceutico | Paciente",
      "593_4-Servicio farmaceutico | Receta Unidosis",
      "593_5-Servicio farmaceutico | Formula",
    ],
  },
  {
    id: "rehablitacion-psicosocial",
    name: "Psicologia",
    rows: ["803_1-Rehablitacion psicosocial | Atencion"],
  },
  {
    id: "alimentacion-y-dieta",
    name: "Nutricion",
    rows: [
      "750_1-Alimentacion enteral | Preparacion",
      "750_2-Alimentacion enteral | Paciente",
      "750_3-Alimentacion enteral | Formula",
      "760_1-Nutricion parenteral | Preparacion",
      "652_1-Servicio de alimentacion | Racion paciente",
      "652_2-Servicio de alimentacion | Racion funcionario",
    ],
  },
  {
    id: "central-de-esterilizacion",
    name: "CEYE",
    rows: [
      "662_1-Central de esterilizacion | Paquete",
      "662_2-Central de esterilizacion | Metro cubico",
    ],
  },
  {
    id: "saneamiento-ambiental",
    name: "Saneamiento ambiental",
    rows: ["761_1-Saneamiento ambiental | Inspeccion"],
  },
  {
    id: "aseo",
    name: "Aseo",
    rows: ["648_1-Aseo | Metro cuadrado"],
  },
  // Almacen lo capturan por separado TRES servicios/areas con la MISMA fila 721_1
  // (Depto. de Abastecimiento, Almacen Medicamentos y Asesores de Medicamentos).
  // En el consolidado oficial los tres se SUMAN columna por columna en el unico
  // bloque "721-Almacen" (ver downloadAdminExcelReport). Por eso la fila es
  // identica en todos.
  {
    id: "almacen",
    name: "Depto. de Abastecimiento",
    rows: ["721_1-Almacen | Despacho"],
  },
  {
    id: "almacen-medicamentos",
    name: "Almacen Medicamentos",
    rows: ["721_1-Almacen | Despacho"],
  },
  {
    id: "lavanderia",
    name: "Lavanderia",
    rows: [
      "659_1-Lavanderia | Libras",
      "659_2-Lavanderia | Pieza",
      "659_3-Lavanderia | Kilo",
    ],
  },
  {
    id: "transporte-general",
    name: "Transporte",
    rows: [
      "664_1-Transporte general | Traslado",
      "664_2-Transporte general | Kilometro",
      "664_3-Transporte general | Viajes",
    ],
  },
  {
    id: "mantenimiento",
    name: "Mantenimiento",
    rows: [
      "665_1-Mantenimiento | Orden",
      "665_2-Mantenimiento | Solicitud",
      "665_3-Mantenimiento | Solicitud Recibida",
      "665_4-Mantenimiento | Solicitud Cumplida",
    ],
  },
  {
    id: "trabajo-social",
    name: "Trabajo social",
    rows: [
      "713_1-Trabajo social | Atencion",
      "713_2-Trabajo social | Actividad",
      "713_3-Trabajo social | Paciente",
      "713_4-Trabajo social | Casos",
      "713_5-Trabajo social | Entrevista",
    ],
  },
  {
    id: "docencia-e-investigacion",
    name: "Docencia e investigacion",
    rows: ["702_1-Docencia e investigacion | Capacitacion"],
  },
  // Servicios con PERC/SERV (productividad por servicio): no usan la grilla de
  // centros de costo, solo unos pocos numeros (ver PERC_SERV_FIELDS en page.tsx).
  {
    id: "maxima-emergencia",
    name: "Maxima Emergencia",
    rows: [],
  },
  {
    id: "centro-quirurgico",
    name: "Centro Quirurgico",
    rows: [],
  },
  {
    id: "clinica-de-empleados",
    name: "Clinica de Empleados",
    rows: [],
  },
  {
    // Asesores de Medicamentos: ademas de Distribucion de Horas, captura la MISMA
    // fila 721_1 que los otros almacenes. En el consolidado se SUMA columna por
    // columna con "almacen" y "almacen-medicamentos" en el bloque "721-Almacen"
    // (la suma es automatica porque la clave de fila es identica).
    id: "asesores-de-medicamentos",
    name: "Asesores de Medicamentos",
    rows: ["721_1-Almacen | Despacho"],
  },
  {
    // ESDOMED: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "esdomed",
    name: "ESDOMED",
    rows: [],
  },
  {
    // Planificacion y Calidad: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "planificacion",
    name: "Planificacion y Calidad",
    rows: [],
  },
  {
    // Epidemiologia: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "epidemiologia",
    name: "Epidemiologia",
    rows: [],
  },
  {
    // Unidad de Cumplimiento: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "cumplimiento",
    name: "Unidad de Cumplimiento",
    rows: [],
  },
  {
    // Auditoria Interna: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "auditoria-interna",
    name: "Auditoría Interna",
    rows: [],
  },
  {
    // Unidad Financiera: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "unidad-financiera",
    name: "Unidad Financiera",
    rows: [],
  },
  {
    // Unidad Juridica: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "unidad-juridica",
    name: "Unidad Jurídica",
    rows: [],
  },
  {
    // Comunicaciones: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "comunicaciones",
    name: "Comunicaciones",
    rows: [],
  },
  {
    // Unidad de Convenios: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "unidad-de-convenios",
    name: "Unidad de Convenios",
    rows: [],
  },
  {
    // Jefaturas de Division Medica: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "jefaturas-division-medica",
    name: "Jefaturas de División Médica",
    rows: [],
  },
  {
    // Jefatura de Division de Apoyo: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "jefatura-division-apoyo",
    name: "Jefatura de División de Apoyo",
    rows: [],
  },
  {
    // UDP: SOLO reporta Distribucion de Horas (sin PERC ni SEPS).
    id: "udp",
    name: "Unidad de Desarrollo Profesional",
    rows: [],
  },
  {
    // Cuidados Paliativos: por ahora SOLO Distribucion de Horas (SEPS pendiente).
    id: "cuidados-paliativos",
    name: "Cuidados Paliativos",
    rows: [],
  },
  {
    // Medicina Preventiva: por ahora SOLO Distribucion de Horas.
    id: "medicina-preventiva",
    name: "Medicina Preventiva",
    rows: [],
  },
  {
    // Medicina Interna: por ahora SOLO Distribucion de Horas.
    id: "medicina-interna",
    name: "Medicina Interna",
    rows: [],
  },
  {
    id: "ucin-aislados",
    name: "UCIN Aislados",
    rows: [],
  },
  {
    id: "ucin-cronicos",
    name: "UCIN Crónicos",
    rows: [],
  },
  {
    id: "ucin",
    name: "UCIN",
    rows: [],
  },
  {
    id: "ucin-consolidado",
    name: "UCIN Consolidado",
    rows: [],
  },
  {
    id: "cuidados-paliativos",
    name: "Cuidados Paliativos",
    rows: [],
  },
  {
    id: "cuidados-paliativos-enfermeria",
    name: "Cuidados Paliativos - Enfermería",
    rows: [],
  },
  {
    id: "cuidados-paliativos-psicologo",
    name: "Cuidados Paliativos - Psicólogo",
    rows: [],
  },
  {
    id: "cuidados-paliativos-fisioterapia",
    name: "Cuidados Paliativos - Fisioterapia",
    rows: [],
  },
  {
    id: "cuidados-paliativos-ts",
    name: "Cuidados Paliativos - Trabajo Social",
    rows: [],
  },
  {
    id: "cuidados-paliativos-espiritual",
    name: "Cuidados Paliativos - Intervención Espiritual",
    rows: [],
  },
  {
    id: "cuidados-paliativos-consolidado",
    name: "Cuidados Paliativos Consolidado",
    rows: [],
  },
  {
    id: "uci-aislados",
    name: "UCI Aislados",
    rows: [],
  },
  {
    id: "uci-cardiovascular",
    name: "UCI Cardiovascular",
    rows: [],
  },
  {
    id: "uci-extracorporea",
    name: "UCI Extracorpórea",
    rows: [],
  },
  {
    id: "uci-general-1",
    name: "UCI General 1",
    rows: [],
  },
  {
    id: "uci-general-2",
    name: "UCI General 2",
    rows: [],
  },
  {
    id: "uci-neurocriticos",
    name: "UCI Neurocríticos",
    rows: [],
  },
  {
    id: "uci-quirurgica",
    name: "UCI Quirúrgica",
    rows: [],
  },
  {
    id: "uci-consolidado",
    name: "UCI Consolidado",
    rows: [],
  },
  {
    id: "cardiologia",
    name: "Cardiología",
    rows: [],
  },
  {
    id: "nefrologia",
    name: "Nefrología",
    rows: [],
  },
  {
    // Anestesiologia: por ahora SOLO Distribucion de Horas.
    id: "anestesiologia",
    name: "Anestesiologia",
    rows: [],
  },
  {
    // Medicina Critica: por ahora SOLO Distribucion de Horas.
    id: "medicina-critica",
    name: "Medicina Critica",
    rows: [],
  },
  {
    // Biologia Molecular: por ahora SOLO Distribucion de Horas.
    id: "biologia-molecular",
    name: "Biologia Molecular",
    rows: [],
  },
  {
    // Recursos Humanos: por ahora SOLO Distribucion de Horas.
    id: "rrhh",
    name: "Recursos Humanos",
    rows: [],
  },
  {
    // Servicios Varios (Saneamiento + Transporte juntos): SOLO Distribucion de Horas.
    id: "servicios-varios",
    name: "Servicios Varios",
    rows: [],
  },
  {
    // Departamento de Tecnologia: por ahora SOLO Distribucion de Horas.
    id: "tecnologia",
    name: "Departamento de Tecnologia",
    rows: [],
  },
  {
    // UCP: por ahora SOLO Distribucion de Horas.
    id: "ucp",
    name: "Unidad de Compras Publicas",
    rows: [],
  },
  {
    // Unidad de Gestion Documental: por ahora SOLO Distribucion de Horas.
    id: "gestion-documental",
    name: "Unidad de Gestion Documental",
    rows: [],
  },
  {
    // Enfermeria: toda la plantilla de enfermeria. SOLO Distribucion de Horas.
    id: "enfermeria",
    name: "Enfermeria",
    rows: [],
  },
  {
    // Direccion: por ahora SOLO Distribucion de Horas.
    id: "direccion",
    name: "Direccion",
    rows: [],
  },
];

export const SERVICE_COUNT = SERVICE_DEFINITIONS.length;
export const COST_CENTER_COUNT = TABULATOR_HEADERS.length;

// =============================================================================
// Filas con valores FIJOS (no se capturan: el sistema los pone automaticamente).
// -----------------------------------------------------------------------------
// Algunas filas tienen valores que nunca cambian mes a mes (p.ej. los metros
// cuadrados de Aseo por centro de costo). Se definen aqui como un arreglo alineado
// a TABULATOR_HEADERS (mismo orden), se pre-cargan en el tabulador y se muestran
// como solo-lectura. Siempre prevalecen sobre lo guardado.
// =============================================================================

// "648_1-Aseo | Metro cuadrado" -> metros cuadrados por centro de costo (fijos).
const ASEO_METRO_CUADRADO: readonly number[] = [
  1250, 396, 745.6, 1827.54, 2002, 282.3, 97.46, 738, 100, 0, 6357, 884, 240.46,
  155, 60, 836.8, 126.4, 30, 25, 195, 240, 109.26, 292.04, 187.96, 406, 30,
  348.78, 150, 1055, 106.23, 45, 1677, 421, 626.62, 403, 401, 126.58, 1167,
  726.46,
];

if (ASEO_METRO_CUADRADO.length !== TABULATOR_HEADERS.length) {
  throw new Error(
    `ASEO_METRO_CUADRADO debe tener ${TABULATOR_HEADERS.length} valores (uno por centro de costo).`,
  );
}

/** Fila fija con un valor en un solo centro de costo y `rest` en los demas. */
function fixedSingleColumn(
  header: string,
  value: string,
  rest = "0",
): Record<string, string> {
  return Object.fromEntries(
    TABULATOR_HEADERS.map((current) => [current, current === header ? value : rest]),
  );
}

// Vacunacion no se captura: el sistema pone fijo 1 en la columna Administracion.
const ADMINISTRACION_HEADER = "670-Administracion";

/** Mapa fila -> { header -> valor fijo }. Agrega aqui nuevas filas fijas. */
export const FIXED_ROW_VALUES: Record<string, Record<string, string>> = {
  "648_1-Aseo | Metro cuadrado": Object.fromEntries(
    TABULATOR_HEADERS.map((header, index) => [
      header,
      String(ASEO_METRO_CUADRADO[index]),
    ]),
  ),
  "398_1-Vacunacion | Actividad": fixedSingleColumn(ADMINISTRACION_HEADER, "1"),
  "398_2-Vacunacion | Dosis aplicada": fixedSingleColumn(ADMINISTRACION_HEADER, "1"),
};

/** Indica si una fila tiene valores fijos (solo-lectura, automaticos). */
export function isFixedRow(row: string): boolean {
  return Object.prototype.hasOwnProperty.call(FIXED_ROW_VALUES, row);
}

/** Valores fijos de una fila (o undefined si la fila se captura normalmente). */
export function getFixedValuesForRow(row: string): Record<string, string> | undefined {
  return FIXED_ROW_VALUES[row];
}

// =============================================================================
// Orden EXACTO de filas para el consolidado (descarga Excel).
// -----------------------------------------------------------------------------
// La plantilla oficial "Produccion Distribuida" NO agrupa las filas igual que el
// tablero. En el tablero, Nutricion / Alimentacion y dieta captura sus 6 items
// JUNTOS (750_*, 760_1, 652_*); pero en el consolidado las filas de
// "652-Servicio de alimentacion" van SEPARADAS, despues de Almacen (721) y antes
// de Lavanderia (659). Esta lista reproduce columna A de la plantilla tal cual.
//
// Validado contra "Producción Distribuida_2026_05.xlsx" (60 filas, mismo set que
// SERVICE_DEFINITIONS). NO reordenar a mano: respetar la plantilla.
// =============================================================================
export const CONSOLIDADO_ROW_ORDER: readonly string[] = [
  "398_1-Vacunacion | Actividad",
  "398_2-Vacunacion | Dosis aplicada",
  "518_1-Laboratorio clinico | Examen",
  "518_2-Laboratorio clinico | Prueba",
  "530_1-Laboratorio de biologia molecular | Examen",
  "538_1-Resonancia magnetica | Estudio",
  "538_2-Resonancia magnetica | Placas",
  "541_1-Tomografia | Estudio",
  "541_2-Tomografia | Placas",
  "791_1-Estudio de radiologia | Estudio",
  "559_1-Ultrasonografia | Estudio",
  "776_1-Estudios gastroclinicos | Procedimiento",
  "562_1-Terapia fisica | Sesion",
  "566_1-Terapia respiratoria | Sesion",
  "566_2-Terapia respiratoria | Atencion",
  "566_3-Terapia respiratoria | Nebulizacion",
  "570_1-Rehabilitacion pulmonar | Sesion",
  "575_1-Banco de sangre | Unidad",
  "575_2-Banco de sangre | Examen",
  "575_3-Banco de sangre | Hemocomponentes procesados",
  "575_4-Banco de sangre | Bolsas de sangre",
  "579_1-Unidad de hemodinamia | Procedimiento",
  "579_2-Unidad de hemodinamia | Estudio",
  "268_1-Hemodialisis | Procedimiento",
  "268_2-Hemodialisis | Paciente",
  "268_3-Hemodialisis | Sesion",
  "268_4-Hemodialisis | Tratamiento",
  "593_1-Servicio farmaceutico | Receta",
  "593_2-Servicio farmaceutico | Prescripcion",
  "593_3-Servicio farmaceutico | Paciente",
  "593_4-Servicio farmaceutico | Receta Unidosis",
  "593_5-Servicio farmaceutico | Formula",
  "803_1-Rehablitacion psicosocial | Atencion",
  "750_1-Alimentacion enteral | Preparacion",
  "750_2-Alimentacion enteral | Paciente",
  "750_3-Alimentacion enteral | Formula",
  "760_1-Nutricion parenteral | Preparacion",
  "662_1-Central de esterilizacion | Paquete",
  "662_2-Central de esterilizacion | Metro cubico",
  "761_1-Saneamiento ambiental | Inspeccion",
  "648_1-Aseo | Metro cuadrado",
  "721_1-Almacen | Despacho",
  "652_1-Servicio de alimentacion | Racion paciente",
  "652_2-Servicio de alimentacion | Racion funcionario",
  "659_1-Lavanderia | Libras",
  "659_2-Lavanderia | Pieza",
  "659_3-Lavanderia | Kilo",
  "664_1-Transporte general | Traslado",
  "664_2-Transporte general | Kilometro",
  "664_3-Transporte general | Viajes",
  "665_1-Mantenimiento | Orden",
  "665_2-Mantenimiento | Solicitud",
  "665_3-Mantenimiento | Solicitud Recibida",
  "665_4-Mantenimiento | Solicitud Cumplida",
  "713_1-Trabajo social | Atencion",
  "713_2-Trabajo social | Actividad",
  "713_3-Trabajo social | Paciente",
  "713_4-Trabajo social | Casos",
  "713_5-Trabajo social | Entrevista",
  "702_1-Docencia e investigacion | Capacitacion",
] as const;
