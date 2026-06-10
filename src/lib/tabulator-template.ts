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
    id: "laboratorio-clinico",
    name: "Laboratorio clinico",
    rows: [
      "518_1-Laboratorio clinico | Examen",
      "518_2-Laboratorio clinico | Prueba",
    ],
  },
  {
    id: "laboratorio-de-biologia-molecular",
    name: "Laboratorio de biologia molecular",
    rows: ["530_1-Laboratorio de biologia molecular | Examen"],
  },
  {
    id: "resonancia-magnetica",
    name: "Resonancia magnetica",
    rows: [
      "538_1-Resonancia magnetica | Estudio",
      "538_2-Resonancia magnetica | Placas",
    ],
  },
  {
    id: "tomografia",
    name: "Tomografia",
    rows: ["541_1-Tomografia | Estudio", "541_2-Tomografia | Placas"],
  },
  {
    id: "estudio-de-radiologia",
    name: "Estudio de radiologia",
    rows: ["791_1-Estudio de radiologia | Estudio"],
  },
  {
    id: "ultrasonografia",
    name: "Ultrasonografia",
    rows: ["559_1-Ultrasonografia | Estudio"],
  },
  {
    id: "estudios-gastroclinicos",
    name: "Estudios gastroclinicos",
    rows: ["776_1-Estudios gastroclinicos | Procedimiento"],
  },
  {
    id: "terapia-fisica",
    name: "Terapia fisica",
    rows: ["562_1-Terapia fisica | Sesion"],
  },
  {
    id: "terapia-respiratoria",
    name: "Terapia respiratoria",
    rows: [
      "566_1-Terapia respiratoria | Sesion",
      "566_2-Terapia respiratoria | Atencion",
      "566_3-Terapia respiratoria | Nebulizacion",
    ],
  },
  {
    id: "rehabilitacion-pulmonar",
    name: "Rehabilitacion pulmonar",
    rows: ["570_1-Rehabilitacion pulmonar | Sesion"],
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
    name: "Unidad de hemodinamia",
    rows: [
      "579_1-Unidad de hemodinamia | Procedimiento",
      "579_2-Unidad de hemodinamia | Estudio",
    ],
  },
  {
    id: "hemodialisis",
    name: "Hemodialisis",
    rows: [
      "268_1-Hemodialisis | Procedimiento",
      "268_2-Hemodialisis | Paciente",
      "268_3-Hemodialisis | Sesion",
      "268_4-Hemodialisis | Tratamiento",
    ],
  },
  {
    id: "servicio-farmaceutico",
    name: "Servicio farmaceutico",
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
    name: "Rehablitacion psicosocial",
    rows: ["803_1-Rehablitacion psicosocial | Atencion"],
  },
  {
    id: "alimentacion-y-dieta",
    name: "Alimentacion y dieta",
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
    name: "Central de esterilizacion",
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
  {
    id: "almacen",
    name: "Almacen",
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
    name: "Transporte general",
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
