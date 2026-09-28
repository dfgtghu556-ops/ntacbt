import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@/config/constants";
import type { ExamId } from "@/features/academics/types";
import {
  DEFAULT_CONTEXT,
  EXAM_GOALS,
  GOAL_LABEL,
  checkScopeLeak,
  classLevelOf,
  clearStudentContext,
  goalForTarget,
  isBoardGoal,
  isExamGoal,
  loadStudentContext,
  normalizeContext,
  saveStudentContext,
  scopeOf,
  studyTubeTarget,
  type StudentContext,
} from "@/features/context";

function readRaw(): unknown {
  const raw = localStorage.getItem(STORAGE_KEYS.STUDENT);
  return raw === null ? null : (JSON.parse(raw) as unknown);
}

/** The legacy `jeecbt.v1` shape: `{ settings, aiPlanner: { profile, tasks } }`. */
function seedLegacy(blob: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEYS.LEGACY_STATE, JSON.stringify(blob));
}

describe("DEFAULT_CONTEXT", () => {
  it("is a valid context and normalises to itself", () => {
    expect(normalizeContext(DEFAULT_CONTEXT)).toEqual(DEFAULT_CONTEXT);
  });

  it("is JEE Main by default — the product's historical assumption", () => {
    expect(DEFAULT_CONTEXT.goal).toBe("jee-main");
    expect(isExamGoal(DEFAULT_CONTEXT.goal)).toBe(true);
    expect(isBoardGoal(DEFAULT_CONTEXT.goal)).toBe(false);
    expect(studyTubeTarget(DEFAULT_CONTEXT)).toBe("jeemain");
  });
});

describe("normalizeContext", () => {
  it("never throws on hostile input", () => {
    for (const junk of [null, undefined, 0, "", "jee", [], true, { goal: 42 }]) {
      const ctx = normalizeContext(junk as unknown);
      expect(ctx.goal).toBe(DEFAULT_CONTEXT.goal);
      expect(ctx.subjects.length).toBeGreaterThan(0);
      expect(classLevelOf(ctx.goal)).toBe(ctx.classLevel);
    }
  });

  it("drops unknown fields instead of persisting them", () => {
    const ctx = normalizeContext({ goal: "cbse-12", evil: "xss" } as unknown);
    expect(ctx).not.toHaveProperty("evil");
    expect(ctx.goal).toBe("cbse-12");
  });

  it("moves the class level and syllabus year with the goal", () => {
    expect(normalizeContext({ ...DEFAULT_CONTEXT, goal: "cbse-11" }).classLevel).toBe(11);
    expect(normalizeContext({ ...DEFAULT_CONTEXT, goal: "cbse-11" }).syllabusYear).toBe("2026-27");
    expect(normalizeContext({ ...DEFAULT_CONTEXT, goal: "cbse-12" }).syllabusYear).toBe("2026-27");
    expect(normalizeContext({ ...DEFAULT_CONTEXT, goal: "jee-main" }).syllabusYear).toBe("2025-26");
  });

  it("keeps every goal mappable to a target and back", () => {
    for (const goal of EXAM_GOALS) {
      const target = studyTubeTarget(normalizeContext({ goal }));
      expect(typeof target).toBe("string");
      expect(target.length).toBeGreaterThan(0);
      expect(goalForTarget(target)).toBe(goal);
    }
  });

  it("refuses a null goalForTarget lookup", () => {
    expect(goalForTarget(undefined)).toBeNull();
    expect(goalForTarget("not-a-target")).toBeNull();
  });

  it("caps and de-dupes teachers and subjects", () => {
    const ctx = normalizeContext({
      ...DEFAULT_CONTEXT,
      teachers: Array.from({ length: 40 }, (_, i) => `t${i}`),
      subjects: ["Physics", "Physics", "Physics"],
    });
    expect(ctx.teachers.length).toBeLessThanOrEqual(12);
    expect(ctx.subjects).toEqual(["Physics"]);
  });

  it("clamps goals to the ranges the legacy UI itself enforces", () => {
    expect(
      normalizeContext({ ...DEFAULT_CONTEXT, goals: { dailyQuestions: 99_999 } }).goals
        .dailyQuestions,
    ).toBe(500);
    expect(
      normalizeContext({ ...DEFAULT_CONTEXT, goals: { focusMinutes: 9_999 } }).goals.focusMinutes,
    ).toBe(600);
    // Below the legacy minimum of 10 it is clamped up, not silently kept.
    expect(
      normalizeContext({ ...DEFAULT_CONTEXT, goals: { focusMinutes: 1 } }).goals.focusMinutes,
    ).toBe(10);
  });

  it("ignores a malformed syllabus year", () => {
    expect(
      normalizeContext({ ...DEFAULT_CONTEXT, goal: "jee-main", syllabusYear: "26-27" })
        .syllabusYear,
    ).toBe("2025-26");
  });
});

