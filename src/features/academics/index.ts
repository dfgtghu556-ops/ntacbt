/**
 * NTACBT academic source-of-truth adapter.
 *
 * This module exposes the existing structured datasets through one typed
 * contract. It does NOT ship a second copy of academic data — it adapts the
 * real datasets already in `src/data/*.ts` (official syllabus + verified
 * faculty) and adds provenance-aware query helpers used by the rest of the
 * app and by `scripts/validate-sot.mjs`.
 *
 * TODO(phase-2): after the legacy inline `JEE_TOPICS` / `AIP_TEACHERS` arrays
 * are bridged/generated, this module becomes the only import point for
 * academic data.
 */

import { JEE_MAIN_2026_SYLLABUS } from "../../data/syllabus";
import {
  INSTITUTES,
  TEACHERS,
  type InstituteRecord,
  type TeacherRecord,
} from "../../data/teachers";
import {
  getLegacyTeachers,
  getLegacyTopics,
  type LegacyTeacher,
} from "../../data/sot/legacy-inline";
import {
  EXAM_IDS,
  SUBJECTS,
  type AcademicRecord,
  type ExamId,
  type ExamScope,
  type SourceRef,
  type Subject,
} from "./types";
import { SOURCE_RECORDS, type Source } from "./source";
import { curriculumChapterName, hasCurriculumMap } from "./curriculum-bridge";

/** The official JEE Main 2026 scope in `src/data/syllabus.ts`. */
export const JEE_MAIN_2026_SCOPE: ExamScope = {
  exam: "JEE_MAIN",
  academicYear: "2025-26",
} as const;

/** Source metadata attached to the structured NTA syllabus dataset. */
export const JEE_SYLLABUS_SOURCE: SourceRef = {
  category: "official",
  ...SOURCE_RECORDS.JEE_SYLLABUS,
  // The dataset's own header wins where it has one, so a refreshed syllabus
  // file cannot be silently outvoted by the registry.
  source: JEE_MAIN_2026_SYLLABUS?.source ?? SOURCE_RECORDS.JEE_SYLLABUS.source,
  sourceUrl: JEE_MAIN_2026_SYLLABUS?.sourceUrl || SOURCE_RECORDS.JEE_SYLLABUS.sourceUrl,
  sourceType: JEE_MAIN_2026_SYLLABUS?.sourceType ?? SOURCE_RECORDS.JEE_SYLLABUS.sourceType,
  verificationStatus:
    JEE_MAIN_2026_SYLLABUS?.verificationStatus ?? SOURCE_RECORDS.JEE_SYLLABUS.verificationStatus,
  fetchedAt: JEE_MAIN_2026_SYLLABUS?.fetchedAt || SOURCE_RECORDS.JEE_SYLLABUS.fetchedAt,
  version: JEE_MAIN_2026_SYLLABUS?.version || SOURCE_RECORDS.JEE_SYLLABUS.version,
  verifiedAt: JEE_MAIN_2026_SYLLABUS?.fetchedAt,
};

/** Legacy planner source ref: the authoritative faculty/topic list the legacy
 *  planner + StudyTube UI already uses. Marked `verified` because it's the
 *  repo's curated list, but its per-record source is the legacy app itself. */
export const LEGACY_PLANNER_SOURCE: SourceRef = {
  category: "verified",
  ...SOURCE_RECORDS.LEGACY_PLANNER,
};

/**
 * A teacher record's provenance. Unverifiable metadata stays EMPTY rather than
 * invented — a teacher with no channel URL is recorded as `unverified` and the
 * recommendation engine hides it, which is the rule Phase 1 asks for.
 */
function teacherSource(teacher: TeacherRecord): SourceRef {
  const url = typeof teacher.channelUrl === "string" ? teacher.channelUrl : "";
  return {
    category: "verified",
    source: teacher.source || `${teacher.institute} faculty listing`,
    sourceType: "verified_curated",
    sourceUrl: url,
    fetchedAt: SOURCE_RECORDS.LEGACY_PLANNER.fetchedAt,
    version: SOURCE_RECORDS.LEGACY_PLANNER.version,
    verificationStatus: url ? (teacher.verified ? "verified" : "provisional") : "unverified",
    verifiedAt: SOURCE_RECORDS.LEGACY_PLANNER.fetchedAt,
  };
}

