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
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const routesDir = join(root, "src", "routes");

/**
 * The site's public origin, used for absolute URLs in the sitemap.
 *
 * Must match `FALLBACK` in `src/config/site.ts` — a canonical in one place
 * and a sitemap in another pointing at different hosts is exactly the mistake
 * this script exists to prevent. It was `https://ntacbt.vercel.app`, a host
 * that serves a different, older build of the app; the live host is
 * `https://ntacbt.lovable.app`.
 */
const SITE_URL = (process.env.VITE_SITE_URL || "https://ntacbt.lovable.app").replace(/\/$/, "");

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
    // `app.tsx` is the /app shell — a layout that renders an <Outlet> and no
    // page of its own. It used to be `app._layout.tsx`, which the line above
    // skipped; the rename that fixed the missing mobile navigation made it
    // contribute `/app` a second time, duplicating `app.index.tsx`. The URL is
    // real, but a sitemap entry listed twice is a crawl-budget warning.
    if (entry === "app.tsx") continue;
    if (entry.startsWith("api")) continue;

    const base = entry.replace(/\.tsx$/, "");

    // A `$` segment is a dynamic param — there is no single URL to list.
    if (base.includes("$")) continue;

    if (base === "index") {
      out.push({ path: "/", changefreq: "weekly", priority: "1.0", file: entry });
      continue;
    }
    if (base === "app.index") {
      out.push({ path: "/app", changefreq: "daily", priority: "0.9", file: entry });
      continue;
    }

    // app.pyq → /app/pyq ; app.auth.login → /app/auth/login
    const path = "/" + base.split(".").join("/");

    // The exam runner and the auth screens are deliberately not advertised.
    if (path === "/cbt") continue;
    if (path.startsWith("/app/auth/")) continue;
    // A search interface is not content. `/app/search` also 307-redirects to
    // `/app/search?q=` because the route validates its search params, so the
    // sitemap would advertise a URL a crawler is told to index but cannot read.
    // Verified with `curl -w %{http_code}` against the production bundle: 307
    // with no query, 200 with one.
    if (path === "/app/search") continue;

    // Content routes students actually search for rank higher than personal
    // surfaces, because they are the ones worth crawling repeatedly.
    const content = ["/app/pyq", "/app/map", "/app/studytube", "/app/tests"];
    out.push({
      path,
      changefreq: content.includes(path) ? "weekly" : "monthly",
      priority: content.includes(path) ? "0.8" : "0.6",
      file: entry,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const routes = routePaths();

if (routes.length === 0) {
  console.error("[sitemap] no routes found — refusing to write an empty sitemap.");
  process.exit(1);
}

/**
 * `lastmod` for a route, from git rather than from the clock.
 *
 * It used to be today's date, written on every build. Two problems with that:
 * `lastmod` is supposed to say when the page's *content* last changed, not
 * when the build ran — a crawler reading a fresh date on unchanged pages
 * learns nothing; and because the file is committed, every build dirtied the
 * working tree with a 16-line date-only diff that looked like a real change.
 *
 * The route's own last commit date is the honest answer. A shallow clone has
 * no per-file history, so the branch's HEAD date is the fallback, and today's
 * date only if git cannot answer at all. Either way the value is stable for a
 * given commit, so rebuilding the same commit writes the same file.
 */
function gitDate(file) {
  const run = (args) => {
    try {
      return execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "";
    }
  };
  const perFile = run(["log", "-1", "--format=%cs", "--", file]);
  if (perFile) return perFile;
  if (headDate === undefined) {
    headDate = run(["log", "-1", "--format=%cs"]) || new Date().toISOString().slice(0, 10);
  }
  return headDate;
}

/** The branch's own commit date, resolved once and reused. */
let headDate;

/** The sitemap entries, one per public route. */
const urls = routes
  .map(
    (r) =>
      `  <url>\n` +
      `    <loc>${SITE_URL}${r.path}</loc>\n` +
      `    <lastmod>${gitDate(join("src", "routes", r.file))}</lastmod>\n` +
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
Disallow: /app/search

User-agent: Bingbot
Allow: /
Disallow: /cbt
Disallow: /app/auth/
Disallow: /app/search

User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: *
Allow: /
Disallow: /cbt
Disallow: /app/auth/
Disallow: /app/search

Sitemap: ${SITE_URL}/sitemap.xml
`;

writeFileSync(join(root, "public", "robots.txt"), robots);
console.log("[sitemap] rewrote public/robots.txt with a Sitemap directive");
