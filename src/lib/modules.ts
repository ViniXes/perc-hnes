// =============================================================================
// Modelo de datos: 3 modulos / menus por area
// -----------------------------------------------------------------------------
// Este archivo define la ESTRUCTURA del modulo ampliado. La app tendra 3 menus:
//
//   1. PERC                  -> plantilla pendiente (la enviara el usuario)
//   2. SESPS                 -> plantilla pendiente (la enviara el usuario)
//   3. Distribucion de Horas -> ya existe (ver src/lib/tabulator-template.ts)
//
// Cada AREA (unidad/servicio que inicia sesion) accede a 1, 2 o los 3 menus.
// Un area tiene UN solo login y, al entrar, ve unicamente los menus que tiene
// asignados en `modules`.
//
// El control de "completo / incompleto" aplica a TODAS las areas y se lleva por
// cada modulo de forma independiente (ver tipos y helpers al final).
//
// NOTA: las asignaciones reales de PERC y SESPS estan PENDIENTES del listado /
// imagen que enviara el usuario. Por ahora se siembran las areas de Distribucion
// desde los 25 servicios existentes. Al llegar el listado solo hay que:
//   - agregar "perc" y/o "sesps" al arreglo `modules` del area correspondiente, y
//   - agregar las areas que SOLO hacen PERC y/o SESPS (que hoy no existen como
//     servicio de distribucion).
// =============================================================================

import { SERVICE_DEFINITIONS } from "@/lib/tabulator-template";

// -----------------------------------------------------------------------------
// 1. Definicion de los 3 modulos / menus
// -----------------------------------------------------------------------------

export type ModuleId = "perc" | "sesps" | "distribucion";

export type ModuleDefinition = {
  id: ModuleId;
  /** Nombre completo para titulos y encabezados. */
  name: string;
  /** Etiqueta corta para chips, pestañas y menus laterales. */
  shortName: string;
  /** Descripcion de apoyo para la UI. */
  description: string;
};

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: "perc",
    name: "PERC",
    shortName: "PERC",
    description: "Modulo PERC. Plantilla pendiente de definir.",
  },
  {
    id: "sesps",
    name: "SEPS",
    shortName: "SEPS",
    description: "Modulo SEPS. Plantilla pendiente de definir.",
  },
  {
    id: "distribucion",
    name: "Distribucion de Horas",
    shortName: "Distribucion",
    description:
      "Captura mensual de la distribucion de horas por servicio (tabulador existente).",
  },
];

export const MODULE_BY_ID: Record<ModuleId, ModuleDefinition> = Object.fromEntries(
  MODULE_DEFINITIONS.map((module) => [module.id, module]),
) as Record<ModuleId, ModuleDefinition>;

// Dias habiles de captura por modulo. PERC y SEPS abren los primeros 3 dias
// habiles del mes; Distribucion de Horas, los primeros 5. Siempre se descuentan
// sabados, domingos y las fechas no habiles del calendario (captureCalendar).
export const MODULE_CAPTURE_DAYS: Record<ModuleId, number> = {
  perc: 3,
  sesps: 3,
  distribucion: 5,
};

/** Orden estable para mostrar los menus en la UI. */
export const MODULE_ORDER: ModuleId[] = MODULE_DEFINITIONS.map((module) => module.id);

// -----------------------------------------------------------------------------
// 2. Definicion de areas y a que menus accede cada una
// -----------------------------------------------------------------------------

export type AreaDefinition = {
  /** Identificador estable (slug). Coincide con el id de servicio cuando aplica. */
  id: string;
  /** Nombre visible del area / unidad. */
  name: string;
  /** Division a la que pertenece (opcional, para agrupar en el tablero). */
  group?: string;
  /**
   * Menus a los que esta area tiene acceso. El area solo vera estos menus.
   * Debe contener entre 1 y 3 elementos de ModuleId.
   */
  modules: ModuleId[];
};

// -----------------------------------------------------------------------------
// 2a. Siembra automatica: areas de Distribucion de Horas
// -----------------------------------------------------------------------------
// Los 25 servicios actuales son, hoy, las areas que completan Distribucion de
// Horas. Se siembran con acceso ["distribucion"]. Cuando llegue el listado de
// PERC / SESPS, se sobreescribe el acceso de estas areas (y se agregan nuevas)
// en AREA_OVERRIDES mas abajo.

