/**
 * ACHIEVEMENTS — XP, levels and badges (A9)
 *
 * The research doc is specific about the constraints: gamification "must be
 * **earning-based, never guilt**", "badges meaningful", "keep leaderboards
 * private", "no ads/promos anywhere". Those are not decoration — they are the
 * rules that decide whether the feature helps or nags.
 *
 * **Everything here is derived, never accumulated.** XP is recomputed from the
 * student's evidence on every read. A stored counter would drift — it would
 * survive a data wipe, inflate on a re-import, and quietly disagree with the
 * numbers on the rest of the page. Deriving it means the XP a student sees is
 * always exactly what their focus minutes, attempts, lessons and mastered
 * chapters add up to, and it can never be inflated by editing localStorage.
 *
 * **No badge can be earned by not doing something.** Every predicate below
 * asserts a positive, completed act. There is no "you failed to…" badge, no
 * countdown, no loss framing. A student with an empty week sees "here is what is
 * next", never a red badge telling them what they missed.
 *
 * **No leaderboard.** The doc puts peer comparison in A6 and flags it as the
 * item most likely to backfire. Nothing here ranks a student against anyone but
 * their own previous best.
 */

import type { FocusSession } from "./focus";
import type { HumaneStreak } from "./streak";
import type { SurvivalScore } from "../dashboard/types";

/** One badge: what it takes, and the proof shown when it is earned. */
export interface Badge {
  id: string;
  label: string;
  /** What the student actually did to earn it. */
  description: string;
  /** XP awarded once, on top of the per-activity XP. */
  bonus: number;
  /** The evidence that earns it. */
  earned: boolean;
  /** How close the student is, 0–1, for a progress bar on an unearned badge. */
  progress: number;
}

export interface XpBreakdown {
  source: string;
  xp: number;
  /** Why this much, in the student's favour. */
  reason: string;
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level costs. */
  levelSpan: number;
  /** XP still needed for the next level. */
  toNext: number;
  /** A title for the level. Descriptive, never a judgement. */
  title: string;
}

export interface AchievementSummary {
  xp: number;
  level: LevelInfo;
  badges: Badge[];
  earned: Badge[];
  /** The badge closest to being earned, for a "next up" nudge. */
  nextBadge: Badge | null;
  breakdown: XpBreakdown[];
  /**
   * True when the student has beaten their own best streak. Comparing to a
   * personal record only — never to another student.
   */
  beatPersonalBest: boolean;
  personalBestDays: number;
  /** One honest line for the UI. */
  note: string;
}

/** XP weights. Each is small and explicit, so the total is explainable. */
export const XP = {
  perFocusMinute: 2,
  perQuestion: 4,
  perLesson: 6,
  perMasteredChapter: 25,
  perStreakDay: 10,
  /** A readiness score of 70 or more is worth a flat award, once. */
  readinessBonus: 50,
  /** The readiness threshold for that award. */
  readinessThreshold: 70,
} as const;

/** Level titles. Descriptive of where the student is, never a verdict on them. */
const LEVEL_TITLES = [
  "Getting started",
  "Finding a rhythm",
  "Building the habit",
  "Steady",
  "Consistent",
  "Committed",
  "Deep in it",
  "Strong",
  "Reliable",
  "Formidable",
];

/** The XP a level costs. Each level costs 100 more than the last. */
export function levelSpan(level: number): number {
  return 100 + (Math.max(1, level) - 1) * 100;
}

/** Total XP needed to reach a level from zero. */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.max(1, level); l++) total += levelSpan(l);
  return total;
}

/** Resolve a total XP figure into a level and progress. */
export function levelForXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = xp;
  let span = levelSpan(1);
  // Guard the loop: a huge XP figure must not spin.
  while (remaining >= span && level < 500) {
    remaining -= span;
    level += 1;
    span = levelSpan(level);
  }
  return {
    level,
    xpIntoLevel: remaining,
    levelSpan: span,
    toNext: span - remaining,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)] ?? "Formidable",
  };
}

export interface AchievementInput {
  focusSessions: FocusSession[];
  /** Questions attempted across tests and PYQ papers. */
  questionsAttempted: number;
  /** Lessons marked finished. */
  lessonsFinished: number;
  /** Chapters reaching the mastery bar. */
  masteredChapters: number;
  humane: HumaneStreak;
  survival: Pick<SurvivalScore, "score"> | null;
  /** The student's own best-ever streak, for the personal-record comparison. */
  personalBestDays: number;
}

/** Total focus minutes across a session list. */
function focusMinutes(sessions: FocusSession[]): number {
  return Math.round(
    (Array.isArray(sessions) ? sessions : [])
      .filter((s) => s && s.completed && typeof s.seconds === "number")
      .reduce((n, s) => n + s.seconds, 0) / 60,
  );
}

/**
 * XP from real evidence, with the reason for each part.
 *
 * Only completed focus sessions count, so a timer left running does not earn
 * anything.
 */
