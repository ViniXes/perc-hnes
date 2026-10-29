"use client";

/**
 * MEMORÁNDUMS > PLANIFICACIÓN · MIS DOCUMENTOS (solo administradores).
 *
 * Archivo de PDF de la Unidad de Planificación, separado por categoría
 * (Permisos personales, Permisos sin goce de sueldo, Misión oficial,
 * Incapacidad, Otros o una categoría nueva que se escriba).
 *
 * Sin Firebase Storage: igual que los comprobantes del POA, cada PDF se parte en
 * trozos base64 de 900 KB. En `planificacionDocumentos/<id>` queda la ficha
 * (tipo "meta") y en `planificacionDocumentos/<id>__<n>` cada trozo (tipo
 * "parte"). La lista solo trae las fichas; los trozos se leen al abrir un PDF.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firestore";
import {
  POA_COMPROBANTE_MAX_BYTES,
  poaArmarComprobante,
  poaNuevoComprobanteId,
  poaPrepararComprobante,
  poaTamanoLegible,
} from "@/lib/poa-comprobantes";
import { BTN_GUARDAR } from "@/components/ui-basicos";

const COLECCION = "planificacionDocumentos";

export const CATEGORIAS_BASE = [
  "Permisos personales",
  "Permisos sin goce de sueldo",
  "Misión oficial",
  "Incapacidad",
  "Otros",
];

type Ficha = {
  id: string;
  categoria: string;
  titulo: string;
  nombre: string;
  tamano: number;
  partes: number;
  /** Fecha del documento ("YYYY-MM-DD"), la que se elige al subirlo. */
  fecha: string;
  subido: string;
  por: string;
};

type Props = {
  isLight: boolean;
  usuario: string;
};

function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function fechaTexto(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha || "";
}

/** "permisos  personales" -> "Permisos personales" (o la categoría base que coincida). */
function limpiarCategoria(texto: string, existentes: string[]): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  const igual = existentes.find((c) => normalizar(c) === normalizar(limpio));
  return igual ?? limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

const parteId = (id: string, n: number) => `${id}__${n}`;

