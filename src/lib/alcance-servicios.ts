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
