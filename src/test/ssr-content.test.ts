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
