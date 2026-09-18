/**
 * CONTROL ANUAL DE DOCUMENTOS
 *
 * Proceso aparte de PERC, SEPS y Horas: la matriz de dependencias por documento
 * (POA, MOF, evaluacion trimestral) que cada dependencia entrega a Calidad.
 *
 * Aca vive el catalogo de columnas y dependencias, los tres estados de una celda
 * (en blanco, entregado, pendiente) con su color y su icono, y el dibujo que le
 * toca a cada dependencia segun su nombre. Se guarda en Firestore en la coleccion
 * 'documentControl', un documento por año.
 */
import type { CSSProperties } from "react";

// =============================================================================
// Documentos (control anual de entregas a Calidad) — proceso INDEPENDIENTE de
// PERC/SEPS/Horas. Matriz: dependencias x documentos (POA, MOF, Evaluacion
// trimestral). Cada celda: "entregado" | "pendiente" | "" (en blanco). Solo el
// admin y ffuentes editan; el resto solo visualiza. Se guarda en Firestore en la
// coleccion "documentControl" (un doc por año).
// =============================================================================
export const DOC_COLUMNS: { key: string; label: string }[] = [
  { key: "poa", label: "POA" },
  { key: "mof", label: "MOF" },
  { key: "evaluacion", label: "Evaluación Trimestral" },
];

// Estados posibles de cada celda y el orden de rotacion al hacer clic (editores).
export type DocStatus = "" | "entregado" | "pendiente";
export const DOC_STATUS_CYCLE: DocStatus[] = ["", "entregado", "pendiente"];
export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  "": "—",
  entregado: "Entregado",
  pendiente: "Pendiente de entrega",
};

// Etiqueta corta para las celdas de la tabla (la larga queda para leyenda y
// tooltip). Evita que "Pendiente de entrega" parta la celda en dos lineas.
export const DOC_STATUS_SHORT: Record<DocStatus, string> = {
  "": "Sin definir",
  entregado: "Entregado",
  pendiente: "Pendiente",
};

// Paleta de cada estado. Se declara con valores literales (y no con clases
// text-emerald-* / text-amber-*) para que las reglas globales de modo claro de
// globals.css no la pisen: aqui ya se resuelven los dos temas.
export function getDocChipStyle(status: DocStatus, light: boolean): CSSProperties {
  if (status === "entregado") {
    return light
      ? { background: "#eef4f0", borderColor: "#cbdcd2", color: "#3d6b55" }
      : { background: "rgba(94,144,120,0.13)", borderColor: "rgba(94,144,120,0.28)", color: "#a7c8b6" };
  }
  if (status === "pendiente") {
    return light
      ? { background: "#f8f3e9", borderColor: "#e4d5b8", color: "#836229" }
      : { background: "rgba(168,134,74,0.13)", borderColor: "rgba(168,134,74,0.30)", color: "#cbae83" };
  }
  return {
    background: "transparent",
    borderColor: "var(--border)",
    color: "var(--text-faint)",
  };
}

