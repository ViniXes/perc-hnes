// =============================================================================
// Clave temporal aleatoria (sirve en el navegador y en el servidor).
// -----------------------------------------------------------------------------
// Cada cuenta nueva, cada reseteo y cada recuperación de acceso recibe una clave
// DISTINTA, generada con el generador criptográfico (crypto.getRandomValues).
// Nunca se guarda en Firestore ni se escribe en logs: solo se muestra al admin
// que hizo el cambio y se envía por correo. La persona la cambia al entrar
// (mustChangePassword).
//
// 12 caracteres: mayúsculas, minúsculas y números, sin los que se confunden al
// leerlos o dictarlos (0/O/o, 1/l/I). Siempre trae al menos uno de cada tipo.
// =============================================================================

const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I ni O
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz"; // sin l ni o
const NUMEROS = "23456789"; // sin 0 ni 1
const TODOS = MAYUSCULAS + MINUSCULAS + NUMEROS;

export const LARGO_CLAVE_TEMPORAL = 12;

/** Entero uniforme en [0, max) sin sesgo de módulo. */
function aleatorio(max: number): number {
  const limite = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limite) return buf[0] % max;
  }
}

function elegir(conjunto: string): string {
  return conjunto.charAt(aleatorio(conjunto.length));
}

/** Clave temporal nueva, p. ej. "Hq7mKx3TzeR9". */
export function generarClaveTemporal(largo: number = LARGO_CLAVE_TEMPORAL): string {
  const chars = [elegir(MAYUSCULAS), elegir(MINUSCULAS), elegir(NUMEROS)];
  while (chars.length < largo) chars.push(elegir(TODOS));
  // Mezcla (Fisher-Yates) para que los obligatorios no queden siempre al inicio.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = aleatorio(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
