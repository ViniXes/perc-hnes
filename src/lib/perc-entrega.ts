export type DocumentoPerc = {
  estadoEntrega?: unknown;
  values?: Record<string, Record<string, unknown>>;
};

export function tieneDatosPerc(values: DocumentoPerc["values"]) {
  return Object.values(values ?? {}).some(fila =>
    Object.values(fila ?? {}).some(celda => String(celda ?? "").trim() !== ""));
}

export function percEntregado(doc?: DocumentoPerc) {
  // Antes del campo de entrega, el sistema contaba los documentos con datos.
  return !!doc && (doc.estadoEntrega === "entregado" || doc.estadoEntrega === undefined) && tieneDatosPerc(doc.values);
}
