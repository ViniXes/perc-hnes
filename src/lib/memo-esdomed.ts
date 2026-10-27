// =============================================================================
// Memorándums de ESDOMED (menú "ESDOMED", solo administradores).
// -----------------------------------------------------------------------------
// Cada memo se guarda en Firestore `esdomedMemos/<año>__<número>` (sin Firebase
// Storage) y se descarga en PDF o en Word con el membrete oficial del formato
// "MEMORAMDUM 20.docx" de ESDOMED:
//
//  - Word: se parte de la plantilla real (public/memo/plantilla-memo.docx), que
//    conserva tal cual el encabezado (MINSAL + Hospital) y el pie (sello ISO 37001,
//    dirección e "Institución Certificada..."). Solo se reemplaza el cuerpo, así
//    que el membrete sale idéntico en todas las páginas.
//  - PDF: se dibuja con jsPDF el mismo membrete en cada página, con las medidas
//    tomadas de la plantilla (carta, márgenes 3 cm / 2.34 cm).
//
// El cuerpo se escribe como en Word: cada renglón es un párrafo, un renglón vacío
// deja un espacio y un renglón que empieza con "- " o "• " sale como viñeta. Así
// el memo puede ser de 1, 2, 3 o más hojas: el texto corre solo de hoja en hoja.
//
// jsPDF y JSZip se cargan de forma dinámica (solo al exportar).
// =============================================================================

export type MemoPersona = { nombre: string; cargo: string };

/**
 * Un bloque del encabezado: título a la izquierda ("PARA:", "CC.:", "DE:",
 * "A TRAVÉS DE:" o lo que se escriba) y una o varias personas (nombre y cargo).
 * Los bloques salen en el orden de la lista.
 */
export type MemoBloque = { etiqueta: string; personas: MemoPersona[] };

export type MemoEsdomed = {
  year: number;
  numero: number;
  bloques: MemoBloque[];
  asunto: string;
  lugar: string;
  /** "YYYY-MM-DD" */
  fecha: string;
  cuerpo: string;
  despedida: string;
  /** Agrega el nombre y cargo de quien firma debajo de la despedida. */
  firma: boolean;
  /** Copias ("C.c."), una por renglón. */
  cc: string;
};

export const MEMO_COLECCION = "esdomedMemos";

export const MEMO_PARA_DEFAULT: MemoPersona = {
  nombre: "Dra. Laura Estela Miranda Iraheta",
  cargo: "Directora del Hospital Nacional El Salvador",
};

export const MEMO_DE_DEFAULT: MemoPersona = {
  nombre: "Ing. Heber Benjamín Cardoza Guevara",
  cargo: "Jefe del Servicio Sección de Estadística y Documentos Médicos",
};

export const MEMO_SALUDO_DEFAULT = "Reciba un cordial saludo y mis mejores deseos de éxito en sus labores.";

/** Títulos sugeridos para los bloques (también se puede escribir otro). */
export const MEMO_ETIQUETA_OPCIONES = ["PARA:", "CC.:", "DE:", "A TRAVÉS DE:", "VÍA:"];

/** Título como sale impreso: en mayúsculas y terminado en ":" ("cc." -> "CC.:"). */
export function memoEtiqueta(etiqueta: string): string {
  const limpio = (etiqueta || "").trim().toUpperCase();
  if (!limpio) return "";
  return limpio.endsWith(":") ? limpio : `${limpio}:`;
}

/** Quien firma: la primera persona del bloque "DE:". */
export function memoFirmante(memo: Pick<MemoEsdomed, "bloques">): MemoPersona | null {
  const de = memo.bloques.find((b) => memoEtiqueta(b.etiqueta) === "DE:");
  return de ? (personasValidas(de.personas)[0] ?? null) : null;
}

export function memoDocId(year: number, numero: number): string {
  return `${year}__${String(numero).padStart(4, "0")}`;
}

/** "No. HNES-2026-ESDOMED-20" */
export function memoCodigo(year: number, numero: number): string {
  return `HNES-${year}-ESDOMED-${numero}`;
}

/** "2026-10-23" -> "23/10/2026" */
export function memoFechaTexto(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha || "";
}

