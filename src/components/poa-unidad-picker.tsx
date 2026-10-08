"use client";

/**
 * Selector de unidad del POA con buscador.
 *
 * Reemplaza al <select> nativo (50+ opciones en una lista larga, dificil de
 * recorrer). Se escribe parte del nombre y filtra al instante, sin importar
 * tildes ni mayusculas ("planif" encuentra "Unidad de Planificacion"). Las
 * unidades van agrupadas por Division. Teclado: flechas para moverse, Enter
 * para elegir, Esc para cerrar.
 *
 * Usa solo las variables del tema (--surface, --text, --accent...), asi que se
 * ve bien en modo claro y oscuro sin reglas aparte.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export type PoaUnidadOpcion = { id: string; name: string };
export type PoaUnidadGrupo = { id: string; titulo: string; unidades: PoaUnidadOpcion[] };

type Props = {
  value: string;
  onChange: (id: string) => void;
  grupos: PoaUnidadGrupo[];
  /** Texto del boton cuando no hay unidad elegida. */
  placeholder?: string;
  /** Agrega la opcion "— Sin elegir —" al inicio de la lista. */
  permitirVacio?: boolean;
  /** Ancho minimo del boton (px). */
  anchoMin?: number;
  ariaLabel?: string;
};

/** Minusculas y sin tildes, para buscar "planificacion" o "planificación" igual. */
function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function PoaUnidadPicker({
  value,
  onChange,
  grupos,
  placeholder = "Elegir unidad…",
  permitirVacio = false,
  anchoMin = 260,
  ariaLabel = "Unidad del POA",
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [activo, setActivo] = useState(0);
  const raizRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const seleccion = useMemo(() => {
    for (const g of grupos) {
      const u = g.unidades.find((x) => x.id === value);
      if (u) return { unidad: u, grupo: g };
    }
    return null;
  }, [grupos, value]);

  // Grupos filtrados por la busqueda (por nombre de la unidad o del grupo).
  const filtrados = useMemo(() => {
    const q = normalizar(consulta);
    if (!q) return grupos;
    return grupos
      .map((g) => {
        const grupoCoincide = normalizar(g.titulo).includes(q);
        return {
          ...g,
          unidades: grupoCoincide ? g.unidades : g.unidades.filter((u) => normalizar(u.name).includes(q)),
        };
      })
      .filter((g) => g.unidades.length > 0);
  }, [grupos, consulta]);

  // Lista plana (en el orden en que se ve) para moverse con el teclado.
  const plana = useMemo(() => {
    const ids: string[] = permitirVacio && !consulta.trim() ? [""] : [];
    for (const g of filtrados) for (const u of g.unidades) ids.push(u.id);
    return ids;
  }, [filtrados, permitirVacio, consulta]);

  // Al abrir: el resaltado arranca en la unidad elegida.
  useEffect(() => {
    if (!abierto) return;
    const i = plana.indexOf(value);
    setActivo(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Al escribir: el resaltado vuelve al primer resultado.
  useEffect(() => {
    setActivo(0);
  }, [consulta]);

  // Mantener visible el elemento resaltado.
  useEffect(() => {
    if (!abierto) return;
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-idx="${activo}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activo, abierto]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const alClic = (event: MouseEvent) => {
      if (raizRef.current && !raizRef.current.contains(event.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", alClic);
    return () => document.removeEventListener("mousedown", alClic);
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setConsulta("");
  }

  function elegir(id: string) {
    if (id !== value) onChange(id);
    cerrar();
  }

  function alTeclear(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActivo((i) => Math.min(i + 1, plana.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (plana[activo] !== undefined) elegir(plana[activo]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cerrar();
    }
  }

  let idx = permitirVacio && !consulta.trim() ? 1 : 0;

  return (
    <div ref={raizRef} className="relative" style={{ minWidth: anchoMin }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        className="flex w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs transition"
        style={{
          borderColor: abierto ? "var(--accent)" : "var(--border)",
          background: "var(--surface-3)",
          color: "var(--text)",
          boxShadow: abierto ? "0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent)" : undefined,
        }}
      >
        <span className="min-w-0 flex-1">
          {seleccion ? (
            <>
              <span className="block truncate font-semibold">{seleccion.unidad.name}</span>
              <span className="block truncate text-[10px]" style={{ color: "var(--text-faint)" }}>
                {seleccion.grupo.titulo}
              </span>
            </>
          ) : (
            <span className="block truncate font-semibold" style={{ color: "var(--text-faint)" }}>
              {placeholder}
            </span>
          )}
        </span>
        <svg
          aria-hidden
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}
          style={{ color: "var(--text-faint)" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {abierto ? (
        <div
          className="modal-pop-in absolute left-0 z-50 mt-1.5 w-[min(360px,90vw)] overflow-hidden rounded-2xl border"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            boxShadow: "0 24px 60px -20px rgba(2, 6, 23, 0.45)",
          }}
        >
          <div className="border-b p-2" style={{ borderColor: "var(--border)" }}>
            <div
              className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <svg
                aria-hidden
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "var(--text-faint)" }}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.2-3.2" />
              </svg>
              <input
                autoFocus
                value={consulta}
                onChange={(event) => setConsulta(event.target.value)}
                onKeyDown={alTeclear}
                placeholder="Buscar servicio o división…"
                aria-label="Buscar unidad"
                className="w-full !border-0 !bg-transparent text-sm !shadow-none outline-none"
                style={{ color: "var(--text)", outline: "none" }}
              />
              {consulta ? (
                <button
                  type="button"
                  onClick={() => setConsulta("")}
                  className="shrink-0 rounded-md px-1 text-xs"
                  style={{ color: "var(--text-faint)" }}
                  aria-label="Borrar búsqueda"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>

          <div ref={listaRef} role="listbox" className="max-h-[22rem] overflow-y-auto p-1.5">
            {permitirVacio && !consulta.trim() ? (
              <Opcion
                idx={0}
                activo={activo === 0}
                elegido={value === ""}
                texto="— Sin elegir —"
                tenue
                onHover={() => setActivo(0)}
                onElegir={() => elegir("")}
              />
            ) : null}

            {filtrados.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-faint)" }}>
                Ninguna unidad coincide con “{consulta}”.
              </p>
            ) : (
              filtrados.map((g) => (
                <div key={g.id} className="mb-1">
                  <p
                    className="sticky top-0 z-10 px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: "var(--text-faint)", background: "var(--surface)" }}
                  >
                    {g.titulo} <span className="font-semibold normal-case tracking-normal">· {g.unidades.length}</span>
                  </p>
                  {g.unidades.map((u) => {
                    const i = idx++;
                    return (
                      <Opcion
                        key={u.id}
                        idx={i}
                        activo={activo === i}
                        elegido={value === u.id}
                        texto={u.name}
                        resaltar={consulta}
                        onHover={() => setActivo(i)}
                        onElegir={() => elegir(u.id)}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <p
            className="border-t px-3 py-1.5 text-[10px]"
            style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
          >
            ↑ ↓ para moverse · Enter para elegir · Esc para cerrar
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Opcion({
  idx,
  activo,
  elegido,
  texto,
  tenue,
  resaltar,
  onHover,
  onElegir,
}: {
  idx: number;
  activo: boolean;
  elegido: boolean;
  texto: string;
  tenue?: boolean;
  resaltar?: string;
  onHover: () => void;
  onElegir: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={elegido}
      data-idx={idx}
      onMouseEnter={onHover}
      onClick={onElegir}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]"
      style={{
        background: activo ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
        color: tenue ? "var(--text-faint)" : "var(--text)",
        fontWeight: elegido ? 700 : 500,
      }}
    >
      <span className="min-w-0 flex-1 truncate">{resaltar ? <Resaltado texto={texto} q={resaltar} /> : texto}</span>
      {elegido ? (
        <svg
          aria-hidden
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          style={{ color: "var(--accent)" }}
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : null}
    </button>
  );
}

/** Marca en negrita la parte del nombre que coincide con la busqueda. */
function Resaltado({ texto, q }: { texto: string; q: string }) {
  const n = normalizar(q);
  if (!n) return <>{texto}</>;
  // normalizar() conserva la longitud de cada letra base, asi que los indices
  // del texto sin tildes sirven para cortar el original.
  const base = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const i = base.indexOf(n);
  if (i < 0 || base.length !== texto.length) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="rounded-[3px]" style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)", color: "inherit" }}>
        {texto.slice(i, i + n.length)}
      </mark>
      {texto.slice(i + n.length)}
    </>
  );
}
