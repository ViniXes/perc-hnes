"use client";

/**
 * RECURSOS HUMANOS > PERSONAL DESVINCULADO (memo HNES-2026-ESDOMED, 04/11/2026).
 *
 * Recursos Humanos reporta cada mes, en los primeros 3 días hábiles, el personal
 * que dejó de laborar el mes anterior (nombre, carné, cargo, área y fecha de fin
 * de la relación laboral), o deja constancia de "sin movimientos". ESDOMED usa
 * los 2 días hábiles siguientes para deshabilitar los accesos al SIS y lo marca
 * persona por persona (Norma técnica del expediente clínico, art. 23 lit. f y g).
 *
 * Firestore: `personalDesvinculado/<periodo>` ("YYYY-MM" = mes que se reporta).
 * Lo leen y escriben SOLO los administradores de ESDOMED y la cuenta con el
 * acceso "panel-desvinculados" (Recursos Humanos). Solo ESDOMED marca el SIS.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firestore";
import {
  buildRecentPeriods,
  getClosingPeriodId,
  getFirstBusinessDays,
  getShortPeriodLabel,
} from "@/lib/periodos";
import { BTN_GUARDAR } from "@/components/ui-basicos";

const COLECCION = "personalDesvinculado";
// Plazo del memo: RRHH envía en los 3 primeros días hábiles; ESDOMED deshabilita
// en los 2 siguientes (4º y 5º día hábil).
const DIAS_RRHH = 3;
const DIAS_ESDOMED = 5;
// Primer mes que se reporta: el memo es del 4 de noviembre de 2026, así que el
// primer reporte es el de octubre. Antes de eso no hay nada que mostrar.
const PRIMER_PERIODO = "2026-10";

export type PersonaDesvinculada = {
  id: string;
  nombre: string;
  carne: string;
  cargo: string;
  area: string;
  /** "YYYY-MM-DD" */
  fechaFin: string;
  sisDeshabilitado: boolean;
  sisPor: string;
  sisFecha: string;
};

type Reporte = {
  periodId: string;
  estado: "borrador" | "enviado";
  sinMovimientos: boolean;
  personas: PersonaDesvinculada[];
  responsable: string;
  enviadoPor: string;
  enviadoEn: Date | null;
  actualizadoEn: Date | null;
};

type Props = {
  isLight: boolean;
  /** Correo de la cuenta (queda en el registro). */
  usuario: string;
  /** Nombre de la persona: propuesta para "responsable del envío". */
  nombreUsuario: string;
  /** Administrador de ESDOMED: ve todo y marca los accesos del SIS. */
  esEsdomed: boolean;
  /** Puede llenar y enviar el reporte (Recursos Humanos o administrador). */
  puedeEnviar: boolean;
  /** Días bloqueados del calendario de PULSO (asuetos extraordinarios). */
  blockedDates: string[];
};

const nuevaPersona = (): PersonaDesvinculada => ({
  id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  nombre: "",
  carne: "",
  cargo: "",
  area: "",
  fechaFin: "",
  sisDeshabilitado: false,
  sisPor: "",
  sisFecha: "",
});

function aFecha(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate() : null;
}

function leerReporte(periodId: string, x: Record<string, unknown>): Reporte {
  const personas = Array.isArray(x.personas) ? (x.personas as Record<string, unknown>[]) : [];
  return {
    periodId,
    estado: x.estado === "enviado" ? "enviado" : "borrador",
    sinMovimientos: x.sinMovimientos === true,
    personas: personas.map((p) => ({
      id: String(p.id ?? "") || nuevaPersona().id,
      nombre: String(p.nombre ?? ""),
      carne: String(p.carne ?? ""),
      cargo: String(p.cargo ?? ""),
      area: String(p.area ?? ""),
      fechaFin: String(p.fechaFin ?? ""),
      sisDeshabilitado: p.sisDeshabilitado === true,
      sisPor: String(p.sisPor ?? ""),
      sisFecha: String(p.sisFecha ?? ""),
    })),
    responsable: String(x.responsable ?? ""),
    enviadoPor: String(x.enviadoPor ?? ""),
    enviadoEn: aFecha(x.enviadoEn),
    actualizadoEn: aFecha(x.actualizadoEn),
  };
}

