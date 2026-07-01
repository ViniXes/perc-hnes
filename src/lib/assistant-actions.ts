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
  | "save_horas";

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
    label: "Cambiar modo claro/oscuro",
    reply: "Puedo cambiar entre modo claro y oscuro. Toque el botón para alternarlo.",
    keywords: ["modo claro", "modo oscuro", "tema oscuro", "tema claro", "cambiar tema", "modo noche", "modo dia", "modo oscuro claro"],
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
