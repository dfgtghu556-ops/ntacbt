/**
 * TODAY'S DPP — adaptive daily practice (A4)
 *
 * The research doc asks for "practice sets auto-adjust difficulty to your level"
 * and "daily DPP sets ... generated from weak topics + weightage".
 *
 * **Why this module does not label questions easy/medium/hard.** The baked PYQ
 * bank carries `subject`, `chapter`, `topic`, `type`, `text`, `options`, `answer`
 * and `sol` — and no difficulty field. Inventing one would be exactly the
 * fabricated data the rebuild plan forbids, and a wrong label actively misleads:
 * a student shown "easy" on a question they keep failing learns to distrust the
 * whole app.
 *
 * **What "adaptive" means here instead.** The adaptation is in the *selection*,
 * not in a label. A chapter the student is demonstrably weak in contributes more
 * questions; the remaining slots go to the highest-weightage chapters. The set
 * explains itself — every question carries the reason it was chosen — so the
 * student can see the logic rather than being told a difficulty they cannot
 * verify.
 *
 * **Deterministic per day.** The set is seeded from the day key, so reloading
 * does not reshuffle it and a student can finish what they started. The seed
 * also means two students on the same day with the same evidence get the same
 * set, which makes the behaviour testable.
 */

import type { Subject } from "../academics/types";
import { isSubject } from "../academics/subject";

/** One question as it exists in the baked bank. */
export interface BankQuestion {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  type: "mcq" | "integer";
  text: string;
  options: Array<{ label: string; text: string }>;
  answer: string;
  /** The worked solution, when the bank ships one. */
  sol?: string | undefined;
}

/** Why a chapter is prioritised, and by how much. */
export interface WeakChapterInput {
  subject: string;
  chapter: string;
  /** Accuracy over a real sample, or null when the sample is too thin. */
  accuracy: number | null;
  attempts: number;
  /** Syllabus weightage, 0–100, when known. */
  weightage?: number | undefined;
}

export interface DppQuestion extends BankQuestion {
  /** The 1-based position in the set. */
  no: number;
  /** Why this question is in today's set. */
  reason: string;
  /** True when the chapter is one the student is demonstrably weak in. */
  fromWeakChapter: boolean;
}

export interface DailyPracticeSet {
  /** The day this set was built for. */
  dayKey: string;
  questions: DppQuestion[];
  /** Chapters the set draws from, with the reason each was chosen. */
  focus: Array<{ subject: string; chapter: string; reason: string }>;
  /** One honest line describing how the set was built. */
  note: string;
  /** True when the set is built on real attempt evidence. */
  evidenceBased: boolean;
}

/** A chapter with no sample is not "weak" — it is unmeasured. */
const WEAK_ACCURACY = 50;
/** Below this many attempts there is no accuracy to rank on. */
const MIN_SAMPLE = 3;

/**
 * A deterministic 32-bit hash, used to seed the day's shuffle.
 *
 * `Math.random` would reshuffle the set on every render, so a student who
 * reloads loses their place. A seeded shuffle is stable and testable.
 */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small deterministic PRNG (mulberry32) so the same seed always wins. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher–Yates. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

function norm(s: string): string {
  return (s || "").trim().toLowerCase();
}

