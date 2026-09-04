/**
 * Humane Streak + Streak-Freeze.
 *
 * A consistency streak that is RECOVERABLE, never punishing. Research
 * (Duolingo retention design) shows streaks are the strongest daily-return
 * lever BUT a streak that cannot be protected causes rage-quit. So this streak:
 *  - rewards real study (qualifying focus minutes or completed tasks per day),
 *  - grants a limited number of FREEZES (grace days) so a miss is recoverable,
 *  - uses ethical loss-framing ("your streak ends tonight") only when real
 *    progress is at stake, never shame,
 *  - always points to a tiny 5-minute win to stay alive.
 */

export const STREAK_KEY = "ntacbt.streak.v1";

export interface HumanStreakStore {
  /** Current best/frozen streak day count. */
  days: number;
  /** Last day the streak was active (YYYY-MM-DD). */
  lastActive: string | null;
  /** Freeze grants remaining (earned, not bought). */
  freezesLeft: number;
  /** Which days a freeze was used on, so we don't double-spend. */
  frozenDays: string[];
}

export interface HumaneStreak {
  days: number;
  frozen: boolean;
  freezesLeft: number;
  /** True if today has no activity yet but the day isn't lost. */
  atRiskToday: boolean;
  /** Hours remaining before the streak is at real risk if nothing is done. */
  hoursLeftToday: number;
  /** True when protected by an automatic grace (e.g. long streak safety). */
  autoProtected: boolean;
  /** Loss-framing nudge when a real streak is on the line (ethical). */
  nudge: string | null;
  /** Tiny 5-minute win suggestion to keep the habit alive. */
  microWin: string;
}

export function emptyStreakStore(): HumanStreakStore {
  return { days: 0, lastActive: null, freezesLeft: 3, frozenDays: [] };
}

export function loadStreakStore(): HumanStreakStore {
  if (typeof window === "undefined") return emptyStreakStore();
  try {
    const raw = JSON.parse(localStorage.getItem(STREAK_KEY) || "{}") as Partial<HumanStreakStore>;
    return {
      days: typeof raw.days === "number" && raw.days >= 0 ? raw.days : 0,
      lastActive: typeof raw.lastActive === "string" ? raw.lastActive : null,
      freezesLeft: typeof raw.freezesLeft === "number" ? Math.max(0, raw.freezesLeft) : 3,
      frozenDays: Array.isArray(raw.frozenDays) ? raw.frozenDays : [],
    };
  } catch {
    return emptyStreakStore();
  }
}

export function saveStreakStore(store: HumanStreakStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STREAK_KEY, JSON.stringify(store));
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / (24 * 3600 * 1000));
}

/**
 * Compute the humane streak from a set of days that had real study activity.
 * `freezeStore` is read/mutated only through `useStreak` semantics; here we
 * treat it as an opaque perspective so pure computation stays testable.
 */
export function computeHumaneStreak(
  activeDays: Set<string>,
  now: number,
  opts: { store?: HumanStreakStore } = {},
): HumaneStreak {
  const store = opts.store ?? emptyStreakStore();
  const today = dayKey(now);
  const yesterday = dayKey(now - 24 * 3600 * 1000);
  const todayActive = activeDays.has(today);
  const yesterdayActive = activeDays.has(yesterday);

  let days = store.days;
  let frozen = false;

  // Build the contiguous run backward from today (or yesterday if today not active).
  let cursor = todayActive ? today : yesterdayActive ? yesterday : null;
  let run = 0;
  if (cursor) {
    let c = cursor;
    while (activeDays.has(c)) {
      run += 1;
      c = dayKey(new Date(c + "T00:00:00").getTime() - 24 * 3600 * 1000);
    }
    days = Math.max(days, run);
  }

  // If yesterday is missing but today is active and we had a streak, it means
  // we skipped a day but recovered today — count as frozen (no loss) if we can.
  if (todayActive && !yesterdayActive && store.days > 0) {
    frozen = true;
  }

  // Danger: a real streak is at risk ONLY if today is not yet active and the
  // last active day was yesterday (i.e. missing today would LOSE it).
  const atRiskToday = !todayActive && yesterdayActive;
  const hoursLeftToday = atRiskToday
    ? Math.max(0, Math.round((24 - new Date(now).getHours()) * 10) / 10)
    : 0;

  const autoProtected = store.days >= 7 && atRiskToday;
  const canFreeze = store.freezesLeft > 0 && atRiskToday;

  const nudge = atRiskToday && (autoProtected || canFreeze)
    ? `${days} day streak: do the 5-minute micro-win before midnight and keep it. A freeze protects you once.`
    : null;

  const microWin =
    todayActive
      ? "Great — you've shown up today. Lock in one more recall."
      : "Do a 5-minute micro-win: one formula recall or 3 quick questions. That keeps the habit alive.";

  return {
    days,
    frozen,
    freezesLeft: store.freezesLeft,
    atRiskToday,
    hoursLeftToday,
    autoProtected,
    nudge,
    microWin,
  };
}