// Icono sobrio por estado: check para entregado, reloj para pendiente y un
// guion para "sin definir". Trazo fino, sin relleno ni emojis.
export function getDocStatusIcon(status: DocStatus) {
  const props = {
    viewBox: "0 0 24 24",
    width: 13,
    height: 13,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (status === "entregado") {
    return (
      <svg {...props} strokeWidth={2.6} aria-hidden="true">
        <path d="M20 6.5 9.2 17.3 4 12.1" />
      </svg>
    );
  }
  if (status === "pendiente") {
    return (
      <svg {...props} strokeWidth={2} aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.4V12l2.9 1.9" />
      </svg>
    );
  }
  return (
    <svg {...props} strokeWidth={2} aria-hidden="true">
      <path d="M6 12h12" />
    </svg>
  );
}

export const DOC_DEPENDENCIAS: string[] = [
  "Unidad Financiera Institucional",
  "Unidad de Auditoria Interna",
  "Unidad Asesora de Medicamentos e Insumos",
  "Servicio de Farmacia",
  "Unidad de Planificacion y Calidad",
  "Estadistica y Documentos Medicos",
  "Unidad Juridica",
  "Unidad de Comunicaciones",
  "Unidad de Epidemiologia",
  "Unidad de Convenios",
  "Unidad de Cumplimiento",
  "Subdireccion Medica",
  "Subdireccion Administrativa",
  "Unidad de Desarrollo Profesional",
  "Division Medica",
  "Division de Enfermeria",
  "Division de Servicios de Diagnostico y Apoyo",
  "Departamento de Medicina Preventiva",
  "Unidad de Admisiones",
  "Departamento de Medicina Interna",
  "Departamento de Cirugia",
  "Departamento de Medicina Critica",
  "Unidad de Terapia Intervencionista Endovascular",
  "Unidad de Cuidados Paliativos",
  "Central de Esterilizacion y Equipos",
  "Departamento de Nutricion",
  "Departamento de Radiologia e Imágenes",
  "Departamento de Laboratorios",
  "Servicios de Psicologia",
  "Servicio de Trabajo Social",
  "Servicio de Fisioterapia",
  "Clinica de Empleados",
  "Unidad de Compras Publicas",
  "Departamento de Servicios Varios",
  "Departamento de Recursos Humanos",
  "Departamento de Abastecimiento",
  "Departamento de Conservacion y Mantenimiento",
  "Departamento de Tecnologia y Comunicaciones",
  "Servicio de Lavanderia",
  "Unidad de Gestion Documental",
];

// Clave estable por dependencia (no cambia aunque se edite el nombre visible).
export function getDocKey(index: number) {
  return `dep-${index}`;
}

// Icono SVG por tipo de servicio/dependencia (sin emojis). El primero que
// coincide gana, por eso el orden importa.
export const DEP_ICON_PROPS = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function getDepIcon(name: string) {
  const n = name.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => n.includes(k));

  // Farmacia / medicamentos / insumos
  if (has("farmacia", "medicament", "insumo")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <path d="M12 8.5v7M8.5 12h7" />
      </svg>
    );
  }
  // Laboratorio
  if (has("laborator")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M9 3h6M10 3v6L5.6 18.4A1.8 1.8 0 0 0 7.2 21h9.6a1.8 1.8 0 0 0 1.6-2.6L14 9V3" />
        <path d="M8 15h8" />
      </svg>
    );
  }
  // Radiología / imágenes
  if (has("radiolog", "imagen", "imágen")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
        <path d="M6.5 11h2l1.5-3 2 6 1.5-3h3.5" />
        <path d="M9 20.5h6" />
      </svg>
    );
  }
  // Cirugía / quirúrgico / intervencionista
  if (has("cirug", "quirurg", "endovascular", "intervencionista")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <circle cx="6" cy="6.5" r="2.5" />
        <circle cx="6" cy="17.5" r="2.5" />
        <path d="M8.2 8.2 20 18M8.2 15.8 20 6" />
      </svg>
    );
  }
  // Enfermería
  if (has("enfermer")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M12 20.3 4.6 13a4.6 4.6 0 1 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13Z" />
      </svg>
    );
  }
  // Nutrición
  if (has("nutric")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10" />
        <path d="M16.5 3c-1.6 0-2.6 2-2.6 5.5 0 2 1 3.1 2.6 3.5V21" />
      </svg>
    );
  }
  // Jurídica / convenios
  if (has("jurid", "convenio")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M12 3v18M6 21h12" />
        <path d="M12 5 5 7M12 5l7 2" />
        <path d="M5 7 2.6 12.8a3 3 0 0 0 4.8 0L5 7ZM19 7l-2.4 5.8a3 3 0 0 0 4.8 0L19 7Z" />
      </svg>
    );
  }
  // Auditoría / cumplimiento
  if (has("auditor", "cumplimiento")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M12 3 5 5.5V11c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V5.5L12 3Z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  // Finanzas / compras / abastecimiento
  if (has("financ", "compras", "abastec")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 9.5v5M18 9.5v5" />
      </svg>
    );
  }
  // Comunicaciones / tecnología
  if (has("comunicacion", "tecnolog")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <rect x="3.5" y="4" width="17" height="11" rx="2" />
        <path d="M9 19h6M12 15v4" />
      </svg>
    );
  }
  // Recursos humanos / desarrollo profesional / admisiones / trabajo social
  if (has("recursos humanos", "desarrollo profesional", "admision", "trabajo social")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <circle cx="9" cy="8" r="3" />
        <path d="M3.8 19c0-2.8 2.3-4.6 5.2-4.6S14.2 16.2 14.2 19" />
        <circle cx="16.5" cy="9" r="2.3" />
        <path d="M15.5 14.4c2.3.2 4.3 1.9 4.3 4.6" />
      </svg>
    );
  }
  // Psicología
  if (has("psicolog")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M9.5 4.5A2.5 2.5 0 0 0 7 7a2.3 2.3 0 0 0-1.5 4 2.4 2.4 0 0 0 .8 4.3A2.4 2.4 0 0 0 9.5 19Z" />
        <path d="M14.5 4.5A2.5 2.5 0 0 1 17 7a2.3 2.3 0 0 1 1.5 4 2.4 2.4 0 0 1-.8 4.3A2.4 2.4 0 0 1 14.5 19Z" />
      </svg>
    );
  }
  // Fisioterapia / epidemiología / medicina preventiva
  if (has("fisioterap", "epidemiolog", "preventiva")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
      </svg>
    );
  }
  // Estadística / documentos / planificación / calidad / gestión documental
  if (has("estadistica", "documento", "planificacion", "calidad", "gestion documental")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M6 2.5h7l5 5V21a.5.5 0 0 1-.5.5H6A.5.5 0 0 1 5.5 21V3A.5.5 0 0 1 6 2.5Z" />
        <path d="M13 2.5V8h5" />
        <path d="M9 17.5v-2.5M12 17.5v-4.5M15 17.5v-1.5" />
      </svg>
    );
  }
  // Servicios médicos generales (medicina, clínica, paliativos, crítica, etc.)
  if (has("medic", "clinica", "paliativ", "critica", "interna")) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M6 3.5H4.5v4A4.5 4.5 0 0 0 9 12a4.5 4.5 0 0 0 4.5-4.5v-4H12" />
        <path d="M9 12v2.5a5 5 0 0 0 5 5 4 4 0 0 0 4-4V15" />
        <circle cx="18" cy="13" r="2" />
      </svg>
    );
  }
  // Mantenimiento / conservación / esterilización / lavandería / servicios varios
  if (
    has(
      "mantenimiento",
      "conservacion",
      "esteriliz",
      "lavanderia",
      "servicios varios",
      "central",
    )
  ) {
    return (
      <svg {...DEP_ICON_PROPS} aria-hidden="true">
        <path d="M15.5 7.5a3.5 3.5 0 0 1-4.6 4.6L5 18l1 1 5.9-5.9a3.5 3.5 0 0 0 4.6-4.6l-2 2-2-2 2-2Z" />
      </svg>
    );
  }
  // Por defecto: edificio / dependencia
  return (
    <svg {...DEP_ICON_PROPS} aria-hidden="true">
      <path d="M4.5 21V6.5a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1V21" />
      <path d="M14 10.5h4.5a1 1 0 0 1 1 1V21" />
      <path d="M3 21h18" />
      <path d="M8 9.5h2M8 13h2M8 16.5h2" />
      <path d="M11 3v2.5" />
    </svg>
  );
}

// Colores sutiles para la barrita lateral de cada grupo (cerrado = mas tenue,
// abierto = un poco mas vivo). Se recorren por indice de grupo.

export type DocValues = Record<string, Record<string, DocStatus>>;
