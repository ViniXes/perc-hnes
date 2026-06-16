// AUTO-GENERADO (formato Distribucion de Horas: empleados x centros de costo).
// Mismo formato para todas las areas; cambian las columnas (centros) y empleados.
export type HorasTemplate = {
  serviceId: string;
  establishment: string;
  /** Centros de costo a los que el area distribuye horas (columnas). */
  columns: string[];
  /** Empleados iniciales (editable: se pueden agregar/quitar). */
  seedEmployees: string[];
};

export const HORAS_TEMPLATES: Record<string, HorasTemplate> = {
  "asesores-de-medicamentos": {
    serviceId: "asesores-de-medicamentos",
    establishment: "HOSPITAL NACIONAL EL SALVADOR",
    columns: ["ADMINISTRACION"],
    seedEmployees: [
      "Ana Lydia Moran Morales",
      "Fernando Ernesto Preza Franco",
      "César Guillermo Cartagena Benítez",
    ],
  },
  "trabajo-social": {
    serviceId: "trabajo-social",
    establishment: "HOSPITAL NACIONAL EL SALVADOR",
    columns: ["TRABAJO SOCIAL", "SERVICIO DE APOYO A RIISS", "ADMINISTRACION"],
    seedEmployees: [
      "Brenda Patricia Mejia De Rodriguez",
      "Erika Eloisa Gonzalez Rodriguez",
      "Marcela Anabel Ramirez Siciliano",
      "Ricardo Balmore Santos Diaz",
      "Sandra Guadalupe Vasquez Bolaños",
      "Maria Beatriz Santamaria Colocho",
      "Claudia Yanira Ayala Lemus",
      "Versy Yalem Bejarano Vargas",
      "Raquel Betzabe Acosta De Canjura",
      "Carlos Francisco Vasquez",
      "Elena Maricela Zepeda",
      "Ana Veronica Villatoro Guzman",
      "Lissette Magaly Batres Barahona",
      "Kryssia Yesenia Ramírez Navarro",
      "Febe Del Carmen Fuentes Moreno (Servicios Profesionales)",
      "Jennifer Celestina Romero Rivas (Servicios Profesionales)",
      "Madelyn Yacira Ruiz Urbina (Servicios Profesionales)",
      "Susana Beatriz Crespin Gonzalez (Servicios Profesionales)",
      "Katerin Beatriz Martínez Machado",
      "Karla Jassmin Sanchez Ramirez",
      "Guizel Esmeralda Muñoz Acosta",
      "Samuel Ernesto Contreras Valencia",
      "Lucia Esperanza Martínez Muñoz",
      "Jacqueline Lissette Acevedo De Alvarenga",
      "Freddy Alexis Herrera Lopez",
      "Johana Elizabeth Henrriquez León",
    ],
  },
  "banco-de-sangre": {
    serviceId: "banco-de-sangre",
    establishment: "HOSPITAL NACIONAL EL SALVADOR",
    columns: ["BANCO DE SANGRE", "SERVICIO DE APOYO A RIISS", "ADMINISTRACION"],
    seedEmployees: [
      "DILSIA MARLENE CORNEJO ESTRADA",
      "CARLOS MAURICIO OSORIO ALVARADO",
      "SANDRA CECILIA SORIANO MARTINEZ",
      "JOHANNA GABRIELA ACEVEDO ESTRADA",
      "FATIMA RAQUEL FUENTES CLARA",
      "FRANCIS ALFREDO SEGURA CALDERON",
      "ALEJANDRA JOSE MONTERROSA ALEGRIA",
      "JEFFREY MANASES SOLIS SANCHEZ",
      "NORMA CAROLINA MIRANDA MARTINEZ",
      "TERESA CAROLINA MORAN HERNANDEZ",
      "VIRGINIA ESTER FERNANDEZ MEDINA",
      "HECTOR ADOLFO GONZALEZ LOPEZ",
      "EDWIN ALEXANDER FLORES GARCIA",
      "JEFERSON STEVE ANAYA LIZAMA",
      "LUIS ANGEL ESPAÑA CASTELLANOS",
      "LESLI LORENA ARELY MUNDO CANALES",
      "FRANCESA AMANDA YAZEL AYALA RODRIGUEZ",
      "EDWIN VLADIMIR ESCOBAR VILLALTA",
      "RANDAL GIOVANNI MARTINEZ RIVERA",
      "JUAN JOSE MURCIA LOPEZ",
    ],
  },
};

export function getHorasTemplate(serviceId: string | null | undefined): HorasTemplate | null {
  if (!serviceId) return null;
  return HORAS_TEMPLATES[serviceId] || null;
}

export function hasHorasTemplate(serviceId: string | null | undefined): boolean {
  return !!serviceId && serviceId in HORAS_TEMPLATES;
}

