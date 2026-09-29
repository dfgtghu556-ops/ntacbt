import { describe, expect, it } from "vitest";
import { chapterForTopic } from "@/features/academics";
import {
  curriculumChapterName,
  curriculumKeyForExam,
  hasCurriculumMap,
  resolveCurriculumChapter,
} from "@/features/academics/curriculum-bridge";
import { chaptersOf } from "@/data/curriculum";
import { CBSE_CLASS_12_2026_27 } from "@/data/curriculum";

const CBSE_12 = { exam: "CBSE_12" as const, academicYear: "2026-27" };
const CBSE_11 = { exam: "CBSE_11" as const, academicYear: "2026-27" };
const JEE_MAIN = { exam: "JEE_MAIN" as const, academicYear: "2025-26" };

describe("curriculum bridge — scope mapping", () => {
  it("maps CBSE scopes onto the published curriculum maps", () => {
    expect(curriculumKeyForExam("CBSE_12", "2026-27")).toEqual({
      board: "CBSE",
      classLevel: 12,
      academicYear: "2026-27",
    });
    expect(curriculumKeyForExam("CBSE_11", "2026-27")?.classLevel).toBe(11);
  });

  it("maps JEE scopes onto nothing, because an exam objective is not a class syllabus", () => {
    expect(curriculumKeyForExam("JEE_MAIN", "2025-26")).toBeNull();
    expect(curriculumKeyForExam("JEE_ADVANCED", "2025-26")).toBeNull();
    expect(hasCurriculumMap("JEE_MAIN", "2025-26")).toBe(false);
  });

  it("knows a CBSE_12 map is published but CBSE_11 is not yet", () => {
    expect(hasCurriculumMap("CBSE_12", "2026-27")).toBe(true);
    // Class XI is in the registry's key space but has no transcribed map yet, so
    // it must report false rather than fall back to the Class XII map.
    expect(hasCurriculumMap("CBSE_11", "2026-27")).toBe(false);
  });
});

describe("curriculum bridge — every real chapter resolves", () => {
  it("resolves all 37 CBSE Class XII chapters to their own name", () => {
    for (const subject of ["Physics", "Chemistry", "Mathematics"] as const) {
      for (const chapter of chaptersOf(CBSE_CLASS_12_2026_27, subject)) {
        expect(chapterForTopic(CBSE_12, subject, chapter.name)).toBe(chapter.name);
      }
    }
  });

  it("resolves a topic inside a chapter to that chapter", () => {
    expect(chapterForTopic(CBSE_12, "Physics", "Electric potential")).toBe(
      "Electrostatic Potential and Capacitance",
    );
    expect(chapterForTopic(CBSE_12, "Chemistry", "equipotential surfaces")).toBeNull();
  });

  it("never resolves a chapter to a teacher or playlist name", () => {
    // The old behaviour: "Atoms" matched a video series because the CBSE_12
    // scope only contained teacher records with marketing strings as chapters.
    expect(chapterForTopic(CBSE_12, "Physics", "Atoms")).toBe("Atoms");
    expect(chapterForTopic(CBSE_12, "Chemistry", "Organic Chemistry Maestro")).toBeNull();
    expect(chapterForTopic(CBSE_12, "Chemistry", "Pankaj Sijairya Sir")).toBeNull();
  });

  it("returns null for a Class XI chapter asked for on the Class XII syllabus", () => {
    expect(chapterForTopic(CBSE_12, "Chemistry", "Thermodynamics")).toBeNull();
    expect(chapterForTopic(CBSE_12, "Chemistry", "Some Basic Concepts of Chemistry")).toBeNull();
  });

  it("returns null for an empty or unknown query", () => {
    expect(chapterForTopic(CBSE_12, "Chemistry", "")).toBeNull();
    expect(chapterForTopic(CBSE_12, "Chemistry", undefined)).toBeNull();
    expect(chapterForTopic(CBSE_12, "Chemistry", "Zzz Not A Chapter")).toBeNull();
  });
});

describe("curriculum bridge — marks stay honest", () => {
  it("carries corroborated Chemistry and Mathematics unit marks", () => {
    const solutions = resolveCurriculumChapter("CBSE_12", "2026-27", "Chemistry", "Solutions");
    expect(solutions?.unit?.numeral).toBe("I");
    expect(solutions?.unitMarks).toBe(7);
    expect(solutions?.subjectTheoryMarks).toBe(70);

    const integrals = resolveCurriculumChapter("CBSE_12", "2026-27", "Mathematics", "Integrals");
    expect(integrals?.unit?.name).toBe("Calculus");
    expect(integrals?.unitMarks).toBe(35);
    expect(integrals?.subjectTheoryMarks).toBe(80);
  });

  it("reports no Physics marks at all, because none are corroborated", () => {
    const atoms = resolveCurriculumChapter("CBSE_12", "2026-27", "Physics", "Atoms");
    expect(atoms?.unitMarks).toBeNull();
    // A partial sum of the marked units would be a fabricated weight, so the
    // subject total is null too.
    expect(atoms?.subjectTheoryMarks).toBeNull();
  });

  it("returns null for a unit name, which has no chapter to report", () => {
    // "Optics" resolves as a unit, so there is no chapter name to return — the
    // caller must not be handed a chapter row for a unit.
    expect(curriculumChapterName("CBSE_12", "2026-27", "Physics", "Optics")).toBeNull();
    expect(resolveCurriculumChapter("CBSE_12", "2026-27", "Physics", "Optics")?.kind).toBe("unit");
  });
});

describe("curriculum bridge — JEE scope is untouched", () => {
  it("still resolves JEE topics through the structured syllabus records", () => {
    // The bridge must not divert JEE reads: those scopes keep using the JEE
    // syllabus dataset, which is the authority for that exam.
    const chapter = chapterForTopic(JEE_MAIN, "Physics", "Electrostatics");
    expect(typeof chapter).toBe("string");
    expect(chapter?.length).toBeGreaterThan(0);
  });

  it("has no curriculum map for a JEE scope", () => {
    expect(resolveCurriculumChapter("JEE_MAIN", "2025-26", "Physics", "Electrostatics")).toBeNull();
    expect(curriculumChapterName("JEE_MAIN", "2025-26", "Physics", "Electrostatics")).toBeNull();
  });

  it("resolves nothing for the unpublished CBSE_11 scope", () => {
    expect(hasCurriculumMap(CBSE_11.exam, CBSE_11.academicYear)).toBe(false);
    expect(chapterForTopic(CBSE_11, "Physics", "Units and Measurement")).toBeNull();
  });
});
