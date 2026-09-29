import { describe, expect, it } from "vitest";
import { buildTodayPlan } from "@/features/planner/today";
import { localDayKey } from "@/lib/store";
import { buildMastery } from "@/features/mastery/mastery";
import type { PlannerTaskRow } from "@/lib/store";

const DAY = "2026-09-29";
const NOW = new Date(`${DAY}T10:00:00`).getTime();

function task(
  subject: string,
  chapter: string,
  date: string,
  opts: { status?: "pending" | "done"; estMin?: number; kind?: string } = {},
): PlannerTaskRow {
  return {
    id: `${subject}-${chapter}-${date}`,
    date,
    subject,
    chapter,
    topic: chapter,
    kind: opts.kind ?? "learn",
    status: opts.status ?? "pending",
    estMin: opts.estMin ?? 45,
  } as PlannerTaskRow;
}

/** A mastery map from raw attempts, so the tests drive the real engine. */
function masteryOf(
  attempts: { subject: string; chapter: string; correct: boolean }[],
  lessons: { subject: string; chapter: string }[] = [],
): Map<string, ReturnType<typeof buildMastery> extends Map<string, infer V> ? V : never> {
  return buildMastery({
    attempts: attempts.map((a, i) => ({
      subject: a.subject,
      chapter: a.chapter,
      topic: a.chapter,
      correct: a.correct,
      attemptedAt: NOW - i * 1000,
      pyq: false,
    })),
    lessons: lessons.map((l) => ({
      videoId: `v-${l.subject}-${l.chapter}`,
      subject: l.subject,
      chapter: l.chapter,
      finished: true,
      recall: null,
      practice: null,
      updatedAt: NOW,
    })),
  });
}

describe("buildTodayPlan — today's tasks", () => {
  it("shows only today's tasks", () => {
    const plan = buildTodayPlan({
      tasks: [
        task("Physics", "Electrostatics", DAY),
        task("Chemistry", "Solutions", DAY),
        task("Mathematics", "Integrals", "2026-09-30"),
      ],
      mastery: masteryOf([]),
      now: NOW,
    });
    expect(plan.isToday).toBe(true);
    expect(plan.dayKey).toBe(DAY);
    expect(plan.tasks).toHaveLength(2);
    expect(plan.chaptersTouched).toBe(2);
  });

  it("falls back to the nearest upcoming day when today is empty", () => {
    // A student opening the app on a rest day still needs to know what is next.
    const plan = buildTodayPlan({
      tasks: [
        task("Physics", "Electrostatics", "2026-10-02"),
        task("Chemistry", "Solutions", "2026-10-05"),
        task("Mathematics", "Integrals", "2026-09-28", { status: "done" }),
      ],
      mastery: masteryOf([]),
      now: NOW,
    });
    expect(plan.isToday).toBe(false);
    expect(plan.dayKey).toBe("2026-10-02");
    expect(plan.tasks).toHaveLength(1);
    expect(plan.note).toContain("next planned day is 2026-10-02");
  });

  it("never counts a done task from an earlier day as upcoming", () => {
    const plan = buildTodayPlan({
      tasks: [task("Physics", "Electrostatics", "2026-09-01", { status: "done" })],
      mastery: masteryOf([]),
      now: NOW,
    });
    expect(plan.tasks).toHaveLength(0);
    expect(plan.note).toContain("Nothing scheduled for today");
  });

  it("counts real watched minutes over the planned estimate once done", () => {
    const plan = buildTodayPlan({
      tasks: [
        {
          ...task("Physics", "Electrostatics", DAY, { estMin: 45, status: "done" }),
          actualMin: 90,
        },
        task("Chemistry", "Solutions", DAY, { estMin: 60 }),
      ],
      mastery: masteryOf([]),
      now: NOW,
    });
    expect(plan.plannedMin).toBe(150);
    expect(plan.doneMin).toBe(90);
  });

  it("survives an empty, null or malformed plan", () => {
    for (const tasks of [[], null as never, undefined as never, [null as never]]) {
      const plan = buildTodayPlan({ tasks, mastery: masteryOf([]), now: NOW });
      expect(plan.tasks).toEqual([]);
      expect(plan.dayKey).toBe(DAY);
      expect(plan.plannedMin).toBe(0);
    }
  });

  it("flags a weak-target task using the planner's own key format", () => {
    const plan = buildTodayPlan({
      tasks: [task("Physics", "Electrostatics", DAY), task("Chemistry", "Solutions", DAY)],
      mastery: masteryOf([]),
      weakTargets: new Set(["Physics::Electrostatics"]),
      now: NOW,
    });
    expect(plan.tasks.find((t) => t.chapter === "Electrostatics")?.isWeakTarget).toBe(true);
    expect(plan.tasks.find((t) => t.chapter === "Solutions")?.isWeakTarget).toBe(false);
  });
});

