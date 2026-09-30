import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CircleAlert,
  Flame,
  Gauge,
  Layers,
  ListChecks,
  Share2,
  Target,
  TrendingUp,
  Volume2,
  VolumeX,
} from "lucide-react";
import { DataStore } from "@/lib/store";
import { getLang, type Lang } from "@/lib/lang";
import { loadFocusStore } from "@/features/focus/focus";
import { loadStudyTubeProgress } from "@/features/studytube/progress";
import { buildMentorReport, type MentorReport } from "@/features/mentor/report";
import { mentorSpeechScript } from "@/features/mentor/speech";
import {
  hasVoiceFor,
  isSpeechSupported,
  speak,
  speechLocale,
  stopSpeaking,
  whenVoicesReady,
} from "@/lib/speech";
import {
  PRIVACY,
  buildWeeklyReport,
  reportToMarkdown,
  reportToText,
  type ShareableReport,
} from "@/features/report/share";
import { socialMeta } from "@/config/site";

export const Route = createFileRoute("/app/report")({
  head: () => ({
    meta: [
      { title: "Shareable JEE Progress Report for Parents and Mentors" },
      {
        name: "description",
        content:
          "A one-page report of what you have practised, where you are strong, and what to do next — shareable with a parent or mentor.",
      },

      // Open Graph + Twitter + canonical. Without this every route inherits
      // the root card, so sharing this page previews the root title.
      ...socialMeta(
        "Your JEE Readiness Report",
        "A one-page readiness report built from your real attempt history, with every number checkable.",
        "/app/report",
      ),
    ],
  }),
  component: Report,
});

const LEVEL_COLOR: Record<string, string> = {
  excellent: "bg-emerald-500",
  good: "bg-green-500",
  fair: "bg-amber-500",
  "at-risk": "bg-rose-500",
};

const PRIORITY_COLOR: Record<string, string> = {
  critical:
    "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
  high: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  medium: "border-sky-300 bg-sky-50 text-sky-700",
  low: "border-muted bg-muted text-muted-foreground",
};

