import { describe, expect, it } from "vitest";
import {
  PRIVACY,
  buildWeeklyReport,
  reportToMarkdown,
  reportToText,
} from "@/features/report/share";
import { DataStore, localDayKey, type PlannerTaskRow } from "@/lib/store";
import type { FocusSession } from "@/features/focus/focus";
import type { StudyTubeProgressStore } from "@/features/studytube/progress";

const NOW = new Date("2026-09-29T12:00:00").getTime();
const DAY = localDayKey(NOW);

function focusSession(daysAgo: number, seconds = 30 * 60): FocusSession {
  return {
    id: `s-${daysAgo}`,
    startedAt: NOW - daysAgo * 24 * 60 * 60 * 1000,
    seconds,
    completed: true,
    label: "Focus",
  };
}

/**
 * Build a DataStore from a raw legacy state.
 *
 * `store.state` is a DEEP CLONE, and `store.planner` / `store.tests` are derived
 * getters over `_raw`. Mutating `store.state.x = ...` therefore does nothing,
 * which silently makes a test assert against a shape the app never produces.
 * The only correct injection point is the constructor.
 */
function rawStore(patch: Record<string, unknown>): DataStore {
  const raw = new DataStore().state as unknown as Record<string, unknown>;
  return new DataStore({ ...raw, ...patch } as never);
}

/**
 * Write a planner the way the store itself reads it.
 *
 * `planner` is a derived getter over `aiPlanner` plus a `plannerDone` overlay —
 * the legacy app records completion in `plannerDone[id]`, not on the row.
 */
function storeWithPlan(
  rows: Array<{
    subject: string;
    chapter: string;
    date: string;
    done?: boolean;
    actualMin?: number;
  }>,
  target = "cbse27",
): DataStore {
  const plannerDone: Record<string, boolean> = {};
  const tasks = rows.map((r) => {
    const id = `${r.subject}-${r.chapter}-${r.date}`;
    if (r.done) plannerDone[id] = true;
    return {
      id,
      date: r.date,
      subject: r.subject,
      chapter: r.chapter,
      topic: r.chapter,
      kind: "learn",
      status: r.done ? "done" : "pending",
      estMin: 45,
      ...(r.actualMin === undefined ? {} : { actualMin: r.actualMin }),
    };
  });
  return rawStore({ aiPlanner: { profile: { target }, tasks }, plannerDone });
}

/** A store whose private fields are deliberately poisoned with a marker. */
function storeWithSecrets(): DataStore {
  return rawStore({
    notes: { secret: "PRIVATE_NOTE_LEAK" },
    ytNotes: { v1: "PRIVATE_YTNOTE_LEAK" },
    bookmarks: { b1: "PRIVATE_BOOKMARK_LEAK" },
    ytWatchLater: ["PRIVATE_WATCHLATER_LEAK"],
    formulaSRS: [{ front: "PRIVATE_SRS_LEAK" }],
    goal: { text: "PRIVATE_GOAL_LEAK" },
    contract: { text: "PRIVATE_CONTRACT_LEAK" },
  });
}

const NO_FOCUS = { sessions: [] as FocusSession[], dailyTargetSec: 90 * 60 };

