"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import {
  type Auth,
  type AuthError,
  type User,
  browserLocalPersistence,
  browserSessionPersistence,
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
  SERVICE_COUNT,
  SERVICE_DEFINITIONS,
  TABULATOR_HEADERS,
  type ServiceDefinition,
} from "@/lib/tabulator-template";

type UserRole = "service" | "admin";
type TableValues = Record<string, Record<string, string>>;
type ServicePermissions = {
  canEdit: boolean;
  canManageUsers: boolean;
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
const CAPTURE_WINDOW_DAYS = 3;
const FIRESTORE_SETUP_MESSAGE = `Firestore no esta creado o configurado en este proyecto de Firebase. Verifica la base de datos '${firestoreDatabaseId}' para habilitar login, tablero y guardado.`;
const FIRESTORE_DISABLED_STORAGE_KEY = "perc-hnes.firestore-disabled";

const SERVICE_GROUP_LABELS: Record<string, string> = {
  direccion: "Direccion",
  apoyo: "Division de Apoyo",
  medica: "Division Medica",
  enfermeria: "Division de Enfermeria",
  administrativa: "Subdireccion Administrativa",
};

const SERVICE_GROUP_BY_ID: Record<string, keyof typeof SERVICE_GROUP_LABELS> = {
  almacen: "direccion",
  "docencia-e-investigacion": "direccion",
  "servicio-farmaceutico": "direccion",
  "trabajo-social": "apoyo",
  "laboratorio-clinico": "apoyo",
  "laboratorio-de-biologia-molecular": "apoyo",
  "banco-de-sangre": "apoyo",
  "alimentacion-enteral": "apoyo",
  "nutricion-parenteral": "apoyo",
  "servicio-de-alimentacion": "apoyo",
  "estudio-de-radiologia": "medica",
  "resonancia-magnetica": "medica",
  tomografia: "medica",
  ultrasonografia: "medica",
  "estudios-gastroclinicos": "medica",
  "unidad-de-hemodinamia": "medica",
  hemodialisis: "medica",
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
  "servicio-farmaceutico": "dep.farmacia",
  "rehablitacion-psicosocial": "dep.psicosocial",
  "alimentacion-enteral": "dep.enteral",
  "nutricion-parenteral": "dep.parenteral",
  "central-de-esterilizacion": "dep.esterilizacion",
  "saneamiento-ambiental": "dep.saneamiento",
  aseo: "dep.aseo",
  almacen: "dep.almacen",
  "servicio-de-alimentacion": "dep.alimentacion",
  lavanderia: "dep.lavanderia",
  "transporte-general": "dep.transporte",
  mantenimiento: "dep.mantenimiento",
  "trabajo-social": "dep.trabajosocial",
  "docencia-e-investigacion": "dep.docencia",
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
    canEdit: true,
    canManageUsers: role === "admin",
  };
}

function getServiceById(serviceId: string | null | undefined) {
  if (!serviceId) {
    return null;
  }

  return SERVICE_DEFINITIONS.find((service) => service.id === serviceId) || null;
}