export function memoNombreArchivo(memo: Pick<MemoEsdomed, "year" | "numero" | "asunto">): string {
  const asunto = (memo.asunto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
  return `Memo ${memoCodigo(memo.year, memo.numero)}${asunto ? ` - ${asunto}` : ""}`;
}

export function memoNuevo(year: number, numero: number, hoy: string): MemoEsdomed {
  return {
    year,
    numero,
    bloques: [
      { etiqueta: "PARA:", personas: [{ ...MEMO_PARA_DEFAULT }] },
      { etiqueta: "DE:", personas: [{ ...MEMO_DE_DEFAULT }] },
    ],
    asunto: "",
    lugar: "San Salvador Centro",
    fecha: hoy,
    cuerpo: `${MEMO_SALUDO_DEFAULT}\n\n`,
    despedida: "Atentamente.",
    firma: false,
    cc: "",
  };
}

/** Normaliza lo que viene de Firestore (campos faltantes -> valores vacíos). */
export function normalizarMemo(raw: Record<string, unknown>): MemoEsdomed {
  const persona = (v: unknown): MemoPersona => {
    const o = (v ?? {}) as Record<string, unknown>;
    return { nombre: String(o.nombre ?? ""), cargo: String(o.cargo ?? "") };
  };
  const lista = (v: unknown): MemoPersona[] => (Array.isArray(v) ? v.map(persona) : []);
  let bloques: MemoBloque[];
  if (Array.isArray(raw.bloques)) {
    bloques = raw.bloques.map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      return { etiqueta: String(o.etiqueta ?? ""), personas: lista(o.personas) };
    });
  } else {
    // Memos guardados con el formato anterior (para / via / de fijos).
    bloques = [{ etiqueta: "PARA:", personas: lista(raw.para) }];
    if (lista(raw.via).length > 0) {
      const via = typeof raw.viaEtiqueta === "string" && raw.viaEtiqueta.trim() ? raw.viaEtiqueta : "VÍA";
      bloques.push({ etiqueta: memoEtiqueta(via), personas: lista(raw.via) });
    }
    bloques.push({ etiqueta: "DE:", personas: [persona(raw.de)] });
  }
  return {
    year: Number(raw.year) || new Date().getFullYear(),
    numero: Number(raw.numero) || 1,
    bloques,
    asunto: String(raw.asunto ?? ""),
    lugar: String(raw.lugar ?? ""),
    fecha: String(raw.fecha ?? ""),
    cuerpo: String(raw.cuerpo ?? ""),
    despedida: String(raw.despedida ?? ""),
    firma: raw.firma === true,
    cc: String(raw.cc ?? ""),
  };
}

// --- Cuerpo: renglones -> párrafos ------------------------------------------
type Parrafo = { tipo: "texto" | "vineta" | "vacio"; texto: string };

function parrafosDelCuerpo(cuerpo: string): Parrafo[] {
  const lineas = (cuerpo || "").replace(/\r/g, "").split("\n");
  // Sin renglones vacíos al final (no agregan nada antes de la despedida).
  while (lineas.length > 0 && lineas[lineas.length - 1].trim() === "") lineas.pop();
  return lineas.map((linea) => {
    const limpio = linea.replace(/\s+$/g, "");
    if (limpio.trim() === "") return { tipo: "vacio", texto: "" };
    const vineta = /^\s*(?:[-•*·])\s+(.*)$/.exec(limpio);
    if (vineta) return { tipo: "vineta", texto: vineta[1].trim() };
    return { tipo: "texto", texto: limpio.trim() };
  });
}

function personasValidas(lista: MemoPersona[]): MemoPersona[] {
  return lista.filter((p) => p.nombre.trim() || p.cargo.trim());
}

/** Bloques que llevan al menos una persona (los vacíos no se imprimen). */
function bloquesValidos(memo: Pick<MemoEsdomed, "bloques">): MemoBloque[] {
  return memo.bloques.filter((b) => personasValidas(b.personas).length > 0);
}

// =============================================================================
// WORD
// =============================================================================
function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caracteres de control que Word no acepta en el XML.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/** Sangría del valor de PARA / DE / ASUNTO / FECHA (≈ 2.9 cm, como la plantilla). */
const TAB_VALOR = 1650;

