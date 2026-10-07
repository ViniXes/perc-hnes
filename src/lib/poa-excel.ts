// =============================================================================
// Exportación del PAO a Excel: las 6 matrices del archivo "Anexos PAO" de la
// Unidad de Planificación, en el MISMO orden y con el mismo formato, llenas con
// los datos del servicio:
//   1. EVA POA (año anterior)      4. Valoración Riesgo (año del PAO)
//   2. FODA                        5. Actividades de Gestión
//   3. EVA RIESGOS (año anterior)  6. Medidas a adoptar
// Las columnas calculadas (% y F x I) quedan como fórmulas de Excel.
// exceljs se carga solo al exportar.
// =============================================================================
import type { Borders, Cell, Fill, Font, Workbook, Worksheet } from "exceljs";
import {
  normalizePoaDoc,
  poaCategoria,
  poaExposicion,
  poaNum,
  poaSemaforo,
  POA_CATEGORIA_LABEL,
  type PoaDoc,
  type PoaFodaItem,
  type PoaSemaforo,
} from "@/lib/poa-template";

const HOSPITAL = "HOSPITAL NACIONAL EL SALVADOR";
const BLUE_FILL = "FFD9E1F2";
const PREV_RISK_FILL = "FFCCC1DA";
const RISK_HEAD_FILL = "FFCCFFCC";
const CATEGORIA_FILL: Record<string, string> = { bajo: "FF00B050", moderado: "FFFFFF00", alto: "FFC00000" };
const SEMAFORO_FILL: Partial<Record<PoaSemaforo, string>> = {
  verde: "FFC6EFCE",
  amarillo: "FFFFEB9C",
  rojo: "FFFFC7CE",
};

const thin = { style: "thin" as const, color: { argb: "FF000000" } };
const BORDER: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };

const fill = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/** Alto de fila aproximado según el texto más largo y el ancho de su columna. */
function altoFila(textos: { text: string; width: number }[], size = 11): number {
  let lineas = 1;
  for (const { text, width } of textos) {
    const porLinea = Math.max(8, Math.floor(width * (11 / size) * 1.05));
    const n = (text || "")
      .split("\n")
      .reduce((acc, parte) => acc + Math.max(1, Math.ceil(parte.length / porLinea)), 0);
    lineas = Math.max(lineas, n);
  }
  return Math.max(15, lineas * (size * 1.4) + 6);
}

