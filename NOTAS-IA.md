# NOTAS-IA — canal compartido entre Claude y ChatGPT

## Propósito

Desde el 17/11/2026, PULSO (PERC-HNES) lo trabajan dos IA con control total del repo: **Claude** y **ChatGPT**. No se comunican entre sí, así que este archivo es el canal: aquí cada una deja qué cambió, qué quedó pendiente y cualquier aviso para la otra.

Contexto técnico (stack, estructura, colecciones de Firestore, roles, patrones para agregar servicios): ver **[PULSO-Handoff.md](PULSO-Handoff.md)** en la raíz del repo. También `AGENTS.md` (Next.js 16 tiene cambios incompatibles con versiones anteriores).

## Reglas

1. **`git pull origin master` antes de editar** y **otra vez justo antes del push**, para no pisar cambios de la otra IA.
2. **Leer este archivo** (Estado actual, Pendientes y las últimas entradas de la bitácora) antes de empezar.
3. **`npm run build` antes de subir.** Si falla, corregir antes del push. Nunca subir un build roto.
4. Despliegue: `npm run build` → `git add -A` → `git commit -m "mensaje"` → `git push origin master` (Vercel auto-despliega a producción; el usuario prueba directo en producción).
5. **Anotar cada cambio** en la bitácora (abajo), en el mismo commit del cambio.
6. `src/app/page.tsx` es muy grande: editar con búsquedas puntuales, nunca reescribir bloques grandes.
7. Si hay conflicto al hacer pull, resolverlo conservando el trabajo de ambas; no usar `push --force`.
8. Commits y textos en español.

## Estado actual

Resumen de cambios recientes (noviembre 2026):

- **Login y acceso (03–04/11):** mensajes claros para cuenta desactivada, demasiados intentos y sin conexión; recuperación de acceso (olvido de usuario o contraseña) con solicitud a admins, campos obligatorios y envío por correo de clave temporal (123456); con clave temporal, cambio de contraseña obligatorio y luego la política antisoborno.
- **Correo (04/11):** envío vía Brevo funcionando (remitente pulsoperchnes@gmail.com).
- **SEPS:** nuevo acceso "SEPS · digitar" para llenar el SEPS de otro servicio (03/11); días correctos al ver meses del historial y ajuste manual de días (10/11); en Monitoreo, mes en cierre y estado Cerrado igual que PERC y Horas (16/11).
- **Encabezados:** jefes ven "Jefatura de la División …" según su división (03/11).
- **Memos:** más espacio bajo el membrete desde la hoja 2, en PDF y Word (04/11).
- **C.E. Clínico > Personal desvinculado (04/11):** reporte mensual de RRHH con Excel para descargar y subir; acceso solo admins de ESDOMED y la cuenta de RRHH.
- **Guardado automático (05/11):** en PERC, SEPS, Horas y listas del Comité de Expediente Clínico, con indicador y aviso al salir.
- **Perfil comité CEC (05/11):** textos en trato de usted y encabezado de supervisión para no admins.
- **Consolidados (05/11):** Producción Distribuida y de Servicio descargan .xlsx real (exceljs), con el formato de la plantilla del PERC.
- **Usuarios (05/11):** botón Permisos con la forma del menú lateral.
- **Monitoreo (06/11):** pendientes arriba y completos abajo.
- **Menú lateral (13/11):** barra de scroll visible y botones de subir/bajar.
- **Entregas (18/11):** criterio único por módulo (`src/lib/entregas.ts`) en Monitoreo, tendencias y recordatorios; SEPS con Confirmar entrega y estado En digitación.
- **Asistente virtual eliminado (19/11):** se quitó el robot/chat flotante de la esquina (solo PC). La carga de Excel sigue en cada módulo.
- **Consulta Externa (20/11):** nueva unidad con Oncología, Hematología, Cardiología e Infectología (PERC, SEPS y Horas en blanco).
- **Inicio admin (16/11):** se quitaron los accesos directos (Monitoreo general, Tendencias, Consolidados); ya están en el menú lateral.

