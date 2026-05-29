# PERC HNES

Proyecto base **Next.js 16** (App Router + TypeScript + Tailwind CSS v4 + ESLint).
El entorno ya está listo: solo hay que empezar a desarrollar editando `src/app/page.tsx`.

## Desarrollo local

```bash
npm install      # instalar dependencias (solo la primera vez)
npm run dev      # servidor de desarrollo en http://localhost:3000
npm run build    # build de producción (lo mismo que corre Vercel)
npm run lint     # ESLint
```

## Flujo DevOps: push → producción

Este proyecto usa **despliegue continuo con Vercel + GitHub**. No hay pasos manuales de
deploy: Vercel observa el repositorio de GitHub y publica solo.

```
  git push  ──►  GitHub  ──►  Vercel (build automático)  ──►  en línea
```

- **Push a la rama `master`** → Vercel hace build y lo publica en **Producción**
  (el dominio principal del proyecto).
- **Push a cualquier otra rama / Pull Request** → Vercel genera un **Preview Deploy**
  con una URL propia para revisar antes de mezclar a `master`.
- Si un build falla, Vercel **no** actualiza producción: el deploy anterior sigue vivo.

### Conexión inicial (una sola vez)

1. **Crear el repo en GitHub** y subir este proyecto:

   ```bash
   git add -A
   git commit -m "Entorno base listo"
   # crea el repo en github.com (vacío, sin README) y luego:
   git remote add origin https://github.com/<usuario>/perc-hnes.git
   git push -u origin master
   ```

2. **Importar en Vercel**: entrar a https://vercel.com/new -> *Import Git Repository*
   -> elegir `perc-hnes`. Vercel detecta Next.js automáticamente; dejar todo por defecto
   y pulsar **Deploy**.

3. Listo. A partir de ahí cada `git push` se propaga solo a producción.

### Variables de entorno

Si más adelante se necesitan secretos/API keys, se definen en
**Vercel -> Project -> Settings -> Environment Variables** (no se commitean al repo).
Para desarrollo local, crear un archivo `.env.local` (ya está ignorado por git).

## Estructura

```
src/app/
  layout.tsx     # layout raiz (fuente, metadata, <html>/<body>)
  page.tsx       # home page — el lienzo en blanco para empezar
  globals.css    # estilos globales (Tailwind v4)
public/          # archivos estaticos
```
