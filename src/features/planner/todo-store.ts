/**
 * To-do completion overlay (F1).
 *
 * The student checks off **goals**, not "sat for X hours" — so this app needs
 * somewhere to record a check-off. It cannot be the stored planner: that blob
 * is written by `public/js/app.js`, this app only reads it, and a wizard or a
 * checkbox that rewrote another product's data would be worse than no checkbox.
 *
 * So this is an overlay on its own versioned key, following the same isolation
 * pattern as `features/memory/srs.ts` and `features/studytube/progress.ts`.
 * The overlay is *additive*: a task the student ticks here does not become
 * "done" in the legacy plan, it becomes done here, and the two are never
 * confused because this module is the only writer of this key.
 *
 * A ticked goal is never lost by clearing storage silently — `clearDone` is
 * explicit and the count is surfaced in the UI, so a student can see what
 * they have checked off and undo it.
 */

const DONE_KEY = "ntacbt.todo.done.v1";

/** Ids the student has ticked off in this app. Never the legacy `done` overlay. */
export function loadDoneIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DONE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

export function saveDoneIds(ids: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...ids]));
  } catch {
    /* a preference; a storage failure must not lose the student's work visibly */
  }
}

/** Toggle one goal. Returns the new set so a caller can update without a re-read. */
export function toggleDoneId(id: string, current?: Set<string>): Set<string> {
  const next = new Set(current ?? loadDoneIds());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  saveDoneIds(next);
  return next;
}

/**
 * Forget every tick. Explicit and surfaced in the UI rather than a hidden
 * reset — a student who clears this should know what they cleared.
 */
export function clearDone(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(DONE_KEY);
  } catch {
    /* ignore */
  }
}
