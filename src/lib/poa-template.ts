// =============================================================================
// POA — Plan Anual Operativo (por servicio y por año).
// -----------------------------------------------------------------------------
// Modelo de datos del documento y semilla con el contenido del POA 2026 del
// Servicio de Estadística y Documentos Médicos (ESDOMED). Al crear un año nuevo
// se clona esta semilla: el texto ya viene escrito y solo se actualizan las
// tablas (metas, trimestres, riesgos) y los párrafos que cambien.
//
// El documento se guarda en Firestore (colección `poaDocuments`, id `<serviceId>__<año>`)
// y se exporta a Word/PDF con el mismo orden de secciones que tiene aquí.
// =============================================================================

// --- Filas de cada tabla -----------------------------------------------------

/** Recursos con que cuenta el servicio (Recurso Humano | Cantidad). */
export type PoaRecursoRow = { label: string; cantidad: string };

/** Un ítem del FODA: título en negrita + descripción. */
export type PoaFodaItem = { title: string; text: string };

/** Cumplimiento de actividades del PAO del año anterior. */
export type PoaCumplimientoRow = {
  actividad: string;
  prog: string;
  realiz: string;
  obs: string;
};

/** Valoración de riesgos del año anterior (4 columnas). */
export type PoaRiesgoPrevRow = {
  riesgo: string;
  acciones: string;
  ejecucion: string;
  obs: string;
};

/** Matriz de valoración de riesgos del año en curso (7 columnas). */
export type PoaMatrizRiesgoRow = {
  proceso: string;
  riesgo: string;
  /** Probabilidad (F): 1 a 3. */
  probabilidad: string;
  /** Magnitud / Impacto (I): 1 a 3. */
  impacto: string;
  acciones: string;
  responsables: string;
};

/** Programación trimestral: programado y realizado (el % se calcula solo). */
export type PoaTrimestre = { prog: string; real: string };

/** Una actividad dentro de un objetivo de la programación anual. */
export type PoaActividadRow = {
  actividad: string;
  indicador: string;
  meta: string;
  responsable: string;
  trimestres: [PoaTrimestre, PoaTrimestre, PoaTrimestre, PoaTrimestre];
  supuestos: string;
};

/** Un objetivo con sus actividades (fila azul de agrupación en el documento). */
export type PoaObjetivoGroup = {
  objetivo: string;
  rows: PoaActividadRow[];
};

/** Bloque de producción: título, análisis y (opcional) gráfico subido. */
export type PoaProduccionBloque = {
  title: string;
  text: string;
  /** Clave de la imagen dentro del documento de medios (`<id>__media`). */
  imageKey?: string;
};

// --- Documento completo ------------------------------------------------------

export type PoaDoc = {
  year: number;
  serviceId: string;
  serviceName: string;
  cover: {
    hospital: string;
    title: string;
    service: string;
    place: string;
  };
  intro: string[];
  dependencia: string;
  objetivoGeneral: string;
  objetivosEspecificos: string[];
  funciones: PoaFodaItem[];
  recursos: PoaRecursoRow[];
  foda: {
    fortalezas: PoaFodaItem[];
    oportunidades: PoaFodaItem[];
    debilidades: PoaFodaItem[];
    amenazas: PoaFodaItem[];
  };
  produccion: {
    intro: string;
    bloques: PoaProduccionBloque[];
    cierre: string;
  };
  cumplimiento: {
    rows: PoaCumplimientoRow[];
    analisis: string;
  };
  riesgosPrev: {
    rows: PoaRiesgoPrevRow[];
    analisis: string[];
  };
  matrizRiesgos: PoaMatrizRiesgoRow[];
  actividades: PoaObjetivoGroup[];
};

// --- Helpers de cálculo ------------------------------------------------------

