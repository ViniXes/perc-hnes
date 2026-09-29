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
    version: "1986.384",
    para: ["todos"],
    texto:
      "Mas detalles de vista: al cambiar de pantalla en el celular ahora subis directo al inicio, los botones responden al tocarlos y mejoramos el contraste de los textos y el foco del teclado para que todo se lea y se navegue mas comodo.",
  },
  {
    version: "1986.383",
    para: ["todos"],
    texto:
      "Renovamos la vista de PULSO: las pantallas cargan con un efecto mas suave, aparece un aviso claro cuando algo todavia no tiene datos y ahora se confirma cuando descargas un archivo. Ademas, los numeros de las tablas quedan alineados parejo para leerse mejor.",
  },
  {
    version: "1986.381",
    para: ["admin"],
    texto:
      "Nuevo: aviso de novedades por version. A cada usuario le llega solo lo que le corresponde; vos, como admin, ves todos los mensajes.",
  },
  {
    version: "1986.381",
    para: ["div:apoyo", "serv:aseo", "serv:almacen"],
    texto:
      "Ahora ningun servicio se reporta a si mismo: la columna del propio centro queda bloqueada y sale en 0 en el consolidado.",
  },
  // Ejemplos (podes borrarlos o editarlos):
  // {
  //   version: "1986.381",
  //   para: ["serv:aseo", "serv:almacen", "div:apoyo"],
  //   texto: "Ahora la columna del propio centro queda bloqueada: ningun servicio se reporta a si mismo.",
  // },
  // {
  //   version: "1986.381",
  //   para: ["admin"],
  //   texto: "Vista previa del consolidado con buscador por centro de costo para validar los cruces en 0.",
  // },
];
