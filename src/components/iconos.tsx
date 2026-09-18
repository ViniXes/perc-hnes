/**
 * ICONOS DE PULSO
 *
 * Todos los SVG que usa la aplicacion, escritos a mano y sin librerias: los de
 * cada servicio, los del menu lateral, los de los submenus y la marca PULSO.
 *
 * Van con trazo 'currentColor', asi que heredan el color del texto y se ven
 * igual en modo claro y en modo oscuro sin duplicar nada. Para agregar un
 * servicio nuevo basta con sumar su dibujo a SERVICE_ICON_PATHS y apuntarle
 * desde SERVICE_ICON_BY_ID.
 */
import type { ReactNode } from "react";

// --- Iconos SVG por servicio (reemplazan a los emojis) -----------------------
// Trazos tipo "lucide": stroke currentColor, hereda el color del texto.
export const SERVICE_ICON_PATHS: Record<string, ReactNode> = {
  syringe: (
    <>
      <path d="m18 2 4 4" /><path d="m17 7 3-3" />
      <path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" />
      <path d="m9 11 4 4" /><path d="m5 19-3 3" /><path d="m14 4 6 6" />
    </>
  ),
  flask: (
    <>
      <path d="M14.5 2v17.5a2.5 2.5 0 0 1-5 0V2" /><path d="M8.5 2h7" /><path d="M14.5 16h-5" />
    </>
  ),
  scan: (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </>
  ),
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  wind: (
    <>
      <path d="M12.8 19.6A2 2 0 1 0 14 16H2" /><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
      <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
    </>
  ),
  droplet: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  heart: (
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  ),
  pill: (
    <>
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </>
  ),
  face: (
    <>
      <circle cx="12" cy="12" r="9" /><path d="M9 10h.01" /><path d="M15 10h.01" />
      <path d="M9 15c1 1 2 1 3 1s2 0 3-1" />
    </>
  ),
  utensils: (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2" /><path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </>
  ),
  recycle: (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" />
    </>
  ),
  leaf: (
    <>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
    </>
  ),
  sparkles: (
    <path d="m12 3-1.9 5.8-5.8 1.9 5.8 1.9L12 18l1.9-5.8 5.8-1.9-5.8-1.9z" />
  ),
  package: (
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
    </>
  ),
  shirt: (
    <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
  ),
  truck: (
    <>
      <path d="M10 17h4V5H2v12h3" />
      <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1" />
      <circle cx="7.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  book: (
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  ),
  cross: (
    <path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z" />
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88" /><path d="M14.47 14.48 20 20" /><path d="M8.12 8.12 12 12" />
    </>
  ),
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01" />
      <path d="M10 21v-3a2 2 0 0 1 4 0v3" />
    </>
  ),
};

export const SERVICE_ICON_BY_ID: Record<string, keyof typeof SERVICE_ICON_PATHS> = {
  vacunacion: "syringe",
  "laboratorio-clinico": "flask",
  radiologia: "scan",
  "estudios-gastroclinicos": "search",
  "terapia-fisica": "activity",
  "terapia-respiratoria": "wind",
  "banco-de-sangre": "droplet",
  "unidad-de-hemodinamia": "heart",
  hemodialisis: "droplet",
  "hemodialisis-medicina-interna": "droplet",
  "servicio-farmaceutico": "pill",
  "rehablitacion-psicosocial": "face",
  "alimentacion-y-dieta": "utensils",
  "central-de-esterilizacion": "recycle",
  "saneamiento-ambiental": "leaf",
  aseo: "sparkles",
  almacen: "package",
  "almacen-medicamentos": "pill",
  lavanderia: "shirt",
  "transporte-general": "truck",
  mantenimiento: "wrench",
  "trabajo-social": "users",
  "maxima-emergencia": "cross",
  "centro-quirurgico": "scissors",
  "clinica-de-empleados": "activity",
  "asesores-de-medicamentos": "clipboard",
  esdomed: "clipboard",
};

export function ServiceIcon({
  serviceId,
  className = "h-4 w-4",
}: {
  serviceId: string | null | undefined;
  className?: string;
}) {
  const key = (serviceId && SERVICE_ICON_BY_ID[serviceId]) || "building";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {SERVICE_ICON_PATHS[key]}
    </svg>
  );
}

