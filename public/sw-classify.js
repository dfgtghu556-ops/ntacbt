/*
 * NTACBT service-worker request classification.
 *
 * Extracted from sw.js and loaded via importScripts so the rules can be unit
 * tested. A service worker that mis-classifies an asset either serves a stale
 * build forever or never caches anything, and neither failure is visible in a
 * browser without a phone and a flight-mode toggle.
 *
 * Classic worker script: attaches to `self` so importScripts picks it up.
 */
(function (scope) {
  "use strict";

  /**
   * Vite's content-hashed build output, e.g.
   *   /assets/app.index-A1b2C3d4.js
   *   /assets/style-E5f6G7h8.css
   *
   * The hash changes on every build, so a cached copy is immutable and can
   * never go stale. That is what makes permanent caching safe — and what makes
   * a real offline app possible.
   */
  function isHashedAsset(pathname) {
    if (typeof pathname !== "string") return false;
    if (!pathname.startsWith("/assets/")) return false;
    // A hash segment of at least 8 URL-safe characters before the extension.
    return /-[A-Za-z0-9_-]{8,}\.(?:js|mjs|css|woff2?|ttf|eot)$/.test(pathname);
  }

  /**
   * Static payloads that never change under a stable URL: icons, fonts, images
   * and the manifest itself.
   *
   * **JSON is deliberately excluded unless it is genuinely static.** `public/pyq`
   * is regenerated on every build and the filenames do not change, so
   * `/pyq/index.json` and `/pyq/<id>.json` are unversioned: caching them forever
   * would leave a returning student on the previous deploy's paper list with no
   * way to refresh. They are treated as code to revalidate instead.
   */
  function isImmutableAsset(pathname) {
    if (typeof pathname !== "string") return false;
    if (pathname === "/manifest.webmanifest") return true;
    // Build-generated PYQ payloads: unversioned, so revalidate.
    if (pathname.startsWith("/pyq/")) return false;
    return /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot)$/i.test(pathname);
  }

  /**
   * Unversioned application code. This is the v1 bug: /js/app.js kept the same
   * URL across deploys, so a cache-first strategy froze every student on the
   * first version they ever loaded. These must always revalidate.
   */
  function isUnversionedCode(pathname) {
    if (typeof pathname !== "string") return false;
    return /\.(?:js|mjs|css)$/.test(pathname);
  }

  /**
   * The caching strategy for one request path.
   *
   * **The default is network-first.** Anything this module does not explicitly
   * recognise is assumed to be unversioned, because that is the failure mode
   * that matters: caching an unknown URL forever can strand a student on stale
   * content, whereas revalidating it costs one request. Recognising a URL as
   * immutable must be deliberate, not a default.
   */
  function strategyFor(pathname, isNavigation) {
    if (isNavigation) return "network-first-navigation";
    if (isHashedAsset(pathname) || isImmutableAsset(pathname)) return "cache-forever";
    return "network-first-code";
  }

  scope.NTACBT_SW = {
    isHashedAsset,
    isImmutableAsset,
    isUnversionedCode,
    strategyFor,
  };
})(typeof self !== "undefined" ? self : globalThis);
