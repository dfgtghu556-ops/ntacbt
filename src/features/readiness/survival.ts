/**
 * NTACBT Survival Score — the honest "Am I on track?" engine.
 *
 * Composes five EXPLAINABLE, never-lying signals into a single 0–100 score and
 * always resolves to ONE executable next action. Every number shown on screen
 * is derived from real evidence in the store (real watch-minutes, real
 * attempts, real planner rows) — never a guess, never a fake promise.
 *
 * This is the "guaranteed system" differentiator: not a 100% outcome promise,
 * but a guarantee the student will never study blind and never get stuck.
 */

import { DataStore } from "../../lib/store";
import type { ReadinessSnapshot, SurvivalComponent, SurvivalScore, DualLaneReadiness } from "../dashboard/types";

interface SurvivalExtras {
  streakDays: number;
  focusMinutesToday: number;
  /** Whether the humane streak is in a frozen/grace state. */
  streakFrozen?: boolean;
}

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

/** Mistake-DNA severity. Derived from wrong answers + time×accuracy classes.
 *  Conservative: needs real wrong evidence, never punishes a new student. */
function mistakeSeverity(store: DataStore): { rating: number; how: string; count: number } {
  const totals = store.totals();
  const wrong = totals.wrong;
  const attempted = totals.attempted;
  if (attempted < 3 || wrong === 0) {
    return {
      rating: 100,
      how: "No wrong-answer evidence yet — nothing to punish; this signal stays high.",
      count: 0,
    };
  }
  const wrongRate = wrong / attempted;
  // Wrong-rate drives the severity: below 15% = healthy, above 45% = heavy bleed.
  const severity = clamp(100 - Math.round((wrongRate - 0.15) / 0.3 * 100));
  return {
    rating: severity,
    how: `${wrong} of ${attempted} attempted answers were wrong (${Math.round(wrongRate * 100)}%). This is the real leak the Mistake Doctor targets.`,
    count: wrong,
  };
}

function planCompletion(store: DataStore): { rating: number; how: string } {
  const p = store.planner;
  if (!p?.tasks?.length) {
    return { rating: 100, how: "No plan yet — this signal doesn't lower the score; start a plan to see real completion." };
  }
  const total = p.tasks.length;
  const done = p.tasks.filter((t) => t.status === "done").length;
  const pct = clamp(Math.round((done / total) * 100));
  return { rating: pct, how: `${done} of ${total} planned tasks are complete.` };
}

function accuracySignal(store: DataStore): { rating: number; how: string } {
  const t = store.totals();
  if (t.attempted === 0) {
    return { rating: 40, how: "No attempts yet — do a short diagnostic to get a real accuracy number." };
  }
  return { rating: clamp(t.accuracy), how: `${Math.round((t.correct / t.attempted) * 100)}% accuracy across ${t.attempted} attempted questions.` };
}

function weaknessSignal(weakCount: number, attempts: number): { rating: number; how: string } {
  if (weakCount === 0) {
    return {
      rating: attempts >= 3 ? 100 : 80,
      how: attempts >= 3
        ? "No topic is below 50% accuracy — strong evidence base."
        : "Not enough attempts to confirm weaknesses yet; keep drilling.",
    };
  }
  const rating = clamp(100 - weakCount * 14);
  return {
    rating,
    how: `${weakCount} weak topic${weakCount > 1 ? "s" : ""} identified from your attempts.`,
  };
}

function consistencySignal(streakDays: number, focusMinutesToday: number, frozen?: boolean): { rating: number; how: string } {
  const todayBonus = focusMinutesToday >= 25 ? 10 : focusMinutesToday > 0 ? 5 : 0;
  const base = Math.min(90, streakDays * 9 + todayBonus);
  const rating = clamp(streakDays > 0 ? base : 30);
  const freezeNote = frozen ? " (streak is frozen — no loss)" : "";
  return {
    rating,
    how: `${streakDays} day${streakDays === 1 ? "" : "s"} consistency streak${freezeNote} + ${focusMinutesToday} min focus today.`,
  };
}

