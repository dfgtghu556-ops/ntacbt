/* NTACBT offline shell.
 * Simple, safe service worker: network-first for pages AND app code,
 * cache-first only for truly static assets (icons/fonts/images).
 *
 * HISTORY: v1 served /js/app.js cache-first, so users stayed stuck on the
 * FIRST version they ever loaded — every later deploy was invisible until
 * the browser cache was manually wiped (no hard-refresh exists on phones).
 * v2 deletes the v1 cache on activate and always revalidates app code.
 */

const CACHE = "ntacbt-shell-v2";
const STATIC = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(STATIC))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req).catch(() => null);
    return hit || (await cache.match("/")) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
  } else if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".html")) {
    // App code is UNversioned (same /js/app.js URL every deploy) — it must
    // NEVER come from stale cache. Network first, cache only as fallback.
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(cacheFirst(req));
  }
});
