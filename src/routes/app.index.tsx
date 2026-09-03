import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Flame,
  Play,
  Sparkles,
  Target,
  TrendingUp,
  TestTube2,
} from "lucide-react";
import { DataStore } from "@/lib/store";
import { computeReadiness } from "@/features/readiness/readiness";
import { loadFocusStore, todayFocusSeconds, focusStreak } from "@/features/focus/focus";
import type { ReadinessSnapshot } from "@/features/dashboard/types";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

const EMPTY_SNAPSHOT: ReadinessSnapshot = {
  examTarget: "jeemain",
  attempts: 0,
  totalQuestions: 0,
  accuracy: 0,
  marks: 0,
  maxMarks: 0,
  syllabusCompletionPct: 0,
  weakTopics: [],
  recentTrend: [],
  messages: { good: [], holdingBack: [], next: [] },
  nextMission: null,
  today: { plannedMinutes: 0, completedMinutes: 0, tasks: [], doneTasks: 0, totalTasks: 0 },
};

function targetLabel(target: string): string {
  const map: Record<string, string> = {
    jeemain: "JEE Main",
    jeeadv: "JEE Advanced",
    board12: "CBSE Class 12",
    board11: "CBSE Class 11",
    cbse27: "CBSE Class 12 (2026-27)",
  };
  return map[target] ?? "JEE Main";
}

