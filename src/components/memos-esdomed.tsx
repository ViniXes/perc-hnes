"use client";

/**
 * MENÚ "ESDOMED" (solo administradores): memorándums del servicio.
 *
 * Lista de memos guardados por año y número correlativo, editor con los campos
 * del formato oficial (No., bloques PARA / CC.: / DE / A TRAVÉS DE…, ASUNTO, FECHA, cuerpo, despedida,
 * firma y copias) y descargas en PDF y Word con el membrete de la plantilla.
 * Los memos viven en Firestore `esdomedMemos/<año>__<número>`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firestore";
import {
  MEMO_COLECCION,
  MEMO_ETIQUETA_OPCIONES,
  memoEtiqueta,
  buildMemoPdfConMembrete,
  downloadMemoDocx,
  downloadMemoPdf,
  memoCodigo,
  memoDocId,
  memoFechaTexto,
  memoNuevo,
  normalizarMemo,
  type MemoEsdomed,
  type MemoBloque,
  type MemoPersona,
} from "@/lib/memo-esdomed";
import { BTN_GUARDAR } from "@/components/ui-basicos";

type MemoGuardado = MemoEsdomed & { id: string; actualizado: string; actualizadoPor: string };

type Props = {
  isLight: boolean;
  /** Correo o usuario de quien guarda (queda en el memo). */
  usuario: string;
};

function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function fechaDe(valor: unknown): string {
  const v = valor as { toDate?: () => Date } | null;
  if (v && typeof v.toDate === "function") {
    return v.toDate().toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" });
  }
  return "";
}

