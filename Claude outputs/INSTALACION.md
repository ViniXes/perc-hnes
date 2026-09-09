# SIGMA — instalación paso a paso

**Sistema Integrado de Gestión de Matriz y Almacén**
Hospital Nacional Psiquiátrico “Dr. José Molina Martínez”

Esto no toca PULSO en nada: es un proyecto aparte, en Google Apps Script, con su propia hoja de cálculo y sus propios usuarios.

---

## 1. Crear el proyecto (5 minutos)

1. Entrá a **script.google.com** con la cuenta de Google que va a ser la dueña del sistema. Elegí bien: esa cuenta es la que va a ser propietaria de los datos.
2. Clic en **Nuevo proyecto**.
3. Arriba a la izquierda, donde dice *Proyecto sin título*, ponele **SIGMA**.

## 2. Pegar los archivos

En el panel izquierdo vas a ver **Archivos** con un `Código.gs` vacío.

**Archivos de código** (el botón `+` → *Secuencia de comandos*). El nombre lo escribís sin la extensión `.gs`; Google se la pone solo:

| Creá el archivo | y pegale el contenido de |
|---|---|
| `00_Catalogos` | `00_Catalogos.gs` |
| `01_Base` | `01_Base.gs` |
| `02_Instalar` | `02_Instalar.gs` |
| `03_Auth` | `03_Auth.gs` |
| `04_Api` | `04_Api.gs` |
| `05_Descargas` | `05_Descargas.gs` |
| `06_Web` | `06_Web.gs` |

Después **borrá el `Código.gs`** que venía vacío (los tres puntos a su derecha → Eliminar).

**Archivos de pantalla** (el botón `+` → *HTML*):

| Creá el archivo | y pegale el contenido de |
|---|---|
| `Index` | `Index.html` |
| `Estilos` | `Estilos.html` |
| `Cliente` | `Cliente.html` |

> Los nombres tienen que ser exactos, con esas mayúsculas. El código los busca así.

## 3. El manifiesto

1. Engranaje de **Configuración del proyecto** (izquierda).
2. Marcá **Mostrar el archivo de manifiesto “appsscript.json” en el editor**.
3. Volvé al editor, abrí `appsscript.json` y reemplazá TODO su contenido por el del archivo `appsscript.json` que te mando.

## 4. Instalar

1. En el editor, arriba, elegí la función **`instalar`** en la lista desplegable.
2. Clic en **Ejecutar**.
3. Google te va a pedir permisos: *Revisar permisos* → tu cuenta → *Configuración avanzada* → *Ir a SIGMA (no seguro)* → **Permitir**. Es tu propio script pidiendo acceso a tus hojas; el aviso sale porque el proyecto no está verificado por Google.
4. Abajo, en **Registro de ejecución**, va a aparecer algo así:

```
SIGMA quedo instalado.
Hoja de datos: https://docs.google.com/spreadsheets/d/...
Usuario administrador: admin
Contrasena temporal: sig4821
```

**Anotá esa contraseña.** No se vuelve a mostrar.

## 5. Publicar la aplicación

1. Botón azul **Implementar** → **Nueva implementación**.
2. Engranaje → tipo **Aplicación web**.
3. Configurá:
   - *Descripción*: `SIGMA v1`
   - *Ejecutar como*: **Yo** (tu cuenta)
   - *Quién tiene acceso*: **Cualquier usuario**
4. **Implementar** y copiá la **URL de la aplicación web**. Esa es la dirección que le pasás al personal.

> “Cualquier usuario” suena fuerte, pero es obligatorio: el personal del hospital no tiene cuenta de Google, así que Google no puede identificarlos y quien controla el acceso es el login propio de SIGMA. Sin usuario y contraseña, quien abra la URL solo ve la pantalla de ingreso.

## 6. Primer ingreso

Abrí la URL, entrá con `admin` y la contraseña temporal. El sistema te va a llevar directo a cambiarla — hacelo antes que nada.

Después andá a **Usuarios** y creá las cuentas del personal. Al crear una, SIGMA te muestra la contraseña temporal **una sola vez**: copiala y entregásela a la persona.