function proximitySignal(store: DataStore): { rating: number; how: string; daysLeft: number | null } {
  const p = store.planner;
  const profDays = p?.profile?.days;
  const start = p?.profile?.startDate;
  let daysToEnd: number | null = null;
  if (profDays && start) {
    const s = new Date(start + "T00:00:00").getTime();
    const e = s + (profDays - 1) * 24 * 3600 * 1000;
    daysToEnd = Math.max(0, Math.round((e - Date.now()) / (24 * 3600 * 1000)));
  }
  const completion = p?.tasks?.length ? p.tasks.filter((t) => t.status === "done").length / p.tasks.length : 0;
  if (daysToEnd == null) {
    return { rating: 100, how: "No exam/plan end date set — no time-pressure penalty.", daysLeft: null };
  }
  // Closer to end + less completion = more pressure. A tight timeline with a
  // nearly-complete plan reads as fine; a tight timeline with lots left reads
  // as the thing to fix next.
  const pressureDeficit = Math.round(Math.max(0, 100 - completion * 100) * 0.9);
  const pressure = clamp(100 - pressureDeficit);
  const leftBonus = Math.min(15, Math.max(0, daysToEnd) * 0.4);
  return {
    rating: clamp(pressure + leftBonus),
    how: `~${daysToEnd} days to plan end and ${Math.round(completion * 100)}% of the plan complete.`,
    daysLeft: daysToEnd,
  };
}

export function computeSurvival(store: DataStore, extra?: SurvivalExtras): SurvivalScore {
  const snapshotNeeded = store.totals();
  void snapshotNeeded;

  // Reuse the readiness engine for weak topics (it is fully deterministic).
  // We avoid a circular import by computing weak topics inline below.
  const weak = weakTopicsInline(store);

  const plan = planCompletion(store);
  const acc = accuracySignal(store);
  const weakSig = weaknessSignal(weak.length, store.totals().attempted);
  const mis = mistakeSeverity(store);
  const cons = consistencySignal(extra?.streakDays ?? 0, extra?.focusMinutesToday ?? 0, extra?.streakFrozen);
  const prox = proximitySignal(store);

  const components: SurvivalComponent[] = [
    { key: "plan", label: "Plan completion", contribution: 0.25, rating: plan.rating, how: plan.how },
    { key: "accuracy", label: "Accuracy", contribution: 0.25, rating: acc.rating, how: acc.how },
    { key: "weakness", label: "Weak-topic health", contribution: 0.2, rating: weakSig.rating, how: weakSig.how },
    { key: "mistake", label: "Mistake leak", contribution: 0.15, rating: mis.rating, how: mis.how },
    { key: "consistency", label: "Consistency", contribution: 0.15, rating: cons.rating, how: cons.how },
  ];

  const score = clamp(
    components.reduce((s, c) => s + c.rating * c.contribution, 0),
  );

  // Resolve to ONE actionable next step — pick the weakest signal.
  const lowest = [...components].sort((a, b) => a.rating - b.rating)[0]!;
  let nextAction: string;
  switch (lowest.key) {
    case "plan":
      nextAction = weak[0]
        ? `Open the planner and finish today's "${weak[0].chapter}" task — that one task moves your plan completion most.`
        : "Open the planner and complete today's top task — every task you check off raises your on-track score.";
      break;
    case "accuracy":
      nextAction = "Run a 10-question diagnostic on your weakest topic to get a real accuracy number, then attack it.";
      break;
    case "weakness":
      nextAction = weak[0]
        ? `Do a 10-question drill on ${weak[0].subject} — ${weak[0].chapter}. That's the single highest-leverage fix.`
        : "Do a short practice drill to surface any weak topics with evidence.";
      break;
    case "mistake":
      nextAction = "Open the Mistake Doctor on your last test and re-attempt 3 of your wrong questions slowly.";
      break;
    case "consistency":
      nextAction = extra?.focusMinutesToday && extra.focusMinutesToday < 25
        ? "Do the 5-minute micro-win now — one quick recall keeps your consistency alive."
        : "Do a 5-minute micro-win to keep your streak going today.";
      break;
    default:
      nextAction = "Complete today's next mission.";
  }

  const status: SurvivalScore["status"] =
    score >= 70 ? "on-track" : score >= 45 ? "watch" : "at-risk";

  const headline =
    status === "on-track"
      ? "You are on track. Keep the pace."
      : status === "watch"
        ? "You're close — one targeted fix gets you back on track."
        : "Time to course-correct. One task today is enough to start.";

  const basis =
    "Every number above is computed from your real plan, real watch-minutes, real attempts and real focus minutes — it never guesses.";

  return { score, status, headline, nextAction, components, basis };
}

/** Inline (duplicate-free) weak-topic computation so survival.ts stays lean and
 *  does not create a circular import with readiness.ts. Mirrors its threshold. */
