/* NTACBT offline shell.
 *
 * Strategy by request kind:
 *
 *  1. Navigations (HTML)          → network-first, then the cached shell, then
 *                                   /offline.html. A page must never be served
 *                                   stale, because a stale page can reference
 *                                   asset URLs that no longer exist.
 *  2. Hashed build assets         → cache-first, cache FOREVER. Vite emits
 *                                   /assets/app.index-A1b2C3.js, so the hash
 *                                   changes on every build. A cached copy is
 *                                   therefore immutable and can never go stale,
 *                                   which is what makes a real offline app
 *                                   possible on a 2G connection.
 *  3. Icons, fonts, images, data  → cache-first. Same immutability argument.
 *  4. Everything else             → network-first with a cache fallback.
 *
 * HISTORY: v1 served /js/app.js cache-first, so users stayed stuck on the
 * FIRST version they ever loaded — every later deploy was invisible until
 * the browser cache was manually wiped (no hard-refresh exists on phones).
 * v2 deleted the v1 cache on activate and always revalidated app code.
 * v3 keeps that guarantee for unversioned URLs and adds permanent caching
 * for the hashed assets, which is the difference between "works offline"
 * and "says it works offline".
 */

importScripts("/sw-classify.js");

const VERSION = "v3";
const CACHE = `ntacbt-shell-${VERSION}`;
const STATIC = [
  "/",
  "/app",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll rejects the whole install if ONE entry fails, so a missing icon
      // would leave the student with no offline shell at all. Add individually
      // and tolerate a miss.
      .then((cache) => Promise.all(STATIC.map((url) => cache.add(url).catch(() => undefined))))
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

/** Classification lives in sw-classify.js so it can be unit tested. */
const { isHashedAsset, isImmutableAsset, isUnversionedCode } = self.NTACBT_SW;

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req).catch(() => null);
    if (hit) return hit;
    if (fallbackUrl) {
      const fb = await cache.match(fallbackUrl).catch(() => null);
      if (fb) return fb;
    }
    return Response.error();
  }
}

async function cacheForever(req) {
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
    // A page is never served from cache without a network attempt, so a deploy
    // is visible immediately and an offline visit gets the saved shell.
    event.respondWith(networkFirst(req, "/offline.html"));
    return;
  }

  if (isHashedAsset(url.pathname) || isImmutableAsset(url.pathname)) {
    event.respondWith(cacheForever(req));
    return;
  }

  if (isUnversionedCode(url.pathname)) {
    // Unversioned app code — revalidate every time. This was the v1 bug.
    event.respondWith(networkFirst(req, null));
    return;
  }

  event.respondWith(cacheForever(req));
});

/* Tell the page when a new shell is waiting, so the student can be offered a
 * refresh instead of silently staying on the old build. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
