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
    version: "1986.408",
    para: ["admin"],
    texto:
      "Usuarios: el Rol ahora muestra \"Supervisor (jefatura o grupo)\" cuando corresponde, en vez de decir \"Servicio\".",
  },
  {
    version: "1986.407",
    para: ["admin"],
    texto:
      "Usuarios ordenado: arriba un resumen claro (que digita, que consulta, que monitorea) y la ficha en 4 bloques: Que digita, Que consulta y monitorea, Accesos extra y Cuenta. Guardar queda siempre a la vista y avisa si hay cambios sin guardar. La lista tiene filtros por tipo de cuenta.",
  },
  {
    version: "1986.406",
    para: ["admin", "div:enfermeria"],
    texto:
      "Nuevo grupo de areas \"Enfermería + Cuidados Paliativos\": la cuenta que lo tenga digita el SEPS de Enfermeria y el de Cuidados Paliativos.",
  },
  {
    version: "1986.405",
    para: ["admin"],
    texto:
      "El acceso \"Monitoreo general: Horas + C.E. Clinico\" muestra el Monitoreo general con solo dos tarjetas: Distribucion de Horas de todo el hospital y las 13 listas del C.E. Clinico.",
  },
  {
    version: "1986.404",
    para: ["admin"],
    texto:
      "El acceso \"Monitoreo comité\" ahora se llama asi en el menu de quien lo tiene y abre solo la tarjeta del C.E. Clinico con las 13 listas.",
  },
  {
    version: "1986.402",
    para: ["admin"],
    texto:
      "Nuevo acceso de menu \"Monitoreo del C.E. Clinico (13 listas)\": la cuenta que lo tenga ve en \"Monitoreo general\" solo la tarjeta del comite con las 13 listas, sin abrir ni llenar nada.",
  },
  {
    version: "1986.401",
    para: ["admin", "div:administrativa"],
    texto:
      "Vuelve el servicio Recursos Humanos en Distribucion de Horas: Andrea Michelle Amaya digita las horas de RRHH y sigue con el monitoreo y la descarga del consolidado.",
  },
  {
    version: "1986.400",
    para: ["admin", "div:medica", "div:apoyo"],
    texto:
      "Comite de Expediente Clinico: la lista \"Retorno, Referencia e Interconsulta\" ahora pertenece a la Division Medica (antes figuraba en la Division de Apoyo).",
  },
  {
    version: "1986.399",
    para: ["admin", "div:enfermeria"],
    texto:
      "Arreglo: las cuentas a las que se les asigna ver el PERC/SEPS/Horas de un servicio (sin ser supervisores) ahora si pueden elegirlo en \"Consolidado por servicio\" y ver su tablero, en solo lectura. Tambien se ve igual en el modo verificacion.",
  },
  {
    version: "1986.398",
    para: ["admin", "div:direccion"],
    texto:
      "En el selector de \"Consolidado por servicio\" ahora salen arriba, en \"Asignados a este usuario\", los servicios que se le dieron por permiso (aunque sean de otra division), para encontrarlos de una.",
  },
  {
    version: "1986.397",
    para: ["admin", "div:direccion"],
    texto:
      "Arreglo: cuando a un supervisor de una division se le asigna ver el PERC/SEPS/Horas de un servicio de OTRA division, ahora si le aparece en el selector (antes el filtro por division lo ocultaba).",
  },
  {
    version: "1986.396",
    para: ["admin", "div:direccion"],
    texto:
      "Comite de Expediente Clinico: ahora podes elegir el mes en el encabezado y ver los meses anteriores en modo solo lectura. El mes actual sigue igual (editable y con bloqueo/desbloqueo).",
  },
  {
    version: "1986.395",
    para: ["admin", "div:direccion"],
    texto:
      "La bitacora ahora tambien registra cada guardado de tablero (PERC, SEPS, Horas y comite): queda constancia breve de quien guardo que y cuando.",
  },
  {
    version: "1986.390",
    para: ["admin", "div:direccion"],
    texto:
      "Modulo Hospitales mas visual: el resumen nacional ahora muestra un anillo de avance grande y las tarjetas de region y hospital se elevan al pasar el cursor.",
  },
  {
    version: "1986.389",
    para: ["todos"],
    texto:
      "Ahora podes volver a ver las novedades cuando quieras: tocá la etiqueta de version (abajo, dice \"Version ... · Novedades\").",
  },
  {
    version: "1986.389",
    para: ["todos"],
    texto:
      "El saludo de Inicio ahora cambia segun la hora del dia: buenos dias, buenas tardes o buenas noches.",
  },
  {
    version: "1986.389",
    para: ["admin", "div:direccion"],
    texto:
      "Accesos directos en Inicio: Monitoreo general, Tendencias, Hospitales y Consolidados a un solo clic.",
  },
  {
    version: "1986.389",
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
