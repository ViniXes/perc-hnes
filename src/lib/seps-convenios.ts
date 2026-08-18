// AUTO/MANUAL: Tabulador SEPS de la Unidad de Convenios (Direccion).
// Formato diario: columnas = dias del mes (1..N) + Total auto-sumado por fila.
// Bloque "Bienestar Magisterial" (convenio de hospitalizacion). La tabla NO lleva
// fila de totales por columna: solo la columna "Total" al final de cada fila.
import type { SepsTemplate } from "@/lib/seps-templates";

export const CONVENIOS_TEMPLATE: SepsTemplate = {
  serviceId: "unidad-de-convenios",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  tables: [
    {
      id: "convenios_bienestar_magisterial",
      title: "Tabulador diario - Hospitalizacion servicios por convenios",
      detailLabel: "Detalle",
      rows: [
        { key: "bm_ingresos", label: "Ingresos", group: "Bienestar Magisterial" },
        { key: "bm_dias_pacientes", label: "Días pacientes (saldo)", group: "Bienestar Magisterial" },
        { key: "bm_dias_camas_disponible", label: "Días camas disponible", group: "Bienestar Magisterial" },
        { key: "bm_dotacion_camas", label: "Dotación de camas", group: "Bienestar Magisterial" },
      ],
    },
  ],
};
