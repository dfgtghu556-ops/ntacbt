import { describe, expect, it } from "vitest";
import { syllabusCoverage } from "@/features/planner/coverage";
import type { PlannerTaskRow } from "@/lib/store";

/** A plan row shaped like the store's, with only the fields coverage reads. */
function row(
  subject: string,
  chapter: string,
  estMin: number,
  status: "pending" | "done" = "pending",
  actualMin?: number,
): PlannerTaskRow {
  return {
    id: `${subject}-${chapter}-${Math.random().toString(36).slice(2)}`,
    date: "2026-09-29",
    subject,
    chapter,
    topic: chapter,
    kind: "learn",
    status,
    estMin,
    ...(actualMin === undefined ? {} : { actualMin }),
  } as PlannerTaskRow;
}

describe("syllabusCoverage — honest silence", () => {
  it("measures nothing for a JEE objective, which has no class-level map", () => {
    const c = syllabusCoverage([row("Physics", "Electrostatics", 60)], "jeemain");
    expect(c.key).toBeNull();
    expect(c.subjects).toEqual([]);
    expect(c.totalChapters).toBe(0);
    expect(c.note).toContain("No published syllabus map");
  });

  it("measures nothing for an unknown target", () => {
    const c = syllabusCoverage([row("Physics", "Electrostatics", 60)], "");
    expect(c.key).toBeNull();
    expect(c.note).toContain('"unknown"');
  });

  it("measures nothing for the unpublished Class XI map rather than falling back", () => {
    const c = syllabusCoverage([row("Physics", "Units and Measurement", 60)], "board11");
    expect(c.key).toEqual({ board: "CBSE", classLevel: 11, academicYear: "2026-27" });
    expect(c.subjects).toEqual([]);
    expect(c.note).toContain("not published here yet");
  });

  it("survives an empty or malformed plan", () => {
    for (const rows of [[], null as never, undefined as never, [null as never]]) {
      const c = syllabusCoverage(rows, "cbse27");
      expect(c.key).not.toBeNull();
      expect(c.totalChapters).toBe(37);
      expect(c.coveredChapters).toBe(0);
      expect(c.plannedMin).toBe(0);
    }
  });
});

describe("syllabusCoverage — chapter states", () => {
  it("marks a chapter with only pending tasks as planned", () => {
    const c = syllabusCoverage([row("Chemistry", "Solutions", 90)], "cbse27");
    const solutions = c.subjects
      .find((s) => s.subject === "Chemistry")
      ?.units.find((u) => u.numeral === "I")
      ?.chapters.find((ch) => ch.chapterNumber === 1);
    expect(solutions?.state).toBe("planned");
    expect(solutions?.taskCount).toBe(1);
    expect(solutions?.doneCount).toBe(0);
    expect(solutions?.plannedMin).toBe(90);
    expect(solutions?.doneMin).toBe(0);
  });

  it("marks a fully finished chapter as done", () => {
    const c = syllabusCoverage([row("Chemistry", "Solutions", 90, "done")], "cbse27");
    const solutions = c.subjects
      .find((s) => s.subject === "Chemistry")
      ?.units.find((u) => u.numeral === "I")
      ?.chapters.find((ch) => ch.chapterNumber === 1);
    expect(solutions?.state).toBe("done");
    expect(solutions?.doneMin).toBe(90);
  });

  it("marks a partly finished chapter as in-progress", () => {
    const c = syllabusCoverage(
      [row("Chemistry", "Solutions", 60, "done"), row("Chemistry", "Solutions", 45)],
      "cbse27",
    );
    const solutions = c.subjects
      .find((s) => s.subject === "Chemistry")
      ?.units.find((u) => u.numeral === "I")
      ?.chapters.find((ch) => ch.chapterNumber === 1);
    expect(solutions?.state).toBe("in-progress");
    expect(solutions?.taskCount).toBe(2);
    expect(solutions?.doneCount).toBe(1);
    expect(solutions?.plannedMin).toBe(105);
    expect(solutions?.doneMin).toBe(60);
  });

  it("uses real watched minutes over the planned estimate once done", () => {
    const c = syllabusCoverage([row("Chemistry", "Solutions", 45, "done", 80)], "cbse27");
    const solutions = c.subjects
      .find((s) => s.subject === "Chemistry")
      ?.units.find((u) => u.numeral === "I")
      ?.chapters.find((ch) => ch.chapterNumber === 1);
    expect(solutions?.plannedMin).toBe(80);
    expect(solutions?.doneMin).toBe(80);
  });

  it("leaves unplanned chapters as not-planned, never 0% done", () => {
    const c = syllabusCoverage([row("Chemistry", "Solutions", 90)], "cbse27");
    const untouched = c.subjects
      .find((s) => s.subject === "Chemistry")
      ?.units.find((u) => u.numeral === "II")
      ?.chapters.find((ch) => ch.chapterNumber === 2);
    expect(untouched?.state).toBe("not-planned");
    expect(untouched?.taskCount).toBe(0);
    expect(untouched?.plannedMin).toBe(0);
    // "no evidence" is not the same claim as "0 minutes of evidence".
    expect(untouched?.doneMin).toBe(0);
  });
});