// Logo de PULSO (solo la marca, sin texto): badge en degradado con linea de pulso.
export function PulsoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pulsoMarkGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pulsoMarkGrad)" />
      <path
        d="M7 25 H16 L19.5 15 L25 35 L29 25 H41"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Iconos del menu lateral (SVG inline, sin dependencias). Heredan el color del
// texto via `currentColor`, asi funcionan igual en modo claro y oscuro y en el
// estado activo. Tamano fijo 18px para encajar en el badge de 32px.
export const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconHome = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </svg>
);

export const IconClock = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconGear = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
  </svg>
);

export const IconFile = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M6 2.5h7l5 5V21a.5.5 0 0 1-.5.5H6A.5.5 0 0 1 5.5 21V3A.5.5 0 0 1 6 2.5Z" />
    <path d="M13 2.5V8h5" />
    <path d="M8.5 13h7M8.5 16.5h7" />
  </svg>
);

export const IconUsers = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16 14.6c2.4.2 4.5 2 4.5 4.9" />
  </svg>
);

export const IconLogout = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M14 4.5H6.5A.5.5 0 0 0 6 5v14a.5.5 0 0 0 .5.5H14" />
    <path d="M10.5 12h10" />
    <path d="m17.5 8.5 3.5 3.5-3.5 3.5" />
  </svg>
);

export const IconKey = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="8" cy="8" r="4.2" />
    <path d="M11 11 19.5 19.5" />
    <path d="M16.5 16.5 18.5 14.5M18.5 18.5 20.5 16.5" />
  </svg>
);

export const IconMoon = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </svg>
);

// Headset tipo call center (Centro de Soporte).
export const IconHeadset = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
    <path d="M4 14.5a2 2 0 0 1 2-2h1v5H6a2 2 0 0 1-2-2v-1Z" />
    <path d="M20 14.5a2 2 0 0 0-2-2h-1v5h1a2 2 0 0 0 2-2v-1Z" />
    <path d="M20 17v1.5a2.5 2.5 0 0 1-2.5 2.5H13" />
  </svg>
);

// Iconos de categoria del Centro de Soporte.
export const IconSupportBug = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <rect x="8" y="8" width="8" height="10" rx="4" />
    <path d="M12 5v3M9 9 7 7M15 9l2-2M5 12H3M21 12h-2M6 17l-2 1.5M18 17l2 1.5M8.5 13H4M20 13h-4.5" />
  </svg>
);
export const IconSupportQuestion = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.5v.4" />
    <path d="M12 17h.01" />
  </svg>
);
export const IconSupportIdea = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.2 1.3 2.2h4.6c.2-1 .7-1.7 1.3-2.2A6 6 0 0 0 12 3Z" />
  </svg>
);

export const IconSun = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M18.9 5.1l-1.8 1.8M6.9 17.1l-1.8 1.8" />
  </svg>
);

export const IconDashboard = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="3.5" width="7" height="4.5" rx="1" />
    <rect x="13.5" y="11" width="7" height="9.5" rx="1" />
    <rect x="3.5" y="13" width="7" height="7.5" rx="1" />
  </svg>
);

export const IconMessage = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M4 5.5h16a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H9l-4 3.5V16H4a.5.5 0 0 1-.5-.5V6a.5.5 0 0 1 .5-.5Z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </svg>
);

export const IconDollar = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M12 2.5v19" />
    <path d="M16.5 6.7C16 5.2 14.2 4.3 12 4.3S8 5.4 8 7.1c0 1.7 1.9 2.4 4 2.9s4 1.2 4 2.9c0 1.7-1.8 2.8-4 2.8s-4-.9-4.5-2.4" />
  </svg>
);

export const IconChart = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 20v-6M12.5 20V8M17 20v-9" />
  </svg>
);

export const IconTrend = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="m7 15 3.5-4 3 2.5L18 8" />
    <path d="M18 8h-3.2M18 8v3.2" />
  </svg>
);

export const IconWrench = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M15.6 6.4a3.8 3.8 0 0 0-4.7 4.9l-6.1 6.1a1.4 1.4 0 0 0 0 2l.8.8a1.4 1.4 0 0 0 2 0l6.1-6.1a3.8 3.8 0 0 0 4.9-4.7l-2.3 2.3-2.4-.6-.6-2.4 2.3-2.3Z" />
  </svg>
);

export const IconCalendar = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
    <path d="M3.5 9.5h17M8 3v3M16 3v3" />
    <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
  </svg>
);