/** Convierte a número; vacío o inválido = 0. */
export function poaNum(value: string | undefined): number {
  const n = Number.parseFloat((value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Porcentaje realizado/programado. Devuelve "" si no hay programado. */
export function poaPercent(prog: string | undefined, real: string | undefined): string {
  const p = poaNum(prog);
  if (p <= 0) return "";
  const r = poaNum(real);
  const pct = Math.round((r / p) * 100);
  return `${pct}%`;
}

/** Suma de los cuatro trimestres programados. */
export function poaSumProg(row: PoaActividadRow): number {
  return row.trimestres.reduce((acc, t) => acc + poaNum(t.prog), 0);
}

/** Suma de los cuatro trimestres realizados. */
export function poaSumReal(row: PoaActividadRow): number {
  return row.trimestres.reduce((acc, t) => acc + poaNum(t.real), 0);
}

/** Exposición al riesgo = Probabilidad x Impacto. */
export function poaExposicion(row: PoaMatrizRiesgoRow): number {
  return poaNum(row.probabilidad) * poaNum(row.impacto);
}

export type PoaRiesgoCategoria = "bajo" | "moderado" | "alto";

/** Categoría del riesgo según la exposición (1-3 bajo, 4-6 moderado, 7-9 alto). */
export function poaCategoria(exposicion: number): PoaRiesgoCategoria {
  if (exposicion >= 7) return "alto";
  if (exposicion >= 4) return "moderado";
  return "bajo";
}

export const POA_CATEGORIA_LABEL: Record<PoaRiesgoCategoria, string> = {
  bajo: "Bajo",
  moderado: "Moderado",
  alto: "Alto",
};

/** Color de relleno (hex sin #) que lleva la celda de exposición en el Word. */
export const POA_CATEGORIA_FILL: Record<PoaRiesgoCategoria, string> = {
  bajo: "00B050",
  moderado: "FFFF00",
  alto: "C00000",
};

/** Id del documento en Firestore. */
export function getPoaDocId(serviceId: string, year: number | string): string {
  return `${serviceId}__${year}`;
}

/** Filas vacías para agregar en cada tabla. */
export const POA_EMPTY_RECURSO: PoaRecursoRow = { label: "", cantidad: "" };
export const POA_EMPTY_FODA: PoaFodaItem = { title: "", text: "" };
export const POA_EMPTY_CUMPLIMIENTO: PoaCumplimientoRow = {
  actividad: "",
  prog: "",
  realiz: "",
  obs: "Ninguna",
};
export const POA_EMPTY_RIESGO_PREV: PoaRiesgoPrevRow = {
  riesgo: "",
  acciones: "",
  ejecucion: "",
  obs: "Ninguna",
};
export const POA_EMPTY_MATRIZ: PoaMatrizRiesgoRow = {
  proceso: "",
  riesgo: "",
  probabilidad: "",
  impacto: "",
  acciones: "",
  responsables: "",
};
export const POA_EMPTY_ACTIVIDAD: PoaActividadRow = {
  actividad: "",
  indicador: "",
  meta: "",
  responsable: "",
  trimestres: [
    { prog: "", real: "" },
    { prog: "", real: "" },
    { prog: "", real: "" },
    { prog: "", real: "" },
  ],
  supuestos: "",
};

// =============================================================================
// Semilla: contenido del POA 2026 de ESDOMED.
// Al crear un año nuevo se clona (structuredClone) y se cambia el año; el texto
// queda listo y solo se editan las tablas y lo que haya cambiado.
// =============================================================================

const POA_SEED_ESDOMED: PoaDoc = {
  year: 2026,
  serviceId: "esdomed",
  serviceName: "Servicio de Estadística y Documentos Médicos",
  cover: {
    hospital: "HOSPITAL NACIONAL EL SALVADOR",
    title: "Plan Anual Operativo",
    service: "Servicio de Estadística y Documentos Médicos",
    place: "San Salvador",
  },
  intro: [
    "El Servicio de Estadística y Documentos Médicos (ESDOMED) del Hospital Nacional El Salvador es esencial para la gestión confiable y oportuna de la información clínica y administrativa del hospital. Su labor garantiza datos íntegros, accesibles y útiles para la toma de decisiones en todos los niveles de atención.",
    "El presente Plan Anual Operativo establece los objetivos, actividades y líneas de acción que orientarán el trabajo del servicio durante el año. Incluye las funciones prioritarias, los recursos disponibles y las áreas de mejora identificadas, así como estrategias para fortalecer la eficiencia operativa y la calidad de los procesos estadísticos.",
    "Este plan reafirma el compromiso de ESDOMED con la mejora continua, el uso de herramientas tecnológicas y la gestión eficaz de la información como soporte fundamental para la planificación, el monitoreo y la toma de decisiones que contribuyen a la misión institucional de brindar atención de calidad a la población salvadoreña.",
  ],
  dependencia: "Unidad de Planificación.",
  objetivoGeneral:
    "Gestionar la información estadística y documental del Hospital Nacional El Salvador a través de procesos de registro, validación, conservación y custodia del expediente clínico, garantizando la calidad e integridad de la información y el cumplimiento de las normas técnicas institucionales vigentes, en apoyo a la planificación y la gestión institucional.",
  objetivosEspecificos: [
    "Garantizar el registro, procesamiento, validación y actualización de la información estadística hospitalaria en los sistemas institucionales, asegurando la consistencia, integridad y oportunidad de los datos generados.",
    "Asegurar la correcta creación, identificación, custodia, organización y conservación del expediente clínico, tanto en soporte físico como electrónico, conforme a los criterios técnicos establecidos para su manejo y resguardo institucional.",
    "Fortalecer continuamente los procesos mediante la revisión periódica de procedimientos, la mejora de prácticas operativas y el desarrollo de herramientas digitales que optimicen la gestión de la información hospitalaria.",
  ],
  funciones: [
    {
      title: "Creación y asignación de número de expediente clínico",
      text: "El proceso de creación y asignación de un número único de expediente clínico para cada paciente tiene como objetivo garantizar la organización y el control de la información médica individual, facilitando la accesibilidad, seguimiento y actualización de datos en el sistema de salud del Hospital Nacional El Salvador.",
    },
    {
      title: "Custodia y consulta del expediente clínico",
      text: "Gestiona la conformación, custodia y consulta del expediente clínico, en formatos físicos y electrónicos, de acuerdo con la Norma Técnica correspondiente. Es responsable de la seguridad y confidencialidad de los datos, con uso restringido exclusivamente para fines médicos, científicos, docentes y legales.",
    },
    {
      title: "Recopilación y procesamiento de datos estadísticos",
      text: "Gestionar la recolección, procesamiento y almacenamiento de los datos correspondientes a la identificación del paciente y su trazabilidad en el Hospital Nacional El Salvador, garantizando la precisión y consistencia de la información.",
    },
    {
      title: "Gestión de certificados de defunción",
      text: "Emitir, sellar y firmar los certificados de defunción para su posterior entrega a la dependencia encargada de proporcionar estos documentos a los familiares de los pacientes fallecidos.",
    },
    {
      title: "Emisión de constancias médicas",
      text: "Facilitar constancias de hospitalización e incapacidad médica para pacientes en condiciones de egreso con alta médica, asegurando que la documentación sea expedida con prontitud y precisión.",
    },
    {
      title: "Entrega de referencias médicas",
      text: "Proveer a los pacientes egresados las referencias médicas necesarias para su seguimiento en otros niveles de atención o especialistas, garantizando la continuidad del cuidado.",
    },
    {
      title: "Actualización de datos de pacientes",
      text: "Mantener actualizados los datos personales y clínicos de los pacientes, asegurando que la información en los expedientes físicos y digitales sea precisa y esté alineada con las políticas de confidencialidad y seguridad de la información.",
    },
    {
      title: "Provisión de información estadística",
      text: "Suministrar datos estadísticos solicitados por las distintas áreas del hospital, autoridades superiores y otras dependencias del Ministerio de Salud, con el fin de apoyar la gestión hospitalaria y la toma de decisiones estratégicas.",
    },
    {
      title: "Elaboración de reportes estadísticos",
      text: "Preparar y distribuir documentos estadísticos de manera diaria, mensual y anual, asegurando que la información esté completa y sea útil para el análisis de los indicadores de desempeño del hospital.",
    },
    {
      title: "Administración de herramientas digitales",
      text: "Gestionar las plataformas tecnológicas empleadas para el seguimiento y la exposición de datos actualizados sobre los movimientos internos del hospital, contribuyendo a la eficiencia operativa y la transparencia en la gestión de la información.",
    },
  ],
  recursos: [
    { label: "Coordinador", cantidad: "1" },
    { label: "Supervisores", cantidad: "1" },
    { label: "Técnicos en Estadísticas y Documentos Médicos (Digitadores)", cantidad: "22" },
    { label: "Auxiliar Administrativo", cantidad: "2" },
  ],
  foda: {
    fortalezas: [
      {
        title: "Capacidad de innovación",
        text: "El servicio demuestra una cultura de mejora continua, desarrollando e implementando soluciones propias que optimizan los procesos de registro y gestión de la información.",
      },
      {
        title: "Alta capacidad de recopilación de datos",
        text: "El personal posee experiencia y competencias técnicas para la captura, validación y procesamiento de la información clínica y estadística del hospital.",
      },
      {
        title: "Comunicación institucional efectiva",
        text: "El servicio mantiene una comunicación clara, oportuna y coordinada con las áreas usuarias, lo que facilita la entrega de información y la resolución de requerimientos.",
      },
    ],
    oportunidades: [
      {
        title: "Agilización de procesos administrativos",
        text: "Implementar herramientas que permitan acelerar la documentación y el procesamiento de la información del paciente.",
      },
      {
        title: "Incorporación de tecnologías en tiempo real",
        text: "El avance tecnológico brinda la posibilidad de integrar sistemas que generen información actualizada sobre los movimientos hospitalarios.",
      },
      {
        title: "Fortalecimiento de la toma de decisiones",
        text: "Existe una creciente demanda institucional de información precisa y oportuna, lo que posiciona al servicio como soporte estratégico de la gestión hospitalaria.",
      },
    ],
    debilidades: [
      {
        title: "Limitaciones para la instalación de tecnologías",
        text: "El servicio enfrenta restricciones para la adopción de herramientas tecnológicas que optimizarían la gestión de la información.",
      },
      {
        title: "Equipo informático insuficiente o desactualizado",
        text: "El equipamiento actual no cubre las necesidades operativas ni las demandas de procesamiento del servicio.",
      },
    ],
    amenazas: [
      {
        title: "Espacio de almacenamiento físico limitado",
        text: "El incremento continuo de archivos clínicos representa un riesgo para la adecuada conservación y resguardo del expediente.",
      },
      {
        title: "Riesgo de obsolescencia tecnológica",
        text: "Los equipos y sistemas informáticos podrían quedar desactualizados frente a los nuevos requerimientos institucionales.",
      },
      {
        title: "Cambios normativos",
        text: "Las modificaciones en las leyes y regulaciones sobre privacidad y manejo de datos clínicos pueden exigir ajustes en los procesos del servicio.",
      },
    ],
  },
  produccion: {
    intro:
      "La Producción General abarca las áreas de Ingresos de Pacientes, Egresos de Pacientes en Condición Vivo y Egresos de Pacientes en Condición Fallecido.",
    bloques: [
      {
        title: "Ingresos de Pacientes",
        text: "El comportamiento de los ingresos de pacientes muestra una tendencia progresiva al alza, especialmente en el segundo semestre del año, evidenciando un incremento sostenido de la demanda de los servicios hospitalarios. Se observa una distribución equilibrada entre pacientes femeninos y masculinos, lo que refleja una atención continua y sin sesgos por sexo. El aumento mensual, particularmente entre septiembre y diciembre, sugiere una mayor presión operativa sobre los servicios clínicos y administrativos, requiriendo una adecuada planificación de recursos y fortalecimiento de los procesos de admisión y registro.",
        imageKey: "grafico1",
      },
      {
        title: "Egresos de Pacientes en Condición Vivo",
        text: "Los egresos en condición vivo presentan un comportamiento estable y coherente con el volumen de ingresos, lo que evidencia una adecuada gestión de la atención hospitalaria y la resolución de los casos clínicos. Se destaca un incremento significativo hacia los últimos meses del año, especialmente en noviembre y diciembre, lo cual indica una alta capacidad de respuesta del hospital para la resolución de la atención médica. La distribución por sexo se mantiene balanceada, reflejando eficiencia en la atención y el cierre oportuno de expedientes clínicos, así como una correcta articulación entre las áreas clínicas y administrativas.",
        imageKey: "grafico2",
      },
      {
        title: "Egresos de Pacientes en Condición Fallecido",
        text: "Los egresos en condición fallecido representan una proporción menor en comparación con los ingresos y egresos vivos, manteniéndose dentro de parámetros esperados para un hospital de alta complejidad. No obstante, se observa un incremento gradual hacia el último trimestre del año, lo que puede asociarse al aumento de la demanda asistencial y a la complejidad de los casos atendidos. La información refleja la importancia de una adecuada gestión documental y legal, especialmente en los procesos de certificación de defunción, garantizando la exactitud de los registros, la trazabilidad de los datos y el cumplimiento normativo.",
        imageKey: "grafico3",
      },
    ],
    cierre:
      "En conjunto, los datos evidencian una operación hospitalaria activa y en crecimiento, con una gestión adecuada de los ingresos y egresos, tanto en condición vivo como fallecido. La tendencia creciente hacia el cierre del año resalta la necesidad de fortalecer los procesos de gestión documental, estadística y de análisis de datos, a fin de respaldar la toma de decisiones estratégicas, optimizar los recursos y mantener la calidad y continuidad de la atención brindada a la población.",
  },
  cumplimiento: {
    rows: [
      { actividad: "Reunión con supervisores", prog: "4", realiz: "4", obs: "Ninguna" },
      { actividad: "Reunión informativa para el personal", prog: "4", realiz: "4", obs: "Ninguna" },
      { actividad: "Capacitación al personal estadístico", prog: "4", realiz: "4", obs: "Ninguna" },
    ],
    analisis:
      "El desempeño global de las actividades programadas fue altamente satisfactorio, alcanzando un cumplimiento del 100 % de las metas establecidas. Este resultado evidencia una planificación adecuada, una gestión eficiente de los recursos disponibles y el compromiso del personal involucrado. La participación activa en reuniones y capacitaciones refleja un alto nivel de alineación con los objetivos institucionales, contribuyendo al fortalecimiento de la comunicación interna, la coordinación interdepartamental y el desarrollo de las competencias técnicas del equipo. En conjunto, estos logros demuestran la existencia de un liderazgo efectivo y de una estructura administrativa sólida que permitió la ejecución oportuna y exitosa de las actividades planificadas.",
  },
  riesgosPrev: {
    rows: [
      {
        riesgo: "Errores en la recolección y registro de datos de los pacientes durante su ingreso al hospital, lo que puede afectar la precisión del expediente clínico.",
        acciones: "Implementar un programa permanente de capacitación y revisión sistemática de los procedimientos operativos, con el propósito de garantizar la actualización continua, la eficiencia en la gestión documental y el cumplimiento de los estándares técnicos y normativos aplicables a los procesos de atención al paciente.",
        ejecucion: "Capacitaciones periódicas y revisión continua de los procedimientos operativos, con seguimiento al cumplimiento de los lineamientos establecidos y evaluación sistemática de la calidad de los registros clínicos.",
        obs: "Ninguna",
      },
      {
        riesgo: "Registro inexacto o erróneo de egresos de pacientes, lo que puede generar inconsistencias en la documentación clínica, afectando la trazabilidad, la gestión administrativa y la continuidad de la atención médica.",
        acciones: "Validación de registros por una tercera persona para asegurar la precisión y coherencia del cumplimiento de la documentación.",
        ejecucion: "Revisión y validación sistemática de los registros clínicos con registro de inconsistencias y correcciones previas al cierre de la documentación.",
        obs: "Ninguna",
      },
      {
        riesgo: "Retraso en la documentación de pacientes, lo que puede afectar la disponibilidad oportuna de la información clínica, comprometiendo la continuidad de la atención, la toma de decisiones médicas y la gestión administrativa.",
        acciones: "Optimización de procesos para agilizar los tiempos de respuesta, mejorar la eficiencia operativa y garantizar una gestión más efectiva de la documentación y la atención al paciente.",
        ejecucion: "Análisis y mejora continua de los procesos operativos, con seguimiento a los tiempos de respuesta y verificación del cumplimiento de los procedimientos establecidos.",
        obs: "Ninguna",
      },
      {
        riesgo: "Falta de documentación legal del paciente, lo que dificulta el correcto llenado del certificado de defunción, afectando la validez de la información personal y la gestión administrativa del fallecimiento.",
        acciones: "Implementación de protocolos de documentación legal para garantizar la validación precisa de los datos personales del paciente, asegurando su integridad y el cumplimiento normativo.",
        ejecucion: "Aplicación de protocolos estandarizados de documentación legal, con verificación sistemática de datos personales y supervisión del cumplimiento normativo por parte de las áreas involucradas.",
        obs: "Ninguna",
      },
      {
        riesgo: "Falta de resguardo adecuado de la documentación del paciente, lo que puede comprometer la integridad, disponibilidad y confidencialidad de la información clínica.",
        acciones: "Capacitación continua y revisión sistemática de procedimientos para fortalecer la eficiencia operativa, garantizar el cumplimiento normativo y mejorar la calidad en la gestión documental.",
        ejecucion: "Ejecución de capacitaciones periódicas y revisión continua de procedimientos, con seguimiento al cumplimiento normativo y evaluación de la calidad de la gestión documental.",
        obs: "Ninguna",
      },
    ],
    analisis: [
      "El cuadro de gestión de riesgos identifica de manera adecuada los principales riesgos asociados a la recolección, registro, documentación y resguardo de la información clínica. Las acciones de control definidas —capacitaciones permanentes, validación de registros, optimización de procesos y aplicación de protocolos normativos— se encuentran alineadas con el fortalecimiento de la eficiencia operativa, la calidad de los registros y el cumplimiento de los estándares técnicos y legales vigentes.",
      "La ejecución de las acciones de control incorpora mecanismos de seguimiento, verificación y revisión sistemática, lo que permite reducir la probabilidad de errores, asegurar la integridad de la información y garantiza la continuidad de la atención al paciente. La ausencia de observaciones evidencia un adecuado nivel de control interno y una gestión efectiva de los riesgos, contribuyendo al cumplimiento de los objetivos operativos del servicio y a la mejora continua de la gestión documental.",
    ],
  },
  matrizRiesgos: [
    {
      proceso: "ESDOMED01-HNES-P\nESDOMED02-HNES-P\nESDOMED03-HNES-P\nESDOMED04-HNES-P",
      riesgo: "Falta, deterioro y obsolescencia del equipo computacional, UPS, computadoras lentas y equipo inmobiliario en mal estado, lo cual afecta la captura oportuna y precisa de datos, retrasa el proceso de ingreso de pacientes y limita la eficiencia operativa del servicio.",
      probabilidad: "3",
      impacto: "3",
      acciones: "Gestión de renovación y mantenimiento del equipo tecnológico e inmobiliario, priorizando áreas críticas de admisión, archivo y estadística.",
      responsables: "Jefatura ESDOMED / Administración / TI",
    },
    {
      proceso: "ESDOMED01-HNES-P\nESDOMED02-HNES-P\nESDOMED03-HNES-P\nESDOMED04-HNES-P",
      riesgo: "Insuficiencia de personal operativo y técnico, lo cual afecta la continuidad de los procesos de captura, registro, validación y gestión de la información clínica y estadística, generando retrasos en la atención, sobrecarga laboral y aumento de errores en los registros.",
      probabilidad: "3",
      impacto: "3",
      acciones: "Gestión de fortalecimiento del recurso humano mediante redistribución de cargas de trabajo y solicitud de personal adicional.",
      responsables: "Jefatura ESDOMED / Dirección / RRHH",
    },
    {
      proceso: "ESDOMED01-HNES-P",
      riesgo: "Errores en la recolección, registro y validación de los datos de los pacientes, así como fallas en la generación y organización de las carpetas de pacientes en el archivo virtual, lo cual puede afectar la integridad, trazabilidad, disponibilidad y confiabilidad de la información clínica y administrativa.",
      probabilidad: "2",
      impacto: "3",
      acciones: "Estandarización del proceso de captura y validación de datos y del procedimiento de creación y organización del archivo virtual.",
      responsables: "Jefatura ESDOMED / Archivo Digital / Supervisores",
    },
  ],
  actividades: [
    {
      objetivo: "Fortalecer las capacidades técnicas del personal estadístico.",
      rows: [
        {
          actividad: "Realizar capacitaciones en herramientas de gestión estadística.",
          indicador: "Acta de asistencia realizadas",
          meta: "2",
          responsable: "Tec. Estadistico",
          trimestres: [
            { prog: "", real: "" },
            { prog: "1", real: "" },
            { prog: "", real: "" },
            { prog: "1", real: "" },
          ],
          supuestos: "",
        },
        {
          actividad: "Evaluar competencias técnicas y habilidades blandas del personal de ESDOMED.",
          indicador: "Evaluaciones realizadas al personal",
          meta: "2",
          responsable: "Tec. Estadistico",
          trimestres: [
            { prog: "", real: "" },
            { prog: "1", real: "" },
            { prog: "", real: "" },
            { prog: "1", real: "" },
          ],
          supuestos: "",
        },
      ],
    },
    {
      objetivo: "Monitorear la calidad de los procesos de atención al paciente.",
      rows: [
        {
          actividad: "Vigilancia de calidad de los expedientes clínicos realizados por el personal de ESDOMED.",
          indicador: "Acta del porcentaje de expedientes clínicos revisados.",
          meta: "3",
          responsable: "Responsable de Archivo Digital",
          trimestres: [
            { prog: "1", real: "" },
            { prog: "", real: "" },
            { prog: "1", real: "" },
            { prog: "1", real: "" },
          ],
          supuestos: "",
        },
        {
          actividad: "Respaldo de expedientes clínicos generados por el personal del hospital.",
          indicador: "Acta totalidad de expedientes clínicos respaldados.",
          meta: "3",
          responsable: "Responsable de Archivo Digital",
          trimestres: [
            { prog: "", real: "" },
            { prog: "1", real: "" },
            { prog: "1", real: "" },
            { prog: "1", real: "" },
          ],
          supuestos: "",
        },
        {
          actividad: "Actualización del portal digital para óptimo funcionamiento del servicio de ESDOMED.",
          indicador: "Revisión y mejora de formularios y sitio web.",
          meta: "2",
          responsable: "Supervisor",
          trimestres: [
            { prog: "1", real: "" },
            { prog: "", real: "" },
            { prog: "1", real: "" },
            { prog: "", real: "" },
          ],
          supuestos: "",
        },
      ],
    },
    {
      objetivo: "Socializar normativas, directrices y cambios en procesos internos al personal.",
      rows: [
        {
          actividad: "Reuniones con personal estadístico.",
          indicador: "Acta de asistencia realizadas",
          meta: "3",
          responsable: "Jefe de ESDOMED / Supervisor",
          trimestres: [
            { prog: "", real: "" },
            { prog: "1", real: "" },
            { prog: "1", real: "" },
            { prog: "1", real: "" },
          ],
          supuestos: "",
        },
        {
          actividad: "Reuniones con jefatura, supervisores y responsables de archivo digital.",
          indicador: "Acta de asistencia realizadas",
          meta: "2",
          responsable: "Jefe de ESDOMED / Supervisor",
          trimestres: [
            { prog: "1", real: "" },
            { prog: "", real: "" },
            { prog: "1", real: "" },
            { prog: "", real: "" },
          ],
          supuestos: "",
        },
      ],
    },
    {
      objetivo: "Garantizar la elaboración, presentación y análisis oportuno de los reportes de gestión de datos estadísticos.",
      rows: [
        {
          actividad: "Generación de tabla censo de pacientes.",
          indicador: "Acta trimestral de reportería.",
          meta: "4",
          responsable: "Supervisor",
          trimestres: [
            { prog: "1", real: "" },
            { prog: "1", real: "" },
            { prog: "1", real: "" },
            { prog: "1", real: "" },
          ],
          supuestos: "",
        },
        {
          actividad: "Captura de datos de productividad del personal de ESDOMED en la FDI.",
          indicador: "Presentación en gráficos y tablas de la productividad del servicio.",
          meta: "4",
          responsable: "Supervisor",
          trimestres: [
            { prog: "1", real: "" },
            { prog: "1", real: "" },
            { prog: "1", real: "" },
            { prog: "1", real: "" },
          ],
          supuestos: "",
        },
      ],
    },
  ],
};

/** Semillas disponibles por servicio (hoy solo ESDOMED). */
export const POA_SEEDS: Record<string, PoaDoc> = {
  esdomed: POA_SEED_ESDOMED,
};

/** Servicios habilitados para el módulo POA. */
export const POA_SERVICES: string[] = ["esdomed"];

/** Crea el documento de un año nuevo a partir de la semilla del servicio. */
export function createPoaDoc(serviceId: string, year: number, serviceName?: string): PoaDoc {
  const seed = POA_SEEDS[serviceId] ?? POA_SEEDS.esdomed;
  const clone: PoaDoc = JSON.parse(JSON.stringify(seed)) as PoaDoc;
  clone.year = year;
  clone.serviceId = serviceId;
  if (serviceName) {
    clone.serviceName = serviceName;
  }
  return clone;
}
