/**
 * Goal-based to-do engine + auto re-plan (F1, F3).
 *
 * These are the two features `docs/PRODUCT-ROADMAP-AUDIT.md` ranks as fixing
 * the top quitting trigger, and until now they existed only inside
 * `public/jee-cbt.html` (`aipToday`/`aipGenerate`, `aipRebalance`/
 * `aipRebalanceActual`).
 *
 * The tests below are written against the failure modes rather than the happy
 * path, because the happy path is the easy part:
 *
 *  - progress is counted in **goals**, never in hours — the number that makes a
 *    short day feel like a failure is the one this must not produce;
 *  - a missed task is **carried once**, never duplicated into tomorrow and the
 *    day after;
 *  - a carried task never outranks today's own work;
 *  - finishing early offers **one** more thing, not tomorrow's whole list;
 *  - an older-than-the-window task is left on the planner rather than silently
 *    re-listed forever;
 *  - nothing here writes to storage — the stored planner belongs to the legacy
 *    app, and the scope decision says not to change its schedule.
 */

import { describe, expect, it } from "vitest";

import { buildTodoPlan, goalProgress, recoveryNote } from "../features/planner/todo";
import { clearDone, loadDoneIds, saveDoneIds, toggleDoneId } from "../features/planner/todo-store";
import { localDayKey, type PlannerTaskRow } from "../lib/store";
import type { WeakTopic } from "../features/dashboard/types";

const NOW = new Date("2026-09-29T10:00:00").getTime();
const TODAY = localDayKey(NOW);

function dayKey(offsetDays: number): string {
  return localDayKey(NOW + offsetDays * 24 * 3600 * 1000);
}

function task(over: Partial<PlannerTaskRow> & { id: string }): PlannerTaskRow {
  return {
    subject: "Physics",
    chapter: "Electrostatics",
    topic: "Coulomb's law",
    kind: "practice",
    date: TODAY,
    estMin: 45,
    status: "pending",
    ...over,
  } as PlannerTaskRow;
}

const WEAK: WeakTopic[] = [
  {
    subject: "Chemistry",
    chapter: "Electrochemistry",
    topic: "Nernst equation",
    accuracy: 32,
    attemptCount: 9,
    reason: "3/9 correct on Electrochemistry.",
  },
];

/**
 * `WeakTopic.accuracy` is non-nullable: `readiness.ts` excludes a thin sample
 * with `attempted < 2` rather than scoring it 0%, so a null accuracy cannot
 * come from the current producer. The branch in `reasonFor` is defensive
 * against a future producer that widens the type, which is what this checks.
 */
const THIN = [
  {
    subject: "Physics",
    chapter: "Optics",
    topic: "Refraction",
    accuracy: null,
    attemptCount: 2,
    reason: "Not enough attempts to score.",
  } as unknown as WeakTopic,
];

describe("F1 — the to-do list is ordered by evidence", () => {
  it("puts a measured weak chapter first", () => {
    const plan = buildTodoPlan({
      rows: [
        task({ id: "a", subject: "Physics", chapter: "Optics", estMin: 30 }),
        task({ id: "b", subject: "Chemistry", chapter: "Electrochemistry", estMin: 30 }),
      ],
      weak: WEAK,
      now: NOW,
    });
    expect(plan.items[0]?.id).toBe("b");
    expect(plan.items[0]?.isWeakTarget).toBe(true);
    expect(plan.items[0]?.reason).toMatch(/32% accuracy across 9 attempts/);
  });

  it("says 'not enough attempts' rather than inventing a percentage", () => {
    const plan = buildTodoPlan({
      rows: [task({ id: "a", subject: "Physics", chapter: "Optics" })],
      weak: THIN,
      now: NOW,
    });
    expect(plan.items[0]?.reason).toMatch(/not enough attempts to score/);
    expect(plan.items[0]?.reason).not.toMatch(/\d+% accuracy/);
  });

  it("uses weightage when the board publishes it", () => {
    const weightage = new Map<string, number>([["physics::electrostatics", 8]]);
    const plan = buildTodoPlan({
      rows: [
        task({ id: "a", subject: "Physics", chapter: "Optics", estMin: 20 }),
        task({ id: "b", subject: "Physics", chapter: "Electrostatics", estMin: 20 }),
      ],
      weightage,
      now: NOW,
    });
    const heavy = plan.items.find((i) => i.id === "b");
    expect(heavy?.weightage).toBe(8);
    expect(heavy?.reason).toMatch(/8 marks in the syllabus/);
  });

  it("a completed task never outranks pending work", () => {
    const plan = buildTodoPlan({
      rows: [
        task({ id: "done", status: "done", subject: "Chemistry", chapter: "Electrochemistry" }),
        task({ id: "open", subject: "Physics", chapter: "Optics" }),
      ],
      weak: WEAK,
      now: NOW,
    });
    expect(plan.items[0]?.id).toBe("open");
  });

  it("survives a non-array plan without crashing", () => {
    const plan = buildTodoPlan({ rows: undefined as unknown as PlannerTaskRow[], now: NOW });
    expect(plan.items).toEqual([]);
    expect(plan.nextUp).toBeNull();
    expect(plan.note).toMatch(/nothing is scheduled/i);
  });
});

