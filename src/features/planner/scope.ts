/**
 * SYLLABUS SCOPE (Phase 4)
 *
 * Resolves a planner request against a *real* published curriculum map so the
 * recommendation engine can tell a student when what they asked for is not on
 * the syllabus they are being examined on.
 *
 * **Why this exists.** Before the curriculum map, the planner accepted any topic
 * string and searched YouTube for it. A Class XII CBSE student could ask for
 * "Thermodynamics" and get a full set of perfectly good videos — for a chapter
 * they will never be examined on, because Thermodynamics is Class XI. The
 * recommendations were honest and useless. This module closes that gap without
 * touching the stored planner: it annotates the request, it does not rewrite it.
 *
 * **Three rules it enforces:**
 *
 *  1. **No map means no claim.** If the (board, classLevel, academicYear) has no
 *     published map, the verdict is `unknown-subject`/`no-map` and the note says
 *     so. It never guesses a neighbouring year — see the registry.
 *  2. **Off-syllabus is a statement about the syllabus, not the student.** A
 *     Class XI chapter in a Class XII request is reported as such, with the
 *     in-syllabus alternatives listed so the student can course-correct.
 *  3. **Marks come from the board or nowhere.** `unitMarks` is `null` for every
 *     Physics unit because published per-unit figures conflict. The UI must
 *     render "not published here", never 0.
 */

import {
  chaptersOf,
  curriculumFor,
  matchCurriculum,
  normaliseQuery,
  subjectsOf,
  theoryMarks,
  type CurriculumChapter,
  type CurriculumMap,
  type CurriculumUnit,
} from "../../data/curriculum";
import { isSubject } from "../academics/subject";
import type { PlannerTarget } from "./normalize";

/** What the engine can honestly say about a request. */
export type ScopeVerdict =
  /** The topic names a chapter in the requested syllabus. */
  | "in-syllabus"
  /** The topic names a topic inside a chapter of the requested syllabus. */
  | "in-syllabus-topic"
  /** The topic is not in the requested syllabus at all. */
  | "off-syllabus"
  /** No published map for that (board, class, year) — nothing can be claimed. */
  | "no-map"
  /** The subject is not one the map covers (e.g. English, Computer Science). */
  | "unknown-subject";

export interface SyllabusScope {
  verdict: ScopeVerdict;
  /** The board the scope was resolved against, e.g. "CBSE". */
  board: string;
  /** The class level, e.g. 12. */
  classLevel: number;
  /** The academic year, e.g. "2026-27". */
  academicYear: string;
  subject: string | null;
  chapter: CurriculumChapter | null;
  unit: CurriculumUnit | null;
  /**
   * Corroborated unit marks, or null when the board does not publish them
   * consistently. **Never** substitute 0 — null means "not published here".
   */
  unitMarks: number | null;
  /**
   * Total theory marks for the subject, or null when any unit is unmarked.
   * Null is a truthful "we do not know", not a zero.
   */
  subjectTheoryMarks: number | null;
  /** One honest sentence for the UI. Never invents a number. */
  note: string;
  /** In-syllabus chapter names to offer when the request is off-syllabus. */
  suggestions: string[];
}

/**
 * Map a planner target onto the curriculum key it should be read against.
 *
 * Only board/CBSE targets resolve. JEE targets are examination objectives, not
 * syllabi with a class level, so they get `null` and the engine stays silent
 * about scope rather than pretending the JEE syllabus is a CBSE map.
 */
export function curriculumKeyForTarget(
  target: PlannerTarget | string,
): { board: "CBSE"; classLevel: 12 | 11; academicYear: string } | null {
  if (target === "cbse27" || target === "board12") {
    return { board: "CBSE", classLevel: 12, academicYear: "2026-27" };
  }
  if (target === "board11") {
    return { board: "CBSE", classLevel: 11, academicYear: "2026-27" };
  }
  return null;
}

function normalise(s: string): string {
  return normaliseQuery(s);
}

/** Off-syllabus request: name the best in-syllabus alternatives. */
function suggestFrom(map: CurriculumMap, subject: string, count = 4): string[] {
  const chapters = chaptersOf(map, subject as never);
  return chapters.slice(0, count).map((c) => c.name);
}

/**
 * Resolve a planner request against the published curriculum map.
 *
 * Pure and synchronous: the map is a static module, so this is safe on both the
 * server route and in the browser, and trivially testable.
 */
