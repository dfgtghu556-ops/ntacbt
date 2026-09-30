/**
 * Shell bridge (B1) — neither shell may be a one-way door.
 *
 * There are two products in this repo and there will be for a while: the React
 * Learning OS at `/app`, and the classic PDF paper builder at
 * `public/jee-cbt.html`. The rebuild plan asks for shell unification, and the
 * scope decision is explicit that the legacy file is not deleted. That leaves
 * one thing worth guarding: **the bridge must run in both directions.**
 *
 * The legacy shell has linked to `/app` since the React app landed. Nothing in
 * the React app ever linked back, so a student who bookmarked the old tool had
 * to type the URL from memory. This suite fails if either direction is lost.
 *
 * These are text assertions over the source, not render assertions: the bridge
 * is a plain anchor between two separately-built bundles, and it has to survive
 * a refactor of either one.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("legacy shell links to the Learning OS", () => {
  it("public/jee-cbt.html links to /app", () => {
    const html = read("public/jee-cbt.html");
    expect(html).toMatch(/href="\/app"/);
  });

  it("the link says what is on the other side, not just an icon", () => {
    const html = read("public/jee-cbt.html");
    expect(html).toMatch(/Learning OS/i);
  });
});

describe("Learning OS links back to the legacy shell", () => {
  it("the Tests page links to the PDF paper builder", () => {
    const page = read("src/routes/app.tests.tsx");
    expect(page).toMatch(/href="\/jee-cbt\.html"/);
  });

  it("the link names the capability the React runner lacks", () => {
    const page = read("src/routes/app.tests.tsx");
    // A bare link with no explanation is the reason the bridge was invisible.
    expect(page).toMatch(/PDF/i);
  });

  it("the link is a plain anchor, not a router Link — the target is outside /app", () => {
    const page = read("src/routes/app.tests.tsx");
    // `<Link to="/jee-cbt.html">` would 404: TanStack only knows its own routes.
    expect(page).not.toMatch(/<Link\s+to="\/jee-cbt\.html"/);
  });
});

describe("the two products are honestly distinguished", () => {
  it("the legacy title and the React title are not the same product claim", () => {
    const legacy = read("public/jee-cbt.html");
    const root = read("src/routes/__root.tsx");
    // The legacy page is the CBT platform; the React app is the Learning OS.
    // If they ever collapse into one identical string a student cannot tell
    // which of two bookmarks they are holding.
    expect(legacy).toMatch(/CBT Platform/i);
    expect(root).toMatch(/Learning OS/i);
  });

  it("the legacy shell still ships a working skip link", () => {
    const html = read("public/jee-cbt.html");
    expect(html).toMatch(/class="skip-link"\s+href="#app"/);
  });
});
