import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for the things that only break *after* a deploy.
 *
 * Every defect in this file was found by measuring a real build, not by
 * reading code — and every one of them was invisible to the local test
 * suite, because each of them depends on something that is true in
 * production and false on a laptop:
 *
 * - A deployed function bundle contains no `public/` directory, because
 *   static assets are served by the CDN from beside it. A route that reads
 *   the baked PYQ index off the filesystem therefore works in dev and fails
 *   in production. It did: the live `/app/pyq` rendered "Loading papers" and
 *   none of the papers.
 * - `npm install` resolves peer dependencies strictly, so a React 19 app
 *   with `@testing-library/react@14` cannot be installed at all. Vercel
 *   installs before it builds, so every deploy died before reaching the
 *   build. Every recorded deployment against this repository has status
 *   `failure`.
 * - The canonical host, the sitemap host and the robots `Sitemap:` line were
 *   a domain that serves a different, older build of this app.
 *
 * These are assertions about the shape of the repository, which is the only
 * thing that can be checked without a deploy. They are deliberately blunt:
 * each one fails loudly rather than allowing the same regression to return
 * quietly.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const pkg = () => JSON.parse(read("package.json")) as { scripts: Record<string, string> };

/**
 * Source with its comments removed.
 *
 * These files explain the bugs they used to have, and an explanation
 * necessarily quotes the old code. A guard that reads the raw text would
 * therefore trip over the very comment documenting the fix, so the comments
 * go first and only executable source is judged.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the deployed server does not read the baked bank off the filesystem", () => {
  const ROUTES_READING_THE_BANK = ["src/routes/app.pyq.tsx", "src/routes/about.tsx"];

  it("no route reads public/ from disk", () => {
    for (const route of ROUTES_READING_THE_BANK) {
      const source = code(route);
      expect(
        source.includes("process.cwd()"),
        `${route} reads the filesystem; a deployed function bundle has no public/ directory. ` +
          `Use loadBakedIndex() from @/features/pyq/baked-index.server instead.`,
      ).toBe(false);
    }
  });

  it("the shared loader exists and tries every place the bytes can be", () => {
    const source = code("src/features/pyq/baked-index.server.ts");
    expect(source).toContain("export async function loadBakedIndex");
    // Disk (dev), the build output (local production build), and the origin
    // the static asset is actually served from (the real deployment).
    expect(source).toContain('"public", "pyq", "index.json"');
    expect(source).toContain('".output", "public", "pyq", "index.json"');
    expect(source).toContain("/pyq/index.json");
  });

  it("the API route degrades to the baked library instead of a 503", () => {
    const source = read("src/routes/api/public/pyq-papers.ts");
    expect(source).toContain("loadBakedIndex");
    // A 503 with no papers is the state the live page was stuck in.
    expect(source).toContain('source: "baked"');
  });
});

describe("a clean checkout can be installed and built", () => {
  it("npm is told to resolve peers the way the project actually resolves them", () => {
    // `@testing-library/react@14` declares `react: ^18.0.0`; the app is on
    // React 19. npm's default resolver aborts the whole install on that
    // conflict, which is what made every deployment fail before it reached
    // the build.
    const npmrc = read(".npmrc");
    expect(npmrc).toMatch(/legacy-peer-deps\s*=\s*true/);
  });

  it("the validation gate bakes the bank before it validates it", () => {
    // `public/pyq/` is gitignored and baked at build time. Without the bake
    // in front of it, `validate:all` aborted at the second validator and the
    // other twelve never ran.
    const scripts = pkg().scripts;
    expect(scripts["validate:all"]).toMatch(/bake-pyq/);
    expect(scripts["validate:data"]).toMatch(/bake-pyq/);
  });

  it("the Vercel build output is not committable", () => {
    const ignored = read(".gitignore");
    expect(ignored).toMatch(/^\.vercel\/?$/m);
  });

  it("Vercel is told exactly how to install and what to build", () => {
    // The repository carries two lockfiles. Vercel infers the package manager
    // from whichever lockfile it finds, and the inference is not the same
    // rule everywhere: the documented table pairs `package-lock.json` with
    // `npm install` and `bun.lock` with `bun install`, and there are open
    // reports of the Bun path being taken and the lockfile failing to
    // parse. Pinning the install command removes the guess entirely and
    // guarantees the lockfile that is actually verified here is the one that
    // is used.
    const vercel = JSON.parse(read("vercel.json")) as {
      installCommand?: string;
      buildCommand?: string;
      framework?: string | null;
      outputDirectory?: string;
    };
    expect(vercel.installCommand).toMatch(/^npm ci\b/);
    expect(vercel.buildCommand).toBe("npm run build");
    // "Other" — the preset that serves whatever the build emits. A framework
    // preset left over in the project settings would make Vercel look for a
    // directory this build does not produce.
    expect(vercel.framework).toBeNull();
    // The build emits the Build Output API layout, which Vercel detects from
    // `.vercel/output/`. Naming an output directory would make it look
    // there instead.
    expect(vercel.outputDirectory).toBeUndefined();
  });
});

describe("every absolute URL points at the host that serves the app", () => {
  /** The host the app is actually deployed on. */
  const LIVE_HOST = "https://ntacbt.lovable.app";

  it("the site config and the sitemap generator agree", () => {
    // The value that is actually assigned, not the one a comment mentions.
    const assigned = (source: string, name: string) =>
      source.match(new RegExp(`${name}\\s*=[^;\\n]*"(https://[^"]+)"`))?.[1] ?? "";
    expect(assigned(code("src/config/site.ts"), "FALLBACK")).toBe(LIVE_HOST);
    expect(assigned(code("scripts/build-sitemap.mjs"), "SITE_URL")).toBe(LIVE_HOST);
  });

  it("the generated sitemap uses that host", () => {
    const xml = read("public/sitemap.xml");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? "");
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(loc.startsWith(`${LIVE_HOST}/`), `${loc} points off-site`).toBe(true);
    }
  });

  it("robots.txt points its Sitemap directive at the same host", () => {
    expect(read("public/robots.txt")).toContain(`Sitemap: ${LIVE_HOST}/sitemap.xml`);
  });

  it("the sitemap's lastmod comes from git, not the clock", () => {
    // It used to be today's date, written on every build. That dirtied the
    // working tree after every build and told a crawler a page had changed
    // when it had not.
    const script = code("scripts/build-sitemap.mjs");
    expect(script).toContain('"--format=%cs"');
    expect(script).not.toMatch(/const today = new Date\(\)/);
  });
});

describe("the page does not cry wolf about its own data", () => {
  it("starts in the seeded state, not the degraded one", () => {
    // `source` used to start as "baked", and the banner rendered "Full
    // library is temporarily unreachable" on the server-rendered HTML even
    // though the baked papers were right there in the list. The seeded state
    // says what is true instead.
    const route = read("src/routes/app.pyq.tsx");
    expect(route).toMatch(/type PyqSource = [^;]*"seeded"/);
    expect(route).toMatch(/useState<PyqSource>\("seeded"\)/);
  });
});
