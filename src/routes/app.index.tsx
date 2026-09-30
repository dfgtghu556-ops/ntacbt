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
  Info,
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
import { useLang } from "@/lib/lang";
import { buildMicroDrill } from "@/features/cbt/microDrill";
import { mistakeFromStore } from "@/features/cbt/mistake";
import { adaptTasks } from "@/features/planner/adapt";
import { achievements, type AchievementSummary } from "@/features/focus/achievements";
import { saveCbtTest } from "@/features/cbt/store";
import type { CbtTest } from "@/features/cbt/types";
import { buildTodayPlan, type TodayPlan } from "@/features/planner/today";
import {
  MIN_DPP_SIZE,
  buildDailyPracticeSet,
  DPP_SEC_PER_QUESTION,
  dppToCbtTest,
  type DailyPracticeSet,
} from "@/features/practice/dpp";
import { loadQuestionBank } from "@/features/pyq/store";
import { masteryFromStores } from "@/features/mastery/collect";
import { loadStudyTubeProgress } from "@/features/studytube/progress";
import {
  loadFocusStore,
  todayFocusSeconds,
  focusStreak,
  type FocusSession,
} from "@/features/focus/focus";
import { computeHumaneStreak, loadStreakStore } from "@/features/focus/streak";
import { buildActiveDays } from "@/features/focus/active-days";
import type {
  MicroDrillCard,
  ReadinessSnapshot,
  SurvivalScore,
  DualLaneReadiness,
  RankPrediction,
} from "@/features/dashboard/types";
import {
  SurvivalScoreRing,
  SurvivalMission,
  DualLane,
  RankPredictor,
  LaneCard,
  StreakCard,
  MicroDrillPanel,
  WellnessStrip,
  ProgressCard,
  StatCard,
  QuickAction,
  Panel,
  InsightCard,
  TrustLine,
  EmptyPanel,
  LoadingCards,
  AwardsCard,
  DppCard,
  TodayStrip,
} from "@/features/dashboard/components";
import { socialMeta } from "@/config/site";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "NTACBT — JEE Main & CBSE Practice, Planner and Analytics" },
      {
        name: "description",
        content:
          "One place for JEE Main and CBSE practice: previous-year papers, an adaptive planner, spaced repetition, focus sessions and honest progress analytics.",
      },

      // Open Graph + Twitter + canonical. Without this every route inherits
      // the root card, so sharing this page previews the root title.
      ...socialMeta(
        "NTACBT — JEE Main & CBSE Practice Dashboard",
        "One place for JEE Main and CBSE practice: previous-year papers, an adaptive planner, spaced repetition, focus sessions and honest progress analytics.",
        "/app",
      ),
    ],
  }),
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
  if (h < 12)
    return {
      text: "Good morning",
      sub: "One clear goal today, same as yesterday — let's get it.",
    };
  if (h < 17)
    return {
      text: "Good afternoon",
      sub: "One mission today, and every card tells you why.",
    };
  return {
    text: "Good evening",
    sub: "Even a small step counts — let's finish strong.",
  };
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
  const [todayPlan, setTodayPlan] = useState<TodayPlan | null>(null);
  const [dpp, setDpp] = useState<DailyPracticeSet | null>(null);
  const [awards, setAwards] = useState<AchievementSummary | null>(null);

  useEffect(() => {
    const store = new DataStore();
    setSnapshot(computeReadiness(store));
    const f = loadFocusStore();
    const activeDays = buildActiveDays(store, f.sessions);
    const now = Date.now();
    setStreak(focusStreak(f.sessions, now));
    setFocusMin(Math.round(todayFocusSeconds(f.sessions, now) / 60));

    const streakStore = loadStreakStore();
    // Capture the computed streak locally. Reading the `humane` STATE here would
    // give the initial value, because the setState above has not applied yet —
    // and the awards would be built on an empty streak.
    const humaneNow = computeHumaneStreak(activeDays, now, { store: streakStore });
    setHumane(humaneNow);

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
        // Reliability needs the sample size, not just the average.
        attempts: rs.attempts,
      }),
    );
    setAbsentDays(daysSinceLastVisit());

    // A9 — XP, level and badges. Derived from the same evidence the rest of the
    // dashboard shows, so the two can never disagree.
    try {
      const mastery = masteryFromStores(store, loadStudyTubeProgress(), Date.now());
      const mastered = [...mastery.values()].filter((m) => m.state === "Mastered").length;
      setAwards(
        achievements({
          focusSessions: f.sessions,
          questionsAttempted: computeReadiness(store).attempts,
          lessonsFinished: [...mastery.values()].reduce((n, m) => n + m.lessonsFinished, 0),
          masteredChapters: mastered,
          humane: humaneNow,
          survival: surv,
          personalBestDays: loadStreakStore().days,
        }),
      );
    } catch {
      setAwards(null);
    }

    // Today's DPP: the same weak chapters the Today strip shows, turned into a
    // runnable set from the baked question bank. Built in the effect because it
    // fetches the bank, and a failure here must never blank the dashboard.
    void (async () => {
      try {
        const bank = await loadQuestionBank();
        if (!bank.length) return;
        const weak = computeReadiness(store).weakTopics.map((w) => ({
          subject: w.subject,
          chapter: w.chapter,
          accuracy: w.accuracy,
          attempts: w.attemptCount,
        }));
        setDpp(buildDailyPracticeSet({ bank, weak, dayKey: localDayKey(Date.now()), size: 10 }));
      } catch {
        setDpp(null);
      }
    })();

    // Today's strip is built from the student's own stores: their stored plan,
    // their mastery evidence, and the adaptive planner's weak-target flags. It
    // reads only — nothing here edits the plan.
    try {
      const mastery = masteryFromStores(store, loadStudyTubeProgress(), Date.now());
      const adapted = adaptTasks(
        store.planner?.tasks ?? [],
        computeReadiness(store).weakTopics,
        Date.now(),
      );
      const weakKeys = new Set(
        adapted.tasks
          .filter((t) => t.isWeakTarget)
          .map((t) => `${t.subject}::${t.chapter || t.topic}`),
      );
      setTodayPlan(
        buildTodayPlan({
          tasks: store.planner?.tasks ?? [],
          mastery,
          weakTargets: weakKeys,
          now: Date.now(),
        }),
      );
    } catch {
      // A malformed store must never blank the dashboard. The strip is an
      // enhancement, so it degrades to hidden rather than to an error page.
      setTodayPlan(null);
    }
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
  const showReactivation = absentDays >= 2 && (snapshot.attempts > 0 || humane.days > 0);

  // The survival score drives the whole hero: ring + status + next action.
  const survivalScore = survival?.score ?? 0;
  const survivalStatus = survival?.status ?? "watch";

  return (
    <div className="space-y-6">
      {/* ─── Greeting / hero ─── */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-blue-50 via-background to-violet-50 p-6 sm:p-8 dark:from-blue-950/40 dark:via-background dark:to-violet-950/40">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> {targetLabel(snapshot.examTarget)} ·
              Guaranteed System
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
          <div className="relative z-10 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950/40">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            <div className="flex-1">
              <span className="font-semibold text-green-800">Your progress isn't gone.</span>{" "}
              <span className="text-green-700">
                You last studied {absentDays} days ago — {snapshot.attempts} test
                {snapshot.attempts === 1 ? "" : "s"} and a {humane.days}-day streak are safe. Pick
                up where you left off; no guilt.
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
              No platform can honestly promise a 100% outcome. We guarantee something better and
              true:
              <strong> you will never study blind and never get stuck.</strong> Every day you get
              (1) exactly the one thing to do next, (2) proof of why, (3) an automatic guilt-free
              fix when you fall behind, (4) a humane streak that never punishes you, and (5) active
              recall, not passive watching.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Today: focus + tasks + weak areas (Phase 6 information order) ─── */}
      {todayPlan ? <TodayStrip plan={todayPlan} /> : null}

      {/* A4 — Today's DPP. Sits directly under the Today strip because it is the
          one-tap answer to "what should I practise right now". */}
      {dpp ? <DppCard set={dpp} /> : null}

      {/* A9 — XP, level and badges. Earning-based, never guilt. */}
      {awards ? <AwardsCard awards={awards} /> : null}

      {/* ─── Continue learning: the next surface, always one tap away ─── */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Keep going</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Lessons, papers and the planner — pick up wherever you left off.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/app/studytube"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
            >
              <MonitorPlay className="h-3.5 w-3.5" /> Continue learning
            </Link>
            <Link
              to="/app/planner"
              className="inline-flex items-center gap-1.5 rounded-full border border-input px-3 py-2 text-xs"
            >
              <BookOpen className="h-3.5 w-3.5" /> Open planner
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Deep analytics, behind a disclosure ───
          Phase 6: "optional deep analytics behind disclosure". Everything below
          this line is interesting rather than actionable, and a student who has
          just been told what to do should not have to scroll past four charts to
          find it. A native disclosure element is used, so it is keyboard-openable
          and works with JS disabled. */}
      <details className="rounded-2xl border bg-card p-4 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="text-sm font-semibold">Deep analytics</span>
          <span className="text-xs text-muted-foreground">
            {hasData ? "Readiness, rank estimate, trends" : "Nothing measured yet"}
          </span>
        </summary>
        <div className="mt-4 space-y-6">
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
            <Panel
              title="Recent performance"
              icon={<TrendingUp className="h-4 w-4 text-blue-600" />}
            >
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

            <Panel
              title="Weakest topic"
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            >
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
                <span className="font-semibold text-foreground">
                  {snapshot.syllabusCompletionPct}%
                </span>
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
                  : "Set today's tasks in the planner and your progress will show up here."}
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
          <Panel
            title="Why you can trust these numbers"
            icon={<ShieldCheck className="h-4 w-4 text-primary" />}
          >
            <p className="text-sm text-muted-foreground">
              The #1 complaint students have about big test-prep apps is a dashboard that shows
              wrong data. Here every number is computed from your real plan, real watch-minutes,
              real attempts and real focus minutes — nothing is guessed, nothing is a promo.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <TrustLine label="Plan completion" how="Completed tasks / total planned tasks." />
              <TrustLine
                label="Accuracy"
                how="Correct / (correct + wrong) across submitted tests."
              />
              <TrustLine
                label="Survival score"
                how="Weighted blend of plan, accuracy, weak topics, mistakes and consistency."
              />
              <TrustLine
                label="Streak"
                how="Consecutive days of ≥25 min real focus or a completed task."
              />
            </div>
          </Panel>

          {/* ─── Mock test CTA ─── */}
          <section className="flex flex-wrap items-center gap-4 rounded-2xl border bg-gradient-to-br from-primary/5 to-blue-500/5 p-5">
            <div className="flex-1">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Rocket className="h-4 w-4 text-primary" /> NTA-style mock test
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                A full-length or diagnostic run, marked on NTA rules (+4/−1, no penalty for
                numerical answers). The result feeds straight into your Mistake Doctor and readiness
                model.
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
      </details>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Mission / Survival card                                                    */
