/**
 * SIGMA - API que consume la pantalla.
 * ---------------------------------------------------------------------------
 * Regla de velocidad: cada pantalla se arma con UNA sola llamada al servidor y
 * una sola lectura de rango. Los catalogos viajan una vez y se quedan en el
 * navegador; despues solo van y vienen los numeros.
 */

/** Catalogos completos, cacheados 10 minutos porque casi nunca cambian. */
function catalogos_() {
  var cache = CacheService.getScriptCache();
  var crudo = cache.get('catalogos');
  if (crudo) return JSON.parse(crudo);

  var centros = leerTabla_(HOJAS.centros)
    .filter(function (c) { return String(c.activo || 'SI').toUpperCase() === 'SI'; })
    .map(function (c) { return { codigo: String(c.codigo), nombre: String(c.nombre) }; });

  var servicios = {};
  leerTabla_(HOJAS.servicios).forEach(function (s) {
    servicios[String(s.id)] = String(s.nombre);
  });

  var renglones = leerTabla_(HOJAS.renglones).map(function (r, i) {
    return {
      orden: i + 1,
      id: String(r.id),
      servicioId: String(r.servicioId),
      servicioNombre: servicios[String(r.servicioId)] || String(r.servicioId),
      unidad: String(r.unidad),
      etiqueta: String(r.etiqueta),
    };
  });

  var insumoCategorias = leerTabla_(HOJAS.insumos)
    .filter(function (c) { return String(c.activo || 'SI').toUpperCase() === 'SI'; })
    .map(function (c) { return { codigo: String(c.codigo), nombre: String(c.nombre) }; });

  var listaServicios = Object.keys(servicios).map(function (id) {
    return { id: id, nombre: servicios[id] };
  });

  var datos = {
    centros: centros,
    renglones: renglones,
    servicios: listaServicios,
    insumoCategorias: insumoCategorias,
    insumoFilas: SEED_INSUMO_FILAS.map(function (f) {
      return { codigo: f[0], nombre: f[1] };
    }),
  };
  cache.put('catalogos', JSON.stringify(datos), 600);
  return datos;
}

