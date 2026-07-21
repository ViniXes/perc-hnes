"use client";

import { ChangeEvent, CSSProperties, Fragment, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Auth,
  type AuthError,
  type User,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, createSecondaryAuth, firestoreDatabaseId } from "@/lib/firebase";
import { db, shutdownFirestore } from "@/lib/firestore";
import {
  CONSOLIDADO_ROW_ORDER,
  SERVICE_COUNT,
  SERVICE_DEFINITIONS,
  TABULATOR_HEADERS,
  isFixedRow,
  getFixedValuesForRow,
  type ServiceDefinition,
} from "@/lib/tabulator-template";
import {
  MODULE_BY_ID,
  MODULE_CAPTURE_DAYS,
  MODULE_DEFINITIONS,
  MODULE_ORDER,
  getAreaById,
  getAreaModules,
  type ModuleDefinition,
  type ModuleId,
} from "@/lib/modules";
import {
  getDayColumns,
  getSepsRows,
  getSepsTemplate,
  SEPS_LAB_PROC_COLS,
  SEPS_LAB_RESULT_COLS,
  type SepsRow,
  type SepsTable,
  type SepsTemplate,
} from "@/lib/seps-templates";
import { downloadSepsTemplate } from "@/lib/seps-download";
import { getHorasTemplate, type HorasTemplate } from "@/lib/horas-templates";
import { INSUMOS_ALMACEN_TEMPLATE, INSUMOS_CONSOLIDADO_ORDER, type InsumoRow } from "@/lib/insumos-almacen";
import {
  matchAction,
  matchSmalltalk,
  getAvailableActions,
  getActionLabel,
  KNOWN_ACTION_IDS,
  type AssistantActionId,
  type AssistantContext,
} from "@/lib/assistant-actions";

type UserRole = "service" | "admin" | "supervisor";
type TableValues = Record<string, Record<string, string>>;
type ServicePermissions = {
  canEdit: boolean;
  canManageUsers: boolean;
  // Supervisores: pueden reabrir/cerrar (habilitar/deshabilitar) tableros de captura.
  canToggleCapture: boolean;
};
type ManagedUser = {
  uid: string;
  serviceId: string | null;
  serviceName: string | null;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  name: string;
  dui: string;
  phone: string;
  role: UserRole;
  permissions: ServicePermissions;
  // Modulos que un supervisor puede habilitar/deshabilitar (vacio para otros roles).
  supervisorModules: ModuleId[];
  mustChangePassword: boolean;
  isActive: boolean;
};
type AdminDraft = {
  serviceId: string;
  role: UserRole;
  canEdit: boolean;
  canManageUsers: boolean;
  mustChangePassword: boolean;
  isActive: boolean;
  email: string;
  username: string;
  name: string;
};
type AdminCreateForm = {
  firstName: string;
  lastName: string;
  email: string;
  dui: string;
  phone: string;
  serviceId: string;
};

type AdminOverviewEntry = {
  service: ServiceDefinition;
  values: TableValues;
  hasSavedData: boolean;
};

// Override manual de un tablero por (periodo, servicio, modulo). "open" = reabierto
// para captura tardia; "closed" = cerrado aunque la ventana siga abierta. Sin entrada
// = manda la ventana natural de dias habiles.
type CaptureOverrideState = "open" | "closed";
// Clave: `${periodId}__${serviceId}__${moduleId}` -> estado.
type CaptureOverridesMap = Record<string, CaptureOverrideState>;

type PublicDashboardMonth = {
  periodId: string;
  label: string;
  completedServices: number;
  totalServices: number;
  isCurrentMonth: boolean;
  isOpen: boolean;
};

type ServiceGroup = {
  id: string;
  title: string;
  services: ServiceDefinition[];
};

// Estado por modulo (PERC / SEPS / Horas) de un servicio en el periodo activo.
type PublicModuleStatus = { label: string; completed: boolean };
type PublicDashboardService = ServiceDefinition & {
  completed: boolean; // PERC (para el conteo del mes)
  modules: PublicModuleStatus[];
};

type PublicDashboardGroup = {
  id: string;
  title: string;
  services: PublicDashboardService[];
};

// Credenciales: se leen de variables de entorno (NEXT_PUBLIC_*) con un valor por
// defecto para que el login funcione aunque no esten configuradas en Vercel.
// SEGURIDAD: al ser app cliente quedan en el bundle; la proteccion real es ROTAR
// las claves (sobreescribiendolas con las env en Vercel) y poner el repo PRIVADO.
const DEFAULT_TEMP_PASSWORD = process.env.NEXT_PUBLIC_DEFAULT_TEMP_PASSWORD || "PERC2026!";
const ADMIN_USERNAME = process.env.NEXT_PUBLIC_ADMIN_USERNAME || "Hcardoza";
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "Cardoza1986";
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "hcardoza.admin@perc-hnes.app";

// Cuentas de supervisor fijas en codigo (mismo modelo que el admin). Su unica
// potestad es habilitar/deshabilitar tableros de los modulos indicados. La cuenta
// Firebase se auto-crea en el primer login con la clave temporal (la cambian luego).
type SupervisorAccount = {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  modules: ModuleId[];
  // Si es true, esta cuenta entra con permisos de administrador completo.
  admin?: boolean;
};

const SUPERVISOR_ACCOUNTS: SupervisorAccount[] = [
  {
    username: "ffuentes",
    password: DEFAULT_TEMP_PASSWORD,
    firstName: "Flor de Maria",
    lastName: "Fuentes Urbina",
    modules: ["perc", "sesps", "distribucion"],
    admin: true,
  },
  {
    username: "Amontes",
    password: DEFAULT_TEMP_PASSWORD,
    firstName: "Alfonso",
    lastName: "Montes Gutierrez",
    modules: ["perc", "sesps", "distribucion"],
    admin: true,
  },
  {
    username: "rcenteno",
    password: DEFAULT_TEMP_PASSWORD,
    firstName: "Dr. Roberto",
    lastName: "Cenento Zambrano",
    modules: ["perc", "sesps", "distribucion"],
    admin: true,
  },
  {
    username: "jcmiranda",
    password: DEFAULT_TEMP_PASSWORD,
    firstName: "Juan Carlos",
    lastName: "Miranda Marroquin",
    modules: ["sesps"],
  },
];
// --- Censo Diario de Pacientes (submenu bajo PERC; SOLO supervision) -----------
// Lo EDITA solo Alfonso Montes (usuario "amontes"); lo VEN admin y supervisores;
// ningun servicio lo ve. Se guarda por MES en Firestore (coleccion "censoDiario").
// No tiene cierre ni restriccion de dias habiles: siempre editable por el editor.
const CENSO_EDITOR_USERNAME = "amontes";
type CensoRow = { key: string; label: string };
const CENSO_BASE_ROWS: CensoRow[] = [
  { key: "uci", label: "UCI" },
  { key: "ucin", label: "UCIN" },
  { key: "cirugia", label: "CIRUGÍA" },
  { key: "medicina-interna", label: "MEDICINA INTERNA" },
  { key: "paliativos", label: "PALIATIVOS" },
  { key: "terapia-endovascular", label: "TERAPIA INTERVENCIONISTA ENDOVASCULAR" },
  { key: "bienestar-magisterial", label: "BIENESTAR MAGISTERIAL" },
  { key: "uci-ucin-bienestar", label: "UCI/UCIN BIENESTAR" },
];
// rowKey -> (dia como string -> valor como string)
type CensoValues = Record<string, Record<string, string>>;

const FIRESTORE_SETUP_MESSAGE = `Firestore no esta creado o configurado en este proyecto de Firebase. Verifica la base de datos '${firestoreDatabaseId}' para habilitar login, tablero y guardado.`;
const FIRESTORE_DISABLED_STORAGE_KEY = "perc-hnes.firestore-disabled";
const PANEL_THEME_STORAGE_KEY = "perc-hnes.panel-theme";
const ADMIN_USERS_CACHE_STORAGE_KEY = "perc-hnes.admin-users-cache";

// --- Preferencias de personalizacion (menu Configuracion), guardadas en el navegador. ---
const UI_PREFS_STORAGE_KEY = "perc-hnes.ui-prefs";
type UiPrefs = {
  font: string;
  fontSize: string;
  accent: string;
  background: string;
  showClock: boolean;
  showGreeting: boolean;
};
const DEFAULT_UI_PREFS: UiPrefs = {
  font: "sans",
  fontSize: "normal",
  accent: "dorado",
  background: "default",
  showClock: true,
  showGreeting: false,
};
const FONT_OPTIONS: { id: string; label: string; stack: string }[] = [
  { id: "sans", label: "Moderna", stack: "var(--font-sans), system-ui, sans-serif" },
  { id: "serif", label: "Clásica", stack: 'Georgia, "Times New Roman", serif' },
  { id: "rounded", label: "Redondeada", stack: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { id: "mono", label: "Monoespaciada", stack: 'ui-monospace, "Courier New", monospace' },
];
const FONT_SIZE_OPTIONS: { id: string; label: string; px: number }[] = [
  { id: "normal", label: "Normal", px: 16 },
  { id: "grande", label: "Grande", px: 17.5 },
  { id: "xl", label: "Más grande", px: 19 },
];
const ACCENT_OPTIONS: { id: string; label: string; accent: string; ink: string }[] = [
  { id: "dorado", label: "Dorado", accent: "#c79a4f", ink: "#17140c" },
  { id: "azul", label: "Azul", accent: "#3b82f6", ink: "#ffffff" },
  { id: "verde", label: "Verde", accent: "#10b981", ink: "#053226" },
  { id: "violeta", label: "Violeta", accent: "#8b5cf6", ink: "#ffffff" },
];
const BACKGROUND_OPTIONS: { id: string; label: string; css: string | null }[] = [
  { id: "default", label: "Por defecto", css: null },
  { id: "azul", label: "Azul noche", css: "linear-gradient(160deg, #0b1220, #12233f)" },
  { id: "violeta", label: "Violeta", css: "linear-gradient(160deg, #140f24, #271845)" },
  { id: "verde", label: "Bosque", css: "linear-gradient(160deg, #0c1a14, #122a1f)" },
  { id: "grafito", label: "Grafito", css: "linear-gradient(160deg, #0e1013, #1b1f25)" },
];
// Preguntas frecuentes del asistente virtual (robot).
// Categorias del asistente (para navegar los temas por pestañas).
const ASSISTANT_CATEGORIES = ["Captura", "Plazos", "Cuenta", "Vista", "Sistema"] as const;
type AssistantCategory = (typeof ASSISTANT_CATEGORIES)[number];

// Base de conocimiento del asistente. `kw` son palabras clave extra (sinonimos)
// para mejorar la coincidencia con lo que escribe el usuario.
const ASSISTANT_FAQS: { q: string; a: string; cat: AssistantCategory; kw?: string[] }[] = [
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
function normalizeAssistant(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bclave\b/g, "contraseña")
    .replace(/\bborrar\b/g, "quitar")
    .replace(/\beliminar\b/g, "quitar");
}

// Busca la mejor respuesta segun palabras clave de la pregunta del usuario.
function answerAssistant(query: string): { text: string; found: boolean } {
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

// Divisor de seccion (solo escritorio): marca el inicio de cada tabulador en la
// pagina principal con un color propio, para que al hacer scroll se perciba el
// cambio de PERC -> SEPS -> Horas y no se sienta un solo tabulador continuo.
function renderSectionDivider(
  label: string,
  subtitle: string,
  tone: "cyan" | "violet" | "amber" | "teal" | "indigo",
  light: boolean,
): ReactNode {
  // Fondo neutro para los tres; solo el TEXTO lleva color por modulo.
  const textTone = light
    ? { cyan: "text-cyan-700", violet: "text-blue-700", amber: "text-amber-700", teal: "text-teal-700", indigo: "text-indigo-700" }
    : { cyan: "text-cyan-300", violet: "text-blue-300", amber: "text-amber-300", teal: "text-teal-300", indigo: "text-indigo-300" };
  const pill = light ? "bg-white ring-slate-200 shadow-sm" : "bg-white/5 ring-white/10";
  const lineClass = light ? "via-slate-300" : "via-slate-400/50";
  return (
    <div className="hidden items-center gap-3 pt-8 xl:flex" aria-hidden="true">
      <span className={`h-px flex-1 bg-gradient-to-r from-transparent ${lineClass} to-transparent`} />
      <span className={`flex w-56 flex-col items-center rounded-2xl px-6 py-2 text-center ring-1 ${pill}`}>
        <span className={`text-sm font-bold uppercase tracking-[0.24em] ${textTone[tone]}`}>{label}</span>
        <span className={`text-[11px] font-medium normal-case tracking-normal ${light ? "text-slate-500" : "text-slate-400"}`}>
          {subtitle}
        </span>
      </span>
      <span className={`h-px flex-1 bg-gradient-to-l from-transparent ${lineClass} to-transparent`} />
    </div>
  );
}

function getFontStack(id: string) {
  return (FONT_OPTIONS.find((f) => f.id === id) || FONT_OPTIONS[0]).stack;
}
function getAccentOption(id: string) {
  return ACCENT_OPTIONS.find((a) => a.id === id) || ACCENT_OPTIONS[0];
}
function getBackgroundCss(id: string) {
  return (BACKGROUND_OPTIONS.find((b) => b.id === id) || BACKGROUND_OPTIONS[0]).css;
}

const SERVICE_GROUP_LABELS: Record<string, string> = {
  direccion: "Direccion",
  apoyo: "Division de Apoyo",
  medica: "Division Medica",
  enfermeria: "Division de Enfermeria",
  administrativa: "Subdireccion Administrativa",
};

// Terminos extra de busqueda por servicio (p.ej. siglas), en minusculas. Permiten
// encontrar un servicio por su acronimo aunque el nombre visible sea el completo.
const SERVICE_SEARCH_ALIASES: Record<string, string[]> = {
  udp: ["udp"],
  ucp: ["ucp"],
  "gestion-documental": ["ugd", "ugda"],
};

const SERVICE_GROUP_BY_ID: Record<string, keyof typeof SERVICE_GROUP_LABELS> = {
  // --- DIRECCION (unidades staff + almacen medicamentos/farmacia/asesores) ---
  direccion: "direccion",
  esdomed: "direccion",
  "almacen-medicamentos": "direccion",
  "asesores-de-medicamentos": "direccion",
  "servicio-farmaceutico": "direccion",
  "docencia-e-investigacion": "direccion",
  planificacion: "direccion",
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
  anestesiologia: "medica",
  "medicina-critica": "medica",
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

const SERVICE_USERNAME_BY_ID: Record<string, string> = {
  direccion: "dep.direccion",
  vacunacion: "dep.vacunacion",
  "laboratorio-clinico": "dep.laboratorio",
  "biologia-molecular": "dep.biologiamolecular",
  radiologia: "dep.radiologia",
  "estudios-gastroclinicos": "dep.gastro",
  "terapia-fisica": "dep.fisioterapia",
  "terapia-respiratoria": "dep.terapiaresp",
  "banco-de-sangre": "dep.bancosangre",
  "unidad-de-hemodinamia": "dep.hemodinamia",
  hemodialisis: "dep.uci.extracorporea",
  "hemodialisis-medicina-interna": "dep.mi.extracorporea",
  "servicio-farmaceutico": "dep.farmacia",
  "rehablitacion-psicosocial": "dep.psicosocial",
  "alimentacion-y-dieta": "dep.alimentacion",
  "central-de-esterilizacion": "dep.esterilizacion",
  enfermeria: "dep.enfermeria",
  "saneamiento-ambiental": "dep.saneamiento",
  aseo: "dep.aseo",
  almacen: "dep.abastecimiento",
  "asesores-de-medicamentos": "dep.almacen",
  "almacen-medicamentos": "dep.almacen.med",
  lavanderia: "dep.lavanderia",
  "transporte-general": "dep.transporte",
  mantenimiento: "dep.mantenimiento",
  rrhh: "dep.rrhh",
  "servicios-varios": "dep.serviciosvarios",
  tecnologia: "dep.tecnologia",
  ucp: "dep.ucp",
  "gestion-documental": "dep.gestiondocumental",
  "trabajo-social": "dep.trabajosocial",
  "docencia-e-investigacion": "dep.docencia",
  "maxima-emergencia": "dep.emergencia",
  "centro-quirurgico": "dep.centroquirurgico",
  "clinica-de-empleados": "dep.clinicaempleados",
  "cuidados-paliativos": "dep.paliativos",
  "medicina-preventiva": "dep.medpreventiva",
  "medicina-interna": "dep.medinterna",
  anestesiologia: "dep.anestesiologia",
  "medicina-critica": "dep.medcritica",
};


// --- Iconos SVG por servicio (reemplazan a los emojis) -----------------------
// Trazos tipo "lucide": stroke currentColor, hereda el color del texto.
const SERVICE_ICON_PATHS: Record<string, ReactNode> = {
  syringe: (
    <>
      <path d="m18 2 4 4" /><path d="m17 7 3-3" />
      <path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" />
      <path d="m9 11 4 4" /><path d="m5 19-3 3" /><path d="m14 4 6 6" />
    </>
  ),
  flask: (
    <>
      <path d="M14.5 2v17.5a2.5 2.5 0 0 1-5 0V2" /><path d="M8.5 2h7" /><path d="M14.5 16h-5" />
    </>
  ),
  scan: (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </>
  ),
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  wind: (
    <>
      <path d="M12.8 19.6A2 2 0 1 0 14 16H2" /><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
      <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
    </>
  ),
  droplet: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  heart: (
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  ),
  pill: (
    <>
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </>
  ),
  face: (
    <>
      <circle cx="12" cy="12" r="9" /><path d="M9 10h.01" /><path d="M15 10h.01" />
      <path d="M9 15c1 1 2 1 3 1s2 0 3-1" />
    </>
  ),
  utensils: (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2" /><path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </>
  ),
  recycle: (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" />
    </>
  ),
  leaf: (
    <>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
    </>
  ),
  sparkles: (
    <path d="m12 3-1.9 5.8-5.8 1.9 5.8 1.9L12 18l1.9-5.8 5.8-1.9-5.8-1.9z" />
  ),
  package: (
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
    </>
  ),
  shirt: (
    <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
  ),
  truck: (
    <>
      <path d="M10 17h4V5H2v12h3" />
      <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1" />
      <circle cx="7.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  book: (
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  ),
  cross: (
    <path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z" />
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88" /><path d="M14.47 14.48 20 20" /><path d="M8.12 8.12 12 12" />
    </>
  ),
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01" />
      <path d="M10 21v-3a2 2 0 0 1 4 0v3" />
    </>
  ),
};

const SERVICE_ICON_BY_ID: Record<string, keyof typeof SERVICE_ICON_PATHS> = {
  vacunacion: "syringe",
  "laboratorio-clinico": "flask",
  radiologia: "scan",
  "estudios-gastroclinicos": "search",
  "terapia-fisica": "activity",
  "terapia-respiratoria": "wind",
  "banco-de-sangre": "droplet",
  "unidad-de-hemodinamia": "heart",
  hemodialisis: "droplet",
  "hemodialisis-medicina-interna": "droplet",
  "servicio-farmaceutico": "pill",
  "rehablitacion-psicosocial": "face",
  "alimentacion-y-dieta": "utensils",
  "central-de-esterilizacion": "recycle",
  "saneamiento-ambiental": "leaf",
  aseo: "sparkles",
  almacen: "package",
  "almacen-medicamentos": "pill",
  lavanderia: "shirt",
  "transporte-general": "truck",
  mantenimiento: "wrench",
  "trabajo-social": "users",
  "docencia-e-investigacion": "book",
  "maxima-emergencia": "cross",
  "centro-quirurgico": "scissors",
  "clinica-de-empleados": "activity",
  "asesores-de-medicamentos": "clipboard",
  esdomed: "clipboard",
};

function ServiceIcon({
  serviceId,
  className = "h-4 w-4",
}: {
  serviceId: string | null | undefined;
  className?: string;
}) {
  const key = (serviceId && SERVICE_ICON_BY_ID[serviceId]) || "building";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {SERVICE_ICON_PATHS[key]}
    </svg>
  );
}

// Logo de PULSO (solo la marca, sin texto): badge en degradado con linea de pulso.
function PulsoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pulsoMarkGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pulsoMarkGrad)" />
      <path
        d="M7 25 H16 L19.5 15 L25 35 L29 25 H41"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Modal breve "Iniciando sesion" con barrita de pulso (mismo estilo que el modal
// de actualizacion). Se muestra ~2 segundos tras un login exitoso.
function LoginLoadingModal({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Iniciando sesion"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
    >
      <div className="modal-fade-in absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
      <div className="modal-pop-in relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#0e1626] shadow-2xl shadow-black/60">
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
        <div className="px-6 pb-7 pt-7 text-center">
          {/* Logo PULSO con latido */}
          <span className="relative mx-auto flex h-16 w-16 items-center justify-center">
            <span
              aria-hidden
              className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 opacity-50 blur-lg"
            />
            <svg viewBox="0 0 48 48" className="heartbeat relative h-16 w-16 drop-shadow-lg" aria-hidden="true">
              <defs>
                <linearGradient id="pulsoGradLogin2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#22d3ee" />
                  <stop offset="1" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pulsoGradLogin2)" />
              <path
                d="M7 25 H16 L19.5 15 L25 35 L29 25 H41"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-300/80">
            PULSO
          </p>
          <p className="mt-1 text-[13px] font-medium leading-snug text-slate-300">
            Plataforma Única de Logística y Servicios Operativos
          </p>
          <h3 className="mt-3 text-lg font-semibold text-white">Iniciando sesión…</h3>
          <p className="mt-1 text-sm text-slate-400">Preparando tu panel, un momento.</p>

          {/* Monitor cardiaco: la linea de pulso se dibuja en bucle. */}
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
            <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="h-12 w-full" aria-hidden="true">
              <path
                className="ekg-track"
                d="M0 30 H58 L66 30 L74 12 L84 48 L94 16 L102 30 H138 L146 30 L153 22 L161 40 L169 30 H200"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                className="ekg-pulse"
                pathLength={100}
                d="M0 30 H58 L66 30 L74 12 L84 48 L94 16 L102 30 H138 L146 30 L153 22 L161 40 L169 30 H200"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// Iconos del menu lateral (SVG inline, sin dependencias). Heredan el color del
// texto via `currentColor`, asi funcionan igual en modo claro y oscuro y en el
// estado activo. Tamano fijo 18px para encajar en el badge de 32px.
const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconHome = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </svg>
);

const IconClock = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

const IconGear = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
  </svg>
);

const IconFile = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M6 2.5h7l5 5V21a.5.5 0 0 1-.5.5H6A.5.5 0 0 1 5.5 21V3A.5.5 0 0 1 6 2.5Z" />
    <path d="M13 2.5V8h5" />
    <path d="M8.5 13h7M8.5 16.5h7" />
  </svg>
);

const IconUsers = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16 14.6c2.4.2 4.5 2 4.5 4.9" />
  </svg>
);

const IconLogout = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M14 4.5H6.5A.5.5 0 0 0 6 5v14a.5.5 0 0 0 .5.5H14" />
    <path d="M10.5 12h10" />
    <path d="m17.5 8.5 3.5 3.5-3.5 3.5" />
  </svg>
);

const IconKey = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="8" cy="8" r="4.2" />
    <path d="M11 11 19.5 19.5" />
    <path d="M16.5 16.5 18.5 14.5M18.5 18.5 20.5 16.5" />
  </svg>
);

const IconMoon = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </svg>
);

// Headset tipo call center (Centro de Soporte).
const IconHeadset = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
    <path d="M4 14.5a2 2 0 0 1 2-2h1v5H6a2 2 0 0 1-2-2v-1Z" />
    <path d="M20 14.5a2 2 0 0 0-2-2h-1v5h1a2 2 0 0 0 2-2v-1Z" />
    <path d="M20 17v1.5a2.5 2.5 0 0 1-2.5 2.5H13" />
  </svg>
);

// Iconos de categoria del Centro de Soporte.
const IconSupportBug = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <rect x="8" y="8" width="8" height="10" rx="4" />
    <path d="M12 5v3M9 9 7 7M15 9l2-2M5 12H3M21 12h-2M6 17l-2 1.5M18 17l2 1.5M8.5 13H4M20 13h-4.5" />
  </svg>
);
const IconSupportQuestion = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.5v.4" />
    <path d="M12 17h.01" />
  </svg>
);
const IconSupportIdea = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.2 1.3 2.2h4.6c.2-1 .7-1.7 1.3-2.2A6 6 0 0 0 12 3Z" />
  </svg>
);

const IconSun = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M18.9 5.1l-1.8 1.8M6.9 17.1l-1.8 1.8" />
  </svg>
);

const IconDashboard = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="3.5" width="7" height="4.5" rx="1" />
    <rect x="13.5" y="11" width="7" height="9.5" rx="1" />
    <rect x="3.5" y="13" width="7" height="7.5" rx="1" />
  </svg>
);

const IconMessage = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M4 5.5h16a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H9l-4 3.5V16H4a.5.5 0 0 1-.5-.5V6a.5.5 0 0 1 .5-.5Z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </svg>
);

const IconDollar = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M12 2.5v19" />
    <path d="M16.5 6.7C16 5.2 14.2 4.3 12 4.3S8 5.4 8 7.1c0 1.7 1.9 2.4 4 2.9s4 1.2 4 2.9c0 1.7-1.8 2.8-4 2.8s-4-.9-4.5-2.4" />
  </svg>
);

const IconChart = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 20v-6M12.5 20V8M17 20v-9" />
  </svg>
);

const IconWrench = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M15.6 6.4a3.8 3.8 0 0 0-4.7 4.9l-6.1 6.1a1.4 1.4 0 0 0 0 2l.8.8a1.4 1.4 0 0 0 2 0l6.1-6.1a3.8 3.8 0 0 0 4.9-4.7l-2.3 2.3-2.4-.6-.6-2.4 2.3-2.3Z" />
  </svg>
);

const IconCalendar = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
    <path d="M3.5 9.5h17M8 3v3M16 3v3" />
    <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
  </svg>
);

// Icono por id de item del sidebar. Lo que no esta aqui conserva su badge de letras
// (PERC -> PE, SEPS -> SE, etc., segun pidio el usuario).
const SIDEBAR_ICON_BY_ID: Record<string, ReactNode> = {
  "panel-overview": IconHome,
  "panel-tabulator": IconDollar,
  "panel-module-perc": IconDollar,
  "panel-seps": IconChart,
  "panel-module-sesps": IconChart,
  "panel-module-distribucion": IconClock,
  "panel-horas": IconClock,
  "panel-calendar": IconCalendar,
  "panel-admin-export": IconFile,
  "panel-users": IconUsers,
  "panel-capture-toggle": IconKey,
  "panel-avance": IconDashboard,
  "panel-requests": IconMessage,
  "panel-request-form": IconMessage,
  "panel-docs": IconFile,
  "panel-config": IconWrench,
  "panel-signups": IconMessage,
  "panel-services": IconDashboard,
};

// Color del recuadro del icono de cada submenu bajo PERC (distinto por item, para
// que no se vean iguales — se aprecia sobre todo en movil).
const SUBMENU_ICON_TINT: Record<string, string> = {
  perc: "bg-emerald-500/15 text-emerald-300",
  monitor: "bg-cyan-500/15 text-cyan-300",
  censo: "bg-teal-500/15 text-teal-300",
  insumos: "bg-indigo-500/15 text-indigo-300",
  consolidado: "bg-sky-500/15 text-sky-300",
  servicios: "bg-sky-500/15 text-sky-300",
  seps: "bg-blue-500/15 text-blue-300",
  horas: "bg-amber-500/15 text-amber-300",
};

// Icono propio de cada submenu bajo PERC (Abrir PERC / Monitoreo / Censo / Insumos).
function renderSubmenuIcon(icon: string | undefined): ReactNode {
  const common = {
    viewBox: "0 0 24 24",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (icon === "perc") {
    return (
      <svg {...common}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (icon === "monitor") {
    return (
      <svg {...common}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    );
  }
  if (icon === "insumos") {
    return (
      <svg {...common}>
        <path d="M21 8V5a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 5v3" />
        <path d="M3 8v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8M3 8h18M12 3v18" />
      </svg>
    );
  }
  if (icon === "consolidado") {
    return (
      <svg {...common}>
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
        <path d="M12 12v5m0 0-2-2m2 2 2-2" />
      </svg>
    );
  }
  if (icon === "servicios") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (icon === "seps") {
    return (
      <svg {...common}>
        <path d="M3 3v18h18" />
        <path d="m7 14 3-3 3 3 4-5" />
      </svg>
    );
  }
  if (icon === "horas") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  // Censo (por defecto): grafico de barras.
  return (
    <svg {...common}>
      <path d="M3 3v18h18" />
      <rect x="7" y="9" width="3" height="9" />
      <rect x="12" y="5" width="3" height="13" />
      <rect x="17" y="12" width="3" height="6" />
    </svg>
  );
}

// Degradado bonito por icono (estilo launcher de app) para el menu en movil.
// Cada modulo tiene su color propio. En PC los iconos van neutros (ver clases xl:).
const SIDEBAR_TILE_GRADIENT: Record<string, string> = {
  "panel-overview": "from-sky-400 to-blue-600",
  "panel-tabulator": "from-emerald-400 to-teal-600",
  "panel-module-perc": "from-emerald-400 to-teal-600",
  "panel-seps": "from-blue-500 to-blue-600",
  "panel-module-sesps": "from-blue-500 to-blue-600",
  "panel-horas": "from-amber-400 to-orange-600",
  "panel-module-distribucion": "from-amber-400 to-orange-600",
  "panel-docs": "from-blue-400 to-indigo-600",
  "panel-config": "from-slate-400 to-slate-600",
  "panel-calendar": "from-rose-400 to-pink-600",
  "panel-admin-export": "from-teal-400 to-cyan-600",
  "panel-users": "from-indigo-400 to-purple-600",
  "panel-capture-toggle": "from-lime-400 to-green-600",
  "panel-requests": "from-blue-400 to-pink-600",
  "panel-request-form": "from-cyan-400 to-sky-600",
  "panel-signups": "from-teal-400 to-emerald-600",
  "panel-services": "from-sky-400 to-cyan-600",
};

// Productos (centros de costo) que CADA servicio NO puede digitar en PERC, ademas
// de su propia columna (que se bloquea automaticamente). La clave es el id del
// servicio y el valor una lista de CODIGOS de centro de costo (ej. "268", "575").
// Se ira completando segun lo indique el usuario.
const PERC_BLOCKED_BY_SERVICE: Record<string, string[]> = {
  // "banco-de-sangre": ["268"],  // ejemplo: bloquear Hemodialisis para Banco de Sangre
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-HN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Fecha y hora por separado para la tarjeta del encabezado.
const HEADER_DATE_FORMATTER = new Intl.DateTimeFormat("es-HN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const HEADER_TIME_FORMATTER = new Intl.DateTimeFormat("es-HN", {
  hour: "2-digit",
  minute: "2-digit",
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("es-HN", {
  day: "numeric",
  month: "short",
});

const PERIOD_FORMATTER = new Intl.DateTimeFormat("es-HN", {
  month: "long",
  year: "numeric",
});

function getAuthErrorMessage(error: unknown) {
  const customMessage = error instanceof Error ? error.message : "";

  switch (customMessage) {
    case "service-required":
      return "Selecciona el servicio antes de registrar la cuenta.";
    case "service-already-assigned":
      return "Ese servicio ya tiene un usuario asignado.";
    case "service-already-assigned-admin":
      return "Ese servicio ya esta asignado a otro usuario.";
    case "change-password-mismatch":
      return "La nueva contrasena y su confirmacion no coinciden.";
    case "change-password-length":
      return "La nueva contrasena debe tener al menos 6 caracteres.";
    case "admin-access-failed":
      return "No pudimos habilitar el acceso del administrador en Firebase Auth.";
    case "firestore-setup-required":
      return FIRESTORE_SETUP_MESSAGE;
    default:
      break;
  }

  const code = (error as AuthError).code;

  switch (code) {
    case "auth/invalid-email":
      return "Revisa el correo. No parece tener un formato valido.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Correo o contrasena incorrectos.";
    case "auth/email-already-in-use":
      return "Ese correo ya tiene una cuenta.";
    case "auth/weak-password":
      return "Usa una contrasena de al menos 6 caracteres.";
    case "auth/requires-recent-login":
      return "Por seguridad, vuelve a iniciar sesion antes de cambiar la contrasena.";
    case "auth/configuration-not-found":
      return "Firebase Auth no esta habilitado para este proyecto.";
    default:
      return "No pudimos completar la accion. Intentalo de nuevo.";
  }
}

function isFirestoreSetupError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  return (
    message.includes(`database '${firestoreDatabaseId}' not found`.toLowerCase()) ||
    message.includes("database '(default)' not found") ||
    // Mensaje real de la API cuando la base Firestore NO existe en el proyecto:
    // "The database (default) does not exist for project ...".
    message.includes("does not exist for project") ||
    (message.includes("the database") && message.includes("does not exist")) ||
    message.includes("firestore/failed-precondition") ||
    message.includes("firestore-setup-required")
  );
}

function getDefaultPermissions(role: UserRole): ServicePermissions {
  return {
    // Los supervisores NO capturan datos: solo habilitan/deshabilitan tableros.
    canEdit: role !== "supervisor",
    canManageUsers: role === "admin",
    canToggleCapture: role === "admin" || role === "supervisor",
  };
}

function findSupervisorAccountByUsername(username: string) {
  const normalizedUsername = normalizeKey(username);

  return (
    SUPERVISOR_ACCOUNTS.find(
      (account) => normalizeKey(account.username) === normalizedUsername,
    ) || null
  );
}

function getSupervisorLoginEmail(username: string) {
  return `${username.toLowerCase()}@${SERVICE_LOGIN_DOMAIN}`;
}

function findSupervisorAccountByLoginEmail(email: string | null | undefined) {
  if (!email) {
    return null;
  }

  const normalizedEmail = email.toLowerCase();

  return (
    SUPERVISOR_ACCOUNTS.find(
      (account) => getSupervisorLoginEmail(account.username) === normalizedEmail,
    ) || null
  );
}

// Clave estable para un override de tablero (periodo + servicio + modulo).
function getCaptureOverrideId(periodId: string, serviceId: string, moduleId: ModuleId) {
  return `${periodId}__${serviceId}__${moduleId}`;
}

// Solicitud de un servicio para que le habiliten un tablero fuera de plazo.
type CaptureRequest = {
  id: string;
  periodId: string;
  periodLabel: string;
  serviceId: string;
  serviceName: string;
  moduleId: ModuleId;
  requestedByName: string;
  requestedByUid: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  resolvedByName?: string;
};

// Ticket del Centro de Soporte: reporte de error/duda/sugerencia que llega a la
// bandeja de supervisores y admin.
type SupportTicket = {
  id: string;
  category: "error" | "duda" | "sugerencia";
  urgency: "baja" | "media" | "alta";
  message: string;
  reporterName: string;
  reporterUid: string;
  reporterRole: string;
  serviceId: string;
  serviceName: string;
  screen: string;
  appVersion: string;
  status: "pendiente" | "en_revision" | "resuelto";
  resolvedByName?: string;
  createdAtMs?: number;
};

// Solicitud de REGISTRO de un jefe de servicio (creacion de usuario, aprobada por admin).
type SignupRequest = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  serviceId: string;
  serviceName: string;
  status: "pending" | "approved" | "rejected";
  createdUsername?: string;
};

function getModuleLabel(moduleId: ModuleId) {
  return moduleId === "perc" ? "PERC" : moduleId === "sesps" ? "SEPS" : "Distribución de Horas";
}

// Estado efectivo de captura: el override manual manda sobre la ventana natural.
function effectiveCaptureOpen(
  naturalIsOpen: boolean,
  override: CaptureOverrideState | undefined,
) {
  if (override === "open") {
    return true;
  }

  if (override === "closed") {
    return false;
  }

  return naturalIsOpen;
}

function getServiceById(serviceId: string | null | undefined) {
  if (!serviceId) {
    return null;
  }

  return SERVICE_DEFINITIONS.find((service) => service.id === serviceId) || null;
}

/** Aplica los valores fijos (solo-lectura) sobre una tabla, sobreescribiendo. */
function applyFixedValues(table: TableValues) {
  for (const row of Object.keys(table)) {
    const fixed = getFixedValuesForRow(row);

    if (fixed) {
      table[row] = { ...table[row], ...fixed };
    }
  }
}

// PERC/SERV: servicios que reportan productividad con pocos numeros (no la grilla
// de centros de costo). Cada servicio define sus campos. Se guarda en la misma
// coleccion serviceTabulators (modulo "perc"), con la fila PERC_SERV_ROW.
const PERC_SERV_ROW = "perc-serv";

// =============================================================================
// Documentos (control anual de entregas a Calidad) — proceso INDEPENDIENTE de
// PERC/SEPS/Horas. Matriz: dependencias x documentos (POA, MOF, Evaluacion
// trimestral). Cada celda: "entregado" | "pendiente" | "" (en blanco). Solo el
// admin y ffuentes editan; el resto solo visualiza. Se guarda en Firestore en la
// coleccion "documentControl" (un doc por año).
// =============================================================================
const DOC_COLUMNS: { key: string; label: string }[] = [
  { key: "poa", label: "POA" },
  { key: "mof", label: "MOF" },
  { key: "evaluacion", label: "Evaluación Trimestral" },
];

// Estados posibles de cada celda y el orden de rotacion al hacer clic (editores).
type DocStatus = "" | "entregado" | "pendiente";
const DOC_STATUS_CYCLE: DocStatus[] = ["", "entregado", "pendiente"];
const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  "": "—",
  entregado: "Entregado",
  pendiente: "Pendiente de entrega",
};

const DOC_DEPENDENCIAS: string[] = [
  "Unidad Financiera Institucional",
  "Unidad de Auditoria Interna",
  "Unidad Asesora de Medicamentos e Insumos",
  "Servicio de Farmacia",
  "Unidad de Planificacion y Calidad",
  "Estadistica y Documentos Medicos",
  "Unidad Juridica",
  "Unidad de Comunicaciones",
  "Unidad de Epidemiologia",
  "Unidad de Convenios",
  "Unidad de Cumplimiento",
  "Subdireccion Medica",
  "Subdireccion Administrativa",
  "Unidad de Desarrollo Profesional",
  "Division Medica",
  "Division de Enfermeria",
  "Division de Servicios de Diagnostico y Apoyo",
  "Departamento de Medicina Preventiva",
  "Unidad de Admisiones",
  "Departamento de Medicina Interna",
  "Departamento de Cirugia",
  "Departamento de Medicina Critica",
  "Unidad de Terapia Intervencionista Endovascular",
  "Unidad de Cuidados Paliativos",
  "Central de Esterilizacion y Equipos",
  "Departamento de Nutricion",
  "Departamento de Radiologia e Imágenes",
  "Departamento de Laboratorios",
  "Servicios de Psicologia",
  "Servicio de Trabajo Social",
  "Servicio de Fisioterapia",
  "Clinica de Empleados",
  "Unidad de Compras Publicas",
  "Departamento de Servicios Varios",
  "Departamento de Recursos Humanos",
  "Departamento de Abastecimiento",
  "Departamento de Conservacion y Mantenimiento",
  "Departamento de Tecnologia y Comunicaciones",
  "Servicio de Lavanderia",
  "Unidad de Gestion Documental",
];

// Clave estable por dependencia (no cambia aunque se edite el nombre visible).
function getDocKey(index: number) {
  return `dep-${index}`;
}

// Icono SVG por tipo de servicio/dependencia (sin emojis). El primero que
// coincide gana, por eso el orden importa.
const DEP_ICON_PROPS = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function getDepIcon(name: string) {
  const n = name.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => n.includes(k));

  // Farmacia / medicamentos / insumos
  if (has("farmacia", "medicament", "insumo")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <path d="M12 8.5v7M8.5 12h7" />
      </svg>
    );
  }
  // Laboratorio
  if (has("laborator")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M9 3h6M10 3v6L5.6 18.4A1.8 1.8 0 0 0 7.2 21h9.6a1.8 1.8 0 0 0 1.6-2.6L14 9V3" />
        <path d="M8 15h8" />
      </svg>
    );
  }
  // Radiología / imágenes
  if (has("radiolog", "imagen", "imágen")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
        <path d="M6.5 11h2l1.5-3 2 6 1.5-3h3.5" />
        <path d="M9 20.5h6" />
      </svg>
    );
  }
  // Cirugía / quirúrgico / intervencionista
  if (has("cirug", "quirurg", "endovascular", "intervencionista")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <circle cx="6" cy="6.5" r="2.5" />
        <circle cx="6" cy="17.5" r="2.5" />
        <path d="M8.2 8.2 20 18M8.2 15.8 20 6" />
      </svg>
    );
  }
  // Enfermería
  if (has("enfermer")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M12 20.3 4.6 13a4.6 4.6 0 1 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13Z" />
      </svg>
    );
  }
  // Nutrición
  if (has("nutric")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10" />
        <path d="M16.5 3c-1.6 0-2.6 2-2.6 5.5 0 2 1 3.1 2.6 3.5V21" />
      </svg>
    );
  }
  // Jurídica / convenios
  if (has("jurid", "convenio")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M12 3v18M6 21h12" />
        <path d="M12 5 5 7M12 5l7 2" />
        <path d="M5 7 2.6 12.8a3 3 0 0 0 4.8 0L5 7ZM19 7l-2.4 5.8a3 3 0 0 0 4.8 0L19 7Z" />
      </svg>
    );
  }
  // Auditoría / cumplimiento
  if (has("auditor", "cumplimiento")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M12 3 5 5.5V11c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V5.5L12 3Z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  // Finanzas / compras / abastecimiento
  if (has("financ", "compras", "abastec")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 9.5v5M18 9.5v5" />
      </svg>
    );
  }
  // Comunicaciones / tecnología
  if (has("comunicacion", "tecnolog")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <rect x="3.5" y="4" width="17" height="11" rx="2" />
        <path d="M9 19h6M12 15v4" />
      </svg>
    );
  }
  // Recursos humanos / desarrollo profesional / admisiones / trabajo social
  if (has("recursos humanos", "desarrollo profesional", "admision", "trabajo social")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <circle cx="9" cy="8" r="3" />
        <path d="M3.8 19c0-2.8 2.3-4.6 5.2-4.6S14.2 16.2 14.2 19" />
        <circle cx="16.5" cy="9" r="2.3" />
        <path d="M15.5 14.4c2.3.2 4.3 1.9 4.3 4.6" />
      </svg>
    );
  }
  // Psicología
  if (has("psicolog")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M9.5 4.5A2.5 2.5 0 0 0 7 7a2.3 2.3 0 0 0-1.5 4 2.4 2.4 0 0 0 .8 4.3A2.4 2.4 0 0 0 9.5 19Z" />
        <path d="M14.5 4.5A2.5 2.5 0 0 1 17 7a2.3 2.3 0 0 1 1.5 4 2.4 2.4 0 0 1-.8 4.3A2.4 2.4 0 0 1 14.5 19Z" />
      </svg>
    );
  }
  // Fisioterapia / epidemiología / medicina preventiva
  if (has("fisioterap", "epidemiolog", "preventiva")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
      </svg>
    );
  }
  // Estadística / documentos / planificación / calidad / gestión documental
  if (has("estadistica", "documento", "planificacion", "calidad", "gestion documental")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M6 2.5h7l5 5V21a.5.5 0 0 1-.5.5H6A.5.5 0 0 1 5.5 21V3A.5.5 0 0 1 6 2.5Z" />
        <path d="M13 2.5V8h5" />
        <path d="M9 17.5v-2.5M12 17.5v-4.5M15 17.5v-1.5" />
      </svg>
    );
  }
  // Servicios médicos generales (medicina, clínica, paliativos, crítica, etc.)
  if (has("medic", "clinica", "paliativ", "critica", "interna")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M6 3.5H4.5v4A4.5 4.5 0 0 0 9 12a4.5 4.5 0 0 0 4.5-4.5v-4H12" />
        <path d="M9 12v2.5a5 5 0 0 0 5 5 4 4 0 0 0 4-4V15" />
        <circle cx="18" cy="13" r="2" />
      </svg>
    );
  }
  // Mantenimiento / conservación / esterilización / lavandería / servicios varios
  if (
    has(
      "mantenimiento",
      "conservacion",
      "esteriliz",
      "lavanderia",
      "servicios varios",
      "central",
    )
  ) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M15.5 7.5a3.5 3.5 0 0 1-4.6 4.6L5 18l1 1 5.9-5.9a3.5 3.5 0 0 0 4.6-4.6l-2 2-2-2 2-2Z" />
      </svg>
    );
  }
  // Por defecto: edificio / dependencia
  return (
    <svg {...DEP_ICON_PROPS} aria-hidden="true">
      <path d="M4.5 21V6.5a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1V21" />
      <path d="M14 10.5h4.5a1 1 0 0 1 1 1V21" />
      <path d="M3 21h18" />
      <path d="M8 9.5h2M8 13h2M8 16.5h2" />
      <path d="M11 3v2.5" />
    </svg>
  );
}

// Colores sutiles para la barrita lateral de cada grupo (cerrado = mas tenue,
// abierto = un poco mas vivo). Se recorren por indice de grupo.
const OVERRIDE_GROUP_ACCENTS: { closed: string; open: string }[] = [
  { closed: "rgba(125,179,214,0.45)", open: "rgba(125,179,214,0.95)" }, // azul cielo
  { closed: "rgba(127,184,154,0.45)", open: "rgba(127,184,154,0.95)" }, // verde salvia
  { closed: "rgba(167,139,218,0.45)", open: "rgba(167,139,218,0.95)" }, // violeta
  { closed: "rgba(214,179,112,0.45)", open: "rgba(214,179,112,0.95)" }, // dorado
  { closed: "rgba(212,154,166,0.45)", open: "rgba(212,154,166,0.95)" }, // rosa
  { closed: "rgba(120,196,188,0.45)", open: "rgba(120,196,188,0.95)" }, // teal
  { closed: "rgba(170,178,196,0.45)", open: "rgba(170,178,196,0.95)" }, // gris azulado
  { closed: "rgba(216,167,128,0.45)", open: "rgba(216,167,128,0.95)" }, // terracota
];

type DocValues = Record<string, Record<string, DocStatus>>;
const PERC_SERV_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  "maxima-emergencia": [
    { key: "atencion", label: "Atención", placeholder: "Número de atenciones" },
    { key: "procedimiento", label: "Procedimiento", placeholder: "Número de procedimientos" },
    { key: "pacientes", label: "Pacientes", placeholder: "Número de pacientes" },
  ],
  "centro-quirurgico": [
    { key: "intervenciones", label: "Intervención Quirúrgica", placeholder: "Número de intervenciones" },
    { key: "procedimientos", label: "Procedimiento", placeholder: "Número de procedimientos" },
  ],
  "clinica-de-empleados": [
    { key: "consulta", label: "Consulta", placeholder: "Número de consultas" },
    { key: "procedimiento", label: "Procedimiento", placeholder: "Número de procedimientos" },
  ],
};
function getPercServFields(serviceId: string | null | undefined) {
  return (serviceId && PERC_SERV_FIELDS[serviceId]) || null;
}

// Plantilla COMPLETA del consolidado "Produccion de Servicio" (PERC por servicios):
// Centro de Produccion | Unidades de Produccion | Cantidad. Incluye TODOS los
// centros del Excel oficial. Las unidades con `serviceId`+`key` toman su Cantidad
// del servicio que la captura en el sistema (Maxima Emergencia, Clinica de
// Empleados y Centro Quirurgico). El resto queda en blanco hasta que lleguen sus
// datos (se completaran mas adelante).
const PERC_SERV_CONSOLIDADO: {
  centro: string;
  serviceId?: string;
  // `key` -> toma el valor del PERC/SERV capturado por ese servicio.
  // `censoRow` -> toma el TOTAL mensual de esa fila del Censo Diario de Pacientes.
  units: { label: string; key?: string; censoRow?: string }[];
}[] = [
  {
    centro: "66__01101 - Hospitalizacion medicina interna",
    units: [{ label: "1__Egreso" }, { label: "2__Dco", censoRow: "medicina-interna" }, { label: "6__N. Camas" }],
  },
  {
    centro: "95__01206 - Hospitalizacion cirugia general",
    units: [{ label: "1__Egreso" }, { label: "2__Dco", censoRow: "cirugia" }, { label: "6__N. Camas" }],
  },
  {
    centro: "745__02014 - Hospitalizacion servicios por convenios",
    units: [{ label: "1__Egreso" }, { label: "2__Dco", censoRow: "bienestar-magisterial" }, { label: "6__N. Camas" }],
  },
  {
    centro: "166__05001 - Unidad de cuidados intensivos",
    units: [{ label: "1__Transferencia" }, { label: "2__Dco", censoRow: "uci" }, { label: "6__N. Camas" }],
  },
  {
    centro: "179__05101 - Unidad de cuidados intermedios",
    units: [{ label: "1__Transferencia" }, { label: "2__Dco", censoRow: "ucin" }, { label: "6__N. Camas" }],
  },
  {
    centro: "201__10001 - Emergencias",
    serviceId: "maxima-emergencia",
    units: [
      { label: "1__Atencion", key: "atencion" },
      { label: "2__Procedimiento", key: "procedimiento" },
      { label: "3__Paciente", key: "pacientes" },
    ],
  },
  {
    centro: "743__15053 - Clinica empresarial",
    serviceId: "clinica-de-empleados",
    units: [
      { label: "1__Consulta", key: "consulta" },
      { label: "2__Procedimiento", key: "procedimiento" },
    ],
  },
  {
    centro: "806__33060 - Centro quirurgico",
    serviceId: "centro-quirurgico",
    units: [
      { label: "1__Intervencion quirurgica", key: "intervenciones" },
      { label: "2__Procedimiento", key: "procedimientos" },
    ],
  },
  {
    centro: "767__5014 - Unidad de cuidados especiales",
    units: [{ label: "1__Dco", censoRow: "paliativos" }, { label: "2__Transferencia" }, { label: "6__N. Camas" }],
  },
  {
    centro: "766__70016 - Servicio de apoyo a riiss",
    units: [{ label: "1__Atencion" }],
  },
];

function buildEmptyTable(service: ServiceDefinition, extraKeys: string[] = []): TableValues {
  const servFields = getPercServFields(service.id);
  if (servFields) {
    return { [PERC_SERV_ROW]: Object.fromEntries(servFields.map((f) => [f.key, ""])) };
  }

  const table: TableValues = Object.fromEntries(
    service.rows.map((row) => [
      row,
      Object.fromEntries(TABULATOR_HEADERS.map((header) => [header, ""])),
    ]),
  );
  // Filas agregadas a mano (admin/supervisor): fila de columnas vacia por cada key.
  for (const key of extraKeys) {
    if (!table[key]) {
      table[key] = Object.fromEntries(TABULATOR_HEADERS.map((header) => [header, ""]));
    }
  }

  applyFixedValues(table);
  return table;
}

function mergeWithTemplate(
  service: ServiceDefinition,
  savedValues?: Record<string, Record<string, unknown>>,
  extraKeys: string[] = [],
) {
  const servFields = getPercServFields(service.id);
  if (servFields) {
    const template: TableValues = {
      [PERC_SERV_ROW]: Object.fromEntries(servFields.map((f) => [f.key, ""])),
    };
    if (savedValues) {
      for (const f of servFields) {
        const cellValue = savedValues[PERC_SERV_ROW]?.[f.key];
        if (cellValue !== undefined && cellValue !== null) {
          template[PERC_SERV_ROW][f.key] = String(cellValue);
        }
      }
    }
    return template;
  }

  const template = buildEmptyTable(service, extraKeys);

  if (!savedValues) {
    return template;
  }

  for (const row of [...service.rows, ...extraKeys]) {
    for (const header of TABULATOR_HEADERS) {
      const cellValue = savedValues[row]?.[header];

      if (cellValue !== undefined && cellValue !== null) {
        template[row][header] = String(cellValue);
      }
    }
  }

  // Las filas fijas siempre prevalecen, aunque haya datos guardados antiguos.
  applyFixedValues(template);
  return template;
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

// Hora de cierre diario de la captura: 2:30 PM (14:30) del ultimo dia habil de la ventana.
const CAPTURE_CLOSE_HOUR = 14;
const CAPTURE_CLOSE_MINUTE = 30;
function isBeforeDailyCutoff(date: Date) {
  return (
    date.getHours() < CAPTURE_CLOSE_HOUR ||
    (date.getHours() === CAPTURE_CLOSE_HOUR && date.getMinutes() < CAPTURE_CLOSE_MINUTE)
  );
}

function getFirstBusinessDays(referenceDate: Date, blockedDates: string[], totalDays: number) {
  const current = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1,
    12,
    0,
    0,
    0,
  );
  const result: Date[] = [];
  const blockedDateSet = new Set(blockedDates);

  while (result.length < totalDays) {
    if (isBusinessDay(current) && !blockedDateSet.has(getDateKey(current))) {
      result.push(new Date(current));
    }

    current.setDate(current.getDate() + 1);
  }

  return result;
}

function getCaptureWindow(
  referenceDate: Date,
  blockedDates: string[],
  moduleId: ModuleId = "distribucion",
) {
  const totalDays = MODULE_CAPTURE_DAYS[moduleId];
  const openDays = getFirstBusinessDays(referenceDate, blockedDates, totalDays);
  const activeDayIndex = openDays.findIndex((day) =>
    isSameCalendarDay(day, referenceDate),
  );

  // El ultimo dia habil de la ventana cierra a las 2:30 PM; los dias previos, todo el dia.
  const isLastOpenDay = activeDayIndex === openDays.length - 1;
  const isOpen =
    activeDayIndex >= 0 && (!isLastOpenDay || isBeforeDailyCutoff(referenceDate));

  return {
    openDays,
    totalDays,
    isOpen,
    activeDayNumber: activeDayIndex + 1,
    lastOpenDay: openDays[openDays.length - 1],
  };
}

type SepsPhase = "cierre" | "transicion" | "captura";

// Ventana especial de SEPS (doble fase) por mes calendario:
// - "cierre": dias 1 .. 3er dia habil -> abierto para CERRAR el mes anterior.
// - "transicion": despues del cierre y antes del dia 6 -> cerrado.
// - "captura": dia 6 .. fin de mes -> abierto para digitar el mes EN CURSO (diarios).
function getSepsWindow(referenceDate: Date, blockedDates: string[]) {
  const closeDays = getFirstBusinessDays(
    referenceDate,
    blockedDates,
    MODULE_CAPTURE_DAYS.sesps,
  );
  // El cierre cierra a las 2:30 PM del ultimo (3er) dia habil.
  const lastCloseDay = closeDays[closeDays.length - 1];
  const onLastCloseDay = isSameCalendarDay(lastCloseDay, referenceDate);
  const inClosing =
    closeDays.some((day) => isSameCalendarDay(day, referenceDate)) &&
    (!onLastCloseDay || isBeforeDailyCutoff(referenceDate));

  // Reapertura en el 6to DIA HABIL del mes, a las 00:00.
  const businessDaysToReopen = getFirstBusinessDays(referenceDate, blockedDates, 6);
  const reopenDate = businessDaysToReopen[businessDaysToReopen.length - 1];
  const reopenStart = new Date(
    reopenDate.getFullYear(),
    reopenDate.getMonth(),
    reopenDate.getDate(),
    0,
    0,
    0,
    0,
  );
  const reopenReached = referenceDate.getTime() >= reopenStart.getTime();

  let phase: SepsPhase;
  if (inClosing) {
    phase = "cierre";
  } else if (reopenReached) {
    phase = "captura";
  } else {
    phase = "transicion";
  }

  // En "captura" se digita el mes en curso; en "cierre"/"transicion", el mes anterior.
  const periodId =
    phase === "captura" ? getPeriodId(referenceDate) : getClosingPeriodId(referenceDate);

  return {
    phase,
    isOpen: phase !== "transicion",
    periodId,
    closeDays,
    reopenDay: reopenDate.getDate(),
    lastCloseDay,
  };
}

function hasAnyCapturedValue(values: Record<string, Record<string, unknown>> | undefined) {
  if (!values) {
    return false;
  }

  return Object.values(values).some((row) =>
    Object.values(row || {}).some((cell) => String(cell ?? "").trim() !== ""),
  );
}

function buildServiceGroups(): ServiceGroup[] {
  const groups = new Map<string, ServiceDefinition[]>();

  for (const service of SERVICE_DEFINITIONS) {
    const groupId = SERVICE_GROUP_BY_ID[service.id] || "apoyo";
    const currentGroup = groups.get(groupId) || [];
    currentGroup.push(service);
    groups.set(groupId, currentGroup);
  }

  return Object.entries(SERVICE_GROUP_LABELS).map(([id, title]) => ({
    id,
    title,
    services: groups.get(id) || [],
  }));
}

function getPeriodId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Periodo de PRODUCCION que se cierra: SIEMPRE el mes anterior al calendario actual.
// No se puede cerrar un mes hasta que termino (en febrero se cierra enero, etc.).
// La ventana de captura ocurre en el mes calendario actual, pero el dato pertenece
// a este periodo (mes anterior). Aplica a PERC, SEPS y Distribucion de Horas.
function getClosingPeriodId(date: Date) {
  return getPeriodId(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

// Etiqueta legible ("Mayo 2026") de un periodo "YYYY-MM".
function getPeriodLabel(periodId: string) {
  const [yearText, monthText] = periodId.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return periodId;
  }

  return PERIOD_FORMATTER.format(new Date(year, month - 1, 1));
}

// Etiqueta corta del periodo: "Febrero - 2026" (mes con inicial mayuscula + ano).
const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat("es-ES", { month: "long" });
function getShortPeriodLabel(periodId: string) {
  const [yearText, monthText] = periodId.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return periodId;
  }

  const monthName = MONTH_NAME_FORMATTER.format(new Date(year, month - 1, 1));
  const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return `${capitalized} - ${year}`;
}

// Lista de periodos recientes para el selector de historial: arranca en `latestPeriodId`
// (el mes de captura) y retrocede `count` meses. Devuelve [{ id, monthName, year }].
type RecentPeriod = { id: string; monthName: string; year: number };
function buildRecentPeriods(latestPeriodId: string, count: number): RecentPeriod[] {
  const [yearText, monthText] = latestPeriodId.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return [{ id: latestPeriodId, monthName: latestPeriodId, year: 0 }];
  }

  const periods: RecentPeriod[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(year, month - 1 - i, 1);
    const id = getPeriodId(date);
    const monthName = MONTH_NAME_FORMATTER.format(date);
    periods.push({
      id,
      monthName: monthName.charAt(0).toUpperCase() + monthName.slice(1),
      year: date.getFullYear(),
    });
  }

  return periods;
}

// Menu desplegable de meses (historial). Alineado, con verde = tiene datos, gris = vacio.
function HistoryMonthSelect(props: {
  options: RecentPeriod[];
  currentPeriod: string;
  activePeriod: string;
  dataPeriods: Set<string>;
  loading: boolean;
  onSelect: (period: string) => void;
}) {
  const { options, currentPeriod, activePeriod, dataPeriods, loading, onSelect } = props;
  const [open, setOpen] = useState(false);
  const active = options.find((option) => option.id === activePeriod);
  const activeLabel = active ? `${active.monthName} - ${active.year}` : activePeriod;

  return (
    <div className="relative inline-block w-full sm:w-auto">
      <button
        type="button"
        disabled={loading}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full min-w-[210px] items-center gap-2.5 rounded-2xl border bg-[#2a3448] px-3.5 py-2.5 text-left transition disabled:opacity-50 sm:w-auto ${
          open
            ? "border-blue-400/70 shadow-[0_0_0_3px_rgba(139,92,246,0.12)]"
            : "border-white/10 hover:border-white/25"
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/30 to-cyan-500/20 text-blue-100 [&_svg]:h-[18px] [&_svg]:w-[18px]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
            <path d="M3.5 9.5h17M8 3v3M16 3v3" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Periodo
          </span>
          <span className="block truncate text-sm font-semibold text-white">
            {activeLabel}
            {activePeriod === currentPeriod ? " · actual" : ""}
          </span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="modal-pop-in absolute left-0 right-0 z-50 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-[#1b2537] p-1.5 shadow-2xl shadow-black/50 sm:w-64">
            {options.map((option) => {
              const hasData = dataPeriods.has(option.id);
              const isActive = option.id === activePeriod;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onSelect(option.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm transition ${
                    isActive ? "bg-blue-500/20" : "hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        hasData ? "bg-emerald-400" : "bg-slate-600"
                      }`}
                    />
                    <span className={`font-medium ${hasData ? "text-emerald-300" : "text-slate-400"}`}>
                      {option.monthName}
                    </span>
                  </span>
                  <span
                    className={`tabular-nums ${hasData ? "text-emerald-300/80" : "text-slate-500"}`}
                  >
                    {option.year}
                    {option.id === currentPeriod ? " ·" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function sanitizeNumericValue(value: string) {
  return value.replace(/[^0-9]/g, "");
}

// Valor monetario: digitos y un solo punto decimal (para Insumos de Almacen).
function sanitizeMoneyValue(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) {
    return cleaned;
  }
  // Conserva solo el primer punto; elimina los demas.
  return (
    cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "")
  );
}

// Formato de dinero para totales: 2 decimales con separador de miles.
function formatMoney(n: number) {
  return n.toLocaleString("es-SV", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Tipo de valores del tabulador de Insumos: fila -> (columna -> valor string).
type InsumosValues = Record<string, Record<string, string>>;

// Fila agregada a mano (admin/supervisor) al tabulador de Insumos. Se guarda POR
// MES junto con los valores. `afterKey` = fila (oficial o custom) tras la cual se
// inserta; `parentKey` = bloque padre cuyo total la incluye (si aplica).
type InsumoExtraRow = {
  key: string;
  label: string;
  afterKey: string;
  parentKey?: string;
};

// Fila efectiva (ya combinada plantilla + extras - ocultas) que se renderiza.
type InsumoEffectiveRow = {
  key: string;
  label: string;
  sumOf?: string[];
  isExtra: boolean;
  parentKey?: string;
};

// Devuelve el padre (bloque) al que pertenece una fila ancla, para que una fila
// nueva insertada debajo se sume en el total correcto.
function findInsumosParentKey(
  anchorKey: string,
  extraRows: InsumoExtraRow[],
): string | undefined {
  const tpl = INSUMOS_ALMACEN_TEMPLATE.rows.find((r) => r.key === anchorKey);
  if (tpl?.sumOf) {
    return anchorKey; // el ancla es un bloque padre: la nueva es su primera hija
  }
  const parent = INSUMOS_ALMACEN_TEMPLATE.rows.find((r) => r.sumOf?.includes(anchorKey));
  if (parent) {
    return parent.key;
  }
  const ex = extraRows.find((e) => e.key === anchorKey);
  return ex?.parentKey;
}

// Construye la lista de filas EFECTIVAS: plantilla oficial (sin las ocultas) con
// las filas extra insertadas tras su ancla, y el `sumOf` de cada padre ajustado
// (sin hijas ocultas, con hijas extra).
function buildInsumosEffectiveRows(
  extraRows: InsumoExtraRow[],
  hiddenKeys: string[],
): InsumoEffectiveRow[] {
  const hidden = new Set(hiddenKeys);
  const effSumOf = (r: InsumoRow): string[] => {
    const base = (r.sumOf || []).filter((k) => !hidden.has(k));
    const extras = extraRows
      .filter((e) => e.parentKey === r.key && !hidden.has(e.key))
      .map((e) => e.key);
    return [...base, ...extras];
  };
  const list: InsumoEffectiveRow[] = INSUMOS_ALMACEN_TEMPLATE.rows
    .filter((r) => !hidden.has(r.key))
    .map((r) => ({
      key: r.key,
      label: r.label,
      sumOf: r.sumOf ? effSumOf(r) : undefined,
      isExtra: false,
    }));
  const insertedAfter: Record<string, number> = {};
  extraRows.forEach((ex) => {
    if (hidden.has(ex.key)) {
      return;
    }
    const row: InsumoEffectiveRow = {
      key: ex.key,
      label: ex.label,
      isExtra: true,
      parentKey: ex.parentKey,
    };
    const idx = list.findIndex((r) => r.key === ex.afterKey);
    if (idx < 0) {
      list.push(row);
      return;
    }
    const offset = insertedAfter[ex.afterKey] || 0;
    list.splice(idx + 1 + offset, 0, row);
    insertedAfter[ex.afterKey] = offset + 1;
  });
  return list;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function buildFullName(firstName: string, lastName: string, fallback: string) {
  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  return fullName || fallback;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Formatea un valor sumado del consolidado: redondea a 2 decimales (mata el ruido
// de punto flotante al sumar) y descarta decimales innecesarios. Enteros quedan
// como enteros (105) y los decimales reales se conservan (Aseo: 745.6, 1827.54).
function formatConsolidatedNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function downloadAdminExcelReport(overview: AdminOverviewEntry[], periodId: string) {
  // El consolidado debe respetar la plantilla oficial TAL CUAL: una sola columna
  // de etiqueta (encabezado vacio) seguida de los centros de costo, y las filas en
  // el orden de CONSOLIDADO_ROW_ORDER (donde Nutricion va SEPARADA: las filas 652-*
  // quedan despues de Almacen, no junto a las 750/760 como en el tablero).
  // Sumamos por (fila, centro de costo) acumulando TODOS los servicios. La mayoria
  // de filas pertenece a un solo servicio (la suma es ese mismo valor), pero las
  // filas de Hemodialisis (268_*) las capturan DOS servicios distintos (UCI y
  // Medicina interna) y en la plantilla oficial van en un unico bloque sumado:
  // UCI 55 + Medicina interna 50 => 105; 0 + 88 => 88; 10 + 10 => 20.
  const sumsByRow = new Map<string, Map<string, number>>();
  for (const entry of overview) {
    for (const row of entry.service.rows) {
      const rowValues = entry.values[row];

      if (!rowValues) {
        continue;
      }

      let headerSums = sumsByRow.get(row);

      if (!headerSums) {
        headerSums = new Map<string, number>();
        sumsByRow.set(row, headerSums);
      }

      for (const header of TABULATOR_HEADERS) {
        const parsed = Number.parseFloat(rowValues[header] ?? "");

        if (!Number.isFinite(parsed) || parsed === 0) {
          continue;
        }

        headerSums.set(header, (headerSums.get(header) ?? 0) + parsed);
      }
    }
  }

  const headerCells = ["", ...TABULATOR_HEADERS]
    .map(
      (header) =>
        `<th style="background:#dbe7ff;border:1px solid #cbd5e1;padding:8px;font-weight:700;">${escapeHtml(header)}</th>`,
    )
    .join("");
  const bodyRows = CONSOLIDADO_ROW_ORDER.map((row) => {
    const headerSums = sumsByRow.get(row);
    const cells = TABULATOR_HEADERS.map((header) => {
      const sum = headerSums?.get(header);
      const text = sum === undefined ? "0" : formatConsolidatedNumber(sum);

      return `<td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${escapeHtml(
        text,
      )}</td>`;
    }).join("");

    return `<tr><td style="border:1px solid #cbd5e1;padding:6px;font-weight:700;">${escapeHtml(row)}</td>${cells}</tr>`;
  }).join("");

  const documentHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>Produccion Distribuida ${periodId}</title></head><body><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
  const blob = new Blob(["\ufeff", documentHtml], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");

  link.href = url;
  link.download = `produccion-distribuida-${periodId}.xls`;
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// Descarga el consolidado "Produccion de Servicio" (plantilla COMPLETA) en un .xls
// aparte: Centro de Produccion | Unidades de Produccion | Cantidad. Las 3 areas con
// captura traen su numero del mes; el resto queda en blanco hasta cargar sus datos.
// Calcula el consolidado COMPLETO "Produccion de Servicio": por cada centro, cada
// unidad con su Cantidad ya resuelta (captura del servicio, total del Censo, o 0).
// Se usa igual para la previsualizacion en modal y para el Excel descargado.
type ConsolidadoUnit = {
  label: string;
  qty: string;
  source: "servicio" | "censo" | "none";
  // Solo para source "censo": si el mes del Censo esta completo (verde) o no (amarillo).
  complete?: boolean;
};
type ConsolidadoRow = { centro: string; units: ConsolidadoUnit[] };

function computeConsolidado(
  overview: AdminOverviewEntry[],
  censoInfo: Record<string, CensoRowInfo>,
): ConsolidadoRow[] {
  const valuesByService = new Map<string, Record<string, Record<string, unknown>>>();
  for (const entry of overview) {
    valuesByService.set(entry.service.id, entry.values);
  }
  return PERC_SERV_CONSOLIDADO.map((svc) => {
    const servValues = svc.serviceId
      ? valuesByService.get(svc.serviceId)?.[PERC_SERV_ROW] || {}
      : {};
    return {
      centro: svc.centro,
      units: svc.units.map((unit) => {
        // La Cantidad siempre lleva un valor: si no hay dato, va 0 (nunca vacia).
        let qty = "0";
        let source: ConsolidadoUnit["source"] = "none";
        let complete: boolean | undefined;
        if (unit.key) {
          const parsed = Number.parseFloat(String(servValues[unit.key] ?? ""));
          qty = Number.isFinite(parsed) ? formatConsolidatedNumber(parsed) : "0";
          source = "servicio";
        } else if (unit.censoRow) {
          // Dias-cama-ocupados (Dco): total mensual de la fila del Censo Diario.
          const ci = censoInfo[unit.censoRow];
          qty = ci ? formatConsolidatedNumber(ci.total) : "0";
          source = "censo";
          complete = ci?.complete ?? false;
        }
        return { label: unit.label, qty, source, complete };
      }),
    };
  });
}

function downloadServiceProductionReport(
  overview: AdminOverviewEntry[],
  periodId: string,
  censoInfo: Record<string, CensoRowInfo> = {},
) {
  const headerCells = ["Centro de Producción", "Unidades de Producción", "Cantidad"]
    .map(
      (header) =>
        `<th style="background:#dbe7ff;border:1px solid #cbd5e1;padding:8px;font-weight:700;">${escapeHtml(header)}</th>`,
    )
    .join("");

  const bodyRows = computeConsolidado(overview, censoInfo)
    .map((svc) =>
      svc.units
        .map((unit, index) => {
          const centroCell =
            index === 0
              ? `<td rowspan="${svc.units.length}" style="border:1px solid #cbd5e1;padding:6px;font-weight:700;vertical-align:middle;">${escapeHtml(svc.centro)}</td>`
              : "";
          // Celdas del Censo: verde = mes completo, amarillo = aun incompleto.
          const qtyStyle =
            unit.source === "censo"
              ? unit.complete
                ? "background:#dcfce7;color:#166534;font-weight:700;"
                : "background:#fef9c3;color:#854d0e;font-weight:700;"
              : "";
          return `<tr>${centroCell}<td style="border:1px solid #cbd5e1;padding:6px;">${escapeHtml(unit.label)}</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:center;${qtyStyle}">${escapeHtml(unit.qty)}</td></tr>`;
        })
        .join(""),
    )
    .join("");

  const documentHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>Produccion de Servicio ${periodId}</title></head><body><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
  const blob = new Blob([documentHtml], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");

  link.href = url;
  link.download = `produccion-de-servicio-${periodId}.xls`;
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function getServiceUsername(serviceId: string | null | undefined) {
  if (!serviceId) {
    return "";
  }

  return SERVICE_USERNAME_BY_ID[serviceId] || `dep.${serviceId}`;
}

// Correo de ACCESO deterministico derivado del usuario del servicio. Permite
// resolver usuario -> correo en memoria (sin leer Firestore antes de autenticar),
// que es lo que impedia el login de las cuentas creadas. No es un buzon real:
// el correo de contacto del usuario se guarda aparte en el perfil.
const SERVICE_LOGIN_DOMAIN = "perc-hnes.app";

function getServiceLoginEmail(serviceId: string | null | undefined) {
  const username = getServiceUsername(serviceId);
  return username ? `${username.toLowerCase()}@${SERVICE_LOGIN_DOMAIN}` : "";
}

function findServiceByUsername(username: string) {
  const normalizedUsername = normalizeKey(username);

  return (
    SERVICE_DEFINITIONS.find(
      (service) => normalizeKey(getServiceUsername(service.id)) === normalizedUsername,
    ) || null
  );
}

function normalizeLoginIdentifier(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  if (!trimmedValue.includes("@") && trimmedValue.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
    return ADMIN_EMAIL;
  }

  return trimmedValue;
}

function normalizeProfile(uid: string, email: string, data: Record<string, unknown>): ManagedUser {
  const role: UserRole =
    data.role === "admin" ? "admin" : data.role === "supervisor" ? "supervisor" : "service";
  const defaultPermissions = getDefaultPermissions(role);
  const supervisorModules = Array.isArray(data.supervisorModules)
    ? (data.supervisorModules.filter((value): value is ModuleId =>
        MODULE_ORDER.includes(value as ModuleId),
      ) as ModuleId[])
    : [];
  const rawPermissions =
    typeof data.permissions === "object" && data.permissions !== null
      ? (data.permissions as Partial<ServicePermissions>)
      : {};
  const firstName = typeof data.firstName === "string" ? data.firstName : "";
  const lastName = typeof data.lastName === "string" ? data.lastName : "";
  const fallbackName = typeof data.name === "string" ? data.name : email.split("@")[0] || "Usuario";

  return {
    uid,
    serviceId: typeof data.serviceId === "string" ? data.serviceId : null,
    serviceName: typeof data.serviceName === "string" ? data.serviceName : null,
    email,
    username:
      typeof data.username === "string"
        ? data.username
        : role === "admin"
          ? ADMIN_USERNAME
          : getServiceUsername(typeof data.serviceId === "string" ? data.serviceId : null),
    firstName,
    lastName,
    name: buildFullName(firstName, lastName, fallbackName),
    dui: typeof data.dui === "string" ? data.dui : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    role,
    permissions: {
      canEdit: rawPermissions.canEdit ?? defaultPermissions.canEdit,
      canManageUsers: rawPermissions.canManageUsers ?? defaultPermissions.canManageUsers,
      canToggleCapture: rawPermissions.canToggleCapture ?? defaultPermissions.canToggleCapture,
    },
    supervisorModules,
    mustChangePassword: data.mustChangePassword !== false,
    isActive: data.isActive !== false,
  };
}

function buildAdminDrafts(users: ManagedUser[]) {
  return Object.fromEntries(
    users.map((managedUser) => [
      managedUser.uid,
      {
        serviceId: managedUser.serviceId || "",
        role: managedUser.role,
        canEdit: managedUser.permissions.canEdit,
        canManageUsers: managedUser.permissions.canManageUsers,
        mustChangePassword: managedUser.mustChangePassword,
        isActive: managedUser.isActive,
        email: managedUser.email,
        username: managedUser.username,
        name: managedUser.name,
      } satisfies AdminDraft,
    ]),
  ) as Record<string, AdminDraft>;
}

function sortManagedUsers(users: ManagedUser[]) {
  return [...users].sort((left, right) => {
    const leftLabel = left.serviceName || left.name || left.email;
    const rightLabel = right.serviceName || right.name || right.email;
    return leftLabel.localeCompare(rightLabel, "es");
  });
}

// Fila PERC agregada a mano (admin/supervisor). `afterKey` = fila tras la cual va.
type PercExtraRow = { key: string; label: string; afterKey: string };
type PercData = { values: TableValues; extraRows: PercExtraRow[]; hiddenKeys: string[] };

async function fetchSavedDataForPeriod(
  service: ServiceDefinition,
  periodId: string,
): Promise<PercData> {
  const snapshot = await getDoc(doc(db, "serviceTabulators", `${periodId}__${service.id}`));

  if (!snapshot.exists()) {
    return { values: buildEmptyTable(service), extraRows: [], hiddenKeys: [] };
  }

  const data = snapshot.data() as {
    values?: Record<string, Record<string, unknown>>;
    extraRows?: PercExtraRow[];
    hiddenKeys?: string[];
  };
  const extraRows = Array.isArray(data.extraRows) ? data.extraRows : [];
  return {
    values: mergeWithTemplate(service, data.values, extraRows.map((e) => e.key)),
    extraRows,
    hiddenKeys: Array.isArray(data.hiddenKeys) ? data.hiddenKeys : [],
  };
}

// ---- SEPS (tabuladores diarios) -------------------------------------------
// values: Record<rowKey, Record<dayStr, valor>>. Las filas readOnly no se guardan
// (se recalculan en vivo). Doc id en coleccion "sepsTabulators".
type SepsValues = Record<string, Record<string, string>>;

// Fila agregada a mano a una tabla SEPS (admin/supervisor). `tableId` = tabla en
// la que va; `afterKey` = fila tras la cual se inserta; hereda el grupo del ancla.
type SepsExtraRow = { tableId: string; key: string; label: string; afterKey: string };

// Devuelve las filas EFECTIVAS de una tabla SEPS: filas de plantilla (sin las
// ocultas) con las filas extra insertadas tras su ancla (heredando su grupo).
function buildSepsEffectiveRows(
  table: SepsTable,
  extraRows: SepsExtraRow[],
  hiddenKeys: string[],
): (SepsRow & { isExtra?: boolean })[] {
  const hidden = new Set(hiddenKeys);
  const groupsOf = (r: SepsRow): string[] =>
    r.groups && r.groups.length > 0 ? r.groups : r.group ? [r.group] : [];
  const list: (SepsRow & { isExtra?: boolean })[] = table.rows
    .filter((r) => !hidden.has(r.key))
    .map((r) => ({ ...r }));
  const groupByKey = new Map<string, string[]>(list.map((r) => [r.key, groupsOf(r)]));
  const extras = extraRows.filter((e) => e.tableId === table.id && !hidden.has(e.key));
  const insertedAfter: Record<string, number> = {};
  extras.forEach((ex) => {
    const g = groupByKey.get(ex.afterKey) || [];
    const row: SepsRow & { isExtra?: boolean } = { key: ex.key, label: ex.label, groups: g, isExtra: true };
    groupByKey.set(ex.key, g);
    const idx = list.findIndex((r) => r.key === ex.afterKey);
    if (idx < 0) {
      list.push(row);
      return;
    }
    const off = insertedAfter[ex.afterKey] || 0;
    list.splice(idx + 1 + off, 0, row);
    insertedAfter[ex.afterKey] = off + 1;
  });
  return list;
}

function buildEmptySeps(template: SepsTemplate, periodId: string): SepsValues {
  const values: SepsValues = {};

  // Formato matricial (Laboratorio): filas = examenes; columnas = RESULTADOS + PROCEDENCIA.
  if (template.kind === "matrix") {
    const cols = [...SEPS_LAB_RESULT_COLS, ...SEPS_LAB_PROC_COLS].map((c) => c.key);
    for (const section of template.sections ?? []) {
      for (const exam of section.exams) {
        values[exam.key] = Object.fromEntries(cols.map((c) => [c, ""]));
      }
    }
    return values;
  }

  const days = getDayColumns(periodId);
  for (const row of getSepsRows(template)) {
    if (row.readOnly) {
      continue;
    }
    values[row.key] = Object.fromEntries(days.map((day) => [day, ""]));
  }

  return values;
}

function mergeSepsWithTemplate(
  template: SepsTemplate,
  periodId: string,
  saved?: Record<string, Record<string, unknown>>,
  extraKeys: string[] = [],
): SepsValues {
  const values = buildEmptySeps(template, periodId);

  // Filas agregadas a mano: se les crea su fila de dias vacia para que sus
  // valores se conserven al guardar/cargar (no estan en la plantilla oficial).
  if (template.kind !== "matrix") {
    const days = getDayColumns(periodId);
    for (const key of extraKeys) {
      if (!values[key]) {
        values[key] = Object.fromEntries(days.map((day) => [day, ""]));
      }
    }
  }

  if (!saved) {
    return values;
  }

  for (const rowKey of Object.keys(values)) {
    for (const day of Object.keys(values[rowKey])) {
      const cell = saved[rowKey]?.[day];
      if (cell !== undefined && cell !== null) {
        values[rowKey][day] = String(cell);
      }
    }
  }

  return values;
}

// Comentario de revision que el revisor (o admin/supervisor) deja en el SEPS de
// un servicio+mes, para que el servicio vea cuando le corrigen o le cuadran algo.
type SepsComment = { id: string; author: string; text: string; at: number };
type SepsData = {
  values: SepsValues;
  extraRows: SepsExtraRow[];
  hiddenKeys: string[];
  comments: SepsComment[];
};

async function fetchSepsDataForPeriod(
  template: SepsTemplate,
  periodId: string,
): Promise<SepsData> {
  // Consolidado (solo lectura): suma los SEPS de varios servicios (mismas claves de fila).
  if (template.consolidatesFrom && template.consolidatesFrom.length > 0) {
    const base = buildEmptySeps(template, periodId);
    const sums: Record<string, Record<string, number>> = {};
    for (const srcId of template.consolidatesFrom) {
      const src = await getDoc(doc(db, "sepsTabulators", `${periodId}__${srcId}`));
      if (!src.exists()) continue;
      const srcVals =
        (src.data() as { values?: Record<string, Record<string, unknown>> }).values || {};
      for (const rowKey of Object.keys(srcVals)) {
        for (const day of Object.keys(srcVals[rowKey] || {})) {
          const raw = (srcVals[rowKey] || {})[day];
          if (raw === "" || raw === null || raw === undefined) continue;
          const n = Number(raw);
          if (!Number.isFinite(n)) continue;
          if (!sums[rowKey]) sums[rowKey] = {};
          sums[rowKey][day] = (sums[rowKey][day] || 0) + n;
        }
      }
    }
    const values: SepsValues = {};
    for (const rowKey of Object.keys(base)) {
      values[rowKey] = {};
      for (const day of Object.keys(base[rowKey])) {
        const s = sums[rowKey]?.[day];
        values[rowKey][day] = s === undefined ? "" : String(s);
      }
    }
    return { values, extraRows: [], hiddenKeys: [], comments: [] };
  }

  const snapshot = await getDoc(
    doc(db, "sepsTabulators", `${periodId}__${template.serviceId}`),
  );

  if (!snapshot.exists()) {
    return { values: buildEmptySeps(template, periodId), extraRows: [], hiddenKeys: [], comments: [] };
  }

  const data = snapshot.data() as {
    values?: Record<string, Record<string, unknown>>;
    extraRows?: SepsExtraRow[];
    hiddenKeys?: string[];
    comments?: SepsComment[];
  };
  const extraRows = Array.isArray(data.extraRows) ? data.extraRows : [];
  return {
    values: mergeSepsWithTemplate(template, periodId, data.values, extraRows.map((e) => e.key)),
    extraRows,
    hiddenKeys: Array.isArray(data.hiddenKeys) ? data.hiddenKeys : [],
    comments: Array.isArray(data.comments) ? data.comments : [],
  };
}

function hasAnySepsValue(values: SepsValues | undefined) {
  if (!values) {
    return false;
  }

  return Object.values(values).some((row) =>
    Object.values(row || {}).some((cell) => String(cell ?? "").trim() !== ""),
  );
}

// ---- Distribucion de Horas (empleados x centros de costo) ------------------
// Filas dinamicas (el usuario agrega/quita empleados). hours: { columna -> horas }.
// El comentario es transitorio (ayuda durante la captura); NO va al consolidado.
// Cuantas filas de Horas se renderizan por "pagina" (ver paginacion del tabulador).
const HORAS_PAGE_SIZE = 60;

type HorasEmployee = { name: string; dui: string; comment: string; hours: Record<string, string> };

function buildEmptyHorasEmployee(template: HorasTemplate, name = "", dui = ""): HorasEmployee {
  return {
    name,
    dui,
    comment: "",
    hours: Object.fromEntries(template.columns.map((col) => [col, ""])),
  };
}

function seedHorasEmployees(template: HorasTemplate): HorasEmployee[] {
  return template.seedEmployees.map((seed) => {
    // El seed puede ser solo nombre (string) o { name, dui }.
    const name = typeof seed === "string" ? seed : seed.name;
    const dui = typeof seed === "string" ? "" : seed.dui ?? "";
    return buildEmptyHorasEmployee(template, name.trim(), dui.trim());
  });
}

function normalizeHorasEmployees(template: HorasTemplate, raw: unknown): HorasEmployee[] {
  if (!Array.isArray(raw)) {
    return seedHorasEmployees(template);
  }

  // Mapa nombre normalizado -> DUI de la plantilla, para rellenar DUIs faltantes en
  // datos guardados previamente sin DUI.
  const seedDuiByName = new Map<string, string>();
  for (const seed of template.seedEmployees) {
    if (typeof seed !== "string" && seed.dui) {
      seedDuiByName.set(seed.name.trim().toLowerCase(), seed.dui.trim());
    }
  }

  const list = raw
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const rawHours = (row.hours ?? {}) as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name : "";
      const savedDui = typeof row.dui === "string" ? row.dui : "";
      const dui = savedDui.trim() || seedDuiByName.get(name.trim().toLowerCase()) || "";
      return {
        name,
        dui,
        comment: typeof row.comment === "string" ? row.comment : "",
        hours: Object.fromEntries(
          template.columns.map((col) => [col, String(rawHours[col] ?? "")]),
        ),
      };
    })
    // Conservar filas con nombre, DUI o algun dato.
    .filter(
      (emp) =>
        emp.name.trim() !== "" ||
        emp.dui.trim() !== "" ||
        Object.values(emp.hours).some((h) => h.trim() !== ""),
    );

  return list.length > 0 ? list : seedHorasEmployees(template);
}

async function fetchHorasForPeriod(
  template: HorasTemplate,
  periodId: string,
): Promise<{ employees: HorasEmployee[]; saved: boolean }> {
  const snapshot = await getDoc(doc(db, "horasTabulators", `${periodId}__${template.serviceId}`));

  if (!snapshot.exists()) {
    return { employees: seedHorasEmployees(template), saved: false };
  }

  const data = snapshot.data() as { employees?: unknown };
  return { employees: normalizeHorasEmployees(template, data.employees), saved: true };
}

// Info del Censo Diario de un mes por fila: total (suma de dias) y si el mes esta
// COMPLETO (todos los dias del mes con un dato). Alimenta los campos "Dco" del
// consolidado y decide el color: amarillo = incompleto, verde = completo.
type CensoRowInfo = { total: number; complete: boolean };
async function fetchCensoInfoForPeriod(periodId: string): Promise<Record<string, CensoRowInfo>> {
  const info: Record<string, CensoRowInfo> = {};
  try {
    const snap = await getDoc(doc(db, "censoDiario", periodId));
    // Dias reales del mes (28/29/30/31) para decidir si esta completo.
    const days = getDayColumns(periodId).map(Number);
    if (snap.exists()) {
      const data = snap.data() as { values?: Record<string, Record<string, unknown>> };
      const values = data.values || {};
      for (const [rowKey, byDay] of Object.entries(values)) {
        let sum = 0;
        let filled = 0;
        for (const day of days) {
          const cell = String(byDay?.[String(day)] ?? "").trim();
          if (cell !== "") {
            filled += 1;
            const n = Number.parseInt(cell, 10);
            if (Number.isFinite(n)) {
              sum += n;
            }
          }
        }
        info[rowKey] = { total: sum, complete: days.length > 0 && filled === days.length };
      }
    }
  } catch {
    // Silencioso: si falla la lectura, el consolidado usa 0 en esos campos.
  }
  return info;
}

async function fetchAdminOverviewForPeriod(periodId: string): Promise<AdminOverviewEntry[]> {
  const snapshot = await getDocs(
    query(collection(db, "serviceTabulators"), where("periodId", "==", periodId)),
  );
  const savedByService = new Map<string, Record<string, Record<string, unknown>>>();

  for (const item of snapshot.docs) {
    const data = item.data() as {
      serviceId?: string;
      values?: Record<string, Record<string, unknown>>;
    };

    if (typeof data.serviceId === "string") {
      savedByService.set(data.serviceId, data.values || {});
    }
  }

  return SERVICE_DEFINITIONS.map((service) => ({
    service,
    values: mergeWithTemplate(service, savedByService.get(service.id)),
    hasSavedData: savedByService.has(service.id),
  }));
}

async function fetchCalendarOverridesForYear(year: number) {
  const snapshot = await getDocs(
    query(
      collection(db, "captureCalendar"),
      where("periodId", ">=", `${year}-01`),
      where("periodId", "<=", `${year}-12`),
    ),
  );
  const overrides: Record<string, string[]> = {};

  for (const item of snapshot.docs) {
    const data = item.data() as {
      blockedDates?: unknown;
    };

    overrides[item.id] = Array.isArray(data.blockedDates)
      ? data.blockedDates.filter((value): value is string => typeof value === "string")
      : [];
  }

  return overrides;
}

// Trae los overrides de tableros (reabiertos/cerrados manualmente) de un periodo.
// Devuelve un mapa cuya clave es el id de doc `${periodId}__${serviceId}__${moduleId}`.
async function fetchCaptureOverridesForPeriod(periodId: string): Promise<CaptureOverridesMap> {
  const snapshot = await getDocs(
    query(collection(db, "captureOverrides"), where("periodId", "==", periodId)),
  );
  const overrides: CaptureOverridesMap = {};

  for (const item of snapshot.docs) {
    const state = (item.data() as { state?: unknown }).state;

    if (state === "open" || state === "closed") {
      overrides[item.id] = state;
    }
  }

  return overrides;
}

async function fetchPublicDashboard(year: number, currentPeriodId: string) {
  // Lecturas opcionales (SEPS/Horas pueden fallar si faltan reglas): no deben romper.
  const safeServiceIds = async (
    coll: string,
  ): Promise<Set<string>> => {
    try {
      const snap = await getDocs(
        query(collection(db, coll), where("periodId", "==", currentPeriodId)),
      );
      const ids = new Set<string>();
      for (const item of snap.docs) {
        const sid = (item.data() as { serviceId?: unknown }).serviceId;
        if (typeof sid === "string") {
          ids.add(sid);
        }
      }
      return ids;
    } catch {
      return new Set<string>();
    }
  };

  const [calendarOverrides, tabulatorsSnapshot, sepsDone, horasDone] = await Promise.all([
    fetchCalendarOverridesForYear(year),
    getDocs(
      query(
        collection(db, "serviceTabulators"),
        where("periodId", ">=", `${year}-01`),
        where("periodId", "<=", `${year}-12`),
      ),
    ),
    safeServiceIds("sepsTabulators"),
    safeServiceIds("horasTabulators"),
  ]);
  const completedByPeriod = new Map<string, Set<string>>();

  for (const item of tabulatorsSnapshot.docs) {
    const data = item.data() as {
      periodId?: string;
      serviceId?: string;
      values?: Record<string, Record<string, unknown>>;
    };

    if (
      typeof data.periodId !== "string" ||
      typeof data.serviceId !== "string" ||
      !data.periodId.startsWith(`${year}-`) ||
      !hasAnyCapturedValue(data.values)
    ) {
      continue;
    }

    const currentSet = completedByPeriod.get(data.periodId) || new Set<string>();
    currentSet.add(data.serviceId);
    completedByPeriod.set(data.periodId, currentSet);
  }

  const currentYear = new Date(year, 0, 1).getFullYear();
  const months: PublicDashboardMonth[] = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(currentYear, index, 1, 12, 0, 0, 0);
    const periodId = getPeriodId(monthDate);
    const completedServices = completedByPeriod.get(periodId)?.size || 0;
    const blockedDates = calendarOverrides[periodId] || [];

    return {
      periodId,
      label: PERIOD_FORMATTER.format(monthDate),
      completedServices,
      totalServices: SERVICE_DEFINITIONS.length,
      isCurrentMonth: periodId === currentPeriodId,
      isOpen: blockedDates.length === 0,
    };
  });

  const currentCompletedServices = completedByPeriod.get(currentPeriodId) || new Set<string>();
  const groups: PublicDashboardGroup[] = buildServiceGroups().map((group) => ({
    ...group,
    services: group.services.map((service) => {
      const percDone = currentCompletedServices.has(service.id);
      // PERC solo si el servicio tiene el modulo PERC (los "solo Horas" no salen en PERC).
      const hasPerc = getAreaById(service.id)?.modules.includes("perc") ?? false;
      const modules: PublicModuleStatus[] = [];
      if (hasPerc) {
        modules.push({ label: "PERC", completed: percDone });
      }
      if (getSepsTemplate(service.id)) {
        modules.push({ label: "SEPS", completed: sepsDone.has(service.id) });
      }
      if (getHorasTemplate(service.id)) {
        modules.push({ label: "Horas", completed: horasDone.has(service.id) });
      }
      // "Completo" del servicio: si hace PERC, manda PERC; si no, su modulo de Horas.
      const completed = hasPerc ? percDone : horasDone.has(service.id);
      return { ...service, completed, modules };
    }),
  }));

  return {
    calendarOverrides,
    months,
    groups,
    completedCount: currentCompletedServices.size,
  };
}

async function ensureDefaultAdminProfile(currentUser: User) {
  await updateProfile(currentUser, {
    displayName: ADMIN_USERNAME,
  });

  await setDoc(
    doc(db, "serviceUsers", currentUser.uid),
    {
      serviceId: null,
      serviceName: null,
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      name: ADMIN_USERNAME,
      role: "admin",
      isActive: true,
      mustChangePassword: false,
      permissions: getDefaultPermissions("admin"),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function buildDefaultAdminProfile(uid: string) {
  return normalizeProfile(uid, ADMIN_EMAIL, {
    serviceId: null,
    serviceName: null,
    email: ADMIN_EMAIL,
    username: ADMIN_USERNAME,
    firstName: ADMIN_USERNAME,
    lastName: "",
    name: ADMIN_USERNAME,
    dui: "",
    phone: "",
    role: "admin",
    isActive: true,
    mustChangePassword: false,
    permissions: getDefaultPermissions("admin"),
  });
}

// Siembra/actualiza el perfil de un supervisor en Firestore. Se llama en el primer
// login (igual que el admin), con los modulos que puede habilitar/deshabilitar.
async function ensureSupervisorProfile(currentUser: User, account: SupervisorAccount) {
  const displayName = buildFullName(account.firstName, account.lastName, account.username);

  await updateProfile(currentUser, { displayName });

  await setDoc(
    doc(db, "serviceUsers", currentUser.uid),
    {
      serviceId: null,
      serviceName: null,
      email: getSupervisorLoginEmail(account.username),
      loginEmail: getSupervisorLoginEmail(account.username),
      username: account.username,
      firstName: account.firstName,
      lastName: account.lastName,
      name: displayName,
      role: account.admin ? "admin" : "supervisor",
      isActive: true,
      mustChangePassword: true,
      permissions: getDefaultPermissions(account.admin ? "admin" : "supervisor"),
      supervisorModules: account.modules,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function buildSupervisorProfile(uid: string, account: SupervisorAccount) {
  return normalizeProfile(uid, getSupervisorLoginEmail(account.username), {
    serviceId: null,
    serviceName: null,
    email: getSupervisorLoginEmail(account.username),
    username: account.username,
    firstName: account.firstName,
    lastName: account.lastName,
    name: buildFullName(account.firstName, account.lastName, account.username),
    role: account.admin ? "admin" : "supervisor",
    isActive: true,
    mustChangePassword: true,
    permissions: getDefaultPermissions(account.admin ? "admin" : "supervisor"),
    supervisorModules: account.modules,
  });
}

async function createServiceUserAccount(
  creationAuth: Auth,
  {
    service,
    email,
    firstName,
    lastName,
    dui,
    phone,
  }: {
    service: ServiceDefinition;
    email: string;
    firstName: string;
    lastName: string;
    dui: string;
    phone: string;
  },
) {
  const serviceUsername = getServiceUsername(service.id);
  const assignmentRef = doc(db, "serviceAssignments", service.id);
  const assignmentSnapshot = await getDoc(assignmentRef);

  if (assignmentSnapshot.exists()) {
    throw new Error("service-already-assigned");
  }

  const normalizedEmail = email.trim();
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const normalizedDui = dui.trim();
  const normalizedPhone = phone.trim();
  const displayName = buildFullName(normalizedFirstName, normalizedLastName, service.name);
  // Correo de ACCESO deterministico (derivado del usuario). El correo que escribe
  // el admin queda como correo de CONTACTO. Asi el login por usuario funciona sin
  // leer Firestore antes de autenticar.
  const loginEmail = getServiceLoginEmail(service.id);
  const credential = await createUserWithEmailAndPassword(
    creationAuth,
    loginEmail,
    DEFAULT_TEMP_PASSWORD,
  );

  await updateProfile(credential.user, {
    displayName,
  });

  await setDoc(doc(db, "serviceUsers", credential.user.uid), {
    serviceId: service.id,
    serviceName: service.name,
    email: normalizedEmail,
    contactEmail: normalizedEmail,
    loginEmail,
    username: serviceUsername,
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
    name: displayName,
    dui: normalizedDui,
    phone: normalizedPhone,
    role: "service",
    isActive: true,
    mustChangePassword: true,
    permissions: getDefaultPermissions("service"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(assignmentRef, {
    serviceId: service.id,
    serviceName: service.name,
    uid: credential.user.uid,
    email: normalizedEmail,
    contactEmail: normalizedEmail,
    loginEmail,
    username: serviceUsername,
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
    name: displayName,
    dui: normalizedDui,
    phone: normalizedPhone,
    updatedAt: serverTimestamp(),
  });

  return {
    credential,
    displayName,
    serviceUsername,
  };
}

// Contrasena generica para las cuentas de jefes creadas por aprobacion.
const CHIEF_TEMP_PASSWORD = "123456";

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Usuario = inicial del nombre + primer apellido (sin acentos). Ej: Brenda Mejia -> bmejia.
function buildChiefUsername(firstName: string, lastName: string) {
  const first = stripAccents(firstName).toLowerCase().replace(/[^a-z0-9]/g, "");
  const lastWord =
    stripAccents(lastName)
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean)[0] ?? "";
  const last = lastWord.replace(/[^a-z0-9]/g, "");
  return `${first.charAt(0) || "u"}${last || "user"}`;
}

// Crea una cuenta de JEFE de servicio (aprobada por admin): usuario por nombre,
// contrasena 123456, perfil de servicio. NO crea serviceAssignment (es un usuario
// adicional del servicio, no la cuenta unica del servicio).
async function createChiefUserAccount(
  creationAuth: Auth,
  {
    service,
    contactEmail,
    firstName,
    lastName,
  }: {
    service: ServiceDefinition;
    contactEmail: string;
    firstName: string;
    lastName: string;
  },
) {
  const base = buildChiefUsername(firstName, lastName);
  const displayName = buildFullName(firstName.trim(), lastName.trim(), service.name);

  let username = base;
  let credential: Awaited<ReturnType<typeof createUserWithEmailAndPassword>> | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    username = attempt === 0 ? base : `${base}${attempt + 1}`;
    const loginEmail = `${username}@${SERVICE_LOGIN_DOMAIN}`;
    try {
      credential = await createUserWithEmailAndPassword(
        creationAuth,
        loginEmail,
        CHIEF_TEMP_PASSWORD,
      );
      break;
    } catch (err) {
      if ((err as { code?: string })?.code === "auth/email-already-in-use") {
        continue; // usuario tomado: probar con sufijo numerico
      }
      throw err;
    }
  }
  if (!credential) {
    throw new Error("username-unavailable");
  }

  const loginEmail = `${username}@${SERVICE_LOGIN_DOMAIN}`;
  const normalizedContact = contactEmail.trim();

  await updateProfile(credential.user, { displayName });

  await setDoc(doc(db, "serviceUsers", credential.user.uid), {
    serviceId: service.id,
    serviceName: service.name,
    email: normalizedContact,
    contactEmail: normalizedContact,
    loginEmail,
    username,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    name: displayName,
    role: "service",
    isActive: true,
    mustChangePassword: true,
    isChief: true,
    permissions: getDefaultPermissions("service"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { credential, username, displayName, password: CHIEF_TEMP_PASSWORD };
}

// Resuelve el correo de ACCESO desde lo que el usuario escribe (usuario o correo).
// Todo en memoria: ya NO consulta Firestore antes de autenticar (ese era el origen
// de que las cuentas creadas no pudieran ingresar cuando las reglas bloquean la
// lectura sin sesion).
function resolveLoginEmail(loginIdentifier: string) {
  const normalizedIdentifier = normalizeLoginIdentifier(loginIdentifier);

  if (!normalizedIdentifier) {
    return "";
  }

  if (normalizedIdentifier.includes("@")) {
    return normalizedIdentifier;
  }

  if (normalizeKey(normalizedIdentifier) === normalizeKey(ADMIN_USERNAME)) {
    return ADMIN_EMAIL;
  }

  const mappedService = findServiceByUsername(normalizedIdentifier);

  if (mappedService) {
    return getServiceLoginEmail(mappedService.id);
  }

  // Usuario por nombre (ej. jefes de servicio: bmejia). Se completa con el dominio
  // de acceso para que el login funcione: bmejia -> bmejia@perc-hnes.app.
  return `${normalizeKey(normalizedIdentifier)}@${SERVICE_LOGIN_DOMAIN}`;
}

export default function Home() {
  const [adminCreateForm, setAdminCreateForm] = useState<AdminCreateForm>({
    firstName: "",
    lastName: "",
    email: "",
    dui: "",
    phone: "",
    serviceId: "",
  });
  // Registro publico de jefes de servicio (antes de iniciar sesion).
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [isSubmittingSignup, setIsSubmittingSignup] = useState(false);
  const [signupForm, setSignupForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    serviceId: "",
    acceptPrivacy: false,
  });
  // Bandeja de solicitudes de REGISTRO (para los 3 admins).
  const [signupRequests, setSignupRequests] = useState<SignupRequest[]>([]);
  const [showSignupRequestsModal, setShowSignupRequestsModal] = useState(false);
  const [signupBusyId, setSignupBusyId] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [serviceProfile, setServiceProfile] = useState<ManagedUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Modal breve "Iniciando sesion" (con barrita de pulso) tras login exitoso.
  const [loginLoading, setLoginLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  // Mes que se esta viendo en cada tabulador. null = mes de captura actual.
  const [percViewPeriod, setPercViewPeriod] = useState<string | null>(null);
  const [sepsViewPeriod, setSepsViewPeriod] = useState<string | null>(null);
  const [horasViewPeriod, setHorasViewPeriod] = useState<string | null>(null);
  // Arrastre tipo Excel en Horas: copia un valor hacia abajo por columna.
  const [fillDrag, setFillDrag] = useState<{
    col: string;
    startRow: number;
    endRow: number;
    value: string;
  } | null>(null);
  // Meses que YA tienen datos guardados (para pintar verde/gris en el selector).
  const [percDataPeriods, setPercDataPeriods] = useState<Set<string>>(new Set());
  const [sepsDataPeriods, setSepsDataPeriods] = useState<Set<string>>(new Set());
  const [horasDataPeriods, setHorasDataPeriods] = useState<Set<string>>(new Set());
  // Servicio que el ADMIN elige para ver/editar (el admin no tiene servicio propio).
  const [adminSelectedServiceId, setAdminSelectedServiceId] = useState<string>("");
  // Dropdown profesional de "Elegir servicio" (admin/supervisor).
  const [adminServicePickerOpen, setAdminServicePickerOpen] = useState(false);
  const [adminServiceQuery, setAdminServiceQuery] = useState("");
  // Division seleccionada dentro del dropdown "Elegir servicio" (navegacion en 2
  // niveles: primero las divisiones, luego sus servicios). null = mostrar divisiones.
  const [adminPickerGroup, setAdminPickerGroup] = useState<string | null>(null);
  const [tableValues, setTableValues] = useState<TableValues>({});
  // Filas PERC agregadas a mano y filas oficiales ocultas (admin/supervisores),
  // por servicio+mes. Se guardan en el doc serviceTabulators junto con los valores.
  const [percExtraRows, setPercExtraRows] = useState<PercExtraRow[]>([]);
  const [percHiddenKeys, setPercHiddenKeys] = useState<string[]>([]);
  const [sepsValues, setSepsValues] = useState<SepsValues>({});
  // Filas agregadas a mano y filas ocultas del SEPS (admin/supervisores). Se
  // guardan POR MES junto con los valores del tabulador SEPS del servicio.
  const [sepsExtraRows, setSepsExtraRows] = useState<SepsExtraRow[]>([]);
  const [sepsHiddenKeys, setSepsHiddenKeys] = useState<string[]>([]);
  // Comentarios de revision del SEPS (los deja el revisor/admin; los ve el servicio).
  const [sepsComments, setSepsComments] = useState<SepsComment[]>([]);
  const [sepsCommentDraft, setSepsCommentDraft] = useState("");
  const [isSavingSeps, setIsSavingSeps] = useState(false);
  const [isLoadingSeps, setIsLoadingSeps] = useState(false);
  // Tablas SEPS abiertas (colapsables). Por defecto solo la primera.
  const [openSepsTables, setOpenSepsTables] = useState<Set<string>>(new Set());
  // Grupos de "Habilitar tableros" abiertos (colapsables). Por defecto solo el primero.
  // Todos los bloques arrancan contraidos (incluido el de Direccion).
  const [openOverrideGroups, setOpenOverrideGroups] = useState<Set<string>>(() => new Set());
  const [horasEmployees, setHorasEmployees] = useState<HorasEmployee[]>([]);
  const [horasEmployeeToRemove, setHorasEmployeeToRemove] = useState<number | null>(null);
  const [isSavingHoras, setIsSavingHoras] = useState(false);
  const [isLoadingHoras, setIsLoadingHoras] = useState(false);
  // Importacion/exportacion de Horas por Excel (servicios grandes, p.ej. Enfermeria).
  const horasFileInputRef = useRef<HTMLInputElement>(null);
  const [isImportingHoras, setIsImportingHoras] = useState(false);
  // Importacion de un SEPS diario (p.ej. Banco de Sangre) desde su plantilla Excel oficial.
  const sepsFileInputRef = useRef<HTMLInputElement>(null);
  const [isImportingSeps, setIsImportingSeps] = useState(false);
  // Paginacion de la tabla de Horas: se renderiza una ventana de filas a la vez para
  // que servicios enormes (p.ej. Enfermeria, 700+ empleados) no congelen la pagina.
  const [horasVisibleCount, setHorasVisibleCount] = useState(HORAS_PAGE_SIZE);
  // "Completo" del modulo Horas: solo true cuando el usuario GUARDO (no por el seed).
  const [horasSaved, setHorasSaved] = useState(false);
  // El tabulador de Horas arranca colapsado para una pagina principal mas limpia.
  const [horasCollapsed, setHorasCollapsed] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showBoardModal, setShowBoardModal] = useState(false);
  // Menu lateral colapsable: en PC se contrae para dar espacio; en movil es cajon.
  const [menuOpen, setMenuOpen] = useState(true);
  // Al bajar la pantalla, el boton de menu se vuelve translucido (menos invasivo).
  const [menuScrolled, setMenuScrolled] = useState(false);
  // Navegacion movil "una pantalla a la vez": que seccion se muestra. En PC se
  // ignora (se ve el panel completo). "home" = pantalla de inicio con resumen.
  const [mobileView, setMobileView] = useState<string>("home");
  // Tabulador PERC en movil (acordeon): se muestran de 5 en 5, todas contraidas,
  // y solo se abre la que el usuario elige.
  const [percVisibleCount, setPercVisibleCount] = useState(5);
  const [percOpenCard, setPercOpenCard] = useState<number | null>(null);
  const [percGoToOpen, setPercGoToOpen] = useState(false);
  const [percGoToQuery, setPercGoToQuery] = useState("");
  // Modal de confirmacion al salir de la app (boton atras estando en Inicio).
  const [showExitModal, setShowExitModal] = useState(false);
  const exitingRef = useRef(false);
  // Espejo del estado de UI para el handler del boton atras (evita closures viejos).
  const backRef = useRef({ menuOpen: false, mobileView: "home", overlay: false, exitOpen: false });
  // Mini estadistica por modulo (PERC/SEPS/Horas) al tocar el menu del modulo.
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsModule, setStatsModule] = useState<ModuleId>("perc");
  // Bandeja de solicitudes de habilitacion de tableros.
  const [captureRequests, setCaptureRequests] = useState<CaptureRequest[]>([]);
  // Avisos tipo "WhatsApp" (banner) cuando llega una solicitud nueva (admin/supervisor).
  const [toastNotifs, setToastNotifs] = useState<
    { id: string; title: string; body: string }[]
  >([]);
  const requestsReadyRef = useRef(false);
  const signupReadyRef = useRef(false);
  const supportReadyRef = useRef(false);
  // Centro de Soporte: tickets, modal de reporte y bandeja.
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportCategory, setSupportCategory] = useState<SupportTicket["category"]>("error");
  const [supportUrgency, setSupportUrgency] = useState<SupportTicket["urgency"]>("media");
  const [supportMessage, setSupportMessage] = useState("");
  const [isSendingSupport, setIsSendingSupport] = useState(false);
  const [supportBusyId, setSupportBusyId] = useState("");
  // Casita con aviso: verde (aprobada/nueva) o rojo (rechazada), con etiqueta temporal.
  const [casitaAlert, setCasitaAlert] = useState(false);
  const [casitaTone, setCasitaTone] = useState<"new" | "approved" | "rejected">("new");
  const [casitaLabel, setCasitaLabel] = useState<string | null>(null);
  const notifyConfigRef = useRef<{
    isAdmin: boolean;
    isSupervisor: boolean;
    modules: string[];
    uid: string;
  }>({ isAdmin: false, isSupervisor: false, modules: [], uid: "" });
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestModuleId, setRequestModuleId] = useState<ModuleId>("perc");
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [requestBusyId, setRequestBusyId] = useState("");
  const [adminUsers, setAdminUsers] = useState<ManagedUser[]>([]);
  const [adminDrafts, setAdminDrafts] = useState<Record<string, AdminDraft>>({});
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreatingManagedUser, setIsCreatingManagedUser] = useState(false);
  const [isExportingMonthlyReport, setIsExportingMonthlyReport] = useState(false);
  const [isExportingServiceProduction, setIsExportingServiceProduction] = useState(false);
  // Previsualizacion (modal) del consolidado COMPLETO Produccion de Servicio antes
  // de descargar el Excel (incluye los datos del Censo ya integrados). El mes es
  // seleccionable y ESTRICTO: el consolidado muestra el censo de ESE mismo mes.
  const [showCensoConsolidadoPreview, setShowCensoConsolidadoPreview] = useState(false);
  const [consolidadoPreview, setConsolidadoPreview] = useState<ConsolidadoRow[] | null>(null);
  const [consolidadoPeriod, setConsolidadoPeriod] = useState("");
  const [isLoadingConsolidado, setIsLoadingConsolidado] = useState(false);
  const [adminBusyUserId, setAdminBusyUserId] = useState("");
  // Usuario seleccionado en la vista maestro-detalle de "Usuarios y permisos".
  const [adminSelectedUserUid, setAdminSelectedUserUid] = useState<string | null>(null);
  const [adminUserQuery, setAdminUserQuery] = useState("");
  const [calendarOverrides, setCalendarOverrides] = useState<Record<string, string[]>>({});
  // El calendario anual se quito de la vista; conservamos el setter por compatibilidad.
  const [, setPublicDashboardMonths] = useState<PublicDashboardMonth[]>([]);
  const [publicDashboardGroups, setPublicDashboardGroups] = useState<PublicDashboardGroup[]>([]);
  const [publicCompletedCount, setPublicCompletedCount] = useState(0);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [calendarEditorPeriodId, setCalendarEditorPeriodId] = useState(() => getPeriodId(new Date()));
  // Rango de fechas no habiles a agregar de una sola vez (Desde / Hasta).
  const [calendarRangeStart, setCalendarRangeStart] = useState("");
  const [calendarRangeEnd, setCalendarRangeEnd] = useState("");
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);
  // Overrides de tableros (reabiertos/cerrados) por id `${periodId}__${serviceId}__${moduleId}`.
  const [captureOverrides, setCaptureOverrides] = useState<CaptureOverridesMap>({});
  // Default = periodo que se esta cerrando (mes anterior), que es el ciclo activo.
  const [overridePanelPeriodId, setOverridePanelPeriodId] = useState(() =>
    getClosingPeriodId(new Date()),
  );
  const [overrideBusyKey, setOverrideBusyKey] = useState("");
  // Modal para elegir mes/año al "Abrir" un tablero en Habilitar tableros.
  const [captureOpenTarget, setCaptureOpenTarget] = useState<{
    serviceId: string;
    serviceName: string;
    moduleId: ModuleId;
  } | null>(null);
  const [captureOpenPeriod, setCaptureOpenPeriod] = useState("");
  const [overrideServiceQuery, setOverrideServiceQuery] = useState("");
  const [activeSidebarSection, setActiveSidebarSection] = useState("panel-overview");
  const [panelTheme, setPanelTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") {
      return "dark";
    }

    const savedTheme = window.localStorage.getItem(PANEL_THEME_STORAGE_KEY);
    return savedTheme === "light" ? "light" : "dark";
  });
  const [firestoreUnavailable, setFirestoreUnavailable] = useState(false);
  const [firestoreStatusReady, setFirestoreStatusReady] = useState(false);
  // Asistente virtual (robot) con preguntas frecuentes (chat interactivo).
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMsgs, setAssistantMsgs] = useState<
    { from: "bot" | "user"; text: string; action?: { id: AssistantActionId; label: string } }[]
  >([]);
  const [assistantInput, setAssistantInput] = useState("");
  const [botTyping, setBotTyping] = useState(false);
  const [assistantCat, setAssistantCat] = useState<AssistantCategory>("Captura");
  // Panel de sugerencias (categorias/FAQ) plegable — el chat arranca limpio.
  const [assistantSuggestOpen, setAssistantSuggestOpen] = useState(false);
  const [assistantDragOver, setAssistantDragOver] = useState(false);
  const assistantFileRef = useRef<HTMLInputElement>(null);
  // Configuracion de la vista pedida por chat (tema, acento, tipografia, tamano,
  // fondo, widgets). Se aplica al instante sobre las preferencias.
  function applyAssistantConfig(id: string) {
    if (id === "cfg_theme_dark") return setPanelTheme("dark");
    if (id === "cfg_theme_light") return setPanelTheme("light");
    if (id.startsWith("cfg_accent_")) return updateUiPrefs({ accent: id.replace("cfg_accent_", "") });
    if (id.startsWith("cfg_font_")) return updateUiPrefs({ font: id.replace("cfg_font_", "") });
    if (id.startsWith("cfg_size_")) return updateUiPrefs({ fontSize: id.replace("cfg_size_", "") });
    if (id.startsWith("cfg_bg_")) return updateUiPrefs({ background: id.replace("cfg_bg_", "") });
    if (id === "cfg_widget_greeting") return updateUiPrefs({ showGreeting: !uiPrefs.showGreeting });
    if (id === "cfg_widget_clock") return updateUiPrefs({ showClock: !uiPrefs.showClock });
  }

  // Ejecuta la accion que el asistente propone (navegar, abrir modal, guardar...).
  function runAssistantAction(id: AssistantActionId) {
    if (id.startsWith("cfg_")) {
      applyAssistantConfig(id);
      return;
    }
    switch (id) {
      case "go_inicio":
        handleSidebarNavigation("panel-overview");
        break;
      case "go_perc":
        handleSidebarNavigation("panel-tabulator");
        break;
      case "go_seps":
        handleSidebarNavigation("panel-seps");
        break;
      case "go_horas":
        handleSidebarNavigation("panel-horas");
        break;
      case "go_docs":
        runSidebarItem("panel-docs");
        break;
      case "go_config":
        runSidebarItem("panel-config");
        break;
      case "change_password":
        setError("");
        setMessage("");
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswordText(false);
        setShowPasswordModal(true);
        break;
      case "toggle_theme":
        handleTogglePanelTheme();
        break;
      case "sign_out":
        void handleSignOut();
        break;
      case "open_support":
        setError("");
        setMessage("");
        setShowSupportModal(true);
        break;
      case "request_enable":
        runSidebarItem("panel-request-form");
        break;
      case "save_perc":
        void handleSave();
        break;
      case "save_seps":
        void handleSaveSeps();
        break;
      case "save_horas":
        void handleSaveHoras();
        break;
    }
  }

  // Si el usuario pide GUARDAR pero el tabulador esta vacio: en vez de guardar en
  // blanco, avisa que no hay datos y ofrece abrir ese tabulador para cargarlos.
  function assistantSaveGuard(
    id: AssistantActionId,
    ctx: AssistantContext,
  ): { text: string; navId: AssistantActionId } | null {
    if (id === "save_perc" && !ctx.hasPercData) {
      return {
        text: "Todavía no hay nada cargado en PERC este mes, así que no hay qué guardar. Primero escriba los números en la tabla y después lo guardamos. Le abro PERC.",
        navId: "go_perc",
      };
    }
    if (id === "save_seps" && !ctx.hasSepsData) {
      return {
        text: "Todavía no hay nada cargado en SEPS este mes. Primero complete la estadística y después lo guardamos. Le abro el tablero.",
        navId: "go_seps",
      };
    }
    if (id === "save_horas" && !ctx.hasHorasData) {
      return {
        text: "Todavía no hay horas cargadas este mes. Los nombres del personal ya vienen puestos, pero las horas las escribe usted. Le abro el tablero para cargarlas.",
        navId: "go_horas",
      };
    }
    return null;
  }

  // Construye el mensaje del bot para una accion, aplicando el guard de guardado.
  function buildActionMessage(
    id: AssistantActionId,
    label: string,
    reply: string,
    ctx: AssistantContext,
  ): { from: "bot"; text: string; action?: { id: AssistantActionId; label: string } } {
    const guard = assistantSaveGuard(id, ctx);
    if (guard) {
      return { from: "bot", text: guard.text, action: { id: guard.navId, label: getActionLabel(guard.navId) } };
    }
    return { from: "bot", text: reply, action: { id, label } };
  }

  // Asistente hibrido: 1) accion por palabras clave -> 2) charla basica -> 3)
  // preguntas frecuentes -> 4) respaldo con IA (Gemini) si hay clave configurada.
  async function pushAssistant(question: string, ctx: AssistantContext) {
    const q = question.trim();
    if (!q) return;
    setAssistantMsgs((current) => [...current, { from: "user", text: q }]);
    setAssistantInput("");
    setBotTyping(true);

    // 1) Accion por palabras clave (offline, instantaneo).
    const local = matchAction(q, ctx);
    if (local) {
      const msg = buildActionMessage(local.id, local.label, local.reply, ctx);
      window.setTimeout(() => {
        setAssistantMsgs((current) => [...current, msg]);
        setBotTyping(false);
      }, 450);
      return;
    }

    // 2) Charla basica (saludos, gracias, despedidas): offline e instantaneo.
    const small = matchSmalltalk(q);
    if (small) {
      window.setTimeout(() => {
        setAssistantMsgs((current) => [...current, { from: "bot", text: small }]);
        setBotTyping(false);
      }, 450);
      return;
    }

    // 3) Base de preguntas frecuentes (offline).
    const faq = answerAssistant(q);
    if (faq.found) {
      window.setTimeout(() => {
        setAssistantMsgs((current) => [...current, { from: "bot", text: faq.text }]);
        setBotTyping(false);
      }, 450);
      return;
    }

    // 4) Respaldo con IA. Si no hay clave, la API responde con un mensaje guia.
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          context: ctx,
          availableActions: getAvailableActions(ctx),
        }),
      });
      const data = await res.json();
      const reply =
        typeof data?.reply === "string" && data.reply.trim() ? data.reply.trim() : faq.text;
      const actionId: AssistantActionId | null =
        typeof data?.actionId === "string" && KNOWN_ACTION_IDS.includes(data.actionId)
          ? (data.actionId as AssistantActionId)
          : null;
      setAssistantMsgs((current) => [
        ...current,
        actionId
          ? buildActionMessage(actionId, getActionLabel(actionId), reply, ctx)
          : { from: "bot", text: reply },
      ]);
    } catch {
      setAssistantMsgs((current) => [...current, { from: "bot", text: faq.text }]);
    } finally {
      setBotTyping(false);
    }
  }
  // El asistente recibe un Excel (arrastrado o adjuntado) y lo carga en el
  // tabulador que corresponda a la cuenta (SEPS / Distribucion de Horas / Insumos),
  // reutilizando el mismo importador oficial de cada modulo. Autocompleta el mes
  // actual; luego el usuario revisa y guarda.
  async function handleAssistantFile(file: File | undefined | null) {
    if (!file) return;
    const name = file.name || "archivo";
    if (!/\.xlsx?$/i.test(name)) {
      setAssistantMsgs((c) => [...c, { from: "bot", text: "Por ahora solo puedo leer archivos de Excel (.xlsx o .xls). Adjuntá el Excel de tu servicio y lo cargo." }]);
      return;
    }
    setAssistantMsgs((c) => [
      ...c,
      { from: "user", text: `📎 ${name}` },
      { from: "bot", text: "Estoy analizando el Excel y completando tu tabulador del mes actual…" },
    ]);
    setBotTyping(true);
    const fakeEvent = { target: { files: [file], value: "" } } as unknown as ChangeEvent<HTMLInputElement>;
    try {
      let target = "";
      if (sepsTemplate) {
        target = "SEPS";
        await handleUploadSepsFile(fakeEvent);
      } else if (horasTemplate) {
        target = "Distribución de Horas";
        await handleUploadHorasFile(fakeEvent);
      } else if (isAdmin || isSupervisor || isAlmacenOwner) {
        target = "Insumos de Almacén";
        await handleUploadInsumosFile(fakeEvent);
      }
      if (!target) {
        setAssistantMsgs((c) => [...c, { from: "bot", text: "No encontré un tabulador para cargar este Excel desde tu cuenta. Entrá al servicio correspondiente y volvé a intentarlo." }]);
        return;
      }
      setAssistantMsgs((c) => [
        ...c,
        { from: "bot", text: `Listo ✅ Cargué el Excel en tu tabulador de ${target}. Revisá los datos y, cuando estés conforme, tocá «Guardar».` },
      ]);
    } catch {
      setAssistantMsgs((c) => [...c, { from: "bot", text: "No pude leer ese Excel. Verificá que sea la plantilla del mes de tu servicio e intentá de nuevo." }]);
    } finally {
      setBotTyping(false);
    }
  }

  function openAssistant() {
    setAssistantOpen((open) => !open);
  }
  // Empezar una conversacion nueva: borra el historial y deja el chat vacio.
  function startNewAssistantChat() {
    setAssistantInput("");
    setBotTyping(false);
    setAssistantMsgs([]);
  }
  // Preferencias de personalizacion (menu Configuracion).
  const [showConfigModal, setShowConfigModal] = useState(false);
  // Documentos (control anual de entregas a Calidad).
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [docsValues, setDocsValues] = useState<DocValues>({});
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsSaving, setDocsSaving] = useState(false);
  const [docsLoaded, setDocsLoaded] = useState(false);
  // Censo Diario de Pacientes (por mes). Editable solo por AMONTES.
  // Arranca en el mismo mes que el PERC/consolidado (el que se esta cerrando), para
  // que lo que se llena en el censo alimente el consolidado sin desajuste de mes.
  // AMONTES puede cambiar de mes libremente con el selector.
  const [censoPeriod, setCensoPeriod] = useState(() => getClosingPeriodId(new Date()));
  const [censoValues, setCensoValues] = useState<CensoValues>({});
  const [censoExtraRows, setCensoExtraRows] = useState<CensoRow[]>([]);
  const [isLoadingCenso, setIsLoadingCenso] = useState(false);
  const [isSavingCenso, setIsSavingCenso] = useState(false);
  const [censoLoadedPeriod, setCensoLoadedPeriod] = useState<string | null>(null);
  // Historial de deshacer/rehacer del censo (para correcciones de digitacion).
  const [censoUndoStack, setCensoUndoStack] = useState<
    { values: CensoValues; extraRows: CensoRow[] }[]
  >([]);
  const [censoRedoStack, setCensoRedoStack] = useState<
    { values: CensoValues; extraRows: CensoRow[] }[]
  >([]);
  // Insumos de Almacen (matriz de costos por mes). Editan admin + servicio "almacen".
  // Se guarda por MES en Firestore (coleccion "insumosAlmacen"). Sin cierre.
  const [insumosPeriod, setInsumosPeriod] = useState(() => getClosingPeriodId(new Date()));
  const [insumosValues, setInsumosValues] = useState<InsumosValues>({});
  const [isLoadingInsumos, setIsLoadingInsumos] = useState(false);
  const [isSavingInsumos, setIsSavingInsumos] = useState(false);
  const [isImportingInsumos, setIsImportingInsumos] = useState(false);
  const [insumosLoadedPeriod, setInsumosLoadedPeriod] = useState<string | null>(null);
  const insumosFileInputRef = useRef<HTMLInputElement>(null);
  const [insumosUndoStack, setInsumosUndoStack] = useState<InsumosValues[]>([]);
  const [insumosRedoStack, setInsumosRedoStack] = useState<InsumosValues[]>([]);
  // Filas agregadas a mano y filas oficiales ocultas (admin/supervisor). Se guardan
  // POR MES junto con los valores (igual que las filas extra del Censo diario).
  const [insumosExtraRows, setInsumosExtraRows] = useState<InsumoExtraRow[]>([]);
  const [insumosHiddenKeys, setInsumosHiddenKeys] = useState<string[]>([]);
  // La "gran tabla" de Insumos de Almacen arranca CONTRAIDA: al abrir la seccion
  // no se ve la tabla enorme, se muestra con el boton Mostrar/Ocultar. Solo estetico.
  const [insumosCollapsed, setInsumosCollapsed] = useState(true);
  // Submenus desplegables del menu lateral (p.ej. PERC -> Censo diario).
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_UI_PREFS;
    }
    try {
      const raw = window.localStorage.getItem(UI_PREFS_STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_UI_PREFS, ...(JSON.parse(raw) as Partial<UiPrefs>) };
      }
    } catch {
      // Ignorar JSON invalido.
    }
    return DEFAULT_UI_PREFS;
  });
  const updateUiPrefs = useCallback((patch: Partial<UiPrefs>) => {
    setUiPrefs((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignorar errores de almacenamiento.
      }
      return next;
    });
  }, []);

  // Servicio efectivo: el admin usa el que elige; el resto, su servicio asignado.
  const isAdminLike =
    !!serviceProfile?.permissions.canManageUsers || serviceProfile?.role === "admin";
  const isSupervisorLike = serviceProfile?.role === "supervisor";
  // El admin y los supervisores eligen el servicio a ver; el resto usa el suyo.
  const effectiveServiceId =
    isAdminLike || isSupervisorLike
      ? adminSelectedServiceId || undefined
      : serviceProfile?.serviceId;
  const currentService = useMemo(
    () => getServiceById(effectiveServiceId),
    [effectiveServiceId],
  );
  // Columna "de si mismo": un servicio no puede reportar produccion para su propio
  // centro de costo (ej. Banco de Sangre -> 575). Esa celda queda bloqueada.
  const percSelfHeader = useMemo(() => {
    if (!currentService) return null;
    const name = currentService.name.trim().toLowerCase();
    return (
      TABULATOR_HEADERS.find(
        (h) => h.replace(/^\d+-/, "").trim().toLowerCase() === name,
      ) ?? null
    );
  }, [currentService]);
  // Conjunto de centros de costo bloqueados para el servicio actual: su propia
  // columna + los productos configurados en PERC_BLOCKED_BY_SERVICE.
  const percBlockedHeaders = useMemo(() => {
    const set = new Set<string>();
    if (percSelfHeader) set.add(percSelfHeader);
    if (currentService) {
      for (const code of PERC_BLOCKED_BY_SERVICE[currentService.id] ?? []) {
        const h = TABULATOR_HEADERS.find(
          (x) => x.startsWith(`${code}-`) || x === code,
        );
        if (h) set.add(h);
      }
    }
    return set;
  }, [currentService, percSelfHeader]);
  // periodId = periodo de PRODUCCION que se captura/cierra = MES ANTERIOR.
  // windowPeriodId = mes calendario actual, donde ocurre la ventana de captura y al
  // que pertenecen las fechas no habiles del calendario.
  const periodId = useMemo(() => getClosingPeriodId(now), [now]);
  const windowPeriodId = useMemo(() => getPeriodId(now), [now]);
  const currentBlockedDates = useMemo(
    () => calendarOverrides[windowPeriodId] || [],
    [calendarOverrides, windowPeriodId],
  );
  const captureWindow = useMemo(
    () => getCaptureWindow(now, currentBlockedDates),
    [currentBlockedDates, now],
  );
  const periodLabel = useMemo(() => getPeriodLabel(periodId), [periodId]);
  // Año del periodo que se cierra (puede ser el anterior en enero). Lo usa el tablero.
  const currentYear = useMemo(() => Number.parseInt(periodId.split("-")[0], 10), [periodId]);
  // Estructura ESTATICA del tablero (desde SERVICE_DEFINITIONS): asegura que las
  // tarjetas y los meses SIEMPRE se rendericen aunque Firestore falle/tarde. El
  // estado real de completo se superpone cuando los datos cargan.
  const fallbackDashboardGroups = useMemo<PublicDashboardGroup[]>(
    () =>
      buildServiceGroups().map((group) => ({
        ...group,
        services: group.services.map((service) => {
          const hasPerc = getAreaById(service.id)?.modules.includes("perc") ?? false;
          const modules: PublicModuleStatus[] = [];
          if (hasPerc) {
            modules.push({ label: "PERC", completed: false });
          }
          if (getSepsTemplate(service.id)) {
            modules.push({ label: "SEPS", completed: false });
          }
          if (getHorasTemplate(service.id)) {
            modules.push({ label: "Horas", completed: false });
          }
          return { ...service, completed: false, modules };
        }),
      })),
    [],
  );
  const dashboardGroups =
    publicDashboardGroups.length > 0 ? publicDashboardGroups : fallbackDashboardGroups;
  // Estadistica general por modulo (cuantas dependencias completaron PERC/SEPS/Horas).
  const moduleStats = useMemo(() => {
    const base: Record<string, { done: number; total: number }> = {
      PERC: { done: 0, total: 0 },
      SEPS: { done: 0, total: 0 },
      Horas: { done: 0, total: 0 },
    };
    for (const group of dashboardGroups) {
      for (const service of group.services) {
        for (const mod of service.modules) {
          const stat = base[mod.label];
          if (stat) {
            stat.total += 1;
            if (mod.completed) stat.done += 1;
          }
        }
      }
    }
    return base;
  }, [dashboardGroups]);
  const welcomeName = useMemo(() => {
    return serviceProfile?.name || user?.displayName || user?.email?.split("@")[0] || "Usuario";
  }, [serviceProfile?.name, user?.displayName, user?.email]);
  const isAdmin = !!serviceProfile?.permissions.canManageUsers || serviceProfile?.role === "admin";
  // Revisor de SEPS (Juan Carlos Miranda, usuario "jcmiranda"): nivel de supervisor
  // + permiso de EDICION del SEPS de cualquier servicio y de dejar comentarios.
  const isSepsStaff = normalizeKey(user?.email || "") === normalizeKey("jcmiranda@perc-hnes.app");
  const isSupervisor = serviceProfile?.role === "supervisor" || isSepsStaff;
  // Censo Diario: lo VEN admin y supervisores (ningun servicio). Lo EDITAN AMONTES
  // y los administradores (por temas de calidad y control).
  const canViewCenso = isAdmin || isSupervisor;
  const canEditCenso =
    isAdmin || normalizeKey(serviceProfile?.username || "") === CENSO_EDITOR_USERNAME;
  // Insumos de Almacen: el tabulador PERTENECE al Depto. de Abastecimiento (servicio
  // "almacen"). Lo EDITAN los administradores (incluye a Flor Fuentes) y el usuario del
  // servicio "almacen". Lo VEN ademas los supervisores.
  const isAlmacenOwner = serviceProfile?.serviceId === "almacen";
  const canEditInsumos = isAdmin || isAlmacenOwner;
  const canViewInsumos = isAdmin || isSupervisor || isAlmacenOwner;
  // Agregar/quitar/renombrar filas del tabulador de Insumos: SOLO admin y
  // supervisores. El servicio Almacen captura valores pero NO gestiona filas.
  // Nota: para PERSISTIR una fila hace falta permiso de escritura del doc; los
  // supervisores lo tendran cuando se publiquen las reglas de Firestore.
  const canManageInsumosRows = isAdmin || isSupervisor;
  // Filas efectivas (plantilla + extras - ocultas). Se usa en el render y en los
  // handlers de pegado/navegacion, por eso se memoiza a nivel de componente.
  const insumosEffectiveRows = useMemo(
    () => buildInsumosEffectiveRows(insumosExtraRows, insumosHiddenKeys),
    [insumosExtraRows, insumosHiddenKeys],
  );
  // Filas efectivas del censo (las 8 base + las que AMONTES haya agregado).
  const censoRows: CensoRow[] = [...CENSO_BASE_ROWS, ...censoExtraRows];
  // Config para el detector de solicitudes nuevas (avisos tipo WhatsApp).
  // Usamos el uid de AUTENTICACION (coincide con requestedByUid de las solicitudes).
  notifyConfigRef.current = {
    isAdmin,
    isSupervisor,
    modules: serviceProfile?.supervisorModules ?? [],
    uid: user?.uid ?? serviceProfile?.uid ?? "",
  };
  // Servicios disponibles en el dropdown "Elegir servicio" (admin = todos;
  // supervisor = solo los modulos que supervisa).
  const adminServiceOptions = useMemo(() => {
    const base = SERVICE_DEFINITIONS.filter(
      (service) =>
        isAdmin ||
        (getAreaById(service.id)?.modules.some((m) =>
          serviceProfile?.supervisorModules.includes(m),
        ) ??
          false),
    );
    const q = adminServiceQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((service) => {
      if (service.name.toLowerCase().includes(q)) return true;
      const aliases = SERVICE_SEARCH_ALIASES[service.id];
      return aliases ? aliases.some((alias) => alias.includes(q)) : false;
    });
  }, [isAdmin, serviceProfile, adminServiceQuery]);
  // Servicios visibles agrupados por division, para la navegacion en 2 niveles del
  // dropdown "Elegir servicio". Solo se incluyen las divisiones que tienen servicios.
  const adminServiceGroups = useMemo(() => {
    const base = SERVICE_DEFINITIONS.filter(
      (service) =>
        isAdmin ||
        (getAreaById(service.id)?.modules.some((m) =>
          serviceProfile?.supervisorModules.includes(m),
        ) ??
          false),
    );
    const byGroup = new Map<string, ServiceDefinition[]>();
    for (const service of base) {
      const gid = SERVICE_GROUP_BY_ID[service.id] || "apoyo";
      const arr = byGroup.get(gid) || [];
      arr.push(service);
      byGroup.set(gid, arr);
    }
    // Orden preferido dentro de Direccion: ESDOMED primero, luego Planificacion y
    // Calidad; el resto conserva su orden natural.
    const DIRECCION_PRIORITY: Record<string, number> = {
      esdomed: 0,
      planificacion: 1,
    };
    return Object.entries(SERVICE_GROUP_LABELS)
      .map(([id, title]) => {
        let services = byGroup.get(id) || [];
        if (id === "direccion") {
          services = services
            .slice()
            .sort(
              (a, b) =>
                (DIRECCION_PRIORITY[a.id] ?? 99) - (DIRECCION_PRIORITY[b.id] ?? 99),
            );
        }
        return { id, title, services };
      })
      .filter((group) => group.services.length > 0);
  }, [isAdmin, serviceProfile]);
  // Modulos que el usuario puede habilitar/deshabilitar: el admin todos; el supervisor
  // solo los suyos. Determina las columnas del panel "Habilitar tableros".
  const toggleableModules: ModuleId[] = !serviceProfile?.permissions.canToggleCapture
    ? []
    : isAdmin
      ? [...MODULE_ORDER]
      : MODULE_ORDER.filter((moduleId) => serviceProfile.supervisorModules.includes(moduleId));
  // Estado efectivo de la captura de Horas del servicio logueado (la ventana natural
  // puede estar reabierta o cerrada por un supervisor para este periodo).
  const currentServiceCaptureOpen = useMemo(() => {
    const override = currentService
      ? captureOverrides[getCaptureOverrideId(periodId, currentService.id, "distribucion")]
      : undefined;

    return effectiveCaptureOpen(captureWindow.isOpen, override);
  }, [captureOverrides, captureWindow.isOpen, currentService, periodId]);
  // SEPS: plantilla del servicio (si tiene), ventana de doble fase y estado efectivo.
  const sepsTemplate = useMemo(
    () => getSepsTemplate(effectiveServiceId),
    [effectiveServiceId],
  );
  const horasTemplate = useMemo(
    () => getHorasTemplate(effectiveServiceId),
    [effectiveServiceId],
  );
  const sepsWindow = useMemo(
    () => getSepsWindow(now, currentBlockedDates),
    [now, currentBlockedDates],
  );
  const sepsPeriodId = sepsWindow.periodId;
  const sepsPeriodLabel = useMemo(() => getPeriodLabel(sepsPeriodId), [sepsPeriodId]);
  const sepsDayColumns = useMemo(() => getDayColumns(sepsPeriodId), [sepsPeriodId]);
  const sepsCaptureOpen = useMemo(() => {
    const override = sepsTemplate
      ? captureOverrides[getCaptureOverrideId(sepsPeriodId, sepsTemplate.serviceId, "sesps")]
      : undefined;

    return effectiveCaptureOpen(sepsWindow.isOpen, override);
  }, [captureOverrides, sepsWindow.isOpen, sepsTemplate, sepsPeriodId]);
  const calendarEditorBlockedDates = useMemo(
    () => calendarOverrides[calendarEditorPeriodId] || [],
    [calendarEditorPeriodId, calendarOverrides],
  );
  const currentMonthProgress = Math.round(
    (publicCompletedCount / Math.max(SERVICE_DEFINITIONS.length, 1)) * 100,
  );
  const assignedServiceUsers = useMemo(() => {
    const assignedByService = new Map<string, ManagedUser>();

    for (const managedUser of adminUsers) {
      if (managedUser.serviceId) {
        assignedByService.set(managedUser.serviceId, managedUser);
      }
    }

    return assignedByService;
  }, [adminUsers]);
  const selectedAdminCreateService = useMemo(
    () => getServiceById(adminCreateForm.serviceId),
    [adminCreateForm.serviceId],
  );

  const persistAdminUsersCache = useCallback((users: ManagedUser[]) => {
    try {
      window.localStorage.setItem(ADMIN_USERS_CACHE_STORAGE_KEY, JSON.stringify(users));
    } catch {
      // Ignore local storage access issues.
    }
  }, []);

  const readAdminUsersCache = useCallback(() => {
    try {
      const rawValue = window.localStorage.getItem(ADMIN_USERS_CACHE_STORAGE_KEY);

      if (!rawValue) {
        return null;
      }

      const parsedValue = JSON.parse(rawValue) as ManagedUser[];
      return Array.isArray(parsedValue) ? parsedValue : null;
    } catch {
      return null;
    }
  }, []);

  const applyAdminUsers = useCallback((users: ManagedUser[]) => {
    setAdminUsers(users);
    setAdminDrafts(buildAdminDrafts(users));
    persistAdminUsersCache(users);
  }, [persistAdminUsersCache]);

  const clearAdminUsersState = useCallback(() => {
    setAdminUsers([]);
    setAdminDrafts({});

    try {
      window.localStorage.removeItem(ADMIN_USERS_CACHE_STORAGE_KEY);
    } catch {
      // Ignore local storage access issues.
    }
  }, []);
  const calendarPreviewDate = useMemo(() => {
    if (!calendarEditorPeriodId) {
      return null;
    }

    const [yearText, monthText] = calendarEditorPeriodId.split("-");
    const year = Number(yearText);
    const month = Number(monthText);

    if (!year || !month) {
      return null;
    }

    return new Date(year, month - 1, 1, 12, 0, 0, 0);
  }, [calendarEditorPeriodId]);
  // Al cambiar el mes a configurar, el rango "Desde/Hasta" salta a ese mes automaticamente.
  useEffect(() => {
    if (calendarEditorPeriodId) {
      setCalendarRangeStart(`${calendarEditorPeriodId}-01`);
      setCalendarRangeEnd(`${calendarEditorPeriodId}-01`);
    }
  }, [calendarEditorPeriodId]);
  const calendarPreviewWindow = useMemo(() => {
    if (!calendarPreviewDate) {
      return null;
    }

    return getCaptureWindow(calendarPreviewDate, calendarEditorBlockedDates);
  }, [calendarEditorBlockedDates, calendarPreviewDate]);

  async function handleFirestoreError(error: unknown) {
    if (!isFirestoreSetupError(error)) {
      return false;
    }

    setFirestoreUnavailable(true);
    try {
      window.localStorage.setItem(FIRESTORE_DISABLED_STORAGE_KEY, "true");
    } catch {
      // Ignore storage write issues.
    }
    setError(FIRESTORE_SETUP_MESSAGE);
    setMessage("");
    await shutdownFirestore();
    return true;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setFirestoreUnavailable(
          window.localStorage.getItem(FIRESTORE_DISABLED_STORAGE_KEY) === "true",
        );
      } catch {
        // Ignore storage access issues.
      }

      setFirestoreStatusReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_THEME_STORAGE_KEY, panelTheme);
    } catch {
      // Ignore local storage access issues.
    }
  }, [panelTheme]);

  // El boton de menu queda fijo arriba; al bajar la pantalla se vuelve translucido.
  useEffect(() => {
    const onScroll = () => setMenuScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mantener el espejo de UI al dia para el handler del boton "atras".
  backRef.current = {
    menuOpen,
    mobileView,
    overlay:
      showUsersModal ||
      showConfigModal ||
      showRequestsModal ||
      showBoardModal ||
      showPasswordModal ||
      showDocsModal ||
      showStatsModal ||
      showRequestForm ||
      showSupportModal ||
      adminServicePickerOpen,
    exitOpen: showExitModal,
  };

  // Boton "atras" de Android (movil/PWA): cierra menu/modales, vuelve a Inicio y,
  // estando en Inicio, pregunta si salir. Se registra una vez por sesion iniciada.
  useEffect(() => {
    if (typeof window === "undefined" || !user || !serviceProfile) {
      return;
    }
    // Solo en movil (en PC se respeta el boton atras del navegador).
    if (window.innerWidth >= 1280) {
      return;
    }
    window.history.pushState({ pulso: true }, "");

    const onPop = () => {
      if (exitingRef.current) return;
      const s = backRef.current;
      // 1) Cerrar lo que este abierto (menu, modales o el propio modal de salir).
      if (s.menuOpen || s.overlay || s.exitOpen) {
        setMenuOpen(false);
        setShowUsersModal(false);
        setShowConfigModal(false);
        setShowRequestsModal(false);
        setShowBoardModal(false);
        setShowPasswordModal(false);
        setShowDocsModal(false);
        setShowStatsModal(false);
        setShowRequestForm(false);
        setShowSupportModal(false);
        setAdminServicePickerOpen(false);
        setShowExitModal(false);
        window.history.pushState({ pulso: true }, "");
        return;
      }
      // 2) En una sub-pantalla: volver a Inicio.
      if (s.mobileView !== "home") {
        setMobileView("home");
        window.history.pushState({ pulso: true }, "");
        return;
      }
      // 3) En Inicio: preguntar si salir de la app.
      setShowExitModal(true);
      window.history.pushState({ pulso: true }, "");
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [user, serviceProfile]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    async function loadDashboard() {
      if (!firestoreStatusReady) {
        return;
      }

      if (firestoreUnavailable) {
        setIsLoadingDashboard(false);
        return;
      }

      setIsLoadingDashboard(true);

      try {
        const dashboard = await fetchPublicDashboard(currentYear, periodId);

        if (cancelled) {
          return;
        }

        setCalendarOverrides(dashboard.calendarOverrides);
        setPublicDashboardMonths(dashboard.months);
        setPublicDashboardGroups(dashboard.groups);
        setPublicCompletedCount(dashboard.completedCount);

        // Los overrides de tableros son opcionales para el tablero: si su lectura
        // falla (p.ej. reglas aun no publicadas), no debe romper el dashboard.
        try {
          const periodOverrides = await fetchCaptureOverridesForPeriod(periodId);

          if (!cancelled) {
            setCaptureOverrides((current) => ({ ...current, ...periodOverrides }));
          }
        } catch {
          // Ignorar: el tablero sigue funcionando sin overrides.
        }
      } catch (dashboardError) {
        if (await handleFirestoreError(dashboardError)) {
          if (!cancelled) {
            setPublicDashboardMonths([]);
            setPublicDashboardGroups([]);
            setPublicCompletedCount(0);
          }

          return;
        }

        if (!cancelled) {
          setPublicDashboardMonths([]);
          setPublicDashboardGroups([]);
          setPublicCompletedCount(0);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDashboard(false);
        }
      }
    }

    timeoutId = window.setTimeout(() => {
      void loadDashboard();
    }, 180);

    return () => {
      cancelled = true;

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [currentYear, firestoreStatusReady, firestoreUnavailable, periodId]);

  // Carga los overrides del periodo elegido en el panel "Habilitar tableros" cuando
  // el usuario tiene esa potestad y cambia de periodo.
  useEffect(() => {
    if (!serviceProfile?.permissions.canToggleCapture || firestoreUnavailable) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const periodOverrides = await fetchCaptureOverridesForPeriod(overridePanelPeriodId);

        if (!cancelled) {
          setCaptureOverrides((current) => ({ ...current, ...periodOverrides }));
        }
      } catch (overridesError) {
        await handleFirestoreError(overridesError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    overridePanelPeriodId,
    serviceProfile?.permissions.canToggleCapture,
    firestoreUnavailable,
  ]);

  // Carga el tabulador SEPS del servicio logueado para el periodo activo de su ventana.
  useEffect(() => {
    if (firestoreUnavailable || !user) {
      return;
    }

    let cancelled = false;

    void (async () => {
      if (!sepsTemplate) {
        if (!cancelled) {
          setSepsValues({});
          setSepsExtraRows([]);
          setSepsHiddenKeys([]);
          setSepsComments([]);
        }
        return;
      }

      try {
        const data = await fetchSepsDataForPeriod(sepsTemplate, sepsPeriodId);
        if (!cancelled) {
          setSepsValues(data.values);
          setSepsExtraRows(data.extraRows);
          setSepsHiddenKeys(data.hiddenKeys);
          setSepsComments(data.comments);
        }
      } catch (sepsError) {
        if (await handleFirestoreError(sepsError)) {
          return;
        }
        if (!cancelled) {
          setSepsValues(buildEmptySeps(sepsTemplate, sepsPeriodId));
          setSepsExtraRows([]);
          setSepsHiddenKeys([]);
          setSepsComments([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sepsTemplate, sepsPeriodId, firestoreUnavailable, user]);

  // Carga el tabulador de Horas (empleados) del periodo de cierre del servicio.
  useEffect(() => {
    if (firestoreUnavailable || !user) {
      return;
    }

    let cancelled = false;

    void (async () => {
      if (!horasTemplate) {
        if (!cancelled) {
          setHorasEmployees([]);
          setHorasSaved(false);
        }
        return;
      }

      try {
        const result = await fetchHorasForPeriod(horasTemplate, periodId);
        if (!cancelled) {
          setHorasEmployees(result.employees);
          setHorasSaved(result.saved);
        }
      } catch (horasError) {
        if (await handleFirestoreError(horasError)) {
          return;
        }
        if (!cancelled) {
          setHorasEmployees(seedHorasEmployees(horasTemplate));
          setHorasSaved(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [horasTemplate, periodId, firestoreUnavailable, user]);

  // Al cambiar de servicio o periodo, reinicia la ventana de filas visibles de Horas.
  useEffect(() => {
    setHorasVisibleCount(HORAS_PAGE_SIZE);
  }, [horasTemplate, periodId]);

  // Censo Diario: carga el mes seleccionado (solo para quienes pueden verlo).
  useEffect(() => {
    if (!canViewCenso || firestoreUnavailable || !user) {
      return;
    }
    void loadCenso(censoPeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [censoPeriod, canViewCenso, firestoreUnavailable, user]);

  // Insumos de Almacen: carga el mes seleccionado (solo para quienes pueden verlo).
  useEffect(() => {
    if (!canViewInsumos || firestoreUnavailable || !user) {
      return;
    }
    void loadInsumos(insumosPeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insumosPeriod, canViewInsumos, firestoreUnavailable, user]);

  // Al cargar la plantilla SEPS, todas las tablas/secciones arrancan COLAPSADAS
  // (apiladas, ninguna desplegada). El usuario abre la que necesite.
  useEffect(() => {
    setOpenSepsTables(new Set());
  }, [sepsTemplate]);

  // Meses con datos guardados por modulo (para colorear el selector de historial).
  useEffect(() => {
    if (firestoreUnavailable || !user || !currentService) {
      setPercDataPeriods(new Set());
      setSepsDataPeriods(new Set());
      setHorasDataPeriods(new Set());
      return;
    }

    let cancelled = false;
    const serviceId = currentService.id;

    const collectPeriods = async (coll: string) => {
      const snap = await getDocs(
        query(collection(db, coll), where("serviceId", "==", serviceId)),
      );
      const set = new Set<string>();
      snap.forEach((item) => {
        const value = (item.data() as { periodId?: unknown }).periodId;
        if (typeof value === "string") {
          set.add(value);
        }
      });
      return set;
    };

    void (async () => {
      try {
        const [perc, seps, horas] = await Promise.all([
          collectPeriods("serviceTabulators"),
          collectPeriods("sepsTabulators"),
          collectPeriods("horasTabulators"),
        ]);
        if (!cancelled) {
          setPercDataPeriods(perc);
          setSepsDataPeriods(seps);
          setHorasDataPeriods(horas);
        }
      } catch (presenceError) {
        await handleFirestoreError(presenceError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentService, firestoreUnavailable, user]);

  // Carga las solicitudes de habilitacion (bandeja). La coleccion es chica.
  useEffect(() => {
    if (firestoreUnavailable || !user || !firestoreStatusReady) {
      setCaptureRequests([]);
      return;
    }

    // Cada (re)suscripcion: la primera snapshot es la carga inicial (no avisa).
    requestsReadyRef.current = false;

    const toRequest = (item: {
      id: string;
      data: () => Record<string, unknown>;
    }): CaptureRequest => {
      const data = item.data();
      return {
        id: item.id,
        periodId: String(data.periodId ?? ""),
        periodLabel: String(data.periodLabel ?? ""),
        serviceId: String(data.serviceId ?? ""),
        serviceName: String(data.serviceName ?? ""),
        moduleId: (data.moduleId as ModuleId) ?? "perc",
        requestedByName: String(data.requestedByName ?? ""),
        requestedByUid: String(data.requestedByUid ?? ""),
        status: (data.status as CaptureRequest["status"]) ?? "pending",
        note: typeof data.note === "string" ? data.note : undefined,
        resolvedByName:
          typeof data.resolvedByName === "string" ? data.resolvedByName : undefined,
      };
    };

    const unsubscribe = onSnapshot(
      collection(db, "captureRequests"),
      (snap) => {
        const list: CaptureRequest[] = [];
        snap.forEach((item) => list.push(toRequest(item)));
        setCaptureRequests(list);

        // Avisar SOLO de solicitudes nuevas (despues de la carga inicial).
        if (!requestsReadyRef.current) {
          requestsReadyRef.current = true;
          return;
        }
        const cfg = notifyConfigRef.current;
        const modLabelOf = (moduleId: ModuleId) =>
          moduleId === "perc"
            ? "PERC"
            : moduleId === "sesps"
              ? "SEPS"
              : "Distribución de Horas";
        const pushNotif = (key: string, title: string, body: string) => {
          const notif = { id: `${key}-${Date.now()}`, title, body };
          setToastNotifs((prev) => [notif, ...prev].slice(0, 3));
          setCasitaAlert(true);
          window.setTimeout(() => {
            setToastNotifs((prev) => prev.filter((n) => n.id !== notif.id));
          }, 6000);
        };
        for (const change of snap.docChanges()) {
          const req = toRequest(change.doc);
          if (change.type === "added") {
            // Nueva solicitud entrante (para admin/supervisor).
            if (req.status !== "pending") continue;
            if (req.requestedByUid && req.requestedByUid === cfg.uid) continue;
            const relevant =
              cfg.isAdmin || (cfg.isSupervisor && cfg.modules.includes(req.moduleId));
            if (!relevant) continue;
            pushNotif(
              req.id,
              "Nueva solicitud de habilitación",
              `${req.serviceName} pidió habilitar ${modLabelOf(req.moduleId)} · ${req.periodLabel}`,
            );
            setCasitaTone("new");
          } else if (change.type === "modified") {
            // Tu propia solicitud fue resuelta (para el servicio que la pidio).
            if (req.requestedByUid !== cfg.uid) continue;
            if (req.status !== "approved" && req.status !== "rejected") continue;
            const approved = req.status === "approved";
            pushNotif(
              `${req.id}-${req.status}`,
              approved ? "Solicitud aprobada" : "Solicitud rechazada",
              `Tu pedido de ${modLabelOf(req.moduleId)} · ${req.periodLabel} fue ${
                approved ? "aprobado" : "rechazado"
              }.`,
            );
            setCasitaTone(approved ? "approved" : "rejected");
            const label = `Solicitud ${modLabelOf(req.moduleId)} ${
              approved ? "aprobada" : "rechazada"
            }`;
            setCasitaLabel(label);
            window.setTimeout(() => {
              setCasitaLabel((current) => (current === label ? null : current));
            }, 10000);
          }
        }
      },
      () => {
        // Si faltan reglas de captureRequests, no debe romper la app.
      },
    );

    return () => unsubscribe();
  }, [user, firestoreUnavailable, firestoreStatusReady]);

  // Centro de Soporte: tickets en tiempo real. Solo supervisores y admin leen la
  // bandeja (los servicios solo crean tickets, no los leen).
  useEffect(() => {
    if (firestoreUnavailable || !user || !firestoreStatusReady || (!isAdmin && !isSupervisor)) {
      setSupportTickets([]);
      return;
    }
    supportReadyRef.current = false;

    const toTicket = (item: {
      id: string;
      data: () => Record<string, unknown>;
    }): SupportTicket => {
      const d = item.data();
      const createdAt = d.createdAt as { toMillis?: () => number } | undefined;
      return {
        id: item.id,
        category: (d.category as SupportTicket["category"]) ?? "error",
        urgency: (d.urgency as SupportTicket["urgency"]) ?? "media",
        message: String(d.message ?? ""),
        reporterName: String(d.reporterName ?? ""),
        reporterUid: String(d.reporterUid ?? ""),
        reporterRole: String(d.reporterRole ?? ""),
        serviceId: String(d.serviceId ?? ""),
        serviceName: String(d.serviceName ?? ""),
        screen: String(d.screen ?? ""),
        appVersion: String(d.appVersion ?? ""),
        status: (d.status as SupportTicket["status"]) ?? "pendiente",
        resolvedByName:
          typeof d.resolvedByName === "string" ? d.resolvedByName : undefined,
        createdAtMs:
          typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : undefined,
      };
    };

    const unsubscribe = onSnapshot(
      collection(db, "supportTickets"),
      (snap) => {
        const list: SupportTicket[] = [];
        snap.forEach((item) => list.push(toTicket(item)));
        list.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
        setSupportTickets(list);

        if (!supportReadyRef.current) {
          supportReadyRef.current = true;
          return;
        }
        const cfg = notifyConfigRef.current;
        for (const change of snap.docChanges()) {
          if (change.type !== "added") continue;
          const t = toTicket(change.doc);
          if (t.status !== "pendiente") continue;
          if (t.reporterUid && t.reporterUid === cfg.uid) continue;
          // Supervisores y admin reciben todos los tickets.
          if (!cfg.isAdmin && !cfg.isSupervisor) continue;
          const notif = {
            id: `support-${t.id}-${Date.now()}`,
            title: "Nuevo ticket de soporte",
            body: `${t.reporterName || t.serviceName || "Usuario"} reportó: ${t.message.slice(0, 60)}`,
          };
          setToastNotifs((prev) => [notif, ...prev].slice(0, 3));
          setCasitaAlert(true);
          setCasitaTone("new");
          window.setTimeout(() => {
            setToastNotifs((prev) => prev.filter((n) => n.id !== notif.id));
          }, 6000);
        }
      },
      () => {
        // Si faltan reglas de supportTickets, no debe romper la app.
      },
    );

    return () => unsubscribe();
  }, [user, firestoreUnavailable, firestoreStatusReady, isAdmin, isSupervisor]);

  // Solicitudes de REGISTRO (solo admins las leen, segun reglas de Firestore).
  useEffect(() => {
    if (firestoreUnavailable || !user || !firestoreStatusReady || !isAdmin) {
      setSignupRequests([]);
      return;
    }
    signupReadyRef.current = false;
    const unsubscribe = onSnapshot(
      collection(db, "signupRequests"),
      (snap) => {
        const list: SignupRequest[] = [];
        snap.forEach((item) => {
          const d = item.data() as Record<string, unknown>;
          list.push({
            id: item.id,
            firstName: String(d.firstName ?? ""),
            lastName: String(d.lastName ?? ""),
            email: String(d.email ?? ""),
            serviceId: String(d.serviceId ?? ""),
            serviceName: String(d.serviceName ?? ""),
            status: (d.status as SignupRequest["status"]) ?? "pending",
            createdUsername:
              typeof d.createdUsername === "string" ? d.createdUsername : undefined,
          });
        });
        setSignupRequests(list);

        // Avisar de registros nuevos (despues de la carga inicial).
        if (!signupReadyRef.current) {
          signupReadyRef.current = true;
          return;
        }
        for (const change of snap.docChanges()) {
          if (change.type !== "added") continue;
          const d = change.doc.data() as Record<string, unknown>;
          if (String(d.status ?? "pending") !== "pending") continue;
          const notif = {
            id: `signup-${change.doc.id}-${Date.now()}`,
            title: "Nueva solicitud de registro",
            body: `${String(d.firstName ?? "")} ${String(d.lastName ?? "")} quiere registrarse en ${String(d.serviceName ?? "")}`,
          };
          setToastNotifs((prev) => [notif, ...prev].slice(0, 3));
          setCasitaAlert(true);
          window.setTimeout(() => {
            setToastNotifs((prev) => prev.filter((n) => n.id !== notif.id));
          }, 6000);
        }
      },
      () => {
        // Si faltan reglas, no romper la app.
      },
    );
    return () => unsubscribe();
  }, [user, isAdmin, firestoreUnavailable, firestoreStatusReady]);

  // En pantallas chicas el menu arranca cerrado (cajon); en PC, abierto.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      setMenuOpen(false);
    }
  }, []);

  // Aplica el tamaño de letra elegido (escala todo, basado en rem).
  useEffect(() => {
    const px = FONT_SIZE_OPTIONS.find((option) => option.id === uiPrefs.fontSize)?.px ?? 16;
    const root = document.documentElement;
    root.style.fontSize = `${px}px`;
    return () => {
      root.style.fontSize = "";
    };
  }, [uiPrefs.fontSize]);

  // Auto-cierre de los mensajes tipo toast (exito y error).
  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!error) {
      return;
    }
    const timer = window.setTimeout(() => setError(""), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  // Al soltar el mouse, confirma el arrastre: copia el valor a todas las filas cubiertas.
  useEffect(() => {
    if (!fillDrag) {
      return;
    }
    const onUp = () => {
      setHorasEmployees((current) =>
        current.map((emp, i) =>
          i >= fillDrag.startRow && i <= fillDrag.endRow
            ? { ...emp, hours: { ...emp.hours, [fillDrag.col]: fillDrag.value } }
            : emp,
        ),
      );
      setFillDrag(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [fillDrag]);

  async function fetchManagedUsers() {
    const snapshot = await getDocs(collection(db, "serviceUsers"));

    return sortManagedUsers(
      snapshot.docs.map((item) =>
        normalizeProfile(item.id, String(item.data().email || ""), item.data() as Record<string, unknown>),
      ),
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function syncSession() {
      if (!firestoreStatusReady) {
        return;
      }

      if (!user) {
        setServiceProfile(null);
        setTableValues({});
        clearAdminUsersState();
        setProfileReady(true);
        return;
      }

      if (firestoreUnavailable) {
        setProfileReady(true);
        return;
      }

      setProfileReady(false);

      try {
        const isPrimaryAdminUser = normalizeKey(user.email || "") === normalizeKey(ADMIN_EMAIL);

        if (isPrimaryAdminUser) {
          const profile = buildDefaultAdminProfile(user.uid);
          const cachedUsers = readAdminUsersCache();

          setServiceProfile(profile);
          setTableValues({});
          setError("");

          if (cachedUsers) {
            applyAdminUsers(cachedUsers);
            setIsLoadingUsers(false);
          } else {
            setIsLoadingUsers(true);
          }

          void ensureDefaultAdminProfile(user).catch(() => {
            // Ignore background admin profile sync failures during login.
          });

          void (async () => {
            try {
              const users = await fetchManagedUsers();

              if (!cancelled) {
                applyAdminUsers(users);
              }
            } catch (adminLoadError) {
              if (await handleFirestoreError(adminLoadError)) {
                if (!cancelled) {
                  clearAdminUsersState();
                }

                return;
              }

              if (!cancelled) {
                clearAdminUsersState();
                setError("No pudimos cargar por completo los usuarios del administrador.");
              }
            } finally {
              if (!cancelled) {
                setIsLoadingUsers(false);
              }
            }
          })();

          return;
        }

        // Supervisores: cuentas definidas en codigo (como el admin). Se reconocen por
        // su correo de acceso y su perfil se construye desde el codigo, SIN depender de
        // leer/escribir Firestore (la escritura del perfil se intenta en segundo plano).
        // Asi el login del supervisor nunca falla por un getDoc/permiso de Firestore.
        const supervisorAccount = findSupervisorAccountByLoginEmail(user.email);

        if (supervisorAccount) {
          setServiceProfile(buildSupervisorProfile(user.uid, supervisorAccount));
          setTableValues({});
          setError("");
          clearAdminUsersState();
          setIsLoadingUsers(false);
          void ensureSupervisorProfile(user, supervisorAccount).catch(() => {
            // Ignore background supervisor profile sync failures during bootstrap.
          });
          return;
        }

        const profileSnapshot = await getDoc(doc(db, "serviceUsers", user.uid));

        if (cancelled) {
          return;
        }

        if (!profileSnapshot.exists()) {
          setServiceProfile(null);
          setTableValues({});
          setError("La cuenta no tiene un perfil configurado en la base.");
          return;
        }

        const profile = normalizeProfile(
          user.uid,
          user.email || "",
          profileSnapshot.data() as Record<string, unknown>,
        );

        if (!profile.isActive) {
          setServiceProfile(null);
          setTableValues({});
          setError("La cuenta esta desactivada por el administrador.");
          await signOut(auth);
          return;
        }

        setServiceProfile(profile);
        setError("");

        const matchedService = getServiceById(profile.serviceId);
        if (matchedService) {
          const data = await fetchSavedDataForPeriod(matchedService, periodId);
          if (!cancelled) {
            setTableValues(data.values);
            setPercExtraRows(data.extraRows);
            setPercHiddenKeys(data.hiddenKeys);
          }
        } else if (!cancelled) {
          setTableValues({});
          setPercExtraRows([]);
          setPercHiddenKeys([]);
        }

        if (profile.permissions.canManageUsers || profile.role === "admin") {
          const cachedUsers = readAdminUsersCache();

          if (cachedUsers) {
            applyAdminUsers(cachedUsers);
            setIsLoadingUsers(false);
          } else {
            setIsLoadingUsers(true);
          }

          void (async () => {
            try {
              const users = await fetchManagedUsers();

              if (!cancelled) {
                applyAdminUsers(users);
              }
            } catch (adminLoadError) {
              if (await handleFirestoreError(adminLoadError)) {
                if (!cancelled) {
                  clearAdminUsersState();
                }

                return;
              }

              if (!cancelled) {
                clearAdminUsersState();
                setError("No pudimos cargar por completo los usuarios del administrador.");
              }
            } finally {
              if (!cancelled) {
                setIsLoadingUsers(false);
              }
            }
          })();
        } else if (!cancelled) {
          clearAdminUsersState();
          setIsLoadingUsers(false);
        }
      } catch (sessionError) {
        if (await handleFirestoreError(sessionError)) {
          if (!cancelled) {
            setServiceProfile(null);
            setTableValues({});
            clearAdminUsersState();
            setIsLoadingUsers(false);
            setProfileReady(true);
          }

          return;
        }

        if (!cancelled) {
          setServiceProfile(null);
          setTableValues({});
          clearAdminUsersState();
          setIsLoadingUsers(false);
          setError(getAuthErrorMessage(sessionError));
        }
      } finally {
        if (!cancelled) {
          setProfileReady(true);
        }
      }
    }

    void syncSession();

    return () => {
      cancelled = true;
    };
  }, [
    applyAdminUsers,
    clearAdminUsersState,
    firestoreStatusReady,
    firestoreUnavailable,
    periodId,
    readAdminUsersCache,
    user,
  ]);

  async function loadSavedData(showEmptyMessage: boolean) {
    if (!currentService || firestoreUnavailable) {
      return;
    }

    setError("");
    setMessage("");
    setIsLoadingData(true);

    try {
      const data = await fetchSavedDataForPeriod(currentService, periodId);
      const values = data.values;
      const isEmpty = Object.values(values).every((row) =>
        Object.values(row).every((cell) => cell === ""),
      );

      setTableValues(values);
      setPercExtraRows(data.extraRows);
      setPercHiddenKeys(data.hiddenKeys);

      if (showEmptyMessage && isEmpty) {
        setMessage("No hay datos guardados todavia para este servicio en el mes actual.");
      } else {
        setMessage(`Datos recuperados para ${currentService.name}.`);
      }
    } catch (loadError) {
      if (await handleFirestoreError(loadError)) {
        setTableValues(buildEmptyTable(currentService));
        return;
      }

      setError("No pudimos recuperar los datos guardados.");
    } finally {
      setIsLoadingData(false);
    }
  }

  // Carga el PERC de un mes especifico para el historial. Si es el mes de captura,
  // vuelve al modo normal (editable); si es un mes anterior, queda en modo historial.
  async function loadPercHistory(period: string) {
    if (!currentService || firestoreUnavailable) {
      return;
    }

    setError("");
    setMessage("");
    setIsLoadingData(true);

    try {
      const data = await fetchSavedDataForPeriod(currentService, period);
      setTableValues(data.values);
      setPercExtraRows(data.extraRows);
      setPercHiddenKeys(data.hiddenKeys);
      setPercViewPeriod(period === periodId ? null : period);

      if (period !== periodId) {
        setMessage(`Mostrando historial de ${getPeriodLabel(period)}.`);
      } else {
        setMessage(`Volviste al mes de captura (${periodLabel}).`);
      }
    } catch (loadError) {
      if (await handleFirestoreError(loadError)) {
        return;
      }
      setError("No pudimos cargar el historial de ese mes.");
    } finally {
      setIsLoadingData(false);
    }
  }

  // El admin elige un servicio para ver/editar sus tabuladores e historial.
  async function handleAdminSelectService(serviceId: string) {
    setAdminSelectedServiceId(serviceId);
    setPercViewPeriod(null);
    setError("");
    setMessage("");

    const service = getServiceById(serviceId);
    if (!service || firestoreUnavailable) {
      setTableValues({});
      setPercExtraRows([]);
      setPercHiddenKeys([]);
      return;
    }

    setIsLoadingData(true);
    try {
      const data = await fetchSavedDataForPeriod(service, periodId);
      setTableValues(data.values);
      setPercExtraRows(data.extraRows);
      setPercHiddenKeys(data.hiddenKeys);
    } catch (loadError) {
      if (await handleFirestoreError(loadError)) {
        return;
      }
      setTableValues(buildEmptyTable(service));
      setPercExtraRows([]);
      setPercHiddenKeys([]);
    } finally {
      setIsLoadingData(false);
    }
  }

  async function loadAdminUsers() {
    if (!isAdmin || firestoreUnavailable) {
      return;
    }

    setIsLoadingUsers(true);

    try {
      const users = await fetchManagedUsers();
      applyAdminUsers(users);
      setMessage("Listado de usuarios actualizado.");
      setError("");
    } catch (loadError) {
      if (await handleFirestoreError(loadError)) {
        clearAdminUsersState();
        return;
      }

      setError("No pudimos cargar los usuarios del modulo administrador.");
    } finally {
      setIsLoadingUsers(false);
    }
  }

  async function handleExportMonthlyReport() {
    if (!isAdmin || firestoreUnavailable) {
      return;
    }

    setIsExportingMonthlyReport(true);
    setError("");
    setMessage("");

    try {
      const overview = await fetchAdminOverviewForPeriod(periodId);
      downloadAdminExcelReport(overview, periodId);
      setMessage(`Excel generado correctamente para el periodo ${periodLabel}.`);
    } catch (exportError) {
      if (await handleFirestoreError(exportError)) {
        return;
      }

      setError(getAuthErrorMessage(exportError));
    } finally {
      setIsExportingMonthlyReport(false);
    }
  }

  // Carga (o recarga) la previsualizacion del consolidado para un mes exacto: lee
  // la produccion de los servicios y el Censo de ESE mismo mes.
  async function loadConsolidadoPreview(period: string) {
    if (!isAdmin || firestoreUnavailable || !period) {
      return;
    }
    setConsolidadoPeriod(period);
    setIsLoadingConsolidado(true);
    setError("");
    try {
      const [overview, censoInfo] = await Promise.all([
        fetchAdminOverviewForPeriod(period),
        fetchCensoInfoForPeriod(period),
      ]);
      setConsolidadoPreview(computeConsolidado(overview, censoInfo));
    } catch (previewError) {
      if (await handleFirestoreError(previewError)) {
        return;
      }
      setError("No pudimos preparar la previsualización del consolidado.");
    } finally {
      setIsLoadingConsolidado(false);
    }
  }

  // Paso 1: abre el modal para el mes del censo actual (por defecto), para revisar
  // que los datos esten llenos antes de descargar. El mes se puede cambiar dentro.
  async function handleExportServiceProduction() {
    if (!isAdmin || firestoreUnavailable) {
      return;
    }
    setShowCensoConsolidadoPreview(true);
    await loadConsolidadoPreview(censoPeriod || periodId);
  }

  // Paso 2: descarga real del consolidado (con los datos del Censo integrados) del
  // MISMO mes que se esta previsualizando.
  async function confirmDownloadServiceProduction() {
    if (!isAdmin || firestoreUnavailable || !consolidadoPeriod) {
      return;
    }
    setIsExportingServiceProduction(true);
    setError("");
    setMessage("");
    try {
      const [overview, censoInfo] = await Promise.all([
        fetchAdminOverviewForPeriod(consolidadoPeriod),
        fetchCensoInfoForPeriod(consolidadoPeriod),
      ]);
      downloadServiceProductionReport(overview, consolidadoPeriod, censoInfo);
      setShowCensoConsolidadoPreview(false);
      setMessage(
        `Producción de Servicio generada para ${getPeriodLabel(consolidadoPeriod)}.`,
      );
    } catch (exportError) {
      if (await handleFirestoreError(exportError)) {
        return;
      }
      setError(getAuthErrorMessage(exportError));
    } finally {
      setIsExportingServiceProduction(false);
    }
  }

  // --- Documentos (control anual de entregas a Calidad) ---
  // Editan solo admin y ffuentes (ffuentes ya es admin); el resto solo visualiza.
  const canEditDocs = isAdmin;

  async function loadDocs() {
    setDocsLoading(true);
    try {
      const snap = await getDoc(doc(db, "documentControl", String(currentYear)));
      const saved = (snap.exists() ? (snap.data() as { values?: unknown }).values : null) || {};
      const savedMap = saved as Record<string, Record<string, unknown>>;
      const values: DocValues = {};
      DOC_DEPENDENCIAS.forEach((_, i) => {
        const key = getDocKey(i);
        const row = savedMap[key] || {};
        values[key] = Object.fromEntries(
          DOC_COLUMNS.map((col) => {
            const v = row[col.key];
            return [col.key, v === "entregado" || v === "pendiente" ? v : ""];
          }),
        ) as Record<string, DocStatus>;
      });
      setDocsValues(values);
      setDocsLoaded(true);
    } catch (docError) {
      if (await handleFirestoreError(docError)) {
        return;
      }
      setError("No pudimos cargar el control de documentos.");
    } finally {
      setDocsLoading(false);
    }
  }

  function openDocsModal() {
    setShowDocsModal(true);
    if (!docsLoaded && !firestoreUnavailable) {
      void loadDocs();
    }
  }

  function handleDocsCellCycle(depKey: string, colKey: string) {
    if (!canEditDocs) {
      return;
    }
    setDocsValues((current) => {
      const currentStatus = (current[depKey]?.[colKey] ?? "") as DocStatus;
      const index = DOC_STATUS_CYCLE.indexOf(currentStatus);
      const next = DOC_STATUS_CYCLE[(index + 1) % DOC_STATUS_CYCLE.length];
      return { ...current, [depKey]: { ...(current[depKey] || {}), [colKey]: next } };
    });
  }

  async function handleSaveDocs() {
    if (!canEditDocs || firestoreUnavailable) {
      return;
    }
    setDocsSaving(true);
    setError("");
    setMessage("");
    try {
      await setDoc(
        doc(db, "documentControl", String(currentYear)),
        {
          year: currentYear,
          values: docsValues,
          updatedAt: serverTimestamp(),
          updatedBy: user?.email || "",
        },
        { merge: true },
      );
      setMessage("Control de documentos guardado correctamente.");
    } catch (docError) {
      if (await handleFirestoreError(docError)) {
        return;
      }
      setError(getAuthErrorMessage(docError));
    } finally {
      setDocsSaving(false);
    }
  }

  // ---- Censo Diario de Pacientes (guardado por mes) -------------------------
  async function loadCenso(period: string) {
    if (firestoreUnavailable || !user) {
      return;
    }
    setIsLoadingCenso(true);
    try {
      const snap = await getDoc(doc(db, "censoDiario", period));
      if (snap.exists()) {
        const data = snap.data() as { values?: CensoValues; extraRows?: CensoRow[] };
        setCensoValues(
          data.values && typeof data.values === "object" ? data.values : {},
        );
        setCensoExtraRows(Array.isArray(data.extraRows) ? data.extraRows : []);
      } else {
        setCensoValues({});
        setCensoExtraRows([]);
      }
      setCensoLoadedPeriod(period);
      // Nuevo mes cargado: reinicia el historial de deshacer/rehacer.
      setCensoUndoStack([]);
      setCensoRedoStack([]);
    } catch (censoError) {
      if (await handleFirestoreError(censoError)) {
        return;
      }
      setError("No pudimos cargar el censo diario.");
    } finally {
      setIsLoadingCenso(false);
    }
  }

  // Guarda una foto del estado actual del censo en el historial de "deshacer".
  // Se llama ANTES de cada cambio; limpia la pila de "rehacer".
  function snapshotCenso() {
    setCensoUndoStack((stack) => {
      const next = [...stack, { values: censoValues, extraRows: censoExtraRows }];
      return next.length > 100 ? next.slice(next.length - 100) : next;
    });
    setCensoRedoStack([]);
  }

  function handleCensoUndo() {
    if (!canEditCenso || censoUndoStack.length === 0) {
      return;
    }
    const prev = censoUndoStack[censoUndoStack.length - 1];
    setCensoRedoStack((r) => [...r, { values: censoValues, extraRows: censoExtraRows }]);
    setCensoUndoStack((u) => u.slice(0, -1));
    setCensoValues(prev.values);
    setCensoExtraRows(prev.extraRows);
  }

  function handleCensoRedo() {
    if (!canEditCenso || censoRedoStack.length === 0) {
      return;
    }
    const next = censoRedoStack[censoRedoStack.length - 1];
    setCensoUndoStack((u) => [...u, { values: censoValues, extraRows: censoExtraRows }]);
    setCensoRedoStack((r) => r.slice(0, -1));
    setCensoValues(next.values);
    setCensoExtraRows(next.extraRows);
  }

  function handleClearCenso() {
    if (!canEditCenso) {
      return;
    }
    snapshotCenso();
    setCensoValues({});
    setMessage("Tabla del censo borrada. Podés deshacer si fue por error.");
  }

  function updateCensoCell(rowKey: string, day: number, value: string) {
    if (!canEditCenso) {
      return;
    }
    snapshotCenso();
    setCensoValues((current) => ({
      ...current,
      [rowKey]: { ...(current[rowKey] || {}), [String(day)]: value },
    }));
  }

  function handleAddCensoRow() {
    if (!canEditCenso) {
      return;
    }
    snapshotCenso();
    const key = `extra-${censoExtraRows.length + 1}-${Math.floor(Date.now())}`;
    setCensoExtraRows((current) => [...current, { key, label: "NUEVO SERVICIO" }]);
  }

  function handleRenameCensoRow(key: string, label: string) {
    if (!canEditCenso) {
      return;
    }
    snapshotCenso();
    setCensoExtraRows((current) =>
      current.map((row) => (row.key === key ? { ...row, label } : row)),
    );
  }

  function handleRemoveCensoRow(key: string) {
    if (!canEditCenso) {
      return;
    }
    snapshotCenso();
    setCensoExtraRows((current) => current.filter((row) => row.key !== key));
    setCensoValues((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  // Pega desde Excel: parte de (startRowIndex, startDay) y llena hacia la derecha
  // (dias) y hacia abajo (filas), igual que Excel.
  function handleCensoPaste(
    event: ClipboardEvent | { clipboardData: DataTransfer; preventDefault: () => void },
    startRowIndex: number,
    startDay: number,
  ) {
    if (!canEditCenso) {
      return;
    }
    const text = event.clipboardData?.getData("text") ?? "";
    if (!text.includes("\t") && !text.includes("\n")) {
      return; // pega normal (una sola celda)
    }
    event.preventDefault();
    snapshotCenso();
    const lines = text.replace(/\r/g, "").split("\n");
    while (lines.length > 1 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    const grid = lines.map((line) => line.split("\t"));
    const days = getDayColumns(censoPeriod).map(Number);
    const startDayIdx = days.indexOf(startDay);
    if (startDayIdx < 0) {
      return;
    }
    setCensoValues((current) => {
      const next: CensoValues = { ...current };
      grid.forEach((cells, r) => {
        const rowObj = censoRows[startRowIndex + r];
        if (!rowObj) {
          return;
        }
        const rowVals = { ...(next[rowObj.key] || {}) };
        cells.forEach((cell, c) => {
          const day = days[startDayIdx + c];
          if (day === undefined) {
            return;
          }
          rowVals[String(day)] = cell.trim();
        });
        next[rowObj.key] = rowVals;
      });
      return next;
    });
  }

  async function handleSaveCenso() {
    if (!canEditCenso || firestoreUnavailable) {
      return;
    }
    setIsSavingCenso(true);
    setError("");
    setMessage("");
    try {
      await setDoc(
        doc(db, "censoDiario", censoPeriod),
        {
          periodId: censoPeriod,
          values: censoValues,
          extraRows: censoExtraRows,
          updatedAt: serverTimestamp(),
          updatedBy: user?.email || "",
        },
        { merge: true },
      );
      setMessage(`Censo diario guardado correctamente (${getPeriodLabel(censoPeriod)}).`);
    } catch (censoError) {
      if (await handleFirestoreError(censoError)) {
        return;
      }
      setError("No pudimos guardar el censo diario. Intente de nuevo.");
    } finally {
      setIsSavingCenso(false);
    }
  }

  // ---- Insumos de Almacen (matriz de costos, guardado por mes) --------------
  async function loadInsumos(period: string) {
    if (firestoreUnavailable || !user) {
      return;
    }
    setIsLoadingInsumos(true);
    try {
      const snap = await getDoc(doc(db, "insumosAlmacen", period));
      if (snap.exists()) {
        const data = snap.data() as {
          values?: InsumosValues;
          extraRows?: InsumoExtraRow[];
          hiddenKeys?: string[];
        };
        setInsumosValues(
          data.values && typeof data.values === "object" ? data.values : {},
        );
        setInsumosExtraRows(Array.isArray(data.extraRows) ? data.extraRows : []);
        setInsumosHiddenKeys(Array.isArray(data.hiddenKeys) ? data.hiddenKeys : []);
      } else {
        setInsumosValues({});
        setInsumosExtraRows([]);
        setInsumosHiddenKeys([]);
      }
      setInsumosLoadedPeriod(period);
      setInsumosUndoStack([]);
      setInsumosRedoStack([]);
    } catch (insumosError) {
      if (await handleFirestoreError(insumosError)) {
        return;
      }
      setError("No pudimos cargar el tabulador de Insumos de Almacén.");
    } finally {
      setIsLoadingInsumos(false);
    }
  }

  function snapshotInsumos() {
    setInsumosUndoStack((stack) => {
      const next = [...stack, insumosValues];
      return next.length > 100 ? next.slice(next.length - 100) : next;
    });
    setInsumosRedoStack([]);
  }

  function handleInsumosUndo() {
    if (!canEditInsumos || insumosUndoStack.length === 0) {
      return;
    }
    const prev = insumosUndoStack[insumosUndoStack.length - 1];
    setInsumosRedoStack((r) => [...r, insumosValues]);
    setInsumosUndoStack((u) => u.slice(0, -1));
    setInsumosValues(prev);
  }

  function handleInsumosRedo() {
    if (!canEditInsumos || insumosRedoStack.length === 0) {
      return;
    }
    const next = insumosRedoStack[insumosRedoStack.length - 1];
    setInsumosUndoStack((u) => [...u, insumosValues]);
    setInsumosRedoStack((r) => r.slice(0, -1));
    setInsumosValues(next);
  }

  function handleClearInsumos() {
    if (!canEditInsumos) {
      return;
    }
    snapshotInsumos();
    setInsumosValues({});
    setMessage("Tabla de Insumos borrada. Podés deshacer si fue por error.");
  }

  // Inserta una fila nueva (editable) justo debajo de `anchorKey`. Si el ancla
  // pertenece a un bloque, la nueva fila se suma en el total de ese bloque.
  function handleAddInsumosRow(anchorKey: string) {
    if (!canManageInsumosRows) {
      return;
    }
    const parentKey = findInsumosParentKey(anchorKey, insumosExtraRows);
    const key = `x-${Math.floor(Date.now())}-${insumosExtraRows.length + 1}`;
    setInsumosExtraRows((current) => [
      ...current,
      { key, label: "NUEVO SERVICIO", afterKey: anchorKey, parentKey },
    ]);
    setMessage("Fila agregada. Escribí su nombre y no olvides «Guardar insumos».");
  }

  function handleRenameInsumosRow(key: string, label: string) {
    if (!canManageInsumosRows) {
      return;
    }
    setInsumosExtraRows((current) =>
      current.map((row) => (row.key === key ? { ...row, label } : row)),
    );
  }

  // Quita una fila. Las agregadas a mano se borran; las oficiales se OCULTAN (sus
  // datos no se destruyen y se pueden restaurar). Pide confirmacion para oficiales.
  function handleRemoveInsumosRow(key: string, isExtra: boolean, label: string) {
    if (!canManageInsumosRows) {
      return;
    }
    if (isExtra) {
      setInsumosExtraRows((current) => current.filter((row) => row.key !== key));
      return;
    }
    const ok =
      typeof window === "undefined" ||
      window.confirm(
        `¿Ocultar la fila oficial «${label}»? No se borran sus datos y podés restaurarla luego. Recordá guardar.`,
      );
    if (!ok) {
      return;
    }
    setInsumosHiddenKeys((current) =>
      current.includes(key) ? current : [...current, key],
    );
  }

  function handleRestoreInsumosRows() {
    if (!canManageInsumosRows) {
      return;
    }
    setInsumosHiddenKeys([]);
    setMessage("Filas oficiales restauradas. Recordá «Guardar insumos».");
  }

  function updateInsumosCell(rowKey: string, colKey: string, value: string) {
    if (!canEditInsumos) {
      return;
    }
    snapshotInsumos();
    const clean = sanitizeMoneyValue(value);
    setInsumosValues((current) => ({
      ...current,
      [rowKey]: { ...(current[rowKey] || {}), [colKey]: clean },
    }));
  }

  // Navegacion tipo Excel entre celdas de Insumos con las 4 flechas (y Enter = abajo).
  // ArrowUp/Down saltan las filas padre (totales) y caen en la siguiente celda
  // editable. ArrowLeft/Right solo cambian de celda cuando el cursor esta al borde
  // del texto, para no estorbar la edicion dentro de la celda. Al enfocar, la celda
  // se desplaza a la vista: asi no hace falta bajar a buscar la barra de scroll.
  function handleInsumosKeyNav(
    event: ReactKeyboardEvent<HTMLInputElement>,
    rowKey: string,
    colKey: string,
  ) {
    const key = event.key;
    if (
      key !== "ArrowUp" &&
      key !== "ArrowDown" &&
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "Enter"
    ) {
      return;
    }
    // Solo filas capturables (las padre calculadas no tienen input). Se usa la
    // lista EFECTIVA para incluir filas agregadas y respetar las ocultas.
    const rows = insumosEffectiveRows.filter((r) => !r.sumOf);
    const cols = INSUMOS_ALMACEN_TEMPLATE.columns;
    const rIdx = rows.findIndex((r) => r.key === rowKey);
    const cIdx = cols.findIndex((c) => c.key === colKey);
    if (rIdx < 0 || cIdx < 0) {
      return;
    }
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd =
      input.selectionStart === input.value.length &&
      input.selectionEnd === input.value.length;
    let tr = rIdx;
    let tc = cIdx;
    if (key === "ArrowUp") {
      tr = rIdx - 1;
    } else if (key === "ArrowDown" || key === "Enter") {
      tr = rIdx + 1;
    } else if (key === "ArrowLeft") {
      if (!atStart) return;
      tc = cIdx - 1;
    } else if (key === "ArrowRight") {
      if (!atEnd) return;
      tc = cIdx + 1;
    }
    if (tr < 0 || tr >= rows.length || tc < 0 || tc >= cols.length) {
      return;
    }
    event.preventDefault();
    const target = window.document.getElementById(`ins-${rows[tr].key}-${cols[tc].key}`);
    if (target instanceof HTMLInputElement) {
      target.focus();
      target.select();
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  // Pega desde Excel: parte de (fila, columna) y llena a la derecha y hacia abajo.
  // Solo se pega en filas capturables (no en las filas padre calculadas).
  function handleInsumosPaste(
    event: ClipboardEvent | { clipboardData: DataTransfer; preventDefault: () => void },
    startRowKey: string,
    startColKey: string,
  ) {
    if (!canEditInsumos) {
      return;
    }
    const text = event.clipboardData?.getData("text") ?? "";
    if (!text.includes("\t") && !text.includes("\n")) {
      return;
    }
    event.preventDefault();
    snapshotInsumos();
    const lines = text.replace(/\r/g, "").split("\n");
    while (lines.length > 1 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    const grid = lines.map((line) => line.split("\t"));
    // Lista EFECTIVA: el pegado respeta filas agregadas y saltea las padre/ocultas.
    const rows = insumosEffectiveRows;
    const cols = INSUMOS_ALMACEN_TEMPLATE.columns;
    const startRowIdx = rows.findIndex((r) => r.key === startRowKey);
    const startColIdx = cols.findIndex((c) => c.key === startColKey);
    if (startRowIdx < 0 || startColIdx < 0) {
      return;
    }
    setInsumosValues((current) => {
      const next: InsumosValues = { ...current };
      let targetRow = startRowIdx;
      grid.forEach((cells) => {
        // Avanza saltando filas padre (calculadas): no reciben pegado.
        while (targetRow < rows.length && rows[targetRow].sumOf) {
          targetRow += 1;
        }
        const rowObj = rows[targetRow];
        targetRow += 1;
        if (!rowObj) {
          return;
        }
        const rowVals = { ...(next[rowObj.key] || {}) };
        cells.forEach((cell, c) => {
          const col = cols[startColIdx + c];
          if (!col) {
            return;
          }
          rowVals[col.key] = sanitizeMoneyValue(cell.trim());
        });
        next[rowObj.key] = rowVals;
      });
      return next;
    });
  }

  async function handleSaveInsumos() {
    // Guardan quienes editan celdas (admin/almacen) o gestionan filas (además
    // supervisores). La persistencia real la valida Firestore por sus reglas.
    if ((!canEditInsumos && !canManageInsumosRows) || firestoreUnavailable) {
      return;
    }
    setIsSavingInsumos(true);
    setError("");
    setMessage("");
    try {
      await setDoc(
        doc(db, "insumosAlmacen", insumosPeriod),
        {
          periodId: insumosPeriod,
          values: insumosValues,
          extraRows: insumosExtraRows,
          hiddenKeys: insumosHiddenKeys,
          updatedAt: serverTimestamp(),
          updatedBy: user?.email || "",
        },
        { merge: true },
      );
      setMessage(
        `Insumos de Almacén guardado correctamente (${getPeriodLabel(insumosPeriod)}).`,
      );
    } catch (insumosError) {
      if (await handleFirestoreError(insumosError)) {
        return;
      }
      setError("No pudimos guardar Insumos de Almacén. Intente de nuevo.");
    } finally {
      setIsSavingInsumos(false);
    }
  }

  // Descarga el CONSOLIDADO de Insumos (solo admin y supervisores). Colapsa cada
  // bloque padre en UNA fila con la suma de sus subservicios y deja los servicios
  // independientes tal cual, en el ORDEN OFICIAL (INSUMOS_CONSOLIDADO_ORDER).
  // Respeta la estructura del reporte: encabezado, filas y columnas idénticos; los
  // valores son las mismas sumas que muestra el tabulador (incluye filas agregadas
  // que cuelguen de un bloque). No altera nada de la plantilla oficial.
  async function handleDownloadInsumosConsolidado() {
    if (!(isAdmin || isSupervisor)) {
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const cols = INSUMOS_ALMACEN_TEMPLATE.columns;
      const tplByKey = new Map(INSUMOS_ALMACEN_TEMPLATE.rows.map((r) => [r.key, r]));
      const effByKey = new Map(insumosEffectiveRows.map((r) => [r.key, r]));
      const insNum = (rowKey: string, colKey: string) => {
        const n = Number.parseFloat(insumosValues[rowKey]?.[colKey] ?? "");
        return Number.isFinite(n) ? n : 0;
      };
      // Valor consolidado de una fila: si es bloque padre, suma sus hijas (sumOf
      // efectivo, que ya incluye filas agregadas y excluye ocultas); si no, su valor.
      const cellValue = (sourceKey: string, colKey: string) => {
        const eff = effByKey.get(sourceKey);
        if (!eff) {
          return 0;
        }
        return eff.sumOf
          ? eff.sumOf.reduce((acc, childKey) => acc + insNum(childKey, colKey), 0)
          : insNum(sourceKey, colKey);
      };
      const header = ["Centro de Costo", ...cols.map((c) => c.label)];
      const body = INSUMOS_CONSOLIDADO_ORDER.map((key) => [
        tplByKey.get(key)?.label ?? key,
        ...cols.map((c) => cellValue(key, c.key)),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      ws["!cols"] = [{ wch: 42 }, ...cols.map(() => ({ wch: 16 }))];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "consolidado");
      XLSX.writeFile(wb, `Consolidado_Insumos_Almacen_${insumosPeriod}.xlsx`);
      setMessage(`Consolidado de Insumos descargado (${getPeriodLabel(insumosPeriod)}).`);
    } catch (err) {
      console.error(err);
      setError("No pudimos generar el consolidado de Insumos.");
    }
  }

  // Sube la plantilla Excel oficial de Insumos y llena la matriz. Emparejamiento por
  // POSICION: la fila r{n} del modelo corresponde a la fila n del Excel; columnas C..AG
  // -> c1..c31. Solo se importan filas capturables (las padre se calculan solas).
  async function handleUploadInsumosFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canEditInsumos) {
      return;
    }
    setIsImportingInsumos(true);
    setError("");
    setMessage("");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const norm = (s: unknown) =>
        String(s ?? "")
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .replace(/\s+/g, "");
      const monthSheet = norm(getShortPeriodLabel(insumosPeriod).replace(" - ", " "));
      const names = wb.SheetNames;
      const pick =
        names.find((n) => norm(n) === monthSheet) ||
        names.find((n) => norm(n) !== "BACKUP") ||
        names[0];
      const ws = pick ? wb.Sheets[pick] : undefined;
      if (!ws) {
        throw new Error("No se encontró una hoja válida en el Excel");
      }
      const aoa = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      }) as unknown[][];

      const next: InsumosValues = {};
      let filled = 0;
      INSUMOS_ALMACEN_TEMPLATE.rows.forEach((row) => {
        if (row.sumOf) {
          return; // fila padre calculada
        }
        const excelRow = Number.parseInt(row.key.replace(/^r/, ""), 10);
        const dataRow = aoa[excelRow - 1] || [];
        const rowVals: Record<string, string> = {};
        INSUMOS_ALMACEN_TEMPLATE.columns.forEach((col, i) => {
          const raw = dataRow[i + 2]; // columna C = indice 2
          const num = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
          if (Number.isFinite(num) && num !== 0) {
            rowVals[col.key] = String(num);
            filled += 1;
          }
        });
        if (Object.keys(rowVals).length > 0) {
          next[row.key] = rowVals;
        }
      });

      if (filled === 0) {
        throw new Error(
          "No se encontraron valores. Verifique que subió la hoja del mes correcto.",
        );
      }
      snapshotInsumos();
      setInsumosValues(next);
      setMessage(
        `Se importaron ${filled} valores desde la hoja "${pick}". Revise y presione Guardar.`,
      );
    } catch (insumosError) {
      console.error(insumosError);
      setError(
        "No pudimos leer el Excel. Suba la plantilla oficial de Insumos de Almacén sin cambiar la estructura.",
      );
    } finally {
      setIsImportingInsumos(false);
    }
  }

  async function refreshPublicDashboard(showMessage: boolean) {
    if (firestoreUnavailable) {
      return;
    }

    try {
      const dashboard = await fetchPublicDashboard(currentYear, periodId);
      setCalendarOverrides(dashboard.calendarOverrides);
      setPublicDashboardMonths(dashboard.months);
      setPublicDashboardGroups(dashboard.groups);
      setPublicCompletedCount(dashboard.completedCount);

      if (showMessage) {
        setMessage("Tablero general actualizado.");
      }
    } catch (dashboardError) {
      if (await handleFirestoreError(dashboardError)) {
        setPublicDashboardMonths([]);
        setPublicDashboardGroups([]);
        setPublicCompletedCount(0);
        return;
      }

      setError("No pudimos actualizar el tablero general.");
    }
  }

  function handleAddBlockedRange() {
    if (!calendarEditorPeriodId || !calendarRangeStart || !calendarRangeEnd) {
      setError("Selecciona el rango de fechas (Desde y Hasta).");
      return;
    }

    // Ordena el rango por si lo pusieron al reves.
    const start = calendarRangeStart <= calendarRangeEnd ? calendarRangeStart : calendarRangeEnd;
    const end = calendarRangeStart <= calendarRangeEnd ? calendarRangeEnd : calendarRangeStart;

    // Genera todas las fechas del rango que pertenezcan al mes configurado.
    const datesInRange: string[] = [];
    const [sy, sm, sd] = start.split("-").map((value) => Number.parseInt(value, 10));
    const [ey, em, ed] = end.split("-").map((value) => Number.parseInt(value, 10));
    const cursor = new Date(sy, sm - 1, sd, 12, 0, 0, 0);
    const limit = new Date(ey, em - 1, ed, 12, 0, 0, 0);

    while (cursor.getTime() <= limit.getTime()) {
      const key = getDateKey(cursor);
      if (key.startsWith(calendarEditorPeriodId)) {
        datesInRange.push(key);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (datesInRange.length === 0) {
      setError("El rango no tiene fechas dentro del mes configurado.");
      return;
    }

    setCalendarOverrides((currentOverrides) => {
      const currentDates = currentOverrides[calendarEditorPeriodId] || [];
      const merged = Array.from(new Set([...currentDates, ...datesInRange])).sort();
      return {
        ...currentOverrides,
        [calendarEditorPeriodId]: merged,
      };
    });
    setError("");
    setMessage(
      `Se agregaron ${datesInRange.length} fecha(s) no habiles. Recorda "Guardar calendario".`,
    );
  }

  function handleRemoveBlockedDate(dateKey: string) {
    setCalendarOverrides((currentOverrides) => ({
      ...currentOverrides,
      [calendarEditorPeriodId]: (currentOverrides[calendarEditorPeriodId] || []).filter(
        (value) => value !== dateKey,
      ),
    }));
  }

  async function handleSaveCalendarOverride() {
    if (!isAdmin || !calendarEditorPeriodId || firestoreUnavailable) {
      return;
    }

    setIsSavingCalendar(true);
    setError("");
    setMessage("");

    try {
      await setDoc(
        doc(db, "captureCalendar", calendarEditorPeriodId),
        {
          periodId: calendarEditorPeriodId,
          blockedDates: calendarOverrides[calendarEditorPeriodId] || [],
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      await refreshPublicDashboard(false);
      setMessage("Dias habiles actualizados correctamente.");
    } catch (calendarError) {
      if (await handleFirestoreError(calendarError)) {
        return;
      }

      setError("No pudimos guardar la configuracion del calendario.");
    } finally {
      setIsSavingCalendar(false);
    }
  }

  // Habilita (reabre) o deshabilita (cierra) el tablero de un servicio/modulo para
  // el periodo elegido. `nextState` null = volver a la ventana natural (borra override).
  async function handleToggleCapture(
    serviceId: string,
    moduleId: ModuleId,
    nextState: CaptureOverrideState | null,
    period?: string,
  ) {
    if (!serviceProfile?.permissions.canToggleCapture || firestoreUnavailable) {
      return;
    }

    if (!isAdmin && !serviceProfile.supervisorModules.includes(moduleId)) {
      return;
    }

    const targetPeriod = period ?? overridePanelPeriodId;
    const overrideId = getCaptureOverrideId(targetPeriod, serviceId, moduleId);
    setOverrideBusyKey(overrideId);
    setError("");
    setMessage("");

    try {
      if (nextState === null) {
        await deleteDoc(doc(db, "captureOverrides", overrideId));
      } else {
        await setDoc(doc(db, "captureOverrides", overrideId), {
          periodId: targetPeriod,
          serviceId,
          moduleId,
          state: nextState,
          updatedByName: serviceProfile.name,
          updatedAt: serverTimestamp(),
        });
      }

      setCaptureOverrides((current) => {
        const next = { ...current };

        if (nextState === null) {
          delete next[overrideId];
        } else {
          next[overrideId] = nextState;
        }

        return next;
      });

      setMessage(
        nextState === "open"
          ? `Tablero habilitado para captura de ${getPeriodLabel(targetPeriod)}.`
          : nextState === "closed"
            ? "Tablero deshabilitado."
            : "Tablero devuelto a su ventana normal.",
      );
    } catch (toggleError) {
      if (await handleFirestoreError(toggleError)) {
        return;
      }

      setError("No pudimos actualizar el estado del tablero.");
    } finally {
      setOverrideBusyKey("");
    }
  }

  // Un servicio solicita que le habiliten un tablero (porque no cargo a tiempo).
  async function sendCaptureRequest(moduleId: ModuleId) {
    if (!user || !currentService || !serviceProfile || firestoreUnavailable) {
      return;
    }

    const requestPeriod = moduleId === "sesps" ? sepsPeriodId : periodId;
    const requestId = `${requestPeriod}__${currentService.id}__${moduleId}`;

    setIsSendingRequest(true);
    setError("");
    setMessage("");

    try {
      await setDoc(doc(db, "captureRequests", requestId), {
        periodId: requestPeriod,
        periodLabel: getPeriodLabel(requestPeriod),
        serviceId: currentService.id,
        serviceName: currentService.name,
        moduleId,
        requestedByName: serviceProfile.name,
        requestedByUid: user.uid,
        status: "pending",
        updatedAt: serverTimestamp(),
      });

      const newRequest: CaptureRequest = {
        id: requestId,
        periodId: requestPeriod,
        periodLabel: getPeriodLabel(requestPeriod),
        serviceId: currentService.id,
        serviceName: currentService.name,
        moduleId,
        requestedByName: serviceProfile.name,
        requestedByUid: user.uid,
        status: "pending",
      };
      setCaptureRequests((current) => [
        newRequest,
        ...current.filter((item) => item.id !== requestId),
      ]);

      setShowRequestForm(false);
      setMessage(
        `Solicitud enviada: habilitar ${getModuleLabel(moduleId)} (${getPeriodLabel(requestPeriod)}). Un supervisor o el admin la revisara.`,
      );
    } catch (requestError) {
      if (await handleFirestoreError(requestError)) {
        return;
      }
      setError("No pudimos enviar la solicitud. Intentalo de nuevo.");
    } finally {
      setIsSendingRequest(false);
    }
  }

  // El supervisor/admin marca una solicitud como aprobada o rechazada.
  async function resolveCaptureRequest(request: CaptureRequest, status: "approved" | "rejected") {
    if (!serviceProfile || firestoreUnavailable) {
      return;
    }
    if (!isAdmin && !serviceProfile.supervisorModules.includes(request.moduleId)) {
      return;
    }

    setRequestBusyId(request.id);
    setError("");
    setMessage("");

    try {
      await setDoc(
        doc(db, "captureRequests", request.id),
        { status, resolvedByName: serviceProfile.name, resolvedAt: serverTimestamp() },
        { merge: true },
      );
      setCaptureRequests((current) =>
        current.map((item) =>
          item.id === request.id
            ? { ...item, status, resolvedByName: serviceProfile.name }
            : item,
        ),
      );
      setMessage(
        status === "approved"
          ? `Solicitud aprobada. Recorda habilitar ${getModuleLabel(request.moduleId)} en "Habilitar tableros".`
          : "Solicitud rechazada.",
      );
    } catch (resolveError) {
      if (await handleFirestoreError(resolveError)) {
        return;
      }
      setError("No pudimos actualizar la solicitud.");
    } finally {
      setRequestBusyId("");
    }
  }

  // Envia un ticket al Centro de Soporte (cualquier usuario logueado).
  async function sendSupportTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (firestoreUnavailable) {
      setError(FIRESTORE_SETUP_MESSAGE);
      return;
    }
    const text = supportMessage.trim();
    if (text.length < 5) {
      setError("Describí el problema (al menos 5 caracteres).");
      return;
    }
    setIsSendingSupport(true);
    setError("");
    setMessage("");
    try {
      const role = isAdmin ? "admin" : isSupervisor ? "supervisor" : "servicio";
      const ref = doc(collection(db, "supportTickets"));
      await setDoc(ref, {
        category: supportCategory,
        urgency: supportUrgency,
        message: text,
        reporterName: serviceProfile?.name || welcomeName || (user?.email ?? ""),
        reporterUid: user?.uid ?? "",
        reporterRole: role,
        serviceId: currentService?.id ?? "",
        serviceName: currentService?.name ?? (serviceProfile?.email ?? ""),
        screen: activeSidebarSection || mobileView || "—",
        appVersion: "1.6.2.6",
        status: "pendiente",
        createdAt: serverTimestamp(),
      });
      setSupportMessage("");
      setSupportCategory("error");
      setSupportUrgency("media");
      setShowSupportModal(false);
      setMessage("¡Listo! Tu reporte se envió a soporte. Te responderemos pronto.");
    } catch (supportError) {
      if (await handleFirestoreError(supportError)) {
        return;
      }
      setError("No pudimos enviar tu reporte. Intentá de nuevo.");
    } finally {
      setIsSendingSupport(false);
    }
  }

  // Cambia el estado de un ticket de soporte (solo admin/supervisores).
  async function resolveSupportTicket(ticket: SupportTicket, status: SupportTicket["status"]) {
    if (!serviceProfile || firestoreUnavailable) {
      return;
    }
    if (!isAdmin && !isSupervisor) {
      return;
    }
    setSupportBusyId(ticket.id);
    setError("");
    try {
      await setDoc(
        doc(db, "supportTickets", ticket.id),
        { status, resolvedByName: serviceProfile.name, resolvedAt: serverTimestamp() },
        { merge: true },
      );
      setSupportTickets((current) =>
        current.map((item) =>
          item.id === ticket.id
            ? { ...item, status, resolvedByName: serviceProfile.name }
            : item,
        ),
      );
    } catch (resolveError) {
      if (await handleFirestoreError(resolveError)) {
        return;
      }
      setError("No pudimos actualizar el ticket.");
    } finally {
      setSupportBusyId("");
    }
  }

  function handleRetryFirestore() {
    try {
      window.localStorage.removeItem(FIRESTORE_DISABLED_STORAGE_KEY);
    } catch {
      // Ignore storage write issues.
    }

    window.location.reload();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      await setPersistence(auth, browserLocalPersistence);

      const loginIdentifier = email.trim();

      if (
        normalizeKey(loginIdentifier) === normalizeKey(ADMIN_USERNAME) &&
        password === ADMIN_PASSWORD
      ) {
        try {
          await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
        } catch (loginError) {
          const authCode = (loginError as AuthError).code;

          if (authCode !== "auth/invalid-credential" && authCode !== "auth/user-not-found") {
            throw loginError;
          }

          try {
            const credential = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
            void ensureDefaultAdminProfile(credential.user).catch(() => {
              // Ignore background admin profile sync failures during account bootstrap.
            });
          } catch (createAdminError) {
            const createAdminCode = (createAdminError as AuthError).code;

            if (createAdminCode === "auth/email-already-in-use") {
              throw new Error("admin-access-failed");
            }

            throw createAdminError;
          }
        }
      } else if (findSupervisorAccountByUsername(loginIdentifier)) {
        // Supervisores: cuentas fijas en codigo. Se firma con su correo de acceso
        // determinista; en el primer ingreso (clave temporal sembrada) se crea la
        // cuenta Firebase y su perfil. Tras cambiar la clave, entran normalmente.
        const supervisorAccount = findSupervisorAccountByUsername(loginIdentifier)!;
        const supervisorEmail = getSupervisorLoginEmail(supervisorAccount.username);

        try {
          await signInWithEmailAndPassword(auth, supervisorEmail, password);
        } catch (loginError) {
          const authCode = (loginError as AuthError).code;

          if (
            (authCode !== "auth/invalid-credential" && authCode !== "auth/user-not-found") ||
            password !== supervisorAccount.password
          ) {
            throw loginError;
          }

          const credential = await createUserWithEmailAndPassword(
            auth,
            supervisorEmail,
            supervisorAccount.password,
          );
          void ensureSupervisorProfile(credential.user, supervisorAccount).catch(() => {
            // Ignore background supervisor profile sync failures during bootstrap.
          });
        }
      } else {
        const resolvedEmail = resolveLoginEmail(loginIdentifier);
        await signInWithEmailAndPassword(auth, resolvedEmail, password);
      }

      setPassword("");
      // Modal "Iniciando sesion" con barrita de pulso por ~2 segundos.
      setLoginLoading(true);
      window.setTimeout(() => setLoginLoading(false), 2000);
    } catch (submitError) {
      if (await handleFirestoreError(submitError)) {
        return;
      }

      setError(getAuthErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateAdminCreateForm(field: keyof AdminCreateForm, value: string) {
    setAdminCreateForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  async function handleAdminCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (firestoreUnavailable) {
      setError(FIRESTORE_SETUP_MESSAGE);
      setMessage("");
      return;
    }

    const service = getServiceById(adminCreateForm.serviceId);

    if (!service) {
      setError(getAuthErrorMessage(new Error("service-required")));
      setMessage("");
      return;
    }

    setIsCreatingManagedUser(true);
    setError("");
    setMessage("");

    const secondarySession = createSecondaryAuth();

    try {
      const { serviceUsername } = await createServiceUserAccount(secondarySession.auth, {
        service,
        email: adminCreateForm.email,
        firstName: adminCreateForm.firstName,
        lastName: adminCreateForm.lastName,
        dui: adminCreateForm.dui,
        phone: adminCreateForm.phone,
      });

      const users = await fetchManagedUsers();
      applyAdminUsers(users);
      setAdminCreateForm({
        firstName: "",
        lastName: "",
        email: "",
        dui: "",
        phone: "",
        serviceId: "",
      });
      setMessage(
        `Cuenta creada para ${service.name}. Inicia sesion con el usuario "${serviceUsername}" y la contrasena temporal "${DEFAULT_TEMP_PASSWORD}".`,
      );
    } catch (createError) {
      if (await handleFirestoreError(createError)) {
        return;
      }

      setError(getAuthErrorMessage(createError));
    } finally {
      try {
        await signOut(secondarySession.auth);
      } catch {
        // Ignore secondary sign-out issues after account creation.
      }

      try {
        await secondarySession.dispose();
      } catch {
        // Ignore secondary app disposal races.
      }

      setIsCreatingManagedUser(false);
    }
  }

  // Registro PUBLICO de un jefe: guarda la solicitud (sin sesion) para que la
  // aprueben los admins. No crea la cuenta todavia.
  async function handleSignupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const service = getServiceById(signupForm.serviceId);
    if (
      !signupForm.firstName.trim() ||
      !signupForm.lastName.trim() ||
      !signupForm.email.trim() ||
      !service
    ) {
      setError("Completá nombres, apellidos, correo y elegí tu servicio.");
      return;
    }
    if (!signupForm.acceptPrivacy) {
      setError("Tenés que aceptar las políticas de privacidad para continuar.");
      return;
    }

    setIsSubmittingSignup(true);
    try {
      const id = `signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await setDoc(doc(db, "signupRequests", id), {
        firstName: signupForm.firstName.trim(),
        lastName: signupForm.lastName.trim(),
        email: signupForm.email.trim(),
        serviceId: service.id,
        serviceName: service.name,
        status: "pending",
        acceptedPrivacy: true,
        createdAt: serverTimestamp(),
      });
      setShowSignupModal(false);
      setSignupForm({
        firstName: "",
        lastName: "",
        email: "",
        serviceId: "",
        acceptPrivacy: false,
      });
      setMessage(
        "¡Solicitud enviada! Un administrador la revisará y te dará acceso pronto.",
      );
    } catch {
      setError("No pudimos enviar tu solicitud. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setIsSubmittingSignup(false);
    }
  }

  // Admin aprueba un registro: crea la cuenta del jefe (usuario por nombre, pass 123456).
  async function handleApproveSignup(req: SignupRequest) {
    const service = getServiceById(req.serviceId);
    if (!service) {
      setError("El servicio de la solicitud no es válido.");
      return;
    }
    setSignupBusyId(req.id);
    setError("");
    setMessage("");
    const secondary = createSecondaryAuth();
    try {
      const { username } = await createChiefUserAccount(secondary.auth, {
        service,
        contactEmail: req.email,
        firstName: req.firstName,
        lastName: req.lastName,
      });
      await setDoc(
        doc(db, "signupRequests", req.id),
        { status: "approved", createdUsername: username, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setMessage(
        `Cuenta creada para ${req.firstName} ${req.lastName}. Usuario "${username}", contraseña "${CHIEF_TEMP_PASSWORD}".`,
      );
    } catch (approveError) {
      setError(getAuthErrorMessage(approveError));
    } finally {
      try {
        await signOut(secondary.auth);
      } catch {
        // Ignore secondary sign-out issues.
      }
      try {
        await secondary.dispose();
      } catch {
        // Ignore secondary disposal races.
      }
      setSignupBusyId("");
    }
  }

  async function handleRejectSignup(req: SignupRequest) {
    setSignupBusyId(req.id);
    try {
      await setDoc(
        doc(db, "signupRequests", req.id),
        { status: "rejected", updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch {
      // Ignore.
    } finally {
      setSignupBusyId("");
    }
  }

  async function handleSignOut() {
    setError("");
    setMessage("");
    setActiveSidebarSection("panel-overview");
    setServiceProfile(null);
    setTableValues({});
    clearAdminUsersState();
    setNewPassword("");
    setConfirmPassword("");
    await signOut(auth);
  }

  function handleCellChange(row: string, header: string, rawValue: string) {
    if (isFixedRow(row)) {
      return; // Fila de valores fijos: no editable.
    }

    const value = sanitizeNumericValue(rawValue);

    setTableValues((currentValues) => ({
      ...currentValues,
      [row]: {
        ...(currentValues[row] || {}),
        [header]: value,
      },
    }));
  }

  // ---- Filas PERC agregadas/ocultas (solo admin y supervisores) -------------
  function handleAddPercRow(anchorKey: string) {
    if (!(isAdmin || isSupervisor)) {
      return;
    }
    const key = `px-${Math.floor(Date.now())}-${percExtraRows.length + 1}`;
    setPercExtraRows((cur) => [...cur, { key, label: "NUEVA FILA", afterKey: anchorKey }]);
    setTableValues((cur) => ({
      ...cur,
      [key]: Object.fromEntries(TABULATOR_HEADERS.map((h) => [h, ""])),
    }));
    setMessage("Fila agregada al PERC. Escribí su nombre y no olvides «Guardar datos».");
  }

  function handleRenamePercRow(key: string, label: string) {
    if (!(isAdmin || isSupervisor)) {
      return;
    }
    setPercExtraRows((cur) => cur.map((r) => (r.key === key ? { ...r, label } : r)));
  }

  function handleRemovePercRow(key: string, isExtra: boolean, label: string) {
    if (!(isAdmin || isSupervisor)) {
      return;
    }
    if (isExtra) {
      setPercExtraRows((cur) => cur.filter((r) => r.key !== key));
      return;
    }
    const ok =
      typeof window === "undefined" ||
      window.confirm(
        `¿Ocultar la fila oficial «${label}»? No se borran sus datos y podés restaurarla luego. Recordá guardar.`,
      );
    if (!ok) {
      return;
    }
    setPercHiddenKeys((cur) => (cur.includes(key) ? cur : [...cur, key]));
  }

  function handleRestorePercRows() {
    if (!(isAdmin || isSupervisor)) {
      return;
    }
    setPercHiddenKeys([]);
    setMessage("Filas PERC oficiales restauradas. Recordá «Guardar datos».");
  }

  function handleClearTable() {
    if (!currentService) {
      return;
    }

    setTableValues(buildEmptyTable(currentService));
    setMessage("Tabla limpiada localmente. Puedes volver a cargar o guardar nuevos datos.");
    setError("");
  }

  async function handleSave() {
    if (!user || !currentService || !serviceProfile || firestoreUnavailable) {
      return;
    }

    // Mes destino: el que se este viendo (historial) o el de captura actual.
    const targetPeriod = percViewPeriod ?? periodId;
    const targetPeriodLabel = getPeriodLabel(targetPeriod);
    const editingHistory = percViewPeriod !== null;

    // Calidad: no se puede capturar un mes ADELANTE del mes en cierre.
    if (targetPeriod > periodId) {
      setError(
        "Ese mes todavía no está habilitado. Solo se captura el mes en cierre o meses anteriores.",
      );
      setMessage("");
      return;
    }

    if (editingHistory && !isAdmin) {
      setError("Solo el administrador puede editar meses anteriores.");
      setMessage("");
      return;
    }

    if (!serviceProfile.permissions.canEdit && !isAdmin) {
      setError("Tu cuenta no tiene permiso de captura en este momento.");
      setMessage("");
      return;
    }

    if (!editingHistory && !currentServiceCaptureOpen && !isAdmin) {
      setError("El periodo de captura esta cerrado para este mes.");
      setMessage("");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    const normalizedValues = mergeWithTemplate(
      currentService,
      tableValues,
      percExtraRows.map((e) => e.key),
    );

    try {
      await setDoc(
        doc(db, "serviceTabulators", `${targetPeriod}__${currentService.id}`),
        {
          periodId: targetPeriod,
          periodLabel: targetPeriodLabel,
          serviceId: currentService.id,
          serviceName: currentService.name,
          headers: TABULATOR_HEADERS,
          rows: currentService.rows,
          extraRows: percExtraRows,
          hiddenKeys: percHiddenKeys,
          userId: user.uid,
          userEmail: user.email || "",
          values: normalizedValues,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setTableValues(normalizedValues);
      await refreshPublicDashboard(false);

      setMessage(`Datos guardados correctamente para ${currentService.name} (${targetPeriodLabel}).`);
    } catch (saveError) {
      if (await handleFirestoreError(saveError)) {
        return;
      }

      setError("No pudimos guardar los datos. Revisa Firestore e intentalo de nuevo.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleSepsCellChange(rowKey: string, day: string, rawValue: string) {
    const value = sanitizeNumericValue(rawValue);

    setSepsValues((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] || {}),
        [day]: value,
      },
    }));
  }

  // Navegacion tipo Excel entre celdas SEPS con las 4 flechas (y Enter = abajo).
  // ArrowUp/Down se mueven entre filas capturables (saltan las de solo lectura);
  // ArrowLeft/Right cambian de dia solo cuando el cursor esta al borde del texto.
  function handleSepsKeyNav(
    event: ReactKeyboardEvent<HTMLInputElement>,
    tableId: string,
    rowKey: string,
    day: string,
  ) {
    const key = event.key;
    if (
      key !== "ArrowUp" &&
      key !== "ArrowDown" &&
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "Enter"
    ) {
      return;
    }
    const table = (sepsTemplate?.tables ?? []).find((t) => t.id === tableId);
    if (!table) {
      return;
    }
    const rows = buildSepsEffectiveRows(table, sepsExtraRows, sepsHiddenKeys).filter(
      (r) => !r.readOnly,
    );
    const days = sepsDayColumns;
    const rIdx = rows.findIndex((r) => r.key === rowKey);
    const cIdx = days.indexOf(day);
    if (rIdx < 0 || cIdx < 0) {
      return;
    }
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd =
      input.selectionStart === input.value.length &&
      input.selectionEnd === input.value.length;
    let tr = rIdx;
    let tc = cIdx;
    if (key === "ArrowUp") {
      tr = rIdx - 1;
    } else if (key === "ArrowDown" || key === "Enter") {
      tr = rIdx + 1;
    } else if (key === "ArrowLeft") {
      if (!atStart) return;
      tc = cIdx - 1;
    } else if (key === "ArrowRight") {
      if (!atEnd) return;
      tc = cIdx + 1;
    }
    if (tr < 0 || tr >= rows.length || tc < 0 || tc >= days.length) {
      return;
    }
    event.preventDefault();
    const target = window.document.getElementById(
      `seps-${tableId}-${rows[tr].key}-${days[tc]}`,
    );
    if (target instanceof HTMLInputElement) {
      target.focus();
      target.select();
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  // ---- Filas SEPS agregadas/ocultas (solo admin y supervisores) -------------
  function handleAddSepsRow(tableId: string, anchorKey: string) {
    if (!(isAdmin || isSupervisor)) {
      return;
    }
    const key = `sx-${Math.floor(Date.now())}-${sepsExtraRows.length + 1}`;
    setSepsExtraRows((cur) => [...cur, { tableId, key, label: "NUEVA FILA", afterKey: anchorKey }]);
    setMessage("Fila agregada al SEPS. Escribí su nombre y no olvides «Guardar».");
  }

  function handleRenameSepsRow(key: string, label: string) {
    if (!(isAdmin || isSupervisor)) {
      return;
    }
    setSepsExtraRows((cur) => cur.map((r) => (r.key === key ? { ...r, label } : r)));
  }

  function handleRemoveSepsRow(key: string, isExtra: boolean, label: string) {
    if (!(isAdmin || isSupervisor)) {
      return;
    }
    if (isExtra) {
      setSepsExtraRows((cur) => cur.filter((r) => r.key !== key));
      return;
    }
    const ok =
      typeof window === "undefined" ||
      window.confirm(
        `¿Ocultar la fila oficial «${label}»? No se borran sus datos y podés restaurarla luego. Recordá guardar.`,
      );
    if (!ok) {
      return;
    }
    setSepsHiddenKeys((cur) => (cur.includes(key) ? cur : [...cur, key]));
  }

  function handleRestoreSepsRows() {
    if (!(isAdmin || isSupervisor)) {
      return;
    }
    setSepsHiddenKeys([]);
    setMessage("Filas SEPS oficiales restauradas. Recordá «Guardar».");
  }

  // ---- Comentarios de revision del SEPS (admin/supervisores/revisor) --------
  // Quien puede dejar comentarios en el SEPS de un servicio.
  const canCommentSeps = isAdmin || isSupervisor || isSepsStaff;
  // Para el SERVICIO (no revisor): cuantos comentarios de revision tiene su SEPS,
  // para destacarlos (badge en el menu + panel resaltado).
  const serviceSepsCommentCount = !canCommentSeps ? sepsComments.length : 0;

  // Agrega un comentario y lo GUARDA de inmediato en el doc del mes/servicio
  // (merge, sin tocar valores), para que el servicio lo vea aunque no se guarde
  // toda la tabla. Requiere permiso de escritura del doc (reglas de Firestore).
  async function handleAddSepsComment() {
    if (!canCommentSeps || !sepsTemplate || !user || firestoreUnavailable) {
      return;
    }
    const text = sepsCommentDraft.trim();
    if (!text) {
      return;
    }
    const author = serviceProfile?.name || user.email?.split("@")[0] || "Revisor";
    const comment: SepsComment = {
      id: `c-${Math.floor(Date.now())}-${sepsComments.length + 1}`,
      author,
      text,
      at: Date.now(),
    };
    const targetPeriod = sepsViewPeriod ?? sepsPeriodId;
    const nextComments = [...sepsComments, comment];
    setSepsComments(nextComments);
    setSepsCommentDraft("");
    try {
      await setDoc(
        doc(db, "sepsTabulators", `${targetPeriod}__${sepsTemplate.serviceId}`),
        { comments: nextComments, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setMessage("Comentario enviado. El servicio podrá verlo en su SEPS.");
    } catch (commentError) {
      if (await handleFirestoreError(commentError)) {
        return;
      }
      setError("No pudimos enviar el comentario.");
    }
  }

  async function handleDeleteSepsComment(commentId: string) {
    if (!canCommentSeps || !sepsTemplate || firestoreUnavailable) {
      return;
    }
    const targetPeriod = sepsViewPeriod ?? sepsPeriodId;
    const nextComments = sepsComments.filter((c) => c.id !== commentId);
    setSepsComments(nextComments);
    try {
      await setDoc(
        doc(db, "sepsTabulators", `${targetPeriod}__${sepsTemplate.serviceId}`),
        { comments: nextComments, updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (deleteError) {
      await handleFirestoreError(deleteError);
    }
  }

  async function handleSaveSeps() {
    if (!user || !sepsTemplate || !serviceProfile || firestoreUnavailable) {
      return;
    }

    // El consolidado es de solo lectura (suma calculada): no se guarda.
    if (sepsTemplate.consolidatesFrom) {
      return;
    }

    const targetPeriod = sepsViewPeriod ?? sepsPeriodId;
    const targetPeriodLabel = getPeriodLabel(targetPeriod);
    const editingHistory = sepsViewPeriod !== null;

    // Calidad: no se puede capturar un mes ADELANTE del mes en cierre.
    if (targetPeriod > sepsPeriodId) {
      setError(
        "Ese mes todavía no está habilitado. Solo se captura el mes en cierre o meses anteriores.",
      );
      setMessage("");
      return;
    }

    if (editingHistory && !isAdmin && !isSepsStaff) {
      setError("Solo el administrador puede editar meses anteriores.");
      setMessage("");
      return;
    }

    if (!serviceProfile.permissions.canEdit && !isAdmin && !isSepsStaff) {
      setError("Tu cuenta no tiene permiso de captura en este momento.");
      setMessage("");
      return;
    }

    if (!editingHistory && !sepsCaptureOpen && !isAdmin && !isSepsStaff) {
      setError("La captura SEPS esta cerrada en este momento.");
      setMessage("");
      return;
    }

    setIsSavingSeps(true);
    setError("");
    setMessage("");

    const normalizedValues = mergeSepsWithTemplate(
      sepsTemplate,
      targetPeriod,
      sepsValues,
      sepsExtraRows.map((e) => e.key),
    );

    try {
      await setDoc(
        doc(db, "sepsTabulators", `${targetPeriod}__${sepsTemplate.serviceId}`),
        {
          periodId: targetPeriod,
          periodLabel: targetPeriodLabel,
          module: "sesps",
          serviceId: sepsTemplate.serviceId,
          serviceName: sepsTemplate.displayName ?? currentService?.name ?? sepsTemplate.serviceId,
          userId: user.uid,
          userEmail: user.email || "",
          values: normalizedValues,
          extraRows: sepsExtraRows,
          hiddenKeys: sepsHiddenKeys,
          comments: sepsComments,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setSepsValues(normalizedValues);
      setSepsDataPeriods((prev) => new Set(prev).add(targetPeriod));
      setMessage(`Tabulador SEPS guardado correctamente (${targetPeriodLabel}).`);
    } catch (saveError) {
      if (await handleFirestoreError(saveError)) {
        return;
      }

      setError("No pudimos guardar el tabulador SEPS. Revisa Firestore e intentalo de nuevo.");
    } finally {
      setIsSavingSeps(false);
    }
  }

  // Recupera lo guardado de SEPS para el periodo actual (vuelve a leer de Firestore).
  async function loadSavedSeps() {
    if (!sepsTemplate || firestoreUnavailable) {
      return;
    }

    setError("");
    setMessage("");
    setIsLoadingSeps(true);

    try {
      const data = await fetchSepsDataForPeriod(sepsTemplate, sepsPeriodId);
      setSepsValues(data.values);
      setSepsExtraRows(data.extraRows);
      setSepsHiddenKeys(data.hiddenKeys);
      setSepsComments(data.comments);
      setMessage(`Datos SEPS recuperados (${sepsPeriodLabel}).`);
    } catch (loadError) {
      if (await handleFirestoreError(loadError)) {
        return;
      }
      setError("No pudimos recuperar los datos SEPS guardados.");
    } finally {
      setIsLoadingSeps(false);
    }
  }

  // Carga el SEPS de un mes especifico para el historial (solo lectura salvo admin).
  async function loadSepsHistory(period: string) {
    if (!sepsTemplate || firestoreUnavailable) {
      return;
    }

    setError("");
    setMessage("");
    setIsLoadingSeps(true);

    try {
      const data = await fetchSepsDataForPeriod(sepsTemplate, period);
      setSepsValues(data.values);
      setSepsExtraRows(data.extraRows);
      setSepsHiddenKeys(data.hiddenKeys);
      setSepsComments(data.comments);
      setSepsViewPeriod(period === sepsPeriodId ? null : period);

      if (period !== sepsPeriodId) {
        setMessage(`Mostrando historial SEPS de ${getPeriodLabel(period)}.`);
      } else {
        setMessage(`Volviste al mes de captura SEPS (${sepsPeriodLabel}).`);
      }
    } catch (loadError) {
      if (await handleFirestoreError(loadError)) {
        return;
      }
      setError("No pudimos cargar el historial SEPS de ese mes.");
    } finally {
      setIsLoadingSeps(false);
    }
  }

  // Limpia la tabla SEPS localmente (no borra lo guardado en Firestore).
  function handleClearSeps() {
    if (!sepsTemplate) {
      return;
    }
    setSepsValues(buildEmptySeps(sepsTemplate, sepsPeriodId));
    setMessage("Tabla SEPS limpiada localmente. Puedes volver a cargar o guardar nuevos datos.");
    setError("");
  }

  // Lee la plantilla Excel oficial de un SEPS diario (p.ej. Banco de Sangre) y llena
  // la tabla. El emparejamiento es POSICIONAL: cada tabla del tabulador se ubica por su
  // fila "Días del mes" (hay una por tabla, en el mismo orden) y las filas de datos que
  // siguen se asignan en orden a las filas de la plantilla. Las columnas de dia se leen
  // directamente (no estan combinadas), asi que no hace falta resolver merges.
  async function handleUploadSepsFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !sepsTemplate || !sepsTemplate.tables) {
      return;
    }
    setIsImportingSeps(true);
    setError("");
    setMessage("");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      // Elegir hoja: primero el mes del periodo (p.ej. "JUNIO 2026"), luego "MES ACTUAL",
      // luego la primera hoja que no sea plantilla/historico, y por ultimo la primera.
      const norm = (s: unknown) =>
        String(s ?? "")
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toUpperCase();
      const monthSheet = getShortPeriodLabel(sepsPeriodId)
        .replace(" - ", " ")
        .toUpperCase();
      const names = wb.SheetNames;
      const pick =
        names.find((n) => norm(n) === norm(monthSheet)) ||
        names.find((n) => norm(n) === "MES ACTUAL") ||
        names.find((n) => !["FORMATO", "HISTORICO BS"].includes(norm(n))) ||
        names[0];
      const ws = pick ? wb.Sheets[pick] : undefined;
      if (!ws) {
        throw new Error("No se encontró una hoja válida en el Excel");
      }
      const aoa = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      }) as unknown[][];

      // Filas "Días del mes" (una por tabla del tabulador, en orden).
      const headerRows: number[] = [];
      for (let r = 0; r < aoa.length; r += 1) {
        const row = aoa[r] || [];
        if (row.some((c) => typeof c === "string" && c.includes("Días del mes"))) {
          headerRows.push(r);
        }
      }

      const next = buildEmptySeps(sepsTemplate, sepsPeriodId);
      const dayCols = getDayColumns(sepsPeriodId);
      let filledCells = 0;

      sepsTemplate.tables.forEach((table, ti) => {
        const hr = headerRows[ti];
        if (hr === undefined) {
          return;
        }
        // Fila de numeros de dia = hr + 1; localizar la columna del dia "1".
        const dayNumRow = aoa[hr + 1] || [];
        let day1Col = dayNumRow.findIndex((c) => Number(c) === 1);
        if (day1Col < 0) {
          day1Col = 5; // Columna F por defecto (formato oficial MINSAL).
        }
        const dataStart = hr + 2;
        table.rows.forEach((row, ri) => {
          const dataRow = aoa[dataStart + ri] || [];
          // Las filas calculadas (p.ej. "Tamizada") se derivan solas; no se importan.
          if (row.readOnly) {
            return;
          }
          dayCols.forEach((day, di) => {
            const raw = dataRow[day1Col + di];
            const value = sanitizeNumericValue(String(raw ?? ""));
            if (value !== "") {
              next[row.key] = { ...(next[row.key] || {}), [day]: value };
              filledCells += 1;
            }
          });
        });
      });

      if (filledCells === 0) {
        throw new Error(
          "No se encontraron valores en el Excel. Verifique que subió la hoja del mes correcto.",
        );
      }
      setSepsValues(next);
      setMessage(
        `Se importaron ${filledCells} valores desde la hoja "${pick}". Revise los datos y presione Guardar SEPS para confirmar.`,
      );
    } catch (err) {
      console.error(err);
      setError(
        "No pudimos leer el Excel. Suba la plantilla oficial de Banco de Sangre sin cambiar la estructura de las tablas.",
      );
    } finally {
      setIsImportingSeps(false);
    }
  }

  // --- Distribucion de Horas (empleados) ---
  function updateHorasEmployee(index: number, patch: Partial<HorasEmployee>) {
    setHorasEmployees((current) =>
      current.map((emp, i) => (i === index ? { ...emp, ...patch } : emp)),
    );
  }

  function handleHorasName(index: number, value: string) {
    updateHorasEmployee(index, { name: value });
  }

  function handleHorasDui(index: number, value: string) {
    updateHorasEmployee(index, { dui: value });
  }

  function handleHorasComment(index: number, value: string) {
    updateHorasEmployee(index, { comment: value });
  }

  function handleHorasHour(index: number, column: string, rawValue: string) {
    const value = sanitizeNumericValue(rawValue);
    setHorasEmployees((current) =>
      current.map((emp, i) =>
        i === index ? { ...emp, hours: { ...emp.hours, [column]: value } } : emp,
      ),
    );
  }

  function handleAddHorasEmployee() {
    if (!horasTemplate) {
      return;
    }
    setHorasEmployees((current) => {
      const next = [...current, buildEmptyHorasEmployee(horasTemplate)];
      // Asegura que la nueva fila quede visible aunque la tabla este paginada.
      setHorasVisibleCount((c) => Math.max(c, next.length));
      return next;
    });
  }

  function handleRemoveHorasEmployee(index: number) {
    // Abre el modal de confirmacion (reemplaza el window.confirm nativo).
    setHorasEmployeeToRemove(index);
  }

  function cancelRemoveHorasEmployee() {
    setHorasEmployeeToRemove(null);
  }

  function confirmRemoveHorasEmployee() {
    if (horasEmployeeToRemove === null) {
      return;
    }
    const index = horasEmployeeToRemove;
    setHorasEmployees((current) => current.filter((_, i) => i !== index));
    setHorasEmployeeToRemove(null);
  }

  // Descarga una plantilla .xlsx del servicio actual con los nombres/DUI ya puestos
  // y una columna por cada centro de costo, para llenar las horas y volver a subirla.
  async function handleDownloadHorasTemplate() {
    if (!horasTemplate) {
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const header = ["NOMBRE DEL EMPLEADO", "DUI", ...horasTemplate.columns];
      const rows = horasEmployees.map((emp) => [
        emp.name,
        emp.dui,
        ...horasTemplate.columns.map((col) => emp.hours[col] ?? ""),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws["!cols"] = [
        { wch: 40 },
        { wch: 14 },
        ...horasTemplate.columns.map(() => ({ wch: 16 })),
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Horas");
      const period = horasViewPeriod ?? periodId;
      XLSX.writeFile(wb, `Horas_${horasTemplate.serviceId}_${period}.xlsx`);
    } catch (err) {
      console.error(err);
      setError("No pudimos generar la plantilla Excel.");
    }
  }

  // Lee un .xlsx llenado con la plantilla y REEMPLAZA la tabla de Horas del servicio
  // con lo que venga en el archivo (empareja columnas por encabezado).
  async function handleUploadHorasFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permite volver a elegir el mismo archivo mas tarde.
    event.target.value = "";
    if (!file || !horasTemplate) {
      return;
    }
    setIsImportingHoras(true);
    setError("");
    setMessage("");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        throw new Error("La hoja esta vacia");
      }
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
      if (aoa.length < 2) {
        throw new Error("Sin filas de datos");
      }
      const norm = (s: unknown) =>
        String(s ?? "")
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, " ");
      const headerRow = (aoa[0] as unknown[]).map(norm);
      const nameIdx = headerRow.findIndex((h) => h.includes("NOMBRE"));
      const duiIdx = headerRow.findIndex((h) => h === "DUI");
      const colIdx = horasTemplate.columns.map((col) => headerRow.indexOf(norm(col)));

      const imported: HorasEmployee[] = [];
      for (let r = 1; r < aoa.length; r++) {
        const row = aoa[r] as unknown[];
        if (!row || row.length === 0) {
          continue;
        }
        const name = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
        const dui = duiIdx >= 0 ? String(row[duiIdx] ?? "").trim() : "";
        const hours: Record<string, string> = {};
        horasTemplate.columns.forEach((col, i) => {
          const idx = colIdx[i];
          const value = idx >= 0 ? row[idx] : "";
          hours[col] = String(value ?? "").trim();
        });
        const hasData =
          name !== "" || dui !== "" || Object.values(hours).some((h) => h !== "");
        if (!hasData) {
          continue;
        }
        imported.push({ name, dui, comment: "", hours });
      }
      if (imported.length === 0) {
        throw new Error("No se encontraron empleados en el archivo");
      }
      setHorasEmployees(imported);
      setMessage(
        `Se importaron ${imported.length} empleados desde el Excel. Revise los datos y presione Guardar para confirmar.`,
      );
    } catch (err) {
      console.error(err);
      setError(
        "No pudimos leer el Excel. Use la plantilla descargada, sin cambiar los encabezados.",
      );
    } finally {
      setIsImportingHoras(false);
    }
  }

  async function handleSaveHoras() {
    if (!user || !horasTemplate || !serviceProfile || firestoreUnavailable) {
      return;
    }

    const targetPeriod = horasViewPeriod ?? periodId;
    const targetPeriodLabel = getPeriodLabel(targetPeriod);
    const editingHistory = horasViewPeriod !== null;

    // Calidad: no se puede capturar un mes ADELANTE del mes en cierre.
    if (targetPeriod > periodId) {
      setError(
        "Ese mes todavía no está habilitado. Solo se captura el mes en cierre o meses anteriores.",
      );
      setMessage("");
      return;
    }

    if (editingHistory && !isAdmin) {
      setError("Solo el administrador puede editar meses anteriores.");
      setMessage("");
      return;
    }

    if (!serviceProfile.permissions.canEdit && !isAdmin) {
      setError("Tu cuenta no tiene permiso de captura en este momento.");
      setMessage("");
      return;
    }

    if (!editingHistory && !currentServiceCaptureOpen && !isAdmin) {
      setError("La captura de Distribucion de Horas esta cerrada en este momento.");
      setMessage("");
      return;
    }

    // No permitir guardar si NO hay horas cargadas (al menos un numero en las columnas).
    const hasAnyHours = horasEmployees.some((emp) =>
      Object.values(emp.hours).some((h) => String(h).trim() !== ""),
    );
    if (!hasAnyHours) {
      setError("Cargá las horas de al menos un recurso antes de guardar (no se puede guardar vacío).");
      setMessage("");
      return;
    }

    setIsSavingHoras(true);
    setError("");
    setMessage("");

    // Solo guardamos empleados con nombre o algun dato (evita filas vacias).
    const cleaned = horasEmployees.filter(
      (emp) => emp.name.trim() !== "" || Object.values(emp.hours).some((h) => h.trim() !== ""),
    );

    try {
      await setDoc(
        doc(db, "horasTabulators", `${targetPeriod}__${horasTemplate.serviceId}`),
        {
          periodId: targetPeriod,
          periodLabel: targetPeriodLabel,
          module: "distribucion",
          serviceId: horasTemplate.serviceId,
          serviceName: horasTemplate.displayName ?? currentService?.name ?? horasTemplate.serviceId,
          columns: horasTemplate.columns,
          employees: cleaned,
          userId: user.uid,
          userEmail: user.email || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setHorasSaved(true);
      setHorasDataPeriods((prev) => new Set(prev).add(targetPeriod));
      setMessage(`Distribucion de Horas guardada correctamente (${targetPeriodLabel}).`);
    } catch (saveError) {
      if (await handleFirestoreError(saveError)) {
        return;
      }
      setError("No pudimos guardar Distribucion de Horas. Revisa Firestore e intentalo de nuevo.");
    } finally {
      setIsSavingHoras(false);
    }
  }

  // Recupera los empleados guardados de Horas para el periodo actual.
  async function loadSavedHoras() {
    if (!horasTemplate || firestoreUnavailable) {
      return;
    }

    setError("");
    setMessage("");
    setIsLoadingHoras(true);

    try {
      const result = await fetchHorasForPeriod(horasTemplate, periodId);
      setHorasEmployees(result.employees);
      setHorasSaved(result.saved);
      setMessage(`Distribucion de Horas recuperada (${periodLabel}).`);
    } catch (loadError) {
      if (await handleFirestoreError(loadError)) {
        return;
      }
      setError("No pudimos recuperar la Distribucion de Horas guardada.");
    } finally {
      setIsLoadingHoras(false);
    }
  }

  // Carga las Horas de un mes especifico para el historial (solo lectura salvo admin).
  async function loadHorasHistory(period: string) {
    if (!horasTemplate || firestoreUnavailable) {
      return;
    }

    setError("");
    setMessage("");
    setIsLoadingHoras(true);

    try {
      const result = await fetchHorasForPeriod(horasTemplate, period);
      setHorasEmployees(result.employees);
      setHorasSaved(result.saved);
      setHorasViewPeriod(period === periodId ? null : period);

      if (period !== periodId) {
        setMessage(`Mostrando historial de Horas de ${getPeriodLabel(period)}.`);
      } else {
        setMessage(`Volviste al mes de captura de Horas (${periodLabel}).`);
      }
    } catch (loadError) {
      if (await handleFirestoreError(loadError)) {
        return;
      }
      setError("No pudimos cargar el historial de Horas de ese mes.");
    } finally {
      setIsLoadingHoras(false);
    }
  }

  // Limpia la tabla de Horas localmente (no borra lo guardado en Firestore).
  function handleClearHoras() {
    if (!horasTemplate) {
      return;
    }
    setHorasEmployees(seedHorasEmployees(horasTemplate));
    setMessage("Tabla de Horas limpiada localmente. Puedes volver a cargar o guardar nuevos datos.");
    setError("");
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth.currentUser || !serviceProfile) {
      return;
    }

    setError("");
    setMessage("");

    if (newPassword.length < 6) {
      setError(getAuthErrorMessage(new Error("change-password-length")));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(getAuthErrorMessage(new Error("change-password-mismatch")));
      return;
    }

    setIsChangingPassword(true);

    try {
      await updatePassword(auth.currentUser, newPassword);
      await setDoc(
        doc(db, "serviceUsers", serviceProfile.uid),
        {
          mustChangePassword: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setServiceProfile({
        ...serviceProfile,
        mustChangePassword: false,
      });

      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordModal(false);
      setMessage("Contrasena actualizada correctamente.");
    } catch (passwordError) {
      setError(getAuthErrorMessage(passwordError));
    } finally {
      setIsChangingPassword(false);
    }
  }

  function updateAdminDraft(uid: string, patch: Partial<AdminDraft>) {
    setAdminDrafts((currentDrafts) => ({
      ...currentDrafts,
      [uid]: {
        ...currentDrafts[uid],
        ...patch,
      },
    }));
  }

  async function handleAdminSave(uid: string) {
    const draft = adminDrafts[uid];
    const current = adminUsers.find((managedUser) => managedUser.uid === uid);

    if (!draft || !current) {
      return;
    }

    const nextService = getServiceById(draft.serviceId || null);
    const nextRole = draft.role;
    const nextUsername =
      nextRole === "service" && nextService ? getServiceUsername(nextService.id) : draft.username;
    const nextPermissions = {
      canEdit: draft.canEdit,
      canManageUsers: nextRole === "admin" ? true : false,
      canToggleCapture: nextRole === "admin" || nextRole === "supervisor",
    } satisfies ServicePermissions;

    setAdminBusyUserId(uid);
    setError("");
    setMessage("");

    try {
      if (draft.serviceId !== (current.serviceId || "")) {
        if (draft.serviceId) {
          const nextAssignmentRef = doc(db, "serviceAssignments", draft.serviceId);
          const nextAssignmentSnapshot = await getDoc(nextAssignmentRef);

          if (
            nextAssignmentSnapshot.exists() &&
            String(nextAssignmentSnapshot.data().uid || "") !== uid
          ) {
            throw new Error("service-already-assigned-admin");
          }
        }

        if (current.serviceId) {
          await deleteDoc(doc(db, "serviceAssignments", current.serviceId));
        }
      }

      if (draft.serviceId && nextService) {
        await setDoc(
          doc(db, "serviceAssignments", draft.serviceId),
          {
            serviceId: nextService.id,
            serviceName: nextService.name,
            uid,
            email: draft.email,
            username: nextUsername,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      await setDoc(
        doc(db, "serviceUsers", uid),
        {
          serviceId: draft.serviceId || null,
          serviceName: nextService?.name || null,
          username: nextUsername,
          role: nextRole,
          isActive: draft.isActive,
          mustChangePassword: draft.mustChangePassword,
          permissions: nextPermissions,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      const users = await fetchManagedUsers();
      applyAdminUsers(users);

      if (user?.uid === uid) {
        const updated = users.find((managedUser) => managedUser.uid === uid) || null;
        setServiceProfile(updated);

        const updatedService = getServiceById(updated?.serviceId);
        if (updatedService) {
          const data = await fetchSavedDataForPeriod(updatedService, periodId);
          setTableValues(data.values);
          setPercExtraRows(data.extraRows);
          setPercHiddenKeys(data.hiddenKeys);
        } else {
          setTableValues({});
          setPercExtraRows([]);
          setPercHiddenKeys([]);
        }
      }

      setMessage(`Permisos actualizados para ${draft.name || draft.email}.`);
    } catch (saveError) {
      setError(getAuthErrorMessage(saveError));
    } finally {
      setAdminBusyUserId("");
    }
  }

  async function handleAdminSendReset(uid: string, managedUser: ManagedUser) {
    setAdminBusyUserId(uid);
    setError("");
    setMessage("");

    try {
      // El reset debe ir al correo de ACCESO real de la cuenta (deterministico),
      // no al correo de contacto que escribio el admin.
      const targetEmail =
        managedUser.role === "service"
          ? getServiceLoginEmail(managedUser.serviceId) || managedUser.email
          : managedUser.email;
      await sendPasswordResetEmail(auth, targetEmail);
      await setDoc(
        doc(db, "serviceUsers", uid),
        {
          mustChangePassword: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      const users = await fetchManagedUsers();
      applyAdminUsers(users);
      setMessage(`Se envio el correo de restablecimiento a ${targetEmail}.`);
    } catch (resetError) {
      setError(getAuthErrorMessage(resetError));
    } finally {
      setAdminBusyUserId("");
    }
  }

  function handleSidebarNavigation(sectionId: string) {
    setActiveSidebarSection(sectionId);
    // Al ir a Horas se expande el tabulador (solo arranca colapsado en el login).
    if (sectionId === "panel-horas") setHorasCollapsed(false);
    // El scroll se DIFIERE: algunas secciones (Censo, Insumos) se montan recien
    // cuando pasan a ser la seccion activa. En el primer clic el nodo todavia no
    // existe en el DOM, por eso antes hacia falta un segundo clic. Esperamos al
    // siguiente frame (post-render) y reintentamos unos pocos frames por si el
    // montaje tarda, asi el PRIMER clic en el submenu ya lleva al tabulador.
    const scrollToSection = (attempt: number) => {
      const section = window.document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        highlightLocatedSection(section);
      } else if (attempt < 5) {
        window.requestAnimationFrame(() => scrollToSection(attempt + 1));
      }
    };
    window.requestAnimationFrame(() => scrollToSection(0));
  }

  // Enciende una "luz" blanca suave en el borde (las 4 lineas) de la seccion a la
  // que se acaba de navegar, ~2 s, para ubicar rapido lo que se buscaba. Usa la
  // Web Animations API para no interferir con el className que maneja React.
  function highlightLocatedSection(section: HTMLElement) {
    if (typeof section.animate !== "function") {
      return;
    }
    section.animate(
      [
        { boxShadow: "0 0 0 2px rgba(255,255,255,0.95), 0 0 24px 6px rgba(255,255,255,0.55)" },
        {
          boxShadow: "0 0 0 2px rgba(255,255,255,0.6), 0 0 16px 3px rgba(255,255,255,0.3)",
          offset: 0.7,
        },
        { boxShadow: "0 0 0 0 rgba(255,255,255,0)" },
      ],
      { duration: 2000, easing: "ease-out" },
    );
  }

  // Logica compartida al tocar un item del menu (sidebar y barra inferior movil).
  // `requestable` se pasa desde el render porque vive dentro del bloque de sesion.
  function runSidebarItem(itemId: string, requestable: ModuleId[] = []) {
    if (itemId.startsWith("panel-monitor-")) {
      // Submenu "Monitoreo" bajo cada modulo: abre el modal de servicios que
      // completaron. panel-monitor-perc/seps/horas -> perc/sesps/distribucion.
      const monitorModule: Record<string, ModuleId> = {
        "panel-monitor-perc": "perc",
        "panel-monitor-seps": "sesps",
        "panel-monitor-horas": "distribucion",
      };
      setStatsModule(monitorModule[itemId] ?? "perc");
      setShowStatsModal(true);
    } else if (itemId.startsWith("panel-module-")) {
      setStatsModule(itemId.replace("panel-module-", "") as ModuleId);
      setShowStatsModal(true);
    } else if (itemId === "panel-users") {
      setShowUsersModal(true);
      void loadAdminUsers();
    } else if (itemId === "panel-avance") {
      setShowBoardModal(true);
    } else if (itemId === "panel-requests") {
      setShowRequestsModal(true);
    } else if (itemId === "panel-request-form") {
      setRequestModuleId(requestable[0] ?? "perc");
      setShowRequestForm(true);
    } else if (itemId === "panel-config") {
      setShowConfigModal(true);
    } else if (itemId === "panel-signups") {
      setShowSignupRequestsModal(true);
    } else if (itemId === "panel-docs") {
      openDocsModal();
    } else {
      handleSidebarNavigation(itemId);
    }
  }

  function handleTogglePanelTheme() {
    setPanelTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }

  const isLoadingSession = !authReady || (user !== null && !profileReady);

  if (user && serviceProfile && !isLoadingSession) {
    const isDateLocked = !currentServiceCaptureOpen;
    const isReopenedLate = currentServiceCaptureOpen && !captureWindow.isOpen;
    const isPermissionLocked = !currentService || !serviceProfile.permissions.canEdit;
    const isFormLocked = isDateLocked || isPermissionLocked;
    // Historial PERC: mes activo, si es historial, y si la edicion esta bloqueada.
    const activePercPeriod = percViewPeriod ?? periodId;
    const isPercHistory = percViewPeriod !== null;
    const percReadOnly = isPercHistory && !isAdmin;
    // El admin nunca queda bloqueado; el servicio: historial = solo lectura, mes actual = ventana.
    const percEditingBlocked = isAdmin ? false : isPercHistory ? true : isFormLocked;
    const percHistoryOptions = buildRecentPeriods(periodId, 12);
    // Gestion de filas del tabulador PERC (agregar/quitar): solo admin/supervisores.
    const canManagePercRows = isAdmin || isSupervisor;
    // Filas EFECTIVAS del PERC: oficiales (sin las ocultas) + agregadas a mano.
    const percEffectiveRows: { key: string; label: string; isExtra: boolean }[] = (() => {
      if (!currentService) return [];
      const hidden = new Set(percHiddenKeys);
      const list = currentService.rows
        .filter((r) => !hidden.has(r))
        .map((r) => ({ key: r, label: r, isExtra: false }));
      const insertedAfter: Record<string, number> = {};
      percExtraRows.forEach((ex) => {
        if (hidden.has(ex.key)) return;
        const row = { key: ex.key, label: ex.label, isExtra: true };
        const idx = list.findIndex((r) => r.key === ex.afterKey);
        if (idx < 0) {
          list.push(row);
          return;
        }
        const off = insertedAfter[ex.afterKey] || 0;
        list.splice(idx + 1 + off, 0, row);
        insertedAfter[ex.afterKey] = off + 1;
      });
      return list;
    })();

    // Selector de mes reutilizable (PERC/SEPS/Horas). Pinta verde el mes con datos, gris el vacio.
    const renderHistorySelector = (config: {
      options: RecentPeriod[];
      currentPeriod: string;
      activePeriod: string;
      isHistory: boolean;
      readOnly: boolean;
      dataPeriods: Set<string>;
      loading: boolean;
      onSelect: (period: string) => void;
    }) => (
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="font-medium">Mes:</span>
          <HistoryMonthSelect
            options={config.options}
            currentPeriod={config.currentPeriod}
            activePeriod={config.activePeriod}
            dataPeriods={config.dataPeriods}
            loading={config.loading}
            onSelect={config.onSelect}
          />
        </div>
        {config.isHistory ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200">
            {config.readOnly ? "HISTORIAL · SOLO LECTURA" : "HISTORIAL · EDICION ADMIN"}
          </span>
        ) : null}
      </div>
    );
    const isLightPanelTheme = panelTheme === "light";
    const openDaysLabel = captureWindow.openDays
      .map((day) => SHORT_DATE_FORMATTER.format(day))
      .join(" / ");
    const adminCalendarSection = isAdmin ? (
      <section
        id="panel-calendar"
        className={`rounded-[24px] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)] ${
          isLightPanelTheme
            ? "border border-slate-200 bg-white text-slate-900"
            : "border border-cyan-400/20 bg-[#202c41]"
        }`}
      >
        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className={`text-xs uppercase tracking-[0.2em] ${isLightPanelTheme ? "text-sky-700" : "text-cyan-200/80"}`}>
              Configuracion mensual
            </p>
            <h2 className="mt-1 text-xl font-semibold">Modificar dias habiles por mes</h2>
            <p className={`mt-1 max-w-3xl text-xs ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
              Configura arriba el calendario operativo del mes. El sistema movera la captura a los
              siguientes dias habiles si agregas cierres, feriados o vacaciones.
            </p>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[280px_1fr]">
          <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Mes a configurar</span>
              <input
                value={calendarEditorPeriodId}
                onChange={(event) => setCalendarEditorPeriodId(event.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                type="month"
              />
            </label>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Desde</span>
                <input
                  value={calendarRangeStart}
                  min={`${calendarEditorPeriodId}-01`}
                  max={`${calendarEditorPeriodId}-31`}
                  onChange={(event) => setCalendarRangeStart(event.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  type="date"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Hasta</span>
                <input
                  value={calendarRangeEnd}
                  min={`${calendarEditorPeriodId}-01`}
                  max={`${calendarEditorPeriodId}-31`}
                  onChange={(event) => setCalendarRangeEnd(event.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  type="date"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Podés marcar un solo día (Desde = Hasta) o varios de una vez (ej. 3 al 6).
            </p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleAddBlockedRange}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/25 hover:bg-white/10"
              >
                + Agregar fecha
              </button>
              <button
                type="button"
                onClick={() => void handleSaveCalendarOverride()}
                disabled={isSavingCalendar}
                className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingCalendar ? "Guardando..." : "Guardar calendario"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-3">
              <h3 className="text-base font-semibold text-white">Fechas excluidas</h3>
              <p className="mt-1.5 text-xs text-slate-300">
                Usa esta lista para vacaciones, feriados extraordinarios o cierres.{" "}
                <span className="font-semibold text-emerald-300">
                  Tocá una fecha para volver a habilitarla
                </span>{" "}
                (si la marcaste por error).
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {calendarEditorBlockedDates.length > 0 ? (
                  calendarEditorBlockedDates.map((dateKey) => (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => handleRemoveBlockedDate(dateKey)}
                      title="Tocar para habilitar este día (quitarlo de excluidas)"
                      className="group inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-950/30 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-emerald-400/50 hover:bg-emerald-900/30 hover:text-emerald-100"
                    >
                      {dateKey}
                      <span className="text-sm leading-none">×</span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No hay fechas excluidas para este mes.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-3">
              <h3 className="text-base font-semibold text-white">Vista previa</h3>
              <p className="mt-1.5 text-xs text-slate-300">
                Primeros dias habiles que quedaran abiertos para captura.
              </p>

              <div className="mt-3 space-y-1.5">
                {calendarPreviewWindow ? (
                  calendarPreviewWindow.openDays.map((day, index) => (
                    <div
                      key={getDateKey(day)}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${
                        isLightPanelTheme
                          ? "border-slate-200 bg-slate-50 text-slate-700"
                          : "border-cyan-400/20 bg-cyan-950/20 text-cyan-100"
                      }`}
                    >
                      Dia habil {index + 1}: {DATE_TIME_FORMATTER.format(day).split(", ")[0]}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Selecciona un mes para calcular.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    ) : null;

    // --- Panel "Habilitar tableros" (supervisores + admin) -------------------
    // Reabre (Abrir) o cierra (Cerrar) la captura de un servicio/modulo para el
    // periodo elegido. "Automatico" = sin override: manda la ventana de dias habiles.
    // Vista ordenada: agrupada por division, con buscador y resumen de estado.
    const overrideQuery = overrideServiceQuery.trim().toLowerCase();
    const overrideGroups = buildServiceGroups()
      .map((group) => ({
        ...group,
        services: group.services.filter(
          (service) => !overrideQuery || service.name.toLowerCase().includes(overrideQuery),
        ),
      }))
      .filter((group) => group.services.length > 0);

    let overrideOpenCount = 0;
    let overrideClosedCount = 0;
    let overrideTotalCells = 0;
    for (const service of SERVICE_DEFINITIONS) {
      const svcModuleIds = getAreaById(service.id)?.modules ?? [];
      for (const moduleId of toggleableModules) {
        if (!svcModuleIds.includes(moduleId)) continue;
        overrideTotalCells += 1;
        const cellState =
          captureOverrides[getCaptureOverrideId(overridePanelPeriodId, service.id, moduleId)];
        if (cellState === "open") {
          overrideOpenCount += 1;
        } else if (cellState === "closed") {
          overrideClosedCount += 1;
        }
      }
    }
    const overrideAutoCount = overrideTotalCells - overrideOpenCount - overrideClosedCount;

    const overrideStateChip = (service: ServiceDefinition, moduleId: ModuleId) => {
      const overrideId = getCaptureOverrideId(overridePanelPeriodId, service.id, moduleId);
      const state = captureOverrides[overrideId];
      const isBusy = overrideBusyKey === overrideId;

      // Un solo chip que cicla directo (sin modal): Auto -> Abrir -> Cerrado -> Auto.
      // "Abrir" habilita el mes ya seleccionado arriba, en un solo toque.
      const handleCycle = () => {
        if (state === "open") {
          void handleToggleCapture(service.id, moduleId, "closed");
        } else if (state === "closed") {
          void handleToggleCapture(service.id, moduleId, null);
        } else {
          void handleToggleCapture(service.id, moduleId, "open");
        }
      };

      const label = state === "open" ? "Abierto" : state === "closed" ? "Cerrado" : "Auto";
      const tone =
        state === "open"
          ? "bg-emerald-500/10 text-emerald-300"
          : state === "closed"
            ? "bg-rose-500/10 text-rose-300"
            : "bg-white/5 text-slate-400";
      const dot =
        state === "open" ? "bg-emerald-400" : state === "closed" ? "bg-rose-400" : "bg-slate-500";

      return (
        <button
          type="button"
          onClick={handleCycle}
          disabled={isBusy}
          title="Clic para cambiar: Auto → Abrir → Cerrar"
          className={`inline-flex w-[88px] items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition hover:brightness-110 disabled:opacity-50 ${tone}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          {label}
        </button>
      );
    };

    const captureToggleSection = serviceProfile.permissions.canToggleCapture ? (
      <section
        id="panel-capture-toggle"
        className={`rounded-[24px] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)] ${
          isLightPanelTheme
            ? "border border-slate-200 bg-white text-slate-900"
            : "border border-white/10 bg-[#202c41]"
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className={`text-xs uppercase tracking-[0.2em] ${isLightPanelTheme ? "text-sky-700" : "text-cyan-200/80"}`}>
              Habilitar tableros
            </p>
            <h2 className="mt-1 text-xl font-semibold">Reabrir o cerrar captura por servicio</h2>
            <p className={`mt-1 max-w-3xl text-xs ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
              Tocá el estado de cada módulo para cambiarlo (Auto → Abrir → Cerrar).{" "}
              <strong>Automatico</strong> sigue la ventana normal de dias habiles;{" "}
              <strong>Abrir</strong> reabre la captura tardia y <strong>Cerrar</strong> la bloquea.
            </p>
          </div>
          <label className="block shrink-0">
            <span className={`text-sm font-medium ${isLightPanelTheme ? "text-slate-700" : "text-slate-200"}`}>
              Mes
            </span>
            <input
              value={overridePanelPeriodId}
              onChange={(event) => setOverridePanelPeriodId(event.target.value)}
              className={`mt-1.5 w-full rounded-2xl px-3 py-2 text-sm outline-none focus:border-cyan-400 ${
                isLightPanelTheme
                  ? "border border-slate-200 bg-white text-slate-900"
                  : "border border-white/10 bg-[#2a3448] text-white"
              }`}
              type="month"
            />
          </label>
        </div>

        {/* Resumen de estado + buscador */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Automatico", count: overrideAutoCount, dot: "bg-slate-400" },
              { label: "Abiertos", count: overrideOpenCount, dot: "bg-emerald-500" },
              { label: "Cerrados", count: overrideClosedCount, dot: "bg-rose-500" },
            ].map((chip) => (
              <span
                key={chip.label}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isLightPanelTheme ? "bg-slate-100 text-slate-700" : "bg-white/5 text-slate-200"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${chip.dot}`} />
                {chip.label}: {chip.count}
              </span>
            ))}
          </div>
          <input
            value={overrideServiceQuery}
            onChange={(event) => setOverrideServiceQuery(event.target.value)}
            placeholder="Buscar servicio..."
            className={`w-full rounded-xl px-3 py-2 text-sm outline-none focus:border-cyan-400 sm:w-64 ${
              isLightPanelTheme
                ? "border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
                : "border border-white/10 bg-[#2a3448] text-white placeholder:text-slate-500"
            }`}
            type="search"
          />
        </div>

        {/* Grupos por division */}
        <div className="mt-4 space-y-2.5">
          {overrideGroups.length === 0 ? (
            <p className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${isLightPanelTheme ? "border-slate-200 text-slate-500" : "border-white/10 text-slate-400"}`}>
              Ningun servicio coincide con la busqueda.
            </p>
          ) : (
            overrideGroups.map((group, groupIndex) => {
              const groupOpen = openOverrideGroups.has(group.id);
              const groupAccent =
                OVERRIDE_GROUP_ACCENTS[groupIndex % OVERRIDE_GROUP_ACCENTS.length];
              return (
              <div
                key={group.id}
                className={`overflow-hidden rounded-2xl border transition ${
                  isLightPanelTheme
                    ? "border-slate-200"
                    : groupOpen
                      ? "border-cyan-400/30 bg-[#1b2537]"
                      : "border-white/10 bg-[#1b2537]"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenOverrideGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.id)) {
                        next.delete(group.id);
                      } else {
                        next.add(group.id);
                      }
                      return next;
                    })
                  }
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${isLightPanelTheme ? "hover:bg-slate-50" : "hover:bg-white/5"}`}
                >
                  <span
                    aria-hidden
                    className="h-7 w-1 shrink-0 rounded-full transition"
                    style={{ backgroundColor: groupOpen ? groupAccent.open : groupAccent.closed }}
                  />
                  <h3 className="shrink-0 text-sm font-semibold uppercase tracking-wide">{group.title}</h3>
                  {group.id === "direccion" ? (
                    <div className="hidden min-w-0 flex-1 items-center px-4 lg:flex">
                      <svg viewBox="0 0 200 24" preserveAspectRatio="none" className="h-6 w-full" aria-hidden="true">
                        <path
                          className="ekg-track"
                          d="M0 12 H15 L18 9 L21 12 L24 3 L28 21 L31 12 H62 L65 9 L68 12 L71 3 L75 21 L78 12 H109 L112 9 L115 12 L118 3 L122 21 L125 12 H156 L159 9 L162 12 L165 3 L169 21 L172 12 H200"
                          fill="none"
                          strokeWidth="0.75"
                          vectorEffect="non-scaling-stroke"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          className="ekg-pulse-soft"
                          pathLength={100}
                          d="M0 12 H15 L18 9 L21 12 L24 3 L28 21 L31 12 H62 L65 9 L68 12 L71 3 L75 21 L78 12 H109 L112 9 L115 12 L118 3 L122 21 L125 12 H156 L159 9 L162 12 L165 3 L169 21 L172 12 H200"
                          fill="none"
                          stroke="#67e8f9"
                          strokeWidth="1.25"
                          vectorEffect="non-scaling-stroke"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  ) : (
                    <span className="hidden flex-1 lg:block" />
                  )}
                  <span className={`hidden text-xs sm:inline ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                    {group.services.length} servicio{group.services.length === 1 ? "" : "s"}
                  </span>
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${groupOpen ? "rotate-180" : ""}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <div className={groupOpen ? "p-2.5" : "hidden"}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {group.services.map((service) => {
                      const svcModuleIds = getAreaById(service.id)?.modules ?? [];
                      const svcModules = toggleableModules.filter((m) => svcModuleIds.includes(m));
                      return (
                      <div
                        key={service.id}
                        className={`group rounded-2xl border p-3 text-center transition ${
                          isLightPanelTheme
                            ? "border-slate-200 bg-white shadow-sm hover:border-cyan-300 hover:shadow-md"
                            : "border-white/10 bg-gradient-to-b from-[#212d45] to-[#1a2334] hover:border-cyan-400/30"
                        }`}
                      >
                        <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm ring-1 ring-white/15 transition group-hover:scale-105">
                          <ServiceIcon serviceId={service.id} className="h-[18px] w-[18px]" />
                        </span>
                        <p className="truncate text-[11px] font-semibold leading-tight" title={service.name}>
                          {service.name}
                        </p>
                        <div className={`my-2.5 h-px ${isLightPanelTheme ? "bg-slate-100" : "bg-white/10"}`} />
                        <div className="flex flex-col gap-1">
                          {svcModules.map((moduleId) => (
                            <div
                              key={moduleId}
                              className={`flex items-center justify-between gap-1.5 rounded-lg px-2 py-1 ${
                                isLightPanelTheme ? "bg-slate-50" : "bg-white/5"
                              }`}
                            >
                              <span
                                className={`text-[9px] font-semibold uppercase tracking-wide ${
                                  isLightPanelTheme ? "text-slate-500" : "text-slate-400"
                                }`}
                              >
                                {MODULE_BY_ID[moduleId].shortName}
                              </span>
                              {overrideStateChip(service, moduleId)}
                            </div>
                          ))}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      </section>
    ) : null;

    // --- Tabulador SEPS (captura diaria) -------------------------------------
    const sepsNumericValue = (rowKey: string, day: string) => {
      const parsed = Number.parseInt(sepsValues[rowKey]?.[day] ?? "", 10);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const sepsDayCell = (row: { key: string; readOnly?: boolean; sumOf?: string[] }, day: string) => {
      if (row.readOnly && row.sumOf) {
        return row.sumOf.reduce((acc, key) => acc + sepsNumericValue(key, day), 0);
      }
      return sepsNumericValue(row.key, day);
    };
    const sepsRowTotal = (row: { key: string; readOnly?: boolean; sumOf?: string[] }) =>
      sepsDayColumns.reduce((acc, day) => acc + sepsDayCell(row, day), 0);
    const sepsLocked = !sepsCaptureOpen || !serviceProfile.permissions.canEdit;
    // Historial SEPS: mes activo, modo lectura y bloqueo de edicion.
    const activeSepsPeriod = sepsViewPeriod ?? sepsPeriodId;
    const isSepsHistory = sepsViewPeriod !== null;
    const sepsHistReadOnly = isSepsHistory && !isAdmin;
    const sepsEditingBlocked = sepsTemplate?.consolidatesFrom
      ? true
      : isAdmin || isSepsStaff
        ? false
        : isSepsHistory
          ? true
          : sepsLocked;
    const sepsHistoryOptions = buildRecentPeriods(sepsPeriodId, 12);
    const sepsPhaseLabel =
      sepsWindow.phase === "cierre"
        ? `Cierre del mes ${sepsPeriodLabel} (hasta el 3er dia habil)`
        : sepsWindow.phase === "captura"
          ? `Captura diaria del mes ${sepsPeriodLabel}`
          : "Captura cerrada (se reabre el dia 6)";

    const sepsSection = sepsTemplate ? (
      <section
        id="panel-seps"
        className={`rounded-[24px] border border-cyan-400/20 p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)] ${isLightPanelTheme ? "bg-white text-slate-800" : "bg-[#202c41] text-slate-100"}`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200/80">
              Tabulador · SEPS
            </p>
            <h2 className={`mt-1 text-2xl font-bold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>SEPS</h2>
            <p className={`mt-1 text-sm ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
              {sepsTemplate.displayName ?? currentService?.name ?? sepsTemplate.serviceId} · {sepsPeriodLabel} ·{" "}
              {sepsTemplate.establishment}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                sepsLocked ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/15 text-emerald-200"
              }`}
            >
              {sepsLocked ? "BLOQUEADO" : "HABILITADO"}
            </span>
            {renderHistorySelector({
              options: sepsHistoryOptions,
              currentPeriod: sepsPeriodId,
              activePeriod: activeSepsPeriod,
              isHistory: isSepsHistory,
              readOnly: sepsHistReadOnly,
              dataPeriods: sepsDataPeriods,
              loading: isLoadingSeps,
              onSelect: (period) => void loadSepsHistory(period),
            })}
          </div>
        </div>

        <p className={`mt-3 rounded-xl border px-4 py-2 text-sm ${isLightPanelTheme ? "border-slate-200 bg-slate-50 text-slate-700" : "border-white/10 bg-[#1b2537] text-slate-200"}`}>
          {sepsPhaseLabel}. Los totales y la fila de suma se calculan solos.
        </p>

        {/* Comentarios de revision: los deja el revisor/admin; los VE el servicio.
            Para el SERVICIO con notas, la tarjeta se resalta y pulsa para que las note. */}
        {sepsComments.length > 0 || canCommentSeps ? (
          <div className={`mt-3 rounded-2xl border p-3 sm:p-4 ${serviceSepsCommentCount > 0 ? "seps-comment-glow " : ""}${isLightPanelTheme ? (serviceSepsCommentCount > 0 ? "border-amber-400 bg-amber-100/70" : "border-amber-200 bg-amber-50/60") : serviceSepsCommentCount > 0 ? "border-amber-400/60 bg-amber-400/[0.12]" : "border-amber-400/20 bg-amber-400/[0.06]"}`}>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLightPanelTheme ? "text-amber-600" : "text-amber-300"} aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              <span className={`text-sm font-bold ${isLightPanelTheme ? "text-amber-800" : "text-amber-200"}`}>
                Comentarios de revisión
              </span>
              {serviceSepsCommentCount > 0 ? (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
                  {serviceSepsCommentCount}
                </span>
              ) : null}
            </div>
            {serviceSepsCommentCount > 0 ? (
              <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${isLightPanelTheme ? "bg-amber-200/60 text-amber-900" : "bg-amber-400/15 text-amber-100"}`}>
                📌 El revisor dejó {serviceSepsCommentCount === 1 ? "una nota" : `${serviceSepsCommentCount} notas`} para tu servicio. Revisá y corregí lo indicado.
              </p>
            ) : null}
            {sepsComments.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {sepsComments.map((c) => (
                  <li key={c.id} className={`rounded-xl border px-3 py-2 text-sm ${isLightPanelTheme ? "border-amber-200/70 bg-white" : "border-white/10 bg-[#1b2537]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={`min-w-0 flex-1 whitespace-pre-wrap ${isLightPanelTheme ? "text-slate-700" : "text-slate-200"}`}>{c.text}</p>
                      {canCommentSeps ? (
                        <button
                          type="button"
                          onClick={() => void handleDeleteSepsComment(c.id)}
                          title="Borrar comentario"
                          aria-label="Borrar comentario"
                          className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                      ) : null}
                    </div>
                    <p className={`mt-1 text-[11px] font-medium ${isLightPanelTheme ? "text-amber-700" : "text-amber-300/80"}`}>
                      {c.author} · {SHORT_DATE_FORMATTER.format(new Date(c.at))}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`mt-2 text-xs ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                Sin comentarios todavía. Dejá una nota para el servicio.
              </p>
            )}
            {canCommentSeps ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={sepsCommentDraft}
                  onChange={(event) => setSepsCommentDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAddSepsComment();
                    }
                  }}
                  placeholder="Escribí una corrección o nota para el servicio…"
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:border-amber-400 ${isLightPanelTheme ? "border-amber-200 bg-white text-slate-900" : "border-white/10 bg-[#16212c] text-white"}`}
                />
                <button
                  type="button"
                  onClick={() => void handleAddSepsComment()}
                  disabled={!sepsCommentDraft.trim()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 space-y-6">
          {sepsTemplate.kind === "matrix"
            ? (sepsTemplate.sections ?? []).map((section) => {
                const sectionOpen = openSepsTables.has(section.title);
                return (
                  <div key={section.title} className={`overflow-hidden rounded-2xl border ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSepsTables((prev) => {
                          const next = new Set(prev);
                          if (next.has(section.title)) {
                            next.delete(section.title);
                          } else {
                            next.add(section.title);
                          }
                          return next;
                        })
                      }
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${isLightPanelTheme ? "bg-slate-100 hover:bg-slate-200" : "bg-white/5 hover:bg-white/10"}`}
                    >
                      <span className={`text-sm font-semibold uppercase tracking-wide ${isLightPanelTheme ? "text-slate-800" : "text-slate-100"}`}>
                        {section.title}{" "}
                        <span className={`text-xs font-normal ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                          ({section.exams.length})
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={`flex h-6 w-6 items-center justify-center rounded-md border text-base font-bold leading-none text-cyan-200 ${isLightPanelTheme ? "border-slate-200 bg-slate-100" : "border-white/15 bg-white/5"}`}
                      >
                        {sectionOpen ? "−" : "+"}
                      </span>
                    </button>
                    <div className={`show-scrollbar overflow-x-auto ${sectionOpen ? "" : "hidden"}`}>
                      <table className={`border-collapse text-xs ${isLightPanelTheme ? "text-slate-800" : "text-slate-100"}`}>
                        <thead>
                          <tr className={`${isLightPanelTheme ? "bg-slate-100 text-slate-600" : "bg-white/5 text-slate-300"}`}>
                            <th className={`sticky left-0 z-10 min-w-[260px] px-3 py-2 text-left font-medium ${isLightPanelTheme ? "bg-slate-100" : "bg-[#243049]"}`}>
                              Examen
                            </th>
                            {SEPS_LAB_RESULT_COLS.map((col) => (
                              <th key={col.key} className="px-2 py-2 text-center font-medium">
                                {col.label}
                              </th>
                            ))}
                            <th className={`px-2 py-2 text-center font-semibold text-cyan-100 ${isLightPanelTheme ? "bg-slate-100" : "bg-[#243049]"}`}>
                              Total
                            </th>
                            {SEPS_LAB_PROC_COLS.map((col) => (
                              <th key={col.key} className="px-2 py-2 text-center font-medium">
                                {col.label}
                              </th>
                            ))}
                            <th className={`px-2 py-2 text-center font-semibold text-cyan-100 ${isLightPanelTheme ? "bg-slate-100" : "bg-[#243049]"}`}>
                              TOTAL
                            </th>
                            <th className={`px-3 py-2 text-center font-semibold text-cyan-100 ${isLightPanelTheme ? "bg-slate-100" : "bg-[#243049]"}`}>
                              Cuadre
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.exams.map((exam) => {
                            const vals = sepsValues[exam.key] || {};
                            const num = (k: string) => {
                              const n = Number.parseInt(vals[k] ?? "", 10);
                              return Number.isFinite(n) ? n : 0;
                            };
                            const resultTotal = SEPS_LAB_RESULT_COLS.reduce((a, c) => a + num(c.key), 0);
                            const procTotal = SEPS_LAB_PROC_COLS.reduce((a, c) => a + num(c.key), 0);
                            // En el Excel, el total de RESULTADOS y el de PROCEDENCIA estan
                            // construidos para dar el mismo numero. Si no cuadran, se avisa.
                            const hasData = resultTotal > 0 || procTotal > 0;
                            const mismatch = hasData && resultTotal !== procTotal;
                            const totalCellClass = mismatch
                              ? `px-2 py-1.5 text-center font-semibold text-rose-300 ${isLightPanelTheme ? "bg-rose-50" : "bg-[#241016]"}`
                              : `px-2 py-1.5 text-center font-semibold text-cyan-100 ${isLightPanelTheme ? "bg-slate-100" : "bg-[#243049]"}`;
                            return (
                              <tr key={exam.key} className={`border-t ${isLightPanelTheme ? "border-slate-200" : "border-white/5"}`}>
                                <th
                                  className={`sticky left-0 z-10 max-w-[260px] truncate border-r px-3 py-1.5 text-left text-[11px] font-medium ${isLightPanelTheme ? "border-slate-200 bg-slate-50 text-slate-800" : "border-white/10 bg-[#3a465d] text-slate-100"}`}
                                  title={`${exam.code} — ${exam.name}`}
                                >
                                  <span className="text-cyan-200">{exam.code}</span> {exam.name}
                                </th>
                                {SEPS_LAB_RESULT_COLS.map((col) => (
                                  <td key={col.key} className="px-1 py-1 text-center">
                                    <input
                                      value={vals[col.key] ?? ""}
                                      onChange={(event) =>
                                        handleSepsCellChange(exam.key, col.key, event.target.value)
                                      }
                                      disabled={sepsEditingBlocked}
                                      inputMode="numeric"
                                      className={`w-12 rounded border px-1 py-1 text-center outline-none focus:border-cyan-400 disabled:opacity-50 ${isLightPanelTheme ? "border-slate-300 bg-white text-slate-900" : "border-white/10 bg-[#1b2537] text-white"}`}
                                    />
                                  </td>
                                ))}
                                <td className={totalCellClass}>{resultTotal}</td>
                                {SEPS_LAB_PROC_COLS.map((col) => (
                                  <td key={col.key} className="px-1 py-1 text-center">
                                    <input
                                      value={vals[col.key] ?? ""}
                                      onChange={(event) =>
                                        handleSepsCellChange(exam.key, col.key, event.target.value)
                                      }
                                      disabled={sepsEditingBlocked}
                                      inputMode="numeric"
                                      className={`w-12 rounded border px-1 py-1 text-center outline-none focus:border-cyan-400 disabled:opacity-50 ${isLightPanelTheme ? "border-slate-300 bg-white text-slate-900" : "border-white/10 bg-[#1b2537] text-white"}`}
                                    />
                                  </td>
                                ))}
                                <td className={totalCellClass}>{procTotal}</td>
                                <td className="px-3 py-1.5 text-center">
                                  {mismatch ? (
                                    <span className="whitespace-nowrap rounded-md bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-300">
                                      ⚠ Debe sumar lo mismo
                                    </span>
                                  ) : hasData ? (
                                    <span className="text-emerald-300">✓</span>
                                  ) : (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            : (sepsTemplate.tables ?? []).map((table) => {
            // Grupos ANIDADOS (N niveles), igual que el Excel. Cada fila se normaliza
            // a un arreglo de grupos (externo -> interno); cada nivel se dibuja en su
            // propia columna con celdas combinadas (rowspan).
            // Filas EFECTIVAS: plantilla + filas agregadas a mano - filas ocultas.
            const effRows = buildSepsEffectiveRows(table, sepsExtraRows, sepsHiddenKeys);
            const canManageTabRows = isAdmin || isSupervisor;
            const rowGroups = effRows.map((row) =>
              row.groups && row.groups.length > 0
                ? row.groups
                : row.group
                  ? [row.group]
                  : [],
            );
            const maxDepth = rowGroups.reduce((m, g) => Math.max(m, g.length), 0);
            const hasGroups = maxDepth > 0;
            // groupSpans[L][i] = filas que abarca la celda del nivel L que INICIA en i
            // (0 = no inicia: la cubre un rowspan de arriba, o la fila no llega a ese nivel).
            const groupSpans: number[][] = [];
            for (let L = 0; L < maxDepth; L += 1) {
              const spans = new Array<number>(effRows.length).fill(0);
              let i = 0;
              while (i < effRows.length) {
                if (rowGroups[i].length <= L) {
                  i += 1;
                  continue;
                }
                const prefix = rowGroups[i].slice(0, L + 1).join("");
                let j = i + 1;
                while (
                  j < effRows.length &&
                  rowGroups[j].length > L &&
                  rowGroups[j].slice(0, L + 1).join("") === prefix
                ) {
                  j += 1;
                }
                spans[i] = j - i;
                i = j;
              }
              groupSpans.push(spans);
            }

            const tableOpen = openSepsTables.has(table.id);

            return (
              <div key={table.id} className={`overflow-hidden rounded-2xl border ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSepsTables((prev) => {
                      const next = new Set(prev);
                      if (next.has(table.id)) {
                        next.delete(table.id);
                      } else {
                        next.add(table.id);
                      }
                      return next;
                    })
                  }
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${isLightPanelTheme ? "bg-slate-100 hover:bg-slate-200" : "bg-white/5 hover:bg-white/10"}`}
                >
                  <span>
                    <span className={`block text-sm font-semibold uppercase tracking-wide ${isLightPanelTheme ? "text-slate-800" : "text-slate-100"}`}>
                      {table.title}
                    </span>
                    {table.subtitle ? (
                      <span className={`mt-1 block text-xs ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>{table.subtitle}</span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-lg font-bold leading-none text-cyan-200 ${isLightPanelTheme ? "border-slate-200 bg-slate-100" : "border-white/15 bg-white/5"}`}
                  >
                    {tableOpen ? "−" : "+"}
                  </span>
                </button>
                <div className={`show-scrollbar overflow-x-auto ${tableOpen ? "" : "hidden"}`}>
                  <table className={`border-collapse text-xs ${isLightPanelTheme ? "text-slate-800" : "text-slate-100"}`}>
                    <thead>
                      <tr className={`${isLightPanelTheme ? "bg-slate-100 text-slate-600" : "bg-white/5 text-slate-300"}`}>
                        {Array.from({ length: maxDepth }).map((_, L) => (
                          <th
                            key={`ghead-${L}`}
                            className={`${L === 0 ? `sticky left-0 z-10 ${isLightPanelTheme ? "bg-slate-100" : "bg-[#243049]"}` : ""} px-3 py-2 text-left font-medium`}
                          >
                            {L === 0 ? "Grupo" : ""}
                          </th>
                        ))}
                        <th
                          className={`${hasGroups ? "" : `sticky left-0 z-10 ${isLightPanelTheme ? "bg-slate-100" : "bg-[#243049]"}`} px-3 py-2 text-left font-medium`}
                        >
                          {table.detailLabel || "Detalle"}
                        </th>
                        {sepsDayColumns.map((day) => (
                          <th key={day} className="w-10 px-1 py-2 text-center font-medium">
                            {day}
                          </th>
                        ))}
                        <th className={`px-3 py-2 text-center font-semibold ${isLightPanelTheme ? "bg-slate-100" : "bg-[#243049]"}`}>Total</th>
                        {canManageTabRows ? <th className="px-1 py-2" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {effRows.map((row, index) => (
                        <tr key={row.key} className={`border-t ${isLightPanelTheme ? "border-slate-200" : "border-white/5"} ${row.isExtra ? (isLightPanelTheme ? "bg-emerald-50/50" : "bg-emerald-500/5") : ""}`}>
                          {Array.from({ length: maxDepth }).map((_, L) =>
                            groupSpans[L][index] > 0 ? (
                              <td
                                key={`gcell-${L}`}
                                rowSpan={groupSpans[L][index]}
                                className={`${L === 0 ? "sticky left-0 z-10" : ""} whitespace-nowrap px-3 py-1.5 align-middle font-medium ${isLightPanelTheme ? "bg-slate-50" : "bg-[#1b2537]"}`}
                              >
                                {rowGroups[index][L]}
                              </td>
                            ) : null,
                          )}
                          <td
                            colSpan={hasGroups ? maxDepth - rowGroups[index].length + 1 : 1}
                            className={`${hasGroups ? "" : `sticky left-0 z-10 ${isLightPanelTheme ? "bg-slate-50" : "bg-[#1b2537]"}`} whitespace-nowrap px-3 py-1.5 ${
                              row.readOnly ? "font-semibold text-cyan-200" : ""
                            }`}
                            style={row.indent ? { paddingLeft: `${12 + row.indent * 14}px` } : undefined}
                          >
                            {row.isExtra && canManageTabRows ? (
                              <input
                                value={row.label}
                                onChange={(event) => handleRenameSepsRow(row.key, event.target.value)}
                                placeholder="Nombre de la fila"
                                className={`w-full min-w-[8rem] rounded border px-2 py-1 text-xs outline-none focus:border-emerald-400 ${isLightPanelTheme ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-[#16212c] text-white"}`}
                              />
                            ) : (
                              row.label
                            )}
                          </td>
                          {sepsDayColumns.map((day) => (
                            <td key={day} className="px-0.5 py-1 text-center">
                              {row.readOnly ? (
                                <span className="block w-9 text-center text-cyan-200">
                                  {sepsDayCell(row, day) || ""}
                                </span>
                              ) : (
                                <input
                                  id={`seps-${table.id}-${row.key}-${day}`}
                                  value={sepsValues[row.key]?.[day] ?? ""}
                                  onChange={(event) =>
                                    handleSepsCellChange(row.key, day, event.target.value)
                                  }
                                  onKeyDown={(event) =>
                                    handleSepsKeyNav(event, table.id, row.key, day)
                                  }
                                  disabled={sepsEditingBlocked}
                                  inputMode="numeric"
                                  className={`w-9 rounded border px-1 py-1 text-center text-xs outline-none focus:border-cyan-400 disabled:opacity-50 ${isLightPanelTheme ? "border-slate-300 bg-white text-slate-900" : "border-white/10 bg-[#1b2537] text-white"}`}
                                />
                              )}
                            </td>
                          ))}
                          <td className={`px-3 py-1.5 text-center font-semibold text-cyan-100 ${isLightPanelTheme ? "bg-slate-100" : "bg-[#243049]"}`}>
                            {row.hideTotal ? "" : sepsRowTotal(row)}
                          </td>
                          {canManageTabRows ? (
                            <td className="whitespace-nowrap px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleAddSepsRow(table.id, row.key)}
                                title="Agregar una fila debajo"
                                aria-label="Agregar una fila debajo"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-emerald-500/10 hover:text-emerald-300"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveSepsRow(row.key, !!row.isExtra, row.label)}
                                title={row.isExtra ? "Quitar esta fila" : "Ocultar esta fila oficial"}
                                aria-label={row.isExtra ? "Quitar esta fila" : "Ocultar esta fila oficial"}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                    {table.showColumnTotals ? (
                      <tfoot>
                        <tr className={`border-t-2 font-semibold ${isLightPanelTheme ? "border-slate-300 bg-slate-100 text-slate-800" : "border-white/20 bg-[#243049] text-white"}`}>
                          <td
                            colSpan={maxDepth + 1}
                            className={`sticky left-0 z-10 px-3 py-2 text-left uppercase tracking-wide ${isLightPanelTheme ? "bg-slate-100" : "bg-[#243049]"}`}
                          >
                            Total
                          </td>
                          {sepsDayColumns.map((day) => (
                            <td key={day} className="px-1 py-2 text-center text-cyan-200">
                              {table.rows.reduce((acc, r) => acc + sepsDayCell(r, day), 0)}
                            </td>
                          ))}
                          <td className={`px-3 py-2 text-center font-extrabold ${isLightPanelTheme ? "bg-slate-200 text-cyan-700" : "bg-[#1a2334] text-cyan-200"}`}>
                            {table.rows.reduce((acc, r) => acc + sepsRowTotal(r), 0)}
                          </td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </div>
            );
          })}
        </div>

        {(isAdmin || isSupervisor) && sepsHiddenKeys.length > 0 ? (
          <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] ${isLightPanelTheme ? "border-amber-200 bg-amber-50/70 text-amber-800" : "border-amber-400/20 bg-amber-400/5 text-amber-200"}`}>
            <span>Hay {sepsHiddenKeys.length} fila(s) oficial(es) oculta(s). Sus datos siguen guardados.</span>
            <button
              type="button"
              onClick={handleRestoreSepsRows}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${isLightPanelTheme ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-amber-400/15 text-amber-100 hover:bg-amber-400/25"}`}
            >
              Restaurar filas ocultas
            </button>
          </div>
        ) : null}

        {/* Acciones del tabulador SEPS. En historial cambia segun el rol. */}
        <div className={`mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
          <div>
            {isSepsHistory ? (
              <button
                type="button"
                onClick={() => void loadSepsHistory(sepsPeriodId)}
                disabled={isLoadingSeps}
                className="rounded-2xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                ← Volver al mes actual
              </button>
            ) : null}
          </div>

          {sepsHistReadOnly ? (
            <p className="text-sm font-medium text-amber-200">Vista de historial — solo lectura.</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={handleClearSeps}
                title="Limpiar tabla"
                aria-label="Limpiar tabla"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-500"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                </svg>
                Limpiar tabla
              </button>
              {sepsTemplate?.tables ? (
                <>
                  <button
                    type="button"
                    onClick={() => void downloadSepsTemplate(sepsTemplate, sepsDayColumns, sepsPeriodId)}
                    title="Descargar plantilla Excel"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v12" />
                      <path d="m7 10 5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                    Descargar plantilla Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => sepsFileInputRef.current?.click()}
                    disabled={sepsEditingBlocked || isImportingSeps}
                    title="Subir plantilla Excel"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 21V9" />
                      <path d="m7 12 5-5 5 5" />
                      <path d="M5 3h14" />
                    </svg>
                    {isImportingSeps ? "Procesando…" : "Subir plantilla Excel"}
                  </button>
                  <input
                    ref={sepsFileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(event) => void handleUploadSepsFile(event)}
                    className="hidden"
                  />
                </>
              ) : null}
              {!isSepsHistory ? (
                <button
                  type="button"
                  onClick={() => void loadSavedSeps()}
                  disabled={isLoadingSeps}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-900/70"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
                  </svg>
                  {isLoadingSeps ? "Recuperando..." : "Recuperar datos"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSaveSeps()}
                disabled={isSavingSeps || sepsEditingBlocked}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800/80"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <path d="M17 21v-8H7v8M7 3v5h8" />
                </svg>
                {isSavingSeps ? "Guardando..." : isSepsHistory ? "Guardar cambios del mes" : "Guardar SEPS"}
              </button>
            </div>
          )}
        </div>
      </section>
    ) : null;
    // --- Menus por area (PERC / SESPS / Distribucion de Horas) ---------------
    // Cada area ve solo los menus que tiene asignados. El admin ve los 3.
    const moduleBadges: Record<ModuleId, string> = {
      perc: "PE",
      sesps: "SE",
      distribucion: "DH",
    };
    const currentArea = getAreaById(effectiveServiceId);
    const visibleModules: ModuleDefinition[] = isAdmin
      ? MODULE_DEFINITIONS
      : isSupervisor
        ? currentArea
          ? getAreaModules(currentArea).filter((mod) =>
              serviceProfile.supervisorModules.includes(mod.id),
            )
          : []
        : currentArea
          ? getAreaModules(currentArea)
          : [];
    // Si la seccion de un modulo debe mostrarse para este usuario/servicio.
    const showModule = (moduleId: ModuleId) => visibleModules.some((vm) => vm.id === moduleId);
    const getModuleUiStatus = (mod: ModuleDefinition): "completo" | "incompleto" => {
      // El grid de centros de costo (tableValues) es el tabulador PERC.
      if (mod.id === "perc") {
        return hasAnyCapturedValue(tableValues) ? "completo" : "incompleto";
      }

      if (mod.id === "sesps" && sepsTemplate) {
        return hasAnySepsValue(sepsValues) ? "completo" : "incompleto";
      }

      if (mod.id === "distribucion" && horasTemplate) {
        // Solo "completo" cuando se GUARDO (no por los empleados precargados).
        return horasSaved ? "completo" : "incompleto";
      }

      // Sin plantilla aun -> incompleto por defecto.
      return "incompleto";
    };
    // Cada modulo lleva a SU tabulador. NOTA: el grid de centros de costo (id
    // "distribucion") es, para el hospital, el tabulador PERC -> el menu "PERC" lleva
    // a panel-tabulator. El menu "Distribucion de Horas" lleva a su seccion (pendiente).
    const moduleSectionTarget = (modId: ModuleId): string => {
      if (modId === "perc") return currentService ? "panel-tabulator" : `panel-module-${modId}`;
      if (modId === "sesps") return sepsTemplate ? "panel-seps" : `panel-module-${modId}`;
      if (modId === "distribucion") return currentService ? "panel-horas" : `panel-module-${modId}`;
      return `panel-module-${modId}`;
    };
    const moduleSidebarItems = visibleModules.map((mod) => ({
      id: moduleSectionTarget(mod.id),
      // Nombre corto en el menu (los largos se cortaban): Distribucion de Horas -> Dis/horas.
      label: mod.id === "distribucion" ? "Dis/horas" : mod.name,
      detail: "Ir al tabulador",
      badge: moduleBadges[mod.id],
      // Submenu por modulo (solo admin/supervisores lo despliegan en SEPS y Horas):
      // PERC -> Abrir/Monitoreo/Censo/Insumos/Consolidados/PERC Servicios.
      // SEPS -> Abrir SEPS/Monitoreo/SEPS Servicios. Horas -> igual con Horas.
      // "X Servicios" lleva a la ventana "ver tabuladores por servicio" (panel-services).
      children: (() => {
        const canManage = isAdmin || isSupervisor;
        const serviciosChild = (label: string) => ({
          id: "panel-services",
          label,
          detail: "Ver tabuladores por servicio",
          badge: "SV",
          icon: "servicios",
        });
        const monitorChild = (id: string) => ({
          id,
          label: "Monitoreo",
          detail: "Servicios que completaron",
          badge: "MO",
          icon: "monitor",
        });
        if (mod.id === "perc") {
          if (!(canViewCenso || canViewInsumos || canManage)) return undefined;
          return [
            ...(currentService
              ? [{ id: "panel-tabulator", label: "Abrir PERC", detail: "Ir al tabulador PERC", badge: "PE", icon: "perc" }]
              : []),
            ...(canManage ? [monitorChild("panel-monitor-perc")] : []),
            ...(canViewCenso
              ? [{ id: "panel-censo", label: "Censo diario de pacientes", detail: "Solo supervisión", badge: "CD", icon: "censo" }]
              : []),
            ...(canViewInsumos
              ? [{ id: "panel-insumos", label: "Insumos de Almacén", detail: "Costos de insumos", badge: "IA", icon: "insumos" }]
              : []),
            ...(isAdmin
              ? [{ id: "panel-admin-export", label: "Consolidados PERC", detail: "Descarga consolidado", badge: "XL", icon: "consolidado" }]
              : []),
            ...(canManage ? [serviciosChild("PERC Servicios")] : []),
          ];
        }
        if (mod.id === "sesps") {
          if (!canManage) return undefined;
          return [
            ...(sepsTemplate
              ? [{ id: "panel-seps", label: "Abrir SEPS", detail: "Ir al tabulador SEPS", badge: "SE", icon: "seps" }]
              : []),
            monitorChild("panel-monitor-seps"),
            serviciosChild("SEPS Servicios"),
          ];
        }
        if (mod.id === "distribucion") {
          if (!canManage) return undefined;
          return [
            ...(currentService
              ? [{ id: "panel-horas", label: "Abrir Dis/horas", detail: "Ir al tabulador de Horas", badge: "HO", icon: "horas" }]
              : []),
            monitorChild("panel-monitor-horas"),
            serviciosChild("Horas Servicios"),
          ];
        }
        return undefined;
      })(),
    }));

    // Seccion "Distribucion de Horas": aun sin plantilla propia. Da un destino con
    // titulo al hacer clic en el menu Distribucion de Horas. Va al final.
    const horasLocked = !currentServiceCaptureOpen || !serviceProfile.permissions.canEdit;
    // Historial Horas: mes activo, modo lectura y bloqueo de edicion.
    const activeHorasPeriod = horasViewPeriod ?? periodId;
    const isHorasHistory = horasViewPeriod !== null;
    const horasHistReadOnly = isHorasHistory && !isAdmin;
    const horasEditingBlocked = isAdmin ? false : isHorasHistory ? true : horasLocked;
    const horasHistoryOptions = buildRecentPeriods(periodId, 12);
    const horasNum = (emp: HorasEmployee, col: string) => {
      const n = Number.parseInt(emp.hours[col] ?? "", 10);
      return Number.isFinite(n) ? n : 0;
    };
    const horasRowTotal = (emp: HorasEmployee) =>
      horasTemplate ? horasTemplate.columns.reduce((acc, col) => acc + horasNum(emp, col), 0) : 0;

    const horasSection = horasTemplate ? (
      <>
      <section
        id="panel-horas"
        className={`rounded-[24px] border border-cyan-400/20 p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)] ${isLightPanelTheme ? "bg-white" : "bg-[#202c41]"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-xl font-bold sm:text-2xl ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>Distribución de Horas</h2>
            <p className={`mt-1 truncate text-sm ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
              {horasTemplate?.displayName ?? currentService?.name} · Cierre de {periodLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                horasLocked ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/15 text-emerald-200"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${horasLocked ? "bg-rose-400" : "bg-emerald-400"}`}
              />
              {horasLocked ? "Bloqueado" : "Habilitado"}
            </span>
            <button
              type="button"
              onClick={() => setHorasCollapsed((v) => !v)}
              aria-expanded={!horasCollapsed}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                isLightPanelTheme
                  ? "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {horasCollapsed ? "Mostrar" : "Ocultar"}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform ${horasCollapsed ? "" : "rotate-180"}`} aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>

        {!horasCollapsed ? (
        <>
        {horasTemplate?.serviceId === "enfermeria" ? (
          <div
            className={`mt-4 flex flex-wrap items-center gap-2 rounded-2xl border p-3 ${
              isLightPanelTheme ? "border-cyan-200 bg-cyan-50/70" : "border-cyan-400/20 bg-cyan-400/5"
            }`}
          >
            <span className={`text-xs font-semibold ${isLightPanelTheme ? "text-slate-700" : "text-slate-200"}`}>
              Carga masiva por Excel
            </span>
            <button
              type="button"
              onClick={() => void handleDownloadHorasTemplate()}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                isLightPanelTheme
                  ? "bg-cyan-100 text-cyan-700 hover:bg-cyan-200"
                  : "bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25"
              }`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="m7 12 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Descargar plantilla
            </button>
            <button
              type="button"
              onClick={() => horasFileInputRef.current?.click()}
              disabled={horasEditingBlocked || isImportingHoras}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                isLightPanelTheme
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              }`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21V9" />
                <path d="m7 12 5-5 5 5" />
                <path d="M5 3h14" />
              </svg>
              {isImportingHoras ? "Procesando…" : "Subir Excel lleno"}
            </button>
            <input
              ref={horasFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => void handleUploadHorasFile(event)}
              className="hidden"
            />
            <span className={`w-full text-[11px] ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
              Descargue la plantilla (trae los nombres), llene las horas por columna y vuelva a subirla. Al subir se reemplaza la tabla; luego presione Guardar.
            </span>
          </div>
        ) : null}
        {renderHistorySelector({
          options: horasHistoryOptions,
          currentPeriod: periodId,
          activePeriod: activeHorasPeriod,
          isHistory: isHorasHistory,
          readOnly: horasHistReadOnly,
          dataPeriods: horasDataPeriods,
          loading: isLoadingHoras,
          onSelect: (period) => void loadHorasHistory(period),
        })}

        <div className={`show-scrollbar mt-4 overflow-x-auto rounded-2xl border ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
          <table className={`w-full border-collapse text-xs ${isLightPanelTheme ? "text-slate-800" : "text-slate-100"}`}>
            <thead>
              <tr className={`${isLightPanelTheme ? "bg-slate-100 text-slate-600" : "bg-white/5 text-slate-300"}`}>
                <th className={`sticky left-0 z-20 min-w-[12rem] border-r px-2 py-2 text-left font-medium ${isLightPanelTheme ? "border-slate-200 bg-slate-100" : "border-white/10 bg-[#1a2334]"}`}>
                  Nombre del empleado
                </th>
                <th className="px-2 py-2 text-left font-medium">DUI</th>
                <th className="hidden px-2 py-2 text-left font-medium xl:table-cell">Comentario</th>
                {horasTemplate.columns.map((col) => (
                  <th key={col} className="px-2 py-2 text-center font-medium">
                    {col}
                  </th>
                ))}
                <th className={`px-2 py-2 text-center font-medium ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>Total</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {horasEmployees.slice(0, horasVisibleCount).map((emp, index) => (
                <tr key={index} className={`border-t ${isLightPanelTheme ? "border-slate-200" : "border-white/5"}`}>
                  <td className={`sticky left-0 z-10 min-w-[12rem] border-r px-2 py-1 ${isLightPanelTheme ? "border-slate-200 bg-white" : "border-white/10 bg-[#202c41]"}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="hidden w-5 shrink-0 text-right text-[10px] text-slate-500 xl:block">
                        {index + 1}
                      </span>
                      <input
                        value={emp.name}
                        onChange={(event) => handleHorasName(index, event.target.value)}
                        disabled={horasEditingBlocked}
                        placeholder="Nombre"
                        className={`w-full min-w-[9rem] rounded border px-2 py-1 text-xs outline-none focus:border-cyan-400 disabled:opacity-50 ${isLightPanelTheme ? "border-slate-300 bg-white text-slate-900" : "border-white/10 bg-[#1b2537] text-white"}`}
                      />
                    </div>
                  </td>
                  <td className="px-1.5 py-1">
                    <input
                      value={emp.dui}
                      onChange={(event) => handleHorasDui(index, event.target.value)}
                      disabled={horasEditingBlocked}
                      placeholder="DUI"
                      className={`w-[6.75rem] rounded border px-2 py-1 text-xs outline-none focus:border-cyan-400 disabled:opacity-50 xl:w-28 ${isLightPanelTheme ? "border-slate-300 bg-white text-slate-900" : "border-white/10 bg-[#1b2537] text-white"}`}
                    />
                  </td>
                  <td className="hidden px-1.5 py-1 xl:table-cell">
                    <input
                      value={emp.comment}
                      onChange={(event) => handleHorasComment(index, event.target.value)}
                      disabled={horasEditingBlocked}
                      placeholder="(opcional)"
                      className={`w-32 rounded border border-amber-400/20 px-2 py-1 text-amber-100 outline-none focus:border-amber-400 disabled:opacity-50 ${isLightPanelTheme ? "bg-white" : "bg-[#1b2537]"}`}
                    />
                  </td>
                  {horasTemplate.columns.map((col) => {
                    const inFillRange =
                      fillDrag !== null &&
                      fillDrag.col === col &&
                      index >= fillDrag.startRow &&
                      index <= fillDrag.endRow;
                    return (
                      <td key={col} className="group relative px-1.5 py-1 text-center">
                        <input
                          value={emp.hours[col] ?? ""}
                          onChange={(event) => handleHorasHour(index, col, event.target.value)}
                          onMouseEnter={() => {
                            if (fillDrag && fillDrag.col === col && index >= fillDrag.startRow) {
                              setFillDrag({ ...fillDrag, endRow: index });
                            }
                          }}
                          disabled={horasEditingBlocked}
                          inputMode="numeric"
                          className={`w-16 rounded border px-1 py-1.5 text-center outline-none focus:border-cyan-400 disabled:opacity-50 ${isLightPanelTheme ? "bg-white text-slate-900" : "bg-[#1b2537] text-white"} ${
                            inFillRange ? "border-cyan-400 ring-1 ring-cyan-400 bg-cyan-500/10" : isLightPanelTheme ? "border-slate-300" : "border-white/10"
                          }`}
                        />
                        {!horasEditingBlocked ? (
                          <span
                            onMouseDown={(event) => {
                              event.preventDefault();
                              setFillDrag({
                                col,
                                startRow: index,
                                endRow: index,
                                value: emp.hours[col] ?? "",
                              });
                            }}
                            title="Arrastra hacia abajo para copiar este valor"
                            className="absolute bottom-1 right-2 h-2.5 w-2.5 cursor-ns-resize rounded-sm border border-[#1b2537] bg-cyan-400 opacity-0 transition group-hover:opacity-100"
                          />
                        ) : null}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center font-medium text-cyan-300">
                    {horasRowTotal(emp)}
                  </td>
                  <td className="px-1.5 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveHorasEmployee(index)}
                      disabled={horasEditingBlocked}
                      title="Quitar empleado"
                      aria-label="Quitar empleado"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {horasEmployees.length > HORAS_PAGE_SIZE ? (
          <div className={`mt-3 flex flex-wrap items-center justify-center gap-2 text-xs ${isLightPanelTheme ? "text-slate-600" : "text-slate-400"}`}>
            <span>
              Mostrando {Math.min(horasVisibleCount, horasEmployees.length)} de {horasEmployees.length} empleados
            </span>
            {horasVisibleCount < horasEmployees.length ? (
              <>
                <button
                  type="button"
                  onClick={() => setHorasVisibleCount((c) => c + HORAS_PAGE_SIZE)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold transition ${
                    isLightPanelTheme
                      ? "bg-cyan-100 text-cyan-700 hover:bg-cyan-200"
                      : "bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25"
                  }`}
                >
                  Mostrar {Math.min(HORAS_PAGE_SIZE, horasEmployees.length - horasVisibleCount)} más
                </button>
                <button
                  type="button"
                  onClick={() => setHorasVisibleCount(horasEmployees.length)}
                  className={`rounded-full px-3 py-1.5 font-semibold transition ${
                    isLightPanelTheme ? "text-slate-500 hover:bg-slate-100" : "text-slate-400 hover:bg-white/5"
                  }`}
                  title="Puede tardar unos segundos con listas muy grandes"
                >
                  Mostrar todos
                </button>
              </>
            ) : null}
            {horasVisibleCount > HORAS_PAGE_SIZE ? (
              <button
                type="button"
                onClick={() => setHorasVisibleCount(HORAS_PAGE_SIZE)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold transition ${
                  isLightPanelTheme
                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m18 15-6-6-6 6" />
                </svg>
                Mostrar menos
              </button>
            ) : null}
          </div>
        ) : null}

        <div className={`mt-4 flex flex-row flex-wrap items-center justify-between gap-2 border-t pt-4 ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {!horasHistReadOnly ? (
              <button
                type="button"
                onClick={handleAddHorasEmployee}
                disabled={horasEditingBlocked}
                title="Agregar empleado"
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span className="hidden sm:inline">Agregar empleado</span>
                <span className="sm:hidden">Empleado</span>
              </button>
            ) : null}
            {isHorasHistory ? (
              <button
                type="button"
                onClick={() => void loadHorasHistory(periodId)}
                disabled={isLoadingHoras}
                className="rounded-2xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                ← Volver al mes actual
              </button>
            ) : null}
          </div>

          {/* Acciones del tabulador Horas. En historial cambia segun el rol. */}
          {horasHistReadOnly ? (
            <p className="text-sm font-medium text-amber-200">Vista de historial — solo lectura.</p>
          ) : (
            <div className="flex flex-row flex-wrap items-center justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleClearHoras}
                title="Limpiar tabla"
                aria-label="Limpiar tabla"
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-600 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-500 xl:px-4"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 xl:h-3.5 xl:w-3.5" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                </svg>
                <span className="hidden xl:inline">Limpiar tabla</span>
              </button>
              {!isHorasHistory ? (
                <button
                  type="button"
                  onClick={() => void loadSavedHoras()}
                  disabled={isLoadingHoras}
                  title="Recuperar datos"
                  aria-label="Recuperar datos"
                  className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-900/70 xl:px-4"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 xl:h-3.5 xl:w-3.5" aria-hidden="true">
                    <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
                  </svg>
                  <span className="hidden xl:inline">
                    {isLoadingHoras ? "Recuperando..." : "Recuperar datos"}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSaveHoras()}
                disabled={isSavingHoras || horasEditingBlocked}
                title="Guardar Horas"
                aria-label="Guardar Horas"
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800/80 xl:px-4"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 xl:h-3.5 xl:w-3.5" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <path d="M17 21v-8H7v8M7 3v5h8" />
                </svg>
                <span className="hidden xl:inline">
                  {isSavingHoras ? "Guardando..." : isHorasHistory ? "Guardar cambios del mes" : "Guardar Horas"}
                </span>
              </button>
            </div>
          )}
        </div>
        </>
        ) : (
          <p className={`mt-3 text-sm ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
            Tabla oculta para una vista más limpia. Toque «Mostrar» para ver y capturar las horas.
          </p>
        )}
      </section>

      {horasEmployeeToRemove !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-horas-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={cancelRemoveHorasEmployee}
        >
          {/* Fondo difuminado */}
          <div className="modal-fade-in absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />

          {/* Tarjeta */}
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ backgroundColor: "var(--surface, #181a1f)", borderColor: "var(--border, rgba(255,255,255,0.08))" }}
            className="modal-pop-in relative w-full max-w-md overflow-hidden rounded-3xl border shadow-2xl shadow-black/50"
          >
            {/* Franja superior de acento */}
            <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-rose-400 to-orange-400" />

            <div className="px-7 pb-7 pt-6">
              <div className="flex items-start gap-4">
                {/* Icono */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-inset ring-rose-400/30">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-6 w-6 text-rose-300"
                  >
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>

                <div className="min-w-0 flex-1">
                  <h3 id="remove-horas-title" className="text-lg font-semibold text-white">
                    Eliminar empleado
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-300">
                    ¿Seguro que querés eliminar a{" "}
                    <span className="font-semibold text-white">
                      {horasEmployees[horasEmployeeToRemove]?.name.trim() || "este empleado"}
                    </span>{" "}
                    de la lista de distribución de horas?
                  </p>
                  <p className="mt-2 text-xs font-medium text-rose-300/90">
                    Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={cancelRemoveHorasEmployee}
                  className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmRemoveHorasEmployee}
                  className="rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-900/40 transition hover:from-rose-400 hover:to-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-300/50"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      </>
    ) : currentService ? (
      <section
        id="panel-horas"
        className={`rounded-[24px] border border-cyan-400/20 p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)] ${isLightPanelTheme ? "bg-white" : "bg-[#202c41]"}`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200/80">
          Tabulador · DISTRIBUCION DE HORAS
        </p>
        <h2 className={`mt-1 text-2xl font-bold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>Distribucion de Horas</h2>
        <p className={`mt-2 max-w-2xl text-sm leading-6 ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
          El tabulador de Distribucion de Horas de <strong>{currentService.name}</strong> aun no
          esta cargado. Esta seccion se habilitara aqui en cuanto se cargue su plantilla.
        </p>
      </section>
    ) : null;

    // Solicitudes visibles para el usuario actual (admin: todas; supervisor: sus modulos).
    const visibleRequests = isAdmin
      ? captureRequests
      : isSupervisor
        ? captureRequests.filter((req) => serviceProfile.supervisorModules.includes(req.moduleId))
        : [];
    const pendingRequestCount = visibleRequests.filter((req) => req.status === "pending").length;
    // Soporte: supervisores y admin ven todos los tickets; pendientes para el badge.
    const pendingSupportCount = supportTickets.filter((t) => t.status === "pendiente").length;
    // El servicio logueado puede solicitar habilitacion si tiene un tablero propio.
    const canRequestEnable = !!currentService && !isAdmin && !isSupervisor;
    // Modulos que el servicio puede solicitar (los que le aplican).
    const requestableModules: ModuleId[] = currentService
      ? ([
          "perc" as ModuleId,
          ...(sepsTemplate ? (["sesps"] as ModuleId[]) : []),
          ...(horasTemplate ? (["distribucion"] as ModuleId[]) : []),
        ])
      : [];

    // Contexto para el asistente virtual: rol y que modulos tiene disponibles.
    // Solo rol/modulos, sin datos sensibles.
    const assistantCtx: AssistantContext = {
      isAdmin,
      isSupervisor,
      hasService: !!currentService,
      hasPerc: !!currentService && showModule("perc"),
      hasSeps: !!sepsTemplate && showModule("sesps"),
      hasHoras: !!currentService && !!horasTemplate && showModule("distribucion"),
      canRequestEnable,
      hasPercData: hasAnyCapturedValue(tableValues),
      hasSepsData: !!sepsTemplate && hasAnySepsValue(sepsValues),
      hasHorasData: horasEmployees.some((emp) =>
        Object.values(emp.hours).some((v) => Number(v) > 0),
      ),
    };

    // ---- Censo Diario de Pacientes (seccion) --------------------------------
    // getDayColumns devuelve string[]; lo pasamos a number[] para el censo.
    const censoDays = getDayColumns(censoPeriod).map(Number);
    // Letra del dia de la semana por columna (D L M M J V S), segun el mes elegido.
    const [censoYearNum, censoMonthNum] = censoPeriod
      .split("-")
      .map((part) => Number.parseInt(part, 10));
    const CENSO_WEEKDAY_LETTERS = ["D", "L", "M", "M", "J", "V", "S"];
    const censoWeekdayLetter = (day: number) => {
      if (!censoYearNum || !censoMonthNum) return "";
      return CENSO_WEEKDAY_LETTERS[new Date(censoYearNum, censoMonthNum - 1, day).getDay()] ?? "";
    };
    const censoIsWeekend = (day: number) => {
      if (!censoYearNum || !censoMonthNum) return false;
      const wd = new Date(censoYearNum, censoMonthNum - 1, day).getDay();
      return wd === 0 || wd === 6;
    };
    const censoNum = (rowKey: string, day: number) => {
      const n = Number.parseInt(censoValues[rowKey]?.[String(day)] ?? "", 10);
      return Number.isFinite(n) ? n : 0;
    };
    const censoRowTotal = (rowKey: string) =>
      censoDays.reduce((acc, day) => acc + censoNum(rowKey, day), 0);
    const censoDayTotal = (day: number) =>
      censoRows.reduce((acc, row) => acc + censoNum(row.key, day), 0);
    const censoGrandTotal = censoRows.reduce(
      (acc, row) => acc + censoRowTotal(row.key),
      0,
    );
    const censoCellClass = `w-12 rounded border px-1 py-1 text-center text-xs outline-none focus:border-rose-400 disabled:cursor-default disabled:opacity-90 ${
      isLightPanelTheme ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-[#1b2537] text-white"
    }`;

    const censoSection = (
      <section
        id="panel-censo"
        className={`rounded-[24px] border p-3 shadow-[0_24px_80px_rgba(3,7,18,0.35)] sm:p-5 ${
          isLightPanelTheme ? "border-teal-200 bg-white" : "border-teal-400/20 bg-[#202c41]"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md shadow-black/30">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3v18h18" />
                <rect x="7" y="9" width="3" height="9" />
                <rect x="12" y="5" width="3" height="13" />
                <rect x="17" y="12" width="3" height="6" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 className={`text-xl font-bold sm:text-2xl ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>
                Censo Diario de Pacientes
              </h2>
              <p className={`mt-1 text-sm ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                Solo supervisión · {getPeriodLabel(censoPeriod)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <label className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs ${isLightPanelTheme ? "border-slate-200 bg-slate-50 text-slate-600" : "border-white/10 bg-[#1b2537] text-slate-300"}`}>
              <span className="font-semibold uppercase tracking-wide">Mes</span>
              <input
                type="month"
                value={censoPeriod}
                onChange={(event) => setCensoPeriod(event.target.value || censoPeriod)}
                className={`bg-transparent text-xs outline-none ${isLightPanelTheme ? "text-slate-800" : "text-white [color-scheme:dark]"}`}
              />
            </label>
            {canEditCenso ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Edición
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/15 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Solo lectura
              </span>
            )}
          </div>
        </div>

        {canEditCenso ? (
          <p className={`mt-3 rounded-xl border px-3 py-2 text-[11px] ${isLightPanelTheme ? "border-cyan-200 bg-cyan-50/70 text-slate-600" : "border-cyan-400/20 bg-cyan-400/5 text-slate-300"}`}>
            Podés <strong>pegar desde Excel</strong>: seleccioná el rango de números en Excel, hacé clic en la celda inicial de la tabla y pegá (Ctrl+V). También podés escribir manualmente. Guardá el día o la semana; podés seguir llenando el mismo mes cuando quieras. Este censo no tiene cierre.
          </p>
        ) : null}

        {canEditCenso ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCensoUndo}
              disabled={censoUndoStack.length === 0}
              title="Deshacer"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                isLightPanelTheme ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
              </svg>
              Deshacer
            </button>
            <button
              type="button"
              onClick={handleCensoRedo}
              disabled={censoRedoStack.length === 0}
              title="Rehacer"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                isLightPanelTheme ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 14 5-5-5-5" />
                <path d="M20 9H9a5 5 0 0 0 0 10h1" />
              </svg>
              Rehacer
            </button>
            <button
              type="button"
              onClick={handleClearCenso}
              title="Borrar toda la tabla (se puede deshacer)"
              aria-label="Borrar toda la tabla"
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        ) : null}

        {isLoadingCenso && censoLoadedPeriod !== censoPeriod ? (
          <p className="mt-4 text-sm text-slate-400">Cargando censo…</p>
        ) : (
          <div className={`show-scrollbar mt-4 overflow-x-auto rounded-2xl border ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
            <table className={`w-full border-collapse text-xs ${isLightPanelTheme ? "text-slate-800" : "text-slate-100"}`}>
              <thead>
                <tr className={`${isLightPanelTheme ? "bg-slate-100 text-slate-600" : "bg-white/5 text-slate-300"}`}>
                  <th className={`sticky left-0 z-20 min-w-[8.5rem] border-r px-2 py-2 sm:min-w-[13rem] sm:px-3 text-left font-semibold ${isLightPanelTheme ? "border-slate-200 bg-slate-100" : "border-white/10 bg-[#1a2334]"}`}>
                    <span className="block">Servicio</span>
                    <span className={`block text-[10px] font-medium uppercase tracking-wide ${isLightPanelTheme ? "text-slate-400" : "text-slate-500"}`}>
                      {getPeriodLabel(censoPeriod)}
                    </span>
                  </th>
                  {censoDays.map((day) => {
                    const weekend = censoIsWeekend(day);
                    return (
                      <th
                        key={day}
                        className={`w-12 px-1 py-1.5 text-center font-medium ${
                          weekend
                            ? isLightPanelTheme
                              ? "bg-slate-200/70 text-slate-500"
                              : "bg-white/10 text-slate-400"
                            : ""
                        }`}
                      >
                        <span className="block text-xs font-semibold">{day}</span>
                        <span className={`block text-[9px] font-bold uppercase ${weekend ? "text-teal-500" : isLightPanelTheme ? "text-slate-400" : "text-slate-500"}`}>
                          {censoWeekdayLetter(day)}
                        </span>
                      </th>
                    );
                  })}
                  <th className={`px-3 py-2 text-center font-bold ${isLightPanelTheme ? "bg-slate-200 text-slate-700" : "bg-[#243049] text-white"}`}>
                    TOTAL
                  </th>
                  {canEditCenso ? <th className="px-1 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {censoRows.map((row, rowIndex) => {
                  const isExtra = rowIndex >= CENSO_BASE_ROWS.length;
                  return (
                    <tr key={row.key} className={`border-t ${isLightPanelTheme ? "border-slate-200" : "border-white/5"}`}>
                      <td className={`sticky left-0 z-10 min-w-[8.5rem] border-r px-2 py-1.5 font-medium sm:min-w-[13rem] sm:px-3 ${isLightPanelTheme ? "border-slate-200 bg-white" : "border-white/10 bg-[#202c41]"}`}>
                        {isExtra && canEditCenso ? (
                          <input
                            value={row.label}
                            onChange={(event) => handleRenameCensoRow(row.key, event.target.value)}
                            className={`w-full rounded border px-2 py-1 text-xs font-semibold uppercase outline-none focus:border-teal-400 ${isLightPanelTheme ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-[#1b2537] text-white"}`}
                          />
                        ) : (
                          <span className={`text-[11px] font-semibold uppercase tracking-wide ${isLightPanelTheme ? "text-slate-700" : "text-slate-200"}`}>
                            {row.label}
                          </span>
                        )}
                      </td>
                      {censoDays.map((day) => (
                        <td key={day} className="px-0.5 py-1 text-center">
                          <input
                            value={censoValues[row.key]?.[String(day)] ?? ""}
                            onChange={(event) => updateCensoCell(row.key, day, event.target.value)}
                            onPaste={(event) => handleCensoPaste(event, rowIndex, day)}
                            disabled={!canEditCenso}
                            inputMode="numeric"
                            className={censoCellClass}
                          />
                        </td>
                      ))}
                      <td className={`px-3 py-1.5 text-center font-bold ${isLightPanelTheme ? "bg-slate-50 text-teal-600" : "bg-[#1b2537] text-teal-300"}`}>
                        {censoRowTotal(row.key)}
                      </td>
                      {canEditCenso ? (
                        <td className="px-1 py-1 text-center">
                          {isExtra ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveCensoRow(row.key)}
                              title="Quitar servicio"
                              aria-label="Quitar servicio"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={`border-t-2 ${isLightPanelTheme ? "border-slate-300 bg-slate-100 text-slate-800" : "border-white/20 bg-[#243049] text-white"}`}>
                  <td className={`sticky left-0 z-10 min-w-[8.5rem] border-r px-2 py-2 font-bold uppercase tracking-wide sm:min-w-[13rem] sm:px-3 ${isLightPanelTheme ? "border-slate-300 bg-slate-100" : "border-white/10 bg-[#243049]"}`}>
                    Total
                  </td>
                  {censoDays.map((day) => (
                    <td key={day} className="px-1 py-2 text-center font-semibold text-cyan-300">
                      {censoDayTotal(day)}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-center text-sm font-extrabold ${isLightPanelTheme ? "bg-slate-200 text-teal-700" : "bg-[#1a2334] text-teal-300"}`}>
                    {censoGrandTotal}
                  </td>
                  {canEditCenso ? <td /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {canEditCenso ? (
          <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4 ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
            <button
              type="button"
              onClick={handleAddCensoRow}
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-400/40 bg-teal-500/10 px-3 py-2 text-sm font-semibold text-teal-200 transition hover:bg-teal-500/20"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Agregar servicio
            </button>
            <button
              type="button"
              onClick={() => void handleSaveCenso()}
              disabled={isSavingCenso}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <path d="M17 21v-8H7v8M7 3v5h8" />
              </svg>
              {isSavingCenso ? "Guardando…" : "Guardar censo"}
            </button>
          </div>
        ) : null}
      </section>
    );

    // ---- Insumos de Almacen (matriz de costos) ------------------------------
    const insumosCols = INSUMOS_ALMACEN_TEMPLATE.columns;
    const insumosRows = insumosEffectiveRows;
    const insumosNum = (rowKey: string, colKey: string) => {
      const n = Number.parseFloat(insumosValues[rowKey]?.[colKey] ?? "");
      return Number.isFinite(n) ? n : 0;
    };
    // Valor de una celda: filas padre suman sus hijas (por columna); las demas, su valor.
    const insumosCellNum = (row: InsumoRow, colKey: string) =>
      row.sumOf
        ? row.sumOf.reduce((acc, childKey) => acc + insumosNum(childKey, colKey), 0)
        : insumosNum(row.key, colKey);
    // Total por producto (fila) = suma de las 31 columnas de esa fila.
    const insumosRowTotal = (row: InsumoRow) =>
      insumosCols.reduce((acc, col) => acc + insumosCellNum(row, col.key), 0);
    // Total por servicio (columna) = suma de TODAS las filas 2..97 (formula =SUM(C2:C97)
    // del Excel: incluye padres e hijas, tal cual la plantilla original).
    const insumosColTotal = (colKey: string) =>
      insumosRows.reduce((acc, row) => acc + insumosCellNum(row, colKey), 0);
    const insumosCellClass = `w-24 rounded border px-1.5 py-1 text-right text-xs outline-none focus:border-indigo-400 disabled:cursor-default disabled:opacity-80 ${
      isLightPanelTheme ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-[#1b2537] text-white"
    }`;

    const insumosSection = (
      <section
        id="panel-insumos"
        className={`rounded-[24px] border p-3 shadow-[0_24px_80px_rgba(3,7,18,0.35)] sm:p-5 ${
          isLightPanelTheme ? "border-indigo-200 bg-white" : "border-indigo-400/20 bg-[#202c41]"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-black/30">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 8V5a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 5v3" />
                <path d="M3 8v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8M3 8h18M12 3v18" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 className={`text-xl font-bold sm:text-2xl ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>
                Insumos de Almacén
              </h2>
              <p className={`mt-1 text-sm ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                Costos por centro de costo · {getPeriodLabel(insumosPeriod)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <label className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs ${isLightPanelTheme ? "border-slate-200 bg-slate-50 text-slate-600" : "border-white/10 bg-[#1b2537] text-slate-300"}`}>
              <span className="font-semibold uppercase tracking-wide">Mes</span>
              <input
                type="month"
                value={insumosPeriod}
                onChange={(event) => setInsumosPeriod(event.target.value || insumosPeriod)}
                className={`bg-transparent text-xs outline-none ${isLightPanelTheme ? "text-slate-800" : "text-white [color-scheme:dark]"}`}
              />
            </label>
            {canEditInsumos ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Edición
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/15 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Solo lectura
              </span>
            )}
            <button
              type="button"
              onClick={() => setInsumosCollapsed((v) => !v)}
              aria-expanded={!insumosCollapsed}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                isLightPanelTheme
                  ? "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {insumosCollapsed ? "Mostrar tabla" : "Ocultar tabla"}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform ${insumosCollapsed ? "" : "rotate-180"}`} aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {isAdmin || isSupervisor ? (
              <button
                type="button"
                onClick={() => void handleDownloadInsumosConsolidado()}
                title="Descargar el consolidado (Excel) del mes seleccionado"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" /></svg>
                Consolidado Excel
              </button>
            ) : null}
          </div>
        </div>

        {insumosCollapsed ? (
          <p className={`mt-4 rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${isLightPanelTheme ? "border-slate-200 text-slate-500" : "border-white/10 text-slate-400"}`}>
            La tabla está oculta. Tocá <span className="font-semibold">«Mostrar tabla»</span> para ver el tabulador de insumos.
          </p>
        ) : (
          <>
        {canEditInsumos ? (
          <p className={`mt-3 rounded-xl border px-3 py-2 text-[11px] ${isLightPanelTheme ? "border-indigo-200 bg-indigo-50/70 text-slate-600" : "border-indigo-400/20 bg-indigo-400/5 text-slate-300"}`}>
            Podés <strong>pegar desde Excel</strong> (Ctrl+V) sobre la celda inicial, escribir manualmente, o <strong>subir la plantilla</strong>. Las filas en <span className="font-semibold text-indigo-300">negrita</span> son totales que se calculan solos (suma de sus subfilas), igual que el Excel. Guardá cuando quieras; no tiene cierre.
          </p>
        ) : null}

        {canEditInsumos ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleInsumosUndo}
              disabled={insumosUndoStack.length === 0}
              title="Deshacer"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${isLightPanelTheme ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>
              Deshacer
            </button>
            <button
              type="button"
              onClick={handleInsumosRedo}
              disabled={insumosRedoStack.length === 0}
              title="Rehacer"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${isLightPanelTheme ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" /></svg>
              Rehacer
            </button>
            <button
              type="button"
              onClick={() => insumosFileInputRef.current?.click()}
              disabled={isImportingInsumos}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21V9" /><path d="m7 12 5-5 5 5" /><path d="M5 3h14" /></svg>
              {isImportingInsumos ? "Procesando…" : "Subir plantilla Excel"}
            </button>
            <input
              ref={insumosFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => void handleUploadInsumosFile(event)}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleClearInsumos}
              title="Borrar toda la tabla (se puede deshacer)"
              aria-label="Borrar toda la tabla"
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
            </button>
          </div>
        ) : null}

        {isLoadingInsumos && insumosLoadedPeriod !== insumosPeriod ? (
          <p className="mt-4 text-sm text-slate-400">Cargando insumos…</p>
        ) : (
          <div className={`show-scrollbar mt-4 max-h-[68vh] overflow-auto rounded-2xl border ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
            <table className={`border-collapse text-xs ${isLightPanelTheme ? "text-slate-800" : "text-slate-100"}`}>
              <thead>
                <tr className={`${isLightPanelTheme ? "bg-slate-100 text-slate-600" : "bg-white/5 text-slate-300"}`}>
                  <th className={`sticky left-0 top-0 z-30 min-w-[11rem] border-r px-2 py-2 text-left align-bottom font-semibold sm:min-w-[15rem] sm:px-3 ${isLightPanelTheme ? "border-slate-200 bg-slate-100" : "border-white/10 bg-[#1a2334]"}`}>
                    <span className="block">Centro de Costo</span>
                    <span className={`block text-[10px] font-medium uppercase tracking-wide ${isLightPanelTheme ? "text-slate-400" : "text-slate-500"}`}>
                      {getPeriodLabel(insumosPeriod)}
                    </span>
                  </th>
                  {insumosCols.map((col) => (
                    <th key={col.key} className={`sticky top-0 z-20 w-24 px-1 py-2 align-bottom text-center font-medium ${isLightPanelTheme ? "bg-slate-100" : "bg-[#1a2334]"}`} title={col.label}>
                      <span className="block whitespace-normal text-[10px] leading-tight">{col.label}</span>
                    </th>
                  ))}
                  <th className={`sticky top-0 z-20 px-2 py-2 text-center align-bottom font-bold ${isLightPanelTheme ? "bg-slate-200 text-slate-700" : "bg-[#243049] text-white"}`}>
                    {INSUMOS_ALMACEN_TEMPLATE.rowTotalLabel}
                  </th>
                  {canManageInsumosRows ? (
                    <th className={`sticky top-0 z-20 px-1 py-2 ${isLightPanelTheme ? "bg-slate-100" : "bg-[#1a2334]"}`} />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {insumosRows.map((row) => {
                  const isParent = !!row.sumOf;
                  const isExtra = row.isExtra;
                  return (
                    <tr key={row.key} className={`border-t ${isLightPanelTheme ? "border-slate-200" : "border-white/5"} ${isParent ? (isLightPanelTheme ? "bg-indigo-50/60" : "bg-indigo-500/10") : isExtra ? (isLightPanelTheme ? "bg-emerald-50/60" : "bg-emerald-500/5") : ""}`}>
                      <td className={`sticky left-0 z-10 min-w-[11rem] border-r px-2 py-1.5 sm:min-w-[15rem] sm:px-3 ${isLightPanelTheme ? "border-slate-200 " + (isParent ? "bg-indigo-50" : isExtra ? "bg-emerald-50" : "bg-white") : "border-white/10 " + (isParent ? "bg-[#26314a]" : isExtra ? "bg-[#1e2f3a]" : "bg-[#202c41]")}`}>
                        {isExtra && canManageInsumosRows ? (
                          <input
                            value={row.label}
                            onChange={(event) => handleRenameInsumosRow(row.key, event.target.value)}
                            placeholder="Nombre del servicio"
                            className={`w-full rounded border px-2 py-1 text-[11px] font-semibold uppercase outline-none focus:border-emerald-400 ${isLightPanelTheme ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-[#16212c] text-white"}`}
                          />
                        ) : (
                          <span className={`block text-[11px] ${isParent ? "font-bold uppercase tracking-wide " + (isLightPanelTheme ? "text-indigo-700" : "text-indigo-200") : isExtra ? "font-semibold uppercase tracking-wide " + (isLightPanelTheme ? "text-emerald-700" : "text-emerald-200") : isLightPanelTheme ? "text-slate-700" : "text-slate-200"}`}>
                            {row.label}
                          </span>
                        )}
                      </td>
                      {insumosCols.map((col) => (
                        <td key={col.key} className="px-0.5 py-1 text-center">
                          {isParent ? (
                            <span className={`block w-24 px-1.5 text-right text-xs font-semibold ${isLightPanelTheme ? "text-indigo-600" : "text-indigo-300"}`}>
                              {formatMoney(insumosCellNum(row, col.key))}
                            </span>
                          ) : (
                            <input
                              id={`ins-${row.key}-${col.key}`}
                              value={insumosValues[row.key]?.[col.key] ?? ""}
                              onChange={(event) => updateInsumosCell(row.key, col.key, event.target.value)}
                              onPaste={(event) => handleInsumosPaste(event, row.key, col.key)}
                              onKeyDown={(event) => handleInsumosKeyNav(event, row.key, col.key)}
                              disabled={!canEditInsumos}
                              inputMode="decimal"
                              className={insumosCellClass}
                            />
                          )}
                        </td>
                      ))}
                      <td className={`px-2 py-1.5 text-right font-bold ${isLightPanelTheme ? "bg-slate-50 text-indigo-600" : "bg-[#1b2537] text-indigo-300"}`}>
                        {formatMoney(insumosRowTotal(row))}
                      </td>
                      {canManageInsumosRows ? (
                        <td className="whitespace-nowrap px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleAddInsumosRow(row.key)}
                            title="Agregar una fila debajo"
                            aria-label="Agregar una fila debajo"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-emerald-500/10 hover:text-emerald-300"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveInsumosRow(row.key, isExtra, row.label)}
                            title={isExtra ? "Quitar esta fila" : "Ocultar esta fila oficial"}
                            aria-label={isExtra ? "Quitar esta fila" : "Ocultar esta fila oficial"}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={`border-t-2 ${isLightPanelTheme ? "border-slate-300 bg-slate-100 text-slate-800" : "border-white/20 bg-[#243049] text-white"}`}>
                  <td className={`sticky left-0 z-10 min-w-[11rem] border-r px-2 py-2 font-bold uppercase tracking-wide sm:min-w-[15rem] sm:px-3 ${isLightPanelTheme ? "border-slate-300 bg-slate-100" : "border-white/10 bg-[#243049]"}`}>
                    {INSUMOS_ALMACEN_TEMPLATE.grandTotalLabel}
                  </td>
                  {insumosCols.map((col) => (
                    <td key={col.key} className="px-1 py-2 text-right font-semibold text-blue-300">
                      {formatMoney(insumosColTotal(col.key))}
                    </td>
                  ))}
                  <td className={`px-2 py-2 text-right text-sm font-extrabold ${isLightPanelTheme ? "bg-slate-200 text-indigo-700" : "bg-[#1a2334] text-indigo-300"}`} />
                  {canManageInsumosRows ? <td className="px-1 py-2" /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {canManageInsumosRows && insumosHiddenKeys.length > 0 ? (
          <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] ${isLightPanelTheme ? "border-amber-200 bg-amber-50/70 text-amber-800" : "border-amber-400/20 bg-amber-400/5 text-amber-200"}`}>
            <span>
              Hay {insumosHiddenKeys.length} fila(s) oficial(es) oculta(s). Sus datos siguen guardados.
            </span>
            <button
              type="button"
              onClick={handleRestoreInsumosRows}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${isLightPanelTheme ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-amber-400/15 text-amber-100 hover:bg-amber-400/25"}`}
            >
              Restaurar filas ocultas
            </button>
          </div>
        ) : null}

        {canEditInsumos || canManageInsumosRows ? (
          <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4 ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
            <p className={`text-[11px] ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
              {!canManageInsumosRows
                ? "Completá los valores del mes y tocá «Guardar insumos»."
                : canEditInsumos
                  ? "Usá + para agregar una fila y el bote para quitarla; luego guardá."
                  : "Podés agregar/quitar filas y guardarlas. La captura de valores la hace el servicio Almacén."}
            </p>
            <button
              type="button"
              onClick={() => void handleSaveInsumos()}
              disabled={isSavingInsumos}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <path d="M17 21v-8H7v8M7 3v5h8" />
              </svg>
              {isSavingInsumos ? "Guardando…" : "Guardar insumos"}
            </button>
          </div>
        ) : null}
          </>
        )}
      </section>
    );

    const sidebarItems = [
      {
        id: "panel-overview",
        label: "Inicio",
        detail: isAdmin ? "Resumen general" : "Estado del periodo",
        badge: "IN",
      },
      // "Servicios" ya no es un item suelto: cada modulo (PERC/SEPS/Horas) lo
      // ofrece como submenu "X Servicios" que abre la misma vista panel-services.
      ...moduleSidebarItems,
      {
        id: "panel-docs",
        label: "DOCS-POA/MOF",
        detail: "Control de entregas a Calidad",
        badge: "DO",
      },
      {
        id: "panel-config",
        label: "Configuración",
        detail: "Personalizá tu vista",
        badge: "CF",
      },
      ...(isAdmin
        ? [
            {
              id: "panel-calendar",
              label: "Config/días-hábiles",
              detail: "Dias habiles",
              badge: "CM",
            },
            {
              id: "panel-users",
              label: "Usuarios",
              detail: "Cuentas y permisos",
              badge: "US",
            },
            {
              id: "panel-signups",
              label: "Registros",
              detail: "Solicitudes de nuevos jefes",
              badge:
                signupRequests.filter((r) => r.status === "pending").length > 0
                  ? String(signupRequests.filter((r) => r.status === "pending").length)
                  : "RG",
            },
          ]
        : []),
      ...(serviceProfile.permissions.canToggleCapture
        ? [
            {
              id: "panel-capture-toggle",
              label: "Habilitar tableros",
              detail: "Reabrir o cerrar captura",
              badge: "HT",
            },
          ]
        : []),
      ...(isSupervisor || isAdmin
        ? [
            {
              id: "panel-requests",
              label: "Solicitudes",
              detail: "Pedidos de habilitacion",
              badge: pendingRequestCount > 0 ? String(pendingRequestCount) : "SO",
            },
          ]
        : []),
      ...(canRequestEnable
        ? [
            {
              id: "panel-request-form",
              label: "Solicitar habilitar",
              detail: "Pedir reapertura de un tablero",
              badge: "SO",
            },
          ]
        : []),
    ];

    const moduleSections =
      visibleModules.length > 0 ? (
        <section
          id="panel-modules"
          className={`rounded-[28px] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)] ${
            isLightPanelTheme
              ? "border border-slate-200 bg-white text-slate-900"
              : "border border-white/10 bg-[#202c41]"
          }`}
        >
          <div className="mb-4">
            <h2 className={`text-xs font-semibold uppercase tracking-[0.18em] ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
              Menús del área ({visibleModules.length}/{MODULE_DEFINITIONS.length})
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleModules.map((mod) => {
              const status = getModuleUiStatus(mod);
              const isComplete = status === "completo";

              return (
                <div
                  key={mod.id}
                  id={`panel-module-${mod.id}`}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                    isLightPanelTheme
                      ? "border-slate-200 bg-[#f7f9fe]"
                      : "border-white/10 bg-[#1b2537]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1f255f] text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                      {moduleBadges[mod.id]}
                    </span>
                    <div className="min-w-0">
                      <h3 className={`truncate text-sm font-semibold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>
                        {mod.name}
                      </h3>
                      <span
                        className={`mt-0.5 block text-[11px] font-semibold ${
                          isComplete ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        {isComplete ? "Completo" : "Incompleto"}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {mod.id === "perc" ? (
                      currentService ? (
                        <button
                          type="button"
                          onClick={() => handleSidebarNavigation("panel-tabulator")}
                          className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
                        >
                          Abrir
                        </button>
                      ) : (
                        <span className={`text-[11px] ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                          Sin tabulador
                        </span>
                      )
                    ) : mod.id === "sesps" && sepsTemplate ? (
                      <button
                        type="button"
                        onClick={() => handleSidebarNavigation("panel-seps")}
                        className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
                      >
                        Abrir
                      </button>
                    ) : mod.id === "distribucion" && currentService ? (
                      <button
                        type="button"
                        onClick={() => handleSidebarNavigation("panel-horas")}
                        className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
                      >
                        Abrir
                      </button>
                    ) : (
                      <span className={`text-[11px] ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                        Pendiente
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null;

    return (
      <main
        style={
          {
            fontFamily: getFontStack(uiPrefs.font),
            "--accent": getAccentOption(uiPrefs.accent).accent,
            "--accent-btn": getAccentOption(uiPrefs.accent).accent,
            "--accent-ink": getAccentOption(uiPrefs.accent).ink,
            ...(getBackgroundCss(uiPrefs.background)
              ? { backgroundImage: getBackgroundCss(uiPrefs.background) as string }
              : {}),
          } as CSSProperties
        }
        className={`panel-shell ${
          isLightPanelTheme ? "theme-light" : "theme-dark"
        } min-h-screen px-4 py-6 sm:px-7 lg:px-10`}
      >
        <div
          className={`mx-auto grid max-w-[1850px] grid-cols-1 gap-6 ${
            menuOpen ? "xl:grid-cols-[290px_minmax(0,1fr)]" : "xl:grid-cols-1"
          }`}
        >
          {/* Fondo oscuro detras del cajon (solo movil/cuando esta abierto). */}
          {menuOpen ? (
            <div
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 xl:hidden"
            />
          ) : null}
          <aside
            className={`self-start overflow-y-auto px-4 pt-4 pb-28 shadow-[0_-24px_80px_rgba(3,7,18,0.45)] transition-transform duration-300 fixed inset-x-0 bottom-0 z-50 w-full max-h-[82vh] rounded-t-[28px] xl:inset-x-auto xl:bottom-auto xl:z-auto xl:w-auto xl:max-h-[calc(100vh-2rem)] xl:rounded-[24px] xl:p-4 xl:pb-4 xl:shadow-[0_24px_80px_rgba(3,7,18,0.22)] xl:transition-none xl:sticky xl:top-4 ${
              menuOpen ? "translate-y-0" : "translate-y-full xl:hidden"
            } ${
              isLightPanelTheme
                ? "border border-slate-200 bg-[#eef2fb] text-slate-900"
                : "border border-white/10 bg-[#1b2537] text-slate-100"
            }`}
          >
            {/* Asa de arrastre: solo en movil (hoja inferior). */}
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Cerrar menú"
              className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-slate-400/40 xl:hidden"
            />
            <div className={`pb-4 text-center xl:pb-3 ${isLightPanelTheme ? "border-b border-slate-200" : "border-b border-white/10"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Hospital Nacional
              </p>
              <p className="mt-0.5 text-[11px] font-medium tracking-[0.16em] text-slate-500">
                El Salvador
              </p>
            </div>

            <div
              className={`mt-4 flex items-center gap-3 rounded-2xl px-3 py-2.5 shadow-sm xl:mt-3 xl:py-2 ${
                isLightPanelTheme ? "bg-white" : "bg-[#202c41]"
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1f255f] text-sm font-bold text-white">
                {currentService ? (
                  <ServiceIcon serviceId={currentService.id} className="h-5 w-5 text-cyan-200" />
                ) : (
                  serviceProfile.username.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13px] font-semibold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>{welcomeName}</p>
                <p className="truncate text-xs text-[#4f6aa3]">
                  {currentService?.name || (isAdmin ? "Administrador del sistema" : serviceProfile.email)}
                </p>
              </div>
              <PulsoMark className="ml-1 h-8 w-8 shrink-0 opacity-90" />
            </div>

            <nav className="mt-5 grid grid-cols-3 gap-2 xl:mt-3 xl:block xl:space-y-0.5">
              {sidebarItems.map((item) => {
                const isActive = activeSidebarSection === item.id;
                // Alerta roja cuando hay solicitudes pendientes, o cuando el SERVICIO
                // tiene comentarios de revision sin leer en su SEPS.
                const sepsCommentAlert = item.id === "panel-seps" && serviceSepsCommentCount > 0;
                const hasAlert =
                  (item.id === "panel-requests" && pendingRequestCount > 0) || sepsCommentAlert;
                const alertCount = sepsCommentAlert ? serviceSepsCommentCount : pendingRequestCount;
                const tileGradient =
                  SIDEBAR_TILE_GRADIENT[item.id] ?? "from-cyan-500 to-blue-600";
                const itemChildren = (item as { children?: { id: string; label: string; detail: string; badge: string; icon?: string }[] }).children;
                const hasChildren = Array.isArray(itemChildren) && itemChildren.length > 0;
                const isExpanded = expandedMenu === item.id;

                return (
                  <Fragment key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      // Los items con submenu (p.ej. PERC) solo despliegan/pliegan.
                      if (hasChildren) {
                        setExpandedMenu((cur) => (cur === item.id ? null : item.id));
                        return;
                      }
                      const isMobile =
                        typeof window !== "undefined" && window.innerWidth < 1280;
                      // En movil, los items de navegacion abren SU pantalla (una a la vez).
                      const view =
                        item.id === "panel-overview"
                          ? "home"
                          : [
                                "panel-services",
                                "panel-tabulator",
                                "panel-seps",
                                "panel-horas",
                                "panel-calendar",
                                "panel-admin-export",
                                "panel-capture-toggle",
                              ].includes(item.id)
                            ? item.id
                            : null;
                      if (isMobile && view) {
                        setMobileView(view);
                        setMenuOpen(false);
                      } else {
                        runSidebarItem(item.id, requestableModules);
                        if (isMobile) setMenuOpen(false);
                      }
                    }}
                    title={item.detail}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2.5 text-center transition xl:w-full xl:flex-row xl:justify-start xl:gap-2.5 xl:px-2.5 xl:py-1.5 xl:text-left ${
                      hasAlert
                        ? "border-rose-400/60 bg-rose-500/15 hover:bg-rose-500/25"
                        : isActive
                          ? "border-[#cad5ee] bg-[#e8eefb] shadow-sm"
                          : isLightPanelTheme
                            ? "border-transparent bg-transparent hover:border-slate-200 hover:bg-white/80"
                            : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tileGradient} text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-md shadow-black/30 [&_svg]:h-[22px] [&_svg]:w-[22px] xl:h-7 xl:w-7 xl:rounded-lg xl:shadow-none xl:[&_svg]:h-[18px] xl:[&_svg]:w-[18px] ${
                        hasAlert
                          ? "xl:bg-none xl:bg-rose-500"
                          : isActive
                            ? ""
                            : "xl:bg-none xl:bg-white/5 xl:text-slate-100 xl:ring-1 xl:ring-white/10"
                      }`}
                    >
                      {SIDEBAR_ICON_BY_ID[item.id] ?? item.badge}
                      {hasAlert ? (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white ring-2 ring-[#0e1626]">
                          {alertCount}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`block w-full truncate text-[10px] font-medium leading-tight xl:flex-1 xl:text-[13px] ${
                        hasAlert
                          ? "text-rose-200"
                          : isLightPanelTheme
                            ? "text-slate-900"
                            : "text-slate-100"
                      }`}
                    >
                      {item.label}
                    </span>
                    {hasChildren ? (
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className={`hidden shrink-0 text-slate-400 transition-transform xl:block ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    ) : null}
                  </button>
                  {hasChildren && isExpanded ? (
                    <div
                      className={`col-span-3 mt-1 space-y-0.5 xl:mt-1 xl:ml-[22px] xl:border-l xl:pl-3 ${
                        isLightPanelTheme ? "xl:border-slate-200" : "xl:border-white/10"
                      }`}
                    >
                      {itemChildren!.map((child) => {
                        const childActive = activeSidebarSection === child.id;
                        const childTint =
                          SUBMENU_ICON_TINT[child.icon ?? ""] ?? "bg-slate-500/15 text-slate-300";
                        return (
                          <button
                            key={child.id}
                            type="button"
                            title={child.detail}
                            onClick={() => {
                              const isMobile =
                                typeof window !== "undefined" && window.innerWidth < 1280;
                              // Los items tipo modal (Monitoreo) abren el modal en PC y movil.
                              const isModalChild =
                                child.id.startsWith("panel-monitor-") ||
                                child.id.startsWith("panel-module-");
                              if (isMobile && !isModalChild) {
                                setMobileView(child.id);
                                setMenuOpen(false);
                              } else {
                                runSidebarItem(child.id, requestableModules);
                                if (isMobile) setMenuOpen(false);
                              }
                            }}
                            className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                              childActive
                                ? isLightPanelTheme
                                  ? "bg-slate-100 text-slate-900"
                                  : "bg-white/10 text-white"
                                : isLightPanelTheme
                                  ? "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
                                  : "text-slate-300 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            {childActive ? (
                              <span
                                aria-hidden="true"
                                className="absolute -left-3 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-full bg-current opacity-80 xl:block"
                              />
                            ) : null}
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 transition ${childTint} ${
                                childActive ? "ring-white/20" : "ring-transparent group-hover:ring-white/10"
                              }`}
                            >
                              {renderSubmenuIcon(child.icon)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-tight">
                              {child.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  </Fragment>
                );
              })}
            </nav>

            <div className={`mt-4 grid grid-cols-3 gap-2 pt-4 xl:mt-3 xl:pt-3 xl:block xl:space-y-0.5 ${isLightPanelTheme ? "border-t border-slate-200" : "border-t border-white/10"}`}>
              <button
                type="button"
                onClick={handleTogglePanelTheme}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-center text-[10px] font-medium transition xl:w-full xl:flex-row xl:justify-start xl:gap-2.5 xl:px-2.5 xl:py-1.5 xl:text-left xl:text-[13px] ${
                  isLightPanelTheme ? "text-slate-700 hover:bg-white" : "text-slate-200 hover:bg-white/5"
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-black/30 [&_svg]:h-[22px] [&_svg]:w-[22px] xl:h-7 xl:w-7 xl:rounded-lg xl:bg-none xl:bg-white/5 xl:text-slate-100 xl:shadow-none xl:ring-1 xl:ring-white/10 xl:[&_svg]:h-[18px] xl:[&_svg]:w-[18px]">
                  {isLightPanelTheme ? IconMoon : IconSun}
                </span>
                <span>{isLightPanelTheme ? "Modo oscuro" : "Modo claro"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setShowPasswordText(false);
                  setShowPasswordModal(true);
                }}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-center text-[10px] font-medium transition xl:w-full xl:flex-row xl:justify-start xl:gap-2.5 xl:px-2.5 xl:py-1.5 xl:text-left xl:text-[13px] ${
                  isLightPanelTheme ? "text-slate-700 hover:bg-white" : "text-slate-200 hover:bg-white/5"
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-purple-600 text-white shadow-md shadow-black/30 [&_svg]:h-[22px] [&_svg]:w-[22px] xl:h-7 xl:w-7 xl:rounded-lg xl:bg-none xl:bg-white/5 xl:text-slate-100 xl:shadow-none xl:ring-1 xl:ring-white/10 xl:[&_svg]:h-[18px] xl:[&_svg]:w-[18px]">
                  {IconKey}
                </span>
                <span>Cambiar contrasena</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setShowSupportModal(true);
                }}
                className={`relative flex flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-center text-[10px] font-medium transition xl:w-full xl:flex-row xl:justify-start xl:gap-2.5 xl:px-2.5 xl:py-1.5 xl:text-left xl:text-[13px] ${
                  isLightPanelTheme ? "text-slate-700 hover:bg-white" : "text-slate-200 hover:bg-white/5"
                }`}
              >
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-600 text-white shadow-md shadow-black/30 [&_svg]:h-[22px] [&_svg]:w-[22px] xl:h-7 xl:w-7 xl:rounded-lg xl:bg-none xl:bg-white/5 xl:text-slate-100 xl:shadow-none xl:ring-1 xl:ring-white/10 xl:[&_svg]:h-[18px] xl:[&_svg]:w-[18px]">
                  {IconHeadset}
                  {(isAdmin || isSupervisor) && pendingSupportCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white ring-2 ring-[#0e1626]">
                      {pendingSupportCount}
                    </span>
                  ) : null}
                </span>
                <span>Soporte</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="group flex flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-center text-[10px] font-medium text-slate-300 transition hover:bg-rose-500/10 hover:text-rose-300 xl:w-full xl:flex-row xl:justify-start xl:gap-2.5 xl:px-2.5 xl:py-1.5 xl:text-left xl:text-[13px]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-md shadow-rose-900/40 [&_svg]:h-[22px] [&_svg]:w-[22px] xl:h-7 xl:w-7 xl:rounded-lg xl:bg-none xl:bg-white/5 xl:text-slate-300 xl:shadow-none xl:ring-1 xl:ring-white/10 xl:[&_svg]:h-[18px] xl:[&_svg]:w-[18px] xl:transition xl:group-hover:bg-rose-500/15 xl:group-hover:text-rose-300">
                  {IconLogout}
                </span>
                <span>Cerrar sesion</span>
              </button>
            </div>
          </aside>

          {/* Barra inferior: SOLO movil. Solo la casita, centrada (abre el menu).
              Hermana del aside para que el fixed llegue al borde inferior real. */}
          <nav
            className={`fixed inset-x-0 bottom-0 z-50 flex items-center justify-center border-t px-12 pt-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(3,7,18,0.6)] xl:hidden ${
              isLightPanelTheme ? "border-slate-200 bg-white" : "border-white/10 bg-[#141c2c]"
            }`}
          >
            {/* Casita: alterna el menu. Verde (aprobada/nueva) o rojo (rechazada) + punto. */}
            <button
              type="button"
              onClick={() => {
                setCasitaAlert(false);
                setCasitaLabel(null);
                setCasitaTone("new");
                setMenuOpen((value) => !value);
              }}
              aria-label="Menú"
              title="Menú"
              className={`flex flex-col items-center gap-0.5 ${
                casitaAlert
                  ? casitaTone === "rejected"
                    ? "text-rose-300"
                    : "text-emerald-300"
                  : isLightPanelTheme
                    ? "text-slate-600"
                    : "text-slate-200"
              }`}
            >
              <span
                className={`relative flex h-9 w-9 items-center justify-center rounded-xl ring-1 [&_svg]:h-[18px] [&_svg]:w-[18px] ${
                  casitaAlert
                    ? casitaTone === "rejected"
                      ? "bg-rose-500/25 text-rose-200 ring-rose-400/50"
                      : "bg-emerald-500/25 text-emerald-200 ring-emerald-400/50"
                    : "bg-white/5 ring-white/10"
                }`}
              >
                {IconHome}
                {casitaAlert ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue-300 ring-2 ring-[#141c2c]" />
                ) : null}
              </span>
              <span className="text-[10px] font-semibold">Menú</span>
            </button>

            {/* Etiqueta temporal al lado: "Solicitud PERC aprobada/rechazada". */}
            {casitaLabel ? (
              <span
                className={`notif-slide-in ml-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                  casitaTone === "rejected"
                    ? "bg-rose-500/15 text-rose-300"
                    : "bg-emerald-500/15 text-emerald-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    casitaTone === "rejected" ? "bg-rose-400" : "bg-emerald-400"
                  }`}
                />
                {casitaLabel}
              </span>
            ) : null}
          </nav>

          {/* Avisos tipo WhatsApp (con logo PULSO) cuando llega una solicitud nueva. */}
          {toastNotifs.length > 0 ? (
            <div className="pointer-events-none fixed inset-x-0 top-0 z-[110] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              {toastNotifs.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setShowRequestsModal(true);
                    setToastNotifs((prev) => prev.filter((x) => x.id !== n.id));
                  }}
                  className="notif-slide-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-white/10 bg-[#1b2537]/95 px-3.5 py-3 text-left shadow-2xl shadow-black/50 backdrop-blur-md"
                >
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 opacity-50 blur"
                    />
                    <svg viewBox="0 0 48 48" className="relative h-10 w-10" aria-hidden="true">
                      <defs>
                        <linearGradient id="pulsoNotif" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="#22d3ee" />
                          <stop offset="1" stopColor="#7c3aed" />
                        </linearGradient>
                      </defs>
                      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pulsoNotif)" />
                      <path
                        d="M7 25 H16 L19.5 15 L25 35 L29 25 H41"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-white">PULSO</span>
                      <span className="text-[10px] text-slate-400">ahora</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] font-semibold text-cyan-200">
                      {n.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-300">
                      {n.body}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {/* Modal: confirmar salir de la app (boton atras en Inicio). SOLO movil. */}
          {showExitModal ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Salir de la aplicación"
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 xl:hidden"
            >
              <div
                className="modal-fade-in absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
                onClick={() => setShowExitModal(false)}
              />
              <div className="modal-pop-in relative w-full max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-[#0e1626] shadow-2xl shadow-black/60">
                <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
                <div className="px-6 pb-6 pt-7 text-center">
                  <span className="relative mx-auto flex h-14 w-14 items-center justify-center">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 opacity-50 blur"
                    />
                    <svg viewBox="0 0 48 48" className="relative h-14 w-14 drop-shadow-lg" aria-hidden="true">
                      <defs>
                        <linearGradient id="pulsoExit" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="#22d3ee" />
                          <stop offset="1" stopColor="#7c3aed" />
                        </linearGradient>
                      </defs>
                      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pulsoExit)" />
                      <path
                        d="M7 25 H16 L19.5 15 L25 35 L29 25 H41"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-white">¿Salir de la aplicación?</h3>
                  <p className="mt-1.5 text-sm text-slate-400">
                    Vas a cerrar PULSO. Podés volver a abrirla cuando quieras.
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowExitModal(false)}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        exitingRef.current = true;
                        setShowExitModal(false);
                        // Desandar el historial para cerrar la PWA.
                        window.history.go(-2);
                        // Si el navegador no la cierra, reactivar el control del boton atras.
                        window.setTimeout(() => {
                          exitingRef.current = false;
                          window.history.pushState({ pulso: true }, "");
                        }, 700);
                      }}
                      className="rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-900/30 transition hover:opacity-90"
                    >
                      Salir
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div data-mview={mobileView} className="min-w-0 space-y-6 pb-28 xl:pb-0">
            {/* Boton de menu (hamburguesa) PEGAJOSO: solo PC (en movil se usa la casita inferior). */}
            <div className="sticky top-3 z-30 hidden items-center justify-between gap-2 xl:flex">
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                aria-label={menuOpen ? "Ocultar menú" : "Mostrar menú"}
                className={`inline-flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-semibold shadow-lg ring-1 backdrop-blur-md transition-all duration-300 hover:opacity-100 ${
                  isLightPanelTheme
                    ? "border-amber-300/60 bg-white text-slate-800 ring-amber-300/40 hover:bg-amber-50"
                    : "border-amber-400/40 bg-[#202c41] text-amber-100 ring-amber-400/30 hover:bg-[#243049]"
                } ${menuScrolled ? "opacity-40 hover:opacity-100" : "opacity-100"}`}
              >
                <span className="flex flex-col gap-[3.5px]">
                  <span className="block h-0.5 w-5 rounded-full bg-amber-400" />
                  <span className="block h-0.5 w-5 rounded-full bg-amber-400" />
                  <span className="block h-0.5 w-5 rounded-full bg-amber-400" />
                </span>
                <span className="hidden xl:inline">Menú</span>
              </button>
            </div>

            {/* Pantalla de INICIO (resumen) — SOLO movil, ajustada a una vista. */}
            <div data-home className="xl:hidden">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-300/80">
                    Inicio
                  </p>
                  <div className="mt-2.5 flex items-center justify-end gap-2.5">
                    <h1 className="text-2xl font-light tracking-wide text-white">Bienvenido a</h1>
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 opacity-50 blur"
                      />
                      <svg viewBox="0 0 48 48" className="relative h-10 w-10 drop-shadow" aria-hidden="true">
                        <defs>
                          <linearGradient id="pulsoHome" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor="#22d3ee" />
                            <stop offset="1" stopColor="#7c3aed" />
                          </linearGradient>
                        </defs>
                        <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pulsoHome)" />
                        <path
                          d="M7 25 H16 L19.5 15 L25 35 L29 25 H41"
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                  <p className="mt-2 truncate text-xs text-slate-400">
                    {isAdmin
                      ? "Administrador del sistema"
                      : currentService?.name || serviceProfile.email}{" "}
                    · {periodLabel}
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-[#202c41] p-4 shadow-[0_20px_60px_rgba(3,7,18,0.35)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Captura del periodo
                  </p>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="relative h-24 w-24 shrink-0">
                      <svg viewBox="0 0 120 120" className="h-24 w-24 -rotate-90">
                        <defs>
                          <linearGradient id="homeRing" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor="#22d3ee" />
                            <stop offset="1" stopColor="#7c3aed" />
                          </linearGradient>
                        </defs>
                        <circle
                          cx="60"
                          cy="60"
                          r="52"
                          fill="none"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="12"
                        />
                        <circle
                          cx="60"
                          cy="60"
                          r="52"
                          fill="none"
                          stroke="url(#homeRing)"
                          strokeWidth="12"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 52}
                          strokeDashoffset={(2 * Math.PI * 52 * (100 - currentMonthProgress)) / 100}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-white">{currentMonthProgress}%</span>
                        <span className="text-[10px] text-slate-400">completo</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-2">
                        <span className="text-xs font-medium text-emerald-200">Completados</span>
                        <span className="text-lg font-bold text-emerald-300">{publicCompletedCount}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2">
                        <span className="text-xs font-medium text-amber-200">Pendientes</span>
                        <span className="text-lg font-bold text-amber-300">
                          {Math.max(SERVICE_COUNT - publicCompletedCount, 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-center text-xs text-slate-400">
                    {publicCompletedCount} de {SERVICE_COUNT} dependencias han ingresado su información
                  </p>
                </div>

                {/* 3 tarjetas de estadistica general por modulo (a lo ancho). */}
                <div className="mt-[2.4vh] space-y-3">
                  {(
                    [
                      { key: "PERC", label: "PERC", text: "text-cyan-300", bar: "from-cyan-400 to-cyan-500" },
                      { key: "SEPS", label: "SEPS", text: "text-blue-300", bar: "from-blue-400 to-blue-500" },
                      { key: "Horas", label: "Horas", text: "text-amber-300", bar: "from-amber-400 to-amber-500" },
                    ] as const
                  ).map((m) => {
                    const stat = moduleStats[m.key];
                    const pct = stat.total > 0 ? Math.round((stat.done / stat.total) * 100) : 0;
                    return (
                      <div
                        key={m.key}
                        className="rounded-2xl border border-white/10 bg-[#202c41] p-4 shadow-[0_12px_40px_rgba(3,7,18,0.3)]"
                      >
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-bold uppercase tracking-wide ${m.text}`}>
                            {m.label}
                          </p>
                          <p className="text-lg font-bold leading-none text-white">
                            {stat.done}
                            <span className="text-sm font-medium text-slate-500">/{stat.total}</span>
                          </p>
                        </div>
                        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${m.bar}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-right text-[11px] text-slate-400">
                          {pct}% completado
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Barra de "volver a Inicio" — SOLO movil, en cualquier vista que no sea Inicio. */}
            <div
              data-view="panel-services panel-tabulator panel-seps panel-horas panel-censo panel-insumos panel-calendar panel-admin-export panel-capture-toggle"
              className="flex items-center gap-3 xl:hidden"
            >
              <button
                type="button"
                onClick={() => setMobileView("home")}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
              >
                <span className="text-base leading-none">‹</span> Inicio
              </button>
              <span className="truncate text-sm font-semibold text-white">
                {mobileView === "panel-services"
                  ? "Servicios"
                  : mobileView === "panel-tabulator"
                  ? "PERC"
                  : mobileView === "panel-seps"
                    ? "SEPS"
                    : mobileView === "panel-horas"
                      ? "Distribución de Horas"
                      : mobileView === "panel-censo"
                      ? "Censo diario de pacientes"
                      : mobileView === "panel-insumos"
                      ? "Insumos de Almacén"
                      : mobileView === "panel-calendar"
                        ? "Configuración mensual"
                        : mobileView === "panel-admin-export"
                          ? "Consolidados PERC"
                          : mobileView === "panel-capture-toggle"
                            ? "Habilitar tableros"
                            : ""}
              </span>
            </div>

            {/* Selector de tabuladores del servicio — SOLO movil. Muestra solo los
                que el servicio reporta (PERC / SEPS / Horas) para poder cambiar. */}
            {currentService &&
            (mobileView === "panel-tabulator" ||
              mobileView === "panel-seps" ||
              mobileView === "panel-horas")
              ? (() => {
                  const hasPerc =
                    showModule("perc") &&
                    (currentService.rows.length > 0 ||
                      !!getPercServFields(currentService.id));
                  const hasSeps = showModule("sesps") && !!sepsTemplate;
                  const hasHoras =
                    showModule("distribucion") &&
                    !!getHorasTemplate(currentService.id);
                  const tabs = [
                    hasPerc ? { id: "panel-tabulator", label: "PERC" } : null,
                    hasSeps ? { id: "panel-seps", label: "SEPS" } : null,
                    hasHoras ? { id: "panel-horas", label: "Horas" } : null,
                  ].filter(Boolean) as { id: string; label: string }[];
                  if (tabs.length < 2) return null;
                  return (
                    <div className="flex gap-1.5 rounded-2xl border border-white/10 bg-[#1b2537] p-1.5 xl:hidden">
                      {tabs.map((t) => {
                        const active = mobileView === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setMobileView(t.id)}
                            className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                              active
                                ? "bg-cyan-500 text-slate-950"
                                : "text-slate-300 hover:bg-white/5"
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()
              : null}

            <section
              id="panel-overview"
              className={`hidden rounded-2xl px-5 py-3.5 shadow-[0_24px_80px_rgba(3,7,18,0.45)] xl:block ${
                isLightPanelTheme
                  ? "border border-slate-200 bg-white text-slate-900"
                  : "border border-white/10 bg-[#202c41]"
              }`}
            >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-10 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-cyan-400 to-blue-500" />
                <div className="min-w-0">
                  <h1 className={`truncate text-lg font-bold tracking-tight sm:text-xl ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>
                    {currentService
                      ? currentService.name
                      : isSupervisor
                        ? "Panel de Supervisión"
                        : "Módulo de Administración"}
                  </h1>
                  {currentService ? (
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-400">
                      Período de {periodLabel}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Fecha y hora en vivo, en una tarjeta con icono. */}
                <div
                  className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-2 ${
                    isLightPanelTheme ? "bg-slate-100" : "bg-[#1b2537]"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </span>
                  <div className="leading-tight">
                    <p className={`text-sm font-semibold first-letter:uppercase ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>
                      <time suppressHydrationWarning>{HEADER_DATE_FORMATTER.format(now)}</time>
                    </p>
                    <p className="text-xs font-medium text-cyan-300">
                      <time suppressHydrationWarning>{HEADER_TIME_FORMATTER.format(now)}</time>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className={`group inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                    isLightPanelTheme
                      ? "border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200"
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  Cerrar sesión
                </button>
              </div>
            </div>
            </section>

            <div className="hidden xl:block">{moduleSections}</div>

          {/* Toasts sutiles (esquina) para exito/error. Se desvanecen solos. */}
          {error || message ? (
            <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-full max-w-xs flex-col gap-2">
              {error ? (
                <div className="modal-pop-in pointer-events-auto flex items-start gap-2 rounded-xl border border-rose-400/30 bg-[#241016]/95 px-4 py-3 text-sm text-rose-100 shadow-xl backdrop-blur">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError("")}
                    className="shrink-0 text-rose-300/70 transition hover:text-rose-100"
                  >
                    ✕
                  </button>
                </div>
              ) : null}
              {message ? (
                <div className="modal-pop-in pointer-events-auto flex items-start gap-2 rounded-xl border border-emerald-400/30 bg-[#0f1f1a]/95 px-4 py-3 text-sm text-emerald-100 shadow-xl backdrop-blur">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                  <span className="flex-1">{message}</span>
                  <button
                    type="button"
                    onClick={() => setMessage("")}
                    className="shrink-0 text-emerald-300/70 transition hover:text-emerald-100"
                  >
                    ✕
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {adminCalendarSection ? (
            <div data-view="panel-calendar">{adminCalendarSection}</div>
          ) : null}

          {captureToggleSection ? (
            <div data-view="panel-capture-toggle">{captureToggleSection}</div>
          ) : null}

          {isAdmin || isSupervisor ? (
            <section id="panel-services" data-view="panel-services" className={`relative z-20 rounded-[24px] border border-amber-400/45 p-5 ring-1 ring-amber-400/10 ${
              isLightPanelTheme
                ? "bg-white text-slate-900 shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_18px_50px_rgba(15,23,42,0.10)]"
                : "bg-gradient-to-br from-[#232f46] to-[#1a2334] text-slate-100 shadow-[0_0_0_1px_rgba(251,191,36,0.15),0_24px_80px_rgba(3,7,18,0.45)]"
            }`}>
              {/* Encabezado elegante */}
              <div className={`mb-5 flex items-center gap-3.5 border-b pb-4 ${isLightPanelTheme ? "border-slate-200" : "border-white/[0.08]"}`}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${
                  isLightPanelTheme
                    ? "bg-amber-400/15 text-amber-600 ring-amber-400/30"
                    : "bg-gradient-to-br from-amber-400/30 to-amber-500/5 text-amber-200 ring-amber-400/20"
                }`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 9.5h18M9 9.5V20" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className={`hidden text-[11px] font-semibold uppercase tracking-[0.22em] sm:block ${isLightPanelTheme ? "text-amber-600/80" : "text-amber-200/70"}`}>
                    {isAdmin ? "Panel de administración" : "Panel de supervisión"}
                  </p>
                  <h2 className={`mt-0.5 truncate text-lg font-semibold tracking-tight sm:text-2xl ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>
                    {isAdmin ? "Ver tabuladores por servicio" : "Consolidado por servicio"}
                  </h2>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-start sm:gap-6">
                <h2 className={`hidden text-sm font-semibold uppercase tracking-wide sm:block ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>Elegir servicio</h2>
                <div className="relative w-full sm:max-w-sm sm:shrink-0">
                  {/* Trigger */}
                  <button
                    type="button"
                    onClick={() => setAdminServicePickerOpen((prev) => !prev)}
                    aria-haspopup="listbox"
                    aria-expanded={adminServicePickerOpen}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition focus:outline-none ${
                      isLightPanelTheme ? "bg-slate-50" : "bg-[#2a3448]"
                    } ${
                      adminServicePickerOpen
                        ? "border-amber-400/70 shadow-[0_0_0_3px_rgba(251,191,36,0.12)]"
                        : isLightPanelTheme
                          ? "border-slate-200 hover:border-slate-300"
                          : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        currentService
                          ? "bg-gradient-to-br from-amber-400/25 to-amber-500/10 text-amber-200"
                          : "bg-white/5 text-slate-400"
                      }`}
                    >
                      {currentService ? getDepIcon(currentService.name) : (
                        <svg {...DEP_ICON_PROPS} aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.2-3.2" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {currentService ? "Servicio seleccionado" : "Sin seleccionar"}
                      </span>
                      <span className={`block truncate text-sm font-semibold ${currentService ? (isLightPanelTheme ? "text-slate-900" : "text-white") : "text-slate-400"}`}>
                        {currentService ? currentService.name : "Selecciona un servicio…"}
                      </span>
                    </span>
                    <svg
                      aria-hidden
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`shrink-0 text-slate-400 transition-transform ${adminServicePickerOpen ? "rotate-180" : ""}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {/* Panel */}
                  {adminServicePickerOpen ? (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => {
                          setAdminServicePickerOpen(false);
                          setAdminPickerGroup(null);
                        }}
                      />
                      <div className="modal-pop-in absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#1b2537] shadow-[0_24px_80px_rgba(3,7,18,0.55)]">
                        <div className="border-b border-white/5 p-2">
                          <div className="flex items-center gap-2 rounded-xl bg-[#0e1626] px-3 py-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500" aria-hidden>
                              <circle cx="11" cy="11" r="7" />
                              <path d="m20 20-3.2-3.2" />
                            </svg>
                            <input
                              autoFocus
                              value={adminServiceQuery}
                              onChange={(event) => setAdminServiceQuery(event.target.value)}
                              placeholder="Buscar servicio…"
                              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                            />
                          </div>
                        </div>
                        <div className="max-h-[25.5rem] overflow-y-auto p-1.5">
                          {/* Opcion para deseleccionar y dejar la pantalla contraida. */}
                          <button
                            type="button"
                            onClick={() => {
                              void handleAdminSelectService("");
                              setAdminServicePickerOpen(false);
                              setAdminServiceQuery("");
                              setAdminPickerGroup(null);
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                              adminSelectedServiceId === "" ? "bg-amber-400/10" : "hover:bg-white/5"
                            }`}
                          >
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                adminSelectedServiceId === "" ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-slate-400"
                              }`}
                            >
                              <svg {...DEP_ICON_PROPS} aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M8 12h8" />
                              </svg>
                            </span>
                            <span className={`min-w-0 flex-1 truncate text-sm ${adminSelectedServiceId === "" ? "font-semibold text-amber-100" : "text-slate-300"}`}>
                              Sin servicio
                            </span>
                            {adminSelectedServiceId === "" ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-amber-300" aria-hidden>
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            ) : null}
                          </button>
                          {(() => {
                            const q = adminServiceQuery.trim();
                            const renderServiceBtn = (service: ServiceDefinition) => {
                              const selected = service.id === adminSelectedServiceId;
                              return (
                                <button
                                  key={service.id}
                                  type="button"
                                  onClick={() => {
                                    void handleAdminSelectService(service.id);
                                    setAdminServicePickerOpen(false);
                                    setAdminServiceQuery("");
                                    setAdminPickerGroup(null);
                                    // En movil, ir al tabulador que el servicio reporta:
                                    // PERC si lo tiene; si no, Horas; si no, Inicio.
                                    if (
                                      typeof window !== "undefined" &&
                                      window.innerWidth < 1280
                                    ) {
                                      const hasPerc =
                                        service.rows.length > 0 ||
                                        !!getPercServFields(service.id);
                                      setMobileView(
                                        hasPerc
                                          ? "panel-tabulator"
                                          : getHorasTemplate(service.id)
                                            ? "panel-horas"
                                            : "home",
                                      );
                                    }
                                  }}
                                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                                    selected ? "bg-amber-400/10" : "hover:bg-white/5"
                                  }`}
                                >
                                  <span
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                      selected ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-slate-300"
                                    }`}
                                  >
                                    {getDepIcon(service.name)}
                                  </span>
                                  <span className={`min-w-0 flex-1 truncate text-sm ${selected ? "font-semibold text-amber-100" : "text-slate-200"}`}>
                                    {service.name}
                                  </span>
                                  {selected ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-amber-300" aria-hidden>
                                      <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                  ) : null}
                                </button>
                              );
                            };

                            // 1) Modo busqueda: lista plana con TODOS los servicios que
                            // coinciden (se ignora la agrupacion por division).
                            if (q) {
                              return adminServiceOptions.length === 0 ? (
                                <p className="px-3 py-6 text-center text-sm text-slate-400">
                                  Ningún servicio coincide.
                                </p>
                              ) : (
                                adminServiceOptions.map(renderServiceBtn)
                              );
                            }

                            // 2) Detalle de una division: boton "volver" + sus servicios.
                            if (adminPickerGroup) {
                              const group = adminServiceGroups.find(
                                (g) => g.id === adminPickerGroup,
                              );
                              if (!group) return null;
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setAdminPickerGroup(null)}
                                    className="mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-slate-300 transition hover:bg-white/5"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400" aria-hidden>
                                      <path d="m15 18-6-6 6-6" />
                                    </svg>
                                    <span className="font-semibold">{group.title}</span>
                                    <span className="ml-auto text-xs text-slate-500">
                                      {group.services.length}
                                    </span>
                                  </button>
                                  {group.services.map(renderServiceBtn)}
                                </>
                              );
                            }

                            // 3) Primer nivel: las divisiones (Direccion, Medica, Apoyo,
                            // Subdireccion Administrativa, y Enfermeria si tiene servicios).
                            return adminServiceGroups.map((group) => {
                              const active = group.services.some(
                                (s) => s.id === adminSelectedServiceId,
                              );
                              return (
                                <button
                                  key={group.id}
                                  type="button"
                                  onClick={() => setAdminPickerGroup(group.id)}
                                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                                    active ? "bg-amber-400/10" : "hover:bg-white/5"
                                  }`}
                                >
                                  <span
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                      active ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-slate-300"
                                    }`}
                                  >
                                    <svg {...DEP_ICON_PROPS} aria-hidden="true">
                                      <rect x="3" y="4" width="18" height="16" rx="2" />
                                      <path d="M3 10h18" />
                                    </svg>
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className={`block truncate text-sm ${active ? "font-semibold text-amber-100" : "font-medium text-slate-200"}`}>
                                      {group.title}
                                    </span>
                                    <span className="block text-[11px] text-slate-500">
                                      {group.services.length} servicio{group.services.length === 1 ? "" : "s"}
                                    </span>
                                  </span>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400" aria-hidden>
                                    <path d="m9 18 6-6-6-6" />
                                  </svg>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
              <p className={`mt-4 hidden text-sm sm:block ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
                {isAdmin
                  ? "Selecciona un servicio para ver y editar sus tabuladores (PERC, SEPS y Horas) y su historial por mes."
                  : "Selecciona un servicio para ver lo que cargó en los tableros que supervisás (solo lectura)."}
              </p>
            </section>
          ) : null}

          {isAdmin ? (
            <section
              id="panel-admin-export"
              data-view="panel-admin-export"
              className={`rounded-[24px] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)] ${
                isLightPanelTheme
                  ? "border border-slate-200 bg-white text-slate-900"
                  : "border border-cyan-400/20 bg-[#202c41]"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className={`text-sm uppercase tracking-[0.2em] ${isLightPanelTheme ? "text-sky-700" : "text-cyan-200/80"}`}>
                    Exportacion mensual
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Descargar consolidado en Excel</h2>
                  <p className={`mt-2 text-sm ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
                    Descarga el archivo consolidado del periodo {periodLabel} cuando lo necesites,
                    incluso si aun faltan dependencias por completar su captura.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                    Avance por módulo
                  </p>
                  <div className="mt-4 space-y-5">
                    {(
                      [
                        { key: "PERC", label: "PERC", color: "text-cyan-300", bar: "from-cyan-400 to-cyan-500" },
                        { key: "SEPS", label: "SEPS (monitoreo)", color: "text-blue-300", bar: "from-blue-400 to-blue-500" },
                        { key: "Horas", label: "Distribución de Horas", color: "text-amber-300", bar: "from-amber-400 to-amber-500" },
                      ] as const
                    ).map((m) => {
                      const stat = moduleStats[m.key];
                      const pct = stat.total > 0 ? Math.round((stat.done / stat.total) * 100) : 0;
                      return (
                        <div key={m.key}>
                          <div className="flex items-center justify-between text-sm">
                            <span className={`font-semibold ${m.color}`}>{m.label}</span>
                            <span className="font-bold text-white">
                              {stat.done} de {stat.total}
                            </span>
                          </div>
                          <div className="mt-2 h-4 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${m.bar}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-400">
                    SEPS es solo monitoreo (no descarga Excel). Se descargan PERC y, más adelante, Horas.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Descargas</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Consolidados del periodo {periodLabel}</h3>
                  <p className="mt-2 text-sm text-slate-300">
                    Dos archivos separados: <strong>Producción Distribuida</strong> (centros de costo) y{" "}
                    <strong>Producción de Servicio</strong> (plantilla completa por centro de producción).
                  </p>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => void handleExportMonthlyReport()}
                      disabled={isExportingMonthlyReport}
                      className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-300"
                    >
                      {isExportingMonthlyReport ? "Generando..." : "Producción Distribuida"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportServiceProduction()}
                      disabled={isExportingServiceProduction}
                      className="rounded-2xl border border-cyan-400/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isExportingServiceProduction ? "Generando..." : "Producción de Servicio"}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-300">
                    Cada archivo sale con los datos disponibles al momento de la descarga.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {currentService &&
          showModule("perc") &&
          (currentService.rows.length > 0 || getPercServFields(currentService.id)) ? (
            <>
            {renderSectionDivider("PERC", "Productividad por centros de costo", "cyan", isLightPanelTheme)}
            <section
              id="panel-tabulator"
              data-view="panel-tabulator"
              className={`overflow-hidden rounded-[24px] border border-cyan-400/20 shadow-[0_24px_80px_rgba(3,7,18,0.35)] ${isLightPanelTheme ? "bg-white" : "bg-[#202c41]"}`}
            >
              <div className={`border-b px-5 py-4 ${isLightPanelTheme ? "border-slate-200 bg-slate-50" : "border-white/10 bg-[#1b2537]"}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-200/80">
                      Tabulador · {getPercServFields(currentService.id) ? "PERC/SERV" : "PERC"}
                    </p>
                    <h2 className={`mt-1 text-2xl font-bold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>
                      {getPercServFields(currentService.id) ? "PERC/SERV" : "PERC"}
                    </h2>
                    <p className={`mt-1 text-sm ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
                      {getPercServFields(currentService.id)
                        ? "Productividad por servicio"
                        : "Captura mensual por centro de costos"}{" "}
                      — {currentService.name} · {getPeriodLabel(activePercPeriod)}
                    </p>
                  </div>

                  {/* Selector de mes (historial). Mes actual = captura; meses previos = consulta. */}
                  <div className="shrink-0">
                    {renderHistorySelector({
                      options: percHistoryOptions,
                      currentPeriod: periodId,
                      activePeriod: activePercPeriod,
                      isHistory: isPercHistory,
                      readOnly: percReadOnly,
                      dataPeriods: percDataPeriods,
                      loading: isLoadingData,
                      onSelect: (period) => void loadPercHistory(period),
                    })}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      isFormLocked
                        ? "bg-rose-500/15 text-rose-200"
                        : "bg-emerald-500/15 text-emerald-200"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isFormLocked ? "bg-rose-400" : "bg-emerald-400"
                      }`}
                    />
                    {isFormLocked ? "Bloqueado" : "Habilitado"}
                  </span>
                  <span className={`text-xs ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                    {!serviceProfile.permissions.canEdit
                      ? "El administrador desactivo temporalmente tu permiso de captura."
                      : isDateLocked
                        ? `Captura solo en los primeros ${captureWindow.totalDays} dias habiles. Ultimo: ${SHORT_DATE_FORMATTER.format(captureWindow.lastOpenDay)}.`
                        : isReopenedLate
                          ? "Reabierta por un supervisor: podes registrar fuera de tus dias habiles."
                          : `Dia habil ${captureWindow.activeDayNumber} de ${captureWindow.totalDays}.`}
                  </span>
                </div>
              </div>
              {getPercServFields(currentService.id) ? (
                <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
                  {getPercServFields(currentService.id)!.map((field) => (
                    <label key={field.key} className="block">
                      <span className={`text-sm font-medium ${isLightPanelTheme ? "text-slate-700" : "text-slate-200"}`}>{field.label}</span>
                      <input
                        value={tableValues[PERC_SERV_ROW]?.[field.key] ?? ""}
                        onChange={(event) =>
                          handleCellChange(PERC_SERV_ROW, field.key, event.target.value)
                        }
                        disabled={percEditingBlocked}
                        inputMode="numeric"
                        placeholder={field.placeholder}
                        className={`mt-2 w-full rounded-2xl border px-3 py-3 text-sm outline-none transition focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 ${isLightPanelTheme ? "border-slate-300 bg-white text-slate-900" : "border-white/10 bg-[#2a3448] text-white"}`}
                      />
                    </label>
                  ))}
                </div>
              ) : (
              <>
              <div className="show-scrollbar hidden overflow-x-auto xl:block">
                <table className={`min-w-full border-collapse text-xs ${isLightPanelTheme ? "text-slate-800" : "text-slate-100"}`}>
                  <thead>
                    <tr className={`text-left ${isLightPanelTheme ? "bg-slate-100" : "bg-[#1a2334]"}`}>
                      <th className={`sticky left-0 z-20 min-w-[210px] border-b px-3 py-3 font-semibold uppercase tracking-wide ${isLightPanelTheme ? "border-slate-200 bg-slate-100" : "border-white/10 bg-[#1a2334]"}`}>
                        Centro de costos
                      </th>
                      {TABULATOR_HEADERS.map((header) => (
                        <th
                          key={header}
                          className={`min-w-[118px] border-b border-l px-2 py-2 align-top text-[11px] font-semibold leading-4 ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}
                        >
                          {header}
                        </th>
                      ))}
                      {canManagePercRows ? <th className="border-b px-1 py-2" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {percEffectiveRows.map((effRow) => {
                      const row = effRow.key;
                      const rowIsFixed = isFixedRow(row);
                      const fixedValues = getFixedValuesForRow(row);

                      return (
                      <tr key={row} className={`${effRow.isExtra ? (isLightPanelTheme ? "bg-emerald-50/60" : "bg-emerald-500/[0.06]") : isLightPanelTheme ? "odd:bg-white even:bg-slate-50" : "odd:bg-white/[0.02] even:bg-white/[0.05]"}`}>
                        <th className={`sticky left-0 z-10 border-r px-3 py-3 text-left text-[11px] font-semibold leading-4 ${isLightPanelTheme ? "border-slate-200 bg-slate-100 text-slate-800" : "border-white/10 bg-[#3a465d] text-slate-100"}`}>
                          {effRow.isExtra && canManagePercRows ? (
                            <input
                              value={effRow.label}
                              onChange={(event) => handleRenamePercRow(row, event.target.value)}
                              placeholder="Nombre de la fila"
                              className={`w-full min-w-[150px] rounded border px-2 py-1 text-[11px] font-semibold outline-none focus:border-emerald-400 ${isLightPanelTheme ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-[#16212c] text-white"}`}
                            />
                          ) : (
                            <>
                              {effRow.label}
                              {rowIsFixed ? (
                                <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                                  Fijo
                                </span>
                              ) : null}
                            </>
                          )}
                        </th>
                        {TABULATOR_HEADERS.map((header) => {
                          const isSelf = percBlockedHeaders.has(header);
                          return (
                          <td key={`${row}-${header}`} className={`border-l px-1 py-1 ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
                            <input
                              value={
                                isSelf
                                  ? ""
                                  : rowIsFixed
                                    ? fixedValues?.[header] ?? ""
                                    : tableValues[row]?.[header] || ""
                              }
                              onChange={(event) =>
                                handleCellChange(row, header, event.target.value)
                              }
                              disabled={percEditingBlocked || rowIsFixed || isSelf}
                              readOnly={rowIsFixed || isSelf}
                              title={
                                isSelf
                                  ? "El servicio no se reporta a si mismo"
                                  : rowIsFixed
                                    ? "Valor fijo (automatico, no editable)"
                                    : undefined
                              }
                              inputMode="numeric"
                              className={`w-full rounded-lg border px-2 py-2 text-center text-xs outline-none transition placeholder:text-slate-500 focus:border-blue-400 disabled:cursor-not-allowed ${isLightPanelTheme ? "border-slate-300 bg-white text-slate-900 focus:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500" : "border-white/5 bg-[#2a3448] text-slate-100 focus:bg-[#313d54] disabled:bg-[#253145] disabled:text-slate-400"}`}
                              placeholder={isSelf ? "—" : "0"}
                              type="text"
                            />
                          </td>
                          );
                        })}
                        {canManagePercRows ? (
                          <td className={`whitespace-nowrap border-l px-1 py-1 text-center ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
                            <button
                              type="button"
                              onClick={() => handleAddPercRow(row)}
                              title="Agregar una fila debajo"
                              aria-label="Agregar una fila debajo"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-emerald-500/10 hover:text-emerald-300"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePercRow(row, effRow.isExtra, effRow.label)}
                              title={effRow.isExtra ? "Quitar esta fila" : "Ocultar esta fila oficial"}
                              aria-label={effRow.isExtra ? "Quitar esta fila" : "Ocultar esta fila oficial"}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                            </button>
                          </td>
                        ) : null}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Tabulador PERC en TARJETAS verticales — SOLO movil (una por centro de costo). */}
              <div className="xl:hidden">
                {/* Selector "Ir a centro de costo" — abre SOLO la tabla elegida. */}
                <div className={`border-b px-4 py-3 ${isLightPanelTheme ? "border-slate-200 bg-white" : "border-white/10 bg-[#202c41]"}`}>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPercGoToOpen((v) => !v)}
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left transition ${isLightPanelTheme ? "bg-slate-50" : "bg-[#1b2537]"} ${
                        percGoToOpen
                          ? "border-cyan-400/60 shadow-[0_0_0_3px_rgba(34,211,238,0.12)]"
                          : isLightPanelTheme ? "border-slate-200" : "border-white/10"
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/25 to-blue-600/20 text-cyan-200 [&_svg]:h-[18px] [&_svg]:w-[18px]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.2-3.2" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[11px] font-semibold uppercase tracking-wide ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                          Ir a centro de costo
                        </span>
                        <span className={`block truncate text-sm font-semibold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>
                          {percOpenCard !== null
                            ? TABULATOR_HEADERS[percOpenCard]
                            : "Elegí un centro…"}
                        </span>
                      </span>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`shrink-0 transition-transform ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"} ${percGoToOpen ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {percGoToOpen ? (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setPercGoToOpen(false)}
                        />
                        <div className={`modal-pop-in absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-2xl border shadow-[0_24px_80px_rgba(3,7,18,0.55)] ${isLightPanelTheme ? "border-slate-200 bg-white" : "border-white/10 bg-[#1b2537]"}`}>
                          <div className={`border-b p-2 ${isLightPanelTheme ? "border-slate-200" : "border-white/5"}`}>
                            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${isLightPanelTheme ? "bg-slate-100" : "bg-[#0e1626]"}`}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500" aria-hidden="true">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m20 20-3.2-3.2" />
                              </svg>
                              <input
                                autoFocus
                                value={percGoToQuery}
                                onChange={(event) => setPercGoToQuery(event.target.value)}
                                placeholder="Buscar centro…"
                                className={`w-full bg-transparent text-sm outline-none placeholder:text-slate-500 ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}
                              />
                            </div>
                          </div>
                          <div className="max-h-72 overflow-y-auto p-1.5">
                            {TABULATOR_HEADERS.map((header, i) => ({ header, i }))
                              .filter(({ header }) =>
                                header
                                  .toLowerCase()
                                  .includes(percGoToQuery.trim().toLowerCase()),
                              )
                              .map(({ header, i }) => (
                                <button
                                  key={header}
                                  type="button"
                                  onClick={() => {
                                    setPercOpenCard(i);
                                    setPercVisibleCount((c) => Math.max(c, i + 1));
                                    setPercGoToOpen(false);
                                    setPercGoToQuery("");
                                    window.setTimeout(() => {
                                      document
                                        .getElementById(`pcc-${i}`)
                                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                                    }, 60);
                                  }}
                                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                                    percOpenCard === i ? "bg-cyan-400/10" : isLightPanelTheme ? "hover:bg-slate-100" : "hover:bg-white/5"
                                  }`}
                                >
                                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-cyan-200 ${isLightPanelTheme ? "bg-slate-100" : "bg-white/5"}`}>
                                    {header.split("-")[0]}
                                  </span>
                                  <span
                                    className={`min-w-0 flex-1 truncate text-sm ${
                                      percOpenCard === i ? "font-semibold text-cyan-100" : isLightPanelTheme ? "text-slate-700" : "text-slate-200"
                                    }`}
                                  >
                                    {header.replace(/^\d+-/, "")}
                                  </span>
                                </button>
                              ))}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* Tarjetas acordeon: todas contraidas, se muestran de 5 en 5. */}
                <div className="space-y-2.5 p-4">
                  {TABULATOR_HEADERS.map((header, i) => {
                    if (i >= percVisibleCount) return null;
                    const isSelf = percBlockedHeaders.has(header);
                    const open = percOpenCard === i;
                    return (
                      <div
                        id={`pcc-${i}`}
                        key={header}
                        className={`scroll-mt-4 overflow-hidden rounded-2xl border ${isLightPanelTheme ? "border-slate-200 bg-slate-50" : "border-white/10 bg-[#1b2537]"}`}
                      >
                        <button
                          type="button"
                          onClick={() => setPercOpenCard(open ? null : i)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm font-semibold ${
                                isSelf ? "text-rose-400" : "text-cyan-200"
                              }`}
                            >
                              {header}
                            </span>
                            {isSelf ? (
                              <span className="mt-0.5 block text-[10px] font-medium text-rose-400/80">
                                {header === percSelfHeader
                                  ? "No se reporta a sí mismo · no editable"
                                  : "Producto no editable"}
                              </span>
                            ) : null}
                          </span>
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`shrink-0 transition-transform ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"} ${open ? "rotate-180" : ""}`}
                            aria-hidden="true"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                        {open ? (
                          <div className={`space-y-2.5 border-t px-4 py-3 ${isLightPanelTheme ? "border-slate-200" : "border-white/10"}`}>
                            {percEffectiveRows.map((effRow) => {
                              const row = effRow.key;
                              const rowIsFixed = isFixedRow(row);
                              const fixedValues = getFixedValuesForRow(row);
                              return (
                                <label
                                  key={`${header}-${row}`}
                                  className="flex items-center justify-between gap-3"
                                >
                                  <span className={`min-w-0 flex-1 text-xs leading-tight ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
                                    {effRow.label}
                                    {rowIsFixed ? (
                                      <span className="ml-1.5 inline-block rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                                        Fijo
                                      </span>
                                    ) : null}
                                  </span>
                                  <input
                                    value={
                                      isSelf
                                        ? ""
                                        : rowIsFixed
                                          ? fixedValues?.[header] ?? ""
                                          : tableValues[row]?.[header] || ""
                                    }
                                    onChange={(event) =>
                                      handleCellChange(row, header, event.target.value)
                                    }
                                    disabled={percEditingBlocked || rowIsFixed || isSelf}
                                    readOnly={rowIsFixed || isSelf}
                                    title={isSelf ? "El servicio no se reporta a si mismo" : undefined}
                                    inputMode="numeric"
                                    type="text"
                                    placeholder={isSelf ? "—" : "0"}
                                    className={`w-24 shrink-0 rounded-lg border px-2 py-2.5 text-center text-sm outline-none transition placeholder:text-slate-500 focus:border-blue-400 disabled:cursor-not-allowed ${isLightPanelTheme ? "border-slate-300 bg-white text-slate-900 focus:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500" : "border-white/10 bg-[#2a3448] text-slate-100 focus:bg-[#313d54] disabled:bg-[#253145] disabled:text-slate-400"}`}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {percVisibleCount < TABULATOR_HEADERS.length ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPercVisibleCount((c) => Math.min(c + 5, TABULATOR_HEADERS.length))
                      }
                      className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-cyan-200 transition ${isLightPanelTheme ? "border-slate-200 bg-slate-100 active:bg-slate-200" : "border-white/10 bg-white/5 active:bg-white/10"}`}
                    >
                      Ver 5 más ({TABULATOR_HEADERS.length - percVisibleCount} restantes)
                    </button>
                  ) : null}
                </div>
              </div>
              </>
              )}

              {canManagePercRows && percHiddenKeys.length > 0 ? (
                <div className={`mx-5 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] ${isLightPanelTheme ? "border-amber-200 bg-amber-50/70 text-amber-800" : "border-amber-400/20 bg-amber-400/5 text-amber-200"}`}>
                  <span>Hay {percHiddenKeys.length} fila(s) oficial(es) oculta(s). Sus datos siguen guardados.</span>
                  <button
                    type="button"
                    onClick={handleRestorePercRows}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${isLightPanelTheme ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-amber-400/15 text-amber-100 hover:bg-amber-400/25"}`}
                  >
                    Restaurar filas ocultas
                  </button>
                </div>
              ) : null}

              {/* Acciones del tabulador PERC. En historial cambia segun el rol. */}
              <div className={`flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${isLightPanelTheme ? "border-slate-200 bg-slate-50" : "border-white/10 bg-[#1b2537]"}`}>
                <div>
                  {isPercHistory ? (
                    <button
                      type="button"
                      onClick={() => void loadPercHistory(periodId)}
                      disabled={isLoadingData}
                      className="rounded-2xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
                    >
                      ← Volver al mes actual
                    </button>
                  ) : null}
                </div>

                {percReadOnly ? (
                  <p className="text-sm font-medium text-amber-200">
                    Vista de historial — solo lectura.
                  </p>
                ) : (
                  <div className="flex flex-row flex-wrap items-center justify-end gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={handleClearTable}
                      title="Limpiar tabla"
                      aria-label="Limpiar tabla"
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-600 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-500 xl:px-4"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 xl:h-3.5 xl:w-3.5" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                      </svg>
                      <span className="hidden xl:inline">Limpiar tabla</span>
                    </button>
                    {!isPercHistory ? (
                      <button
                        type="button"
                        onClick={() => void loadSavedData(true)}
                        disabled={isLoadingData}
                        title="Recuperar datos"
                        aria-label="Recuperar datos"
                        className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-900/70 xl:px-4"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 xl:h-3.5 xl:w-3.5" aria-hidden="true">
                          <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
                        </svg>
                        <span className="hidden xl:inline">
                          {isLoadingData ? "Recuperando..." : "Recuperar datos"}
                        </span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving || percEditingBlocked}
                      title="Guardar datos"
                      aria-label="Guardar datos"
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800/80 xl:px-4"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 xl:h-3.5 xl:w-3.5" aria-hidden="true">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <path d="M17 21v-8H7v8M7 3v5h8" />
                      </svg>
                      <span className="hidden xl:inline">
                        {isSaving
                          ? "Guardando..."
                          : isPercHistory
                            ? "Guardar cambios del mes"
                            : "Guardar datos"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </section>
            </>
          ) : null}

          {showModule("sesps") && sepsSection ? (
            <>
            {renderSectionDivider("SEPS", "Captura estadística", "violet", isLightPanelTheme)}
            <div data-view="panel-seps">{sepsSection}</div>
            </>
          ) : null}

          {showModule("distribucion") && horasSection ? (
            <>
            {renderSectionDivider("Dis/horas", "Reparto de horas del personal", "amber", isLightPanelTheme)}
            <div data-view="panel-horas">{horasSection}</div>
            </>
          ) : null}

          {/* Censo Diario de Pacientes: solo admin/supervisores (ningun servicio) y
              SOLO cuando se elige en el submenu (desktop: seccion activa; movil:
              vista activa). Si no, no aparece. */}
          {canViewCenso &&
          (activeSidebarSection === "panel-censo" || mobileView === "panel-censo") ? (
            <>
            {renderSectionDivider("Censo diario", "Censo diario de pacientes (solo supervisión)", "teal", isLightPanelTheme)}
            <div data-view="panel-censo">{censoSection}</div>
            </>
          ) : null}

          {/* Insumos de Almacén: admin/supervisores + servicio Almacén, SOLO cuando se
              elige en el submenu bajo PERC (debajo del Censo). */}
          {canViewInsumos &&
          (activeSidebarSection === "panel-insumos" || mobileView === "panel-insumos") ? (
            <>
            {renderSectionDivider("Insumos de Almacén", "Costos de insumos por centro de costo", "indigo", isLightPanelTheme)}
            <div data-view="panel-insumos">{insumosSection}</div>
            </>
          ) : null}

          {/* Bandeja de aprobacion de REGISTROS (solo admins). */}
          {isAdmin && showSignupRequestsModal ? (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4"
              onClick={() => setShowSignupRequestsModal(false)}
            >
              <div className="modal-fade-in fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
              <div
                onClick={(event) => event.stopPropagation()}
                className="modal-pop-in relative my-6 w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0e1626] shadow-2xl shadow-black/50"
              >
                <div className="h-1 w-full bg-gradient-to-r from-teal-400 to-emerald-500" />
                <div className="px-5 pb-6 pt-5 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-300/90">
                        Solicitudes de registro
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-white">Nuevos jefes de servicio</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Aprobá para crear la cuenta (usuario por nombre, contraseña {CHIEF_TEMP_PASSWORD}).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSignupRequestsModal(false)}
                      aria-label="Cerrar"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-4 max-h-[60vh] space-y-2.5 overflow-y-auto pr-1">
                    {signupRequests.filter((r) => r.status === "pending").length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
                        No hay solicitudes pendientes.
                      </p>
                    ) : (
                      signupRequests
                        .filter((r) => r.status === "pending")
                        .map((r) => (
                          <div
                            key={r.id}
                            className="rounded-2xl border border-white/10 bg-[#1b2537] p-3.5"
                          >
                            <p className="text-sm font-semibold text-white">
                              {r.firstName} {r.lastName}
                            </p>
                            <p className="mt-0.5 text-xs text-cyan-200">{r.serviceName}</p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-400">{r.email}</p>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleApproveSignup(r)}
                                disabled={signupBusyId === r.id}
                                className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {signupBusyId === r.id ? "Creando…" : "Aceptar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRejectSignup(r)}
                                disabled={signupBusyId === r.id}
                                className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Rechazar
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {showPasswordModal ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="change-password-title"
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setShowPasswordModal(false)}
            >
              <div className="modal-fade-in absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />

              <div
                onClick={(event) => event.stopPropagation()}
                style={{ backgroundColor: "var(--surface, #181a1f)", borderColor: "var(--border, rgba(255,255,255,0.08))" }}
                className="modal-pop-in relative w-full max-w-lg overflow-hidden rounded-3xl border shadow-2xl shadow-black/50"
              >
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400" />

                <div className="px-7 pb-7 pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/90">
                        Seguridad
                      </p>
                      <h3 id="change-password-title" className="mt-1 text-xl font-semibold text-white">
                        Cambiar contraseña
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(false)}
                      aria-label="Cerrar"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                    >
                      ✕
                    </button>
                  </div>

                  {isAdmin ? (
                    <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-950/30 px-4 py-4 text-sm text-amber-50">
                      La cuenta de administrador usa credenciales fijas gestionadas fuera de la
                      aplicacion (variables de entorno). Para cambiarlas, actualiza el entorno y rota
                      la clave en Firebase.
                    </div>
                  ) : (
                    <form className="mt-5 space-y-4" onSubmit={handleChangePassword}>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-200">Nueva contraseña</span>
                        <div className="relative mt-2">
                          <input
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 pr-12 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-blue-500"
                            minLength={6}
                            placeholder="Minimo 6 caracteres"
                            type={showPasswordText ? "text" : "password"}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswordText((value) => !value)}
                            aria-label={showPasswordText ? "Ocultar contraseña" : "Mostrar contraseña"}
                            title={showPasswordText ? "Ocultar contraseña" : "Mostrar contraseña"}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                          >
                            {showPasswordText ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                                <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
                                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                                <line x1="2" y1="2" x2="22" y2="22" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-200">Confirmar contraseña</span>
                        <input
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-blue-500"
                          minLength={6}
                          placeholder="Repite la nueva clave"
                          type={showPasswordText ? "text" : "password"}
                        />
                      </label>

                      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setShowPasswordModal(false)}
                          className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isChangingPassword}
                          className="rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:from-blue-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isChangingPassword ? "Actualizando..." : "Cambiar clave"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {isAdmin && showUsersModal ? (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
              onClick={() => setShowUsersModal(false)}
            >
              <div className="modal-fade-in fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
              <section
                onClick={(event) => event.stopPropagation()}
                id="panel-users"
                className="modal-pop-in relative my-8 w-full max-w-6xl rounded-[24px] border border-white/10 bg-[#202c41] p-5 shadow-2xl shadow-black/50"
              >
                <button
                  type="button"
                  onClick={() => setShowUsersModal(false)}
                  aria-label="Cerrar"
                  className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                >
                  ✕
                </button>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-amber-200/80">
                    Administrador
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">
                    Usuarios y permisos
                    {isLoadingUsers ? (
                      <span className="ml-3 text-sm font-medium text-amber-300">Actualizando…</span>
                    ) : null}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-300">
                    Desde aqui puedes activar o bloquear cuentas, asignar servicios, cambiar roles,
                    permitir o negar captura y forzar cambio de contrasena mediante correo de
                    restablecimiento.
                  </p>
                </div>
                <p className="text-sm text-slate-300">Clave temporal inicial: {DEFAULT_TEMP_PASSWORD}</p>
              </div>

              <div className="mb-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <form
                  className="rounded-[24px] border border-white/10 bg-[#1b2537] p-5"
                  onSubmit={handleAdminCreateUser}
                >
                  <p className="text-sm uppercase tracking-[0.2em] text-emerald-200/80">
                    Nuevo usuario
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    Crear cuenta y asignar servicio
                  </h3>
                  <p className="mt-2 text-sm text-slate-300">
                    Captura los datos del responsable y elige un servicio disponible. Los servicios
                    en gris ya tienen usuario asignado.
                  </p>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-200">Nombres</span>
                      <input
                        value={adminCreateForm.firstName}
                        onChange={(event) => updateAdminCreateForm("firstName", event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                        placeholder="Nombres"
                        required
                        type="text"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-200">Apellidos</span>
                      <input
                        value={adminCreateForm.lastName}
                        onChange={(event) => updateAdminCreateForm("lastName", event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                        placeholder="Apellidos"
                        required
                        type="text"
                      />
                    </label>

                    <label className="block md:col-span-2">
                      <span className="text-sm font-medium text-slate-200">Correo de contacto</span>
                      <input
                        value={adminCreateForm.email}
                        onChange={(event) => updateAdminCreateForm("email", event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                        placeholder="correo@perc-hnes.app"
                        required
                        type="email"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-200">DUI</span>
                      <input
                        value={adminCreateForm.dui}
                        onChange={(event) => updateAdminCreateForm("dui", event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                        placeholder="00000000-0"
                        required
                        type="text"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-200">Telefono</span>
                      <input
                        value={adminCreateForm.phone}
                        onChange={(event) => updateAdminCreateForm("phone", event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                        placeholder="0000-0000"
                        required
                        type="text"
                      />
                    </label>

                    <label className="block md:col-span-2">
                      <span className="text-sm font-medium text-slate-200">Servicio</span>
                      <select
                        value={adminCreateForm.serviceId}
                        onChange={(event) => updateAdminCreateForm("serviceId", event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                        required
                      >
                        <option value="">Selecciona un servicio</option>
                        {SERVICE_DEFINITIONS.map((service) => {
                          const assignedUser = assignedServiceUsers.get(service.id);

                          return (
                            <option
                              key={service.id}
                              value={service.id}
                              disabled={Boolean(assignedUser)}
                            >
                              {assignedUser
                                ? `${service.name} - asignado a ${assignedUser.name}`
                                : service.name}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>

                  <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-950/20 px-4 py-4 text-sm text-emerald-100">
                    <p>
                      Usuario asignado: <strong>{selectedAdminCreateService ? getServiceUsername(selectedAdminCreateService.id) : "Selecciona un servicio"}</strong>
                    </p>
                    <p className="mt-1">
                      Contrasena temporal: <strong>{DEFAULT_TEMP_PASSWORD}</strong>
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={isCreatingManagedUser}
                      className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      {isCreatingManagedUser ? "Creando usuario..." : "Crear usuario"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAdminCreateForm({
                          firstName: "",
                          lastName: "",
                          email: "",
                          dui: "",
                          phone: "",
                          serviceId: "",
                        })
                      }
                      className="rounded-2xl border border-white/10 bg-transparent px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                    >
                      Limpiar formulario
                    </button>
                  </div>
                </form>

                <div className="rounded-[24px] border border-white/10 bg-[#1b2537] p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-amber-200/80">
                    Servicios
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Estado de asignacion</h3>
                  <p className="mt-2 text-sm text-slate-300">
                    Revisa rapido que servicios ya tienen cuenta y a quien estan asignados.
                  </p>

                  <div className="mt-5 grid max-h-[540px] gap-2 overflow-y-auto pr-1">
                    {SERVICE_DEFINITIONS.map((service) => {
                      const assignedUser = assignedServiceUsers.get(service.id);

                      return (
                        <article
                          key={service.id}
                          className={`rounded-2xl border px-4 py-3 ${
                            assignedUser
                              ? "border-white/10 bg-slate-500/20 text-slate-300"
                              : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-white">
                                <ServiceIcon serviceId={service.id} className="mr-1.5 inline h-4 w-4 shrink-0 align-[-3px] text-cyan-300/90" />
                                {service.name}
                              </h4>
                              <p className="mt-1 text-xs text-slate-300">
                                Usuario: {getServiceUsername(service.id)}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {assignedUser
                                  ? `${assignedUser.name} · ${assignedUser.email}`
                                  : "Disponible para crear cuenta"}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                assignedUser
                                  ? "bg-slate-200/10 text-slate-300"
                                  : "bg-emerald-300/20 text-emerald-100"
                              }`}
                            >
                              {assignedUser ? "Asignado" : "Disponible"}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>

              {(() => {
                const q = adminUserQuery.trim().toLowerCase();
                const listed = adminUsers.filter((u) => {
                  if (!q) return true;
                  const d = adminDrafts[u.uid];
                  const svcName = getServiceById(d?.serviceId)?.name || "";
                  return (
                    (d?.name || "").toLowerCase().includes(q) ||
                    (d?.username || "").toLowerCase().includes(q) ||
                    svcName.toLowerCase().includes(q)
                  );
                });
                const selectedUid =
                  adminSelectedUserUid && listed.some((u) => u.uid === adminSelectedUserUid)
                    ? adminSelectedUserUid
                    : listed[0]?.uid ?? null;
                const selectedUser = adminUsers.find((u) => u.uid === selectedUid) || null;
                const draft = selectedUser ? adminDrafts[selectedUser.uid] : null;
                const busy = selectedUser ? adminBusyUserId === selectedUser.uid : false;
                const initials = (s: string) =>
                  (s || "?")
                    .split(" ")
                    .map((w) => w.charAt(0))
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "?";

                return (
                  <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                    {/* Lista (maestro) */}
                    <div className="flex flex-col rounded-2xl border border-white/10 bg-[#1b2537]">
                      <div className="border-b border-white/10 p-2.5">
                        <input
                          value={adminUserQuery}
                          onChange={(event) => setAdminUserQuery(event.target.value)}
                          placeholder="Buscar usuario o servicio…"
                          className="w-full rounded-xl border border-white/10 bg-[#2a3448] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
                        />
                      </div>
                      <div className="max-h-[55vh] overflow-y-auto p-1.5">
                        {listed.length === 0 ? (
                          <p className="px-3 py-6 text-center text-sm text-slate-400">
                            Sin resultados.
                          </p>
                        ) : (
                          listed.map((u) => {
                            const d = adminDrafts[u.uid];
                            if (!d) return null;
                            const isSel = u.uid === selectedUid;
                            return (
                              <button
                                key={u.uid}
                                type="button"
                                onClick={() => setAdminSelectedUserUid(u.uid)}
                                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                                  isSel ? "bg-amber-500/15" : "hover:bg-white/5"
                                }`}
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[11px] font-bold text-slate-200">
                                  {initials(d.name || d.username)}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-white">
                                    {d.name}
                                  </span>
                                  <span className="block truncate text-[11px] text-slate-400">
                                    {getServiceById(d.serviceId) ? (
                                      <>
                                        <ServiceIcon
                                          serviceId={d.serviceId}
                                          className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-cyan-300/90"
                                        />
                                        {getServiceById(d.serviceId)?.name}
                                      </>
                                    ) : d.role === "admin" ? (
                                      "Administrador"
                                    ) : (
                                      "Sin servicio"
                                    )}
                                  </span>
                                </span>
                                <span
                                  className={`h-2 w-2 shrink-0 rounded-full ${
                                    d.isActive ? "bg-emerald-400" : "bg-slate-600"
                                  }`}
                                />
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Detalle / edicion */}
                    {draft && selectedUser ? (
                      <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-5">
                        <div className="flex items-start gap-3 border-b border-white/10 pb-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-base font-bold text-amber-200">
                            {initials(draft.name || draft.username)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-lg font-semibold text-white">{draft.name}</p>
                            <p className="truncate font-mono text-xs text-cyan-200">{draft.username}</p>
                            <p className="truncate text-xs text-slate-400">{draft.email}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                              draft.role === "admin"
                                ? "bg-blue-500/20 text-blue-200"
                                : "bg-white/10 text-slate-300"
                            }`}
                          >
                            {draft.role === "admin" ? "Admin" : "Servicio"}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-medium text-slate-400">Servicio</span>
                            <select
                              value={draft.serviceId}
                              onChange={(event) =>
                                updateAdminDraft(selectedUser.uid, { serviceId: event.target.value })
                              }
                              className="mt-1 w-full rounded-xl border border-white/10 bg-[#2a3448] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                            >
                              <option value="">Sin servicio</option>
                              {SERVICE_DEFINITIONS.map((service) => {
                                const assignedUser = assignedServiceUsers.get(service.id);
                                const isTakenByAnotherUser =
                                  Boolean(assignedUser) && assignedUser?.uid !== selectedUser.uid;
                                return (
                                  <option
                                    key={service.id}
                                    value={service.id}
                                    disabled={isTakenByAnotherUser}
                                  >
                                    {isTakenByAnotherUser
                                      ? `${service.name} - asignado a ${assignedUser?.name}`
                                      : service.name}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-slate-400">Rol</span>
                            <select
                              value={draft.role}
                              onChange={(event) => {
                                const nextRole = event.target.value as UserRole;
                                updateAdminDraft(selectedUser.uid, {
                                  role: nextRole,
                                  canManageUsers: nextRole === "admin",
                                });
                              }}
                              className="mt-1 w-full rounded-xl border border-white/10 bg-[#2a3448] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                            >
                              <option value="service">Servicio</option>
                              <option value="admin">Administrador</option>
                            </select>
                          </label>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updateAdminDraft(selectedUser.uid, { isActive: !draft.isActive })}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              draft.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-400 hover:bg-white/10"
                            }`}
                          >
                            {draft.isActive ? "✓ " : ""}Activo
                          </button>
                          <button
                            type="button"
                            onClick={() => updateAdminDraft(selectedUser.uid, { canEdit: !draft.canEdit })}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              draft.canEdit ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-400 hover:bg-white/10"
                            }`}
                          >
                            {draft.canEdit ? "✓ " : ""}Captura
                          </button>
                          <button
                            type="button"
                            disabled={draft.role !== "admin"}
                            onClick={() => updateAdminDraft(selectedUser.uid, { canManageUsers: !draft.canManageUsers })}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                              draft.canManageUsers ? "bg-blue-500/20 text-blue-200" : "bg-white/5 text-slate-400 hover:bg-white/10"
                            }`}
                          >
                            {draft.canManageUsers ? "✓ " : ""}Gestiona usuarios
                          </button>
                          <button
                            type="button"
                            onClick={() => updateAdminDraft(selectedUser.uid, { mustChangePassword: !draft.mustChangePassword })}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              draft.mustChangePassword ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-slate-400 hover:bg-white/10"
                            }`}
                          >
                            {draft.mustChangePassword ? "✓ " : ""}Debe cambiar clave
                          </button>
                        </div>

                        <div className="mt-5 flex gap-2 border-t border-white/10 pt-4">
                          <button
                            type="button"
                            onClick={() => void handleAdminSave(selectedUser.uid)}
                            disabled={busy}
                            className="flex-1 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? "Guardando..." : "Guardar cambios"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAdminSendReset(selectedUser.uid, selectedUser)}
                            disabled={busy}
                            className="rounded-xl border border-blue-400/40 bg-blue-500/15 px-4 py-2.5 text-sm font-semibold text-blue-200 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reset clave
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/10 p-10 text-sm text-slate-400">
                        Seleccioná un usuario de la lista para editarlo.
                      </div>
                    )}
                  </div>
                );
              })()}
              </section>
            </div>
          ) : null}

          {(isSupervisor || isAdmin) && showBoardModal ? (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
              onClick={() => setShowBoardModal(false)}
            >
              <div className="modal-fade-in fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
              <div
                onClick={(event) => event.stopPropagation()}
                className="modal-pop-in relative my-2 max-h-[95vh] w-full max-w-6xl overflow-y-auto rounded-[24px] border border-white/10 bg-[#0e1626] p-4 shadow-2xl shadow-black/50"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/90">
                      Tablero de avance
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-white">
                      Estado por servicio — {periodLabel}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBoardModal(false)}
                    aria-label="Cerrar"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-2.5">
                  {dashboardGroups.map((group) => {
                    const groupCompleted = group.services.filter((service) => service.completed)
                      .length;
                    return (
                      <section
                        key={group.id}
                        className="rounded-2xl border border-white/10 bg-[#162032] p-3"
                      >
                        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-200">
                            {group.title}
                          </h3>
                          <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
                            {groupCompleted}/{group.services.length}
                          </span>
                        </div>
                        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                          {group.services.map((service) => {
                            const total = service.modules.length;
                            const done = service.modules.filter((m) => m.completed).length;
                            const allDone = total > 0 && done === total;
                            const circ = 2 * Math.PI * 13;
                            const pct = total > 0 ? done / total : 0;
                            const ringColor = done > 0 ? "#22d3ee" : "#475569";
                            return (
                              <div
                                key={service.id}
                                className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${
                                  allDone
                                    ? "border-cyan-400/30 bg-cyan-500/[0.06]"
                                    : "border-white/10 bg-white/[0.04]"
                                }`}
                              >
                                {/* Anillo de avance */}
                                <div className="relative h-9 w-9 shrink-0">
                                  <svg viewBox="0 0 32 32" className="h-9 w-9 -rotate-90">
                                    <circle
                                      cx="16"
                                      cy="16"
                                      r="13"
                                      fill="none"
                                      stroke="rgba(255,255,255,0.10)"
                                      strokeWidth="3"
                                    />
                                    <circle
                                      cx="16"
                                      cy="16"
                                      r="13"
                                      fill="none"
                                      stroke={ringColor}
                                      strokeWidth="3"
                                      strokeLinecap="round"
                                      strokeDasharray={`${pct * circ} ${circ}`}
                                    />
                                  </svg>
                                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                                    {done}/{total}
                                  </span>
                                </div>
                                {/* Servicio + modulos */}
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="truncate text-[13px] font-semibold text-white"
                                    title={service.name}
                                  >
                                    <ServiceIcon serviceId={service.id} className="mr-1.5 inline h-4 w-4 shrink-0 align-[-3px] text-cyan-300/90" />
                                    {service.name}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {service.modules.map((mod) => (
                                      <span
                                        key={mod.label}
                                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                          mod.completed
                                            ? "bg-cyan-500/10 text-cyan-300"
                                            : "bg-white/5 text-slate-400"
                                        }`}
                                      >
                                        {mod.completed ? (
                                          <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="h-2.5 w-2.5"
                                            aria-hidden="true"
                                          >
                                            <path d="M20 6 9 17l-5-5" />
                                          </svg>
                                        ) : (
                                          <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                                        )}
                                        {mod.label}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {(isAdmin || isSupervisor) && showStatsModal
            ? (() => {
                const statsLabel =
                  statsModule === "perc" ? "PERC" : statsModule === "sesps" ? "SEPS" : "Horas";
                const statsServices = dashboardGroups
                  .flatMap((g) => g.services)
                  .filter((s) => s.modules.some((m) => m.label === statsLabel));
                const completos = statsServices.filter(
                  (s) => s.modules.find((m) => m.label === statsLabel)?.completed,
                );
                const incompletos = statsServices.filter(
                  (s) => !s.modules.find((m) => m.label === statsLabel)?.completed,
                );
                const total = statsServices.length;
                const pct = total > 0 ? Math.round((completos.length / total) * 100) : 0;
                return (
                  <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden p-3 sm:p-4"
                    onClick={() => setShowStatsModal(false)}
                  >
                    <div className="modal-fade-in fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
                    <div
                      onClick={(event) => event.stopPropagation()}
                      className="modal-pop-in relative flex max-h-[90dvh] w-full min-w-0 max-w-lg flex-col rounded-3xl border border-white/10 bg-[#0e1626] p-4 shadow-2xl shadow-black/50 sm:p-6"
                    >
                      <div className="flex shrink-0 items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/90">
                            Avance · {statsLabel}
                          </p>
                          <h3 className="mt-1 text-xl font-semibold text-white">
                            {getPeriodLabel(statsModule === "sesps" ? sepsPeriodId : periodId)}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowStatsModal(false)}
                          aria-label="Cerrar"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Resumen */}
                      <div className="mt-5 shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-3xl font-bold leading-none text-white">
                              {completos.length}
                              <span className="text-lg font-medium text-slate-400"> / {total}</span>
                            </p>
                            <p className="mt-1 text-xs text-slate-400">servicios completos</p>
                          </div>
                          <span className="text-2xl font-bold text-emerald-300">{pct}%</span>
                        </div>
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-3 flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            {completos.length} completos
                          </span>
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="h-2 w-2 rounded-full bg-amber-400" />
                            {incompletos.length} incompletos
                          </span>
                        </div>
                      </div>

                      {/* Lista alineada (completos primero). Scroll interno para que el
                          modal siempre quepa en una pantalla; nombres completos (2 lineas)
                          y el estado como punto de color para no cortar el texto. */}
                      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                        <div className="grid grid-cols-2 gap-1.5">
                          {[...completos, ...incompletos].map((s) => {
                            const done = s.modules.find((m) => m.label === statsLabel)?.completed;
                            return (
                              <div
                                key={s.id}
                                title={`${s.name} — ${done ? "Completo" : "Pendiente"}`}
                                className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 ${
                                  done
                                    ? "border-emerald-400/15 bg-emerald-500/[0.06]"
                                    : "border-amber-400/15 bg-amber-500/[0.06]"
                                }`}
                              >
                                <span
                                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                                    done ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                                  }`}
                                >
                                  <ServiceIcon serviceId={s.id} className="h-3.5 w-3.5" />
                                </span>
                                <span className="line-clamp-2 min-w-0 flex-1 text-[11.5px] font-medium leading-tight text-slate-200">
                                  {s.name}
                                </span>
                                <span
                                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                    done ? "bg-emerald-400" : "bg-amber-400"
                                  }`}
                                  aria-label={done ? "Completo" : "Pendiente"}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            : null}

          {/* Previsualizacion del consolidado COMPLETO Produccion de Servicio. */}
          {showCensoConsolidadoPreview && consolidadoPreview ? (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden p-3 sm:p-4"
              onClick={() => setShowCensoConsolidadoPreview(false)}
            >
              <div className="modal-fade-in fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
              <div
                onClick={(event) => event.stopPropagation()}
                className="modal-pop-in relative flex max-h-[90dvh] w-full min-w-0 max-w-3xl flex-col rounded-3xl border border-white/10 bg-[#0e1626] p-4 shadow-2xl shadow-black/50 sm:p-6"
              >
                <div className="flex shrink-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300/90">
                      Producción de Servicio
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-white">
                      Previsualización del consolidado completo
                    </h3>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#1b2537] px-2.5 py-1.5 text-xs text-slate-300">
                      <span className="font-semibold uppercase tracking-wide">Mes</span>
                      <input
                        type="month"
                        value={consolidadoPeriod}
                        onChange={(event) => {
                          if (event.target.value) {
                            void loadConsolidadoPreview(event.target.value);
                          }
                        }}
                        className="bg-transparent text-xs text-white outline-none [color-scheme:dark]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCensoConsolidadoPreview(false)}
                      aria-label="Cerrar"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <p className="mt-3 shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400">
                  Consolidado de <strong className="text-slate-200">{getPeriodLabel(consolidadoPeriod)}</strong>. Los datos que vienen del <strong className="text-slate-200">Censo Diario</strong> de ese mismo mes se pintan en <span className="font-semibold text-amber-300">amarillo</span> mientras el mes está incompleto y en <span className="font-semibold text-emerald-300">verde</span> cuando ya se llenaron todos los días. El total se actualiza automáticamente.
                </p>

                <div className="relative mt-4 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10">
                  {isLoadingConsolidado ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0e1626]/70 text-sm text-slate-300">
                      Cargando {getPeriodLabel(consolidadoPeriod)}…
                    </div>
                  ) : null}
                  <table className="w-full border-collapse text-xs text-slate-200">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[#1a2334] text-left text-slate-300">
                        <th className="border-b border-white/10 px-3 py-2 font-semibold">Centro de Producción</th>
                        <th className="border-b border-white/10 px-3 py-2 font-semibold">Unidades de Producción</th>
                        <th className="border-b border-white/10 px-3 py-2 text-center font-semibold">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consolidadoPreview.map((svc, si) => (
                        <Fragment key={si}>
                          {svc.units.map((unit, ui) => (
                            <tr key={`${si}-${ui}`} className="border-t border-white/5 align-middle">
                              {ui === 0 ? (
                                <td
                                  rowSpan={svc.units.length}
                                  className="border-r border-white/5 px-3 py-2 align-middle font-semibold text-white"
                                >
                                  {svc.centro}
                                </td>
                              ) : null}
                              <td className="px-3 py-2 text-slate-300">{unit.label}</td>
                              <td className="px-3 py-2 text-center">
                                <span
                                  className={`inline-flex min-w-[2.75rem] items-center justify-center gap-1 rounded-full px-2 py-0.5 font-bold ${
                                    unit.source === "censo"
                                      ? unit.complete
                                        ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
                                        : "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40"
                                      : unit.qty !== "0"
                                        ? "bg-white/10 text-slate-100"
                                        : "text-slate-500"
                                  }`}
                                  title={
                                    unit.source === "censo"
                                      ? unit.complete
                                        ? "Censo del mes completo"
                                        : "Censo del mes aún incompleto"
                                      : undefined
                                  }
                                >
                                  {unit.source === "censo" ? (
                                    <span className={`h-1.5 w-1.5 rounded-full ${unit.complete ? "bg-emerald-400" : "bg-amber-400"}`} />
                                  ) : null}
                                  {unit.qty}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCensoConsolidadoPreview(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmDownloadServiceProduction()}
                    disabled={isExportingServiceProduction}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v12" />
                      <path d="m7 12 5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                    {isExportingServiceProduction ? "Generando…" : "Descargar Excel"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {captureOpenTarget ? (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setCaptureOpenTarget(null)}
            >
              <div className="modal-fade-in absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
              <div
                onClick={(event) => event.stopPropagation()}
                style={{ backgroundColor: "var(--surface, #181a1f)", borderColor: "var(--border, rgba(255,255,255,0.08))" }}
                className="modal-pop-in relative w-full max-w-md overflow-hidden rounded-3xl border shadow-2xl shadow-black/50"
              >
                <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-400" />
                <div className="px-7 pb-7 pt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
                    Habilitar tablero
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-white">
                    {captureOpenTarget.serviceName}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">
                    Módulo:{" "}
                    <span className="font-semibold text-white">
                      {captureOpenTarget.moduleId === "perc"
                        ? "PERC"
                        : captureOpenTarget.moduleId === "sesps"
                          ? "SEPS"
                          : "Distribución de Horas"}
                    </span>
                  </p>

                  <label className="mt-5 block">
                    <span className="text-sm font-medium text-slate-200">Mes y año a habilitar</span>
                    <input
                      value={captureOpenPeriod}
                      onChange={(event) => setCaptureOpenPeriod(event.target.value)}
                      type="month"
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                    />
                    {captureOpenPeriod ? (
                      <span className="mt-2 block text-xs font-medium text-emerald-300">
                        Se habilitará: {getPeriodLabel(captureOpenPeriod)}
                      </span>
                    ) : null}
                  </label>

                  <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setCaptureOpenTarget(null)}
                      className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!captureOpenPeriod}
                      onClick={() => {
                        const target = captureOpenTarget;
                        const period = captureOpenPeriod;
                        setOverridePanelPeriodId(period);
                        void handleToggleCapture(target.serviceId, target.moduleId, "open", period);
                        setCaptureOpenTarget(null);
                      }}
                      className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:from-emerald-400 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Habilitar este mes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Bandeja de solicitudes (admin / supervisores). */}
          {(isAdmin || isSupervisor) && showRequestsModal ? (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
              onClick={() => setShowRequestsModal(false)}
            >
              <div className="modal-fade-in fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
              <div
                onClick={(event) => event.stopPropagation()}
                className="modal-pop-in relative my-6 w-full min-w-0 max-w-2xl rounded-[24px] border border-white/10 bg-[#0e1626] p-4 shadow-2xl shadow-black/50 sm:p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
                      Bandeja
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
                      Solicitudes de habilitación
                    </h2>
                    {pendingRequestCount > 0 ? (
                      <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        {pendingRequestCount} pendiente{pendingRequestCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRequestsModal(false)}
                    aria-label="Cerrar"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                  >
                    ✕
                  </button>
                </div>

                {visibleRequests.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-slate-300">
                    No hay solicitudes por ahora.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {[...visibleRequests]
                      .sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1))
                      .map((req) => {
                        const lateMarks = captureRequests.filter(
                          (item) => item.serviceId === req.serviceId,
                        ).length;
                        const canResolve =
                          isAdmin || serviceProfile.supervisorModules.includes(req.moduleId);
                        return (
                          <div
                            key={req.id}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                                {req.serviceName}
                              </p>
                              <span className="shrink-0 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
                                {getModuleLabel(req.moduleId)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">
                              {getShortPeriodLabel(req.periodId)} · solicitó{" "}
                              <span className="text-slate-200">{req.requestedByName}</span>
                              {lateMarks > 1 ? (
                                <span className="text-rose-300/90"> · {lateMarks} marcas</span>
                              ) : null}
                            </p>

                            <div className="mt-3">
                              {req.status === "pending" ? (
                                canResolve ? (
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      disabled={requestBusyId === req.id}
                                      onClick={() => void resolveCaptureRequest(req, "approved")}
                                      className="flex-1 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                                    >
                                      {requestBusyId === req.id ? "..." : "Aprobar"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={requestBusyId === req.id}
                                      onClick={() => void resolveCaptureRequest(req, "rejected")}
                                      className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
                                    >
                                      Rechazar
                                    </button>
                                  </div>
                                ) : (
                                  <span className="inline-block rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200">
                                    Pendiente
                                  </span>
                                )
                              ) : (
                                <span
                                  className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                                    req.status === "approved"
                                      ? "bg-emerald-500/15 text-emerald-200"
                                      : "bg-rose-500/15 text-rose-200"
                                  }`}
                                >
                                  {req.status === "approved" ? "Aprobada" : "Rechazada"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Centro de Soporte: formulario (todos) + bandeja de tickets (admin/supervisores). */}
          {showSupportModal ? (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:items-center"
              onClick={() => setShowSupportModal(false)}
            >
              <div className="modal-fade-in fixed inset-0 bg-slate-950/75 backdrop-blur-sm" />
              <div
                onClick={(event) => event.stopPropagation()}
                className="modal-pop-in relative my-4 flex max-h-[92vh] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1422] shadow-2xl shadow-black/60"
              >
                {/* Talón del ticket (encabezado) */}
                <div className="relative shrink-0 bg-[#111a2b] px-6 pb-4 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-600 text-white shadow-lg shadow-cyan-900/40 [&_svg]:h-[22px] [&_svg]:w-[22px]">
                        {IconHeadset}
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-sky-300/80">
                          Ticket de soporte
                        </p>
                        <h2 className="mt-0.5 text-lg font-bold tracking-tight text-white sm:text-xl">
                          Centro de Soporte
                        </h2>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSupportModal(false)}
                      aria-label="Cerrar"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                    >
                      ✕
                    </button>
                  </div>
                  {/* Folio + código de barras */}
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-slate-500">Folio</p>
                      <p className="font-mono text-sm font-bold tracking-[0.18em] text-slate-200">#NUEVO</p>
                    </div>
                    <div className="flex h-7 items-end gap-[2px]" aria-hidden>
                      {[3,1,2,1,1,3,1,2,3,1,1,2,1,3,1,2,2,1,3,1,1,2,3,1,2,1,1,3].map((w, i) => (
                        <span key={i} className="block h-full bg-white/25" style={{ width: `${w}px` }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Perforación */}
                <div className="relative h-5 shrink-0 bg-[#111a2b]">
                  <span aria-hidden className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-slate-950" />
                  <span aria-hidden className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-slate-950" />
                  <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-white/15" />
                </div>

                {/* Cuerpo desplazable */}
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  <form onSubmit={sendSupportTicket} className="space-y-5">
                    <div>
                      <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Tipo de asunto
                      </p>
                      <div className="grid grid-cols-3 gap-2.5">
                        {([
                          ["error", "Error", "Algo no funciona", IconSupportBug],
                          ["duda", "Duda", "Tengo una pregunta", IconSupportQuestion],
                          ["sugerencia", "Sugerencia", "Una idea de mejora", IconSupportIdea],
                        ] as const).map(([val, label, desc, icon]) => {
                          const active = supportCategory === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setSupportCategory(val)}
                              className={`group flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition ${
                                active
                                  ? "border-sky-400/60 bg-sky-500/10 ring-1 ring-sky-400/30"
                                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                              }`}
                            >
                              <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition [&_svg]:h-[18px] [&_svg]:w-[18px] ${
                                active ? "bg-sky-500/20 text-sky-200" : "bg-white/5 text-slate-300"
                              }`}>
                                {icon}
                              </span>
                              <span className={`text-xs font-semibold ${active ? "text-white" : "text-slate-200"}`}>
                                {label}
                              </span>
                              <span className="hidden text-[10px] leading-tight text-slate-500 sm:block">
                                {desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Nivel de urgencia
                      </p>
                      <div className="flex gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
                        {([
                          ["baja", "Baja", "bg-emerald-400", "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/40"],
                          ["media", "Media", "bg-amber-400", "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/40"],
                          ["alta", "Alta", "bg-rose-400", "bg-rose-500/15 text-rose-100 ring-1 ring-rose-400/40"],
                        ] as const).map(([val, label, dot, activeCls]) => {
                          const active = supportUrgency === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setSupportUrgency(val)}
                              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                                active ? activeCls : "text-slate-400 hover:bg-white/5"
                              }`}
                            >
                              <span className={`h-2 w-2 rounded-full ${dot}`} />
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Descripción
                      </p>
                      <textarea
                        value={supportMessage}
                        onChange={(event) => setSupportMessage(event.target.value)}
                        rows={4}
                        placeholder="Contanos qué pasó, en qué pantalla y qué esperabas que sucediera…"
                        className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400/70 focus:bg-white/[0.05] focus:ring-4 focus:ring-sky-500/10"
                      />
                    </div>

                    {/* Metadatos que se adjuntan solos */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">Se adjunta:</span>
                      {[welcomeName, currentService?.name ?? "Sin servicio", "v1.6.2.6"].map((chip, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-slate-300">
                          {chip}
                        </span>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={isSendingSupport}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-900/30 transition hover:opacity-90 disabled:opacity-50"
                    >
                      {isSendingSupport ? "Emitiendo…" : "Emitir ticket"}
                    </button>
                  </form>

                  {isAdmin || isSupervisor ? (
                    <div className="mt-7 border-t border-white/[0.06] pt-5">
                      <div className="mb-3.5 flex items-center justify-between gap-2">
                        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-slate-300 [&_svg]:h-[15px] [&_svg]:w-[15px]">
                            {IconMessage}
                          </span>
                          Bandeja de tickets
                        </h3>
                        {pendingSupportCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                            {pendingSupportCount} pendiente{pendingSupportCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      {supportTickets.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
                          <p className="text-sm font-medium text-slate-300">Sin tickets por ahora</p>
                          <p className="mt-1 text-xs text-slate-500">Los reportes nuevos aparecerán acá.</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {supportTickets.map((t) => {
                            const urg =
                              t.urgency === "alta"
                                ? { stub: "bg-rose-500/15", dot: "bg-rose-400", chip: "bg-rose-500/15 text-rose-200" }
                                : t.urgency === "media"
                                  ? { stub: "bg-amber-500/15", dot: "bg-amber-400", chip: "bg-amber-500/15 text-amber-200" }
                                  : { stub: "bg-emerald-500/15", dot: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-200" };
                            const catLabel =
                              t.category === "error"
                                ? "Error"
                                : t.category === "duda"
                                  ? "Duda"
                                  : "Sugerencia";
                            const folio = t.id.slice(0, 4).toUpperCase();
                            const stamp =
                              t.status === "resuelto"
                                ? { label: "Resuelto", cls: "border-emerald-400/50 text-emerald-300/80" }
                                : t.status === "en_revision"
                                  ? { label: "En revisión", cls: "border-sky-400/50 text-sky-300/80" }
                                  : { label: "Pendiente", cls: "border-amber-400/50 text-amber-300/80" };
                            return (
                              <div
                                key={t.id}
                                className="relative flex overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition hover:bg-white/[0.05]"
                              >
                                {/* Talón izquierdo con folio (perforado) */}
                                <div className={`relative flex w-12 shrink-0 flex-col items-center justify-center gap-1 ${urg.stub}`}>
                                  <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/60">SOP</span>
                                  <span className="font-mono text-[11px] font-bold tracking-wider text-white">{folio}</span>
                                  <span aria-hidden className="absolute inset-y-1.5 right-0 border-r-2 border-dashed border-white/20" />
                                </div>

                                {/* Cuerpo del ticket */}
                                <div className="min-w-0 flex-1 p-3.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-white">
                                        {t.reporterName || t.serviceName || "Usuario"}
                                      </p>
                                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 font-semibold uppercase tracking-wide text-slate-300">
                                          <span className={`h-1.5 w-1.5 rounded-full ${urg.dot}`} />
                                          {catLabel}
                                        </span>
                                        {t.serviceName ? <span>· {t.serviceName}</span> : null}
                                        {t.screen ? <span>· {t.screen}</span> : null}
                                      </p>
                                    </div>
                                    {/* Sello de estado */}
                                    <span className={`shrink-0 rotate-[-6deg] rounded-md border-2 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${stamp.cls}`}>
                                      {stamp.label}
                                    </span>
                                  </div>
                                  <p className="mt-2.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">
                                    {t.message}
                                  </p>
                                  {t.status === "resuelto" ? (
                                    t.resolvedByName ? (
                                      <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-emerald-300/70">
                                        ✓ Cerrado por {t.resolvedByName}
                                      </p>
                                    ) : null
                                  ) : (
                                    <div className="mt-3.5 flex items-center justify-end gap-2">
                                      {t.status === "pendiente" ? (
                                        <button
                                          type="button"
                                          disabled={supportBusyId === t.id}
                                          onClick={() => void resolveSupportTicket(t, "en_revision")}
                                          className="rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-50"
                                        >
                                          Tomar
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        disabled={supportBusyId === t.id}
                                        onClick={() => void resolveSupportTicket(t, "resuelto")}
                                        className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                                      >
                                        {supportBusyId === t.id ? "..." : "Resolver"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Formulario para que el servicio solicite habilitar un tablero. */}
          {canRequestEnable && showRequestForm ? (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setShowRequestForm(false)}
            >
              <div className="modal-fade-in absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
              <div
                onClick={(event) => event.stopPropagation()}
                style={{ backgroundColor: "var(--surface, #181a1f)", borderColor: "var(--border, rgba(255,255,255,0.08))" }}
                className="modal-pop-in relative w-full max-w-md overflow-hidden rounded-3xl border shadow-2xl shadow-black/50"
              >
                <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-cyan-400" />
                <div className="px-7 pb-7 pt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/90">
                    Solicitar habilitación
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-white">
                    {currentService?.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">
                    Elegí el tablero que necesitás que te reabran. Llega a los supervisores y al admin.
                  </p>

                  <label className="mt-5 block">
                    <span className="text-sm font-medium text-slate-200">Tablero</span>
                    <select
                      value={requestModuleId}
                      onChange={(event) => setRequestModuleId(event.target.value as ModuleId)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-amber-400"
                    >
                      {requestableModules.map((mod) => (
                        <option key={mod} value={mod} style={{ backgroundColor: "#1b2537", color: "#e2e8f0" }}>
                          {getModuleLabel(mod)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setShowRequestForm(false)}
                      className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isSendingRequest}
                      onClick={() => void sendCaptureRequest(requestModuleId)}
                      className="rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-900/40 transition hover:from-amber-400 hover:to-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSendingRequest ? "Enviando..." : "Enviar solicitud"}
                    </button>
                  </div>

                  {/* Mensaje temporal de resultado (aprobada/rechazada) bajo Cancelar. */}
                  {casitaLabel ? (
                    <p
                      className={`notif-slide-in mt-3 rounded-xl px-3 py-2 text-center text-xs font-bold ${
                        casitaTone === "rejected"
                          ? "bg-rose-500/15 text-rose-200"
                          : "bg-emerald-500/15 text-emerald-200"
                      }`}
                    >
                      {casitaLabel}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Modal de Configuracion: personalizacion del usuario. */}
          {showConfigModal ? (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
              onClick={() => setShowConfigModal(false)}
            >
              <div className="modal-fade-in fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
              <div
                onClick={(event) => event.stopPropagation()}
                style={{ backgroundColor: "var(--surface, #181a1f)", borderColor: "var(--border, rgba(255,255,255,0.08))" }}
                className="modal-pop-in relative my-8 w-full max-w-xl overflow-hidden rounded-3xl border shadow-2xl shadow-black/50"
              >
                <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #64748b, #334155)" }} />
                <div className="max-h-[86vh] overflow-y-auto px-5 pb-6 pt-5 sm:px-6">
                  <div className="mb-5 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg" style={{ background: "linear-gradient(135deg, #64748b, #334155)", boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                        </svg>
                      </span>
                      <div>
                        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>Configuración</h3>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Personalizá tu experiencia · se guarda automáticamente</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowConfigModal(false)}
                      aria-label="Cerrar"
                      className="flex h-9 w-9 items-center justify-center rounded-full border text-lg leading-none transition hover:brightness-125"
                      style={{ borderColor: "var(--border)", background: "var(--surface-3)", color: "var(--text-muted)" }}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {/* Tema */}
                    <section className="rounded-2xl border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--surface-3)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>
                        </span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>Apariencia</p>
                          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Tema</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(["light", "dark"] as const).map((t) => {
                          const on = panelTheme === t;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setPanelTheme(t)}
                              className="group flex items-center gap-2.5 rounded-lg border p-2 text-left transition hover:brightness-110"
                              style={on
                                ? { borderColor: "color-mix(in srgb, var(--text) 45%, transparent)", background: "color-mix(in srgb, var(--text) 8%, transparent)" }
                                : { borderColor: "var(--border)", background: "var(--surface-3)" }}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)", background: t === "light" ? "#f1f4f9" : "#0a0f1c" }}>
                                <span className="h-3.5 w-3.5 rounded-sm" style={{ background: t === "light" ? "#0891b2" : "#38d6ee" }} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: on ? "var(--text)" : "var(--text-muted)" }}>
                                  {t === "light" ? IconSun : IconMoon}
                                  {t === "light" ? "Claro" : "Oscuro"}
                                </span>
                              </span>
                              {on ? (
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {/* Color de acento */}
                    <section className="rounded-2xl border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--surface-3)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996C18.978 15.398 22 12.375 22 8.375 22 4.855 17.523 2 12 2Z" /></svg>
                        </span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>Personalización</p>
                          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Color de acento</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {ACCENT_OPTIONS.map((opt) => {
                          const selected = uiPrefs.accent === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => updateUiPrefs({ accent: opt.id })}
                              aria-label={opt.label}
                              title={opt.label}
                              className="relative flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-105"
                              style={{ backgroundColor: opt.accent, boxShadow: selected ? `0 0 0 2px var(--surface-2), 0 0 0 4px ${opt.accent}, 0 6px 16px ${opt.accent}66` : "0 2px 6px rgba(0,0,0,0.3)" }}
                            >
                              {selected ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke={opt.ink} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {/* Tipografia */}
                    <section className="rounded-2xl border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--surface-3)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7V5h16v2M9 19h6M12 5v14" /></svg>
                        </span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>Legibilidad</p>
                          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Tipografía</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {FONT_OPTIONS.map((opt) => {
                          const on = uiPrefs.font === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => updateUiPrefs({ font: opt.id })}
                              className="flex items-center gap-2.5 rounded-lg border p-2 text-left transition hover:brightness-110"
                              style={on
                                ? { borderColor: "color-mix(in srgb, var(--text) 45%, transparent)", background: "color-mix(in srgb, var(--text) 8%, transparent)" }
                                : { borderColor: "var(--border)", background: "var(--surface-3)" }}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-bold" style={{ fontFamily: opt.stack, background: "var(--surface-2)", color: on ? "var(--text)" : "var(--text-muted)" }}>Aa</span>
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ fontFamily: opt.stack, color: on ? "var(--text)" : "var(--text-muted)" }}>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {/* Tamaño de letra */}
                    <section className="rounded-2xl border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--surface-3)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 19 5-13 5 13M5 14h6M14 19l3.5-9 3.5 9M15.5 16h4" /></svg>
                        </span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>Accesibilidad</p>
                          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Tamaño de letra</p>
                        </div>
                      </div>
                      <div className="flex gap-1 rounded-xl border p-1" style={{ borderColor: "var(--border)", background: "var(--surface-3)" }}>
                        {FONT_SIZE_OPTIONS.map((opt, i) => {
                          const on = uiPrefs.fontSize === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => updateUiPrefs({ fontSize: opt.id })}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition hover:brightness-110"
                              style={on
                                ? { background: "var(--surface)", color: "var(--text)", boxShadow: "0 1px 3px rgba(0,0,0,0.28)" }
                                : { background: "transparent", color: "var(--text-muted)" }}
                            >
                              <span style={{ fontSize: `${12 + i * 3}px` }} className="font-bold leading-none">A</span>
                              <span className="text-xs font-semibold">{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {/* Fondo */}
                    <section className="rounded-2xl border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--surface-3)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m3 15 4-4 4 4M14 13l2-2 5 5" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>
                        </span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>Ambiente</p>
                          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Fondo de pantalla</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {BACKGROUND_OPTIONS.map((opt) => {
                          const on = uiPrefs.background === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => updateUiPrefs({ background: opt.id })}
                              className="overflow-hidden rounded-xl border text-left transition hover:brightness-110"
                              style={on ? { borderColor: "color-mix(in srgb, var(--text) 45%, transparent)", boxShadow: "0 0 0 1px color-mix(in srgb, var(--text) 45%, transparent)" } : { borderColor: "var(--border)" }}
                            >
                              <span className="relative flex h-9 w-full items-center justify-center" style={opt.css ? { backgroundImage: opt.css } : { backgroundColor: "var(--bg)" }}>
                                {on ? (
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "var(--text)", color: "var(--bg)" }}>
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                                  </span>
                                ) : null}
                              </span>
                              <span className="block px-2.5 py-1.5 text-[11px] font-semibold" style={{ background: "var(--surface-3)", color: on ? "var(--text)" : "var(--text-muted)" }}>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {/* Widgets */}
                    <section className="rounded-2xl border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--surface-3)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
                        </span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>Inicio</p>
                          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Widgets del panel</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {([
                          { key: "showGreeting", label: "Saludo de bienvenida", desc: "Muestra tu nombre al entrar", on: uiPrefs.showGreeting },
                          { key: "showClock", label: "Reloj y fecha", desc: "Hora y fecha en el inicio", on: uiPrefs.showClock },
                        ] as const).map((w) => (
                          <button
                            key={w.key}
                            type="button"
                            onClick={() => updateUiPrefs({ [w.key]: !w.on } as Partial<UiPrefs>)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left transition hover:brightness-110"
                            style={{ background: "var(--surface-3)" }}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>{w.label}</span>
                              <span className="block text-[11px]" style={{ color: "var(--text-faint)" }}>{w.desc}</span>
                            </span>
                            <span className="relative flex h-5 w-9 shrink-0 items-center rounded-full transition" style={{ background: w.on ? "color-mix(in srgb, var(--text) 58%, transparent)" : "color-mix(in srgb, var(--text-faint) 35%, transparent)" }}>
                              <span className="absolute h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: w.on ? "18px" : "2px" }} />
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>

                    <button
                      type="button"
                      onClick={() => {
                        updateUiPrefs(DEFAULT_UI_PREFS);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition hover:brightness-110"
                      style={{ borderColor: "var(--border)", background: "var(--surface-3)", color: "var(--text-muted)" }}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                      Restablecer a los valores por defecto
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Modal de Documentos (control anual de entregas a Calidad). */}
          {showDocsModal ? (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
              onClick={() => setShowDocsModal(false)}
            >
              <div className="modal-fade-in fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
              <div
                onClick={(event) => event.stopPropagation()}
                style={{
                  backgroundColor: "var(--surface, #0e1626)",
                  borderColor: "var(--border, rgba(255,255,255,0.08))",
                }}
                className="modal-pop-in relative my-6 w-full max-w-6xl overflow-hidden rounded-3xl border shadow-2xl shadow-black/50"
              >
                <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
                <div className="flex items-center justify-between gap-3 px-5 pt-5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                      {IconFile}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-white">DOCS-POA/MOF</h3>
                      <p className="text-[11px] text-slate-400">
                        Control de entregas a Calidad · {currentYear}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDocsModal(false)}
                    aria-label="Cerrar"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 px-5 pt-3 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Entregado
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Pendiente de entrega
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 font-semibold text-slate-400">
                    — Sin definir
                  </span>
                  <span className="text-slate-400">
                    {canEditDocs ? "· Tocá una celda para cambiar su estado" : "· Solo lectura"}
                  </span>
                </div>

                <div className="max-h-[74vh] overflow-y-auto px-5 py-4">
                  {docsLoading ? (
                    <p className="py-10 text-center text-sm text-slate-400">Cargando…</p>
                  ) : (
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="text-white">
                          <th className="sticky top-0 z-10 border-b-2 border-cyan-400/40 bg-[#0e1626] px-2 py-3 text-left text-sm font-bold uppercase tracking-wide">
                            Dependencia
                          </th>
                          {DOC_COLUMNS.map((col) => (
                            <th
                              key={col.key}
                              className="sticky top-0 z-10 w-[150px] border-b-2 border-cyan-400/40 bg-[#0e1626] px-2 py-3 text-center text-sm font-bold uppercase tracking-wide"
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DOC_DEPENDENCIAS.map((dep, index) => {
                          const key = getDocKey(index);
                          return (
                            <tr key={key} className="border-t border-white/5">
                              <td className="py-2 pr-3 text-[13px] font-medium text-slate-100">
                                <span className="flex items-center gap-2">
                                  <span className="shrink-0 text-cyan-300/80">{getDepIcon(dep)}</span>
                                  <span>{dep}</span>
                                </span>
                              </td>
                              {DOC_COLUMNS.map((col) => {
                                const status = (docsValues[key]?.[col.key] ?? "") as DocStatus;
                                const tone =
                                  status === "entregado"
                                    ? "text-emerald-400"
                                    : status === "pendiente"
                                      ? "text-amber-400"
                                      : "bg-white/5 text-slate-500";
                                const label = DOC_STATUS_LABEL[status];
                                return (
                                  <td key={col.key} className="px-1.5 py-1.5 text-center">
                                    {canEditDocs ? (
                                      <button
                                        type="button"
                                        onClick={() => handleDocsCellCycle(key, col.key)}
                                        className={`inline-flex w-full items-center justify-center rounded-full px-2 py-1 text-[13px] font-bold transition hover:brightness-110 ${tone}`}
                                      >
                                        {label}
                                      </button>
                                    ) : (
                                      <span
                                        className={`inline-flex w-full items-center justify-center rounded-full px-2 py-1 text-[13px] font-bold ${tone}`}
                                      >
                                        {label}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setShowDocsModal(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10"
                  >
                    Cerrar
                  </button>
                  {canEditDocs ? (
                    <button
                      type="button"
                      onClick={() => void handleSaveDocs()}
                      disabled={docsSaving || docsLoading}
                      className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {docsSaving ? "Guardando…" : "Guardar cambios"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Asistente virtual (robot medico) - abajo a la derecha. SOLO en PC. */}
          <div className="fixed bottom-5 right-5 z-40 hidden flex-col items-end gap-3 xl:flex">
            {assistantOpen ? (
              <div className="modal-pop-in flex h-[66vh] max-h-[560px] w-[360px] max-w-[90vw] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0e1626] shadow-2xl shadow-black/60">
                {/* Encabezado */}
                <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ background: "linear-gradient(120deg, rgba(34,211,238,0.16), rgba(124,58,237,0.16))", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, #22d3ee, #6366f1)", boxShadow: "0 6px 16px rgba(99,102,241,0.45)" }}>
                      <svg viewBox="0 0 24 24" className={`h-5 w-5 ${botTyping ? "bot-talk" : ""}`} fill="#fff" aria-hidden="true">
                        <path d="M12 2.5l1.9 4.8 4.8 1.9-4.8 1.9L12 15.9l-1.9-4.8L5.3 9.2l4.8-1.9z" />
                        <path d="M18.6 14.4l.82 2.08 2.08.82-2.08.82-.82 2.08-.82-2.08-2.08-.82 2.08-.82z" opacity="0.92" />
                      </svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">Asistente PULSO</p>
                      <p className="flex items-center gap-1 text-[10px] text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> En línea · listo para ayudarte
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={startNewAssistantChat}
                      aria-label="Nueva conversación"
                      title="Nueva conversación"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssistantOpen(false)}
                      aria-label="Cerrar asistente"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Mensajes (+ arrastrar Excel aquí) */}
                <div
                  className="relative flex-1 overflow-y-auto p-3"
                  onDragOver={(event) => { event.preventDefault(); setAssistantDragOver(true); }}
                  onDragLeave={() => setAssistantDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setAssistantDragOver(false);
                    void handleAssistantFile(event.dataTransfer.files?.[0]);
                  }}
                >
                  {assistantMsgs.length === 0 && !botTyping ? (
                    <div className="flex h-full flex-col items-center justify-center px-3 text-center">
                      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.22), rgba(99,102,241,0.22))" }}>
                        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="#38d6ee" aria-hidden="true"><path d="M12 2.5l1.9 4.8 4.8 1.9-4.8 1.9L12 15.9l-1.9-4.8L5.3 9.2l4.8-1.9z" /></svg>
                      </span>
                      <p className="text-base font-bold text-white">¿En qué te ayudo?</p>
                      <p className="mt-1 max-w-[240px] text-xs leading-5 text-slate-400">
                        Escribí lo que necesitás. También podés <strong className="text-slate-200">soltar un Excel</strong> de tu servicio acá y lo completo por vos.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        {[
                          getSepsTemplate(currentService?.id) ? "Ir a mi SEPS" : "Ir a mi PERC",
                          "Cambiar el tema",
                          "Guardar mi captura",
                          "¿Cómo uso el sistema?",
                        ].map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => void pushAssistant(q, assistantCtx)}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {assistantMsgs.map((msg, index) => {
                        const action = msg.from === "bot" ? msg.action : undefined;
                        return (
                          <div key={index} className={`flex flex-col ${msg.from === "user" ? "items-end" : "items-start"}`}>
                            <p className={`w-fit max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 ${msg.from === "user" ? "rounded-tr-sm bg-cyan-500/20 font-medium text-cyan-100" : "rounded-tl-sm bg-white/5 text-slate-200"}`}>
                              {msg.text}
                            </p>
                            {action ? (
                              <button
                                type="button"
                                onClick={() => runAssistantAction(action.id)}
                                className="mt-1.5 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                                style={{ background: "linear-gradient(135deg, #22d3ee, #6366f1)" }}
                              >
                                {action.label}
                                <span aria-hidden>→</span>
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      {botTyping ? (
                        <div className="flex w-fit items-center gap-1 rounded-2xl rounded-tl-sm bg-white/5 px-3 py-2.5">
                          <span className="bot-dot h-1.5 w-1.5 rounded-full bg-slate-300" />
                          <span className="bot-dot h-1.5 w-1.5 rounded-full bg-slate-300" style={{ animationDelay: "0.15s" }} />
                          <span className="bot-dot h-1.5 w-1.5 rounded-full bg-slate-300" style={{ animationDelay: "0.3s" }} />
                        </div>
                      ) : null}
                    </div>
                  )}
                  {assistantDragOver ? (
                    <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-2xl border-2 border-dashed border-cyan-400/70 bg-cyan-500/10 text-sm font-semibold text-cyan-100">
                      Soltá el Excel para completarlo
                    </div>
                  ) : null}
                </div>

                {/* Sugerencias bajo demanda (no ocupan la pantalla) */}
                {assistantSuggestOpen ? (
                  <div className="border-t border-white/10 bg-white/[0.02]">
                    <div className="flex gap-1.5 overflow-x-auto px-2.5 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {ASSISTANT_CATEGORIES.map((cat) => (
                        <button key={cat} type="button" onClick={() => setAssistantCat(cat)} className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition ${assistantCat === cat ? "text-white shadow-sm" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`} style={assistantCat === cat ? { background: "linear-gradient(135deg, #22d3ee, #6366f1)" } : undefined}>
                          {cat}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto px-2.5 pb-2 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {ASSISTANT_FAQS.filter((faq) => faq.cat === assistantCat).map((faq, index) => (
                        <button key={index} type="button" onClick={() => { void pushAssistant(faq.q, assistantCtx); setAssistantSuggestOpen(false); }} className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-500/10">
                          {faq.q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Entrada tipo pill: adjuntar Excel + escribir + enviar */}
                <form
                  onSubmit={(event) => { event.preventDefault(); void pushAssistant(assistantInput, assistantCtx); }}
                  className="flex items-center gap-2 border-t border-white/10 p-2.5"
                >
                  <input ref={assistantFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { void handleAssistantFile(event.target.files?.[0]); event.target.value = ""; }} />
                  <button type="button" onClick={() => assistantFileRef.current?.click()} title="Adjuntar Excel" aria-label="Adjuntar Excel" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10">
                    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                  </button>
                  <button type="button" onClick={() => setAssistantSuggestOpen((v) => !v)} title="Sugerencias" aria-label="Sugerencias" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 transition ${assistantSuggestOpen ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" /></svg>
                  </button>
                  <input
                    value={assistantInput}
                    onChange={(event) => setAssistantInput(event.target.value)}
                    placeholder="Escribí lo que necesitás…"
                    className="min-w-0 flex-1 rounded-full border border-white/10 bg-[#18233a] px-4 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    disabled={!assistantInput.trim()}
                    aria-label="Enviar"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition hover:opacity-90 disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, #22d3ee, #3b82f6)" }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#07131f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
                  </button>
                </form>
              </div>
            ) : null}

            <button
              type="button"
              onClick={openAssistant}
              aria-label="Asistente virtual"
              className={`flex h-12 w-12 items-center justify-center rounded-full ring-2 ring-white/20 transition hover:scale-105 ${
                assistantOpen ? "" : "bot-float"
              }`}
              style={{ background: "linear-gradient(135deg, #22d3ee, #6366f1)", boxShadow: "0 12px 30px rgba(99,102,241,0.5)" }}
            >
              {/* Chispa IA */}
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="#ffffff" aria-hidden="true">
                <path d="M12 2.2l2.05 5.15 5.15 2.05-5.15 2.05L12 16.6l-2.05-5.15L4.8 9.4l5.15-2.05z" />
                <path d="M18.7 14.2l.9 2.25 2.25.9-2.25.9-.9 2.25-.9-2.25-2.25-.9 2.25-.9z" opacity="0.9" />
                <path d="M5 3.6l.62 1.55L7.17 5.77 5.62 6.4 5 7.95 4.38 6.4 2.83 5.77l1.55-.62z" opacity="0.85" />
              </svg>
            </button>
          </div>
        </div>
        </div>
        <LoginLoadingModal show={loginLoading} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4efe6] text-slate-950">
      <section className="flex min-h-screen items-start justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.10),transparent_40%),radial-gradient(circle_at_80%_90%,rgba(124,58,237,0.14),transparent_40%),linear-gradient(160deg,#0b1220_0%,#0a0f1c_100%)] px-4 pb-10 pt-8 sm:pt-12 xl:items-center xl:py-4">
        {/* Panel de monitoreo OCULTO: la pantalla de inicio solo muestra el login. */}
        <div className="hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.22),transparent_28%),radial-gradient(circle_at_80%_15%,rgba(16,185,129,0.18),transparent_25%),linear-gradient(150deg,#020617_0%,#111827_55%,#172554_100%)]" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Logo PULSO: badge dorado con linea de pulso (electro). */}
              <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
                <defs>
                  <linearGradient id="pulsoGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#e3c07f" />
                    <stop offset="1" stopColor="#b6863c" />
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pulsoGrad)" />
                <path
                  d="M7 25 H16 L19.5 15 L25 35 L29 25 H41"
                  fill="none"
                  stroke="#1b1206"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <p className="text-2xl font-bold tracking-wide text-white">PULSO</p>
                <p className="text-[10px] font-medium uppercase leading-tight tracking-[0.16em] text-blue-200/80">
                  Plataforma Única de Logística
                  <br />y Servicios Operativos
                </p>
              </div>
            </div>
            {/* Nombre del Hospital. */}
            <div className="text-right">
              <p className="text-sm font-bold leading-tight tracking-wide text-white">
                Hospital Nacional
              </p>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-200/80">
                El Salvador
              </p>
            </div>
          </div>

          <div className="relative space-y-6">
            <div className="space-y-4">
              {isLoadingDashboard
                ? Array.from({ length: 3 }, (_, groupIndex) => (
                    <div
                      key={`group-skeleton-${groupIndex}`}
                      className="rounded-[24px] border border-white/10 bg-[#162034]/90 p-5"
                    >
                      <div className="h-6 w-52 rounded bg-white/10" />
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }, (_, cardIndex) => (
                          <div
                            key={`card-skeleton-${groupIndex}-${cardIndex}`}
                            className="h-28 rounded-2xl border border-white/10 bg-white/5"
                          />
                        ))}
                      </div>
                    </div>
                  ))
                : dashboardGroups.map((group) => {
                    const groupCompleted = group.services.filter((service) => service.completed)
                      .length;

                    return (
                      <section
                        key={group.id}
                        className="rounded-2xl border border-white/10 bg-[#162032] p-4 shadow-[0_18px_50px_rgba(3,7,18,0.25)]"
                      >
                        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-200">
                            {group.title}
                          </h2>
                          <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
                            {groupCompleted}/{group.services.length}
                          </span>
                        </div>

                        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                          {group.services.map((service) => {
                            const total = service.modules.length;
                            const done = service.modules.filter((m) => m.completed).length;
                            const allDone = total > 0 && done === total;
                            const circ = 2 * Math.PI * 13;
                            const pct = total > 0 ? done / total : 0;
                            const ringColor = done > 0 ? "#22d3ee" : "#475569";
                            return (
                              <div
                                key={service.id}
                                className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${
                                  allDone
                                    ? "border-cyan-400/30 bg-cyan-500/[0.06]"
                                    : "border-white/10 bg-white/[0.04]"
                                }`}
                              >
                                <div className="relative h-9 w-9 shrink-0">
                                  <svg viewBox="0 0 32 32" className="h-9 w-9 -rotate-90">
                                    <circle
                                      cx="16"
                                      cy="16"
                                      r="13"
                                      fill="none"
                                      stroke="rgba(255,255,255,0.10)"
                                      strokeWidth="3"
                                    />
                                    <circle
                                      cx="16"
                                      cy="16"
                                      r="13"
                                      fill="none"
                                      stroke={ringColor}
                                      strokeWidth="3"
                                      strokeLinecap="round"
                                      strokeDasharray={`${pct * circ} ${circ}`}
                                    />
                                  </svg>
                                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                                    {done}/{total}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="truncate text-[13px] font-semibold text-white"
                                    title={service.name}
                                  >
                                    <ServiceIcon serviceId={service.id} className="mr-1.5 inline h-4 w-4 shrink-0 align-[-3px] text-cyan-300/90" />
                                    {service.name}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {service.modules.map((mod) => (
                                      <span
                                        key={mod.label}
                                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                          mod.completed
                                            ? "bg-cyan-500/10 text-cyan-300"
                                            : "bg-white/5 text-slate-400"
                                        }`}
                                      >
                                        {mod.completed ? (
                                          <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="h-2.5 w-2.5"
                                            aria-hidden="true"
                                          >
                                            <path d="M20 6 9 17l-5-5" />
                                          </svg>
                                        ) : (
                                          <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                                        )}
                                        {mod.label}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
            </div>
          </div>

        </div>

        <div className="relative flex w-full max-w-md items-start justify-center">
          <div className="w-full">
            {/* Encabezado fuera del modal: Hospital Nacional · El Salvador. */}
            <div className="mb-4 w-full rounded-[24px] border border-white/10 bg-[#0e1626]/70 px-6 py-4 text-center shadow-xl shadow-black/40 backdrop-blur-xl xl:mb-3 xl:py-3">
              <p className="text-xl font-light tracking-[0.22em] text-white sm:text-2xl">
                HOSPITAL NACIONAL
              </p>
              <div
                aria-hidden
                className="mx-auto my-2 h-px w-16 bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
              />
              <p className="text-[11px] font-light uppercase tracking-[0.42em] text-cyan-200/80">
                El Salvador
              </p>
            </div>
            {isLoadingSession ? (
              <div className="rounded-[28px] border border-white/10 bg-[#0e1626]/80 p-8 shadow-2xl shadow-black/60 backdrop-blur-xl">
                <div className="h-3 w-28 rounded-full bg-white/10" />
                <div className="mt-6 h-12 rounded-2xl bg-white/5" />
                <div className="mt-4 h-12 rounded-2xl bg-white/5" />
                <div className="mt-4 h-12 rounded-2xl bg-white/5" />
              </div>
            ) : user && !serviceProfile ? (
              <section className="rounded-[28px] border border-white/10 bg-[#0e1626]/80 p-7 shadow-2xl shadow-black/60 backdrop-blur-xl">
                <p className="text-sm font-medium text-cyan-300">Sesion activa</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                  Perfil pendiente o bloqueado
                </h2>
                {error ? (
                  <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-8 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/30 transition hover:opacity-90"
                >
                  Cerrar sesion
                </button>
              </section>
            ) : (
              <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0e1626]/80 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-9 xl:p-7">
                {/* Resplandores de fondo */}
                <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
                <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-blue-600/20 blur-3xl" />
                <div className="relative">
                <div className="mb-7 flex flex-col items-center text-center xl:mb-4">
                  {/* Logo PULSO con resplandor */}
                  <span className="relative flex h-16 w-16 items-center justify-center">
                    <span aria-hidden className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 opacity-60 blur-lg" />
                    <svg viewBox="0 0 48 48" className="relative h-16 w-16 drop-shadow-lg" aria-hidden="true">
                      <defs>
                        <linearGradient id="pulsoGradLogin" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="#22d3ee" />
                          <stop offset="1" stopColor="#7c3aed" />
                        </linearGradient>
                      </defs>
                      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pulsoGradLogin)" />
                      <path
                        d="M7 25 H16 L19.5 15 L25 35 L29 25 H41"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">
                    Bienvenido a PULSO
                  </h2>
                  <p className="mt-1.5 text-[13px] font-medium leading-snug text-slate-300">
                    Plataforma Única de Logística y Servicios Operativos
                  </p>
                  <p className="mt-1.5 text-sm text-slate-400">Iniciá sesión para continuar</p>
                </div>

                <form className="space-y-5 xl:space-y-4" onSubmit={handleSubmit}>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-300">Correo o usuario</span>
                    <div className="relative mt-2">
                      <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <input
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 pl-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/10"
                        name="email"
                        placeholder="correo@hospital.com o Hcardoza"
                        required
                        type="text"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-300">Contrasena</span>
                    <div className="relative mt-2">
                      <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                      <input
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 pl-11 pr-12 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/10"
                        minLength={6}
                        name="password"
                        placeholder="Ingresa tu clave"
                        required
                        type={showPasswordText ? "text" : "password"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordText((value) => !value)}
                        aria-label={showPasswordText ? "Ocultar contraseña" : "Mostrar contraseña"}
                        title={showPasswordText ? "Ocultar contraseña" : "Mostrar contraseña"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                      >
                        {showPasswordText ? (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                            <line x1="2" y1="2" x2="22" y2="22" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </label>

                  {error ? (
                    <div className="space-y-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                      <p>{error}</p>
                      {firestoreUnavailable ? (
                        <button
                          type="button"
                          onClick={handleRetryFirestore}
                          className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
                        >
                          Reintentar Firestore
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {message ? (
                    <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                      {message}
                    </p>
                  ) : null}

                  <button
                    disabled={isSubmitting}
                    className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/30 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    type="submit"
                  >
                    {isSubmitting ? "Procesando..." : "Entrar al sistema"}
                  </button>
                </form>

                {/* Registro publico para jefes de servicio. */}
                <div className="mt-5 border-t border-white/10 pt-4 text-center">
                  <p className="text-xs text-slate-400">
                    ¿Sos jefe de servicio y todavía no tenés cuenta?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setMessage("");
                      setShowSignupModal(true);
                    }}
                    className="mt-1.5 text-sm font-bold text-cyan-300 transition hover:text-cyan-200"
                  >
                    Regístrate aquí
                  </button>
                </div>
                </div>
              </section>
            )}

            {/* Creditos del equipo desarrollador, debajo del modal de login. */}
            <div className="mt-10 w-full rounded-[24px] border border-white/10 bg-[#0e1626]/70 px-6 py-4 text-center shadow-xl shadow-black/40 backdrop-blur-xl xl:mt-4 xl:py-3">
              <p className="text-[10px] font-light uppercase tracking-[0.32em] text-slate-400">
                Desarrollado por
              </p>
              <p className="bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-2xl font-light tracking-[0.22em] text-transparent">
                ESDOMED
              </p>
              <div
                aria-hidden
                className="mx-auto my-1.5 h-px w-16 bg-gradient-to-r from-transparent via-blue-400/60 to-transparent"
              />
              <p className="text-[10px] font-light uppercase tracking-[0.4em] text-slate-500">
                Versión 1.6.2.6
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Modal de REGISTRO publico (jefes de servicio). */}
      {showSignupModal ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4"
        >
          <div
            className="modal-fade-in fixed inset-0 bg-slate-950/75 backdrop-blur-sm"
            onClick={() => setShowSignupModal(false)}
          />
          <div className="modal-pop-in relative my-6 w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0e1626] shadow-2xl shadow-black/60">
            <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
            <div className="px-5 pb-6 pt-5 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-300/80">
                    Registro
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-white">Crear cuenta de jefe</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Tu solicitud será revisada por un administrador antes de darte acceso.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSignupModal(false)}
                  aria-label="Cerrar"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                >
                  ✕
                </button>
              </div>

              <form className="mt-5 space-y-3.5" onSubmit={handleSignupSubmit}>
                <label className="block">
                  <span className="text-xs font-medium text-slate-300">Nombres</span>
                  <input
                    value={signupForm.firstName}
                    onChange={(e) => setSignupForm((f) => ({ ...f, firstName: e.target.value }))}
                    required
                    placeholder=""
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#1b2537] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-300">Apellidos</span>
                  <input
                    value={signupForm.lastName}
                    onChange={(e) => setSignupForm((f) => ({ ...f, lastName: e.target.value }))}
                    required
                    placeholder=""
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#1b2537] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-300">Correo</span>
                  <input
                    type="email"
                    value={signupForm.email}
                    onChange={(e) => setSignupForm((f) => ({ ...f, email: e.target.value }))}
                    required
                    placeholder="correo@ejemplo.com"
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#1b2537] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-300">Servicio</span>
                  <select
                    value={signupForm.serviceId}
                    onChange={(e) => setSignupForm((f) => ({ ...f, serviceId: e.target.value }))}
                    required
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#1b2537] px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400"
                  >
                    <option value="">Elegí tu servicio…</option>
                    {SERVICE_DEFINITIONS.filter((s) => !getSepsTemplate(s.id)?.consolidatesFrom).map((s) => (
                      <option key={s.id} value={s.id} className="bg-[#1b2537] text-white">
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-start gap-2.5 pt-1">
                  <input
                    type="checkbox"
                    checked={signupForm.acceptPrivacy}
                    onChange={(e) =>
                      setSignupForm((f) => ({ ...f, acceptPrivacy: e.target.checked }))
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
                  />
                  <span className="text-xs leading-snug text-slate-300">
                    Acepto la{" "}
                    <button
                      type="button"
                      onClick={() => setShowPrivacyModal(true)}
                      className="font-semibold text-cyan-300 underline"
                    >
                      Política de Privacidad y Términos de Uso
                    </button>
                  </span>
                </label>

                {error ? (
                  <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmittingSignup}
                  className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/30 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmittingSignup ? "Enviando…" : "Enviar solicitud"}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal de POLITICA DE PRIVACIDAD. */}
      {showPrivacyModal ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto p-4"
        >
          <div
            className="modal-fade-in fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setShowPrivacyModal(false)}
          />
          <div className="modal-pop-in relative my-6 w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0e1626] shadow-2xl shadow-black/60">
            <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
            <div className="px-5 pb-6 pt-5 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-white">Política de Privacidad y Términos de Uso — PULSO</h3>
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(false)}
                  aria-label="Cerrar"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                >
                  ✕
                </button>
              </div>
              <div className="mt-4 max-h-[58vh] space-y-3 overflow-y-auto pr-1 text-xs leading-relaxed text-slate-300">
                <p>
                  <strong className="text-white">1. Desarrollo y versión.</strong> PULSO fue
                  desarrollado por el servicio de <strong className="text-cyan-200">ESDOMED</strong>{" "}
                  (Estadística y Documentos Médicos) del Hospital Nacional, El Salvador. Versión
                  1.6.2.6.
                </p>
                <p>
                  <strong className="text-white">2. Qué es PULSO.</strong> Plataforma institucional
                  interna del Hospital Nacional (El Salvador) para la captura, consolidación y
                  gestión de la producción mensual de los servicios (PERC, SEPS y Distribución de
                  Horas). Su uso es exclusivo del personal autorizado.
                </p>
                <p>
                  <strong className="text-white">3. Marco legal aplicable.</strong> El tratamiento de
                  la información en PULSO se enmarca en la normativa salvadoreña vigente, en
                  particular: la <strong className="text-cyan-200">Ley para la Protección de Datos
                  Personales</strong> (Decreto Legislativo N.° 144, del 12 de noviembre de 2024,
                  publicada en el Diario Oficial el 15 de noviembre de 2024); el{" "}
                  <strong className="text-cyan-200">Código de Salud</strong>; la Ley de Deberes y
                  Derechos de los Pacientes y Prestadores de Servicios de Salud; los{" "}
                  <strong className="text-cyan-200">Lineamientos técnicos para el cumplimiento del
                  secreto profesional en el Sistema Nacional Integrado de Salud</strong> (MINSAL,
                  Acuerdo Ejecutivo N.° 2745 de 2022); y la Ley de Acceso a la Información Pública.
                  Asimismo, PULSO se rige por la <strong className="text-cyan-200">Ley de Ética
                  Gubernamental</strong> y por la <strong className="text-cyan-200">Política y el
                  Sistema de Gestión Antisoborno del Ministerio de Salud (MINSAL)</strong>.
                </p>
                <p>
                  <strong className="text-white">4. Datos que recolectamos.</strong> Al registrarse:
                  sus nombres, apellidos, correo y el servicio al que pertenece. Durante el uso, los
                  datos de producción que usted carga y el registro de sus accesos (fecha, hora y
                  usuario) con fines de seguridad y trazabilidad.
                </p>
                <p>
                  <strong className="text-white">5. Base legal del tratamiento.</strong> El
                  tratamiento se sustenta en su <strong className="text-white">consentimiento
                  informado</strong> —otorgado al aceptar esta política— y en el cumplimiento de las
                  obligaciones legales e institucionales del hospital como entidad pública de salud.
                </p>
                <p>
                  <strong className="text-white">6. Finalidad.</strong> Los datos se usan únicamente
                  para identificarlo, crear su usuario y gestionar la captura mensual de su servicio.
                  No se usan con fines comerciales ni publicitarios, ni se someten a decisiones
                  automatizadas que le afecten.
                </p>
                <p>
                  <strong className="text-white">7. Confidencialidad y secreto profesional.</strong>{" "}
                  La información gestionada en PULSO tiene carácter institucional y confidencial.
                  Todo usuario queda obligado a resguardar el secreto profesional conforme a los
                  Lineamientos del MINSAL y al Código de Salud, absteniéndose de divulgar, reproducir
                  o extraer datos fuera de los fines autorizados, tanto durante como después de su
                  vínculo con la institución.
                </p>
                <p>
                  <strong className="text-white">8. Quién los ve.</strong> Solamente los
                  administradores y supervisores autorizados y usted. No se comparten con terceros
                  ajenos al hospital, salvo requerimiento de autoridad competente conforme a la ley.
                </p>
                <p>
                  <strong className="text-white">9. Dónde se guardan y seguridad.</strong> De forma
                  segura en los servicios de Google Firebase, con acceso restringido por usuario y
                  contraseña y comunicaciones cifradas. Se aplican medidas técnicas y organizativas
                  razonables para proteger la información.
                </p>
                <p>
                  <strong className="text-white">10. Conservación.</strong> Sus datos se conservan
                  mientras su cuenta esté activa y por el plazo que exijan las obligaciones legales,
                  contables y de archivo de la institución. Concluido ese plazo, se eliminan o
                  anonimizan.
                </p>
                <p>
                  <strong className="text-white">11. Sus derechos (ARCO-POL).</strong> Conforme a la
                  Ley para la Protección de Datos Personales, usted puede ejercer sus derechos de{" "}
                  <strong className="text-white">acceso, rectificación, cancelación, oposición,
                  portabilidad, olvido (supresión en entornos digitales) y limitación</strong> del
                  tratamiento. Puede solicitarlos a la administración, que atenderá su petición
                  dentro de los plazos que fija la ley.
                </p>
                <p>
                  <strong className="text-white">12. Incidentes de seguridad.</strong> Ante una
                  vulneración que afecte sus datos personales, la institución adoptará las medidas
                  correctivas y realizará las notificaciones que correspondan conforme a la ley.
                </p>
                <p>
                  <strong className="text-white">13. Aprobación de la cuenta.</strong> El registro no
                  es automático: su solicitud queda pendiente hasta que un administrador la apruebe.
                </p>
                <p>
                  <strong className="text-white">14. Responsabilidad del usuario.</strong> Usted es
                  el único responsable de la información que ingresa. Se compromete a que los datos
                  de producción y demás registros que cargue sean veraces, completos y correspondan a
                  su servicio. El uso de su usuario y contraseña es personal e intransferible;
                  cualquier dato ingresado con sus credenciales se considera realizado por usted. La
                  administración no se hace responsable por errores u omisiones en la información
                  cargada por cada usuario.
                </p>
                <p>
                  <strong className="text-white">15. Uso permitido y usos prohibidos.</strong> PULSO
                  es exclusivo para la gestión de la producción de los servicios del hospital. Queda{" "}
                  <strong className="text-white">prohibido</strong>: ingresar información falsa o
                  alterada; usar el sistema para fines distintos a los autorizados; compartir,
                  ceder o revelar sus credenciales; intentar acceder a datos de otros usuarios o
                  servicios sin autorización; y extraer, copiar o divulgar información confidencial
                  de la institución.
                </p>
                <p>
                  <strong className="text-white">16. Consecuencias del mal uso.</strong> El
                  incumplimiento de esta política o el uso indebido del sistema puede dar lugar a la
                  suspensión o cancelación de la cuenta y a las responsabilidades administrativas,
                  disciplinarias, civiles o penales que establezca la legislación salvadoreña
                  aplicable.
                </p>
                <p>
                  <strong className="text-white">17. Compromiso antisoborno y anticorrupción
                  (MINSAL).</strong> El Hospital Nacional adhiere a la Ley de Ética Gubernamental,
                  al Sistema de Gestión Antisoborno del Ministerio de Salud (MINSAL) y a los
                  estándares internacionales en la materia (norma ISO 37001). Aplicado al uso de
                  PULSO, queda estrictamente <strong className="text-white">prohibido</strong>{" "}
                  ofrecer, prometer, solicitar, dar o aceptar —directa o indirectamente— dinero,
                  dádivas, regalos, comisiones, favores o cualquier ventaja indebida para:{" "}
                  <strong className="text-white">(a)</strong> registrar, alterar, inflar, disminuir,
                  ocultar, agilizar u omitir datos de producción;{" "}
                  <strong className="text-white">(b)</strong> aprobar cuentas, otorgar o ampliar
                  permisos, o habilitar/cerrar tableros de captura fuera de los criterios
                  institucionales; <strong className="text-white">(c)</strong> modificar o emitir
                  consolidados que no reflejen la realidad; o{" "}
                  <strong className="text-white">(d)</strong> favorecer indebidamente a un servicio,
                  usuario o tercero. Se prohíbe además manipular o falsear información para obtener
                  beneficios propios o de terceros o para encubrir irregularidades, así como todo
                  acto de corrupción, tráfico de influencias o conflicto de interés.
                </p>
                <p>
                  <strong className="text-white">18. Deber de denuncia y no represalia.</strong>{" "}
                  Todo usuario que tenga conocimiento o sospecha razonable de un acto de soborno o
                  corrupción relacionado con PULSO debe informarlo por los canales institucionales
                  del MINSAL y del hospital (incluida la Unidad de Ética o la que haga sus veces).
                  La institución garantiza la confidencialidad del denunciante de buena fe y
                  prohíbe toda represalia en su contra. El incumplimiento de estas normas
                  antisoborno puede derivar en responsabilidades administrativas, disciplinarias,
                  civiles y penales conforme a la legislación salvadoreña.
                </p>
                <p>
                  <strong className="text-white">19. Seguridad de su cuenta.</strong> Mantenga su
                  contraseña en secreto y cámbiela en su primer ingreso. Si sospecha que alguien
                  conoce sus credenciales, avise de inmediato a la administración.
                </p>
                <p>
                  <strong className="text-white">20. Contacto y ejercicio de derechos.</strong> Para
                  ejercer sus derechos, corregir o eliminar sus datos, o realizar consultas sobre
                  esta política, comuníquese con la administración del sistema a través del servicio
                  de ESDOMED del Hospital Nacional, El Salvador.
                </p>
                <p>
                  <strong className="text-white">21. Cambios en esta política.</strong> Esta política
                  puede actualizarse para reflejar mejoras del sistema o cambios normativos. El uso
                  continuado de PULSO implica la aceptación de la versión vigente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSignupForm((f) => ({ ...f, acceptPrivacy: true }));
                  setShowPrivacyModal(false);
                }}
                className="mt-4 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Entendido y acepto
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <LoginLoadingModal show={loginLoading} />
    </main>
  );
}
