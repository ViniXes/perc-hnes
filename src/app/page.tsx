"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
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
  type SepsTemplate,
} from "@/lib/seps-templates";

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

type PublicDashboardService = ServiceDefinition & {
  completed: boolean;
};

type PublicDashboardGroup = {
  id: string;
  title: string;
  services: PublicDashboardService[];
};

const DEFAULT_TEMP_PASSWORD = "PERC2026!";
const ADMIN_USERNAME = "Hcardoza";
const ADMIN_PASSWORD = "Cardoza1986";
const ADMIN_EMAIL = "hcardoza.admin@perc-hnes.app";

// Cuentas de supervisor fijas en codigo (mismo modelo que el admin). Su unica
// potestad es habilitar/deshabilitar tableros de los modulos indicados. La cuenta
// Firebase se auto-crea en el primer login con la clave temporal (la cambian luego).
type SupervisorAccount = {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  modules: ModuleId[];
};

const SUPERVISOR_ACCOUNTS: SupervisorAccount[] = [
  {
    username: "sup.flor",
    password: DEFAULT_TEMP_PASSWORD,
    firstName: "Flor de Maria",
    lastName: "Fuentes Urbina",
    modules: ["perc", "sesps", "distribucion"],
  },
  {
    username: "sup.roberto",
    password: DEFAULT_TEMP_PASSWORD,
    firstName: "Dr. Roberto",
    lastName: "Cenento Zambrano",
    modules: ["perc", "sesps", "distribucion"],
  },
  {
    username: "sup.juancarlos",
    password: DEFAULT_TEMP_PASSWORD,
    firstName: "Juan Carlos",
    lastName: "Miranda Marroquin",
    modules: ["sesps"],
  },
];
const FIRESTORE_SETUP_MESSAGE = `Firestore no esta creado o configurado en este proyecto de Firebase. Verifica la base de datos '${firestoreDatabaseId}' para habilitar login, tablero y guardado.`;
const FIRESTORE_DISABLED_STORAGE_KEY = "perc-hnes.firestore-disabled";
const PANEL_THEME_STORAGE_KEY = "perc-hnes.panel-theme";
const ADMIN_USERS_CACHE_STORAGE_KEY = "perc-hnes.admin-users-cache";

const SERVICE_GROUP_LABELS: Record<string, string> = {
  direccion: "Direccion",
  apoyo: "Division de Apoyo",
  medica: "Division Medica",
  enfermeria: "Division de Enfermeria",
  administrativa: "Subdireccion Administrativa",
};

const SERVICE_GROUP_BY_ID: Record<string, keyof typeof SERVICE_GROUP_LABELS> = {
  almacen: "direccion",
  "almacen-medicamentos": "direccion",
  "docencia-e-investigacion": "direccion",
  "servicio-farmaceutico": "direccion",
  "trabajo-social": "apoyo",
  "laboratorio-clinico": "apoyo",
  "laboratorio-de-biologia-molecular": "apoyo",
  "banco-de-sangre": "apoyo",
  "alimentacion-y-dieta": "apoyo",
  "estudio-de-radiologia": "medica",
  "resonancia-magnetica": "medica",
  tomografia: "medica",
  ultrasonografia: "medica",
  "estudios-gastroclinicos": "medica",
  "unidad-de-hemodinamia": "medica",
  hemodialisis: "medica",
  "hemodialisis-medicina-interna": "medica",
  "terapia-fisica": "medica",
  "terapia-respiratoria": "medica",
  "rehabilitacion-pulmonar": "medica",
  "rehablitacion-psicosocial": "medica",
  vacunacion: "medica",
  "central-de-esterilizacion": "enfermeria",
  aseo: "administrativa",
  lavanderia: "administrativa",
  "transporte-general": "administrativa",
  mantenimiento: "administrativa",
  "saneamiento-ambiental": "administrativa",
};

const SERVICE_USERNAME_BY_ID: Record<string, string> = {
  vacunacion: "dep.vacunacion",
  "laboratorio-clinico": "dep.laboratorio",
  "laboratorio-de-biologia-molecular": "dep.biologia",
  "resonancia-magnetica": "dep.resonancia",
  tomografia: "dep.tomografia",
  "estudio-de-radiologia": "dep.radiologia",
  ultrasonografia: "dep.ultrasonografia",
  "estudios-gastroclinicos": "dep.gastro",
  "terapia-fisica": "dep.fisioterapia",
  "terapia-respiratoria": "dep.terapiaresp",
  "rehabilitacion-pulmonar": "dep.rehabpulmonar",
  "banco-de-sangre": "dep.bancosangre",
  "unidad-de-hemodinamia": "dep.hemodinamia",
  hemodialisis: "dep.hemodialisis",
  "hemodialisis-medicina-interna": "dep.hemodialisis.mi",
  "servicio-farmaceutico": "dep.farmacia",
  "rehablitacion-psicosocial": "dep.psicosocial",
  "alimentacion-y-dieta": "dep.alimentacion",
  "central-de-esterilizacion": "dep.esterilizacion",
  "saneamiento-ambiental": "dep.saneamiento",
  aseo: "dep.aseo",
  almacen: "dep.almacen",
  "almacen-medicamentos": "dep.almacen.med",
  lavanderia: "dep.lavanderia",
  "transporte-general": "dep.transporte",
  mantenimiento: "dep.mantenimiento",
  "trabajo-social": "dep.trabajosocial",
  "docencia-e-investigacion": "dep.docencia",
};

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

const IconSun = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M18.9 5.1l-1.8 1.8M6.9 17.1l-1.8 1.8" />
  </svg>
);