function pctBar(value: number, color?: string) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${color || "bg-primary"}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function Report() {
  const [report, setReport] = useState<MentorReport | null>(null);
  const [weekly, setWeekly] = useState<ShareableReport | null>(null);
  const [copied, setCopied] = useState<"text" | "markdown" | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [lang, setLangState] = useState<Lang>("hinglish");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const store = new DataStore();
    const focus = loadFocusStore();
    const studytube = loadStudyTubeProgress();
    setReport(
      buildMentorReport({
        store,
        focus,
        studytube,
      }),
    );
    // The shareable one-pager is built from the same stores through an explicit
    // allowlist, so it can never carry the private fields the mentor report has
    // access to.
    try {
      setWeekly(buildWeeklyReport({ store, focus, studytube }));
    } catch {
      setWeekly(null);
    }
    setLoaded(true);
  }, []);

  // The voice list populates asynchronously on most browsers, so availability
  // is checked once after mount rather than assumed during the first render.
  useEffect(() => {
    let alive = true;
    setLangState(getLang());
    void whenVoicesReady().then(() => {
      if (alive) setVoiceReady(true);
    });
    // Leaving the page mid-sentence must not keep talking.
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, []);

  function listen() {
    if (!report) return;
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const ok = speak(mentorSpeechScript(report), lang);
    setSpeaking(ok);
    if (!ok) setVoiceReady(true);
  }

  async function copy(label: "text" | "markdown") {
    if (!weekly) return;
    const body = label === "text" ? reportToText(weekly) : reportToMarkdown(weekly);
    try {
      await navigator.clipboard.writeText(body);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard is unavailable (insecure context, denied permission). The
      // textarea below is the fallback, so a failure here is not an error.
      setCopied(null);
    }
  }

  if (!loaded || !report) {
    return <div className="h-96 animate-pulse rounded-xl border bg-muted/40" />;
  }

  const p = report.performance;
  const primaryActions = report.actions.filter(
    (a) => a.priority === "critical" || a.priority === "high",
  );
  const others = report.actions.filter((a) => a.priority === "medium" || a.priority === "low");

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-2xl border p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mentor Report</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {report.learner.targetLabel}
              {report.learner.daysToExam !== undefined
                ? ` · ${report.learner.daysToExam} day${report.learner.daysToExam === 1 ? "" : "s"} to exam`
                : ""}{" "}
              ·{" "}
              {report.learner.language === "en"
                ? "English"
                : report.learner.language === "hi"
                  ? "Hindi"
                  : "Hinglish"}
            </p>
          </div>
          <div className="ml-auto text-right">
            <div
              className={`mx-auto flex h-16 w-16 flex-col items-center justify-center rounded-full ${LEVEL_COLOR[report.readinessLevel]} text-white`}
            >
              <span className="text-xl font-bold">{report.readinessScore}</span>
              <span className="text-[9px] uppercase tracking-wide">/100</span>
            </div>
            <p className="mt-1 text-xs capitalize text-muted-foreground">{report.readinessLevel}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{report.summary}</p>
          <button
            onClick={listen}
            disabled={!isSpeechSupported() || (voiceReady && !hasVoiceFor(speechLocale(lang)))}
            title={
              isSpeechSupported()
                ? voiceReady && !hasVoiceFor(speechLocale(lang))
                  ? `No ${speechLocale(lang)} voice is installed on this device.`
                  : "Read the summary aloud"
                : "This browser has no speech support."
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-input px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {speaking ? "Stop" : "Listen"}
          </button>
        </div>
        {/* Say why the button is dead rather than leaving a silent control. */}
        {isSpeechSupported() && voiceReady && !hasVoiceFor(speechLocale(lang)) ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            No {speechLocale(lang)} voice is installed on this device, so the audio summary is
            unavailable. The written report is unaffected.
          </p>
        ) : null}
      </section>

      {/* A5 — shareable parent / mentee one-pager. Sits directly under the hero
          because it is the thing a student came to this page to hand over. */}
      {weekly ? <SharePanel weekly={weekly} copied={copied} onCopy={copy} /> : null}

      {/* KPI grid */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Activity}
          label="Accuracy"
          value={p.attempts ? `${p.accuracy}%` : "—"}
          sub={`${p.correct} correct · ${p.wrong} wrong`}
        />
        <Kpi
          icon={Gauge}
          label="Percentile"
          value={p.attempts ? `${p.percentile}%` : "—"}
          sub={`${p.marks}/${p.maxMarks} marks`}
        />
        <Kpi
          icon={Flame}
          label="Focus streak"
          value={`${report.focus.streakDays}d`}
          sub={`${report.focus.consistencyPct}% consistency`}
        />
        <Kpi
          icon={Target}
          label="Syllabus"
          value={`${report.mastery.syllabusCompletionPct}%`}
          sub={`${report.mastery.weakTopics.length} weak target${report.mastery.weakTopics.length === 1 ? "" : "s"}`}
        />
      </section>

      {/* Top actions */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-primary" /> Next steps
        </div>
        {primaryActions.length || others.length ? (
          <div className="mt-3 space-y-2">
            {[...primaryActions, ...others].map((a, i) => (
              <div key={i} className={`rounded-md border p-3 ${PRIORITY_COLOR[a.priority]}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide">
                    {a.priority}
                  </span>
                  <span className="text-sm font-semibold">{a.title}</span>
                </div>
                <p className="mt-1 text-xs opacity-90">{a.detail}</p>
                <p className="mt-0.5 text-xs italic opacity-70">Why: {a.reason}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nothing urgent — keep the momentum.</p>
        )}
      </section>

      {/* Risks + study + planner */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-primary" /> Watch out for
          </div>
          {report.risks.length ? (
            <div className="mt-3 space-y-2">
              {report.risks.map((r, i) => (
                <div
                  key={i}
                  className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CircleAlert className="h-4 w-4 text-amber-600" /> {r.title}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
                  <p className="mt-0.5 text-xs italic text-muted-foreground">
                    Evidence: {r.evidence}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No flags — keep it up.</p>
          )}
        </section>

        <section className="rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" /> Study & discipline
          </div>
          <div className="mt-3 space-y-3 text-sm">
            <Row label="Lessons finished" value={`${report.study.lecturesWatched}`} />
            <Row label="Recall/practice done" value={`${report.study.handshakes}`} />
            <Row
              label="Practice → mastery"
              value={`${report.study.practiceToMastery}%`}
              bar={pctBar(report.study.practiceToMastery)}
            />
            <Row
              label="Focus consistency (21d)"
              value={`${report.focus.consistencyPct}%`}
              bar={pctBar(report.focus.consistencyPct)}
            />
            <Row label="Mistake pattern" value={report.mistakes.topLabel} />
          </div>
        </section>
      </div>

      {/* Planner adherence */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarCheck className="h-4 w-4 text-primary" /> Plan adherence
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatBox
            label="Tasks done"
            value={`${report.planner.doneTasks} / ${report.planner.totalTasks}`}
          />
          <StatBox
            label="Planned minutes"
            value={`${report.planner.doneMin} / ${report.planner.plannedMin}`}
          />
          <StatBox
            label="Overdue"
            value={`${report.planner.overdueTasks}`}
            tone={report.planner.overdueTasks > 0 ? "warn" : "ok"}
          />
        </div>
      </section>

      {/* Weak topics */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-primary" /> Weak topics to attack
        </div>
        {report.mastery.weakTopics.length ? (
          <div className="mt-3 space-y-2">
            {report.mastery.weakTopics.slice(0, 6).map((w, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {w.subject} — {w.chapter}
                  </p>
                  <p className="text-xs text-muted-foreground">{w.reason}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold">{w.accuracy}%</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No weak topics flagged yet — keep adding test evidence.
          </p>
        )}
      </section>

      {/* My preparation — the combined per-chapter row the report exists for:
          syllabus progress, videos done, PYQs attempted and accuracy in one
          place, with the next action attached. */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4 text-primary" /> My preparation, chapter by chapter
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {report.preparation.chaptersTouched === 0
            ? "Nothing tracked yet — sit a test or finish a lesson and this fills in."
            : `${report.preparation.chaptersTouched} chapter${report.preparation.chaptersTouched === 1 ? "" : "s"} touched · ${report.preparation.questionsAttempted} questions · ${report.preparation.pyqAttempts} from previous-year papers · ${report.preparation.lessonsFinished} lesson${report.preparation.lessonsFinished === 1 ? "" : "s"} finished${report.preparation.accuracy === null ? "" : ` · ${report.preparation.accuracy}% mean accuracy over judged chapters`}`}
        </p>
        {report.preparation.rows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Chapter</th>
                  <th className="pb-2 pr-3 font-medium">State</th>
                  <th className="pb-2 pr-3 text-right font-medium">Accuracy</th>
                  <th className="pb-2 pr-3 text-right font-medium">Qs</th>
                  <th className="pb-2 pr-3 text-right font-medium">PYQ</th>
                  <th className="pb-2 pr-3 text-right font-medium">Videos</th>
                  <th className="pb-2 font-medium">Next</th>
                </tr>
              </thead>
              <tbody>
                {report.preparation.rows.slice(0, 10).map((r) => (
                  <tr key={`${r.subject}|${r.chapter}`} className="border-t align-top">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{r.chapter}</span>
                      <span className="ml-1 text-xs text-muted-foreground">{r.subject}</span>
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          "whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium " +
                          masteryTone(r.state)
                        }
                      >
                        {r.state}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">
                      {r.accuracy === null ? (
                        <span className="text-xs font-normal text-muted-foreground">too few</span>
                      ) : (
                        `${r.accuracy}%`
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{r.attempts}</td>
                    <td className="py-2 pr-3 text-right">{r.pyqAttempts}</td>
                    <td className="py-2 pr-3 text-right">{r.lessonsFinished}</td>
                    <td className="py-2 text-xs text-muted-foreground">{r.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No chapter evidence yet. A test attempt or a finished lesson creates the first row.
          </p>
        )}
      </section>

      {/* Strengths — previously always empty because strongTopics was never
          filled. Now read from the mastery store. */}
      {report.mastery.strongTopics.length ? (
        <section className="rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BadgeCheck className="h-4 w-4 text-primary" /> What is already working
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.mastery.strongTopics.map((t, i) => (
              <span
                key={`${t.subject}|${t.chapter}|${i}`}
                className="rounded-full border px-3 py-1 text-xs font-medium"
              >
                {t.chapter} · {t.accuracy}%
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          to="/app/planner"
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium"
        >
          Open planner <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/app/saarthi"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Ask Saarthi <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

/** A chapter's state, coloured by whether it needs attention. */
function masteryTone(state: string): string {
  switch (state) {
    case "Mastered":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "Strong":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "Improving":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "Learning":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Row({ label, value, bar }: { label: string; value: string; bar?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      {bar ? <div className="mt-1">{bar}</div> : null}
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === "warn" ? "text-amber-600" : ""}`}>{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * SharePanel — the A5 parent / mentee one-pager.
 *
 * Two rules shape this component:
 *
 *  1. **It shows the student what will be shared BEFORE they share it.** The
 *     full one-pager is rendered inline, so nobody has to trust that the
 *     clipboard copy matches what they read.
 *  2. **It states the privacy boundary out loud.** The allowlist is printed
 *     under the copy, because "no private data" is a claim the student should be
 *     able to check rather than take on faith.
 * ------------------------------------------------------------------ */

function SharePanel({
  weekly,
  copied,
  onCopy,
}: {
  weekly: ShareableReport;
  copied: "text" | "markdown" | null;
  onCopy: (label: "text" | "markdown") => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const raw = showRaw ? reportToMarkdown(weekly) : reportToText(weekly);

  return (
    <section className="rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Share2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Share with a parent or mentor</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              A read-only one-pager: attendance, completion, weak chapters and the next step.{" "}
              {weekly.window.from} → {weekly.window.to}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onCopy("text")}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
          >
            <Share2 className="h-3.5 w-3.5" /> {copied === "text" ? "Copied" : "Copy as text"}
          </button>
          <button
            onClick={() => onCopy("markdown")}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-xs font-medium"
          >
            {copied === "markdown" ? "Copied" : "Copy as Markdown"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ShareStat
          label="Days studied"
          value={`${weekly.attendance.daysStudied}/${weekly.attendance.daysInWindow}`}
        />
        <ShareStat label="Focus time" value={`${weekly.effort.focusMinutes} min`} />
        <ShareStat
          label="Tasks done"
          value={`${weekly.completion.tasksDone}/${weekly.completion.tasksPlanned}`}
        />
        <ShareStat
          label="Mean accuracy"
          value={
            weekly.evidence.accuracy === null ? "not enough data" : `${weekly.evidence.accuracy}%`
          }
        />
      </div>

      <div className="mt-4 rounded-xl border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Exactly what gets shared
          </h3>
          <button onClick={() => setShowRaw((v) => !v)} className="text-xs text-primary underline">
            {showRaw ? "Show plain text" : "Show Markdown"}
          </button>
        </div>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
          {raw}
        </pre>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border p-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
            <BadgeCheck className="h-3.5 w-3.5" /> Included
          </h4>
          <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
            {PRIVACY.included.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border p-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
            <CircleAlert className="h-3.5 w-3.5" /> Never included
          </h4>
          <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
            {PRIVACY.excluded.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        The one-pager is built from an explicit allowlist, so a field that is not listed above is
        never read — it cannot leak even by accident.
      </p>
    </section>
  );
}

function ShareStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
