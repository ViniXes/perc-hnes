/**
 * SIGMA - Instalacion.
 * ---------------------------------------------------------------------------
 * Ejecute instalar() UNA sola vez desde el editor de Apps Script. Crea la hoja
 * de calculo, siembra los catalogos del PERC 2026 y deja creado el usuario
 * administrador. Volver a ejecutarlo NO borra datos: solo repone lo que falte.
 */

function instalar() {
  var props = PropertiesService.getScriptProperties();
  // Candado: la aplicacion es de acceso publico (el personal no tiene cuenta de
  // Google), asi que instalar() no puede quedar disponible para cualquiera. Una
  // vez instalado, solo se vuelve a ejecutar borrando a mano la propiedad
  // INSTALADO desde Configuracion del proyecto.
  if (props.getProperty('INSTALADO') === 'SI') {
    return 'SIGMA ya esta instalado. Para reinstalar, borre la propiedad INSTALADO.';
  }
  var id = props.getProperty('SS_ID');
  var ss;

  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    // Si el proyecto se creo DESDE una hoja de calculo (Extensiones > Apps
    // Script), se usa esa misma hoja. Si no, se crea una nueva.
    ss = SpreadsheetApp.getActiveSpreadsheet() ||
      SpreadsheetApp.create('SIGMA - Datos (' + APP.hospital + ')');
    props.setProperty('SS_ID', ss.getId());
  }
  ss.setSpreadsheetTimeZone(CONFIG_DEFAULT.zonaHoraria);

  sembrarConfig_();
  sembrarCatalogos_();
  sembrarHojasVacias_();
  var clave = sembrarAdmin_();
  limpiarCache_();
  props.setProperty('INSTALADO', 'SI');

  var msg =
    'SIGMA quedo instalado.\n\n' +
    'Hoja de datos: ' + ss.getUrl() + '\n\n' +
    (clave
      ? 'Usuario administrador: admin\nContrasena temporal: ' + clave +
        '\n\nCambiela la primera vez que entre.'
      : 'El usuario administrador ya existia; no se toco su contrasena.');
  Logger.log(msg);
  return msg;
}

/** Escribe la configuracion inicial sin pisar lo que ya este puesto. */
function sembrarConfig_() {
  var sh = hoja_(HOJAS.config);
  if (sh.getLastRow() > 1) return;
  var filas = Object.keys(CONFIG_DEFAULT).map(function (k) {
    return [k, CONFIG_DEFAULT[k], descripcionConfig_(k)];
  });
  escribirTabla_(HOJAS.config, ['clave', 'valor', 'que significa'], filas);
}

function descripcionConfig_(clave) {
  var textos = {
    diasHabilesPerc: 'Dias habiles del mes siguiente para digitar el PERC.',
    diasHabilesInsumos: 'Dias habiles del mes siguiente para digitar Insumos.',
    horaCorte: 'Hora en que cierra el ultimo dia habil (formato 24 h).',
    zonaHoraria: 'Zona horaria del hospital.',
  };
  return textos[clave] || '';
}

/** Copia los catalogos del PERC 2026 a sus hojas (solo si estan vacias). */
function sembrarCatalogos_() {
  if (!getSS_().getSheetByName(HOJAS.centros) ||
      getSS_().getSheetByName(HOJAS.centros).getLastRow() < 2) {
    escribirTabla_(HOJAS.centros, ['codigo', 'nombre', 'activo'],
      SEED_CENTROS.map(function (c) { return [c[0], c[1], 'SI']; }));
  }

  if (!getSS_().getSheetByName(HOJAS.servicios) ||
      getSS_().getSheetByName(HOJAS.servicios).getLastRow() < 2) {
    escribirTabla_(HOJAS.servicios, ['id', 'nombre', 'activo'],
      SEED_SERVICIOS.map(function (s) { return [s[0], s[1], 'SI']; }));
  }

  if (!getSS_().getSheetByName(HOJAS.renglones) ||
      getSS_().getSheetByName(HOJAS.renglones).getLastRow() < 2) {
    escribirTabla_(HOJAS.renglones,
      ['orden', 'id', 'servicioId', 'unidad', 'etiqueta'],
      SEED_RENGLONES.map(function (r, i) { return [i + 1, r[0], r[1], r[2], r[3]]; }));
  }

  if (!getSS_().getSheetByName(HOJAS.insumos) ||
      getSS_().getSheetByName(HOJAS.insumos).getLastRow() < 2) {
    escribirTabla_(HOJAS.insumos, ['codigo', 'nombre', 'activo'],
      SEED_INSUMO_CATEGORIAS.map(function (c) { return [c[0], c[1], 'SI']; }));
  }
}