describe("scopeOf", () => {
  it("maps each goal onto an academic ExamId", () => {
    const expected: Record<string, ExamId> = {
      "jee-main": "JEE_MAIN",
      "jee-advanced": "JEE_ADVANCED",
      "cbse-11": "CBSE_11",
      "cbse-12": "CBSE_12",
    };
    for (const goal of EXAM_GOALS) {
      expect(scopeOf({ ...DEFAULT_CONTEXT, goal }).exam).toBe(expected[goal]);
    }
  });

  it("carries the syllabus year through to the scope", () => {
    // scopeOf reads whatever it is handed, so a scope must always be built
    // through normalizeContext — never from a raw object literal.
    expect(scopeOf(normalizeContext({ goal: "cbse-11" })).academicYear).toBe("2026-27");
    expect(scopeOf(normalizeContext({ goal: "jee-main" })).academicYear).toBe("2025-26");
  });
});

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default when nothing is stored", () => {
    expect(loadStudentContext()).toEqual(DEFAULT_CONTEXT);
  });

  it("returns the default when the blob is corrupt", () => {
    localStorage.setItem(STORAGE_KEYS.STUDENT, "{not json");
    expect(loadStudentContext()).toEqual(DEFAULT_CONTEXT);
  });

  it("round-trips a saved context", () => {
    const saved = saveStudentContext({ ...DEFAULT_CONTEXT, goal: "cbse-11", teachers: ["t1"] });
    expect(readRaw()).not.toBeNull();
    expect(loadStudentContext()).toEqual(saved);
  });

  it("saves normalised, never raw", () => {
    saveStudentContext({ goal: "nonsense", teachers: ["x"] } as unknown as StudentContext);
    expect((readRaw() as StudentContext).goal).toBe(DEFAULT_CONTEXT.goal);
  });

  it("bumps updatedAt on save", () => {
    const before = DEFAULT_CONTEXT.updatedAt;
    const saved = saveStudentContext({ ...DEFAULT_CONTEXT, goal: "cbse-12" });
    expect(saved.updatedAt).not.toBe(before);
  });

  it("clears the key", () => {
    saveStudentContext({ ...DEFAULT_CONTEXT, goal: "cbse-12" });
    clearStudentContext();
    expect(localStorage.getItem(STORAGE_KEYS.STUDENT)).toBeNull();
    expect(loadStudentContext()).toEqual(DEFAULT_CONTEXT);
  });
});

describe("seedFromLegacy", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default when there is no legacy blob", () => {
    expect(loadStudentContext().institute).toBeNull();
    expect(loadStudentContext().teachers).toEqual([]);
  });

  it("reads the AI planner target (the most explicit signal given)", () => {
    seedLegacy({
      aiPlanner: { profile: { target: "board12", language: "en", tasks: [] }, tasks: [] },
    });
    const ctx = loadStudentContext();
    expect(ctx.goal).toBe("cbse-12");
    expect(ctx.classLevel).toBe(12);
    expect(ctx.syllabusYear).toBe("2026-27");
  });

  it("reads the legacy settings goals, exam date and language", () => {
    seedLegacy({
      settings: {
        examDate: "2027-01-24",
        targetPercentile: 92,
        dailyGoal: 45,
        focusGoal: 45,
        lang: "hi",
      },
      aiPlanner: { profile: { target: "jeemain", tasks: [] }, tasks: [] },
    });
    const ctx = loadStudentContext();
    expect(ctx.goals.examDate).toBe("2027-01-24");
    expect(ctx.goals.targetPercentile).toBe(92);
    expect(ctx.goals.dailyQuestions).toBe(45);
    expect(ctx.goals.focusMinutes).toBe(45);
    expect(ctx.lang).toBe("hi");
  });

  it("reads an institute/teacher preference when one is present", () => {
    seedLegacy({
      aiPlanner: {
        profile: { target: "jeemain", institute: "allen", teacher: "NV Sir", tasks: [] },
        tasks: [],
      },
    });
    const ctx = loadStudentContext();
    expect(ctx.institute).toBe("allen");
    expect(ctx.teachers).toContain("NV Sir");
  });

  it("falls back to the default goal when the planner profile is absent", () => {
    seedLegacy({ settings: { examDate: "2026-01-24" } });
    const ctx = loadStudentContext();
    expect(ctx.goal).toBe(DEFAULT_CONTEXT.goal);
    expect(ctx.goals.examDate).toBe("2026-01-24");
  });

  it("never writes the seed back — the student has not chosen yet", () => {
    seedLegacy({ aiPlanner: { profile: { target: "board12", tasks: [] }, tasks: [] } });
    loadStudentContext();
    expect(localStorage.getItem(STORAGE_KEYS.STUDENT)).toBeNull();
  });

  it("survives a corrupt legacy blob", () => {
    localStorage.setItem(STORAGE_KEYS.LEGACY_STATE, "}{");
    expect(loadStudentContext().goal).toBe(DEFAULT_CONTEXT.goal);
  });
});

