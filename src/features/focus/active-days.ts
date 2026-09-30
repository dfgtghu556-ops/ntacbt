/**
 * Active days — the single definition of "a day the student showed up".
 *
 * The streak, the survival score and the nudges all need the same set of days,
 * and they must agree. When this lived as a local function in the dashboard the
 * nudges would have had to reimplement it, and a second definition is how two
 * numbers that should match quietly stop matching.
 *
 * **The 25-minute bar is the same one `focusStreak` uses**, so a day counts here
 * exactly when it counts there.
 */

import type { DataStore } from "../../lib/store";
import { localDayKey } from "../../lib/store";
import type { FocusSession } from "./focus";

export function buildActiveDays(store: DataStore, focus: FocusSession[]): Set<string> {
  const days = new Set<string>();
  for (const s of focus) {
    if (s.completed && s.seconds >= 25 * 60) days.add(localDayKey(s.startedAt));
  }
  for (const t of store.planner?.tasks ?? []) {
    if (t.status === "done" && t.date) days.add(t.date);
  }
  return days;
}
