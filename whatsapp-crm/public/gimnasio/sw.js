// Service Worker del gimnasio (scope /gimnasio).
//
// Deliberadamente MÍNIMO y separado del /sw.js del CRM: solo existe para que
// la landing sea instalable como PWA. No hace push ni caching offline. Al
// tener scope propio /gimnasio, no comparte clients con el SW del CRM, así que
// no interfiere con sus push notifications ni al revés.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Un fetch handler (aunque sea passthrough) es requisito para que Chrome
// ofrezca instalar la app. Network-first puro, sin cache.
self.addEventListener("fetch", () => {
  // No interceptamos nada: dejamos que el navegador resuelva normalmente.
});