export function xpBreakdown(input: AchievementInput): XpBreakdown[] {
  const minutes = focusMinutes(input.focusSessions);
  const out: XpBreakdown[] = [];
  if (minutes > 0) {
    out.push({
      source: "Focus time",
      xp: minutes * XP.perFocusMinute,
      reason: `${minutes} focused minute${minutes === 1 ? "" : "s"} across completed sessions.`,
    });
  }
  if (input.questionsAttempted > 0) {
    out.push({
      source: "Questions attempted",
      xp: input.questionsAttempted * XP.perQuestion,
      reason: `${input.questionsAttempted} question${input.questionsAttempted === 1 ? "" : "s"} attempted in tests and past papers.`,
    });
  }
  if (input.lessonsFinished > 0) {
    out.push({
      source: "Lessons finished",
      xp: input.lessonsFinished * XP.perLesson,
      reason: `${input.lessonsFinished} lesson${input.lessonsFinished === 1 ? "" : "s"} marked finished.`,
    });
  }
  if (input.masteredChapters > 0) {
    out.push({
      source: "Chapters mastered",
      xp: input.masteredChapters * XP.perMasteredChapter,
      reason: `${input.masteredChapters} chapter${input.masteredChapters === 1 ? "" : "s"} reached the mastery bar.`,
    });
  }
  if (input.humane.days > 0) {
    out.push({
      source: "Streak",
      xp: input.humane.days * XP.perStreakDay,
      reason: `${input.humane.days}-day streak.`,
    });
  }
  const readiness = input.survival?.score ?? 0;
  if (readiness >= XP.readinessThreshold) {
    out.push({
      source: "Readiness",
      xp: XP.readinessBonus,
      reason: `Readiness score of ${readiness} — the whole system working together.`,
    });
  }
  return out;
}

/** Every badge, with whether it is earned and how close it is. */
export function badgesFor(input: AchievementInput): Badge[] {
  const minutes = focusMinutes(input.focusSessions);
  const days = input.humane.days;
  const readiness = input.survival?.score ?? 0;

  const defs: Array<Omit<Badge, "earned" | "progress"> & { value: number; target: number }> = [
    {
      id: "first-session",
      label: "First session",
      description: "Completed one focused session.",
      bonus: 10,
      value: minutes >= 25 ? 1 : 0,
      target: 1,
    },
    {
      id: "ten-hours",
      label: "Ten hours in",
      description: "Logged ten hours of focused study.",
      bonus: 40,
      value: Math.min(minutes, 600),
      target: 600,
    },
    {
      id: "week-strong",
      label: "A week of showing up",
      description: "Studied on seven separate days.",
      bonus: 60,
      value: Math.min(days, 7),
      target: 7,
    },
    {
      id: "month-strong",
      label: "A month of showing up",
      description: "Studied on thirty separate days.",
      bonus: 200,
      value: Math.min(days, 30),
      target: 30,
    },
    {
      id: "hundred-questions",
      label: "A hundred questions",
      description: "Attempted a hundred questions.",
      bonus: 50,
      value: Math.min(input.questionsAttempted, 100),
      target: 100,
    },
    {
      id: "five-hundred-questions",
      label: "Five hundred questions",
      description: "Attempted five hundred questions.",
      bonus: 150,
      value: Math.min(input.questionsAttempted, 500),
      target: 500,
    },
    {
      id: "ten-lessons",
      label: "Ten lessons finished",
      description: "Finished ten lessons end to end.",
      bonus: 40,
      value: Math.min(input.lessonsFinished, 10),
      target: 10,
    },
    {
      id: "first-mastery",
      label: "First chapter mastered",
      description: "Brought one chapter to the mastery bar.",
      bonus: 75,
      value: Math.min(input.masteredChapters, 1),
      target: 1,
    },
    {
      id: "ten-mastered",
      label: "Ten chapters mastered",
      description: "Brought ten chapters to the mastery bar.",
      bonus: 300,
      value: Math.min(input.masteredChapters, 10),
      target: 10,
    },
    {
      id: "on-track",
      label: "On track",
      description: "Reached a readiness score of 70.",
      bonus: 100,
      value: Math.min(readiness, 70),
      target: 70,
    },
    {
      id: "beat-your-best",
      label: "Beat your own best",
      description: "Passed your previous longest streak.",
      bonus: 80,
      // A personal record only. Never another student's.
      value: days > input.personalBestDays && input.personalBestDays > 0 ? 1 : 0,
      target: 1,
    },
  ];

  return defs.map(({ value, target, ...rest }) => ({
    ...rest,
    earned: value >= target,
    progress: target > 0 ? Math.max(0, Math.min(1, value / target)) : 0,
  }));
}

/** Build the full achievement summary from the student's evidence. */
export function achievements(input: AchievementInput): AchievementSummary {
  const breakdown = xpBreakdown(input);
  const badges = badgesFor(input);
  const earned = badges.filter((b) => b.earned);
  const bonusXp = earned.reduce((n, b) => n + b.bonus, 0);
  const xp = breakdown.reduce((n, b) => n + b.xp, 0) + bonusXp;
  const level = levelForXp(xp);

  const unearned = badges
    .filter((b) => !b.earned)
    .sort((a, b) => b.progress - a.progress || a.label.localeCompare(b.label));
  const nextBadge = unearned[0] ?? null;

  const beatPersonalBest = input.humane.days > input.personalBestDays && input.personalBestDays > 0;

  const note =
    earned.length === 0
      ? "No badges yet. Every one is earned by doing the work — none of them can be lost, and none of them are a countdown."
      : `${earned.length} badge${earned.length === 1 ? "" : "s"} earned. ${
          nextBadge
            ? `Closest next: ${nextBadge.label} — ${Math.round(nextBadge.progress * 100)}% there.`
            : "All of them, in fact."
        }`;

  return {
    xp,
    level,
    badges,
    earned,
    nextBadge,
    breakdown,
    beatPersonalBest,
    personalBestDays: input.personalBestDays,
    note,
  };
}
