/**
 * COMITÉ DE EXPEDIENTE CLÍNICO - consolidado del mes.
 * ---------------------------------------------------------------------------
 * Arma, con las listas guardadas de un mes, dos salidas:
 *   - Excel: una sola hoja, todo hacia abajo, un bloque por servicio.
 *   - PDF:   un reporte para imprimir / "Guardar como PDF" desde el navegador,
 *            con portada, resumen por servicio y cada servicio en su pagina.
 * No escribe nada en Firestore: solo lee lo que la pantalla ya trajo.
 */
import type { CecBloque, CecTemplate } from "@/lib/cec-templates";

export type CecDatos = {
  expedientes: Record<string, string[]>;
  fechas: Record<string, string[]>;
  valores: Record<string, Record<string, string[]>>;
  acciones: Record<string, Record<string, string>>;
  responsables: Record<string, Record<string, string>>;
  unificados?: Record<string, boolean>;
};

export type CecEntrada = {
  plantilla: CecTemplate;
  /** null = el servicio no ha guardado su lista este mes. */
  datos: CecDatos | null;
  autor?: string;
  divisionLabel?: string;
};

const columnasDe = (b: CecBloque) => (b.tipo === "expedientes" ? b.columnas : 1);

function valorCelda(d: CecDatos | null, b: CecBloque, fila: string, col: number): string {
  return d?.valores?.[b.id]?.[fila]?.[col] ?? "";
}

function pct(celdas: string[]): number | null {
  let aplican = 0;
  let cumple = 0;
  for (const c of celdas) {
    if (c === "1") { aplican += 1; cumple += 1; }
    else if (c === "0") aplican += 1;
  }
  return aplican ? Math.round((cumple / aplican) * 100) : null;
}

export function cecPctFila(d: CecDatos | null, b: CecBloque, fila: string) {
  return pct(Array.from({ length: columnasDe(b) }, (_, i) => valorCelda(d, b, fila, i)));
}
export function cecPctColumna(d: CecDatos | null, b: CecBloque, col: number) {
  return pct(b.filas.map((f) => valorCelda(d, b, f.key, col)));
}
export function cecPctBloqueDe(d: CecDatos | null, b: CecBloque) {
  const todas: string[] = [];
  for (const f of b.filas) for (let i = 0; i < columnasDe(b); i += 1) todas.push(valorCelda(d, b, f.key, i));
  return pct(todas);
}
export function cecPctServicio(e: CecEntrada) {
  const todas: string[] = [];
  for (const b of e.plantilla.bloques)
    for (const f of b.filas)
      for (let i = 0; i < columnasDe(b); i += 1) todas.push(valorCelda(e.datos, b, f.key, i));
  return pct(todas);
}

const etiquetaValor = (v: string) => (v === "NA" ? "N/A" : v);
const responsableDe = (d: CecDatos | null, b: CecBloque, fila: CecBloque["filas"][number]) =>
  d?.responsables?.[b.id]?.[fila.key] ?? fila.responsable ?? "";
const unificado = (d: CecDatos | null, b: CecBloque) => d?.unificados?.[b.id] === true;
const textoPct = (p: number | null) => (p === null ? "—" : `${p}%`);

