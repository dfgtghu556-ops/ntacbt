/**
 * Focus system storage + analytic helpers.
 * Timer blocks are evidence, not gamification: the store only records real
 * completed minutes and a daily target the student sets.
 */

export const FOCUS_KEY = "ntacbt.focus.v1";

export interface FocusSession {
  id: string;
  startedAt: number;
  seconds: number;
  completed: boolean;
  label: string;
  subject?: string | undefined;
  chapter?: string | undefined;
  taskId?: string | undefined;
}

export interface FocusStore {
  sessions: FocusSession[];
  dailyTargetSec: number;
}

export const DEFAULT_DAILY_TARGET_SEC = 90 * 60;

export function loadFocusStore(): FocusStore {
  if (typeof window === "undefined")
    return { sessions: [], dailyTargetSec: DEFAULT_DAILY_TARGET_SEC };
  try {
    const raw = JSON.parse(localStorage.getItem(FOCUS_KEY) || "{}") as Partial<FocusStore>;
    return {
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      dailyTargetSec:
        typeof raw.dailyTargetSec === "number" && raw.dailyTargetSec > 0
          ? raw.dailyTargetSec
          : DEFAULT_DAILY_TARGET_SEC,
    };
  } catch {
    return { sessions: [], dailyTargetSec: DEFAULT_DAILY_TARGET_SEC };
  }
}

export function saveFocusStore(store: FocusStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FOCUS_KEY, JSON.stringify(store));
}

export function localKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function todayFocusSeconds(sessions: FocusSession[], now: number): number {
  const key = localKey(now);
  return sessions
    .filter((s) => s.completed && localKey(s.startedAt) === key)
    .reduce((n, s) => n + s.seconds, 0);
}

export function focusStreak(sessions: FocusSession[], now: number, minSec = 25 * 60): number {
  const days = new Set(
    sessions.filter((s) => s.completed && s.seconds >= minSec).map((s) => localKey(s.startedAt)),
  );
  let streak = 0;
  const cursor = new Date(now);
  // If today has qualifying focus, count it; otherwise start from yesterday.
  if (!days.has(localKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(localKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function fmtFocus(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
