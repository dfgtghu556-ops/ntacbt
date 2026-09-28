/**
 * Unit tests for the NTA grading engine — the one module every score in the
 * product depends on, so it gets the most coverage.
 */
import { describe, expect, it } from "vitest";
import { evaluate, ntaPercentile, MARK_CORRECT, MARK_WRONG } from "@/features/cbt/engine";
import type { CbtQuestion, CbtResponseState, CbtTest } from "@/features/cbt/types";
import { emptyResponse } from "@/types/exam.types";

function q(
  id: string,
  subject: CbtQuestion["subject"],
  type: CbtQuestion["type"] = "mcq",
  answer = "a",
): CbtQuestion {
  return {
    id,
    no: Number(id.slice(1)),
    subject,
    type,
    text: `Question ${id}`,
    options:
      type === "mcq"
        ? [
            { label: "a", text: "A" },
            { label: "b", text: "B" },
          ]
        : [],
    answer,
  };
}

function test(questions: CbtQuestion[]): CbtTest {
  return {
    id: "t1",
    name: "Unit test paper",
    createdAt: 0,
    durationSec: 180 * 60,
    questions,
  };
}

function responses(
  entries: Array<[string, string | null, CbtResponseState["status"]?]>,
): Record<string, CbtResponseState> {
  return Object.fromEntries(
    entries.map(([id, ans, status]) => [
      id,
      { ...emptyResponse(), ans, status: status ?? (ans ? "answered" : "notanswered") },
    ]),
  );
}

describe("evaluate — NTA marking", () => {
  it("awards +4 for a correct MCQ and 0 for an unattempted one", () => {
    const t = test([q("1", "Physics"), q("2", "Physics")]);
    const result = evaluate(t, responses([["1", "a"]]), true);
    expect(result.all.correct).toBe(1);
    expect(result.all.skipped).toBe(1);
    expect(result.all.marks).toBe(MARK_CORRECT);
    expect(result.all.max).toBe(8);
  });

  it("applies −1 for a wrong MCQ", () => {
    const t = test([q("1", "Physics")]);
    const result = evaluate(t, responses([["1", "b"]]), true);
    expect(result.all.wrong).toBe(1);
    expect(result.all.marks).toBe(MARK_WRONG);
    expect(result.all.neg).toBe(1);
  });

  it("does not penalise a wrong integer answer (official 2026 rule)", () => {
    const t = test([q("1", "Mathematics", "integer", "42")]);
    const result = evaluate(t, responses([["1", "43"]]), true);
    expect(result.all.wrong).toBe(1);
    expect(result.all.marks).toBe(0);
    expect(result.all.neg).toBe(0);
  });

  it("accepts an integer answer inside the published range", () => {
    const t = test([q("1", "Mathematics", "integer", "42")]);
    const withAccept: CbtTest = {
      ...t,
      questions: [{ ...t.questions[0]!, accept: { kind: "range", lo: 41, hi: 43 } }],
    };
    const result = evaluate(withAccept, responses([["1", "42"]]), true);
    expect(result.all.correct).toBe(1);
    expect(result.all.marks).toBe(4);
  });

  it("splits marks per subject", () => {
    const t = test([q("1", "Physics"), q("2", "Chemistry"), q("3", "Mathematics")]);
    const result = evaluate(
      t,
      responses([
        ["1", "a"],
        ["2", "b"],
      ]),
      true,
    );
    expect(result.per.Physics.marks).toBe(4);
    expect(result.per.Chemistry.marks).toBe(-1);
    expect(result.per.Mathematics.marks).toBe(0);
  });

  it("reports accuracy as correct / attempted, never inflated by skips", () => {
    const t = test([q("1", "Physics"), q("2", "Physics")]);
    const result = evaluate(t, responses([["1", "a"]]), true);
    expect(result.all.accuracy).toBe(100);
    const half = evaluate(
      t,
      responses([
        ["1", "a"],
        ["2", "b"],
      ]),
      true,
    );
    expect(half.all.accuracy).toBe(50);
  });

  it("never divides by zero on an empty response set", () => {
    const t = test([q("1", "Physics")]);
    const result = evaluate(t, {}, true);
    expect(result.all.accuracy).toBe(0);
    expect(result.all.marks).toBe(0);
  });
});

describe("ntaPercentile", () => {
  it("is monotonic across the whole marks range", () => {
    let previous = -1;
    for (let marks = 0; marks <= 300; marks += 1) {
      const pct = ntaPercentile(marks);
      expect(pct).toBeGreaterThanOrEqual(previous);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
      previous = pct;
    }
  });

  it("is deterministic", () => {
    expect(ntaPercentile(120)).toBe(ntaPercentile(120));
  });
});