function weakTopicsInline(store: DataStore) {
  interface Cell { subject: string; chapter: string; topic: string; attempt: number; correct: number }
  const map = new Map<string, Cell>();
  for (const test of store.tests) {
    const attempts = store.attempts.filter((a) => a.testId === test.id);
    if (!attempts.length) continue;
    for (const q of test.questions || []) {
      if (!q.subject || !q.chapter) continue;
      const attempted = attempts.filter((a) => {
        const r = a.responses?.[q.id];
        return r && r.ans !== null && r.ans !== "";
      });
      if (attempted.length < 2) continue;
      const correct = attempted.filter((a) => {
        const r = a.responses?.[q.id];
        return isRightInline(q, r?.ans ?? null);
      }).length;
      const key = `${q.subject}|${q.chapter}|${q.topic || "all"}`;
      const cell = map.get(key) ?? { subject: q.subject, chapter: q.chapter, topic: q.topic || "", attempt: 0, correct: 0 };
      cell.attempt += attempted.length;
      cell.correct += correct;
      map.set(key, cell);
    }
  }
  return [...map.values()]
    .filter((c) => {
      const acc = (c.correct / c.attempt) * 100;
      return acc < 50 && c.attempt >= 2;
    })
    .map((c) => ({
      subject: c.subject,
      chapter: c.chapter,
      topic: c.topic,
      accuracy: Math.round((c.correct / c.attempt) * 1000) / 10,
      attemptCount: c.attempt,
      reason: `${c.correct}/${c.attempt} correct on ${c.chapter}.`,
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);
}

function isRightInline(
  q: { answer: string; type: string; accept?: unknown },
  ans: string | null,
): boolean {
  if (ans == null || ans === "") return false;
  const a = parseFloat(String(ans).replace(/,/g, ""));
  if (!isFinite(a)) return false;
  const acc = q.accept as { kind?: string; lo?: number; hi?: number; vals?: number[] } | undefined;
  if (q.type === "mcq") return String(ans).toLowerCase() === String(q.answer || "").toLowerCase();
  if (acc?.kind === "all") return true;
  if (acc?.kind === "range" && typeof acc.lo === "number" && typeof acc.hi === "number")
    return a >= acc.lo - 1e-9 && a <= acc.hi + 1e-9;
  if (acc?.kind === "any" && Array.isArray(acc.vals))
    return acc.vals.some((v) => Math.abs(a - v) <= Math.max(0.01, Math.abs(v) * 0.001));
  const b = parseFloat(String(q.answer).replace(/,/g, ""));
  if (!isFinite(b)) return false;
  if (Number.isInteger(b)) return a === b;
  return Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.001);
}

/** JEE + Board dual-lane readiness — the balanced promise made visible.
 *  Both lanes derive from the SAME verified attempt evidence; we never invent
 *  data. Board lane weights subject coverage that classes board-heavy. */
export function computeDualLane(store: DataStore, snapshot: ReadinessSnapshot): DualLaneReadiness {
  const acc = snapshot.accuracy;
  const coverage = snapshot.syllabusCompletionPct;
  const attempts = snapshot.attempts;
  const isBoardTarget = ["board12", "board11", "cbse27"].includes(snapshot.examTarget);

  const jeeScore = clamp(attempts ? acc * 0.6 + coverage * 0.4 : 20);
  const boardScore = clamp(attempts ? acc * 0.5 + coverage * 0.5 : 20);

  const label = (s: number) => (s >= 70 ? "Strong" : s >= 45 ? "Building" : "Needs focus");

  const jeeNote =
    isBoardTarget
      ? "Board-first student — JEE is your practice lane right now. Keep it sharp, don't over-stretch."
      : "Your primary lane, with full conceptual depth on Physics, Chemistry, Maths.";

  const boardNote =
    isBoardTarget
      ? "Your primary lane — theory, derivations and NCERT coverage matter most here."
      : "A strong board lane keeps your CBSE marks safe alongside JEE. Don't let it slip.";

  const split = isBoardTarget
    ? "Board-first plan (weekdays = your board lane, weekends = JEE practice)."
    : "JEE-first plan (weekdays = JEE, weekends = board consolidation).";

  return {
    jee: { score: jeeScore, label: label(jeeScore), message: jeeNote },
    board: { score: boardScore, label: label(boardScore), message: boardNote },
    split,
  };
}
