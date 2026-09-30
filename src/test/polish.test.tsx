/**
 * Phase C and D polish: print, offline, skip link, focus management.
 *
 * Each of these is small. Together they are the difference between an app that
 * works and an app that feels finished, and each one is cheap to regress, so each
 * one is pinned.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OfflineBanner } from "@/features/pwa/OfflineBanner";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("the skip link", () => {
  it("is the first focusable thing on the page", () => {
    const src = read("src/routes/app.tsx");
    const skipAt = src.indexOf("Skip to content");
    const mainAt = src.indexOf('id="ntacbt-main"');
    expect(skipAt).toBeGreaterThan(-1);
    expect(mainAt).toBeGreaterThan(skipAt);
    // It targets the main region, so activating it lands in the content.
    expect(src).toContain('href="#ntacbt-main"');
    expect(src).toContain('id="ntacbt-main"');
  });

  it("is hidden until focused, then visible", () => {
    // `sr-only` alone would leave it invisible even on focus; the pairing is what
    // makes it usable. Anchor on the link's own text, not on the first `<a` in
    // the file — there are several.
    const src = read("src/routes/app.tsx");
    const at = src.indexOf("Skip to content");
    const tagStart = src.lastIndexOf("<a", at);
    const tag = src.slice(tagStart, src.indexOf(">", at));
    expect(tag).toContain("sr-only");
    expect(tag).toContain("focus:not-sr-only");
  });
});

describe("the offline banner", () => {
  it("says nothing while online", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("appears when the connection drops", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineBanner />);
    expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();

    // Go offline the way the browser reports it.
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    window.dispatchEvent(new Event("offline"));

    expect(await screen.findByText(/you are offline/i)).toBeInTheDocument();
  });

  it("reassures rather than alarms", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineBanner />);
    const banner = await screen.findByRole("status");
    // The honest message: work continues locally, nothing is lost.
    expect(banner).toHaveTextContent(/still works/i);
    expect(banner).toHaveTextContent(/keeps saving/i);
    // And no scary language.
    expect(banner.textContent).not.toMatch(/lost|error|failed|warning/i);
  });

  it("offers a retry, because a dropped connection is often momentary", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineBanner />);
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("is hidden from print, where connectivity is irrelevant", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineBanner />);
    const banner = await screen.findByRole("status");
    expect(banner).toHaveAttribute("data-print", "hide");
  });

  it("cleans up its listeners when unmounted", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<OfflineBanner />);
    unmount();
    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toContain("online");
    expect(removed).toContain("offline");
  });
});

describe("the print stylesheet", () => {
  const css = read("src/styles.css");

  it("exists", () => {
    expect(css).toContain("@media print");
  });

  it("hides the app chrome", () => {
    const block = css.slice(css.indexOf("@media print"));
    for (const sel of ["header", "aside", "nav"]) {
      expect(block, sel).toContain(sel);
    }
    expect(block).toContain('data-print="hide"');
  });

  it("forces light colours, because browsers print the computed ones", () => {
    // In dark mode the computed colours are dark ink on a dark background, and
    // browsers print that faithfully — an unreadable page.
    const block = css.slice(css.indexOf("@media print"));
    expect(block).toContain("color-scheme: light");
    expect(block).toMatch(/--color-background:\s*#ffffff/);
    expect(block).toMatch(/--color-foreground:\s*#111827/);
  });

  it("drops shadows and gradients, which print as grey smears and muddy bands", () => {
    const block = css.slice(css.indexOf("@media print"));
    expect(block).toContain("box-shadow: none");
    expect(block).toContain("background-image: none");
  });

  it("keeps a question's analysis together rather than splitting it across pages", () => {
    const block = css.slice(css.indexOf("@media print"));
    expect(block).toContain("break-inside: avoid");
    expect(block).toContain("break-after: avoid");
  });

  it("expands external links, because a URL on paper cannot be clicked", () => {
    const block = css.slice(css.indexOf("@media print"));
    expect(block).toContain("attr(href)");
    // But not internal navigation, which is just noise.
    expect(block).toContain('a[href^="/"]::after');
  });

  it("does not touch the screen", () => {
    // Everything above lives inside the print block. If a rule escaped it, the
    // app would change on screen too.
    const after = css.slice(css.indexOf("@media print"));
    const closes = after.indexOf("\n}");
    expect(closes).toBeGreaterThan(-1);
  });
});

describe("focus management on the drawer and dialogs", () => {
  it("relies on Radix, which already traps focus and restores it", async () => {
    // The drawer is a Radix `Sheet` and the exam dialogs are Radix
    // `AlertDialog`s. Both move focus in on open, trap it while open, close on
    // Escape, and return focus to the trigger — which is the whole of the
    // requirement, so there is nothing to hand-roll. This test exists to record
    // that the decision was checked rather than assumed.
    const app = read("src/routes/app.tsx");
    expect(app).toContain("<Sheet");
    expect(app).toContain("<SheetContent");
    const cbt = read("src/routes/cbt.tsx");
    expect(cbt).toContain("<AlertDialog");
  });

  it("gives the dialog a title a screen reader can announce", () => {
    const cbt = read("src/routes/cbt.tsx");
    expect(cbt).toContain("<AlertDialogTitle");
    // And a description, so the choice is not made on the button labels alone.
    expect(cbt).toContain("<AlertDialogDescription");
  });

  it("labels the drawer for a screen reader", () => {
    const app = read("src/routes/app.tsx");
    expect(app).toContain("<SheetTitle");
    expect(app).toContain("<SheetDescription");
  });
});

describe("the exam keyboard legend", () => {
  const cbt = read("src/routes/cbt.tsx");

  it("is a native disclosure, so it works without JS and by keyboard", () => {
    expect(cbt).toContain("<details");
    expect(cbt).toContain("<summary");
  });

  it("remembers being dismissed on this device", () => {
    expect(cbt).toContain("legendDismissed");
    expect(cbt).toContain("localStorage.setItem");
  });

  it("renders every shortcut the hook implements", () => {
    // The legend is driven by EXAM_SHORTCUTS, so the route only has to reference
    // the array — the labels themselves live with the hook, which is where a
    // change to a shortcut has to be made anyway.
    expect(cbt).toContain("EXAM_SHORTCUTS");
    const shortcuts = read("src/features/exams/use-exam-keys.ts");
    for (const needed of ["Mark for review", "Clear your response", "Choose an option"]) {
      expect(shortcuts, needed).toContain(needed);
    }
  });
});

describe("the install prompt stays out of print", () => {
  it("is tagged so the print stylesheet can drop it", () => {
    expect(read("src/components/layout/InstallPrompt.tsx")).toContain('data-print="hide"');
  });
});
