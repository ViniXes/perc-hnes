// =============================================================================
// CHANGELOG DIRIGIDO DE PULSO
//
// Cada vez que se publica una version nueva se puede dejar un mensaje corto del
// cambio. A cada usuario le aparece SOLO lo que le corresponde, segun "para".
// El ADMINISTRADOR siempre ve TODOS los mensajes.
//
// Tokens validos en "para":
//   "todos"                  -> a todo el mundo
//   "admin"                  -> solo administradores
//   "div:apoyo"              -> Division de Apoyo
//   "div:medica"             -> Division Medica
//   "div:administrativa"     -> Subdireccion Administrativa
//   "div:enfermeria"         -> Division de Enfermeria
//   "div:direccion"          -> Direccion
//   "serv:<idServicio>"      -> un servicio puntual (ej. "serv:almacen", "serv:aseo")
//
// La "version" debe ser la MISMA que marca marcar-version (ej. "1986.381").
// Se muestran los mensajes de las versiones nuevas que el usuario aun no vio.
// =============================================================================

export type ChangelogEntry = {
  version: string;
  para: string[];
  texto: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1986.387",
    para: ["todos"],
    texto:
      "El saludo de Inicio ahora cambia segun la hora del dia: buenos dias, buenas tardes o buenas noches.",
  },
  {
    version: "1986.387",
    para: ["admin", "div:direccion"],
    texto:
      "Accesos directos en Inicio: Monitoreo general, Tendencias, Hospitales y Consolidados a un solo clic.",
  },
  {
    version: "1986.387",
    para: ["todos"],
    texto:
      "Cuando ya entregaste todo lo del mes, Inicio te lo confirma con un sello de Todo al dia.",
  },
];

// Version mas nueva presente en el changelog. La deteccion de "novedades sin ver"
// se basa en ESTE numero (no en APP_VERSION), para que los mensajes no dependan
// del numero exacto de despliegue y siempre se muestre el ultimo lote agregado.
export const CHANGELOG_LATEST = CHANGELOG.reduce(
  (max, e) => Math.max(max, Number.parseInt(e.version.split(".").pop() || "0", 10) || 0),
  0,
);