function legacyTopicRecords(): AcademicRecord[] {
  const records: AcademicRecord[] = [];
  const topics = getLegacyTopics();
  for (const subject of SUBJECTS) {
    const list = topics[subject] ?? [];
    for (const [name, , , classLevel] of list) {
      records.push({
        id: `legacy-${subject.toLowerCase()}-${name}`,
        exam: "JEE_MAIN",
        academicYear: "2025-26",
        classLevel: (classLevel === 11 ? 11 : 12) as 11 | 12,
        subject,
        chapter: name,
        name,
        source: LEGACY_PLANNER_SOURCE,
        note: "Legacy planner topic list (used by the built-in adaptive planner).",
      });
    }
  }
  return records;
}

function mapLegacyTeacherTarget(target: string): ExamId | null {
  const t = target.toLowerCase();
  if (t === "jeemain") return "JEE_MAIN";
  if (t === "jeeadv") return "JEE_ADVANCED";
  if (t === "board11") return "CBSE_11";
  if (t === "board12" || t === "cbse27") return "CBSE_12";
  return null;
}

function legacyTeacherRecords(): AcademicRecord[] {
  const records: AcademicRecord[] = [];
  for (const t of getLegacyTeachers()) {
    for (const target of t.examTarget ?? []) {
      const exam = mapLegacyTeacherTarget(target);
      if (!exam) continue;
      const academicYear = exam === "CBSE_11" || exam === "CBSE_12" ? "2026-27" : "2025-26";
      records.push({
        id: `legacy-${t.id}:${exam}`,
        exam,
        academicYear,
        classLevel: exam === "CBSE_11" ? 11 : 12,
        subject: t.subject,
        chapter: t.specialization ?? "General",
        topic: t.batchInfo,
        name: t.name,
        source: LEGACY_PLANNER_SOURCE,
        note: `Legacy faculty match: ${t.instituteId} · ${t.channelName}`,
      });
    }
  }
  return records;
}

function toAcademicRecords(): AcademicRecord[] {
  const records: AcademicRecord[] = [];

  for (const subject of JEE_MAIN_2026_SYLLABUS.subjects ?? []) {
    for (const chapter of subject.chapters ?? []) {
      const topics = chapter.topics?.length
        ? chapter.topics
        : [{ id: `${chapter.id}-topic`, name: chapter.name }];
      for (const topic of topics) {
        records.push({
          id: topic.id ?? `${chapter.id}-${topic.name}`,
          exam: "JEE_MAIN",
          academicYear: "2025-26",
          classLevel: chapter.classLevel ?? 12,
          subject: chapter.subject,
          chapter: chapter.name,
          topic: topic.name,
          name: topic.name,
          source: JEE_SYLLABUS_SOURCE,
        });
      }
    }
  }

  for (const teacher of TEACHERS) {
    for (const target of teacher.examTarget ?? []) {
      const exam = mapTeacherTarget(target);
      if (!exam) continue;
      records.push({
        id: `${teacher.id}:${exam}`,
        exam,
        academicYear: targetScopeForTeacher(target)?.academicYear ?? "2025-26",
        classLevel: teacher.subject ? (target === "board11" ? 11 : 12) : 12,
        subject: teacher.subject,
        chapter: teacher.supportedTopics?.join(" · ") || "All supported chapters",
        topic: teacher.specialization,
        name: teacher.name,
        source: teacherSource(teacher),
        note: `Faculty match: ${teacher.institute}`,
      });
    }
  }

  return records;
}

function collectLegacy(): AcademicRecord[] {
  return [...legacyTopicRecords(), ...legacyTeacherRecords()];
}

