/**
 * StudentContext — one persisted description of who is studying.
 *
 * **The bug this fixes.** Before this existed, every surface invented its own
 * idea of "what am I preparing for":
 *
 *   - `app.studytube.tsx` initialised `target` to a hard-coded `"jeemain"`,
 *   - the planner kept its own `profile.target`,
 *   - language lived under its own key,
 *   - goals lived in the legacy settings blob.
 *
 * A CBSE Class 12 student who had never touched the planner therefore got
 * **JEE Main content by default**, and a JEE student could be shown board-only
 * educators. That is the cross-scope leakage the architecture doc calls a
 * first-class domain constraint.
 *
 * **The contract.** One typed object, persisted once under
 * `STORAGE_KEYS.STUDENT`, read by every engine. It is *derived state*, never a
 * second source of academic truth: it selects a scope, it does not define one.
 *
 * **The migration.** On first read it seeds itself from whatever the student
 * already chose (legacy settings + planner profile + language) so nobody loses
 * an existing preference. It never writes back to the legacy blob.
 */

import { STORAGE_KEYS } from "@/config/constants";
import type { ExamId } from "@/features/academics/types";
import type { Lang } from "@/lib/lang";
import type { ExamTarget } from "@/data/teachers";

export const STUDENT_CONTEXT_KEY = STORAGE_KEYS.STUDENT;

/** What the student is preparing for. Maps 1:1 onto an academic scope. */
export type ExamGoal = "jee-main" | "jee-advanced" | "cbse-11" | "cbse-12";

export interface StudentContext {
  schemaVersion: number;
  /** The single answer to "what am I preparing for". */
  goal: ExamGoal;
  /** Convenience mirror of the goal's class level. */
  classLevel: 11 | 12;
  /** Subjects in play. Always a subset of the three the product teaches. */
  subjects: Array<"Physics" | "Chemistry" | "Mathematics">;
  /** Preferred institute id, or null for "no preference". */
  institute: string | null;
  /** Preferred teacher ids. Empty means "let the engine choose". */
  teachers: string[];
  /** Syllabus academic year the student is on, e.g. "2026-27". */
  syllabusYear: string;
  /** Interface + explanation language. */
  lang: Lang;
  /** Goals, all optional — a student with no exam date is not an error. */
  goals: {
    examDate: string | null;
    targetPercentile: number | null;
    /**
     * Questions to practise per day — the legacy `settings.dailyGoal`, which the
     * legacy app divides against `dailyQuestions` (`q14 / (goal*14)`). Default 20.
     */
    dailyQuestions: number;
    /** Deep-focus minutes per day — the legacy `settings.focusGoal`. Default 100. */
    focusMinutes: number;
  };
  /** When the context was last changed, for the "your profile" display. */
  updatedAt: string;
}

export const DEFAULT_CONTEXT: StudentContext = {
  schemaVersion: 1,
  // Hinglish-first, JEE-first matches the product's student base — but this is
  // a *seeded default*, never an assumption about an individual student.
  goal: "jee-main",
  classLevel: 12,
  subjects: ["Physics", "Chemistry", "Mathematics"],
  institute: null,
  teachers: [],
  syllabusYear: "2025-26",
  lang: "hinglish",
  goals: {
    examDate: null,
    targetPercentile: null,
    dailyQuestions: 20,
    focusMinutes: 100,
  },
  updatedAt: new Date(0).toISOString(),
};

/* ------------------------------------------------------------------ *
 * Goal <-> scope / StudyTube target mapping
 * ------------------------------------------------------------------ */

const GOAL_TO_EXAM: Record<ExamGoal, ExamId> = {
  "jee-main": "JEE_MAIN",
  "jee-advanced": "JEE_ADVANCED",
  "cbse-11": "CBSE_11",
  "cbse-12": "CBSE_12",
};

const GOAL_TO_TARGET: Record<ExamGoal, ExamTarget> = {
  "jee-main": "jeemain",
  "jee-advanced": "jeeadv",
  "cbse-11": "board11",
  "cbse-12": "board12",
};

const GOAL_TO_YEAR: Record<ExamGoal, string> = {
  "jee-main": "2025-26",
  "jee-advanced": "2025-26",
  "cbse-11": "2026-27",
  "cbse-12": "2026-27",
};

