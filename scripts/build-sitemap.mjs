#!/usr/bin/env node
/**
 * GENERATE sitemap.xml AND robots.txt — runs before every build.
 *
 * `public/robots.txt` already allowed crawlers but nothing told them what
 * existed, and the app had no sitemap at all. For a site whose value is its
 * content, that is the difference between being indexed and being guessed at.
 *
 * The sitemap is generated rather than hand-maintained because it must stay in
 * step with the route list, and a stale sitemap is worse than none — it
 * advertises URLs that 404, which is a quality signal against the whole site.
 *
 * Only public, indexable routes are listed. `/cbt` is excluded: it is a timed
 * attempt carrying private in-progress state, and it sets `noindex` itself.
 * Auth routes are excluded for the same reason a login page is normally left
 * out — it has nothing to offer a searcher.
 */

import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const routesDir = join(root, "src", "routes");

/** The site's public origin, used for absolute URLs in the sitemap. */
const SITE_URL = (process.env.VITE_SITE_URL || "https://ntacbt.vercel.app").replace(/\/$/, "");

/**
 * Route file → URL path, following TanStack's file conventions.
 *
 * `app.pyq.tsx` → `/app/pyq`, `app.studytube.$video.tsx` → skipped (it needs a
 * param and is per-lesson), `index.tsx` → `/`.
 */
function routePaths() {
  const out = [];
  for (const entry of readdirSync(routesDir)) {
    if (!entry.endsWith(".tsx")) continue;
    if (entry === "__root.tsx" || entry.endsWith("._layout.tsx")) continue;
    if (entry.startsWith("api")) continue;

    const base = entry.replace(/\.tsx$/, "");

    // A `$` segment is a dynamic param — there is no single URL to list.
    if (base.includes("$")) continue;

    if (base === "index") {
      out.push({ path: "/", changefreq: "weekly", priority: "1.0" });
      continue;
    }
    if (base === "app.index") {
      out.push({ path: "/app", changefreq: "daily", priority: "0.9" });
      continue;
    }

    // app.pyq → /app/pyq ; app.auth.login → /app/auth/login
    const path = "/" + base.split(".").join("/");

    // The exam runner and the auth screens are deliberately not advertised.
    if (path === "/cbt") continue;
    if (path.startsWith("/app/auth/")) continue;

    // Content routes students actually search for rank higher than personal
    // surfaces, because they are the ones worth crawling repeatedly.
    const content = ["/app/pyq", "/app/map", "/app/studytube", "/app/tests"];
    out.push({
      path,
      changefreq: content.includes(path) ? "weekly" : "monthly",
      priority: content.includes(path) ? "0.8" : "0.6",
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const routes = routePaths();

if (routes.length === 0) {
  console.error("[sitemap] no routes found — refusing to write an empty sitemap.");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

const urls = routes
  .map(
    (r) =>
      `  <url>\n` +
      `    <loc>${SITE_URL}${r.path}</loc>\n` +
      `    <lastmod>${today}</lastmod>\n` +
      `    <changefreq>${r.changefreq}</changefreq>\n` +
      `    <priority>${r.priority}</priority>\n` +
      `  </url>`,
  )
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

writeFileSync(join(root, "public", "sitemap.xml"), sitemap);
console.log(`[sitemap] wrote ${routes.length} URLs → public/sitemap.xml`);

/**
 * robots.txt, rewritten rather than appended to.
 *
 * It already allowed every crawler, which is correct for a public app, but it
 * never pointed at a sitemap — so a crawler had to discover the routes by
 * following links. The exam runner is disallowed here as well as being
 * `noindex`: belt and braces, because a crawl of a timed attempt is wasted
 * budget and could index in-progress state.
 */
const robots = `# NTACBT — https://github.com/dfgtghu556-ops/ntacbt
User-agent: Googlebot
Allow: /
Disallow: /cbt
Disallow: /app/auth/

User-agent: Bingbot
Allow: /
Disallow: /cbt
Disallow: /app/auth/

User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: *
Allow: /
Disallow: /cbt
Disallow: /app/auth/

Sitemap: ${SITE_URL}/sitemap.xml
`;

writeFileSync(join(root, "public", "robots.txt"), robots);
console.log("[sitemap] rewrote public/robots.txt with a Sitemap directive");