## Pendientes

_(Anotar aquí tareas abiertas, quién las tomó y su estado. Borrar o marcar ✓ al terminar.)_

- [ ] Responsable de Firebase: rotar las antiguas claves administrativas y de supervisión que se distribuyeron en el navegador, revocar sus sesiones y verificar que todas las identidades privilegiadas reservadas estén aprovisionadas en Auth. No poner claves en Git ni en variables `NEXT_PUBLIC_*`.
- [ ] Claude / ESDOMED: validar en entorno de pruebas con cuentas de servicio, RR. HH. y administración los pasos de la entrada del 17/11. No aplicar cambios de reglas sin autorización.

## Bitácora

Entradas nuevas **arriba**. Formato:

```
### AAAA-MM-DD — Autor (Claude | ChatGPT)
- Cambio: qué se hizo y por qué, en una o dos líneas.
- Archivos: rutas principales tocadas.
- Notas: (opcional) avisos para la otra IA, pendientes que deja, riesgos.
```

### 2026-11-26 — Claude (botón de firma y sello junto a «Firmar y sellar»)
- Cambio: el botón «Cargar/Cambiar firma y sello» y la miniatura también aparecen debajo de la casilla «Firmar y sellar» en el editor del memo (el usuario no veía el de arriba).
- Archivos: `src/components/memos-esdomed.tsx`.

### 2026-11-26 — Claude (Consulta Externa visible para admins y copia a la Dra. Gil)
- Cambio: Memorándums > Consulta Externa ahora también aparece para los administradores, junto a ESDOMED y Planificación (ven y editan; firmar/enviar con el sello de C.E. solo la jefatura). La Dra. Katherinne Gil (Médico Implementador del SIS) recibe copia en su propia bandeja de los memos de ESDOMED o C.E. que la nombran en el encabezado (`memoNombraGil`); al enviar se eligen los destinatarios. Su cuenta necesita el acceso «Bandeja de memos: Dra. Katherinne Gil (SIS)» (`panel-memos-sis`) en Usuarios.
- Firestore: `consultaExternaMemos` también para `adminPoa()`; `memosInternos` admite `para == 'sis'` (`bandejaSis()`). Probadas con el emulador.
- Archivos: `src/lib/memos-internos.ts`, `src/components/memos-esdomed.tsx`, `src/components/bandeja-memos.tsx`, `src/app/page.tsx` (GRANTABLE_MENUS, menú, bandeja sis), `firestore.rules`.

### 2026-11-26 — Claude (Consulta Externa: perfiles y memos firmados por PULSO)
- Cambio: registro con «Jefatura de Consulta Externa» y «Subjefatura de Consulta Externa» (cuentas de división `consulta-externa`, ven Monitoreo general con PERC/SEPS/Horas de sus 4 consultas); en esa división las opciones de servicio se leen «Jefe de Oncología…» y «Encargado de área — Oncología…». Memorándums > Consulta Externa (solo la jefatura) con número «N.º 2026-HNES-CEX-06». Firma y sello digital por área (ESDOMED y C.E.) que se agrega al final del PDF/Word con «Firmar y sellar». Botón «Enviar a …» y Memorándums > Bandeja de memos (recibidos/enviados, leído), con aviso tipo WhatsApp al llegar uno.
- Firestore: `consultaExternaMemos` (solo jefatura C.E.), `memoSellos/{esdomed|consulta-externa}` (solo su dueño), `memosInternos` (cada lado lee lo suyo; quien recibe solo marca leído; nadie borra). La jefatura se reconoce por `division == consulta-externa` y `serviceName == "Jefatura de Consulta Externa"` o el acceso `panel-memos-consulta-externa`. ESDOMED = `adminEsdomed()`.
- Archivos: `src/lib/memo-esdomed.ts` (área consulta-externa, `sellado`, sello en PDF/Word, `memoNumeroTexto`), `src/lib/memos-internos.ts` (nuevo), `src/components/bandeja-memos.tsx` (nuevo), `src/components/memos-esdomed.tsx` (colección por área, cargar sello, enviar), `src/app/page.tsx` (registro, menú, escucha de no leídos), `firestore.rules`/`firestore-rules.txt` (regla 18, probadas con el emulador).
- Notas: las imágenes de firma NO están en el repo (es público); cada área las sube desde la app. Hay que publicar las reglas a mano.

