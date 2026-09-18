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
  if (!show) return null;
  // La linea del electro. Se usa dos veces: el trazo apagado de fondo y el pulso
  // que lo recorre. Se declara una sola vez para que nunca se desincronicen.
  const EKG =
    "M0 22 H62 L70 22 L78 8 L88 38 L98 10 L106 22 H150 L158 22 L165 15 L173 30 L181 22 H220";
  const desvanecer =
    "linear-gradient(90deg, transparent 0%, #000 16%, #000 84%, transparent 100%)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Iniciando sesion"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
    >
      <div className="modal-fade-in absolute inset-0 bg-slate-950/85 backdrop-blur-md" />

      <div className="modal-pop-in relative w-full max-w-[25rem] overflow-hidden rounded-[28px] border border-white/[0.07] bg-[#070d18] shadow-[0_32px_90px_-24px_rgba(0,0,0,0.95)]">
        {/* Luz ambiental: da profundidad sin pesar. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-cyan-500/[0.18] blur-[70px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -right-16 h-52 w-52 rounded-full bg-violet-600/[0.14] blur-[70px]"
        />
        {/* Filo de luz en el borde superior. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent"
        />

        <div className="relative px-8 pb-8 pt-10 text-center">
          {/* Logo con anillo de carga. El anillo gira; el logo late. */}
          <span className="relative mx-auto flex h-[92px] w-[92px] items-center justify-center">
            <span
              aria-hidden
              className="login-halo absolute inset-[18px] rounded-[20px] bg-gradient-to-br from-cyan-400 to-violet-600 blur-xl"
            />
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <defs>
                <linearGradient id="pulsoRingGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#22d3ee" />
                  <stop offset="1" stopColor="#8b5cf6" />
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
                  <stop offset="0" stopColor="#22d3ee" />
                  <stop offset="1" stopColor="#7c3aed" />
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
                stroke="#22d3ee"
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
              <div className="login-progress h-full w-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500" />
            </div>
          </div>

          {/* Firma institucional. */}
          <p
            className="login-rise mt-7 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-slate-600"
            style={{ animationDelay: "400ms" }}
          >
            Hospital Nacional El Salvador · ESDOMED
          </p>
        </div>
      </div>
    </div>
  );
}
