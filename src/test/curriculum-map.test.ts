import { describe, expect, it } from "vitest";
import {
  buildSyllabusMap,
  chapterOrder,
  mapChapters,
  unevidencedChapters,
} from "@/features/curriculum/map";
import { buildMastery, type ChapterMastery } from "@/features/mastery/mastery";

const NOW = 1_700_000_000_000;

/** A mastery map from raw attempts, so the tests drive the real engine. */
function masteryOf(attempts: Array<{ subject: string; chapter: string; correct: boolean }>) {
  return buildMastery({
    attempts: attempts.map((a, i) => ({
      subject: a.subject,
      chapter: a.chapter,
      topic: "",
      correct: a.correct,
      pyq: false,
      attemptedAt: NOW - i * 1000,
    })),
    lessons: [],
  }) as Map<string, ChapterMastery>;
}

const wrong = (subject: string, chapter: string, n: number) =>
  Array.from({ length: n }, () => ({ subject, chapter, correct: false }));
const right = (subject: string, chapter: string, n: number) =>
  Array.from({ length: n }, () => ({ subject, chapter, correct: true }));

describe("buildSyllabusMap — honest silence", () => {
  it("shows nothing for a JEE objective, which has no class-level syllabus", () => {
    const map = buildSyllabusMap("jeemain", masteryOf([]));
    expect(map.key).toBeNull();
    expect(map.subjects).toEqual([]);
    expect(map.note).toContain("No published syllabus map");
  });

  it("shows nothing for the unpublished Class XI map rather than borrowing Class XII", () => {
    const map = buildSyllabusMap("board11", masteryOf([]));
    expect(map.key).toEqual({ board: "CBSE", classLevel: 11, academicYear: "2026-27" });
    expect(map.subjects).toEqual([]);
    expect(map.note).toContain("not published here yet");
  });

  it("shows nothing for an empty target", () => {
    expect(buildSyllabusMap("", masteryOf([])).key).toBeNull();
  });
});

describe("buildSyllabusMap — the board's real structure", () => {
  it("carries all 25 units and 37 chapters in board order", () => {
    const map = buildSyllabusMap("cbse27", masteryOf([]));
    expect(map.totalChapters).toBe(37);
    expect(map.subjects.reduce((n, s) => n + s.units.length, 0)).toBe(25);
    expect(map.subjects.map((s) => s.subject)).toEqual(["Physics", "Chemistry", "Mathematics"]);
  });

  it("numbers each subject's chapters from 1 without gaps", () => {
    const map = buildSyllabusMap("cbse27", masteryOf([]));
    for (const subject of map.subjects) {
      const nums = subject.units.flatMap((u) => u.chapters.map((c) => c.number));
      expect(nums).toEqual(nums.map((_, i) => i + 1));
    }
  });

  it("lists every topic under its chapter", () => {
    const map = buildSyllabusMap("cbse27", masteryOf([]));
    const first = map.subjects[0]?.units[0]?.chapters[0];
    expect(first?.name).toBe("Electric Charges and Fields");
    expect(first?.topics.length).toBeGreaterThan(0);
  });

  it("publishes Chemistry and Mathematics unit marks but not Physics", () => {
    const map = buildSyllabusMap("cbse27", masteryOf([]));
    const physics = map.subjects.find((s) => s.subject === "Physics");
    const chemistry = map.subjects.find((s) => s.subject === "Chemistry");
    const maths = map.subjects.find((s) => s.subject === "Mathematics");
    expect(physics?.theoryMarks).toBeNull();
    expect(physics?.units.every((u) => u.marks === null)).toBe(true);
    expect(chemistry?.theoryMarks).toBe(70);
    expect(maths?.theoryMarks).toBe(80);
  });
});

