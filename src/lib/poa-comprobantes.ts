// =============================================================================
// Comprobantes del POA: documentos que respaldan lo realizado de una actividad
// en un trimestre (listas de asistencia, actas, informes...).
// -----------------------------------------------------------------------------
// El archivo se guarda en Firestore partido en trozos (un documento por trozo,
// "poaDocuments/<servicio>__<año>__comp__<id>__<n>"), porque cada documento de
// Firestore admite hasta 1 MB. En el PAO solo queda la ficha del comprobante
// (nombre, tipo, tamaño, cuántos trozos, quién y cuándo lo subió).
// =============================================================================

import type { PoaComprobante } from "@/lib/poa-template";

/** Tamaño máximo del archivo que se puede subir. */
export const POA_COMPROBANTE_MAX_BYTES = 8 * 1024 * 1024;
/** Caracteres base64 por trozo (deja holgura bajo el límite de 1 MB). */
const TROZO = 900_000;

export const POA_COMPROBANTE_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/*";

export function poaComprobanteDocId(baseId: string, compId: string, parte: number): string {
  return `${baseId}__comp__${compId}__${parte}`;
}

export function poaNuevoComprobanteId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Lee el archivo como base64 (sin el prefijo "data:...;base64,"). */
async function leerBase64(file: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** Las fotos grandes se achican a JPEG para que pesen menos. */
async function comprimirImagen(file: File): Promise<{ blob: Blob; tipo: string; nombre: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600 * 1024) {
    return { blob: file, tipo: file.type, nombre: file.name };
  }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("img"));
      el.src = url;
    });
    URL.revokeObjectURL(url);
    const max = 2000;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return { blob: file, tipo: file.type, nombre: file.name };
    return { blob, tipo: "image/jpeg", nombre: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    return { blob: file, tipo: file.type, nombre: file.name };
  }
}

/** Prepara el archivo: lo comprime si es foto y lo parte en trozos base64. */
export async function poaPrepararComprobante(
  file: File,
): Promise<{ nombre: string; tipo: string; tamano: number; trozos: string[] }> {
  const { blob, tipo, nombre } = await comprimirImagen(file);
  const base64 = await leerBase64(blob);
  const trozos: string[] = [];
  for (let i = 0; i < base64.length; i += TROZO) trozos.push(base64.slice(i, i + TROZO));
  return { nombre, tipo: tipo || "application/octet-stream", tamano: blob.size, trozos };
}

/** Une los trozos y devuelve el archivo listo para abrir o descargar. */
export function poaArmarComprobante(trozos: string[], tipo: string): Blob {
  const binario = atob(trozos.join(""));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo || "application/octet-stream" });
}

/** true si el navegador lo puede mostrar en una pestaña (PDF o imagen). */
export function poaComprobanteVisible(tipo: string): boolean {
  return tipo === "application/pdf" || tipo.startsWith("image/");
}

export function poaTamanoLegible(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Cuántos comprobantes tiene la actividad en el trimestre. */
export function poaContarComprobantes(lista: PoaComprobante[] | undefined): number {
  return Array.isArray(lista) ? lista.length : 0;
}
