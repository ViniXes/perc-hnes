// =============================================================================
// Exportación del PAO a PDF.
// -----------------------------------------------------------------------------
// Arma el documento completo con la estructura de los lineamientos PAO 2027 y el
// formato oficial del hospital:
//   Portada · Aprobaciones · Índice · I. Introducción · II. Descripción general ·
//   III. Diagnóstico situacional · IV. Valoración de riesgos ·
//   V. Programación de actividades de gestión · VI. Seguimiento.
// Desde la hoja de Aprobaciones, cada página lleva el membrete de identificación
// (ISO 37001) con el código, la versión y "Página X de Y".
//
// La matriz de riesgos y la programación van en hojas horizontales porque no
// caben en vertical. jsPDF y autotable se cargan solo al exportar.
// =============================================================================
import {
  normalizePoaDoc,
  poaEsDivision,
  poaCategoria,
  poaExposicion,
  poaPercent,
  poaSemaforo,
  POA_CATEGORIA_LABEL,
  type PoaDoc,
  type PoaFodaItem,
  type PoaSemaforo,
} from "@/lib/poa-template";
import type { PoaMedia } from "@/lib/poa-docx";

type RGB = [number, number, number];

const NAVY: RGB = [19, 32, 77];
const H1_COLOR: RGB = [31, 56, 100];
const H2_COLOR: RGB = [46, 84, 150];
const HEAD_FILL: RGB = [217, 226, 243];
const GROUP_FILL: RGB = [222, 234, 246];
const RISK_HEAD_FILL: RGB = [198, 224, 180];
const PREV_RISK_FILL: RGB = [204, 193, 218];
const GRID: RGB = [128, 128, 128];
const TEXT: RGB = [20, 20, 20];

const CATEGORIA_RGB: Record<string, RGB> = {
  bajo: [0, 176, 80],
  moderado: [255, 255, 0],
  alto: [192, 0, 0],
};
const SEMAFORO_RGB: Partial<Record<PoaSemaforo, RGB>> = {
  verde: [198, 239, 206],
  amarillo: [255, 235, 156],
  rojo: [255, 199, 206],
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const ROMANOS = ["I", "II", "III", "IV", "V", "VI"];

/** Las fuentes estándar del PDF solo llevan Latin-1: se cambian comillas y guiones tipográficos. */
function t(value: string | undefined | null): string {
  return (value ?? "")
    .normalize("NFC")
    .replace(/[\u201c\u201d\u201e\u00ab\u00bb]/g, '"')
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u25cf\u25aa]/g, "-")
    .replace(/[\u00a0\t]/g, " ")
    .replace(/\r/g, "")
    .replace(/[^\n -\u00ff]/g, "");
}

type LoadedImage = { data: string; w: number; h: number; format: "PNG" | "JPEG" };

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(blob);
  });
}

async function measure(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

async function fromDataUrl(dataUrl: string | undefined): Promise<LoadedImage | null> {
  if (!dataUrl || !/^data:image\/(png|jpe?g);base64,/i.test(dataUrl)) return null;
  const size = await measure(dataUrl);
  return { data: dataUrl, ...size, format: /^data:image\/png/i.test(dataUrl) ? "PNG" : "JPEG" };
}

async function fromUrl(url: string): Promise<LoadedImage | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    return await fromDataUrl(await blobToDataUrl(await res.blob()));
  } catch {
    return null;
  }
}

type Seg = { text: string; bold?: boolean };

