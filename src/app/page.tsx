"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  User,
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
import type { AuthError } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firestore";
import {
  COST_CENTER_COUNT,
  SERVICE_COUNT,
  SERVICE_DEFINITIONS,
  TABULATOR_HEADERS,
  type ServiceDefinition,
} from "@/lib/tabulator-template";

type AuthMode = "login" | "register";
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
  name: string;
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
  name: string;
};

const DEFAULT_TEMP_PASSWORD = "PERC2026!";

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

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getFirstThreeBusinessDays(referenceDate: Date) {
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

  while (result.length < 3) {
    if (isBusinessDay(current)) {
      result.push(new Date(current));
    }

    current.setDate(current.getDate() + 1);
  }

  return result;
}

function getCaptureWindow(referenceDate: Date) {
  const openDays = getFirstThreeBusinessDays(referenceDate);
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

function getPeriodId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function sanitizeNumericValue(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function normalizeProfile(uid: string, email: string, data: Record<string, unknown>): ManagedUser {
  const role = data.role === "admin" ? "admin" : "service";
  const defaultPermissions = getDefaultPermissions(role);
  const rawPermissions =
    typeof data.permissions === "object" && data.permissions !== null
      ? (data.permissions as Partial<ServicePermissions>)
      : {};

  return {
    uid,
    serviceId: typeof data.serviceId === "string" ? data.serviceId : null,
    serviceName: typeof data.serviceName === "string" ? data.serviceName : null,
    email,
    name: typeof data.name === "string" ? data.name : email.split("@")[0] || "Usuario",
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

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [serviceProfile, setServiceProfile] = useState<ManagedUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
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
  const [adminBusyUserId, setAdminBusyUserId] = useState("");

  const currentService = useMemo(
    () => getServiceById(serviceProfile?.serviceId),
    [serviceProfile?.serviceId],
  );
  const captureWindow = useMemo(() => getCaptureWindow(now), [now]);
  const periodId = useMemo(() => getPeriodId(now), [now]);
  const periodLabel = useMemo(
    () => PERIOD_FORMATTER.format(new Date(now.getFullYear(), now.getMonth(), 1)),
    [now],
  );
  const welcomeName = useMemo(() => {
    return serviceProfile?.name || user?.displayName || user?.email?.split("@")[0] || "Usuario";
  }, [serviceProfile?.name, user?.displayName, user?.email]);
  const isAdmin = !!serviceProfile?.permissions.canManageUsers || serviceProfile?.role === "admin";

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
      if (!user) {
        setServiceProfile(null);
        setTableValues({});
        setAdminUsers([]);
        setAdminDrafts({});
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
          const users = await fetchManagedUsers();

          if (!cancelled) {
            setAdminUsers(users);
            setAdminDrafts(buildAdminDrafts(users));
          }
        } else if (!cancelled) {
          setAdminUsers([]);
          setAdminDrafts({});
        }
      } catch (sessionError) {
        if (!cancelled) {
          setServiceProfile(null);
          setTableValues({});
          setAdminUsers([]);
          setAdminDrafts({});
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
  }, [periodId, user]);

  async function loadSavedData(showEmptyMessage: boolean) {
    if (!currentService) {
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
    } catch {
      setError("No pudimos recuperar los datos guardados.");
    } finally {
      setIsLoadingData(false);
    }
  }

  async function loadAdminUsers() {
    if (!isAdmin) {
      return;
    }

    setIsLoadingUsers(true);

    try {
      const users = await fetchManagedUsers();
      setAdminUsers(users);
      setAdminDrafts(buildAdminDrafts(users));
      setMessage("Listado de usuarios actualizado.");
      setError("");
    } catch {
      setError("No pudimos cargar los usuarios del modulo administrador.");
    } finally {
      setIsLoadingUsers(false);
    }
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

      if (mode === "register") {
        if (!selectedServiceId) {
          throw new Error("service-required");
        }

        const service = getServiceById(selectedServiceId);

        if (!service) {
          throw new Error("service-required");
        }

        const assignmentRef = doc(db, "serviceAssignments", service.id);
        const assignmentSnapshot = await getDoc(assignmentRef);

        if (assignmentSnapshot.exists()) {
          throw new Error("service-already-assigned");
        }

        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          DEFAULT_TEMP_PASSWORD,
        );

        await updateProfile(credential.user, {
          displayName: name.trim() || service.name,
        });

        await setDoc(doc(db, "serviceUsers", credential.user.uid), {
          serviceId: service.id,
          serviceName: service.name,
          email,
          name: name.trim() || service.name,
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
          email,
          updatedAt: serverTimestamp(),
        });

        setPassword("");
        setSelectedServiceId("");
        setName("");
        setMessage(
          `Cuenta creada para ${service.name}. Contrasena temporal: ${DEFAULT_TEMP_PASSWORD}. Debe cambiarse al ingresar.`,
        );
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setPassword("");
      }
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setError("");
    setMessage("");
    setServiceProfile(null);
    setTableValues({});
    setAdminUsers([]);
    setAdminDrafts({});
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
    if (!user || !currentService || !serviceProfile) {
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
      setMessage(`Datos guardados correctamente para ${currentService.name}.`);
    } catch {
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

  const isLoadingSession = !authReady || (user !== null && !profileReady);

  if (user && serviceProfile && !isLoadingSession) {
    const isDateLocked = !captureWindow.isOpen;
    const isPermissionLocked = !currentService || !serviceProfile.permissions.canEdit;
    const isFormLocked = isDateLocked || isPermissionLocked;
    const openDaysLabel = captureWindow.openDays
      .map((day) => SHORT_DATE_FORMATTER.format(day))
      .join(" / ");

    return (
      <main className="min-h-screen bg-[#161f31] px-4 py-6 text-slate-100 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-[1850px] space-y-6">
          <section className="rounded-[28px] border border-white/10 bg-[#202c41] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.45)]">
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
                  <button
                    type="button"
                    onClick={() => void loadAdminUsers()}
                    disabled={isLoadingUsers}
                    className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-300"
                  >
                    {isLoadingUsers ? "Actualizando..." : "Actualizar usuarios"}
                  </button>
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

          {currentService ? (
            <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[#202c41] shadow-[0_24px_80px_rgba(3,7,18,0.35)]">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm text-slate-100">
                  <thead>
                    <tr className="bg-[#1a2334] text-left">
                      <th className="sticky left-0 z-20 min-w-[280px] border-b border-white/10 bg-[#1a2334] px-4 py-4 font-semibold uppercase tracking-wide">
                        Centro de costos
                      </th>
                      {TABULATOR_HEADERS.map((header) => (
                        <th
                          key={header}
                          className="min-w-[210px] border-b border-l border-white/10 px-4 py-4 align-top font-semibold"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentService.rows.map((row) => (
                      <tr key={row} className="odd:bg-white/[0.02] even:bg-white/[0.05]">
                        <th className="sticky left-0 z-10 border-r border-white/10 bg-[#3a465d] px-4 py-4 text-left font-semibold text-slate-100">
                          {row}
                        </th>
                        {TABULATOR_HEADERS.map((header) => (
                          <td key={`${row}-${header}`} className="border-l border-white/10 px-2 py-2">
                            <input
                              value={tableValues[row]?.[header] || ""}
                              onChange={(event) =>
                                handleCellChange(row, header, event.target.value)
                              }
                              disabled={isFormLocked}
                              inputMode="numeric"
                              className="w-full rounded-xl border border-white/5 bg-[#2a3448] px-3 py-3 text-center text-base text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:bg-[#313d54] disabled:cursor-not-allowed disabled:bg-[#253145] disabled:text-slate-400"
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

          <section className="rounded-[24px] border border-white/10 bg-[#202c41] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)]">
            <div className="mb-5">
              <p className="text-sm uppercase tracking-[0.2em] text-violet-200/80">
                Seguridad
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Cambiar contrasena</h2>
              <p className="mt-2 text-sm text-slate-300">
                La clave inicial es generica para las cuentas nuevas. Cada usuario puede cambiarla
                desde aqui.
              </p>
            </div>

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
          </section>

          {isAdmin ? (
            <section className="rounded-[24px] border border-white/10 bg-[#202c41] p-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)]">
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

              <div className="overflow-x-auto">
                <table className="min-w-[1400px] border-collapse text-sm text-slate-100">
                  <thead>
                    <tr className="bg-[#1a2334] text-left">
                      <th className="px-4 py-3 font-semibold">Responsable</th>
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
                            <p className="mt-1 break-all font-mono text-xs text-slate-400">
                              {managedUser.uid}
                            </p>
                          </td>
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
                              {SERVICE_DEFINITIONS.map((service) => (
                                <option key={service.id} value={service.id}>
                                  {service.name}
                                </option>
                              ))}
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
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4efe6] text-slate-950">
      <section className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.15fr_500px]">
        <div className="relative flex min-h-[45vh] flex-col justify-between overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.22),transparent_28%),radial-gradient(circle_at_80%_15%,rgba(16,185,129,0.18),transparent_25%),linear-gradient(150deg,#020617_0%,#111827_55%,#172554_100%)]" />
          <div className="relative flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-200">
              PERC HNES
            </p>
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_24px_rgba(110,231,183,0.85)]" />
          </div>

          <div className="relative max-w-2xl py-14 lg:py-0">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-violet-200">
              Tabuladores por servicio
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              Cada servicio entra con su propia cuenta y su propia clave temporal.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              La primera fila de centros de costos se mantiene igual para todos. El usuario cambia
              su contrasena despues del primer ingreso y el administrador puede ajustar permisos.
            </p>
          </div>

          <div className="relative grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <strong className="block text-sm uppercase tracking-wide text-violet-100">
                Servicios
              </strong>
              <p className="mt-2 text-3xl font-semibold text-white">{SERVICE_COUNT}</p>
              <p className="mt-1 text-sm text-slate-300">Detectados desde el Excel</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <strong className="block text-sm uppercase tracking-wide text-violet-100">
                Centros
              </strong>
              <p className="mt-2 text-3xl font-semibold text-white">{COST_CENTER_COUNT}</p>
              <p className="mt-1 text-sm text-slate-300">Encabezados compartidos</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <strong className="block text-sm uppercase tracking-wide text-violet-100">
                Clave inicial
              </strong>
              <p className="mt-2 text-2xl font-semibold text-white">{DEFAULT_TEMP_PASSWORD}</p>
              <p className="mt-1 text-sm text-slate-300">Debe cambiarse al ingresar</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
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
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                    {mode === "login" ? "Iniciar sesion" : "Registrar servicio"}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {mode === "login"
                      ? "Ingresa con la cuenta asignada a tu servicio o administrador."
                      : "Cada servicio se crea con una contrasena generica y luego el usuario la cambia desde su panel."}
                  </p>
                </div>

                <div className="mb-6 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError("");
                      setMessage("");
                    }}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                      mode === "login"
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      setError("");
                      setMessage("");
                    }}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                      mode === "register"
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Registro
                  </button>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                  {mode === "register" ? (
                    <>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Servicio</span>
                        <select
                          value={selectedServiceId}
                          onChange={(event) => setSelectedServiceId(event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
                          name="service"
                          required
                        >
                          <option value="">Selecciona un servicio</option>
                          {SERVICE_DEFINITIONS.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">
                          Nombre del responsable
                        </span>
                        <input
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
                          name="name"
                          placeholder="Ejemplo: Jefe de servicio"
                          type="text"
                        />
                      </label>
                    </>
                  ) : null}

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Correo</span>
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
                      name="email"
                      placeholder="correo@hospital.com"
                      required
                      type="email"
                    />
                  </label>

                  {mode === "login" ? (
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
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Contrasena generica inicial: <strong>{DEFAULT_TEMP_PASSWORD}</strong>
                    </div>
                  )}

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
                    <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </p>
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
                    {isSubmitting
                      ? "Procesando..."
                      : mode === "login"
                        ? "Entrar al sistema"
                        : "Crear cuenta del servicio"}
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
