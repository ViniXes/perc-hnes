"use client";

import { useEffect, useRef, useState } from "react";

// Registra el service worker SOLO en produccion y muestra un modal elegante
// cuando hay una nueva version disponible. La actualizacion simula el pulso
// de un monitor cardiaco mientras se aplica.
export default function ServiceWorkerRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const [updating, setUpdating] = useState(false);
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
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              promptUpdate(installing);
            }
          });
        });
      } catch {
        // Ignorar fallos de registro (no debe romper la app).
      }
    };

    // Cuando el SW nuevo toma control, recargar (solo si el usuario lo pidio).
    const onControllerChange = () => {
      if (!updatingRef.current || reloadedRef.current) return;
      reloadedRef.current = true;
      window.location.reload();
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

  const handleUpdate = () => {
    updatingRef.current = true;
    setUpdating(true);
    waitingRef.current?.postMessage({ type: "SKIP_WAITING" });
    // Respaldo: si controllerchange no dispara, recargar igual.
    window.setTimeout(() => {
      if (!reloadedRef.current) {
        reloadedRef.current = true;
        window.location.reload();
      }
    }, 3500);
  };

  if (!updateReady) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nueva version disponible"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <div className="modal-fade-in absolute inset-0 bg-slate-950/75 backdrop-blur-sm" />

      <div className="modal-pop-in relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#0e1626] shadow-2xl shadow-black/60">
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-violet-500" />

        <div className="px-6 pb-6 pt-7 text-center">
          {/* Icono PULSO con latido */}
          <span className="relative mx-auto flex h-16 w-16 items-center justify-center">
            <span
              aria-hidden
              className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-600 opacity-50 blur-lg"
            />
            <svg
              viewBox="0 0 48 48"
              className={`relative h-16 w-16 drop-shadow-lg ${updating ? "heartbeat" : ""}`}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="pulsoGradUpd" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#22d3ee" />
                  <stop offset="1" stopColor="#7c3aed" />
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

          {updating ? (
            <>
              <h3 className="mt-5 text-lg font-semibold text-white">Actualizando…</h3>
              <p className="mt-1 text-sm text-slate-400">
                Aplicando la nueva versión, un momento.
              </p>

              {/* Monitor cardiaco: la linea de pulso se dibuja en bucle. */}
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
                <svg
                  viewBox="0 0 200 60"
                  preserveAspectRatio="none"
                  className="h-12 w-full"
                  aria-hidden="true"
                >
                  <path
                    className="ekg-track"
                    d="M0 30 H58 L66 30 L74 12 L84 48 L94 16 L102 30 H138 L146 30 L153 22 L161 40 L169 30 H200"
                    fill="none"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    className="ekg-pulse"
                    pathLength={100}
                    d="M0 30 H58 L66 30 L74 12 L84 48 L94 16 L102 30 H138 L146 30 L153 22 L161 40 L169 30 H200"
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </>
          ) : (
            <>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-300/80">
                PULSO
              </p>
              <h3 className="mt-1 text-xl font-semibold text-white">
                Nueva versión disponible
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Hay una actualización lista. Actualizá para tener las últimas mejoras.
              </p>

              <button
                type="button"
                onClick={handleUpdate}
                className="mt-6 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/30 transition hover:opacity-90"
              >
                Actualizar ahora
              </button>
              <button
                type="button"
                onClick={() => setUpdateReady(false)}
                className="mt-2 w-full rounded-2xl px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200"
              >
                Más tarde
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