### 2026-11-25 — Claude (carga en vivo solo de lo reciente: solicitudes, tickets y reaperturas)
- Cambio: antes se escuchaban EN VIVO las colecciones completas `captureRequests`, `supportTickets` y `captureOverrides`, y crecían cada mes. Ahora:
  - Solicitudes de habilitación: en vivo `periodId >= (mes en cierre − 2)` más `status == "pending"` de cualquier mes. Los avisos (nueva solicitud / tu solicitud fue resuelta) salen solo de la escucha de lo reciente.
  - Tickets de soporte: en vivo `createdAt >=` inicio de (mes en cierre − 2) más `status in ["pendiente","en_revision"]`.
  - Reaperturas/cierres manuales: en vivo `periodId in [...]` con los últimos 3 meses, el mes del PERC/Horas, el de SEPS y el del panel de habilitación (se re-suscribe al cambiar de mes en el panel).
  - Botón «Ver anteriores» en la bandeja de solicitudes y en la de tickets: trae la colección completa una vez (no se borra nada).
  - El contador de solicitudes por servicio («llegadas tarde») usa `getCountFromServer` por servicio, para seguir contando toda la historia.
- Índices: no hacen falta índices compuestos (todas las consultas son de un solo campo); no hay que desplegar nada en Firebase.
- Archivos: `src/app/page.tsx` (`toRequest`/`toTicket`/`periodoMenos`/`MESES_EN_VIVO` a nivel de módulo; efectos de las 3 escuchas; `verSolicitudesAnteriores`, `verTicketsAnteriores`, `solicitudesPorServicio`).
- Notas: para cambiar cuántos meses se escuchan, `MESES_EN_VIVO`.

### 2026-11-25 — Claude (la clave temporal también va por correo con Brevo)
- Cambio: el reseteo individual, el reseteo masivo y la creación de la cuenta de un servicio ahora envían la clave temporal por correo (Brevo, remitente MAIL_FROM) al correo de contacto del perfil (`contactEmail` o `email`). La ventana «Claves temporales» queda solo de respaldo y dice a quién se envió, o que hay que entregarla a mano si no hay correo o falló.
- Archivos: `src/lib/correo-clave.ts` (nuevo: correo «Su contraseña fue restablecida»), `src/app/api/admin/reset-password/route.ts` (envía y devuelve `sent/to/reason`; masivo devuelve `enviados` y por cuenta `enviado/correo/motivo`; `maxDuration = 300`), `src/app/page.tsx` (handleAdminSendReset, handleResetAllServices, handleAdminCreateUser usa `notifySignupDecision`).
- Notas: Brevo Free permite 300 correos al día; un reseteo masivo de todos los servicios consume uno por cuenta.