export function DocumentosPlanificacion({ isLight, usuario }: Props) {
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [filtro, setFiltro] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  // Formulario de carga.
  const [archivo, setArchivo] = useState<File | null>(null);
  const [categoria, setCategoria] = useState(CATEGORIAS_BASE[0]);
  const [categoriaNueva, setCategoriaNueva] = useState("");
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(hoyIso());
  const inputArchivo = useRef<HTMLInputElement | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, COLECCION), where("tipo", "==", "meta")));
      const lista: Ficha[] = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        const creado = x.createdAt as { toDate?: () => Date } | undefined;
        return {
          id: d.id,
          categoria: String(x.categoria ?? "Otros") || "Otros",
          titulo: String(x.titulo ?? ""),
          nombre: String(x.nombre ?? "documento.pdf"),
          tamano: Number(x.tamano) || 0,
          partes: Number(x.partes) || 0,
          fecha: String(x.fecha ?? ""),
          subido:
            creado && typeof creado.toDate === "function"
              ? creado.toDate().toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" })
              : "",
          por: String(x.createdBy ?? ""),
        };
      });
      lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.titulo.localeCompare(b.titulo));
      setFichas(lista);
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permite leer los documentos. Falta publicar las reglas de «planificacionDocumentos»."
          : "No se pudieron cargar los documentos. Revisá la conexión e intentá de nuevo.",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  // Carga inicial de la lista al entrar al submenú.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  /** Categorías base + las que ya se usaron (las nuevas quedan a mano para la próxima). */
  const categorias = useMemo(() => {
    const extra = fichas.map((f) => f.categoria).filter((c) => !CATEGORIAS_BASE.some((b) => normalizar(b) === normalizar(c)));
    const sinOtros = CATEGORIAS_BASE.filter((c) => c !== "Otros");
    return [...sinOtros, ...Array.from(new Set(extra)).sort((a, b) => a.localeCompare(b)), "Otros"];
  }, [fichas]);

  const grupos = useMemo(() => {
    const q = normalizar(busqueda);
    const visibles = fichas.filter(
      (f) =>
        (!filtro || f.categoria === filtro) &&
        (!q || normalizar(`${f.titulo} ${f.nombre} ${f.categoria} ${fechaTexto(f.fecha)}`).includes(q)),
    );
    return categorias
      .map((c) => ({ categoria: c, items: visibles.filter((f) => f.categoria === c) }))
      .filter((g) => g.items.length > 0);
  }, [fichas, categorias, filtro, busqueda]);

  const conteo = (c: string) => fichas.filter((f) => f.categoria === c).length;

  const subir = async () => {
    setError("");
    setAviso("");
    if (!archivo) {
      setError("Elegí el PDF que querés guardar.");
      return;
    }
    const esPdf = archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name);
    if (!esPdf) {
      setError("Solo se pueden guardar archivos PDF.");
      return;
    }
    if (archivo.size > POA_COMPROBANTE_MAX_BYTES) {
      setError(
        `El archivo pesa ${poaTamanoLegible(archivo.size)}. El máximo es ${poaTamanoLegible(POA_COMPROBANTE_MAX_BYTES)}.`,
      );
      return;
    }
    const cat = categoria === "__nueva__" ? limpiarCategoria(categoriaNueva, categorias) : categoria;
    if (!cat) {
      setError("Escribí el nombre de la categoría nueva.");
      return;
    }
    setOcupado("subir");
    try {
      const listo = await poaPrepararComprobante(archivo);
      const id = poaNuevoComprobanteId();
      for (let n = 0; n < listo.trozos.length; n += 1) {
        await setDoc(doc(db, COLECCION, parteId(id, n)), { tipo: "parte", archivo: id, parte: n, data: listo.trozos[n] });
      }
      // La ficha va al final: si la subida se corta, no queda un documento roto en la lista.
      await setDoc(doc(db, COLECCION, id), {
        tipo: "meta",
        categoria: cat,
        titulo: titulo.trim() || listo.nombre.replace(/\.pdf$/i, ""),
        nombre: listo.nombre,
        tamano: listo.tamano,
        partes: listo.trozos.length,
        fecha,
        createdAt: serverTimestamp(),
        createdBy: usuario,
      });
      setAviso(`Guardado en «${cat}».`);
      setArchivo(null);
      setTitulo("");
      setCategoriaNueva("");
      setCategoria(cat);
      if (inputArchivo.current) inputArchivo.current.value = "";
      void cargar();
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permitió guardar. Falta publicar las reglas de «planificacionDocumentos»."
          : "No se pudo guardar el PDF. Revisá la conexión e intentá de nuevo.",
      );
    } finally {
      setOcupado("");
    }
  };

  const leerPdf = async (f: Ficha): Promise<Blob> => {
    const snaps = await Promise.all(
      Array.from({ length: f.partes }, (_, n) => getDoc(doc(db, COLECCION, parteId(f.id, n)))),
    );
    const trozos = snaps.map((s) => (s.exists() ? String((s.data() as { data?: string }).data ?? "") : ""));
    if (trozos.some((t) => !t)) throw new Error("incompleto");
    return poaArmarComprobante(trozos, "application/pdf");
  };

  const ver = async (f: Ficha, descargar: boolean) => {
    // La pestaña se abre ya, antes de esperar a Firestore, para que el navegador no la bloquee.
    const tab = descargar ? null : window.open("", "_blank");
    setOcupado(f.id);
    setError("");
    try {
      const url = URL.createObjectURL(await leerPdf(f));
      if (tab) {
        tab.location.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = f.nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      setError("No se pudo abrir el PDF. Intentá de nuevo.");
    } finally {
      setOcupado("");
    }
  };

  const mover = async (f: Ficha, nueva: string) => {
    if (nueva === f.categoria) return;
    setOcupado(f.id);
    try {
      await updateDoc(doc(db, COLECCION, f.id), { categoria: nueva, updatedAt: serverTimestamp(), updatedBy: usuario });
      setFichas((lista) => lista.map((x) => (x.id === f.id ? { ...x, categoria: nueva } : x)));
      setAviso(`«${f.titulo}» pasó a «${nueva}».`);
    } catch {
      setError("No se pudo cambiar la categoría.");
    } finally {
      setOcupado("");
    }
  };

  const borrar = async (f: Ficha) => {
    if (!window.confirm(`¿Eliminar «${f.titulo}»? No se puede deshacer.`)) return;
    setOcupado(f.id);
    try {
      await deleteDoc(doc(db, COLECCION, f.id));
      await Promise.all(
        Array.from({ length: f.partes }, (_, n) => deleteDoc(doc(db, COLECCION, parteId(f.id, n))).catch(() => {})),
      );
      setFichas((lista) => lista.filter((x) => x.id !== f.id));
      setAviso("Documento eliminado.");
    } catch {
      setError("No se pudo eliminar el documento.");
    } finally {
      setOcupado("");
    }
  };

  // --- Estilos ---------------------------------------------------------------
  const tarjeta = isLight
    ? "border border-slate-200 bg-white text-slate-900"
    : "border border-white/10 bg-[#202c41] text-slate-100";
  const sub = isLight ? "text-slate-500" : "text-slate-400";
  const input = `w-full rounded-xl px-3 py-2 text-sm outline-none transition focus:border-teal-400/60 ${
    isLight
      ? "border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
      : "border border-white/[0.08] bg-white/[0.035] text-white placeholder:text-slate-500"
  }`;
  // Opciones del desplegable: en modo oscuro, letra blanca sobre el azul más claro
  // de las tarjetas (#22487f); sin esto heredan el blanco del sistema y no se leen.
  const desplegable = `${input} ${
    isLight ? "[&_option]:bg-white [&_option]:text-slate-900" : "[&_option]:bg-[#22487f] [&_option]:text-white"
  }`;
  const etiqueta = `mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] ${sub}`;
  const btnSec = `rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
    isLight
      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
  }`;
  const chip = (activo: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition ${
      activo
        ? isLight
          ? "bg-teal-600 text-white"
          : "bg-teal-400/20 text-teal-100 ring-1 ring-inset ring-teal-300/40"
        : isLight
          ? "border border-slate-200 text-slate-600 hover:bg-slate-100"
          : "border border-white/10 text-slate-300 hover:bg-white/[0.06]"
    }`;
  const caja = isLight ? "border-slate-200 bg-slate-50/60" : "border-white/[0.07] bg-white/[0.02]";

  return (
    <section id="panel-memos-planificacion-docs" className={`rounded-[24px] p-5 ${tarjeta}`}>
      <div>
        <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${sub}`}>Planificación</p>
        <h2 className={`mt-1 text-xl font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>Mis documentos</h2>
        <p className={`mt-1 max-w-2xl text-sm ${isLight ? "text-slate-600" : "text-slate-400"}`}>
          PDF de la Unidad de Planificación, separados por categoría. Máximo{" "}
          {poaTamanoLegible(POA_COMPROBANTE_MAX_BYTES)} por archivo.
        </p>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
      ) : null}
      {aviso ? (
        <p className="mt-4 rounded-xl border border-teal-400/40 bg-teal-500/10 px-3 py-2 text-sm text-teal-600">{aviso}</p>
      ) : null}

      {/* ---- Subir ---- */}
      <div className={`mt-5 rounded-2xl border p-4 ${caja}`}>
        <p className="text-sm font-semibold">Adjuntar PDF</p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_1fr_1.4fr_160px]">
          <label className="block">
            <span className={etiqueta}>Archivo PDF</span>
            <input
              ref={inputArchivo}
              type="file"
              accept="application/pdf,.pdf"
              className={`${input} file:mr-3 file:rounded-lg file:border-0 file:bg-teal-600 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white`}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setArchivo(f);
                if (f && !titulo.trim()) setTitulo(f.name.replace(/\.pdf$/i, ""));
              }}
            />
          </label>
          <label className="block">
            <span className={etiqueta}>Categoría</span>
            <select className={desplegable} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__nueva__">+ Nueva categoría…</option>
            </select>
            {categoria === "__nueva__" ? (
              <input
                className={`${input} mt-2`}
                value={categoriaNueva}
                placeholder="Ej.: Vacaciones"
                onChange={(e) => setCategoriaNueva(e.target.value)}
              />
            ) : null}
          </label>
          <label className="block">
            <span className={etiqueta}>Título (nombre de la persona o detalle)</span>
            <input
              className={input}
              value={titulo}
              placeholder="Ej.: Permiso de Juan Pérez, 3 de noviembre"
              onChange={(e) => setTitulo(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={etiqueta}>Fecha del documento</span>
            <input type="date" className={input} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void subir()}
            disabled={!!ocupado}
            className={`${BTN_GUARDAR} rounded-xl px-4 py-2 text-sm transition disabled:opacity-50`}
          >
            {ocupado === "subir" ? "Guardando…" : "Guardar PDF"}
          </button>
        </div>
      </div>

      {/* ---- Lista por categoría ---- */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className={chip(!filtro)} onClick={() => setFiltro("")}>
          Todas ({fichas.length})
        </button>
        {categorias
          .filter((c) => conteo(c) > 0)
          .map((c) => (
            <button key={c} type="button" className={chip(filtro === c)} onClick={() => setFiltro(c)}>
              {c} ({conteo(c)})
            </button>
          ))}
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar…"
          className={`${input} ml-auto w-full sm:w-56`}
        />
      </div>

      <div className="mt-4 space-y-4">
        {cargando ? <p className={`py-6 text-center text-sm ${sub}`}>Cargando…</p> : null}
        {!cargando && grupos.length === 0 ? (
          <p className={`py-6 text-center text-sm ${sub}`}>
            {fichas.length === 0 ? "Todavía no hay documentos guardados." : "Nada coincide con la búsqueda."}
          </p>
        ) : null}
        {grupos.map((g) => (
          <div key={g.categoria} className={`rounded-2xl border ${caja}`}>
            <p className="flex items-center justify-between border-b border-slate-500/15 px-4 py-2 text-sm font-bold">
              <span>{g.categoria}</span>
              <span className={`text-xs font-semibold ${sub}`}>{g.items.length}</span>
            </p>
            <div className="divide-y divide-slate-500/10">
              {g.items.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{f.titulo}</p>
                    <p className={`truncate text-[11px] ${sub}`}>
                      {fechaTexto(f.fecha)} · {f.nombre} · {poaTamanoLegible(f.tamano)}
                      {f.por ? ` · ${f.por}` : ""}
                    </p>
                  </div>
                  <select
                    aria-label="Cambiar categoría"
                    title="Cambiar categoría"
                    className={`${desplegable} w-auto py-1 text-xs`}
                    value={f.categoria}
                    disabled={!!ocupado}
                    onChange={(e) => void mover(f, e.target.value)}
                  >
                    {categorias.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => void ver(f, false)}>
                    {ocupado === f.id ? "…" : "Ver"}
                  </button>
                  <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => void ver(f, true)}>
                    Descargar
                  </button>
                  <button
                    type="button"
                    disabled={!!ocupado}
                    onClick={() => void borrar(f)}
                    className="rounded-lg border border-rose-400/40 px-2.5 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
