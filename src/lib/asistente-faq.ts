/**
 * ASISTENTE VIRTUAL (el robot de la esquina)
 *
 * El catalogo de preguntas frecuentes y la busqueda que las encuentra. La
 * busqueda no usa inteligencia artificial: compara palabra por palabra contra
 * la pregunta, sus palabras clave y la respuesta, ignorando tildes y mayusculas,
 * y devuelve la de mejor puntaje. Si nada pasa el umbral responde que no sabe,
 * en vez de inventar.
 *
 * Para agregar una pregunta basta con sumarla a ASSISTANT_FAQS: no hay que
 * tocar la pantalla del asistente.
 */

// Preguntas frecuentes del asistente virtual (robot).
// Categorias del asistente (para navegar los temas por pestañas).
export const ASSISTANT_CATEGORIES = ["Captura", "Plazos", "Cuenta", "Vista", "Sistema"] as const;
export type AssistantCategory = (typeof ASSISTANT_CATEGORIES)[number];

// Base de conocimiento del asistente. `kw` son palabras clave extra (sinonimos)
// para mejorar la coincidencia con lo que escribe el usuario.
export const ASSISTANT_FAQS: { q: string; a: string; cat: AssistantCategory; kw?: string[] }[] = [
  // ---- Captura ----
  {
    cat: "Captura",
    q: "¿Cómo ingreso mis datos?",
    a: "Abra su tabulador (PERC, SEPS u Horas) desde el menú, complete las casillas y toque «Guardar» al pie de la tabla. Cada módulo guarda por separado.",
    kw: ["ingresar", "cargar", "llenar", "capturar", "registrar", "datos", "guardar"],
  },
  {
    cat: "Captura",
    q: "¿Cómo guardo lo que cargué?",
    a: "Al pie de cada tabla hay un botón «Guardar». Mientras la captura esté abierta puede guardar y volver a editar las veces que necesite; cada guardado reemplaza el anterior del mes.",
    kw: ["guardar", "grabar", "salvar", "boton"],
  },
  {
    cat: "Captura",
    q: "En Horas, ¿cómo relleno rápido?",
    a: "Escriba un valor en una casilla y arrastre el cuadradito de su esquina inferior hacia abajo: copia ese valor en toda la columna, como en Excel (solo hacia abajo).",
    kw: ["rellenar", "arrastrar", "copiar", "rapido", "excel", "columna"],
  },
  {
    cat: "Captura",
    q: "¿Cómo agrego o quito empleados en Horas?",
    a: "En la tabla de Horas use «+ Agregar empleado» para sumar una fila. Para quitar, toque la ✕ de la fila; le pedirá confirmación antes de borrarla.",
    kw: ["empleado", "agregar", "quitar", "eliminar", "borrar", "persona", "fila"],
  },
  {
    cat: "Captura",
    q: "¿Para qué sirve la columna DUI en Horas?",
    a: "El DUI (documento de identidad) va antes del nombre del empleado y se guarda junto a su registro. Es un campo de texto: escríbalo con guion, por ejemplo 01234567-8.",
    kw: ["dui", "documento", "identidad", "cedula", "numero"],
  },
  {
    cat: "Captura",
    q: "¿Para qué es el comentario en Horas?",
    a: "El comentario (maternidad, vacaciones, permiso, etc.) es solo de apoyo durante la captura y NO se guarda en el historial ni en el consolidado.",
    kw: ["comentario", "nota", "maternidad", "vacaciones", "permiso"],
  },
  {
    cat: "Captura",
    q: "En Laboratorio, ¿qué es el cuadre?",
    a: "En el SEPS de Laboratorio el total de RESULTADOS debe ser igual al total de PROCEDENCIA. Si no coinciden, la fila se marca en rojo con «Debe sumar lo mismo». Corrija los valores hasta que cuadren.",
    kw: ["laboratorio", "cuadre", "resultados", "procedencia", "rojo", "suma", "total", "examen"],
  },
  {
    cat: "Captura",
    q: "¿Solo se aceptan números?",
    a: "Sí, en las casillas de horas y de estadística solo se aceptan números. El nombre, DUI y comentario sí admiten texto.",
    kw: ["numero", "letras", "texto", "casilla"],
  },
  // ---- Plazos ----
  {
    cat: "Plazos",
    q: "¿Hasta cuándo puedo cargar?",
    a: "PERC y SEPS cierran el 3er día hábil a las 2:30 PM; Distribución de Horas el 5º día hábil a las 2:30 PM. SEPS reabre el 6º día hábil.",
    kw: ["plazo", "fecha", "cierre", "cuando", "limite", "hora", "dia", "habil"],
  },
  {
    cat: "Plazos",
    q: "No puedo cargar, está bloqueado",
    a: "Si ya pasó el plazo, use «Solicitar habilitar» en el menú para pedirle a un supervisor o al administrador que le reabra el tablero.",
    kw: ["bloqueado", "cerrado", "no puedo", "deshabilitado", "habilitar", "solicitar", "reabrir"],
  },
  {
    cat: "Plazos",
    q: "¿Cómo solicito que me habiliten?",
    a: "Menú → «Solicitar habilitar»: elija el módulo y el mes, y envíe la solicitud. Un supervisor o el admin la aprueba y le reabre la captura.",
    kw: ["solicitar", "solicitud", "habilitar", "permiso", "pedir", "reabrir"],
  },
  {
    cat: "Plazos",
    q: "¿Cuándo reabre SEPS?",
    a: "SEPS vuelve a abrir el 6º día hábil del mes para ajustes, después de su primer cierre del 3er día hábil.",
    kw: ["reabre", "seps", "abre", "reapertura", "sexto"],
  },
  // ---- Cuenta ----
  {
    cat: "Cuenta",
    q: "¿Cómo cambio mi contraseña?",
    a: "Menú → «Cambiar contraseña». Escriba la nueva clave y confirme; puede mostrarla u ocultarla tocando el ojito.",
    kw: ["contraseña", "clave", "cambiar", "password", "ojito"],
  },
  {
    cat: "Cuenta",
    q: "Olvidé mi contraseña",
    a: "Pídale al administrador un «Reset de clave» desde Usuarios y permisos: le asignan una clave temporal que cambia al entrar.",
    kw: ["olvide", "recuperar", "reset", "perdi", "contraseña", "clave"],
  },
  {
    cat: "Cuenta",
    q: "¿Cómo cierro sesión?",
    a: "En el menú lateral, abajo, toque «Cerrar sesión».",
    kw: ["cerrar", "salir", "sesion", "logout", "desconectar"],
  },
  {
    cat: "Cuenta",
    q: "¿Qué puede hacer cada rol?",
    a: "Los servicios cargan sus propios tabuladores. Los supervisores ven y consolidan su división. El administrador ve todo, edita meses pasados, gestiona usuarios y habilita tableros.",
    kw: ["rol", "permiso", "supervisor", "administrador", "admin", "servicio", "quien"],
  },
  // ---- Vista ----
  {
    cat: "Vista",
    q: "¿Cómo veo meses anteriores?",
    a: "En cada tabulador use el selector de «Mes». Los meses con datos aparecen en verde y los vacíos en gris. Es solo lectura (salvo que sea admin).",
    kw: ["mes", "anterior", "historial", "pasado", "ver", "selector"],
  },
  {
    cat: "Vista",
    q: "¿Puedo editar un mes pasado?",
    a: "Solo el administrador puede editar meses anteriores. Los servicios y supervisores los ven en modo solo lectura desde el selector de mes.",
    kw: ["editar", "mes", "pasado", "anterior", "modificar", "historial"],
  },
  {
    cat: "Vista",
    q: "¿Qué significan los colores verde y ámbar?",
    a: "Verde = completo o ya cargado. Ámbar = pendiente o incompleto. En el selector de mes, verde es un mes con datos guardados y gris uno sin datos.",
    kw: ["color", "verde", "ambar", "amarillo", "gris", "completo", "incompleto"],
  },
  {
    cat: "Vista",
    q: "¿Cómo personalizo la vista?",
    a: "Menú → «Configuración»: puede cambiar tipografía, tamaño de letra, tema (claro/oscuro), color de acento y fondo de pantalla.",
    kw: ["personalizar", "configuracion", "tema", "tipografia", "fondo", "color", "letra", "claro", "oscuro"],
  },
  // ---- Sistema ----
  {
    cat: "Sistema",
    q: "¿Qué es PULSO?",
    a: "PULSO (Plataforma Única de Logística y Servicios Operativos) es el sistema del Hospital Nacional El Salvador para capturar productividad (PERC), estadística (SEPS) y distribución de horas del personal.",
    kw: ["pulso", "sistema", "que es", "plataforma", "hospital"],
  },
  {
    cat: "Sistema",
    q: "¿Qué es PERC, SEPS y Horas?",
    a: "PERC es la productividad por centros de costo; SEPS es la captura estadística (diaria o por examen); Distribución de Horas reparte las horas del personal por servicio. El orden siempre es PERC, SEPS y luego Horas.",
    kw: ["perc", "seps", "horas", "modulo", "diferencia", "significa"],
  },
  {
    cat: "Sistema",
    q: "¿Por qué no veo los tres módulos?",
    a: "Cada servicio tiene habilitados solo los módulos que le corresponden. Por ejemplo, ESDOMED y Asesores de Medicamentos solo reportan Distribución de Horas. Si cree que falta uno, avise al administrador.",
    kw: ["modulo", "falta", "no veo", "no aparece", "esdomed", "solo horas"],
  },
  {
    cat: "Sistema",
    q: "¿Cómo descargo el Excel mensual?",
    a: "Si es administrador: Menú → «Consolidados PERC» → «Descargar Excel». Sale con los datos disponibles al momento de la descarga.",
    kw: ["excel", "descargar", "reporte", "consolidado", "mensual", "exportar"],
  },
  {
    cat: "Sistema",
    q: "¿Quién consolida la información?",
    a: "El administrador (y los supervisores en su división) ven el consolidado de todos los servicios. Cada servicio solo ve y carga lo suyo.",
    kw: ["consolida", "consolidado", "junta", "resumen", "supervisor", "admin"],
  },
];