describe("syllabusCoverage — matching", () => {
  it("matches a chapter by its exact board name", () => {
    const c = syllabusCoverage(
      [row("Physics", "Electrostatic Potential and Capacitance", 60)],
      "cbse27",
    );
    expect(c.coveredChapters).toBe(1);
    expect(c.unmatched).toEqual([]);
  });

  it("matches a legacy topic spelling to the chapter that contains it", () => {
    // The legacy planner stores the chapter name in `topic`, and legacy rows use
    // shorter or differently-spaced names. A substring hit is still a hit.
    const c = syllabusCoverage([row("Physics", "Electrostatic Potential", 60)], "cbse27");
    expect(c.coveredChapters).toBe(1);
    expect(c.unmatched).toEqual([]);
  });

  it("reports a unit-named row as unmatched, because a unit is not a chapter", () => {
    // "Electrostatics" is Unit I, which holds two chapters. Counting it against
    // either would be a guess, so it is surfaced as unmatched instead.
    const c = syllabusCoverage([row("Physics", "Electrostatics", 60)], "cbse27");
    expect(c.coveredChapters).toBe(0);
    expect(c.unmatched).toEqual([{ subject: "Physics", chapter: "Electrostatics" }]);
  });

  it("surfaces a plan row that matches no chapter instead of dropping it", () => {
    const c = syllabusCoverage([row("Physics", "Thermodynamics", 60)], "cbse27");
    // Thermodynamics is Class XI, so it is off the Class XII map.
    expect(c.coveredChapters).toBe(0);
    expect(c.unmatched).toEqual([{ subject: "Physics", chapter: "Thermodynamics" }]);
  });

  it("surfaces a row whose subject is not one of the three", () => {
    const c = syllabusCoverage([row("English", "Snapshots", 30)], "cbse27");
    expect(c.coveredChapters).toBe(0);
    expect(c.unmatched).toEqual([{ subject: "English", chapter: "Snapshots" }]);
  });

  it("does not let a Physics row count towards a Chemistry chapter", () => {
    // "Current Electricity" is Physics ch. 3. The same name must never be
    // counted against a Chemistry row — this is the cross-scope leak Phase F
    // removed, re-checked here for the coverage maths.
    const c = syllabusCoverage([row("Physics", "Current Electricity", 60)], "cbse27");
    const physics = c.subjects.find((s) => s.subject === "Physics");
    const chemistry = c.subjects.find((s) => s.subject === "Chemistry");
    expect(physics?.coveredChapters).toBe(1);
    expect(chemistry?.coveredChapters).toBe(0);
  });
});