/** Primera y ultima fila (1-based, en la hoja) de un servicio en la matriz. */
function rangoDelServicio_(servicioId) {
  var renglones = catalogos_().renglones;
  var min = 0, max = 0;
  renglones.forEach(function (r) {
    if (r.servicioId !== String(servicioId)) return;
    var fila = r.orden + 1; // +1 por el encabezado
    if (!min || fila < min) min = fila;
    if (fila > max) max = fila;
  });
  return { primera: min, ultima: max, cantidad: max ? max - min + 1 : 0 };
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

/**
 * Todo lo que la pantalla necesita al entrar: usuario, catalogos, periodo,
 * ventanas y (si es admin) el monitoreo. Una sola ida y vuelta.
 */
function apiArranque(token) {
  var u = exigirSesion_(token);
  var periodo = periodoEnCierre_();
  var resp = {
    app: APP,
    usuario: u,
    periodo: periodo,
    periodoEtiqueta: etiquetaPeriodo_(periodo),
    ventanas: { perc: ventana_('perc'), insumos: ventana_('insumos') },
    catalogos: catalogos_(),
    periodosDisponibles: periodosDisponibles_(),
  };
  if (u.rol === 'admin' || u.rol === 'monitor') {
    resp.monitoreo = monitoreo_(periodo);
  }
  return resp;
}

/** Los periodos que ya tienen hoja creada, del mas nuevo al mas viejo. */
function periodosDisponibles_() {
  var vistos = {};
  getSS_().getSheets().forEach(function (sh) {
    var m = String(sh.getName()).match(/^(?:PERC|INSUMOS) (\d{4}-\d{2})$/);
    if (m) vistos[m[1]] = true;
  });
  vistos[periodoEnCierre_()] = true;
  return Object.keys(vistos).sort().reverse();
}

// ---------------------------------------------------------------------------
// PERC: el bloque de un servicio
// ---------------------------------------------------------------------------

/** Carga el bloque de un servicio: sus renglones x todos los centros. */
function apiCargarPerc(token, servicioId, periodo) {
  var u = exigirSesion_(token);
  servicioId = String(servicioId);
  periodo = String(periodo || periodoEnCierre_());
  if (!puedeVerServicio_(u, servicioId)) {
    throw new Error('No tiene permiso sobre ese servicio.');
  }

  var rango = rangoDelServicio_(servicioId);
  if (!rango.cantidad) throw new Error('Ese servicio no tiene renglones definidos.');

  var sh = hojaPerc_(periodo);
  var centros = catalogos_().centros;
  var valores = sh
    .getRange(rango.primera, 3, rango.cantidad, centros.length)
    .getValues();

  var estado = estadoDe_(periodo, 'perc', servicioId);
  return {
    servicioId: servicioId,
    periodo: periodo,
    periodoEtiqueta: etiquetaPeriodo_(periodo),
    renglones: catalogos_().renglones.filter(function (r) {
      return r.servicioId === servicioId;
    }),
    centros: centros,
    valores: valores,
    editable: puedeCapturar_('perc', periodo, servicioId) && u.rol !== 'monitor',
    ventana: ventana_('perc'),
    autoria: estado
      ? { usuario: estado.usuario, fecha: fechaLegible_(estado.fecha) }
      : null,
  };
}

/** Guarda el bloque de un servicio. Solo toca las filas de ese servicio. */
function apiGuardarPerc(token, servicioId, periodo, valores) {
  var u = exigirSesion_(token);
  servicioId = String(servicioId);
  periodo = String(periodo);
  if (!puedeVerServicio_(u, servicioId)) throw new Error('No tiene permiso sobre ese servicio.');
  if (u.rol === 'monitor') throw new Error('Su perfil es de solo lectura.');
  if (!puedeCapturar_('perc', periodo, servicioId)) {
    return { ok: false, error: 'La captura de ' + etiquetaPeriodo_(periodo) + ' esta cerrada.' };
  }

  var rango = rangoDelServicio_(servicioId);
  var centros = catalogos_().centros;
  var limpio = normalizarMatriz_(valores, rango.cantidad, centros.length);

  // Bloqueo: si dos personas del mismo servicio guardan a la vez, una espera.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { ok: false, error: 'El sistema esta guardando otro tablero. Intente de nuevo en unos segundos.' };
  }
  try {
    var sh = hojaPerc_(periodo);
    sh.getRange(rango.primera, 3, rango.cantidad, centros.length).setValues(limpio);
  } finally {
    lock.releaseLock();
  }

  var conDatos = limpio.some(function (fila) {
    return fila.some(function (v) { return v !== '' && v !== 0; });
  });
  marcarEstado_(periodo, 'perc', servicioId, conDatos, u.usuario);
  bitacora_(u.usuario, 'Guarda PERC', servicioId + ' / ' + periodo);
  return { ok: true, autoria: { usuario: u.nombre, fecha: fechaLegible_(new Date()) } };
}

// ---------------------------------------------------------------------------
// Insumos: una sola tabla, la llena Almacen
// ---------------------------------------------------------------------------

function apiCargarInsumos(token, periodo) {
  var u = exigirSesion_(token);
  periodo = String(periodo || periodoEnCierre_());
  if (!u.insumos && u.rol !== 'admin' && u.rol !== 'monitor') {
    throw new Error('Su usuario no tiene el modulo de Insumos.');
  }
  var cat = catalogos_();
  var sh = hojaInsumos_(periodo);
  var valores = sh
    .getRange(2, 3, cat.insumoFilas.length, cat.insumoCategorias.length)
    .getValues();
  var estado = estadoDe_(periodo, 'insumos', 'ALMACEN');
  return {
    periodo: periodo,
    periodoEtiqueta: etiquetaPeriodo_(periodo),
    filas: cat.insumoFilas,
    categorias: cat.insumoCategorias,
    valores: valores,
    editable: puedeCapturar_('insumos', periodo, 'ALMACEN') && !!u.insumos,
    ventana: ventana_('insumos'),
    autoria: estado ? { usuario: estado.usuario, fecha: fechaLegible_(estado.fecha) } : null,
  };
}

