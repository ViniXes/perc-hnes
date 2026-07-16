// Generación de la plantilla Excel descargable de un tabulador SEPS diario.
// El archivo respeta el formato del tabulador (grupo, detalle, días 1..N) e incluye
// FÓRMULAS de Total por fila (=SUM) para que el usuario lo llene sin conexión y luego
// lo suba con el importador existente (que ubica cada tabla por la fila "Días del mes"
// y lee las filas en orden). Los días arrancan en la 3ª columna (índice 2).
import type { SepsTemplate } from "@/lib/seps-templates";

export async function downloadSepsTemplate(
  template: SepsTemplate,
  dayColumns: string[],
  periodId?: string,
): Promise<void> {
  if (!template.tables || template.tables.length === 0) {
    return;
  }
  const XLSX = await import("xlsx");
  const dayCount = dayColumns.length;
  const DAY0 = 2; // primera columna de día (índice 0-based)

  const aoa: (string | number | null)[][] = [];
  // Guardamos, por cada fila de datos, dónde va su celda de Total para ponerle fórmula.
  const totalCells: { row: number; col: number; first: number; last: number }[] = [];

  for (const table of template.tables) {
    aoa.push([template.establishment]);
    aoa.push([table.title]);
    if (table.subtitle) {
      aoa.push([table.subtitle]);
    }
    // Cabecera (la celda "Días del mes" es la que busca el importador).
    aoa.push(["Grupo", table.detailLabel || "Detalle", "Días del mes"]);
    // Números de día 1..N + etiqueta Total.
    const dayRow: (string | number)[] = ["", ""];
    for (let i = 0; i < dayCount; i += 1) {
      dayRow.push(i + 1);
    }
    dayRow.push("Total");
    aoa.push(dayRow);
    // Filas de datos, en el mismo orden que la plantilla (una por fila).
    for (const row of table.rows) {
      const grp =
        row.groups && row.groups.length > 0
          ? row.groups.join(" · ")
          : row.group || "";
      const line: (string | number | null)[] = [grp, row.label];
      for (let i = 0; i < dayCount; i += 1) {
        line.push(null);
      }
      line.push(""); // marcador de la celda Total (se reemplaza por fórmula)
      const rowIndex = aoa.length;
      aoa.push(line);
      totalCells.push({
        row: rowIndex,
        col: DAY0 + dayCount,
        first: DAY0,
        last: DAY0 + dayCount - 1,
      });
    }
    aoa.push([]); // separador entre tablas
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Fórmula de Total por fila: =SUM(<primer día>:<último día>).
  for (const t of totalCells) {
    const first = XLSX.utils.encode_cell({ r: t.row, c: t.first });
    const last = XLSX.utils.encode_cell({ r: t.row, c: t.last });
    const addr = XLSX.utils.encode_cell({ r: t.row, c: t.col });
    ws[addr] = { t: "n", f: `SUM(${first}:${last})` };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SEPS");
  const suffix = periodId ? `_${periodId}` : "";
  XLSX.writeFile(wb, `SEPS_${template.serviceId}${suffix}.xlsx`);
}
