/**
 * ACTA DE CIERRE MENSUAL.
 * ---------------------------------------------------------------------------
 * Arma el documento con el que ESDOMED cierra el mes: cuantos servicios
 * entregaron cada tablero, quienes quedaron pendientes y que tableros se
 * abrieron o cerraron a mano. Se abre en una pestana para "Guardar como PDF"
 * o imprimir y firmar. No lee ni escribe nada: recibe lo que la pantalla ya
 * tiene cargado.
 */
export type ActaModulo = {
  label: string;
  total: number;
  completos: number;
  pendientes: string[];
};

export type ActaMovimiento = {
  servicio: string;
  modulo: string;
  estado: string;
  por?: string;
};

export type ActaDatos = {
  periodoLabel: string;
  generadoPor: string;
  modulos: ActaModulo[];
  movimientos: ActaMovimiento[];
};

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function construirActaHtml(d: ActaDatos): string {
  const generado = new Date().toLocaleString("es-SV", { dateStyle: "long", timeStyle: "short" });
  const totalEntregados = d.modulos.reduce((a, m) => a + m.completos, 0);
  const totalTableros = d.modulos.reduce((a, m) => a + m.total, 0);
  const pctGlobal = totalTableros ? Math.round((totalEntregados / totalTableros) * 100) : 0;

  const resumen = d.modulos
    .map((m) => {
      const pct = m.total ? Math.round((m.completos / m.total) * 100) : 0;
      return `<tr>
        <td class="izq"><b>${esc(m.label)}</b></td>
        <td>${m.completos} de ${m.total}</td>
        <td>${m.pendientes.length}</td>
        <td><div class="barra"><i style="width:${pct}%"></i></div></td>
        <td><b class="${pct >= 100 ? "ok" : pct >= 80 ? "medio" : "bajo"}">${pct}%</b></td>
      </tr>`;
    })
    .join("");

  const pendientes = d.modulos
    .filter((m) => m.pendientes.length > 0)
    .map(
      (m) => `<div class="bloque">
        <h3>${esc(m.label)} · ${m.pendientes.length} pendiente${m.pendientes.length === 1 ? "" : "s"}</h3>
        <ol class="lista">${m.pendientes.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      </div>`,
    )
    .join("");

  const movimientos = d.movimientos.length
    ? `<table>
        <thead><tr><th class="izq">Servicio</th><th class="izq">Tablero</th><th>Estado</th><th class="izq">Autorizado por</th></tr></thead>
        <tbody>${d.movimientos
          .map(
            (m) => `<tr>
              <td class="izq">${esc(m.servicio)}</td>
              <td class="izq">${esc(m.modulo)}</td>
              <td><span class="chip ${m.estado === "Abierto" ? "ab" : "ce"}">${esc(m.estado)}</span></td>
              <td class="izq">${esc(m.por ?? "—")}</td>
            </tr>`,
          )
          .join("")}</tbody>
      </table>`
    : `<p class="vacio">Sin tableros abiertos ni cerrados a mano durante el período.</p>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Acta de cierre · ${esc(d.periodoLabel)}</title>
<style>
  @page { size: Letter; margin: 14mm 15mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; font-family:"Segoe UI", Inter, Roboto, Arial, sans-serif; color:#1e293b; font-size:10.5pt; background:#eef2f7; }
  .hoja { max-width: 8.5in; margin: 0 auto; background:#fff; padding: 26px 30px 34px; }
  .cab { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #2FA89A; padding-bottom:14px; }
  .cab .inst { margin:0; font-size:8.5pt; letter-spacing:.26em; text-transform:uppercase; color:#2FA89A; font-weight:700; }
  .cab h1 { margin:4px 0 2px; font-size:20pt; color:#0B2C4D; }
  .cab .per { margin:0; color:#64748b; font-size:10pt; }
  .cab .sello { text-align:right; font-size:8.5pt; color:#64748b; }
  .cab .sello b { display:block; font-size:11pt; color:#0B2C4D; }
  h2 { font-size:9.5pt; letter-spacing:.2em; text-transform:uppercase; color:#0B2C4D; margin:22px 0 8px; }
  table { width:100%; border-collapse:separate; border-spacing:0; font-size:9.5pt; box-shadow:0 0 0 1px #e2e8f0; border-radius:10px; overflow:hidden; }
  th { background:#0B2C4D; color:#fff; font-size:8pt; letter-spacing:.08em; text-transform:uppercase; padding:7px 10px; text-align:center; }
  td { padding:6px 10px; text-align:center; border-bottom:1px solid #eef2f7; }
  tr:last-child td { border-bottom:0; }
  .izq { text-align:left; }
  .barra { height:7px; border-radius:99px; background:#e2e8f0; overflow:hidden; min-width:120px; }
  .barra i { display:block; height:100%; background:linear-gradient(90deg,#2FA89A,#0B2C4D); }
  .ok { color:#047857; } .medio { color:#b45309; } .bajo { color:#b91c1c; }
  .chip { border-radius:99px; padding:2px 9px; font-size:8.5pt; font-weight:700; }
  .chip.ab { background:#dcfce7; color:#166534; } .chip.ce { background:#fef3c7; color:#92400e; }
  .kpis { display:flex; gap:10px; margin-top:14px; }
  .kpis div { flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:8px 12px; }
  .kpis span { display:block; font-size:8pt; letter-spacing:.16em; text-transform:uppercase; color:#64748b; }
  .kpis b { font-size:17pt; color:#0B2C4D; }
  .bloque { break-inside:avoid; margin-bottom:10px; }
  .bloque h3 { font-size:10pt; color:#0B2C4D; margin:10px 0 4px; }
  .lista { margin:0; padding-left:20px; columns:2; font-size:9.5pt; color:#334155; }
  .lista li { margin:1px 0; break-inside:avoid; }
  .vacio { font-size:9.5pt; color:#64748b; font-style:italic; }
  .firmas { display:flex; gap:28px; margin-top:40px; break-inside:avoid; }
  .firmas div { flex:1; text-align:center; }
  .firmas .linea { border-top:1px solid #94a3b8; margin-bottom:5px; }
  .firmas p { margin:0; font-size:9pt; color:#475569; }
  .pie { margin-top:22px; border-top:1px solid #e2e8f0; padding-top:8px; font-size:8.5pt; color:#94a3b8; display:flex; justify-content:space-between; }
  .acciones { background:#0B2C4D; padding:10px; text-align:right; }
  .acciones button { border:0; border-radius:9px; padding:8px 16px; font-weight:700; background:#2FA89A; color:#fff; cursor:pointer; }
  @media print { body { background:#fff; } .hoja { max-width:none; padding:0; } .acciones { display:none; } }
</style></head>
<body>
  <div class="acciones"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>
  <div class="hoja">
    <div class="cab">
      <div>
        <p class="inst">Hospital Nacional El Salvador · ESDOMED</p>
        <h1>Acta de cierre mensual</h1>
        <p class="per">Período: ${esc(d.periodoLabel)}</p>
      </div>
      <div class="sello">
        Generada por<b>${esc(d.generadoPor || "—")}</b>
        ${esc(generado)}
      </div>
    </div>

    <div class="kpis">
      <div><span>Tableros esperados</span><b>${totalTableros}</b></div>
      <div><span>Entregados</span><b>${totalEntregados}</b></div>
      <div><span>Pendientes</span><b>${totalTableros - totalEntregados}</b></div>
      <div><span>Cumplimiento</span><b>${pctGlobal}%</b></div>
    </div>

    <h2>Resumen por módulo</h2>
    <table>
      <thead><tr><th class="izq">Módulo</th><th>Entregados</th><th>Pendientes</th><th>Avance</th><th>Cumplimiento</th></tr></thead>
      <tbody>${resumen}</tbody>
    </table>

    <h2>Servicios pendientes</h2>
    ${pendientes || `<p class="vacio">Todos los servicios entregaron sus tableros en el período.</p>`}

    <h2>Tableros abiertos o cerrados fuera de la ventana</h2>
    ${movimientos}

    <div class="firmas">
      <div><div class="linea"></div><p>Elaborado por · ESDOMED</p></div>
      <div><div class="linea"></div><p>Revisado por</p></div>
      <div><div class="linea"></div><p>Dirección</p></div>
    </div>

    <div class="pie">
      <span>Hospital Nacional El Salvador · Desarrollado por ESDOMED</span>
      <span>Generada el ${esc(generado)}</span>
    </div>
  </div>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });</script>
</body></html>`;
}

/** Escribe el acta en una ventana ya abierta (abrirla antes evita el bloqueo de emergentes). */
export function mostrarActa(ventana: Window, datos: ActaDatos) {
  ventana.document.open();
  ventana.document.write(construirActaHtml(datos));
  ventana.document.close();
}
