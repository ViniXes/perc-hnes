"use client";

/**
 * BANDEJA DE MEMOS: los memos firmados y sellados que ESDOMED y la Jefatura de
 * Consulta Externa se envían dentro de PULSO. Recibidos (con los no leídos
 * resaltados) y Enviados (con la marca de si ya lo leyeron). Al abrir uno se ve
 * el PDF con membrete, firma y sello, y se puede descargar en PDF o Word.
 */

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import {
  MEMO_AREAS,
  buildMemoPdfConMembrete,
  downloadMemoDocx,
  downloadMemoPdf,
  memoFechaTexto,
  memoNumeroTexto,
  normalizarMemo,
  type MemoArea,
} from "@/lib/memo-esdomed";
import { MENSAJES_COLECCION, NOMBRE_BANDEJA, leerSello, type MemoInterno } from "@/lib/memos-internos";

type Props = {
  /** Bandeja de qué área (lo que le llega y lo que envió). */
  area: MemoArea;
  isLight: boolean;
  usuario: string;
};

function msDe(valor: unknown): number {
  const v = valor as { toMillis?: () => number } | null;
  return v && typeof v.toMillis === "function" ? v.toMillis() : 0;
}

function aMensaje(id: string, d: Record<string, unknown>): MemoInterno {
  const memo = normalizarMemo((d.memo ?? {}) as Record<string, unknown>);
  return {
    id,
    de: (d.de as MemoArea) || "esdomed",
    para: (d.para as MemoArea) || "esdomed",
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
  };
}

function cuando(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" });
}

export function BandejaMemos({ area, isLight, usuario }: Props) {
  const [recibidos, setRecibidos] = useState<MemoInterno[]>([]);
  const [enviados, setEnviados] = useState<MemoInterno[]>([]);
  const [pestana, setPestana] = useState<"recibidos" | "enviados">("recibidos");
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<MemoInterno | null>(null);
  const [vistaUrl, setVistaUrl] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"" | "vista" | "pdf" | "word">("");

  useEffect(() => {
    const avisar = (e: unknown) =>
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permite leer la bandeja. Falta publicar las reglas de «memosInternos»."
          : "No se pudo cargar la bandeja. Revise la conexión.",
      );
    const ordenar = (l: MemoInterno[]) => l.sort((a, b) => b.enviadoMs - a.enviadoMs);
    const offR = onSnapshot(
      query(collection(db, MENSAJES_COLECCION), where("para", "==", area)),
      (snap) => setRecibidos(ordenar(snap.docs.map((x) => aMensaje(x.id, x.data() as Record<string, unknown>)))),
      avisar,
    );
    const offE = onSnapshot(
      query(collection(db, MENSAJES_COLECCION), where("de", "==", area)),
      (snap) => setEnviados(ordenar(snap.docs.map((x) => aMensaje(x.id, x.data() as Record<string, unknown>)))),
      avisar,
    );
    return () => {
      offR();
      offE();
    };
  }, [area]);

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
    if (m.para === area && !m.leido) {
      await updateDoc(doc(db, MENSAJES_COLECCION, m.id), {
        leido: true,
        leidoAt: serverTimestamp(),
        leidoPor: usuario,
      }).catch(() => {});
    }
  };

  const cerrar = () => {
    setAbierto(null);
    setVistaUrl(null);
  };

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
  const nombreArea = (a: MemoArea) => NOMBRE_BANDEJA[a] || MEMO_AREAS[a]?.nombre || a;

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
        <button type="button" className={tab(pestana === "enviados")} onClick={() => setPestana("enviados")}>
          Enviados
        </button>
      </div>

      <div className="mt-3 space-y-1.5">
        {lista.length === 0 ? (
          <p className={`rounded-2xl border border-dashed px-3 py-8 text-center text-sm ${sub} ${isLight ? "border-slate-300" : "border-white/15"}`}>
            {pestana === "recibidos" ? "No ha recibido memos todavía." : "No ha enviado memos por PULSO todavía."}
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
                  : `Para: ${nombreArea(m.para)} · ${m.leido ? `Leído ${cuando(m.leidoMs)}` : "Sin leer"}`}
                {m.memo.fecha ? ` · Fecha del memo ${memoFechaTexto(m.memo.fecha)}` : ""}
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
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => void descargar("pdf")}>
                  {ocupado === "pdf" ? "Generando…" : "Descargar PDF"}
                </button>
                <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => void descargar("word")}>
                  {ocupado === "word" ? "Generando…" : "Descargar Word"}
                </button>
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
    </section>
  );
}