const rArial = (bold: boolean, sz: number) =>
  `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${bold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;

const wRun = (rPr: string, texto: string) => `<w:r>${rPr}<w:t xml:space="preserve">${xmlEsc(texto)}</w:t></w:r>`;

const wVacio = () => `<w:p/>`;

/** Bloque "ETIQUETA:  valor" con sangría francesa para que el valor quede alineado. */
/**
 * Columna (twips) donde empiezan los nombres, la misma para todo el encabezado.
 * Si algún título es largo (p. ej. "A TRAVÉS DE:") se corre para todos, así
 * nombres y cargos quedan alineados (~2.75 mm por letra, Arial negrita 11).
 */
function columnaValor(etiquetas: string[]): number {
  const larga = Math.max(0, ...etiquetas.map((e) => e.length));
  return Math.max(TAB_VALOR, Math.round(larga * 2.75 * 56.7) + 340);
}

function wCampo(etiqueta: string, renglones: { texto: string; bold: boolean }[], tab: number): string {
  const runs: string[] = [];
  if (etiqueta) runs.push(wRun(rArial(true, 22), etiqueta));
  runs.push(`<w:r>${rArial(true, 20)}<w:tab/></w:r>`);
  renglones.forEach((r, i) => {
    if (i > 0) runs.push(`<w:r>${rArial(r.bold, 20)}<w:br/></w:r>`);
    runs.push(wRun(rArial(r.bold, 20), r.texto));
  });
  return `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="${tab}"/></w:tabs><w:ind w:left="${tab}" w:hanging="${tab}"/></w:pPr>${runs.join("")}</w:p>`;
}

function wPersonas(etiqueta: string, lista: MemoPersona[], tab: number): string[] {
  return personasValidas(lista).map((p, i) => {
    const renglones: { texto: string; bold: boolean }[] = [];
    if (p.nombre.trim()) renglones.push({ texto: p.nombre.trim(), bold: false });
    if (p.cargo.trim()) {
      p.cargo
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((c) => renglones.push({ texto: c, bold: true }));
    }
    const bloque = wCampo(i === 0 ? etiqueta : "", renglones, tab);
    // Entre destinatarios, un renglón de aire.
    return i === 0 ? bloque : wVacio() + bloque;
  });
}

/** XML del cuerpo del documento (lo que va entre <w:body> y <w:sectPr>). */
export function memoDocxCuerpoXml(memo: MemoEsdomed): string {
  const p: string[] = [];
  p.push(wVacio());
  p.push(
    `<w:p><w:pPr><w:jc w:val="right"/></w:pPr>${wRun(rArial(true, 20), `No. ${memoCodigo(memo.year, memo.numero)}`)}</w:p>`,
  );
  p.push(wVacio());

  const separar = () => {
    p.push(wVacio());
    p.push(wVacio());
  };

  const bloques = bloquesValidos(memo);
  const tab = columnaValor([...bloques.map((b) => memoEtiqueta(b.etiqueta)), "ASUNTO:", "FECHA:"]);
  for (const b of bloques) {
    p.push(...wPersonas(memoEtiqueta(b.etiqueta), b.personas, tab));
    separar();
  }
  p.push(wCampo("ASUNTO:", [{ texto: memo.asunto.trim(), bold: true }], tab));
  separar();
  p.push(
    wCampo("FECHA:", [{ texto: [memo.lugar.trim(), memoFechaTexto(memo.fecha)].filter(Boolean).join(" "), bold: true }], tab),
  );
  p.push(wVacio());
  p.push(`<w:p><w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>${"_".repeat(72)}</w:t></w:r></w:p>`);
  p.push(wVacio());
  p.push(wVacio());

  for (const par of parrafosDelCuerpo(memo.cuerpo)) {
    if (par.tipo === "vacio") {
      p.push(wVacio());
    } else if (par.tipo === "vineta") {
      p.push(
        `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/><w:jc w:val="both"/></w:pPr><w:r><w:t xml:space="preserve">•</w:t></w:r><w:r><w:tab/></w:r>${wRun("", par.texto)}</w:p>`,
      );
    } else {
      p.push(`<w:p><w:pPr><w:jc w:val="both"/></w:pPr>${wRun("", par.texto)}</w:p>`);
    }
  }

  if (memo.despedida.trim()) {
    p.push(wVacio());
    p.push(`<w:p><w:pPr><w:jc w:val="both"/></w:pPr>${wRun("", memo.despedida.trim())}</w:p>`);
  }

  const firmante = memoFirmante(memo);
  if (memo.firma && firmante) {
    p.push(wVacio(), wVacio(), wVacio(), wVacio());
    // Que la firma no quede sola arriba de una hoja nueva.
    const keep = `<w:keepNext/><w:keepLines/>`;
    p.push(`<w:p><w:pPr>${keep}<w:jc w:val="center"/></w:pPr>${wRun("", "_".repeat(34))}</w:p>`);
    if (firmante.nombre.trim()) {
      p.push(`<w:p><w:pPr>${keep}<w:jc w:val="center"/></w:pPr>${wRun("<w:rPr><w:b/><w:bCs/></w:rPr>", firmante.nombre.trim())}</w:p>`);
    }
    for (const c of firmante.cargo.split("\n").map((x) => x.trim()).filter(Boolean)) {
      p.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${wRun("", c)}</w:p>`);
    }
  }

  const copias = memo.cc.split("\n").map((x) => x.trim()).filter(Boolean);
  if (copias.length > 0) {
    p.push(wVacio());
    copias.forEach((c, i) => {
      p.push(`<w:p>${wRun(rArial(false, 16), `${i === 0 ? "C.c. " : "        "}${c}`)}</w:p>`);
    });
  }
  return p.join("");
}

