import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
  Info,
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
  if (h < 12)
    return { text: "Good morning", sub: "Kal ki tarah aaj bhi ek clear goal — let's go." };
  if (h < 17)
    return { text: "Good afternoon", sub: "Aaj ka ek mission, aur har card bata raha hai why." };
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
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-blue-50 via-background to-violet-50 p-6 sm:p-8">
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
          <div className="relative z-10 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm">
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
                Full-length ya diagnostic run. Marking NTA rules (+4/−1, numerical no penalty)
                follow karta hai aur result aapke Mistake Doctor + readiness model me feed hota hai.
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
function SurvivalScoreRing({ score, status }: { score: number; status: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score || 0));
  const off = c - (pct / 100) * c;
  const color = status === "on-track" ? "#16a34a" : status === "watch" ? "#f59e0b" : "#ef4444";
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
                {mission.subject || mission.chapter
                  ? ` · ${mission.subject || ""} ${mission.chapter || ""}`.trim()
                  : ""}
              </div>
            </div>
            {missionIsTest ? (
              <Link
                to="/cbt"
                search={{
                  name:
                    `${mission.subject || ""} ${mission.chapter || ""}`.trim() ||
                    "Quick mixed diagnostic drill",
                }}
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
            {p.evidence.percentileVerified ? " · verified table" : " · provisional"}
          </div>
        </div>
        {p.reliable ? (
          <>
            <div className="rounded-2xl border bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4">
              <div className="text-xs font-medium text-muted-foreground">Estimated rank (AIR)</div>
              <div className="mt-1 text-3xl font-bold">~{p.rank.toLocaleString("en-IN")}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                JEE Main, ~14 lakh candidates · an estimate
              </div>
            </div>
            <div className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 md:col-span-2">
              <div className="text-xs font-medium text-muted-foreground">Where you land</div>
              <div className="mt-1 text-sm font-semibold">{p.tier}</div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-4 md:col-span-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Info className="h-3.5 w-3.5" /> Not enough data to estimate reliably
            </div>
            <p className="mt-2 text-sm">{p.fallback}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Confidence: {p.confidence}. The percentile above is from a verified table; the rank
              and band are withheld rather than guessed.
            </p>
          </div>
        )}
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
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href={p.evidence.percentileSource.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Percentile source
        </a>
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href={p.evidence.rankSource.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Candidate-count source
        </a>
        <span>
          {p.evidence.attempts} attempt{p.evidence.attempts === 1 ? "" : "s"} behind this figure
        </span>
      </div>
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
function StreakCard({
  humane,
  streak,
}: {
  humane: ReturnType<typeof computeHumaneStreak>;
  streak: number;
}) {
  const flameColor = humane.days > 0 ? "text-orange-500" : "text-muted-foreground";
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Consistency</span>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 ${flameColor}`}
        >
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
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                {c.subject}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {c.tagLabel}
              </span>
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
            {pct >= 80 ? "Almost there" : pct >= 50 ? "Solid momentum" : "Small start counts"}
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

function AwardsCard({ awards }: { awards: AchievementSummary }) {
  const pct = Math.round((awards.level.xpIntoLevel / awards.level.levelSpan) * 100);
  // Show earned badges first, then the closest unearned ones with real progress.
  const shown = [
    ...awards.earned,
    ...awards.badges.filter((b) => !b.earned && b.progress > 0).slice(0, 3),
  ].slice(0, 8);

  return (
    <section className="rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Level {awards.level.level} ·{" "}
            {awards.level.title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {awards.xp.toLocaleString()} XP · {awards.level.toNext} to level{" "}
            {awards.level.level + 1}
          </p>
        </div>
        {awards.beatPersonalBest ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-3 py-1 text-[11px] font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
            <Flame className="h-3.5 w-3.5" /> Beat your own best
          </span>
        ) : null}
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{awards.note}</p>

      {shown.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {shown.map((b) => (
            <li
              key={b.id}
              className={`rounded-md border px-3 py-2 text-xs ${
                b.earned ? "border-primary/40 bg-primary/5" : ""
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{b.label}</span>
                {b.earned ? (
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-green-600" />
                ) : (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {Math.round(b.progress * 100)}%
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-muted-foreground">{b.description}</span>
              {!b.earned ? (
                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary/60"
                    style={{ width: `${Math.round(b.progress * 100)}%` }}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-[11px] text-muted-foreground">
        XP is counted from your own focus sessions, attempts, lessons and mastered chapters — never
        from anything you did not do. No badge here can be lost.
      </p>
    </section>
  );
}

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

function DppCard({ set }: { set: DailyPracticeSet }) {
  const navigate = useNavigate();
  if (set.questions.length === 0) return null;
  const runnable = set.questions.length >= MIN_DPP_SIZE;

  function start() {
    const test = dppToCbtTest(set, Date.now());
    if (!test) return;
    // Saving it first means /cbt can resolve it by id, and the attempt lands in
    // the same store every other test uses.
    saveCbtTest(test as unknown as CbtTest);
    navigate({ to: "/cbt", search: { testId: test.id } });
  }

  return (
    <section className="rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-primary" /> Today&apos;s DPP
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{set.note}</p>
        </div>
        <button
          onClick={start}
          disabled={!runnable}
          title={runnable ? undefined : "Not enough questions on this device for a timed set."}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" /> Start {set.questions.length} questions
        </button>
      </div>

      {set.focus.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {set.focus.slice(0, 4).map((f) => (
            <li key={`${f.subject}-${f.chapter}`} className="rounded-md border px-3 py-2 text-xs">
              <span className="font-medium">
                {f.subject} — {f.chapter}
              </span>
              <span className="mt-0.5 block text-muted-foreground">{f.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 text-[11px] text-muted-foreground">
        {Math.round((set.questions.length * DPP_SEC_PER_QUESTION) / 60)} min · no difficulty labels:
        the question bank does not carry them, and a wrong label would be worse than none.
      </p>
    </section>
  );
}

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

function TodayStrip({ plan }: { plan: TodayPlan }) {
  const pending = plan.tasks.filter((t) => t.status !== "done");

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            {plan.isToday ? "Today" : `Next up · ${plan.dayKey}`}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.note ||
              `${plan.tasks.length} task${plan.tasks.length === 1 ? "" : "s"} · ${
                plan.chaptersTouched
              } chapter${plan.chaptersTouched === 1 ? "" : "s"} · ${plan.doneMin}/${
                plan.plannedMin
              } min done`}
          </p>
        </div>
        <Link
          to={plan.primary.to}
          {...(plan.primary.search ? { search: plan.primary.search } : {})}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Play className="h-4 w-4" /> {plan.primary.label}
        </Link>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        <Info className="mr-1 inline h-3 w-3 align-[-2px]" />
        {plan.primary.reason}
      </p>

      {plan.tasks.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {plan.tasks.slice(0, 6).map((task) => (
            <li
              key={task.id}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                task.isWeakTarget ? "border-primary/40 bg-accent/30" : ""
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  task.status === "done"
                    ? "bg-green-100 text-green-700"
                    : "border text-muted-foreground"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">
                  {task.subject} — {task.chapter}
                </span>
                {task.isWeakTarget ? (
                  <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Weak target
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {task.kind} · {task.estMin || 45} min
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {plan.tasks.length > 6 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          +{plan.tasks.length - 6} more today ·{" "}
          <Link to="/app/planner" className="text-primary underline">
            open planner
          </Link>
        </p>
      ) : null}

      {plan.weakAreas.length > 0 ? (
        <div className="mt-4 border-t pt-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Weak areas to work on
          </h3>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {plan.weakAreas.map((w) => (
              <li
                key={`${w.subject}-${w.chapter}`}
                className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {w.subject} — {w.chapter}
                  </span>
                  <span className="block truncate text-muted-foreground">{w.reason}</span>
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    w.accuracy === null
                      ? "bg-muted text-muted-foreground"
                      : w.accuracy < 50
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {w.accuracy === null ? "not enough data" : `${w.accuracy}%`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {pending.length > 0
              ? "Ranked from your own attempts and finished lessons — the same evidence the mentor report uses."
              : "Ranked from your own attempts and finished lessons. Nothing here is estimated."}
          </p>
        </div>
      ) : null}
    </section>
  );
}