// Icono por id de item del sidebar. Lo que no esta aqui conserva su badge de letras
// (PERC -> PE, SEPS -> SE, etc., segun pidio el usuario).
export const SIDEBAR_ICON_BY_ID: Record<string, ReactNode> = {
  "panel-overview": IconHome,
  "panel-tabulator": IconDollar,
  "panel-module-perc": IconDollar,
  "panel-seps": IconChart,
  "panel-module-sesps": IconChart,
  "panel-module-distribucion": IconClock,
  "panel-horas": IconClock,
  "panel-calendar": IconCalendar,
  "panel-admin-export": IconFile,
  "panel-users": IconUsers,
  "panel-capture-toggle": IconKey,
  "panel-avance": IconDashboard,
  "panel-requests": IconMessage,
  "panel-request-form": IconMessage,
  "panel-docs": IconFile,
  "panel-config": IconWrench,
  "panel-signups": IconMessage,
  "panel-services": IconDashboard,
  "panel-tendencias": IconTrend,
};

// Color del recuadro del icono de cada submenu bajo PERC (distinto por item, para
// que no se vean iguales — se aprecia sobre todo en movil).
export const SUBMENU_ICON_TINT: Record<string, string> = {
  perc: "bg-emerald-500/15 text-emerald-300",
  monitor: "bg-cyan-500/15 text-cyan-300",
  censo: "bg-teal-500/15 text-teal-300",
  insumos: "bg-indigo-500/15 text-indigo-300",
  consolidado: "bg-sky-500/15 text-sky-300",
  servicios: "bg-sky-500/15 text-sky-300",
  seps: "bg-blue-500/15 text-blue-300",
  horas: "bg-amber-500/15 text-amber-300",
};

// Icono propio de cada submenu bajo PERC (Abrir PERC / Monitoreo / Censo / Insumos).
export function renderSubmenuIcon(icon: string | undefined): ReactNode {
  const common = {
    viewBox: "0 0 24 24",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (icon === "perc") {
    return (
      <svg {...common}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (icon === "monitor") {
    return (
      <svg {...common}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    );
  }
  if (icon === "insumos") {
    return (
      <svg {...common}>
        <path d="M21 8V5a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 5v3" />
        <path d="M3 8v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8M3 8h18M12 3v18" />
      </svg>
    );
  }
  if (icon === "consolidado") {
    return (
      <svg {...common}>
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
        <path d="M12 12v5m0 0-2-2m2 2 2-2" />
      </svg>
    );
  }
  if (icon === "servicios") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (icon === "seps") {
    return (
      <svg {...common}>
        <path d="M3 3v18h18" />
        <path d="m7 14 3-3 3 3 4-5" />
      </svg>
    );
  }
  if (icon === "horas") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  // Censo (por defecto): grafico de barras.
  return (
    <svg {...common}>
      <path d="M3 3v18h18" />
      <rect x="7" y="9" width="3" height="9" />
      <rect x="12" y="5" width="3" height="13" />
      <rect x="17" y="12" width="3" height="6" />
    </svg>
  );
}

// Degradado bonito por icono (estilo launcher de app) para el menu en movil.
// Cada modulo tiene su color propio. En PC los iconos van neutros (ver clases desk:).
export const SIDEBAR_TILE_GRADIENT: Record<string, string> = {
  "panel-overview": "from-sky-400 to-blue-600",
  "panel-tabulator": "from-emerald-400 to-teal-600",
  "panel-module-perc": "from-emerald-400 to-teal-600",
  "panel-seps": "from-blue-500 to-blue-600",
  "panel-module-sesps": "from-blue-500 to-blue-600",
  "panel-horas": "from-amber-400 to-orange-600",
  "panel-module-distribucion": "from-amber-400 to-orange-600",
  "panel-docs": "from-blue-400 to-indigo-600",
  "panel-config": "from-slate-400 to-slate-600",
  "panel-calendar": "from-rose-400 to-pink-600",
  "panel-admin-export": "from-teal-400 to-cyan-600",
  "panel-tendencias": "from-violet-400 to-indigo-600",
  "panel-users": "from-indigo-400 to-purple-600",
  "panel-capture-toggle": "from-lime-400 to-green-600",
  "panel-requests": "from-blue-400 to-pink-600",
  "panel-request-form": "from-cyan-400 to-sky-600",
  "panel-signups": "from-teal-400 to-emerald-600",
  "panel-services": "from-sky-400 to-cyan-600",
};
