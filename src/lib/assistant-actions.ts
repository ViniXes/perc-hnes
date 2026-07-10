// Catalogo de acciones que el asistente virtual de PULSO puede ejecutar, y un
// matcher OFFLINE por palabras clave. Sin dependencias de React ni del navegador:
// se puede importar tanto en el cliente (page.tsx) como en el servidor
// (src/app/api/assistant/route.ts).
// NOTA DE TONO: todos los mensajes tratan al usuario de "usted".

export type AssistantActionId =
  | "go_inicio"
  | "go_perc"
  | "go_seps"
  | "go_horas"
  | "go_docs"
  | "go_config"
  | "change_password"
  | "toggle_theme"
  | "sign_out"
  | "open_support"
  | "request_enable"
  | "save_perc"
  | "save_seps"
  | "save_horas"
  // Configuracion de la vista por chat (tema, acento, tipografia, tamano, fondo,
  // widgets). Se resuelven en el cliente por prefijo "cfg_".
  | `cfg_${string}`;

// Contexto minimo (rol y modulos disponibles). NO incluye datos sensibles.
export type AssistantContext = {
  isAdmin: boolean;
  isSupervisor: boolean;
  hasService: boolean;
  hasPerc: boolean;
  hasSeps: boolean;
  hasHoras: boolean;
  canRequestEnable: boolean;
  // Si YA hay valores cargados en cada tabulador del mes actual (para no guardar vacio).
  hasPercData: boolean;
  hasSepsData: boolean;
  hasHorasData: boolean;
};

export type AssistantActionMatch = {
  id: AssistantActionId;
  label: string;
  reply: string;
};

type ActionDef = AssistantActionMatch & {
  keywords: string[];
  available: (c: AssistantContext) => boolean;
};

