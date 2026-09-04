import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Coffee,
  Flame,
  HeartPulse,
  LineChart,
  MonitorPlay,
  Play,
  Repeat,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { DataStore, localDayKey } from "@/lib/store";
import { computeReadiness } from "@/features/readiness/readiness";
import { computeSurvival, computeDualLane } from "@/features/readiness/survival";
import { computeWellness } from "@/features/readiness/wellness";
import { predictRank } from "@/features/readiness/predict";
import { useLang, t } from "@/lib/lang";
import { buildMicroDrill } from "@/features/cbt/microDrill";
import { mistakeFromStore } from "@/features/cbt/mistake";
import { loadFocusStore, todayFocusSeconds, focusStreak, type FocusSession } from "@/features/focus/focus";
import { computeHumaneStreak, loadStreakStore } from "@/features/focus/streak";
import type {
  MicroDrillCard,
  ReadinessSnapshot,
  SurvivalScore,
  DualLaneReadiness,
  RankPrediction,
} from "@/features/dashboard/types";

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

const LAST_VISIT_KEY = "ntacbt.lastVisit";

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

function greeting(): { text: string; sub: string } {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", sub: "Kal ki tarah aaj bhi ek clear goal — let's go." };
  if (h < 17) return { text: "Good afternoon", sub: "Aaj ka ek mission, aur har card bata raha hai why." };
  return { text: "Good evening", sub: "Ek chhota sa step bhi progress hai — let's finish strong." };
}

/** Days since the student last opened the Learning OS (for reactivation). */
function daysSinceLastVisit(): number {
  if (typeof window === "undefined") return 0;
  try {
    const last = Number(localStorage.getItem(LAST_VISIT_KEY) || "0");
    localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
    if (!last) return 0;
    return Math.floor((Date.now() - last) / (24 * 3600 * 1000));
  } catch {
    return 0;
  }
}

function buildActiveDays(store: DataStore, focus: FocusSession[]): Set<string> {
  const days = new Set<string>();
  for (const s of focus) {
    if (s.completed && s.seconds >= 25 * 60) days.add(localDayKey(s.startedAt));
  }
  for (const t of store.planner?.tasks ?? []) {
    if (t.status === "done" && t.date) days.add(t.date);
  }
  return days;
}