### 2026-11-25 — Claude (clave temporal aleatoria, ya no 123456)
- Cambio: a pedido del usuario, la clave temporal ya no es fija. Cada cuenta nueva (servicio, jefes, división, departamento, MINSAL, comité, dirección), cada reseteo (individual y masivo) y cada recuperación de acceso recibe una clave **aleatoria y distinta de 12 caracteres** (mayúsculas, minúsculas y números, sin 0/O/o ni 1/l/I), generada con `crypto.getRandomValues`. Se sigue obligando a cambiarla al entrar (`mustChangePassword`).
- La clave no se guarda en Firestore ni se escribe en logs: el servidor la devuelve solo al admin que hizo la acción, que la ve en una ventana nueva «Claves temporales» (Copiar; en el reseteo masivo, «Descargar lista» en CSV). En recuperación de acceso, si el correo salió por Brevo, el admin no la ve; si no salió, aparece la ventana para entregarla a mano. Las aprobaciones de registro la envían por correo y además la muestran.
- Al crear su contraseña personal, se rechaza 123456 y la misma clave con la que entró.
- Archivos: `src/lib/clave-temporal.ts` (nuevo), `src/app/api/admin/reset-password/route.ts` (masivo devuelve `cuentas: [{usuario, nombre, clave}]` en vez de `password`), `src/app/api/admin/recover-access/route.ts`, `src/app/api/admin/send-account-email/route.ts`, `src/app/page.tsx` (`mostrarClaves`, modal «Claves temporales recién generadas», textos sin 123456), `.env.example` (se quitó `NEXT_PUBLIC_DEFAULT_TEMP_PASSWORD`, ya no se usa).
- Notas: no volver a poner una clave fija en el código: el repo es público. Usar `generarClaveTemporal()`.

### 2026-11-23 — Claude (cierre de sesión por inactividad)
- Cambio: a pedido del usuario, la sesión se cierra sola tras **1 h 30 min sin actividad** (mouse, teclado, toque, scroll), aunque la pestaña siga abierta. 2 min antes sale el aviso «¿Sigue ahí?» con cuenta regresiva y botón «Seguir en PULSO». La última actividad vive en localStorage (`pulso.ultimaActividad`): varias pestañas cuentan juntas y, si el navegador estuvo cerrado más de 1 h 30 min, al abrirlo se pide entrar de nuevo.
- Antes de cerrar se guarda todo: autoguardado de PERC/SEPS/Horas/CEC (`guardarPendientesYa`), POA (`handleSavePoa`) y control de documentos (`handleSaveDocs`) si tenían cambios; tope de 8 s (sin red queda en la caché de Firestore). Se recuerda la pantalla abierta y al volver a entrar se abre ahí (`pulso.volverA`, por uid).
- Memos y Personal desvinculado guardan borrador local por usuario mientras se escribe (`pulso.borrador.<usuario>.*`) y lo recuperan al volver con un aviso; se borra al guardar, cancelar o cerrar el memo.
- Archivos: `src/lib/borradores.ts` (nuevo), `src/app/page.tsx` (bloque «CIERRE POR INACTIVIDAD», handleSubmit, aviso modal), `src/components/memos-esdomed.tsx`, `src/components/personal-desvinculado.tsx`.
- Notas: el tiempo se cambia en `INACTIVIDAD_MS` / `AVISO_INACTIVIDAD_MS` de `src/lib/borradores.ts`.

### 2026-11-20 — Claude (mes cerrado = cerrado, por auditoría)
- Pedido del usuario: lo que quedó cerrado no lo modifica nadie, en todos los servicios. **Los administradores quedan SIN bloqueo** (decisión del usuario); supervisores y servicios sí.
- Reglas (`firestore.rules`, punto 17): SEPS ya tiene cierre en el servidor (antes no tenía ninguno): documentos `AAAA-MM__servicio` y pruebas `LABAAAAMM__laboratorio-clinico` usan `horasCierre` (5to día hábil, 2:30 p. m.) con la misma reapertura de 24 h (`captureOverrides`, módulo `sesps`). El id del documento debe coincidir con `periodId` + `serviceId`. Las pruebas de Laboratorio guardan `periodoMes` ("AAAA-MM"), que la regla exige. En PERC, Horas y SEPS, un mes anterior al mes pasado sin `captureWindows/{mes}` también queda cerrado (antes quedaba abierto para siempre). GASTOS/DEPRE y demás documentos de `sepsTabulators` siguen igual.
- App: Laboratorio solo deja guardar pruebas del mes con la captura SEPS abierta (antes se podía elegir cualquier mes).
- Probado con el emulador de Firestore: 17 casos (mes abierto, cerrado por hora, viejo sin ventana, reapertura, admins, Laboratorio, PERC y Horas).
- **Las reglas NO se publican solas**: el usuario debe pegarlas en Firebase Console > Firestore > Reglas > Publicar.
- Archivos: `firestore.rules`, `src/app/page.tsx` (handleSaveLabTest).

