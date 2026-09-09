/**
 * SIGMA - Punto de entrada de la aplicacion web.
 */

function doGet() {
  var plantilla = HtmlService.createTemplateFromFile('Index');
  return plantilla
    .evaluate()
    .setTitle('SIGMA · Hospital Nacional Psiquiatrico')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Permite partir el HTML en varios archivos y unirlos al servir. */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/** Datos publicos para la pantalla de ingreso (sin sesion todavia). */
function apiPortada() {
  return {
    app: APP,
    periodoEtiqueta: etiquetaPeriodo_(periodoEnCierre_()),
    ventanas: { perc: ventana_('perc'), insumos: ventana_('insumos') },
  };
}
