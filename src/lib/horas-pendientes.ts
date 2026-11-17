import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth } from "./firebase";
import { db } from "./firestore";
import { asignarIds, ConflictoHoras, mezclarHoras, type HorasFila } from "./horas-mezcla";
import type { HorasTemplate } from "./horas-templates";

type Edicion = {
  uid: string; userEmail: string; serviceId: string; serviceName: string; periodId: string;
  periodLabel: string; columns: string[]; base: HorasFila[]; local: HorasFila[];
  existia: boolean; editor: string;
};
type Pendiente = Edicion & { seq: number };
let apertura: Promise<IDBDatabase> | undefined;
function abrir() {
  return apertura ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("pulso-horas-pendientes", 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("ediciones")) r.result.createObjectStore("ediciones", { keyPath: "seq", autoIncrement: true }).createIndex("uid", "uid");
      if (!r.result.objectStoreNames.contains("plantillas")) r.result.createObjectStore("plantillas");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { apertura = undefined; reject(r.error); };
  });
}

async function operar<T>(modo: IDBTransactionMode, accion: (s: IDBObjectStore) => IDBRequest<T>, almacen = "ediciones"): Promise<T> {
  const base = await abrir();
  return new Promise((resolve, reject) => {
    const tx = base.transaction(almacen, modo);
    const r = accion(tx.objectStore(almacen));
    tx.oncomplete = () => resolve(r.result);
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("No se pudo conservar el borrador de Horas."));
  });
}

export function plantillaLocal(uid: string, sid: string): Promise<HorasTemplate | undefined> {
  return operar("readonly", s => s.get([uid, sid]), "plantillas");
}
export function recordarPlantilla(uid: string, t: HorasTemplate) {
  return operar("readwrite", s => s.put(t, [uid, t.serviceId]), "plantillas");
}

let editor: string;
export function guardarBorrador(datos: Omit<Edicion, "editor">) {
  editor ??= crypto.randomUUID();
  return operar("readwrite", s => s.add({ ...datos, editor }));
}
export async function pendientesHoras(uid: string): Promise<Pendiente[]> {
  return operar("readonly", s => s.index("uid").getAll(uid));
}
export function borrarEdicion(seq: number) {
  return operar("readwrite", s => s.delete(seq));
}

// Dos pestañas pueden reenviar la misma operación. La marca del editor y la
// nómina se confirman en la misma transacción para que el reenvío sea idempotente.
export async function enviarEdicion(p: Pendiente) {
  if (auth.currentUser?.uid !== p.uid) throw new Error("Cambió la sesión de captura.");
  const ref = doc(db, "horasTabulators", `${p.periodId}__${p.serviceId}`);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if ((data?.editores?.[p.editor] ?? 0) >= p.seq) return;
    if (!snap.exists() && p.existia) throw new ConflictoHoras("El tablero fue eliminado. Revise su borrador antes de volver a guardar.");
    const remoto = data && Array.isArray(data.employees)
      ? asignarIds(data.employees.map((f: Partial<HorasFila>) => ({
          id: f.id, name: f.name ?? "", dui: f.dui ?? "", docType: f.docType ?? "dui",
          comment: f.comment ?? "", hours: Object.fromEntries(Object.entries(f.hours ?? {}).map(([k,v]) => [k, String(v ?? "")])),
        }))) : p.base;
    const employees = mezclarHoras(p.base, p.local, remoto);
    tx.set(ref, { employees, periodId: p.periodId, periodLabel: p.periodLabel,
      serviceId: p.serviceId, serviceName: p.serviceName, columns: p.columns, module: "distribucion",
      userId: p.uid, userEmail: p.userEmail, updatedAt: serverTimestamp(), editores: { [p.editor]: p.seq } }, { merge: true });
  });
  await borrarEdicion(p.seq);
}

const enCurso = new Map<string, Promise<void>>();
export function sincronizarHoras(uid: string, servicio: string, periodo: string): Promise<void> {
  const clave = `${uid}/${periodo}/${servicio}`;
  const antes = enCurso.get(clave) ?? Promise.resolve();
  const tarea = antes.catch(() => {}).then(async () => {
    for (const p of await pendientesHoras(uid)) {
      if (p.serviceId === servicio && p.periodId === periodo) await enviarEdicion(p);
    }
  });
  enCurso.set(clave, tarea);
  return tarea.finally(() => { if (enCurso.get(clave) === tarea) enCurso.delete(clave); });
}