export const GOAL_LABEL: Record<ExamGoal, string> = {
  "jee-main": "JEE Main",
  "jee-advanced": "JEE Advanced",
  "cbse-11": "CBSE Class 11",
  "cbse-12": "CBSE Class 12",
};

export const EXAM_GOALS = Object.keys(GOAL_TO_EXAM) as ExamGoal[];

export function isExamGoal(value: unknown): value is ExamGoal {
  return typeof value === "string" && value in GOAL_TO_EXAM;
}

/** The academic scope this student's reads must use. */
export function scopeOf(context: StudentContext) {
  return { exam: GOAL_TO_EXAM[context.goal], academicYear: context.syllabusYear };
}

/** The StudyTube/teacher-registry target for this student. */
export function studyTubeTarget(context: StudentContext): ExamTarget {
  return GOAL_TO_TARGET[context.goal];
}

/** True when the student is on a board track, so board-first rules apply. */
/** Reverse map: a StudyTube/registry target back to a goal. */
export function goalForTarget(target: string | undefined): ExamGoal | null {
  if (!target) return null;
  const found = (Object.keys(GOAL_TO_TARGET) as ExamGoal[]).find(
    (g) => GOAL_TO_TARGET[g] === target,
  );
  return found ?? null;
}

export function isBoardGoal(goal: ExamGoal): boolean {
  return goal === "cbse-11" || goal === "cbse-12";
}

/**
 * Class level implied by the goal. Kept as a function (not a stored field) so
 * the two can never drift apart — a Class 12 board student and a Class 12 JEE
 * student share the level but not the scope.
 */
export function classLevelOf(goal: ExamGoal): 11 | 12 {
  return goal === "cbse-11" ? 11 : 12;
}

