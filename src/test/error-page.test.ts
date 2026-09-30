import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * The 500 page.
 *
 * The boundary existed before this pass and already logged, reported and
 * offered a retry. What was unverified was the status code and the tab title,
 * and both were measured against the production build:
 *
 *  - A throwing route loader returns **HTTP 500** (verified: `curl -w
 *    %{http_code} /app/focus` with a loader that throws → 500). So the status
 *    was already correct and must not be "fixed" by adding a client-side
 *    `setResponseStatus` call — the build rejects that import in client code,
 *    which is the right answer, because a client-side crash has no response to
 *    set.
 *  - The served `<title>` was the **route's own** title, because the head is
 *    rendered before the error surfaces. A crashed page's tab therefore read
 *    "Focus Timer for JEE Preparation".
 */

describe("the 500 page", () => {
  const root = read("src/routes/__root.tsx");

  it("has an error boundary wired to the root route", () => {
    expect(root).toContain("errorComponent: ErrorComponent");
  });

  it("keeps the retry affordance", () => {
    // A 500 that offers nothing is a dead end.
    expect(root).toContain("router.invalidate()");
    expect(root).toContain("Try again");
    expect(root).toContain("Go home");
  });

  it("fixes the tab title when a render fails", () => {
    // The status code is already 500; the title was not. This is the half that
    // was actually wrong.
    expect(root).toContain('document.title = "Something went wrong — NTACBT"');
  });

  it("does not try to set a response status from client code", () => {
    // The build rejects `@tanstack/react-start/server` in the client bundle —
    // correctly, because there is no response to set on a client-side failure.
    // Pinning the *import* rather than the call, so a comment mentioning it
    // cannot make the guard pass on broken code.
    expect(root).not.toMatch(/^import .*react-start\/server/m);
  });

  it("serves a real 500 from the server entry for a catastrophic SSR failure", () => {
    // h3 swallows in-handler throws into a 200-shaped JSON body, so the entry
    // normalises them into a 500 HTML page.
    const entry = read("src/server.ts");
    expect(entry).toContain("status: 500");
    expect(entry).toContain("renderErrorPage()");
    expect(entry).toMatch(/response\.status < 500/);
  });

  it("renders the fallback page without the app shell", () => {
    // A catastrophic failure means React may not render at all, so the fallback
    // must be self-contained HTML.
    const page = read("src/lib/error-page.ts");
    expect(page).toContain("<!doctype html>");
    expect(page).toContain("Try again");
    expect(page).toContain('href="/"');
    // It must not import the app — the point is that it works when the app is
    // the thing that broke.
    expect(page).not.toContain("import ");
  });
});
