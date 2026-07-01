# PULSO — Handoff técnico del proyecto

> **Plataforma Única de Logística y Servicios Operativos**
> Hospital Nacional El Salvador · Servicio **ESDOMED** (Estadística y Documentos Médicos)
> App v1.6.2.6 · Next.js 16 / React 19 / Firebase · Deploy en Vercel
> Repo: `github.com/ViniXes/perc-hnes` (rama `master`)

Este documento es el **contexto completo** del proyecto para que otra instancia de Claude (u otra persona) pueda continuar el desarrollo entendiendo la lógica, las convenciones y cómo agregar cosas.

---

## 1. Qué es PULSO

PULSO (PERC-HNES) es una **PWA** (aplicación web progresiva) para el Hospital Nacional El Salvador, desarrollada por el servicio **ESDOMED**. Cada servicio/unidad del hospital captura su **producción mensual** en tres tabuladores:

- **PERC** — productividad por centros de costo (matriz *servicio × centro de costo*).
- **SEPS** — estadística (por ahora **solo monitoreo**; no descarga Excel). Solo ciertas áreas la tienen.
- **Distribución de Horas (Dis/horas)** — reparto de horas del personal por centro de costo. **La reporta todo el hospital.**

La app es **instalable** (display `standalone`, muestra la barra de estado del teléfono como WhatsApp), funciona en escritorio y móvil, y consolida la información para exportarla a Excel (admin).

El usuario trabaja en **español**, prefiere respuestas **concisas**, prueba en **localhost** (`npm run dev`) y despliega a producción con `git push origin master` (Vercel auto-deploya).

---

## 2. Stack técnico

| Área | Tecnología |
|---|---|
| Framework | **Next.js 16.2.6** (App Router, Turbopack) |
| UI | React 19.2.4 · TypeScript 5 · **Tailwind CSS v4** (`@tailwindcss/postcss`) |
| Fuente | Geist (`next/font/google`, variable `--font-sans`) |
| Backend | **Firebase 12** · Firestore · Firebase Auth |
| Hosting | **Vercel** (deploy automático al hacer push a `master`) |
| Repo | `github.com/ViniXes/perc-hnes` (rama `master`) |

---

## 3. Estructura de archivos clave

| Archivo | Rol |
|---|---|
| `src/app/page.tsx` | **Componente principal (`Home`), ~10.900 líneas.** Contiene TODA la lógica: UI, auth, captura, modales, menú, notificaciones, soporte. |
| `src/lib/tabulator-template.ts` | `SERVICE_DEFINITIONS` (catálogo de servicios) y `TABULATOR_HEADERS` (~39 centros de costo) para PERC. |
| `src/lib/modules.ts` | Qué módulos ve cada servicio (`AREA_OVERRIDES`). Default: `["perc", "distribucion"]`. |
| `src/lib/horas-templates.ts` | `HORAS_TEMPLATES`: plantilla de Distribución de Horas por servicio (columnas + roster con DUIs). |
| `src/lib/seps-*.ts` | Plantillas SEPS por servicio (`banco-sangre`, `farmacia`, `laboratorio`, `nutricion`, `psicologia`) + `seps-templates.ts`. |
| `src/lib/firebase.ts`, `firestore.ts`, `storage.ts` | Init de Firebase, helpers de Firestore y almacenamiento local. |
| `src/app/manifest.ts`, `sw.js`, `sw-register.tsx` | PWA: manifest, service worker y modal de actualización (animación de pulso/EKG). |
| `src/app/globals.css` | Estilos globales: navegación móvil "una pantalla a la vez", animaciones EKG/heartbeat, `notif-slide-in`, scrollbars (`.show-scrollbar`). |

> **Nota importante:** casi todo vive en `page.tsx`. Es un archivo enorme; se edita con búsquedas puntuales, no reescribiendo bloques grandes.

---

## 4. Colecciones de Firestore

| Colección | Contenido |
|---|---|
| `serviceUsers` | Perfiles (`role`: admin/supervisor/service, `isChief`, `supervisorModules`, `mustChangePassword`). |
| `serviceAssignments` | Asignaciones de servicios (solo admin). |
| `serviceTabulators` | PERC guardado. **ID:** `{periodId}__{serviceId}`. |
| `sepsTabulators` | SEPS guardado. |
| `horasTabulators` | Distribución de Horas guardada. |
| `captureCalendar` | Configuración mensual / ventanas de cierre. |
| `captureOverrides` | Habilitaciones puntuales de tableros por admin/supervisor. |
| `captureRequests` | Solicitudes de habilitación (servicio pide → admin/supervisor aprueba). |
| `documentControl` | Control documental por año (POA/MOF). |
| `signupRequests` | Auto-registro de jefes de servicio (crea la cuenta al aprobar). |
| `supportTickets` | **Centro de Soporte** (lo más nuevo): tickets con categoría, urgencia, estado. |

