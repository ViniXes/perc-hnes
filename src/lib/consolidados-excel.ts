// Consolidados del periodo (Descargas): genera archivos .xlsx REALES con exceljs
// (antes eran HTML con extension .xls y Excel avisaba "formato distinto").
// exceljs se carga solo al descargar.

import type { Borders, Workbook, Worksheet } from "exceljs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HEADER_FILL = "FFDBE7FF";
const BORDER_COLOR = { argb: "FFCBD5E1" };
const THIN_BORDER: Partial<Borders> = {
  top: { style: "thin", color: BORDER_COLOR },
  left: { style: "thin", color: BORDER_COLOR },
  bottom: { style: "thin", color: BORDER_COLOR },
  right: { style: "thin", color: BORDER_COLOR },
};

async function newWorkbook(): Promise<Workbook> {
  const mod = (await import("exceljs")) as unknown as {
    default?: { Workbook: new () => Workbook };
    Workbook?: new () => Workbook;
  };
  const Ctor = mod.default?.Workbook ?? mod.Workbook;
  if (!Ctor) throw new Error("exceljs");
  const wb = new Ctor();
  wb.creator = "PULSO - Hospital Nacional El Salvador";
  wb.created = new Date();
  return wb;
}

async function saveWorkbook(wb: Workbook, fileName: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function styleHeaderRow(ws: Worksheet, rowNumber: number) {
  const row = ws.getRow(rowNumber);
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

/** Valor numerico redondeado a 2 decimales (igual que formatConsolidatedNumber). */
function num(value: number | string): number | string {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return typeof value === "string" ? value : 0;
  return Math.round(n * 100) / 100;
}

export type DistribuidaRow = { row: string; cells: number[] };

/** Produccion Distribuida: matriz fila x centro de costo. */
export async function downloadDistribuidaXlsx(
  headers: string[],
  rows: DistribuidaRow[],
  periodId: string,
) {
  const wb = await newWorkbook();
  const ws = wb.addWorksheet("Produccion Distribuida", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });
  ws.addRow(["", ...headers]);
  styleHeaderRow(ws, 1);
  ws.getRow(1).height = 45;

  for (const r of rows) {
    const added = ws.addRow([r.row, ...r.cells.map((c) => num(c))]);
    added.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = THIN_BORDER;
      if (col === 1) {
        cell.font = { bold: true };
      } else {
        cell.alignment = { horizontal: "center" };
      }
    });
  }

  ws.getColumn(1).width = 45;
  for (let i = 2; i <= headers.length + 1; i++) ws.getColumn(i).width = 16;

  await saveWorkbook(wb, `produccion-distribuida-${periodId}.xlsx`);
}

export type ServicioUnit = {
  label: string;
  qty: string;
  source: "servicio" | "censo" | "camas" | "services" | "none";
  complete?: boolean;
};
export type ServicioRow = { centro: string; units: ServicioUnit[] };

/**
 * Produccion de Servicio: IGUAL a la plantilla que exporta el sistema PERC real,
 * para que se pueda cargar alli. Una sola hoja, 3 columnas planas
 * (Centro de Producción | Unidades de Producción | Cantidad), una fila por unidad
 * con el centro REPETIDO en cada fila, sin celdas combinadas, sin colores, sin
 * paneles fijos ni filas de titulo. Cantidad va como numero.
 */
export async function downloadServicioXlsx(rows: ServicioRow[], periodId: string) {
  const wb = await newWorkbook();
  const ws = wb.addWorksheet("Produccion por Servicio");
  ws.addRow(["Centro de Producción", "Unidades de Producción", "Cantidad"]);
  for (const svc of rows) {
    for (const unit of svc.units) {
      const q = num(unit.qty);
      ws.addRow([svc.centro, unit.label, typeof q === "number" ? q : 0]);
    }
  }
  ws.getColumn(1).width = 45;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 10;

  await saveWorkbook(wb, `produccion-por-servicio-${periodId}.xlsx`);
}
