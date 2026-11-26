"use client";

/**
 * ACOMODAR LA FIRMA Y SELLO: un trozo del final del memo (despedida, sello y
 * línea de firma) dibujado a escala en milímetros. El sello se arrastra con el
 * mouse (o el dedo) y se gira con la manija redonda o con la barra. Lo que se
 * acomoda aquí es lo que sale en el PDF, el Word y lo que recibe el otro lado.
 */

import { useRef } from "react";
import {
  SELLO_AJUSTE_INICIAL,
  medidaSello,
  normalizarAjuste,
  type MemoPersona,
  type MemoSello,
  type MemoSelloAjuste,
} from "@/lib/memo-esdomed";

type Props = {
  sello: MemoSello;
  ajuste: MemoSelloAjuste;
  onChange: (a: MemoSelloAjuste) => void;
  despedida: string;
  firmante: MemoPersona | null;
  isLight: boolean;
  /** Abre la vista previa del memo completo para poner el sello donde se quiera. */
  onColocar?: () => void;
};

// Mismas medidas que el PDF (mm).
const ANCHO = 215.9 - 30 - 23.4;
const L = 4.87; // renglón Times 12

export function AjusteSello({
  sello,
  ajuste,
  onChange,
  despedida,
  firmante,
  isLight,
  onColocar,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const arrastre = useRef<{
    modo: "mover" | "girar";
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null>(null);
  const aj = normalizarAjuste(ajuste);
  const base = medidaSello(sello);
  const w = base.w * aj.escala;
  const h = base.h * aj.escala;

  // Lugar de siempre (igual que en el PDF): debajo de la despedida, centrado.
  const yDespedida = 8;
  const yTop = yDespedida + L + L * 0.6;
  const cx = ANCHO / 2 + aj.dx;
  const cy = yTop + h / 2 + aj.dy;
  const yLinea = yTop + h - L * 0.5;
  const alto = Math.max(yLinea + L * 3 + 6, yTop + h + 20);

  /** Punto del mouse en mm del dibujo. */
  const punto = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const empezar = (modo: "mover" | "girar", e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = punto(e);
    arrastre.current = { modo, x: p.x, y: p.y, dx: aj.dx, dy: aj.dy };
  };

  const mover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const p = punto(e);
    if (a.modo === "mover") {
      onChange(
        normalizarAjuste({
          ...aj,
          dx: a.dx + (p.x - a.x),
          dy: a.dy + (p.y - a.y),
        }),
      );
    } else {
      // La manija va arriba del sello: el ángulo se mide desde "las 12".
      let grados = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (grados > 180) grados -= 360;
      onChange(normalizarAjuste({ ...aj, rot: Math.round(grados) }));
    }
  };

  const soltar = () => {
    arrastre.current = null;
  };

  const rad = (aj.rot * Math.PI) / 180;
  const radioManija = h / 2 + 6;
  const hx = cx + Math.sin(rad) * radioManija;
  const hy = cy - Math.cos(rad) * radioManija;

  const sub = isLight ? "text-slate-500" : "text-slate-400";
  const btn = `rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
    isLight
      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
  }`;

  return (
    <div
      className={`rounded-2xl border p-3 ${isLight ? "border-slate-200 bg-slate-50/60" : "border-white/[0.07] bg-white/[0.02]"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Acomodar firma y sello</p>
          <p className={`text-[12px] ${sub}`}>
            {aj.pagina > 0
              ? `Está colocado a mano en la hoja ${aj.pagina}. Para moverlo, abra la vista previa.`
              : "Arrastre el sello con el mouse para moverlo. Para girarlo, arrastre el círculo de arriba o use la barra."}
          </p>
        </div>
        {onColocar ? (
          <button
            type="button"
            onClick={onColocar}
            className="rounded-xl bg-teal-600 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-500"
          >
            Colocar en la vista previa
          </button>
        ) : null}
      </div>
      {aj.pagina > 0 ? null : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${ANCHO} ${alto}`}
          className="mt-2 w-full touch-none select-none rounded-lg bg-white shadow-inner"
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
        >
          <text
            x={0}
            y={yDespedida}
            fontFamily="Times New Roman, serif"
            fontSize={4.2}
            fill="#111"
          >
            {despedida.trim() || "Atentamente."}
          </text>
          {firmante ? (
            <g
              fontFamily="Times New Roman, serif"
              fontSize={4.2}
              fill="#111"
              textAnchor="middle"
            >
              <line
                x1={ANCHO / 2 - 35}
                x2={ANCHO / 2 + 35}
                y1={yLinea}
                y2={yLinea}
                stroke="#111"
                strokeWidth={0.25}
              />
              <text x={ANCHO / 2} y={yLinea + L} fontWeight="bold">
                {firmante.nombre}
              </text>
              <text x={ANCHO / 2} y={yLinea + L * 2}>
                {firmante.cargo.split("\n")[0]}
              </text>
            </g>
          ) : null}
          <g transform={`rotate(${aj.rot} ${cx} ${cy})`}>
            <image
              href={sello.data}
              x={cx - w / 2}
              y={cy - h / 2}
              width={w}
              height={h}
              style={{ cursor: "move" }}
              onPointerDown={(e) => empezar("mover", e)}
            />
            <rect
              x={cx - w / 2}
              y={cy - h / 2}
              width={w}
              height={h}
              fill="none"
              stroke="#14b8a6"
              strokeWidth={0.3}
              strokeDasharray="1.5 1"
              pointerEvents="none"
            />
            <line
              x1={cx}
              x2={cx}
              y1={cy - h / 2}
              y2={cy - radioManija}
              stroke="#14b8a6"
              strokeWidth={0.3}
              pointerEvents="none"
            />
          </g>
          <circle
            cx={hx}
            cy={hy}
            r={2.4}
            fill="#14b8a6"
            stroke="#fff"
            strokeWidth={0.5}
            style={{ cursor: "grab" }}
            onPointerDown={(e) => empezar("girar", e)}
          >
            <title>Arrastre para girar</title>
          </circle>
        </svg>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-xs">
          <span className="w-12 shrink-0 font-semibold">Giro</span>
          <button
            type="button"
            className={btn}
            onClick={() =>
              onChange(normalizarAjuste({ ...aj, rot: aj.rot - 5 }))
            }
          >
            ⟲
          </button>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={aj.rot}
            onChange={(e) => onChange({ ...aj, rot: Number(e.target.value) })}
            className="w-full accent-teal-500"
          />
          <button
            type="button"
            className={btn}
            onClick={() =>
              onChange(normalizarAjuste({ ...aj, rot: aj.rot + 5 }))
            }
          >
            ⟳
          </button>
          <span className="w-10 text-right tabular-nums">{aj.rot}°</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-12 shrink-0 font-semibold">Tamaño</span>
          <input
            type="range"
            min={50}
            max={160}
            step={5}
            value={Math.round(aj.escala * 100)}
            onChange={(e) =>
              onChange({ ...aj, escala: Number(e.target.value) / 100 })
            }
            className="w-full accent-teal-500"
          />
          <span className="w-10 text-right tabular-nums">
            {Math.round(aj.escala * 100)}%
          </span>
        </label>
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className={btn}
          onClick={() => onChange({ ...SELLO_AJUSTE_INICIAL })}
        >
          Volver al lugar de siempre
        </button>
      </div>
    </div>
  );
}
