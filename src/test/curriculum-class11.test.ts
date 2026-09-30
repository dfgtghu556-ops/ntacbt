/**
 * CBSE Class XI 2026-27 map — the honesty rules, applied the same way as Class XII.
 *
 * A `board11` student previously got "not published here" from the syllabus map.
 * Better than the Class XII chapters, but it meant a foundation-year student had
 * no unit structure, no chapter list and no weightage to plan against.
 *
 * This map is transcribed from the rationalised syllabus, so the interesting
 * tests are the ones about what is deliberately NOT in it:
 *
 *  - **Physics unit marks are null.** CBSE publishes *bands* for Class XI
 *    Physics (Units I–III = 23, IV–VI = 17, VII–IX = 20, X = 10), not per-unit
 *    figures, and the secondary sources that do print per-unit marks disagree
 *    with each other. Splitting a band would be an invention.
 *  - **Deleted chapters are absent.** Hydrogen, States of Matter, s-Block and
 *    p-Block Elements are no longer examinable Chemistry units, and "Principle
 *    of Mathematical Induction" and "Mathematical Reasoning" are no longer
 *    examinable Mathematics chapters. A map that still listed them would send a
 *    student to work that is not examined.
 *  - **The two class levels never cross.** This is the same cross-scope leak
 *    Phase F removed for Class XII.
 */

import { describe, expect, it } from "vitest";

import {
  CBSE_CLASS_11_2026_27,
  CBSE_CLASS_12_2026_27,
  chaptersOf,
  curriculumFor,
  publishedCurricula,
  subjectsOf,
  theoryMarks,
  unitOfChapter,
} from "@/data/curriculum";
import { isCompleteSource, missingSourceFields } from "@/features/academics/source";

const KEY_11 = { board: "CBSE" as const, classLevel: 11 as const, academicYear: "2026-27" };
const KEY_12 = { board: "CBSE" as const, classLevel: 12 as const, academicYear: "2026-27" };