### 2026-11-20 — Claude (publica el ajuste de ChatGPT: confirmar entrega SEPS en Laboratorio)
- Cambio: ChatGPT lo dejó sin subir en la PC del usuario sobre una copia vieja (5 commits atrás); Claude lo revisó y lo aplicó sobre master. Laboratorio ya puede «Confirmar entrega»: guardar una prueba deja el mes `YYYY-MM__laboratorio-clinico` en `borrador` y confirmar lo marca `entregado` con `laboratorioConDatos: true` (sus datos viven en `LAB{AAAAMM}__laboratorio-clinico`). `sepsEntregado` acepta ese campo. Monitoreo y Tendencias no cuentan como entregado lo que aún no confirmó el servidor (`hasPendingWrites`).
- Ajuste de Claude: corregir una prueba en un mes ya entregado NO lo devuelve a "En digitación".
- También: plantillas privadas de Horas para los 4 servicios de Consulta Externa (lista vacía); faltaban y `/api/horas/plantillas` no las encontraba (la prueba del catálogo fallaba).
- Se descartaron los textos del asistente (ya eliminado en master).
- Archivos: `src/app/page.tsx`, `src/lib/entregas.ts`, `src/lib/horas-plantillas-privadas.ts`, `scripts/verificar-captura.mjs`.
- Notas para ChatGPT: la copia local del usuario tiene estos cambios sin commitear y cambios de fin de línea (CRLF) en 9 archivos; descartarlos y hacer `git pull origin master`. No subir `.claude/settings.local.json`.

### 2026-11-20 — Claude (Consulta Externa fuera del avance)
- Cambio: a pedido del usuario, los 4 servicios de Consulta Externa se ven en Monitoreo pero NO cuentan en ningún porcentaje (Monitoreo, Avance por módulo, Tendencias, barra de avance del inicio, contador por división) ni reciben recordatorios. En la tarjeta salen sin tableros y con la etiqueta "Aún no cuenta".
- Cómo: `INICIO_MONITOREO` y `cuentaEnMonitoreo(serviceId, periodId)` en `src/lib/alcance-servicios.ts`. Valor `null` = no cuenta nunca. **Para activarlos, el usuario lo indicará**: poner el primer periodo que cuenta (p. ej. `"2027-01"`). No activarlos por cuenta propia.
- Archivos: `src/lib/alcance-servicios.ts`, `src/app/page.tsx` (fetchPublicDashboard, fallbackDashboardGroups, computeMonitorStats, tarjetas de Monitoreo), `src/app/api/recordatorios/route.ts`.

### 2026-11-20 — Claude
- Cambio: nueva unidad **Consulta Externa** (grupo `consulta-externa`, al mismo nivel que Dirección y las Divisiones) con 4 servicios: Oncología (`ce-oncologia`), Hematología (`ce-hematologia`), Consulta Externa Cardiología (`ce-cardiologia`, renombrado a pedido del usuario) e Infectología (`ce-infectologia`). Cada uno con PERC, SEPS y Horas, todos en blanco: PERC sin filas, SEPS sin tablas, Horas con columna provisional `ADMINISTRACION` y sin personal. También aparece en el registro, el selector de servicios, Monitoreo por división y POA.
- Archivos: `src/lib/tabulator-template.ts`, `src/lib/modules.ts`, `src/lib/alcance-servicios.ts`, `src/lib/horas-templates.ts`, `src/lib/seps-templates.ts`, `src/app/page.tsx` (SERVICE_GROUP_LABELS, SIGNUP_DIVISIONS, POA_TITULO_GRUPO).
- Notas: `ce-cardiologia` es distinto del servicio `cardiologia` (procedimientos ECG/holter, División Médica), que no se tocó. Pendiente del usuario: filas del PERC, tablas del SEPS y centros de costo/personal de Horas de los 4. El Jefe de División Médica NO ve Consulta Externa (es otro grupo).

