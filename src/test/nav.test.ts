/**
 * Navigation contract tests.
 *
 * The mobile bottom bar renders `NAV` in a grid whose column count is derived
 * from `NAV.length`. When "Tests" was added to a hard-coded `grid-cols-5`, the
 * sixth item wrapped onto a second row and was effectively hidden on phones.
 * These tests exist so that can never happen silently again.
 */
import { describe, expect, it } from "vitest";
import { NAV, SHELF } from "@/components/layout/nav";

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
  it("only links to destinations that also exist in NAV", () => {
    const navPaths = new Set(NAV.map((n) => n.to));
    for (const item of SHELF) {
      expect(navPaths.has(item.to), `${item.to} is not in NAV`).toBe(true);
    }
  });

  it("carries a search term only where one is meaningful", () => {
    for (const item of SHELF) {
      if (item.search) expect(item.search.q.length).toBeGreaterThan(0);
    }
  });
});
