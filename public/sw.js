/* Service Worker PULSO — offline basico sin interferir con Firebase.
   Estrategia:
   - Navegaciones (paginas): network-first, cae a cache y luego a "/".
   - Estaticos same-origin (/_next, iconos): cache-first.
   - Cualquier peticion cross-origin (Firebase/Firestore/Auth) o no-GET: passthrough. */
const CACHE = "pulso-v2";
const PRECACHE = ["/", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  // NO hacemos skipWaiting automatico: el nuevo SW queda "esperando" para que la
  // app muestre el aviso de actualizacion. Solo activa cuando el usuario acepta
  // (mensaje SKIP_WAITING desde la pagina).
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {})),
  );
});

// La pagina pide activar la nueva version cuando el usuario toca "Actualizar".
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // No tocar peticiones a otros origenes (Firebase, Google, etc.).
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red primero, cache de respaldo.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/")),
        ),
    );
    return;
  }

  // Estaticos: cache primero.
  const isStatic =
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webmanifest");

  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
