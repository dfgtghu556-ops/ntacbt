import { describe, expect, it } from "vitest";
import {
  MIN_SAMPLE,
  WEAK_ACCURACY,
  buildMastery,
  masteryFromStores,
  preparationRows,
  priorityChapters,
  summariseMastery,
  type AttemptEvidence,
  type LessonEvidence,
} from "@/features/mastery";
import { chapterForTopic } from "@/features/academics";
import { toSubject, isSubject } from "@/features/academics/subject";
import type { DataStore } from "@/lib/store";
import type { StudyTubeProgressStore } from "@/features/studytube/progress";

/**
 * The learning loop. These tests pin the properties that make it trustworthy:
 * one question bank, one accuracy; a watched lesson counts for its chapter;
 * and a chapter nobody has touched reports NO EVIDENCE rather than a flattering
 * default or a zero.
 */

const NOW = 1_700_000_000_000;

function attempt(
  subject: string,
  chapter: string,
  correct: boolean,
  extra: Partial<AttemptEvidence> = {},
): AttemptEvidence {
  return { subject, chapter, topic: "", correct, pyq: false, attemptedAt: NOW, ...extra };
}

function lesson(
  subject: string,
  chapter: string,
  extra: Partial<LessonEvidence> = {},
): LessonEvidence {
  return {
    videoId: "v1",
    subject,
    chapter,
    topic: "",
    finished: true,
    recall: null,
    practice: null,
    updatedAt: NOW,
    ...extra,
  };
}

describe("buildMastery", () => {
  it("reports No evidence for a chapter nobody touched — not a zero", () => {
    const m = buildMastery({ attempts: [], lessons: [] });
    expect(m.size).toBe(0);
  });

  it("merges test attempts and watched lessons into one row", () => {
    const m = buildMastery({
      attempts: [
        attempt("Physics", "Electrostatics", true),
        attempt("Physics", "Electrostatics", false),
      ],
      lessons: [
        lesson("Physics", "Electrostatics", { videoId: "a" }),
        lesson("Physics", "Electrostatics", { videoId: "b" }),
      ],
    });
    const row = m.get("Physics|Electrostatics");
    expect(row).toBeDefined();
    expect(row?.attempts).toBe(2);
    expect(row?.lessonsFinished).toBe(2);
    // The whole point: videos done and questions attempted in the SAME row.
    expect(row?.accuracy).toBe(50);
    expect(row?.state).toBe("Learning");
  });

  it("counts PYQ attempts separately but in the same accuracy", () => {
    const m = buildMastery({
      attempts: [
        attempt("Chemistry", "Mole Concept", true, { pyq: true }),
        attempt("Chemistry", "Mole Concept", true, { pyq: true }),
        attempt("Chemistry", "Mole Concept", true),
      ],
      lessons: [],
    });
    const row = m.get("Chemistry|Mole Concept");
    expect(row?.attempts).toBe(3);
    expect(row?.pyqAttempts).toBe(2);
    expect(row?.accuracy).toBe(100);
  });

  it("withholds a score below the minimum sample but still shows the ratio", () => {
    const m = buildMastery({
      attempts: [attempt("Physics", "Rotational Motion", true)],
      lessons: [],
    });
    const row = m.get("Physics|Rotational Motion");
    expect(row?.attempts).toBe(1);
    // Too thin to score, but the reason says so rather than hiding it.
    expect(row?.score).toBeNull();
    expect(row?.reason).toMatch(/too few to judge/i);
    expect(row?.state).toBe("Learning");
  });

  it("reaches Mastered only with accuracy, volume AND lessons", () => {
    const many = Array.from({ length: 10 }, () => attempt("Physics", "Kinematics", true));
    const m = buildMastery({
      attempts: many,
      lessons: [
        lesson("Physics", "Kinematics", { videoId: "a" }),
        lesson("Physics", "Kinematics", { videoId: "b" }),
      ],
    });
    expect(m.get("Physics|Kinematics")?.state).toBe("Mastered");

    // Same accuracy, no lessons — cannot be Mastered.
    const noLessons = buildMastery({ attempts: many, lessons: [] });
    expect(noLessons.get("Physics|Kinematics")?.state).toBe("Strong");
  });

  it("marks a chapter with lessons but no questions as Learning, not Mastered", () => {
    const m = buildMastery({ attempts: [], lessons: [lesson("Physics", "Optics")] });
    const row = m.get("Physics|Optics");
    expect(row?.state).toBe("Learning");
    expect(row?.reason).toMatch(/no questions attempted/i);
    expect(row?.nextAction).toMatch(/attempt questions/i);
  });

  it("keeps a mean recall score across lessons", () => {
    const m = buildMastery({
      attempts: [],
      lessons: [
        lesson("Physics", "Thermodynamics", { videoId: "a", recall: 4 }),
        lesson("Physics", "Thermodynamics", { videoId: "b", recall: 5 }),
      ],
    });
    expect(m.get("Physics|Thermodynamics")?.recall).toBe(4.5);
  });

  it("tracks the most recent activity across both evidence kinds", () => {
    const m = buildMastery({
      attempts: [attempt("Physics", "Waves", true, { attemptedAt: 100 })],
      lessons: [lesson("Physics", "Waves", { updatedAt: 500 })],
    });
    expect(m.get("Physics|Waves")?.lastActivityAt).toBe(500);
  });

  it("skips evidence with no subject or chapter rather than guessing", () => {
    const m = buildMastery({
      attempts: [attempt("", "Orphan", true), attempt("Physics", "", true)],
      lessons: [lesson("", "Orphan"), lesson("Physics", "")],
    });
    expect(m.size).toBe(0);
  });

  it("is deterministic — same input, same ordering", () => {
    const input = {
      attempts: [attempt("Physics", "B", true), attempt("Physics", "A", true)],
      lessons: [],
    };
    const a = [...buildMastery(input).keys()];
    const b = [...buildMastery(input).keys()];
    expect(a).toEqual(b);
  });
});