const DISTRIBUCION_AREAS: AreaDefinition[] = SERVICE_DEFINITIONS.map((service) => ({
  id: service.id,
  name: service.name,
  // Todos los servicios capturan PERC; ademas Distribucion de Horas por defecto.
  // Los que tienen SEPS u otra combinacion se ajustan en AREA_OVERRIDES.
  modules: ["perc", "distribucion"],
}));

// -----------------------------------------------------------------------------
// 2b. Asignaciones PENDIENTES (poblar con el listado / imagen del usuario)
// -----------------------------------------------------------------------------
// AREA_OVERRIDES permite, por id de area, fijar el conjunto EXACTO de menus que
// le corresponden (reemplaza lo sembrado en 2a). Tambien sirve para agregar
// areas nuevas que solo hacen PERC y/o SESPS.
//
// Ejemplos (descomentar y ajustar cuando llegue el listado real):
//
//   "laboratorio-clinico": ["perc", "sesps", "distribucion"], // accede a los 3
//   "almacen":             ["sesps", "distribucion"],          // accede a 2
//   "docencia-e-investigacion": ["perc"],                       // accede a 1
//
// Para areas que NO existen como servicio de distribucion, agregarlas como
// entradas nuevas en NEW_AREAS (abajo).

const AREA_OVERRIDES: Record<string, ModuleId[]> = {
  // Transporte General: SOLO PERC. Su Distribucion de Horas se reporta dentro del
  // servicio "Servicios Varios" (Saneamiento + Transporte), no aqui.
  "transporte-general": ["perc"],
  // Saneamiento Ambiental (Medio Ambiente): PERC y SEPS.
  "saneamiento-ambiental": ["perc", "sesps"],
  // Trabajo Social: PERC, SEPS y Distribucion de Horas.
  "trabajo-social": ["perc", "sesps", "distribucion"],
  // Laboratorio Clinico: PERC, SEPS (matricial por examen) y Horas.
  "laboratorio-clinico": ["perc", "sesps", "distribucion"],
  // Psicologia (= Rehablitacion psicosocial): captura PERC (pendiente), SEPS y Horas.
  "rehablitacion-psicosocial": ["perc", "sesps", "distribucion"],
  // Nutricion (Departamento de Nutricion = Alimentacion y dieta): PERC, SEPS y Horas.
  "alimentacion-y-dieta": ["perc", "sesps", "distribucion"],
  // Banco de Sangre: PERC (ya existe), SEPS y Horas.
  "banco-de-sangre": ["perc", "sesps", "distribucion"],
  // Farmacia: PERC (ya existe), SEPS y Horas.
  "servicio-farmaceutico": ["perc", "sesps", "distribucion"],
  // Fisioterapia: PERC, SEPS y Horas.
  "terapia-fisica": ["perc", "sesps", "distribucion"],
  // Terapia Respiratoria: PERC, SEPS y Horas.
  "terapia-respiratoria": ["perc", "sesps", "distribucion"],
  // CEYE (Central de Esterilizacion): PERC, SEPS y Horas.
  "central-de-esterilizacion": ["perc", "sesps", "distribucion"],
  // Radiologia (agrupa Resonancia, Tomografia, Estudio de radiologia y Ultrasonografia): PERC, SEPS y Horas.
  radiologia: ["perc", "sesps", "distribucion"],
  // Asesores de Medicamentos: SOLO Distribucion de Horas.
  "asesores-de-medicamentos": ["distribucion"],
  // ESDOMED: SOLO Distribucion de Horas.
  esdomed: ["distribucion"],
  // Planificacion y Calidad: SOLO Distribucion de Horas.
  planificacion: ["distribucion"],
  // Epidemiologia: SOLO Distribucion de Horas.
  epidemiologia: ["distribucion"],
  // Unidad de Cumplimiento: SOLO Distribucion de Horas.
  cumplimiento: ["distribucion"],
  // Auditoria Interna: SOLO Distribucion de Horas.
  "auditoria-interna": ["distribucion"],
  // Unidad Financiera: SOLO Distribucion de Horas.
  "unidad-financiera": ["distribucion"],
  // Unidad Juridica: SOLO Distribucion de Horas.
  "unidad-juridica": ["distribucion"],
  // Comunicaciones: SOLO Distribucion de Horas.
  comunicaciones: ["distribucion"],
  // Unidad de Convenios: SOLO Distribucion de Horas.
  "unidad-de-convenios": ["distribucion"],
  // Jefaturas de Division Medica: SOLO Distribucion de Horas.
  "jefaturas-division-medica": ["distribucion"],
  // Jefatura de Division de Apoyo: SOLO Distribucion de Horas.
  "jefatura-division-apoyo": ["distribucion"],
  // UDP: SOLO Distribucion de Horas.
  udp: ["distribucion"],
  // Cuidados Paliativos: por ahora SOLO Distribucion de Horas (SEPS pendiente).
  "cuidados-paliativos": ["distribucion"],
  // Medicina Preventiva: por ahora SOLO Distribucion de Horas.
  "medicina-preventiva": ["distribucion"],
  // Medicina Interna: por ahora SOLO Distribucion de Horas.
  "medicina-interna": ["distribucion", "sesps"],
  // Anestesiologia: por ahora SOLO Distribucion de Horas.
  anestesiologia: ["distribucion", "sesps"],
  // Medicina Critica: por ahora SOLO Distribucion de Horas.
  "medicina-critica": ["distribucion"],
  // Biologia Molecular: por ahora SOLO Distribucion de Horas.
  "biologia-molecular": ["distribucion"],
  // Recursos Humanos: por ahora SOLO Distribucion de Horas.
  rrhh: ["distribucion", "sesps"],
  // UCIN (Unidad de Cuidados Intermedios): 3 subunidades, solo SEPS.
  "ucin-aislados": ["sesps"],
  "ucin-cronicos": ["sesps"],
  "ucin": ["sesps"],
  "ucin-consolidado": ["sesps"],
  "cuidados-paliativos": ["sesps"],
  "cuidados-paliativos-enfermeria": ["sesps"],
  "cuidados-paliativos-psicologo": ["sesps"],
  "cuidados-paliativos-fisioterapia": ["sesps"],
  "cuidados-paliativos-ts": ["sesps"],
  "cuidados-paliativos-espiritual": ["sesps"],
  "cuidados-paliativos-consolidado": ["sesps"],
  // UCI: subunidades + consolidado, solo SEPS.
  "uci-aislados": ["sesps"],
  "uci-cardiovascular": ["sesps"],
  "uci-extracorporea": ["sesps"],
  "uci-general-1": ["sesps"],
  "uci-general-2": ["sesps"],
  "uci-neurocriticos": ["sesps"],
  "uci-quirurgica": ["sesps"],
  "uci-consolidado": ["sesps"],
  "cardiologia": ["sesps"],
  "nefrologia": ["sesps"],
  // Servicios Varios: por ahora SOLO Distribucion de Horas.
  "servicios-varios": ["distribucion"],
  // Departamento de Tecnologia: por ahora SOLO Distribucion de Horas.
  tecnologia: ["distribucion"],
  // UCP: por ahora SOLO Distribucion de Horas.
  ucp: ["distribucion"],
  // Unidad de Gestion Documental: por ahora SOLO Distribucion de Horas.
  "gestion-documental": ["distribucion"],
  // Enfermeria: SEPS y Distribucion de Horas.
  enfermeria: ["distribucion", "sesps"],
  // Direccion: por ahora SOLO Distribucion de Horas.
  direccion: ["distribucion"],
  // Servicios PERC/SERV (productividad). Por ahora solo PERC; SEPS y Horas se
  // agregan cuando lleguen sus plantillas:
  //   - maxima-emergencia: ["perc", "sesps", "distribucion"]
  //   - centro-quirurgico: ["perc", "sesps", "distribucion"]
  //   - clinica-de-empleados: ["perc", "distribucion"]
  "maxima-emergencia": ["perc", "sesps", "distribucion"],
  "centro-quirurgico": ["perc", "sesps", "distribucion"],
  "clinica-de-empleados": ["perc", "distribucion"],
  // PENDIENTE: completar el resto con el listado de PERC y SESPS.
};

