"use client";

/**
 * SELECTORES DE MES Y DE FECHA
 *
 * Reemplazan a los calendarios nativos del navegador (<input type="month"> y
 * <input type="date">), que no se pueden estilizar: se ven blancos, con la letra
 * del sistema, y distintos en cada navegador. Estos son de PULSO, se ven igual
 * en todos lados y respetan el modo claro y el oscuro.
 *
 * Detalles que importan acá:
 *  - La semana empieza en LUNES, que es como se trabaja, y el fin de semana va
 *    atenuado: las ventanas de captura cuentan días hábiles.
 *  - El panel se dibuja con createPortal sobre el <body> y en posición fija, para
 *    que ninguna tarjeta con recorte lo corte, y se voltea hacia arriba si no
 *    cabe abajo.
 *  - 'min' y 'max' (en el mismo formato del valor) apagan lo que queda fuera de
 *    rango, para no ofrecer meses que el sistema después va a rechazar.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** "2026-09" -> "septiembre de 2026". Si no se entiende, se devuelve tal cual. */
export function etiquetaDeMes(valor: string): string {
  const anio = Number.parseInt(valor.slice(0, 4), 10);
  const mes = Number.parseInt(valor.slice(5, 7), 10);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) return valor || "Elegir mes";
  return `${MESES_LARGOS[mes - 1]} de ${anio}`;
}

/** "2026-09-17" -> "17 de septiembre de 2026". */
export function etiquetaDeFecha(valor: string): string {
  const anio = Number.parseInt(valor.slice(0, 4), 10);
  const mes = Number.parseInt(valor.slice(5, 7), 10);
  const dia = Number.parseInt(valor.slice(8, 10), 10);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) return valor || "Elegir fecha";
  return `${dia} de ${MESES_LARGOS[mes - 1]} de ${anio}`;
}

const IconoCalendario = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
    className="h-[17px] w-[17px] shrink-0 opacity-60"
  >
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </svg>
);

/** Panel flotante: posición fija, fuera de cualquier recorte, con cierre por
 *  clic afuera o Escape. */
function Capa({
  ancla,
  cerrar,
  claro,
  ancho,
  children,
}: {
  ancla: React.RefObject<HTMLButtonElement | null>;
  cerrar: () => void;
  claro: boolean;
  ancho: number;
  children: ReactNode;
}) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const calcular = () => {
      const el = ancla.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const alto = cajaRef.current?.offsetHeight ?? 320;
      const cabeAbajo = window.innerHeight - r.bottom > alto + 16;
      const top = cabeAbajo || r.top < alto + 16 ? r.bottom + 8 : r.top - alto - 8;
      const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - ancho - 8));
      setPos({ top, left });
    };
    calcular();
    window.addEventListener("resize", calcular);
    window.addEventListener("scroll", calcular, true);
    return () => {
      window.removeEventListener("resize", calcular);
      window.removeEventListener("scroll", calcular, true);
    };
  }, [ancla, ancho, children]);

  useEffect(() => {
    const alClic = (evento: MouseEvent) => {
      const destino = evento.target as Node;
      if (cajaRef.current?.contains(destino) || ancla.current?.contains(destino)) return;
      cerrar();
    };
    const alTeclear = (evento: globalThis.KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        cerrar();
      }
    };
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTeclear, true);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTeclear, true);
    };
  }, [ancla, cerrar]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={cajaRef}
      role="dialog"
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: ancho,
        zIndex: 200,
      }}
      className={`rounded-[18px] p-3 shadow-[0_1px_1px_rgba(0,0,0,0.35),0_22px_40px_-18px_rgba(0,0,0,0.85)] ${
        claro
          ? "border border-slate-200 bg-white"
          : "border border-white/10 border-t-white/[0.16] bg-gradient-to-b from-[#1e293f] to-[#18223a]"
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}

function Flecha({
  hacia,
  onClick,
  claro,
  disabled,
}: {
  hacia: "izquierda" | "derecha";
  onClick: () => void;
  claro: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={hacia === "izquierda" ? "Anterior" : "Siguiente"}
      className={`flex h-7 w-7 items-center justify-center rounded-[9px] transition disabled:opacity-25 ${
        claro ? "text-slate-400 hover:bg-slate-100 hover:text-slate-900" : "text-slate-400 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4">
        <path d={hacia === "izquierda" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} />
      </svg>
    </button>
  );
}

function Pie({
  claro,
  accion,
  onAccion,
  nota,
}: {
  claro: boolean;
  accion: string;
  onAccion: () => void;
  nota?: string;
}) {
  return (
    <div className={`mt-2.5 flex items-center justify-between border-t pt-2 ${claro ? "border-slate-100" : "border-white/[0.07]"}`}>
      <button
        type="button"
        onClick={onAccion}
        className={`text-[12px] font-semibold transition ${claro ? "text-teal-700 hover:text-teal-800" : "text-teal-300 hover:text-teal-200"}`}
      >
        {accion}
      </button>
      {nota ? <span className={`text-[11px] ${claro ? "text-slate-400" : "text-slate-500"}`}>{nota}</span> : null}
    </div>
  );
}

