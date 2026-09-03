/**
 * Adaptive planner (non-destructive).
 *
 * The legacy planner is read-only through `DataStore`. This module derives a
 * *display ranking* and an explainable reason for every task — it never edits
 * the stored planner. Weak-topic evidence comes from the readiness engine.
 */

import type { PlannerTaskRow } from "../../lib/store";
import type { WeakTopic } from "../dashboard/types";

export interface AdaptedTask extends PlannerTaskRow {
  rank: number;
  reason: string;
  isWeakTarget: boolean;
}

export interface AdaptationPlan {
  tasks: AdaptedTask[];
  summary: string;
  weakUsed: WeakTopic[];
  generatedAt: number;
}

function norm(s: string | undefined): string {
  return (s || "").trim().toLowerCase();
}

function matchesWeak(row: PlannerTaskRow, weak: WeakTopic[]): WeakTopic | null {
  const subj = norm(row.subject);
  const chap = norm(row.chapter);
  const topic = norm(row.topic);
  for (const w of weak) {
    if (!w) continue;
    const ws = norm(w.subject);
    const wc = norm(w.chapter);
    const wt = norm(w.topic || "");
    if (ws && subj && subj === ws && wc && chap && chap === wc) return w;
    if (ws && subj && subj === ws && wt && topic && topic === wt) return w;
  }
  return null;
}

function reasonFor(r: PlannerTaskRow, weak: WeakTopic | null): string {
  if (weak) {
    return `Weak target: ${weak.accuracy}% accuracy across ${weak.attemptCount} attempt${
      weak.attemptCount === 1 ? "" : "s"
    } — evidence says ${weak.chapter} needs the next rep.`;
  }
  if (r.status === "done") return "Already completed — keep it out of the way.";
  const base = r.why || `Part of your ${r.subject || ""} plan.`;
  return base;
}

export function adaptTasks(rows: PlannerTaskRow[], weak: WeakTopic[], now: number): AdaptationPlan {
  const usedWeak: WeakTopic[] = [];
  const mapped: Array<{ row: PlannerTaskRow; weak: WeakTopic | null; rank: number }> = rows.map(
    (row) => {
      const m = matchesWeak(row, weak);
      if (m && !usedWeak.some((u) => u.subject === m.subject && u.chapter === m.chapter)) {
        usedWeak.push(m);
      }
      return { row, weak: m, rank: 0 };
    },
  );

  mapped.sort((a, b) => {
    const aw = a.weak ? 1 : 0;
    const bw = b.weak ? 1 : 0;
    if (aw !== bw) return bw - aw;
    const ad = a.row.status === "done" ? 1 : 0;
    const bd = b.row.status === "done" ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return (a.row.estMin || 45) - (b.row.estMin || 45);
  });

  const tasks: AdaptedTask[] = mapped.map((m, i) => ({
    ...m.row,
    rank: i + 1,
    reason: reasonFor(m.row, m.weak),
    isWeakTarget: Boolean(m.weak),
  }));

  const weakTargets = tasks.filter((t) => t.isWeakTarget).length;
  const pending = tasks.filter((t) => t.status !== "done").length;
  const summary = weakTargets
    ? `${weakTargets} task${weakTargets > 1 ? "s" : ""} moved to the top because they match ${
        usedWeak.length
      } identified weak topic${usedWeak.length > 1 ? "s" : ""}.`
    : pending
      ? "No task matches a current weak topic, so pending work is shown in the order you planned it."
      : "Pending work is done — this is a good moment for a short mock or mistake review.";

  return { tasks, summary, weakUsed: usedWeak, generatedAt: now };
}