function Dashboard() {
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<ReadinessSnapshot>(EMPTY_SNAPSHOT);
  const [streak, setStreak] = useState(0);
  const [focusMin, setFocusMin] = useState(0);

  useEffect(() => {
    const store = new DataStore();
    setSnapshot(computeReadiness(store));
    const f = loadFocusStore();
    setStreak(focusStreak(f.sessions, Date.now()));
    setFocusMin(Math.round(todayFocusSeconds(f.sessions, Date.now()) / 60));
    setReady(true);
  }, []);

  const today = snapshot.today;
  const planPct = today.plannedMinutes
    ? Math.round((today.completedMinutes / today.plannedMinutes) * 100)
    : 0;
  const hasData = snapshot.attempts > 0 || today.totalTasks > 0;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {targetLabel(snapshot.examTarget)} ·{" "}
          {ready === false ? "Reading your plan…" : "Your next move, based on evidence."}
        </p>
      </section>

      {ready ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border p-4">
              <ProgressRing value={planPct} />
              <div className="mt-2 text-center text-xs text-muted-foreground">
                Today's plan
                <span className="mt-0.5 block font-semibold">{planPct}%</span>
              </div>
            </div>
            <StatCard
              icon={Flame}
              label="Streak"
              value={`${streak}d`}
              sub="focused days (not screen time guilt)"
            />
            <StatCard
              icon={Clock}
              label="Focus today"
              value={`${focusMin}m`}
              sub="real tracked focus"
            />
            <StatCard
              icon={Target}
              label="Accuracy"
              value={`${snapshot.accuracy}%`}
              sub={`${snapshot.marks}/${snapshot.maxMarks} marks`}
            />
            <StatCard
              icon={TestTube2}
              label="Attempts"
              value={String(snapshot.attempts)}
              sub={`${snapshot.totalQuestions} questions attempted`}
            />
          </div>

          <section className="rounded-xl border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Quick actions
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <QuickAction
                href="/app/studytube"
                icon={Play}
                title="StudyTube"
                sub="Watch + practice"
              />
              <QuickAction href="/app/pyq" icon={TestTube2} title="PYQ papers" sub="Full length" />
              <QuickAction
                href="/cbt?name=Quick%20mixed%20diagnostic%20drill"
                icon={BarChart3}
                title="Practice"
                sub="Quick diagnostic CBT"
              />
              <QuickAction
                href="/app/planner"
                icon={BookOpen}
                title="Planner"
                sub="Adaptive plan"
              />
            </div>
          </section>

          {snapshot.nextMission ? (
            <section className="rounded-xl bg-primary p-5 text-primary-foreground">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-80">
                <Play className="h-3.5 w-3.5" /> Next mission
              </div>
              <h2 className="mt-2 text-xl font-semibold">{snapshot.nextMission.title}</h2>
              <p className="mt-1 text-sm opacity-90">
                {snapshot.nextMission.minutes} min · {snapshot.nextMission.kind}
              </p>
              {snapshot.nextMission.why ? (
                <p className="mt-3 rounded-lg bg-primary-foreground/10 px-3 py-2 text-sm">
                  <strong>Why:</strong> {snapshot.nextMission.why}
                </p>
              ) : null}
              {snapshot.nextMission.kind.toLowerCase().includes("test") ||
              snapshot.nextMission.kind.toLowerCase().includes("mock") ? (
                <Link
                  to="/cbt"
                  search={{
                    name: `${snapshot.nextMission.subject} ${snapshot.nextMission.chapter}`,
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary-foreground px-3 py-2 text-sm font-medium text-primary"
                >
                  <Play className="h-4 w-4" /> Start mission (test)
                </Link>
              ) : (
                <Link
                  to="/app/studytube"
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary-foreground px-3 py-2 text-sm font-medium text-primary"
                >
                  <Play className="h-4 w-4" /> Start mission
                </Link>
              )}
            </section>
          ) : (
            <EmptyCard />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Recent performance</h3>
              </div>
              {hasData ? (
                <div className="space-y-2">
                  {snapshot.recentTrend.map((p) => (
                    <div
                      key={p.at}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {new Date(p.at).toLocaleDateString()}
                      </span>
                      <span className="font-medium">
                        {p.marks} marks · {p.accuracy}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Submit a mock or PYQ paper and your trend will appear here.
                </p>
              )}
            </section>

            <section className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold">Weakest topic</h3>
              </div>
              {snapshot.weakTopics.length ? (
                <ul className="space-y-2">
                  {snapshot.weakTopics.slice(0, 3).map((w) => (
                    <li
                      key={`${w.subject}-${w.chapter}-${w.topic}`}
                      className="rounded-md border px-3 py-2 text-sm"
                    >
                      <div className="font-medium">
                        {w.subject} — {w.chapter}
                      </div>
                      <div className="text-xs text-muted-foreground">{w.reason}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No weak topics yet — do a short chapter drill to get evidence-based targeting.
                </p>
              )}
              <Link
                to="/app/studytube"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
              >
                Find targeted lectures <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </section>
          </div>

          <section className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <TestTube2 className="h-4 w-4 text-muted-foreground" /> NTA-style mock test
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start a full-length or diagnostic run. Marking follows NTA rules (+4/−1, numerical
                  carries no penalty) and the result feeds your Mistake Doctor and readiness model.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/cbt"
                  search={{ name: "Quick mixed diagnostic drill" }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  <Play className="h-4 w-4" /> Start diagnostic
                </Link>
                <Link
                  to="/app/pyq"
                  className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm"
                >
                  Full-length papers
                </Link>
              </div>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            {(snapshot.messages.good ?? []).map((m) => (
              <InsightCard
                key={m}
                icon={CheckCircle2}
                tone="green"
                title="What's going well"
                body={m}
              />
            ))}
            {(snapshot.messages.holdingBack ?? []).map((m) => (
              <InsightCard
                key={m}
                icon={AlertTriangle}
                tone="amber"
                title="Holding you back"
                body={m}
              />
            ))}
            {(snapshot.messages.next ?? []).map((m) => (
              <InsightCard key={m} icon={Sparkles} tone="blue" title="What to do next" body={m} />
            ))}
          </section>

          <section className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-muted-foreground" /> Syllabus completion
              </h3>
              <span className="text-xs text-muted-foreground">
                {snapshot.syllabusCompletionPct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${snapshot.syllabusCompletionPct}%` }}
              />
            </div>
          </section>
        </>
      ) : (
        <LoadingCards />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value || 0));
  const off = c - (pct / 100) * c;
  return (
    <div className="mx-auto h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" className="stroke-muted" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          className="text-primary transition-all duration-500"
        />
      </svg>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  sub,
}: {
  href: string;
  icon: typeof Play;
  title: string;
  sub: string;
}) {
  return (
    <a href={href} className="rounded-xl border p-3 transition-colors hover:bg-accent/60">
      <Icon className="h-4 w-4 text-primary" />
      <div className="mt-2 text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </a>
  );
}

function EmptyCard() {
  return (
    <section className="rounded-xl border border-dashed p-6 text-center">
      <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-3 font-semibold">No mission scheduled for today</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Run the planner, pick a topic, or start with a chapter drill. Every mission explains why it
        matters.
      </p>
      <Link
        to="/app/planner"
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
      >
        <ArrowRight className="h-4 w-4" /> Open planner
      </Link>
    </section>
  );
}

function InsightCard({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: typeof CheckCircle2;
  tone: "green" | "amber" | "blue";
  title: string;
  body: string;
}) {
  const toneCls =
    tone === "green" ? "text-green-600" : tone === "amber" ? "text-amber-500" : "text-blue-600";
  return (
    <div className="rounded-xl border p-4">
      <div className={`flex items-center gap-2 text-xs font-semibold ${toneCls}`}>
        <Icon className="h-4 w-4" /> {title}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/40" />
      ))}
    </div>
  );
}
