/**
 * useNudges — the React binding for the ethical nudge system.
 *
 * Reads the student's real evidence and returns what is worth saying now. It
 * never asks for notification permission on its own: a permission prompt that
 * appears before the student has done anything is the single fastest way to
 * lose it, and browsers increasingly penalise it.
 *
 * **In-app first.** The nudges render in a panel whether or not notification
 * permission is granted, because the message is useful on its own. The browser
 * notification is an optional extra the student turns on.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataStore } from "../../lib/store";
import { loadStudyTubeProgress } from "../../features/studytube/progress";
import { masteryFromStores } from "../../features/mastery/collect";
import { computeHumaneStreak, loadStreakStore } from "../../features/focus/streak";
import { loadDeck } from "../../features/memory/srs";
import { buildTodayPlan } from "../../features/planner/today";
import {
  DEFAULT_QUIET_HOURS,
  dueNudges,
  notificationReadiness,
  type Nudge,
  type QuietHours,
} from "./schedule";
import { loadFocusStore } from "../../features/focus/focus";
import { buildActiveDays } from "../../features/focus/active-days";

const QUIET_KEY = "ntacbt.notify.quietHours";

/** The student's chosen quiet window, or the default. */
export function loadQuietHours(): QuietHours {
  if (typeof localStorage === "undefined") return DEFAULT_QUIET_HOURS;
  try {
    const raw = localStorage.getItem(QUIET_KEY);
    if (!raw) return DEFAULT_QUIET_HOURS;
    const parsed = JSON.parse(raw) as Partial<QuietHours>;
    const startHour = Number(parsed?.startHour);
    const endHour = Number(parsed?.endHour);
    if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return DEFAULT_QUIET_HOURS;
    return { startHour, endHour };
  } catch {
    return DEFAULT_QUIET_HOURS;
  }
}

/** Persist the quiet window. A storage failure is swallowed — it is a preference. */
export function saveQuietHours(quiet: QuietHours): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(QUIET_KEY, JSON.stringify(quiet));
  } catch {
    /* ignore */
  }
}

/** The current permission, or "unsupported" when the API is absent. */
function currentPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export interface NudgeState {
  nudges: Nudge[];
  quiet: QuietHours;
  /** True when a browser notification can actually be shown. */
  canNotify: boolean;
  /** Why not, when it cannot. */
  blockedReason: string | null;
  permission: NotificationPermission | "unsupported";
  setQuiet: (quiet: QuietHours) => void;
  /** Ask for permission. Only ever called from a user gesture. */
  requestPermission: () => Promise<void>;
  /** Fire the browser notification for one nudge. */
  send: (nudge: Nudge) => void;
}

export function useNudges(): NudgeState {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [quiet, setQuietState] = useState<QuietHours>(DEFAULT_QUIET_HOURS);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    currentPermission(),
  );

  /**
   * The single definition of "recompute the nudges". Both the interval and the
   * quiet-hours editor call this, and they must not drift — two slightly
   * different recomputations is how a student ends up seeing a nudge in the
   * panel that the browser would never have delivered.
   */
  const recompute = useCallback((q: QuietHours) => {
    const now = new Date();
    try {
      const store = new DataStore();
      const humane = computeHumaneStreak(
        buildActiveDays(store, loadFocusStore().sessions),
        now.getTime(),
        {
          store: loadStreakStore(),
        },
      );
      const plan = buildTodayPlan({
        tasks: store.planner?.tasks ?? [],
        mastery: masteryFromStores(store, loadStudyTubeProgress(), now.getTime()),
        now: now.getTime(),
      });
      setNudges(
        dueNudges({
          now,
          quiet: q,
          dueReviews: loadDeck().cards.filter((c) => c.due <= now.getTime()).length,
          humane: {
            days: humane.days,
            atRiskToday: humane.atRiskToday,
            microWin: humane.microWin,
          },
          primaryAction: plan.primary?.label ?? null,
          weakChapters: plan.weakAreas.length,
        }),
      );
    } catch {
      // A malformed store must never break the header.
      setNudges([]);
    }
  }, []);

  // Recompute on an interval, so a nudge that becomes true during a long session
  // appears without a reload. Once a minute is enough — nothing here is urgent
  // to the minute.
  useEffect(() => {
    const q = loadQuietHours();
    setQuietState(q);
    recompute(q);
    const id = window.setInterval(() => recompute(loadQuietHours()), 60_000);
    return () => window.clearInterval(id);
  }, [recompute]);

  const setQuiet = useCallback(
    (next: QuietHours) => {
      saveQuietHours(next);
      setQuietState(next);
      // Re-evaluate immediately so a student who widens their window sees the
      // effect at once rather than up to a minute later.
      recompute(next);
    },
    [recompute],
  );

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      /* ignore */
    }
  }, []);

  const send = useCallback((nudge: Nudge) => {
    const readiness = notificationReadiness(currentPermission());
    if (!readiness.canNotify) return;
    try {
      new Notification(nudge.title, { body: nudge.body, tag: nudge.kind });
    } catch {
      /* ignore */
    }
  }, []);

  const readiness = useMemo(() => notificationReadiness(permission), [permission]);

  return {
    nudges,
    quiet,
    canNotify: readiness.canNotify,
    blockedReason: readiness.reason,
    permission,
    setQuiet,
    requestPermission,
    send,
  };
}
