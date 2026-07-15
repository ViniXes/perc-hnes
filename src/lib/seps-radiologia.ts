// Tabulador SEPS de Radiología, servicio "radiologia". Columnas = días del mes.
import type { SepsTemplate } from "@/lib/seps-templates";

export const RADIOLOGIA_TEMPLATE: SepsTemplate = {
  serviceId: "radiologia",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "rad1",
      title: "TABULADOR DIARIO DE PROCEDIMIENTO DE RADIOLOGÍA",
      subtitle: "IMAGENOLOGÍA",
      detailLabel: "Detalle",
      rows: [
        { key: "rad1_rx_personas", label: "No. de personas", group: "Radiografías" },
        { key: "rad1_rx_utiles", label: "No. de placas útiles", group: "Radiografías" },
        { key: "rad1_rx_inutiles", label: "No. de placas inutilizadas", group: "Radiografías" },
        { key: "rad1_rx_tb", label: "De tórax para descartar de TB", group: "Radiografías" },
        { key: "rad1_us_personas", label: "No. de personas", group: "Ultrasonografía" },
        { key: "rad1_us_estudios", label: "No. de ultrasonografías", group: "Ultrasonografía" },
        { key: "rad1_mamo_diag", label: "Mamografía diagnósticas" },
        { key: "rad1_mamo_tamizaje", label: "Mamografía de tamizaje" },
        { key: "rad1_tac_personas", label: "No. de personas", group: "Tomografía axial computarizada" },
        { key: "rad1_tac_estudios", label: "No. de estudios", group: "Tomografía axial computarizada" },
        { key: "rad1_tac_tb", label: "Para descartar TB", group: "Tomografía axial computarizada" },
        { key: "rad1_rm_personas", label: "No. de personas", group: "Resonancia magnética" },
        { key: "rad1_rm_estudios", label: "No. de estudios", group: "Resonancia magnética" },
      ],
    },
    {
      id: "rad2",
      title: "TABULADOR DIARIO DE PROCEDIMIENTO DE RADIOLOGÍA",
      subtitle: "SERVICIOS DE APOYO I (2do y 3er Nivel de Atención)",
      detailLabel: "Detalle",
      rows: [
        { key: "rad2_flouroscopia", label: "Flouroscopía", group: "PROCEDIMIENTOS" },
      ],
    },
  ],
};