function titulo(ws: Worksheet, rango: string, texto: string, font: Partial<Font> = {}) {
  ws.mergeCells(rango);
  const cell = ws.getCell(rango.split(":")[0]);
  cell.value = texto;
  cell.font = { name: "Calibri", size: 14, bold: true, ...font };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function encabezado(cell: Cell, texto: string, opts: { fill?: string; size?: number } = {}) {
  cell.value = texto;
  cell.font = { name: "Calibri", size: opts.size ?? 10, bold: true };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = BORDER;
  if (opts.fill) cell.fill = fill(opts.fill);
}

function dato(cell: Cell, valor: Cell["value"], opts: { center?: boolean; size?: number; bold?: boolean; fill?: string } = {}) {
  cell.value = valor;
  cell.font = { name: "Calibri", size: opts.size ?? 10, bold: opts.bold };
  cell.alignment = { horizontal: opts.center ? "center" : "left", vertical: "middle", wrapText: true };
  cell.border = BORDER;
  if (opts.fill) cell.fill = fill(opts.fill);
}

function hoja(wb: Workbook, nombre: string): Worksheet {
  return wb.addWorksheet(nombre, {
    pageSetup: {
      orientation: "landscape",
      paperSize: 1 as never,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });
}

/** Número si el texto es numérico (para que las fórmulas funcionen); si no, el texto. */
function numOTexto(valor: string): string | number | null {
  const limpio = (valor ?? "").trim();
  if (!limpio) return null;
  const n = Number(limpio.replace(",", "."));
  return Number.isFinite(n) ? n : limpio;
}

/** % = Real / Prog como fórmula, con el resultado ya calculado. */
function formulaPct(progRef: string, realRef: string, prog: string, real: string): Cell["value"] {
  const p = poaNum(prog);
  const result = p > 0 && (real ?? "").trim() !== "" ? poaNum(real) / p : "";
  return { formula: `IF(N(${progRef})>0,IF(${realRef}="","",${realRef}/${progRef}),"")`, result } as Cell["value"];
}

function fodaRich(items: PoaFodaItem[]) {
  const richText: { text: string; font?: Partial<Font> }[] = [];
  items.forEach((it, i) => {
    if (i > 0) richText.push({ text: "\n\n", font: { name: "Calibri", size: 11 } });
    richText.push({ text: `${it.title}: `, font: { name: "Calibri", size: 11, bold: true } });
    richText.push({ text: it.text, font: { name: "Calibri", size: 11 } });
  });
  return { richText };
}

export async function buildPoaExcel(input: PoaDoc): Promise<Blob> {
  const doc = normalizePoaDoc(input);
  const mod = (await import("exceljs")) as unknown as { default?: { Workbook: new () => Workbook }; Workbook?: new () => Workbook };
  const WorkbookCtor = mod.default?.Workbook ?? mod.Workbook;
  if (!WorkbookCtor) throw new Error("exceljs");
  const wb = new WorkbookCtor();
  wb.creator = "PULSO - Hospital Nacional El Salvador";
  wb.created = new Date();

  const Y = doc.year;
  const dependencia = `DEPENDENCIA: ${doc.serviceName}`;

  // ---------------------------------------------------------------------------
  // 1. EVA POA (año anterior)
  // ---------------------------------------------------------------------------
  {
    const ws = hoja(wb, `EVA POA ${Y - 1}`);
    ws.columns = [{ width: 5 }, { width: 55 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 26 }];
    titulo(ws, "A1:F1", HOSPITAL, { name: "Arial" });
    titulo(ws, "A2:F2", `Evaluación Plan Operativo Anual ${Y - 1}`, { name: "Arial" });
    ws.mergeCells("A4:F4");
    ws.getCell("A4").value = dependencia;
    ws.getCell("A4").font = { name: "Calibri", size: 11, bold: true };
    ["No.", "ACTIVIDAD", "Prog.", "Realiz.", "%", "OBSERVACIONES"].forEach((h, i) =>
      encabezado(ws.getRow(6).getCell(i + 1), h, { fill: BLUE_FILL }),
    );
    let r = 7;
    doc.cumplimiento.rows.forEach((row, i) => {
      const fila = ws.getRow(r);
      dato(fila.getCell(1), i + 1, { center: true });
      dato(fila.getCell(2), row.actividad);
      dato(fila.getCell(3), numOTexto(row.prog), { center: true });
      dato(fila.getCell(4), numOTexto(row.realiz), { center: true });
      dato(fila.getCell(5), formulaPct(`C${r}`, `D${r}`, row.prog, row.realiz), {
        center: true,
        fill: SEMAFORO_FILL[poaSemaforo(row.prog, row.realiz)],
      });
      fila.getCell(5).numFmt = "0%";
      dato(fila.getCell(6), row.obs, { center: true });
      fila.height = altoFila([{ text: row.actividad, width: 55 }, { text: row.obs, width: 26 }], 10);
      r += 1;
    });
    if (doc.cumplimiento.analisis.trim()) {
      r += 1;
      ws.mergeCells(`A${r}:F${r}`);
      const c = ws.getCell(`A${r}`);
      c.value = { richText: [{ text: "Análisis: ", font: { bold: true, name: "Calibri", size: 10 } }, { text: doc.cumplimiento.analisis, font: { name: "Calibri", size: 10 } }] };
      c.alignment = { wrapText: true, vertical: "top", horizontal: "justify" };
      ws.getRow(r).height = altoFila([{ text: doc.cumplimiento.analisis, width: 112 }], 10);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. FODA
  // ---------------------------------------------------------------------------
  {
    const ws = hoja(wb, "FODA");
    ws.columns = [{ width: 62 }, { width: 62 }];
    titulo(ws, "A1:B1", HOSPITAL);
    titulo(ws, "A2:B2", "ANÁLISIS FODA");
    titulo(ws, "A3:B3", `AÑO ${Y}`);
    ws.mergeCells("A5:B5");
    ws.getCell("A5").value = dependencia;
    ws.getCell("A5").font = { name: "Calibri", size: 14, bold: true };
    const par = (fila: number, a: string, b: string, ia: PoaFodaItem[], ib: PoaFodaItem[]) => {
      encabezado(ws.getCell(`A${fila}`), a, { size: 14, fill: BLUE_FILL });
      encabezado(ws.getCell(`B${fila}`), b, { size: 14, fill: BLUE_FILL });
      ws.getRow(fila).height = 22.5;
      const ca = ws.getCell(`A${fila + 1}`);
      const cb = ws.getCell(`B${fila + 1}`);
      for (const [c, items] of [[ca, ia], [cb, ib]] as const) {
        c.value = fodaRich(items);
        c.alignment = { wrapText: true, vertical: "top" };
        c.border = BORDER;
      }
      const texto = (items: PoaFodaItem[]) => items.map((it) => `${it.title}: ${it.text}`).join("\n\n");
      ws.getRow(fila + 1).height = altoFila([{ text: texto(ia), width: 62 }, { text: texto(ib), width: 62 }], 11);
    };
    par(7, "FORTALEZAS", "OPORTUNIDADES", doc.foda.fortalezas, doc.foda.oportunidades);
    par(9, "DEBILIDADES", "AMENAZAS", doc.foda.debilidades, doc.foda.amenazas);
  }

  // ---------------------------------------------------------------------------
  // 3. EVA RIESGOS (año anterior)
  // ---------------------------------------------------------------------------
  {
    const ws = hoja(wb, `EVA RIESGOS ${Y - 1}`);
    ws.columns = [{ width: 42 }, { width: 42 }, { width: 42 }, { width: 22 }];
    titulo(ws, "A1:D1", HOSPITAL, { size: 11 });
    titulo(ws, "A2:D2", "ACTIVIDADES DE CONTROL SOBRE RIESGOS PRIORIZADOS");
    titulo(ws, "A3:D3", `EVALUACIÓN AÑO ${Y - 1}`);
    ws.mergeCells("A5:D5");
    ws.getCell("A5").value = dependencia;
    ws.getCell("A5").font = { name: "Calibri", size: 11, bold: true };
    ["RIESGO INVOLUCRADO", "ACCIONES DE CONTROL", "EJECUCIÓN DE LAS ACCIONES DE CONTROL", "OBSERVACIONES"].forEach((h, i) =>
      encabezado(ws.getRow(7).getCell(i + 1), h, { fill: PREV_RISK_FILL }),
    );
    ws.getRow(7).height = 28;
    let r = 8;
    for (const row of doc.riesgosPrev.rows) {
      const fila = ws.getRow(r);
      dato(fila.getCell(1), row.riesgo);
      dato(fila.getCell(2), row.acciones);
      dato(fila.getCell(3), row.ejecucion);
      dato(fila.getCell(4), row.obs, { center: true });
      fila.height = altoFila(
        [{ text: row.riesgo, width: 42 }, { text: row.acciones, width: 42 }, { text: row.ejecucion, width: 42 }],
        10,
      );
      r += 1;
    }
    const analisis = doc.riesgosPrev.analisis.filter((a) => a.trim()).join("\n\n");
    if (analisis) {
      r += 1;
      ws.mergeCells(`A${r}:D${r}`);
      const c = ws.getCell(`A${r}`);
      c.value = { richText: [{ text: "Análisis: ", font: { bold: true, name: "Calibri", size: 10 } }, { text: analisis, font: { name: "Calibri", size: 10 } }] };
      c.alignment = { wrapText: true, vertical: "top", horizontal: "justify" };
      ws.getRow(r).height = altoFila([{ text: analisis, width: 148 }], 10);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Valoración Riesgo (año del PAO)
  // ---------------------------------------------------------------------------
  {
    const ws = hoja(wb, "Valoración Riesgo");
    ws.columns = [{ width: 22 }, { width: 44 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 40 }, { width: 24 }];
    const gris = { color: { argb: "FF333333" } };
    titulo(ws, "A1:G1", "MINISTERIO DE SALUD", gris);
    titulo(ws, "A2:G2", HOSPITAL, gris);
    titulo(ws, "A3:G3", `MATRIZ DE VALORACIÓN DE RIESGOS AÑO ${Y}`, gris);
    ws.mergeCells("A4:G4");
    ws.getCell("A4").value = dependencia;
    ws.getCell("A4").font = { name: "Calibri", size: 14, bold: true };
    [
      "1. Proceso / Procedimiento",
      "2. Riesgos",
      "3. Probabilidad (F)",
      "4. Magnitud / Impacto (I)",
      "5. Exposición al riesgo (F x I)\nCategoría",
      "6. Acciones para control de riesgos",
      "7. Responsables",
    ].forEach((h, i) => encabezado(ws.getRow(6).getCell(i + 1), h, { fill: RISK_HEAD_FILL }));
    ws.getRow(6).height = 32;
    let r = 7;
    for (const row of doc.matrizRiesgos) {
      const fila = ws.getRow(r);
      const exp = poaExposicion(row);
      const cat = poaCategoria(exp);
      dato(fila.getCell(1), row.proceso, { size: 9 });
      dato(fila.getCell(2), row.riesgo);
      dato(fila.getCell(3), numOTexto(row.probabilidad), { center: true });
      dato(fila.getCell(4), numOTexto(row.impacto), { center: true });
      dato(fila.getCell(5), { formula: `C${r}*D${r}`, result: exp } as Cell["value"], {
        center: true,
        bold: true,
        fill: exp ? CATEGORIA_FILL[cat] : undefined,
      });
      if (exp) {
        fila.getCell(5).font = { name: "Calibri", size: 11, bold: true, color: { argb: cat === "moderado" ? "FF000000" : "FFFFFFFF" } };
        fila.getCell(5).note = `Categoría: ${POA_CATEGORIA_LABEL[cat]}`;
      }
      dato(fila.getCell(6), row.acciones);
      dato(fila.getCell(7), row.responsables);
      fila.height = altoFila(
        [{ text: row.riesgo, width: 44 }, { text: row.acciones, width: 40 }, { text: row.proceso, width: 22 }],
        10,
      );
      r += 1;
    }
    r += 1;
    const leyenda: [string, string][] = [
      ["Probabilidad:", "(Baja=1; Media=2 y Alta=3)"],
      ["Impacto:", "(Leve=1; Moderado=2 y Severo=3)"],
      ["Categoría:", "1 – 3 (no prioritario); 4 – 6 (puede considerarse como prioritario); 7 – 9 (es prioritario, urge intervenir)."],
    ];
    for (const [k, v] of leyenda) {
      ws.getCell(`A${r}`).value = k;
      ws.getCell(`A${r}`).font = { name: "Calibri", size: 10, bold: true };
      ws.mergeCells(`B${r}:G${r}`);
      ws.getCell(`B${r}`).value = v;
      ws.getCell(`B${r}`).font = { name: "Calibri", size: 10 };
      r += 1;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Actividades de Gestión
  // ---------------------------------------------------------------------------
  {
    const ws = hoja(wb, "Actividades de Gestion");
    ws.columns = [
      { width: 44 }, { width: 28 }, { width: 10 }, { width: 18 },
      ...Array.from({ length: 12 }, () => ({ width: 6.5 })),
      { width: 20 },
    ];
    titulo(ws, "A1:Q1", "MINISTERIO DE SALUD");
    titulo(ws, "A2:Q2", HOSPITAL);
    titulo(ws, "A3:Q3", "MATRIZ DE PROGRAMACIÓN DE ACTIVIDADES DE GESTIÓN");
    titulo(ws, "A4:Q4", `PLAN ANUAL OPERATIVO ${Y}`);
    titulo(ws, "A5:Q5", dependencia);
    for (const [rango, texto] of [
      ["A7:A8", "Objetivos / actividades"],
      ["B7:B8", "Indicadores"],
      ["C7:C8", "Meta Anual"],
      ["D7:D8", "Responsable"],
      ["E7:G7", "Trimestre 1"],
      ["H7:J7", "Trimestre 2"],
      ["K7:M7", "Trimestre 3"],
      ["N7:P7", "Trimestre 4"],
      ["Q7:Q8", "Supuestos Externos"],
    ] as const) {
      ws.mergeCells(rango);
      encabezado(ws.getCell(rango.split(":")[0]), texto, { fill: BLUE_FILL });
    }
    for (let i = 0; i < 4; i += 1) {
      ["Prog", "Real", "%"].forEach((h, k) => encabezado(ws.getRow(8).getCell(5 + i * 3 + k), h, { fill: BLUE_FILL, size: 9 }));
    }
    // Bordes de las celdas combinadas del encabezado.
    for (const fila of [7, 8]) for (let c = 1; c <= 17; c += 1) ws.getRow(fila).getCell(c).border = BORDER;
    const col = (n: number) => ws.getColumn(n).letter;
    let r = 9;
    for (const group of doc.actividades) {
      ws.mergeCells(`A${r}:Q${r}`);
      const c = ws.getCell(`A${r}`);
      c.value = `Objetivo: ${group.objetivo}`;
      c.font = { name: "Calibri", size: 11, bold: true };
      c.alignment = { wrapText: true, vertical: "middle" };
      c.fill = fill(BLUE_FILL);
      c.border = BORDER;
      ws.getRow(r).height = altoFila([{ text: `Objetivo: ${group.objetivo}`, width: 160 }], 11);
      r += 1;
      for (const row of group.rows) {
        const fila = ws.getRow(r);
        dato(fila.getCell(1), row.actividad);
        dato(fila.getCell(2), row.indicador);
        dato(fila.getCell(3), numOTexto(row.meta), { center: true });
        dato(fila.getCell(4), row.responsable, { size: 9 });
        row.trimestres.forEach((tri, i) => {
          const cp = 5 + i * 3;
          dato(fila.getCell(cp), numOTexto(tri.prog), { center: true });
          dato(fila.getCell(cp + 1), numOTexto(tri.real), { center: true });
          dato(fila.getCell(cp + 2), formulaPct(`${col(cp)}${r}`, `${col(cp + 1)}${r}`, tri.prog, tri.real), {
            center: true,
            size: 9,
            fill: SEMAFORO_FILL[poaSemaforo(tri.prog, tri.real)],
          });
          fila.getCell(cp + 2).numFmt = "0%";
        });
        dato(fila.getCell(17), row.supuestos, { size: 9 });
        fila.height = altoFila(
          [{ text: row.actividad, width: 44 }, { text: row.indicador, width: 28 }, { text: row.responsable, width: 18 }],
          10,
        );
        r += 1;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Medidas a adoptar
  // ---------------------------------------------------------------------------
  {
    const ws = hoja(wb, "Medidas a adoptar");
    ws.columns = [{ width: 1.5 }, { width: 8 }, { width: 34 }, { width: 34 }, { width: 38 }, { width: 16 }, { width: 18 }];
    const negro = { color: { argb: "FF000000" } };
    titulo(ws, "B2:G2", "MINISTERIO DE SALUD", negro);
    titulo(ws, "B3:G3", "Plan Anual Operativo", negro);
    titulo(ws, "B4:G4", `Año ${Y}`, negro);
    titulo(ws, "B5:G5", "Medidas a adoptar", negro);
    const medidas = (doc.medidas ?? []).filter((m) => m.resultado.trim() || m.medida.trim() || m.factor.trim());
    const trimestres = Array.from(new Set(medidas.map((m) => m.trimestre).filter(Boolean))).sort();
    ws.mergeCells("B7:C7");
    ws.getCell("B7").value = "Hospital: Nacional El Salvador";
    ws.mergeCells("D7:G7");
    ws.getCell("D7").value = `Dependencia: ${doc.serviceName}`;
    ws.mergeCells("B8:C8");
    ws.getCell("B8").value = `Período evaluado: ${trimestres.length ? `Trimestre ${trimestres.join(", ")} de ${Y}` : Y}`;
    for (const ref of ["B7", "D7", "B8"]) ws.getCell(ref).font = { name: "Calibri", size: 12, bold: true };
    ws.mergeCells("B10:C10");
    encabezado(ws.getCell("B10"), "Resultado esperado\n(según formulario Programación anual y Seguimiento)", { fill: BLUE_FILL, size: 11 });
    encabezado(ws.getCell("D10"), "Factor o situación que impidió la realización de la meta", { fill: BLUE_FILL, size: 11 });
    encabezado(ws.getCell("E10"), "Medidas a adoptar", { fill: BLUE_FILL, size: 11 });
    encabezado(ws.getCell("F10"), "Antes de\n(qué fecha)", { fill: BLUE_FILL, size: 11 });
    encabezado(ws.getCell("G10"), "Responsable", { fill: BLUE_FILL, size: 11 });
    ws.getCell("C10").border = BORDER;
    ws.getRow(10).height = 48;
    let r = 11;
    const filas = medidas.length ? medidas : [{ trimestre: "", resultado: "", factor: "", medida: "", fecha: "", responsable: "" }];
    for (const m of filas) {
      ws.mergeCells(`B${r}:C${r}`);
      const resultado = m.trimestre ? `T${m.trimestre} · ${m.resultado}` : m.resultado;
      dato(ws.getCell(`B${r}`), resultado);
      ws.getCell(`C${r}`).border = BORDER;
      dato(ws.getCell(`D${r}`), m.factor);
      dato(ws.getCell(`E${r}`), m.medida);
      dato(ws.getCell(`F${r}`), m.fecha, { center: true });
      dato(ws.getCell(`G${r}`), m.responsable);
      ws.getRow(r).height = Math.max(
        45,
        altoFila([{ text: resultado, width: 42 }, { text: m.factor, width: 34 }, { text: m.medida, width: 38 }], 10),
      );
      r += 1;
    }
    r += 3;
    ws.mergeCells(`B${r}:C${r}`);
    ws.getCell(`B${r}`).value = "Firma (Responsable de la Dependencia)";
    ws.mergeCells(`F${r}:G${r}`);
    ws.getCell(`F${r}`).value = "Fecha de elaboración";
    for (const ref of [`B${r}`, `F${r}`]) {
      ws.getCell(ref).font = { name: "Calibri", size: 11, bold: true };
      ws.getCell(ref).border = { top: thin };
      ws.getCell(ref).alignment = { horizontal: "center" };
    }
    ws.getCell(`C${r}`).border = { top: thin };
    ws.getCell(`G${r}`).border = { top: thin };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function downloadPoaExcel(doc: PoaDoc): Promise<void> {
  const blob = await buildPoaExcel(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Anexos PAO ${doc.year} - ${doc.serviceName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