function Dashboard() {
  const [ready, setReady] = useState(false);
  const lang = useLang();
  const [snapshot, setSnapshot] = useState<ReadinessSnapshot>(EMPTY_SNAPSHOT);
  const [survival, setSurvival] = useState<SurvivalScore | null>(null);
  const [dual, setDual] = useState<DualLaneReadiness | null>(null);
  const [prediction, setPrediction] = useState<RankPrediction | null>(null);
  const [microDrill, setMicroDrill] = useState<MicroDrillCard[]>([]);
  const [streak, setStreak] = useState(0);
  const [humane, setHumane] = useState(computeHumaneStreak(new Set(), Date.now()));
  const [focusMin, setFocusMin] = useState(0);
  const [absentDays, setAbsentDays] = useState(0);

  useEffect(() => {
    const store = new DataStore();
    setSnapshot(computeReadiness(store));
    const f = loadFocusStore();
    const activeDays = buildActiveDays(store, f.sessions);
    const now = Date.now();
    setStreak(focusStreak(f.sessions, now));
    setFocusMin(Math.round(todayFocusSeconds(f.sessions, now) / 60));

    const streakStore = loadStreakStore();
    setHumane(computeHumaneStreak(activeDays, now, { store: streakStore }));

    const surv = computeSurvival(store, {
      streakDays: focusStreak(f.sessions, now),
      focusMinutesToday: Math.round(todayFocusSeconds(f.sessions, now) / 60),
      streakFrozen: false,
    });
    setSurvival(surv);
    setDual(computeDualLane(store, computeReadiness(store)));
    const mistake = mistakeFromStore(store);
    const weak = computeReadiness(store).weakTopics;
    setMicroDrill(buildMicroDrill({ weak, mistake }));
    const rs = computeReadiness(store);
    setPrediction(
      predictRank({
        marks: rs.marks,
        maxMarks: rs.maxMarks,
        target: rs.examTarget,
        accuracy: rs.accuracy,
        weakTopics: rs.weakTopics,
      }),
    );
    setAbsentDays(daysSinceLastVisit());
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

  // F6 — "your progress, not your loss" reactivation when returning after a gap.
  const showReactivation =
    absentDays >= 2 && (snapshot.attempts > 0 || humane.days > 0);

  // The survival score drives the whole hero: ring + status + next action.
  const survivalScore = survival?.score ?? 0;
  const survivalStatus = survival?.status ?? "watch";

  return (
    <div className="space-y-6">
      {/* ─── Greeting / hero ─── */}
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-blue-50 via-background to-violet-50 p-6 sm:p-8">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> {targetLabel(snapshot.examTarget)} · Guaranteed System
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              {greeting().text}, future IITian
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              {ready === false ? "Reading your plan…" : greeting().sub}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/app/report"
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium"
            >
              <BrainCircuit className="h-4 w-4" /> Mentor Report
            </Link>
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

        {showReactivation ? (
          <div className="relative z-10 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            <div className="flex-1">
              <span className="font-semibold text-green-800">Your progress isn't gone.</span>{" "}
              <span className="text-green-700">
                You last studied {absentDays} days ago — {snapshot.attempts} test
                {snapshot.attempts === 1 ? "" : "s"} and a {humane.days}-day streak are safe. Pick up
                where you left off; no guilt.
              </span>
            </div>
          </div>
        ) : null}

        {/* F2 + F10: The Mission card — one big card with survival score + next action */}
        <SurvivalMission
          score={survivalScore}
          status={survivalStatus}
          headline={survival?.headline ?? ""}
          nextAction={survival?.nextAction ?? ""}
          basis={survival?.basis ?? ""}
          components={survival?.components ?? []}
          mission={mission}
          missionIsTest={missionIsTest}
          lang={lang}
        />

        {/* Guarantee Card — honest positioning, backed by real features */}
        <div className="relative z-10 mt-4 flex flex-wrap items-start gap-3 rounded-2xl border border-primary/15 bg-background/80 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BadgeCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Our guarantee is the system, not a score</div>
            <p className="mt-1 text-xs text-muted-foreground">
              No platform can honestly promise a 100% outcome. We guarantee something better and true:
              <strong> you will never study blind and never get stuck.</strong> Every day you get (1)
              exactly the one thing to do next, (2) proof of why, (3) an automatic guilt-free fix when
              you fall behind, (4) a humane streak that never punishes you, and (5) active recall, not
              passive watching.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Key stats ─── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressCard title="Today's plan" value={planPct} />
        <StreakCard humane={humane} streak={streak} />
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

      {/* ─── F7: JEE + Board dual-lane readiness ─── */}
      {dual ? <DualLane dual={dual} /> : null}

      {/* ─── A3: Rank / College predictor "Mock → Reality" ─── */}
      {prediction && prediction.maxMarks > 0 ? <RankPredictor prediction={prediction} /> : null}

      {/* ─── Quick actions (incl. F8 5-min micro-win) ─── */}
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
            icon={BarChart3}
            title="PYQ papers"
            sub="Full-length papers"
            accent="from-blue-500/10 to-blue-500/5"
          />
          <QuickAction
            href="/app/planner"
            icon={BookOpen}
            title="Planner"
            sub="Adaptive plan"
            accent="from-violet-500/10 to-violet-500/5"
          />
          <QuickAction
            href="#micro-win"
            icon={Zap}
            title="5-min micro win"
            sub={humane.microWin}
            accent="from-orange-500/10 to-orange-500/5"
          />
        </div>
      </section>

      {/* ─── F4: Mistake-DNA micro-drill ─── */}
      {microDrill.length ? (
        <section id="micro-win" className="scroll-mt-20">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Repeat className="h-4 w-4 text-primary" /> Mistake-DNA micro-drill
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              Active recall — say the answer, then flip to check.
            </span>
          </div>
          <MicroDrillPanel cards={microDrill} />
        </section>
      ) : null}

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

      {/* ─── F9: Wellness / balance ─── */}
      <WellnessStrip focusMin={focusMin} plannedMin={today.plannedMinutes} />

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

      {/* ─── F10: Trust — how we compute this ─── */}
      <Panel title="Why you can trust these numbers" icon={<ShieldCheck className="h-4 w-4 text-primary" />}>
        <p className="text-sm text-muted-foreground">
          The #1 complaint students have about big test-prep apps is a dashboard that shows wrong
          data. Here every number is computed from your real plan, real watch-minutes, real attempts
          and real focus minutes — nothing is guessed, nothing is a promo.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <TrustLine label="Plan completion" how="Completed tasks / total planned tasks." />
          <TrustLine label="Accuracy" how="Correct / (correct + wrong) across submitted tests." />
          <TrustLine label="Survival score" how="Weighted blend of plan, accuracy, weak topics, mistakes and consistency." />
          <TrustLine label="Streak" how="Consecutive days of ≥25 min real focus or a completed task." />
        </div>
      </Panel>

      {/* ─── Mock test CTA ─── */}
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border bg-gradient-to-br from-primary/5 to-blue-500/5 p-5">
        <div className="flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Rocket className="h-4 w-4 text-primary" /> NTA-style mock test
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

/* ────────────────────────────────────────────────────────────────────────── */
/* Mission / Survival card                                                    */
/* ────────────────────────────────────────────────────────────────────────── */
function SurvivalScoreRing({ score, status }: { score: number; status: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score || 0));
  const off = c - (pct / 100) * c;
  const color =
    status === "on-track" ? "#16a34a" : status === "watch" ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" className="stroke-muted" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {score}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          on track
        </span>
      </div>
    </div>
  );
}

function SurvivalMission({
  score,
  status,
  headline,
  nextAction,
  basis,
  components,
  mission,
  missionIsTest,
  lang,
}: {
  score: number;
  status: string;
  headline: string;
  nextAction: string;
  basis: string;
  components: SurvivalScore["components"];
  mission: ReadinessSnapshot["nextMission"];
  missionIsTest: boolean;
  lang: string;
}) {
  return (
    <div className="relative z-10 mt-6 grid gap-4 rounded-2xl border bg-primary p-5 text-primary-foreground lg:grid-cols-[auto_1fr]">
      <div className="flex items-center justify-center lg:items-start">
        <div className="rounded-2xl bg-primary-foreground/95 p-3">
          <SurvivalScoreRing score={score} status={status} />
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
          {t("onTrack", lang as "hinglish")}
        </div>
        <h2 className="mt-1 text-xl font-semibold">{headline}</h2>

        {/* The single executable next action */}
        <div className="mt-3 rounded-xl bg-primary-foreground/10 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
            {t("doThisNext", lang as "hinglish")}
          </div>
          <p className="mt-1 text-sm font-medium">{nextAction}</p>
        </div>

        {mission ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-primary-foreground/10 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                {t("nextMission", lang as "hinglish")}
              </div>
              <div className="text-sm font-semibold">{mission.title}</div>
              <div className="text-xs opacity-90">
                {mission.minutes} min · {mission.kind}
                {mission.subject || mission.chapter ? ` · ${mission.subject || ""} ${mission.chapter || ""}`.trim() : ""}
              </div>
            </div>
            {missionIsTest ? (
              <Link
                to="/cbt"
                search={{ name: `${mission.subject || ""} ${mission.chapter || ""}`.trim() || "Quick mixed diagnostic drill" }}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary"
              >
                <Play className="h-4 w-4" /> Start mission
              </Link>
            ) : (
              <Link
                to="/app/studytube"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary"
              >
                <Play className="h-4 w-4" /> Start mission
              </Link>
            )}
          </div>
        ) : null}

        {/* Survscore components — explainable, honest */}
        <div className="mt-3 grid gap-1.5">
          {components.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-xs">
              <span className="w-32 shrink-0 opacity-90">{c.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-foreground/15">
                <div
                  className="h-full rounded-full bg-primary-foreground/80"
                  style={{ width: `${c.rating}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-semibold">{c.rating}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] opacity-70">{basis}</p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Dual-lane readiness (F7)                                                   */
/* ────────────────────────────────────────────────────────────────────────── */
function DualLane({ dual }: { dual: DualLaneReadiness }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Rocket className="h-4 w-4 text-primary" /> Two lanes, one balanced plan
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LaneCard
          icon={<Rocket className="h-4 w-4 text-blue-600" />}
          title="JEE readiness"
          score={dual.jee.score}
          label={dual.jee.label}
          message={dual.jee.message}
          accent="from-blue-500/10 to-blue-500/5"
        />
        <LaneCard
          icon={<BookOpen className="h-4 w-4 text-emerald-600" />}
          title="Board readiness"
          score={dual.board.score}
          label={dual.board.label}
          message={dual.board.message}
          accent="from-emerald-500/10 to-emerald-500/5"
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{dual.split}</p>
    </section>
  );
}

function RankPredictor({ prediction }: { prediction: RankPrediction }) {
  const p = prediction;
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <BarChart3 className="h-4 w-4 text-primary" /> Mock to reality — where this score lands
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-4">
          <div className="text-xs font-medium text-muted-foreground">Percentile</div>
          <div className="mt-1 text-3xl font-bold">{p.percentile}%</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {p.marks}/{p.maxMarks} marks
          </div>
        </div>
        <div className="rounded-2xl border bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4">
          <div className="text-xs font-medium text-muted-foreground">Expected rank (AIR)</div>
          <div className="mt-1 text-3xl font-bold">
            ~{p.rank.toLocaleString("en-IN")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">JEE Main, ~14 lakh candidates</div>
        </div>
        <div className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 md:col-span-2">
          <div className="text-xs font-medium text-muted-foreground">Where you land</div>
          <div className="mt-1 text-sm font-semibold">{p.tier}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Honest expectation
          </div>
          <p className="mt-1 text-sm">{p.expectation}</p>
        </div>
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            The one thing to fix
          </div>
          <p className="mt-1 text-sm">{p.topFix}</p>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">{p.basis}</p>
    </section>
  );
}

function LaneCard({
  icon,
  title,
  score,
  label,
  message,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  score: number;
  label: string;
  message: string;
  accent: string;
}) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${accent} p-4`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {icon} {title}
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="text-3xl font-bold">{score}</div>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-blue-600"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Humane streak card (F5)                                                    */
/* ────────────────────────────────────────────────────────────────────────── */
function StreakCard({ humane, streak }: { humane: ReturnType<typeof computeHumaneStreak>; streak: number }) {
  const flameColor = humane.days > 0 ? "text-orange-500" : "text-muted-foreground";
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Consistency</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 ${flameColor}`}>
          <Flame className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold">{humane.days}d</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {humane.atRiskToday
          ? `Streak is at risk today — ${humane.microWin}`
          : humane.frozen
            ? "Streak protected (freeze) — no loss"
            : humane.nudge
              ? humane.nudge
              : `${humane.freezesLeft} freeze${humane.freezesLeft === 1 ? "" : "s"} available`}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Micro-drill panel (F4)                                                     */
/* ────────────────────────────────────────────────────────────────────────── */
function MicroDrillPanel({ cards }: { cards: MicroDrillCard[] }) {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const first = cards[0] as MicroDrillCard | undefined;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => {
        const isFlipped = !!flipped[c.id];
        return (
          <button
            key={c.id}
            onClick={() => setFlipped((m) => ({ ...m, [c.id]: !isFlipped }))}
            className={`group relative min-h-[11rem] overflow-hidden rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
              isFlipped ? "border-primary/40 bg-primary/5" : ""
            }`}
            aria-label={isFlipped ? "Show question" : "Show answer"}
          >
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{c.subject}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{c.tagLabel}</span>
            </div>
            <div className="mt-3 text-xs font-medium text-muted-foreground">
              {isFlipped ? "Self-check" : "Recall"}
              <span className="ml-1 text-[10px] text-muted-foreground/70">— tap to flip</span>
            </div>
            {isFlipped ? (
              <p className="mt-2 text-sm font-medium">{c.answer}</p>
            ) : (
              <p className="mt-2 text-sm">{c.prompt}</p>
            )}
          </button>
        );
      })}

      {first ? (
        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-dashed p-4 text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Why this drill
          </div>
          <p className="text-sm text-muted-foreground">
            Built from your{" "}
            <span className="font-medium text-foreground">{first.tagLabel.toLowerCase()}</span>{" "}
            strongest mistake pattern on {first.subject}. Retrieving beats re-watching — say the
            answer, then check.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Wellness strip (F9)                                                        */
/* ────────────────────────────────────────────────────────────────────────── */
function WellnessStrip({ focusMin, plannedMin }: { focusMin: number; plannedMin: number }) {
  const signals = useMemo(() => computeWellness(focusMin, plannedMin), [focusMin, plannedMin]);
  const tones = {
    green: "text-green-600 border-green-200 bg-green-50",
    amber: "text-amber-600 border-amber-200 bg-amber-50",
    blue: "text-blue-600 border-blue-200 bg-blue-50",
  } as const;
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <HeartPulse className="h-4 w-4 text-primary" /> Balance, not burnout
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {signals.map((s) => (
          <div key={s.id} className={`rounded-2xl border p-4 ${tones[s.tone]}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Coffee className="h-4 w-4" /> {s.title}
            </div>
            <p className="mt-2 text-xs opacity-90">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Shared UI                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */
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
              ? "Almost there"
              : pct >= 50
                ? "Solid momentum"
                : "Small start counts"}
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

function TrustLine({ label, how }: { label: string; how: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3 text-sm">
      <div className="font-semibold">{label}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{how}</div>
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
