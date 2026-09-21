"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APP_VERSION } from "@/lib/version";

/**
 * AVISO DE NUEVA VERSION
 *
 * Registra el service worker (solo en produccion) y, cuando hay una version
 * nueva esperando, la ofrece en vez de aplicarla a la fuerza: alguien puede
 * estar a mitad de una captura.
 *
 * Al aceptar, la actualizacion se muestra en cuatro pasos reales —preparar,
 * traer la version nueva, limpiar la anterior y reiniciar— repartidos en cinco
 * segundos. El tiempo es fijo a proposito: el navegador no informa el avance de
 * un service worker, y una barra honesta seria un salto seco de 0 a 100. Cinco
 * segundos alcanzan para leer que paso y para que el cambio no se sienta un
 * parpadeo.
 */

const PASOS = [
  "Preparando la actualización",
  "Trayendo la versión nueva",
  "Limpiando la versión anterior",
  "Reiniciando PULSO",
] as const;

const DURACION_PASO_MS = 1250;
const RADIO = 52;
const PERIMETRO = 2 * Math.PI * RADIO;

export default function ServiceWorkerRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [meta, setMeta] = useState(0);
  const [mostrado, setMostrado] = useState(0);
  const waitingRef = useRef<ServiceWorker | null>(null);
  const updatingRef = useRef(false);
  const reloadedRef = useRef(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;

    const promptUpdate = (worker: ServiceWorker | null) => {
      if (!worker) return;
      waitingRef.current = worker;
      setUpdateReady(true);
    };

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js");

        // Ya hay una version esperando (update detectado en una visita previa).
        if (registration.waiting && navigator.serviceWorker.controller) {
          promptUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration?.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // "installed" + ya hay controller => es una ACTUALIZACION (no la 1a vez).
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              promptUpdate(installing);
            }
          });
        });
      } catch {
        // Ignorar fallos de registro (no debe romper la app).
      }
    };

    // El service worker nuevo ya tomo control. NO se recarga aca: la recarga la
    // dispara la animacion al llegar al final, para que no se corte a la mitad.
    const onControllerChange = () => {
      if (!updatingRef.current) return;
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Revisar updates al volver a primer plano.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
    }

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("load", register);
    };
  }, []);

  // El numero no salta: va contando hasta la meta del paso en curso.
  useEffect(() => {
    if (mostrado === meta) return;
    let cancelado = false;
    const desde = mostrado;
    const inicio = performance.now();
    const duracion = 650;
    const animar = (ahora: number) => {
      if (cancelado) return;
      const t = Math.min(1, (ahora - inicio) / duracion);
      const suave = 1 - Math.pow(1 - t, 3);
      setMostrado(Math.round(desde + (meta - desde) * suave));
      if (t < 1) requestAnimationFrame(animar);
    };
    const id = requestAnimationFrame(animar);
    return () => {
      cancelado = true;
      cancelAnimationFrame(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const recargar = useCallback(() => {
    if (reloadedRef.current) return;
    reloadedRef.current = true;
    window.location.reload();
  }, []);

  const handleUpdate = () => {
    updatingRef.current = true;
    setUpdating(true);
    waitingRef.current?.postMessage({ type: "SKIP_WAITING" });

    const relojes: number[] = [];
    [25, 50, 75, 100].forEach((valor, indice) => {
      relojes.push(
        window.setTimeout(() => setMeta(valor), DURACION_PASO_MS * (indice + 1)),
      );
    });
    // Al terminar la animacion se recarga. El respaldo cubre el caso raro de que
    // algo se trabe: nadie se queda mirando la rueda para siempre.
    relojes.push(window.setTimeout(recargar, DURACION_PASO_MS * 4 + 600));
    relojes.push(window.setTimeout(recargar, 9000));
  };

  if (!updateReady) return null;

  const pasoActual = Math.min(PASOS.length - 1, Math.floor(mostrado / 25));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nueva versión disponible"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    >
      <div className="modal-fade-in absolute inset-0 bg-slate-950/80 backdrop-blur-md" />

      <div className="modal-pop-in relative w-full max-w-[400px] overflow-hidden rounded-[28px] border border-white/10 border-t-white/[0.18] bg-gradient-to-b from-[#16203a] to-[#0d1424] shadow-[0_1px_1px_rgba(0,0,0,0.5),0_40px_80px_-30px_rgba(0,0,0,0.95)]">
        {/* Filo superior: el acento de la marca, fino. */}
        <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-teal-300 to-transparent" />

        {updating ? (
          <div className="px-8 pb-8 pt-9 text-center">
            {/* Anillo de avance. El numero va adentro; los pasos, abajo. */}
            <div className="relative mx-auto h-[132px] w-[132px]">
              <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle
                  cx="66"
                  cy="66"
                  r={RADIO}
                  fill="none"
                  stroke="rgba(255,255,255,0.07)"
                  strokeWidth="6"
                />
                <circle
                  cx="66"
                  cy="66"
                  r={RADIO}
                  fill="none"
                  stroke="url(#anilloPulso)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={PERIMETRO}
                  strokeDashoffset={PERIMETRO * (1 - mostrado / 100)}
                  style={{ transition: "stroke-dashoffset 650ms cubic-bezier(0.22,1,0.36,1)" }}
                />
                <defs>
                  <linearGradient id="anilloPulso" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#2dd4bf" />
                    <stop offset="1" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[34px] font-bold leading-none tabular-nums text-white">
                  {mostrado}
                  <span className="text-[17px] font-semibold text-slate-400">%</span>
                </span>
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-300/70">
                  PULSO
                </span>
              </div>
            </div>

            <p
              className="mt-6 text-[15px] font-semibold text-white"
              role="status"
              aria-live="polite"
            >
              {PASOS[pasoActual]}
            </p>

            {/* Los cuatro pasos, para que se vea que avanza y no que se colgo. */}
            <div className="mt-5 space-y-2 text-left">
              {PASOS.map((paso, indice) => {
                const hecho = mostrado >= (indice + 1) * 25;
                const enCurso = !hecho && indice === pasoActual;
                return (
                  <div key={paso} className="flex items-center gap-2.5">
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition ${
                        hecho
                          ? "bg-teal-400/20 text-teal-300"
                          : enCurso
                            ? "bg-white/[0.06] text-slate-400"
                            : "bg-white/[0.03] text-slate-600"
                      }`}
                    >
                      {hecho ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className="h-[11px] w-[11px]">
                          <path d="m5 13 4 4L19 7" />
                        </svg>
                      ) : enCurso ? (
                        <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-teal-300" />
                      ) : (
                        <span className="h-[5px] w-[5px] rounded-full bg-current" />
                      )}
                    </span>
                    <span
                      className={`text-[12.5px] transition ${
                        hecho ? "text-slate-300" : enCurso ? "text-white" : "text-slate-600"
                      }`}
                    >
                      {paso}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="mt-6 text-[11px] text-slate-500">
              No cierres PULSO. Se reinicia solo al terminar.
            </p>
          </div>
        ) : (
          <div className="px-8 pb-8 pt-9 text-center">
            <span className="relative mx-auto flex h-16 w-16 items-center justify-center">
              <span
                aria-hidden
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-300 to-cyan-500 opacity-40 blur-lg"
              />
              <svg viewBox="0 0 48 48" className="relative h-16 w-16 drop-shadow-lg" aria-hidden="true">
                <defs>
                  <linearGradient id="pulsoGradUpd" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#2dd4bf" />
                    <stop offset="1" stopColor="#0891b2" />
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pulsoGradUpd)" />
                <path
                  d="M7 25 H16 L19.5 15 L25 35 L29 25 H41"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>

            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.28em] text-teal-300/80">
              Actualización disponible
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">Hay una versión nueva</h3>
            <p className="mt-2.5 text-[13.5px] leading-6 text-slate-400">
              Trae las últimas mejoras del sistema. Tarda unos segundos y PULSO se reinicia solo.
            </p>

            <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
              Ahora tenés la {APP_VERSION}
            </span>

            <button
              type="button"
              onClick={handleUpdate}
              className="mt-6 w-full rounded-2xl bg-[#1f6f68] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-black/30 ring-1 ring-inset ring-white/10 transition hover:bg-[#25807a]"
            >
              Actualizar ahora
            </button>
            <button
              type="button"
              onClick={() => setUpdateReady(false)}
              className="mt-2 w-full rounded-2xl px-4 py-2 text-[13px] font-medium text-slate-400 transition hover:text-slate-200"
            >
              Más tarde
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
