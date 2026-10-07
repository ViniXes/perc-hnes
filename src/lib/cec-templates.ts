/**
 * COMITÉ DE EXPEDIENTE CLÍNICO (CEC) - plantillas de monitoreo.
 * ---------------------------------------------------------------------------
 * Salen tal cual de "PLANTILLA - LISTA DE MONITOREO HES - 2026.xlsx", una hoja
 * por servicio. No se editan a mano aqui: si cambia el Excel, se regenera.
 *
 * Cada servicio tiene uno o mas BLOQUES. Hay dos formas de bloque:
 *   simple       -> una sola casilla Si(1) / No(0) / N/A por aspecto.
 *   expedientes  -> una casilla por cada expediente de la muestra; el numero de
 *                   expediente se escribe cada mes y el total sale solo.
 */

export type CecEvaluacion = "1" | "0" | "NA" | "";

export type CecFila = {
  /** Identificador estable de la fila. NO cambiarlo: es la llave en Firestore. */
  key: string;
  /** Agrupador que viene en la columna CATEGORIA del Excel. */
  categoria: string;
  /** El texto del aspecto a evaluar, tal cual. */
  aspecto: string;
  /** Responsable que trae la plantilla (se puede editar en pantalla). */
  responsable?: string;
};

export type CecBloque = {
  id: string;
  titulo: string;
  /** "simple" = una casilla; "expedientes" = una casilla por expediente. */
  tipo: "simple" | "expedientes";
  /** Cuantas columnas de expediente trae el bloque (1 cuando es simple). */
  columnas: number;
  /** El bloque lleva fila de FECHA por expediente. */
  fecha: boolean;
  /** Lleva columna de acciones o puntos de mejora. */
  acciones: boolean;
  /** Lleva columna de responsable. */
  responsable: boolean;
  filas: CecFila[];
};

export type CecTemplate = {
  /** Id del servicio dentro de PULSO. */
  serviceId: string;
  nombre: string;
  /** Division a la que responde: manda el monitoreo del jefe de division. */
  division: "direccion" | "medica" | "apoyo" | "administrativa" | "enfermeria";
  bloques: CecBloque[];
  /** Titulo del instrumento, cuando la plantilla trae uno propio (Enfermeria). */
  instrumento?: string;
  /** Objetivo que trae el instrumento. */
  objetivo?: string;
  /** Como se llama la columna de texto libre (por defecto "acciones o puntos de mejora"). */
  etiquetaAcciones?: string;
  /**
   * Resumen de puntaje al final, como el del Excel de Enfermeria: por componente,
   * puntaje evaluado (criterios con datos) y obtenido (cumplimiento de cada
   * criterio), y el porcentaje final con su categoria y accion.
   */
  resumenPuntaje?: {
    escala: { desde: number; categoria: string; color: "verde" | "naranja" | "rojo"; accion: string }[];
  };
};

