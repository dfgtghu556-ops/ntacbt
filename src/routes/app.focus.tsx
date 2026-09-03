import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Pause, Play, RotateCcw, Timer as TimerIcon } from "lucide-react";
import { DataStore } from "@/lib/store";

export const Route = createFileRoute("/app/focus")({
  component: Focus,
});

const FOCUS_KEY = "ntacbt.focus.v1";

interface FocusSession {
  id: string;
  startedAt: number;
  seconds: number;
  completed: boolean;
  label: string;
}

interface FocusStore {
  sessions: FocusSession[];
}

function loadFocusStore(): FocusStore {
  if (typeof window === "undefined") return { sessions: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(FOCUS_KEY) || "{}") as FocusStore;
    return { sessions: Array.isArray(raw.sessions) ? raw.sessions : [] };
  } catch {
    return { sessions: [] };
  }
}

function saveFocusStore(store: FocusStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FOCUS_KEY, JSON.stringify(store));
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Focus() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState("");
  const [history, setHistory] = useState<FocusSession[]>([]);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setHistory(loadFocusStore().sessions);
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

  function complete() {
    const session: FocusSession = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      startedAt: Date.now(),
      seconds,
      completed: true,
      label: label.trim() || "Focus session",
    };
    const store = loadFocusStore();
    store.sessions.push(session);
    // Keep only the last 40 sessions to bound storage.
    if (store.sessions.length > 40) store.sessions = store.sessions.slice(-40);
    saveFocusStore(store);
    setHistory(store.sessions);
    setSeconds(0);
    setRunning(false);
    setLabel("");
  }

  const store = new DataStore();
  const mission = store.todayTasks()[0];

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Focus</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Distraction-free mission mode. The timer is evidence — not gamification.
        </p>
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
          {fmt(seconds)}
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What are you working on?"
          className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-sm sm:mx-auto"
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
                  <span className="truncate">{s.label}</span>
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                    {fmt(s.seconds)} · {new Date(s.startedAt).toLocaleDateString()}
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
