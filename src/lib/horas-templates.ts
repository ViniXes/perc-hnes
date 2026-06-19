// AUTO-GENERADO (formato Distribucion de Horas: empleados x centros de costo).
// Mismo formato para todas las areas; cambian las columnas (centros) y empleados.
/** Empleado sembrado: solo nombre, o nombre + DUI (documento de identidad). */
export type HorasSeed = string | { name: string; dui?: string };

export type HorasTemplate = {
  serviceId: string;
  establishment: string;
  /** Centros de costo a los que el area distribuye horas (columnas). */
  columns: string[];
  /** Empleados iniciales (editable: se pueden agregar/quitar). */
  seedEmployees: HorasSeed[];
};

export const HORAS_TEMPLATES: Record<string, HorasTemplate> = {
  esdomed: {
    serviceId: "esdomed",
    establishment: "HOSPITAL NACIONAL EL SALVADOR",
    columns: ["ADMINISTRACION"],
    seedEmployees: [
      { dui: "03596842-9", name: "HEBER BENJAMIN CARDOZA GUEVARA" },
      { dui: "01658710-9", name: "BORIS ANDREE RODRIGUEZ QUINTANILLA" },
      { dui: "03676985-2", name: "JUAN CARLOS MIRANDA MARROQUIN" },
      { dui: "04505539-1", name: "JOSE DANIEL HERNANDEZ ZEPEDA" },
      { dui: "05760583-5", name: "VINICIO ALEXANDER HERNANDEZ QUIJANO" },
      { dui: "04304339-8", name: "ALFONSO MONTES GUTIERREZ" },
      { dui: "05060484-6", name: "DENYS RICARDO ALVAREZ SORTO" },
      { dui: "03598713-0", name: "DIEGO IVAN LOPEZ" },
      { dui: "05548384-7", name: "FERNANDO JAVIER GALVEZ SAMPSON" },
      { dui: "02430226-2", name: "PILAR DEL CARMEN CANDRAY AMAYA" },
      { dui: "00529335-7", name: "HENRY OMAR MACIAS BARRIENTOS" },
      { dui: "04800141-4", name: "BRENDA MARGARITA RAMIREZ OVIEDO" },
      { dui: "05837047-5", name: "LUIS FERNANDO AMAYA GRANDE" },
      { dui: "03231178-8", name: "BILLIE NAPOLEON CRUZ GARCIA" },
      { dui: "02989402-8", name: "CARLOS RODIL SALEGIO SALINAS" },
      { dui: "05080791-5", name: "VANESSA FABIOLA NAVES LARIN" },
      { dui: "05298662-6", name: "GABRIELA ALEJANDRA CALPAÑO RODRIGUEZ" },
      { dui: "03614327-6", name: "CARLA SOFIA GIRON CERNA" },
      { dui: "03979953-9", name: "OSCAR ALEXANDER GUARDADO GUEVARA" },
      { dui: "05649041-5", name: "VIOLETA SARAI CASTRO ORELLANA" },
      { dui: "04297389-1", name: "VANESSA TATIANA HERRERA ALAS" },
      { dui: "03532673-2", name: "BARTIMEO OLIVERIO LOPEZ PICHINTE" },
      { dui: "01980666-7", name: "CARLOS ABRAHAM MONTOYA ARROYO" },
      { dui: "05258503-0", name: "KARLA ALEJANDRA GARCIA DIAZ" },
      { dui: "06656459-1", name: "BEATRIZ ALEJANDRA BARRERA DE VASQUEZ" },
      { dui: "05513800-2", name: "ANDREA GABRIELA FLORES MANGANDI" },
      { dui: "06342595-0", name: "ALEJANDRO GABRIEL HERNANDEZ HERRERA" },
    ],
  },
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

