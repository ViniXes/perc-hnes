import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  terminate,
  type Firestore,
} from "firebase/firestore";
import app, { firestoreDatabaseId } from "@/lib/firebase";

// La pantalla ya maneja los errores de disponibilidad de Firestore.
setLogLevel("silent");

/**
 * CAPTURA SIN CONEXION
 *
 * PULSO se usa en servicios donde la senal se cae. Con la cache persistente:
 *
 *  - Lo que ya se abrio una vez se vuelve a abrir sin red (sale de la cache del
 *    dispositivo), asi que el tabulador no aparece vacio.
 *  - Lo que se guarda sin red queda escrito en el dispositivo y Firestore lo
 *    envia solo cuando la conexion vuelve, aunque se haya cerrado la aplicacion
 *    o apagado la computadora en el intermedio.
 *
 * 'persistentMultipleTabManager' permite tener PULSO abierto en varias pestanas
 * sin que se peleen por la misma cache. En el servidor (render de Next) no hay
 * IndexedDB, y si el navegador la tiene bloqueada (modo privado) tampoco: en
 * esos dos casos se cae de vuelta a la version en memoria de siempre, que
 * funciona igual mientras haya red.
 */
function crearFirestore(): Firestore {
  if (typeof window === "undefined") {
    return getFirestore(app, firestoreDatabaseId);
  }
  try {
    return initializeFirestore(
      app,
      { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
      firestoreDatabaseId,
    );
  } catch {
    return getFirestore(app, firestoreDatabaseId);
  }
}

export const db = crearFirestore();

let firestoreTerminated = false;

export async function shutdownFirestore() {
  if (firestoreTerminated) {
    return;
  }

  firestoreTerminated = true;

  try {
    await terminate(db);
  } catch {
    // Ignore repeated termination attempts and shutdown races.
  }
}