function apiGuardarInsumos(token, periodo, valores) {
  var u = exigirSesion_(token);
  periodo = String(periodo);
  if (!u.insumos) throw new Error('Su usuario no tiene el modulo de Insumos.');
  if (!puedeCapturar_('insumos', periodo, 'ALMACEN')) {
    return { ok: false, error: 'La captura de Insumos de ' + etiquetaPeriodo_(periodo) + ' esta cerrada.' };
  }
  var cat = catalogos_();
  var limpio = normalizarMatriz_(valores, cat.insumoFilas.length, cat.insumoCategorias.length);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { ok: false, error: 'El sistema esta ocupado guardando. Intente de nuevo.' };
  }
  try {
    var sh = hojaInsumos_(periodo);
    sh.getRange(2, 3, limpio.length, cat.insumoCategorias.length).setValues(limpio);
  } finally {
    lock.releaseLock();
  }

  var conDatos = limpio.some(function (f) {
    return f.some(function (v) { return v !== '' && v !== 0; });
  });
  marcarEstado_(periodo, 'insumos', 'ALMACEN', conDatos, u.usuario);
  bitacora_(u.usuario, 'Guarda Insumos', periodo);
  return { ok: true, autoria: { usuario: u.nombre, fecha: fechaLegible_(new Date()) } };
}