// Icono por id de item del sidebar. Lo que no esta aqui conserva su badge de letras
// (PERC -> PE, SEPS -> SE, etc., segun pidio el usuario).
const SIDEBAR_ICON_BY_ID: Record<string, ReactNode> = {
  "panel-overview": IconHome,
  "panel-module-distribucion": IconClock,
  "panel-calendar": IconGear,
  "panel-admin-export": IconFile,
  "panel-users": IconUsers,
  "panel-capture-toggle": IconKey,
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-HN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
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
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes(`Database '${firestoreDatabaseId}' not found`) ||
    message.includes("Database '(default)' not found") ||
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

function buildEmptyTable(service: ServiceDefinition): TableValues {
  const table: TableValues = Object.fromEntries(
    service.rows.map((row) => [
      row,
      Object.fromEntries(TABULATOR_HEADERS.map((header) => [header, ""])),
    ]),
  );

  applyFixedValues(table);
  return table;
}

function mergeWithTemplate(
  service: ServiceDefinition,
  savedValues?: Record<string, Record<string, unknown>>,
) {
  const template = buildEmptyTable(service);

  if (!savedValues) {
    return template;
  }

  for (const row of service.rows) {
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

  return {
    openDays,
    totalDays,
    isOpen: activeDayIndex >= 0,
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
  const inClosing = closeDays.some((day) => isSameCalendarDay(day, referenceDate));
  const calendarDay = referenceDate.getDate();
  const reopenDay = 6;

  let phase: SepsPhase;
  if (inClosing) {
    phase = "cierre";
  } else if (calendarDay >= reopenDay) {
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
    reopenDay,
    lastCloseDay: closeDays[closeDays.length - 1],
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

function sanitizeNumericValue(value: string) {
  return value.replace(/[^0-9]/g, "");
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
  const documentHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>Consolidado ${periodId}</title></head><body><table>${`<thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody>`}</table></body></html>`;
  const blob = new Blob(["\ufeff", documentHtml], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");

  link.href = url;
  link.download = `consolidado-${periodId}.xls`;
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

async function fetchSavedDataForPeriod(service: ServiceDefinition, periodId: string) {
  const snapshot = await getDoc(doc(db, "serviceTabulators", `${periodId}__${service.id}`));

  if (!snapshot.exists()) {
    return buildEmptyTable(service);
  }

  const data = snapshot.data() as {
    values?: Record<string, Record<string, unknown>>;
  };

  return mergeWithTemplate(service, data.values);
}

// ---- SEPS (tabuladores diarios) -------------------------------------------
// values: Record<rowKey, Record<dayStr, valor>>. Las filas readOnly no se guardan
// (se recalculan en vivo). Doc id en coleccion "sepsTabulators".
type SepsValues = Record<string, Record<string, string>>;

function buildEmptySeps(template: SepsTemplate, periodId: string): SepsValues {
  const days = getDayColumns(periodId);
  const values: SepsValues = {};

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
): SepsValues {
  const values = buildEmptySeps(template, periodId);

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

async function fetchSepsDataForPeriod(
  template: SepsTemplate,
  periodId: string,
): Promise<SepsValues> {
  const snapshot = await getDoc(
    doc(db, "sepsTabulators", `${periodId}__${template.serviceId}`),
  );

  if (!snapshot.exists()) {
    return buildEmptySeps(template, periodId);
  }

  const data = snapshot.data() as { values?: Record<string, Record<string, unknown>> };
  return mergeSepsWithTemplate(template, periodId, data.values);
}

function hasAnySepsValue(values: SepsValues | undefined) {
  if (!values) {
    return false;
  }

  return Object.values(values).some((row) =>
    Object.values(row || {}).some((cell) => String(cell ?? "").trim() !== ""),
  );
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
  const [calendarOverrides, tabulatorsSnapshot] = await Promise.all([
    fetchCalendarOverridesForYear(year),
    getDocs(
      query(
        collection(db, "serviceTabulators"),
        where("periodId", ">=", `${year}-01`),
        where("periodId", "<=", `${year}-12`),
      ),
    ),
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
    services: group.services.map((service) => ({
      ...service,
      completed: currentCompletedServices.has(service.id),
    })),
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
      role: "supervisor",
      isActive: true,
      mustChangePassword: true,
      permissions: getDefaultPermissions("supervisor"),
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
    role: "supervisor",
    isActive: true,
    mustChangePassword: true,
    permissions: getDefaultPermissions("supervisor"),
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

  return normalizedIdentifier;
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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [serviceProfile, setServiceProfile] = useState<ManagedUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [tableValues, setTableValues] = useState<TableValues>({});
  const [sepsValues, setSepsValues] = useState<SepsValues>({});
  const [isSavingSeps, setIsSavingSeps] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [adminUsers, setAdminUsers] = useState<ManagedUser[]>([]);
  const [adminDrafts, setAdminDrafts] = useState<Record<string, AdminDraft>>({});
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreatingManagedUser, setIsCreatingManagedUser] = useState(false);
  const [isExportingMonthlyReport, setIsExportingMonthlyReport] = useState(false);
  const [adminBusyUserId, setAdminBusyUserId] = useState("");
  const [calendarOverrides, setCalendarOverrides] = useState<Record<string, string[]>>({});
  const [publicDashboardMonths, setPublicDashboardMonths] = useState<PublicDashboardMonth[]>([]);
  const [publicDashboardGroups, setPublicDashboardGroups] = useState<PublicDashboardGroup[]>([]);
  const [publicCompletedCount, setPublicCompletedCount] = useState(0);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [calendarEditorPeriodId, setCalendarEditorPeriodId] = useState(() => getPeriodId(new Date()));
  const [calendarDraftDate, setCalendarDraftDate] = useState("");
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);
  // Overrides de tableros (reabiertos/cerrados) por id `${periodId}__${serviceId}__${moduleId}`.
  const [captureOverrides, setCaptureOverrides] = useState<CaptureOverridesMap>({});
  // Default = periodo que se esta cerrando (mes anterior), que es el ciclo activo.
  const [overridePanelPeriodId, setOverridePanelPeriodId] = useState(() =>
    getClosingPeriodId(new Date()),
  );
  const [overrideBusyKey, setOverrideBusyKey] = useState("");
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

  const currentService = useMemo(
    () => getServiceById(serviceProfile?.serviceId),
    [serviceProfile?.serviceId],
  );
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
  const welcomeName = useMemo(() => {
    return serviceProfile?.name || user?.displayName || user?.email?.split("@")[0] || "Usuario";
  }, [serviceProfile?.name, user?.displayName, user?.email]);
  const isAdmin = !!serviceProfile?.permissions.canManageUsers || serviceProfile?.role === "admin";
  const isSupervisor = serviceProfile?.role === "supervisor";
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
    () => getSepsTemplate(serviceProfile?.serviceId),
    [serviceProfile?.serviceId],
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
        }
        return;
      }

      try {
        const values = await fetchSepsDataForPeriod(sepsTemplate, sepsPeriodId);
        if (!cancelled) {
          setSepsValues(values);
        }
      } catch (sepsError) {
        if (await handleFirestoreError(sepsError)) {
          return;
        }
        if (!cancelled) {
          setSepsValues(buildEmptySeps(sepsTemplate, sepsPeriodId));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sepsTemplate, sepsPeriodId, firestoreUnavailable, user]);

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

        const profileSnapshot = await getDoc(doc(db, "serviceUsers", user.uid));

        if (cancelled) {
          return;
        }

        if (!profileSnapshot.exists()) {
          // Primer ingreso de un supervisor: el perfil aun puede no estar escrito.
          // Usamos el perfil sembrado y disparamos la escritura en segundo plano.
          const supervisorAccount = findSupervisorAccountByLoginEmail(user.email);

          if (supervisorAccount) {
            setServiceProfile(buildSupervisorProfile(user.uid, supervisorAccount));
            setTableValues({});
            setError("");
            void ensureSupervisorProfile(user, supervisorAccount).catch(() => {
              // Ignore background supervisor profile sync failures during bootstrap.
            });
            return;
          }

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
          const values = await fetchSavedDataForPeriod(matchedService, periodId);
          if (!cancelled) {
            setTableValues(values);
          }
        } else if (!cancelled) {
          setTableValues({});
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
      const values = await fetchSavedDataForPeriod(currentService, periodId);
      const isEmpty = Object.values(values).every((row) =>
        Object.values(row).every((cell) => cell === ""),
      );

      setTableValues(values);

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

  function handleAddBlockedDate() {
    if (!calendarEditorPeriodId || !calendarDraftDate.startsWith(calendarEditorPeriodId)) {
      setError("Selecciona una fecha que pertenezca al mes configurado.");
      return;
    }

    setCalendarOverrides((currentOverrides) => {
      const currentDates = currentOverrides[calendarEditorPeriodId] || [];

      if (currentDates.includes(calendarDraftDate)) {
        return currentOverrides;
      }

      return {
        ...currentOverrides,
        [calendarEditorPeriodId]: [...currentDates, calendarDraftDate].sort(),
      };
    });
    setCalendarDraftDate("");
    setError("");
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
  ) {
    if (!serviceProfile?.permissions.canToggleCapture || firestoreUnavailable) {
      return;
    }

    if (!isAdmin && !serviceProfile.supervisorModules.includes(moduleId)) {
      return;
    }

    const overrideId = getCaptureOverrideId(overridePanelPeriodId, serviceId, moduleId);
    setOverrideBusyKey(overrideId);
    setError("");
    setMessage("");

    try {
      if (nextState === null) {
        await deleteDoc(doc(db, "captureOverrides", overrideId));
      } else {
        await setDoc(doc(db, "captureOverrides", overrideId), {
          periodId: overridePanelPeriodId,
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
          ? "Tablero habilitado para captura."
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

    if (!serviceProfile.permissions.canEdit) {
      setError("Tu cuenta no tiene permiso de captura en este momento.");
      setMessage("");
      return;
    }

    if (!currentServiceCaptureOpen) {
      setError("El periodo de captura esta cerrado para este mes.");
      setMessage("");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    const normalizedValues = mergeWithTemplate(currentService, tableValues);

    try {
      await setDoc(
        doc(db, "serviceTabulators", `${periodId}__${currentService.id}`),
        {
          periodId,
          periodLabel,
          serviceId: currentService.id,
          serviceName: currentService.name,
          headers: TABULATOR_HEADERS,
          rows: currentService.rows,
          userId: user.uid,
          userEmail: user.email || "",
          values: normalizedValues,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setTableValues(normalizedValues);
      await refreshPublicDashboard(false);

      setMessage(`Datos guardados correctamente para ${currentService.name}.`);
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

  async function handleSaveSeps() {
    if (!user || !sepsTemplate || !serviceProfile || firestoreUnavailable) {
      return;
    }

    if (!serviceProfile.permissions.canEdit) {
      setError("Tu cuenta no tiene permiso de captura en este momento.");
      setMessage("");
      return;
    }

    if (!sepsCaptureOpen) {
      setError("La captura SEPS esta cerrada en este momento.");
      setMessage("");
      return;
    }

    setIsSavingSeps(true);
    setError("");
    setMessage("");

    const normalizedValues = mergeSepsWithTemplate(sepsTemplate, sepsPeriodId, sepsValues);

    try {
      await setDoc(
        doc(db, "sepsTabulators", `${sepsPeriodId}__${sepsTemplate.serviceId}`),
        {
          periodId: sepsPeriodId,
          periodLabel: sepsPeriodLabel,
          module: "sesps",
          serviceId: sepsTemplate.serviceId,
          serviceName: currentService?.name || sepsTemplate.serviceId,
          userId: user.uid,
          userEmail: user.email || "",
          values: normalizedValues,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setSepsValues(normalizedValues);
      setMessage(`Tabulador SEPS guardado correctamente (${sepsPeriodLabel}).`);
    } catch (saveError) {
      if (await handleFirestoreError(saveError)) {
        return;
      }

      setError("No pudimos guardar el tabulador SEPS. Revisa Firestore e intentalo de nuevo.");
    } finally {
      setIsSavingSeps(false);
    }
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
          const values = await fetchSavedDataForPeriod(updatedService, periodId);
          setTableValues(values);
        } else {
          setTableValues({});
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
    const section = window.document.getElementById(sectionId);

    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
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
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className={`text-sm uppercase tracking-[0.2em] ${isLightPanelTheme ? "text-sky-700" : "text-cyan-200/80"}`}>
              Configuracion mensual
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Modificar dias habiles por mes</h2>
            <p className={`mt-2 max-w-3xl text-sm ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
              Configura arriba el calendario operativo del mes. El sistema movera la captura a los
              siguientes dias habiles si agregas cierres, feriados o vacaciones.
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
          <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Mes a configurar</span>
              <input
                value={calendarEditorPeriodId}
                onChange={(event) => setCalendarEditorPeriodId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none focus:border-cyan-400"
                type="month"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-200">Agregar fecha no habil</span>
              <input
                value={calendarDraftDate}
                onChange={(event) => setCalendarDraftDate(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none focus:border-cyan-400"
                type="date"
              />
            </label>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleAddBlockedDate}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Agregar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveCalendarOverride()}
                disabled={isSavingCalendar}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800"
              >
                {isSavingCalendar ? "Guardando..." : "Guardar calendario"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-4">
              <h3 className="text-lg font-semibold text-white">Fechas excluidas</h3>
              <p className="mt-2 text-sm text-slate-300">
                Usa esta lista para vacaciones, feriados extraordinarios o cierres.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {calendarEditorBlockedDates.length > 0 ? (
                  calendarEditorBlockedDates.map((dateKey) => (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => handleRemoveBlockedDate(dateKey)}
                      className="rounded-full border border-rose-400/40 bg-rose-950/30 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-900/40"
                    >
                      {dateKey} ×
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No hay fechas excluidas para este mes.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-4">
              <h3 className="text-lg font-semibold text-white">Vista previa</h3>
              <p className="mt-2 text-sm text-slate-300">
                Primeros dias habiles que quedaran abiertos para captura.
              </p>

              <div className="mt-4 space-y-2">
                {calendarPreviewWindow ? (
                  calendarPreviewWindow.openDays.map((day, index) => (
                    <div
                      key={getDateKey(day)}
                      className="rounded-xl border border-cyan-400/20 bg-cyan-950/20 px-3 py-2 text-sm text-cyan-100"
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
    for (const service of SERVICE_DEFINITIONS) {
      for (const moduleId of toggleableModules) {
        const cellState =
          captureOverrides[getCaptureOverrideId(overridePanelPeriodId, service.id, moduleId)];
        if (cellState === "open") {
          overrideOpenCount += 1;
        } else if (cellState === "closed") {
          overrideClosedCount += 1;
        }
      }
    }
    const overrideTotalCells = SERVICE_DEFINITIONS.length * toggleableModules.length;
    const overrideAutoCount = overrideTotalCells - overrideOpenCount - overrideClosedCount;

    const overrideStateSelect = (service: ServiceDefinition, moduleId: ModuleId) => {
      const overrideId = getCaptureOverrideId(overridePanelPeriodId, service.id, moduleId);
      const state = captureOverrides[overrideId];
      const isBusy = overrideBusyKey === overrideId;
      const tone =
        state === "open"
          ? isLightPanelTheme
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
          : state === "closed"
            ? isLightPanelTheme
              ? "border-rose-300 bg-rose-50 text-rose-700"
              : "border-rose-400/40 bg-rose-500/15 text-rose-200"
            : isLightPanelTheme
              ? "border-slate-200 bg-white text-slate-500"
              : "border-white/10 bg-white/5 text-slate-300";

      return (
        <select
          value={state ?? "auto"}
          disabled={isBusy}
          onChange={(event) => {
            const value = event.target.value;
            void handleToggleCapture(
              service.id,
              moduleId,
              value === "auto" ? null : (value as CaptureOverrideState),
            );
          }}
          className={`w-full cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-amber-400/40 disabled:opacity-50 ${tone}`}
        >
          <option value="auto">● Automatico</option>
          <option value="open">▲ Abrir</option>
          <option value="closed">■ Cerrar</option>
        </select>
      );
    };

    const captureToggleSection = serviceProfile.permissions.canToggleCapture ? (
      <section
        id="panel-capture-toggle"
        className={`rounded-[24px] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)] ${
          isLightPanelTheme
            ? "border border-slate-200 bg-white text-slate-900"
            : "border border-amber-400/20 bg-[#202c41]"
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className={`text-sm uppercase tracking-[0.2em] ${isLightPanelTheme ? "text-amber-700" : "text-amber-200/80"}`}>
              Habilitar tableros
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Reabrir o cerrar captura por servicio</h2>
            <p className={`mt-2 max-w-3xl text-sm ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
              Cambia el estado de un servicio por modulo. <strong>Automatico</strong> sigue la
              ventana normal de dias habiles; <strong>Abrir</strong> reabre la captura tardia y{" "}
              <strong>Cerrar</strong> la bloquea.
            </p>
          </div>
          <label className="block shrink-0">
            <span className={`text-sm font-medium ${isLightPanelTheme ? "text-slate-700" : "text-slate-200"}`}>
              Mes
            </span>
            <input
              value={overridePanelPeriodId}
              onChange={(event) => setOverridePanelPeriodId(event.target.value)}
              className={`mt-2 w-full rounded-2xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 ${
                isLightPanelTheme
                  ? "border border-slate-200 bg-white text-slate-900"
                  : "border border-white/10 bg-[#2a3448] text-white"
              }`}
              type="month"
            />
          </label>
        </div>

        {/* Resumen de estado + buscador */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            className={`w-full rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 sm:w-64 ${
              isLightPanelTheme
                ? "border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
                : "border border-white/10 bg-[#2a3448] text-white placeholder:text-slate-500"
            }`}
            type="search"
          />
        </div>

        {/* Grupos por division */}
        <div className="mt-5 space-y-4">
          {overrideGroups.length === 0 ? (
            <p className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${isLightPanelTheme ? "border-slate-200 text-slate-500" : "border-white/10 text-slate-400"}`}>
              Ningun servicio coincide con la busqueda.
            </p>
          ) : (
            overrideGroups.map((group) => (
              <div
                key={group.id}
                className={`overflow-hidden rounded-2xl border ${isLightPanelTheme ? "border-slate-200" : "border-white/10 bg-[#1b2537]"}`}
              >
                <div className={`flex items-center justify-between px-4 py-2.5 ${isLightPanelTheme ? "bg-slate-50" : "bg-white/5"}`}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide">{group.title}</h3>
                  <span className={`text-xs ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                    {group.services.length} servicio{group.services.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className={isLightPanelTheme ? "text-slate-500" : "text-slate-400"}>
                        <th className="px-4 py-2 text-xs font-medium">Servicio</th>
                        {toggleableModules.map((moduleId) => (
                          <th key={moduleId} className="w-36 px-3 py-2 text-center text-xs font-medium">
                            {MODULE_BY_ID[moduleId].shortName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.services.map((service) => (
                        <tr
                          key={service.id}
                          className={`border-t ${isLightPanelTheme ? "border-slate-100 hover:bg-slate-50/60" : "border-white/5 hover:bg-white/5"}`}
                        >
                          <td className="px-4 py-2 font-medium">{service.name}</td>
                          {toggleableModules.map((moduleId) => (
                            <td key={moduleId} className="px-3 py-2">
                              {overrideStateSelect(service, moduleId)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
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
    const sepsPhaseLabel =
      sepsWindow.phase === "cierre"
        ? `Cierre del mes ${sepsPeriodLabel} (hasta el 3er dia habil)`
        : sepsWindow.phase === "captura"
          ? `Captura diaria del mes ${sepsPeriodLabel}`
          : "Captura cerrada (se reabre el dia 6)";

    const sepsSection = sepsTemplate ? (
      <section
        id="panel-seps"
        className="rounded-[24px] border border-cyan-400/20 bg-[#202c41] p-5 text-slate-100 shadow-[0_24px_80px_rgba(3,7,18,0.35)]"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Tabulador SEPS</p>
            <h2 className="mt-2 text-2xl font-semibold">
              {currentService?.name || sepsTemplate.serviceId} — {sepsPeriodLabel}
            </h2>
            <p className="mt-1 text-sm text-slate-300">{sepsTemplate.establishment}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                sepsLocked ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/15 text-emerald-200"
              }`}
            >
              {sepsLocked ? "BLOQUEADO" : "HABILITADO"}
            </span>
            <button
              type="button"
              onClick={() => void handleSaveSeps()}
              disabled={isSavingSeps || sepsLocked}
              className="rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800/80"
            >
              {isSavingSeps ? "Guardando..." : "Guardar SEPS"}
            </button>
          </div>
        </div>

        <p className="mt-3 rounded-xl border border-white/10 bg-[#1b2537] px-4 py-2 text-sm text-slate-200">
          {sepsPhaseLabel}. Los totales y la fila de suma se calculan solos.
        </p>

        <div className="mt-5 space-y-6">
          {sepsTemplate.tables.map((table) => {
            const hasGroups = table.rows.some((row) => row.group);
            // rowSpan por grupo (solo en la primera fila del grupo).
            const groupSpan: Record<number, number> = {};
            for (let i = 0; i < table.rows.length; ) {
              const g = table.rows[i].group;
              if (!g) {
                i += 1;
                continue;
              }
              let j = i;
              while (j < table.rows.length && table.rows[j].group === g) {
                j += 1;
              }
              groupSpan[i] = j - i;
              for (let k = i + 1; k < j; k += 1) {
                groupSpan[k] = 0;
              }
              i = j;
            }

            return (
              <div key={table.id} className="overflow-hidden rounded-2xl border border-white/10">
                <div className="bg-white/5 px-4 py-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide">{table.title}</h3>
                  {table.subtitle ? (
                    <p className="mt-1 text-xs text-slate-300">{table.subtitle}</p>
                  ) : null}
                </div>
                <div className="overflow-x-auto">
                  <table className="border-collapse text-xs text-slate-100">
                    <thead>
                      <tr className="bg-white/5 text-slate-300">
                        {hasGroups ? (
                          <th className="sticky left-0 z-10 bg-[#243049] px-3 py-2 text-left font-medium">
                            Grupo
                          </th>
                        ) : null}
                        <th
                          className={`${hasGroups ? "" : "sticky left-0 z-10 bg-[#243049]"} px-3 py-2 text-left font-medium`}
                        >
                          {table.detailLabel || "Detalle"}
                        </th>
                        {sepsDayColumns.map((day) => (
                          <th key={day} className="w-10 px-1 py-2 text-center font-medium">
                            {day}
                          </th>
                        ))}
                        <th className="bg-[#243049] px-3 py-2 text-center font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, index) => (
                        <tr key={row.key} className="border-t border-white/5">
                          {hasGroups && groupSpan[index] !== 0 ? (
                            <td
                              rowSpan={groupSpan[index] || 1}
                              className="sticky left-0 z-10 bg-[#1b2537] px-3 py-1.5 align-middle font-medium"
                            >
                              {row.group}
                            </td>
                          ) : null}
                          <td
                            className={`${hasGroups ? "" : "sticky left-0 z-10 bg-[#1b2537]"} whitespace-nowrap px-3 py-1.5 ${
                              row.readOnly ? "font-semibold text-cyan-200" : ""
                            }`}
                            style={row.indent ? { paddingLeft: `${12 + row.indent * 14}px` } : undefined}
                          >
                            {row.label}
                          </td>
                          {sepsDayColumns.map((day) => (
                            <td key={day} className="px-0.5 py-1 text-center">
                              {row.readOnly ? (
                                <span className="block w-9 text-center text-cyan-200">
                                  {sepsDayCell(row, day) || ""}
                                </span>
                              ) : (
                                <input
                                  value={sepsValues[row.key]?.[day] ?? ""}
                                  onChange={(event) =>
                                    handleSepsCellChange(row.key, day, event.target.value)
                                  }
                                  disabled={sepsLocked}
                                  inputMode="numeric"
                                  className="w-9 rounded border border-white/10 bg-[#1b2537] px-1 py-1 text-center text-xs outline-none focus:border-cyan-400 disabled:opacity-50"
                                />
                              )}
                            </td>
                          ))}
                          <td className="bg-[#243049] px-3 py-1.5 text-center font-semibold text-cyan-100">
                            {sepsRowTotal(row)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
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
    const currentArea = getAreaById(serviceProfile.serviceId);
    const visibleModules: ModuleDefinition[] = isAdmin
      ? MODULE_DEFINITIONS
      : currentArea
        ? getAreaModules(currentArea)
        : [];
    const getModuleUiStatus = (mod: ModuleDefinition): "completo" | "incompleto" => {
      if (mod.id === "distribucion") {
        return hasAnyCapturedValue(tableValues) ? "completo" : "incompleto";
      }

      if (mod.id === "sesps" && sepsTemplate) {
        return hasAnySepsValue(sepsValues) ? "completo" : "incompleto";
      }

      // PERC (y SEPS sin plantilla aun) -> incompleto por defecto.
      return "incompleto";
    };
    const moduleSidebarItems = visibleModules.map((mod) => ({
      id: `panel-module-${mod.id}`,
      label: mod.name,
      detail: "Menu del area",
      badge: moduleBadges[mod.id],
    }));

    const sidebarItems = [
      {
        id: "panel-overview",
        label: "Inicio",
        detail: isAdmin ? "Resumen general" : "Estado del periodo",
        badge: "IN",
      },
      ...moduleSidebarItems,
      ...(sepsTemplate
        ? [
            {
              id: "panel-seps",
              label: "Tabulador SEPS",
              detail: "Captura diaria SEPS",
              badge: "SE",
            },
          ]
        : []),
      ...(currentService
        ? [
            {
              id: "panel-tabulator",
              label: "Mi tabulador",
              detail: "Captura mensual",
              badge: "TB",
            },
          ]
        : []),
      ...(isAdmin
        ? [
            {
              id: "panel-calendar",
              label: "Configuracion mensual",
              detail: "Dias habiles",
              badge: "CM",
            },
            {
              id: "panel-admin-export",
              label: "Excel mensual",
              detail: "Descarga consolidado",
              badge: "XL",
            },
            {
              id: "panel-users",
              label: "Usuarios",
              detail: "Cuentas y permisos",
              badge: "US",
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
          <div className="mb-5">
            <p className={`text-sm uppercase tracking-[0.2em] ${isLightPanelTheme ? "text-sky-700" : "text-cyan-200/80"}`}>
              Menus del area
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Tus menus ({visibleModules.length} de {MODULE_DEFINITIONS.length})
            </h2>
            <p className={`mt-2 max-w-3xl text-sm ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
              {isAdmin
                ? "Como administrador ves los tres menus. Cada area vera unicamente los que tenga asignados."
                : "Esta area accede solo a los menus mostrados. El control de completo / incompleto aplica a cada uno."}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleModules.map((mod) => {
              const status = getModuleUiStatus(mod);
              const isComplete = status === "completo";

              return (
                <div
                  key={mod.id}
                  id={`panel-module-${mod.id}`}
                  className={`flex flex-col rounded-2xl border p-4 ${
                    isLightPanelTheme
                      ? "border-slate-200 bg-[#f7f9fe]"
                      : "border-white/10 bg-[#1b2537]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1f255f] text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                      {moduleBadges[mod.id]}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isComplete
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-amber-500/15 text-amber-500"
                      }`}
                    >
                      {isComplete ? "Completo" : "Incompleto"}
                    </span>
                  </div>

                  <h3 className={`mt-4 text-lg font-semibold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>
                    {mod.name}
                  </h3>
                  <p className={`mt-2 flex-1 text-sm ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
                    {mod.description}
                  </p>

                  <div className="mt-4">
                    {mod.id === "distribucion" ? (
                      currentService ? (
                        <button
                          type="button"
                          onClick={() => handleSidebarNavigation("panel-tabulator")}
                          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                        >
                          Abrir captura
                        </button>
                      ) : (
                        <p className={`text-xs ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                          Sin tabulador asignado a esta cuenta.
                        </p>
                      )
                    ) : mod.id === "sesps" && sepsTemplate ? (
                      <button
                        type="button"
                        onClick={() => handleSidebarNavigation("panel-seps")}
                        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                      >
                        Abrir captura
                      </button>
                    ) : (
                      <p className={`text-xs ${isLightPanelTheme ? "text-slate-500" : "text-slate-400"}`}>
                        Plantilla pendiente de cargar.
                      </p>
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
        className={`panel-shell ${
          isLightPanelTheme ? "theme-light" : "theme-dark"
        } min-h-screen px-4 py-6 sm:px-7 lg:px-10`}
      >
        <div className="mx-auto grid max-w-[1850px] gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside
            className={`self-start rounded-[24px] p-4 shadow-[0_24px_80px_rgba(3,7,18,0.22)] xl:sticky xl:top-6 ${
              isLightPanelTheme
                ? "border border-slate-200 bg-[#eef2fb] text-slate-900"
                : "border border-white/10 bg-[#1b2537] text-slate-100"
            }`}
          >
            <div className={`pb-4 text-center ${isLightPanelTheme ? "border-b border-slate-200" : "border-b border-white/10"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Hospital Nacional
              </p>
              <p className="mt-0.5 text-[11px] font-medium tracking-[0.16em] text-slate-500">
                El Salvador
              </p>
            </div>

            <div
              className={`mt-4 flex items-center gap-3 rounded-2xl px-3 py-2.5 shadow-sm ${
                isLightPanelTheme ? "bg-white" : "bg-[#202c41]"
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1f255f] text-sm font-bold text-white">
                {serviceProfile.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className={`truncate text-[13px] font-semibold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>{welcomeName}</p>
                <p className="truncate text-xs text-[#4f6aa3]">
                  {currentService?.name || (isAdmin ? "Administrador del sistema" : serviceProfile.email)}
                </p>
              </div>
            </div>

            <nav className="mt-5 space-y-1">
              {sidebarItems.map((item) => {
                const isActive = activeSidebarSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSidebarNavigation(item.id)}
                    title={item.detail}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                      isActive
                        ? "border-[#cad5ee] bg-[#e8eefb] shadow-sm"
                        : isLightPanelTheme
                          ? "border-transparent bg-transparent hover:border-slate-200 hover:bg-white/80"
                          : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        isActive
                          ? "bg-[#1f255f] text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {SIDEBAR_ICON_BY_ID[item.id] ?? item.badge}
                    </span>
                    <span className={`block truncate text-[13px] font-medium ${isLightPanelTheme ? "text-slate-900" : "text-slate-100"}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className={`mt-6 space-y-1 pt-4 ${isLightPanelTheme ? "border-t border-slate-200" : "border-t border-white/10"}`}>
              <button
                type="button"
                onClick={handleTogglePanelTheme}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition ${
                  isLightPanelTheme ? "text-slate-700 hover:bg-white" : "text-slate-200 hover:bg-white/5"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  {isLightPanelTheme ? IconMoon : IconSun}
                </span>
                <span>{isLightPanelTheme ? "Modo oscuro" : "Modo claro"}</span>
              </button>
              <button
                type="button"
                onClick={() => handleSidebarNavigation("panel-security")}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition ${
                  isLightPanelTheme ? "text-slate-700 hover:bg-white" : "text-slate-200 hover:bg-white/5"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  PW
                </span>
                <span>Cambiar contrasena</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-[#8a2d2d] transition hover:bg-white"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fbe8e8] text-[#8a2d2d]">
                  {IconLogout}
                </span>
                <span>Cerrar sesion</span>
              </button>
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            {moduleSections}
            <section
              id="panel-overview"
              className={`rounded-[28px] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.45)] ${
                isLightPanelTheme
                  ? "border border-slate-200 bg-white text-slate-900"
                  : "border border-white/10 bg-[#202c41]"
              }`}
            >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className={`text-sm uppercase tracking-[0.3em] ${isLightPanelTheme ? "text-violet-700" : "text-violet-200/80"}`}>
                  PERC HNES
                </p>
                <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
                  {currentService
                    ? `Ingreso de Datos - ${periodLabel} - ${currentService.name}`
                    : isSupervisor
                      ? "Panel de Supervision"
                      : "Modulo de Administracion"}
                </h1>
                <p className={`mt-3 text-sm sm:text-base ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
                  Usuario: <span className={`font-semibold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>{welcomeName}</span>
                  {" · "}
                  Rol: <span className={`font-semibold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>{isAdmin ? "Administrador" : isSupervisor ? "Supervisor" : "Servicio"}</span>
                  {" · "}
                  Acceso: <span className={`font-semibold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>{serviceProfile.username}</span>
                  {currentService ? (
                    <>
                      {" · "}
                      Servicio: <span className={`font-semibold ${isLightPanelTheme ? "text-slate-900" : "text-white"}`}>{currentService.name}</span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:flex">
                {currentService ? (
                  <>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving || isFormLocked}
                      className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800/80"
                    >
                      {isSaving ? "Guardando..." : "Guardar datos"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadSavedData(true)}
                      disabled={isLoadingData}
                      className="rounded-2xl bg-violet-500/80 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-violet-800/80"
                    >
                      {isLoadingData ? "Recuperando..." : "Recuperar datos"}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearTable}
                      className="rounded-2xl bg-slate-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-500"
                    >
                      Limpiar tabla
                    </button>
                  </>
                ) : null}

                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleExportMonthlyReport()}
                      disabled={isExportingMonthlyReport}
                      className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-300"
                    >
                      {isExportingMonthlyReport ? "Generando Excel..." : "Descargar Excel"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadAdminUsers()}
                      disabled={isLoadingUsers}
                      className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-300"
                    >
                      {isLoadingUsers ? "Actualizando..." : "Actualizar usuarios"}
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-2xl bg-violet-500/80 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
                >
                  Cerrar sesion
                </button>
              </div>
            </div>
            </section>

          {serviceProfile.mustChangePassword ? (
            <section className="rounded-[24px] border border-amber-500/50 bg-amber-950/35 px-5 py-4 text-center text-amber-50 shadow-lg">
              <p className="text-lg font-semibold">CONTRASENA TEMPORAL ACTIVA</p>
              <p className="mt-1 text-sm sm:text-base">
                Esta cuenta fue creada con una clave generica. Cambiala antes de continuar con el
                uso normal del sistema.
              </p>
            </section>
          ) : null}

          {currentService ? (
            <section
              className={`rounded-[24px] border px-5 py-4 text-center shadow-lg ${
                isFormLocked
                  ? "border-rose-500/70 bg-rose-950/40 text-rose-100"
                  : "border-emerald-500/40 bg-emerald-950/30 text-emerald-100"
              }`}
            >
              <p className="text-lg font-semibold">
                {isFormLocked ? "FORMULARIO BLOQUEADO" : "FORMULARIO HABILITADO"}
              </p>
              <p className="mt-1 text-sm sm:text-base">
                {!serviceProfile.permissions.canEdit
                  ? "El administrador desactivo temporalmente tu permiso de captura."
                  : isDateLocked
                    ? `La captura solo esta disponible en los primeros ${captureWindow.totalDays} dias habiles del mes. El ultimo dia habil fue ${SHORT_DATE_FORMATTER.format(captureWindow.lastOpenDay)}.`
                    : isReopenedLate
                      ? "Captura reabierta por un supervisor: puedes registrar fuera de tus dias habiles."
                      : `Captura abierta. Hoy corresponde al dia habil ${captureWindow.activeDayNumber} de ${captureWindow.totalDays}.`}
              </p>
              <p className="mt-1 text-sm text-slate-200/80">Dias habilitados: {openDaysLabel}</p>
            </section>
          ) : null}

          <section className={`rounded-[20px] px-5 py-4 text-center text-lg font-semibold shadow-lg ${isLightPanelTheme ? "border border-slate-200 bg-white text-slate-900" : "bg-[#202c41] text-slate-100"}`}>
            <time suppressHydrationWarning>{DATE_TIME_FORMATTER.format(now)}</time>
          </section>

          {error ? (
            <p className="rounded-2xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-2xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
              {message}
            </p>
          ) : null}

          {adminCalendarSection}

          {captureToggleSection}

          {isAdmin ? (
            <section
              id="panel-admin-export"
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
                <div className={`text-sm ${isLightPanelTheme ? "text-slate-600" : "text-slate-300"}`}>
                  <p>Completados: {publicCompletedCount}</p>
                  <p>Pendientes: {Math.max(SERVICE_COUNT - publicCompletedCount, 0)}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Estado actual</p>
                  <p className="mt-3 text-4xl font-semibold text-white">{currentMonthProgress}%</p>
                  <p className="mt-2 text-sm text-slate-300">
                    {publicCompletedCount} de {SERVICE_COUNT} dependencias han completado el mes actual.
                  </p>
                  <div className="mt-4 h-3 rounded-full bg-white/10">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300"
                      style={{ width: `${currentMonthProgress}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#1b2537] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Descarga</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Archivo del periodo {periodLabel}</h3>
                  <p className="mt-2 text-sm text-slate-300">
                    El archivo incluye todos los servicios, sus filas y todos los centros de costos del
                    mes actual.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleExportMonthlyReport()}
                    disabled={isExportingMonthlyReport}
                    className="mt-5 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-300"
                  >
                    {isExportingMonthlyReport ? "Generando Excel..." : "Descargar Excel mensual"}
                  </button>
                  <p className="mt-3 text-xs text-slate-300">
                    El archivo saldra con los datos disponibles al momento de la descarga.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {sepsSection}

          {currentService ? (
            <section
              id="panel-tabulator"
              className="overflow-hidden rounded-[24px] border border-white/10 bg-[#202c41] shadow-[0_24px_80px_rgba(3,7,18,0.35)]"
            >
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-xs text-slate-100">
                  <thead>
                    <tr className="bg-[#1a2334] text-left">
                      <th className="sticky left-0 z-20 min-w-[210px] border-b border-white/10 bg-[#1a2334] px-3 py-3 font-semibold uppercase tracking-wide">
                        Centro de costos
                      </th>
                      {TABULATOR_HEADERS.map((header) => (
                        <th
                          key={header}
                          className="min-w-[118px] border-b border-l border-white/10 px-2 py-2 align-top text-[11px] font-semibold leading-4"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentService.rows.map((row) => {
                      const rowIsFixed = isFixedRow(row);
                      const fixedValues = getFixedValuesForRow(row);

                      return (
                      <tr key={row} className="odd:bg-white/[0.02] even:bg-white/[0.05]">
                        <th className="sticky left-0 z-10 border-r border-white/10 bg-[#3a465d] px-3 py-3 text-left text-[11px] font-semibold leading-4 text-slate-100">
                          {row}
                          {rowIsFixed ? (
                            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                              Fijo
                            </span>
                          ) : null}
                        </th>
                        {TABULATOR_HEADERS.map((header) => (
                          <td key={`${row}-${header}`} className="border-l border-white/10 px-1 py-1">
                            <input
                              value={
                                rowIsFixed
                                  ? fixedValues?.[header] ?? ""
                                  : tableValues[row]?.[header] || ""
                              }
                              onChange={(event) =>
                                handleCellChange(row, header, event.target.value)
                              }
                              disabled={isFormLocked || rowIsFixed}
                              readOnly={rowIsFixed}
                              title={rowIsFixed ? "Valor fijo (automatico, no editable)" : undefined}
                              inputMode="numeric"
                              className="w-full rounded-lg border border-white/5 bg-[#2a3448] px-2 py-2 text-center text-xs text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:bg-[#313d54] disabled:cursor-not-allowed disabled:bg-[#253145] disabled:text-slate-400"
                              placeholder="0"
                              type="text"
                            />
                          </td>
                        ))}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className="rounded-[24px] border border-white/10 bg-[#202c41] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)]">
              <h2 className="text-xl font-semibold">Cuenta sin tabulador asignado</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Esta cuenta puede administrar usuarios y permisos, pero no tiene un servicio
                operativo asignado para captura.
              </p>
            </section>
          )}

          <section
            id="panel-security"
            className="rounded-[24px] border border-white/10 bg-[#202c41] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)]"
          >
            <div className="mb-5">
              <p className="text-sm uppercase tracking-[0.2em] text-violet-200/80">
                Seguridad
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Cambiar contrasena</h2>
              <p className="mt-2 text-sm text-slate-300">
                {isAdmin
                  ? "El acceso administrador principal usa las credenciales fijas solicitadas."
                  : "La clave inicial es generica para las cuentas nuevas. Cada usuario puede cambiarla desde aqui."}
              </p>
            </div>

            {isAdmin ? (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-950/30 px-4 py-4 text-sm text-amber-50">
                Usuario administrador: <strong>{ADMIN_USERNAME}</strong>
                {" · "}
                Contrasena: <strong>{ADMIN_PASSWORD}</strong>
              </div>
            ) : (
              <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleChangePassword}>
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Nueva contrasena</span>
                  <input
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-violet-500"
                    minLength={6}
                    placeholder="Minimo 6 caracteres"
                    type="password"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Confirmar contrasena</span>
                  <input
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-[#2a3448] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-violet-500"
                    minLength={6}
                    placeholder="Repite la nueva clave"
                    type="password"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="mt-6 rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-violet-800"
                >
                  {isChangingPassword ? "Actualizando..." : "Cambiar clave"}
                </button>
              </form>
            )}
          </section>

          {isAdmin ? (
            <section
              id="panel-users"
              className="rounded-[24px] border border-white/10 bg-[#202c41] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)]"
            >
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-amber-200/80">
                    Administrador
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Usuarios y permisos</h2>
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
                              <h4 className="text-sm font-semibold text-white">{service.name}</h4>
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

              <div className="overflow-x-auto">
                <table className="min-w-[1400px] border-collapse text-sm text-slate-100">
                  <thead>
                    <tr className="bg-[#1a2334] text-left">
                      <th className="px-4 py-3 font-semibold">Responsable</th>
                      <th className="px-4 py-3 font-semibold">Usuario</th>
                      <th className="px-4 py-3 font-semibold">Correo</th>
                      <th className="px-4 py-3 font-semibold">Servicio</th>
                      <th className="px-4 py-3 font-semibold">Rol</th>
                      <th className="px-4 py-3 font-semibold">Activo</th>
                      <th className="px-4 py-3 font-semibold">Captura</th>
                      <th className="px-4 py-3 font-semibold">Gestiona usuarios</th>
                      <th className="px-4 py-3 font-semibold">Debe cambiar clave</th>
                      <th className="px-4 py-3 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((managedUser) => {
                      const draft = adminDrafts[managedUser.uid];
                      const busy = adminBusyUserId === managedUser.uid;

                      if (!draft) {
                        return null;
                      }

                      return (
                        <tr key={managedUser.uid} className="border-t border-white/10 align-top">
                          <td className="px-4 py-4">
                            <p className="font-semibold text-white">{draft.name}</p>
                            {managedUser.dui ? (
                              <p className="mt-1 text-xs text-slate-300">DUI: {managedUser.dui}</p>
                            ) : null}
                            {managedUser.phone ? (
                              <p className="mt-1 text-xs text-slate-300">
                                Telefono: {managedUser.phone}
                              </p>
                            ) : null}
                            <p className="mt-1 break-all font-mono text-xs text-slate-400">
                              {managedUser.uid}
                            </p>
                          </td>
                          <td className="px-4 py-4 font-mono text-sm text-cyan-200">{draft.username}</td>
                          <td className="px-4 py-4 text-slate-200">{draft.email}</td>
                          <td className="px-4 py-4">
                            <select
                              value={draft.serviceId}
                              onChange={(event) =>
                                updateAdminDraft(managedUser.uid, {
                                  serviceId: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-white/10 bg-[#2a3448] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                            >
                              <option value="">Sin servicio</option>
                              {SERVICE_DEFINITIONS.map((service) => {
                                const assignedUser = assignedServiceUsers.get(service.id);
                                const isTakenByAnotherUser =
                                  Boolean(assignedUser) && assignedUser?.uid !== managedUser.uid;

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
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={draft.role}
                              onChange={(event) => {
                                const nextRole = event.target.value as UserRole;
                                updateAdminDraft(managedUser.uid, {
                                  role: nextRole,
                                  canManageUsers: nextRole === "admin",
                                });
                              }}
                              className="w-full rounded-xl border border-white/10 bg-[#2a3448] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                            >
                              <option value="service">Servicio</option>
                              <option value="admin">Administrador</option>
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            <label className="flex items-center gap-2">
                              <input
                                checked={draft.isActive}
                                onChange={(event) =>
                                  updateAdminDraft(managedUser.uid, {
                                    isActive: event.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-white/20"
                                type="checkbox"
                              />
                              <span>{draft.isActive ? "Si" : "No"}</span>
                            </label>
                          </td>
                          <td className="px-4 py-4">
                            <label className="flex items-center gap-2">
                              <input
                                checked={draft.canEdit}
                                onChange={(event) =>
                                  updateAdminDraft(managedUser.uid, {
                                    canEdit: event.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-white/20"
                                type="checkbox"
                              />
                              <span>{draft.canEdit ? "Si" : "No"}</span>
                            </label>
                          </td>
                          <td className="px-4 py-4">
                            <label className="flex items-center gap-2">
                              <input
                                checked={draft.canManageUsers}
                                onChange={(event) =>
                                  updateAdminDraft(managedUser.uid, {
                                    canManageUsers: event.target.checked,
                                    role: event.target.checked ? "admin" : draft.role,
                                  })
                                }
                                className="h-4 w-4 rounded border-white/20"
                                disabled={draft.role !== "admin"}
                                type="checkbox"
                              />
                              <span>{draft.canManageUsers ? "Si" : "No"}</span>
                            </label>
                          </td>
                          <td className="px-4 py-4">
                            <label className="flex items-center gap-2">
                              <input
                                checked={draft.mustChangePassword}
                                onChange={(event) =>
                                  updateAdminDraft(managedUser.uid, {
                                    mustChangePassword: event.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-white/20"
                                type="checkbox"
                              />
                              <span>{draft.mustChangePassword ? "Si" : "No"}</span>
                            </label>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleAdminSave(managedUser.uid)}
                                disabled={busy}
                                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-300"
                              >
                                {busy ? "Guardando..." : "Guardar"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleAdminSendReset(managedUser.uid, managedUser)
                                }
                                disabled={busy}
                                className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-violet-800"
                              >
                                Reset clave
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4efe6] text-slate-950">
      <section className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.2fr_500px]">
        <div className="relative flex min-h-[45vh] flex-col gap-8 overflow-y-auto bg-slate-950 px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.22),transparent_28%),radial-gradient(circle_at_80%_15%,rgba(16,185,129,0.18),transparent_25%),linear-gradient(150deg,#020617_0%,#111827_55%,#172554_100%)]" />
          <div className="relative flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-200">
              PERC HNES
            </p>
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_24px_rgba(110,231,183,0.85)]" />
          </div>

          <div className="relative space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-[#162034]/90 p-6 shadow-[0_24px_80px_rgba(3,7,18,0.35)] backdrop-blur">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Total</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{SERVICE_COUNT}</p>
                  <p className="mt-1 text-xs text-slate-400">Dependencias</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Completos</p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-300">{publicCompletedCount}</p>
                  <p className="mt-1 text-xs text-slate-400">Mes actual</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Progreso</p>
                  <p className="mt-2 text-3xl font-semibold text-violet-300">{currentMonthProgress}%</p>
                  <p className="mt-1 text-xs text-slate-400">Avance mensual</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-violet-400/15 bg-[#0f1728] p-4">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span>Progreso general</span>
                  <span>{currentMonthProgress}%</span>
                </div>
                <div className="mt-3 h-3 rounded-full bg-white/10">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-violet-400 to-cyan-300"
                    style={{ width: `${currentMonthProgress}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {publicCompletedCount} de {SERVICE_COUNT} servicios completados
                  </span>
                  <time suppressHydrationWarning>{DATE_TIME_FORMATTER.format(now)}</time>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-[#162034]/90 p-5 shadow-[0_24px_80px_rgba(3,7,18,0.28)] backdrop-blur">
              <h2 className="text-lg font-semibold text-white">Calendario de cierre mensual</h2>
              <p className="mt-2 text-sm text-slate-300">
                Cada mes muestra cuantas dependencias completaron su captura. El mes activo se
                resalta automaticamente.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {isLoadingDashboard
                  ? Array.from({ length: 12 }, (_, index) => (
                      <div
                        key={`month-skeleton-${index}`}
                        className="h-24 rounded-2xl border border-white/10 bg-white/5"
                      />
                    ))
                  : publicDashboardMonths.map((month) => {
                      const monthProgress = Math.round(
                        (month.completedServices / Math.max(month.totalServices, 1)) * 100,
                      );

                      return (
                        <div
                          key={month.periodId}
                          className={`rounded-2xl border px-4 py-4 ${
                            month.isCurrentMonth
                              ? "border-cyan-400/40 bg-cyan-500/10"
                              : month.completedServices > 0
                                ? "border-emerald-400/20 bg-emerald-500/10"
                                : "border-white/10 bg-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold uppercase tracking-wide text-white">
                              {month.label}
                            </p>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-slate-200">
                              {month.completedServices}/{month.totalServices}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-300">
                            {month.isCurrentMonth ? "Mes actual" : "Periodo mensual"}
                          </p>
                          <div className="mt-3 h-2 rounded-full bg-white/10">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300"
                              style={{ width: `${monthProgress}%` }}
                            />
                          </div>
                          <p className="mt-3 text-xs text-slate-400">
                            {month.isOpen ? "Ventana calculada" : "Ventana ajustada por calendario"}
                          </p>
                        </div>
                      );
                    })}
              </div>
            </div>

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
                : publicDashboardGroups.map((group) => {
                    const completedServices = group.services.filter((service) => service.completed);
                    const pendingServices = group.services.filter((service) => !service.completed);
                    const completionShare = Math.round(
                      (completedServices.length / Math.max(group.services.length, 1)) * 100,
                    );
                    const pendingShare = Math.max(100 - completionShare, 0);

                    return (
                      <section
                        key={group.id}
                        className="rounded-[26px] border border-[#d8cfbd] bg-[#f6f1e6] p-5 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.14)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d8cfbd] pb-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#64748b]">
                              Panel de cumplimiento
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold text-[#23395d]">{group.title}</h2>
                            <p className="mt-1 text-sm text-slate-600">
                              Vista de pendientes y completos del periodo actual.
                            </p>
                          </div>
                          <div className="rounded-full border border-[#c6b899] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#23395d]">
                            {completedServices.length}/{group.services.length} completos
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)]">
                          <div className="space-y-4">
                            <div className="rounded-[24px] bg-[#23395d] p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-3">
                                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4">
                                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
                                    Total
                                  </p>
                                  <p className="mt-3 text-3xl font-semibold">{group.services.length}</p>
                                  <p className="mt-1 text-xs text-slate-300">Dependencias</p>
                                </div>
                                <div className="rounded-2xl border border-[#f3cf63]/30 bg-[#f3cf63]/15 px-4 py-4">
                                  <p className="text-[11px] uppercase tracking-[0.22em] text-[#f8df8a]">
                                    Completos
                                  </p>
                                  <p className="mt-3 text-3xl font-semibold text-[#fff3c8]">
                                    {completedServices.length}
                                  </p>
                                  <p className="mt-1 text-xs text-[#f8df8a]">Servicios al dia</p>
                                </div>
                                <div className="rounded-2xl border border-[#ff7a30]/30 bg-[#ff7a30]/15 px-4 py-4">
                                  <p className="text-[11px] uppercase tracking-[0.22em] text-[#ffd1b5]">
                                    Pendientes
                                  </p>
                                  <p className="mt-3 text-3xl font-semibold text-[#fff0e7]">
                                    {pendingServices.length}
                                  </p>
                                  <p className="mt-1 text-xs text-[#ffd1b5]">Por capturar</p>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-[24px] border border-[#d8cfbd] bg-white/80 p-4">
                              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                <span>Ritmo de captura</span>
                                <span>{completionShare}%</span>
                              </div>

                              <div className="mt-4 space-y-4">
                                <div>
                                  <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                                    <span>Completados</span>
                                    <span>{completionShare}%</span>
                                  </div>
                                  <div className="mt-2 h-4 rounded-full bg-slate-200">
                                    <div
                                      className="h-4 rounded-full bg-[#f3c623]"
                                      style={{ width: `${completionShare}%` }}
                                    />
                                  </div>
                                </div>

                                <div>
                                  <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                                    <span>Pendientes</span>
                                    <span>{pendingShare}%</span>
                                  </div>
                                  <div className="mt-2 h-4 rounded-full bg-slate-200">
                                    <div
                                      className="h-4 rounded-full bg-[#ff6b2c]"
                                      style={{ width: `${pendingShare}%` }}
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-[#d8cfbd] bg-[#f8f4ea] px-4 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                    Objetivo
                                  </p>
                                  <p className="mt-2 text-lg font-semibold text-[#23395d]">
                                    Completar el 100% del grupo
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-[#d8cfbd] bg-[#f8f4ea] px-4 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                    Estado
                                  </p>
                                  <p className="mt-2 text-lg font-semibold text-[#23395d]">
                                    {pendingServices.length === 0 ? "Ciclo cerrado" : "Requiere seguimiento"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-[24px] border border-[#d8cfbd] bg-white/85 p-4">
                              <div className="flex items-center justify-between gap-3 border-b border-[#e8dfcf] pb-3">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                    Completos
                                  </p>
                                  <h3 className="mt-1 text-lg font-semibold text-[#23395d]">
                                    Dependencias al dia
                                  </h3>
                                </div>
                                <span className="rounded-full bg-[#f3c623] px-3 py-1 text-xs font-semibold text-[#23395d]">
                                  {completedServices.length}
                                </span>
                              </div>

                              <div className="mt-4 space-y-2">
                                {completedServices.length > 0 ? (
                                  completedServices.map((service) => (
                                    <article
                                      key={service.id}
                                      className="rounded-2xl border border-[#eedb94] bg-[#fff7d7] px-4 py-3"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <h4 className="text-sm font-semibold uppercase leading-5 text-[#23395d]">
                                            {service.name}
                                          </h4>
                                          <p className="mt-1 text-xs text-slate-600">
                                            {service.rows.length} fila
                                            {service.rows.length === 1 ? "" : "s"} registradas
                                          </p>
                                        </div>
                                        <span className="rounded-full bg-[#23395d] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                                          Completo
                                        </span>
                                      </div>
                                    </article>
                                  ))
                                ) : (
                                  <div className="rounded-2xl border border-dashed border-[#d8cfbd] bg-[#f8f4ea] px-4 py-6 text-sm text-slate-500">
                                    Aun no hay dependencias completadas en este grupo.
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="rounded-[24px] border border-[#d8cfbd] bg-white/85 p-4">
                              <div className="flex items-center justify-between gap-3 border-b border-[#e8dfcf] pb-3">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                    Pendientes
                                  </p>
                                  <h3 className="mt-1 text-lg font-semibold text-[#23395d]">
                                    Dependencias por capturar
                                  </h3>
                                </div>
                                <span className="rounded-full bg-[#ff6b2c] px-3 py-1 text-xs font-semibold text-white">
                                  {pendingServices.length}
                                </span>
                              </div>

                              <div className="mt-4 space-y-2">
                                {pendingServices.length > 0 ? (
                                  pendingServices.map((service) => (
                                    <article
                                      key={service.id}
                                      className="rounded-2xl border border-[#ffc7ab] bg-[#fff0e8] px-4 py-3"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <h4 className="text-sm font-semibold uppercase leading-5 text-[#23395d]">
                                            {service.name}
                                          </h4>
                                          <p className="mt-1 text-xs text-slate-600">
                                            {service.rows.length} fila
                                            {service.rows.length === 1 ? "" : "s"} pendientes de revisar
                                          </p>
                                        </div>
                                        <span className="rounded-full bg-[#ff6b2c] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                                          Pendiente
                                        </span>
                                      </div>
                                    </article>
                                  ))
                                ) : (
                                  <div className="rounded-2xl border border-dashed border-[#d8cfbd] bg-[#f8f4ea] px-4 py-6 text-sm text-slate-500">
                                    No hay pendientes en este grupo.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    );
                  })}
            </div>
          </div>
        </div>

        <div className="px-5 py-10 sm:px-8 lg:py-8">
          <div className="w-full max-w-md lg:sticky lg:top-6 lg:ml-auto">
            {isLoadingSession ? (
              <div className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm">
                <div className="h-3 w-28 rounded-full bg-slate-200" />
                <div className="mt-6 h-12 rounded-2xl bg-slate-100" />
                <div className="mt-4 h-12 rounded-2xl bg-slate-100" />
                <div className="mt-4 h-12 rounded-2xl bg-slate-100" />
              </div>
            ) : user && !serviceProfile ? (
              <section className="rounded-[24px] border border-slate-200 bg-white p-7 shadow-sm">
                <p className="text-sm font-medium text-violet-700">Sesion activa</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  Perfil pendiente o bloqueado
                </h2>
                {error ? (
                  <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-8 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Cerrar sesion
                </button>
              </section>
            ) : (
              <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-7">
                  <p className="text-sm font-medium text-violet-700">Acceso</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">Iniciar sesion</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    Las cuentas de servicio se crean manualmente desde el panel del administrador.
                    Cada usuario entra con su cuenta asignada y cambia su contrasena en el primer
                    ingreso.
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Acceso admin: usuario <strong>{ADMIN_USERNAME}</strong>.
                  </p>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Correo o usuario</span>
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
                      name="email"
                      placeholder="correo@hospital.com o Hcardoza"
                      required
                      type="text"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Contrasena</span>
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
                      minLength={6}
                      name="password"
                      placeholder="Ingresa tu clave"
                      required
                      type="password"
                    />
                  </label>

                  {error ? (
                    <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      <p>{error}</p>
                      {firestoreUnavailable ? (
                        <button
                          type="button"
                          onClick={handleRetryFirestore}
                          className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
                        >
                          Reintentar Firestore
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {message ? (
                    <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {message}
                    </p>
                  ) : null}

                  <button
                    disabled={isSubmitting}
                    className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    type="submit"
                  >
                    {isSubmitting ? "Procesando..." : "Entrar al sistema"}
                  </button>
                </form>
              </section>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
