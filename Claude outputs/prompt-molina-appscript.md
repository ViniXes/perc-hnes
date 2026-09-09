# Prompt para Claude — Sistema de captura de producción en Google Apps Script (Hospital Molina)

> **Cómo usarlo:** copiá todo lo que está entre las líneas de guiones y pegalo como
> **primer mensaje** en una conversación nueva de Claude. Si tenés a mano el Excel
> de la matriz consolidada, adjuntalo en ese mismo mensaje: cambia por completo la
> calidad del resultado, porque Claude va a poder leer los renglones y los centros
> de costo reales en vez de inventarlos.

---

Necesito que me ayudes a construir, paso a paso, un sistema de captura de producción
mensual para el Hospital Molina, **enteramente en Google Apps Script**. Voy a
describirte el problema, las reglas y las restricciones. No escribas código todavía:
primero confirmame que entendiste y proponeme la estructura.

## Quién soy y qué necesito

Trabajo en el área de estadística/documentos médicos del hospital. Cada mes tengo que
entregar una **matriz consolidada de producción**: una hoja grande donde las filas son
los renglones de producción (consultas, egresos, procedimientos, exámenes, etc.) y las
columnas son los **centros de costo** del hospital.

Hoy esa matriz la lleno yo a mano, juntando lo que cada servicio me manda por correo o
en papel. Eso es lento, se pierde información y nunca sé quién entregó y quién no.

Lo que quiero es lo contrario: que **la matriz consolidada se arme sola** a partir de lo
que cada servicio digita en su propio bloque.

## El concepto central: una matriz que se desmembra en bloques

Esta es la idea más importante del sistema, y quiero que la entiendas bien antes de
proponer nada:

- Existe **una sola matriz consolidada** (la que se entrega al final).
- Esa matriz **se desmembra en bloques**: cada servicio del hospital (Medicina Interna,
  Cirugía, Laboratorio, Farmacia, Enfermería, etc.) tiene asignado un subconjunto de
  filas y columnas de la matriz. Ese subconjunto es **su tablero**.
- El jefe de cada servicio **solo ve y solo digita su bloque**. No ve los bloques de los
  demás, ni la matriz completa.
- Cuando todos digitan, el consolidado es simplemente la unión de los bloques. Nadie
  vuelve a copiar nada a mano.

O sea: el bloque no es una copia de la matriz, es **una ventana recortada sobre la misma
matriz**. La definición de qué filas y columnas le tocan a cada servicio tiene que vivir
en un solo lugar y ser fácil de editar sin tocar código.

## Roles y accesos

1. **Administrador** (yo): ve la matriz completa, define los bloques, crea usuarios,
   abre y cierra los periodos de captura, ve el monitoreo y descarga el consolidado.
2. **Jefe de servicio**: entra con su usuario, ve **solo el bloque de su servicio**, lo
   digita y lo guarda. Además puede **designar a uno o más digitadores** de su propio
   servicio para que le ayuden a llenar ese mismo bloque.
3. **Digitador**: designado por el jefe. Ve y digita el mismo bloque del jefe, pero no
   puede designar a nadie más.
4. **Monitor / jefatura superior** (opcional): no digita nada, solo ve el avance —
   quién completó y quién no.

Cada persona **inicia sesión con su propio usuario**. Necesito saber quién guardó cada
bloque y cuándo: el sistema debe registrar autoría (usuario + fecha y hora) en cada
guardado.

## Reglas de negocio

- La captura es **mensual**. Cada mes es un periodo independiente (por ejemplo `2026-08`).
- La captura solo está abierta durante los **primeros N días hábiles** del mes siguiente
  (arrancá con 5, pero dejalo configurable), y el último día cierra a una **hora de
  corte** (por ejemplo 2:30 p.m.). Fuera de esa ventana, los tableros se ven pero no se
  pueden editar.
- Los días festivos del hospital deben poder marcarse en algún lado para que no cuenten
  como hábiles.
- El administrador puede **habilitar excepcionalmente** un servicio y un mes concreto
  para que ese servicio digite fuera de la ventana.
- Al mes siguiente todo vuelve a quedar pendiente automáticamente; no se borra el
  histórico, cada mes queda guardado por separado y se puede consultar.
- Debe haber un **monitoreo**: una vista donde se ve, servicio por servicio, si ya
  entregó o no, y el porcentaje de avance del mes.

## Restricciones técnicas (esto es innegociable)

- **Todo en Google Apps Script.** Nada de Vercel, Firebase, Next.js, React ni ningún
  servicio externo. El hospital no puede pagar hosting ni depender de terceros.
