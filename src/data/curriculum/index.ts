/**
 * Versioned curriculum registry — Board → Class → Subject → Unit → Chapter → Topic.
 *
 * **The point of the registry.** The rebuild plan asks for a map "versioned so
 * future syllabi drop in without code changes". That means a future CBSE 2027-28
 * map is a *new file plus one line here*, not an edit to every consumer. Every
 * reader goes through `curriculumFor`, which takes an explicit (board,
 * classLevel, academicYear) — so a Class XII read can never silently resolve a
 * Class XI map.
 *
 * A missing map returns `null`. It does NOT fall back to the nearest year: a
 * student on the 2027-28 syllabus must not be planned against 2026-27 chapters,
 * because that is the same class of cross-scope leak Phase F removed.
 */

import { isCompleteSource, type Source } from "@/features/academics/source";
import type { Subject } from "@/features/academics/types";
import { CBSE_CLASS_11_2026_27 } from "./cbse-class-11-2026-27";
import {
  CBSE_CLASS_12_2026_27,
  assertClassLevelIsolation,
  chaptersOf,
  theoryMarks,
  unitOfChapter,
  type BoardId,
  type ClassLevel,
  type CurriculumChapter,
  type CurriculumMap,
  type CurriculumSubject,
  type CurriculumTopic,
  type CurriculumUnit,
} from "./cbse-class-12-2026-27";

export type {
  BoardId,
  ClassLevel,
  CurriculumChapter,
  CurriculumMap,
  CurriculumSubject,
  CurriculumTopic,
  CurriculumUnit,
};

/** The key every reader uses. Deliberately explicit — no implicit "current". */
export interface CurriculumKey {
  board: BoardId;
  classLevel: ClassLevel;
  academicYear: string;
}

/**
 * Every published map, newest academic year last so a later one wins on a
 * duplicate key rather than being silently shadowed.
 */
const MAPS: CurriculumMap[] = [CBSE_CLASS_12_2026_27, CBSE_CLASS_11_2026_27];

/** Look up a map, or `null` when that syllabus is not published. */
export function curriculumFor(key: CurriculumKey): CurriculumMap | null {
  return (
    MAPS.find(
      (m) =>
        m.board === key.board &&
        m.classLevel === key.classLevel &&
        m.academicYear === key.academicYear,
    ) ?? null
  );
}

/** Every published map, for a UI that lists what is available. */
export function publishedCurricula(): CurriculumMap[] {
  return [...MAPS];
}

/** The provenance record for a syllabus, or null when the map is unpublished. */
export function curriculumSource(key: CurriculumKey): Source | null {
  const map = curriculumFor(key);
  if (!map || !isCompleteSource(map.source)) return null;
  return map.source;
}

/** True when a syllabus is published AND its provenance record is complete. */
export function isCurriculumPublished(key: CurriculumKey): boolean {
  const map = curriculumFor(key);
  if (!map) return false;
  return isCompleteSource(map.source) && assertClassLevelIsolation(map, key.classLevel);
}

/** Every chapter across every subject, in board order. */
export function allChapters(map: CurriculumMap): CurriculumChapter[] {
  return map.subjects.flatMap((s) => chaptersOf(map, s.subject));
}

/** The subject list a map actually covers. */
export function subjectsOf(map: CurriculumMap): Subject[] {
  return map.subjects.map((s) => s.subject);
}

/* ------------------------------------------------------------------ *
 * Matching
 *
 * One matcher, used by the planner scope and the academic adapter, so a
 * chapter resolves the same way everywhere. A student who types "Optics" in
 * the planner and "optics" on a test question must land in the same row.
 * ------------------------------------------------------------------ */

/** What kind of thing a query resolved to. */
export type CurriculumMatchKind =
  /** The query names a chapter exactly. */
  | "chapter"
  /** The query names a topic inside a chapter. */
  | "topic"
  /** The query names a unit. */
  | "unit"
  /** Nothing in the map matches. */
  | "none";

export interface CurriculumMatch {
  kind: CurriculumMatchKind;
  subject: Subject;
  chapter: CurriculumChapter | null;
  unit: CurriculumUnit | null;
}

export function normaliseQuery(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when `haystack` contains every significant word of `needle`. */
export function looseMatch(haystack: string, needle: string): boolean {
  const words = normaliseQuery(needle)
    .split(" ")
    .filter((w) => w.length > 2);
  if (words.length === 0) return false;
  const h = normaliseQuery(haystack);
  return words.every((w) => h.includes(w));
}

/**
 * Resolve a free-text query against one subject of a map.
 *
 * Order matters: an exact chapter name wins over a topic match, because
 * "Current Electricity" is both a chapter and a topic name elsewhere, and the
 * chapter is what the student is being examined on. A unit name is tried last,
 * so "Optics" still resolves when no chapter or topic carries that word.
 */
export function matchCurriculum(
  map: CurriculumMap,
  subject: Subject,
  query: string,
): CurriculumMatch {
  const miss: CurriculumMatch = { kind: "none", subject, chapter: null, unit: null };
  if (!query.trim()) return miss;
  const units = map.subjects.find((s) => s.subject === subject)?.units ?? [];
  if (units.length === 0) return miss;
  const wanted = normaliseQuery(query);

  const chapter = units.flatMap((u) => u.chapters).find((c) => normaliseQuery(c.name) === wanted);
  if (chapter) {
    const unit = units.find((u) => u.chapters.some((c) => c.number === chapter.number)) ?? null;
    return { kind: "chapter", subject, chapter, unit };
  }

  for (const u of units) {
    for (const c of u.chapters) {
      if (c.topics.some((t) => looseMatch(t.name, query))) {
        return { kind: "topic", subject, chapter: c, unit: u };
      }
    }
  }

  const unit = units.find((u) => normaliseQuery(u.name) === wanted);
  if (unit) return { kind: "unit", subject, chapter: null, unit };
  const looseUnit = units.find((u) => looseMatch(u.name, query));
  if (looseUnit) return { kind: "unit", subject, chapter: null, unit: looseUnit };

  return miss;
}

export {
  CBSE_CLASS_11_2026_27,
  CBSE_CLASS_12_2026_27,
  assertClassLevelIsolation,
  chaptersOf,
  theoryMarks,
  unitOfChapter,
};
