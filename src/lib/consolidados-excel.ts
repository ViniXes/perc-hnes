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

/** Produccion de Servicio: Centro | Unidad | Cantidad, con el centro combinado. */
export async function downloadServicioXlsx(rows: ServicioRow[], periodId: string) {
  const wb = await newWorkbook();
  const ws = wb.addWorksheet("Produccion de Servicio", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.addRow(["Centro de Producción", "Unidades de Producción", "Cantidad"]);
  styleHeaderRow(ws, 1);

  for (const svc of rows) {
    if (svc.units.length === 0) continue;
    const first = ws.rowCount + 1;
    svc.units.forEach((unit, index) => {
      const added = ws.addRow([index === 0 ? svc.centro : "", unit.label, num(unit.qty)]);
      added.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = THIN_BORDER;
      });
      const qty = added.getCell(3);
      qty.alignment = { horizontal: "center" };
      // Camas = amarillo; Censo / ESDOMED Services: verde si completo, amarillo si no.
      let fill: string | null = null;
      let color: string | null = null;
      if (unit.source === "camas") {
        fill = "FFFFFF00";
        color = "FF111827";
      } else if (unit.source === "censo" || unit.source === "services") {
        fill = unit.complete ? "FFDCFCE7" : "FFFEF9C3";
        color = unit.complete ? "FF166534" : "FF854D0E";
      }
      if (fill && color) {
        qty.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        qty.font = { bold: true, color: { argb: color } };
      }
    });
    const last = ws.rowCount;
    if (last > first) ws.mergeCells(first, 1, last, 1);
    const centro = ws.getCell(first, 1);
    centro.font = { bold: true };
    centro.alignment = { vertical: "middle", wrapText: true };
    centro.border = THIN_BORDER;
  }

  ws.getColumn(1).width = 45;
  ws.getColumn(2).width = 50;
  ws.getColumn(3).width = 14;

  await saveWorkbook(wb, `produccion-de-servicio-${periodId}.xlsx`);
}