/** Mes siguiente al reportado: ahí corre el plazo. */
function mesDelPlazo(periodId: string): Date {
  const [y, m] = periodId.split("-").map((n) => Number.parseInt(n, 10));
  return new Date(y, m, 1, 12);
}

function finDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
}

const FECHA_LARGA = new Intl.DateTimeFormat("es-SV", { weekday: "long", day: "numeric", month: "long" });
const FECHA_HORA = new Intl.DateTimeFormat("es-SV", { dateStyle: "short", timeStyle: "short" });

function fechaTexto(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha || "";
}

function limpiar(v: string, max = 120): string {
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

export function PersonalDesvinculado({ isLight, usuario, nombreUsuario, esEsdomed, puedeEnviar, blockedDates }: Props) {
  const periodoActual = useMemo(() => getClosingPeriodId(new Date()), []);
  const periodos = useMemo(
    () => buildRecentPeriods(periodoActual, 12).filter((p) => p.id >= PRIMER_PERIODO),
    [periodoActual],
  );
  const [periodId, setPeriodId] = useState(periodoActual);
  const [reportes, setReportes] = useState<Record<string, Reporte>>({});
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  // Borrador en pantalla del periodo elegido.
  const [sinMovimientos, setSinMovimientos] = useState(false);
  const [personas, setPersonas] = useState<PersonaDesvinculada[]>([nuevaPersona()]);
  const [responsable, setResponsable] = useState(nombreUsuario);
  const [editando, setEditando] = useState(false);

  // Pone en pantalla el borrador del mes elegido (lo guardado o uno vacío).
  const aplicarBorrador = useCallback(
    (r: Reporte | null) => {
      setAviso("");
      setSinMovimientos(r?.sinMovimientos ?? false);
      setPersonas(r?.personas.length ? r.personas : [nuevaPersona()]);
      setResponsable(r?.responsable || nombreUsuario);
      setEditando(r?.estado !== "enviado");
    },
    [nombreUsuario],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const snap = await getDocs(collection(db, COLECCION));
      const todo: Record<string, Reporte> = {};
      snap.docs.forEach((d) => {
        todo[d.id] = leerReporte(d.id, d.data() as Record<string, unknown>);
      });
      setReportes(todo);
      aplicarBorrador(todo[periodoActual] ?? null);
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permite leer los reportes. Falta publicar las reglas de «personalDesvinculado»."
          : "No se pudieron cargar los reportes. Revise la conexión e intente de nuevo.",
      );
    } finally {
      setCargando(false);
    }
  }, [aplicarBorrador, periodoActual]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const reporte = reportes[periodId] ?? null;

  const elegirPeriodo = (pid: string) => {
    setPeriodId(pid);
    setError("");
    aplicarBorrador(reportes[pid] ?? null);
  };

  const plazo = useMemo(() => {
    const dias = getFirstBusinessDays(mesDelPlazo(periodId), blockedDates, DIAS_ESDOMED);
    return { rrhh: finDelDia(dias[DIAS_RRHH - 1]), esdomed: finDelDia(dias[DIAS_ESDOMED - 1]) };
  }, [periodId, blockedDates]);

  const fueraDePlazo = (r: Reporte | null) => {
    if (r?.estado === "enviado") return !!r.enviadoEn && r.enviadoEn > plazoDe(r.periodId);
    return new Date() > plazoDe(periodId);
  };
  function plazoDe(pid: string) {
    return finDelDia(getFirstBusinessDays(mesDelPlazo(pid), blockedDates, DIAS_RRHH)[DIAS_RRHH - 1]);
  }

  const guardar = async (enviar: boolean) => {
    setError("");
    setAviso("");
    const lista = sinMovimientos
      ? []
      : personas
          .map((p) => ({
            ...p,
            nombre: limpiar(p.nombre),
            carne: limpiar(p.carne, 40),
            cargo: limpiar(p.cargo),
            area: limpiar(p.area),
          }))
          .filter((p) => p.nombre || p.carne || p.cargo || p.area || p.fechaFin);
    if (enviar) {
      if (!sinMovimientos && lista.length === 0) {
        setError("Agregue al menos una persona o marque «Sin movimientos este mes».");
        return;
      }
      const incompleta = lista.findIndex((p) => !p.nombre || !p.carne || !p.cargo || !p.area || !p.fechaFin);
      if (incompleta >= 0) {
        setError(`Complete todos los datos de la persona ${incompleta + 1} (nombre, carné, cargo, área y fecha).`);
        return;
      }
      if (!limpiar(responsable)) {
        setError("Escriba el nombre de la persona responsable del envío.");
        return;
      }
    }
    setOcupado(enviar ? "enviar" : "borrador");
    try {
      const yaEnviado = reporte?.estado === "enviado";
      const datos: Record<string, unknown> = {
        periodId,
        sinMovimientos,
        personas: lista,
        responsable: limpiar(responsable),
        estado: enviar || yaEnviado ? "enviado" : "borrador",
        actualizadoEn: serverTimestamp(),
        actualizadoPor: usuario,
      };
      // La fecha de envío es la PRIMERA: una corrección posterior no la mueve.
      if (enviar && !yaEnviado) {
        datos.enviadoEn = serverTimestamp();
        datos.enviadoPor = usuario;
      }
      await setDoc(doc(db, COLECCION, periodId), datos, { merge: true });
      const ahora = new Date();
      setReportes((prev) => ({
        ...prev,
        [periodId]: {
          periodId,
          estado: datos.estado as Reporte["estado"],
          sinMovimientos,
          personas: lista,
          responsable: limpiar(responsable),
          enviadoPor: enviar && !yaEnviado ? usuario : prev[periodId]?.enviadoPor ?? "",
          enviadoEn: enviar && !yaEnviado ? ahora : prev[periodId]?.enviadoEn ?? null,
          actualizadoEn: ahora,
        },
      }));
      if (enviar) setEditando(false);
      setAviso(
        enviar
          ? yaEnviado
            ? "Corrección guardada. ESDOMED ya la ve."
            : "Reporte enviado a ESDOMED."
          : "Borrador guardado. Todavía no se ha enviado.",
      );
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore rechazó el guardado. Falta publicar las reglas de «personalDesvinculado» o la cuenta no tiene el acceso."
          : "No se pudo guardar. Revise la conexión e intente de nuevo.",
      );
    } finally {
      setOcupado("");
    }
  };

  // ESDOMED marca (o desmarca) que ya deshabilitó el acceso al SIS.
  const marcarSis = async (id: string, valor: boolean) => {
    if (!reporte) return;
    setOcupado(`sis-${id}`);
    setError("");
    try {
      const lista = reporte.personas.map((p) =>
        p.id === id
          ? { ...p, sisDeshabilitado: valor, sisPor: valor ? usuario : "", sisFecha: valor ? new Date().toISOString() : "" }
          : p,
      );
      await setDoc(
        doc(db, COLECCION, periodId),
        { personas: lista, actualizadoEn: serverTimestamp(), actualizadoPor: usuario },
        { merge: true },
      );
      setReportes((prev) => ({ ...prev, [periodId]: { ...reporte, personas: lista } }));
    } catch {
      setError("No se pudo marcar el acceso del SIS. Intente de nuevo.");
    } finally {
      setOcupado("");
    }
  };

  const setPersona = (id: string, campo: keyof PersonaDesvinculada, valor: string) =>
    setPersonas((lista) => lista.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));

  // --- Estilos (mismos que Planificación · Mis documentos) ---------------------
  const tarjeta = isLight
    ? "border border-slate-200 bg-white text-slate-900"
    : "border border-white/10 bg-[#202c41] text-slate-100";
  const sub = isLight ? "text-slate-500" : "text-slate-400";
  const input = `w-full rounded-xl px-3 py-2 text-sm outline-none transition focus:border-teal-400/60 disabled:opacity-60 ${
    isLight
      ? "border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
      : "border border-white/[0.08] bg-white/[0.035] text-white placeholder:text-slate-500"
  }`;
  const desplegable = `${input} ${
    isLight ? "[&_option]:bg-white [&_option]:text-slate-900" : "[&_option]:bg-[#22487f] [&_option]:text-white"
  }`;
  const etiqueta = `mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] ${sub}`;
  const btnSec = `rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
    isLight
      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
  }`;
  const caja = isLight ? "border-slate-200 bg-slate-50/60" : "border-white/[0.07] bg-white/[0.02]";
  const pastilla = (tono: "ok" | "alerta" | "error" | "neutro") =>
    `inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
      tono === "ok"
        ? "bg-emerald-500/15 text-emerald-600 ring-1 ring-inset ring-emerald-500/30"
        : tono === "alerta"
          ? "bg-amber-500/15 text-amber-600 ring-1 ring-inset ring-amber-500/30"
          : tono === "error"
            ? "bg-rose-500/15 text-rose-500 ring-1 ring-inset ring-rose-500/30"
            : isLight
              ? "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200"
              : "bg-white/[0.06] text-slate-300 ring-1 ring-inset ring-white/10"
    }`;

  const estadoDe = (r: Reporte | null, pid: string) => {
    if (!r || r.estado !== "enviado") {
      const vencido = new Date() > plazoDe(pid);
      return {
        texto: r ? (vencido ? "Borrador · vencido" : "Borrador sin enviar") : vencido ? "No enviado · vencido" : "Pendiente",
        tono: vencido ? ("error" as const) : ("alerta" as const),
      };
    }
    const tarde = !!r.enviadoEn && r.enviadoEn > plazoDe(pid);
    const base = r.sinMovimientos ? "Sin movimientos" : `Enviado · ${r.personas.length} persona${r.personas.length === 1 ? "" : "s"}`;
    return { texto: tarde ? `${base} · fuera de plazo` : base, tono: tarde ? ("alerta" as const) : ("ok" as const) };
  };

  const estado = estadoDe(reporte, periodId);
  const enviado = reporte?.estado === "enviado";
  const sisPendientes = enviado ? reporte.personas.filter((p) => !p.sisDeshabilitado).length : 0;
  const puedeEditar = puedeEnviar && editando;

  return (
    <section id="panel-desvinculados" className={`rounded-[24px] p-5 ${tarjeta}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${sub}`}>Recursos Humanos · Expediente Clínico</p>
          <h2 className={`mt-1 text-xl font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>Personal desvinculado</h2>
          <p className={`mt-1 max-w-2xl text-sm ${isLight ? "text-slate-600" : "text-slate-400"}`}>
            Recursos Humanos reporta cada mes, en los primeros 3 días hábiles, el personal que dejó de laborar el mes
            anterior, o deja constancia de que no hubo movimientos. ESDOMED deshabilita sus accesos al SIS (Norma técnica
            del expediente clínico, art. 23, literales f y g).
          </p>
        </div>
        <label className="block w-full sm:w-56">
          <span className={etiqueta}>Mes que se reporta</span>
          <select className={desplegable} value={periodId} onChange={(e) => elegirPeriodo(e.target.value)}>
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {getShortPeriodLabel(p.id)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
      ) : null}
      {aviso ? (
        <p className="mt-4 rounded-xl border border-teal-400/40 bg-teal-500/10 px-3 py-2 text-sm text-teal-600">{aviso}</p>
      ) : null}

      {/* ---- Estado y plazos ---- */}
      <div className={`mt-5 grid gap-3 rounded-2xl border p-4 sm:grid-cols-3 ${caja}`}>
        <div>
          <p className={etiqueta}>Estado</p>
          <span className={pastilla(estado.tono)}>{cargando ? "Cargando…" : estado.texto}</span>
          {enviado && reporte.enviadoEn ? (
            <p className={`mt-1 text-[11px] ${sub}`}>
              Enviado el {FECHA_HORA.format(reporte.enviadoEn)}
              {reporte.responsable ? ` · ${reporte.responsable}` : ""}
            </p>
          ) : null}
        </div>
        <div>
          <p className={etiqueta}>Plazo de Recursos Humanos</p>
          <p className="text-sm font-semibold first-letter:uppercase">{FECHA_LARGA.format(plazo.rrhh)}</p>
          <p className={`text-[11px] ${sub}`}>3er día hábil del mes</p>
        </div>
        <div>
          <p className={etiqueta}>ESDOMED deshabilita en el SIS</p>
          <p className="text-sm font-semibold first-letter:uppercase">a más tardar el {FECHA_LARGA.format(plazo.esdomed)}</p>
          {enviado && !reporte.sinMovimientos ? (
            <p className={`text-[11px] ${sisPendientes ? "text-amber-500" : "text-emerald-500"}`}>
              {sisPendientes
                ? `${sisPendientes} de ${reporte.personas.length} pendiente${sisPendientes === 1 ? "" : "s"}`
                : "Todos los accesos deshabilitados"}
            </p>
          ) : null}
        </div>
      </div>

      {/* ---- Formulario de RRHH ---- */}
      {puedeEditar ? (
        <div className={`mt-5 rounded-2xl border p-4 ${caja}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              {enviado ? "Corregir el reporte enviado" : `Reporte de ${getShortPeriodLabel(periodId).replace(" - ", " ")}`}
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal-600"
                checked={sinMovimientos}
                onChange={(e) => setSinMovimientos(e.target.checked)}
              />
              Sin movimientos este mes
            </label>
          </div>

          {sinMovimientos ? (
            <p className={`mt-3 text-sm ${sub}`}>
              Se dejará constancia de que en {getShortPeriodLabel(periodId).replace(" - ", " ")} nadie dejó de laborar en el
              hospital.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {personas.map((p, i) => (
                <div key={p.id} className={`rounded-xl border p-3 ${isLight ? "border-slate-200 bg-white" : "border-white/[0.07] bg-white/[0.02]"}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className={`text-xs font-bold ${sub}`}>Persona {i + 1}</p>
                    {personas.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setPersonas((lista) => lista.filter((x) => x.id !== p.id))}
                        className="rounded-lg border border-rose-400/40 px-2 py-0.5 text-[11px] font-semibold text-rose-500 transition hover:bg-rose-500/10"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-2 md:grid-cols-[2fr_1fr_1.4fr_1.4fr_150px]">
                    <label className="block">
                      <span className={etiqueta}>Nombre completo</span>
                      <input className={input} value={p.nombre} onChange={(e) => setPersona(p.id, "nombre", e.target.value)} />
                    </label>
                    <label className="block">
                      <span className={etiqueta}>Carné / ID</span>
                      <input className={input} value={p.carne} onChange={(e) => setPersona(p.id, "carne", e.target.value)} />
                    </label>
                    <label className="block">
                      <span className={etiqueta}>Cargo</span>
                      <input className={input} value={p.cargo} onChange={(e) => setPersona(p.id, "cargo", e.target.value)} />
                    </label>
                    <label className="block">
                      <span className={etiqueta}>Área de trabajo</span>
                      <input className={input} value={p.area} onChange={(e) => setPersona(p.id, "area", e.target.value)} />
                    </label>
                    <label className="block">
                      <span className={etiqueta}>Fecha de fin</span>
                      <input
                        type="date"
                        className={input}
                        value={p.fechaFin}
                        onChange={(e) => setPersona(p.id, "fechaFin", e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button type="button" className={btnSec} onClick={() => setPersonas((lista) => [...lista, nuevaPersona()])}>
                + Agregar persona
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <label className="block w-full sm:w-80">
              <span className={etiqueta}>Responsable del envío</span>
              <input className={input} value={responsable} onChange={(e) => setResponsable(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              {enviado ? (
                <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => aplicarBorrador(reporte)}>
                  Cancelar
                </button>
              ) : (
                <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => void guardar(false)}>
                  {ocupado === "borrador" ? "Guardando…" : "Guardar borrador"}
                </button>
              )}
              <button
                type="button"
                disabled={!!ocupado}
                onClick={() => void guardar(true)}
                className={`${BTN_GUARDAR} rounded-xl px-4 py-2 text-sm transition disabled:opacity-50`}
              >
                {ocupado === "enviar" ? "Enviando…" : enviado ? "Guardar corrección" : "Enviar a ESDOMED"}
              </button>
            </div>
          </div>
          {!enviado && fueraDePlazo(reporte) ? (
            <p className="mt-2 text-[11px] text-amber-500">El plazo ya venció: el reporte quedará marcado como fuera de plazo.</p>
          ) : null}
        </div>
      ) : null}

      {/* ---- Reporte enviado ---- */}
      {enviado && !puedeEditar ? (
        <div className={`mt-5 rounded-2xl border ${caja}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-500/15 px-4 py-2">
            <p className="text-sm font-bold">Reporte de {getShortPeriodLabel(periodId).replace(" - ", " ")}</p>
            {puedeEnviar ? (
              <button type="button" className={`${btnSec} px-2.5 py-1 text-xs`} onClick={() => setEditando(true)}>
                Corregir
              </button>
            ) : null}
          </div>
          {reporte.sinMovimientos ? (
            <p className={`px-4 py-4 text-sm ${sub}`}>Recursos Humanos dejó constancia de que no hubo movimientos este mes.</p>
          ) : (
            <div className="divide-y divide-slate-500/10">
              {reporte.personas.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{p.nombre}</p>
                    <p className={`text-[11px] ${sub}`}>
                      Carné {p.carne} · {p.cargo} · {p.area} · Fin: {fechaTexto(p.fechaFin)}
                    </p>
                  </div>
                  {esEsdomed ? (
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-teal-600"
                        checked={p.sisDeshabilitado}
                        disabled={!!ocupado}
                        onChange={(e) => void marcarSis(p.id, e.target.checked)}
                      />
                      Acceso SIS deshabilitado
                    </label>
                  ) : (
                    <span className={pastilla(p.sisDeshabilitado ? "ok" : "neutro")}>
                      {p.sisDeshabilitado ? "SIS deshabilitado" : "SIS pendiente"}
                    </span>
                  )}
                  {p.sisDeshabilitado && p.sisFecha ? (
                    <p className={`w-full text-right text-[11px] ${sub}`}>
                      {FECHA_HORA.format(new Date(p.sisFecha))}
                      {p.sisPor ? ` · ${p.sisPor.split("@")[0]}` : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!enviado && !puedeEnviar && !cargando ? (
        <p className={`mt-5 text-sm ${sub}`}>Recursos Humanos todavía no ha enviado el reporte de este mes.</p>
      ) : null}

      {/* ---- Historial ---- */}
      <div className={`mt-5 rounded-2xl border ${caja}`}>
        <p className="border-b border-slate-500/15 px-4 py-2 text-sm font-bold">Últimos meses</p>
        <div className="divide-y divide-slate-500/10">
          {periodos.map((p) => {
            const r = reportes[p.id] ?? null;
            const e = estadoDe(r, p.id);
            const pend = r?.estado === "enviado" ? r.personas.filter((x) => !x.sisDeshabilitado).length : 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => elegirPeriodo(p.id)}
                className={`flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2 text-left text-sm transition ${
                  p.id === periodId ? (isLight ? "bg-teal-50" : "bg-teal-400/[0.08]") : isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.03]"
                }`}
              >
                <span className="font-semibold">{getShortPeriodLabel(p.id)}</span>
                <span className="flex flex-wrap items-center gap-2">
                  {pend ? <span className={pastilla("alerta")}>SIS: {pend} pendiente{pend === 1 ? "" : "s"}</span> : null}
                  <span className={pastilla(e.tono)}>{e.texto}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
