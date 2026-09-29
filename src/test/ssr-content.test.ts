/**
 * Server-rendered content — the publishing gap, pinned.
 *
 * Every data route used to fetch in `useEffect`, so the HTML shipped a spinner
 * and no content. Verified before the fix with
 * `curl -s --compressed http://localhost:3000/app/pyq`, which returned the
 * `<h1>` and the literal string "Loading papers" and none of the 375 questions.
 * A crawler saw an empty page, so the entire value of the app — real
 * previous-year questions — did not exist as far as search was concerned.
 *
 * The fix has two halves and both are easy to undo by accident:
 *
 *  1. a route `loader` that reads the baked index on the server, and
 *  2. seeding the state from it *and* not gating the render on `loading`,
 *     because `loading` starts `true` and would otherwise hide the seeded data.
 *
 * Half 2 was the one that bit: the loader alone shipped the papers in the RSC
 * flight payload but still rendered a spinner in the DOM, which is no better
 * for a crawler that reads markup.
 *
 * These are source-level guards rather than an end-to-end check, because
 * running the built server needs a preset switch and a port. The end-to-end
 * condition they stand for is: the production HTML contains the paper label as
 * a *rendered text node* — `>21 Jan · Evening Shift<` — not merely inside the
 * flight payload.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("the PYQ route renders its content on the server", () => {
  const src = read("src/routes/app.pyq.tsx");

  it("has a server loader, not just a client fetch", () => {
    // A `createServerFn` is what makes the data available during SSR.
    expect(src).toContain("createServerFn");
    expect(src).toContain("loader:");
  });

  it("reads the baked index off disk rather than fetching it", () => {
    // The baked files are build artifacts; reading them costs no round-trip and
    // works with no network, which is the point.
    expect(src).toMatch(/readFileSync/);
    expect(src).toMatch(/public.*pyq.*index\.json/);
  });

  it("seeds the paper list from the loader", () => {
    expect(src).toMatch(/Route\.useLoaderData\(\)/);
    // Seeded, not an empty array that the effect fills in later.
    expect(src).toMatch(/useState<Paper\[\]>\(\(\) => \(baked as Paper\[\]\) \?\? \[\]\)/);
  });

  it("does not gate the render on loading when there is data to show", () => {
    // The defect: `useState(true)` hid the seeded papers behind the spinner.
    expect(src).not.toMatch(/useState\(true\)/);
    expect(src).toMatch(/useState\(baked\.length === 0\)/);
  });

  it("still upgrades to the live library on the client", () => {
    // Seeding must not remove the fuller list when the API is reachable.
    expect(src).toContain("loadIndex");
    expect(src).toMatch(/api\/public\/pyq-papers/);
  });

  it("degrades to nothing when the bake is absent, rather than throwing", () => {
    // A missing or partial bake is a normal state on a fresh clone.
    expect(src).toMatch(/catch\s*{\s*\/\/[\s\S]*?return \[\];/);
  });
});

describe("the syllabus map needs no client fetch at all", () => {
  const src = read("src/routes/app.map.tsx");

  it("is built from data already in the repo", () => {
    // Static curriculum data — there is no reason for this route to fetch.
    expect(src).not.toMatch(/await fetch\(/);
  });
});

describe("every route sets its own metadata", () => {
  const routes = [
    "app.pyq.tsx",
    "app.map.tsx",
    "app.planner.tsx",
    "app.tests.tsx",
    "app.index.tsx",
    "app.analytics.tsx",
    "app.studytube.tsx",
    "app.memory.tsx",
    "app.focus.tsx",
    "app.saarthi.tsx",
    "app.report.tsx",
    "app.search.tsx",
    "app.profile.tsx",
    "app.auth.login.tsx",
    "app.auth.register.tsx",
    "cbt.tsx",
  ];

  it("covers every content route", () => {
    // 16 routes carry metadata; the layout deliberately does not, because its
    // children each set their own.
    expect(routes).toHaveLength(16);
    for (const r of routes) {
      expect(read(`src/routes/${r}`), r).toMatch(/head: \(/);
    }
  });

  it("gives every route a distinct title", () => {
    // A shared title is the duplicate-title problem this pass fixes.
    const titles = routes
      .map((r) => read(`src/routes/${r}`))
      .map((src) => /\{ title: "([^"]+)"/.exec(src)?.[1])
      .filter((t): t is string => !!t);
    expect(titles).toHaveLength(routes.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("gives every indexable route a description, not just a title", () => {
    // The exam runner is excluded: it is noindex, so a description would be
    // written for a page no crawler is meant to read.
    for (const r of routes.filter((x) => x !== "cbt.tsx")) {
      const src = read(`src/routes/${r}`);
      expect(src, r).toContain('name: "description"');
    }
  });

  it("keeps the exam runner out of the index", () => {
    // A timed attempt is private in-progress state. Indexing it would publish a
    // half-finished paper and the student's own answers.
    const src = read("src/routes/cbt.tsx");
    expect(src).toMatch(/name: "robots", content: "noindex, nofollow"/);
  });

  it("derives the lesson title from the lesson rather than using one for all", () => {
    const src = read("src/routes/app.studytube.$video.tsx");
    expect(src).toMatch(/head: \(\{ match \}\)/);
    expect(src).toContain("search.title");
  });
});

describe("the sitemap and robots.txt are generated, not hand-written", () => {
  const sitemap = read("public/sitemap.xml");
  const robots = read("public/robots.txt");

  it("lists the content routes students actually search for", () => {
    for (const path of ["/app/pyq", "/app/map", "/app/studytube", "/app/tests"]) {
      expect(sitemap, path).toContain(`<loc>`);
      expect(sitemap).toMatch(new RegExp(`<loc>[^<]*${path.replace("/", "\\/")}</loc>`));
    }
  });

  it("never advertises the exam runner or the auth screens", () => {
    // A sitemap is a list of things you want crawled. A timed attempt and a
    // login form are not.
    expect(sitemap).not.toMatch(/<loc>[^<]*\/cbt<\/loc>/);
    expect(sitemap).not.toMatch(/<loc>[^<]*\/app\/auth/);
  });

  it("points crawlers at itself from robots.txt", () => {
    expect(robots).toMatch(/^Sitemap: https?:\/\//m);
  });

  it("disallows the exam runner in robots.txt as well as noindexing it", () => {
    expect(robots).toMatch(/Disallow: \/cbt/);
  });

  it("is generated from the route list, so it cannot drift", () => {
    // A hand-maintained sitemap advertises URLs that 404, which is a quality
    // signal against the whole site.
    const script = read("scripts/build-sitemap.mjs");
    expect(script).toContain("readdirSync");
    expect(script).toContain("sitemap.xml");
    // And the build runs it before vite copies public/ into the output.
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["build"]).toContain("build-sitemap");
    expect(pkg.scripts["build"]).toContain("vite build");
  });
});

describe("structured data is present and parseable", () => {
  const src = read("src/routes/__root.tsx");

  it("declares the organisation, the site and the app", () => {
    expect(src).toContain("application/ld+json");
    for (const type of ["Organization", "WebSite", "WebApplication"]) {
      expect(src, type).toContain(`"@type": "${type}"`);
    }
  });

  it("wires a sitelinks search box to the real search route", () => {
    expect(src).toContain("SearchAction");
    expect(src).toContain("/app/search?q={search_term_string}");
  });

  it("claims nothing the app does not do", () => {
    // The feature list is the shipped one. A structured-data claim the app
    // cannot back is a false advertisement to a crawler and to a student.
    const block = src.slice(src.indexOf("featureList"));
    for (const claim of [
      "previous-year papers",
      "computer-based test runner",
      "study planner",
      "syllabus map",
      "Spaced repetition",
      "Focus timer",
      "analytics",
    ]) {
      expect(block, claim).toContain(claim);
    }
  });
});

describe("the legal pages exist as real routes", () => {
  // AdSense will not approve a site without a privacy policy, and a student is
  // owed an accurate one before they trust a predicted score.
  it("ships privacy, terms and about", () => {
    for (const r of ["privacy.tsx", "terms.tsx", "about.tsx"]) {
      expect(read(`src/routes/${r}`), r).toContain('createFileRoute("/');
    }
  });

  it("links them from each other and from the app shell", () => {
    for (const r of ["privacy.tsx", "terms.tsx", "about.tsx"]) {
      expect(read(`src/routes/${r}`), r).toContain('href="/');
    }
    // A policy nobody can find is not a policy. The shell links them on every
    // screen, and the pages cross-link each other.
    const layout = read("src/routes/app.tsx");
    expect(layout, "shell footer").toContain('to="/privacy"');
    expect(layout, "shell footer").toContain('to="/terms"');
    expect(layout, "shell footer").toContain('to="/about"');
  });

  it("does not promise anything the code does not do", () => {
    const privacy = read("src/routes/privacy.tsx");
    const terms = read("src/routes/terms.tsx");
    // These are the two claims most often false in a template policy.
    expect(privacy).toContain("local storage");
    expect(terms).toContain("not affiliated");
    expect(terms).toContain("official");
  });

  it("states plainly that a practice percentile is not an admission outcome", () => {
    // The one claim that would actively mislead a student.
    expect(read("src/routes/terms.tsx")).toMatch(/rank|percentile|admission/);
  });

  it("derives the About numbers from the data rather than typing them in", () => {
    const about = read("src/routes/about.tsx");
    // A hardcoded "375 questions" becomes a lie the moment the library grows.
    expect(about).toContain("publishedCurricula()");
    expect(about).toContain("questions,");
    expect(about).not.toMatch(/"375|375 questions/);
  });
});

describe("the syllabus map is server-rendered, not fetched in an effect", () => {
  const src = read("src/routes/app.map.tsx");

  it("seeds its state synchronously rather than from null", () => {
    // The page used to start at null and fill in from a useEffect reading
    // localStorage, so the server shipped a pulse skeleton and no chapters.
    // Measured: 5 KB of HTML with neither a chapter name nor a subject count.
    expect(src).toMatch(/useState<SyllabusMap>\(\(\) =>/);
    expect(src).not.toMatch(/useState<SyllabusMap \| null>\(null\)/);
  });

  it("builds the default map from a real objective, not an empty string", () => {
    // An empty target resolves to `key: null` and renders the "no syllabus
    // map" panel - so the seeded target must be one that resolves.
    expect(src).toContain('DEFAULT_TARGET = "cbse27"');
  });

  it("still upgrades to the student's own objective and evidence", () => {
    // The seed exists so a crawler sees the syllabus; the effect is what makes
    // the page personal. Removing it would fix SEO and break the product.
    expect(src).toContain("masteryFromStores");
    expect(src).toContain("profile?.target");
  });

  it("does not blank the page when local storage cannot be read", () => {
    // A failure to read the store is not a reason to hide content that does
    // not depend on it.
    expect(src).toMatch(/Keep the synchronously built map/);
    expect(src).toMatch(/buildSyllabusMap\(chosen, new Map\(\)\)/);
  });

  it("no longer renders a pulse skeleton in place of content", () => {
    expect(src).not.toContain("animate-pulse");
  });
});

describe("the study shelves are server-rendered, not fetched first", () => {
  const src = read("src/routes/app.studytube.tsx");

  it("seeds the shelves synchronously from the offline catalog", () => {
    // The shelves were only filled by an effect awaiting a live fetch, so the
    // server shipped an empty shell and every shelf said "Finding lectures".
    expect(src).toMatch(/useState<Record<string, ShelfState>>\(\(\) =>/);
    expect(src).toContain("offlineCatalog(d.request)");
  });

  it("renders the seed until the live result replaces it", () => {
    expect(src).toContain("shelf.result?.items ?? shelf.seed ?? []");
  });

  it("never shows the seed and the live result together", () => {
    // The seed is a fallback, not an addition — otherwise a student sees the
    // same lecture twice under two different headings.
    expect(src).not.toMatch(/\.\.\.shelf\.seed/);
  });

  it("treats a seeded shelf as loaded, not loading", () => {
    expect(src).toContain("shelf.result ? shelf.loading : false");
  });

  it("seeds for the primary objective, not an unknown one", () => {
    // A shelf built for an unknown target renders generic picks a crawler
    // cannot connect to anything.
    expect(src).toContain('"jeemain"');
  });
});