/* ────────────────────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────────────────── */
/* Dual-lane readiness (F7)                                                   */
/* ────────────────────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────────────────── */
/* Humane streak card (F5)                                                    */
/* ────────────────────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────────────────── */
/* Micro-drill panel (F4)                                                     */
/* ────────────────────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────────────────── */
/* Wellness strip (F9)                                                        */
/* ────────────────────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────────────────── */
/* Shared UI                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */
/* ------------------------------------------------------------------ *
 * AwardsCard — XP, level and badges (A9)
 *
 * The rules this component exists to enforce, from the research doc:
 * "earning-based, never guilt", "badges meaningful", "no ads/promos".
 *
 * So: every badge shown is one the student actually earned, or one with a real
 * progress bar toward a completed act. There is no locked-badge wall, no
 * countdown, no "you missed" copy, and nothing ranks a student against anyone
 * but their own previous best.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * DppCard — Today's DPP (A4)
 *
 * The set is built by `buildDailyPracticeSet` from the student's own weak
 * chapters and the syllabus weightage, and it is launched by saving it as a
 * real `CbtTest` so the student gets the full exam runtime — timer, palette,
 * negative marking, autosave and a result that feeds the mastery store —
 * rather than a second, weaker practice surface.
 *
 * The card states plainly that difficulty is not labelled, because the baked
 * bank carries no difficulty field and inventing one would be worse than
 * saying nothing.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * TodayStrip — the dashboard's information order, per Phase 6:
 * greeting → today's focus + ONE primary action → today's tasks →
 * 3–5 weak areas.
 *
 * Every number here comes from the student's own stores through
 * `buildTodayPlan`, which is why a thin sample renders "not enough data"
 * instead of 0%, and why a student with no attempts is sent to a
 * diagnostic rather than to a confident recommendation built on nothing.
 * ------------------------------------------------------------------ */

/**
 * The baked question bank, read from the same files the CBT diagnostic uses.
 *
 * See `@/features/pyq/store` for why this is cached rather than fetched per
 * route: the baked payload is immutable once built, and four routes each
 * fetching it with `no-store` re-downloaded ~254 KB on every navigation.
 */