describe("buildTodayPlan — 3–5 weak areas", () => {
  it("returns at most five, ranked weakest first", () => {
    const attempts = [
      ...Array.from({ length: 4 }, () => ({
        subject: "Physics",
        chapter: "Electrostatics",
        correct: false,
      })),
      ...Array.from({ length: 4 }, () => ({
        subject: "Chemistry",
        chapter: "Solutions",
        correct: true,
      })),
      ...Array.from({ length: 4 }, () => ({
        subject: "Mathematics",
        chapter: "Integrals",
        correct: true,
      })),
    ];
    const plan = buildTodayPlan({ tasks: [], mastery: masteryOf(attempts), now: NOW });
    expect(plan.weakAreas.length).toBeLessThanOrEqual(5);
    expect(plan.weakAreas[0]?.chapter).toBe("Electrostatics");
    expect(plan.weakAreas[0]?.accuracy).toBe(0);
    expect(plan.weakAreas[0]?.attempts).toBe(4);
  });

  it("reports a thin sample as null rather than 0%", () => {
    // One attempt is not a score. Showing 0% here would brand a chapter weak on
    // a single wrong answer.
    const plan = buildTodayPlan({
      tasks: [],
      mastery: masteryOf([{ subject: "Physics", chapter: "Electrostatics", correct: false }]),
      now: NOW,
    });
    const top = plan.weakAreas[0];
    expect(top?.chapter).toBe("Electrostatics");
    expect(top?.accuracy).toBeNull();
    expect(top?.attempts).toBe(1);
    expect(top?.reason).toContain("not enough to score yet");
  });

  it("says why a chapter with no evidence is listed", () => {
    const plan = buildTodayPlan({
      tasks: [],
      mastery: masteryOf([], [{ subject: "Physics", chapter: "Electrostatics" }]),
      now: NOW,
    });
    const top = plan.weakAreas[0];
    expect(top?.attempts).toBe(0);
    expect(top?.lessonsFinished).toBe(1);
    expect(top?.reason).toContain("no questions attempted yet");
  });

  it("has no evidence at all when the student has attempted nothing", () => {
    const plan = buildTodayPlan({ tasks: [], mastery: masteryOf([]), now: NOW });
    expect(plan.weakAreas).toEqual([]);
    expect(plan.hasEvidence).toBe(false);
  });
});

describe("buildTodayPlan — the one primary action", () => {
  it("sends a student with no evidence to a diagnostic", () => {
    // This is the only honest first move: every other number on the dashboard
    // depends on there being at least one attempt.
    const plan = buildTodayPlan({ tasks: [], mastery: masteryOf([]), now: NOW });
    expect(plan.primary.label).toBe("Start a diagnostic");
    expect(plan.primary.to).toBe("/cbt");
    expect(plan.primary.reason).toContain("No attempt evidence yet");
  });

  it("sends a student with pending tasks to the first weak target", () => {
    const attempts = Array.from({ length: 4 }, () => ({
      subject: "Physics",
      chapter: "Electrostatics",
      correct: false,
    }));
    const plan = buildTodayPlan({
      tasks: [task("Physics", "Electrostatics", DAY), task("Chemistry", "Solutions", DAY)],
      mastery: masteryOf(attempts),
      weakTargets: new Set(["Physics::Electrostatics"]),
      now: NOW,
    });
    expect(plan.primary.label).toBe("Work on Electrostatics");
    expect(plan.primary.reason).toContain("flagged weak target");
  });

  it("sends a student with pending tasks to the first task when none are weak", () => {
    const attempts = Array.from({ length: 4 }, () => ({
      subject: "Physics",
      chapter: "Electrostatics",
      correct: true,
    }));
    const plan = buildTodayPlan({
      tasks: [task("Chemistry", "Solutions", DAY)],
      mastery: masteryOf(attempts),
      now: NOW,
    });
    expect(plan.primary.label).toBe("Work on Solutions");
    expect(plan.primary.reason).not.toContain("weak target");
  });

  it("sends a student who finished today's tasks to mistake review", () => {
    const attempts = Array.from({ length: 4 }, () => ({
      subject: "Physics",
      chapter: "Electrostatics",
      correct: false,
    }));
    const plan = buildTodayPlan({
      tasks: [task("Physics", "Electrostatics", DAY, { status: "done" })],
      mastery: masteryOf(attempts),
      now: NOW,
    });
    expect(plan.primary.label).toBe("Review today's mistakes");
    expect(plan.primary.to).toBe("/app/analytics");
  });

  it("names the weakest chapter when nothing is scheduled", () => {
    const attempts = Array.from({ length: 4 }, () => ({
      subject: "Physics",
      chapter: "Electrostatics",
      correct: false,
    }));
    const plan = buildTodayPlan({ tasks: [], mastery: masteryOf(attempts), now: NOW });
    expect(plan.primary.label).toBe("Start Electrostatics");
    expect(plan.primary.reason).toContain("0% accuracy");
  });

  it("never claims an accuracy figure for a thin sample", () => {
    const plan = buildTodayPlan({
      tasks: [],
      mastery: masteryOf([{ subject: "Physics", chapter: "Electrostatics", correct: false }]),
      now: NOW,
    });
    expect(plan.primary.reason).not.toContain("%");
    expect(plan.primary.reason).toContain("No question evidence");
  });
});

describe("buildTodayPlan — day-key contract", () => {
  it("uses the store's own day-key helper, so Home and the planner agree", () => {
    // A dashboard that computed "today" differently from the planner would show
    // a task list that never matches the planner page.
    const plan = buildTodayPlan({ tasks: [], mastery: masteryOf([]), now: NOW });
    expect(plan.dayKey).toBe(localDayKey(NOW));
  });
});