// Areas que solo participan en PERC y/o SESPS y no existen entre los servicios
// de distribucion. PENDIENTE de poblar con el listado.
const NEW_AREAS: AreaDefinition[] = [
  // { id: "ejemplo-area", name: "Ejemplo area", modules: ["perc"] },
];

// -----------------------------------------------------------------------------
// 2c. Registro final de areas (resultado de combinar siembra + overrides)
// -----------------------------------------------------------------------------

export const AREA_DEFINITIONS: AreaDefinition[] = [
  ...DISTRIBUCION_AREAS.map((area) => {
    const override = AREA_OVERRIDES[area.id];
    return override ? { ...area, modules: override } : area;
  }),
  ...NEW_AREAS,
];

export const AREA_BY_ID: Record<string, AreaDefinition> = Object.fromEntries(
  AREA_DEFINITIONS.map((area) => [area.id, area]),
);

// -----------------------------------------------------------------------------
// 3. Helpers de consulta de acceso
// -----------------------------------------------------------------------------

export function getAreaById(areaId: string | null | undefined): AreaDefinition | null {
  if (!areaId) {
    return null;
  }

  return AREA_BY_ID[areaId] ?? null;
}

export function getModuleById(moduleId: string | null | undefined): ModuleDefinition | null {
  if (!moduleId) {
    return null;
  }

  return MODULE_BY_ID[moduleId as ModuleId] ?? null;
}

