"use client";

/**
 * Campo «Nombre» de una persona del encabezado del memo con sugerencias: al
 * escribir aparecen nombre y cargo de quienes ya están en PULSO; al elegir uno
 * se llenan los dos campos. Se maneja con el mouse o con ↑ ↓ Enter y Esc.
 */

import { useId, useMemo, useState } from "react";
import type { MemoPersona } from "@/lib/memo-esdomed";
import { buscarPersonas } from "@/lib/directorio-memos";

type Props = {
  valor: string;
  lista: MemoPersona[];
  onNombre: (nombre: string) => void;
  onElegir: (p: MemoPersona) => void;
  className: string;
  isLight: boolean;
  placeholder?: string;
};

export function PersonaAutocompletar({ valor, lista, onNombre, onElegir, className, isLight, placeholder }: Props) {
  const idLista = useId();
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const opciones = useMemo(() => buscarPersonas(lista, valor), [lista, valor]);
  const mostrar = abierto && opciones.length > 0;

  const elegir = (p: MemoPersona) => {
    onElegir(p);
    setAbierto(false);
  };

  return (
    <div className="relative">
      <input
        className={className}
        value={valor}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={idLista}
        aria-autocomplete="list"
        onChange={(e) => {
          onNombre(e.target.value);
          setAbierto(true);
          setMarcado(0);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={(e) => {
          if (!mostrar) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setMarcado((m) => (m + 1) % opciones.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setMarcado((m) => (m - 1 + opciones.length) % opciones.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            elegir(opciones[Math.min(marcado, opciones.length - 1)]);
          } else if (e.key === "Escape") {
            setAbierto(false);
          }
        }}
      />
      {mostrar ? (
        <ul
          id={idLista}
          role="listbox"
          className={`absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border p-1 shadow-xl ${
            isLight ? "border-slate-200 bg-white" : "border-white/10 bg-[#1b2740]"
          }`}
        >
          {opciones.map((p, i) => (
            <li key={`${p.nombre}-${i}`} role="option" aria-selected={i === marcado}>
              <button
                type="button"
                // mousedown (no click): elige antes de que el campo pierda el foco.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(p);
                }}
                onMouseEnter={() => setMarcado(i)}
                className={`block w-full rounded-lg px-3 py-1.5 text-left ${
                  i === marcado ? (isLight ? "bg-teal-50" : "bg-teal-400/10") : ""
                }`}
              >
                <span className={`block text-sm font-medium ${isLight ? "text-slate-900" : "text-slate-100"}`}>{p.nombre}</span>
                {p.cargo ? (
                  <span className={`block truncate text-[11.5px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                    {p.cargo.split("\n")[0]}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
