/**
 * SYLLABUS COVERAGE (Phase 4)
 *
 * Measures a student's stored plan against the *real* published syllabus map.
 *
 * **What this is not.** It is not a new planner and it does not touch the stored
 * schedule — the Eklavya plan stays exactly as the user wrote it. This is a
 * read-only lens over it: "here is the syllabus you are actually examined on,
 * here is what your plan covers, here is what it silently skips."
 *
 * **What it is.** For every chapter in the map, the planned minutes, the minutes
 * actually done, and the resulting state. Rolled up per unit so the board's own
 * weightage is visible — and only where the board publishes one. Physics units
 * are `null`, because published per-unit figures conflict; the UI renders "not
 * published here" rather than a number that would mis-rank a student's effort.
 *
 * **Why it matters.** A plan can be internally consistent and still miss whole
 * chapters. Before the curriculum map there was no way to tell, because the only
 * chapter list in the repo was a flat array with no units and no topics.
 */

import { curriculumKeyForExam } from "../academics/curriculum-bridge";
import { isSubject } from "../academics/subject";
import type { Subject } from "../academics/types";
import {
  curriculumFor,
  normaliseQuery,
  type CurriculumKey,
  type CurriculumMap,
  type CurriculumSubject,
  type CurriculumUnit,
} from "../../data/curriculum";
import type { PlannerTaskRow } from "../../lib/store";

/** How much of a chapter the plan actually reaches. */
export type ChapterState =
  /** No task names this chapter. */
  | "not-planned"
  /** Tasks exist, none finished. */
  | "planned"
  /** Some tasks finished. */
  | "in-progress"
  /** Every task for this chapter is finished. */
  | "done";

export interface ChapterCoverage {
  chapterNumber: number;
  chapterName: string;
  unitNumeral: string;
  unitName: string;
  /** The board's corroborated unit marks, or null when it publishes none. */
  unitMarks: number | null;
  topicCount: number;
  taskCount: number;
  doneCount: number;
  plannedMin: number;
  doneMin: number;
  state: ChapterState;
}

export interface UnitCoverage {
  numeral: string;
  name: string;
  /** Null means "the board does not publish this here", never 0. */
  marks: number | null;
  chapters: ChapterCoverage[];
  plannedMin: number;
  doneMin: number;
  /** Chapters with at least one task. */
  coveredChapters: number;
}

export interface SubjectCoverage {
  subject: Subject;
  /** Sum of unit marks, or null when any unit is unmarked. */
  theoryMarks: number | null;
  units: UnitCoverage[];
  plannedMin: number;
  doneMin: number;
  coveredChapters: number;
  totalChapters: number;
}

export interface SyllabusCoverage {
  /** Null when the target has no published map — see `note`. */
  key: CurriculumKey | null;
  /** Honest one-liner. Never claims a coverage figure it cannot compute. */
  note: string;
  subjects: SubjectCoverage[];
  totalChapters: number;
  coveredChapters: number;
  plannedMin: number;
  doneMin: number;
  /**
   * Plan rows whose subject+chapter could not be matched to a chapter in the
   * map. Surfaced rather than dropped, so a mislabelled plan row is visible
   * instead of quietly vanishing from the totals.
   */
  unmatched: { subject: string; chapter: string }[];
}

/** Minutes a row contributes: real watched minutes once done, else planned. */
function minutesOf(row: PlannerTaskRow): number {
  if (row.status === "done" && typeof row.actualMin === "number") return row.actualMin;
  return typeof row.estMin === "number" && row.estMin > 0 ? row.estMin : 0;
}

interface ChapterHit {
  unit: CurriculumUnit;
  chapterNumber: number;
  chapterName: string;
}

/** Exact chapter name, then a substring match, else null. */
function matchChapter(subject: CurriculumSubject, chapterName: string): ChapterHit | null {
  const wanted = normaliseQuery(chapterName);
  if (!wanted) return null;
  for (const unit of subject.units) {
    for (const chapter of unit.chapters) {
      if (normaliseQuery(chapter.name) === wanted) {
        return { unit, chapterNumber: chapter.number, chapterName: chapter.name };
      }
    }
  }
  for (const unit of subject.units) {
    for (const chapter of unit.chapters) {
      const name = normaliseQuery(chapter.name);
      if (name.includes(wanted) || wanted.includes(name)) {
        return { unit, chapterNumber: chapter.number, chapterName: chapter.name };
      }
    }
  }
  return null;
}

/** The curriculum key for a planner target, or null. */
function keyForTarget(target: string): CurriculumKey | null {
  const t = (target || "").toLowerCase();
  if (t === "cbse27" || t === "board12") return curriculumKeyForExam("CBSE_12", "2026-27");
  if (t === "board11") return curriculumKeyForExam("CBSE_11", "2026-27");
  return null;
}

/**
 * Measure a stored plan against the published syllabus map.
 *
 * Pure and synchronous. Rows that name no chapter, or a chapter outside the
 * map, are counted in `unmatched` rather than being dropped.
 */
