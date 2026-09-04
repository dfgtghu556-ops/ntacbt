import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CircleAlert,
  Flame,
  Gauge,
  ListChecks,
  Target,
  TrendingUp,
} from "lucide-react";
import { DataStore } from "@/lib/store";
import { loadFocusStore } from "@/features/focus/focus";
import { loadStudyTubeProgress } from "@/features/studytube/progress";
import { buildMentorReport, type MentorReport } from "@/features/mentor/report";

export const Route = createFileRoute("/app/report")({
  component: Report,
});

const LEVEL_COLOR: Record<string, string> = {
  excellent: "bg-emerald-500",
  good: "bg-green-500",
  fair: "bg-amber-500",
  "at-risk": "bg-rose-500",
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-700",
  high: "border-amber-300 bg-amber-50 text-amber-700",
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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const store = new DataStore();
    setReport(
      buildMentorReport({
        store,
        focus: loadFocusStore(),
        studytube: loadStudyTubeProgress(),
      }),
    );
    setLoaded(true);
  }, []);

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
        <p className="mt-4 text-sm text-muted-foreground">{report.summary}</p>
      </section>

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
                <div key={i} className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
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