/** Crea las hojas de trabajo que empiezan vacias, con su encabezado. */
function sembrarHojasVacias_() {
  var ss = getSS_();
  if (!ss.getSheetByName(HOJAS.usuarios)) {
    escribirTabla_(HOJAS.usuarios,
      ['usuario', 'nombre', 'rol', 'servicios', 'insumos', 'activo',
       'hash', 'salt', 'cambiarClave', 'creado'], []);
  }
  if (!ss.getSheetByName(HOJAS.festivos)) {
    escribirTabla_(HOJAS.festivos, ['fecha', 'descripcion'], []);
  }
  if (!ss.getSheetByName(HOJAS.habilitaciones)) {
    escribirTabla_(HOJAS.habilitaciones,
      ['periodo', 'modulo', 'servicioId', 'activa', 'otorgada', 'por'], []);
  }
  if (!ss.getSheetByName(HOJAS.estado)) {
    escribirTabla_(HOJAS.estado,
      ['periodo', 'modulo', 'servicioId', 'completo', 'usuario', 'fecha'], []);
  }
  if (!ss.getSheetByName(HOJAS.bitacora)) {
    escribirTabla_(HOJAS.bitacora, ['fecha', 'usuario', 'accion', 'detalle'], []);
  }
}

/** Crea el usuario admin si no existe y devuelve su contrasena temporal. */
function sembrarAdmin_() {
  var usuarios = leerTabla_(HOJAS.usuarios);
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].usuario).toLowerCase() === 'admin') return '';
  }
  var clave = claveTemporal_();
  var salt = Utilities.getUuid();
  hoja_(HOJAS.usuarios).appendRow([
    'admin', 'Administrador de SIGMA', 'admin', '', 'NO', 'SI',
    hashClave_(clave, salt), salt, 'SI', new Date(),
  ]);
  return clave;
}

/** Contrasena temporal legible: 3 letras + 4 numeros (ej. "sig4821"). */
function claveTemporal_() {
  var letras = 'abcdefghijkmnpqrstuvwxyz';
  var texto = '';
  for (var i = 0; i < 3; i++) {
    texto += letras.charAt(Math.floor(Math.random() * letras.length));
  }
  return texto + String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Crea (o repone) la hoja de datos de un periodo con la forma EXACTA del Excel
 * oficial: fila 1 = centros de costo, columna A = servicio, columna B = renglon.
 * La hoja ES la matriz consolidada; cada servicio solo escribe sus filas.
 */
function hojaPerc_(periodo) {
  var nombre = 'PERC ' + periodo;
  var ss = getSS_();
  var sh = ss.getSheetByName(nombre);
  if (sh) return sh;

  sh = ss.insertSheet(nombre);
  var centros = catalogos_().centros;
  var renglones = catalogos_().renglones;

  var cab = ['Servicio', 'Centro de Produccion'];
  centros.forEach(function (c) { cab.push(c.codigo + '-' + c.nombre); });

  var filas = [cab];
  var servicioAnterior = '';
  renglones.forEach(function (r) {
    var fila = new Array(cab.length).fill('');
    fila[0] = r.servicioId === servicioAnterior ? '' : r.servicioNombre;
    fila[1] = r.etiqueta;
    servicioAnterior = r.servicioId;
    filas.push(fila);
  });

  sh.getRange(1, 1, filas.length, cab.length).setValues(filas);
  formatoMatriz_(sh, cab.length, filas.length);
  return sh;
}

/** Igual que hojaPerc_, pero para la matriz de Insumos (centros x categorias). */
function hojaInsumos_(periodo) {
  var nombre = 'INSUMOS ' + periodo;
  var ss = getSS_();
  var sh = ss.getSheetByName(nombre);
  if (sh) return sh;

  sh = ss.insertSheet(nombre);
  var cats = catalogos_().insumoCategorias;
  var cab = ['Servicio', 'Centro de Produccion'];
  cats.forEach(function (c) { cab.push(c.codigo + '-' + c.nombre); });

  var filas = [cab];
  SEED_INSUMO_FILAS.forEach(function (f) {
    var fila = new Array(cab.length).fill('');
    fila[0] = f[1];
    fila[1] = f[0] + '-' + f[1];
    filas.push(fila);
  });

  sh.getRange(1, 1, filas.length, cab.length).setValues(filas);
  formatoMatriz_(sh, cab.length, filas.length);
  return sh;
}

/** Formato comun de las dos matrices: encabezados fijos y columnas angostas. */
function formatoMatriz_(sh, columnas, filas) {
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.getRange(1, 1, 1, columnas)
    .setFontWeight('bold')
    .setWrap(true)
    .setVerticalAlignment('bottom')
    .setBackground('#eef2f7');
  sh.setColumnWidth(1, 190);
  sh.setColumnWidth(2, 320);
  if (columnas > 2) {
    sh.setColumnWidths(3, columnas - 2, 92);
    sh.getRange(2, 3, filas - 1, columnas - 2).setNumberFormat('#,##0');
  }
  sh.setRowHeight(1, 96);
}
