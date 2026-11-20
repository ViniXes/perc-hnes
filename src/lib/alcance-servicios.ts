export const SERVICE_GROUP_BY_ID: Record<string, string> = {
  // --- DIRECCION (unidades staff + almacen medicamentos/farmacia/asesores) ---
  direccion: "direccion",
  esdomed: "direccion",
  "almacen-medicamentos": "direccion",
  "asesores-de-medicamentos": "direccion",
  "servicio-farmaceutico": "direccion",
  planificacion: "direccion",
  calidad: "direccion",
  epidemiologia: "direccion",
  cumplimiento: "direccion",
  "auditoria-interna": "direccion",
  "unidad-financiera": "direccion",
  "unidad-juridica": "direccion",
  comunicaciones: "direccion",
  "unidad-de-convenios": "direccion",
  "jefaturas-division-medica": "direccion",
  "jefatura-division-apoyo": "direccion",
  udp: "direccion",
  ucp: "direccion",
  "gestion-documental": "direccion",
  "trabajo-social": "apoyo",
  "laboratorio-clinico": "apoyo",
  "banco-de-sangre": "apoyo",
  "alimentacion-y-dieta": "apoyo",
  radiologia: "apoyo",
  "terapia-fisica": "apoyo",
  "rehablitacion-psicosocial": "apoyo",
  "biologia-molecular": "apoyo",
  "estudios-gastroclinicos": "medica",
  "unidad-de-hemodinamia": "medica",
  cardiologia: "medica",
  hemodialisis: "medica",
  "hemodialisis-medicina-interna": "medica",
  "terapia-respiratoria": "medica",
  vacunacion: "medica",
  "maxima-emergencia": "medica",
  "centro-quirurgico": "medica",
  "clinica-de-empleados": "apoyo",
  "central-de-esterilizacion": "enfermeria",
  enfermeria: "enfermeria",
  "cuidados-paliativos": "medica",
  "medicina-preventiva": "medica",
  "medicina-interna": "medica",
  "ucin-aislados": "medica",
  "ucin-cronicos": "medica",
  "ucin": "medica",
  "ucin-consolidado": "medica",
  "uci-aislados": "medica",
  "uci-cardiovascular": "medica",
  "uci-extracorporea": "medica",
  "uci-general-1": "medica",
  "uci-general-2": "medica",
  "uci-neurocriticos": "medica",
  "uci-quirurgica": "medica",
  "uci-consolidado": "medica",
  nefrologia: "medica",
  anestesiologia: "medica",
  "medicina-critica": "medica",
  // --- CONSULTA EXTERNA ---
  "ce-oncologia": "consulta-externa",
  "ce-hematologia": "consulta-externa",
  "ce-cardiologia": "consulta-externa",
  "ce-infectologia": "consulta-externa",
  // --- SUBDIRECCION ADMINISTRATIVA ---
  almacen: "administrativa",
  aseo: "administrativa",
  lavanderia: "administrativa",
  "transporte-general": "administrativa",
  mantenimiento: "administrativa",
  "saneamiento-ambiental": "administrativa",
  rrhh: "administrativa",
  "servicios-varios": "administrativa",
  tecnologia: "administrativa",
};

// --- DEPARTAMENTOS (jefaturas que agrupan un set fijo de servicios) --------------
// Una jefa de departamento es un supervisor cuyo alcance son SOLO estos servicios
// (no una división entera). Hoy: Laboratorios = Clínico + Banco de Sangre + Biología
// Molecular, colgando de la División de Apoyo.
export const DEPARTMENT_SERVICES: Record<string, string[]> = {
  laboratorios: ["laboratorio-clinico", "banco-de-sangre", "biologia-molecular"],
  "uci-ucin": [
    "ucin-aislados", "ucin-cronicos", "ucin", "ucin-consolidado",
    "uci-aislados", "uci-cardiovascular", "uci-extracorporea", "uci-general-1",
    "uci-general-2", "uci-neurocriticos", "uci-quirurgica", "uci-consolidado",
    // Las Horas de los medicos de UCI/UCIN se digitan en Medicina Critica
    // (su tabulador de Horas tiene columnas UCI y UCIN).
    "medicina-critica",
  ],
  // Ana Julia (jefa que llena varias areas): Saneamiento + Servicios Varios + Transporte.
  "saneamiento-varios": ["saneamiento-ambiental", "servicios-varios", "transporte-general"],
  // Enfermeria que ademas llena el SEPS de Cuidados Paliativos (Karina Hernandez).
  "enfermeria-paliativos": ["enfermeria", "cuidados-paliativos"],
};

export function isServiceInChiefScope(
  profile: { division?: string | null; department?: string | null } | null,
  serviceId: string,
): boolean {
  const dept = profile?.department || null;
  if (dept) return (DEPARTMENT_SERVICES[dept] || []).includes(serviceId);
  const div = profile?.division || null;
  if (div) return (SERVICE_GROUP_BY_ID[serviceId] || "apoyo") === div;
  return true;
}

// --- SERVICIOS QUE AUN NO CUENTAN EN EL AVANCE ---------------------------------
// Servicio -> primer periodo ("AAAA-MM") que cuenta en Monitoreo, Tendencias,
// barra de avance y recordatorios. `null` = todavia NO cuenta en ningun mes (se
// activa a mano cuando el usuario lo indique, poniendo aqui el periodo).
// Mientras no cuente, el servicio se ve pero sin tableros pendientes, para no
// impedir que el hospital llegue al 100 %.
// Consulta Externa: pendiente de activar (usuario, 20/11/2026).
export const INICIO_MONITOREO: Record<string, string | null> = {
  "ce-oncologia": null,
  "ce-hematologia": null,
  "ce-cardiologia": null,
  "ce-infectologia": null,
};

/** ¿El servicio cuenta en el avance de ese periodo? */
export function cuentaEnMonitoreo(serviceId: string, periodId: string): boolean {
  if (!(serviceId in INICIO_MONITOREO)) return true;
  const inicio = INICIO_MONITOREO[serviceId];
  return !!inicio && periodId >= inicio;
}

/** Texto corto para la tarjeta cuando el servicio aun no cuenta, o null si ya cuenta. */
export function etiquetaInicioMonitoreo(serviceId: string, periodId: string): string | null {
  if (cuentaEnMonitoreo(serviceId, periodId)) return null;
  const inicio = INICIO_MONITOREO[serviceId];
  if (!inicio) return "Aún no cuenta";
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const mes = MESES[Number.parseInt(inicio.slice(5, 7), 10) - 1] ?? inicio.slice(5, 7);
  return `Inicia ${mes} ${inicio.slice(0, 4)}`;
}