export const CEC_TEMPLATES: CecTemplate[] = [
  {
    serviceId: "esdomed",
    nombre: "ESDOMED",
    division: "direccion",
    bloques: [
      {
        id: "esdomed-b1",
        titulo: "ESDOMED",
        tipo: "simple",
        columnas: 1,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "expedientes-duplicados-por-dui", categoria: "ESDOMED", aspecto: "Expedientes duplicados por DUI.", responsable: "ING. BENJAMÍN CARDOZA, TEC. DANIEL HERNÁNDEZ", },
          { key: "expedientes-nombres-duplicados", categoria: "ESDOMED", aspecto: "Expedientes Nombres duplicados", },
          { key: "empleados-con-m-ltiples-especialidades-o-esp", categoria: "ESDOMED", aspecto: "Empleados con múltiples especialidades o especialidades que no deben de existir.", },
          { key: "duplicidad-de-empleados-usuarios", categoria: "ESDOMED", aspecto: "Duplicidad de Empleados/Usuarios", },
          { key: "deshabilitaci-n-de-usuarios-que-ya-no-se-enc", categoria: "ESDOMED", aspecto: "Deshabilitación de usuarios que ya no se encuentran en funciones", },
          { key: "creaci-n-de-agendas-distribuci-n-m-dica", categoria: "ESDOMED", aspecto: "Creación de agendas, distribución médica", },
          { key: "creaci-n-adecuada-de-distribuciones-de-proce", categoria: "ESDOMED", aspecto: "Creación adecuada de distribuciones de procedimiento.", },
        ],
      },
    ],
  },
  {
    serviceId: "farmacia",
    nombre: "Farmacia",
    division: "direccion",
    bloques: [
      {
        id: "farmacia-b1",
        titulo: "Farmacia",
        tipo: "simple",
        columnas: 1,
        fecha: false,
        acciones: true,
        // Se agrego la columna de Responsable (no la traia la plantilla).
        responsable: true,
        filas: [
          { key: "recetas-y-requisiciones-pendientes", categoria: "Farmacia", aspecto: "Recetas y requisiciones pendientes", },
          { key: "poseen-saldos-anteriores-negativos-o-positiv", categoria: "Farmacia", aspecto: "Poseen saldos anteriores (negativos o positivos).", },
          { key: "realiza-el-proceso-para-el-descargo-por-venc", categoria: "Farmacia", aspecto: "Realiza el proceso para el descargo por vencimiento.", },
          { key: "realizan-recepci-n-de-devoluci-n-de-medicame", categoria: "Farmacia", aspecto: "Realizan Recepción de devolución de medicamentos.", },
          { key: "presentan-descargo-de-ajustes", categoria: "Farmacia", aspecto: "Presentan descargo de ajustes.", },
        ],
      },
    ],
  },
  {
    serviceId: "emergencia",
    nombre: "Emergencia",
    division: "medica",
    bloques: [
      {
        id: "emergencia-b1",
        titulo: "Emergencia (Médico)",
        tipo: "expedientes",
        columnas: 10,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "ingreso-al-servicio-correspondiente-con-indi", categoria: "Emergencia (Médico)", aspecto: "Ingreso al servicio correspondiente con indicaciones", },
          { key: "uso-de-modulo-de-procedimientos", categoria: "Emergencia (Médico)", aspecto: "Uso de modulo de procedimientos", },
          { key: "uso-de-pruebas-funcionales", categoria: "Emergencia (Médico)", aspecto: "Uso de pruebas funcionales", },
          { key: "consulta", categoria: "Emergencia (Médico)", aspecto: "Consulta.", },
          { key: "realizaci-n-de-cuidados-generales", categoria: "Emergencia (Médico)", aspecto: "Realización de Cuidados Generales.", },
          { key: "medicamentos-de-base-diaria-eventuales", categoria: "Emergencia (Médico)", aspecto: "Medicamentos de Base Diaria // Eventuales.", },
          { key: "colocacion-de-nota-de-alta-y-medicamentos-al", categoria: "Emergencia (Médico)", aspecto: "Colocacion de nota de alta y medicamentos al egreso", },
          { key: "laboratorio", categoria: "Emergencia (Médico)", aspecto: "Laboratorio.", },
          { key: "imagenolog-a-cr-usg-tac-etc", categoria: "Emergencia (Médico)", aspecto: "Imagenología (CR, USG, TAC, etc).", },
        ],
      },
      {
        id: "emergencia-b2",
        titulo: "Tableros de emergencia",
        tipo: "simple",
        columnas: 1,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "tabla-de-pendientes-de-triage-y-referencias", categoria: "Emergencia (Médico)", aspecto: "Tabla de pendientes de triage y referencias actualizadas de otros establecimientos (48 horas).", },
          { key: "tablero-de-emergencia-pacientes-acumulado", categoria: "Emergencia (Médico)", aspecto: "Tablero de emergencia, pacientes acumulado.", },
        ],
      },
    ],
  },
  {
    serviceId: "uci",
    nombre: "UCI",
    division: "medica",
    bloques: [
      {
        id: "uci-b1",
        titulo: "UCI (Médico)",
        tipo: "expedientes",
        columnas: 10,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "nota-de-ingreso", categoria: "UCI (Médico)", aspecto: "Nota de ingreso", },
          { key: "diagn-stico-principal", categoria: "UCI (Médico)", aspecto: "Diagnóstico principal", },
          { key: "dietas", categoria: "UCI (Médico)", aspecto: "Dietas", },
          { key: "cuidados-generales", categoria: "UCI (Médico)", aspecto: "Cuidados generales", },
          { key: "signos-vitales-por-parte-del-m-dico", categoria: "UCI (Médico)", aspecto: "Signos vitales por parte del médico", },
          { key: "solicitud-de-ex-menes-de-laboratorio-y-gabin", categoria: "UCI (Médico)", aspecto: "Solicitud de exámenes de laboratorio y gabinete.", },
          { key: "solicitud-de-hemocomponente-indicaci-n-orden", categoria: "UCI (Médico)", aspecto: "Solicitud de hemocomponente (indicación, orden y consentimiento informado).", },
          { key: "notas-de-evoluci-n", categoria: "UCI (Médico)", aspecto: "Notas de evolución.", },
          { key: "uso-de-m-dulo-de-procedimientos", categoria: "UCI (Médico)", aspecto: "Uso de módulo de procedimientos", },
          { key: "uso-de-m-dulo-de-pruebas-funcionales", categoria: "UCI (Médico)", aspecto: "Uso de módulo de pruebas funcionales", },
          { key: "correcto-llenado-de-referencias-diagn-stico", categoria: "UCI (Médico)", aspecto: "Correcto llenado de referencias (Diagnóstico de referencia, justificación adeciada de motivo de referencia, llenado de examen fisico, descripción pertinente de exámenes de laboratorio y gabinete", },
          { key: "correcto-llenado-de-resumen-de-alta-verifica", categoria: "UCI (Médico)", aspecto: "Correcto llenado de resumen de alta (Verificar diagnósticos de estancia, egresos, estudios realizados, etc).", },
        ],
      },
    ],
  },
  {
    serviceId: "ucin",
    nombre: "UCIN",
    division: "medica",
    bloques: [
      {
        id: "ucin-b1",
        titulo: "UCIN (Médico)",
        tipo: "expedientes",
        columnas: 10,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "nota-de-ingreso", categoria: "UCIN (Médico)", aspecto: "Nota de ingreso", },
          { key: "diagn-stico-principal", categoria: "UCIN (Médico)", aspecto: "Diagnóstico principal", },
          { key: "dietas", categoria: "UCIN (Médico)", aspecto: "Dietas", },
          { key: "cuidados-generales", categoria: "UCIN (Médico)", aspecto: "Cuidados generales", },
          { key: "signos-vitales-por-parte-del-m-dico", categoria: "UCIN (Médico)", aspecto: "Signos vitales por parte del médico", },
          { key: "solicitud-de-ex-menes-de-laboratorio-y-gabin", categoria: "UCIN (Médico)", aspecto: "Solicitud de exámenes de laboratorio y gabinete.", },
          { key: "solicitud-de-hemocomponente-indicaci-n-orden", categoria: "UCIN (Médico)", aspecto: "Solicitud de hemocomponente (indicación, orden y consentimiento informado).", },
          { key: "notas-de-evoluci-n", categoria: "UCIN (Médico)", aspecto: "Notas de evolución.", },
          { key: "uso-de-m-dulo-de-procedimientos", categoria: "UCIN (Médico)", aspecto: "Uso de módulo de procedimientos", },
          { key: "uso-de-m-dulo-de-pruebas-funcionales", categoria: "UCIN (Médico)", aspecto: "Uso de módulo de pruebas funcionales", },
          { key: "correcto-llenado-de-referencias-diagn-stico", categoria: "UCIN (Médico)", aspecto: "Correcto llenado de referencias (Diagnóstico de referencia, justificación adeciada de motivo de referencia, llenado de examen fisico, descripción pertinente de exámenes de laboratorio y gabinete", },
          { key: "correcto-llenado-de-resumen-de-alta-verifica", categoria: "UCIN (Médico)", aspecto: "Correcto llenado de resumen de alta (Verificar diagnósticos de estancia, egresos, estudios realizados, etc).", },
        ],
      },
    ],
  },
  {
    serviceId: "hospitalizacion",
    nombre: "Hospitalización",
    division: "medica",
    bloques: [
      {
        id: "hospitalizacion-b1",
        titulo: "Hospitalización (Médico)",
        tipo: "expedientes",
        columnas: 10,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "nota-de-ingreso", categoria: "Hospitalización (Médico)", aspecto: "Nota de ingreso", responsable: "Recordar actualizar diagnósticos y diagnósticos de ingreso", },
          { key: "diagn-stico-principal", categoria: "Hospitalización (Médico)", aspecto: "Diagnóstico principal", },
          { key: "dietas", categoria: "Hospitalización (Médico)", aspecto: "Dietas", },
          { key: "cuidados-generales", categoria: "Hospitalización (Médico)", aspecto: "Cuidados generales", },
          { key: "signos-vitales-por-parte-del-m-dico", categoria: "Hospitalización (Médico)", aspecto: "Signos vitales por parte del médico", },
          { key: "solicitud-de-ex-menes-de-laboratorio-y-gabin", categoria: "Hospitalización (Médico)", aspecto: "Solicitud de exámenes de laboratorio y gabinete.", },
          { key: "solicitud-de-hemocomponente-indicaci-n-orden", categoria: "Hospitalización (Médico)", aspecto: "Solicitud de hemocomponente (indicación, orden y consentimiento informado).", },
          { key: "notas-de-evoluci-n", categoria: "Hospitalización (Médico)", aspecto: "Notas de evolución.", },
          { key: "uso-de-m-dulo-de-procedimientos", categoria: "Hospitalización (Médico)", aspecto: "Uso de módulo de procedimientos", },
          { key: "uso-de-m-dulo-de-pruebas-funcionales", categoria: "Hospitalización (Médico)", aspecto: "Uso de módulo de pruebas funcionales", },
          { key: "correcto-llenado-de-referencias-diagn-stico", categoria: "Hospitalización (Médico)", aspecto: "Correcto llenado de referencias (Diagnóstico de referencia, justificación adeciada de motivo de referencia, llenado de examen fisico, descripción pertinente de exámenes de laboratorio y gabinete", },
          { key: "correcto-llenado-de-resumen-de-alta-verifica", categoria: "Hospitalización (Médico)", aspecto: "Correcto llenado de resumen de alta (Verificar diagnósticos de estancia, egresos, estudios realizados, etc).", },
        ],
      },
    ],
  },
  {
    serviceId: "hospital-dia",
    nombre: "Hospital de Día",
    division: "medica",
    bloques: [
      {
        id: "hospital-dia-b1",
        titulo: "Hospital de día — Nefrología",
        tipo: "expedientes",
        columnas: 10,
        fecha: true,
        acciones: true,
        responsable: true,
        filas: [
          { key: "agendamiento-de-medicamentos", categoria: "Hospital de Día", aspecto: "Agendamiento de medicamentos", },
          { key: "registro-adecuado-de-balance-hidr-co", categoria: "Hospital de Día", aspecto: "Registro adecuado de balance hidríco", },
          { key: "anotaci-n-de-enfermer-a-de-alta-de-paciente", categoria: "Hospital de Día", aspecto: "Anotación de enfermería de alta de paciente", },
          { key: "anotaci-n-de-enfermer-a-de-referencia-de-pac", categoria: "Hospital de Día", aspecto: "Anotación de enfermería de referencia de paciente", },
          { key: "uso-de-modulo-de-educaci-n-para-la-salud-con", categoria: "Hospital de Día", aspecto: "Uso de modulo de educación para la salud (Consejerías y orientación educativa)", },
          { key: "utilizaci-n-m-dulo-de-devoluci-n-de-medicame", categoria: "Hospital de Día", aspecto: "Utilización módulo de devolución de medicamentos.", },
        ],
      },
      {
        id: "hospital-dia-b2",
        titulo: "Hospitalización (Médico)",
        tipo: "expedientes",
        columnas: 10,
        fecha: true,
        acciones: true,
        responsable: true,
        filas: [
          { key: "historial-del-paciente-verificaci-n-de-signo", categoria: "Hospitalización (Médico)", aspecto: "Historial del paciente (Verificación de Signos Vitales, evolución, plan médico, medicamentos, cuidados generales, procedimiento) Según condición de paciente.", },
          { key: "nota-de-ingreso", categoria: "Hospitalización (Médico)", aspecto: "Nota de ingreso", },
          { key: "diagn-stico-principal", categoria: "Hospitalización (Médico)", aspecto: "Diagnóstico principal", },
          { key: "dietas", categoria: "Hospitalización (Médico)", aspecto: "Dietas", },
          { key: "cuidados-generales", categoria: "Hospitalización (Médico)", aspecto: "Cuidados generales", },
          { key: "signos-vitales-por-parte-del-m-dico", categoria: "Hospitalización (Médico)", aspecto: "Signos vitales por parte del médico", },
          { key: "solicitud-de-ex-menes-de-laboratorio-y-gabin", categoria: "Hospitalización (Médico)", aspecto: "Solicitud de exámenes de laboratorio y gabinete.", },
          { key: "solicitud-de-hemocomponente-indicaci-n-orden", categoria: "Hospitalización (Médico)", aspecto: "Solicitud de hemocomponente (indicación, orden y consentimiento informado).", },
          { key: "notas-de-evoluci-n", categoria: "Hospitalización (Médico)", aspecto: "Notas de evolución.", },
          { key: "uso-de-m-dulo-de-procedimientos", categoria: "Hospitalización (Médico)", aspecto: "Uso de módulo de procedimientos", },
          { key: "uso-de-m-dulo-de-pruebas-funcionales", categoria: "Hospitalización (Médico)", aspecto: "Uso de módulo de pruebas funcionales", },
          { key: "correcto-llenado-de-referencias-diagn-stico", categoria: "Hospitalización (Médico)", aspecto: "Correcto llenado de referencias (Diagnóstico de referencia, justificación adeciada de motivo de referencia, llenado de examen fisico, descripción pertinente de exámenes de laboratorio y gabinete", },
          { key: "correcto-llenado-de-resumen-de-alta-verifica", categoria: "Hospitalización (Médico)", aspecto: "Correcto llenado de resumen de alta (Verificar diagnósticos de estancia, egresos, estudios realizados, etc).", },
          { key: "realiza-el-proceso-para-el-descargo-por-venc", categoria: "Hospitalización (Médico)", aspecto: "Realiza el proceso para el descargo por vencimiento.", },
          { key: "realizan-recepci-n-de-devoluci-n-de-medicame", categoria: "Hospitalización (Médico)", aspecto: "Realizan Recepción de devolución de medicamentos.", },
          { key: "presentan-descargo-de-ajustes", categoria: "Hospitalización (Médico)", aspecto: "Presentan descargo de ajustes.", },
        ],
      },
      {
        id: "hospital-dia-b3",
        titulo: "Hospital de día — Intervencionismo Endovascular",
        tipo: "expedientes",
        columnas: 10,
        fecha: true,
        acciones: true,
        responsable: true,
        filas: [
          { key: "agendamiento-de-medicamentos-2", categoria: "Hospital de Día", aspecto: "Agendamiento de medicamentos", },
          { key: "registro-adecuado-de-balance-hidr-co-2", categoria: "Hospital de Día", aspecto: "Registro adecuado de balance hidríco", },
          { key: "anotaci-n-de-enfermer-a-de-alta-de-paciente-2", categoria: "Hospital de Día", aspecto: "Anotación de enfermería de alta de paciente", },
          { key: "anotaci-n-de-enfermer-a-de-referencia-de-pac-2", categoria: "Hospital de Día", aspecto: "Anotación de enfermería de referencia de paciente", },
          { key: "uso-de-modulo-de-educaci-n-para-la-salud-con-2", categoria: "Hospital de Día", aspecto: "Uso de modulo de educación para la salud (Consejerías y orientación educativa)", },
          { key: "utilizaci-n-m-dulo-de-devoluci-n-de-medicame-2", categoria: "Hospital de Día", aspecto: "Utilización módulo de devolución de medicamentos.", },
        ],
      },
      {
        id: "hospital-dia-b4",
        titulo: "Hospitalización (Médico)",
        tipo: "expedientes",
        columnas: 10,
        fecha: true,
        acciones: true,
        responsable: true,
        filas: [
          { key: "cuidados-generales-2", categoria: "", aspecto: "Cuidados generales", },
          { key: "signos-vitales-por-parte-del-m-dico-2", categoria: "", aspecto: "Signos vitales por parte del médico", },
          { key: "solicitud-de-ex-menes-de-laboratorio-y-gabin-2", categoria: "", aspecto: "Solicitud de exámenes de laboratorio y gabinete.", },
          { key: "solicitud-de-hemocomponente-indicaci-n-orden-2", categoria: "", aspecto: "Solicitud de hemocomponente (indicación, orden y consentimiento informado).", },
          { key: "notas-de-evoluci-n-2", categoria: "", aspecto: "Notas de evolución.", },
          { key: "uso-de-m-dulo-de-procedimientos-2", categoria: "", aspecto: "Uso de módulo de procedimientos", },
          { key: "uso-de-m-dulo-de-pruebas-funcionales-2", categoria: "", aspecto: "Uso de módulo de pruebas funcionales", },
          { key: "correcto-llenado-de-referencias-diagn-stico-2", categoria: "", aspecto: "Correcto llenado de referencias (Diagnóstico de referencia, justificación adeciada de motivo de referencia, llenado de examen fisico, descripción pertinente de exámenes de laboratorio y gabinete", },
          { key: "correcto-llenado-de-resumen-de-alta-verifica-2", categoria: "", aspecto: "Correcto llenado de resumen de alta (Verificar diagnósticos de estancia, egresos, estudios realizados, etc).", },
          { key: "realiza-el-proceso-para-el-descargo-por-venc-2", categoria: "", aspecto: "Realiza el proceso para el descargo por vencimiento.", },
          { key: "realizan-recepci-n-de-devoluci-n-de-medicame-2", categoria: "", aspecto: "Realizan Recepción de devolución de medicamentos.", },
          { key: "presentan-descargo-de-ajustes-2", categoria: "", aspecto: "Presentan descargo de ajustes.", },
        ],
      },
    ],
  },
  {
    serviceId: "modulo-quirurgico",
    nombre: "Módulo Quirúrgico y Hosp. Cirugía",
    division: "medica",
    bloques: [
      {
        id: "modulo-quirurgico-b1",
        titulo: "Módulo Quirúrgico",
        tipo: "simple",
        columnas: 1,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "programaci-n-err-nea-en-cirug-a-por-m-s-de-1", categoria: "Módulo Quirúrgico", aspecto: "Programación errónea en cirugía por más de 12 horas/ programaciones en el mismo horario.", },
          { key: "cirug-as-duplicadas", categoria: "Módulo Quirúrgico", aspecto: "Cirugías duplicadas.", },
          { key: "evaluaci-n-pre-operatoria", categoria: "Módulo Quirúrgico", aspecto: "Evaluación pre-operatoria.", },
          { key: "cirug-as-programadas-pendientes-de-suspender", categoria: "Módulo Quirúrgico", aspecto: "Cirugías programadas pendientes de suspender y/o reprogramar.", },
          { key: "llenado-correcto-del-registro-de-anestesiolo", categoria: "Módulo Quirúrgico", aspecto: "Llenado correcto del registro de anestesiología. (equipo quirúrgico completo, registro de horas, evaluaciones post quirúrgicas y alta por anestesia).", },
          { key: "reportes-post-operatorios-con-adecuada-actua", categoria: "Módulo Quirúrgico", aspecto: "Reportes post operatorios con adecuada actualización de horarios de cirugía y equipo quirúrgico completo.", },
        ],
      },
      {
        id: "modulo-quirurgico-b2",
        titulo: "Hospitalización Cirugía (Médico)",
        tipo: "expedientes",
        columnas: 10,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "historial-del-paciente-verificaci-n-de-signo", categoria: "Hospital de día", aspecto: "Historial del paciente (Verificación de Signos Vitales, evolución, plan médico, medicamentos, cuidados generales, procedimiento) Según condición de paciente.", responsable: "NO SE TIENE HOSPITAL DE DIA", },
          { key: "nota-de-ingreso", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Nota de ingreso", },
          { key: "diagn-stico-principal", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Diagnóstico principal", },
          { key: "dietas", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Dietas", },
          { key: "cuidados-generales", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Cuidados generales", },
          { key: "signos-vitales-por-parte-del-m-dico", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Signos vitales por parte del médico", responsable: "SE TUVO PROBLEMA CON SIS Y NO GUARDO SIGNOS REPORTADOS EN EXPEDIENTES SE REPORTO CON ENCARGADA DE SIS EN HOSPITAL Y YA SE REALIZO LA CORRECION NECESARIA", },
          { key: "solicitud-de-ex-menes-de-laboratorio-y-gabin", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Solicitud de exámenes de laboratorio y gabinete.", },
          { key: "solicitud-de-hemocomponente-indicaci-n-orden", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Solicitud de hemocomponente (indicación, orden y consentimiento informado).", },
          { key: "notas-de-evoluci-n", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Notas de evolución.", },
          { key: "uso-de-m-dulo-de-procedimientos", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Uso de módulo de procedimientos", },
          { key: "uso-de-m-dulo-de-pruebas-funcionales", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Uso de módulo de pruebas funcionales", },
          { key: "correcto-llenado-de-referencias-diagn-stico", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Correcto llenado de referencias (Diagnóstico de referencia, justificación adeciada de motivo de referencia, llenado de examen fisico, descripción pertinente de exámenes de laboratorio y gabinete", responsable: "SE HARA RECORDATORIO DE LA IMPORTANCIA DE COLOCAR EXAMEN FISICO EN REFERENCIAS", },
          { key: "correcto-llenado-de-resumen-de-alta-verifica", categoria: "Hospitalización Cirugía (Médico)", aspecto: "Correcto llenado de resumen de alta (Verificar diagnósticos de estancia, egresos, estudios realizados, etc).", },
        ],
      },
    ],
  },
  {
    serviceId: "radiologia",
    nombre: "Imagenología",
    division: "apoyo",
    bloques: [
      {
        id: "radiologia-b1",
        titulo: "Imagenología",
        tipo: "simple",
        columnas: 1,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "realiza-el-cambio-de-solicitud-de-im-genes-e", categoria: "Imagenología", aspecto: "Realiza el cambio de solicitud de Imágenes en proceso y tomadas.", },
          { key: "se-observa-migraci-n-de-imagen-del-visor-de", categoria: "Imagenología", aspecto: "Se observa migración de imagen del visor de weasis a PACS.", },
        ],
      },
    ],
  },
  {
    serviceId: "nutricion",
    nombre: "Alimentación y Dietas",
    division: "apoyo",
    bloques: [
      {
        id: "nutricion-b1",
        titulo: "Alimentación y Dietas",
        tipo: "simple",
        columnas: 1,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "se-encuentran-finalizadas-las-solicitudes-re", categoria: "Alimentación y Dietas", aspecto: "Se encuentran finalizadas las solicitudes realizadas.", },
        ],
      },
    ],
  },
  {
    serviceId: "laboratorio-banco",
    nombre: "Laboratorio y Banco de Sangre",
    division: "apoyo",
    bloques: [
      {
        id: "laboratorio-banco-b1",
        titulo: "Laboratorio y Banco de Sangre",
        tipo: "simple",
        columnas: 1,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "total-de-solicitudes-digitadas-por-laborator", categoria: "Laboratorio", aspecto: "Total de solicitudes digitadas por laboratorio", responsable: "LICDA. PATRICIA FIGUEROA", },
          { key: "reporte-de-solicitud-de-transfusiones-total", categoria: "Banco de sangre", aspecto: "Reporte de Solicitud de Transfusiones (Total, Realizadas, No realizadas y Sin respuesta)", responsable: "DRA. VIRGINIA", },
          { key: "solicitudes-de-muestras-pendientes-con-estad", categoria: "Banco de sangre", aspecto: "Solicitudes de muestras pendientes con estado finalizado.", },
        ],
      },
    ],
  },
  {
    serviceId: "rri",
    nombre: "Retorno, Referencia e Interconsulta",
    // Le corresponde a la Division Medica (Werner Stanley Posada), no a Apoyo.
    division: "medica",
    bloques: [
      {
        id: "rri-b1",
        titulo: "Referencia, Retorno e Interconsulta",
        tipo: "simple",
        columnas: 1,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "realizaci-n-de-notas-de-enfermer-a", categoria: "Referencia, Retorno e Interconsulta", aspecto: "Realización de notas de enfermería.", },
          { key: "cantidad-de-referencias-que-fueron-eliminada", categoria: "Referencia, Retorno e Interconsulta", aspecto: "Cantidad de referencias que fueron eliminadas con justificación válida.", },
          { key: "cantidad-de-expedientes-temporales-generados", categoria: "Referencia, Retorno e Interconsulta", aspecto: "Cantidad de expedientes temporales generados por el proceso de RRI.", },
          { key: "cantidad-de-referencias-pendientes-de-enviar", categoria: "Referencia, Retorno e Interconsulta", aspecto: "Cantidad de referencias pendientes de enviar.", },
          { key: "cantidad-de-referencias-pendientes-de-enviar-2", categoria: "Referencia, Retorno e Interconsulta", aspecto: "Cantidad de referencias pendientes de enviar eliminadas.", },
          { key: "cantidad-de-retornos-pendientes-de-enviar", categoria: "Referencia, Retorno e Interconsulta", aspecto: "Cantidad de retornos pendientes de enviar.", },
          { key: "generaci-n-de-interconsultas-intrahospitalar", categoria: "Referencia, Retorno e Interconsulta", aspecto: "Generación de interconsultas intrahospitalarias adecuadamente.", },
          { key: "generaci-n-de-interconsultas-interhospitalar", categoria: "Referencia, Retorno e Interconsulta", aspecto: "Generación de interconsultas interhospitalarias adecuadamente.", },
        ],
      },
    ],
  },
  {
    serviceId: "informatica",
    nombre: "Informática",
    division: "administrativa",
    bloques: [
      {
        id: "informatica-b1",
        titulo: "Informática",
        tipo: "simple",
        columnas: 1,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "notifica-falla-de-sis-a-jefaturas", categoria: "Operación y funcionamiento de redes y SIS", aspecto: "Notifica falla de SIS a jefaturas", },
          { key: "nofitica-reestablecimiento-de-servicio", categoria: "Operación y funcionamiento de redes y SIS", aspecto: "Nofitica reestablecimiento de servicio", },
          { key: "genera-informe-del-evento", categoria: "Operación y funcionamiento de redes y SIS", aspecto: "Genera informe del evento.", },
        ],
      },
    ],
  },
];

