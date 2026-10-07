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
    version: "1986.417",
    para: ["serv:esdomed", "admin"],
    texto:
      "PAO: lo que todavia no se registro aparece como pendiente (sin %), no como 0 %. El resumen del trimestre solo cuenta las actividades ya registradas.",
  },
  {
    version: "1986.416",
    para: ["admin"],
    texto:
      "PAO: la plantilla para los demas servicios sale en blanco (estructura de los lineamientos, sin objetivos ni datos de ESDOMED). Cada servicio parte de su propio PAO del ano anterior cuando ya lo tenga. ESDOMED: el PAO 2027 se arma con las actividades y riesgos del 2026; lo realizado de 2026 queda en blanco para completarlo.",
  },
  {
    version: "1986.415",
    para: ["serv:esdomed", "admin"],
    texto:
      "PAO (Plan Anual Operativo): ahora se descarga en PDF con el documento completo y el formato oficial (portada, aprobaciones, indice, secciones I a VI y membrete) y en Excel con las 6 matrices de los Anexos PAO llenas. Nueva pestana Seguimiento trimestral con semaforo por actividad y Medidas a adoptar.",
  },
  {
    version: "1986.414",
    para: ["admin"],
    texto:
      "Avisos dirigidos: PULSO puede mostrar una alerta a personas puntuales hasta que presionen Entendido. Primer uso: entregas tardias del PERC de septiembre (Lavanderia, CEYE y Almacen Medicamentos), registradas como falta en la Bitacora.",
  },
  {
    version: "1986.414",
    para: ["admin"],
    texto:
      "PERC: el cierre del 3er dia habil ahora tambien lo controla el servidor. Aunque alguien tenga PULSO abierto con una version vieja, despues de las 2:30 p. m. del 3er dia habil no se puede guardar PERC salvo que el tablero este reabierto.",
  },
  {
    version: "1986.412",
    para: ["todos"],
    texto:
      "Comite de Expediente Clinico: todas las listas tienen ahora la columna de Responsable (Emergencia tableros, Hospital de Dia, Imagenologia, Alimentacion y Dietas e Informatica no la tenian).",
  },
  {
    version: "1986.412",
    para: ["todos"],
    texto:
      "Distribucion de Horas: una persona cuenta como registrada si tiene horas, si se le puso 0 o si tiene un comentario (licencia, vacaciones...). Asi el servicio sale completo aunque alguien no haya trabajado el mes.",
  },
  {
    version: "1986.411",
    para: ["todos"],
    texto:
      "PERC ahora cierra donde corresponde: los primeros 3 dias habiles del mes, a las 2:30 p. m. del 3ro. Antes quedaba abierto hasta el 5to dia habil, como Horas. Para registrar despues, se pide la reapertura del tablero PERC.",
  },
  {
    version: "1986.410",
    para: ["todos"],
    texto:
      "Comite de Expediente Clinico: los servicios se ponen en verde apenas guardan su lista, sin tener que recargar ni volver a guardar. Farmacia ahora tiene la columna de Responsable.",
  },
  {
    version: "1986.409",
    para: ["todos"],
    texto:
      "Distribucion de Horas: ahora un tablero cuenta como completo en el monitoreo cuando al menos el 90% de su lista tiene horas (antes bastaba con guardar). Arriba de la tabla se ve cuantas personas faltan. Ademas, Medicina Interna muestra a su personal en el orden del listado de Hospitalizacion.",
  },
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