/* ------------------------------------------------------------------ *
 * Normalisation — never trusts persisted or caller input
 * ------------------------------------------------------------------ */

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function boolArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Coerce any shape into a valid context. Never throws, never returns null. */
export function normalizeContext(input: unknown): StudentContext {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const goals = (raw["goals"] && typeof raw["goals"] === "object" ? raw["goals"] : {}) as Record<
    string,
    unknown
  >;
  const goal = isExamGoal(raw["goal"]) ? raw["goal"] : DEFAULT_CONTEXT.goal;
  const subjects = boolArray(raw["subjects"]).filter((s) =>
    (["Physics", "Chemistry", "Mathematics"] as string[]).includes(s),
  ) as StudentContext["subjects"];

  return {
    schemaVersion: 1,
    goal,
    classLevel: classLevelOf(goal),
    subjects: subjects.length ? [...new Set(subjects)] : [...DEFAULT_CONTEXT.subjects],
    institute: typeof raw["institute"] === "string" && raw["institute"] ? raw["institute"] : null,
    teachers: [...new Set(boolArray(raw["teachers"]))].slice(0, 12),
    // Derived from the goal, never trusted from storage: a stale year is how a
    // Class 11 student silently reads the 2025-26 syllabus.
    syllabusYear: GOAL_TO_YEAR[goal],
    lang: oneOf<Lang>(raw["lang"], ["en", "hi", "hinglish"], DEFAULT_CONTEXT.lang),
    goals: {
      examDate:
        typeof goals["examDate"] === "string" && goals["examDate"] ? goals["examDate"] : null,
      targetPercentile:
        goals["targetPercentile"] === null || goals["targetPercentile"] === undefined
          ? null
          : num(goals["targetPercentile"], 90, 0, 100),
      dailyQuestions: num(goals["dailyQuestions"], DEFAULT_CONTEXT.goals.dailyQuestions, 5, 500),
      // 10–600 matches the legacy focus-goal input's own min/max.
      focusMinutes: num(goals["focusMinutes"], DEFAULT_CONTEXT.goals.focusMinutes, 10, 600),
    },
    updatedAt:
      typeof raw["updatedAt"] === "string" && raw["updatedAt"]
        ? raw["updatedAt"]
        : new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Persistence + seeding from what the student already chose
 * ------------------------------------------------------------------ */

function canStore(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadStudentContext(): StudentContext {
  if (!canStore()) return { ...DEFAULT_CONTEXT };
  try {
    const raw = localStorage.getItem(STUDENT_CONTEXT_KEY);
    if (!raw) return seedFromLegacy();
    return normalizeContext(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONTEXT };
  }
}

export function saveStudentContext(context: Partial<StudentContext>): StudentContext {
  const next = normalizeContext({ ...context, updatedAt: new Date().toISOString() });
  if (canStore()) {
    try {
      localStorage.setItem(STUDENT_CONTEXT_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked — the in-memory context still drives this session */
    }
  }
  return next;
}

/** Anything already chosen elsewhere wins over the shipped default. */
function seedFromLegacy(): StudentContext {
  const seeded = { ...DEFAULT_CONTEXT };
  if (typeof window === "undefined") return seeded;
  try {
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEGACY_STATE) || "{}") as Record<
      string,
      unknown
    >;
    const planner = settings["aiPlanner"] as { profile?: Record<string, unknown> } | undefined;
    const profile = planner?.profile ?? {};

    // Planner target is the most explicit signal a student has given.
    const target = profile["target"];
    const seededGoal = goalForTarget(typeof target === "string" ? target : undefined);
    if (seededGoal) {
      seeded.goal = seededGoal;
      seeded.classLevel = classLevelOf(seededGoal);
      seeded.syllabusYear = GOAL_TO_YEAR[seededGoal];
    }
    if (typeof profile["institute"] === "string") seeded.institute = profile["institute"];
    if (typeof profile["teacher"] === "string" && profile["teacher"]) {
      seeded.teachers = [profile["teacher"]];
    }

    // Legacy settings carry the goals.
    const settingsObj = (settings["settings"] ?? {}) as Record<string, unknown>;
    if (typeof settingsObj["examDate"] === "string" && settingsObj["examDate"]) {
      seeded.goals.examDate = settingsObj["examDate"];
    }
    if (typeof settingsObj["targetPercentile"] === "number") {
      seeded.goals.targetPercentile = settingsObj["targetPercentile"];
    }
    if (typeof settingsObj["dailyGoal"] === "number") {
      seeded.goals.dailyQuestions = settingsObj["dailyGoal"];
    }
    if (typeof settingsObj["focusGoal"] === "number") {
      seeded.goals.focusMinutes = settingsObj["focusGoal"];
    }
    if (typeof settingsObj["lang"] === "string") {
      seeded.lang = oneOf<Lang>(settingsObj["lang"], ["en", "hi", "hinglish"], seeded.lang);
    }
  } catch {
    /* a corrupt legacy blob must not block the app */
  }
  return normalizeContext(seeded);
}

/** Wipe the stored context (used by tests and "reset my profile"). */
export function clearStudentContext(): void {
  if (!canStore()) return;
  try {
    localStorage.removeItem(STUDENT_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * Cross-scope guard — the leakage check, in one place
 * ------------------------------------------------------------------ */

export interface ScopeLeak {
  ok: boolean;
  reason: string;
}

/**
 * Assert that a piece of content is allowed for this student's scope.
 * Board students must never be served JEE-only educators and vice versa.
 */
export function checkScopeLeak(
  context: StudentContext,
  content: { target?: string | undefined; examTarget?: string[] | undefined },
): ScopeLeak {
  const board = isBoardGoal(context.goal);
  const targets = content.examTarget ?? (content.target ? [content.target] : []);
  if (targets.length === 0) return { ok: true, reason: "no target declared" };

  const jeeTargets = targets.filter((t) => t === "jeemain" || t === "jeeadv");
  const boardTargets = targets.filter((t) => t === "board11" || t === "board12" || t === "cbse27");

  if (board && jeeTargets.length > 0 && boardTargets.length === 0) {
    return { ok: false, reason: `JEE-only content shown to a ${GOAL_LABEL[context.goal]} student` };
  }
  if (!board && boardTargets.length > 0 && jeeTargets.length === 0) {
    return {
      ok: false,
      reason: `Board-only content shown to a ${GOAL_LABEL[context.goal]} student`,
    };
  }
  return { ok: true, reason: "target matches the student's scope" };
}
