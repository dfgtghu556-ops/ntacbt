/**
 * MENTOR SPEECH SCRIPT (A8 — audio summary)
 *
 * Composes the spoken version of the mentor report from the SAME numbers the
 * page renders, so what a student hears matches what they read.
 *
 * **Why a script and not the AI context string.** `mentorContextForAI` is a
 * 2,400-character prompt payload built for a model. Read aloud it is a wall of
 * noise — semicolon-separated key/value pairs, no sentence structure. A spoken
 * summary needs sentences, and it needs to be short enough to finish.
 *
 * **What it says.** Readiness, what to do next, and the chapters that need work
 * — in that order, because that is the order the report itself uses. Nothing
 * else is spoken: a parent or student listening wants the conclusion and the
 * next action, not every metric on the page.
 *
 * **What it never does.** It never states a number the report cannot back. A
 * thin sample is spoken as "not enough data yet", never as 0%.
 */

import type { MentorReport } from "./report";
import { MIN_SAMPLE } from "../mastery/mastery";
import { speechText } from "../../lib/speech";

/** Pluralise without pulling in a dependency for one helper. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The accuracy phrase for one chapter, spoken honestly. */
function accuracyPhrase(accuracy: number | null, attempts: number): string {
  if (accuracy === null) {
    return attempts === 0 ? "not reached yet" : "not enough data yet";
  }
  return `${accuracy} percent accuracy across ${plural(attempts, "attempt", "attempts")}`;
}

/**
 * The spoken summary of a mentor report.
 *
 * Returns a plain, punctuation-light sentence sequence. `speechText` cleans and
 * caps it further, so this can be written for a reader rather than a synthesiser.
 */
export function mentorSpeechScript(report: MentorReport): string {
  const parts: string[] = [];

  parts.push(
    `Your readiness score is ${report.readinessScore} out of 100, which is ${report.readinessLevel}.`,
  );

  const attempts = report.performance.attempts;
  if (attempts === 0) {
    parts.push(
      "You have not attempted any questions yet, so there is no accuracy to report. One short diagnostic is what makes every other number here meaningful.",
    );
  } else {
    parts.push(
      `Across ${plural(attempts, "attempt", "attempts")} your accuracy is ${report.performance.accuracy} percent.`,
    );
  }

  // The single highest-priority action first, matching the page's order.
  const top = report.actions.find((a) => a.priority === "critical" || a.priority === "high");
  if (top) {
    parts.push(`Do this next: ${top.title}. ${top.detail}`);
  } else if (report.actions.length > 0) {
    const first = report.actions[0];
    if (first) parts.push(`Next step: ${first.title}.`);
  }

  // The chapters that need work, capped at three so the audio finishes.
  const weak = (report.preparation?.rows ?? []).filter(
    (row) => row.attempts > 0 && row.accuracy !== null && row.accuracy < 50,
  );
  if (weak.length > 0) {
    const named = weak
      .slice(0, 3)
      .map((row) => `${row.subject} ${row.chapter}`)
      .join(", ");
    parts.push(`Chapters that need the next round: ${named}.`);
  } else if (attempts > 0) {
    parts.push("No chapter is below half accuracy right now.");
  }

  return speechText(parts.join(" "), 700);
}

/** True when there is anything worth saying. */
export function hasSpeechContent(report: MentorReport): boolean {
  return mentorSpeechScript(report).length > 0;
}

export { MIN_SAMPLE };
