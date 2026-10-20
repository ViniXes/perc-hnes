/**
 * PERIODOS Y VENTANAS DE CAPTURA
 *
 * Todo lo que tiene que ver con el calendario de PULSO: que dia habil es, hasta
 * cuando esta abierta la captura de cada modulo, a que mes pertenece lo que se
 * esta digitando y como se escribe ese mes en pantalla.
 *
 * Reglas que viven aca y no se repiten en ningun otro lado:
 *  - La ventana de captura son los primeros dias habiles del mes y cierra a las
 *    2:30 p. m. del ultimo de esos dias.
 *  - El periodo de PRODUCCION siempre es el mes ANTERIOR al calendario: no se
 *    puede cerrar un mes que todavia no termina.
 *  - SEPS tiene su propio ciclo (cierre, transicion y captura), con reapertura
 *    en el sexto dia habil.
 *
 * Son funciones puras: no leen Firestore ni tocan la pantalla.
 */
import { MODULE_CAPTURE_DAYS, type ModuleId } from "@/lib/modules";

export const PERIOD_FORMATTER = new Intl.DateTimeFormat("es-HN", {
  month: "long",
  year: "numeric",
});

export function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

// Domingo de Pascua (algoritmo gregoriano de Meeus/Jones/Butcher).
function getEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

// Asuetos nacionales de El Salvador (Codigo de Trabajo, art. 190), con las
// fiestas agostinas de San Salvador (3 al 6 de agosto). Se descuentan SOLOS de
// la ventana de captura: el administrador ya no tiene que cargarlos cada año.
// Lo extraordinario (vacaciones, cierres) se sigue agregando en el calendario.
const FERIADOS_FIJOS: Record<string, string> = {
  "01-01": "Año Nuevo",
  "05-01": "Día del Trabajo",
  "05-10": "Día de la Madre",
  "06-17": "Día del Padre",
  "08-03": "Fiestas Agostinas",
  "08-04": "Fiestas Agostinas",
  "08-05": "Fiestas Agostinas",
  "08-06": "Fiestas Agostinas",
  "09-15": "Día de la Independencia",
  "11-02": "Día de los Difuntos",
  "12-25": "Navidad",
};

const feriadosCache = new Map<number, Map<string, string>>();

/** Asuetos nacionales del año: mapa "YYYY-MM-DD" -> nombre. */
export function getFeriadosNacionales(year: number): Map<string, string> {
  const cached = feriadosCache.get(year);
  if (cached) return cached;
  const result = new Map<string, string>();
  for (const [monthDay, name] of Object.entries(FERIADOS_FIJOS)) {
    result.set(`${year}-${monthDay}`, name);
  }
  const easter = getEasterSunday(year);
  const juevesSanto = new Date(easter);
  juevesSanto.setDate(easter.getDate() - 3);
  const viernesSanto = new Date(easter);
  viernesSanto.setDate(easter.getDate() - 2);
  result.set(getDateKey(juevesSanto), "Jueves Santo");
  result.set(getDateKey(viernesSanto), "Viernes Santo");
  feriadosCache.set(year, result);
  return result;
}

export function getFeriadoNacional(date: Date): string | null {
  return getFeriadosNacionales(date.getFullYear()).get(getDateKey(date)) ?? null;
}

export function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

// Hora de cierre diario de la captura: 2:30 PM (14:30) del ultimo dia habil de la ventana.
export const CAPTURE_CLOSE_HOUR = 14;
export const CAPTURE_CLOSE_MINUTE = 30;
export function isBeforeDailyCutoff(date: Date) {
  return (
    date.getHours() < CAPTURE_CLOSE_HOUR ||
    (date.getHours() === CAPTURE_CLOSE_HOUR && date.getMinutes() < CAPTURE_CLOSE_MINUTE)
  );
}

export function getFirstBusinessDays(referenceDate: Date, blockedDates: string[], totalDays: number) {
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
    if (
      isBusinessDay(current) &&
      !blockedDateSet.has(getDateKey(current)) &&
      !getFeriadoNacional(current)
    ) {
      result.push(new Date(current));
    }

    current.setDate(current.getDate() + 1);
  }

  return result;
}

export function getCaptureWindow(
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

export type SepsPhase = "cierre" | "transicion" | "captura";

// Ventana especial de SEPS (doble fase) por mes calendario:
// - "cierre": dias 1 .. 5to dia habil -> abierto para CERRAR el mes anterior.
// - "transicion": despues del cierre y antes del dia 6 -> cerrado.
// - "captura": dia 6 .. fin de mes -> abierto para digitar el mes EN CURSO (diarios).
export function getSepsWindow(referenceDate: Date, blockedDates: string[]) {
  const closeDays = getFirstBusinessDays(
    referenceDate,
    blockedDates,
    MODULE_CAPTURE_DAYS.sesps,
  );
  // El cierre cierra a las 2:30 PM del ultimo (5to) dia habil.
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

/** 2:30 p. m. del dia indicado, en milisegundos (hora local). */
export function getCloseMillis(day: Date) {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    CAPTURE_CLOSE_HOUR,
    CAPTURE_CLOSE_MINUTE,
    0,
    0,
  ).getTime();
}

/**
 * Horas de cierre del mes que se esta cerrando (el anterior al calendario de
 * `referenceDate`), ya con feriados y fechas no habiles aplicados. Se publican en
 * captureWindows/{periodo} para que las reglas de Firestore rechacen guardados
 * tardios. Horas y el Comite comparten ventana (SEPS cierra ese mismo dia).
 */
export function getModuleCloseMillis(referenceDate: Date, blockedDates: string[]) {
  const perc = getCaptureWindow(referenceDate, blockedDates, "perc").lastOpenDay;
  const horas = getCaptureWindow(referenceDate, blockedDates, "distribucion").lastOpenDay;
  return {
    perc: getCloseMillis(perc),
    horas: getCloseMillis(horas),
  };
}

export function getPeriodId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Periodo de PRODUCCION que se cierra: SIEMPRE el mes anterior al calendario actual.
// No se puede cerrar un mes hasta que termino (en febrero se cierra enero, etc.).
// La ventana de captura ocurre en el mes calendario actual, pero el dato pertenece
// a este periodo (mes anterior). Aplica a PERC, SEPS y Distribucion de Horas.
export function getClosingPeriodId(date: Date) {
  return getPeriodId(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

// Etiqueta legible ("Mayo 2026") de un periodo "YYYY-MM".
export function getPeriodLabel(periodId: string) {
  const [yearText, monthText] = periodId.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return periodId;
  }

  return PERIOD_FORMATTER.format(new Date(year, month - 1, 1));
}

// Etiqueta corta del periodo: "Febrero - 2026" (mes con inicial mayuscula + ano).
export const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat("es-ES", { month: "long" });
export function getShortPeriodLabel(periodId: string) {
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
export type RecentPeriod = { id: string; monthName: string; year: number };
export function buildRecentPeriods(latestPeriodId: string, count: number): RecentPeriod[] {
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
