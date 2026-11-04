// =============================================================================
// PERSONAL DESVINCULADO - Excel para descargar y subir.
//
// Descargar: la plantilla del mes (vacía, o con lo que ya se cargó) con las
// columnas del memo: N°, nombre completo, carné / ID, cargo, área de trabajo y
// fecha de fin. Si el reporte ya se envió, agrega la columna "Acceso SIS".
// Subir: lee esas mismas columnas (desde la fila de encabezados) y devuelve las
// personas para revisarlas en pantalla antes de enviar.
// exceljs se carga solo al usarlo.
// =============================================================================
import type { Workbook } from "exceljs";

export type FilaDesvinculado = {
  nombre: string;
  carne: string;
  cargo: string;
  area: string;
  /** "YYYY-MM-DD" */
  fechaFin: string;
  sis?: string;
};

const COLUMNAS = ["N°", "NOMBRE COMPLETO", "CARNÉ / ID", "CARGO", "ÁREA DE TRABAJO", "FECHA DE FIN (dd/mm/aaaa)"];
const ANCHOS = [6, 38, 16, 28, 28, 22];

async function nuevoLibro(): Promise<Workbook> {
  const mod = (await import("exceljs")) as unknown as {
    default?: { Workbook: new () => Workbook };
    Workbook?: new () => Workbook;
  };
  const Ctor = mod.default?.Workbook ?? mod.Workbook;
  if (!Ctor) throw new Error("exceljs");
  return new Ctor();
}

function aIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoADate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null;
}

export async function descargarExcelDesvinculados(opts: {
  periodoTexto: string;
  archivo: string;
  filas: FilaDesvinculado[];
  conSis: boolean;
  sinMovimientos: boolean;
  responsable: string;
}) {
  const wb = await nuevoLibro();
  wb.creator = "PULSO - Hospital Nacional El Salvador";
  wb.created = new Date();
  const ws = wb.addWorksheet("Desvinculados");
  const cols = opts.conSis ? [...COLUMNAS, "ACCESO SIS"] : COLUMNAS;
  const anchos = opts.conSis ? [...ANCHOS, 18] : ANCHOS;
  anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const titulo = (fila: number, texto: string, bold = true, size = 12) => {
    ws.mergeCells(fila, 1, fila, cols.length);
    const c = ws.getCell(fila, 1);
    c.value = texto;
    c.font = { name: "Calibri", size, bold };
    c.alignment = { horizontal: "center" };
  };
  titulo(1, "HOSPITAL NACIONAL EL SALVADOR");
  titulo(2, "REPORTE MENSUAL DE PERSONAL DESVINCULADO (RRHH → ESDOMED)", true, 11);
  titulo(3, `Mes reportado: ${opts.periodoTexto}`, false, 11);
  if (opts.responsable) titulo(4, `Responsable del envío: ${opts.responsable}`, false, 10);

  const H = 6;
  const borde = { style: "thin" as const, color: { argb: "FF9CA3AF" } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };
  cols.forEach((t, i) => {
    const c = ws.getCell(H, i + 1);
    c.value = t;
    c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6F68" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = bordes;
  });
  ws.getRow(H).height = 30;

  // Con datos: las personas. Sin datos: 15 filas vacías para llenar.
  const filas: (FilaDesvinculado | null)[] = opts.filas.length ? opts.filas : Array.from({ length: 15 }, () => null);
  filas.forEach((f, i) => {
    const r = H + 1 + i;
    const valores: (string | number | Date | null)[] = [
      i + 1,
      f?.nombre ?? null,
      f?.carne ?? null,
      f?.cargo ?? null,
      f?.area ?? null,
      f ? isoADate(f.fechaFin) : null,
    ];
    if (opts.conSis) valores.push(f?.sis ?? null);
    valores.forEach((v, j) => {
      const c = ws.getCell(r, j + 1);
      c.value = v;
      c.font = { name: "Calibri", size: 10 };
      c.border = bordes;
      if (j === 0) c.alignment = { horizontal: "center" };
      if (j === 5) {
        c.numFmt = "dd/mm/yyyy";
        c.alignment = { horizontal: "center" };
      }
    });
    // Carné como texto, para que Excel no le quite ceros a la izquierda.
    ws.getCell(r, 3).numFmt = "@";
  });

  if (opts.sinMovimientos) {
    const r = H + 2 + filas.length;
    ws.mergeCells(r, 1, r, cols.length);
    ws.getCell(r, 1).value = "SIN MOVIMIENTOS: en este mes nadie dejó de laborar en el hospital.";
    ws.getCell(r, 1).font = { name: "Calibri", size: 10, bold: true };
  }
  ws.views = [{ state: "frozen", ySplit: H }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.archivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function normalizar(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function texto(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return aIso(v);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((x) => x.text).join("").trim();
    if (o.text != null) return String(o.text).trim();
    if (o.result != null) return texto(o.result);
  }
  return String(v).replace(/\s+/g, " ").trim();
}

/** Fecha de la celda: Date de Excel, número de serie, dd/mm/aaaa o aaaa-mm-dd. */
function fecha(v: unknown): string {
  if (v instanceof Date) {
    // exceljs entrega la fecha en UTC: se toma el día UTC para no correrla.
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return fecha(d);
  }
  const t = texto(v);
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return "";
}

/**
 * Lee el Excel subido. Busca la fila de encabezados (la que dice "nombre") y
 * ubica cada columna por su título, así funciona aunque muevan columnas.
 */
export async function leerExcelDesvinculados(archivo: File): Promise<{ filas: FilaDesvinculado[]; fechasMalas: number }> {
  const wb = await nuevoLibro();
  await wb.xlsx.load(await archivo.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("vacio");

  let filaH = 0;
  let idx = { nombre: 0, carne: 0, cargo: 0, area: 0, fecha: 0 };
  for (let r = 1; r <= Math.min(ws.rowCount, 30) && !filaH; r++) {
    const row = ws.getRow(r);
    idx = { nombre: 0, carne: 0, cargo: 0, area: 0, fecha: 0 };
    row.eachCell((cell, col) => {
      const t = normalizar(texto(cell.value));
      if (!t) return;
      if (t.includes("nombre")) idx.nombre = col;
      else if (t.includes("carne") || t === "id" || t.includes("identificador") || t.includes("carnet")) idx.carne = col;
      else if (t.includes("cargo")) idx.cargo = col;
      else if (t.includes("area")) idx.area = col;
      else if (t.includes("fecha")) idx.fecha = col;
    });
    if (idx.nombre) filaH = r;
  }
  if (!filaH) throw new Error("encabezados");

  const filas: FilaDesvinculado[] = [];
  let fechasMalas = 0;
  for (let r = filaH + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const val = (col: number) => (col ? row.getCell(col).value : null);
    const f: FilaDesvinculado = {
      nombre: texto(val(idx.nombre)).slice(0, 120),
      carne: texto(val(idx.carne)).slice(0, 40),
      cargo: texto(val(idx.cargo)).slice(0, 120),
      area: texto(val(idx.area)).slice(0, 120),
      fechaFin: fecha(val(idx.fecha)),
    };
    if (!f.nombre && !f.carne && !f.cargo && !f.area) continue;
    if (/^sin movimientos/i.test(f.nombre)) continue;
    if (idx.fecha && !f.fechaFin && texto(val(idx.fecha))) fechasMalas++;
    filas.push(f);
  }
  return { filas, fechasMalas };
}