describe("F1 — progress is counted in goals, not hours", () => {
  it("reports goals done of goals total", () => {
    const plan = buildTodoPlan({
      rows: [
        task({ id: "a", status: "done" }),
        task({ id: "b", status: "done" }),
        task({ id: "c" }),
      ],
      now: NOW,
    });
    expect(plan.progress.done).toBe(2);
    expect(plan.progress.total).toBe(3);
    expect(plan.progress.remaining).toBe(1);
    expect(plan.progress.fraction).toBeCloseTo(2 / 3);
  });

  it("three short goals beat two hours of nothing", () => {
    const shortDone = buildTodoPlan({
      rows: [
        task({ id: "a", estMin: 10, status: "done" }),
        task({ id: "b", estMin: 10, status: "done" }),
        task({ id: "c", estMin: 10, status: "done" }),
      ],
      now: NOW,
    });
    const longIdle = buildTodoPlan({
      rows: [task({ id: "x", estMin: 120 }), task({ id: "y", estMin: 120 })],
      now: NOW,
    });
    expect(shortDone.progress.fraction).toBe(1);
    expect(longIdle.progress.fraction).toBe(0);
  });

  it("an empty day has no fraction rather than 100%", () => {
    const plan = buildTodoPlan({ rows: [], now: NOW });
    expect(plan.progress.fraction).toBe(0);
    expect(plan.progress.total).toBe(0);
  });

  it("goalProgress counts across the whole plan", () => {
    const p = goalProgress([task({ id: "a", status: "done" }), task({ id: "b" })]);
    expect(p.done).toBe(1);
    expect(p.total).toBe(2);
    expect(p.fraction).toBe(0.5);
  });
});

describe("F3 — a missed task is carried, once", () => {
  it("carries an unfinished task from yesterday onto today", () => {
    const plan = buildTodoPlan({
      rows: [task({ id: "old", date: dayKey(-1) })],
      now: NOW,
    });
    expect(plan.carriedOver).toHaveLength(1);
    expect(plan.carriedOver[0]?.carriedFrom).toBe(dayKey(-1));
    expect(plan.carriedOver[0]?.reason).toMatch(new RegExp(`Carried over from ${dayKey(-1)}`));
  });

  it("does not duplicate a carried task across successive days", () => {
    // Same row, read on three consecutive days: it must appear once each day,
    // not accumulate into three copies on the third.
    const row = task({ id: "old", date: dayKey(-2) });
    const d1 = buildTodoPlan({ rows: [row], now: NOW });
    const d2 = buildTodoPlan({ rows: [row], now: NOW + 24 * 3600 * 1000 });
    const d3 = buildTodoPlan({ rows: [row], now: NOW + 2 * 24 * 3600 * 1000 });
    expect(d1.carriedOver).toHaveLength(1);
    expect(d2.carriedOver).toHaveLength(1);
    expect(d3.carriedOver).toHaveLength(1);
  });

  it("a carried task never outranks today's own work", () => {
    const plan = buildTodoPlan({
      rows: [
        task({
          id: "carried",
          date: dayKey(-1),
          subject: "Chemistry",
          chapter: "Electrochemistry",
        }),
        task({ id: "today", subject: "Physics", chapter: "Optics" }),
      ],
      weak: WEAK,
      now: NOW,
    });
    expect(plan.items[0]?.id).toBe("today");
  });

  it("leaves a task older than the carry window on the planner", () => {
    const plan = buildTodoPlan({
      rows: [task({ id: "ancient", date: dayKey(-30) })],
      now: NOW,
      carryWindowDays: 7,
    });
    expect(plan.carriedOver).toHaveLength(0);
    expect(plan.items).toHaveLength(0);
    expect(plan.note).toMatch(/nothing is scheduled/i);
  });

  it("names the recovery honestly instead of hiding it", () => {
    const plan = buildTodoPlan({
      rows: [task({ id: "a", date: dayKey(-3) }), task({ id: "b", date: dayKey(-1) })],
      now: NOW,
    });
    const note = recoveryNote(plan);
    expect(note).toMatch(/2 unfinished goals carried forward/);
    expect(note).toMatch(dayKey(-3));
    expect(note).toMatch(/nothing was dropped, and nothing was duplicated/i);
  });

  it("says nothing when nothing was missed", () => {
    const plan = buildTodoPlan({ rows: [task({ id: "a" })], now: NOW });
    expect(recoveryNote(plan)).toBeNull();
  });
});

