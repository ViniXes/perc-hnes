/**
 * SIGMA - Usuarios y sesiones.
 * ---------------------------------------------------------------------------
 * El personal del hospital no tiene cuenta de Google, asi que SIGMA maneja sus
 * propios usuarios. Reglas que se respetan aqui:
 *   - La contrasena NUNCA se guarda. Se guarda un hash SHA-256 con sal unica
 *     por usuario, asi que ni quien abra la hoja de calculo puede leerla.
 *   - La sesion es un token aleatorio que vive en el cache del servidor. Si el
 *     token no esta o vencio, no hay sesion: se vuelve a pedir la contrasena.
 */

var SESION_HORAS = 6;

/** Hash de una contrasena con su sal. */
function hashClave_(clave, salt) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + '|' + String(clave),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}

/** Busca un usuario por su nombre de usuario (sin importar mayusculas). */
function buscarUsuario_(usuario) {
  var buscado = String(usuario || '').trim().toLowerCase();
  if (!buscado) return null;
  var lista = leerTabla_(HOJAS.usuarios);
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].usuario).trim().toLowerCase() === buscado) return lista[i];
  }
  return null;
}

/** Version publica de un usuario: lo que el navegador puede saber de el. */
function usuarioPublico_(fila) {
  var servicios = String(fila.servicios || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
  return {
    usuario: String(fila.usuario),
    nombre: String(fila.nombre || fila.usuario),
    rol: String(fila.rol || 'digitador'),
    servicios: servicios,
    insumos: String(fila.insumos || 'NO').toUpperCase() === 'SI',
    cambiarClave: String(fila.cambiarClave || 'NO').toUpperCase() === 'SI',
  };
}

/**
 * Freno de fuerza bruta. La app es de acceso publico, asi que tras varios
 * intentos fallidos el usuario queda en pausa unos minutos. Se guarda en el
 * cache, no en la hoja: es rapido y se limpia solo.
 */
var INTENTOS_MAX = 8;
var PAUSA_MINUTOS = 15;

function claveIntentos_(usuario) {
  return 'int_' + String(usuario || '').trim().toLowerCase();
}

function intentosDe_(usuario) {
  var v = CacheService.getScriptCache().get(claveIntentos_(usuario));
  return v ? parseInt(v, 10) : 0;
}

function sumarIntento_(usuario) {
  var cache = CacheService.getScriptCache();
  var n = intentosDe_(usuario) + 1;
  cache.put(claveIntentos_(usuario), String(n), PAUSA_MINUTOS * 60);
  return n;
}

/** Inicia sesion. Devuelve {ok, token, usuario} o {ok:false, error}. */
function iniciarSesion(usuario, clave) {
  if (intentosDe_(usuario) >= INTENTOS_MAX) {
    return {
      ok: false,
      error: 'Demasiados intentos fallidos. Espere ' + PAUSA_MINUTOS +
        ' minutos o pida al administrador una contrasena nueva.',
    };
  }
  var fila = buscarUsuario_(usuario);
  // Mismo mensaje para usuario inexistente y clave mala: no se le dice a nadie
  // cuales usuarios existen.
  var generico = { ok: false, error: 'Usuario o contrasena incorrectos.' };
  if (!fila) { sumarIntento_(usuario); return generico; }
  if (String(fila.activo || 'SI').toUpperCase() !== 'SI') {
    return { ok: false, error: 'Su usuario esta desactivado. Consulte con el administrador.' };
  }
  if (hashClave_(clave, fila.salt) !== String(fila.hash)) {
    sumarIntento_(usuario);
    return generico;
  }
  CacheService.getScriptCache().remove(claveIntentos_(usuario));

  var token = Utilities.getUuid();
  var pub = usuarioPublico_(fila);
  CacheService.getScriptCache().put(
    'ses_' + token, JSON.stringify(pub), SESION_HORAS * 3600
  );
  bitacora_(pub.usuario, 'Inicio de sesion', pub.rol);
  return { ok: true, token: token, usuario: pub };
}

/** Cierra la sesion actual. */
function cerrarSesion(token) {
  if (token) CacheService.getScriptCache().remove('ses_' + token);
  return { ok: true };
}

/** Devuelve el usuario de un token vigente, o null. */
function sesion_(token) {
  if (!token) return null;
  var crudo = CacheService.getScriptCache().get('ses_' + token);
  return crudo ? JSON.parse(crudo) : null;
}

/** Igual que sesion_, pero lanza error si no hay sesion. Uselo en cada api. */
function exigirSesion_(token) {
  var u = sesion_(token);
  if (!u) throw new Error('SESION_VENCIDA');
  return u;
}

/** Lanza error si el usuario no es administrador. */
function exigirAdmin_(token) {
  var u = exigirSesion_(token);
  if (u.rol !== 'admin') throw new Error('Esta accion es solo del administrador.');
  return u;
}

/** Cambia la contrasena del propio usuario. */
function cambiarMiClave(token, claveActual, claveNueva) {
  var u = exigirSesion_(token);
  var fila = buscarUsuario_(u.usuario);
  if (!fila) return { ok: false, error: 'No encontramos su usuario.' };
  if (hashClave_(claveActual, fila.salt) !== String(fila.hash)) {
    return { ok: false, error: 'La contrasena actual no coincide.' };
  }
  var problema = validarClave_(claveNueva);
  if (problema) return { ok: false, error: problema };

  var salt = Utilities.getUuid();
  var sh = hoja_(HOJAS.usuarios);
  sh.getRange(fila._fila, columna_(HOJAS.usuarios, 'hash')).setValue(hashClave_(claveNueva, salt));
  sh.getRange(fila._fila, columna_(HOJAS.usuarios, 'salt')).setValue(salt);
  sh.getRange(fila._fila, columna_(HOJAS.usuarios, 'cambiarClave')).setValue('NO');

  u.cambiarClave = false;
  CacheService.getScriptCache().put('ses_' + token, JSON.stringify(u), SESION_HORAS * 3600);
  bitacora_(u.usuario, 'Cambio de contrasena', '');
  return { ok: true, usuario: u };
}

/** Reglas minimas de contrasena. Devuelve el problema o '' si esta bien. */
function validarClave_(clave) {
  var c = String(clave || '');
  if (c.length < 8) return 'La contrasena debe tener al menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(c) || !/[0-9]/.test(c)) {
    return 'La contrasena debe combinar letras y numeros.';
  }
  return '';
}

