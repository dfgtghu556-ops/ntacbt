import { describe, expect, it } from "vitest";
import { curriculumKeyForTarget, resolveScope, shouldSearchScope } from "@/features/planner/scope";

describe("curriculumKeyForTarget", () => {
  it("maps CBSE and board targets onto the Class XII 2026-27 map", () => {
    expect(curriculumKeyForTarget("cbse27")).toEqual({
      board: "CBSE",
      classLevel: 12,
      academicYear: "2026-27",
    });
    expect(curriculumKeyForTarget("board12")).toEqual({
      board: "CBSE",
      classLevel: 12,
      academicYear: "2026-27",
    });
  });

  it("maps board11 onto Class XI, which has no published map yet", () => {
    expect(curriculumKeyForTarget("board11")).toEqual({
      board: "CBSE",
      classLevel: 11,
      academicYear: "2026-27",
    });
  });

  it("returns null for JEE objectives, which are not class-level syllabi", () => {
    // Pretending the JEE syllabus is a CBSE map is exactly the cross-scope leak
    // this module exists to prevent.
    expect(curriculumKeyForTarget("jeemain")).toBeNull();
    expect(curriculumKeyForTarget("jeeadv")).toBeNull();
    expect(curriculumKeyForTarget("board")).toBeNull();
  });
});

describe("resolveScope — in-syllabus chapters", () => {
  it("resolves a Chemistry chapter to its unit and corroborated marks", () => {
    const scope = resolveScope("Solutions", "Chemistry", "cbse27");
    expect(scope.verdict).toBe("in-syllabus");
    expect(scope.unit?.numeral).toBe("I");
    expect(scope.unit?.name).toBe("Solutions");
    expect(scope.unitMarks).toBe(7);
    expect(scope.subjectTheoryMarks).toBe(70);
    expect(scope.note).toContain("7 marks");
  });

  it("resolves a Mathematics chapter to its corroborated unit marks", () => {
    const scope = resolveScope("Integrals", "Mathematics", "cbse27");
    expect(scope.verdict).toBe("in-syllabus");
    expect(scope.unit?.name).toBe("Calculus");
    expect(scope.unitMarks).toBe(35);
    expect(scope.subjectTheoryMarks).toBe(80);
  });

  it("claims no Physics weight because published figures conflict", () => {
    // The whole reason Physics unit marks are null: several sources sum to 133
    // for a 70-mark theory paper. The scope must say so, not pick a number.
    const scope = resolveScope("Electrostatic Potential and Capacitance", "Physics", "cbse27");
    expect(scope.verdict).toBe("in-syllabus");
    expect(scope.unit?.numeral).toBe("I");
    expect(scope.unitMarks).toBeNull();
    expect(scope.subjectTheoryMarks).toBeNull();
    expect(scope.note).toContain("does not publish a per-unit mark weight");
    expect(scope.note).not.toContain("0 marks");
  });

  it("treats board12 identically to cbse27 for the Class XII map", () => {
    const a = resolveScope("Aldehydes, Ketones and Carboxylic Acids", "Chemistry", "cbse27");
    const b = resolveScope("Aldehydes, Ketones and Carboxylic Acids", "Chemistry", "board12");
    expect(a.unitMarks).toBe(b.unitMarks);
    expect(a.unitMarks).toBe(8);
    expect(a.classLevel).toBe(12);
  });
});

describe("resolveScope — topics inside a chapter", () => {
  it("resolves a topic name to the chapter that contains it", () => {
    // "Electric potential and potential difference" is a topic inside chapter 2.
    const scope = resolveScope("Electric potential", "Physics", "cbse27");
    expect(scope.verdict).toBe("in-syllabus-topic");
    expect(scope.chapter?.name).toBe("Electrostatic Potential and Capacitance");
    expect(scope.unit?.numeral).toBe("I");
  });

  it("resolves a short topic fragment by word match", () => {
    const scope = resolveScope("equipotential surfaces", "Physics", "cbse27");
    expect(scope.verdict).toBe("in-syllabus-topic");
    expect(scope.chapter?.name).toBe("Electrostatic Potential and Capacitance");
  });
});