/** True when two chapter names refer to the same chapter. */
function sameChapter(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export interface BuildDppInput {
  /** Every question available on the device. */
  bank: BankQuestion[];
  /** The student's weak chapters, from the readiness/mastery engines. */
  weak: WeakChapterInput[];
  /** The day key, e.g. "2026-09-29". Stable across reloads. */
  dayKey: string;
  /** How many questions the set should hold. */
  size?: number;
}

/**
 * Build today's practice set.
 *
 * Selection order:
 *  1. Chapters the student is demonstrably weak in (a real sample below 50%),
 *     weakest first, taking questions round-robin across subjects so a Physics
 *     student is not handed fifteen Physics questions.
 *  2. Chapters with a thin sample — not weak, just unmeasured — so the set
 *     gathers evidence rather than only reinforcing what is already known.
 *  3. The highest-weightage chapters, to fill the set.
 *
 * Every step is honest about what it knows. With no weak topics at all the set
 * is drawn from weightage and says so.
 */
export function buildDailyPracticeSet(input: BuildDppInput): DailyPracticeSet {
  const size = Math.max(1, input.size ?? 10);
  // `?? []` is not enough: a malformed payload could be a string or object, and
  // calling .filter on it would take down the whole practice page. Gate on
  // Array.isArray as well.
  const bank = (Array.isArray(input.bank) ? input.bank : []).filter(
    (q) => q && typeof q.text === "string" && q.text.trim() && isSubject(q.subject),
  );
  const rng = makeRng(hashString(input.dayKey));

  if (bank.length === 0) {
    return {
      dayKey: input.dayKey,
      questions: [],
      focus: [],
      note: "No questions are available on this device yet, so no practice set could be built.",
      evidenceBased: false,
    };
  }

  const weak = Array.isArray(input.weak) ? input.weak : [];
  const weakWithSample = weak
    .filter((w) => w.attempts >= MIN_SAMPLE && w.accuracy !== null && w.accuracy < WEAK_ACCURACY)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));
  const thinSample = weak.filter((w) => w.attempts > 0 && w.attempts < MIN_SAMPLE);
  const evidenceBased = weakWithSample.length > 0 || thinSample.length > 0;

  /** Questions for one weak/thin chapter, shuffled deterministically. */
  const poolFor = (subject: string, chapter: string): BankQuestion[] =>
    shuffle(
      bank.filter((q) => norm(q.subject) === norm(subject) && sameChapter(q.chapter, chapter)),
      rng,
    );

  const focus: DailyPracticeSet["focus"] = [];
  const picked: BankQuestion[] = [];
  const seen = new Set<string>();

  const take = (q: BankQuestion | undefined): boolean => {
    if (!q || picked.length >= size) return false;
    if (seen.has(q.id)) return false;
    seen.add(q.id);
    picked.push(q);
    return true;
  };

  // 1. Weak chapters, weakest first, round-robin across subjects.
  for (const w of weakWithSample) {
    const pool = poolFor(w.subject, w.chapter);
    if (pool.length === 0) continue;
    focus.push({
      subject: w.subject,
      chapter: w.chapter,
      reason: `${w.accuracy}% accuracy across ${w.attempts} attempt${
        w.attempts === 1 ? "" : "s"
      } — your weakest measured chapter.`,
    });
    for (const q of pool) {
      if (picked.length >= size) break;
      take(q);
    }
  }

  // 2. Thin samples: unmeasured, not weak. One question each is enough to find
  //    out, and it stops the set only ever reinforcing what is already known.
  for (const w of thinSample) {
    if (picked.length >= size) break;
    const pool = poolFor(w.subject, w.chapter);
    if (pool.length === 0) continue;
    focus.push({
      subject: w.subject,
      chapter: w.chapter,
      reason: `Only ${w.attempts} attempt${w.attempts === 1 ? "" : "s"} so far — one question is enough to find out where you stand.`,
    });
    take(pool[0]);
  }

  // 3. Fill from the highest-weightage chapters so the rest of the set still
  //    tracks what the exam actually asks.
  const weighted = [...weak]
    .filter((w) => typeof w.weightage === "number" && (w.weightage ?? 0) > 0)
    .sort((a, b) => (b.weightage ?? 0) - (a.weightage ?? 0));
  for (const w of weighted) {
    if (picked.length >= size) break;
    const pool = poolFor(w.subject, w.chapter);
    if (pool.length === 0) continue;
    if (!focus.some((f) => sameChapter(f.chapter, w.chapter) && f.subject === w.subject)) {
      focus.push({
        subject: w.subject,
        chapter: w.chapter,
        reason: `Carries about ${w.weightage}% of the paper's weightage.`,
      });
    }
    for (const q of pool) {
      if (picked.length >= size) break;
      take(q);
    }
  }

  // 4. Anything left over, spread across subjects so the set is balanced.
  if (picked.length < size) {
    const bySubject = new Map<string, BankQuestion[]>();
    for (const q of bank) {
      const list = bySubject.get(q.subject) ?? [];
      list.push(q);
      bySubject.set(q.subject, list);
    }
    const subjects = [...bySubject.keys()];
    let i = 0;
    while (picked.length < size && subjects.length > 0) {
      const subject = subjects[i % subjects.length];
      if (subject === undefined) break;
      const pool = shuffle(bySubject.get(subject) ?? [], rng);
      const next = pool.find((q) => !seen.has(q.id));
      if (!next) {
        // Every question in this subject is already in the set.
        subjects.splice(i % subjects.length, 1);
        if (subjects.length === 0) break;
        continue;
      }
      take(next);
      i += 1;
    }
  }

  const questions: DppQuestion[] = picked.map((q, idx) => {
    const focusEntry = focus.find(
      (f) => sameChapter(f.chapter, q.chapter) && f.subject === q.subject,
    );
    return {
      ...q,
      no: idx + 1,
      reason: focusEntry?.reason ?? "Included to balance today's set across subjects.",
      fromWeakChapter: weakWithSample.some(
        (w) => w.subject === q.subject && sameChapter(w.chapter, q.chapter),
      ),
    };
  });

  const note = evidenceBased
    ? `Built from your own attempt evidence: ${weakWithSample.length} weak chapter${
        weakWithSample.length === 1 ? "" : "s"
      } first, then the highest-weightage chapters. Difficulty is not labelled — the bank does not carry it, and a wrong label would be worse than none.`
    : `No attempt evidence yet, so this set is drawn from the highest-weightage chapters. Answer a few and it will start following your weak areas.`;

  return { dayKey: input.dayKey, questions, focus, note, evidenceBased };
}

/** A stable id for a DPP question, so a set can be resumed across reloads. */
export function dppQuestionId(dayKey: string, no: number): string {
  return `dpp-${dayKey}-${no}`;
}

/** Subjects covered by a set, in the order they first appear. */
export function dppSubjects(set: DailyPracticeSet): Subject[] {
  const out: Subject[] = [];
  for (const q of set.questions) {
    if (isSubject(q.subject) && !out.includes(q.subject)) out.push(q.subject);
  }
  return out;
}