---

## Cómo se reparten los permisos

Al crear un usuario definís tres cosas:

- **Rol** — `jefe` y `digitador` digitan; `monitor` solo mira; `admin` administra todo.
- **Servicios** — los códigos de la matriz que esa persona puede llenar, separados por coma. Por ejemplo `593` es Servicio farmacéutico, `518` Laboratorio clínico, `644` Ambulancia. Un jefe puede tener varios; un digitador normalmente tiene los mismos que su jefe.
- **Insumos** — marcalo solo en la cuenta de Almacén: es la única que llena la tabla de insumos completa.

Los códigos están en la hoja `_Servicios` de la hoja de cálculo de SIGMA.

## Cómo funciona el mes

- El **día 1 de cada mes a las 00:00** se abre la captura del mes anterior y todos los servicios vuelven a quedar pendientes. Es automático, nadie tiene que hacer nada.
- Cierra en el **5.º día hábil a las 2:30 p.m.** (configurable en la hoja `_Config`).
- Los feriados del hospital se cargan en *Plazos y feriados* y dejan de contar como días hábiles.
- Si alguien no alcanzó, el admin lo **habilita** para ese mes desde esa misma pantalla.

## Qué hay dentro de la hoja de cálculo

| Hoja | Qué guarda |
|---|---|
| `_Config` | Días hábiles y hora de corte |
| `_Centros` | Los 65 centros de costo |
| `_Renglones` | Los 52 renglones de producción |
| `_Servicios` | Los 26 servicios que producen |
| `_Insumos` | Las 31 categorías de insumo |
| `_Usuarios` | Cuentas, con la contraseña cifrada |
| `_Estado` | Quién entregó qué y cuándo |
| `_Bitacora` | Todo lo que pasó en el sistema |
| `PERC 2026-08` | **La matriz del mes.** Es el consolidado en vivo |
| `INSUMOS 2026-08` | La tabla de insumos del mes |

Las hojas `PERC` e `INSUMOS` de cada mes tienen exactamente la forma del Excel oficial: los centros de costo en la fila 1, el renglón en la columna B. Por eso la descarga sale lista para entregar, sin reacomodar nada.

---

## Lo que tenés que saber antes de confiarle el mes

Te lo digo ahora y no cuando duela:

- **Apps Script no es Firestore.** Si dos personas del mismo servicio guardan en el mismo segundo, una espera a la otra (hay un bloqueo). Con 26 servicios digitando una vez al mes, no vas a notarlo. Si algún día esto pasa a captura diaria con decenas de personas a la vez, ese es el punto donde se queda corto.
- **La hoja de cálculo es editable a mano.** Quien tenga el enlace y permiso puede abrirla y escribir encima. No la compartas con nadie más que vos: el personal entra por la aplicación, no por la hoja.
- **Las sesiones duran 6 horas.** Después, a entrar de nuevo. Es a propósito.
- **SIGMA no manda correos.** Las contraseñas temporales se entregan en persona. Si querés aviso por correo, se puede agregar después con MailApp.
- **Guardá una copia del mes cerrado.** Cuando el mes ya se entregó, descargá el Excel y archivalo. La hoja sigue ahí, pero un respaldo fuera del sistema nunca sobra.

## Si algo falla

- **“SIGMA todavía no está instalado”** → falta ejecutar `instalar()` (paso 4).
- **La pantalla queda en blanco** → revisá que los tres archivos HTML se llamen exactamente `Index`, `Estilos` y `Cliente`.
- **Cambiaste código y no se ve** → cada cambio necesita **Implementar → Administrar implementaciones → editar → Nueva versión**. Si no, la URL sigue sirviendo la versión vieja.
- **Perdiste la contraseña de admin** → abrí la hoja `_Usuarios`, borrá la fila de `admin`, y en *Configuración del proyecto* borrá la propiedad `INSTALADO`. Volvé a ejecutar `instalar()`: crea el admin de nuevo con clave nueva y no toca ningún dato.
