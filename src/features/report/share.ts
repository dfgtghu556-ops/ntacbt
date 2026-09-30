/**
 * SHAREABLE WEEKLY REPORT (A5 — parent / mentee accountability)
 *
 * A read-only one-pager a student can hand to a parent or a mentor: how many
 * days they showed up, what they finished, which chapters need work, and what
 * they are doing next. No shame, and no private data.
 *
 * **The privacy contract is the feature.** The local store holds a student's
 * notes, YouTube notes, bookmarks, SRS cards, goal and contract. None of that
 * belongs in a document that leaves the device. So this module does not copy
 * the store — it builds a `ShareableReport` from an explicit allowlist, and
 * `PRIVACY` documents both sides of it. A field that is not on the allowlist
 * cannot leak, because it is never read.
 *
 * **Tone is deliberate.** The research doc asks for accountability "with no
 * shame". A missed day is reported as a number, never as a verdict, and every
 * weak area is paired with the next action rather than left as a failing grade.
 * A student who studied nothing this week gets the same respectful treatment as
 * one who studied every day.
 *
 * **Numbers stay evidence-labelled.** A thin sample reports "not enough data",
 * never 0%, and a week with no attempts says so rather than reporting 0% as if
 * it were a measurement.
 */

import { DataStore, localDayKey } from "../../lib/store";
import { loadFocusStore, focusStreak, todayFocusSeconds, type FocusSession } from "../focus/focus";
import { loadStudyTubeProgress } from "../studytube/progress";
import { masteryFromStores, summariseMastery } from "../mastery/collect";
import { MIN_SAMPLE, priorityChapters } from "../mastery/mastery";

/**
 * What the shareable report contains, and what it deliberately does not.
 *
 * Both lists are enforced by construction: `buildWeeklyReport` reads only the
 * fields on the left. `src/test/share-report.test.ts` asserts the exclusion
 * list never reaches the output.
 */
export const PRIVACY = {
  included: [
    "exam target (the goal, not the person)",
    "days studied in the last 7 days",
    "total focus minutes",
    "study streak length",
    "planned vs completed tasks",
    "chapters with question evidence",
    "mean accuracy where a real sample exists",
    "weak chapters (subject, chapter, accuracy, attempts)",
    "the next recommended action",
  ],
  excluded: [
    "notes and YouTube notes",
    "bookmarks and watch-later lists",
    "spaced-repetition (SRS) card contents",
    "goal and contract free text",
    "test question content and per-question answers",
    "name, email, phone or any account identifier",
    "device, browser or location data",
  ],
} as const;

/** One weak chapter, with the reason it is on the list. */
export interface ShareableWeakArea {
  subject: string;
  chapter: string;
  /** Accuracy, or null when the sample is too thin to score. */
  accuracy: number | null;
  attempts: number;
  lessonsFinished: number;
  /** Why this is listed, in the student's favour. */
  note: string;
}

/** The one next step, with the reason it was chosen. */
export interface ShareableNextStep {
  label: string;
  reason: string;
}