describe("priorityChapters", () => {
  it("ranks genuinely weak chapters first, and never ranks untouched ones as weak", () => {
    const m = buildMastery({
      attempts: [
        ...Array.from({ length: 4 }, () => attempt("Physics", "Weak", false)),
        ...Array.from({ length: 4 }, () => attempt("Physics", "Strong", true)),
      ],
      lessons: [lesson("Physics", "Untouched")],
    });
    const ranked = priorityChapters(m);
    // Weak first — and untouched is never MISLABELLED as weak, it is simply
    // ranked in its own band below it.
    expect(ranked[0]?.chapter).toBe("Weak");
    expect(ranked[0]?.state).not.toBe("No evidence");
  });

  it("puts untouched chapters after weak ones but before strong ones", () => {
    const m = buildMastery({
      attempts: [
        ...Array.from({ length: 4 }, () => attempt("Physics", "Weak", false)),
        ...Array.from({ length: 4 }, () => attempt("Physics", "Strong", true)),
      ],
      lessons: [lesson("Physics", "Untouched")],
    });
    const order = priorityChapters(m).map((r) => r.chapter);
    expect(order.indexOf("Weak")).toBeLessThan(order.indexOf("Untouched"));
    expect(order.indexOf("Untouched")).toBeLessThan(order.indexOf("Strong"));
  });

  it("never drops a chapter with 1-2 attempts", () => {
    // Regression: thin chapters used to fall through every band — weak needs
    // >= MIN_SAMPLE, untouched needs 0 attempts — and vanished from the report.
    const m = buildMastery({ attempts: [attempt("Physics", "Thin", true)], lessons: [] });
    const ranked = priorityChapters(m);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.chapter).toBe("Thin");
    expect(ranked[0]?.attempts).toBe(1);
  });

  it("ranks thin evidence above an untouched chapter", () => {
    const m = buildMastery({
      attempts: [attempt("Physics", "Thin", false)],
      lessons: [lesson("Physics", "Untouched")],
    });
    const order = priorityChapters(m).map((r) => r.chapter);
    expect(order.indexOf("Thin")).toBeLessThan(order.indexOf("Untouched"));
  });

  it("respects the limit", () => {
    const attempts: AttemptEvidence[] = [];
    for (let i = 0; i < 20; i += 1) attempts.push(attempt("Physics", `Ch${i}`, true));
    expect(priorityChapters(buildMastery({ attempts, lessons: [] }), 5)).toHaveLength(5);
  });
});