export function syllabusCoverage(rows: PlannerTaskRow[], target: string): SyllabusCoverage {
  const key = keyForTarget(target);
  const safeRows = Array.isArray(rows) ? rows.filter((r) => r && r.subject) : [];

  if (!key) {
    return {
      key: null,
      note: `No published syllabus map for the "${target || "unknown"}" objective, so coverage is not being measured.`,
      subjects: [],
      totalChapters: 0,
      coveredChapters: 0,
      plannedMin: 0,
      doneMin: 0,
      unmatched: [],
    };
  }

  const map: CurriculumMap | null = curriculumFor(key);
  if (!map) {
    return {
      key,
      note: `The CBSE Class ${key.classLevel} ${key.academicYear} syllabus map is not published here yet, so coverage is not being measured.`,
      subjects: [],
      totalChapters: 0,
      coveredChapters: 0,
      plannedMin: 0,
      doneMin: 0,
      unmatched: [],
    };
  }

  const unmatched: { subject: string; chapter: string }[] = [];

  // Index the plan by subject+chapter so each map chapter can look itself up.
  const index = new Map<
    string,
    { taskCount: number; doneCount: number; plannedMin: number; doneMin: number }
  >();
  for (const row of safeRows) {
    const subject = isSubject(row.subject) ? row.subject : null;
    const chapter = String(row.chapter ?? "");
    if (!subject) {
      unmatched.push({ subject: String(row.subject), chapter });
      continue;
    }
    const subjectRecord = map.subjects.find((s) => s.subject === subject);
    if (!subjectRecord) {
      unmatched.push({ subject, chapter });
      continue;
    }
    const hit = matchChapter(subjectRecord, chapter);
    if (!hit) {
      unmatched.push({ subject, chapter });
      continue;
    }
    const k = `${subject}::${hit.chapterNumber}`;
    const acc = index.get(k) ?? { taskCount: 0, doneCount: 0, plannedMin: 0, doneMin: 0 };
    acc.taskCount += 1;
    acc.plannedMin += minutesOf(row);
    if (row.status === "done") {
      acc.doneCount += 1;
      acc.doneMin += minutesOf(row);
    }
    index.set(k, acc);
  }

  const subjects: SubjectCoverage[] = map.subjects.map((subjectRecord) => {
    const anyUnmarked = subjectRecord.units.some((u) => u.marks === null);
    const units: UnitCoverage[] = subjectRecord.units.map((unit) => {
      const chapters: ChapterCoverage[] = unit.chapters.map((chapter) => {
        const acc = index.get(`${subjectRecord.subject}::${chapter.number}`);
        const taskCount = acc?.taskCount ?? 0;
        const doneCount = acc?.doneCount ?? 0;
        const state: ChapterState =
          taskCount === 0
            ? "not-planned"
            : doneCount === 0
              ? "planned"
              : doneCount === taskCount
                ? "done"
                : "in-progress";
        return {
          chapterNumber: chapter.number,
          chapterName: chapter.name,
          unitNumeral: unit.numeral,
          unitName: unit.name,
          unitMarks: unit.marks,
          topicCount: chapter.topics.length,
          taskCount,
          doneCount,
          plannedMin: acc?.plannedMin ?? 0,
          doneMin: acc?.doneMin ?? 0,
          state,
        };
      });
      return {
        numeral: unit.numeral,
        name: unit.name,
        marks: unit.marks,
        chapters,
        plannedMin: chapters.reduce((n, c) => n + c.plannedMin, 0),
        doneMin: chapters.reduce((n, c) => n + c.doneMin, 0),
        coveredChapters: chapters.filter((c) => c.taskCount > 0).length,
      };
    });

    return {
      subject: subjectRecord.subject,
      // A partial sum would be a fabricated weight, so the total is null
      // whenever any unit is unmarked — which is every Physics unit.
      theoryMarks: anyUnmarked ? null : subjectRecord.units.reduce((n, u) => n + (u.marks ?? 0), 0),
      units,
      plannedMin: units.reduce((n, u) => n + u.plannedMin, 0),
      doneMin: units.reduce((n, u) => n + u.doneMin, 0),
      coveredChapters: units.reduce((n, u) => n + u.coveredChapters, 0),
      totalChapters: units.reduce((n, u) => n + u.chapters.length, 0),
    };
  });

  const totalChapters = subjects.reduce((n, s) => n + s.totalChapters, 0);
  const coveredChapters = subjects.reduce((n, s) => n + s.coveredChapters, 0);

  const unmarkedSubjects = subjects.filter((s) => s.theoryMarks === null).map((s) => s.subject);
  // The unmarked caveat belongs in BOTH branches. A plan that touches nothing
  // still has to say that Physics carries no published weightage, or the empty
  // state reads as "nothing is weighted".
  const caveat = unmarkedSubjects.length
    ? ` ${unmarkedSubjects.join(" and ")} ${
        unmarkedSubjects.length === 1 ? "has" : "have"
      } no published unit weightage, so no mark share is shown for ${
        unmarkedSubjects.length === 1 ? "it" : "them"
      }.`
    : "";
  const note =
    coveredChapters === 0
      ? `Your plan touches none of the ${totalChapters} chapters in the CBSE Class ${key.classLevel} ${key.academicYear} syllabus.${caveat}`
      : `Your plan touches ${coveredChapters} of ${totalChapters} chapters in the CBSE Class ${key.classLevel} ${key.academicYear} syllabus.${caveat}`;

  return {
    key,
    note,
    subjects,
    totalChapters,
    coveredChapters,
    plannedMin: subjects.reduce((n, s) => n + s.plannedMin, 0),
    doneMin: subjects.reduce((n, s) => n + s.doneMin, 0),
    unmatched,
  };
}