function mapTeacherTarget(target: string): ExamId | null {
  const t = target.toLowerCase();
  if (t === "jeemain") return "JEE_MAIN";
  if (t === "jeeadv") return "JEE_ADVANCED";
  if (t === "board11") return "CBSE_11";
  if (t === "board12" || t === "cbse27") return "CBSE_12";
  return null;
}

function targetScopeForTeacher(target: string): ExamScope | null {
  const t = target.toLowerCase();
  if (t === "board11") return { exam: "CBSE_11", academicYear: "2026-27" };
  if (t === "board12" || t === "cbse27") return { exam: "CBSE_12", academicYear: "2026-27" };
  return null;
}

/** All known academic fragments in the repo, tagged with provenance. */
export const ACADEMIC_RECORDS: AcademicRecord[] = [...toAcademicRecords(), ...collectLegacy()];

/** Filter records to one exam/year scope. Throws instead of silently returning nothing. */
export function forScope(scope: ExamScope): AcademicRecord[] {
  return ACADEMIC_RECORDS.filter(
    (r) => r.exam === scope.exam && r.academicYear === scope.academicYear,
  );
}

/**
 * Resolve a topic name to its chapter WITHIN a scope.
 *
 * Returns `null` when nothing matches. That is deliberate: a lesson whose
 * chapter cannot be resolved is *missing* evidence in the mastery store, which
 * is honest. Guessing the nearest chapter would put a watched lecture in the
 * wrong row and inflate a chapter the student never studied.
 */
export function chapterForTopic(
  scope: ExamScope,
  subject: Subject,
  topic: string | undefined,
): string | null {
  const wanted = (topic || "").trim().toLowerCase();
  if (!wanted) return null;

  // A published curriculum map is the authority on what a chapter IS, so it is
  // consulted first. Without this, a CBSE scope resolves against the legacy
  // teacher catalog, whose `chapter` field holds playlist marketing strings
  // ("Organic Chemistry Maestro") and whose nearest-string fallback could match
  // a teacher's name instead of the chapter the student asked about.
  if (hasCurriculumMap(scope.exam, scope.academicYear)) {
    return curriculumChapterName(scope.exam, scope.academicYear, subject, wanted);
  }

  const records = forScope(scope).filter((r) => r.subject === subject);
  // Exact topic match first, then a record whose name contains the topic.
  const exact = records.find(
    (r) => (r.topic || "").toLowerCase() === wanted || r.name.toLowerCase() === wanted,
  );
  if (exact) return exact.chapter;
  const partial = records.find(
    (r) => (r.topic || "").toLowerCase().includes(wanted) || r.name.toLowerCase().includes(wanted),
  );
  return partial ? partial.chapter : null;
}

/** Catch accidental cross-scope leakage: every record must match exactly one scope. */
export function assertNoCrossScopeMixing(scope: ExamScope): boolean {
  for (const record of forScope(scope)) {
    if (record.exam !== scope.exam || record.academicYear !== scope.academicYear) {
      return false;
    }
  }
  return true;
}

/** Deterministic count for validators/tests. */
export function academicStats(): Record<ExamId, Record<Subject | "teachers", number>> {
  const stats = {} as Record<ExamId, Record<Subject | "teachers", number>>;
  for (const exam of EXAM_IDS) {
    stats[exam] = { Physics: 0, Chemistry: 0, Mathematics: 0, teachers: 0 };
  }
  for (const r of ACADEMIC_RECORDS) {
    if (r.subject) stats[r.exam][r.subject] += 1;
  }
  for (const t of TEACHERS) {
    for (const target of t.examTarget ?? []) {
      const exam = mapTeacherTarget(target);
      if (exam) stats[exam].teachers += 1;
    }
  }
  return stats;
}

export const ACADEMIC_GOVERNANCE = {
  examIds: EXAM_IDS,
  subjects: SUBJECTS,
  officialSyllabus: JEE_MAIN_2026_SYLLABUS,
  institutes: INSTITUTES as unknown as InstituteRecord[],
  teachers: TEACHERS as unknown as TeacherRecord[],
  legacyTopics: getLegacyTopics(),
  legacyTeachers: getLegacyTeachers() as unknown as LegacyTeacher[],
} as const;
