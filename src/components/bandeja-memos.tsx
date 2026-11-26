"use client";

/**
 * BANDEJA DE MEMOS: los memos firmados y sellados que ESDOMED y la Jefatura de
 * Consulta Externa se envían dentro de PULSO. Recibidos (con los no leídos
 * resaltados) y Enviados (con la marca de si ya lo leyeron). Al abrir uno se ve
 * el PDF con membrete, firma y sello, y se puede descargar en PDF o Word.
 */

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, type Query } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { useConfirmar } from "@/components/dialogo-confirmar";
import {
  MEMO_AREAS,
  buildMemoPdfConMembrete,
  downloadMemoDocx,
  downloadMemoPdf,
  memoDocId,
  memoFechaTexto,
  memoNumeroTexto,
  normalizarMemo,
  type MemoArea,
} from "@/lib/memo-esdomed";
import {
  MENSAJES_COLECCION,
  NOMBRE_BANDEJA,
  MESES_BANDEJA,
  leerSello,
  mesesRecientes,
  type BandejaId,
  type MemoInterno,
} from "@/lib/memos-internos";

type Props = {
  /** Bandeja de qué área (lo que le llega y lo que envió). "sis" solo recibe. */
  area: BandejaId;
  isLight: boolean;
  usuario: string;
  /** Nombre de quien confirma el recibido (lo ve quien envió). */
  nombreUsuario?: string;
  /** Modo verificación del admin: solo mirar (no marca leído ni confirma). */
  soloLectura?: boolean;
  /** Administradores de ESDOMED: pueden borrar un memo (p. ej. uno de prueba). */
  puedeEliminar?: boolean;
};

function msDe(valor: unknown): number {
  const v = valor as { toMillis?: () => number } | null;
  return v && typeof v.toMillis === "function" ? v.toMillis() : 0;
}

function aMensaje(id: string, d: Record<string, unknown>): MemoInterno {
  const memo = normalizarMemo((d.memo ?? {}) as Record<string, unknown>);
  return {
    id,
    de: (d.de as BandejaId) || "esdomed",
    para: (d.para as BandejaId) || "esdomed",
    memo,
    sello: leerSello(d.sello as Record<string, unknown> | null),
    codigo: String(d.codigo ?? ""),
    asunto: String(d.asunto ?? memo.asunto),
    enviadoPor: String(d.enviadoPor ?? ""),
    enviadoPorNombre: String(d.enviadoPorNombre ?? d.enviadoPor ?? ""),
    // Recién enviado, el servidor aún no puso la hora: se toma "ahora".
    enviadoMs: msDe(d.createdAt) || Date.now(),
    leido: d.leido === true,
    leidoMs: msDe(d.leidoAt),
    leidoPor: String(d.leidoPor ?? ""),
    recibido: d.recibido === true,
    recibidoMs: msDe(d.recibidoAt),
    recibidoPorNombre: String(d.recibidoPorNombre ?? d.recibidoPor ?? ""),
  };
}

/** Junta lo traído del historial con lo que llega en vivo (este manda). */
function unir(vivos: MemoInterno[], viejos: MemoInterno[]): MemoInterno[] {
  const m = new Map<string, MemoInterno>();
  for (const x of viejos) m.set(x.id, x);
  for (const x of vivos) m.set(x.id, x);
  return [...m.values()].sort((a, b) => b.enviadoMs - a.enviadoMs);
}

