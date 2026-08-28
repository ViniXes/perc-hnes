// =============================================================================
// Exportación del POA a Word (.docx).
// -----------------------------------------------------------------------------
// Arma el documento con el MISMO orden y estructura que el POA impreso: portada,
// introducción, descripción general, diagnóstico situacional (recursos, FODA,
// producción con gráficos), cumplimiento del PAO anterior, valoración de riesgos
// y la programación anual de actividades.
//
// El documento tiene DOS secciones: la primera vertical (texto y tablas angostas)
// y la segunda horizontal, porque la matriz de riesgos y el cuadro de programación
// no caben en vertical.
//
// La librería `docx` se carga de forma dinámica (solo al exportar) para no pesar
// en la carga inicial de la app.
// =============================================================================
import {
  poaPercent,
  poaExposicion,
  poaCategoria,
  POA_CATEGORIA_FILL,
  type PoaDoc,
  type PoaFodaItem,
} from "@/lib/poa-template";

/** Imágenes del documento: clave -> dataURL (data:image/...;base64,....). */
export type PoaMedia = Record<string, string>;

const FONT = "Arial";
const HEAD_FILL = "D9E2F3";
const GROUP_FILL = "DEEAF6";

/** dataURL -> bytes, para incrustar la imagen en el Word. */
function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; type: "png" | "jpg" } | null {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, type: match[1].toLowerCase().startsWith("p") ? "png" : "jpg" };
  } catch {
    return null;
  }
}

