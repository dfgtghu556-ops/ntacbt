/**
 * Navigation contract tests.
 *
 * The mobile bottom bar renders `NAV` in a grid whose column count is derived
 * from `NAV.length`. When "Tests" was added to a hard-coded `grid-cols-5`, the
 * sixth item wrapped onto a second row and was effectively hidden on phones.
 * These tests exist so that can never happen silently again.
 */
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_NAV, NAV, SHELF } from "@/components/layout/nav";

describe("NAV", () => {
  it("has unique destinations", () => {
    const paths = NAV.map((n) => n.to);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("has unique labels", () => {
    const labels = NAV.map((n) => n.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps labels short enough for a phone bottom bar", () => {
    for (const item of NAV) {
      expect(item.label.length, `${item.label} is too long`).toBeLessThanOrEqual(9);
    }
  });

  it("stays within the thumb-zone budget", () => {
    // 6 destinations at 1/6 of a 390px viewport is ~65px each — comfortably
    // above the 44px minimum touch target. Beyond 7 the items get cramped.
    expect(NAV.length).toBeGreaterThanOrEqual(5);
    expect(NAV.length).toBeLessThanOrEqual(7);
  });

  it("points every destination at a real /app route", () => {
    for (const item of NAV) {
      expect(item.to.startsWith("/app"), item.to).toBe(true);
    }
  });

  it("ships an icon for every entry", () => {
    for (const item of NAV) {
      expect(typeof item.icon).not.toBe("undefined");
    }
  });
});

describe("SHELF", () => {
  it("only links to destinations that exist as real route files", () => {
    // The property that protects the student is that a shortcut resolves, not
    // that it happens to sit in the primary nav. A shelf entry pointing at a
    // route nobody wrote is a dead link; a shelf entry pointing at a real but
    // secondary surface (Memory Locker) is fine — the primary nav stays at the
    // six Phase 6 destinations so the mobile bottom bar does not wrap.
    const fs = nodeFs;
    const path = nodePath;
    for (const item of SHELF) {
      const routeFile = path.join(
        process.cwd(),
        "src/routes",
        `${item.to.replace(/^\//, "").replace(/\//g, ".")}.tsx`,
      );
      expect(fs.existsSync(routeFile), `${item.to} has no route file`).toBe(true);
    }
  });

  it("carries a search term only where one is meaningful", () => {
    for (const item of SHELF) {
      if (item.search) expect(item.search.q.length).toBeGreaterThan(0);
    }
  });
});

describe("every route is reachable from the nav", () => {
  // The regression this guards: the sidebar was `hidden lg:flex` and there was
  // no drawer, so on a phone the six-item bottom bar was the entire navigation.
  // Memory Locker, the syllabus map, Focus, Saarthi and the progress report
  // were reachable only as deep links inside page content — and `/app/report`
  // was in neither surface, so it was unreachable on desktop too.
  const routeFiles = nodeFs
    .readdirSync(nodePath.join(process.cwd(), "src/routes"))
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => f !== "__root.tsx" && !f.endsWith("._layout.tsx"))
    .filter((f) => !f.startsWith("api"))
    // `/` and the legal/marketing pages are linked from the footer and the
    // landing page, not from the app's own nav.
    .filter((f) => !["index.tsx", "privacy.tsx", "terms.tsx", "about.tsx"].includes(f))
    // Auth screens are deliberately not in the nav — a student who skips sign-in
    // keeps full access, so advertising them would imply they are required.
    .filter((f) => !f.startsWith("app.auth."))
    // The exam runner is full-screen and reached from the Tests surface.
    .filter((f) => f !== "cbt.tsx")
    // Search is reached from the search box in the header, which is on every
    // screen. A "Search" nav row next to a search box is redundant.
    .filter((f) => f !== "app.search.tsx");

  const linked = new Set(ALL_NAV.map((n) => n.to));

  /**
   * Route file to URL, following TanStack's conventions.
   * `app.pyq.tsx` maps to `/app/pyq`; `app.index.tsx` maps to `/app`.
   */
  function routePathFor(file: string): string {
    const base = file.replace(/\.tsx$/, "");
    if (base === "app.index") return "/app";
    return "/" + base.split(".").join("/");
  }

  it("has a route file for every destination it links to", () => {
    for (const item of ALL_NAV) {
      const routeFile = nodePath.join(
        process.cwd(),
        "src/routes",
        item.to === "/app"
          ? "app.index.tsx"
          : `${item.to.replace(/^\//, "").replace(/\//g, ".")}.tsx`,
      );
      expect(nodeFs.existsSync(routeFile), `${item.to} has no route file`).toBe(true);
    }
  });

  it("links every app route from at least one nav surface", () => {
    for (const file of routeFiles) {
      const to = routePathFor(file);
      // `app.studytube.$video` is a detail view reached from its parent list.
      if (to.includes("$")) continue;
      expect(linked.has(to), `${to} is in no nav surface`).toBe(true);
    }
  });

  it("reaches the progress report, which was previously orphaned everywhere", () => {
    // It was in neither the sidebar nor the bottom bar: the only way in was a
    // link on the dashboard or a result page.
    expect(linked.has("/app/report")).toBe(true);
  });

  it("reaches every surface the desktop sidebar used to hold exclusively", () => {
    for (const to of ["/app/memory", "/app/map", "/app/focus", "/app/saarthi"]) {
      expect(linked.has(to), `${to} must be reachable on mobile too`).toBe(true);
    }
  });

  it("keeps the primary nav at six so the bottom bar does not wrap", () => {
    // The drawer carries the rest; the bottom bar stays grid-locked.
    expect(NAV).toHaveLength(6);
  });
});

describe("the mobile drawer", () => {
  const layout = nodeFs.readFileSync(nodePath.join(process.cwd(), "src/routes/app.tsx"), "utf8");

  it("has a trigger that is visible on a phone", () => {
    // Without a `lg:hidden` trigger there is no way to open the drawer on the
    // only screen size that needs it.
    expect(layout).toContain("lg:hidden");
    expect(layout).toMatch(/aria-label="Open navigation menu"/);
  });

  it("renders the same NavPanel as the desktop sidebar", () => {
    // Two surfaces, one component — otherwise they drift and a route added to
    // one is missing from the other, which is how this bug started.
    expect(layout.match(/<NavPanel/g)?.length).toBe(2);
  });

  it("closes itself when a destination is tapped", () => {
    expect(layout).toContain("onNavigate={() => setNavOpen(false)}");
  });

  it("starts closed so SSR and the first client render agree", () => {
    expect(layout).toContain("useState(false)");
  });
});

describe("the app shell actually wraps the routes", () => {
  // The bug this guards: `src/routes/app._layout.tsx` was never a parent of
  // anything. In TanStack's flat routing a layout only wraps the routes that
  // descend from its own filename, so `app._layout.tsx` wrapped `app._layout.*`
  // — and no such file existed. Every `app.*` route was a sibling, parented to
  // the root.
  //
  // Measured before the fix, on both the dev server and the production bundle:
  // `/app`, `/app/pyq`, `/app/map` and `/app/planner` all returned HTML with
  // zero occurrences of the header's `sticky top-0` class and zero of the
  // sidebar's "Learning OS" heading. The whole app ran with no navigation at
  // all — you could only move between screens by typing URLs.
  //
  // The fix is the filename: `app.tsx` is the layout for the `/app` path, and
  // `app.pyq.tsx` descends from it. 15 routes now name it as their parent.
  const tree = nodeFs.readFileSync(nodePath.join(process.cwd(), "src/routeTree.gen.ts"), "utf8");

  it("names the layout route as the parent of the app routes", () => {
    // A count of zero is the regression: it means the shell renders nowhere.
    const parents = tree.match(/getParentRoute: \(\) => AppRoute/g) ?? [];
    expect(parents.length).toBeGreaterThan(10);
  });

  it("keeps the layout file at app.tsx, not app._layout.tsx", () => {
    // The filename IS the fix. Renaming it back reintroduces the bug with no
    // other change, which is why it is pinned here rather than left to a
    // comment nobody reads.
    expect(nodeFs.existsSync(nodePath.join(process.cwd(), "src/routes/app.tsx"))).toBe(true);
    expect(nodeFs.existsSync(nodePath.join(process.cwd(), "src/routes/app._layout.tsx"))).toBe(
      false,
    );
  });

  it("does not parent the marketing or auth routes to the app shell", () => {
    // `/`, `/privacy`, `/terms`, `/about` and the API routes are outside the
    // app shell on purpose — they have their own chrome.
    for (const route of ["IndexRoute", "PrivacyRoute", "TermsRoute", "AboutRoute"]) {
      const decl = new RegExp(`const ${route} = ${route}Import\\.update\\(\\{[^}]*\\}`, "s");
      const m = decl.exec(tree);
      expect(m, route).not.toBeNull();
      expect(m?.[0]).toContain("rootRouteImport");
    }
  });
});
