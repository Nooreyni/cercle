// Offline shell for the Cercle PWA. The build number is stamped by CI so each release refreshes the cache.
const CACHE = "cercle-4";
const SHELL = [
  "./", "index.html", "app.js", "core.js", "ai.js", "manifest.webmanifest", "llms.txt",
  "vendor/jszip.min.js", "vendor/qrcode.js", "vendor/anthropic.js",
  "fonts/bricolage-500.woff2", "fonts/bricolage-700.woff2", "fonts/bricolage-800.woff2",
  "fonts/atkinson-400.woff2", "fonts/atkinson-700.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // Pages and the app script: network first so updates land, cache when offline.
  if (req.mode === "navigate" || /\/(app|core|ai)\.js$/.test(url.pathname)) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req.mode === "navigate" ? "index.html" : req, copy)); }
      return r;
    }).catch(() => caches.match(req.mode === "navigate" ? "index.html" : req)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