describe("checkScopeLeak", () => {
  const jee = normalizeContext({ goal: "jee-main" });
  const board = normalizeContext({ goal: "cbse-12" });

  it("accepts content that declares no target", () => {
    expect(checkScopeLeak(jee, {})).toEqual({ ok: true, reason: "no target declared" });
    expect(checkScopeLeak(board, {})).toEqual({ ok: true, reason: "no target declared" });
  });

  it("accepts matching scopes", () => {
    expect(checkScopeLeak(jee, { target: "jeemain" }).ok).toBe(true);
    expect(checkScopeLeak(jee, { target: "jeeadv" }).ok).toBe(true);
    expect(checkScopeLeak(board, { target: "board12" }).ok).toBe(true);
    expect(checkScopeLeak(normalizeContext({ goal: "cbse-11" }), { target: "board11" }).ok).toBe(
      true,
    );
  });

  it("flags JEE-only content served to a board student", () => {
    const leak = checkScopeLeak(board, { target: "jeemain" });
    expect(leak.ok).toBe(false);
    expect(leak.reason).toMatch(/JEE-only content shown to a CBSE Class 12 student/);
  });

  it("flags board-only content served to a JEE student", () => {
    const leak = checkScopeLeak(jee, { examTarget: ["board12"] });
    expect(leak.ok).toBe(false);
    expect(leak.reason).toMatch(/Board-only content shown to a JEE Main student/);
  });

  it("allows content tagged for both scopes", () => {
    expect(checkScopeLeak(jee, { examTarget: ["board12", "jeemain"] }).ok).toBe(true);
    expect(checkScopeLeak(board, { examTarget: ["board12", "jeemain"] }).ok).toBe(true);
  });

  it("never reports a leak for a normalised context against matching content", () => {
    for (const goal of EXAM_GOALS) {
      const ctx = normalizeContext({ goal });
      expect(checkScopeLeak(ctx, { target: studyTubeTarget(ctx) }).ok).toBe(true);
    }
  });
});

describe("labels", () => {
  it("has a human label for every goal", () => {
    for (const goal of EXAM_GOALS) {
      expect(GOAL_LABEL[goal]).toBeTruthy();
      expect(GOAL_LABEL[goal].length).toBeLessThanOrEqual(40);
    }
  });
});

describe("the regression this fixes", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("a CBSE student with no planner profile never gets JEE content", () => {
    // A student who only ever said "I am in Class 12 CBSE" — nothing else.
    const ctx = saveStudentContext({ goal: "cbse-12", subjects: ["Physics"] });
    expect(studyTubeTarget(ctx)).toBe("board12");
    expect(studyTubeTarget(ctx)).not.toBe("jeemain");
    expect(isBoardGoal(ctx.goal)).toBe(true);
    expect(checkScopeLeak(ctx, { target: studyTubeTarget(ctx) }).ok).toBe(true);
  });

  it("a JEE student who never saved anything still gets JEE content", () => {
    expect(studyTubeTarget(loadStudentContext())).toBe("jeemain");
  });

  it("the two directions can never be satisfied at once", () => {
    const ctx = saveStudentContext({ goal: "cbse-11" });
    const forJee = checkScopeLeak(ctx, { target: "jeeadv" });
    const forBoard = checkScopeLeak(ctx, { target: studyTubeTarget(ctx) });
    expect(forJee.ok).toBe(false);
    expect(forBoard.ok).toBe(true);
  });
});