export const ASSISTANT_ACTION_DEFS: ActionDef[] = [
  {
    id: "go_inicio",
    label: "Ir a Inicio",
    reply: "Lo llevo a la pantalla de Inicio. Toque el botón para ir.",
    keywords: ["inicio", "home", "pantalla principal", "volver al inicio", "menu principal", "resumen general"],
    available: () => true,
  },
  {
    id: "go_perc",
    label: "Abrir PERC",
    reply: "PERC es la captura de productividad por centros de costo. Toque el botón para abrirlo.",
    keywords: ["perc", "abrir perc", "tabulador perc", "productividad", "centros de costo", "capturar perc", "ir a perc"],
    available: (c) => c.hasService && c.hasPerc,
  },
  {
    id: "go_seps",
    label: "Abrir SEPS",
    reply: "SEPS es el tablero de estadística. Toque el botón para abrirlo.",
    keywords: ["seps", "sesps", "estadistica", "abrir seps", "ir a seps"],
    available: (c) => c.hasSeps,
  },
  {
    id: "go_horas",
    label: "Abrir Dis/horas",
    reply: "Distribución de Horas reparte las horas del personal por centro de costo. Toque el botón para abrirlo.",
    keywords: ["horas", "distribucion", "dishoras", "dis horas", "distribucion de horas", "reparto de horas", "abrir horas", "ir a horas"],
    available: (c) => c.hasService && c.hasHoras,
  },
  {
    id: "go_docs",
    label: "Abrir DOCS-POA/MOF",
    reply: "Ahí lleva el control documental (POA/MOF) por año. Toque el botón para abrirlo.",
    keywords: ["docs", "poa", "mof", "documental", "control documental", "documentos", "entregas a calidad"],
    available: () => true,
  },
  {
    id: "go_config",
    label: "Abrir Configuración",
    reply: "En Configuración personaliza su vista (fuente, color, fondo). Toque el botón para abrirla.",
    keywords: ["configuracion", "config", "personalizar", "fuente", "color de fondo", "fondo", "ajustes", "apariencia", "personalizar vista"],
    available: () => true,
  },
  {
    id: "change_password",
    label: "Cambiar contraseña",
    reply: "Le abro el cambio de contraseña. Toque el botón y escriba su nueva clave.",
    keywords: ["contraseña", "clave", "cambiar contraseña", "cambiar clave", "password", "nueva contraseña", "nueva clave", "cambiar mi contraseña"],
    available: () => true,
  },
  {
    id: "toggle_theme",
    label: "Alternar claro/oscuro",
    reply: "Puedo alternar entre modo claro y oscuro. Toque el botón para cambiarlo.",
    keywords: ["cambiar tema", "alternar tema", "cambiar modo", "cambiar el modo", "modo claro oscuro"],
    available: () => true,
  },
  {
    id: "sign_out",
    label: "Cerrar sesión",
    reply: "Puedo cerrar su sesión. Toque el botón para salir.",
    keywords: ["cerrar sesion", "salir de la app", "logout", "desconectar", "cerrar la sesion", "salir"],
    available: () => true,
  },
  {
    id: "open_support",
    label: "Abrir Soporte",
    reply: "Le abro el Centro de Soporte para crear un ticket (error, duda o sugerencia). Toque el botón.",
    keywords: ["soporte", "ticket", "reportar", "reporte", "falla", "problema tecnico", "asistencia", "centro de soporte", "abrir soporte", "crear ticket"],
    available: () => true,
  },
  {
    id: "request_enable",
    label: "Solicitar habilitar tablero",
    reply: "Puede pedirle al administrador que reabra un tablero. Toque el botón para llenar la solicitud.",
    keywords: ["habilitar", "solicitar habilitar", "reabrir", "abrir tablero", "habilitacion", "reapertura", "pedir permiso", "solicitud de habilitacion"],
    available: (c) => c.canRequestEnable,
  },
  {
    id: "save_perc",
    label: "Guardar PERC",
    reply: "Puedo guardar su captura de PERC. Revise los datos y confirme con el botón.",
    keywords: ["guardar perc", "enviar perc", "guardar productividad", "guardar tabulador perc", "guardar mi perc"],
    available: (c) => c.hasService && c.hasPerc,
  },
  {
    id: "save_seps",
    label: "Guardar SEPS",
    reply: "Puedo guardar su captura de SEPS. Revise los datos y confirme con el botón.",
    keywords: ["guardar seps", "enviar seps", "guardar estadistica", "guardar mi seps"],
    available: (c) => c.hasSeps,
  },
  {
    id: "save_horas",
    label: "Guardar Horas",
    reply: "Puedo guardar su Distribución de Horas. Revise los datos y confirme con el botón.",
    keywords: ["guardar horas", "enviar horas", "guardar distribucion", "guardar dis horas", "guardar mis horas"],
    available: (c) => c.hasService && c.hasHoras,
  },
];

