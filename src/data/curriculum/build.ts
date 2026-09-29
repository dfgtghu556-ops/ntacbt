/**
 * Shared curriculum plumbing — types, id generation and the invariants.
 *
 * Extracted from `cbse-class-12-2026-27.ts` when a second map (Class XI) was
 * added. Before this the types, the `slug` id generator, `buildSubject` and
 * `assertClassLevelIsolation` lived inside the Class XII file, which meant a
 * second map would either import them from a file named after a different
 * class, or reimplement them.
 *
 * Reimplementing is the dangerous option. The chapter `id` is what mastery rows
 * key on, so a second `slug` that formats ids even slightly differently gives
 * one chapter two identities and splits its evidence between them. The
 * isolation check is the thing that stops Class XI chapters leaking into a
 * Class XII plan, so a second copy of it is a second thing to forget to update.
 *
 * One definition, both maps, no consumer churn: `cbse-class-12-2026-27.ts`
 * re-exports everything it used to export itself.
 */

import type { Source } from "@/features/academics/source";
import type { Subject } from "@/features/academics/types";

export type BoardId = "CBSE";
export type ClassLevel = 11 | 12;

/** One topic inside a chapter. */
export interface CurriculumTopic {
  id: string;
  name: string;
}

/** One chapter inside a unit. */
export interface CurriculumChapter {
  id: string;
  /** The NCERT chapter number, for cross-referencing a textbook. */
  number: number;
  name: string;
  topics: CurriculumTopic[];
}

/**
 * One unit. `marks` is `null` when the board's published per-unit marks could
 * not be corroborated — never a guessed number.
 */
export interface CurriculumUnit {
  id: string;
  /** Roman numeral as the board prints it, e.g. "III". */
  numeral: string;
  name: string;
  /** Theory marks for this unit, or null when not corroborated. */
  marks: number | null;
  chapters: CurriculumChapter[];
}

export interface CurriculumSubject {
  subject: Subject;
  units: CurriculumUnit[];
}

/** A complete, versioned curriculum map for one class and academic year. */
export interface CurriculumMap {
  board: BoardId;
  classLevel: ClassLevel;
  academicYear: string;
  /** Dataset version, so a future syllabus refresh is diffable. */
  version: string;
  source: Source;
  /** Total theory marks across the subject, or null when units are unmarked. */
  subjects: CurriculumSubject[];
  note?: string | undefined;
}

/* ------------------------------------------------------------------ *
 * Helpers for building a map without repeating ids by hand
 * ------------------------------------------------------------------ */

export interface RawChapter {
  n: number;
  name: string;
  topics: string[];
}
export interface RawUnit {
  numeral: string;
  name: string;
  marks: number | null;
  chapters: RawChapter[];
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Build a subject from raw units, deriving every id.
 *
 * Ids are derived rather than written by hand because a typo in a chapter id is
 * invisible at authoring time and fatal at read time: mastery rows key on it.
 */
export function buildSubject(subject: Subject, rawUnits: RawUnit[]): CurriculumSubject {
  return {
    subject,
    units: rawUnits.map((u, ui) => ({
      id: `${slug(subject)}-u${ui + 1}-${slug(u.name)}`,
      numeral: u.numeral,
      name: u.name,
      marks: u.marks,
      chapters: u.chapters.map((c) => ({
        id: `${slug(subject)}-c${c.n}-${slug(c.name)}`,
        number: c.n,
        name: c.name,
        topics: c.topics.map((t, ti) => ({
          id: `${slug(subject)}-c${c.n}-t${ti + 1}-${slug(t)}`,
          name: t,
        })),
      })),
    })),
  };
}

/** Total theory marks for a subject, or null when any unit is unmarked. */
export function theoryMarks(map: CurriculumMap, subject: Subject): number | null {
  const units = map.subjects.find((s) => s.subject === subject)?.units ?? [];
  if (units.length === 0) return null;
  let total = 0;
  for (const u of units) {
    if (u.marks === null) return null;
    total += u.marks;
  }
  return total;
}

/** Every chapter in one subject, in board order. */
export function chaptersOf(map: CurriculumMap, subject: Subject): CurriculumChapter[] {
  return (map.subjects.find((s) => s.subject === subject)?.units ?? []).flatMap((u) => u.chapters);
}

/** The unit a chapter belongs to, or null when it is not in the map. */
export function unitOfChapter(
  map: CurriculumMap,
  subject: Subject,
  chapterName: string,
): CurriculumUnit | null {
  const wanted = chapterName.trim().toLowerCase();
  if (!wanted) return null;
  const units = map.subjects.find((s) => s.subject === subject)?.units ?? [];
  for (const u of units) {
    if (u.chapters.some((c) => c.name.trim().toLowerCase() === wanted)) return u;
  }
  return null;
}

/**
 * The cross-scope safety check.
 *
 * One map per (board, classLevel, academicYear). This asserts that a map really
 * is internally consistent for the class it claims, so a Class XII read can
 * only ever resolve a Class XII map and Class XI chapters cannot leak into a
 * Class XII plan.
 *
 * It rejects, per subject:
 *  - the same chapter NAME in two units, which would create two mastery rows for
 *    one chapter and split its evidence between them;
 *  - the same chapter NUMBER twice in one subject, which would break every
 *    `chaptersOf` ordering and any "chapter 7" reference.
 *
 * The check is scoped per subject, so Chemistry ch. 1 and Physics ch. 1 are not
 * a collision — they are genuinely different chapters.
 */
export function assertClassLevelIsolation(map: CurriculumMap, expected: ClassLevel): boolean {
  if (map.classLevel !== expected) return false;
  for (const s of map.subjects) {
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const seenNumbers = new Set<number>();
    for (const u of s.units) {
      for (const c of u.chapters) {
        if (seenIds.has(c.id)) return false; // identical chapter in two units
        if (seenNames.has(c.name.toLowerCase())) return false; // one chapter, two units
        if (seenNumbers.has(c.number)) return false; // numbering collision
        seenIds.add(c.id);
        seenNames.add(c.name.toLowerCase());
        seenNumbers.add(c.number);
      }
    }
  }
  return true;
}
