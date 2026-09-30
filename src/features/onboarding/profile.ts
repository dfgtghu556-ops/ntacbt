/**
 * STUDY PROFILE + FIRST-RUN ONBOARDING (B6)
 *
 * The research doc asks for onboarding that gets a student from "goal" to
 * "first session" in under two minutes, with minimal input, value-first,
 * progressive disclosure and a **skip option**.
 *
 * Two things make this harder than it looks, and both are answered here:
 *
 * 1. **There is nowhere to put the answer.** The planner profile
 *    (`PlannerProfile`) lives inside the monolithic legacy blob at
 *    `localStorage["jeecbt.v1"]`, and that blob is written *only* by
 *    `public/js/app.js`. The React app reads it and never writes it, so a React
 *    wizard that edited it would either clobber the legacy app's state or be
 *    silently ignored. This module therefore owns its own versioned key,
 *    `ntacbt.profile.v1`, exactly as `features/memory/srs.ts` and
 *    `features/studytube/progress.ts` do. The legacy blob stays the legacy
 *    app's business.
 *
 * 2. **A wizard is a form, and forms lie.** Every number the wizard shows is
 *    derived, never asserted: "60 min/day" becomes "about 7 hours a week" by
 *    arithmetic the student can redo in their head. An exam date the student
 *    does not have is `null`, never a guessed date that quietly starts a
 *    countdown. Skipping is a real answer that produces a working default, not
 *    a failure state.
 *
 * Pure and synchronous, so the rules are testable without a browser.
 */

import { LEGACY_STATE_KEY, localDayKey } from "../../lib/store";

const PROFILE_KEY = "ntacbt.profile.v1";
const ONBOARDED_KEY = "ntacbt.onboarded.v1";

/** The goals the app can actually plan for. Anything else is not offered. */
export const GOALS = [
  {
    id: "jeemain",
    label: "JEE Main",
    hint: "April session. Marks weigh accuracy over depth.",
  },
  {
    id: "jeeadv",
    label: "JEE Advanced",
    hint: "Single paper. Rewards depth, so the plan goes slower and deeper.",
  },
  {
    id: "board12",
    label: "CBSE Class 12 boards",
    hint: "Theory and derivation matter, not just objective speed.",
  },
  {
    id: "board11",
    label: "CBSE Class 11",
    hint: "Foundation year. Wide coverage, lighter daily load.",
  },
] as const;

export type GoalId = (typeof GOALS)[number]["id"];

/** Segmented control, not a dropdown — four options and no free text. */
export const DAILY_OPTIONS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1½ hours" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
] as const;

export interface StudyProfile {
  /** One of `GOALS`. Falls back to `jeemain` — the largest audience. */
  goal: GoalId;
  /** ISO `YYYY-MM-DD`, or `null` when the student has no date yet. */
  examDate: string | null;
  minutesPerDay: number;
  /** When the profile was first saved, in ms. */
  createdAt: number;
}

export const DEFAULT_STUDY_PROFILE: StudyProfile = {
  goal: "jeemain",
  examDate: null,
  minutesPerDay: 60,
  createdAt: 0,
};

function isGoalId(v: unknown): v is GoalId {
  return typeof v === "string" && GOALS.some((g) => g.id === v);
}

/**
 * Normalise a stored value into a usable profile. A malformed store degrades to
 * the default rather than throwing — onboarding is the first thing a new
 * student sees, and it must never be the thing that breaks.
 */
export function normaliseProfile(raw: unknown): StudyProfile {
  const p = (raw ?? {}) as Partial<StudyProfile>;
  const minutes = Number(p.minutesPerDay);
  const known = DAILY_OPTIONS.some((o) => o.minutes === minutes);
  let examDate: string | null = null;
  if (typeof p.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.examDate)) {
    // Reject a date in the past: a countdown to a day that has gone is a lie.
    if (p.examDate >= localDayKey()) examDate = p.examDate;
  }
  return {
    goal: isGoalId(p.goal) ? p.goal : DEFAULT_STUDY_PROFILE.goal,
    examDate,
    minutesPerDay: known ? minutes : DEFAULT_STUDY_PROFILE.minutesPerDay,
    createdAt: Number.isFinite(p.createdAt) ? Number(p.createdAt) : 0,
  };
}

export function loadStudyProfile(): StudyProfile {
  if (typeof localStorage === "undefined") return DEFAULT_STUDY_PROFILE;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_STUDY_PROFILE;
    return normaliseProfile(JSON.parse(raw));
  } catch {
    return DEFAULT_STUDY_PROFILE;
  }
}

export function saveStudyProfile(profile: StudyProfile): StudyProfile {
  const clean = normaliseProfile({ ...profile, createdAt: Date.now() });
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(clean));
      localStorage.setItem(ONBOARDED_KEY, String(Date.now()));
    } catch {
      /* a preference; a storage failure must not block the student */
    }
  }
  return clean;
}

/**
 * True once the student has finished or skipped the wizard. A returning student
 * never sees it again, and the key is separate from the profile so a student
 * who skips still gets a working default.
 */
export function hasCompletedOnboarding(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(ONBOARDED_KEY) !== null;
  } catch {
    return true;
  }
}

/** Mark the wizard as done without saving a profile (the skip path). */
export function completeOnboarding(): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (!localStorage.getItem(ONBOARDED_KEY)) {
      localStorage.setItem(ONBOARDED_KEY, String(Date.now()));
    }
  } catch {
    /* ignore */
  }
}

/** Weekly minutes, derived so the student can check the arithmetic. */
export function weeklyMinutes(minutesPerDay: number): number {
  return Math.round((minutesPerDay * 7) / 60);
}

/** Days until the exam, or `null` when there is no date. Never negative. */
export function daysUntilExam(examDate: string | null, now = Date.now()): number | null {
  if (!examDate) return null;
  const target = new Date(`${examDate}T00:00:00`).getTime();
  if (!Number.isFinite(target)) return null;
  const days = Math.ceil((target - now) / (24 * 3600 * 1000));
  return days > 0 ? days : null;
}

/**
 * One honest sentence about what the plan will do. This is the only claim the
 * wizard makes about the future, so it is deliberately small: it states the
 * inputs and the arithmetic, and promises nothing about the outcome.
 */
export function planSummary(profile: StudyProfile): string {
  const goal = GOALS.find((g) => g.id === profile.goal) ?? GOALS[0];
  const hours = weeklyMinutes(profile.minutesPerDay);
  return `${goal.label}: about ${hours} hour${hours === 1 ? "" : "s"} a week, planned day by day from your own weak chapters.`;
}

/**
 * Whether the legacy app already owns a planner. When it does, the wizard says
 * so instead of implying the React plan is the only one — a student who has
 * been using the old tool should not be told their plan does not exist.
 */
export function hasLegacyPlanner(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(LEGACY_STATE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { aiPlanner?: unknown };
    return Boolean(parsed.aiPlanner && typeof parsed.aiPlanner === "object");
  } catch {
    return false;
  }
}