function buildEmptyTable(service: ServiceDefinition): TableValues {
  return Object.fromEntries(
    service.rows.map((row) => [
      row,
      Object.fromEntries(TABULATOR_HEADERS.map((header) => [header, ""])),
    ]),
  );
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

function getCaptureWindow(referenceDate: Date, blockedDates: string[]) {
  const openDays = getFirstBusinessDays(referenceDate, blockedDates, CAPTURE_WINDOW_DAYS);
  const activeDayIndex = openDays.findIndex((day) =>
    isSameCalendarDay(day, referenceDate),
  );

  return {
    openDays,
    isOpen: activeDayIndex >= 0,
    activeDayNumber: activeDayIndex + 1,
    lastOpenDay: openDays[openDays.length - 1],
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

function getServiceUsername(serviceId: string | null | undefined) {
  if (!serviceId) {
    return "";
  }

  return SERVICE_USERNAME_BY_ID[serviceId] || `dep.${serviceId}`;
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
  const role = data.role === "admin" ? "admin" : "service";
  const defaultPermissions = getDefaultPermissions(role);
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
    },
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
  const snapshot = await getDocs(collection(db, "captureCalendar"));
  const overrides: Record<string, string[]> = {};

  for (const item of snapshot.docs) {
    if (!item.id.startsWith(`${year}-`)) {
      continue;
    }

    const data = item.data() as {
      blockedDates?: unknown;
    };

    overrides[item.id] = Array.isArray(data.blockedDates)
      ? data.blockedDates.filter((value): value is string => typeof value === "string")
      : [];
  }

  return overrides;
}

async function fetchPublicDashboard(year: number, currentPeriodId: string) {
  const [calendarOverrides, tabulatorsSnapshot] = await Promise.all([
    fetchCalendarOverridesForYear(year),
    getDocs(collection(db, "serviceTabulators")),
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
  const credential = await createUserWithEmailAndPassword(
    creationAuth,
    normalizedEmail,
    DEFAULT_TEMP_PASSWORD,
  );

  await updateProfile(credential.user, {
    displayName,
  });

  await setDoc(doc(db, "serviceUsers", credential.user.uid), {
    serviceId: service.id,
    serviceName: service.name,
    email: normalizedEmail,
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

async function resolveLoginEmail(loginIdentifier: string) {
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
    const serviceSnapshot = await getDocs(
      query(collection(db, "serviceUsers"), where("serviceId", "==", mappedService.id)),
    );
    const matchedUser = serviceSnapshot.docs.find((item) => Boolean(item.data().email));

    if (matchedUser) {
      return String(matchedUser.data().email);
    }
  }

  const usernameSnapshot = await getDocs(
    query(collection(db, "serviceUsers"), where("username", "==", normalizedIdentifier)),
  );
  const matchedByUsername = usernameSnapshot.docs.find((item) => Boolean(item.data().email));

  if (matchedByUsername) {
    return String(matchedByUsername.data().email);
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
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [tableValues, setTableValues] = useState<TableValues>({});
  const [now, setNow] = useState(() => new Date());
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [adminUsers, setAdminUsers] = useState<ManagedUser[]>([]);
  const [adminDrafts, setAdminDrafts] = useState<Record<string, AdminDraft>>({});
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreatingManagedUser, setIsCreatingManagedUser] = useState(false);
  const [adminBusyUserId, setAdminBusyUserId] = useState("");
  const [adminOverview, setAdminOverview] = useState<AdminOverviewEntry[]>([]);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [calendarOverrides, setCalendarOverrides] = useState<Record<string, string[]>>({});
  const [publicDashboardMonths, setPublicDashboardMonths] = useState<PublicDashboardMonth[]>([]);
  const [publicDashboardGroups, setPublicDashboardGroups] = useState<PublicDashboardGroup[]>([]);
  const [publicCompletedCount, setPublicCompletedCount] = useState(0);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [calendarEditorPeriodId, setCalendarEditorPeriodId] = useState(() => getPeriodId(new Date()));
  const [calendarDraftDate, setCalendarDraftDate] = useState("");
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);
  const [activeSidebarSection, setActiveSidebarSection] = useState("panel-overview");
  const [firestoreUnavailable, setFirestoreUnavailable] = useState(false);
  const [firestoreStatusReady, setFirestoreStatusReady] = useState(false);

  const currentService = useMemo(
    () => getServiceById(serviceProfile?.serviceId),
    [serviceProfile?.serviceId],
  );
  const periodId = useMemo(() => getPeriodId(now), [now]);
  const currentBlockedDates = useMemo(() => calendarOverrides[periodId] || [], [calendarOverrides, periodId]);
  const captureWindow = useMemo(
    () => getCaptureWindow(now, currentBlockedDates),
    [currentBlockedDates, now],
  );
  const periodLabel = useMemo(
    () => PERIOD_FORMATTER.format(new Date(now.getFullYear(), now.getMonth(), 1)),
    [now],
  );
  const currentYear = useMemo(() => now.getFullYear(), [now]);
  const welcomeName = useMemo(() => {
    return serviceProfile?.name || user?.displayName || user?.email?.split("@")[0] || "Usuario";
  }, [serviceProfile?.name, user?.displayName, user?.email]);
  const isAdmin = !!serviceProfile?.permissions.canManageUsers || serviceProfile?.role === "admin";
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
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

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

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [currentYear, firestoreStatusReady, firestoreUnavailable, periodId]);

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
        setAdminUsers([]);
        setAdminDrafts({});
        setAdminOverview([]);
        setProfileReady(true);
        return;
      }

      if (firestoreUnavailable) {
        setProfileReady(true);
        return;
      }

      setProfileReady(false);

      try {
        const profileSnapshot = await getDoc(doc(db, "serviceUsers", user.uid));

        if (cancelled) {
          return;
        }

        if (!profileSnapshot.exists()) {
          setServiceProfile(null);
          setTableValues({});
          setAdminOverview([]);
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
          setAdminOverview([]);
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
          setIsLoadingUsers(true);
          setIsLoadingOverview(true);

          void (async () => {
            try {
              const [users, overview] = await Promise.all([
                fetchManagedUsers(),
                fetchAdminOverviewForPeriod(periodId),
              ]);

              if (!cancelled) {
                setAdminUsers(users);
                setAdminDrafts(buildAdminDrafts(users));
                setAdminOverview(overview);
              }
            } catch (adminLoadError) {
              if (await handleFirestoreError(adminLoadError)) {
                if (!cancelled) {
                  setAdminUsers([]);
                  setAdminDrafts({});
                  setAdminOverview([]);
                }

                return;
              }

              if (!cancelled) {
                setAdminUsers([]);
                setAdminDrafts({});
                setAdminOverview([]);
                setError("No pudimos cargar por completo el panel del administrador.");
              }
            } finally {
              if (!cancelled) {
                setIsLoadingUsers(false);
                setIsLoadingOverview(false);
              }
            }
          })();
        } else if (!cancelled) {
          setAdminUsers([]);
          setAdminDrafts({});
          setAdminOverview([]);
          setIsLoadingUsers(false);
          setIsLoadingOverview(false);
        }
      } catch (sessionError) {
        if (await handleFirestoreError(sessionError)) {
          if (!cancelled) {
            setServiceProfile(null);
            setTableValues({});
            setAdminUsers([]);
            setAdminDrafts({});
            setAdminOverview([]);
            setIsLoadingUsers(false);
            setIsLoadingOverview(false);
            setProfileReady(true);
          }

          return;
        }

        if (!cancelled) {
          setServiceProfile(null);
          setTableValues({});
          setAdminUsers([]);
          setAdminDrafts({});
          setAdminOverview([]);
          setIsLoadingUsers(false);
          setIsLoadingOverview(false);
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
  }, [firestoreStatusReady, firestoreUnavailable, periodId, user]);

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
      setAdminUsers(users);
      setAdminDrafts(buildAdminDrafts(users));
      setMessage("Listado de usuarios actualizado.");
      setError("");
    } catch (loadError) {
      if (await handleFirestoreError(loadError)) {
        setAdminUsers([]);
        setAdminDrafts({});
        return;
      }

      setError("No pudimos cargar los usuarios del modulo administrador.");
    } finally {
      setIsLoadingUsers(false);
    }
  }

  async function loadAdminOverview(showMessage: boolean) {
    if (!isAdmin || firestoreUnavailable) {
      return;
    }

    setIsLoadingOverview(true);

    try {
      const overview = await fetchAdminOverviewForPeriod(periodId);
      setAdminOverview(overview);
      setError("");

      if (showMessage) {
        setMessage("Vista global del administrador actualizada.");
      }
    } catch (overviewError) {
      if (await handleFirestoreError(overviewError)) {
        setAdminOverview([]);
        return;
      }

      setError("No pudimos cargar la vista global del administrador.");
    } finally {
      setIsLoadingOverview(false);
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
      if (calendarEditorPeriodId === periodId) {
        await loadAdminOverview(false);
      }
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
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence,
      );

      const loginIdentifier = email.trim();

      if (
        normalizeKey(loginIdentifier) === normalizeKey(ADMIN_USERNAME) &&
        password === ADMIN_PASSWORD
      ) {
        try {
          const credential = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
          await ensureDefaultAdminProfile(credential.user);
        } catch (loginError) {
          const authCode = (loginError as AuthError).code;

          if (authCode !== "auth/invalid-credential" && authCode !== "auth/user-not-found") {
            throw loginError;
          }

          try {
            const credential = await createUserWithEmailAndPassword(
              auth,
              ADMIN_EMAIL,
              ADMIN_PASSWORD,
            );
            await ensureDefaultAdminProfile(credential.user);
          } catch (createAdminError) {
            const createAdminCode = (createAdminError as AuthError).code;

            if (createAdminCode === "auth/email-already-in-use") {
              throw new Error("admin-access-failed");
            }

            throw createAdminError;
          }
        }
      } else {
        if (firestoreUnavailable && !loginIdentifier.includes("@")) {
          throw new Error("firestore-setup-required");
        }

        const resolvedEmail = await resolveLoginEmail(loginIdentifier);
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
      setAdminUsers(users);
      setAdminDrafts(buildAdminDrafts(users));
      setAdminCreateForm({
        firstName: "",
        lastName: "",
        email: "",
        dui: "",
        phone: "",
        serviceId: "",
      });
      setMessage(
        `Cuenta creada para ${service.name}. Usuario: ${serviceUsername}. Contrasena temporal: ${DEFAULT_TEMP_PASSWORD}.`,
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
    setAdminUsers([]);
    setAdminDrafts({});
    setAdminOverview([]);
    setNewPassword("");
    setConfirmPassword("");
    await signOut(auth);
  }

  function handleCellChange(row: string, header: string, rawValue: string) {
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

    if (!captureWindow.isOpen) {
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

      if (isAdmin) {
        await loadAdminOverview(false);
      }

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
      setAdminUsers(users);
      setAdminDrafts(buildAdminDrafts(users));

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

  async function handleAdminSendReset(uid: string, userEmail: string) {
    setAdminBusyUserId(uid);
    setError("");
    setMessage("");

    try {
      await sendPasswordResetEmail(auth, userEmail);
      await setDoc(
        doc(db, "serviceUsers", uid),
        {
          mustChangePassword: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      const users = await fetchManagedUsers();
      setAdminUsers(users);
      setAdminDrafts(buildAdminDrafts(users));
      setMessage(`Se envio el correo de restablecimiento a ${userEmail}.`);
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

  function handleSidebarDarkModeHint() {
    setError("");
    setMessage("El panel interno ya usa modo oscuro por defecto.");
  }

  const isLoadingSession = !authReady || (user !== null && !profileReady);

  if (user && serviceProfile && !isLoadingSession) {
    const isDateLocked = !captureWindow.isOpen;
    const isPermissionLocked = !currentService || !serviceProfile.permissions.canEdit;
    const isFormLocked = isDateLocked || isPermissionLocked;
    const openDaysLabel = captureWindow.openDays
      .map((day) => SHORT_DATE_FORMATTER.format(day))
      .join(" / ");
    const adminRowsCount = adminOverview.reduce(
      (total, entry) => total + entry.service.rows.length,
      0,
    );
    const adminCalendarSection = isAdmin ? (
      <section
        id="panel-calendar"
        className="rounded-[24px] border border-cyan-400/20 bg-[#202c41] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)]"
      >
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">
              Configuracion mensual
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Modificar dias habiles por mes</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
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
    const sidebarItems = [
      {
        id: "panel-overview",
        label: "Inicio",
        detail: isAdmin ? "Resumen general" : "Estado del periodo",
        badge: "IN",
      },
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
              id: "panel-admin-overview",
              label: "Vista global",
              detail: "Todos los servicios",
              badge: "VG",
            },
            {
              id: "panel-users",
              label: "Usuarios",
              detail: "Cuentas y permisos",
              badge: "US",
            },
          ]
        : []),
      {
        id: "panel-security",
        label: "Cambiar contrasena",
        detail: "Seguridad de acceso",
        badge: "PW",
      },
    ];

    return (
      <main className="min-h-screen bg-[#161f31] px-4 py-6 text-slate-100 sm:px-7 lg:px-10">
        <div className="mx-auto grid max-w-[1850px] gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="self-start rounded-[30px] border border-white/10 bg-[#eef2fb] p-5 text-slate-900 shadow-[0_24px_80px_rgba(3,7,18,0.22)] xl:sticky xl:top-6">
            <div className="border-b border-slate-200 pb-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500">
                HOSPITAL NACIONAL
              </p>
              <p className="mt-1 text-sm font-medium tracking-[0.18em] text-slate-500">
                EL SALVADOR
              </p>
              <div className="mx-auto mt-4 h-px w-24 bg-slate-300" />
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-[24px] bg-white px-3 py-3 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1f255f] text-sm font-bold text-white">
                {serviceProfile.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{welcomeName}</p>
                <p className="truncate text-sm text-[#4f6aa3]">
                  {currentService?.name || (isAdmin ? "Administrador del sistema" : serviceProfile.email)}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                  {isAdmin ? "Admin" : "Servicio"}
                </p>
              </div>
            </div>

            <nav className="mt-6 space-y-2">
              {sidebarItems.map((item) => {
                const isActive = activeSidebarSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSidebarNavigation(item.id)}
                    className={`flex w-full items-center gap-3 rounded-[22px] border px-3 py-3 text-left transition ${
                      isActive
                        ? "border-[#cad5ee] bg-[#e8eefb] shadow-sm"
                        : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white/80"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        isActive
                          ? "bg-[#1f255f] text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.badge}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                      <span className="block truncate text-xs text-slate-500">{item.detail}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-10 space-y-2 border-t border-slate-200 pt-5">
              <button
                type="button"
                onClick={handleSidebarDarkModeHint}
                className="flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-white"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  DK
                </span>
                <span>Modo oscuro</span>
              </button>
              <button
                type="button"
                onClick={() => handleSidebarNavigation("panel-security")}
                className="flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-white"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  PW
                </span>
                <span>Cambiar contrasena</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left text-sm text-[#8a2d2d] transition hover:bg-white"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fbe8e8] text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a2d2d]">
                  SO
                </span>
                <span>Cerrar sesion</span>
              </button>
            </div>
          </aside>

          <div className="space-y-6">
            <section
              id="panel-overview"
              className="rounded-[28px] border border-white/10 bg-[#202c41] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.45)]"
            >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-violet-200/80">
                  PERC HNES
                </p>
                <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
                  {currentService
                    ? `Ingreso de Datos - ${periodLabel} - ${currentService.name}`
                    : "Modulo de Administracion"}
                </h1>
                <p className="mt-3 text-sm text-slate-300 sm:text-base">
                  Usuario: <span className="font-semibold text-white">{welcomeName}</span>
                  {" · "}
                  Rol: <span className="font-semibold text-white">{isAdmin ? "Administrador" : "Servicio"}</span>
                  {" · "}
                  Acceso: <span className="font-semibold text-white">{serviceProfile.username}</span>
                  {currentService ? (
                    <>
                      {" · "}
                      Servicio: <span className="font-semibold text-white">{currentService.name}</span>
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
                      onClick={() => void loadAdminOverview(true)}
                      disabled={isLoadingOverview}
                      className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-300"
                    >
                      {isLoadingOverview ? "Cargando vista..." : "Vista global"}
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
                    ? `La captura solo esta disponible en los primeros 3 dias habiles del mes. El ultimo dia habil fue ${SHORT_DATE_FORMATTER.format(captureWindow.lastOpenDay)}.`
                    : `Captura abierta. Hoy corresponde al dia habil ${captureWindow.activeDayNumber} de 3.`}
              </p>
              <p className="mt-1 text-sm text-slate-200/80">Dias habilitados: {openDaysLabel}</p>
            </section>
          ) : null}

          <section className="rounded-[20px] bg-[#202c41] px-5 py-4 text-center text-lg font-semibold text-slate-100 shadow-lg">
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

          {isAdmin ? (
            <section
              id="panel-admin-overview"
              className="overflow-hidden rounded-[24px] border border-cyan-400/20 bg-[#202c41] shadow-[0_24px_80px_rgba(3,7,18,0.35)]"
            >
              <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">
                    Vista Global
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Todos los centros juntos</h2>
                  <p className="mt-2 text-sm text-slate-300">
                    El administrador ve en una sola vista todos los servicios y todos los centros del
                    periodo {periodLabel}.
                  </p>
                </div>
                <div className="text-sm text-slate-300">
                  <p>Servicios: {adminOverview.length}</p>
                  <p>Filas consolidadas: {adminRowsCount}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm text-slate-100">
                  <thead>
                    <tr className="bg-[#1a2334] text-left">
                      <th className="sticky left-0 z-20 min-w-[320px] border-b border-white/10 bg-[#1a2334] px-4 py-4 font-semibold uppercase tracking-wide">
                        Servicio / Centro de costos
                      </th>
                      {TABULATOR_HEADERS.map((header) => (
                        <th
                          key={`admin-${header}`}
                          className="min-w-[210px] border-b border-l border-white/10 px-4 py-4 align-top font-semibold"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {adminOverview.map((entry) => (
                      <Fragment key={entry.service.id}>
                        <tr className="bg-[#162234]">
                          <th
                            colSpan={TABULATOR_HEADERS.length + 1}
                            className="border-t border-b border-cyan-400/20 px-4 py-3 text-left text-base font-semibold text-cyan-100"
                          >
                            {entry.service.name}
                            {!entry.hasSavedData ? " · sin datos guardados este mes" : ""}
                          </th>
                        </tr>
                        {entry.service.rows.map((row) => (
                          <tr
                            key={`${entry.service.id}-${row}`}
                            className="odd:bg-white/[0.02] even:bg-white/[0.05]"
                          >
                            <th className="sticky left-0 z-10 border-r border-white/10 bg-[#314055] px-4 py-4 text-left font-semibold text-slate-100">
                              {row}
                            </th>
                            {TABULATOR_HEADERS.map((header) => (
                              <td
                                key={`${entry.service.id}-${row}-${header}`}
                                className="border-l border-white/10 px-3 py-3 text-center text-slate-200"
                              >
                                {entry.values[row]?.[header] || "0"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

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
                    {currentService.rows.map((row) => (
                      <tr key={row} className="odd:bg-white/[0.02] even:bg-white/[0.05]">
                        <th className="sticky left-0 z-10 border-r border-white/10 bg-[#3a465d] px-3 py-3 text-left text-[11px] font-semibold leading-4 text-slate-100">
                          {row}
                        </th>
                        {TABULATOR_HEADERS.map((header) => (
                          <td key={`${row}-${header}`} className="border-l border-white/10 px-1 py-1">
                            <input
                              value={tableValues[row]?.[header] || ""}
                              onChange={(event) =>
                                handleCellChange(row, header, event.target.value)
                              }
                              disabled={isFormLocked}
                              inputMode="numeric"
                              className="w-full rounded-lg border border-white/5 bg-[#2a3448] px-2 py-2 text-center text-xs text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:bg-[#313d54] disabled:cursor-not-allowed disabled:bg-[#253145] disabled:text-slate-400"
                              placeholder="0"
                              type="text"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
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
                      <span className="text-sm font-medium text-slate-200">Correo</span>
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
                                  void handleAdminSendReset(managedUser.uid, managedUser.email)
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

                  <label className="flex items-center gap-3 text-sm text-slate-600">
                    <input
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-violet-700 focus:ring-violet-600"
                      type="checkbox"
                    />
                    Mantener mi sesion abierta
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
