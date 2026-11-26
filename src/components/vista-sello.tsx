"use client";

/**
 * VISTA PREVIA PARA COLOCAR EL SELLO: muestra el memo completo (todas sus hojas,
 * tal cual sale en el PDF) y encima la firma y sello, que se arrastra con el
 * mouse a cualquier lugar de cualquier hoja (p. ej. a la par del nombre de quien
 * firma, en el bloque DE:) y se gira con la manija. Al tocar «Listo» la posición
 * queda en el memo y se respeta en el PDF, el Word y lo que se envía.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SELLO_AJUSTE_INICIAL,
  buildMemoPdfConMembrete,
  medidaSello,
  normalizarAjuste,
  type MemoEsdomed,
  type MemoSello,
  type MemoSelloAjuste,
  type OpcionesPdfSello,
} from "@/lib/memo-esdomed";

const HOJA_W = 215.9;
const HOJA_H = 279.4;

type Props = {
  memo: MemoEsdomed;
  sello: MemoSello;
  isLight: boolean;
  onListo: (ajuste: MemoSelloAjuste) => void;
  onCerrar: () => void;
};

async function hojasComoImagen(pdfBlob: Blob): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await pdfBlob.arrayBuffer()) }).promise;
  const hojas: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1500 / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    hojas.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  void doc.destroy();
  return hojas;
}

export function VistaSello({ memo, sello, isLight, onListo, onCerrar }: Props) {
  const [hojas, setHojas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [aj, setAj] = useState<MemoSelloAjuste | null>(null);
  const hojaRefs = useRef<(HTMLDivElement | null)[]>([]);
  const arrastre = useRef<{ modo: "mover" | "girar"; ox: number; oy: number } | null>(null);

  // Arranque: dónde está hoy el sello (si estaba en "su lugar de siempre", se
  // calcula ahí) y las hojas del memo SIN el sello, para ponerlo encima.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        let inicial = normalizarAjuste(memo.selloAjuste);
        if (inicial.pagina === 0) {
          const op: OpcionesPdfSello = { dibujarSello: false };
          await buildMemoPdfConMembrete({ ...memo, sellado: true }, sello, op);
          if (op.posicion) inicial = { ...inicial, ...op.posicion, dx: 0, dy: 0 };
          else inicial = { ...inicial, pagina: 1, x: HOJA_W / 2, y: 120 };
        }
        const fondo = await buildMemoPdfConMembrete(
          { ...memo, sellado: true, selloAjuste: inicial },
          sello,
          { dibujarSello: false },
        );
        const imgs = await hojasComoImagen(fondo);
        if (!vivo) return;
        setAj(inicial);
        setHojas(imgs);
      } catch {
        if (vivo) setError("No se pudo armar la vista previa. Intente de nuevo.");
      }
    })();
    return () => {
      vivo = false;
    };
    // Solo al abrir: lo que se mueva después no vuelve a dibujar las hojas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = medidaSello(sello);
  const escala = aj?.escala ?? 1;
  const w = base.w * escala;
  const h = base.h * escala;

  /** Hoja y punto (mm) bajo el mouse; si está entre hojas, la más cercana. */
  const ubicar = useCallback((clientX: number, clientY: number) => {
    let mejor: { pagina: number; x: number; y: number; dist: number } | null = null;
    hojaRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dist = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
      const x = ((clientX - r.left) / r.width) * HOJA_W;
      const y = ((clientY - r.top) / r.height) * HOJA_H;
      if (!mejor || dist < mejor.dist) mejor = { pagina: i + 1, x, y, dist };
    });
    return mejor as { pagina: number; x: number; y: number; dist: number } | null;
  }, []);

  const empezar = (modo: "mover" | "girar", e: React.PointerEvent) => {
    if (!aj) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = ubicar(e.clientX, e.clientY);
    arrastre.current = { modo, ox: p ? p.x - aj.x : 0, oy: p ? p.y - aj.y : 0 };
  };

  const mover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a || !aj) return;
    const p = ubicar(e.clientX, e.clientY);
    if (!p) return;
    if (a.modo === "mover") {
      setAj(
        normalizarAjuste({
          ...aj,
          pagina: p.pagina,
          x: Math.min(HOJA_W, Math.max(0, p.x - a.ox)),
          y: Math.min(HOJA_H, Math.max(0, p.y - a.oy)),
        }),
      );
    } else if (p.pagina === aj.pagina) {
      let grados = (Math.atan2(p.y - aj.y, p.x - aj.x) * 180) / Math.PI + 90;
      if (grados > 180) grados -= 360;
      setAj({ ...aj, rot: Math.round(grados) });
    }
  };

  const soltar = () => {
    arrastre.current = null;
  };

  const tarjeta = isLight ? "bg-white text-slate-900" : "bg-[#202c41] text-slate-100";
  const btn = `rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
    isLight
      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
  }`;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-2 sm:p-3" onClick={onCerrar}>
      <div
        className={`flex h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl ${tarjeta}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-500/20 px-4 py-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Vista previa · colocar firma y sello</p>
            <p className="text-[12px] opacity-70">
              Arrastre el sello a donde lo quiera (p. ej. a la par de su nombre). El círculo verde lo gira.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => onListo({ ...SELLO_AJUSTE_INICIAL, rot: aj?.rot ?? 0, escala: aj?.escala ?? 1 })}
            >
              Lugar de siempre
            </button>
            <button type="button" className={btn} onClick={onCerrar}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={!aj}
              onClick={() => aj && onListo(aj)}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              Listo
            </button>
          </div>
        </div>

        {aj ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-slate-500/20 px-4 py-2 text-xs">
            <label className="flex items-center gap-2">
              <span className="font-semibold">Giro</span>
              <input
                type="range"
                min={-180}
                max={180}
                value={aj.rot}
                onChange={(e) => setAj({ ...aj, rot: Number(e.target.value) })}
                className="w-40 accent-teal-500"
              />
              <span className="w-10 tabular-nums">{aj.rot}°</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="font-semibold">Tamaño</span>
              <input
                type="range"
                min={50}
                max={160}
                step={5}
                value={Math.round(aj.escala * 100)}
                onChange={(e) => setAj({ ...aj, escala: Number(e.target.value) / 100 })}
                className="w-32 accent-teal-500"
              />
              <span className="w-10 tabular-nums">{Math.round(aj.escala * 100)}%</span>
            </label>
            <span className="opacity-70">Hoja {aj.pagina}</span>
          </div>
        ) : null}

        <div
          className="flex-1 overflow-y-auto bg-slate-500/20 p-3"
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
        >
          {error ? <p className="p-6 text-center text-sm text-rose-500">{error}</p> : null}
          {!error && hojas.length === 0 ? (
            <p className="p-6 text-center text-sm opacity-70">Armando la vista previa…</p>
          ) : null}
          <div className="mx-auto max-w-[760px] space-y-3">
            {hojas.map((src, i) => (
              <div
                key={i}
                ref={(el) => {
                  hojaRefs.current[i] = el;
                }}
                className="relative w-full select-none overflow-hidden bg-white shadow-lg"
                style={{ aspectRatio: `${HOJA_W} / ${HOJA_H}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Hoja ${i + 1}`} className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
                {aj && aj.pagina === i + 1 ? (
                  <div
                    className="absolute touch-none"
                    style={{
                      left: `${((aj.x - w / 2) / HOJA_W) * 100}%`,
                      top: `${((aj.y - h / 2) / HOJA_H) * 100}%`,
                      width: `${(w / HOJA_W) * 100}%`,
                      height: `${(h / HOJA_H) * 100}%`,
                      transform: `rotate(${aj.rot}deg)`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sello.data}
                      alt="Firma y sello"
                      draggable={false}
                      onPointerDown={(e) => empezar("mover", e)}
                      className="h-full w-full cursor-move outline-dashed outline-1 outline-teal-500"
                    />
                    <span className="pointer-events-none absolute left-1/2 top-[-18px] h-[18px] w-px -translate-x-1/2 bg-teal-500" />
                    <span
                      title="Arrastre para girar"
                      onPointerDown={(e) => empezar("girar", e)}
                      className="absolute left-1/2 top-[-30px] h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-white bg-teal-500 shadow"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