function Disparador({
  anclaRef,
  texto,
  abierto,
  onClick,
  claro,
  disabled,
  className,
  titulo,
  plano,
}: {
  anclaRef: React.RefObject<HTMLButtonElement | null>;
  texto: string;
  abierto: boolean;
  onClick: () => void;
  claro: boolean;
  disabled?: boolean;
  className?: string;
  titulo?: string;
  plano?: boolean;
}) {
  // "plano": sin marco ni fondo, para ir dentro de una ficha que ya los tiene.
  const marco = plano
    ? `rounded-lg px-1 py-0.5 text-xs ${abierto ? (claro ? "bg-slate-100" : "bg-white/[0.08]") : claro ? "hover:bg-slate-100" : "hover:bg-white/[0.06]"}`
    : `rounded-xl px-3.5 py-2.5 text-sm ${
        claro
          ? `border bg-white text-slate-900 ${abierto ? "border-teal-500/60" : "border-slate-200 hover:border-slate-300"}`
          : `border bg-[#2a3448] text-white ${abierto ? "border-teal-400/60" : "border-white/10 hover:border-white/20"}`
      }`;
  return (
    <button
      ref={anclaRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-haspopup="dialog"
      aria-expanded={abierto}
      className={`flex items-center gap-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        plano ? "" : "w-full justify-between gap-3"
      } ${marco} ${className ?? ""}`}
    >
      <span className="truncate">{texto}</span>
      {IconoCalendario}
    </button>
  );
}

/** Selector de MES. El valor va y viene como "AAAA-MM", igual que el input nativo. */
export function SelectorMes({
  value,
  onChange,
  claro = false,
  min,
  max,
  disabled,
  className,
  nota,
  titulo,
  plano,
}: {
  value: string;
  onChange: (valor: string) => void;
  claro?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  nota?: string;
  titulo?: string;
  plano?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const anioDelValor = Number.parseInt(value.slice(0, 4), 10);
  const [anioVista, setAnioVista] = useState(
    Number.isFinite(anioDelValor) ? anioDelValor : new Date().getFullYear(),
  );

  const cerrar = useCallback(() => setAbierto(false), []);

  useEffect(() => {
    if (!abierto) return;
    const anio = Number.parseInt(value.slice(0, 4), 10);
    if (Number.isFinite(anio)) setAnioVista(anio);
  }, [abierto, value]);

  const hoy = new Date();
  const mesDeHoy = `${hoy.getFullYear()}-${dosDigitos(hoy.getMonth() + 1)}`;
  const fueraDeRango = (periodo: string) =>
    (!!min && periodo < min) || (!!max && periodo > max);

  return (
    <>
      <Disparador
        anclaRef={anclaRef}
        texto={etiquetaDeMes(value)}
        abierto={abierto}
        onClick={() => setAbierto((v) => !v)}
        claro={claro}
        disabled={disabled}
        className={className}
        titulo={titulo}
        plano={plano}
      />
      {abierto ? (
        <Capa ancla={anclaRef} cerrar={cerrar} claro={claro} ancho={280}>
          <div className="flex items-center justify-between px-1 pb-2.5">
            <Flecha hacia="izquierda" claro={claro} onClick={() => setAnioVista((a) => a - 1)} />
            <span className={`text-[13.5px] font-semibold ${claro ? "text-slate-900" : "text-white"}`}>
              {anioVista}
            </span>
            <Flecha hacia="derecha" claro={claro} onClick={() => setAnioVista((a) => a + 1)} />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MESES_CORTOS.map((etiqueta, indice) => {
              const periodo = `${anioVista}-${dosDigitos(indice + 1)}`;
              const elegido = periodo === value;
              const esHoy = periodo === mesDeHoy;
              const apagado = fueraDeRango(periodo);
              return (
                <button
                  key={etiqueta}
                  type="button"
                  disabled={apagado}
                  onClick={() => {
                    onChange(periodo);
                    setAbierto(false);
                  }}
                  className={`rounded-[11px] py-2.5 text-[12.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${
                    elegido
                      ? "bg-teal-400 font-bold text-[#06201d] shadow-[0_4px_12px_-4px_rgba(45,212,191,0.6)]"
                      : claro
                        ? "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        : "bg-white/[0.035] text-slate-300 hover:bg-white/[0.09] hover:text-white"
                  } ${esHoy && !elegido ? "ring-1 ring-inset ring-teal-300/45" : ""}`}
                >
                  {etiqueta}
                </button>
              );
            })}
          </div>
          <Pie
            claro={claro}
            accion="Este mes"
            nota={nota}
            onAccion={() => {
              if (fueraDeRango(mesDeHoy)) return;
              onChange(mesDeHoy);
              setAbierto(false);
            }}
          />
        </Capa>
      ) : null}
    </>
  );
}

/** Selector de FECHA. El valor va y viene como "AAAA-MM-DD". */
export function SelectorFecha({
  value,
  onChange,
  claro = false,
  min,
  max,
  disabled,
  className,
  nota,
  titulo,
  plano,
}: {
  value: string;
  onChange: (valor: string) => void;
  claro?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  nota?: string;
  titulo?: string;
  plano?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const hoy = new Date();
  const anioValor = Number.parseInt(value.slice(0, 4), 10);
  const mesValor = Number.parseInt(value.slice(5, 7), 10);
  const [vista, setVista] = useState({
    anio: Number.isFinite(anioValor) ? anioValor : hoy.getFullYear(),
    mes: Number.isFinite(mesValor) ? mesValor - 1 : hoy.getMonth(),
  });

  const cerrar = useCallback(() => setAbierto(false), []);

  useEffect(() => {
    if (!abierto) return;
    const anio = Number.parseInt(value.slice(0, 4), 10);
    const mes = Number.parseInt(value.slice(5, 7), 10);
    if (Number.isFinite(anio) && Number.isFinite(mes)) setVista({ anio, mes: mes - 1 });
  }, [abierto, value]);

  const fechaDeHoy = `${hoy.getFullYear()}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(hoy.getDate())}`;
  const fueraDeRango = (fecha: string) => (!!min && fecha < min) || (!!max && fecha > max);

  // Celdas del mes: se arranca en el lunes de la semana del día 1 y se dibujan
  // seis semanas completas, para que el panel no cambie de alto al navegar.
  const primero = new Date(vista.anio, vista.mes, 1);
  const desplazamiento = (primero.getDay() + 6) % 7;
  const celdas = Array.from({ length: 42 }, (_, i) => {
    const dia = new Date(vista.anio, vista.mes, 1 - desplazamiento + i);
    return dia;
  });

  const mover = (paso: number) => {
    setVista((v) => {
      const d = new Date(v.anio, v.mes + paso, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });
  };

  return (
    <>
      <Disparador
        anclaRef={anclaRef}
        texto={etiquetaDeFecha(value)}
        abierto={abierto}
        onClick={() => setAbierto((v) => !v)}
        claro={claro}
        disabled={disabled}
        className={className}
        titulo={titulo}
        plano={plano}
      />
      {abierto ? (
        <Capa ancla={anclaRef} cerrar={cerrar} claro={claro} ancho={300}>
          <div className="flex items-center justify-between px-1 pb-2.5">
            <Flecha hacia="izquierda" claro={claro} onClick={() => mover(-1)} />
            <span className={`text-[13.5px] font-semibold ${claro ? "text-slate-900" : "text-white"}`}>
              {MESES_LARGOS[vista.mes]} {vista.anio}
            </span>
            <Flecha hacia="derecha" claro={claro} onClick={() => mover(1)} />
          </div>
          <div className="grid grid-cols-7 gap-0.5 pb-1.5">
            {DIAS_SEMANA.map((dia, i) => (
              <span
                key={`${dia}-${i}`}
                className={`text-center text-[9.5px] font-bold uppercase tracking-[0.1em] ${
                  claro ? "text-slate-400" : "text-slate-500"
                }`}
              >
                {dia}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {celdas.map((dia) => {
              const iso = `${dia.getFullYear()}-${dosDigitos(dia.getMonth() + 1)}-${dosDigitos(dia.getDate())}`;
              const deOtroMes = dia.getMonth() !== vista.mes;
              const finDeSemana = dia.getDay() === 0 || dia.getDay() === 6;
              const elegido = iso === value;
              const esHoy = iso === fechaDeHoy;
              const apagado = fueraDeRango(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={apagado}
                  onClick={() => {
                    onChange(iso);
                    setAbierto(false);
                  }}
                  className={`aspect-square rounded-[10px] text-[12.5px] transition disabled:cursor-not-allowed disabled:opacity-20 ${
                    elegido
                      ? "bg-teal-400 font-bold text-[#06201d] shadow-[0_4px_12px_-4px_rgba(45,212,191,0.6)]"
                      : claro
                        ? `hover:bg-slate-100 ${finDeSemana ? "text-slate-300" : "text-slate-700"}`
                        : `hover:bg-white/[0.08] ${finDeSemana ? "text-slate-500" : "text-slate-200"}`
                  } ${deOtroMes ? "opacity-25" : ""} ${
                    esHoy && !elegido ? "font-semibold ring-1 ring-inset ring-teal-300/50" : ""
                  }`}
                >
                  {dia.getDate()}
                </button>
              );
            })}
          </div>
          <Pie
            claro={claro}
            accion="Hoy"
            nota={nota}
            onAccion={() => {
              if (fueraDeRango(fechaDeHoy)) return;
              onChange(fechaDeHoy);
              setAbierto(false);
            }}
          />
        </Capa>
      ) : null}
    </>
  );
}
