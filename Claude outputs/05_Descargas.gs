/**
 * SIGMA - Descargas en Excel.
 * ---------------------------------------------------------------------------
 * El archivo sale con la MISMA forma que la plantilla oficial del PERC 2026:
 * fila 1 con los centros de costo, columna A el servicio y columna B el
 * renglon. Asi se puede entregar tal cual, sin reacomodar nada.
 *
 * Como se hace: se copia la hoja del mes a un archivo temporal (para que el
 * Excel salga con UNA sola pestana), se exporta, se manda al navegador en
 * base64 y el temporal se borra de inmediato.
 */

/** Devuelve {nombre, mime, datos} listo para descargar en el navegador. */
function apiDescargar(token, modulo, periodo) {
  var u = exigirSesion_(token);
  if (u.rol !== 'admin' && u.rol !== 'monitor') {
    throw new Error('Las descargas del consolidado son para administracion.');
  }
  periodo = String(periodo || periodoEnCierre_());
  var esInsumos = String(modulo) === 'insumos';
  var origen = esInsumos ? hojaInsumos_(periodo) : hojaPerc_(periodo);

  var titulo = (esInsumos ? 'INSUMOS' : 'PRODUCCION DISTRIBUIDA') +
    ' PERC HN PSIQUIATRICO ' + periodo;

  var temporal = SpreadsheetApp.create(titulo);
  var archivoTemporal = DriveApp.getFileById(temporal.getId());
  try {
    var copia = origen.copyTo(temporal);
    copia.setName(esInsumos ? 'Distribucion Insumo' : 'Produccion Distribuida');
    var sobra = temporal.getSheets().filter(function (sh) {
      return sh.getSheetId() !== copia.getSheetId();
    });
    sobra.forEach(function (sh) { temporal.deleteSheet(sh); });
    SpreadsheetApp.flush();

    var url = 'https://docs.google.com/spreadsheets/d/' + temporal.getId() +
      '/export?format=xlsx';
    var respuesta = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (respuesta.getResponseCode() !== 200) {
      throw new Error('Google no pudo generar el Excel (codigo ' +
        respuesta.getResponseCode() + '). Intente de nuevo.');
    }

    bitacora_(u.usuario, 'Descarga ' + (esInsumos ? 'Insumos' : 'PERC'), periodo);
    return {
      nombre: titulo + '.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      datos: Utilities.base64Encode(respuesta.getContent()),
    };
  } finally {
    // Pase lo que pase, el archivo temporal no se queda en el Drive.
    try { archivoTemporal.setTrashed(true); } catch (e) {}
  }
}

/**
 * Enlace directo a la hoja de calculo de SIGMA. Solo el administrador lo ve;
 * sirve para revisar o corregir a mano en un caso extremo.
 */
function apiEnlaceHoja(token) {
  exigirAdmin_(token);
  return { url: getSS_().getUrl() };
}