describe("syllabusCoverage — marks stay honest", () => {
  it("reports Chemistry unit marks that sum to the 70-mark paper", () => {
    const c = syllabusCoverage([], "cbse27");
    const chemistry = c.subjects.find((s) => s.subject === "Chemistry");
    expect(chemistry?.theoryMarks).toBe(70);
    expect(chemistry?.units.map((u) => u.marks)).toEqual([7, 9, 7, 7, 7, 6, 6, 8, 6, 7]);
  });

  it("reports Mathematics unit marks that sum to the 80-mark paper", () => {
    const c = syllabusCoverage([], "cbse27");
    const mathematics = c.subjects.find((s) => s.subject === "Mathematics");
    expect(mathematics?.theoryMarks).toBe(80);
  });

  it("reports no Physics subject total and no unit weights", () => {
    // Published per-unit Physics figures conflict — several sum to 133 for a
    // 70-mark paper. A partial sum would be a fabricated weight, so both the
    // unit and the subject total are null.
    const c = syllabusCoverage([], "cbse27");
    const physics = c.subjects.find((s) => s.subject === "Physics");
    expect(physics?.theoryMarks).toBeNull();
    expect(physics?.units.every((u) => u.marks === null)).toBe(true);
    expect(physics?.units.map((u) => u.marks)).not.toContain(0);
  });

  it("says so in the note when a subject has no published weightage", () => {
    const c = syllabusCoverage([row("Physics", "Electrostatics", 60)], "cbse27");
    expect(c.note).toContain("Physics has no published unit weightage");
    expect(c.note).not.toContain("0 marks");
  });
});

describe("syllabusCoverage — rollups", () => {
  it("rolls chapter minutes up to the unit and the subject", () => {
    const c = syllabusCoverage(
      [
        row("Chemistry", "Solutions", 60, "done"),
        row("Chemistry", "Electrochemistry", 45),
        row("Chemistry", "Chemical Kinetics", 30, "done"),
      ],
      "cbse27",
    );
    const chemistry = c.subjects.find((s) => s.subject === "Chemistry");
    const unit1 = chemistry?.units.find((u) => u.numeral === "I");
    const unit2 = chemistry?.units.find((u) => u.numeral === "II");
    const unit3 = chemistry?.units.find((u) => u.numeral === "III");
    expect(unit1?.plannedMin).toBe(60);
    expect(unit1?.doneMin).toBe(60);
    expect(unit1?.coveredChapters).toBe(1);
    expect(unit2?.plannedMin).toBe(45);
    expect(unit2?.doneMin).toBe(0);
    expect(unit3?.plannedMin).toBe(30);
    expect(unit3?.doneMin).toBe(30);
    expect(chemistry?.plannedMin).toBe(135);
    expect(chemistry?.doneMin).toBe(90);
    expect(chemistry?.coveredChapters).toBe(3);
    expect(chemistry?.totalChapters).toBe(10);
  });

  it("counts every one of the 37 chapters and 25 units across the map", () => {
    const c = syllabusCoverage([], "cbse27");
    expect(c.totalChapters).toBe(37);
    expect(c.subjects.reduce((n, s) => n + s.units.length, 0)).toBe(25);
    expect(c.coveredChapters).toBe(0);
    expect(c.plannedMin).toBe(0);
    expect(c.note).toContain("touches none of the 37 chapters");
  });

  it("reports the covered fraction once a plan exists", () => {
    const c = syllabusCoverage([row("Chemistry", "Solutions", 60)], "cbse27");
    expect(c.coveredChapters).toBe(1);
    expect(c.note).toContain("touches 1 of 37 chapters");
  });

  it("carries the topic count for every chapter so the UI can show depth", () => {
    const c = syllabusCoverage([], "cbse27");
    const first = c.subjects[0]?.units[0]?.chapters[0];
    expect(first?.chapterName).toBe("Electric Charges and Fields");
    expect(first?.topicCount).toBeGreaterThan(0);
    expect(first?.unitMarks).toBeNull(); // Physics, unmarked
  });
});
