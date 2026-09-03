import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Target,
  Timer as TimerIcon,
} from "lucide-react";
import { DataStore } from "@/lib/store";
import {
  DEFAULT_DAILY_TARGET_SEC,
  fmtFocus,
  focusStreak,
  loadFocusStore,
  localKey,
  saveFocusStore,
  todayFocusSeconds,
  type FocusSession,
} from "@/features/focus/focus";

export const Route = createFileRoute("/app/focus")({
  component: Focus,
});

function fmtMin(sec: number): string {
  return `${Math.round(sec / 60)}m`;
}

function Focus() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState("");
  const [history, setHistory] = useState<FocusSession[]>([]);
  const [dailyTarget, setDailyTarget] = useState(DEFAULT_DAILY_TARGET_SEC);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const store = loadFocusStore();
    setHistory(store.sessions);
    setDailyTarget(store.dailyTargetSec);
    return () => {
      if (interval.current) clearInterval(interval.current);
    };
  }, []);

  useEffect(() => {
    if (running) {
      interval.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (interval.current) {
      clearInterval(interval.current);
      interval.current = null;
    }
    return () => {
      if (interval.current) clearInterval(interval.current);
    };
  }, [running]);

  const store = new DataStore();
  const mission = store.todayTasks()[0];

  function bumpTarget(delta: number) {
    const next = Math.max(15 * 60, Math.min(240 * 60, dailyTarget + delta));
    setDailyTarget(next);
    const s = loadFocusStore();
    s.dailyTargetSec = next;
    saveFocusStore(s);
  }

  function complete() {
    const session: FocusSession = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      startedAt: Date.now(),
      seconds,
      completed: true,
      label: (label.trim() || mission?.chapter || "Focus session").slice(0, 120),
      subject: mission?.subject,
      chapter: mission?.chapter,
      taskId: mission?.id,
    };
    const s = loadFocusStore();
    s.sessions.push(session);
    if (s.sessions.length > 60) s.sessions = s.sessions.slice(-60);
    saveFocusStore(s);
    setHistory(s.sessions);
    setSeconds(0);
    setRunning(false);
    setLabel("");
  }

  const todayDone = todayFocusSeconds(history, Date.now());
  const streak = focusStreak(history, Date.now());
  const pct = Math.min(100, Math.round((todayDone / dailyTarget) * 100));
  const todayKey = localKey(Date.now());

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Focus</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Distraction-free mission mode. The timer is evidence — not gamification.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-xs font-medium text-muted-foreground">Focus today</p>
          <p className="mt-1 text-2xl font-semibold">{fmtMin(todayDone)}</p>
          <p className="text-xs text-muted-foreground">target {fmtMin(dailyTarget)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs font-medium text-muted-foreground">Streak</p>
          <p className="mt-1 text-2xl font-semibold">
            {streak} day{streak === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-muted-foreground">≥ 25 min of real focus</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs font-medium text-muted-foreground">Daily target</p>
          <div className="mt-1 flex items-center gap-1">
            <button
              onClick={() => bumpTarget(-15 * 60)}
              className="rounded-md border border-input p-1.5"
              aria-label="Decrease target"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <Target className="mx-auto h-5 w-5 text-primary" />
            <button
              onClick={() => bumpTarget(15 * 60)}
              className="rounded-md border border-input p-1.5"
              aria-label="Increase target"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{todayKey}</span>
          <span>
            {pct}% of {fmtMin(dailyTarget)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {mission ? (
        <div className="rounded-xl border p-4">
          <p className="text-xs font-medium text-muted-foreground">Current mission</p>
          <p className="mt-1 font-semibold">
            {mission.subject} — {mission.chapter}
          </p>
          <p className="text-xs text-muted-foreground">
            {mission.kind} · {Number(mission["minutes"]) || Number(mission.estMin) || 45} min
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No mission scheduled. Pick a topic in the planner, then come back to lock in.
        </div>
      )}

      <div className="rounded-xl border p-6 text-center">
        <TimerIcon className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="mt-3 text-5xl font-semibold tabular-nums tracking-tight">
          {fmtFocus(seconds)}
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={
            mission?.chapter ? `Focusing on ${mission.chapter}` : "What are you working on?"
          }
          className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:mx-auto sm:max-w-sm"
        />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => setRunning((r) => !r)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Pause" : "Start focus"}
          </button>
          {seconds > 0 ? (
            <>
              <button
                onClick={complete}
                className="inline-flex items-center gap-1.5 rounded-md border border-input px-4 py-2 text-sm font-medium"
              >
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Complete
              </button>
              <button
                onClick={() => {
                  setSeconds(0);
                  setRunning(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-input px-4 py-2 text-sm font-medium"
              >
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
            </>
          ) : null}
        </div>
      </div>

      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Recent sessions</h2>
        {history.length ? (
          <ul className="mt-3 space-y-2">
            {history
              .slice()
              .reverse()
              .slice(0, 8)
              .map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span className="truncate">
                    {s.label}
                    {s.chapter ? (
                      <span className="ml-2 text-xs text-muted-foreground">· {s.chapter}</span>
                    ) : null}
                  </span>
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                    {fmtFocus(s.seconds)} · {new Date(s.startedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No focus blocks yet.</p>
        )}
      </section>
    </div>
  );
}
