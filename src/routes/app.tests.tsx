/**
 * Tests — one place to start a paper.
 *
 * The React NTA runner (`/cbt`) was only reachable from the PYQ browser or the
 * legacy app. This surface lists everything that can be started right now:
 *   • the quick diagnostic drill,
 *   • papers saved on this device,
 *   • the baked / full previous-year library,
 * and hands each one to the exam service so the runner never has to guess.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Loader2, Play, RefreshCw, Save, TestTube2 } from "lucide-react";
import { DEFAULT_TEST_MINUTES, type CbtTest, type Subject } from "@/features/cbt/types";
import { loadCbtStore, saveCbtTest } from "@/features/cbt/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PaperMeta {
  id: string;
  year: number;
  month?: string;
  label: string;
  total: number;
  counts?: { Physics: number; Chemistry: number; Mathematics: number };
  mcq?: number;
  integer?: number;
}

interface PyqQuestion {
  no: number;
  subject: string;
  chapter: string;
  topic: string;
  type: "mcq" | "integer";
  text: string;
  options: { label: string; text: string }[];
  answer: string;
  sol?: string;
}

export const Route = createFileRoute("/app/tests")({
  component: TestsPage,
});

function toSubject(s: string): Subject {
  if (s === "Physics") return "Physics";
  if (s === "Chemistry") return "Chemistry";
  return "Mathematics";
}

function TestsPage() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState<CbtTest[]>([]);
  const [papers, setPapers] = useState<PaperMeta[]>([]);
  const [source, setSource] = useState<"api" | "baked" | "error">("baked");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSaved(loadCbtStore().tests);
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const r = await fetch("/api/public/pyq-papers?list=1", { cache: "no-store" });
        if (r.ok) {
          const data = (await r.json()) as { papers?: PaperMeta[] };
          if (data.papers?.length) {
            if (!alive) return;
            setPapers(data.papers);
            setSource("api");
            setLoading(false);
            return;
          }
        }
        throw new Error("empty");
      } catch {
        try {
          const b = await fetch("/pyq/index.json", { cache: "no-store" });
          if (!b.ok) throw new Error(`HTTP ${b.status}`);
          const data = (await b.json()) as { index?: PaperMeta[]; papers?: PaperMeta[] };
          const list = data.index ?? data.papers ?? [];
          if (!alive) return;
          setPapers(list);
          setSource(list.length ? "baked" : "error");
          if (!list.length) setError("No papers are baked into this build yet.");
        } catch (e) {
          if (!alive) return;
          setSource("error");
          setError(e instanceof Error ? e.message : "Could not load the paper library.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  /** Load a paper's questions and hand them to the runner. */
  async function startPaper(paper: PaperMeta) {
    setStarting(paper.id);
    try {
      let questions: PyqQuestion[] = [];
      try {
        const r = await fetch(`/api/public/pyq-papers?paper=${encodeURIComponent(paper.id)}`, {
          cache: "no-store",
        });
        if (r.ok) {
          const data = (await r.json()) as { paper?: { questions?: PyqQuestion[] } };
          questions = data.paper?.questions ?? [];
        }
      } catch {
        /* fall through to the baked file */
      }
      if (!questions.length) {
        const r = await fetch(`/pyq/${encodeURIComponent(paper.id)}.json`, { cache: "no-store" });
        if (r.ok) {
          const data = (await r.json()) as {
            questions?: PyqQuestion[];
            paper?: { questions?: PyqQuestion[] };
          };
          questions = data.questions ?? data.paper?.questions ?? [];
        }
      }
      if (!questions.length) {
        setError(`“${paper.label}” has no questions available on this device yet.`);
        return;
      }
      const test: CbtTest = {
        id: `react-${Date.now().toString(36)}`,
        name: `JEE Main ${paper.year} — ${paper.label}`,
        createdAt: Date.now(),
        durationSec: DEFAULT_TEST_MINUTES * 60,
        pyq: true,
        questions: questions.map((q, i) => ({
          id: `pyq-${paper.id}-${i}`,
          no: q.no || i + 1,
          subject: toSubject(q.subject),
          chapter: q.chapter,
          topic: q.topic,
          type: q.type === "integer" ? "integer" : "mcq",
          text: q.text,
          options: q.options ?? [],
          answer: q.answer,
          sol: q.sol,
        })),
      };
      saveCbtTest(test);
      setSaved(loadCbtStore().tests);
      void navigate({ to: "/cbt", search: { testId: test.id, name: test.name } });
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Tests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every paper you can sit right now, in the NTA-style runner. Progress autosaves, so a
          closed tab never costs you a finished paper.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TestTube2 className="h-5 w-5" /> Quick diagnostic drill
          </CardTitle>
          <CardDescription>
            A short balanced paper built from the fullest 2026 shift we ship — the fastest way to
            see where you stand.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/cbt">
              <Play className="mr-2 h-4 w-4" /> Start diagnostic
            </Link>
          </Button>
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Save className="h-4 w-4" /> Saved on this device
          </h2>
          <span className="text-xs text-muted-foreground">{saved.length}</span>
        </div>
        {saved.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nothing saved yet. Start a paper below and it will appear here.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((t) => (
              <li key={t.id}>
                <Link
                  to="/cbt"
                  search={{ testId: t.id, name: t.name }}
                  className="block rounded-xl border p-4 transition-colors hover:bg-accent/60"
                >
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.questions.length} questions · {Math.round(t.durationSec / 60)} min
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4" /> Previous-year papers
          </h2>
          {source === "api" ? (
            <span className="text-xs text-muted-foreground">
              Full library · {papers.length} papers
            </span>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry full library
            </button>
          )}
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading papers…
          </p>
        ) : error ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link
              to="/app/pyq"
              className="mt-3 inline-block rounded-md border border-input px-3 py-1.5 text-xs"
            >
              Open the PYQ browser
            </Link>
          </div>
        ) : papers.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            No papers available on this device right now.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {papers.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => void startPaper(p)}
                  disabled={starting !== null}
                  className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-accent/60 disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {p.year} · {p.label}
                    </span>
                    {starting === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <p className="mt-2 text-lg font-semibold">{p.total} questions</p>
                  {p.counts ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      P {p.counts.Physics} · C {p.counts.Chemistry} · M {p.counts.Mathematics}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
