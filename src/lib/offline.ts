/**
 * GUARDAR SIN CONEXION
 *
 * Firestore guarda primero en el dispositivo y despues avisa al servidor. La
 * promesa de setDoc se resuelve cuando el SERVIDOR confirma: sin red no se
 * resuelve ni falla, se queda esperando. Si la esperaramos completa, el boton
 * quedaria en "Guardando..." para siempre y la persona pensaria que perdio su
 * trabajo, cuando en realidad ya esta a salvo en el dispositivo.
 *
 * Por eso se espera solo unos segundos:
 *  - "ok": el servidor confirmo, todo normal.
 *  - "pendiente": el dato YA quedo guardado en el dispositivo y Firestore lo
 *    enviara solo cuando vuelva la conexion. No hay nada que reintentar a mano.
 *
 * Si la confirmacion llega despues (o el servidor rechaza el cambio al llegar),
 * se avisa por los callbacks, para que la pantalla lo pueda decir.
 */
export const ESPERA_CONFIRMACION_MS = 6000;

export function estaEnLinea(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function esperarConfirmacion(
  escritura: Promise<unknown>,
  opciones: {
    ms?: number;
    alConfirmarTarde?: () => void;
    alFallarTarde?: (error: unknown) => void;
  } = {},
): Promise<"ok" | "pendiente"> {
  const { ms = ESPERA_CONFIRMACION_MS, alConfirmarTarde, alFallarTarde } = opciones;

  return new Promise((resolver, rechazar) => {
    let yaRespondio = false;
    const reloj = setTimeout(() => {
      if (yaRespondio) return;
      yaRespondio = true;
      resolver("pendiente");
    }, ms);

    escritura.then(
      () => {
        clearTimeout(reloj);
        if (yaRespondio) {
          alConfirmarTarde?.();
          return;
        }
        yaRespondio = true;
        resolver("ok");
      },
      (error) => {
        clearTimeout(reloj);
        if (yaRespondio) {
          // Ya se le dijo a la persona que quedaba pendiente: el rechazo llego
          // despues, al intentar enviarlo. Se avisa aparte, no se pierde.
          alFallarTarde?.(error);
          return;
        }
        yaRespondio = true;
        rechazar(error);
      },
    );
  });
}