// Plantilla 14: ENFERMERIA. Sale tal cual de "ENFERMERIA.xlsx" (Instrumento de
// monitoreo del modulo de Enfermeria en el SIS): 3 areas, 12 componentes, 5
// expedientes por componente con SI (1) / NO (0), observaciones y el resumen de
// puntaje con su categoria (verde 80-100, naranja 60-79, rojo 59 o menos).
CEC_TEMPLATES.push({
  serviceId: "enfermeria",
  nombre: "Enfermería",
  division: "enfermeria",
  instrumento: "INSTRUMENTO DE MONITOREO DEL MÓDULO DE ENFERMERÍA EN EL SISTEMA INTEGRAL DE SALUD (SIS)",
  objetivo: "Objetivo: Verificar la calidad del registro del cuidado de enfermería en el Sistema Integrado de Salud (SIS)",
  etiquetaAcciones: "Observaciones",
  resumenPuntaje: {
    escala: [
      { desde: 80, categoria: "Verde", color: "verde", accion: "Monitoreo largo plazo" },
      { desde: 60, categoria: "Naranja", color: "naranja", accion: "Monitoreo mediano plazo" },
      { desde: 0, categoria: "Rojo", color: "rojo", accion: "Monitoreo inmediato" },
    ],
  },
  bloques: [
      {
        id: "enfermeria-b1",
        titulo: "Consulta externa · Registro en SIS/ Módulo de Enfermería/ Preparación",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "registran-a-toda-persona-que-demanda-atencio", categoria: "Consulta externa", aspecto: "Registran a toda persona que demanda atención\nTemperatura" },
          { key: "peso", categoria: "Consulta externa", aspecto: "Peso" },
          { key: "talla", categoria: "Consulta externa", aspecto: "Talla" },
          { key: "registran-en-modulo-de-enfermeria-preparacio", categoria: "Consulta externa", aspecto: "Registran en módulo de enfermería/ preparación presión arterial, pulso, respiración según diagnóstico, edad de la persona y condición de salud de la persona." },
        ],
      },
      {
        id: "enfermeria-b2",
        titulo: "Consulta externa · Registro de Notas de Enfermería",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "las-notas-de-enfermeria-son-clara-concisa-y", categoria: "Consulta externa", aspecto: "Las notas de enfermería son clara, concisa y precisas basadas en observaciones objetivas, proporcionadas a pacientes," },
          { key: "notas-en-pacientes-prioritarios-embarazadas", categoria: "Consulta externa", aspecto: "Notas en pacientes prioritarios( embarazadas, crónicos, niños y patologías de interés epidemiológico)" },
          { key: "notas-post-consulta-en-casos-de-ingreso-a-ho", categoria: "Consulta externa", aspecto: "Notas post consulta en casos de ingreso a hospitalización y/o procedimientos" },
          { key: "notas-en-caso-de-encontrar-signos-vitales-co", categoria: "Consulta externa", aspecto: "Notas en caso de encontrar signos vitales con parámetros anormales." },
        ],
      },
      {
        id: "enfermeria-b3",
        titulo: "Consulta externa · Registro en SIS/ módulo de servicios de apoyo y diagnóstico, en el apartado de educación para la salud/ consejerías",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "registran-orientacion-en-salud-o-consejeria", categoria: "Consulta externa", aspecto: "Registran orientación en salud o consejería por enfermería según condición de salud y riesgo de la persona describiendo:\nTipo de consejería" },
          { key: "resumen-patologia-conocimiento-sobre-su-cond", categoria: "Consulta externa", aspecto: "Resumen (patología, conocimiento sobre su condición, desarrollo de consejería, evaluación del aprendizaje)" },
          { key: "acuerdos", categoria: "Consulta externa", aspecto: "Acuerdos" },
        ],
      },
      {
        id: "enfermeria-b4",
        titulo: "Consulta externa · Registro en SIS/ módulo de Enfermería/ Esquema de vacunación.",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "actualizacion-de-esquema-de-vacunacion-en-si", categoria: "Consulta externa", aspecto: "Actualización de esquema de vacunación en SIS (Embarazadas y niños)" },
          { key: "registros-en-notas-de-enfermeria-de-vacunas", categoria: "Consulta externa", aspecto: "Registros en notas de enfermería de vacunas aplicadas describiendo; sitio anatómico, efectos secundarios, recomendaciones y entrega de cartilla" },
        ],
      },
      {
        id: "enfermeria-b5",
        titulo: "Hospitalización · Registro en SIS/ Módulo de Enfermería Hospitalización",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "registran-en-modulo-de-enfermeria-signos-vit", categoria: "Hospitalizaci\u00f3n", aspecto: "Registran en módulo de enfermería signos vitales según diagnóstico y condición de salud de la persona.\nPeso" },
          { key: "temperatura", categoria: "Hospitalizaci\u00f3n", aspecto: "Temperatura" },
          { key: "presion-arterial", categoria: "Hospitalizaci\u00f3n", aspecto: "Presión arterial." },
        ],
      },
      {
        id: "enfermeria-b6",
        titulo: "Hospitalización · Registro en SIS/ Cumplimiento de indicaciones médicas en Hospitalización.",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "realizan-agendamiento-de-medicamentos-al-ing", categoria: "Hospitalizaci\u00f3n", aspecto: "Realizan agendamiento de medicamentos al ingreso de la persona." },
          { key: "se-actualiza-segun-necesidad", categoria: "Hospitalizaci\u00f3n", aspecto: "Se actualiza según necesidad" },
          { key: "registros-de-indicaciones-medicas-segun-corr", categoria: "Hospitalizaci\u00f3n", aspecto: "Registros de indicaciones médicas según corresponda:\nHora de cumplimiento nombre y apellido del personal de enfermería que cumple." },
          { key: "fecha-en-caso-de-medicamentos-que-tengan-ind", categoria: "Hospitalizaci\u00f3n", aspecto: "Fecha en caso de medicamentos que tengan indicación de cumplimiento mayor a 24 horas." },
          { key: "anotan-en-el-recuadro-medicamentos-indicados", categoria: "Hospitalizaci\u00f3n", aspecto: "Anotan en el recuadro medicamentos indicados por esquema el valor encontrado dosis cumplida y/o segun indicacion medica" },
        ],
      },
      {
        id: "enfermeria-b7",
        titulo: "Hospitalización · Registro en SIS/ Módulo de enfermería Cuidados Generales",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "registra-los-cuidados-generales-nombre-y-ape", categoria: "Hospitalizaci\u00f3n", aspecto: "Registra los Cuidados generales, nombre y apellido del personal de enfermería que cumple." },
          { key: "registra-en-cumplimiento-de-alimentacion-nom", categoria: "Hospitalizaci\u00f3n", aspecto: "Registra en cumplimiento de alimentación, nombre y apellido del personal de enfermería que cumple." },
          { key: "elaboran-notas-de-enfermeria-durante-la-pres", categoria: "Hospitalizaci\u00f3n", aspecto: "Elaboran notas de enfermería durante la prestación de cuidado de enfermería y procedimientos de atención, según la ruta de atención y según criterios establecidos." },
          { key: "en-caso-de-referencia-y-traslado-elaboran-no", categoria: "Hospitalizaci\u00f3n", aspecto: "En caso de referencia y traslado elaboran notas según la ruta de atención y criterios establecidos" },
          { key: "en-caso-de-encontrar-signos-vitales-con-para", categoria: "Hospitalizaci\u00f3n", aspecto: "En caso de encontrar signos vitales con parámetros anormales, elaboran notas según criterios establecidos." },
          { key: "las-notas-de-enfermeria-son-objetivas-y-subj", categoria: "Hospitalizaci\u00f3n", aspecto: "Las notas de enfermería son objetivas y subjetivas, completas, concisa, organizada." },
          { key: "registran-balance-hidrico-segun-indicacion-m", categoria: "Hospitalizaci\u00f3n", aspecto: "Registran balance hídrico, según indicación médica" },
          { key: "registra-toma-de-examenes-de-laboratorio-esp", categoria: "Hospitalizaci\u00f3n", aspecto: "Registra toma de exámenes de laboratorio especificando la fecha y hora de la toma." },
          { key: "realizan-uso-correcto-de-modulo-de-banco-de", categoria: "Hospitalizaci\u00f3n", aspecto: "Realizan uso correcto de módulo de banco de sangre:\nenvió de muestra" },
          { key: "recibo-hemocomponente", categoria: "Hospitalizaci\u00f3n", aspecto: "Recibo hemocomponente." },
          { key: "registro-de-signos-vitales-durante-el-proces", categoria: "Hospitalizaci\u00f3n", aspecto: "Registro de signos vitales durante el proceso de transfución" },
          { key: "cambio-de-estado-de-la-trasfucion", categoria: "Hospitalizaci\u00f3n", aspecto: "Cambio de estado de la trasfución." },
        ],
      },
      {
        id: "enfermeria-b8",
        titulo: "Hospitalización · Registro Módulo Educación Para la Salud",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "registran-orientacion-en-salud-o-consejeria", categoria: "Hospitalizaci\u00f3n", aspecto: "Registran orientación en salud o consejería por enfermería según condición de salud y riesgo de la persona describiendo:\nTipo de consejería," },
          { key: "resumen-patologia-conocimiento-sobre-su-cond", categoria: "Hospitalizaci\u00f3n", aspecto: "Resumen (patología, conocimiento sobre su condición, desarrollo de consejería, evaluación del aprendizaje" },
          { key: "se-completa-el-apartado-de-acuerdos-siguiend", categoria: "Hospitalizaci\u00f3n", aspecto: "Se completa el apartado de “Acuerdos” siguiendo las directrices establecidas por la consejería." },
        ],
      },
      {
        id: "enfermeria-b9",
        titulo: "Hospitalización · Registro en SIS/ módulo de Enfermería/ Esquema de vacunación.",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "registrar-el-cumplimiento-posterior-a-la-apl", categoria: "Hospitalizaci\u00f3n", aspecto: "Registrar el cumplimiento posterior a la aplicación de vacuna en esquema de vacunación vigente." },
          { key: "realizar-notas-de-enfermeria-post-aplicacion", categoria: "Hospitalizaci\u00f3n", aspecto: "Realizar notas de enfermería post aplicación de vacunas y/o en casos de contraindicación o reacion abversa de las mismas" },
        ],
      },
      {
        id: "enfermeria-b10",
        titulo: "Emergencia · Registro en SIS/ Módulo de Enfermería EMERGENCIA",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "registran-en-modulo-de-enfermeria-signos-vit", categoria: "Emergencia", aspecto: "Registran en módulo de enfermería signos vitales según diagnóstico,edad y condición de salud de la persona." },
          { key: "registran-medidas-antropometricas-peso", categoria: "Emergencia", aspecto: "Registran Medidas antropométricas:\nPeso" },
          { key: "temperatura", categoria: "Emergencia", aspecto: "Temperatura" },
          { key: "registro-de-presion-arterial", categoria: "Emergencia", aspecto: "Registro de Presión arterial." },
        ],
      },
      {
        id: "enfermeria-b11",
        titulo: "Emergencia · Registro en SIS/ Cumplimiento en Emergencia.",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "registros-de-indicaciones-medicas-segun-corr", categoria: "Emergencia", aspecto: "Registros de indicaciones médicas según corresponda: nombre y apellido del personal de enfermería que cumple." },
          { key: "fecha-en-caso-de-medicamentos-que-tengan-ind", categoria: "Emergencia", aspecto: "Fecha en caso de medicamentos que tengan indicación de cumplimiento mayor a 24 horas." },
          { key: "en-medicamentos-indicados-como-esquema-por-c", categoria: "Emergencia", aspecto: "En medicamentos indicados como esquema por condición clínica anotan en el recuadro el valor encontrado y dosis cumplida." },
        ],
      },
      {
        id: "enfermeria-b12",
        titulo: "Emergencia · Registro en SIS/ Módulo de enfermería Cuidados Generales",
        tipo: "expedientes",
        columnas: 5,
        fecha: false,
        acciones: true,
        responsable: true,
        filas: [
          { key: "registra-los-cuidados-generales-nombre-y-ape", categoria: "Emergencia", aspecto: "Registra los Cuidados generales, nombre y apellido del personal de enfermería que cumple." },
          { key: "registra-la-alimentacion-nombre-y-apellido-d", categoria: "Emergencia", aspecto: "Registra la alimentación: nombre y apellido del personal de enfermería que cumple." },
          { key: "elaboran-notas-de-enfermeria-durante-la-pres", categoria: "Emergencia", aspecto: "Elaboran notas de enfermería durante la prestación de cuidado de enfermería y procedimientos de atención, según la ruta de atención y según criterios establecidos." },
          { key: "registra-toma-de-examenes-de-laboratorio-esp", categoria: "Emergencia", aspecto: "Registra toma de exámenes de laboratorio especificando la fecha y hora de la toma." },
          { key: "registran-balance-hidrico-en-personas-si-lo", categoria: "Emergencia", aspecto: "Registran balance hídrico en personas si lo tiene indicado" },
        ],
      },

  ],
});

export const CEC_BY_SERVICE: Record<string, CecTemplate> = Object.fromEntries(
  CEC_TEMPLATES.map((t) => [t.serviceId, t]),
);

export function getCecTemplate(serviceId: string | null | undefined): CecTemplate | null {
  if (!serviceId) return null;
  return CEC_BY_SERVICE[serviceId] ?? null;
}

/** Los servicios de una division, en el orden de la plantilla. */
export function cecServiciosDeDivision(division: string): CecTemplate[] {
  return CEC_TEMPLATES.filter((t) => t.division === division);
}

/** Cuantas casillas tiene un bloque: filas x columnas. */
export function cecCasillasDelBloque(bloque: CecBloque): number {
  return bloque.filas.length * (bloque.tipo === "expedientes" ? bloque.columnas : 1);
}