// ============================================================================
// EXCEL
// ============================================================================
export async function descargarCecExcel(
  periodoId: string,
  periodoLabel: string,
  entradas: CecEntrada[],
): Promise<void> {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  let anchoMax = 4;

  const fila = (valores: (string | number)[]) => {
    aoa.push(valores);
    anchoMax = Math.max(anchoMax, valores.length);
    return aoa.length - 1;
  };

  fila(["HOSPITAL NACIONAL EL SALVADOR"]);
  fila(["COMITÉ DE EXPEDIENTE CLÍNICO — CONSOLIDADO DE MONITOREO"]);
  fila([`Periodo: ${periodoLabel}`]);
  fila([]);
  fila(["RESUMEN", "", "Estado", "Cumplimiento"]);
  for (const e of entradas) {
    fila([e.plantilla.nombre, e.divisionLabel ?? "", e.datos ? "Entregado" : "Pendiente", textoPct(e.datos ? cecPctServicio(e) : null)]);
  }
  fila([]);
  fila([]);

  for (const e of entradas) {
    const r0 = fila([`SERVICIO: ${e.plantilla.nombre.toUpperCase()}`]);
    merges.push({ s: { r: r0, c: 0 }, e: { r: r0, c: 8 } });
    fila([
      `${e.divisionLabel ?? ""}${e.datos ? ` · Entregado${e.autor ? ` por ${e.autor}` : ""}` : " · PENDIENTE (sin datos este mes)"} · Cumplimiento: ${textoPct(e.datos ? cecPctServicio(e) : null)}`,
    ]);
    for (const b of e.plantilla.bloques) {
      const cols = columnasDe(b);
      fila([]);
      const rt = fila([b.titulo, "", `Cumplimiento del bloque: ${textoPct(cecPctBloqueDe(e.datos, b))}`]);
      merges.push({ s: { r: rt, c: 0 }, e: { r: rt, c: 1 } });
      const encabezado: string[] = ["Categoría", "Aspecto a evaluar"];
      for (let i = 0; i < cols; i += 1) {
        if (b.tipo === "expedientes") {
          const num = e.datos?.expedientes?.[b.id]?.[i] ?? "";
          encabezado.push(num ? `Exp. ${num}` : `Exp. ${i + 1}`);
        } else encabezado.push("Sí 1 · No 0 · N/A");
      }
      encabezado.push("Total");
      if (b.acciones) encabezado.push("Cantidades, acciones o puntos de mejora");
      if (b.responsable) encabezado.push("Responsable");
      fila(encabezado);
      if (b.tipo === "expedientes" && b.fecha) {
        fila(["", "Fecha", ...Array.from({ length: cols }, (_, i) => e.datos?.fechas?.[b.id]?.[i] ?? "")]);
      }
      const colResp = 2 + cols + 1 + (b.acciones ? 1 : 0);
      const primera = aoa.length;
      b.filas.forEach((f, idx) => {
        const previa = idx > 0 ? b.filas[idx - 1].categoria : "";
        const valores: (string | number)[] = [f.categoria === previa ? "" : f.categoria, f.aspecto];
        for (let i = 0; i < cols; i += 1) {
          const v = valorCelda(e.datos, b, f.key, i);
          valores.push(v === "1" || v === "0" ? Number(v) : etiquetaValor(v));
        }
        valores.push(textoPct(cecPctFila(e.datos, b, f.key)));
        if (b.acciones) valores.push(e.datos?.acciones?.[b.id]?.[f.key] ?? "");
        if (b.responsable) {
          valores.push(unificado(e.datos, b) && idx > 0 ? "" : responsableDe(e.datos, b, f));
        }
        fila(valores);
      });
      if (b.responsable && unificado(e.datos, b) && b.filas.length > 1) {
        merges.push({ s: { r: primera, c: colResp }, e: { r: primera + b.filas.length - 1, c: colResp } });
      }
      if (b.tipo === "expedientes") {
        fila([
          "",
          "Total por expediente",
          ...Array.from({ length: cols }, (_, i) => textoPct(cecPctColumna(e.datos, b, i))),
          textoPct(cecPctBloqueDe(e.datos, b)),
        ]);
      }
    }
    fila([]);
    fila([]);
  }

  const hoja = XLSX.utils.aoa_to_sheet(aoa);
  hoja["!merges"] = merges;
  hoja["!cols"] = Array.from({ length: anchoMax }, (_, i) =>
    i === 0 ? { wch: 26 } : i === 1 ? { wch: 48 } : { wch: 14 },
  );
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Consolidado CEC");
  XLSX.writeFile(libro, `Comite-Expediente-Clinico_${periodoId}.xlsx`);
}

// ============================================================================
// PDF (reporte para imprimir)
// ============================================================================
const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function chip(v: string) {
  if (v === "1") return `<span class="chip si">1</span>`;
  if (v === "0") return `<span class="chip no">0</span>`;
  if (v === "NA") return `<span class="chip na">N/A</span>`;
  return `<span class="vacio">·</span>`;
}

function clasePct(p: number | null) {
  if (p === null) return "pct nulo";
  return p >= 80 ? "pct alto" : p >= 50 ? "pct medio" : "pct bajo";
}

