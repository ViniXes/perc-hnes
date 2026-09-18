/**
 * RED NACIONAL DE HOSPITALES
 *
 * Las cinco regiones de salud del MINSAL y los hospitales que PULSO monitorea,
 * mas el color con que se pinta un porcentaje de avance.
 *
 * De cada hospital solo viaja el AVANCE (cuantos servicios entregaron): ninguna
 * cifra de produccion ni de insumos cruza de un hospital a otro. El que tiene
 * 'conectado: true' responde por su propia API; el que tiene 'local: true' es
 * este hospital y sale del tablero de PULSO, no de una consulta externa.
 */

/**
 * Las cinco regiones de salud del MINSAL. El menu de hospitales entra por aca:
 * con 30 hospitales una lista plana no se puede leer, por region si.
 */
export const REGIONES_SALUD = [
  { id: "occidental", nombre: "Occidental", detalle: "Ahuachapán · Santa Ana · Sonsonate" },
  { id: "central", nombre: "Central", detalle: "La Libertad · Chalatenango · Cuscatlán" },
  { id: "metropolitana", nombre: "Metropolitana", detalle: "San Salvador" },
  { id: "paracentral", nombre: "Paracentral", detalle: "San Vicente · La Paz · Cabañas" },
  { id: "oriental", nombre: "Oriental", detalle: "San Miguel · Usulután · Morazán · La Unión" },
];

/**
 * Color del avance: UN solo tono que se va oscureciendo. Una escala de magnitud
 * se lee sola; un arcoiris (rojo-amarillo-verde) obliga a mirar la leyenda y
 * ademas se le pierde a quien no distingue el rojo del verde. El numero siempre
 * va escrito al lado, para que el color nunca sea el unico dato.
 */
export function tonoAvance(pct: number) {
  const p = Math.max(0, Math.min(100, pct));
  return `rgba(16,185,129,${(0.14 + (p / 100) * 0.76).toFixed(3)})`;
}

/**
 * La red de hospitales nacionales, agrupada por region. Estan TODOS, aunque
 * todavia no reporten: los que no estan conectados se ven apagados y sirven de
 * mapa de avance del proyecto.
 *
 * conectado  = PULSO ya puede leer su monitoreo. El id tiene que coincidir con
 *              el de la ruta /api/hospitales/sigma y con sus variables en Vercel.
 * soloAvance = no corre SIGMA sino su propio sistema, que solo publica la lista
 *              de servicios con su estado: ahi no hay insumos ni mes que elegir.
 *
 * Para conectar uno: ponerle conectado: true aca, agregar su linea en la ruta y
 * su variable en Vercel. Nada mas.
 */