// Normaliza acentos y aplica un par de sinonimos comunes para la busqueda.
export function normalizeAssistant(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bclave\b/g, "contraseña")
    .replace(/\bborrar\b/g, "quitar")
    .replace(/\beliminar\b/g, "quitar");
}

// Busca la mejor respuesta segun palabras clave de la pregunta del usuario.
export function answerAssistant(query: string): { text: string; found: boolean } {
  const q = normalizeAssistant(query);
  const qWords = q.split(/[^a-zñ0-9]+/).filter((w) => w.length > 2);
  let best: (typeof ASSISTANT_FAQS)[number] | null = null;
  let bestScore = 0;
  for (const faq of ASSISTANT_FAQS) {
    const haystack = normalizeAssistant(`${faq.q} ${faq.a} ${(faq.kw ?? []).join(" ")}`);
    const words = haystack.split(/[^a-zñ0-9]+/).filter((w) => w.length > 2);
    let score = 0;
    // Coincidencia por palabra de la base presente en la pregunta.
    for (const w of words) {
      if (q.includes(w)) score += 1;
    }
    // Bonus fuerte si alguna keyword aparece tal cual en la pregunta del usuario.
    for (const k of faq.kw ?? []) {
      if (qWords.includes(normalizeAssistant(k))) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = faq;
    }
  }
  if (best && bestScore >= 2) {
    return { text: best.a, found: true };
  }
  return {
    text: "No estoy seguro de eso puntualmente, pero puedo ayudarle a moverse y a hacer cosas en PULSO: ir a PERC, SEPS o Dis/horas, cambiar su contraseña, cambiar el modo claro/oscuro, abrir soporte, solicitar habilitación de un tablero o guardar su captura. Escríbame qué necesita con otras palabras (ej: «ir a horas», «quiero guardar») o toque un tema de abajo. Si es algo puntual de sus datos, lo mejor es avisar al administrador.",
    found: false,
  };
}