function tablaBloque(e: CecEntrada, b: CecBloque): string {
  const d = e.datos;
  const cols = columnasDe(b);
  const uni = unificado(d, b);
  const cab: string[] = [`<th class="izq cat">Categoría</th>`, `<th class="izq">Aspecto a evaluar</th>`];
  for (let i = 0; i < cols; i += 1) {
    if (b.tipo === "expedientes") {
      const num = d?.expedientes?.[b.id]?.[i] ?? "";
      const fecha = b.fecha ? d?.fechas?.[b.id]?.[i] ?? "" : "";
      cab.push(
        `<th class="exp"><span>Exp.</span><b>${esc(num || String(i + 1))}</b>${fecha ? `<em>${esc(fecha)}</em>` : ""}</th>`,
      );
    } else cab.push(`<th>Sí 1 · No 0 · N/A</th>`);
  }
  cab.push(`<th>Total</th>`);
  if (b.acciones) cab.push(`<th class="izq">Acciones / puntos de mejora</th>`);
  if (b.responsable) cab.push(`<th class="izq">Responsable</th>`);

  const filas = b.filas
    .map((f, idx) => {
      const previa = idx > 0 ? b.filas[idx - 1].categoria : "";
      const celdas: string[] = [
        `<td class="izq cat">${f.categoria === previa ? "" : esc(f.categoria)}</td>`,
        `<td class="izq">${esc(f.aspecto)}</td>`,
      ];
      for (let i = 0; i < cols; i += 1) celdas.push(`<td>${chip(valorCelda(d, b, f.key, i))}</td>`);
      const p = cecPctFila(d, b, f.key);
      celdas.push(`<td><span class="${clasePct(p)}">${textoPct(p)}</span></td>`);
      if (b.acciones) celdas.push(`<td class="izq texto">${esc(d?.acciones?.[b.id]?.[f.key] ?? "")}</td>`);
      if (b.responsable) {
        if (!uni) celdas.push(`<td class="izq texto">${esc(responsableDe(d, b, f))}</td>`);
        else if (idx === 0)
          celdas.push(`<td class="izq texto unido" rowspan="${b.filas.length}">${esc(responsableDe(d, b, f))}</td>`);
      }
      return `<tr>${celdas.join("")}</tr>`;
    })
    .join("");

  let pie = "";
  if (b.tipo === "expedientes") {
    const celdas = Array.from({ length: cols }, (_, i) => {
      const p = cecPctColumna(d, b, i);
      return `<td><span class="${clasePct(p)}">${textoPct(p)}</span></td>`;
    }).join("");
    const pb = cecPctBloqueDe(d, b);
    pie = `<tfoot><tr><td colspan="2" class="der">Total por expediente</td>${celdas}<td><span class="${clasePct(pb)}">${textoPct(pb)}</span></td>${b.acciones ? "<td></td>" : ""}${b.responsable ? "<td></td>" : ""}</tr></tfoot>`;
  }

  const pb = cecPctBloqueDe(d, b);
  return `
    <div class="bloque">
      <div class="bloque-cab">
        <h3>${esc(b.titulo)}</h3>
        <span class="${clasePct(pb)} grande">Cumplimiento ${textoPct(pb)}</span>
      </div>
      <div class="marco">
        <table><thead><tr>${cab.join("")}</tr></thead><tbody>${filas}</tbody>${pie}</table>
      </div>
    </div>`;
}

