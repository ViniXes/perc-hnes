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
    version: "1986.465",
    para: ["admin"],
    texto:
      "Nuevo menu ESDOMED (solo administradores): memorandums con el membrete oficial, guardados por numero correlativo, editables y descargables en PDF y Word.",
  },
  {
    version: "1986.464",
    para: ["admin"],
    texto:
      "DOCS-POA/MOF: se agrego la Subdireccion de Telemedicina, con sus estados y PDF adjuntos igual que las demas dependencias.",
  },
  {
    version: "1986.463",
    para: ["admin"],
    texto:
      "DOCS-POA/MOF: los PDF adjuntos ahora solo los pueden abrir los administradores. Los demas siguen viendo el estado de cada celda.",
  },
  {
    version: "1986.462",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: el Word sale en tamano carta (antes A4) y con mas espacio arriba, asi el membrete se imprime completo. La valoracion de riesgos, la matriz, la programacion y el seguimiento van en hojas horizontales, y las filas de las tablas ya no se cortan entre paginas. En el PDF el membrete baja un poco para que la impresora no lo corte.",
  },
  {
    version: "1986.458",
    para: ["admin"],
    texto:
      "DOCS-POA/MOF: ahora se elige el año (desde 2026) y cada celda tiene un clip para adjuntar el PDF de la dependencia. Al subirlo la celda queda Entregado sola; el estado se sigue pudiendo cambiar a mano.",
  },
  {
    version: "1986.457",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: en las tablas del PAO se puede tocar cualquier parte de la celda para escribir. En la valoracion de riesgos, la ejecucion y las observaciones muestran donde escribir.",
  },
  {
    version: "1986.454",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: la ventana de comprobantes ya no sale como un cuadro negro; se ve con los colores del tema y con el boton para subir archivos.",
  },
  {
    version: "1986.453",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: el boton del clip de comprobantes ahora si abre la ventana para subir, ver y quitar los documentos del trimestre.",
  },
  {
    version: "1986.451",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: cada actividad tiene un boton con clip en cada trimestre para subir sus comprobantes (PDF, foto, Word o Excel). Cada comprobante suma 1 a lo realizado, el % se recalcula solo y el archivo queda guardado en PULSO para verlo desde la matriz de actividades o el seguimiento trimestral.",
  },
  {
    version: "1986.449",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: nuevo boton \"Traer actividades del PAO anterior\" en la matriz de actividades, que copia objetivos, actividades, indicadores, metas y programacion (lo realizado queda en blanco). El PAO 2027 de ESDOMED ya no renombra ni agrega actividades: quedan las mismas del 2026.",
  },
  {
    version: "1986.445",
    para: ["todos"],
    texto:
      "Calendario: los asuetos nacionales (Año Nuevo, Jueves y Viernes Santo, 1 y 10 de mayo, 17 de junio, 3 al 6 de agosto, 15 de septiembre, 2 de noviembre y 25 de diciembre) ya no cuentan como dias habiles de captura.",
  },
  {
    version: "1986.445",
    para: ["admin"],
    texto:
      "Calendario: la vista previa marca que dia cierra PERC y cual Horas, SEPS y Comite. El servidor ahora tambien cierra Horas y el Comite a las 2:30 p. m. del 5to dia habil (hay que publicar las reglas nuevas de Firestore).",
  },
  {
    version: "1986.444",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: en el PDF los graficos de produccion salen un 25 % mas grandes. En PULSO se mantienen pequenos.",
  },
  {
    version: "1986.442",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: los graficos de produccion son mas pequenos en PULSO, el PDF y el Word. El bloque de egresos fallecidos ya no repite el pastel de vivos contra fallecidos; queda solo el texto.",
  },
  {
    version: "1986.439",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: los graficos de pastel 3D ahora son mas compactos y sin fondo blanco. En PULSO se adaptan al tema claro u oscuro, y en el PDF y el Word salen mas chicos.",
  },
  {
    version: "1986.437",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: si un bloque de produccion no tiene datos ni imagen, el pastel 3D se arma solo con las cifras del texto (por ejemplo, ingresos 2026 contra 2025, o egresos vivos contra fallecidos). Con \"Editar datos\" se pueden corregir.",
  },
  {
    version: "1986.435",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA: en Produccion general resumida ya no hace falta subir imagenes. Elegi Por sexo, Por trimestre, Por semestre u Otro, digita los valores y el grafico de pastel 3D se arma solo, con porcentajes y total. Sale igual en el PDF y en el Word.",
  },
  {
    version: "1986.434",
    para: ["admin", "serv:esdomed"],
    texto:
      "POA 2027: nuevo boton \"Lineamientos PAO 2027\" que agrega los riesgos del SGAS (antisoborno), pasa las actividades a infinitivo, llena los supuestos externos, agrega la verificacion de controles antisoborno, deja la dependencia en Unidad de Planificacion y actualiza las firmas. El membrete ISO 37001 se completa solo (ESDOMED03-HNES-PAO). El Word ahora sale con el formato oficial: aprobaciones, indice, membrete con Pagina X de Y y seguimiento.",
  },
  {
    version: "1986.429",
    para: ["admin"],
    texto:
      "Configuracion: nuevo interruptor \"Hospitales en el menu\" (solo administradores) para ocultar o volver a mostrar el modulo Hospitales a administradores y Direccion. No borra nada: los datos y las cuentas MINSAL siguen igual.",
  },
  {
    version: "1986.428",
    para: ["admin"],
    texto:
      "POA: la Unidad de Planificacion ahora se llama Unidad de Planificacion y Calidad (selector, portada, encabezado y documento). La Unidad de Calidad sigue igual. En el resto de PULSO no cambia el nombre.",
  },
  {
    version: "1986.427",
    para: ["admin"],
    texto:
      "POA en PDF: todo el documento sale en hoja vertical. La matriz de riesgos, la programacion de actividades y las medidas a adoptar se ajustaron a ese ancho, sin hojas horizontales.",
  },
  {
    version: "1986.426",
    para: ["admin"],
    texto:
      "POA: en el Diagnostico situacional hay un cuadro nuevo, Descripcion del recurso humano, para redactar en prosa como esta conformado el personal. Va antes del cuadro de recursos y sale en el PDF y en el Word.",
  },
  {
    version: "1986.425",
    para: ["admin"],
    texto:
      "POA: el selector de unidad ahora tiene buscador. Escriba parte del nombre (por ejemplo \"planif\") y filtra al instante, sin importar tildes. Tambien en Usuarios, \"PAO que elabora\". Flechas y Enter para elegir con el teclado.",
  },
  {
    version: "1986.424",
    para: ["admin"],
    texto:
      "POA: el selector de unidad (en el POA y en Usuarios, \"PAO que elabora\") agrupa los servicios por Division. La Unidad de Planificacion aparece en Direccion, despues de ESDOMED.",
  },
  {
    version: "1986.423",
    para: ["todos"],
    texto:
      "Modo claro renovado: tarjetas mas definidas, botones con texto blanco legible, iconos del menu visibles, campos y tablas con mejor contraste. El modo oscuro no cambia.",
  },
  {
    version: "1986.422",
    para: ["admin"],
    texto:
      "Monitoreo SEPS: los tableros marcados como recibidos fuera de PULSO vuelven a contar despues del 6to dia habil. El avance del mes en cierre ya no baja cuando el SEPS pasa a capturar el mes en curso.",
  },
  {
    version: "1986.421",
    para: ["admin", "div:enfermeria"],
    texto:
      "Comite de Expediente Clinico: nueva lista 14, Enfermeria (Instrumento de monitoreo del modulo de Enfermeria en el SIS). 3 areas y 12 componentes, 5 expedientes con Si (1) / No (0), observaciones y resumen de puntaje con categoria verde, naranja o rojo.",
  },
  {
    version: "1986.420",
    para: ["admin"],
    texto:
      "POA: las cuentas de Jefatura de Division Medica y Jefatura de Division de Apoyo trabajan directamente el PAO de su division (ya no aparecen como servicios aparte en el selector).",
  },
  {
    version: "1986.419",
    para: ["admin"],
    texto:
      "POA: las Divisiones Medica, de Apoyo y de Enfermeria y la Subdireccion Administrativa tambien hacen su PAO (con mision y vision). En Usuarios > Accesos extra, al marcar POA se elige que PAO elabora la cuenta: una division o un servicio.",
  },
  {
    version: "1986.418",
    para: ["admin"],
    texto:
      "POA: ya nadie entra por ser de un servicio (tampoco ESDOMED). Lo ven los administradores, que eligen el servicio en la barra del POA, y la cuenta a la que se le otorgue el acceso 'POA (Plan Anual Operativo)' en Usuarios > Accesos extra, solo para el PAO de su propio servicio.",
  },
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