/** Alto proporcional de una imagen, con ancho fijo. */
async function measureImage(dataUrl: string, targetWidth: number): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalHeight / (img.naturalWidth || 1);
      resolve({ w: targetWidth, h: Math.round(targetWidth * (ratio || 0.5)) });
    };
    img.onerror = () => resolve({ w: targetWidth, h: Math.round(targetWidth * 0.5) });
    img.src = dataUrl;
  });
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export async function downloadPoaDocx(doc: PoaDoc, media: PoaMedia = {}): Promise<void> {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, AlignmentType, BorderStyle, VerticalAlign, PageOrientation, ImageRun,
  } = await import("docx");

  // --- Helpers de construcción ---------------------------------------------
  const P = (text: string, opts: { bold?: boolean; size?: number; align?: "left" | "center" | "justify"; after?: number; color?: string } = {}) =>
    new Paragraph({
      alignment:
        opts.align === "center"
          ? AlignmentType.CENTER
          : opts.align === "justify"
            ? AlignmentType.JUSTIFIED
            : AlignmentType.LEFT,
      spacing: { after: opts.after ?? 120, line: 276 },
      children: [
        new TextRun({
          text,
          bold: opts.bold,
          size: opts.size ?? 22,
          font: FONT,
          color: opts.color,
        }),
      ],
    });

  const H1 = (text: string) =>
    new Paragraph({
      spacing: { before: 320, after: 160 },
      children: [new TextRun({ text, bold: true, size: 28, font: FONT, color: "1F3864" })],
    });

  const H2 = (text: string) =>
    new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text, bold: true, size: 24, font: FONT, color: "2E5496" })],
    });

  /** Párrafo con viñeta: "Título: texto". */
  const bullet = (item: PoaFodaItem) =>
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 120, line: 276 },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({ text: `${item.title}: `, bold: true, size: 22, font: FONT }),
        new TextRun({ text: item.text, size: 22, font: FONT }),
      ],
    });

  const cellPar = (text: string, opts: { bold?: boolean; align?: "left" | "center"; size?: number } = {}) =>
    (text || "").split("\n").map((line, index, arr) =>
      new Paragraph({
        alignment: opts.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: index === arr.length - 1 ? 0 : 40, line: 240 },
        children: [new TextRun({ text: line, bold: opts.bold, size: opts.size ?? 18, font: FONT })],
      }),
    );

  const cell = (
    text: string,
    opts: { bold?: boolean; align?: "left" | "center"; fill?: string; width?: number; span?: number; size?: number; color?: string } = {},
  ) =>
    new TableCell({
      width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
      columnSpan: opts.span,
      shading: opts.fill ? { fill: opts.fill } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: opts.color
        ? (text || "").split("\n").map((line) =>
            new Paragraph({
              alignment: opts.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
              children: [new TextRun({ text: line, bold: opts.bold, size: opts.size ?? 18, font: FONT, color: opts.color })],
            }),
          )
        : cellPar(text, opts),
    });

  const table = (rows: InstanceType<typeof TableRow>[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
      },
      rows,
    });

  // --- 1. Portada -----------------------------------------------------------
  const now = new Date();
  const portada: object[] = [
    P(doc.cover.hospital, { bold: true, size: 32, align: "center", after: 600 }),
    P(`${doc.cover.title} ${doc.year}`, { bold: true, size: 44, align: "center", after: 400 }),
    P(doc.cover.service, { bold: true, size: 28, align: "center", after: 1200 }),
    P(`${doc.cover.place} ${MESES[now.getMonth()]} ${now.getFullYear()}`, { align: "center", size: 24 }),
  ];

  // --- 2. Introducción ------------------------------------------------------
  const intro: object[] = [H1("INTRODUCCIÓN"), ...doc.intro.map((t) => P(t, { align: "justify" }))];

  // --- 3. Descripción general ----------------------------------------------
  const descripcion: object[] = [
    H1("DESCRIPCIÓN GENERAL DEL SERVICIO"),
    H2("Dependencia Jerárquica"),
    P(doc.dependencia),
    H2("Objetivos"),
    P("Objetivo General:", { bold: true, after: 60 }),
    P(doc.objetivoGeneral, { align: "justify" }),
    P("Objetivos Específicos:", { bold: true, after: 60 }),
    ...doc.objetivosEspecificos.map((t, i) => P(`${i + 1}. ${t}`, { align: "justify" })),
    H2(`FUNCIONES DEL ${doc.serviceName.toUpperCase()}`),
    ...doc.funciones.map(bullet),
  ];

  // --- 4. Diagnóstico situacional ------------------------------------------
  const recursosTable = table([
    new TableRow({
      children: [
        cell("Recurso Humano", { bold: true, fill: HEAD_FILL, align: "center", width: 70 }),
        cell("Cantidad", { bold: true, fill: HEAD_FILL, align: "center", width: 30 }),
      ],
    }),
    ...doc.recursos.map((r) =>
      new TableRow({ children: [cell(r.label), cell(r.cantidad, { align: "center" })] }),
    ),
  ]);

  const fodaCol = (items: PoaFodaItem[]) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: items.length
        ? items.map((it) =>
            new Paragraph({
              spacing: { after: 100, line: 240 },
              alignment: AlignmentType.JUSTIFIED,
              children: [
                new TextRun({ text: `${it.title}: `, bold: true, size: 18, font: FONT }),
                new TextRun({ text: it.text, size: 18, font: FONT }),
              ],
            }),
          )
        : [new Paragraph({ children: [new TextRun({ text: "", size: 18, font: FONT })] })],
    });

  const fodaTable = table([
    new TableRow({
      children: [
        cell("Fortalezas", { bold: true, fill: HEAD_FILL, align: "center", width: 50 }),
        cell("Oportunidades", { bold: true, fill: HEAD_FILL, align: "center", width: 50 }),
      ],
    }),
    new TableRow({ children: [fodaCol(doc.foda.fortalezas), fodaCol(doc.foda.oportunidades)] }),
    new TableRow({
      children: [
        cell("Debilidades", { bold: true, fill: HEAD_FILL, align: "center" }),
        cell("Amenazas", { bold: true, fill: HEAD_FILL, align: "center" }),
      ],
    }),
    new TableRow({ children: [fodaCol(doc.foda.debilidades), fodaCol(doc.foda.amenazas)] }),
  ]);

  // Bloques de producción, con el gráfico incrustado cuando se subió.
  const produccion: object[] = [
    H2(`Producción General Resumida del año ${doc.year - 1}`),
    P(doc.produccion.intro, { align: "justify" }),
  ];
  for (let i = 0; i < doc.produccion.bloques.length; i += 1) {
    const bloque = doc.produccion.bloques[i];
    produccion.push(P(`${i + 1}. ${bloque.title} ${doc.year - 1}`, { bold: true, after: 80 }));
    const dataUrl = bloque.imageKey ? media[bloque.imageKey] : undefined;
    if (dataUrl) {
      const parsed = dataUrlToBytes(dataUrl);
      if (parsed) {
        const size = await measureImage(dataUrl, 560);
        produccion.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new ImageRun({
                type: parsed.type,
                data: parsed.bytes,
                transformation: { width: size.w, height: size.h },
              }),
            ],
          }),
        );
      }
    }
    produccion.push(P(bloque.text, { align: "justify" }));
  }
  produccion.push(P(doc.produccion.cierre, { align: "justify" }));

  // Cumplimiento del PAO del año anterior.
  const cumplimientoTable = table([
    new TableRow({
      children: [
        cell("No.", { bold: true, fill: HEAD_FILL, align: "center", width: 6 }),
        cell("ACTIVIDAD", { bold: true, fill: HEAD_FILL, align: "center", width: 40 }),
        cell("Prog.", { bold: true, fill: HEAD_FILL, align: "center", width: 10 }),
        cell("Realiz.", { bold: true, fill: HEAD_FILL, align: "center", width: 10 }),
        cell("%", { bold: true, fill: HEAD_FILL, align: "center", width: 10 }),
        cell("OBSERVACIONES", { bold: true, fill: HEAD_FILL, align: "center", width: 24 }),
      ],
    }),
    ...doc.cumplimiento.rows.map((r, i) =>
      new TableRow({
        children: [
          cell(String(i + 1), { align: "center" }),
          cell(r.actividad),
          cell(r.prog, { align: "center" }),
          cell(r.realiz, { align: "center" }),
          cell(poaPercent(r.prog, r.realiz), { align: "center" }),
          cell(r.obs, { align: "center" }),
        ],
      }),
    ),
  ]);

  const diagnostico: object[] = [
    H1("DIAGNÓSTICO SITUACIONAL DEL SERVICIO"),
    H2(`Descripción de los recursos con que cuenta el ${doc.serviceName}`),
    recursosTable,
    P("", { after: 0 }),
    H2("Análisis FODA"),
    fodaTable,
    P("", { after: 0 }),
    ...produccion,
    H2(`Cuadro de cumplimiento de actividades de PAO ${doc.year - 1}`),
    cumplimientoTable,
    P("", { after: 0 }),
    P(`Análisis: ${doc.cumplimiento.analisis}`, { align: "justify" }),
  ];

  // --- 5. Valoración de riesgos (año anterior) ------------------------------
  const riesgosPrevTable = table([
    new TableRow({
      children: [
        cell("RIESGO INVOLUCRADO", { bold: true, fill: HEAD_FILL, align: "center", width: 27 }),
        cell("ACCIONES DE CONTROL", { bold: true, fill: HEAD_FILL, align: "center", width: 27 }),
        cell("EJECUCIÓN DE LAS ACCIONES DE CONTROL", { bold: true, fill: HEAD_FILL, align: "center", width: 30 }),
        cell("OBSERVACIONES", { bold: true, fill: HEAD_FILL, align: "center", width: 16 }),
      ],
    }),
    ...doc.riesgosPrev.rows.map((r) =>
      new TableRow({
        children: [cell(r.riesgo), cell(r.acciones), cell(r.ejecucion), cell(r.obs, { align: "center" })],
      }),
    ),
  ]);

  const riesgos: object[] = [
    H1("VALORACIÓN DE RIESGOS"),
    H2(`Valoración de riesgos del año ${doc.year - 1}`),
    riesgosPrevTable,
    P("", { after: 0 }),
    ...doc.riesgosPrev.analisis.map((t, i) => P(i === 0 ? `Análisis: ${t}` : t, { align: "justify" })),
  ];

  // --- 6. Secciones horizontales: matriz de riesgos y programación ----------
  const matrizTable = table([
    new TableRow({
      children: [
        cell("1. Proceso / Procedimiento", { bold: true, fill: "C6E0B4", align: "center", width: 12 }),
        cell("2. Riesgos", { bold: true, fill: "C6E0B4", align: "center", width: 26 }),
        cell("3. Probabilidad (F)", { bold: true, fill: "C6E0B4", align: "center", width: 7 }),
        cell("4. Magnitud / Impacto (I)", { bold: true, fill: "C6E0B4", align: "center", width: 7 }),
        cell("5. Exposición al riesgo (F x I) Categoría", { bold: true, fill: "C6E0B4", align: "center", width: 9 }),
        cell("6. Acciones para control de riesgos", { bold: true, fill: "C6E0B4", align: "center", width: 22 }),
        cell("7. Responsables", { bold: true, fill: "C6E0B4", align: "center", width: 17 }),
      ],
    }),
    ...doc.matrizRiesgos.map((r) => {
      const exp = poaExposicion(r);
      const cat = poaCategoria(exp);
      return new TableRow({
        children: [
          cell(r.proceso),
          cell(r.riesgo),
          cell(r.probabilidad, { align: "center" }),
          cell(r.impacto, { align: "center" }),
          cell(String(exp), {
            align: "center",
            bold: true,
            fill: POA_CATEGORIA_FILL[cat],
            color: cat === "moderado" ? "000000" : "FFFFFF",
          }),
          cell(r.acciones),
          cell(r.responsables),
        ],
      });
    }),
  ]);

  // Cuadro de programación anual (encabezado de 2 filas con los trimestres).
  const progHeader1 = new TableRow({
    children: [
      cell("Objetivos / actividades", { bold: true, fill: HEAD_FILL, align: "center", width: 20 }),
      cell("Indicadores", { bold: true, fill: HEAD_FILL, align: "center", width: 18 }),
      cell("Meta Anual", { bold: true, fill: HEAD_FILL, align: "center", width: 6 }),
      cell("Responsable", { bold: true, fill: HEAD_FILL, align: "center", width: 12 }),
      cell("Trimestre 1", { bold: true, fill: HEAD_FILL, align: "center", span: 3, width: 9 }),
      cell("Trimestre 2", { bold: true, fill: HEAD_FILL, align: "center", span: 3, width: 9 }),
      cell("Trimestre 3", { bold: true, fill: HEAD_FILL, align: "center", span: 3, width: 9 }),
      cell("Trimestre 4", { bold: true, fill: HEAD_FILL, align: "center", span: 3, width: 9 }),
      cell("Supuestos Externos", { bold: true, fill: HEAD_FILL, align: "center", width: 8 }),
    ],
  });
  const progHeader2 = new TableRow({
    children: [
      cell("", { fill: HEAD_FILL }),
      cell("", { fill: HEAD_FILL }),
      cell("", { fill: HEAD_FILL }),
      cell("", { fill: HEAD_FILL }),
      ...[0, 1, 2, 3].flatMap(() => [
        cell("Prog", { bold: true, fill: HEAD_FILL, align: "center", size: 16 }),
        cell("Real", { bold: true, fill: HEAD_FILL, align: "center", size: 16 }),
        cell("%", { bold: true, fill: HEAD_FILL, align: "center", size: 16 }),
      ]),
      cell("", { fill: HEAD_FILL }),
    ],
  });

  const progRows: InstanceType<typeof TableRow>[] = [progHeader1, progHeader2];
  for (const group of doc.actividades) {
    progRows.push(
      new TableRow({
        children: [cell(`Objetivo: ${group.objetivo}`, { bold: true, fill: GROUP_FILL, span: 17 })],
      }),
    );
    for (const row of group.rows) {
      progRows.push(
        new TableRow({
          children: [
            cell(row.actividad),
            cell(row.indicador),
            cell(row.meta, { align: "center" }),
            cell(row.responsable),
            ...row.trimestres.flatMap((t) => [
              cell(t.prog, { align: "center", size: 16 }),
              cell(t.real, { align: "center", size: 16 }),
              cell(poaPercent(t.prog, t.real), { align: "center", size: 16 }),
            ]),
            cell(row.supuestos),
          ],
        }),
      );
    }
  }

  const horizontal: object[] = [
    H1(`Matriz de valoración de riesgos ${doc.year}`),
    matrizTable,
    P("", { after: 0 }),
    H1("PROGRAMACIÓN DE ACTIVIDADES DE GESTIÓN"),
    table(progRows),
  ];

  // --- Documento ------------------------------------------------------------
  const wordDoc = new Document({
    creator: "PULSO — Hospital Nacional El Salvador",
    title: `Plan Anual Operativo ${doc.year}`,
    description: doc.serviceName,
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: [...portada, ...intro, ...descripcion, ...diagnostico, ...riesgos] as never[],
      },
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 850, bottom: 850, left: 850, right: 850 },
          },
        },
        children: horizontal as never[],
      },
    ],
  });

  const blob = await Packer.toBlob(wordDoc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Plan Anual Operativo ${doc.year} - ${doc.serviceName}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
