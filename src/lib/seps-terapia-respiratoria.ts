// AUTO-GENERADO desde "Terapia respiratoria.xlsx" (hoja MES ACTUAL).
// Tabulador SEPS de Terapia Respiratoria, servicio "terapia-respiratoria".
import type { SepsTemplate } from "@/lib/seps-templates";

export const TERAPIA_RESPIRATORIA_TEMPLATE: SepsTemplate = {
  serviceId: "terapia-respiratoria",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "tr1",
      title: "TABULADOR DIARIO DE SERVICIOS DE APOYO III",
      subtitle: "CONSOLIDADO DE DISPOSITIVOS",
      detailLabel: "Detalle",
      showColumnTotals: true,
      rows: [
        { key: "tr1_ventilador", label: "DIAS VENTILADOR MECANICO (AF, VNI, VI)" },
        { key: "tr1_costo", label: "COSTO" },
        { key: "tr1_bigotera", label: "BIGOTERA" },
        { key: "tr1_ventury", label: "MASCARA VENTURY" },
        { key: "tr1_reservorio", label: "MASCARA RESERVORIO" },
      ],
    },
    {
      id: "tr2",
      title: "TABULADOR DIARIO DE SERVICIOS DE APOYO III",
      subtitle: "TERAPIA RESPIRATORIA",
      detailLabel: "Detalle",
      showColumnTotals: true,
      rows: [
        { key: "tr2_personas", label: "# DE PERSONAS", group: "Terapia respiratoria" },
        { key: "tr2_terapia", label: "TERAPIA RESPIRATORIA", group: "Terapia respiratoria" },
        { key: "tr2_intubados", label: "# DE PERSONAS INTUBADOS", group: "Terapia respiratoria" },
        { key: "tr2_extubados", label: "# DE PERSONAS EXTUBADOS", group: "Terapia respiratoria" },
        { key: "tr2_ext_accidental", label: "# DE PERSONAS CON EXTUBACIÓN ACCIDENTAL", group: "Terapia respiratoria" },
        { key: "tr2_reintubados", label: "# DE PERSONAS RE-INTUBADOS DENTRO DE 48 HORAS DESPUÉS DE LA EXTUBACIÓN", group: "Terapia respiratoria" },
        { key: "tr2_neb_personas", label: "# DE PERSONAS", group: "Nebulizaciones / Inhaloterapia" },
        { key: "tr2_nebulizaciones", label: "NEBULIZACIONES", group: "Nebulizaciones / Inhaloterapia" },
        { key: "tr2_puff", label: "COLOCACION DE PUFF", group: "Nebulizaciones / Inhaloterapia" },
        { key: "tr2_rehabilitacion", label: "REHABILITACION", group: "Nebulizaciones / Inhaloterapia" },
        { key: "tr2_rehab_coord", label: "REHAB COORD" },
      ],
    },
    {
      id: "tr3",
      title: "TABULADOR DIARIO DE SERVICIOS DE APOYO III",
      subtitle: "ESPIROMETRÍA",
      detailLabel: "Actividad",
      rows: [
        { key: "tr3_tb", label: "Secuela de TB", group: "Espirometría" },
        { key: "tr3_asma", label: "Asma y EPOC", group: "Espirometría" },
        { key: "tr3_otras", label: "Otras indicaciones de espirometría", group: "Espirometría" },
      ],
    },
  ],
};
