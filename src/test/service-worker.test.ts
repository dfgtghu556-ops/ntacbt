import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * The service worker's caching rules.
 *
 * A service worker that mis-classifies an asset either freezes every student on
 * the first build they ever loaded, or never caches anything — and neither
 * failure is visible in a browser without a phone and flight mode. So the
 * classification is loaded from `public/sw-classify.js` (which `sw.js` pulls in
 * with `importScripts`) and tested directly against the filenames Vite really
 * emits.
 */

const root = join(process.cwd());
const classifySource = readFileSync(join(root, "public/sw-classify.js"), "utf8");
const swSource = readFileSync(join(root, "public/sw.js"), "utf8");

interface Classifier {
  isHashedAsset(p: string): boolean;
  isImmutableAsset(p: string): boolean;
  isUnversionedCode(p: string): boolean;
  strategyFor(p: string, isNavigation: boolean): string;
}

function loadClassifier(): Classifier {
  const ctx = { self: {} as Record<string, unknown> };
  vm.createContext(ctx);
  vm.runInContext(classifySource, ctx);
  return (ctx.self as { NTACBT_SW: Classifier }).NTACBT_SW;
}

const S = loadClassifier();

/** The filenames Vite actually emitted in this repo's last build. */
const REAL_BUILD_ASSETS = [
  "/assets/adapt-N_fKGyfp.js",
  "/assets/analytics-BbQAY9Is.js",
  "/assets/app._layout-Dv0aZniJ.js",
  "/assets/app.analytics-Cj_RxMIk.js",
  "/assets/app.planner-C1OjN2JE.js",
  "/assets/app.report-Deb2aJd6.js",
  "/assets/curriculum-bridge-BwCCtYkC.js",
  // The React app's own stylesheet, emitted hashed by Vite.
  "/assets/styles-DSPNQ3Ww.css",
];

describe("service worker classification", () => {
  it("caches every real hashed build asset forever", () => {
    // The hash changes on each build, so a cached copy can never be stale.
    for (const asset of REAL_BUILD_ASSETS) {
      expect(S.isHashedAsset(asset), asset).toBe(true);
      expect(S.strategyFor(asset, false), asset).toBe("cache-forever");
    }
  });

  it("caches static payloads under stable URLs forever", () => {
    for (const p of [
      "/icon-192.png",
      "/icon-512.png",
      "/favicon.ico",
      "/manifest.webmanifest",
      "/fonts/inter.woff2",
      "/data/papers.json",
    ]) {
      expect(S.strategyFor(p, false), p).toBe("cache-forever");
    }
  });

  it("never caches unversioned app code — the original v1 bug", () => {
    // /js/app.js keeps the same URL across deploys. Serving it cache-first froze
    // every student on the first version they ever loaded.
    // public/css/legacy.css keeps the same URL across builds, exactly like
    // /js/app.js, so it must revalidate rather than be frozen.
    for (const p of ["/js/app.js", "/js/vendor.js", "/css/legacy.css", "/css/theme.css"]) {
      expect(S.isUnversionedCode(p), p).toBe(true);
      expect(S.strategyFor(p, false), p).toBe("network-first-code");
    }
  });

  it("revalidates every navigation so a deploy is visible immediately", () => {
    for (const p of ["/", "/app", "/app/planner", "/cbt"]) {
      expect(S.strategyFor(p, true), p).toBe("network-first-navigation");
    }
  });

  it("does not treat an unhashed /assets/ path as immutable", () => {
    // A future build step could emit an unhashed file there. Assuming otherwise
    // would freeze it.
    expect(S.isHashedAsset("/assets/app.js")).toBe(false);
    expect(S.strategyFor("/assets/app.js", false)).toBe("network-first-code");
  });

  it("rejects a path outside /assets/ even when it looks hashed", () => {
    expect(S.isHashedAsset("/js/app-A1b2C3d4.js")).toBe(false);
  });

  it("survives junk input without throwing", () => {
    for (const bad of [undefined, null, "", 42, {}]) {
      expect(() => S.strategyFor(bad as never, false)).not.toThrow();
    }
  });
});

describe("service worker wiring", () => {
  it("imports the tested classifier rather than duplicating it", () => {
    expect(swSource).toContain('importScripts("/sw-classify.js")');
    expect(swSource).toContain("self.NTACBT_SW");
  });

  it("declares a version so an upgrade can drop the old cache", () => {
    expect(swSource).toMatch(/const VERSION = "v\d+"/);
    expect(swSource).toContain("caches.delete(k)");
  });

  it("tolerates a single missing precache entry", () => {
    // cache.addAll rejects the whole install if one URL 404s, which would leave
    // a student with no offline shell at all.
    expect(swSource).toContain("cache.add(url).catch");
    expect(swSource).not.toContain("cache.addAll(STATIC)");
  });

  it("falls back to a real offline page rather than a browser error", () => {
    expect(swSource).toContain('"/offline.html"');
  });
});
