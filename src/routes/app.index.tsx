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
  LineChart,
  MonitorPlay,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  TestTube2,
  Wallet,
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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
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
  const mission = snapshot.nextMission;
  const missionIsTest =
    !!mission?.kind?.toLowerCase().includes("test") ||
    !!mission?.kind?.toLowerCase().includes("mock");

  return (
    <div className="space-y-6">
      {/* ─── Greeting / hero ─── */}
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-blue-50 via-background to-violet-50 p-6 sm:p-8">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> {targetLabel(snapshot.examTarget)} ·
              Evidence-based next steps
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              {greeting()}, future IITian ✨
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              {ready === false
                ? "Reading your plan…"
                : "Aaj ka ek clear goal, aur har card bata raha hai why — let's go."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/app/planner"
              className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background px-4 py-2 text-sm font-medium"
            >
              <BookOpen className="h-4 w-4" /> Plan
            </Link>
            <Link
              to="/app/focus"
              className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background px-4 py-2 text-sm font-medium"
            >
              <Clock className="h-4 w-4" /> Focus
            </Link>
          </div>
        </div>

        {mission ? (
          <div className="relative z-10 mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-primary p-5 text-primary-foreground">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                Next mission
              </div>
              <h2 className="mt-1 text-xl font-semibold">{mission.title}</h2>
              <p className="mt-1 text-sm opacity-90">
                {mission.minutes} min · {mission.kind}
                {mission.subject || mission.chapter
                  ? ` · ${mission.subject || ""} ${mission.chapter || ""}`.trim()
                  : ""}
              </p>
              {mission.why ? (
                <p className="mt-3 text-sm opacity-90">
                  <strong className="font-semibold">Why:</strong> {mission.why}
                </p>
              ) : null}
            </div>
            {missionIsTest ? (
              <Link
                to="/cbt"
                search={{
                  name: mission.subject
                    ? `${mission.subject} ${mission.chapter}`.trim()
                    : "Quick mixed diagnostic drill",
                }}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-foreground px-5 py-3 text-sm font-semibold text-primary"
              >
                <Play className="h-4 w-4" /> Start mission (test)
              </Link>
            ) : (
              <Link
                to="/app/studytube"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-foreground px-5 py-3 text-sm font-semibold text-primary"
              >
                <Play className="h-4 w-4" /> Start mission
              </Link>
            )}
          </div>
        ) : (
          <div className="relative z-10 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed bg-background/70 p-5">
            <div>
              <h2 className="font-semibold">No mission scheduled yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Run the planner ya start a quick diagnostic — every mission explains why it matters.
              </p>
            </div>
            <Link
              to="/app/planner"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              <ArrowRight className="h-4 w-4" /> Open planner
            </Link>
          </div>
        )}
      </section>

      {/* ─── Key stats ─── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressCard title="Today's plan" value={planPct} />
        <StatCard
          icon={Flame}
          label="Streak"
          value={`${streak}d`}
          sub="Focused days"
          accent="text-orange-500"
          bg="bg-orange-500/10"
        />
        <StatCard
          icon={Clock}
          label="Focus today"
          value={`${focusMin}m`}
          sub="Tracked focus"
          accent="text-blue-600"
          bg="bg-blue-600/10"
        />
        <StatCard
          icon={Target}
          label="Accuracy"
          value={`${snapshot.accuracy}%`}
          sub={`${snapshot.marks}/${snapshot.maxMarks} marks`}
          accent="text-violet-600"
          bg="bg-violet-600/10"
        />
      </div>

      {/* ─── Quick actions ─── */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Quick actions
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickAction
            href="/app/studytube"
            icon={MonitorPlay}
            title="StudyTube"
            sub="Watch + practice"
            accent="from-red-500/10 to-red-500/5"
          />
          <QuickAction
            href="/app/pyq"
            icon={TestTube2}
            title="PYQ papers"
            sub="Full-length papers"
            accent="from-blue-500/10 to-blue-500/5"
          />
          <QuickAction
            href="/cbt?name=Quick mixed diagnostic drill"
            icon={BarChart3}
            title="Practice test"
            sub="NTA-style CBT"
            accent="from-emerald-500/10 to-emerald-500/5"
          />
          <QuickAction
            href="/app/planner"
            icon={BookOpen}
            title="Planner"
            sub="Adaptive plan"
            accent="from-violet-500/10 to-violet-500/5"
          />
        </div>
      </section>

      {/* ─── Focus row ─── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Recent performance" icon={<TrendingUp className="h-4 w-4 text-blue-600" />}>
          {hasData ? (
            <div className="space-y-2">
              {snapshot.recentTrend.slice(0, 5).map((p) => (
                <div
                  key={p.at}
                  className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    {new Date(p.at).toLocaleDateString()}
                  </span>
                  <span className="font-semibold">
                    {p.marks} marks · <span className="text-foreground">{p.accuracy}%</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel text="Submit a mock or PYQ paper and your trend will appear here." />
          )}
        </Panel>

        <Panel title="Weakest topic" icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}>
          {snapshot.weakTopics.length ? (
            <ul className="space-y-2">
              {snapshot.weakTopics.slice(0, 3).map((w) => (
                <li
                  key={`${w.subject}-${w.chapter}-${w.topic}`}
                  className="rounded-xl border bg-muted/20 px-3 py-2 text-sm"
                >
                  <div className="font-semibold">
                    {w.subject} — {w.chapter}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{w.reason}</div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyPanel text="No weak topics yet — do a short drill to get evidence-based targeting." />
          )}
          <Link
            to="/app/studytube"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            Find targeted lectures <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Panel>

        <Panel title="Study plan" icon={<LineChart className="h-4 w-4 text-violet-600" />}>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Syllabus completion</span>
            <span className="font-semibold text-foreground">{snapshot.syllabusCompletionPct}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-blue-600"
              style={{ width: `${snapshot.syllabusCompletionPct}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {today.totalTasks > 0
              ? `${today.doneTasks}/${today.totalTasks} tasks done today · ${today.completedMinutes}/${today.plannedMinutes} min`
              : "Planner se aaj ke tasks set karo, phir progress yahan dikhega."}
          </p>
          <Link
            to="/app/planner"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            Open planner <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Panel>
      </div>

      {/* ─── Insights ─── */}
      <section className="grid gap-3 md:grid-cols-3">
        {(snapshot.messages.good ?? []).slice(0, 1).map((m) => (
          <InsightCard
            key={m}
            icon={CheckCircle2}
            tone="green"
            title="What's going well"
            body={m}
          />
        ))}
        {(snapshot.messages.holdingBack ?? []).slice(0, 1).map((m) => (
          <InsightCard
            key={m}
            icon={AlertTriangle}
            tone="amber"
            title="Holding you back"
            body={m}
          />
        ))}
        {(snapshot.messages.next ?? []).slice(0, 1).map((m) => (
          <InsightCard key={m} icon={Sparkles} tone="blue" title="What to do next" body={m} />
        ))}
      </section>

      {/* ─── Mock test CTA ─── */}
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border bg-gradient-to-br from-primary/5 to-blue-500/5 p-5">
        <div className="flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-primary" /> NTA-style mock test
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Full-length ya diagnostic run. Marking NTA rules (+4/−1, numerical no penalty) follow
            karta hai aur result aapke Mistake Doctor + readiness model me feed hota hai.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/cbt"
            search={{ name: "Quick mixed diagnostic drill" }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Play className="h-4 w-4" /> Start diagnostic
          </Link>
          <Link
            to="/app/pyq"
            className="inline-flex items-center gap-1.5 rounded-xl border border-input px-4 py-2 text-sm"
          >
            Full-length papers
          </Link>
        </div>
      </section>
    </div>
  );
}

function ProgressCard({ title, value }: { title: string; value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value || 0));
  const off = c - (pct / 100) * c;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-bold">{pct}%</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {pct >= 80
              ? "Almost there 🎯"
              : pct >= 50
                ? "Solid momentum 🚀"
                : "Small start counts 💪"}
          </div>
        </div>
        <div className="relative h-16 w-16">
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
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  bg,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub: string;
  accent: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${bg} ${accent}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  sub,
  accent,
}: {
  href: string;
  icon: typeof Play;
  title: string;
  sub: string;
  accent: string;
}) {
  return (
    <a
      href={href}
      className={`group rounded-2xl border bg-gradient-to-br ${accent} p-4 transition-all hover:-translate-y-0.5 hover:shadow-md`}
    >
      <Icon className="h-5 w-5 text-primary" />
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
      <ArrowRight className="mt-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
    </a>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
      </div>
      {children}
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
    <div className="rounded-2xl border bg-card p-4">
      <div className={`flex items-center gap-2 text-xs font-semibold ${toneCls}`}>
        <Icon className="h-4 w-4" /> {title}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function LoadingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl border bg-muted/40" />
      ))}
    </div>
  );
}
