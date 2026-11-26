// =============================================================================
// Memos firmados y sellados que viajan DENTRO de PULSO entre ESDOMED y la
// Jefatura de Consulta Externa (en los dos sentidos).
// -----------------------------------------------------------------------------
//  - memoSellos/<area>: la imagen de firma y sello de cada área (PNG con fondo
//    transparente). La carga una sola vez quien firma; solo esa área la lee.
//  - memosInternos/<id>: cada memo enviado. Lleva una copia del memo y de su
//    sello en el momento del envío (así el que recibe lo ve tal cual se firmó,
//    sin poder leer el sello del otro). El destinatario solo puede marcarlo leído.
// =============================================================================

import type { MemoArea, MemoEsdomed, MemoSello } from "@/lib/memo-esdomed";

export const SELLOS_COLECCION = "memoSellos";
export const MENSAJES_COLECCION = "memosInternos";

/** Áreas que se mandan memos dentro de PULSO, y a quién le escribe cada una. */
export const DESTINO_MEMO: Partial<Record<MemoArea, MemoArea>> = {
  esdomed: "consulta-externa",
  "consulta-externa": "esdomed",
};

/**
 * Bandejas: las dos áreas que escriben memos y la Dra. Katherinne Gil (Médico
 * Implementador del SIS), que solo RECIBE: le llega copia de los memos de
 * ESDOMED o de Consulta Externa que la nombran en el encabezado.
 */
export type BandejaId = "esdomed" | "consulta-externa" | "sis";

export const NOMBRE_BANDEJA: Record<BandejaId, string> = {
  esdomed: "ESDOMED",
  "consulta-externa": "Jefatura de Consulta Externa",
  sis: "Dra. Katherinne Gil (SIS)",
};

/** Acceso (Usuarios) que convierte una cuenta en la bandeja de la Dra. Gil. */
export const GRANT_MEMOS_SIS = "panel-memos-sis";

function sinTildes(t: string) {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** ¿El memo nombra a la Dra. Katherinne Gil en el encabezado (PARA, CC., VÍA…)? */
export function memoNombraGil(memo: Pick<MemoEsdomed, "bloques">): boolean {
  return memo.bloques.some((b) =>
    b.personas.some((p) => {
      const n = sinTildes(p.nombre);
      return /\bgil\b/.test(n) && /\bk[a-z]*t[a-z]*rin/.test(n);
    }),
  );
}

/** Nombre del servicio (serviceName) de la cuenta de la Jefatura de Consulta Externa. */
export const JEFATURA_CE_NOMBRE = "Jefatura de Consulta Externa";
export const SUBJEFATURA_CE_NOMBRE = "Subjefatura de Consulta Externa";
/** Asistente administrativo (secretaría) de C.E.: mismos permisos que la jefatura, incluidos los memos. */
export const ASISTENTE_CE_NOMBRE = "Asistente administrativo de Consulta Externa";
/** Acceso que un admin puede otorgar (Usuarios) para que otra cuenta de C.E. use los memos. */
export const GRANT_MEMOS_CE = "panel-memos-consulta-externa";

export type MemoInterno = {
  id: string;
  de: BandejaId;
  para: BandejaId;
  memo: MemoEsdomed;
  sello: MemoSello | null;
  codigo: string;
  asunto: string;
  enviadoPor: string;
  enviadoPorNombre: string;
  enviadoMs: number;
  leido: boolean;
  leidoMs: number;
  leidoPor: string;
  /** Acuse de recibido que confirma el destinatario (fecha y hora del servidor). */
  recibido: boolean;
  recibidoMs: number;
  recibidoPorNombre: string;
};

/**
 * Achica la imagen que se sube (máx. 520 px del lado mayor) y la deja en PNG
 * conservando la transparencia, para que entre con holgura en Firestore.
 */
export async function prepararSello(archivo: File): Promise<MemoSello> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("imagen"));
      i.src = url;
    });
    const escala = Math.min(1, 520 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, 0, 0, w, h);
    // Una foto o escaneo con fondo blanco: el blanco se vuelve transparente para
    // que el sello no tape el texto ni el membrete.
    const datos = ctx.getImageData(0, 0, w, h);
    const p = datos.data;
    for (let k = 0; k < p.length; k += 4) {
      const min = Math.min(p[k], p[k + 1], p[k + 2]);
      const max = Math.max(p[k], p[k + 1], p[k + 2]);
      if (min > 215 && max - min < 25) p[k + 3] = 0;
    }
    ctx.putImageData(datos, 0, 0);
    return { data: canvas.toDataURL("image/png"), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function leerSello(raw: Record<string, unknown> | undefined | null): MemoSello | null {
  if (!raw) return null;
  const data = typeof raw.data === "string" ? raw.data : "";
  const w = Number(raw.w) || 0;
  const h = Number(raw.h) || 0;
  if (!/^data:image\//.test(data) || !w || !h) return null;
  return { data, w, h };
}

/**
 * Mes del envío en hora de El Salvador ("AAAA-MM"). Va en cada memo enviado para
 * que la bandeja cargue solo los meses recientes, sin índices compuestos.
 */
export function mesMemo(instante = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(instante);
  const y = p.find((x) => x.type === "year")?.value ?? "";
  const m = p.find((x) => x.type === "month")?.value ?? "";
  return `${y}-${m}`;
}

/** Meses que la bandeja carga en vivo: el actual y los anteriores (n en total). */
export const MESES_BANDEJA = 3;
export function mesesRecientes(n = MESES_BANDEJA, hoy = mesMemo()): string[] {
  const [y, m] = hoy.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