function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function buildMemoDocx(memo: MemoEsdomed): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const res = await fetch("/memo/plantilla-memo.docx", { cache: "force-cache" });
  if (!res.ok) throw new Error("No se pudo leer la plantilla del memo.");
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const archivo = zip.file("word/document.xml");
  if (!archivo) throw new Error("La plantilla del memo está dañada.");
  const xml = await archivo.async("string");
  zip.file("word/document.xml", xml.replace("<!--CUERPO-->", memoDocxCuerpoXml(memo)));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

export async function downloadMemoDocx(memo: MemoEsdomed): Promise<void> {
  descargarBlob(await buildMemoDocx(memo), `${memoNombreArchivo(memo)}.docx`);
}

// =============================================================================
// PDF
// =============================================================================
/** Las fuentes estándar del PDF solo llevan Latin-1. */
function t(value: string | undefined | null): string {
  return (value ?? "")
    .normalize("NFC")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[ \t]/g, " ")
    .replace(/\r/g, "")
    .replace(/[^\n -ÿ]/g, "");
}

export type MemoImagen = { data: string; format: "PNG" | "JPEG" };
export type MemoImagenes = { minsal: MemoImagen | null; hnes: MemoImagen | null; sello: MemoImagen | null };

// Medidas (mm) tomadas de la plantilla: carta, margen izq. 3 cm y der. 2.34 cm.
const PW = 215.9;
const ML = 30;
const MR = 23.4;
const X_VALOR = ML + TAB_VALOR / 56.7; // misma sangría que en Word
const Y_INICIO = 31; // debajo del encabezado
const Y_LIMITE = 244; // encima del pie
const PT = 0.3528; // 1 pt en mm

// Interfaz mínima de jsPDF que se usa (para no depender del tipo completo).
type Pdf = {
  addPage: () => unknown;
  setFont: (f: string, s: string) => unknown;
  setFontSize: (n: number) => unknown;
  setTextColor: (n: number) => unknown;
  setDrawColor: (n: number) => unknown;
  setLineWidth: (n: number) => unknown;
  line: (a: number, b: number, c: number, d: number) => unknown;
  circle: (x: number, y: number, r: number, estilo: string) => unknown;
  text: (s: string | string[], x: number, y: number, o?: Record<string, unknown>) => unknown;
  getTextWidth: (s: string) => number;
  splitTextToSize: (s: string, w: number) => string[];
  addImage: (d: string, f: string, x: number, y: number, w: number, h: number) => unknown;
  output: (tipo: "blob") => Blob;
};

function dibujarMembrete(pdf: Pdf, img: MemoImagenes) {
  // Encabezado: escudo MINSAL a la izquierda y logo del Hospital a la derecha.
  if (img.minsal) pdf.addImage(img.minsal.data, img.minsal.format, 13, 5.2, 50.1, 21.9);
  if (img.hnes) pdf.addImage(img.hnes.data, img.hnes.format, 150.7, 6, 41.7, 19.6);

  // Pie: sello ISO 37001 a la izquierda; dirección y certificación al centro.
  if (img.sello) pdf.addImage(img.sello.data, img.sello.format, 12.5, 248.3, 27.3, 29.7);
  const cx = 113;
  pdf.setTextColor(0);
  pdf.setFont("times", "normal");
  pdf.setFontSize(8);
  pdf.text("HOSPITAL NACIONAL EL SALVADOR", cx, 253.2, { align: "center" });
  const dir = pdf.splitTextToSize(
    t("Avenida De La Revolución No. 222, Colonia San Benito, Distrito de San Salvador, San Salvador Centro, San Salvador, El Salvador."),
    142,
  );
  dir.forEach((linea, i) => pdf.text(linea, cx, 256.6 + i * 3.3, { align: "center" }));
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.5);
  pdf.line(40.5, 264.2, 175, 264.2);
  pdf.text(t("Institución Certificada bajo la Norma ISO 37001;2016, por el organismo SERVIMETERS."), cx, 271, {
    align: "center",
  });
}