describe("resolveScope — unit names", () => {
  it("resolves a unit name, because students ask for Optics and Calculus, not chapter titles", () => {
    const scope = resolveScope("Optics", "Physics", "cbse27");
    expect(scope.verdict).toBe("in-syllabus");
    // A unit is not a chapter, so `chapter` stays null and the unit carries it.
    expect(scope.chapter).toBeNull();
    expect(scope.unit?.numeral).toBe("VI");
    expect(scope.unit?.chapters).toHaveLength(2);
    expect(scope.note).toContain("2 chapters");
  });

  it("resolves a Chemistry unit name to its corroborated marks", () => {
    const scope = resolveScope("Electrochemistry", "Chemistry", "cbse27");
    expect(scope.verdict).toBe("in-syllabus");
    expect(scope.unitMarks).toBe(9);
    expect(scope.note).toContain("9 marks");
  });

  it("claims no weight for a Physics unit name", () => {
    const scope = resolveScope("Magnetic Effects of Current and Magnetism", "Physics", "cbse27");
    expect(scope.verdict).toBe("in-syllabus");
    expect(scope.unitMarks).toBeNull();
    expect(scope.note).not.toMatch(/\b0 marks\b/);
    expect(scope.note).not.toContain("carries null");
  });
});

describe("resolveScope — off-syllabus requests", () => {
  it("flags a Class XI chapter asked for on the Class XII syllabus", () => {
    // Thermodynamics is Class XI. The old planner would have happily searched
    // for it and returned good videos for a chapter that is not examined.
    const scope = resolveScope("Thermodynamics", "Chemistry", "cbse27");
    expect(scope.verdict).toBe("off-syllabus");
    expect(scope.chapter).toBeNull();
    expect(scope.unit).toBeNull();
    expect(scope.unitMarks).toBeNull();
    expect(scope.note).toContain("not in the CBSE Class 12 2026-27");
    expect(scope.suggestions.length).toBeGreaterThan(0);
    expect(scope.suggestions).toContain("Solutions");
  });

  it("still searches an off-syllabus request — the verdict informs, it does not block", () => {
    const scope = resolveScope("Thermodynamics", "Chemistry", "cbse27");
    expect(shouldSearchScope(scope)).toBe(true);
  });

  it("flags a Class XII chapter asked for on the Class XI syllabus", () => {
    const scope = resolveScope("Electrostatics", "Physics", "board11");
    // Class XI has no published map yet, so the honest verdict is "no map",
    // never an invented Class XI chapter list.
    expect(scope.verdict).toBe("no-map");
    expect(scope.note).toContain("No CBSE Class 11 2026-27 syllabus map is published");
  });
});

describe("resolveScope — honest silence", () => {
  it("claims nothing for a JEE objective", () => {
    const scope = resolveScope("Electrostatics", "Physics", "jeemain");
    expect(scope.verdict).toBe("no-map");
    expect(scope.subjectTheoryMarks).toBeNull();
    expect(scope.unitMarks).toBeNull();
    expect(scope.suggestions).toEqual([]);
  });

  it("claims nothing for a subject the map does not cover", () => {
    const scope = resolveScope("Snapshots", "English", "cbse27");
    expect(scope.verdict).toBe("unknown-subject");
    expect(scope.note).toContain("is not one of the subjects this syllabus map covers");
    // An unknown subject is the one case that blocks a search, because a
    // subject mismatch would return entirely wrong lessons.
    expect(shouldSearchScope(scope)).toBe(false);
  });

  it("claims nothing when the subject is empty", () => {
    const scope = resolveScope("Solutions", "", "cbse27");
    expect(scope.verdict).toBe("unknown-subject");
  });
});

describe("scope notes never fabricate a mark figure", () => {
  it("never reports a zero weight for an unmarked Physics chapter", () => {
    // Chapter 5 "Magnetism and Matter" sits in Unit III, whose marks are null.
    const scope = resolveScope("Magnetism and Matter", "Physics", "cbse27");
    expect(scope.verdict).toBe("in-syllabus");
    expect(scope.unit?.numeral).toBe("III");
    expect(scope.unitMarks).toBeNull();
    expect(scope.note).not.toMatch(/\b0 marks\b/);
    expect(scope.note).not.toContain("carries null");
  });

  it("never reports a zero weight for an unmarked Physics unit name", () => {
    const scope = resolveScope("Magnetic Effects of Current and Magnetism", "Physics", "cbse27");
    expect(scope.verdict).toBe("in-syllabus");
    expect(scope.unitMarks).toBeNull();
    expect(scope.note).not.toMatch(/\b0 marks\b/);
    expect(scope.note).not.toContain("carries null");
  });

  it("never claims a subject total when any unit is unmarked", () => {
    const physics = resolveScope("Ray Optics and Optical Instruments", "Physics", "cbse27");
    expect(physics.verdict).toBe("in-syllabus");
    expect(physics.subjectTheoryMarks).toBeNull();
    const chemistry = resolveScope("Electrochemistry", "Chemistry", "cbse27");
    expect(chemistry.subjectTheoryMarks).toBe(70);
  });
});
