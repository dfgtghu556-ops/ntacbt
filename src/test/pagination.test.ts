import { describe, expect, it } from "vitest";
import { pageSummary, pageWindow, paginate } from "@/features/ui/pagination";

const many = Array.from({ length: 100 }, (_, i) => i + 1);

describe("paginate", () => {
  it("returns the first page by default", () => {
    const p = paginate(many, { pageSize: 24 });
    expect(p.items).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(p.page).toBe(1);
    expect(p.totalPages).toBe(5);
    expect(p.hasNext).toBe(true);
    expect(p.hasPrev).toBe(false);
  });

  it("reports a 1-based from/to range", () => {
    const p = paginate(many, { page: 2, pageSize: 24 });
    expect(p.from).toBe(25);
    expect(p.to).toBe(48);
  });

  it("returns the last page correctly when it is short", () => {
    const p = paginate(many, { page: 5, pageSize: 24 });
    expect(p.items).toHaveLength(4); // 96 + 4 = 100
    expect(p.hasNext).toBe(false);
    expect(p.hasPrev).toBe(true);
    expect(p.to).toBe(100);
  });

  it("clamps a page past the end to the last page", () => {
    // A stale deep link must not show a blank grid with no explanation.
    const p = paginate(many, { page: 99, pageSize: 24 });
    expect(p.page).toBe(5);
    expect(p.items).toHaveLength(4);
  });

  it("clamps a page below one to the first page", () => {
    const p = paginate(many, { page: 0, pageSize: 24 });
    expect(p.page).toBe(1);
    const negative = paginate(many, { page: -5, pageSize: 24 });
    expect(negative.page).toBe(1);
  });

  it("clamps a fractional page", () => {
    expect(paginate(many, { page: 2.7, pageSize: 24 }).page).toBe(2);
  });

  it("treats an empty list as one page of nothing", () => {
    const p = paginate([], { pageSize: 24 });
    expect(p.totalItems).toBe(0);
    expect(p.items).toEqual([]);
    expect(p.totalPages).toBe(1);
    expect(p.from).toBe(0);
    expect(p.to).toBe(0);
    expect(p.hasNext).toBe(false);
    expect(p.hasPrev).toBe(false);
  });

  it("handles a single page", () => {
    const p = paginate(many, { pageSize: 500 });
    expect(p.totalPages).toBe(1);
    expect(p.items).toHaveLength(100);
    expect(p.hasNext).toBe(false);
    expect(p.hasPrev).toBe(false);
  });

  it("handles a page size that divides exactly", () => {
    const p = paginate(many, { pageSize: 25 });
    expect(p.totalPages).toBe(4);
    expect(paginate(many, { page: 4, pageSize: 25 }).items).toHaveLength(25);
  });

  it("never returns a zero or negative page size", () => {
    expect(paginate(many, { pageSize: 0 }).pageSize).toBeGreaterThan(0);
    expect(paginate(many, { pageSize: -10 }).pageSize).toBeGreaterThan(0);
    expect(paginate(many, {}).pageSize).toBeGreaterThan(0);
  });

  it("survives a non-array instead of throwing", () => {
    for (const bad of [null, undefined, "nope", 42, {}] as const) {
      const p = paginate(bad as never, { pageSize: 24 });
      expect(p.items).toEqual([]);
      expect(p.totalItems).toBe(0);
    }
  });

  it("does not mutate the input", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    paginate(input, { page: 2, pageSize: 2 });
    expect(input).toEqual(copy);
  });
});

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the current page centred with a span of two", () => {
    expect(pageWindow(10, 20)).toEqual([1, null, 8, 9, 10, 11, 12, null, 20]);
  });

  it("always includes the first and last page", () => {
    for (let cur = 1; cur <= 20; cur++) {
      const w = pageWindow(cur, 20);
      expect(w[0]).toBe(1);
      expect(w[w.length - 1]).toBe(20);
      expect(w).toContain(cur);
    }
  });

  it("does not elide when the window touches an edge", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, null, 20]);
    expect(pageWindow(20, 20)).toEqual([1, null, 18, 19, 20]);
  });

  it("never emits a duplicate page", () => {
    for (let cur = 1; cur <= 12; cur++) {
      const w = pageWindow(cur, 12).filter((p): p is number => p !== null);
      expect(new Set(w).size).toBe(w.length);
    }
  });

  it("handles a single page and a zero total", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 0)).toEqual([1]);
  });

  it("clamps a current page outside the range", () => {
    // Both clamp into range, and with five pages the whole range fits without a
    // gap — a single hidden page is shown rather than elided.
    expect(pageWindow(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(99, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(0, 20)).toEqual([1, 2, 3, null, 20]);
    expect(pageWindow(99, 20)).toEqual([1, null, 18, 19, 20]);
  });
});

describe("pageSummary", () => {
  it("says what is shown and how much is left", () => {
    expect(pageSummary(paginate(many, { page: 2, pageSize: 24 }), "papers")).toBe(
      "Showing 25 to 48 of 100 papers.",
    );
  });

  it("says nothing is there for an empty page", () => {
    expect(pageSummary(paginate([], {}), "papers")).toBe("No papers.");
  });

  it("pluralises whatever noun it is given, without inventing grammar", () => {
    expect(pageSummary(paginate(many, { pageSize: 24 }))).toContain("of 100 items");
  });
});