export async function buildMemoPdf(memo: MemoEsdomed, img: MemoImagenes): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait", compress: true }) as unknown as Pdf;
  return construirMemoPdf(pdf, memo, img);
}

/** Separado de buildMemoPdf para poder armarlo con cualquier instancia de jsPDF. */
export function construirMemoPdf(pdf: Pdf, memo: MemoEsdomed, img: MemoImagenes): Blob {
  const ancho = PW - ML - MR;
  let y = Y_INICIO;
  dibujarMembrete(pdf, img);

  const nuevaHoja = () => {
    pdf.addPage();
    dibujarMembrete(pdf, img);
    y = Y_INICIO;
  };
  /** Asegura `alto` mm libres; si no caben, pasa a la hoja siguiente. */
  const espacio = (alto: number) => {
    if (y + alto > Y_LIMITE) nuevaHoja();
  };

  const L_ARIAL = 4.4; // renglón Arial 10
  const L_TIMES = 4.87; // renglón Times 12 (interlineado sencillo de Word)
  const SEP = 9; // dos renglones vacíos entre bloques

  // No. del memo, a la derecha.
  pdf.setTextColor(0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(t(`No. ${memoCodigo(memo.year, memo.numero)}`), PW - MR, y, { align: "right" });
  y += L_ARIAL * 2.4;

  // Columna de los nombres, la misma para todo el encabezado: si un título es
  // largo (p. ej. "A TRAVÉS DE:"), se corre para todos y quedan alineados.
  const bloques = bloquesValidos(memo);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  const xValor = Math.max(
    X_VALOR,
    ...[...bloques.map((b) => memoEtiqueta(b.etiqueta)), "ASUNTO:", "FECHA:"].map(
      (e) => ML + pdf.getTextWidth(t(e)) + 9,
    ),
  );

  const campo = (etiqueta: string, renglones: { texto: string; bold: boolean }[]) => {
    const lineas: { texto: string; bold: boolean }[] = [];
    for (const r of renglones) {
      pdf.setFont("helvetica", r.bold ? "bold" : "normal");
      pdf.setFontSize(10);
      for (const l of pdf.splitTextToSize(t(r.texto), PW - MR - xValor)) lineas.push({ texto: l, bold: r.bold });
    }
    espacio(lineas.length * L_ARIAL);
    if (etiqueta) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(t(etiqueta), ML, y);
    }
    lineas.forEach((l, i) => {
      pdf.setFont("helvetica", l.bold ? "bold" : "normal");
      pdf.setFontSize(10);
      pdf.text(l.texto, xValor, y + i * L_ARIAL);
    });
    y += Math.max(1, lineas.length) * L_ARIAL;
  };

  const personas = (etiqueta: string, lista: MemoPersona[]) => {
    personasValidas(lista).forEach((p, i) => {
      if (i > 0) y += L_ARIAL;
      const renglones: { texto: string; bold: boolean }[] = [];
      if (p.nombre.trim()) renglones.push({ texto: p.nombre.trim(), bold: false });
      p.cargo
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((c) => renglones.push({ texto: c, bold: true }));
      campo(i === 0 ? etiqueta : "", renglones);
    });
  };

  for (const b of bloques) {
    personas(memoEtiqueta(b.etiqueta), b.personas);
    y += SEP;
  }
  campo("ASUNTO:", [{ texto: memo.asunto.trim(), bold: true }]);
  y += SEP;
  campo("FECHA:", [{ texto: [memo.lugar.trim(), memoFechaTexto(memo.fecha)].filter(Boolean).join(" "), bold: true }]);
  y += 5;
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.35);
  pdf.line(ML, y, ML + 152, y);
  y += L_TIMES * 2.8;

  // --- Cuerpo (Times 12, justificado) ---------------------------------------
  /** Dibuja un renglón justificado repartiendo el espacio entre palabras. */
  const renglonJustificado = (linea: string, x: number, w: number) => {
    const palabras = linea.split(/\s+/).filter(Boolean);
    if (palabras.length < 2) {
      pdf.text(linea, x, y);
      return;
    }
    const usado = palabras.reduce((s, p) => s + pdf.getTextWidth(p), 0);
    const hueco = (w - usado) / (palabras.length - 1);
    // Si el renglón quedaría muy estirado, mejor alinearlo a la izquierda.
    if (hueco > pdf.getTextWidth(" ") * 4) {
      pdf.text(linea, x, y);
      return;
    }
    let cx = x;
    for (const p of palabras) {
      pdf.text(p, cx, y);
      cx += pdf.getTextWidth(p) + hueco;
    }
  };

  const parrafo = (texto: string, x: number, w: number, vineta = false) => {
    const fuente = () => {
      pdf.setFont("times", "normal");
      pdf.setFontSize(12);
      pdf.setTextColor(0);
    };
    fuente();
    const lineas = pdf.splitTextToSize(t(texto), w);
    lineas.forEach((linea, i) => {
      espacio(L_TIMES);
      // El membrete de una hoja nueva cambia la fuente: se vuelve a poner.
      fuente();
      if (i === 0 && vineta) pdf.circle(x - 5.6, y - 1.25, 0.7, "F");
      if (i < lineas.length - 1) renglonJustificado(linea, x, w);
      else pdf.text(linea, x, y);
      y += L_TIMES;
    });
  };

  for (const par of parrafosDelCuerpo(memo.cuerpo)) {
    if (par.tipo === "vacio") {
      // Un renglón vacío al inicio de hoja no se dibuja (igual que en Word se ve).
      if (y > Y_INICIO) y += L_TIMES;
      if (y > Y_LIMITE) nuevaHoja();
    } else if (par.tipo === "vineta") {
      parrafo(par.texto, ML + 12.7, ancho - 12.7, true);
    } else {
      parrafo(par.texto, ML, ancho);
    }
  }

  if (memo.despedida.trim()) {
    y += L_TIMES;
    parrafo(memo.despedida.trim(), ML, ancho);
  }

  const firma = memoFirmante(memo);
  if (memo.firma && firma) {
    const cargos = firma.cargo.split("\n").map((x) => x.trim()).filter(Boolean);
    const alto = L_TIMES * (4 + 2 + cargos.length);
    espacio(alto);
    y += L_TIMES * 4;
    const cx = ML + ancho / 2;
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.25);
    pdf.line(cx - 35, y, cx + 35, y);
    y += L_TIMES;
    pdf.setFontSize(12);
    if (firma.nombre.trim()) {
      pdf.setFont("times", "bold");
      pdf.text(t(firma.nombre.trim()), cx, y, { align: "center" });
      y += L_TIMES;
    }
    pdf.setFont("times", "normal");
    for (const c of cargos) {
      for (const l of pdf.splitTextToSize(t(c), ancho)) {
        pdf.text(l, cx, y, { align: "center" });
        y += L_TIMES;
      }
    }
  }

  const copias = memo.cc.split("\n").map((x) => x.trim()).filter(Boolean);
  if (copias.length > 0) {
    y += L_TIMES;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    copias.forEach((c, i) => {
      espacio(8 * PT * 1.25);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(t(c), ML + 7, y);
      if (i === 0) pdf.text("C.c.", ML, y);
      y += 8 * PT * 1.25;
    });
  }

  return pdf.output("blob");
}

async function cargarImagen(url: string): Promise<MemoImagen | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { data, format: /^data:image\/png/i.test(data) ? "PNG" : "JPEG" };
  } catch {
    return null;
  }
}

let imagenesCache: Promise<MemoImagenes> | null = null;
function imagenesMembrete(): Promise<MemoImagenes> {
  if (!imagenesCache) {
    imagenesCache = Promise.all([
      cargarImagen("/memo/minsal.png"),
      cargarImagen("/memo/hnes.png"),
      cargarImagen("/memo/sello-iso.jpg"),
    ]).then(([minsal, hnes, sello]) => {
      // Si algo falló (sin red), que el próximo intento vuelva a probar.
      if (!minsal || !hnes || !sello) imagenesCache = null;
      return { minsal, hnes, sello };
    });
  }
  return imagenesCache;
}

export async function buildMemoPdfConMembrete(memo: MemoEsdomed): Promise<Blob> {
  return buildMemoPdf(memo, await imagenesMembrete());
}

export async function downloadMemoPdf(memo: MemoEsdomed): Promise<void> {
  descargarBlob(await buildMemoPdfConMembrete(memo), `${memoNombreArchivo(memo)}.pdf`);
}