/** Deja la matriz recibida del navegador en numeros o vacio, del tamano exacto. */
function normalizarMatriz_(valores, filas, columnas) {
  var salida = [];
  for (var i = 0; i < filas; i++) {
    var origen = (valores && valores[i]) || [];
    var fila = [];
    for (var j = 0; j < columnas; j++) {
      var v = origen[j];
      if (v === null || v === undefined || String(v).trim() === '') {
        fila.push('');
      } else {
        var n = Number(String(v).replace(/,/g, '').trim());
        fila.push(isNaN(n) ? '' : n);
      }
    }
    salida.push(fila);
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Estado y monitoreo
// ---------------------------------------------------------------------------

function estadoDe_(periodo, modulo, servicioId) {
  var lista = leerTabla_(HOJAS.estado);
  for (var i = 0; i < lista.length; i++) {
    var e = lista[i];
    if (String(e.periodo) === String(periodo) &&
        String(e.modulo) === String(modulo) &&
        String(e.servicioId) === String(servicioId)) return e;
  }
  return null;
}

/** Anota (o actualiza) quien entrego que y cuando. */
function marcarEstado_(periodo, modulo, servicioId, completo, usuario) {
  var sh = hoja_(HOJAS.estado);
  var existente = estadoDe_(periodo, modulo, servicioId);
  var valores = [periodo, modulo, servicioId, completo ? 'SI' : 'NO', usuario, new Date()];
  if (existente) sh.getRange(existente._fila, 1, 1, valores.length).setValues([valores]);
  else sh.appendRow(valores);
}

/** Avance del mes: que servicios entregaron su PERC y si Almacen entrego Insumos. */
function monitoreo_(periodo) {
  var cat = catalogos_();
  var estados = {};
  leerTabla_(HOJAS.estado).forEach(function (e) {
    if (String(e.periodo) !== String(periodo)) return;
    estados[String(e.modulo) + '__' + String(e.servicioId)] = e;
  });

  var perc = cat.servicios.map(function (s) {
    var e = estados['perc__' + s.id];
    return {
      id: s.id,
      nombre: s.nombre,
      completo: !!e && String(e.completo).toUpperCase() === 'SI',
      usuario: e ? String(e.usuario) : '',
      fecha: e ? fechaLegible_(e.fecha) : '',
    };
  });
  var eIns = estados['insumos__ALMACEN'];

  return {
    periodo: periodo,
    periodoEtiqueta: etiquetaPeriodo_(periodo),
    perc: {
      items: perc,
      total: perc.length,
      completos: perc.filter(function (p) { return p.completo; }).length,
    },
    insumos: {
      completo: !!eIns && String(eIns.completo).toUpperCase() === 'SI',
      usuario: eIns ? String(eIns.usuario) : '',
      fecha: eIns ? fechaLegible_(eIns.fecha) : '',
    },
  };
}

/** Monitoreo de cualquier mes (lo pide el admin al cambiar de periodo). */
function apiMonitoreo(token, periodo) {
  var u = exigirSesion_(token);
  if (u.rol !== 'admin' && u.rol !== 'monitor') {
    throw new Error('El monitoreo es para administracion.');
  }
  return monitoreo_(String(periodo || periodoEnCierre_()));
}

/** True si este usuario puede ver el bloque de ese servicio. */
function puedeVerServicio_(u, servicioId) {
  if (u.rol === 'admin' || u.rol === 'monitor') return true;
  return u.servicios.indexOf(String(servicioId)) !== -1;
}

// ---------------------------------------------------------------------------
// Habilitaciones y festivos (admin)
// ---------------------------------------------------------------------------

/** Abre excepcionalmente un servicio y un mes ya cerrado. */
function apiHabilitar(token, periodo, modulo, servicioId) {
  var u = exigirAdmin_(token);
  hoja_(HOJAS.habilitaciones).appendRow([
    String(periodo), String(modulo), String(servicioId), 'SI', new Date(), u.usuario,
  ]);
  bitacora_(u.usuario, 'Habilita captura', modulo + ' / ' + servicioId + ' / ' + periodo);
  return { ok: true };
}

/** Quita todas las habilitaciones de un servicio y mes. */
function apiQuitarHabilitacion(token, periodo, modulo, servicioId) {
  var u = exigirAdmin_(token);
  var sh = hoja_(HOJAS.habilitaciones);
  var lista = leerTabla_(HOJAS.habilitaciones);
  var col = columna_(HOJAS.habilitaciones, 'activa');
  lista.forEach(function (h) {
    if (String(h.periodo) === String(periodo) &&
        String(h.modulo) === String(modulo) &&
        String(h.servicioId) === String(servicioId)) {
      sh.getRange(h._fila, col).setValue('NO');
    }
  });
  bitacora_(u.usuario, 'Quita habilitacion', modulo + ' / ' + servicioId + ' / ' + periodo);
  return { ok: true };
}

/** Lista de habilitaciones vigentes de un mes. */
function apiHabilitaciones(token, periodo) {
  exigirAdmin_(token);
  return leerTabla_(HOJAS.habilitaciones)
    .filter(function (h) {
      return String(h.periodo) === String(periodo) &&
             String(h.activa).toUpperCase() !== 'NO';
    })
    .map(function (h) {
      return { modulo: String(h.modulo), servicioId: String(h.servicioId), por: String(h.por || '') };
    });
}

/** Agrega un dia festivo del hospital (no cuenta como dia habil). */
function apiAgregarFestivo(token, fecha, descripcion) {
  var u = exigirAdmin_(token);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
    return { ok: false, error: 'Use el formato 2026-08-14.' };
  }
  hoja_(HOJAS.festivos).appendRow([String(fecha), String(descripcion || '')]);
  limpiarCache_();
  bitacora_(u.usuario, 'Agrega festivo', String(fecha));
  return { ok: true };
}

function apiFestivos(token) {
  exigirSesion_(token);
  return leerTabla_(HOJAS.festivos).map(function (f) {
    return {
      fecha: f.fecha instanceof Date ? iso_(f.fecha) : String(f.fecha),
      descripcion: String(f.descripcion || ''),
    };
  });
}