/** Indica si un area tiene acceso a un modulo dado. */
export function areaHasModule(area: AreaDefinition, moduleId: ModuleId): boolean {
  return area.modules.includes(moduleId);
}

/** Devuelve, en el orden estable de MODULE_ORDER, los menus visibles del area. */
export function getAreaModules(area: AreaDefinition): ModuleDefinition[] {
  return MODULE_ORDER.filter((moduleId) => area.modules.includes(moduleId)).map(
    (moduleId) => MODULE_BY_ID[moduleId],
  );
}

/** Cuantos menus llena un area (1, 2 o 3). */
export function getAreaModuleCount(area: AreaDefinition): number {
  return area.modules.length;
}

/**
 * Separa las areas por cantidad de menus que llenan.
 * Resuelve directamente el pedido: "quienes llenan 3, quienes 2 y quienes 1".
 */
export function getAreasByModuleCount(): {
  three: AreaDefinition[];
  two: AreaDefinition[];
  one: AreaDefinition[];
} {
  const three: AreaDefinition[] = [];
  const two: AreaDefinition[] = [];
  const one: AreaDefinition[] = [];

  for (const area of AREA_DEFINITIONS) {
    const count = getAreaModuleCount(area);

    if (count >= 3) {
      three.push(area);
    } else if (count === 2) {
      two.push(area);
    } else if (count === 1) {
      one.push(area);
    }
  }

  return { three, two, one };
}

/** Todas las areas que tienen acceso a un modulo concreto. */
export function getAreasForModule(moduleId: ModuleId): AreaDefinition[] {
  return AREA_DEFINITIONS.filter((area) => areaHasModule(area, moduleId));
}

// -----------------------------------------------------------------------------
// 4. Control de completo / incompleto por modulo
// -----------------------------------------------------------------------------
// El estado se lleva por la combinacion (periodo, area, modulo). Asi, una misma
// area puede tener Distribucion "completo" pero PERC "incompleto" en el mismo
// mes. Se sugiere persistir en una coleccion Firestore tipo "moduleCompletions"
// con el id que produce getCompletionId().

export type CompletionStatus = "completo" | "incompleto";

export type ModuleCompletion = {
  periodId: string; // "YYYY-MM"
  areaId: string;
  moduleId: ModuleId;
  status: CompletionStatus;
  updatedAt?: number;
};

/** Id de documento estable para persistir el estado de un (periodo, area, modulo). */
export function getCompletionId(periodId: string, areaId: string, moduleId: ModuleId): string {
  return `${periodId}__${areaId}__${moduleId}`;
}

/**
 * Estado de un modulo para un area: lo busca en un mapa de completaciones
 * (indexado por getCompletionId). Por defecto "incompleto".
 */
export function getModuleStatus(
  completions: Record<string, ModuleCompletion>,
  periodId: string,
  areaId: string,
  moduleId: ModuleId,
): CompletionStatus {
  return completions[getCompletionId(periodId, areaId, moduleId)]?.status ?? "incompleto";
}

/**
 * Resumen de avance de un modulo en un periodo: cuantas areas (de las que tienen
 * ese menu asignado) lo tienen "completo".
 */
export function getModuleProgress(
  completions: Record<string, ModuleCompletion>,
  periodId: string,
  moduleId: ModuleId,
): { completed: number; total: number } {
  const areas = getAreasForModule(moduleId);
  const completed = areas.filter(
    (area) => getModuleStatus(completions, periodId, area.id, moduleId) === "completo",
  ).length;

  return { completed, total: areas.length };
}

/**
 * Indica si un area termino TODO lo que le corresponde en el periodo (todos sus
 * menus en "completo"). Util para el indicador global del area.
 */
export function isAreaFullyComplete(
  completions: Record<string, ModuleCompletion>,
  periodId: string,
  area: AreaDefinition,
): boolean {
  return area.modules.every(
    (moduleId) => getModuleStatus(completions, periodId, area.id, moduleId) === "completo",
  );
}
