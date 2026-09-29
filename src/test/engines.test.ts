/**
 * Unit tests for the pure engines the whole product leans on: readiness /
 * survival, the humane streak, the planner adapter and the mentor report.
 *
 * Each of these is deterministic and framework-free by design, which is what
 * makes them testable without a DOM.
 */
import { describe, expect, it } from "vitest";
import { computeHumaneStreak } from "@/features/focus/streak";
import { buildMentorReport, mentorContextForAI } from "@/features/mentor/report";
import { DataStore } from "@/lib/store";

/* ------------------------------------------------------------------ *
 * Streak
 * ------------------------------------------------------------------ */

const DAY = 24 * 60 * 60 * 1000;

/** `Set` of local day keys, as `computeHumaneStreak` expects. */
function activeDays(offsets: number[], now = Date.now()): Set<string> {
  const set = new Set<string>();
  for (const offset of offsets) {
    const d = new Date(now - offset * DAY);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    set.add(key);
  }
  return set;
}

describe("computeHumaneStreak", () => {
  it("counts a contiguous run ending today", () => {
    const result = computeHumaneStreak(activeDays([0, 1, 2]), Date.now());
    expect(result.days).toBeGreaterThanOrEqual(3);
  });

  it("never reports a negative or absurd streak", () => {
    const result = computeHumaneStreak(activeDays([0, 400, 900]), Date.now());
    expect(result.days).toBeGreaterThanOrEqual(0);
    expect(result.days).toBeLessThan(1000);
  });

  it("survives an empty set", () => {
    const result = computeHumaneStreak(new Set<string>(), Date.now());
    expect(result.days).toBe(0);
  });

  it("survives hostile values", () => {
    const result = computeHumaneStreak(new Set(["not-a-date", ""]), Date.now());
    expect(Number.isFinite(result.days)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Mentor report
 * ------------------------------------------------------------------ */

describe("buildMentorReport", () => {
  it("produces a bounded, in-range report for a brand-new student", () => {
    const report = buildMentorReport({ store: new DataStore(), now: Date.now() });
    expect(report.readinessScore).toBeGreaterThanOrEqual(0);
    expect(report.readinessScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(report.actions)).toBe(true);
    expect(typeof report.summary).toBe("string");
  });

  it("is deterministic for identical input", () => {
    const now = 1_700_000_000_000;
    const a = buildMentorReport({ store: new DataStore(), now });
    const b = buildMentorReport({ store: new DataStore(), now });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("never throws on a null / malformed store", () => {
    expect(() =>
      buildMentorReport({ store: new DataStore(null as unknown as undefined) }),
    ).not.toThrow();
    expect(() =>
      buildMentorReport({
        store: new DataStore({ attempts: 42, tests: {}, settings: "x" } as never),
      }),
    ).not.toThrow();
    expect(() =>
      buildMentorReport({
        store: new DataStore({ aiPlanner: { profile: null, tasks: "bad" } } as never),
      }),
    ).not.toThrow();
  });

  it("keeps every derived number bounded for hostile stored marks", () => {
    // "Does not throw" is the weaker half of the contract. The mentor report has
    // its own copy of the percentile curve, and a stored total that is NaN,
    // Infinity, a string or wildly out of range must not be able to push a
    // derived figure out of its bounds. The percentile itself is internal — it
    // feeds the readiness score — so the score is what we can observe.
    const cases: unknown[] = [
      { totals: { marks: NaN, attempted: 10, correct: 3 } },
      { totals: { marks: Infinity, attempted: 10, correct: 3 } },
      { totals: { marks: "42", attempted: 10, correct: 3 } },
      { totals: { marks: -9999, attempted: 10, correct: 3 } },
      { totals: { marks: 1e9, attempted: 10, correct: 3 } },
      { totals: null },
      { totals: "not-an-object" },
      { totals: { marks: 180, attempted: 10, correct: 3 } },
    ];
    for (const totals of cases) {
      const report = buildMentorReport({
        store: new DataStore({ ...(totals as object) } as never),
        now: 1_700_000_000_000,
      });
      expect(Number.isFinite(report.readinessScore), JSON.stringify(totals)).toBe(true);
      expect(report.readinessScore).toBeGreaterThanOrEqual(0);
      expect(report.readinessScore).toBeLessThanOrEqual(100);
      // A good score must come from good work, never from a broken number.
      expect(report.readinessScore).toBeLessThan(50);
    }
  });

  it("keeps the AI context inside its character bound", () => {
    const report = buildMentorReport({ store: new DataStore() });
    expect(mentorContextForAI(report, 2400).length).toBeLessThanOrEqual(2400);
  });

  it("priority-sorts actions (critical first)", () => {
    const report = buildMentorReport({ store: new DataStore() });
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const weights = report.actions.map((a) => rank[a.priority] ?? 99);
    const sorted = [...weights].sort((x, y) => x - y);
    expect(weights).toEqual(sorted);
  });
});