// --- Configuracion de la vista por chat (se aplican en el cliente por "cfg_"). ---
const CFG_DEFS: ActionDef[] = [
  { id: "cfg_theme_dark", label: "Activar modo oscuro", reply: "Le activo el modo oscuro. Toque el botón.", keywords: ["modo oscuro", "tema oscuro", "poner oscuro", "ponme oscuro", "quiero oscuro", "modo noche", "oscuro"], available: () => true },
  { id: "cfg_theme_light", label: "Activar modo claro", reply: "Le activo el modo claro. Toque el botón.", keywords: ["modo claro", "tema claro", "poner claro", "ponme claro", "quiero claro", "modo dia", "claro"], available: () => true },
  { id: "cfg_accent_dorado", label: "Color de acento dorado", reply: "Le pongo el acento dorado. Toque el botón.", keywords: ["acento dorado", "color dorado", "color amarillo", "dorado"], available: () => true },
  { id: "cfg_accent_azul", label: "Color de acento azul", reply: "Le pongo el acento azul. Toque el botón.", keywords: ["acento azul", "color de acento azul", "color azul"], available: () => true },
  { id: "cfg_accent_verde", label: "Color de acento verde", reply: "Le pongo el acento verde. Toque el botón.", keywords: ["acento verde", "color de acento verde", "color verde"], available: () => true },
  { id: "cfg_accent_violeta", label: "Color de acento violeta", reply: "Le pongo el acento violeta. Toque el botón.", keywords: ["acento violeta", "color violeta", "color morado", "acento morado", "acento lila"], available: () => true },
  { id: "cfg_font_sans", label: "Tipografía Moderna", reply: "Le pongo la tipografía Moderna. Toque el botón.", keywords: ["tipografia moderna", "fuente moderna", "letra moderna", "tipografia sans"], available: () => true },
  { id: "cfg_font_serif", label: "Tipografía Clásica", reply: "Le pongo la tipografía Clásica. Toque el botón.", keywords: ["tipografia clasica", "fuente clasica", "letra clasica", "con serifa", "serif"], available: () => true },
  { id: "cfg_font_rounded", label: "Tipografía Redondeada", reply: "Le pongo la tipografía Redondeada. Toque el botón.", keywords: ["tipografia redondeada", "fuente redondeada", "letra redondeada", "redonda"], available: () => true },
  { id: "cfg_font_mono", label: "Tipografía Monoespaciada", reply: "Le pongo la tipografía Monoespaciada. Toque el botón.", keywords: ["tipografia monoespaciada", "monoespaciada", "monospace", "letra mono"], available: () => true },
  { id: "cfg_size_normal", label: "Tamaño de letra Normal", reply: "Le pongo el tamaño de letra Normal. Toque el botón.", keywords: ["letra normal", "tamano normal", "tamano de letra normal", "achicar letra", "letra chica"], available: () => true },
  { id: "cfg_size_grande", label: "Tamaño de letra Grande", reply: "Le pongo el tamaño de letra Grande. Toque el botón.", keywords: ["letra grande", "tamano grande", "agrandar letra", "letra mas grande"], available: () => true },
  { id: "cfg_size_xl", label: "Tamaño de letra Más grande", reply: "Le pongo el tamaño de letra Más grande. Toque el botón.", keywords: ["letra muy grande", "letra extra grande", "mas grande la letra", "tamano xl", "letra enorme"], available: () => true },
  { id: "cfg_bg_default", label: "Fondo Por defecto", reply: "Le pongo el fondo por defecto. Toque el botón.", keywords: ["fondo por defecto", "fondo normal", "fondo default", "quitar fondo"], available: () => true },
  { id: "cfg_bg_azul", label: "Fondo Azul noche", reply: "Le pongo el fondo Azul noche. Toque el botón.", keywords: ["fondo azul", "fondo azul noche", "azul noche"], available: () => true },
  { id: "cfg_bg_violeta", label: "Fondo Violeta", reply: "Le pongo el fondo Violeta. Toque el botón.", keywords: ["fondo violeta", "fondo morado", "fondo lila"], available: () => true },
  { id: "cfg_bg_verde", label: "Fondo Bosque", reply: "Le pongo el fondo Bosque. Toque el botón.", keywords: ["fondo verde", "fondo bosque", "bosque"], available: () => true },
  { id: "cfg_bg_grafito", label: "Fondo Grafito", reply: "Le pongo el fondo Grafito. Toque el botón.", keywords: ["fondo grafito", "fondo gris", "grafito"], available: () => true },
  { id: "cfg_widget_greeting", label: "Mostrar/ocultar saludo", reply: "Alterno el saludo de bienvenida del inicio. Toque el botón.", keywords: ["saludo de bienvenida", "mostrar saludo", "ocultar saludo", "quitar saludo", "saludo"], available: () => true },
  { id: "cfg_widget_clock", label: "Mostrar/ocultar reloj", reply: "Alterno el reloj y la fecha del inicio. Toque el botón.", keywords: ["reloj y fecha", "mostrar reloj", "ocultar reloj", "quitar reloj", "reloj", "fecha"], available: () => true },
];
ASSISTANT_ACTION_DEFS.push(...CFG_DEFS);

export const KNOWN_ACTION_IDS: AssistantActionId[] = ASSISTANT_ACTION_DEFS.map((a) => a.id);