/** Numero de columna de un encabezado dentro de una hoja. */
function columna_(nombreHoja, encabezado) {
  var sh = getSS_().getSheetByName(nombreHoja);
  var cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = 0; i < cab.length; i++) {
    if (String(cab[i]).trim() === encabezado) return i + 1;
  }
  throw new Error('No existe la columna "' + encabezado + '" en ' + nombreHoja + '.');
}

// ---------------------------------------------------------------------------
// Administracion de usuarios (solo admin)
// ---------------------------------------------------------------------------

/** Lista de usuarios para el panel del administrador (sin hash ni sal). */
function listarUsuarios(token) {
  exigirAdmin_(token);
  return leerTabla_(HOJAS.usuarios).map(function (f) {
    return {
      fila: f._fila,
      usuario: String(f.usuario),
      nombre: String(f.nombre || ''),
      rol: String(f.rol || ''),
      servicios: String(f.servicios || ''),
      insumos: String(f.insumos || 'NO').toUpperCase() === 'SI',
      activo: String(f.activo || 'SI').toUpperCase() === 'SI',
      creado: fechaLegible_(f.creado),
    };
  });
}

/**
 * Crea un usuario y devuelve su contrasena temporal, que el admin le entrega.
 * SIGMA no envia correos: la clave se muestra una sola vez en pantalla.
 */
function crearUsuario(token, datos) {
  exigirAdmin_(token);
  var usuario = String(datos.usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,}$/.test(usuario)) {
    return { ok: false, error: 'El usuario debe tener 3 o mas caracteres, sin espacios ni tildes.' };
  }
  if (buscarUsuario_(usuario)) return { ok: false, error: 'Ese usuario ya existe.' };

  var clave = claveTemporal_();
  var salt = Utilities.getUuid();
  hoja_(HOJAS.usuarios).appendRow([
    usuario,
    String(datos.nombre || '').trim() || usuario,
    String(datos.rol || 'digitador'),
    String(datos.servicios || ''),
    datos.insumos ? 'SI' : 'NO',
    'SI',
    hashClave_(clave, salt),
    salt,
    'SI',
    new Date(),
  ]);
  bitacora_(sesion_(token).usuario, 'Crea usuario', usuario);
  return { ok: true, usuario: usuario, clave: clave };
}

/** Actualiza nombre, rol, servicios, insumos o estado de un usuario. */
function actualizarUsuario(token, datos) {
  exigirAdmin_(token);
  var fila = buscarUsuario_(datos.usuario);
  if (!fila) return { ok: false, error: 'No encontramos ese usuario.' };
  var sh = hoja_(HOJAS.usuarios);
  var f = fila._fila;
  if (datos.nombre !== undefined) sh.getRange(f, columna_(HOJAS.usuarios, 'nombre')).setValue(datos.nombre);
  if (datos.rol !== undefined) sh.getRange(f, columna_(HOJAS.usuarios, 'rol')).setValue(datos.rol);
  if (datos.servicios !== undefined) sh.getRange(f, columna_(HOJAS.usuarios, 'servicios')).setValue(datos.servicios);
  if (datos.insumos !== undefined) sh.getRange(f, columna_(HOJAS.usuarios, 'insumos')).setValue(datos.insumos ? 'SI' : 'NO');
  if (datos.activo !== undefined) sh.getRange(f, columna_(HOJAS.usuarios, 'activo')).setValue(datos.activo ? 'SI' : 'NO');
  bitacora_(sesion_(token).usuario, 'Edita usuario', String(datos.usuario));
  return { ok: true };
}

/** Genera una contrasena temporal nueva para un usuario que la perdio. */
function reiniciarClave(token, usuario) {
  exigirAdmin_(token);
  var fila = buscarUsuario_(usuario);
  if (!fila) return { ok: false, error: 'No encontramos ese usuario.' };
  var clave = claveTemporal_();
  var salt = Utilities.getUuid();
  var sh = hoja_(HOJAS.usuarios);
  sh.getRange(fila._fila, columna_(HOJAS.usuarios, 'hash')).setValue(hashClave_(clave, salt));
  sh.getRange(fila._fila, columna_(HOJAS.usuarios, 'salt')).setValue(salt);
  sh.getRange(fila._fila, columna_(HOJAS.usuarios, 'cambiarClave')).setValue('SI');
  bitacora_(sesion_(token).usuario, 'Reinicia contrasena', String(usuario));
  return { ok: true, clave: clave };
}
