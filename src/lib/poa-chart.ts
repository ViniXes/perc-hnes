// =============================================================================
// Gráfico de pastel 3D para la producción del POA.
// -----------------------------------------------------------------------------
// Con los datos que se digitan en cada bloque de producción (por sexo, por
// trimestre, etc.) se dibuja en un canvas un pastel 3D con su leyenda y se
// devuelve como PNG (dataURL). El mismo PNG se ve en el editor y va en el PDF y
// en el Word, así los tres se ven iguales.
//
// Colores: paleta categórica validada para daltonismo, en orden fijo (el 1.er
// dato siempre lleva el 1.er color). Máximo 8 porciones: si hay más, las
// menores se juntan en "Otros".
// =============================================================================
import type {
  PoaProduccionBloque,
  PoaProduccionDato,
} from "@/lib/poa-template";

const PALETA = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
];
const MAX_PORCIONES = 8;
const TEXTO = "#1f2937";
const TEXTO_SUAVE = "#52514e";
const FONT = "Arial, Helvetica, sans-serif";

/** Número de un valor digitado ("1,234" o "1234.5"); vacío o inválido = 0. */
function valorNum(v: string | undefined): number {
  const n = Number.parseFloat((v ?? "").replace(/[\s,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Datos útiles del bloque (con valor > 0), con "Otros" si pasan de 8. */
export function poaDatosGrafico(
  datos: PoaProduccionDato[] | undefined,
): { label: string; valor: number }[] {
  const limpios = (datos ?? [])
    .map((d, i) => ({
      label: d.label.trim() || `Dato ${i + 1}`,
      valor: valorNum(d.valor),
    }))
    .filter((d) => d.valor > 0);
  if (limpios.length <= MAX_PORCIONES) return limpios;
  const ordenados = [...limpios].sort((a, b) => b.valor - a.valor);
  const quedan = new Set(ordenados.slice(0, MAX_PORCIONES - 1));
  const otros = ordenados
    .slice(MAX_PORCIONES - 1)
    .reduce((acc, d) => acc + d.valor, 0);
  return [
    ...limpios.filter((d) => quedan.has(d)),
    { label: "Otros", valor: otros },
  ];
}

/** Aclara (amt > 0) u oscurece (amt < 0) un color hex. */
function shade(hex: string, amt: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (c: number) =>
    Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const cache = new Map<string, string>();

/**
 * Dibuja el pastel 3D y devuelve el PNG como dataURL, o null si no hay datos
 * (o si no hay canvas, por ejemplo en el servidor).
 */
export function poaGraficoPastel3D(
  titulo: string,
  datos: PoaProduccionDato[] | undefined,
): string | null {
  const porciones = poaDatosGrafico(datos);
  if (!porciones.length || typeof document === "undefined") return null;
  const key = JSON.stringify([titulo, porciones]);
  const enCache = cache.get(key);
  if (enCache) return enCache;

  const total = porciones.reduce((acc, d) => acc + d.valor, 0);
  const S = 2; // resolución doble para que se vea nítido impreso
  const W = 900;
  const legendRowH = 34;
  const H = Math.max(430, 120 + porciones.length * legendRowH + 60);
  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(S, S);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Título
  ctx.fillStyle = TEXTO;
  ctx.font = `bold 22px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(titulo, W / 2, 40);

  // Geometría del pastel
  const cx = 250;
  const rx = 190;
  const ry = rx * 0.55;
  const depth = 34;
  const cy = Math.max(70 + ry, (H - depth) / 2 + 20);
  const start = -Math.PI / 2;
  const angulos: { a0: number; a1: number; color: string }[] = [];
  let acc = start;
  porciones.forEach((d, i) => {
    const sweep = (d.valor / total) * Math.PI * 2;
    angulos.push({
      a0: acc,
      a1: acc + sweep,
      color: PALETA[i % PALETA.length],
    });
    acc += sweep;
  });

  // Sombra suave bajo el pastel
  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.10)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + depth + 10, rx * 1.02, ry * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const pt = (a: number, dy = 0) =>
    [cx + rx * Math.cos(a), cy + ry * Math.sin(a) + dy] as const;

  // Paredes laterales: solo la mitad del frente (ángulos entre 0 y π) es visible.
  const norm = (a: number) => {
    const t = a % (Math.PI * 2);
    return t < 0 ? t + Math.PI * 2 : t;
  };
  const tramosFrente: { a0: number; a1: number; color: string }[] = [];
  for (const s of angulos) {
    // Se recorre la porción en sus dos vueltas posibles y se recorta a [0, π].
    for (const off of [0, Math.PI * 2, -Math.PI * 2]) {
      const a0 = Math.max(s.a0 + off, 0);
      const a1 = Math.min(s.a1 + off, Math.PI);
      if (a1 > a0) tramosFrente.push({ a0, a1, color: s.color });
    }
  }
  for (const t of tramosFrente) {
    const grad = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    grad.addColorStop(0, shade(t.color, -0.42));
    grad.addColorStop(0.45, shade(t.color, -0.18));
    grad.addColorStop(1, shade(t.color, -0.45));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, t.a0, t.a1, false);
    const [x1, y1] = pt(t.a1, depth);
    ctx.lineTo(x1, y1);
    ctx.ellipse(cx, cy + depth, rx, ry, 0, t.a1, t.a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Bordes verticales donde una porción termina en el frente.
  for (const s of angulos) {
    const a = norm(s.a0);
    if (a > 0.001 && a < Math.PI - 0.001) {
      const [x, y] = pt(a);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + depth);
      ctx.stroke();
    }
  }

  // Cara superior con brillo.
  for (const s of angulos) {
    const grad = ctx.createRadialGradient(
      cx - rx * 0.35,
      cy - ry * 0.55,
      rx * 0.05,
      cx,
      cy,
      rx * 1.1,
    );
    grad.addColorStop(0, shade(s.color, 0.28));
    grad.addColorStop(0.6, s.color);
    grad.addColorStop(1, shade(s.color, -0.12));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, s.a0, s.a1, false);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Porcentaje sobre cada porción (si cabe).
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  porciones.forEach((d, i) => {
    const pct = (d.valor / total) * 100;
    if (pct < 5) return;
    const mid = (angulos[i].a0 + angulos[i].a1) / 2;
    const r = porciones.length === 1 ? 0 : 0.62;
    const x = cx + rx * r * Math.cos(mid);
    const y = cy + ry * r * Math.sin(mid);
    const txt = `${fmt(Math.round(pct * 10) / 10)}%`;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(15, 23, 42, 0.45)";
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(txt, x, y);
  });

  // Leyenda: color, nombre, valor y porcentaje (en tinta de texto, no en color).
  const lx = 500;
  let ly = Math.max(90, cy - (porciones.length * legendRowH) / 2 + 6);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  porciones.forEach((d, i) => {
    ctx.fillStyle = angulos[i].color;
    ctx.beginPath();
    ctx.roundRect(lx, ly - 8, 16, 16, 4);
    ctx.fill();
    ctx.fillStyle = TEXTO;
    ctx.font = `15px ${FONT}`;
    const nombre = d.label.length > 26 ? `${d.label.slice(0, 25)}…` : d.label;
    ctx.fillText(nombre, lx + 26, ly);
    ctx.textAlign = "right";
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText(fmt(d.valor), W - 110, ly);
    ctx.fillStyle = TEXTO_SUAVE;
    ctx.font = `14px ${FONT}`;
    ctx.fillText(
      `${fmt(Math.round((d.valor / total) * 1000) / 10)}%`,
      W - 30,
      ly,
    );
    ctx.textAlign = "left";
    ly += legendRowH;
  });
  // Total (no aplica cuando se comparan años: sumarlos no dice nada).
  const sonAnios = porciones.every((d) => /^(19|20)\d{2}$/.test(d.label));
  if (!sonAnios) {
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 14);
    ctx.lineTo(W - 30, ly - 14);
    ctx.stroke();
    ctx.fillStyle = TEXTO;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText("Total", lx + 26, ly + 4);
    ctx.textAlign = "right";
    ctx.fillText(fmt(total), W - 110, ly + 4);
  }

  const url = canvas.toDataURL("image/png");
  if (cache.size > 40) cache.clear();
  cache.set(key, url);
  return url;
}

// --- Datos tomados del texto -------------------------------------------------
// Si el bloque no tiene datos digitados, se arman con las cifras que ya están en
// su análisis:
//   - "11,510 ingresos ... 2,871 más que en 2025" -> 2026 contra 2025.
//   - Bloques de egresos (vivos / fallecidos): cada uno con el total de su texto,
//     así el pastel muestra la composición de los egresos.

/** Número escrito en el texto ("11,510", "8.639", "1231"). */
function numeroDe(txt: string): number {
  const limpio = txt.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number.parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

/** Primera cifra del texto que no sea un año ni un porcentaje. */
function totalDelTexto(text: string): number {
  const re = /\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const despues = text.slice(
      (m.index ?? 0) + raw.length,
      (m.index ?? 0) + raw.length + 3,
    );
    if (/^\s?%/.test(despues)) continue;
    if (/^(19|20)\d{2}$/.test(raw)) continue;
    const n = numeroDe(raw);
    if (n >= 10) return n;
  }
  return 0;
}

/** Nombre corto para la leyenda: "Egresos de Pacientes en Condición Vivo" -> "Condición vivo". */
function nombreCorto(title: string): string {
  const m = /condici[oó]n\s+(\w+)/i.exec(title);
  if (m) return `Condición ${m[1].toLowerCase()}`;
  return title.trim();
}

/**
 * Datos del gráfico de un bloque: los digitados, o si no hay, los que se leen
 * del texto. `desdeTexto` indica que salieron del análisis.
 */
export function poaDatosBloque(
  bloques: PoaProduccionBloque[],
  index: number,
  anio: number,
): { datos: PoaProduccionDato[]; desdeTexto: boolean } {
  const bloque = bloques[index];
  if (poaDatosGrafico(bloque.datos).length)
    return { datos: bloque.datos ?? [], desdeTexto: false };
  const text = bloque.text ?? "";
  const total = totalDelTexto(text);
  if (!total) return { datos: [], desdeTexto: false };

  // Comparación con el año anterior: "N más (o menos) que en 2025".
  const comp =
    /(\d{1,3}(?:[.,]\d{3})+|\d+)\s+(m[aá]s|menos)\s+que\s+en\s+((?:19|20)\d{2})/i.exec(
      text,
    );
  if (comp) {
    const diff = numeroDe(comp[1]);
    const previo = /men/i.test(comp[2]) ? total + diff : total - diff;
    if (previo > 0 && diff !== total) {
      return {
        datos: [
          { label: String(anio), valor: String(total) },
          { label: comp[3], valor: String(previo) },
        ],
        desdeTexto: true,
      };
    }
  }

  // Composición de los egresos (vivos y fallecidos).
  const esEgreso = (b: PoaProduccionBloque) => /egreso/i.test(b.title);
  if (esEgreso(bloque)) {
    const egresos = bloques
      .filter((b) => esEgreso(b) && !poaDatosGrafico(b.datos).length)
      .map((b) => ({
        label: nombreCorto(b.title),
        valor: String(totalDelTexto(b.text ?? "")),
      }))
      .filter((d) => Number(d.valor) > 0);
    if (egresos.length >= 2) return { datos: egresos, desdeTexto: true };
  }
  return { datos: [], desdeTexto: false };
}

/**
 * Imagen que lleva un bloque de producción: el gráfico con los datos digitados;
 * si no hay, el gráfico subido; si tampoco, el armado con las cifras del texto.
 */
export function poaImagenBloque(
  bloques: PoaProduccionBloque[],
  index: number,
  media: Record<string, string>,
  anio: number,
): string | undefined {
  const bloque = bloques[index];
  const titulo = `${bloque.title} ${anio}`;
  const digitado = poaGraficoPastel3D(titulo, bloque.datos);
  if (digitado) return digitado;
  const subido = bloque.imageKey ? media[bloque.imageKey] : undefined;
  if (subido) return subido;
  return (
    poaGraficoPastel3D(titulo, poaDatosBloque(bloques, index, anio).datos) ??
    undefined
  );
}