**Reglas de seguridad:** el admin se identifica por su **correo fijo** (`hcardoza.admin@perc-hnes.app`, `ffuentes@perc-hnes.app`, `amontes@perc-hnes.app`); el supervisor por `role == 'supervisor'` en `serviceUsers`.
Regla de `supportTickets`: **crear** = cualquier usuario autenticado (estado `'pendiente'` y con su `uid`); **leer/actualizar** = admin o supervisor; **borrar** = admin.

---

## 5. Roles y autenticación

- **Admin** (3 correos fijos `@perc-hnes.app`): ve todo, edita meses pasados, gestiona usuarios, habilita tableros, aprueba registros, gestiona soporte.
- **Supervisor**: ve/consolida su división (los módulos de `supervisorModules`).
- **Servicio**: carga solo sus propios tabuladores.

Login por **usuario** (no email): se resuelve `username` → `username@perc-hnes.app` (constante `SERVICE_LOGIN_DOMAIN = "perc-hnes.app"`). Las cuentas de servicio y de jefes usan clave genérica `"123456"` con **cambio obligatorio** al entrar (`mustChangePassword`).

---

## 6. Módulos y tabuladores

Cada servicio tiene habilitados solo los módulos que le corresponden, definidos en `modules.ts` (`AREA_OVERRIDES`). El **default** para todo servicio del catálogo es `["perc", "distribucion"]`.

- Los 3 módulos (`["perc","sesps","distribucion"]`): Farmacia, Trabajo Social, Laboratorio, Banco de Sangre, Nutrición, Psicología.
- Solo Horas (`["distribucion"]`): ESDOMED, Asesores de Medicamentos, Planificación, Epidemiología, Cumplimiento, Auditoría Interna, Unidad Financiera, Unidad Jurídica, Comunicaciones, Convenios, Jefaturas de División Médica, Jefatura de División de Apoyo, UDP.

### 6.1. Agregar un servicio de SOLO HORAS (patrón de 3 archivos)

Es el flujo que **más se repite**. Se editan 3 archivos:

**1) `src/lib/tabulator-template.ts`** — al final de `SERVICE_DEFINITIONS`:
```ts
{ id: "mi-servicio", name: "Mi Servicio", rows: [] },
```

**2) `src/lib/modules.ts`** — dentro de `AREA_OVERRIDES`:
```ts
"mi-servicio": ["distribucion"],
```

**3) `src/lib/horas-templates.ts`** — dentro de `HORAS_TEMPLATES`:
```ts
"mi-servicio": {
  serviceId: "mi-servicio",
  establishment: "HOSPITAL NACIONAL EL SALVADOR",
  columns: ["ADMINISTRACION"],
  seedEmployees: [
    { dui: "00000000-0", name: "Nombre Apellido" },
    "Persona sin DUI (solo nombre)",
  ],
},
```

**Notas del patrón:**
- El tipo es `HorasSeed = string | { name: string; dui?: string }`. Si no hay DUI, se pone **solo el string** con el nombre.
- Si el servicio **ya existe con PERC** (p. ej. Farmacia, Almacén Medicamentos), **NO** se tocan `tabulator-template.ts` ni `modules.ts`: solo se agrega su entrada en `horas-templates.ts`.
- `columns` es la lista de centros de costo a los que reparte horas (una o varias, p. ej. `["HOSPITALIZACION SERVICIOS POR CONVENIOS","ADMINISTRACION"]`).
- Las horas **arrancan vacías**; el roster solo trae nombre + DUI. Los números los digita el usuario al capturar.
- Para "subtítulos" dentro del roster (como el grupo *MEDICOS DESTACADOS* en Jefaturas de División Médica) se usó un string divisor tipo `"— MEDICOS DESTACADOS —"`.

### 6.2. Servicios de Horas cargados recientemente
Cumplimiento, Auditoría Interna, Unidad Financiera, Unidad Jurídica, Comunicaciones, Unidad de Convenios (2 columnas), Jefaturas de División Médica (3 columnas + divisor), Jefatura de División de Apoyo, UDP; además plantillas de Horas de **Almacén Medicamentos** y **Farmacia**, y actualización de DUIs de **Asesores de Medicamentos**.

---

## 7. Funcionalidades implementadas

### Navegación móvil "una pantalla a la vez"
- Barra inferior con un solo botón (casita = **Menú**) que abre una hoja deslizable (bottom sheet).
- El contenedor tiene `data-mview={mobileView}` y cada sección `data-view="..."`. El CSS en `globals.css` muestra **solo** la vista activa en pantallas `< 1280px` (breakpoint xl).
- Valores de `mobileView`: `home`, `panel-services`, `panel-tabulator`, `panel-seps`, `panel-horas`, `panel-calendar`, `panel-admin-export`, `panel-capture-toggle`.
- **Selector de tabuladores:** al entrar a un servicio aparecen pestañas (PERC / SEPS / Horas) **solo con los tabuladores que ese servicio tiene**.
- **Botón atrás de Android:** navega hacia atrás entre vistas/modales; en Inicio muestra modal "¿Salir de la aplicación?".