describe("buildWeeklyReport — window and attendance", () => {
  it("covers the last 7 days", () => {
    const r = buildWeeklyReport({ store: new DataStore(), focus: NO_FOCUS, now: NOW });
    expect(r.window.days).toBe(7);
    expect(r.window.to).toBe(DAY);
    expect(r.window.from).toBe(localDayKey(NOW - 6 * 24 * 60 * 60 * 1000));
    expect(r.attendance.daysInWindow).toBe(7);
  });

  it("counts a day as studied only when a session reached 25 minutes", () => {
    // The same bar the humane streak uses, so the report and the app agree.
    const r = buildWeeklyReport({
      store: new DataStore(),
      focus: {
        sessions: [focusSession(0), focusSession(1, 10 * 60), focusSession(2)],
        dailyTargetSec: 90 * 60,
      },
      now: NOW,
    });
    expect(r.attendance.daysStudied).toBe(2);
    expect(r.attendance.studiedDays).toHaveLength(2);
  });

  it("reports zero days studied without judgement", () => {
    const questions = Array.from({ length: 4 }, (_, i) => ({
      id: `q${i}`,
      subject: "Physics",
      chapter: "Electrostatics",
      topic: "",
      answer: "A",
    }));
    // Zero study days but some attempts, so the headline is about attendance
    // rather than about having no evidence at all.
    const store = rawStore({
      tests: [{ id: "t1", name: "drill", createdAt: NOW, questions }],
      attempts: [
        {
          testId: "t1",
          submittedAt: NOW,
          responses: Object.fromEntries(questions.map((q) => [q.id, { ans: "A" }])),
        },
      ],
    });
    const r = buildWeeklyReport({ store, focus: NO_FOCUS, now: NOW });
    expect(r.attendance.daysStudied).toBe(0);
    expect(r.headline).toContain("without penalty");
    expect(r.headline).not.toMatch(/fail|bad|lazy|poor/i);
  });

  it("survives a malformed session list", () => {
    const r = buildWeeklyReport({
      store: new DataStore(),
      focus: {
        sessions: [null as never, undefined as never, { id: "x" } as never],
        dailyTargetSec: 90 * 60,
      },
      now: NOW,
    });
    expect(r.attendance.daysStudied).toBe(0);
    expect(r.effort.focusMinutes).toBe(0);
  });
});

describe("buildWeeklyReport — completion", () => {
  it("counts only tasks inside the window", () => {
    const store = storeWithPlan([
      { subject: "Physics", chapter: "Electrostatics", date: DAY, done: true },
      { subject: "Chemistry", chapter: "Solutions", date: DAY },
      { subject: "Mathematics", chapter: "Integrals", date: "2026-09-01" }, // outside the window
    ]);
    const r = buildWeeklyReport({ store, focus: NO_FOCUS, now: NOW });
    expect(r.completion.tasksPlanned).toBe(2);
    expect(r.completion.tasksDone).toBe(1);
    expect(r.completion.minutesPlanned).toBe(90);
    expect(r.completion.minutesDone).toBe(45);
  });

  it("uses real watched minutes over the planned estimate once done", () => {
    const store = storeWithPlan([
      { subject: "Physics", chapter: "Electrostatics", date: DAY, done: true, actualMin: 95 },
    ]);
    const r = buildWeeklyReport({ store, focus: NO_FOCUS, now: NOW });
    expect(r.completion.minutesDone).toBe(95);
    expect(r.completion.minutesPlanned).toBe(95);
  });

  it("survives a store with no planner at all", () => {
    const r = buildWeeklyReport({ store: new DataStore(), focus: NO_FOCUS, now: NOW });
    expect(r.completion.tasksPlanned).toBe(0);
    expect(r.examTarget).toBe("not set");
  });
});

describe("buildWeeklyReport — evidence stays honest", () => {
  it("reports no accuracy when nothing has been attempted", () => {
    // 0% would read as a measurement of failure. It is a measurement of nothing.
    const r = buildWeeklyReport({ store: new DataStore(), focus: NO_FOCUS, now: NOW });
    expect(r.evidence.accuracy).toBeNull();
    expect(r.evidence.questionsAttempted).toBe(0);
    expect(r.nextStep.label).toBe("Take one short diagnostic");
  });

  it("reports null rather than 0% for a chapter with one attempt", () => {
    // `collectAttempts` reads TWO stores: the test (with its questions) and the
    // attempt rows carrying the student's responses. Supplying only the test
    // yields zero attempts, which is why a naive fixture silently produces an
    // empty mastery map.
    const store = rawStore({
      tests: [
        {
          id: "t1",
          name: "drill",
          createdAt: NOW,
          questions: [
            { id: "q1", subject: "Physics", chapter: "Electrostatics", topic: "", answer: "A" },
          ],
        },
      ],
      attempts: [{ testId: "t1", submittedAt: NOW, responses: { q1: { ans: "B" } } }],
    });
    const r = buildWeeklyReport({ store, focus: NO_FOCUS, now: NOW });
    const top = r.weakAreas[0];
    expect(top?.chapter).toBe("Electrostatics");
    expect(top?.accuracy).toBeNull();
    expect(top?.note).toContain("starting point rather than a verdict");
  });
});