export function resolveScope(
  topic: string,
  subject: string,
  target: PlannerTarget | string,
): SyllabusScope {
  const key = curriculumKeyForTarget(target);
  const rawSubject = normalise(subject) || null;

  if (!key) {
    return {
      verdict: "no-map",
      board: "",
      classLevel: 0,
      academicYear: "",
      subject: rawSubject,
      chapter: null,
      unit: null,
      unitMarks: null,
      subjectTheoryMarks: null,
      note: `No published syllabus map for the "${target}" objective, so scope is not being checked.`,
      suggestions: [],
    };
  }

  const map = curriculumFor(key);
  if (!map) {
    return {
      verdict: "no-map",
      board: key.board,
      classLevel: key.classLevel,
      academicYear: key.academicYear,
      subject: rawSubject,
      chapter: null,
      unit: null,
      unitMarks: null,
      subjectTheoryMarks: null,
      note: `No CBSE Class ${key.classLevel} ${key.academicYear} syllabus map is published here, so scope is not being checked.`,
      suggestions: [],
    };
  }

  // `toSubject` deliberately falls back to Mathematics for anything
  // unrecognised, which is right for the CBT routes but wrong here: asking
  // about "English" must not be read as a Mathematics request and get
  // Mathematics lessons. The exact predicate is the honest gate.
  const resolved = isSubject(subject) ? subject : null;
  if (!resolved || !subjectsOf(map).includes(resolved)) {
    return {
      verdict: "unknown-subject",
      board: key.board,
      classLevel: key.classLevel,
      academicYear: key.academicYear,
      subject: rawSubject,
      chapter: null,
      unit: null,
      unitMarks: null,
      subjectTheoryMarks: null,
      note: `"${subject || "This subject"}" is not one of the subjects this syllabus map covers (${subjectsOf(
        map,
      ).join(", ")}), so scope is not being checked.`,
      suggestions: [],
    };
  }

  // One shared matcher, so a chapter resolves identically here, in the academic
  // adapter and in the mastery store. Exact chapter name wins over a topic
  // match, because "Current Electricity" is both and the chapter is what the
  // student is examined on.
  const match = matchCurriculum(map, resolved, topic);

  if (match.kind === "chapter" && match.unit) {
    return {
      verdict: "in-syllabus",
      board: key.board,
      classLevel: key.classLevel,
      academicYear: key.academicYear,
      subject: resolved,
      chapter: match.chapter,
      unit: match.unit,
      unitMarks: match.unit.marks,
      subjectTheoryMarks: theoryMarks(map, resolved),
      note: chapterNote(match.chapter, match.unit, key.classLevel, key.academicYear),
      suggestions: [],
    };
  }

  if (match.kind === "topic" && match.unit && match.chapter) {
    return {
      verdict: "in-syllabus-topic",
      board: key.board,
      classLevel: key.classLevel,
      academicYear: key.academicYear,
      subject: resolved,
      chapter: match.chapter,
      unit: match.unit,
      unitMarks: match.unit.marks,
      subjectTheoryMarks: theoryMarks(map, resolved),
      note: `"${topic}" is a topic inside ${match.chapter.name} (Unit ${match.unit.numeral} — ${match.unit.name}), CBSE Class ${key.classLevel} ${key.academicYear}.`,
      suggestions: [],
    };
  }

  // Students ask for "Optics" and "Calculus" far more often than for the chapter
  // names the board prints, so a unit hit is a first-class resolution rather
  // than an off-syllabus rejection.
  if (match.kind === "unit" && match.unit) {
    return {
      verdict: "in-syllabus",
      board: key.board,
      classLevel: key.classLevel,
      academicYear: key.academicYear,
      subject: resolved,
      // A unit is not a chapter, so `chapter` stays null and `unit` carries the
      // resolution. The UI renders a unit row, not a chapter row.
      chapter: null,
      unit: match.unit,
      unitMarks: match.unit.marks,
      subjectTheoryMarks: theoryMarks(map, resolved),
      note: unitNote(match.unit, key.classLevel, key.academicYear),
      suggestions: [],
    };
  }

  return {
    verdict: "off-syllabus",
    board: key.board,
    classLevel: key.classLevel,
    academicYear: key.academicYear,
    subject: resolved,
    chapter: null,
    unit: null,
    unitMarks: null,
    subjectTheoryMarks: theoryMarks(map, resolved),
    note: `"${topic}" is not in the CBSE Class ${key.classLevel} ${key.academicYear} ${resolved} syllabus.`,
    suggestions: suggestFrom(map, resolved),
  };
}

function chapterNote(
  chapter: CurriculumChapter | null,
  unit: CurriculumUnit,
  classLevel: number,
  academicYear: string,
): string {
  const label = chapter ? `Chapter ${chapter.number} — ${chapter.name}` : unit.name;
  if (unit.marks === null) {
    return `${label} sits in Unit ${unit.numeral} — ${unit.name}. CBSE Class ${classLevel} ${academicYear} does not publish a per-unit mark weight here, so no weight is being claimed.`;
  }
  return `${label} sits in Unit ${unit.numeral} — ${unit.name}, which carries ${unit.marks} marks in the CBSE Class ${classLevel} ${academicYear} theory paper.`;
}

function unitNote(unit: CurriculumUnit, classLevel: number, academicYear: string): string {
  const count = unit.chapters.length;
  const list = unit.chapters.map((c) => c.name).join(", ");
  if (unit.marks === null) {
    return `Unit ${unit.numeral} — ${unit.name} covers ${count} chapter${
      count === 1 ? "" : "s"
    } (${list}). CBSE Class ${classLevel} ${academicYear} does not publish a per-unit mark weight here, so no weight is being claimed.`;
  }
  return `Unit ${unit.numeral} — ${unit.name} covers ${count} chapter${
    count === 1 ? "" : "s"
  } (${list}) and carries ${unit.marks} marks in the CBSE Class ${classLevel} ${academicYear} theory paper.`;
}

/**
 * True when the engine should still search. Only a missing map or an unknown
 * subject blocks it — an off-syllabus request is still searched, because the
 * student asked for it and may be revising an earlier class. The verdict is
 * surfaced, not enforced.
 */
export function shouldSearchScope(scope: SyllabusScope): boolean {
  return scope.verdict !== "unknown-subject" && scope.verdict !== "no-map";
}
