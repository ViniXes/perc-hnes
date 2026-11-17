export type HorasFila = {
  id: string; name: string; dui: string; docType: "dui" | "nit"; comment: string;
  hours: Record<string, string>;
};

export function asignarIds<T extends { name: string; id?: string }>(filas: T[]): (T & { id: string })[] {
  const vistos = new Map<string, number>();
  return filas.map(fila => {
    const nombre = fila.name.trim().normalize("NFC").toLowerCase();
    const n = (vistos.get(nombre) ?? 0) + 1;
    vistos.set(nombre, n);
    return { ...fila, id: fila.id || `legado:${nombre}:${n}` };
  });
}

function misma(a?: HorasFila, b?: HorasFila) {
  if (!a || !b) return a === b;
  return a.name === b.name && a.dui === b.dui && a.docType === b.docType && a.comment === b.comment &&
    [...new Set([...Object.keys(a.hours), ...Object.keys(b.hours)])].every(k => (a.hours[k] ?? "") === (b.hours[k] ?? ""));
}

export class ConflictoHoras extends Error {}

export function mezclarHoras(base: HorasFila[], local: HorasFila[], remoto: HorasFila[]) {
  const indice = (filas: HorasFila[]) => new Map(filas.map(f => [f.id, f]));
  const antes = indice(base), editadas = indice(local), actuales = indice(remoto);
  const resultado: HorasFila[] = [];
  for (const id of new Set([...actuales.keys(), ...editadas.keys(), ...antes.keys()])) {
    const b = antes.get(id), l = editadas.get(id), r = actuales.get(id);
    const conflicto = (campo: string) => new ConflictoHoras(
      `Cambio simultáneo en ${l?.name || r?.name || b?.name || "una fila"} (${campo}). Conserve su Excel y recupere la versión del servidor para conciliar.`);
    if (misma(l, b) || misma(l, r)) { if (r) resultado.push(r); continue; }
    if (misma(r, b)) { if (l) resultado.push(l); continue; }
    if (!b || !l || !r) throw conflicto("fila agregada o eliminada");
    function elegir<T>(anterior: T, digitado: T, actual: T, campo: string): T {
      if (digitado === anterior || digitado === actual) return actual;
      if (actual === anterior) return digitado;
      throw conflicto(campo);
    }
    const hours: Record<string, string> = {};
    for (const col of new Set([...Object.keys(b.hours), ...Object.keys(l.hours), ...Object.keys(r.hours)])) {
      hours[col] = elegir(b.hours[col] ?? "", l.hours[col] ?? "", r.hours[col] ?? "", col);
    }
    resultado.push({ id, hours, name: elegir(b.name, l.name, r.name, "nombre"),
      dui: elegir(b.dui, l.dui, r.dui, "documento"), docType: elegir(b.docType, l.docType, r.docType, "tipo de documento"),
      comment: elegir(b.comment, l.comment, r.comment, "comentario") });
  }
  return resultado;
}
