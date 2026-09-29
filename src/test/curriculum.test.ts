import { describe, expect, it } from "vitest";
import {
  CBSE_CLASS_11_2026_27,
  CBSE_CLASS_12_2026_27,
  allChapters,
  assertClassLevelIsolation,
  chaptersOf,
  curriculumFor,
  curriculumSource,
  isCurriculumPublished,
  publishedCurricula,
  subjectsOf,
  theoryMarks,
  unitOfChapter,
} from "@/data/curriculum";
import { isCompleteSource, missingSourceFields } from "@/features/academics/source";

const CLASS_12_2026_27 = {
  board: "CBSE" as const,
  classLevel: 12 as const,
  academicYear: "2026-27",
};

const CLASS_11_2026_27 = {
  board: "CBSE" as const,
  classLevel: 11 as const,
  academicYear: "2026-27",
};

describe("curriculum registry", () => {
  it("publishes both class levels for 2026-27", () => {
    expect(publishedCurricula()).toHaveLength(2);
    expect(publishedCurricula()).toContain(CBSE_CLASS_12_2026_27);
    expect(publishedCurricula()).toContain(CBSE_CLASS_11_2026_27);
  });

  it("resolves a map from an explicit key", () => {
    expect(curriculumFor(CLASS_12_2026_27)).toBe(CBSE_CLASS_12_2026_27);
  });

  it("returns null for an unpublished syllabus rather than guessing a year", () => {
    // A student on the 2027-28 syllabus must not be planned against 2026-27
    // chapters, so a miss is null and never a fallback.
    expect(curriculumFor({ ...CLASS_12_2026_27, academicYear: "2027-28" })).toBeNull();
    expect(curriculumFor({ ...CLASS_11_2026_27, academicYear: "2027-28" })).toBeNull();
    expect(curriculumFor({ ...CLASS_12_2026_27, board: "ICSE" as never })).toBeNull();
    // Both class levels are published for 2026-27, so the two must never
    // resolve each other's map. This is the cross-scope leak Phase F removed.
    expect(curriculumFor(CLASS_11_2026_27)).toBe(CBSE_CLASS_11_2026_27);
    expect(curriculumFor(CLASS_12_2026_27)).toBe(CBSE_CLASS_12_2026_27);
    expect(curriculumFor(CLASS_11_2026_27)).not.toBe(CBSE_CLASS_12_2026_27);
    expect(curriculumFor(CLASS_12_2026_27)).not.toBe(CBSE_CLASS_11_2026_27);
  });

  it("carries a complete provenance record", () => {
    const source = curriculumSource(CLASS_12_2026_27);
    expect(source).not.toBeNull();
    expect(isCompleteSource(source)).toBe(true);
    expect(missingSourceFields(source)).toEqual([]);
  });

  it("has no provenance record for an unpublished syllabus", () => {
    expect(curriculumSource({ ...CLASS_12_2026_27, academicYear: "2027-28" })).toBeNull();
  });

  it("reports the published CBSE Class XII 2026-27 map as published", () => {
    expect(isCurriculumPublished(CLASS_12_2026_27)).toBe(true);
  });
});

