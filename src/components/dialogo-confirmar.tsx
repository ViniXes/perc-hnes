"use client";

/**
 * DIÁLOGO DE CONFIRMACIÓN con el diseño de PULSO, en lugar del confirm() del
 * navegador ("perc-hnes.vercel.app dice…"). Uso:
 *   const [preguntar, dialogo] = useConfirmar(isLight);
 *   if (!(await preguntar({ titulo, texto, boton: "Eliminar", tono: "peligro" }))) return;
 *   ...y en el JSX: {dialogo}
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type OpcionesConfirmar = {
  titulo: string;
  texto?: ReactNode;
  /** Texto del botón principal (por defecto «Aceptar»). */
  boton?: string;
  cancelar?: string;
  tono?: "peligro" | "aviso" | "normal";
};

type Pendiente = OpcionesConfirmar & { responder: (si: boolean) => void };

const ICONOS: Record<NonNullable<OpcionesConfirmar["tono"]>, ReactNode> = {
  peligro: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
    />
  ),
  aviso: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  normal: <path strokeLinecap="round" strokeLinejoin="round" d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />,
};

export function useConfirmar(isLight: boolean): [(o: OpcionesConfirmar) => Promise<boolean>, ReactNode] {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const botonRef = useRef<HTMLButtonElement | null>(null);
  const cancelarRef = useRef<HTMLButtonElement | null>(null);

  const preguntar = useCallback(
    (o: OpcionesConfirmar) =>
      new Promise<boolean>((resolve) => {
        setPendiente({ ...o, responder: resolve });
      }),
    [],
  );

  const responder = useCallback(
    (si: boolean) => {
      pendiente?.responder(si);
      setPendiente(null);
    },
    [pendiente],
  );

  useEffect(() => {
    if (!pendiente) return;
    // Para borrar, el foco queda en «Cancelar» (un Enter no elimina por error).
    (pendiente.tono === "peligro" ? cancelarRef : botonRef).current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") responder(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pendiente, responder]);

  const tono = pendiente?.tono ?? "normal";
  const color =
    tono === "peligro"
      ? { icono: "bg-rose-500/15 text-rose-500", boton: "bg-rose-600 hover:bg-rose-500" }
      : tono === "aviso"
        ? { icono: "bg-amber-500/15 text-amber-500", boton: "bg-amber-600 hover:bg-amber-500" }
        : { icono: "bg-teal-500/15 text-teal-500", boton: "bg-teal-600 hover:bg-teal-500" };

  const dialogo = pendiente ? (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={() => responder(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialogo-confirmar-titulo"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-[22px] p-6 shadow-2xl ${
          isLight ? "bg-white text-slate-900" : "border border-white/10 bg-[#1b2740] text-slate-100"
        }`}
      >
        <div className="flex items-start gap-4">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${color.icono}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
              {ICONOS[tono]}
            </svg>
          </span>
          <div className="min-w-0 pt-0.5">
            <h3 id="dialogo-confirmar-titulo" className="text-lg font-semibold leading-snug">
              {pendiente.titulo}
            </h3>
            {pendiente.texto ? (
              <div className={`mt-1.5 text-sm leading-6 ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                {pendiente.texto}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelarRef}
            type="button"
            onClick={() => responder(false)}
            className={`rounded-xl px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 text-sm font-semibold transition ${
              isLight
                ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
            }`}
          >
            {pendiente.cancelar ?? "Cancelar"}
          </button>
          <button
            ref={botonRef}
            type="button"
            onClick={() => responder(true)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-white/50 ${color.boton}`}
          >
            {pendiente.boton ?? "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [preguntar, dialogo];
}