describe("preparationRows", () => {
  it("hides accuracy below the minimum sample instead of stating it", () => {
    const m = buildMastery({ attempts: [attempt("Physics", "Thin", true)], lessons: [] });
    const row = preparationRows(m).find((r) => r.chapter === "Thin");
    expect(row?.accuracy).toBeNull();
    expect(row?.attempts).toBe(1);
    expect(row?.state).toBe("Learning");
  });

  it("carries videos, PYQs and accuracy in one row", () => {
    const m = buildMastery({
      attempts: [
        ...Array.from({ length: 5 }, () =>
          attempt("Physics", "Electrostatics", true, { pyq: true }),
        ),
      ],
      lessons: [lesson("Physics", "Electrostatics")],
    });
    const row = preparationRows(m).find((r) => r.chapter === "Electrostatics");
    expect(row).toMatchObject({
      subject: "Physics",
      attempts: 5,
      pyqAttempts: 5,
      lessonsFinished: 1,
      accuracy: 100,
    });
    expect(row?.nextAction.length).toBeGreaterThan(0);
  });
});

describe("summariseMastery", () => {
  it("returns null accuracy when nothing has a real sample", () => {
    const s = summariseMastery(buildMastery({ attempts: [], lessons: [] }));
    expect(s.accuracy).toBeNull();
    expect(s.chaptersTouched).toBe(0);
  });

  it("counts only sampled chapters in the mean accuracy", () => {
    const m = buildMastery({
      attempts: [
        ...Array.from({ length: 4 }, () => attempt("Physics", "A", true)),
        attempt("Physics", "B", false), // thin, must not drag the mean
      ],
      lessons: [],
    });
    const s = summariseMastery(m);
    expect(s.chaptersTouched).toBe(2);
    expect(s.chaptersWithEvidence).toBe(2);
    expect(s.accuracy).toBe(100);
  });

  it("exposes the state distribution", () => {
    const m = buildMastery({
      attempts: [...Array.from({ length: 4 }, () => attempt("Physics", "A", true))],
      lessons: [lesson("Physics", "B")],
    });
    const s = summariseMastery(m);
    expect(s.distribution["Strong"]).toBe(1);
    expect(s.distribution["Learning"]).toBe(1);
  });

  it("totals questions, PYQs and lessons", () => {
    const m = buildMastery({
      attempts: [
        attempt("Physics", "A", true, { pyq: true }),
        attempt("Physics", "A", true),
        attempt("Physics", "B", true, { pyq: true }),
      ],
      lessons: [lesson("Physics", "A")],
    });
    const s = summariseMastery(m);
    expect(s.questionsAttempted).toBe(3);
    expect(s.pyqAttempts).toBe(2);
    expect(s.lessonsFinished).toBe(1);
  });
});