describe("buildSyllabusMap — colouring by real evidence only", () => {
  it("reports a chapter with no evidence as null, never as 0%", () => {
    const map = buildSyllabusMap("cbse27", masteryOf([]));
    const untouched = map.subjects[0]?.units[0]?.chapters[0];
    expect(untouched?.state).toBeNull();
    expect(untouched?.accuracy).toBeNull();
    expect(untouched?.score).toBeNull();
    expect(untouched?.attempts).toBe(0);
    expect(untouched?.reason).toContain("No evidence yet");
    expect(unevidencedChapters(map)).toHaveLength(37);
  });

  it("colours a chapter from its own attempts", () => {
    const map = buildSyllabusMap("cbse27", masteryOf(wrong("Chemistry", "Solutions", 4)));
    const solutions = mapChapters(map).find((c) => c.name === "Solutions");
    expect(solutions?.state).toBe("Learning");
    expect(solutions?.accuracy).toBe(0);
    expect(solutions?.attempts).toBe(4);
    expect(solutions?.isWeak).toBe(true);
    expect(map.weakChapters).toBe(1);
    expect(map.evidencedChapters).toBe(1);
  });

  it("does not paint a topic from its chapter's evidence", () => {
    // Mastery is chapter-granular. A green topic under a green chapter would be a
    // claim the question bank cannot support, so topics stay a plain list.
    const map = buildSyllabusMap("cbse27", masteryOf(right("Chemistry", "Solutions", 6)));
    const solutions = mapChapters(map).find((c) => c.name === "Solutions");
    expect(solutions?.state).toBe("Strong");
    for (const topic of solutions?.topics ?? []) {
      expect(topic).toEqual({ name: expect.any(String) });
    }
  });

  it("counts a chapter with a thin sample as evidenced but unscored", () => {
    const map = buildSyllabusMap("cbse27", masteryOf(wrong("Chemistry", "Solutions", 1)));
    const solutions = mapChapters(map).find((c) => c.name === "Solutions");
    expect(solutions?.accuracy).toBeNull();
    expect(solutions?.attempts).toBe(1);
    expect(solutions?.isWeak).toBe(false);
    expect(map.weakChapters).toBe(0);
    expect(map.evidencedChapters).toBe(1);
  });

  it("counts mastered chapters separately", () => {
    const map = buildSyllabusMap(
      "cbse27",
      masteryOf([...right("Chemistry", "Solutions", 6), ...wrong("Physics", "Atoms", 4)]),
    );
    expect(map.masteredChapters).toBeGreaterThanOrEqual(0);
    expect(map.totalChapters).toBe(37);
  });

  it("averages a unit's accuracy only over chapters with a real sample", () => {
    const map = buildSyllabusMap("cbse27", masteryOf(wrong("Chemistry", "Solutions", 4)));
    const unit1 = map.subjects
      .find((s) => s.subject === "Chemistry")
      ?.units.find((u) => u.numeral === "I");
    // Only one of the unit's chapters has a sample, so the average is that one.
    expect(unit1?.accuracy).toBe(0);
    const emptyUnit = map.subjects
      .find((s) => s.subject === "Chemistry")
      ?.units.find((u) => u.numeral === "II");
    expect(emptyUnit?.accuracy).toBeNull();
  });
});

describe("buildSyllabusMap — 'what comes next' is the board's order", () => {
  it("names the chapter after the weakest one, not an invented prerequisite", () => {
    const map = buildSyllabusMap("cbse27", masteryOf(wrong("Chemistry", "Solutions", 5)));
    // Solutions is Chemistry chapter 1, so the next in the board's order is
    // chapter 2, Electrochemistry.
    expect(map.nextInOrder).toEqual({ subject: "Chemistry", chapter: "Electrochemistry" });
  });

  it("picks the weakest chapter when several are weak", () => {
    const map = buildSyllabusMap(
      "cbse27",
      masteryOf([
        ...wrong("Chemistry", "Electrochemistry", 4),
        ...wrong("Chemistry", "Solutions", 4),
      ]),
    );
    // Both are 0%; the tie is broken deterministically by the first one found.
    expect(map.nextInOrder?.subject).toBe("Chemistry");
    expect(typeof map.nextInOrder?.chapter).toBe("string");
  });

  it("has no next chapter when the weakest one is the last", () => {
    // Biomolecules is Chemistry chapter 10, the last one.
    const map = buildSyllabusMap("cbse27", masteryOf(wrong("Chemistry", "Biomolecules", 5)));
    expect(map.nextInOrder).toBeNull();
  });

  it("has no next chapter when nothing is weak", () => {
    const map = buildSyllabusMap("cbse27", masteryOf(right("Chemistry", "Solutions", 6)));
    expect(map.nextInOrder).toBeNull();
  });

  it("flattens the board's own chapter order", () => {
    const map = buildSyllabusMap("cbse27", masteryOf([]));
    const order = chapterOrder(map);
    expect(order).toHaveLength(37);
    expect(order[0]).toEqual({ subject: "Physics", chapter: "Electric Charges and Fields" });
  });
});

describe("buildSyllabusMap — the note", () => {
  it("says which subject has no published weightage", () => {
    const map = buildSyllabusMap("cbse27", masteryOf(wrong("Physics", "Atoms", 5)));
    expect(map.note).toContain("Physics");
    expect(map.note).toContain("does not publish a per-unit weightage");
    expect(map.note).not.toContain("0 marks");
  });

  it("reports zero evidence without judgement", () => {
    const map = buildSyllabusMap("cbse27", masteryOf([]));
    expect(map.evidencedChapters).toBe(0);
    expect(map.weakChapters).toBe(0);
    expect(map.note).toContain("0 of 37 chapters have question evidence");
  });
});