export async function buildPoaPdf(input: PoaDoc, media: PoaMedia = {}): Promise<Blob> {
  const doc = normalizePoaDoc(input);
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const [minsalBlanco, hnesBlanco, hnes, foto] = await Promise.all([
    fromUrl("/poa/minsal-blanco.png"),
    fromUrl("/poa/hnes-blanco.png"),
    fromUrl("/poa/hnes.png"),
    fromUrl("/poa/hospital.jpg"),
  ]);

  const pdf = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait", compress: true });
  const ML = 20;
  const MR = 20;
  const TOP = 42;
  const BOTTOM = 18;
  const LH = 5;
  const FONT = "helvetica";
  const servicio = t(doc.serviceName);
  const anio = doc.year;
  const ahora = new Date();

  const pageW = () => pdf.internal.pageSize.getWidth();
  const pageH = () => pdf.internal.pageSize.getHeight();
  const usable = () => pageW() - ML - MR;

  let y = TOP;
  let landscape = false;
  const sectionPages: Record<string, number> = {};

  const setColor = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const newPage = (orientation: "portrait" | "landscape" = landscape ? "landscape" : "portrait") => {
    pdf.addPage("letter", orientation);
    landscape = orientation === "landscape";
    y = TOP;
  };
  const ensure = (h: number) => {
    if (y + h > pageH() - BOTTOM) newPage();
  };

  const h1 = (index: number, text: string) => {
    ensure(18);
    y += 2;
    pdf.setFont(FONT, "bold");
    pdf.setFontSize(13);
    setColor(H1_COLOR);
    pdf.text(`${ROMANOS[index]}. ${t(text)}`, ML, y);
    sectionPages[ROMANOS[index]] = pdf.getNumberOfPages();
    y += 8;
  };
  const h2 = (text: string) => {
    ensure(14);
    y += 1;
    pdf.setFont(FONT, "bold");
    pdf.setFontSize(11);
    setColor(H2_COLOR);
    const lines = pdf.splitTextToSize(t(text), usable()) as string[];
    for (const line of lines) {
      pdf.text(line, ML, y);
      y += LH + 0.5;
    }
    y += 1.5;
  };

  /** Párrafo justificado, partido entre páginas cuando hace falta. */
  const para = (text: string, opts: { bold?: boolean; size?: number; after?: number; indent?: number } = {}) => {
    const clean = t(text).trim();
    if (!clean) return;
    const size = opts.size ?? 10.5;
    const lh = size * 0.47;
    const x = ML + (opts.indent ?? 0);
    const width = usable() - (opts.indent ?? 0);
    pdf.setFont(FONT, opts.bold ? "bold" : "normal");
    pdf.setFontSize(size);
    setColor(TEXT);
    for (const block of clean.split("\n")) {
      const lines = pdf.splitTextToSize(block, width) as string[];
      let i = 0;
      while (i < lines.length) {
        ensure(lh);
        const room = Math.max(1, Math.floor((pageH() - BOTTOM - y) / lh));
        const chunk = lines.slice(i, i + room);
        chunk.forEach((line, k) => {
          const last = i + k === lines.length - 1;
          if (last) {
            pdf.text(line, x, y + k * lh);
          } else {
            pdf.text(line, x, y + k * lh, { align: "justify", maxWidth: width });
          }
        });
        y += chunk.length * lh;
        i += chunk.length;
      }
    }
    y += opts.after ?? 2.5;
  };

  /** Texto con partes en negrita en la misma línea (p. ej. "Título: texto"). */
  const layoutRich = (segs: Seg[], width: number, size: number) => {
    pdf.setFontSize(size);
    type Tok = { w: string; bold: boolean; width: number };
    const lines: Tok[][] = [[]];
    let lineW = 0;
    for (const seg of segs) {
      pdf.setFont(FONT, seg.bold ? "bold" : "normal");
      const words = t(seg.text).split(/\s+/).filter(Boolean);
      for (const word of words) {
        const ww = pdf.getTextWidth(word);
        const sp = pdf.getTextWidth(" ");
        const need = (lines[lines.length - 1].length ? sp : 0) + ww;
        if (lineW + need > width && lines[lines.length - 1].length) {
          lines.push([]);
          lineW = 0;
        }
        lines[lines.length - 1].push({ w: word, bold: !!seg.bold, width: ww });
        lineW += (lines[lines.length - 1].length > 1 ? sp : 0) + ww;
      }
    }
    return lines.filter((l) => l.length);
  };
  const drawRich = (lines: ReturnType<typeof layoutRich>, x: number, startY: number, size: number) => {
    pdf.setFontSize(size);
    setColor(TEXT);
    const lh = size * 0.47;
    lines.forEach((line, i) => {
      let cx = x;
      for (const tok of line) {
        pdf.setFont(FONT, tok.bold ? "bold" : "normal");
        pdf.text(tok.w, cx, startY + i * lh);
        cx += tok.width + pdf.getTextWidth(" ");
      }
    });
  };
  const bulletItem = (item: PoaFodaItem) => {
    const size = 10.5;
    const lh = size * 0.47;
    const lines = layoutRich(
      [{ text: `${item.title}:`, bold: true }, { text: item.text }],
      usable() - 6,
      size,
    );
    let i = 0;
    let first = true;
    while (i < lines.length) {
      ensure(lh);
      const room = Math.max(1, Math.floor((pageH() - BOTTOM - y) / lh));
      const chunk = lines.slice(i, i + room);
      if (first) {
        pdf.setFont(FONT, "bold");
        pdf.setFontSize(size);
        pdf.text("-", ML + 1, y);
        first = false;
      }
      drawRich(chunk, ML + 6, y, size);
      y += chunk.length * lh;
      i += chunk.length;
    }
    y += 2;
  };

  /** Tabla con el estilo del documento. */
  const tabla = (opts: Parameters<typeof autoTable>[1]) => {
    autoTable(pdf, {
      theme: "grid",
      startY: y,
      rowPageBreak: "avoid",
      margin: { top: TOP, left: ML, right: MR, bottom: BOTTOM },
      styles: {
        font: FONT,
        fontSize: 8.5,
        cellPadding: 1.6,
        lineColor: GRID,
        lineWidth: 0.2,
        textColor: TEXT,
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: { fillColor: HEAD_FILL, textColor: TEXT, fontStyle: "bold", halign: "center" },
      ...opts,
    });
    const last = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (last?.finalY ?? y) + 5;
  };

  // ===========================================================================
  // 1. Portada (fondo institucional azul, como el formato oficial)
  // ===========================================================================
  {
    const W = pageW();
    const H = pageH();
    pdf.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    pdf.rect(0, 0, W, H, "F");
    if (minsalBlanco) {
      const w = 52;
      pdf.addImage(minsalBlanco.data, minsalBlanco.format, 18, 16, w, (w * minsalBlanco.h) / minsalBlanco.w);
    }
    const boxW = 150;
    const boxX = (W - boxW) / 2;
    const boxY = 52;
    const boxH = 52;
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.4);
    pdf.rect(boxX, boxY, boxW, boxH);
    if (hnesBlanco) {
      const w = 118;
      const h = (w * hnesBlanco.h) / hnesBlanco.w;
      pdf.addImage(hnesBlanco.data, hnesBlanco.format, (W - w) / 2, boxY + (boxH - h) / 2, w, h);
    }
    pdf.setTextColor(255, 255, 255);
    pdf.setFont(FONT, "bold");
    pdf.setFontSize(20);
    pdf.text(`${t(doc.cover.title)} ${anio}`, W / 2, 126, { align: "center" });
    pdf.setFontSize(15);
    const servLines = pdf.splitTextToSize(t(doc.cover.service || doc.serviceName), 160) as string[];
    servLines.forEach((line, i) => pdf.text(line, W / 2, 137 + i * 7, { align: "center" }));
    if (foto) {
      const w = 150;
      const h = (w * foto.h) / foto.w;
      pdf.addImage(foto.data, foto.format, (W - w) / 2, 150 + (servLines.length - 1) * 7, w, h);
    }
    pdf.setFont(FONT, "normal");
    pdf.setFontSize(12);
    pdf.text(
      `${t(doc.cover.place)}, ${MESES[ahora.getMonth()]} de ${ahora.getFullYear()}.`,
      W / 2,
      H - 22,
      { align: "center" },
    );
  }

  // ===========================================================================
  // 2. Aprobaciones
  // ===========================================================================
  newPage("portrait");
  pdf.setFont(FONT, "bold");
  pdf.setFontSize(12);
  setColor(TEXT);
  tabla({
    head: [[{ content: "Aprobaciones", colSpan: 4, styles: { fontSize: 11 } }], ["Función", "Nombre", "Cargo", "Firma"]],
    body: (doc.aprobaciones ?? []).map((a) => [t(a.funcion), t(a.nombre), t(a.cargo), ""]),
    styles: { font: FONT, fontSize: 9, cellPadding: 2.5, lineColor: GRID, lineWidth: 0.2, textColor: TEXT, valign: "middle", minCellHeight: 22 },
    columnStyles: { 0: { cellWidth: 28, fontStyle: "bold" }, 1: { cellWidth: 50 }, 2: { cellWidth: 52 }, 3: { cellWidth: "auto" } },
  });

  // ===========================================================================
  // 3. Índice (se completa al final, cuando se conocen las páginas)
  // ===========================================================================
  newPage("portrait");
  const paginaIndice = pdf.getNumberOfPages();

  // ===========================================================================
  // I. Introducción
  // ===========================================================================
  newPage("portrait");
  h1(0, "Introducción");
  for (const p of doc.intro) para(p);

  // ===========================================================================
  // II. Descripción general
  // ===========================================================================
  h1(1, poaEsDivision(doc.serviceId) ? "Descripción general de la unidad" : "Descripción general del servicio");
  if (poaEsDivision(doc.serviceId)) {
    h2("Misión");
    para(doc.mision ?? "");
    h2("Visión");
    para(doc.vision ?? "");
  }
  h2("Dependencia jerárquica");
  para(doc.dependencia);
  h2("Objetivos");
  para("Objetivo general:", { bold: true, after: 1 });
  para(doc.objetivoGeneral);
  para("Objetivos específicos:", { bold: true, after: 1 });
  doc.objetivosEspecificos.forEach((o, i) => para(`${i + 1}. ${o}`, { indent: 2 }));
  h2(`Funciones del ${doc.serviceName}`);
  doc.funciones.forEach(bulletItem);

  // ===========================================================================
  // III. Diagnóstico situacional
  // ===========================================================================
  h1(2, "Diagnóstico situacional");
  h2(`a) Descripción de los recursos con que cuenta el ${doc.serviceName}`);
  tabla({
    head: [["Recurso humano", "Cantidad"]],
    body: doc.recursos.map((r) => [t(r.label), t(r.cantidad)]),
    columnStyles: { 1: { halign: "center", cellWidth: 35 } },
    styles: { font: FONT, fontSize: 9.5, cellPadding: 2, lineColor: GRID, lineWidth: 0.2, textColor: TEXT },
  });

  h2("b) Análisis FODA");
  {
    // FODA en 2 x 2 con los títulos en negrita (dibujado a mano).
    const colW = usable() / 2;
    const size = 9;
    const lh = size * 0.47;
    const pad = 2.5;
    const cuadro = (left: string, right: string, li: PoaFodaItem[], ri: PoaFodaItem[]) => {
      const lay = (items: PoaFodaItem[]) =>
        items.map((it) => layoutRich([{ text: `${it.title}:`, bold: true }, { text: it.text }], colW - pad * 2, size));
      const L = lay(li);
      const R = lay(ri);
      const alto = (blocks: ReturnType<typeof lay>) =>
        blocks.reduce((acc, b) => acc + b.length * lh + 2, 0) + pad * 2;
      const headH = 7;
      const bodyH = Math.max(alto(L), alto(R), 14);
      ensure(headH + bodyH);
      pdf.setDrawColor(GRID[0], GRID[1], GRID[2]);
      pdf.setLineWidth(0.2);
      pdf.setFillColor(HEAD_FILL[0], HEAD_FILL[1], HEAD_FILL[2]);
      pdf.rect(ML, y, colW, headH, "FD");
      pdf.rect(ML + colW, y, colW, headH, "FD");
      pdf.setFont(FONT, "bold");
      pdf.setFontSize(10);
      setColor(TEXT);
      pdf.text(left, ML + colW / 2, y + 4.8, { align: "center" });
      pdf.text(right, ML + colW * 1.5, y + 4.8, { align: "center" });
      y += headH;
      pdf.rect(ML, y, colW, bodyH);
      pdf.rect(ML + colW, y, colW, bodyH);
      const pinta = (blocks: ReturnType<typeof lay>, x: number) => {
        let cy = y + pad + 3;
        for (const b of blocks) {
          drawRich(b, x + pad, cy, size);
          cy += b.length * lh + 2;
        }
      };
      pinta(L, ML);
      pinta(R, ML + colW);
      y += bodyH;
    };
    cuadro("FORTALEZAS", "OPORTUNIDADES", doc.foda.fortalezas, doc.foda.oportunidades);
    cuadro("DEBILIDADES", "AMENAZAS", doc.foda.debilidades, doc.foda.amenazas);
    y += 5;
  }

  h2(`c) Producción general resumida del año ${anio - 1}`);
  para(doc.produccion.intro);
  for (let i = 0; i < doc.produccion.bloques.length; i += 1) {
    const bloque = doc.produccion.bloques[i];
    const img = await fromDataUrl(bloque.imageKey ? media[bloque.imageKey] : undefined);
    const imgW = Math.min(usable(), 160);
    const imgH = img ? (imgW * img.h) / img.w : 0;
    ensure(img ? imgH + 12 : 20);
    para(`${i + 1}. ${bloque.title} ${anio - 1}`, { bold: true, after: 1.5 });
    if (img) {
      const w = imgW;
      const h = imgH;
      ensure(h + 3);
      pdf.addImage(img.data, img.format, ML + (usable() - w) / 2, y, w, h);
      y += h + 4;
    }
    para(bloque.text);
  }
  para(doc.produccion.cierre);

  h2(`d) Cumplimiento de actividades del PAO ${anio - 1}`);
  tabla({
    head: [["No.", "ACTIVIDAD", "Prog.", "Realiz.", "%", "OBSERVACIONES"]],
    body: doc.cumplimiento.rows.map((r, i) => [
      String(i + 1),
      t(r.actividad),
      t(r.prog),
      t(r.realiz),
      poaPercent(r.prog, r.realiz),
      t(r.obs),
    ]),
    columnStyles: {
      0: { halign: "center", cellWidth: 11 },
      2: { halign: "center", cellWidth: 16 },
      3: { halign: "center", cellWidth: 16 },
      4: { halign: "center", cellWidth: 15 },
      5: { halign: "center", cellWidth: 36 },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 4) return;
      const r = doc.cumplimiento.rows[data.row.index];
      const fill = r ? SEMAFORO_RGB[poaSemaforo(r.prog, r.realiz)] : undefined;
      if (fill) data.cell.styles.fillColor = fill;
    },
  });
  if (doc.cumplimiento.analisis.trim()) para(`Análisis: ${doc.cumplimiento.analisis}`);

  // ===========================================================================
  // IV. Valoración de riesgos
  // ===========================================================================
  h1(3, "Valoración de riesgos");
  h2(`a) Cumplimiento de las actividades de control de la matriz de riesgos ${anio - 1}`);
  tabla({
    head: [["RIESGO INVOLUCRADO", "ACCIONES DE CONTROL", "EJECUCIÓN DE LAS ACCIONES DE CONTROL", "OBSERVACIONES"]],
    headStyles: { fillColor: PREV_RISK_FILL, textColor: TEXT, fontStyle: "bold", halign: "center" },
    body: doc.riesgosPrev.rows.map((r) => [t(r.riesgo), t(r.acciones), t(r.ejecucion), t(r.obs)]),
    columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 48 }, 2: { cellWidth: 48 }, 3: { halign: "center", cellWidth: "auto" } },
  });
  doc.riesgosPrev.analisis
    .filter((a) => a.trim())
    .forEach((a, i) => para(i === 0 ? `Análisis: ${a}` : a));

  // Matriz (horizontal)
  newPage("landscape");
  h2(`b) Matriz de valoración de riesgos ${anio}`);
  tabla({
    head: [[
      "1. Proceso / Procedimiento",
      "2. Riesgos",
      "3. Probabilidad (F)",
      "4. Magnitud / Impacto (I)",
      "5. Exposición al riesgo (F x I) Categoría",
      "6. Acciones para control de riesgos",
      "7. Responsables",
    ]],
    headStyles: { fillColor: RISK_HEAD_FILL, textColor: TEXT, fontStyle: "bold", halign: "center", fontSize: 8 },
    body: doc.matrizRiesgos.map((r) => {
      const exp = poaExposicion(r);
      return [
        t(r.proceso),
        t(r.riesgo),
        t(r.probabilidad),
        t(r.impacto),
        exp ? `${exp}\n${POA_CATEGORIA_LABEL[poaCategoria(exp)]}` : "",
        t(r.acciones),
        t(r.responsables),
      ];
    }),
    columnStyles: {
      0: { cellWidth: 32, fontSize: 7.5 },
      1: { cellWidth: 62 },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 24, halign: "center", fontStyle: "bold" },
      5: { cellWidth: "auto" },
      6: { cellWidth: 36 },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 4) return;
      const r = doc.matrizRiesgos[data.row.index];
      const exp = r ? poaExposicion(r) : 0;
      if (!exp) return;
      const cat = poaCategoria(exp);
      data.cell.styles.fillColor = CATEGORIA_RGB[cat];
      data.cell.styles.textColor = cat === "moderado" ? [0, 0, 0] : [255, 255, 255];
    },
  });
  para(
    "Probabilidad: Baja = 1, Media = 2, Alta = 3. Impacto: Leve = 1, Moderado = 2, Severo = 3. Categoría: 1 - 3 no prioritario; 4 - 6 puede considerarse prioritario; 7 - 9 es prioritario, urge intervenir.",
    { size: 8.5 },
  );

  // ===========================================================================
  // V. Programación de actividades de gestión (horizontal)
  // ===========================================================================
  newPage("landscape");
  h1(4, "Programación de actividades de gestión");
  {
    type Cell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
    const body: Cell[][] = [];
    const semaforos: (PoaSemaforo | null)[][] = [];
    for (const group of doc.actividades) {
      body.push([{ content: `Objetivo: ${t(group.objetivo)}`, colSpan: 17, styles: { fillColor: GROUP_FILL, fontStyle: "bold" } }]);
      semaforos.push([]);
      for (const row of group.rows) {
        const fila: Cell[] = [t(row.actividad), t(row.indicador), t(row.meta), t(row.responsable)];
        const sem: (PoaSemaforo | null)[] = [null, null, null, null];
        row.trimestres.forEach((tri) => {
          fila.push(t(tri.prog), t(tri.real), tri.real.trim() ? poaPercent(tri.prog, tri.real) : "");
          sem.push(null, null, poaSemaforo(tri.prog, tri.real));
        });
        fila.push(t(row.supuestos));
        sem.push(null);
        body.push(fila);
        semaforos.push(sem);
      }
    }
    para("El % de cada trimestre es lo realizado sobre lo programado. Verde: 90 % o más; amarillo: de 70 a 89 %; rojo: menos de 70 %.", { size: 8.5, after: 1.5 });
    const tri = (n: number) => ({ content: `Trimestre ${n}`, colSpan: 3 });
    tabla({
      head: [
        [
          { content: "Objetivos / actividades", rowSpan: 2 },
          { content: "Indicadores", rowSpan: 2 },
          { content: "Meta anual", rowSpan: 2 },
          { content: "Responsable", rowSpan: 2 },
          tri(1), tri(2), tri(3), tri(4),
          { content: "Supuestos externos", rowSpan: 2 },
        ],
        ["Prog", "Real", "%", "Prog", "Real", "%", "Prog", "Real", "%", "Prog", "Real", "%"],
      ],
      body,
      styles: { font: FONT, fontSize: 7.8, cellPadding: 1.3, lineColor: GRID, lineWidth: 0.2, textColor: TEXT, valign: "middle" },
      headStyles: { fillColor: HEAD_FILL, textColor: TEXT, fontStyle: "bold", halign: "center", fontSize: 7.8 },
      columnStyles: {
        0: { cellWidth: 46 },
        1: { cellWidth: 34 },
        2: { cellWidth: 11, halign: "center" },
        3: { cellWidth: 23 },
        ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 4, { cellWidth: 8.6, halign: "center", cellPadding: 0.8 }])),
        16: { cellWidth: "auto" },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const sem = semaforos[data.row.index]?.[data.column.index];
        const fill = sem ? SEMAFORO_RGB[sem] : undefined;
        if (fill) data.cell.styles.fillColor = fill;
      },
    });
  }

  // ===========================================================================
  // VI. Seguimiento + Medidas a adoptar
  // ===========================================================================
  newPage("landscape");
  h1(5, "Seguimiento");
  para(doc.seguimiento ?? "");
  h2("Medidas a adoptar");
  const medidas = (doc.medidas ?? []).filter((m) => m.resultado.trim() || m.medida.trim() || m.factor.trim());
  tabla({
    head: [[
      "Trimestre",
      "Resultado esperado (según la programación anual)",
      "Factor o situación que impidió la realización de la meta",
      "Medidas a adoptar",
      "Antes de (qué fecha)",
      "Responsable",
    ]],
    body: medidas.length
      ? medidas.map((m) => [m.trimestre ? `T${t(m.trimestre)}` : "", t(m.resultado), t(m.factor), t(m.medida), t(m.fecha), t(m.responsable)])
      : [[{ content: "Sin medidas registradas: todas las metas evaluadas se cumplieron.", colSpan: 6, styles: { halign: "center", fontStyle: "italic" } }]],
    columnStyles: {
      0: { cellWidth: 18, halign: "center" },
      1: { cellWidth: 55 },
      2: { cellWidth: 55 },
      3: { cellWidth: "auto" },
      4: { cellWidth: 26, halign: "center" },
      5: { cellWidth: 36 },
    },
  });

  // ===========================================================================
  // Índice (página 3)
  // ===========================================================================
  pdf.setPage(paginaIndice);
  y = TOP + 6;
  pdf.setFont(FONT, "bold");
  pdf.setFontSize(13);
  setColor(TEXT);
  pdf.text("Índice", pageW() / 2, y, { align: "center" });
  y += 10;
  const indice: [string, string][] = [
    ["Aprobaciones", "2"],
    ["Índice", String(paginaIndice)],
    ["I. Introducción", String(sectionPages.I ?? "")],
    [poaEsDivision(doc.serviceId) ? "II. Descripción general de la unidad" : "II. Descripción general del servicio", String(sectionPages.II ?? "")],
    ["III. Diagnóstico situacional", String(sectionPages.III ?? "")],
    ["IV. Valoración de riesgos", String(sectionPages.IV ?? "")],
    ["V. Programación de actividades de gestión", String(sectionPages.V ?? "")],
    ["VI. Seguimiento", String(sectionPages.VI ?? "")],
  ];
  autoTable(pdf, {
    theme: "grid",
    startY: y,
    margin: { left: ML + 20, right: MR + 20, top: TOP },
    body: indice,
    styles: { font: FONT, fontSize: 10, cellPadding: 2.4, lineColor: GRID, lineWidth: 0.2, textColor: TEXT },
    columnStyles: { 1: { halign: "center", cellWidth: 22 } },
  });

  // ===========================================================================
  // Membrete en cada página desde Aprobaciones: "Página X de Y"
  // ===========================================================================
  const total = pdf.getNumberOfPages();
  const membrete = doc.membrete ?? { proceso: "", codigo: "", version: "Versión 01" };
  for (let p = 2; p <= total; p += 1) {
    pdf.setPage(p);
    const W = pageW();
    const x0 = ML;
    const y0 = 12;
    const w = W - ML - MR;
    const rowH = 7;
    const c1 = 36;
    const c3 = 40;
    const c2 = w - c1 - c3;
    pdf.setDrawColor(GRID[0], GRID[1], GRID[2]);
    pdf.setLineWidth(0.25);
    pdf.rect(x0, y0, w, rowH * 3);
    pdf.line(x0 + c1, y0, x0 + c1, y0 + rowH * 3);
    pdf.line(x0 + c1 + c2, y0, x0 + c1 + c2, y0 + rowH * 3);
    pdf.line(x0 + c1, y0 + rowH, x0 + w, y0 + rowH);
    pdf.line(x0 + c1, y0 + rowH * 2, x0 + w, y0 + rowH * 2);
    if (hnes) {
      const iw = c1 - 6;
      const ih = (iw * hnes.h) / hnes.w;
      pdf.addImage(hnes.data, hnes.format, x0 + 3, y0 + (rowH * 3 - ih) / 2, iw, ih);
    }
    pdf.setFont(FONT, "normal");
    pdf.setFontSize(8);
    setColor(TEXT);
    const mid = x0 + c1 + c2 / 2;
    pdf.text(t(membrete.proceso) || " ", mid, y0 + 4.7, { align: "center" });
    const titulo = pdf.splitTextToSize(`Plan Anual Operativo del ${servicio}`, c2 - 4) as string[];
    pdf.text(titulo[0] ?? "", mid, y0 + rowH + 4.7, { align: "center" });
    pdf.text(String(anio), mid, y0 + rowH * 2 + 4.7, { align: "center" });
    const right = x0 + c1 + c2 + c3 / 2;
    pdf.text(t(membrete.codigo) || " ", right, y0 + 4.7, { align: "center" });
    pdf.text(t(membrete.version) || "Versión 01", right, y0 + rowH + 4.7, { align: "center" });
    pdf.setFont(FONT, "bold");
    pdf.text(`Página ${p} de ${total}`, right, y0 + rowH * 2 + 4.7, { align: "center" });
  }

  pdf.setProperties({
    title: `Plan Anual Operativo ${anio} - ${servicio}`,
    subject: "Plan Anual Operativo",
    creator: "PULSO - Hospital Nacional El Salvador",
  });
  return pdf.output("blob");
}

export async function downloadPoaPdf(doc: PoaDoc, media: PoaMedia = {}): Promise<void> {
  const blob = await buildPoaPdf(doc, media);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `PAO ${doc.year} - ${doc.serviceName}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
