/*
 * Service worker de EvoluGK: hace posible abrir la pantalla de asistencia sin conexión (spec 05,
 * RF-26 y RF-27). Solo guarda lo mínimo para eso:
 *   - los archivos estáticos de la aplicación (/_next/static/, con nombre por contenido);
 *   - la página de asistencia del panel.
 * Nada más se intercepta: el resto de los pedidos va siempre a la red. Las marcas pendientes no
 * viven acá sino en IndexedDB (ver lib/offline-db.ts).
 */
const CACHE = "evolugk-offline-v1";
const PAGE = /^\/[a-z0-9-]+\/panel\/asistencia\/?$/;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE && key.startsWith("evolugk-offline-")) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** Con señal mala, no se espera a la red más de unos segundos: se usa la copia guardada. */
function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const key = new URL(request.url).pathname;
  try {
    const response = await fetchWithTimeout(request);
    // Si la sesión venció, la respuesta es un redirect al ingreso: no se guarda como página.
    if (response.ok && !response.redirected) cache.put(key, response.clone());
    return response;
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
        "<title>Sin conexión</title><body style='font-family:sans-serif;padding:2rem;max-width:32rem;margin:auto'>" +
        "<h1>Sin conexión</h1><p>Para tomar lista sin conexión, abrí Asistencia una vez con conexión " +
        "en este celular. Después queda lista para usar sin señal.</p></body>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate" && PAGE.test(url.pathname)) {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "clear") {
    event.waitUntil(caches.delete(CACHE));
    return;
  }
  if (data.type === "precache" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        for (const raw of data.urls) {
          try {
            const url = new URL(raw, self.location.origin);
            if (url.origin !== self.location.origin) continue;
            const isStatic = url.pathname.startsWith("/_next/static/");
            const isPage = PAGE.test(url.pathname);
            if (!isStatic && !isPage) continue;
            if (isStatic ? await cache.match(url.href) : false) continue;
            const response = await fetch(url.href, { credentials: "same-origin" });
            if (response.ok && !response.redirected) await cache.put(isStatic ? url.href : url.pathname, response);
          } catch {
            // Un archivo que no se pudo guardar no impide guardar el resto.
          }
        }
        const clients = await self.clients.matchAll();
        for (const client of clients) client.postMessage({ type: "precached" });
      })(),
    );
  }
});
