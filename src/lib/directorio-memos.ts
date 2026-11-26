/**
 * DIRECTORIO PARA LOS MEMOS: nombres y cargos que se sugieren al escribir en
 * PARA, DE, CC., VÍA… (p. ej. al teclear «H» sale «Ing. Heber Benjamín Cardoza
 * Guevara · Jefe de ESDOMED»).
 *
 * Fuentes, en este orden de preferencia (la primera trae título y cargo formal):
 *  1) las personas que ya aparecen en memos guardados;
 *  2) las cuentas de PULSO (serviceUsers), que solo puede leer un administrador.
 * Cuando un administrador abre Memorándums se publica la lista en
 * memoDirectorio/personas (solo nombre y cargo, nada más del perfil) para que la
 * Jefatura de Consulta Externa también tenga sugerencias.
 */

import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";
import { MEMO_AREAS, type MemoPersona } from "@/lib/memo-esdomed";

export const DIRECTORIO_DOC = ["memoDirectorio", "personas"] as const;

const TITULOS = /^(dr|dra|ing|inga|lic|licda|licdo|msc|mg|mgs|mtro|mtra|tec|arq|sr|sra|srta|enf|prof|profa)\.?$/;

export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave para no repetir a la misma persona con o sin título. */
function clave(nombre: string): string {
  return normalizarTexto(nombre)
    .split(" ")
    .filter((p) => p && !TITULOS.test(p))
    .join(" ");
}

function limpia(p: MemoPersona): MemoPersona | null {
  const nombre = String(p?.nombre ?? "").trim().replace(/\s+/g, " ");
  const cargo = String(p?.cargo ?? "").trim();
  if (nombre.length < 4 || nombre.length > 120) return null;
  return { nombre, cargo: cargo.slice(0, 200) };
}

/** Une listas sin repetir personas; gana la primera que trae cargo. */
export function unirPersonas(...listas: MemoPersona[][]): MemoPersona[] {
  const mapa = new Map<string, MemoPersona>();
  for (const lista of listas) {
    for (const cruda of lista) {
      const p = limpia(cruda);
      if (!p) continue;
      const k = clave(p.nombre);
      if (!k) continue;
      const ya = mapa.get(k);
      if (!ya || (!ya.cargo && p.cargo)) mapa.set(k, p);
    }
  }
  return [...mapa.values()].sort((a, b) => clave(a.nombre).localeCompare(clave(b.nombre)));
}

/** Personas de los encabezados de una lista de memos. */
export function personasDeMemos(memos: { bloques?: { personas?: MemoPersona[] }[] }[]): MemoPersona[] {
  return memos.flatMap((m) => (m.bloques ?? []).flatMap((b) => b.personas ?? []));
}

/** Remitentes y destinatarios fijos de cada área (siempre disponibles). */
export function personasFijas(): MemoPersona[] {
  return [
    ...Object.values(MEMO_AREAS).flatMap((a) => [a.de, ...(a.para ? [a.para] : [])]),
    // Recibe copia de los memos que la nombran (bandeja SIS).
    { nombre: "Dra. Katherinne Estefanía Gil Flores", cargo: "Médico Implementador del SIS" },
  ];
}

/**
 * Sugerencias para lo que se va escribiendo: cada palabra escrita debe ser el
 * comienzo de alguna palabra del nombre (sin tildes). «h» → Heber, Hernández…
 */
export function buscarPersonas(lista: MemoPersona[], texto: string, max = 8): MemoPersona[] {
  const q = normalizarTexto(texto).split(" ").filter(Boolean);
  if (q.length === 0) return [];
  const exacto = normalizarTexto(texto);
  return lista
    .filter((p) => {
      const palabras = normalizarTexto(p.nombre).split(" ");
      return normalizarTexto(p.nombre) !== exacto && q.every((t) => palabras.some((w) => w.startsWith(t)));
    })
    .slice(0, max);
}

type Perfil = Record<string, unknown>;

function cargoDePerfil(p: Perfil): string {
  const servicio = String(p.serviceName ?? "").trim();
  if (!servicio) return "";
  if (p.isChief === true && !/^(jef|subjef|direc|subdirec|coordin)/i.test(servicio)) return `Jefe de ${servicio}`;
  return servicio;
}

/** Lee el directorio publicado (si las reglas lo permiten). */
export async function leerDirectorio(db: Firestore): Promise<MemoPersona[]> {
  try {
    const snap = await getDoc(doc(db, ...DIRECTORIO_DOC));
    const lista = snap.exists() ? (snap.data().lista as MemoPersona[] | undefined) : undefined;
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/**
 * Solo funciona para administradores (pueden leer serviceUsers y todos los
 * memos). Arma la lista y la publica si cambió. Cualquier error se ignora: las
 * sugerencias son una ayuda, nunca deben trabar el memo.
 */
export async function publicarDirectorio(db: Firestore, colecciones: string[]): Promise<MemoPersona[] | null> {
  try {
    const usuarios = await getDocs(collection(db, "serviceUsers"));
    const deCuentas: MemoPersona[] = usuarios.docs
      .map((d) => d.data() as Perfil)
      .filter((p) => p.isActive !== false && p.isMinsal !== true)
      .map((p) => ({ nombre: String(p.name ?? "").trim(), cargo: cargoDePerfil(p) }));
    const deMemos: MemoPersona[] = [];
    for (const c of colecciones) {
      try {
        const s = await getDocs(collection(db, c));
        deMemos.push(...personasDeMemos(s.docs.map((d) => d.data() as { bloques?: { personas?: MemoPersona[] }[] })));
      } catch {
        // Sin acceso a esa colección: se sigue con lo demás.
      }
    }
    const lista = unirPersonas(personasFijas(), deMemos, deCuentas);
    const actual = await leerDirectorio(db);
    if (JSON.stringify(actual) !== JSON.stringify(lista)) {
      await setDoc(doc(db, ...DIRECTORIO_DOC), { lista, updatedAt: serverTimestamp() });
    }
    return lista;
  } catch {
    return null;
  }
}