describe("buildWeeklyReport — no shame", () => {
  it("pairs every weak area with a constructive note", () => {
    const questions = Array.from({ length: 4 }, (_, i) => ({
      id: `q${i}`,
      subject: "Physics",
      chapter: "Electrostatics",
      topic: "",
      answer: "A",
    }));
    const store = rawStore({
      tests: [{ id: "t1", name: "drill", createdAt: NOW, questions }],
      // Every answer wrong: one right answer out of four would be 25%, not the
      // sub-50% accuracy this test is about.
      attempts: [
        {
          testId: "t1",
          submittedAt: NOW,
          responses: Object.fromEntries(questions.map((q) => [q.id, { ans: "Z" }])),
        },
      ],
    });
    const r = buildWeeklyReport({ store, focus: NO_FOCUS, now: NOW });
    for (const w of r.weakAreas) {
      expect(w.note.length).toBeGreaterThan(0);
      expect(w.note).not.toMatch(/fail|bad|lazy|poor|terrible/i);
    }
    expect(r.nextStep.reason).toContain("clearest place to spend the next session");
  });
});

describe("buildWeeklyReport — privacy contract", () => {
  it("documents both sides of the allowlist", () => {
    expect(PRIVACY.included.length).toBeGreaterThan(5);
    expect(PRIVACY.excluded).toContain("notes and YouTube notes");
    expect(PRIVACY.excluded).toContain("bookmarks and watch-later lists");
    expect(PRIVACY.excluded).toContain("spaced-repetition (SRS) card contents");
    expect(PRIVACY.excluded).toContain("test question content and per-question answers");
  });

  it("never leaks private store fields into the report object", () => {
    const r = buildWeeklyReport({ store: storeWithSecrets(), focus: NO_FOCUS, now: NOW });
    const json = JSON.stringify(r);
    for (const marker of [
      "PRIVATE_NOTE_LEAK",
      "PRIVATE_YTNOTE_LEAK",
      "PRIVATE_BOOKMARK_LEAK",
      "PRIVATE_WATCHLATER_LEAK",
      "PRIVATE_SRS_LEAK",
      "PRIVATE_GOAL_LEAK",
      "PRIVATE_CONTRACT_LEAK",
    ]) {
      expect(json).not.toContain(marker);
    }
  });

  it("never leaks private store fields into the text one-pager", () => {
    const r = buildWeeklyReport({ store: storeWithSecrets(), focus: NO_FOCUS, now: NOW });
    const text = reportToText(r);
    for (const marker of [
      "PRIVATE_NOTE_LEAK",
      "PRIVATE_YTNOTE_LEAK",
      "PRIVATE_BOOKMARK_LEAK",
      "PRIVATE_WATCHLATER_LEAK",
      "PRIVATE_SRS_LEAK",
      "PRIVATE_GOAL_LEAK",
      "PRIVATE_CONTRACT_LEAK",
    ]) {
      expect(text).not.toContain(marker);
    }
  });

  it("never leaks private store fields into the markdown one-pager", () => {
    const r = buildWeeklyReport({ store: storeWithSecrets(), focus: NO_FOCUS, now: NOW });
    const md = reportToMarkdown(r);
    expect(md).not.toContain("PRIVATE_");
  });

  it("states the privacy boundary in the rendered report", () => {
    const r = buildWeeklyReport({ store: new DataStore(), focus: NO_FOCUS, now: NOW });
    expect(reportToText(r)).toContain("Notes, bookmarks and account details are never included");
    expect(reportToMarkdown(r)).toContain("never included");
  });

  it("carries no account identifier even when the store has one", () => {
    const store = storeWithSecrets();
    const raw = store.state as unknown as Record<string, unknown>;
    raw["user"] = { email: "student@example.com", name: "Private Person" };
    const withUser = new DataStore(raw as never);
    const r = buildWeeklyReport({ store: withUser, focus: NO_FOCUS, now: NOW });
    const all = JSON.stringify(r) + reportToText(r) + reportToMarkdown(r);
    expect(all).not.toContain("student@example.com");
    expect(all).not.toContain("Private Person");
  });
});

