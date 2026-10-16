// =============================================================================
// Exportación del POA a Word (.docx).
// -----------------------------------------------------------------------------
// Arma el documento con la estructura del formato oficial PAO 2027 (igual que el
// PDF): Portada · Aprobaciones · Índice · I. Introducción · II. Descripción
// general · III. Diagnóstico situacional · IV. Valoración de riesgos ·
// V. Programación de actividades de gestión · VI. Seguimiento.
// Desde Aprobaciones, cada página lleva el membrete de identificación (ISO 37001)
// con el código, la versión y "Página X de Y".
//
// Secciones: portada (sin membrete), cuerpo vertical, y una hoja horizontal para
// la matriz de riesgos, la programación y el seguimiento, que no caben en vertical.
//
// La librería `docx` se carga de forma dinámica (solo al exportar) para no pesar
// en la carga inicial de la app.
// =============================================================================
import {
  normalizePoaDoc,
  poaEsDivision,
  poaPercent,
  poaExposicion,
  poaCategoria,
  POA_CATEGORIA_FILL,
  POA_CATEGORIA_LABEL,
  type PoaDoc,
  type PoaFodaItem,
} from "@/lib/poa-template";
import { poaImagenBloque } from "@/lib/poa-chart";

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

/** Imagen de /public como bytes (o null si no se pudo leer). */
async function fetchImage(url: string): Promise<{ bytes: Uint8Array; type: "png" | "jpg"; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const parsed = dataUrlToBytes(dataUrl);
    if (!parsed) return null;
    const size = await measureImage(dataUrl, 1000);
    return { ...parsed, w: size.w, h: size.h };
  } catch {
    return null;
  }
}

