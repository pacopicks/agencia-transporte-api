// Service worker de la app móvil: permite instalarla y que abra rápido aunque la señal sea mala.
// Seguridad: las respuestas de /api NUNCA se guardan en caché, así los datos de los viajes
// no quedan almacenados en el teléfono después de cerrar sesión.
const CACHE = "transporte-movil-v1";
const INICIALES = ["/movil/", "/movil/manifest.webmanifest", "/movil/icono-192.png", "/movil/icono.svg"];

self.addEventListener("install", evento => {
  evento.waitUntil(caches.open(CACHE).then(cache => cache.addAll(INICIALES)));
  self.skipWaiting();
});

self.addEventListener("activate", evento => {
  evento.waitUntil(
    caches.keys().then(nombres => Promise.all(nombres.filter(n => n !== CACHE).map(n => caches.delete(n)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", evento => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  if (evento.request.mode === "navigate") {
    // Páginas: primero la red; sin conexión, la última versión guardada
    evento.respondWith(fetch(evento.request).catch(() => caches.match("/movil/")));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/movil/")) {
    // Archivos de la app (JS, CSS, íconos): de la caché si ya están, si no de la red y se guardan
    evento.respondWith(
      caches.match(evento.request).then(
        guardada =>
          guardada ||
          fetch(evento.request).then(respuesta => {
            if (respuesta.ok) {
              const copia = respuesta.clone();
              caches.open(CACHE).then(cache => cache.put(evento.request, copia));
            }
            return respuesta;
          }),
      ),
    );
  }
});