/** Fecha y hora en hora de El Salvador, p. ej. "26/11/2026, 3:05 p. m.". */
function cuando(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BandejaMemos({ area, isLight, usuario, nombreUsuario = "", soloLectura = false, puedeEliminar = false }: Props) {
  const [preguntar, dialogoConfirmar] = useConfirmar(isLight);
  const [pestana, setPestana] = useState<"recibidos" | "enviados">("recibidos");
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<MemoInterno | null>(null);
  const [vistaUrl, setVistaUrl] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"" | "vista" | "pdf" | "word">("");

  // Para no cargar todo el historial (cada memo trae su PDF y su sello), en vivo
  // solo llegan los últimos meses y lo pendiente (sin leer o sin acuse). El resto
  // se trae con «Ver anteriores». Solo consultas por igualdad: no piden índices.
  const [historial, setHistorial] = useState<"" | "cargando" | "listo">("");
  const [vivosR, setVivosR] = useState<MemoInterno[]>([]);
  const [vivosE, setVivosE] = useState<MemoInterno[]>([]);
  const [anterioresR, setAnterioresR] = useState<MemoInterno[]>([]);
  const [anterioresE, setAnterioresE] = useState<MemoInterno[]>([]);
  useEffect(() => {
    const avisar = (e: unknown) =>
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permite leer la bandeja. Falta publicar las reglas de «memosInternos»."
          : "No se pudo cargar la bandeja. Revise la conexión.",
      );
    const col = collection(db, MENSAJES_COLECCION);
    const meses = mesesRecientes();
    const escuchar = (campo: "para" | "de", setLista: (l: MemoInterno[]) => void) => {
      const consultas: Query[] = [
        ...meses.map((mes) => query(col, where(campo, "==", area), where("mes", "==", mes))),
        query(col, where(campo, "==", area), where("recibido", "==", false)),
        ...(campo === "para" ? [query(col, where(campo, "==", area), where("leido", "==", false))] : []),
      ];
      const partes = consultas.map(() => new Map<string, MemoInterno>());
      const juntar = () => {
        const todo = new Map<string, MemoInterno>();
        for (const p of partes) for (const [id, m] of p) todo.set(id, m);
        setLista([...todo.values()]);
      };
      const offs = consultas.map((q, i) =>
        onSnapshot(
          q,
          (snap) => {
            partes[i] = new Map(snap.docs.map((x) => [x.id, aMensaje(x.id, x.data() as Record<string, unknown>)]));
            juntar();
          },
          avisar,
        ),
      );
      return () => offs.forEach((off) => off());
    };
    const offR = escuchar("para", (l) => setVivosR(l));
    // La bandeja de la Dra. Gil solo recibe: no tiene enviados.
    const offE = area === "sis" ? () => {} : escuchar("de", (l) => setVivosE(l));
    return () => {
      offR();
      offE();
    };
  }, [area]);

  const recibidos = useMemo(() => unir(vivosR, anterioresR), [vivosR, anterioresR]);
  const enviados = useMemo(() => unir(vivosE, anterioresE), [vivosE, anterioresE]);

  const verAnteriores = async () => {
    setHistorial("cargando");
    try {
      const col = collection(db, MENSAJES_COLECCION);
      const leer = async (campo: "para" | "de") =>
        (await getDocs(query(col, where(campo, "==", area)))).docs.map((x) =>
          aMensaje(x.id, x.data() as Record<string, unknown>),
        );
      setAnterioresR(await leer("para"));
      if (area !== "sis") setAnterioresE(await leer("de"));
      setHistorial("listo");
    } catch {
      setHistorial("");
      setError("No se pudieron cargar los memos anteriores.");
    }
  };

  useEffect(() => {
    return () => {
      if (vistaUrl) URL.revokeObjectURL(vistaUrl);
    };
  }, [vistaUrl]);

  const sinLeer = useMemo(() => recibidos.filter((m) => !m.leido).length, [recibidos]);
  const lista = pestana === "recibidos" ? recibidos : enviados;

  const abrir = async (m: MemoInterno) => {
    setAbierto(m);
    setOcupado("vista");
    setError("");
    try {
      const blob = await buildMemoPdfConMembrete(m.memo, m.sello);
      setVistaUrl(URL.createObjectURL(blob));
    } catch {
      setError("No se pudo mostrar el memo. Intente de nuevo.");
    } finally {
      setOcupado("");
    }
    if (!soloLectura && m.para === area && !m.leido) {
      await updateDoc(doc(db, MENSAJES_COLECCION, m.id), {
        leido: true,
        leidoAt: serverTimestamp(),
        leidoPor: usuario,
      }).catch(() => {});
    }
  };

  /**
   * Borra el memo de TODAS las bandejas (una copia por destinatario) y, si existe,
   * el memo guardado del área que lo envió. Solo admins de ESDOMED.
   */
  const [eliminando, setEliminando] = useState(false);
  const eliminar = async (m: MemoInterno) => {
    if (!puedeEliminar || soloLectura) return;
    const ok = await preguntar({
      titulo: "¿Eliminar este memo?",
      texto: `Se borrará ${memoNumeroTexto(m.memo)} «${m.asunto || "sin asunto"}» de todas las bandejas, y también el memo guardado de ${nombreArea(m.de)}. No se puede deshacer.`,
      boton: "Sí, eliminar",
      tono: "peligro",
    });
    if (!ok) return;
    setEliminando(true);
    setError("");
    try {
      const col = collection(db, MENSAJES_COLECCION);
      const ids = new Set<string>([m.id]);
      if (m.codigo) {
        const snap = await getDocs(query(col, where("codigo", "==", m.codigo)));
        snap.docs.forEach((x) => {
          if ((x.data() as { de?: string }).de === m.de) ids.add(x.id);
        });
      }
      for (const id of ids) await deleteDoc(doc(db, MENSAJES_COLECCION, id));
      const areaMemo = m.memo.area;
      if (areaMemo && areaMemo === m.de && MEMO_AREAS[areaMemo as MemoArea]) {
        await deleteDoc(
          doc(db, MEMO_AREAS[areaMemo as MemoArea].coleccion, memoDocId(areaMemo as MemoArea, m.memo.year, m.memo.numero)),
        ).catch(() => {});
      }
      setAnterioresR((l) => l.filter((x) => !ids.has(x.id)));
      setAnterioresE((l) => l.filter((x) => !ids.has(x.id)));
      cerrar();
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permitió eliminar. Falta publicar las reglas nuevas de «memosInternos»."
          : "No se pudo eliminar el memo. Revise la conexión e intente de nuevo.",
      );
    } finally {
      setEliminando(false);
    }
  };

  const cerrar = () => {
    setAbierto(null);
    setVistaUrl(null);
  };

  /** Acuse de recibido: queda con la fecha y hora del servidor y no se puede deshacer. */
  const [confirmando, setConfirmando] = useState(false);
  const confirmarRecibido = async (m: MemoInterno) => {
    if (soloLectura || m.para !== area || m.recibido) return;
    setConfirmando(true);
    setError("");
    try {
      await updateDoc(doc(db, MENSAJES_COLECCION, m.id), {
        leido: true,
        recibido: true,
        recibidoAt: serverTimestamp(),
        recibidoPor: usuario,
        recibidoPorNombre: nombreUsuario || usuario,
      });
      setAbierto((a) => (a && a.id === m.id ? { ...a, recibido: true, recibidoMs: Date.now(), recibidoPorNombre: nombreUsuario || usuario } : a));
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permitió confirmar. Falta publicar las reglas nuevas de «memosInternos»."
          : "No se pudo confirmar el recibido. Revise la conexión e intente de nuevo.",
      );
    } finally {
      setConfirmando(false);
    }
  };
  // El memo abierto se mantiene al día con lo que llega de Firestore.
  const abiertoVivo = abierto ? [...recibidos, ...enviados].find((x) => x.id === abierto.id) ?? abierto : null;

  const descargar = async (tipo: "pdf" | "word") => {
    if (!abierto) return;
    setOcupado(tipo);
    try {
      if (tipo === "pdf") await downloadMemoPdf(abierto.memo, abierto.sello);
      else await downloadMemoDocx(abierto.memo, abierto.sello);
    } catch {
      setError("No se pudo generar el documento.");
    } finally {
      setOcupado("");
    }
  };

  const tarjeta = isLight
    ? "border border-slate-200 bg-white text-slate-900"
    : "border border-white/10 bg-[#202c41] text-slate-100";
  const sub = isLight ? "text-slate-500" : "text-slate-400";
  const btnSec = `rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
    isLight
      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
  }`;
  const tab = (activo: boolean) =>
    `rounded-xl px-3.5 py-1.5 text-sm font-semibold transition ${
      activo
        ? isLight
          ? "bg-teal-600 text-white"
          : "bg-teal-400/20 text-teal-100 ring-1 ring-inset ring-teal-300/40"
        : isLight
          ? "text-slate-600 hover:bg-slate-100"
          : "text-slate-300 hover:bg-white/[0.06]"
    }`;
  const nombreArea = (a: BandejaId) => NOMBRE_BANDEJA[a] || MEMO_AREAS[a as MemoArea]?.nombre || a;

  return (
    <section id="panel-memos-bandeja" className={`rounded-[24px] p-5 ${tarjeta}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${sub}`}>Memorándums</p>
      <h2 className={`mt-1 text-xl font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>
        Bandeja de memos · {nombreArea(area)}
      </h2>
      <p className={`mt-1 max-w-2xl text-sm ${isLight ? "text-slate-600" : "text-slate-400"}`}>
        Memos firmados y sellados enviados por PULSO. Al abrir uno recibido queda marcado como leído y quien lo
        envió lo ve.
      </p>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button type="button" className={tab(pestana === "recibidos")} onClick={() => setPestana("recibidos")}>
          Recibidos
          {sinLeer > 0 ? (
            <span className="ml-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{sinLeer}</span>
          ) : null}
        </button>
        {area !== "sis" ? (
          <button type="button" className={tab(pestana === "enviados")} onClick={() => setPestana("enviados")}>
            Enviados
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex justify-end">
        {historial === "listo" ? (
          <span className={`text-[11px] ${sub}`}>Mostrando también los meses anteriores</span>
        ) : (
          <button
            type="button"
            onClick={() => void verAnteriores()}
            disabled={historial === "cargando"}
            title={`Por rapidez se muestran los últimos ${MESES_BANDEJA} meses y todo lo pendiente`}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
              isLight ? "border-slate-300 text-slate-600 hover:bg-slate-100" : "border-white/10 text-slate-300 hover:bg-white/10"
            }`}
          >
            {historial === "cargando" ? "Cargando…" : "Ver anteriores"}
          </button>
        )}
      </div>

      <div className="mt-2 space-y-1.5">
        {lista.length === 0 ? (
          <p className={`rounded-2xl border border-dashed px-3 py-8 text-center text-sm ${sub} ${isLight ? "border-slate-300" : "border-white/15"}`}>
            {historial === "listo"
              ? pestana === "recibidos"
                ? "No ha recibido memos todavía."
                : "No ha enviado memos por PULSO todavía."
              : `Nada en los últimos ${MESES_BANDEJA} meses. Use «Ver anteriores» para buscar más atrás.`}
          </p>
        ) : null}
        {lista.map((m) => {
          const nuevo = pestana === "recibidos" && !m.leido;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => void abrir(m)}
              className={`block w-full rounded-xl border px-3 py-2.5 text-left transition ${
                nuevo
                  ? isLight
                    ? "border-teal-300 bg-teal-50 hover:bg-teal-100/60"
                    : "border-teal-400/40 bg-teal-400/[0.08] hover:bg-teal-400/[0.12]"
                  : isLight
                    ? "border-slate-200 hover:bg-slate-50"
                    : "border-white/[0.07] hover:bg-white/[0.04]"
              }`}
            >
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`text-sm ${nuevo ? "font-bold" : "font-semibold"}`}>
                  {nuevo ? <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-teal-500 align-middle" /> : null}
                  {memoNumeroTexto(m.memo)}
                </span>
                <span className={`text-[11px] ${sub}`}>{cuando(m.enviadoMs)}</span>
              </span>
              <span className={`mt-0.5 block truncate text-[13px] ${isLight ? "text-slate-700" : "text-slate-200"} ${nuevo ? "font-semibold" : ""}`}>
                {m.asunto || "(sin asunto)"}
              </span>
              <span className={`block truncate text-[11px] ${sub}`}>
                {pestana === "recibidos"
                  ? `De: ${nombreArea(m.de)}${m.enviadoPorNombre ? ` · ${m.enviadoPorNombre}` : ""}`
                  : `Para: ${nombreArea(m.para)}${m.recibido ? "" : ` · ${m.leido ? `Leído ${cuando(m.leidoMs)}` : "Sin leer"}`}`}
                {m.memo.fecha ? ` · Fecha del memo ${memoFechaTexto(m.memo.fecha)}` : ""}
              </span>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                  m.recibido
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-amber-500/15 text-amber-600"
                }`}
              >
                {m.recibido
                  ? `✓ Recibido ${cuando(m.recibidoMs)}${m.recibidoPorNombre ? ` · ${m.recibidoPorNombre}` : ""}`
                  : pestana === "recibidos"
                    ? "Falta confirmar el recibido"
                    : "Sin acuse de recibido"}
              </span>
            </button>
          );
        })}
      </div>

      {abierto ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={cerrar}>
          <div
            className={`flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl ${tarjeta}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <p className="min-w-0 truncate text-sm font-semibold">
                {memoNumeroTexto(abierto.memo)} · {abierto.asunto}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {abiertoVivo && abiertoVivo.para === area ? (
                  abiertoVivo.recibido ? (
                    <span className="rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-600">
                      ✓ Recibido {cuando(abiertoVivo.recibidoMs)}
                    </span>
                  ) : soloLectura ? (
                    <span className="rounded-xl bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-600">
                      Sin confirmar (solo lectura)
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={confirmando}
                      onClick={() => void confirmarRecibido(abiertoVivo)}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {confirmando ? "Confirmando…" : "Confirmar recibido"}
                    </button>
                  )
                ) : abiertoVivo ? (
                  <span
                    className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                      abiertoVivo.recibido ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
                    }`}
                  >
                    {abiertoVivo.recibido
                      ? `✓ Recibido ${cuando(abiertoVivo.recibidoMs)}${abiertoVivo.recibidoPorNombre ? ` · ${abiertoVivo.recibidoPorNombre}` : ""}`
                      : "Sin acuse de recibido"}
                  </span>
                ) : null}
                <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => void descargar("pdf")}>
                  {ocupado === "pdf" ? "Generando…" : "Descargar PDF"}
                </button>
                <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => void descargar("word")}>
                  {ocupado === "word" ? "Generando…" : "Descargar Word"}
                </button>
                {puedeEliminar && !soloLectura ? (
                  <button
                    type="button"
                    disabled={eliminando || !!ocupado}
                    onClick={() => void eliminar(abierto)}
                    className="rounded-xl bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {eliminando ? "Eliminando…" : "Eliminar"}
                  </button>
                ) : null}
                <button type="button" className={btnSec} onClick={cerrar}>
                  Cerrar
                </button>
              </div>
            </div>
            {vistaUrl ? (
              <iframe title="Memo recibido" src={vistaUrl} className="h-full w-full flex-1 bg-white" />
            ) : (
              <p className={`flex flex-1 items-center justify-center text-sm ${sub}`}>
                {ocupado === "vista" ? "Abriendo el memo…" : ""}
              </p>
            )}
          </div>
        </div>
      ) : null}
      {dialogoConfirmar}
    </section>
  );
}