export const HOSPITALES_EXTERNOS: {
  id: string;
  corto: string;
  nombre: string;
  region: string;
  lugar?: string;
  conectado?: boolean;
  soloAvance?: boolean;
  // local = es el propio HNES: su avance sale del monitoreo que PULSO ya calcula,
  // no de un enlace externo. Solo produccion distribuida.
  local?: boolean;
}[] = [
  // --- Occidental ---------------------------------------------------------
  { id: "ahuachapan", corto: "Ahuachapán", nombre: 'Hospital Nacional "Dr. Francisco Menéndez"', region: "occidental", lugar: "Ahuachapán" },
  { id: "santaana", corto: "Santa Ana", nombre: 'Hospital Nacional Regional "San Juan de Dios"', region: "occidental", lugar: "Santa Ana" },
  { id: "chalchuapa", corto: "Chalchuapa", nombre: "Hospital Nacional de Chalchuapa", region: "occidental", lugar: "Santa Ana" },
  { id: "metapan", corto: "Metapán", nombre: 'Hospital Nacional "Dr. Arturo Morales"', region: "occidental", lugar: "Metapán, Santa Ana" },
  { id: "sonsonate", corto: "Sonsonate", nombre: 'Hospital Nacional "Dr. Jorge Mazzini Villacorta"', region: "occidental", lugar: "Sonsonate" },
  // --- Central ------------------------------------------------------------
  { id: "santatecla", corto: "Santa Tecla", nombre: 'Hospital Nacional "San Rafael"', region: "central", lugar: "Santa Tecla, La Libertad" },
  { id: "chalatenango", corto: "Chalatenango", nombre: 'Hospital Nacional "Dr. Luis Edmundo Vásquez"', region: "central", lugar: "Chalatenango" },
  { id: "nuevaconcepcion", corto: "Nueva Concepción", nombre: "Hospital Nacional de Nueva Concepción", region: "central", lugar: "Chalatenango" },
  { id: "cojutepeque", corto: "Cojutepeque", nombre: 'Hospital Nacional "Nuestra Señora de Fátima"', region: "central", lugar: "Cojutepeque, Cuscatlán", conectado: true, soloAvance: true },
  { id: "suchitoto", corto: "Suchitoto", nombre: "Hospital Nacional de Suchitoto", region: "central", lugar: "Cuscatlán", conectado: true },
  // --- Metropolitana ------------------------------------------------------
  { id: "rosales", corto: "Rosales", nombre: 'Hospital Nacional "Rosales"', region: "metropolitana", lugar: "San Salvador" },
  { id: "bloom", corto: "Bloom", nombre: 'Hospital Nacional de Niños "Benjamín Bloom"', region: "metropolitana", lugar: "San Salvador" },
  { id: "mujer", corto: "La Mujer", nombre: 'Hospital Nacional de la Mujer "Dra. María Isabel Rodríguez"', region: "metropolitana", lugar: "San Salvador" },
  { id: "zacamil", corto: "Zacamil", nombre: 'Hospital Nacional "Dr. Juan José Fernández"', region: "metropolitana", lugar: "Mejicanos, San Salvador" },
  { id: "saldana", corto: "Saldaña", nombre: 'Hospital Nacional de Neumología "Dr. José Antonio Saldaña"', region: "metropolitana", lugar: "San Salvador", conectado: true },
  { id: "sanbartolo", corto: "San Bartolo", nombre: 'Hospital Nacional "Enf. Angélica Vidal de Najarro"', region: "metropolitana", lugar: "Ilopango, San Salvador", conectado: true, soloAvance: true },
  { id: "hnes", corto: "El Salvador", nombre: "Hospital Nacional El Salvador", region: "metropolitana", lugar: "San Salvador", conectado: true, soloAvance: true, local: true },
  { id: "psiquiatrico", corto: "Psiquiátrico", nombre: 'Hospital Nacional Psiquiátrico "Dr. José Molina Martínez"', region: "metropolitana", lugar: "Soyapango, San Salvador", conectado: true },
  // --- Paracentral --------------------------------------------------------
  { id: "sanvicente", corto: "San Vicente", nombre: 'Hospital Nacional "Santa Gertrudis"', region: "paracentral", lugar: "San Vicente" },
  { id: "zacatecoluca", corto: "Zacatecoluca", nombre: 'Hospital Nacional "Santa Teresa"', region: "paracentral", lugar: "Zacatecoluca, La Paz" },
  { id: "ilobasco", corto: "Ilobasco", nombre: "Hospital Nacional de Ilobasco", region: "paracentral", lugar: "Cabañas" },
  { id: "sensuntepeque", corto: "Sensuntepeque", nombre: 'Hospital Nacional "San Jerónimo Emiliani"', region: "paracentral", lugar: "Sensuntepeque, Cabañas" },
  // --- Oriental -----------------------------------------------------------
  { id: "sanmiguel", corto: "San Miguel", nombre: 'Hospital Nacional Regional "San Juan de Dios"', region: "oriental", lugar: "San Miguel", conectado: true, soloAvance: true },
  { id: "ciudadbarrios", corto: "Ciudad Barrios", nombre: 'Hospital Nacional "Monseñor Óscar Arnulfo Romero"', region: "oriental", lugar: "Ciudad Barrios, San Miguel" },
  { id: "nuevaguadalupe", corto: "Nueva Guadalupe", nombre: "Hospital Nacional de Nueva Guadalupe", region: "oriental", lugar: "San Miguel" },
  { id: "usulutan", corto: "Usulután", nombre: 'Hospital Nacional "San Pedro"', region: "oriental", lugar: "Usulután" },
  { id: "jiquilisco", corto: "Jiquilisco", nombre: "Hospital Nacional de Jiquilisco", region: "oriental", lugar: "Usulután" },
  { id: "santiagodemaria", corto: "Santiago de María", nombre: "Hospital Nacional de Santiago de María", region: "oriental", lugar: "Usulután" },
  { id: "gotera", corto: "San Fco. Gotera", nombre: 'Hospital Nacional "Dr. Héctor Antonio Hernández Flores"', region: "oriental", lugar: "San Francisco Gotera, Morazán" },
  { id: "launion", corto: "La Unión", nombre: "Hospital Nacional de La Unión", region: "oriental", lugar: "La Unión" },
  { id: "santarosa", corto: "Santa Rosa de Lima", nombre: "Hospital Nacional de Santa Rosa de Lima", region: "oriental", lugar: "La Unión" },
];
