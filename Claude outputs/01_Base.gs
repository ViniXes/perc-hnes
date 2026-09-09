/**
 * SIGMA - Base: configuracion, acceso a la hoja de calculo, fechas y ventanas.
 * ---------------------------------------------------------------------------
 * Todo el sistema vive en UNA hoja de calculo de Google. Este archivo sabe
 * como llegar a ella y expone los ayudantes que usan los demas archivos.
 */

var APP = {
  nombre: 'SIGMA',
  descripcion: 'Sistema Integrado de Gestion de Matriz y Almacen',
  hospital: 'Hospital Nacional Psiquiatrico "Dr. Jose Molina Martinez"',
  version: '1.0.0',
};

/** Nombres de las hojas internas. El guion bajo marca "no tocar a mano". */
var HOJAS = {
  config: '_Config',
  centros: '_Centros',
  renglones: '_Renglones',
  servicios: '_Servicios',
  insumos: '_Insumos',
  usuarios: '_Usuarios',
  festivos: '_Festivos',
  habilitaciones: '_Habilitaciones',
  estado: '_Estado',
  bitacora: '_Bitacora',
};

/** Valores por defecto. Se escriben en _Config al instalar y se editan ahi. */
var CONFIG_DEFAULT = {
  diasHabilesPerc: '5',
  diasHabilesInsumos: '5',
  horaCorte: '14:30',
  zonaHoraria: 'America/El_Salvador',
};

// ---------------------------------------------------------------------------
// Hoja de calculo
// ---------------------------------------------------------------------------

/** Id de la hoja de calculo de SIGMA (se guarda al instalar). */
function getSpreadsheetId_() {
  return PropertiesService.getScriptProperties().getProperty('SS_ID') || '';
}

/** La hoja de calculo. Lanza un error claro si todavia no se ha instalado. */
function getSS_() {
  var id = getSpreadsheetId_();
  if (!id) {
    throw new Error(
      'SIGMA todavia no esta instalado. Abra el editor de Apps Script y ejecute la funcion instalar().'
    );
  }
  return SpreadsheetApp.openById(id);
}

/** Devuelve una hoja por nombre; la crea vacia si no existe. */
function hoja_(nombre) {
  var ss = getSS_();
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

/**
 * Lee una hoja completa como lista de objetos usando la fila 1 como encabezado.
 * Una sola llamada a getValues: es la forma rapida de leer en Apps Script.
 */
function leerTabla_(nombre) {
  var sh = getSS_().getSheetByName(nombre);
  if (!sh) return [];
  var datos = sh.getDataRange().getValues();
  if (datos.length < 2) return [];
  var cab = datos[0].map(function (c) { return String(c).trim(); });
  var filas = [];
  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    if (fila.join('') === '') continue;
    var obj = { _fila: i + 1 };
    for (var j = 0; j < cab.length; j++) if (cab[j]) obj[cab[j]] = fila[j];
    filas.push(obj);
  }
  return filas;
}

/** Reemplaza el contenido de una hoja (encabezado + filas) de un solo golpe. */
function escribirTabla_(nombre, encabezado, filas) {
  var sh = hoja_(nombre);
  sh.clear();
  var todo = [encabezado].concat(filas);
  sh.getRange(1, 1, todo.length, encabezado.length).setValues(todo);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, encabezado.length).setFontWeight('bold');
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

/** Toda la configuracion como objeto {clave: valor}. Se cachea 10 minutos. */
function getConfig_() {
  var cache = CacheService.getScriptCache();
  var crudo = cache.get('config');
  if (crudo) return JSON.parse(crudo);
  var conf = {};
  Object.keys(CONFIG_DEFAULT).forEach(function (k) { conf[k] = CONFIG_DEFAULT[k]; });
  leerTabla_(HOJAS.config).forEach(function (f) {
    if (f.clave) conf[String(f.clave)] = String(f.valor);
  });
  cache.put('config', JSON.stringify(conf), 600);
  return conf;
}

/** Borra los caches derivados. Se llama cuando el admin cambia catalogos. */
function limpiarCache_() {
  CacheService.getScriptCache().removeAll(['config', 'catalogos', 'festivos']);
}

/** La zona horaria configurada (por defecto El Salvador). */
function tz_() {
  return getConfig_().zonaHoraria || 'America/El_Salvador';
}

// ---------------------------------------------------------------------------
// Fechas, dias habiles y ventana de captura
// ---------------------------------------------------------------------------

/** Fecha -> "2026-08". */
function periodoDe_(fecha) {
  return Utilities.formatDate(fecha, tz_(), 'yyyy-MM');
}

/** Fecha -> "2026-08-14". */
function iso_(fecha) {
  return Utilities.formatDate(fecha, tz_(), 'yyyy-MM-dd');
}

/** "2026-08" -> "agosto de 2026". */
function etiquetaPeriodo_(periodo) {
  var p = String(periodo).split('-');
  var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var m = parseInt(p[1], 10);
  if (!m || m < 1 || m > 12) return periodo;
  return meses[m - 1] + ' de ' + p[0];
}