describe("F3 — finishing early offers exactly one more thing", () => {
  it("pulls the next task forward when today is done", () => {
    const plan = buildTodoPlan({
      rows: [
        task({ id: "done", status: "done" }),
        task({ id: "future", date: dayKey(1) }),
        task({ id: "later", date: dayKey(2) }),
      ],
      now: NOW,
    });
    expect(plan.finishedEarly).toBe(true);
    expect(plan.pullForward?.id).toBe("future");
  });

  it("does not pull a whole future day forward", () => {
    const rows = [task({ id: "done", status: "done" })];
    for (let i = 1; i <= 5; i++) rows.push(task({ id: `f${i}`, date: dayKey(i) }));
    const plan = buildTodoPlan({ rows, now: NOW });
    expect(plan.pullForward).not.toBeNull();
    expect(plan.items).toHaveLength(1); // only the completed one
  });

  it("offers nothing extra when today is not finished", () => {
    const plan = buildTodoPlan({
      rows: [task({ id: "open" }), task({ id: "future", date: dayKey(1) })],
      now: NOW,
    });
    expect(plan.finishedEarly).toBe(false);
    expect(plan.pullForward).toBeNull();
  });

  it("offers nothing when there is nothing ahead", () => {
    const plan = buildTodoPlan({ rows: [task({ id: "done", status: "done" })], now: NOW });
    expect(plan.finishedEarly).toBe(true);
    expect(plan.pullForward).toBeNull();
    expect(plan.summary).toMatch(/today's goals are done/i);
  });
});

describe("rest days and empty plans", () => {
  it("a rest day is stated as a rest day, not a failure", () => {
    const plan = buildTodoPlan({ rows: [task({ id: "f", date: dayKey(1) })], now: NOW });
    expect(plan.note).toMatch(/rest day, not a failure/i);
    expect(plan.nextUp).toBeNull();
  });

  it("a fully done day says so without implying debt", () => {
    const plan = buildTodoPlan({ rows: [task({ id: "a", status: "done" })], now: NOW });
    expect(plan.summary).toMatch(/bonus, not a debt/i);
  });

  it("summary counts remaining goals in the plural correctly", () => {
    const one = buildTodoPlan({ rows: [task({ id: "a" })], now: NOW });
    expect(one.summary).toMatch(/1 goal left/);
    const two = buildTodoPlan({ rows: [task({ id: "a" }), task({ id: "b" })], now: NOW });
    expect(two.summary).toMatch(/2 goals left/);
  });
});

describe("the engine never writes to storage", () => {
  it("buildTodoPlan is pure — the same input gives the same output", () => {
    const rows = [task({ id: "a" }), task({ id: "b", date: dayKey(-1) })];
    const a = buildTodoPlan({ rows, now: NOW });
    const b = buildTodoPlan({ rows, now: NOW });
    expect(a).toEqual(b);
  });

  it("does not touch localStorage", () => {
    const before = Object.keys(localStorage).sort();
    buildTodoPlan({ rows: [task({ id: "a" })], now: NOW });
    expect(Object.keys(localStorage).sort()).toEqual(before);
  });
});

describe("the completion overlay is additive and isolated", () => {
  it("ticking a goal here does not rewrite the stored plan", () => {
    const rows = [task({ id: "a" }), task({ id: "b" })];
    const before = JSON.stringify(rows);

    const overlay = toggleDoneId("a");
    expect(overlay.has("a")).toBe(true);

    // The source rows are untouched — the overlay is a separate key.
    expect(JSON.stringify(rows)).toBe(before);

    const plan = buildTodoPlan({ rows, doneOverlay: overlay, now: NOW });
    expect(plan.progress.done).toBe(1);
    expect(plan.progress.total).toBe(2);
  });

  it("a goal ticked in the overlay still shows as done after a reload", () => {
    toggleDoneId("a");
    const reloaded = loadDoneIds();
    expect(reloaded.has("a")).toBe(true);
  });

  it("un-ticking removes it again", () => {
    toggleDoneId("a");
    toggleDoneId("a");
    expect(loadDoneIds().has("a")).toBe(false);
  });

  it("clearing is explicit and total", () => {
    saveDoneIds(new Set(["a", "b", "c"]));
    expect(loadDoneIds().size).toBe(3);
    clearDone();
    expect(loadDoneIds().size).toBe(0);
  });

  it("survives malformed storage", () => {
    localStorage.setItem("ntacbt.todo.done.v1", "{not json");
    expect(loadDoneIds().size).toBe(0);
    localStorage.removeItem("ntacbt.todo.done.v1");
  });

  it("goalProgress counts the overlay across the whole plan", () => {
    const rows = [task({ id: "a" }), task({ id: "b" }), task({ id: "c" })];
    expect(goalProgress(rows, new Set(["a", "b"]))).toEqual({
      done: 2,
      total: 3,
      fraction: 2 / 3,
    });
  });

  it("a row the legacy engine already marked done counts without the overlay", () => {
    const rows = [task({ id: "a", status: "done" }), task({ id: "b" })];
    expect(goalProgress(rows).done).toBe(1);
  });
});