### 2026-11-19 — Claude
- Cambio: se eliminó por completo el asistente virtual (robot flotante "Asistente PULSO", solo escritorio) a pedido del usuario: nadie lo usaba y ocupaba espacio. Era 100 % local: sin API, sin variables de entorno, sin colecciones Firestore ni dependencias npm. No cambia reglas, roles ni permisos.
- Archivos: borrados `src/lib/assistant-actions.ts` y `src/lib/asistente-faq.ts`; en `src/app/page.tsx` se quitaron imports, estado/funciones del chat, `assistantCtx` y el bloque UI; en `src/app/globals.css` las animaciones `bot-float`, `bot-talk`, `bot-dot`.
- Notas: las funciones que el asistente llamaba (importadores de Excel SEPS/Horas/Insumos, guardar, navegación, tema, soporte, `hasAnyCapturedValue`) se mantienen porque las usa el resto de la app. Se pierde solo el atajo de arrastrar un Excel al chat. No reintroducir imports de esos archivos.

### 2026-11-18 — Claude (vista)
- Cambio: nueva vista aprobada por el usuario (propuesta A–E). Solo apariencia; no cambia lógica, permisos ni plazos.
  - A. Modo claro en la familia azul (#1B3A6B/#2F6FB5): botones Guardar y llenos en azul marino, rótulos de sección en azul (antes dorado), sin brillo violeta, foco y casillas en azul. Se conservan verde/ámbar/rosa como colores de estado. Bloque "MODO CLARO · AZUL PULSO" al final de globals.css.
  - D. `EstadoChip` (ui-basicos.tsx + clases `.estado-*` en globals.css): una sola pastilla de estado. Aplicada en tarjetas de Menús del área, cabecera de PERC y SEPS, y Bloqueado/Habilitado de PERC y Horas. Usar este componente para estados nuevos.
  - B. Menú lateral con rótulos de grupo en escritorio (Monitoreo, Captura, Documentos, Gestión) vía `grupoMenuLateral(id)` en page.tsx, y línea de luz en la opción activa. Renombres: "DOCS-POA/MOF" → "Documentos POA/MOF", "Config/días-hábiles" → "Días hábiles" (también en el modal de Permisos).
  - C. Tabuladores (`.tabulador`): encabezado azul, celda activa con halo azul, ceros tenues, fila bajo el mouse marcada. PERC y Horas (`.tabulador-fijo` + `.tabulador-scroll`) con encabezado fijo dentro de la tabla en escritorio.
  - E. Encabezado (`.pulso-hero`): barra de avance del mes (servicio: tableros entregados; admin/supervisión: servicios que entregaron todo) y aviso ámbar "Cierra hoy a las 2:30 p. m." el último día.
- Archivos: `src/app/globals.css`, `src/app/page.tsx`, `src/components/ui-basicos.tsx`.
- Notas: los estilos nuevos van al final de globals.css; si agregas reglas de modo claro, ponlas después para que no las pise la capa azul.

### 2026-11-18 — Claude
- Cambio: termina la mejora que ChatGPT dejó a medias (no llegó a subirla): criterio único de entrega por módulo en `src/lib/entregas.ts` (`moduloEntregado`, `estadoModulo`, `horasAvance`, `HORAS_UMBRAL_COMPLETO`). Lo usan Monitoreo (tablero público), Tendencias, tarjetas del inicio y `/api/recordatorios`. Antes el correo daba por entregado SEPS/Horas con cualquier guardado.
- SEPS: igual que PERC. Autoguardar deja `estadoEntrega: "borrador"` (En digitación); el botón ahora es **Confirmar entrega** y deja `"entregado"` (exige al menos un dato). Junto al botón se ve el estado en vivo. Documentos viejos sin `estadoEntrega` y con datos siguen contando como entregados.
- Monitoreo: SEPS y Horas también marcan "· En digitación" (servicio que empezó pero no entregó). Horas: en digitación = alguien con horas pero por debajo del 90 %.
- Archivos: `src/lib/entregas.ts` (nuevo), `src/app/page.tsx`, `src/app/api/recordatorios/route.ts`.
- Notas: ChatGPT, tus cambios locales a medias en la PC del usuario (horasAvance duplicado, `labCargado`, `sepsCargado`) quedan reemplazados por esto; el ajuste de `labCargado`/`sepsCargado` (evitar mostrar datos de otro mes mientras carga) NO se incluyó; si lo retomas, hazlo sobre master.

### 2026-11-17 — ChatGPT
- Nómina: las plantillas iniciales con personal y DUI ahora se sirven por `/api/horas/plantillas` tras validar Firebase Auth y el alcance del perfil. El catálogo público solo contiene metadatos. RR. HH. conserva el consolidado; no se le habilita la captura de otros servicios. La ruta necesita la misma configuración de Admin SDK que las rutas administrativas.
- Cuentas: ambos flujos de restablecimiento requieren gestión de usuarios, excluyen destinos administrativos y revocan sesiones al resetear. El login del administrador y de los supervisores predefinidos ahora usa únicamente la contraseña ingresada; ya no crea esas cuentas desde el navegador. Si falta una, aprovisionarla por el canal administrativo.
- Horas: guarda borradores locales por usuario, mes y servicio. Una transacción combina cambios independientes por empleado y celda; ante cambios incompatibles conserva el borrador y pide conciliar. Para hacerlo, descargar la copia Excel (incluye notas), recuperar la versión vigente y aplicar los cambios revisados. Las estaciones deben actualizar PULSO antes de trabajar simultáneamente.
- Calendario: se calcula con hora de El Salvador tanto en pantalla como en recordatorios y publicación del cierre. No cambian los plazos vigentes: PERC cierra a las 14:30 del tercer día hábil; Horas conserva el quinto. La corrección horaria no reescribe por sí sola cierres históricos.
- PERC: autoguardar ya no entrega. Con datos capturados, elegir **Confirmar entrega**; corregir y autoguardar vuelve a dejar en borrador hasta confirmar de nuevo. Monitoreo y recordatorios usan el mismo criterio. Los meses previos sin estado explícito conservan el criterio histórico.
- Verificación reproducible: `npm run build` y `npm run test:captura -- --bundle`. Las pruebas cubren permisos, compatibilidad del historial, conflictos por celda, el cierre agostino en cuatro zonas y ausencia de DUI de plantilla en el JavaScript público. No usan datos de producción para autenticarse ni escribir.
- Prueba operativa pendiente: con cuentas de ensayo, abrir dos navegadores en el mismo tablero, editar celdas iguales y distintas, desconectar y reconectar, confirmar el PERC y verificar el monitoreo; validar el consolidado de RR. HH. y el rechazo del reset de un administrador. No modificar registros hospitalarios para hacer estas pruebas.
- Alcance de privacidad: no se modificaron ni publicaron reglas de Firestore. Los registros históricos de Horas mantienen sus permisos actuales; revisar ese acceso en una tarea separada. Las versiones previas, el historial de Git y las copias locales autorizadas no se borran con esta actualización.

### 2026-11-17 — Claude
- Cambio: se crea este archivo como canal compartido entre Claude y ChatGPT.
- Archivos: `NOTAS-IA.md`
- Notas: ChatGPT, al empezar lee este archivo y PULSO-Handoff.md; anota aquí cada cambio que subas.