export function construirCecReporteHtml(periodoLabel: string, entradas: CecEntrada[]): string {
  const generado = new Date().toLocaleString("es-SV", { dateStyle: "long", timeStyle: "short" });
  const entregados = entradas.filter((e) => e.datos).length;
  const global = (() => {
    const lista = entradas.filter((e) => e.datos).map(cecPctServicio).filter((p): p is number => p !== null);
    return lista.length ? Math.round(lista.reduce((a, b) => a + b, 0) / lista.length) : null;
  })();

  const resumen = entradas
    .map((e) => {
      const p = e.datos ? cecPctServicio(e) : null;
      return `<tr>
        <td class="izq"><b>${esc(e.plantilla.nombre)}</b></td>
        <td class="izq">${esc(e.divisionLabel ?? "")}</td>
        <td>${e.datos ? `<span class="estado ok">Entregado</span>` : `<span class="estado pend">Pendiente</span>`}</td>
        <td><div class="barra"><i style="width:${p ?? 0}%"></i></div></td>
        <td><span class="${clasePct(p)}">${textoPct(p)}</span></td>
      </tr>`;
    })
    .join("");

  const secciones = entradas
    .map(
      (e) => `
    <section class="servicio">
      <header class="serv-cab">
        <div>
          <p class="sup">${esc(e.divisionLabel ?? "")}</p>
          <h2>${esc(e.plantilla.nombre)}</h2>
          <p class="sub">${e.datos ? `Entregado${e.autor ? ` por ${esc(e.autor)}` : ""}` : "Pendiente: el servicio no ha guardado su lista este mes."}</p>
        </div>
        <div class="kpi"><span>Cumplimiento</span><b class="${clasePct(e.datos ? cecPctServicio(e) : null)}">${textoPct(e.datos ? cecPctServicio(e) : null)}</b></div>
      </header>
      ${e.plantilla.bloques.map((b) => tablaBloque(e, b)).join("")}
    </section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Comité de Expediente Clínico · ${esc(periodoLabel)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm 11mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Segoe UI", Inter, Roboto, Arial, sans-serif; color: #1e293b; background: #eef2f7; font-size: 10.5px; }
  .hoja { max-width: 1120px; margin: 0 auto; padding: 18px; }
  .portada { background: linear-gradient(135deg, #0B2C4D 0%, #123d66 60%, #2FA89A 140%); color: #fff; border-radius: 18px; padding: 26px 30px; box-shadow: 0 14px 34px -14px rgba(11,44,77,.55); position: relative; overflow: hidden; }
  .portada::after { content: ""; position: absolute; right: -60px; top: -60px; width: 240px; height: 240px; border-radius: 50%; background: rgba(47,168,154,.25); }
  .portada .inst { margin: 0; font-size: 10px; letter-spacing: .28em; text-transform: uppercase; color: #9fe3da; }
  .portada h1 { margin: 6px 0 2px; font-size: 26px; letter-spacing: .01em; }
  .portada .per { margin: 0; font-size: 13px; color: #d7e6f5; }
  .kpis { display: flex; gap: 12px; margin-top: 18px; position: relative; z-index: 1; }
  .kpis div { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); border-radius: 12px; padding: 10px 16px; min-width: 150px; }
  .kpis span { display: block; font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: #bfe9e3; }
  .kpis b { font-size: 22px; }
  h2.titulo { font-size: 13px; letter-spacing: .2em; text-transform: uppercase; color: #0B2C4D; margin: 22px 2px 8px; }
  .marco { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 6px 18px -8px rgba(15,23,42,.25), 0 0 0 1px rgba(15,23,42,.06); }
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  th { background: #0B2C4D; color: #fff; font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase; padding: 7px 6px; text-align: center; font-weight: 700; }
  th.exp span { display: block; font-size: 7px; opacity: .7; } th.exp b { display: block; font-size: 9px; } th.exp em { display: block; font-style: normal; font-size: 7px; color: #9fe3da; }
  td { padding: 5px 6px; text-align: center; border-bottom: 1px solid #e8edf3; border-right: 1px solid #f0f3f7; vertical-align: middle; }
  td:last-child, th:last-child { border-right: 0; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tbody tr:last-child td { border-bottom: 0; }
  .izq { text-align: left; } .der { text-align: right; }
  td.cat { color: #64748b; font-size: 9px; width: 110px; }
  td.texto { font-size: 9px; color: #334155; }
  td.unido { background: #eef7f6 !important; font-weight: 600; color: #0B2C4D; border-left: 3px solid #2FA89A; }
  tfoot td { background: #e9f1f8; font-weight: 700; color: #0B2C4D; border-top: 2px solid #0B2C4D; border-bottom: 0; }
  .chip { display: inline-block; min-width: 26px; padding: 2px 6px; border-radius: 999px; font-weight: 700; font-size: 9px; }
  .chip.si { background: #dcfce7; color: #166534; } .chip.no { background: #fef3c7; color: #92400e; } .chip.na { background: #e2e8f0; color: #475569; }
  .vacio { color: #cbd5e1; }
  .pct { font-weight: 700; } .pct.alto { color: #047857; } .pct.medio { color: #b45309; } .pct.bajo { color: #b45309; } .pct.nulo { color: #94a3b8; }
  .pct.grande { font-size: 10px; background: #fff; border-radius: 999px; padding: 3px 10px; box-shadow: 0 0 0 1px #e2e8f0; }
  .estado { border-radius: 999px; padding: 2px 9px; font-weight: 700; font-size: 9px; }
  .estado.ok { background: #dcfce7; color: #166534; } .estado.pend { background: #fef3c7; color: #92400e; }
  .barra { height: 7px; border-radius: 999px; background: #e2e8f0; overflow: hidden; min-width: 160px; }
  .barra i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #2FA89A, #0B2C4D); }
  .servicio { break-before: page; page-break-before: always; padding-top: 4px; }
  .serv-cab { display: flex; justify-content: space-between; align-items: center; background: #fff; border-radius: 16px; padding: 14px 18px; border-left: 6px solid #2FA89A; box-shadow: 0 6px 18px -8px rgba(15,23,42,.25); }
  .serv-cab .sup { margin: 0; font-size: 8.5px; letter-spacing: .22em; text-transform: uppercase; color: #2FA89A; font-weight: 700; }
  .serv-cab h2 { margin: 2px 0; font-size: 18px; color: #0B2C4D; }
  .serv-cab .sub { margin: 0; font-size: 9.5px; color: #64748b; }
  .kpi { text-align: right; } .kpi span { display: block; font-size: 8.5px; letter-spacing: .18em; text-transform: uppercase; color: #64748b; } .kpi b { font-size: 24px; }
  .bloque { margin-top: 14px; break-inside: avoid; page-break-inside: avoid; }
  .bloque-cab { display: flex; justify-content: space-between; align-items: center; margin: 0 4px 6px; }
  .bloque-cab h3 { margin: 0; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #0B2C4D; }
  .pie { margin-top: 18px; text-align: center; font-size: 8.5px; color: #94a3b8; }
  .acciones { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 10px 18px; background: #0B2C4D; }
  .acciones button { border: 0; border-radius: 10px; padding: 8px 16px; font-weight: 700; cursor: pointer; background: #2FA89A; color: #fff; }
  @media print { body { background: #fff; } .hoja { padding: 0; max-width: none; } .acciones { display: none; } }
</style></head>
<body>
  <div class="acciones"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>
  <div class="hoja">
    <div class="portada">
      <p class="inst">Hospital Nacional El Salvador · ESDOMED</p>
      <h1>Comité de Expediente Clínico</h1>
      <p class="per">Consolidado de monitoreo · ${esc(periodoLabel)}</p>
      <div class="kpis">
        <div><span>Servicios</span><b>${entradas.length}</b></div>
        <div><span>Entregados</span><b>${entregados}</b></div>
        <div><span>Pendientes</span><b>${entradas.length - entregados}</b></div>
        <div><span>Cumplimiento promedio</span><b>${textoPct(global)}</b></div>
      </div>
    </div>
    <h2 class="titulo">Resumen por servicio</h2>
    <div class="marco">
      <table>
        <thead><tr><th class="izq">Servicio</th><th class="izq">División</th><th>Estado</th><th>Avance</th><th>Cumplimiento</th></tr></thead>
        <tbody>${resumen}</tbody>
      </table>
    </div>
    ${secciones}
    <p class="pie">Generado el ${esc(generado)} · Cumplimiento = casillas con 1 sobre las que aplican (N/A y vacías no cuentan).</p>
  </div>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });</script>
</body></html>`;
}

/** Escribe el reporte en una ventana ya abierta (abrirla antes del await evita el bloqueo de ventanas emergentes). */
export function mostrarCecReporte(ventana: Window, periodoLabel: string, entradas: CecEntrada[]) {
  ventana.document.open();
  ventana.document.write(construirCecReporteHtml(periodoLabel, entradas));
  ventana.document.close();
}