export function MemosEsdomed({ isLight, usuario }: Props) {
  const [memos, setMemos] = useState<MemoGuardado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  // Memo abierto en el editor; `idOriginal` es null si todavía no se ha guardado.
  const [memo, setMemo] = useState<MemoEsdomed | null>(null);
  const [idOriginal, setIdOriginal] = useState<string | null>(null);
  const [guardadoJson, setGuardadoJson] = useState("");
  const [ocupado, setOcupado] = useState<"" | "guardar" | "pdf" | "word" | "vista" | "borrar">("");
  const [vistaUrl, setVistaUrl] = useState<string | null>(null);
  const cuerpoRef = useRef<HTMLTextAreaElement | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const snap = await getDocs(collection(db, MEMO_COLECCION));
      const lista = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          ...normalizarMemo(data),
          id: d.id,
          actualizado: fechaDe(data.updatedAt) || fechaDe(data.createdAt),
          actualizadoPor: String(data.updatedBy ?? data.createdBy ?? ""),
        };
      });
      lista.sort((a, b) => b.year - a.year || b.numero - a.numero);
      setMemos(lista);
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permite leer los memos. Falta publicar las reglas de «esdomedMemos»."
          : "No se pudieron cargar los memos. Revisá la conexión e intentá de nuevo.",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  // Carga inicial de la lista al entrar al menú.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  useEffect(() => {
    return () => {
      if (vistaUrl) URL.revokeObjectURL(vistaUrl);
    };
  }, [vistaUrl]);

  const anios = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear(), ...memos.map((m) => m.year)]);
    return Array.from(set).sort((a, b) => b - a);
  }, [memos]);

  const siguienteNumero = useCallback(
    (year: number) => memos.filter((m) => m.year === year).reduce((max, m) => Math.max(max, m.numero), 0) + 1,
    [memos],
  );

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return memos.filter(
      (m) =>
        m.year === anio &&
        (!q ||
          normalizar(`${memoCodigo(m.year, m.numero)} ${m.asunto} ${m.bloques.flatMap((b) => b.personas.map((p) => p.nombre)).join(" ")}`).includes(q)),
    );
  }, [memos, anio, busqueda]);

  const cambiosSinGuardar = memo !== null && JSON.stringify(memo) !== guardadoJson;

  const confirmarDescartar = () =>
    !cambiosSinGuardar || window.confirm("Hay cambios sin guardar en el memo abierto. ¿Descartarlos?");

  const abrirNuevo = () => {
    if (!confirmarDescartar()) return;
    const year = new Date().getFullYear();
    const nuevo = memoNuevo(year, siguienteNumero(year), hoyIso());
    setMemo(nuevo);
    setIdOriginal(null);
    setGuardadoJson("");
    setAviso("");
    setError("");
  };

  const abrir = (m: MemoGuardado) => {
    if (!confirmarDescartar()) return;
    const limpio = normalizarMemo(m as unknown as Record<string, unknown>);
    setMemo(limpio);
    setIdOriginal(m.id);
    setGuardadoJson(JSON.stringify(limpio));
    setAviso("");
    setError("");
  };

  const cerrar = () => {
    if (!confirmarDescartar()) return;
    setMemo(null);
    setIdOriginal(null);
    setGuardadoJson("");
  };

  const editar = (cambios: Partial<MemoEsdomed>) => setMemo((m) => (m ? { ...m, ...cambios } : m));

  const editarBloques = (cambiar: (bloques: MemoBloque[]) => MemoBloque[]) =>
    setMemo((m) => (m ? { ...m, bloques: cambiar(m.bloques) } : m));

  const editarBloque = (b: number, cambios: Partial<MemoBloque>) =>
    editarBloques((lista) => lista.map((x, j) => (j === b ? { ...x, ...cambios } : x)));

  const editarPersona = (b: number, i: number, cambios: Partial<MemoPersona>) =>
    editarBloques((lista) =>
      lista.map((x, j) =>
        j === b ? { ...x, personas: x.personas.map((p, k) => (k === i ? { ...p, ...cambios } : p)) } : x,
      ),
    );

  /** Sube (-1) o baja (+1) un bloque en el encabezado. */
  const moverBloque = (b: number, paso: -1 | 1) =>
    editarBloques((lista) => {
      const destino = b + paso;
      if (destino < 0 || destino >= lista.length) return lista;
      const copia = [...lista];
      [copia[b], copia[destino]] = [copia[destino], copia[b]];
      return copia;
    });

  const validar = (m: MemoEsdomed): string => {
    if (!Number.isInteger(m.numero) || m.numero < 1) return "El número del memo debe ser un entero mayor que 0.";
    if (!Number.isInteger(m.year) || m.year < 2000 || m.year > 2100) return "El año del memo no es válido.";
    if (!m.bloques.some((b) => b.personas.some((p) => p.nombre.trim()))) return "Falta el destinatario (PARA).";
    if (m.bloques.some((b) => !b.etiqueta.trim() && b.personas.some((p) => p.nombre.trim() || p.cargo.trim()))) {
      return "Hay un bloque del encabezado sin título (PARA, CC.:, DE…).";
    }
    if (!m.asunto.trim()) return "Falta el ASUNTO.";
    return "";
  };

  const guardar = async () => {
    if (!memo) return;
    const problema = validar(memo);
    if (problema) {
      setError(problema);
      return;
    }
    setOcupado("guardar");
    setError("");
    setAviso("");
    try {
      const id = memoDocId(memo.year, memo.numero);
      const ref = doc(db, MEMO_COLECCION, id);
      const datos = { ...memo, updatedAt: serverTimestamp(), updatedBy: usuario };
      if (id === idOriginal) {
        await setDoc(ref, datos, { merge: true });
      } else {
        // Número nuevo (memo nuevo o se le cambió el número): no pisar otro memo.
        const existe = await getDoc(ref);
        if (existe.exists()) {
          setError(`Ya existe el memo No. ${memoCodigo(memo.year, memo.numero)}. Usá otro número.`);
          return;
        }
        await setDoc(ref, { ...datos, createdAt: serverTimestamp(), createdBy: usuario });
        if (idOriginal) await deleteDoc(doc(db, MEMO_COLECCION, idOriginal));
      }
      setIdOriginal(id);
      setGuardadoJson(JSON.stringify(memo));
      setAnio(memo.year);
      setAviso(`Memo No. ${memoCodigo(memo.year, memo.numero)} guardado.`);
      void cargar();
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permitió guardar. Falta publicar las reglas de «esdomedMemos»."
          : "No se pudo guardar el memo. Revisá la conexión e intentá de nuevo.",
      );
    } finally {
      setOcupado("");
    }
  };

  const borrar = async () => {
    if (!memo || !idOriginal) return;
    if (!window.confirm(`¿Eliminar el memo No. ${memoCodigo(memo.year, memo.numero)}? No se puede deshacer.`)) return;
    setOcupado("borrar");
    try {
      await deleteDoc(doc(db, MEMO_COLECCION, idOriginal));
      setMemo(null);
      setIdOriginal(null);
      setGuardadoJson("");
      setAviso("Memo eliminado.");
      void cargar();
    } catch {
      setError("No se pudo eliminar el memo.");
    } finally {
      setOcupado("");
    }
  };

  const exportar = async (tipo: "pdf" | "word" | "vista") => {
    if (!memo) return;
    setOcupado(tipo);
    setError("");
    try {
      if (tipo === "pdf") await downloadMemoPdf(memo);
      else if (tipo === "word") await downloadMemoDocx(memo);
      else {
        const blob = await buildMemoPdfConMembrete(memo);
        setVistaUrl(URL.createObjectURL(blob));
      }
    } catch {
      setError("No se pudo generar el documento. Intentá de nuevo.");
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
  const etiqueta = `mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] ${sub}`;
  const btnSec = `rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
    isLight
      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
  }`;
  const btnMini = `rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
    isLight ? "text-slate-500 hover:bg-slate-100 hover:text-rose-600" : "text-slate-400 hover:bg-white/[0.06] hover:text-rose-300"
  }`;

  const chip = (activo: boolean) =>
    `rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
      activo
        ? isLight
          ? "bg-teal-600 text-white"
          : "bg-teal-400/20 text-teal-100 ring-1 ring-inset ring-teal-300/40"
        : isLight
          ? "border border-slate-200 text-slate-600 hover:bg-slate-100"
          : "border border-white/10 text-slate-300 hover:bg-white/[0.06]"
    }`;
  const btnLink = `text-[11px] font-semibold hover:underline ${isLight ? "text-teal-700" : "text-teal-300"}`;

  /** Un bloque del encabezado: título (rápido o libre) y sus personas. */
  const editorBloque = (bloque: MemoBloque, b: number, total: number) => (
    <div
      key={b}
      className={`rounded-2xl border p-3 ${isLight ? "border-slate-200 bg-slate-50/60" : "border-white/[0.07] bg-white/[0.02]"}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          className={`${input} w-40 font-bold uppercase`}
          value={bloque.etiqueta}
          placeholder="Título"
          aria-label="Título del bloque"
          onChange={(e) => editarBloque(b, { etiqueta: e.target.value })}
        />
        {MEMO_ETIQUETA_OPCIONES.map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => editarBloque(b, { etiqueta: op })}
            className={chip(memoEtiqueta(bloque.etiqueta) === op)}
          >
            {op}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className={btnMini} title="Subir" disabled={b === 0} onClick={() => moverBloque(b, -1)}>
            ↑
          </button>
          <button
            type="button"
            className={btnMini}
            title="Bajar"
            disabled={b === total - 1}
            onClick={() => moverBloque(b, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className={btnMini}
            title="Quitar este bloque"
            onClick={() => editarBloques((lista) => lista.filter((_, j) => j !== b))}
          >
            Quitar bloque
          </button>
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {bloque.personas.map((p, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input
              className={input}
              value={p.nombre}
              placeholder="Nombre (p. ej. Dra. …)"
              onChange={(e) => editarPersona(b, i, { nombre: e.target.value })}
            />
            <input
              className={input}
              value={p.cargo}
              placeholder="Cargo (sale en negrita)"
              onChange={(e) => editarPersona(b, i, { cargo: e.target.value })}
            />
            <button
              type="button"
              className={btnMini}
              title="Quitar persona"
              onClick={() => editarBloque(b, { personas: bloque.personas.filter((_, k) => k !== i) })}
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          className={btnLink}
          onClick={() => editarBloque(b, { personas: [...bloque.personas, { nombre: "", cargo: "" }] })}
        >
          + Agregar persona a {memoEtiqueta(bloque.etiqueta) || "este bloque"}
        </button>
      </div>
    </div>
  );

  // Alto del cuerpo según el texto, para escribir memos largos con comodidad.
  useEffect(() => {
    const el = cuerpoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(320, el.scrollHeight + 4)}px`;
  }, [memo?.cuerpo]);

  return (
    <section id="panel-esdomed" className={`rounded-[24px] p-5 ${tarjeta}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${sub}`}>ESDOMED</p>
          <h2 className={`mt-1 text-xl font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>Memorándums</h2>
          <p className={`mt-1 max-w-2xl text-sm ${isLight ? "text-slate-600" : "text-slate-400"}`}>
            Memos con el membrete oficial, guardados por número correlativo. Se descargan en PDF o en Word
            (para firmar o seguir editando). Solo los administradores ven este menú.
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNuevo}
          className={`${BTN_GUARDAR} rounded-xl px-4 py-2 text-sm transition`}
        >
          + Nuevo memo
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
      ) : null}
      {aviso ? (
        <p className="mt-4 rounded-xl border border-teal-400/40 bg-teal-500/10 px-3 py-2 text-sm text-teal-600">{aviso}</p>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---- Lista ---- */}
        <div className={`rounded-2xl border p-3 ${isLight ? "border-slate-200 bg-slate-50/60" : "border-white/[0.07] bg-white/[0.02]"}`}>
          <div className="flex gap-2">
            <select
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className={`${input} w-24 shrink-0`}
              aria-label="Año"
            >
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar número o asunto…"
              className={input}
            />
          </div>
          <div className="mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
            {cargando ? <p className={`px-2 py-6 text-center text-sm ${sub}`}>Cargando…</p> : null}
            {!cargando && filtrados.length === 0 ? (
              <p className={`px-2 py-6 text-center text-sm ${sub}`}>
                {memos.some((m) => m.year === anio) ? "Nada coincide con la búsqueda." : `Sin memos guardados en ${anio}.`}
              </p>
            ) : null}
            {filtrados.map((m) => {
              const activo = m.id === idOriginal;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => abrir(m)}
                  className={`block w-full rounded-xl border px-3 py-2 text-left transition ${
                    activo
                      ? isLight
                        ? "border-teal-300 bg-teal-50"
                        : "border-teal-400/40 bg-teal-400/[0.08]"
                      : isLight
                        ? "border-transparent hover:border-slate-200 hover:bg-white"
                        : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold">No. {m.numero}</span>
                    <span className={`text-[11px] ${sub}`}>{memoFechaTexto(m.fecha)}</span>
                  </span>
                  <span className={`mt-0.5 block truncate text-[12.5px] ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                    {m.asunto || "(sin asunto)"}
                  </span>
                  <span className={`block truncate text-[11px] ${sub}`}>Para: {m.bloques[0]?.personas[0]?.nombre || "—"}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---- Editor ---- */}
        {memo ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {idOriginal ? "Editando" : "Nuevo"} · No. {memoCodigo(memo.year, memo.numero)}
                {cambiosSinGuardar ? <span className="ml-2 text-xs font-normal text-amber-500">sin guardar</span> : null}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void exportar("vista")} disabled={!!ocupado} className={btnSec}>
                  {ocupado === "vista" ? "Generando…" : "Vista previa"}
                </button>
                <button type="button" onClick={() => void exportar("pdf")} disabled={!!ocupado} className={btnSec}>
                  {ocupado === "pdf" ? "Generando…" : "Descargar PDF"}
                </button>
                <button type="button" onClick={() => void exportar("word")} disabled={!!ocupado} className={btnSec}>
                  {ocupado === "word" ? "Generando…" : "Descargar Word"}
                </button>
                <button
                  type="button"
                  onClick={() => void guardar()}
                  disabled={!!ocupado}
                  className={`${BTN_GUARDAR} rounded-xl px-4 py-2 text-sm transition disabled:opacity-50`}
                >
                  {ocupado === "guardar" ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[110px_110px_1fr_170px]">
              <label>
                <span className={etiqueta}>Año</span>
                <input
                  type="number"
                  className={input}
                  value={memo.year}
                  onChange={(e) => editar({ year: Number(e.target.value) })}
                />
              </label>
              <label>
                <span className={etiqueta}>Número</span>
                <input
                  type="number"
                  min={1}
                  className={input}
                  value={memo.numero}
                  onChange={(e) => editar({ numero: Number(e.target.value) })}
                />
              </label>
              <label>
                <span className={etiqueta}>Lugar</span>
                <input className={input} value={memo.lugar} onChange={(e) => editar({ lugar: e.target.value })} />
              </label>
              <label>
                <span className={etiqueta}>Fecha</span>
                <input
                  type="date"
                  className={input}
                  value={memo.fecha}
                  onChange={(e) => editar({ fecha: e.target.value })}
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className={etiqueta}>Encabezado (PARA, CC.:, DE, A TRAVÉS DE…)</span>
              {memo.bloques.map((bloque, b) => editorBloque(bloque, b, memo.bloques.length))}
              <button
                type="button"
                className={btnLink}
                onClick={() => editarBloques((lista) => [...lista, { etiqueta: "", personas: [{ nombre: "", cargo: "" }] }])}
              >
                + Agregar bloque
              </button>
              <p className={`text-[11px] ${sub}`}>
                Salen en este orden. Con ↑ ↓ se acomodan; un bloque sin personas no se imprime.
              </p>
            </div>

            <label className="block">
              <span className={etiqueta}>Asunto</span>
              <input
                className={input}
                value={memo.asunto}
                placeholder="Ej.: Entrega del Plan Anual Operativo (PAO)"
                onChange={(e) => editar({ asunto: e.target.value })}
              />
            </label>

            <label className="block">
              <span className={etiqueta}>Cuerpo del memo</span>
              <textarea
                ref={cuerpoRef}
                className={`${input} min-h-[320px] resize-y font-serif text-[15px] leading-relaxed`}
                value={memo.cuerpo}
                onChange={(e) => editar({ cuerpo: e.target.value })}
                spellCheck
              />
              <span className={`mt-1 block text-[11px] ${sub}`}>
                Cada Enter es un párrafo y un renglón vacío deja un espacio, igual que en Word. Un renglón que empieza
                con «- » sale como viñeta. Si el texto no cabe en una hoja, sigue solo en la siguiente con el mismo membrete.
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
              <label className="block">
                <span className={etiqueta}>Despedida</span>
                <input className={input} value={memo.despedida} onChange={(e) => editar({ despedida: e.target.value })} />
              </label>
              <label className="block">
                <span className={etiqueta}>Con copia (C.c.), una por renglón</span>
                <textarea
                  className={`${input} min-h-[42px] resize-y`}
                  rows={2}
                  value={memo.cc}
                  placeholder="Ej.: Archivo"
                  onChange={(e) => editar({ cc: e.target.value })}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={memo.firma} onChange={(e) => editar({ firma: e.target.checked })} />
              Agregar línea de firma con el nombre y cargo del bloque «DE:»
            </label>

            <div className="flex flex-wrap justify-between gap-2 border-t pt-4 border-slate-500/20">
              <button type="button" onClick={cerrar} className={btnSec}>
                Cerrar
              </button>
              {idOriginal ? (
                <button
                  type="button"
                  onClick={() => void borrar()}
                  disabled={!!ocupado}
                  className="rounded-xl border border-rose-400/40 px-3.5 py-2 text-sm font-semibold text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-50"
                >
                  {ocupado === "borrar" ? "Eliminando…" : "Eliminar memo"}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            className={`flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center ${
              isLight ? "border-slate-300 text-slate-500" : "border-white/15 text-slate-400"
            }`}
          >
            <p className="text-sm">Abrí un memo de la lista o creá uno nuevo.</p>
            <p className="mt-1 text-xs">
              El número se propone solo (el siguiente del año), pero se puede cambiar.
            </p>
          </div>
        )}
      </div>

      {vistaUrl ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={() => setVistaUrl(null)}>
          <div
            className={`flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl ${tarjeta}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <p className="text-sm font-semibold">Vista previa (PDF)</p>
              <button type="button" className={btnSec} onClick={() => setVistaUrl(null)}>
                Cerrar
              </button>
            </div>
            <iframe title="Vista previa del memo" src={vistaUrl} className="h-full w-full flex-1 bg-white" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
