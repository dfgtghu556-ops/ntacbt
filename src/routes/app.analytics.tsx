import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, LineChart as LineIcon, PieChart as PieIcon } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DataStore, type AttemptSummary } from "@/lib/store";

export const Route = createFileRoute("/app/analytics")({
  component: Analytics,
});

interface SubjectStat {
  subject: string;
  attempts: number;
  correct: number;
  wrong: number;
  skipped: number;
  marks: number;
  accuracy: number;
}

function buildSubjectStats(attempts: AttemptSummary[]): SubjectStat[] {
  const bySub = new Map<
    string,
    { attempts: number; correct: number; wrong: number; skipped: number; marks: number }
  >();
  for (const a of attempts) {
    const per = a.result?.per;
    if (!per) continue;
    for (const [subject, s] of Object.entries(per)) {
      const cur = bySub.get(subject) ?? { attempts: 0, correct: 0, wrong: 0, skipped: 0, marks: 0 };
      cur.attempts += 1;
      cur.correct += s?.correct ?? 0;
      cur.wrong += s?.wrong ?? 0;
      cur.skipped += s?.skipped ?? 0;
      cur.marks += s?.marks ?? 0;
      bySub.set(subject, cur);
    }
  }
  return [...bySub.entries()]
    .map(([subject, s]) => {
      const attempted = s.correct + s.wrong;
      return {
        subject,
        attempts: s.attempts,
        correct: s.correct,
        wrong: s.wrong,
        skipped: s.skipped,
        marks: s.marks,
        accuracy: attempted ? Math.round((s.correct / attempted) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.accuracy - a.accuracy);
}

function Analytics() {
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const store = new DataStore();
    setAttempts(store.attempts);
    setLoaded(true);
  }, []);

  const trend = useMemo(
    () =>
      attempts
        .filter((a) => typeof a.submittedAt === "number")
        .map((a) => ({
          name: new Date(a.submittedAt as number).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
          }),
          marks: a.result?.all?.marks ?? 0,
          accuracy: a.result?.all?.accuracy ?? 0,
        })),
    [attempts],
  );

  const subjects = useMemo(() => buildSubjectStats(attempts), [attempts]);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loaded ? `${attempts.length} submitted attempts` : "Loading…"}
        </p>
      </section>

      {!loaded ? (
        <div className="h-72 animate-pulse rounded-xl border bg-muted/40" />
      ) : attempts.length === 0 ? (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No attempts yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Take a mock test or PYQ paper — then the time × accuracy matrix, subject performance and
            mistake analysis will appear here.
          </p>
          <a
            href="/jee-cbt.html#library"
            className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Open test library
          </a>
        </section>
      ) : (
        <>
          <section className="rounded-xl border p-4">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <LineIcon className="h-4 w-4 text-muted-foreground" /> Improvement trend
            </h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="marks" name="Marks" stroke="var(--chart-1)" dot />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    name="Accuracy %"
                    stroke="var(--chart-2)"
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-xl border p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <PieIcon className="h-4 w-4 text-muted-foreground" /> Subject performance
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {subjects.map((s) => (
                <div key={s.subject} className="rounded-md border p-3">
                  <p className="text-sm font-semibold">{s.subject}</p>
                  <p className="mt-1 text-2xl font-semibold">{s.accuracy}%</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.correct}✓ · {s.wrong}✗ · {s.skipped}— · {s.marks} marks
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