- **Google Sheets es la base de datos.** Las hojas guardan usuarios, definición de
  bloques, datos capturados por periodo, calendario y bitácora.
- La interfaz se sirve con **HTML Service** (`doGet` + `HtmlService`), con
  `google.script.run` para hablar con el servidor. HTML, CSS y JavaScript sencillos:
  nada de frameworks que haya que compilar, porque en Apps Script no hay build.
- Se despliega como **aplicación web**. Necesito que me expliques con claridad qué
  significa cada opción de "Ejecutar como" y "Quién tiene acceso", y cuál me conviene.

## Lo primero que quiero que decidas conmigo: la autenticación

Antes de escribir código, explicame en lenguaje simple las dos rutas posibles y
recomendame una, con sus riesgos:

- **Ruta A — cuentas de Google:** cada persona entra con su cuenta institucional y el
  sistema la identifica con `Session.getActiveUser().getEmail()`. No manejo contraseñas.
  ¿Qué necesito para que esto funcione? ¿Sirve si el personal no tiene cuenta del
  dominio del hospital?
- **Ruta B — usuarios propios:** una hoja de usuarios con contraseña hasheada y una
  sesión propia con tokens. ¿Qué tan seguro es esto dentro de Apps Script y qué cuidados
  hay que tener?

Decime honestamente cuál usarías en un hospital y por qué. Si la ruta A es viable, la
prefiero: no quiero ser responsable de guardar contraseñas.

## Lo que quiero que me adviertas

Tenés que decirme desde el principio dónde **Apps Script se va a quedar corto**, para
que yo lo decida con los ojos abiertos:

- límite de tiempo de ejecución por llamada y cuotas diarias;
- qué pasa si **dos personas guardan al mismo tiempo** (bloqueos, `LockService`);
- hasta cuántas filas y usuarios aguanta esto con dignidad;
- qué pasa si alguien abre la hoja de cálculo directamente y la edita a mano;
- si conviene una hoja por periodo, una hoja por servicio, o una sola tabla larga.

No me vendas la solución: si algo va a doler, quiero saberlo antes de construirlo.

## Cómo quiero que trabajemos

- Respondeme **en español y de forma concisa**. Soy del área de salud, no programador:
  cuando uses un término técnico, explicámelo la primera vez.
- Vamos **por partes, y en este orden**: (1) modelo de datos y estructura de hojas,
  (2) autenticación y roles, (3) pantalla de captura de un bloque, (4) guardado con
  autoría y ventana de captura, (5) monitoreo, (6) consolidado y exportación.
  **No pases a la siguiente parte sin que yo confirme la anterior.**
- Cuando me des código, decime **exactamente en qué archivo va** (`Codigo.gs`,
  `Index.html`, `appsscript.json`, …) y si reemplaza algo o se agrega.
- Comentá el código **en español**, explicando el *porqué* de cada decisión, no el qué.
  Este sistema lo va a tener que mantener alguien después de mí.
- Si algo que te pido es mala idea, decímelo y proponeme la alternativa. Prefiero que me
  contradigas a que me des por complacido.

## Para arrancar

Empezá por lo primero: **proponeme la estructura de hojas de cálculo** que sostiene todo
esto (qué hojas, qué columnas en cada una, y cómo se define un bloque sin tocar código),
y **decidamos la autenticación**. Todavía no escribas la aplicación.

---

## Notas para vos (no las pegues)

**Adjuntá el Excel de la matriz.** Sin él, Claude va a inventar renglones y centros de
costo genéricos y vas a perder tiempo corrigiendo. Con él, la estructura sale calcada de
lo que el hospital ya usa.

**Si el personal del Molina no tiene cuenta de Google del dominio**, decilo en el mismo
mensaje: es el dato que decide toda la arquitectura de acceso. Con cuentas
institucionales el sistema es mucho más simple y más seguro; sin ellas hay que construir
login propio, y ahí sí conviene pensarlo dos veces.

**No pidas el sistema completo de un solo golpe.** Apps Script no tiene compilador que te
avise de los errores: si te entregan 800 líneas de una vez y algo falla, no vas a saber
dónde. Por eso el prompt obliga a ir por partes y a confirmar cada una.

**Diferencia honesta con PULSO:** en PULSO, Firestore aguanta que 40 servicios guarden a
la vez sin pensarlo. En Apps Script, Sheets no es una base de datos de verdad — es una
hoja de cálculo con una API. Para un hospital más pequeño, con captura mensual y decenas
(no cientos) de usuarios, alcanza bien. Si el Molina crece o quiere captura diaria, ese
es el punto donde habrá que migrar.