describe("masteryFromStores", () => {
  it("reads a PYQ paper as a test — one question bank, one accuracy", () => {
    const store = {
      tests: [
        {
          id: "pyq-1",
          name: "JEE Main 2026 — Shift 1",
          pyq: true,
          createdAt: NOW,
          durationSec: 7200,
          questions: [
            { id: "q1", subject: "Physics", chapter: "Electrostatics", topic: "", answer: "A" },
            { id: "q2", subject: "Physics", chapter: "Electrostatics", topic: "", answer: "B" },
          ],
        },
      ],
      attempts: [
        {
          testId: "pyq-1",
          submittedAt: NOW,
          responses: { q1: { ans: "A" }, q2: { ans: "A" } },
        },
      ],
      totals: () => ({ marks: 0, max: 0, attempts: 1 }),
    } as unknown as DataStore;

    const m = masteryFromStores(store, undefined, NOW);
    const row = m.get("Physics|Electrostatics");
    expect(row?.pyqAttempts).toBe(2);
    expect(row?.correct).toBe(1);
    expect(row?.accuracy).toBe(50);
  });

  it("skips a handshake with no chapter rather than guessing one", () => {
    const store = {
      tests: [],
      attempts: [],
      totals: () => ({ marks: 0, max: 0, attempts: 0 }),
    } as unknown as DataStore;
    const studytube = {
      schemaVersion: 1,
      watched: {},
      notes: {},
      watchLater: [],
      // Written before the mastery store existed: no subject/chapter.
      handshakes: {
        v1: { videoId: "v1", recall: null, practice: null, mastery: "Learning", updatedAt: NOW },
      },
    } as unknown as StudyTubeProgressStore;

    expect(masteryFromStores(store, studytube, NOW).size).toBe(0);
  });

  it("counts a mapped handshake against its chapter", () => {
    const store = {
      tests: [],
      attempts: [],
      totals: () => ({ marks: 0, max: 0, attempts: 0 }),
    } as unknown as DataStore;
    const studytube = {
      schemaVersion: 1,
      watched: { v1: { videoId: "v1", title: "t", watchedAt: NOW, finished: true } },
      notes: {},
      watchLater: [],
      handshakes: {
        v1: {
          videoId: "v1",
          recall: 4,
          practice: 10,
          mastery: "Strong",
          updatedAt: NOW,
          subject: "Physics",
          chapter: "Electrostatics",
        },
      },
    } as unknown as StudyTubeProgressStore;

    const row = masteryFromStores(store, studytube, NOW).get("Physics|Electrostatics");
    expect(row?.lessonsFinished).toBe(1);
    expect(row?.recall).toBe(4);
    expect(row?.practiceDone).toBe(10);
  });

  it("ignores an unanswered question", () => {
    const store = {
      tests: [
        {
          id: "t1",
          name: "t",
          createdAt: NOW,
          durationSec: 60,
          questions: [{ id: "q1", subject: "Physics", chapter: "A", answer: "A" }],
        },
      ],
      attempts: [{ testId: "t1", submittedAt: NOW, responses: { q1: { ans: "" } } }],
      totals: () => ({ marks: 0, max: 0, attempts: 1 }),
    } as unknown as DataStore;

    expect(masteryFromStores(store, undefined, NOW).size).toBe(0);
  });
});

describe("chapterForTopic", () => {
  const scope = { exam: "JEE_MAIN" as const, academicYear: "2025-26" };

  it("returns null for an unknown topic rather than the nearest chapter", () => {
    expect(chapterForTopic(scope, "Physics", "Definitely Not A Real Topic")).toBeNull();
  });

  it("returns null for an empty topic", () => {
    expect(chapterForTopic(scope, "Physics", "")).toBeNull();
    expect(chapterForTopic(scope, "Physics", undefined)).toBeNull();
  });

  it("resolves a real JEE topic to its chapter", () => {
    const chapter = chapterForTopic(scope, "Physics", "Electrostatics");
    expect(typeof chapter).toBe("string");
    expect((chapter ?? "").length).toBeGreaterThan(0);
  });
});

describe("subject coercion", () => {
  it("maps the three canonical names and falls back to Mathematics", () => {
    expect(toSubject("Physics")).toBe("Physics");
    expect(toSubject("Chemistry")).toBe("Chemistry");
    expect(toSubject("Mathematics")).toBe("Mathematics");
    expect(toSubject("Maths")).toBe("Mathematics");
    expect(toSubject("")).toBe("Mathematics");
    expect(toSubject(undefined)).toBe("Mathematics");
  });

  it("recognises only the canonical names", () => {
    expect(isSubject("Physics")).toBe(true);
    expect(isSubject("Maths")).toBe(false);
    expect(isSubject(undefined)).toBe(false);
  });
});

describe("thresholds", () => {
  it("documents the two values the rest of the app keys off", () => {
    expect(MIN_SAMPLE).toBe(3);
    expect(WEAK_ACCURACY).toBe(50);
  });
});