describe("reportToText / reportToMarkdown", () => {
  // Real attempts, so the weak-area table has rows to render. A store with only
  // a done task and no questions legitimately has an empty weak-area list.
  const mkQuestions = (n: number, chapter: string) =>
    Array.from({ length: n }, (_, i) => ({
      id: `q${i}`,
      subject: "Physics",
      chapter,
      topic: "",
      answer: "A",
    }));
  const questions = mkQuestions(4, "Electrostatics");
  const planned = storeWithPlan([
    { subject: "Physics", chapter: "Electrostatics", date: DAY, done: true },
  ]);
  const store = new DataStore({
    ...(planned.state as unknown as Record<string, unknown>),
    tests: [{ id: "t1", name: "drill", createdAt: NOW, questions }],
    attempts: [
      {
        testId: "t1",
        submittedAt: NOW,
        responses: Object.fromEntries(questions.map((q) => [q.id, { ans: "Z" }])),
      },
    ],
  } as never);
  const report = buildWeeklyReport({
    store,
    focus: { sessions: [focusSession(0)], dailyTargetSec: 90 * 60 },
    now: NOW,
  });

  it("renders the plain-text one-pager with every section", () => {
    const text = reportToText(report);
    for (const heading of [
      "NTACBT — weekly study report",
      "Attendance",
      "Completion",
      "Evidence",
      "Chapters that need the next round",
      "Next step",
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("exam target: cbse27");
  });

  it("renders the markdown one-pager with a table", () => {
    const md = reportToMarkdown(report);
    expect(md).toContain("# NTACBT — weekly study report");
    expect(md).toContain("| Subject | Chapter | Accuracy | Why |");
    expect(md).toContain("## Next step");
  });

  it("renders 'not enough data' rather than 0% in both formats", () => {
    const empty = buildWeeklyReport({ store: new DataStore(), focus: NO_FOCUS, now: NOW });
    expect(reportToText(empty)).toContain("Mean accuracy: not enough data");
    expect(reportToMarkdown(empty)).toContain("**not enough data**");
  });

  it("survives a completely empty report without throwing", () => {
    const empty = buildWeeklyReport({ store: new DataStore(), focus: NO_FOCUS, now: NOW });
    expect(() => reportToText(empty)).not.toThrow();
    expect(() => reportToMarkdown(empty)).not.toThrow();
    expect(reportToText(empty).length).toBeGreaterThan(100);
  });
});

describe("buildWeeklyReport — studytube evidence", () => {
  it("counts finished lessons from the StudyTube store", () => {
    // The mastery store reads the StudyTube HANDSHAKE records, which carry the
    // resolved chapter at write time. A bare `watched` entry is skipped, because
    // a handshake written before the mastery store existed has no chapter and
    // guessing one would put the lesson in the wrong row.
    const studytube = {
      schemaVersion: 1,
      // `collectLessons` derives `finished` from the watched entry, not from the
      // handshake, so a handshake with no matching watched row counts as
      // started-but-not-finished.
      watched: { v1: { videoId: "v1", finished: true, watchedAt: NOW } },
      notes: {},
      watchLater: [],
      handshakes: {
        v1: {
          videoId: "v1",
          subject: "Physics",
          chapter: "Electrostatics",
          topic: "Electric Charges and Fields",
          finished: true,
          recall: null,
          practice: null,
          updatedAt: NOW,
        },
      },
    } as unknown as StudyTubeProgressStore;
    const r = buildWeeklyReport({
      store: new DataStore(),
      focus: NO_FOCUS,
      studytube,
      now: NOW,
    });
    expect(r.effort.lessonsFinished).toBe(1);
    expect(r.evidence.chaptersTouched).toBe(1);
  });
});
