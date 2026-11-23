// Cierre por inactividad y borradores locales.
//
// PULSO cierra la sesion tras 1 h 30 min sin actividad (ver page.tsx,
// "CIERRE POR INACTIVIDAD"). Para que nadie pierda lo que estaba haciendo:
// - PERC, SEPS, Horas, listas del Comite, POA y control de documentos se
//   guardan en Firestore justo antes de cerrar.
// - Memos y Personal desvinculado dejan un borrador en este equipo
//   (localStorage, por usuario) mientras se escribe, y lo recuperan al volver.
// - La pantalla en la que estaba la persona se recuerda para volver ahi.

export const INACTIVIDAD_MS = 90 * 60 * 1000;
/** Aviso con cuenta regresiva antes del cierre. */
export const AVISO_INACTIVIDAD_MS = 2 * 60 * 1000;

const CLAVE_ACTIVIDAD = "pulso.ultimaActividad";
const CLAVE_VOLVER = "pulso.volverA";
const PREFIJO_BORRADOR = "pulso.borrador.";
/** Un borrador local mas viejo que esto ya no se ofrece. */
const VIGENCIA_BORRADOR_MS = 30 * 24 * 60 * 60 * 1000;

export function leerUltimaActividad(): number {
  try {
    return Number.parseInt(window.localStorage.getItem(CLAVE_ACTIVIDAD) || "", 10) || 0;
  } catch {
    return 0;
  }
}

export function escribirUltimaActividad(momento: number) {
  try {
    window.localStorage.setItem(CLAVE_ACTIVIDAD, String(momento));
  } catch {
    // Sin almacenamiento (modo privado): cuenta solo esta pestana.
  }
}

/** Recuerda la pantalla abierta al cerrar por inactividad (vale 7 dias). */
export function guardarPantallaParaVolver(uid: string, seccion: string) {
  try {
    window.localStorage.setItem(CLAVE_VOLVER, JSON.stringify({ uid, seccion, hasta: Date.now() + 7 * 86400000 }));
  } catch {
    // Ignorar.
  }
}

/** Devuelve (y olvida) la pantalla a la que volver, si es de este usuario. */
export function tomarPantallaParaVolver(uid: string): string | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_VOLVER);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as { uid?: string; seccion?: string; hasta?: number };
    if (dato.uid !== uid) return null;
    window.localStorage.removeItem(CLAVE_VOLVER);
    if (!dato.seccion || !dato.hasta || dato.hasta < Date.now()) return null;
    return dato.seccion;
  } catch {
    return null;
  }
}

function claveBorrador(usuario: string, nombre: string) {
  return `${PREFIJO_BORRADOR}${usuario.trim().toLowerCase()}.${nombre}`;
}

export function guardarBorrador(usuario: string, nombre: string, valor: unknown) {
  if (!usuario) return;
  try {
    window.localStorage.setItem(claveBorrador(usuario, nombre), JSON.stringify({ guardado: Date.now(), valor }));
  } catch {
    // Lleno o sin almacenamiento: se pierde solo el respaldo local.
  }
}

export function leerBorrador<T>(usuario: string, nombre: string): T | null {
  if (!usuario) return null;
  try {
    const crudo = window.localStorage.getItem(claveBorrador(usuario, nombre));
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as { guardado?: number; valor?: T };
    if (!dato.guardado || Date.now() - dato.guardado > VIGENCIA_BORRADOR_MS) {
      window.localStorage.removeItem(claveBorrador(usuario, nombre));
      return null;
    }
    return dato.valor ?? null;
  } catch {
    return null;
  }
}

export function borrarBorrador(usuario: string, nombre: string) {
  if (!usuario) return;
  try {
    window.localStorage.removeItem(claveBorrador(usuario, nombre));
  } catch {
    // Ignorar.
  }
}