export async function downloadPoaDocx(input: PoaDoc, media: PoaMedia = {}): Promise<void> {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, PageNumber,
    WidthType, AlignmentType, BorderStyle, VerticalAlign, PageOrientation, ImageRun, PageBreak, HeightRule,
  } = await import("docx");
  const doc = normalizePoaDoc(input);
  const [logoHnes, foto] = await Promise.all([fetchImage("/poa/hnes.png"), fetchImage("/poa/hospital.jpg")]);

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

  /** Tabla a todo el ancho; `columnWidths` (twips) fija los anchos en tablas de muchas columnas. */
  const table = (rows: InstanceType<typeof TableRow>[], columnWidths?: number[]) =>
    new Table({
      width: columnWidths
        ? { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA }
        : { size: 100, type: WidthType.PERCENTAGE },
      columnWidths,
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

  const imagen = (img: { bytes: Uint8Array; type: "png" | "jpg"; w: number; h: number }, width: number) =>
    new ImageRun({ type: img.type, data: img.bytes, transformation: { width, height: Math.round((width * img.h) / (img.w || 1)) } });
  const salto = () => new Paragraph({ children: [new PageBreak()] });
  const servicio = doc.cover.service || doc.serviceName;

  // --- Portada --------------------------------------------------------------
  const now = new Date();
  const portada: object[] = [
    ...(logoHnes ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [imagen(logoHnes, 300)] })] : []),
    P(`${doc.cover.title} ${doc.year}`, { bold: true, size: 44, align: "center", after: 300 }),
    P(servicio, { bold: true, size: 30, align: "center", after: 600 }),
    ...(foto ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [imagen(foto, 480)] })] : []),
    P(`${doc.cover.place}, ${MESES[now.getMonth()]} de ${now.getFullYear()}.`, { align: "center", size: 24 }),
  ];

  // --- Aprobaciones -----------------------------------------------------------
  const aprobaciones = (doc.aprobaciones ?? []).filter((a) => a.funcion.trim() || a.nombre.trim() || a.cargo.trim());
  const aprobRows: InstanceType<typeof TableRow>[] = [
    new TableRow({ children: [cell("Aprobaciones", { bold: true, fill: HEAD_FILL, align: "center", span: 4, size: 22 })] }),
    new TableRow({
      children: ["Función", "Nombre", "Cargo", "Firma"].map((h, i) =>
        cell(h, { bold: true, fill: HEAD_FILL, align: "center", width: [18, 32, 32, 18][i] }),
      ),
    }),
  ];
  aprobaciones.forEach((a, i) => {
    // La función se escribe solo en la primera fila de cada grupo.
    const nuevaFuncion = i === 0 || aprobaciones[i - 1].funcion !== a.funcion;
    aprobRows.push(
      new TableRow({
        height: { value: 620, rule: HeightRule.ATLEAST },
        children: [cell(nuevaFuncion ? a.funcion : "", { bold: true }), cell(a.nombre), cell(a.cargo), cell("")],
      }),
    );
  });
  const aprobacionesPag: object[] = [table(aprobRows), salto()];

  // --- Índice -----------------------------------------------------------------
  const secciones = [
    "I. Introducción",
    poaEsDivision(doc.serviceId) ? "II. Descripción general de la unidad" : "II. Descripción general del servicio",
    "III. Diagnóstico situacional",
    "IV. Valoración de riesgos",
    "V. Programación de actividades de gestión",
    "VI. Seguimiento",
  ];
  const indicePag: object[] = [
    P("Índice", { bold: true, size: 28, align: "center", after: 240 }),
    table(["Aprobaciones", "Índice", ...secciones].map((t) => new TableRow({ children: [cell(t, { size: 20 })] }))),
    salto(),
  ];

  // --- I. Introducción ------------------------------------------------------
  const intro: object[] = [H1(secciones[0]), ...doc.intro.map((t) => P(t, { align: "justify" }))];

  // --- II. Descripción general ------------------------------------------------
  const descripcion: object[] = [
    H1(secciones[1]),
    ...(doc.mision !== undefined
      ? [H2("Misión"), P(doc.mision || ""), H2("Visión"), P(doc.vision || "")]
      : []),
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
    H2(`c) Producción general resumida del año ${doc.year - 1}`),
    P(doc.produccion.intro, { align: "justify" }),
  ];
  for (let i = 0; i < doc.produccion.bloques.length; i += 1) {
    const bloque = doc.produccion.bloques[i];
    produccion.push(P(`${i + 1}. ${bloque.title} ${doc.year - 1}`, { bold: true, after: 80 }));
    const dataUrl = poaImagenBloque(bloque, media, doc.year - 1);
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
    H1(secciones[2]),
    H2(`a) Descripción de los recursos con que cuenta el ${doc.serviceName}`),
    ...((doc.recursosDescripcion ?? "").trim()
      ? [
          table([
            new TableRow({ children: [cell("Descripción del recurso humano", { bold: true, fill: HEAD_FILL, align: "center", width: 100 })] }),
            new TableRow({ children: [cell(doc.recursosDescripcion ?? "", { width: 100 })] }),
          ]),
          P("", { after: 0 }),
        ]
      : []),
    recursosTable,
    P("", { after: 0 }),
    H2("b) Análisis FODA"),
    fodaTable,
    P("", { after: 0 }),
    ...produccion,
    H2(`d) Cumplimiento de actividades del PAO ${doc.year - 1}`),
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
    H1(secciones[3]),
    H2(`a) Cumplimiento de las actividades de control de la matriz de riesgos ${doc.year - 1}`),
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
          cell(exp ? `${exp}\n${POA_CATEGORIA_LABEL[cat]}` : "", {
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
  ], [1700, 3400, 900, 900, 1100, 3300, 2840]);

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

  // --- VI. Seguimiento + Medidas a adoptar ----------------------------------
  const medidas = (doc.medidas ?? []).filter((m) => m.resultado.trim() || m.medida.trim() || m.factor.trim());
  const medidasHead = [
    "Trimestre",
    "Resultado esperado (según la programación anual)",
    "Factor o situación que impidió la realización de la meta",
    "Medidas a adoptar",
    "Antes de (qué fecha)",
    "Responsable",
  ];
  const medidasTable = table([
    new TableRow({ children: medidasHead.map((h, i) => cell(h, { bold: true, fill: HEAD_FILL, align: "center", width: [8, 22, 22, 22, 10, 16][i] })) }),
    ...(medidas.length
      ? medidas.map((m) =>
          new TableRow({
            children: [
              cell(m.trimestre ? `T${m.trimestre}` : "", { align: "center" }),
              cell(m.resultado),
              cell(m.factor),
              cell(m.medida),
              cell(m.fecha, { align: "center" }),
              cell(m.responsable),
            ],
          }),
        )
      : [new TableRow({ children: [cell("Sin medidas registradas: todas las metas evaluadas se cumplieron.", { align: "center", span: 6 })] })]),
  ]);

  const horizontal: object[] = [
    H2(`b) Matriz de valoración de riesgos ${doc.year}`),
    matrizTable,
    P(
      "Probabilidad: Baja = 1, Media = 2, Alta = 3. Impacto: Leve = 1, Moderado = 2, Severo = 3. Categoría: 1 - 3 no prioritario; 4 - 6 puede considerarse prioritario; 7 - 9 es prioritario, urge intervenir.",
      { size: 16, after: 0 },
    ),
    salto(),
    H1(secciones[4]),
    // Ancho útil horizontal: 14140 twips (17 columnas).
    table(progRows, [2500, 1800, 700, 1300, ...Array(12).fill(430), 2680]),
    salto(),
    H1(secciones[5]),
    P(doc.seguimiento ?? "", { align: "justify" }),
    H2("Medidas a adoptar"),
    medidasTable,
  ];

  // --- Membrete ISO 37001 (desde Aprobaciones) --------------------------------
  const membrete = doc.membrete ?? { proceso: "", codigo: "", version: "Versión 01" };
  const hCell = (children: object[], opts: { width?: number; rowSpan?: number } = {}) =>
    new TableCell({
      width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
      rowSpan: opts.rowSpan,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 30, bottom: 30, left: 60, right: 60 },
      children: children as never[],
    });
  const hText = (text: string, bold = false) =>
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold, size: 16, font: FONT })] });
  const membreteHeader = () =>
    new Header({
      children: [
        table([
          new TableRow({
            children: [
              hCell(logoHnes ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [imagen(logoHnes, 110)] })] : [hText("")], { width: 22, rowSpan: 3 }),
              hCell([hText(membrete.proceso)], { width: 53 }),
              hCell([hText(membrete.codigo)], { width: 25 }),
            ],
          }),
          new TableRow({ children: [hCell([hText(`Plan Anual Operativo del ${servicio}`)]), hCell([hText(membrete.version || "Versión 01")])] }),
          new TableRow({
            children: [
              hCell([hText(String(doc.year))]),
              hCell([
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], bold: true, size: 16, font: FONT }),
                  ],
                }),
              ]),
            ],
          }),
        ]),
        new Paragraph({ children: [] }),
      ],
    });

  // --- Documento ------------------------------------------------------------
  const wordDoc = new Document({
    creator: "PULSO — Hospital Nacional El Salvador",
    title: `Plan Anual Operativo ${doc.year}`,
    description: doc.serviceName,
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: portada as never[],
      },
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134, header: 400 } } },
        headers: { default: membreteHeader() },
        children: [...aprobacionesPag, ...indicePag, ...intro, ...descripcion, ...diagnostico, ...riesgos] as never[],
      },
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 1134, bottom: 850, left: 850, right: 850, header: 400 },
          },
        },
        headers: { default: membreteHeader() },
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
