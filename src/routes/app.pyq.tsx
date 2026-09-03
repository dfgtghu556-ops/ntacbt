import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, FileText, TestTube2 } from "lucide-react";
import { DEFAULT_TEST_MINUTES, type CbtTest, type Subject } from "@/features/cbt/types";
import { saveCbtTest } from "@/features/cbt/store";

export const Route = createFileRoute("/app/pyq")({
  component: Pyq,
});

interface Paper {
  id: string;
  year: number;
  month: string;
  label: string;
  total: number;
  counts: { Physics: number; Chemistry: number; Mathematics: number };
  mcq: number;
  integer: number;
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
  sol: string;
}

function toSubject(s: string): Subject {
  if (s === "Physics") return "Physics";
  if (s === "Chemistry") return "Chemistry";
  return "Mathematics";
}

function Pyq() {
  const navigate = useNavigate();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Paper | null>(null);
  const [questions, setQuestions] = useState<PyqQuestion[]>([]);
  const [qLoading, setQLoading] = useState(false);

  async function loadIndex() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/pyq/index.json", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { index?: Paper[]; papers?: Paper[] };
      const list = data.index ?? data.papers ?? [];
      if (!list.length) throw new Error("No papers baked yet.");
      setPapers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load PYQ index.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIndex();
  }, []);

  async function open(paper: Paper) {
    setSelected(paper);
    setQLoading(true);
    try {
      const r = await fetch(`/pyq/${paper.id}.json`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { questions?: PyqQuestion[] };
      setQuestions(data.questions ?? []);
    } catch {
      setQuestions([]);
    } finally {
      setQLoading(false);
    }
  }

  function openReactCbt(paper: Paper) {
    if (!questions.length) return;
    const test: CbtTest = {
      id: `react-${Date.now().toString(36)}`,
      name: `${paper.label} ${paper.year}`,
      createdAt: Date.now(),
      durationSec: DEFAULT_TEST_MINUTES * 60,
      pyq: true,
      questions: questions.map((q, i) => ({
        id: `pyq-${paper.id}-${i}`,
        no: q.no,
        subject: toSubject(q.subject),
        chapter: q.chapter,
        topic: q.topic,
        type: q.type === "integer" ? "integer" : "mcq",
        text: q.text,
        options: q.options,
        answer: q.answer,
        sol: q.sol,
      })),
    };
    saveCbtTest(test);
    void navigate({ to: "/cbt", search: { testId: test.id, name: test.name } });
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">PYQ Papers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Official-style previous-year papers baked into the app. Answers carry the exact NTA keys
          (including ranges, accepted values and bonus questions).
        </p>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading papers…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={loadIndex}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {papers.map((p) => (
            <button
              key={p.id}
              onClick={() => open(p)}
              className="rounded-xl border p-4 text-left transition-colors hover:bg-accent/60"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-4 w-4" /> {p.year} · {p.label}
              </div>
              <p className="mt-2 text-lg font-semibold">{p.total} questions</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Phy {p.counts.Physics} · Chem {p.counts.Chemistry} · Math {p.counts.Mathematics} ·{" "}
                {p.mcq} MCQ · {p.integer} integer
              </p>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <section className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold">
            {selected.label} — {selected.total} questions
          </h2>
          {qLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading paper…
            </div>
          ) : questions.length ? (
            <ul className="mt-3 space-y-2">
              {questions.slice(0, 10).map((q) => (
                <li
                  key={`${q.no}-${q.text.slice(0, 20)}`}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Q{q.no}</span>
                    <span>{q.subject}</span>
                    <span>{q.chapter}</span>
                  </div>
                  <p className="mt-1 line-clamp-2">{q.text}</p>
                  {q.sol ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      Solution: {q.sol}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              This paper couldn't be loaded on this device.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => openReactCbt(selected)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              <TestTube2 className="h-4 w-4" /> Solve as full-length test (React)
            </button>
            <a
              href={`/jee-cbt.html#pyq`}
              className="inline-flex items-center rounded-md border border-input px-3 py-2 text-sm"
            >
              Open legacy NTA interface
            </a>
          </div>
        </section>
      ) : null}
    </div>
  );
}