/** Lista de festivos configurados, como texto "yyyy-MM-dd". */
function festivos_() {
  var cache = CacheService.getScriptCache();
  var crudo = cache.get('festivos');
  if (crudo) return JSON.parse(crudo);
  var lista = leerTabla_(HOJAS.festivos)
    .map(function (f) {
      var v = f.fecha;
      if (v instanceof Date) return iso_(v);
      return String(v || '').trim();
    })
    .filter(Boolean);
  cache.put('festivos', JSON.stringify(lista), 600);
  return lista;
}

/** True si la fecha NO es sabado, domingo ni festivo del hospital. */
function esHabil_(fecha) {
  var dia = fecha.getDay();
  if (dia === 0 || dia === 6) return false;
  return festivos_().indexOf(iso_(fecha)) === -1;
}

/** Los primeros N dias habiles del mes de la fecha dada. */
function primerosDiasHabiles_(referencia, cuantos) {
  var dias = [];
  var cursor = new Date(referencia.getFullYear(), referencia.getMonth(), 1);
  while (dias.length < cuantos && cursor.getMonth() === referencia.getMonth()) {
    if (esHabil_(cursor)) dias.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

/**
 * El periodo que se esta cerrando: durante septiembre se digita agosto.
 * Cambia solo el dia 1 de cada mes a las 00:00; de ahi sale el "bucle" mensual.
 */
function periodoEnCierre_(referencia) {
  var f = referencia || new Date();
  var anterior = new Date(f.getFullYear(), f.getMonth() - 1, 1);
  return periodoDe_(anterior);
}

/**
 * Estado de la ventana de captura de un modulo ('perc' o 'insumos').
 * Abierta durante los primeros N dias habiles; el ultimo dia cierra a la
 * hora de corte configurada (por defecto 2:30 p.m.).
 */
function ventana_(modulo, referencia) {
  var ahora = referencia || new Date();
  var conf = getConfig_();
  var total = parseInt(
    modulo === 'insumos' ? conf.diasHabilesInsumos : conf.diasHabilesPerc, 10
  ) || 5;
  var dias = primerosDiasHabiles_(ahora, total);
  var ultimo = dias[dias.length - 1];
  var corte = String(conf.horaCorte || '14:30').split(':');
  var horaCorte = parseInt(corte[0], 10) || 14;
  var minCorte = parseInt(corte[1], 10) || 0;

  var hoy = iso_(ahora);
  var indice = -1;
  for (var i = 0; i < dias.length; i++) if (iso_(dias[i]) === hoy) indice = i;

  var esUltimo = indice === dias.length - 1;
  var antesDelCorte =
    ahora.getHours() < horaCorte ||
    (ahora.getHours() === horaCorte && ahora.getMinutes() < minCorte);
  var abierta = indice >= 0 && (!esUltimo || antesDelCorte);

  return {
    modulo: modulo,
    abierta: abierta,
    diaActual: indice + 1,
    totalDias: total,
    ultimoDia: ultimo ? iso_(ultimo) : '',
    ultimoDiaLargo: ultimo
      ? Utilities.formatDate(ultimo, tz_(), "EEEE d 'de' MMMM").toLowerCase()
      : '',
    horaCorte: conf.horaCorte || '14:30',
    periodo: periodoEnCierre_(ahora),
  };
}

/** True si el admin habilito excepcionalmente a este servicio para este mes. */
function tieneHabilitacion_(periodo, modulo, servicioId) {
  var lista = leerTabla_(HOJAS.habilitaciones);
  for (var i = 0; i < lista.length; i++) {
    var h = lista[i];
    if (
      String(h.periodo) === String(periodo) &&
      String(h.modulo) === String(modulo) &&
      String(h.servicioId) === String(servicioId) &&
      String(h.activa).toUpperCase() !== 'NO'
    ) return true;
  }
  return false;
}

/** Puede este servicio digitar hoy: ventana abierta o habilitacion especial. */
function puedeCapturar_(modulo, periodo, servicioId) {
  var v = ventana_(modulo);
  if (v.abierta && v.periodo === periodo) return true;
  return tieneHabilitacion_(periodo, modulo, servicioId);
}

// ---------------------------------------------------------------------------
// Bitacora
// ---------------------------------------------------------------------------

/** Deja constancia de una accion. Nunca rompe el flujo si falla. */
function bitacora_(usuario, accion, detalle) {
  try {
    var sh = hoja_(HOJAS.bitacora);
    sh.appendRow([new Date(), usuario || '-', accion || '-', detalle || '']);
  } catch (e) {
    // La bitacora es un extra: si falla, la operacion principal sigue.
  }
}

/** Fecha legible para mostrar autoria: "14/08/2026 10:32". */
function fechaLegible_(fecha) {
  if (!fecha) return '';
  var d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, tz_(), 'dd/MM/yyyy HH:mm');
}