export interface ShareableReport {
  /** ISO date of the report's last day. */
  generatedOn: string;
  /** The window this report covers, e.g. "2026-09-23 to 2026-09-29". */
  window: { from: string; to: string; days: number };
  examTarget: string;
  attendance: {
    daysStudied: number;
    daysInWindow: number;
    /** Day keys studied, for a calendar strip. Counts only — no per-day detail. */
    studiedDays: string[];
    streakDays: number;
  };
  effort: {
    focusMinutes: number;
    focusMinutesToday: number;
    lessonsFinished: number;
  };
  completion: {
    tasksPlanned: number;
    tasksDone: number;
    minutesPlanned: number;
    minutesDone: number;
  };
  evidence: {
    chaptersTouched: number;
    chaptersWithSample: number;
    questionsAttempted: number;
    pyqAttempts: number;
    /** Mean accuracy, or null when no chapter has a real sample. */
    accuracy: number | null;
  };
  weakAreas: ShareableWeakArea[];
  nextStep: ShareableNextStep;
  /** A one-line summary written to be read aloud without embarrassment. */
  headline: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Day keys for the last `days` days, oldest first. */
function windowDays(now: number, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(localDayKey(now - i * DAY_MS));
  return out;
}

function minutesOf(row: { status?: string; estMin?: number; actualMin?: number }): number {
  if (row.status === "done" && typeof row.actualMin === "number") return row.actualMin;
  return typeof row.estMin === "number" && row.estMin > 0 ? row.estMin : 0;
}

function weakNote(input: {
  attempts: number;
  lessonsFinished: number;
  accuracy: number | null;
}): string {
  if (input.attempts === 0) {
    return input.lessonsFinished > 0
      ? "Watched, not yet tested — worth a few questions to confirm it landed."
      : "Not reached yet this term.";
  }
  if (input.attempts < MIN_SAMPLE) {
    return "Only a couple of questions so far, so this is a starting point rather than a verdict.";
  }
  if (input.accuracy !== null && input.accuracy < 50) {
    return "Needs the next round of practice — this is the clearest place to spend time.";
  }
  return "Solid but not automatic — a short revision keeps it there.";
}

/**
 * Build the shareable report from the student's own stores.
 *
 * Reads only the allowlisted fields. Never throws: a malformed store degrades to
 * an empty-but-valid report rather than an error, because the student is trying
 * to share something and should not be blocked by a corrupt note.
 */
export function buildWeeklyReport(input: {
  store: DataStore;
  focus?: { sessions: FocusSession[]; dailyTargetSec?: number };
  studytube?: ReturnType<typeof loadStudyTubeProgress>;
  now?: number;
  days?: number;
}): ShareableReport {
  const now = input.now ?? Date.now();
  const days = input.days ?? 7;
  const store = input.store;
  const focusSessions = input.focus?.sessions ?? loadFocusStore().sessions;

  const windowKeys = windowDays(now, days);
  const from = windowKeys[0] ?? localDayKey(now);
  const to = localDayKey(now);

  // Days with at least one focus session of 25 minutes or more — the same bar
  // the humane streak uses, so the report and the app agree on "a study day".
  const activeDays = new Set<string>();
  for (const s of focusSessions) {
    if (!s || typeof s.startedAt !== "number") continue;
    if ((s.seconds ?? 0) >= 25 * 60) activeDays.add(localDayKey(s.startedAt));
  }
  const studiedDays = windowKeys.filter((k) => activeDays.has(k));

  const tasks = (store.planner?.tasks ?? []).filter((r) => r && r.date);
  const inWindow = tasks.filter((r) => {
    const k = String(r.date);
    return k >= from && k <= to;
  });
  const tasksPlanned = inWindow.length;
  const tasksDone = inWindow.filter((r) => r.status === "done").length;

  // Mastery is the single source for accuracy, weak chapters and lesson counts.
  let summary = {
    chaptersTouched: 0,
    chaptersWithEvidence: 0,
    questionsAttempted: 0,
    pyqAttempts: 0,
    lessonsFinished: 0,
    accuracy: null as number | null,
    distribution: {} as Record<string, number>,
  };
  let weakAreas: ShareableWeakArea[] = [];
  try {
    const mastery = masteryFromStores(store, input.studytube ?? loadStudyTubeProgress(), now);
    const s = summariseMastery(mastery);
    summary = {
      chaptersTouched: s.chaptersTouched,
      chaptersWithEvidence: s.chaptersWithEvidence,
      questionsAttempted: s.questionsAttempted,
      pyqAttempts: s.pyqAttempts,
      lessonsFinished: s.lessonsFinished,
      accuracy: s.accuracy,
      distribution: s.distribution,
    };
    weakAreas = priorityChapters(mastery, 5).map((m) => ({
      subject: m.subject,
      chapter: m.chapter,
      accuracy: m.attempts >= MIN_SAMPLE ? m.accuracy : null,
      attempts: m.attempts,
      lessonsFinished: m.lessonsFinished,
      note: weakNote({
        attempts: m.attempts,
        lessonsFinished: m.lessonsFinished,
        accuracy: m.attempts >= MIN_SAMPLE ? m.accuracy : null,
      }),
    }));
  } catch {
    /* A broken store yields an empty but valid report. */
  }

  const focusMinutes = Math.round(
    windowKeys.reduce((n, k) => {
      const secs = focusSessions
        .filter((s) => s && typeof s.startedAt === "number" && localDayKey(s.startedAt) === k)
        .reduce((m, s) => m + (s.seconds ?? 0), 0);
      return n + secs;
    }, 0) / 60,
  );
  const focusMinutesToday = Math.round(todayFocusSeconds(focusSessions, now) / 60);

  const examTarget = store.planner?.profile?.target || "not set";

  const nextStep = nextStepFor({
    daysStudied: studiedDays.length,
    tasksDone,
    tasksPlanned,
    weakAreas,
    questionsAttempted: summary.questionsAttempted,
  });

  return {
    generatedOn: to,
    window: { from, to, days },
    examTarget,
    attendance: {
      daysStudied: studiedDays.length,
      daysInWindow: windowKeys.length,
      studiedDays,
      streakDays: focusStreak(focusSessions, now),
    },
    effort: {
      focusMinutes,
      focusMinutesToday,
      lessonsFinished: summary.lessonsFinished,
    },
    completion: {
      tasksPlanned,
      tasksDone,
      minutesPlanned: inWindow.reduce((n, r) => n + minutesOf(r), 0),
      minutesDone: inWindow
        .filter((r) => r.status === "done")
        .reduce((n, r) => n + minutesOf(r), 0),
    },
    evidence: {
      chaptersTouched: summary.chaptersTouched,
      chaptersWithSample: summary.chaptersWithEvidence,
      questionsAttempted: summary.questionsAttempted,
      pyqAttempts: summary.pyqAttempts,
      accuracy: summary.accuracy,
    },
    weakAreas,
    nextStep,
    headline: headlineFor({
      daysStudied: studiedDays.length,
      daysInWindow: windowKeys.length,
      tasksDone,
      tasksPlanned,
      questionsAttempted: summary.questionsAttempted,
    }),
  };
}

function headlineFor(input: {
  daysStudied: number;
  daysInWindow: number;
  tasksDone: number;
  tasksPlanned: number;
  questionsAttempted: number;
}): string {
  if (input.questionsAttempted === 0) {
    return "No questions attempted yet — the next step is one short diagnostic, which is what makes every other number here meaningful.";
  }
  if (input.daysStudied === 0) {
    return "No focused study days logged in this window. One 25-minute session today restarts the streak without penalty.";
  }
  if (input.tasksPlanned > 0 && input.tasksDone === 0) {
    return `Showed up on ${input.daysStudied} of ${input.daysInWindow} days. The plan is in place; finishing one task today is the whole next step.`;
  }
  return `Studied ${input.daysStudied} of ${input.daysInWindow} days and finished ${input.tasksDone} of ${input.tasksPlanned} planned tasks.`;
}

function nextStepFor(input: {
  daysStudied: number;
  tasksDone: number;
  tasksPlanned: number;
  weakAreas: ShareableWeakArea[];
  questionsAttempted: number;
}): ShareableNextStep {
  if (input.questionsAttempted === 0) {
    return {
      label: "Take one short diagnostic",
      reason: "It is the only step that turns effort into evidence.",
    };
  }
  if (input.tasksPlanned > input.tasksDone) {
    return {
      label: "Finish the next planned task",
      reason: `${input.tasksPlanned - input.tasksDone} task${
        input.tasksPlanned - input.tasksDone === 1 ? "" : "s"
      } remain in this window.`,
    };
  }
  const top = input.weakAreas[0];
  if (top && top.accuracy !== null && top.accuracy < 50) {
    return {
      label: `Practise ${top.chapter}`,
      reason: `${top.accuracy}% accuracy across ${top.attempts} attempts — the clearest place to spend the next session.`,
    };
  }
  if (top) {
    return {
      label: `Test ${top.chapter}`,
      reason: "It has lessons but not enough questions yet to know whether it landed.",
    };
  }
  return {
    label: "Keep the current pace",
    reason: "Nothing in the evidence needs urgent attention.",
  };
}

/* ------------------------------------------------------------------ *
 * Rendering
 *
 * Plain text first, because a parent report has to survive being pasted
 * into WhatsApp. Markdown is a nicety; text is the contract.
 * ------------------------------------------------------------------ */

function pctLabel(accuracy: number | null, attempts: number): string {
  if (accuracy === null) return attempts === 0 ? "not reached" : "not enough data";
  return `${accuracy}%`;
}

/** The shareable one-pager as plain text. */
export function reportToText(report: ShareableReport): string {
  const lines: string[] = [];
  lines.push("NTACBT — weekly study report");
  lines.push(`${report.window.from} to ${report.window.to} · exam target: ${report.examTarget}`);
  lines.push("");
  lines.push(`Summary: ${report.headline}`);
  lines.push("");
  lines.push("Attendance");
  lines.push(
    `  Days studied: ${report.attendance.daysStudied} of ${report.attendance.daysInWindow}`,
  );
  lines.push(`  Current streak: ${report.attendance.streakDays} day(s)`);
  lines.push(
    `  Focus time: ${report.effort.focusMinutes} min (${report.effort.focusMinutesToday} min today)`,
  );
  lines.push(`  Lessons finished: ${report.effort.lessonsFinished}`);
  lines.push("");
  lines.push("Completion");
  lines.push(
    `  Tasks: ${report.completion.tasksDone} of ${report.completion.tasksPlanned} done · ${report.completion.minutesDone} of ${report.completion.minutesPlanned} min`,
  );
  lines.push("");
  lines.push("Evidence");
  lines.push(`  Chapters with question evidence: ${report.evidence.chaptersTouched}`);
  lines.push(
    `  Questions attempted: ${report.evidence.questionsAttempted} (${report.evidence.pyqAttempts} from past papers)`,
  );
  lines.push(
    `  Mean accuracy: ${report.evidence.accuracy === null ? "not enough data" : `${report.evidence.accuracy}%`}`,
  );
  lines.push("");
  lines.push("Chapters that need the next round");
  if (report.weakAreas.length === 0) {
    lines.push("  Nothing measured yet.");
  } else {
    for (const w of report.weakAreas) {
      lines.push(`  ${w.subject} — ${w.chapter}: ${pctLabel(w.accuracy, w.attempts)}`);
      lines.push(`      ${w.note}`);
    }
  }
  lines.push("");
  lines.push("Next step");
  lines.push(`  ${report.nextStep.label} — ${report.nextStep.reason}`);
  lines.push("");
  lines.push(
    "This report contains study counts and chapter names only. Notes, bookmarks and account details are never included.",
  );
  return lines.join("\n");
}

/** The shareable one-pager as Markdown, for a richer paste target. */
export function reportToMarkdown(report: ShareableReport): string {
  const lines: string[] = [];
  lines.push("# NTACBT — weekly study report");
  lines.push("");
  lines.push(
    `**Window:** ${report.window.from} → ${report.window.to} · **Exam target:** ${report.examTarget}`,
  );
  lines.push("");
  lines.push(`> ${report.headline}`);
  lines.push("");
  lines.push("## Attendance");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(
    `| Days studied | ${report.attendance.daysStudied} / ${report.attendance.daysInWindow} |`,
  );
  lines.push(`| Streak | ${report.attendance.streakDays} day(s) |`);
  lines.push(`| Focus time | ${report.effort.focusMinutes} min |`);
  lines.push(`| Lessons finished | ${report.effort.lessonsFinished} |`);
  lines.push("");
  lines.push("## Completion");
  lines.push(
    `- Tasks: **${report.completion.tasksDone} / ${report.completion.tasksPlanned}** done`,
  );
  lines.push(
    `- Minutes: **${report.completion.minutesDone} / ${report.completion.minutesPlanned}**`,
  );
  lines.push("");
  lines.push("## Evidence");
  lines.push(`- Chapters with question evidence: **${report.evidence.chaptersTouched}**`);
  lines.push(
    `- Questions attempted: **${report.evidence.questionsAttempted}** (${report.evidence.pyqAttempts} from past papers)`,
  );
  lines.push(
    `- Mean accuracy: **${report.evidence.accuracy === null ? "not enough data" : `${report.evidence.accuracy}%`}**`,
  );
  lines.push("");
  lines.push("## Chapters that need the next round");
  if (report.weakAreas.length === 0) {
    lines.push("_Nothing measured yet._");
  } else {
    lines.push("| Subject | Chapter | Accuracy | Why |");
    lines.push("| --- | --- | --- | --- |");
    for (const w of report.weakAreas) {
      lines.push(
        `| ${w.subject} | ${w.chapter} | ${pctLabel(w.accuracy, w.attempts)} | ${w.note} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Next step");
  lines.push(`**${report.nextStep.label}** — ${report.nextStep.reason}`);
  lines.push("");
  lines.push(
    "_This report contains study counts and chapter names only. Notes, bookmarks and account details are never included._",
  );
  return lines.join("\n");
}
