/**
 * PIEZAS BASICAS DE LA INTERFAZ
 *
 * Lo minimo que se repite en todas las pantallas y que debe verse siempre igual:
 *
 *  - Aviso: el recuadro sutil de una linea. Ocupa solo lo que mide su texto y
 *    marca el tono con un punto de color, en vez de pintar una franja a lo ancho.
 *  - SeccionUm y las clases UM_*: la paleta contenida del modulo de Usuarios, con
 *    un solo acento encendido y el resto en grises.
 *  - Las clases BTN_*: un unico estilo para TODOS los botones de Guardar y tonos
 *    apagados, distintos por accion, para lo demas. Es lo que evita el arcoiris.
 */
import type { ReactNode } from "react";


/**
 * AVISO SUTIL: un solo estilo para los avisos dentro de las pantallas. Ocupa
 * solo lo que mide su texto (no toda la fila), fondo neutro y un punto de color
 * que indica el tono. Reemplaza las franjas verdes/ambar a lo ancho.
 */
export function Aviso({
  tono = "info",
  claro = false,
  className = "",
  children,
}: {
  tono?: "info" | "ok" | "alerta" | "error";
  claro?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const punto =
    tono === "ok" ? "bg-emerald-400" : tono === "alerta" ? "bg-amber-400" : tono === "error" ? "bg-rose-400" : "bg-sky-400";
  return (
    <div
      className={`flex w-fit max-w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] leading-4 ${
        claro ? "border-slate-200 bg-slate-50 text-slate-600" : "border-white/[0.07] bg-white/[0.03] text-slate-300"
      } ${className}`}
    >
      <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${punto}`} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// MODULO DE USUARIOS: paleta contenida. Un solo acento (verde azulado de la
// marca) para lo que esta encendido; todo lo demas en grises.
export const UM_ON = "bg-teal-400/[0.12] text-teal-50 ring-1 ring-inset ring-teal-300/30";
export const UM_OFF = "bg-white/[0.04] text-slate-400 ring-1 ring-inset ring-white/[0.06] hover:bg-white/[0.08] hover:text-slate-200";
export const UM_GRUPO = "border-white/10 bg-white/[0.04] text-slate-300";
export const UM_SECUNDARIO =
  "rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white";

/** Titulo de seccion del modulo de usuarios: etiqueta sobria + linea. */
export function SeccionUm({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <div className="mt-6 flex items-baseline gap-3 border-b border-white/[0.07] pb-1.5">
      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{titulo}</p>
      {detalle ? <p className="truncate text-[11px] text-slate-500">{detalle}</p> : null}
    </div>
  );
}

// BOTONES: un solo estilo para TODOS los "Guardar" (sobrio, color de marca) y
// tonos apagados, distintos por accion, para el resto. Evita el arcoiris.
export const BTN_GUARDAR =
  "bg-[#1f6f68] text-white font-semibold shadow-md shadow-black/20 ring-1 ring-inset ring-white/10 hover:bg-[#25807a] disabled:hover:bg-[#1f6f68]";
export const BTN_EXCEL = "border border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-100 hover:bg-emerald-400/[0.15]";
export const BTN_PDF = "border border-sky-300/25 bg-sky-300/[0.08] text-sky-100 hover:bg-sky-300/[0.15]";
export const BTN_DESBLOQUEAR = "border border-indigo-300/25 bg-indigo-300/[0.08] text-indigo-100 hover:bg-indigo-300/[0.15]";
export const BTN_BLOQUEAR = "border border-amber-300/25 bg-amber-300/[0.08] text-amber-100 hover:bg-amber-300/[0.15]";