### PWA
- `display: standalone` (barra de estado del teléfono visible, como WhatsApp).
- Service worker + modal "Nueva versión disponible" con animación de latido (**heartbeat**) y línea de pulso (**EKG**).

### Notificaciones tipo WhatsApp
- Banner con logo PULSO cuando llega una solicitud de habilitación o un **ticket de soporte**.
- La casita se ilumina verde (aprobada/nueva) o roja (rechazada); contador rojo en íconos con pendientes.

### Auto-registro de jefes de servicio
- "Regístrate aquí" en el login → escribe en `signupRequests` → admins aprueban → crea la cuenta (username = **primera letra del nombre + apellido**, p. ej. `bmejia`; clave `123456`).
- Política de privacidad con checkbox, tratando de **"usted"**.

### Centro de Soporte (lo más reciente)
- Ítem **"Soporte"** (ícono headset) en el pie del menú, en escritorio y móvil.
- Modal estilo **TICKET**: folio, código de barras, perforación, tipografía monoespaciada y sello de estado.
- Formulario: **categoría** (Error / Duda / Sugerencia) + **urgencia** (Baja / Media / Alta) + **descripción**. Adjunta solo: usuario, servicio, pantalla, versión.
- **Bandeja** para admin/supervisores (ven **todos** los tickets) con estados Pendiente → En revisión → Resuelto (botones Tomar / Resolver) y notificación en tiempo real.
- Handlers: `sendSupportTicket`, `resolveSupportTicket`. Listener `onSnapshot` de `supportTickets` gateado a admin/supervisor.

### Login
- Muestra el significado de PULSO. Ajustado para entrar en **una sola vista** en escritorio.
- Modal **"Iniciando sesión…"** con barra de pulso por ~2 s tras el login (escritorio y móvil).

---

## 8. Reglas de calidad y convenciones

- **Bloqueo de mes futuro:** no se puede capturar/guardar un mes **adelantado** del mes en cierre (que va un mes atrás). Ej.: junio se cierra en julio; agosto solo se habilita cuando sea septiembre. Guardas de tiempo en `handleSave` (PERC), `handleSaveSeps` y `handleSaveHoras` comparan el `periodId` (`YYYY-MM` como string, que ordena cronológicamente).
- **PERC:** un servicio **no se reporta a sí mismo** (columna propia bloqueada en rojo con "No se reporta a sí mismo").
- **Móvil:** PERC = tarjetas tipo acordeón; SEPS/Horas = **tabla deslizable con primera columna fija** y scrollbar visible (clase `.show-scrollbar`).
- **SEPS:** las tablas arrancan **colapsadas** (apiladas), ninguna desplegada.
- **Consolidados:** Almacén (Depto. Abastecimiento, Almacén Medicamentos y Asesores) comparten la fila `721_1` y se **suman** columna por columna en el bloque `721-Almacén`. Los dos servicios de hemodiálisis comparten filas `268_*` y también se suman.

---

## 9. Flujo de despliegue a producción

Desde la carpeta del proyecto, en la terminal:
```bash
npm run build
git add -A
git commit -m "mensaje descriptivo"
git push origin master
```
- Vercel despliega **automáticamente** al hacer push a `master`.
- Siempre correr `npm run build` **antes** de subir: si falla, corregir antes del push.
- Los warnings `LF will be replaced by CRLF` en Windows son normales y no afectan.

---

## 10. Notas del entorno (gotchas)

- `page.tsx` es enorme (~10.900 líneas): editar con búsquedas precisas; evitar reescribir bloques gigantes.
- Tras cambios de UI, recargar con **Ctrl + Shift + R** (a veces el dev server no toma el cambio al instante).
- El CSS de "una pantalla a la vez" solo oculta **hijos directos** con `data-view` del contenedor `[data-mview]`; los elementos **sin** `data-view` siempre se muestran en móvil.
- Las cuentas admin usan credenciales fijas (env vars), **no** se cambian dentro de la app.

---

## 11. Qué compartir con la otra cuenta de Claude

1. **Este archivo** (`PULSO-Handoff.md`) — contexto y lógica.
2. **El repositorio completo** `github.com/ViniXes/perc-hnes` — sobre todo `src/app/page.tsx` y `src/lib/*.ts`. Sin el código, esto es solo contexto.
3. El archivo **`CLAUDE.md` / `AGENTS.md`** del repo (instrucciones del proyecto).
4. Las **reglas de Firestore** vigentes (incluyen `supportTickets`).
5. Indicar que: se trabaja en **español**, se prueba en **localhost**, y se despliega con el flujo git → Vercel de la sección 9.

> **Sugerencia de arranque para la otra instancia:** leer este MD → abrir `src/lib/horas-templates.ts` + `modules.ts` + `tabulator-template.ts` para ver el patrón real → luego `src/app/page.tsx` para la UI.

---

*Traspaso técnico del proyecto PULSO (PERC-HNES) · Hospital Nacional El Salvador · Servicio ESDOMED.*
