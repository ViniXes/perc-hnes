"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SPLASH DE INICIO DE SESION
 *
 * Se muestra un par de segundos despues de un login correcto, mientras se arma
 * el panel. No es un simple 'cargando': es la primera cara que da el sistema, y
 * por eso sostiene la identidad (el pulso) y cierra con el nombre del hospital.
 * Las animaciones viven en globals.css, con las clases login-*.
 */


// =============================================================================
// Splash de INICIO DE SESION. Se muestra ~2 segundos despues de un login correcto,
// mientras se arma el panel. No es un simple "cargando": es la primera cara que da
// el sistema, asi que sostiene la identidad (el pulso) y cierra con el nombre del
// hospital. Las animaciones viven en globals.css (clases login-*).
// =============================================================================
export function LoginLoadingModal({ show }: { show: boolean }) {
  // Despedida: al cerrarse el splash, la firma ESDOMED HNES se queda 2 s mas
  // sola (crece un 20% con una estrella fugaz y se desvanece) mientras la
  // tarjeta y el fondo se retiran. Durante ese tiempo no bloquea clics.
  const [despidiendo, setDespidiendo] = useState(false);
  const estabaVisible = useRef(show);
  useEffect(() => {
    if (estabaVisible.current && !show) {
      setDespidiendo(true);
      const t = window.setTimeout(() => setDespidiendo(false), 2000);
      estabaVisible.current = show;
      return () => window.clearTimeout(t);
    }
    if (show) setDespidiendo(false);
    estabaVisible.current = show;
  }, [show]);

  if (!show && !despidiendo) return null;
  // La linea del electro. Se usa dos veces: el trazo apagado de fondo y el pulso
  // que lo recorre. Se declara una sola vez para que nunca se desincronicen.
  const EKG =
    "M0 22 H62 L70 22 L78 8 L88 38 L98 10 L106 22 H150 L158 22 L165 15 L173 30 L181 22 H220";
  const desvanecer =
    "linear-gradient(90deg, transparent 0%, #000 16%, #000 84%, transparent 100%)";

  return (
    <div
      role={despidiendo ? undefined : "dialog"}
      aria-modal={despidiendo ? undefined : true}
      aria-label={despidiendo ? undefined : "Iniciando sesion"}
      className={`fixed inset-0 z-[120] flex items-center justify-center p-4 ${despidiendo ? "pointer-events-none" : ""}`}
    >
      <div className={`absolute inset-0 bg-slate-950/85 backdrop-blur-md ${despidiendo ? "splash-retira" : "modal-fade-in"}`} />

      <div className="relative flex w-full max-w-[25rem] flex-col items-center">
      <div className={`pulso-splash relative ${despidiendo ? "splash-retira" : "modal-pop-in"} w-full max-w-[25rem] overflow-hidden rounded-[28px] border border-white/[0.07] bg-[#070d18] shadow-[0_32px_90px_-24px_rgba(0,0,0,0.95)]`}>
        {/* Luz ambiental: da profundidad sin pesar. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-sky-500/[0.22] blur-[70px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -right-16 h-52 w-52 rounded-full bg-blue-400/[0.10] blur-[70px]"
        />
        {/* Filo de luz en el borde superior. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/70 to-transparent"
        />

        <div className="relative px-8 pb-8 pt-10 text-center">
          {/* Logo con anillo de carga. El anillo gira; el logo late. */}
          <span className="relative mx-auto flex h-[92px] w-[92px] items-center justify-center">
            <span
              aria-hidden
              className="login-halo absolute inset-[18px] rounded-[20px] bg-gradient-to-br from-sky-400 to-blue-700 blur-xl"
            />
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <defs>
                <linearGradient id="pulsoRingGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#9db4d3" />
                  <stop offset="1" stopColor="#2f6fb5" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
              <g className="login-ring">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="url(#pulsoRingGrad)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="76 213"
                />
              </g>
            </svg>
            <svg viewBox="0 0 48 48" className="heartbeat relative h-[54px] w-[54px] drop-shadow-lg" aria-hidden="true">
              <defs>
                <linearGradient id="pulsoGradLogin2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#6f97cc" />
                  <stop offset="1" stopColor="#24508f" />
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pulsoGradLogin2)" />
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

          {/* Nombre y descriptor. */}
          <div className="login-rise mt-6">
            <h3 className="login-sheen text-[27px] font-bold leading-none tracking-[0.34em] [text-indent:0.34em]">
              PULSO
            </h3>
          </div>
          <p
            className="login-rise mx-auto mt-2.5 max-w-[17rem] text-[12px] font-medium leading-relaxed text-slate-400"
            style={{ animationDelay: "110ms" }}
          >
            Plataforma Única de Logística y Servicios Operativos
          </p>

          {/* Electro: la marca de la casa, ahora sin caja y desvanecido a los lados. */}
          <div
            className="login-rise mt-7"
            style={{
              animationDelay: "200ms",
              maskImage: desvanecer,
              WebkitMaskImage: desvanecer,
            }}
          >
            <svg viewBox="0 0 220 44" preserveAspectRatio="none" className="h-9 w-full" aria-hidden="true">
              <path
                className="ekg-track"
                d={EKG}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                className="ekg-pulse"
                pathLength={100}
                d={EKG}
                fill="none"
                stroke="#9db4d3"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Estado y avance. */}
          <div className="login-rise mt-5" style={{ animationDelay: "290ms" }}>
            <p className="text-[13.5px] font-semibold text-slate-100">Iniciando sesión</p>
            <p className="mt-1 text-[11.5px] text-slate-500">Preparando tu panel…</p>
            <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div className="login-progress h-full w-full rounded-full bg-gradient-to-r from-sky-300 via-sky-400 to-blue-500" />
            </div>
          </div>

          {/* Firma institucional. */}
          <div className="login-rise mt-7" style={{ animationDelay: "400ms" }}>
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.24em] text-[#7389a8]">
              Hospital Nacional El Salvador
            </p>
          </div>
        </div>
      </div>

      {/* Firma de autoria: sale de la tarjeta hacia abajo, se agranda y la cruza
          una estrella fugaz. Animaciones en globals.css (clases splash-firma-*). */}
      <p className={`splash-firma relative mt-5 overflow-hidden whitespace-nowrap rounded-full px-5 py-2 text-[12px] text-[#9db4d3] ${despidiendo ? "splash-firma-despide" : ""}`}>
        Desarrollado e implementado por{" "}
        <span className="font-bold tracking-[0.1em] text-[#f5f7fa]">ESDOMED HNES</span>
        {/* La key cambia en la despedida para relanzar la estrella fugaz. */}
        <span key={despidiendo ? "despedida" : "entrada"} aria-hidden className={despidiendo ? "splash-estrella splash-estrella-despide" : "splash-estrella"} />
      </p>
      </div>
    </div>
  );
}