describe("the Class XI map is registered and resolvable", () => {
  it("resolves from its own explicit key", () => {
    expect(curriculumFor(KEY_11)).toBe(CBSE_CLASS_11_2026_27);
  });

  it("is in the published list alongside Class XII", () => {
    expect(publishedCurricula()).toHaveLength(2);
    expect(publishedCurricula()).toContain(CBSE_CLASS_11_2026_27);
  });

  it("carries a complete provenance record", () => {
    const source = CBSE_CLASS_11_2026_27.source;
    expect(isCompleteSource(source)).toBe(true);
    expect(missingSourceFields(source)).toEqual([]);
    expect(source.sourceUrl).toMatch(/^https:\/\//);
  });

  it("covers all three JEE/board subjects", () => {
    expect(subjectsOf(CBSE_CLASS_11_2026_27)).toEqual(["Physics", "Chemistry", "Mathematics"]);
  });
});

describe("the structure matches the published syllabus", () => {
  it("Physics has 10 units across 14 chapters", () => {
    const physics = CBSE_CLASS_11_2026_27.subjects.find((s) => s.subject === "Physics");
    expect(physics?.units).toHaveLength(10);
    expect(chaptersOf(CBSE_CLASS_11_2026_27, "Physics")).toHaveLength(14);
  });

  it("Chemistry has 9 units, one chapter each", () => {
    const chem = CBSE_CLASS_11_2026_27.subjects.find((s) => s.subject === "Chemistry");
    expect(chem?.units).toHaveLength(9);
    expect(chaptersOf(CBSE_CLASS_11_2026_27, "Chemistry")).toHaveLength(9);
  });

  it("Mathematics has 5 units across 14 chapters", () => {
    const maths = CBSE_CLASS_11_2026_27.subjects.find((s) => s.subject === "Mathematics");
    expect(maths?.units).toHaveLength(5);
    expect(chaptersOf(CBSE_CLASS_11_2026_27, "Mathematics")).toHaveLength(14);
  });

  it("every chapter has at least one topic", () => {
    for (const subject of ["Physics", "Chemistry", "Mathematics"] as const) {
      for (const c of chaptersOf(CBSE_CLASS_11_2026_27, subject)) {
        expect(c.topics.length, `${subject} / ${c.name} has topics`).toBeGreaterThan(0);
        for (const t of c.topics) expect(t.id.length).toBeGreaterThan(0);
      }
    }
  });

  it("chapter numbers are unique within each subject", () => {
    for (const subject of ["Physics", "Chemistry", "Mathematics"] as const) {
      const numbers = chaptersOf(CBSE_CLASS_11_2026_27, subject).map((c) => c.number);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });
});

describe("Physics marks are null, and the reason is on the record", () => {
  it("every Physics unit carries null marks rather than a split band", () => {
    const physics = CBSE_CLASS_11_2026_27.subjects.find((s) => s.subject === "Physics");
    for (const u of physics?.units ?? []) {
      expect(u.marks, `Physics unit ${u.name}`).toBeNull();
    }
  });

  it("theoryMarks returns null for Physics rather than a partial sum", () => {
    expect(theoryMarks(CBSE_CLASS_11_2026_27, "Physics")).toBeNull();
  });

  it("the map note records the band totals CBSE actually publishes", () => {
    const note = CBSE_CLASS_11_2026_27.note ?? "";
    // 23 / 17 / 20 / 10 are the published band totals. Recording them in the
    // note is honest; putting them on the units would be an invention.
    for (const band of ["23", "17", "20", "10"]) {
      expect(note).toContain(band);
    }
  });

  it("no Physics chapter is given a weight it does not have", () => {
    // CBSE states there is no chapter-wise weightage, so nothing in the
    // Physics tree may carry marks.
    const physics = CBSE_CLASS_11_2026_27.subjects.find((s) => s.subject === "Physics");
    for (const c of physics?.units.flatMap((u) => u.chapters) ?? []) {
      expect(c).not.toHaveProperty("marks");
    }
  });
});

describe("Chemistry and Mathematics marks are recorded because every source agrees", () => {
  it("Chemistry units sum to the 70-mark theory paper", () => {
    expect(theoryMarks(CBSE_CLASS_11_2026_27, "Chemistry")).toBe(70);
    const chem = CBSE_CLASS_11_2026_27.subjects.find((s) => s.subject === "Chemistry");
    expect(chem?.units.map((u) => u.marks)).toEqual([7, 9, 6, 7, 9, 7, 4, 11, 10]);
  });

  it("Mathematics units sum to the 80-mark theory paper", () => {
    expect(theoryMarks(CBSE_CLASS_11_2026_27, "Mathematics")).toBe(80);
    const maths = CBSE_CLASS_11_2026_27.subjects.find((s) => s.subject === "Mathematics");
    expect(maths?.units.map((u) => u.marks)).toEqual([23, 25, 12, 8, 12]);
  });

  it("no Mathematics chapter carries marks — CBSE states there is none", () => {
    const maths = CBSE_CLASS_11_2026_27.subjects.find((s) => s.subject === "Mathematics");
    for (const u of maths?.units ?? []) {
      expect(u.marks).not.toBeNull();
      for (const c of u.chapters) {
        expect(c).not.toHaveProperty("marks");
      }
    }
    expect(CBSE_CLASS_11_2026_27.note).toMatch(/no chapter-wise weightage/i);
  });
});

describe("the rationalised syllabus is reflected, not the deleted one", () => {
  const allNames = (subject: "Physics" | "Chemistry" | "Mathematics") =>
    chaptersOf(CBSE_CLASS_11_2026_27, subject).map((c) => c.name.toLowerCase());

  it("omits the Chemistry units removed by rationalisation", () => {
    const units = (
      CBSE_CLASS_11_2026_27.subjects.find((s) => s.subject === "Chemistry")?.units ?? []
    ).map((u) => u.name.toLowerCase());
    for (const gone of ["hydrogen", "states of matter", "s-block", "p-block", "environmental"]) {
      expect(units.some((u) => u.includes(gone))).toBe(false);
    }
  });

  it("omits the Mathematics chapters removed by rationalisation", () => {
    const names = allNames("Mathematics").join(" | ");
    expect(names).not.toContain("mathematical induction");
    expect(names).not.toContain("mathematical reasoning");
  });

  it("keeps the chapters that ARE examined", () => {
    const physics = allNames("Physics");
    for (const keep of ["units and measurements", "laws of motion", "gravitation", "waves"]) {
      expect(physics).toContain(keep);
    }
    const maths = allNames("Mathematics");
    for (const keep of ["sets", "limits and derivatives", "probability"]) {
      expect(maths).toContain(keep);
    }
    const chem = allNames("Chemistry");
    for (const keep of ["structure of atom", "equilibrium", "hydrocarbons"]) {
      expect(chem).toContain(keep);
    }
  });
});

describe("cross-scope safety — the two class levels never cross", () => {
  it("a Class XII key never resolves the Class XI map and vice versa", () => {
    expect(curriculumFor(KEY_12)).toBe(CBSE_CLASS_12_2026_27);
    expect(curriculumFor(KEY_11)).toBe(CBSE_CLASS_11_2026_27);
    expect(curriculumFor(KEY_12)).not.toBe(CBSE_CLASS_11_2026_27);
    expect(curriculumFor(KEY_11)).not.toBe(CBSE_CLASS_12_2026_27);
  });

  it("the two maps share no chapter name", () => {
    for (const subject of ["Physics", "Chemistry", "Mathematics"] as const) {
      const xi = new Set(
        chaptersOf(CBSE_CLASS_11_2026_27, subject).map((c) => c.name.toLowerCase()),
      );
      const xii = chaptersOf(CBSE_CLASS_12_2026_27, subject).map((c) => c.name.toLowerCase());
      // A few names genuinely appear at both levels (e.g. Thermodynamics); what
      // must never happen is a chapter resolving into the wrong class's row.
      for (const name of xii) {
        if (xi.has(name)) {
          // If it exists in both, its unit must differ — that is what keeps the
          // two mastery rows apart.
          const u11 = unitOfChapter(CBSE_CLASS_11_2026_27, subject, name);
          const u12 = unitOfChapter(CBSE_CLASS_12_2026_27, subject, name);
          expect(u11?.id).not.toBe(u12?.id);
        }
      }
    }
  });

  it("a Class XI chapter resolves to its own unit", () => {
    expect(unitOfChapter(CBSE_CLASS_11_2026_27, "Physics", "Gravitation")?.name).toBe(
      "Gravitation",
    );
    expect(unitOfChapter(CBSE_CLASS_11_2026_27, "Chemistry", "Hydrocarbons")?.name).toBe(
      "Hydrocarbons",
    );
    // "Sets" sits inside the Sets and Functions unit, not a chapter-named unit.
    expect(unitOfChapter(CBSE_CLASS_11_2026_27, "Mathematics", "Sets")?.name).toBe(
      "Sets and Functions",
    );
  });
});