// Normaliza texto: minusculas, sin acentos, sin espacios extra.
export function normalizeAssistantText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Busca la accion mas probable segun palabras clave. Las frases mas largas pesan
// mas (asi "guardar perc" le gana a "perc"). Devuelve null si no hay coincidencia
// o si la accion no esta disponible en el contexto actual.
export function matchAction(rawQuery: string, ctx: AssistantContext): AssistantActionMatch | null {
  const q = normalizeAssistantText(rawQuery);
  if (!q) return null;

  let best: ActionDef | null = null;
  let bestScore = 0;

  for (const action of ASSISTANT_ACTION_DEFS) {
    if (!action.available(ctx)) continue;
    let score = 0;
    for (const kw of action.keywords) {
      const nk = normalizeAssistantText(kw);
      if (!nk) continue;
      if (q.includes(nk)) score += nk.split(" ").length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }

  if (!best || bestScore < 1) return null;
  return { id: best.id, label: best.label, reply: best.reply };
}

// Charla basica (saludos, agradecimientos, despedidas): se responde offline,
// al instante, sin gastar IA. Se evalua DESPUES de las acciones (para que una
// orden concreta gane) y ANTES de la base de preguntas frecuentes.
const SMALLTALK: { keywords: string[]; reply: string }[] = [
  {
    keywords: [
      "hola",
      "holaa",
      "holis",
      "buenas",
      "buen dia",
      "buenos dias",
      "buenas tardes",
      "buenas noches",
      "hey",
      "que tal",
      "saludos",
      "que onda",
    ],
    reply:
      "¡Hola! ¿En qué le ayudo? Puede pedirme cosas como «ir a PERC», «cambiar mi contraseña», «abrir soporte» o «guardar mis horas». También puede tocar un tema de abajo.",
  },
  {
    keywords: ["gracias", "muchas gracias", "mil gracias", "se paso", "de lujo gracias"],
    reply: "¡De nada! Si necesita algo más, aquí estoy.",
  },
  {
    keywords: ["adios", "chao", "chau", "hasta luego", "nos vemos", "bye", "me voy"],
    reply: "¡Hasta luego! Cuando me necesite, toque el robot y seguimos.",
  },
  {
    keywords: ["ok", "oka", "okay", "listo", "dale", "perfecto", "entendido", "de acuerdo"],
    reply: "¡Perfecto! ¿Quiere que le ayude con algo más?",
  },
  {
    keywords: ["quien sos", "quien eres", "que sos", "que podes hacer", "que puedes hacer", "ayuda", "help", "como funciona"],
    reply:
      "Soy el asistente de PULSO. Le ayudo a moverse por el sistema y a hacer cosas: navegar (PERC, SEPS, Dis/horas), cambiar su contraseña, cambiar el modo claro/oscuro, abrir soporte, solicitar habilitación o guardar su captura. Escríbame qué necesita y le dejo el botón listo.",
  },
];

export function matchSmalltalk(rawQuery: string): string | null {
  const q = normalizeAssistantText(rawQuery);
  if (!q) return null;
  const qWords = q.split(" ");
  for (const item of SMALLTALK) {
    for (const kw of item.keywords) {
      const nk = normalizeAssistantText(kw);
      if (!nk) continue;
      if (nk.includes(" ")) {
        if (q.includes(nk)) return item.reply;
      } else if (qWords.includes(nk)) {
        return item.reply;
      }
    }
  }
  return null;
}

// Lista de acciones disponibles (id + etiqueta) para pasarle al respaldo de IA.
export function getAvailableActions(ctx: AssistantContext): { id: AssistantActionId; label: string }[] {
  return ASSISTANT_ACTION_DEFS.filter((a) => a.available(ctx)).map((a) => ({ id: a.id, label: a.label }));
}

export function getActionLabel(id: AssistantActionId): string {
  return ASSISTANT_ACTION_DEFS.find((a) => a.id === id)?.label ?? "";
}

export function getActionReply(id: AssistantActionId): string {
  return ASSISTANT_ACTION_DEFS.find((a) => a.id === id)?.reply ?? "";
}