describe("curriculum map shape", () => {
  const map = CBSE_CLASS_12_2026_27;

  it("declares Class XII so a Class XI map cannot leak in", () => {
    expect(map.classLevel).toBe(12);
    expect(assertClassLevelIsolation(map, 12)).toBe(true);
    expect(assertClassLevelIsolation(map, 11)).toBe(false);
  });

  it("covers the three science streams", () => {
    expect(subjectsOf(map)).toEqual(["Physics", "Chemistry", "Mathematics"]);
  });

  it("holds 37 chapters and 240 topics in board order", () => {
    expect(allChapters(map)).toHaveLength(37);
    const total = allChapters(map).reduce((sum, c) => sum + c.topics.length, 0);
    expect(total).toBe(240);
  });

  it("numbers each subject's chapters from 1 without gaps", () => {
    for (const subject of subjectsOf(map)) {
      const nums = chaptersOf(map, subject).map((c) => c.number);
      expect(nums).toEqual(nums.map((_, i) => i + 1));
    }
  });

  it("keeps chapter names unique within a subject so mastery rows never collide", () => {
    for (const subject of subjectsOf(map)) {
      const names = chaptersOf(map, subject).map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("gives every chapter at least one topic", () => {
    for (const c of allChapters(map)) {
      expect(c.topics.length).toBeGreaterThan(0);
    }
  });

  it("rejects a chapter that appears in two units", () => {
    const physics = map.subjects[0];
    const firstUnit = physics?.units[0];
    const secondUnit = physics?.units[1];
    const firstChapter = firstUnit?.chapters[0];
    const secondChapter = secondUnit?.chapters[0];
    if (!firstUnit || !secondUnit || !firstChapter || !secondChapter) {
      throw new Error("Physics fixture is missing a chapter to clone");
    }

    // Same chapter NUMBER twice in one subject breaks every "chapter 3" reference.
    const byNumber = structuredClone(map);
    if (byNumber.subjects[0]?.units[1]?.chapters[0]) {
      byNumber.subjects[0].units[1].chapters[0].number = firstChapter.number;
    }
    expect(assertClassLevelIsolation(byNumber, 12)).toBe(false);

    // Same chapter NAME in two units would split one chapter's evidence into two
    // mastery rows — the exact leak Phase F removed.
    const byName = structuredClone(map);
    if (byName.subjects[0]?.units[1]?.chapters[0]) {
      byName.subjects[0].units[1].chapters[0].name = firstChapter.name;
    }
    expect(assertClassLevelIsolation(byName, 12)).toBe(false);

    // Identical chapter in two units.
    const identical = structuredClone(map);
    const target = identical.subjects[0]?.units[1]?.chapters[0];
    if (target) Object.assign(target, { ...firstChapter });
    expect(assertClassLevelIsolation(identical, 12)).toBe(false);
  });

  it("does not treat the same number in different subjects as a collision", () => {
    // Chemistry ch. 1 and Physics ch. 1 are genuinely different chapters.
    const physicsFirst = map.subjects[0]?.units[0]?.chapters[0];
    const chemistryFirst = map.subjects[1]?.units[0]?.chapters[0];
    expect(physicsFirst?.number).toBe(1);
    expect(chemistryFirst?.number).toBe(1);
    expect(assertClassLevelIsolation(map, 12)).toBe(true);
  });
});

describe("unit marks honesty", () => {
  const map = CBSE_CLASS_12_2026_27;

  it("records corroborated Chemistry marks that sum to the 70-mark theory paper", () => {
    const chemistry = map.subjects.find((s) => s.subject === "Chemistry");
    expect(chemistry?.units.map((u) => u.marks)).toEqual([7, 9, 7, 7, 7, 6, 6, 8, 6, 7]);
    expect(theoryMarks(map, "Chemistry")).toBe(70);
  });

  it("records corroborated Mathematics marks that sum to the 80-mark paper", () => {
    const mathematics = map.subjects.find((s) => s.subject === "Mathematics");
    expect(mathematics?.units.map((u) => u.marks)).toEqual([8, 10, 35, 14, 5, 8]);
    expect(theoryMarks(map, "Mathematics")).toBe(80);
  });

  it("leaves every Physics unit unmarked because published figures conflict", () => {
    const physics = map.subjects.find((s) => s.subject === "Physics");
    expect(physics?.units.every((u) => u.marks === null)).toBe(true);
    // Not a single Physics unit gets an invented weight. The total is null, not
    // 0 — "not published here" must never be read as "no marks".
    expect(theoryMarks(map, "Physics")).toBeNull();
  });

  it("resolves the unit for a known chapter and null for an unknown one", () => {
    expect(unitOfChapter(map, "Chemistry", "Solutions")?.name).toBe("Solutions");
    expect(unitOfChapter(map, "Physics", "Electrostatic Potential and Capacitance")?.numeral).toBe(
      "I",
    );
    expect(unitOfChapter(map, "Chemistry", "Not A Real Chapter")).toBeNull();
    expect(unitOfChapter(map, "Physics" as never, "Sets")).toBeNull();
  });
});
