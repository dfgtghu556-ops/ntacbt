import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { pageSummary, pageWindow, paginate } from "@/features/ui/pagination";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, FileText, TestTube2 } from "lucide-react";
import { DEFAULT_TEST_MINUTES, type CbtTest } from "@/features/cbt/types";
import { toSubject } from "@/features/academics/subject";
import { saveCbtTest } from "@/features/cbt/store";

type PyqSource = "api" | "baked" | "error";

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

interface PaperFile {
  paper?: { meta?: Paper; questions?: PyqQuestion[] };
  questions?: PyqQuestion[];
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

function Pyq() {
  const navigate = useNavigate();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [source, setSource] = useState<PyqSource>("baked");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Paper | null>(null);
  /**
   * The paper list is paginated because the full historical library can be
   * hundreds of papers, and rendering every card at once is the difference
   * between usable and not on a low-end phone.
   */
  const [paperPage, setPaperPage] = useState(1);
  const [questions, setQuestions] = useState<PyqQuestion[]>([]);
  const [qLoading, setQLoading] = useState(false);

  async function loadIndex() {
    setLoading(true);
    setError("");
    // 1) Full historical library: same server endpoint used by the full
    //    platform (snapshot backed by official keys/solutions, all years).
    try {
      const r = await fetch("/api/public/pyq-papers", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { papers?: Paper[]; source?: string };
      const list = data.papers ?? [];
      if (!list.length) throw new Error("No papers returned by the library API.");
      setPapers(list);
      setSource("api");
      setLoading(false);
      return;
    } catch {
      /* fall through to the offline/baked fallback */
    }
    // 2) Offline fallback: papers baked into the build (public/pyq/).
    try {
      const r = await fetch("/pyq/index.json", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { index?: Paper[]; papers?: Paper[] };
      const list = data.index ?? data.papers ?? [];
      if (!list.length) throw new Error("No papers baked yet.");
      setPapers(list);
      setSource("baked");
    } catch (e) {
      setSource("error");
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
    // Prefer the full library API (handles every session/shift + older years);
    // fall back to the baked per-paper file when the server can't reach the
    // upstream snapshot (offline builds, preview sandboxes, etc.).
    try {
      const r = await fetch(`/api/public/pyq-papers?paper=${encodeURIComponent(paper.id)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { paper?: { questions?: PyqQuestion[] } };
      const qs = data.paper?.questions ?? [];
      if (qs.length) {
        setQuestions(qs);
        setQLoading(false);
        return;
      }
      throw new Error("No questions in API payload.");
    } catch {
      /* fall through to baked paper */
    }
    try {
      const r = await fetch(`/pyq/${paper.id}.json`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as PaperFile;
      setQuestions(data.questions ?? data.paper?.questions ?? []);
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

  // One page of papers at a time. The full historical library can be hundreds
  // of papers, and rendering every card at once is the difference between usable
  // and not on a low-end phone.
  const page = paginate(papers, { page: paperPage, pageSize: 24 });

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">PYQ Papers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Official-style previous-year papers from the verified academic snapshot. Answers carry the
          exact NTA keys (including ranges, accepted values and bonus questions).
        </p>
        <div className="mt-3 rounded-2xl border border-primary/30 bg-accent/40 p-4 text-sm">
          <p className="font-medium">
            {source === "api"
              ? `Full historical PYQ library loaded — ${papers.length} papers, every available session, shift and year.`
              : source === "baked"
                ? "Full library is temporarily unreachable — showing the papers baked into this build."
                : "PYQ library unavailable right now."}
          </p>
          <p className="mt-1 text-muted-foreground">
            {source === "api"
              ? "Paper keys and solutions come from the same verified academic snapshot used by the full platform. You can solve any paper as an NTA-style CBT."
              : "Searching the full snapshot failed on this network, so these offline papers are shown. Try again in a moment — the full historical library (all sessions, shifts and older years) is served by the platform API."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {source !== "api" ? (
              <button
                onClick={loadIndex}
                className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry full library
              </button>
            ) : null}
            <a
              href="/jee-cbt.html#pyq"
              className="inline-flex items-center rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
            >
              Open full PYQ library →
            </a>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading papers…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={loadIndex}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.items.map((p) => (
              <button
                key={p.id}
                onClick={() => open(p)}
                className="rounded-2xl border p-4 text-left transition-colors hover:bg-accent/60"
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
          <PaperPager page={page} onGo={setPaperPage} noun="papers" />
        </>
      )}

      {selected ? (
        <section className="rounded-2xl border p-4">
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

/**
 * PaperPager — accessible pagination controls for the paper grid.
 *
 * Phase 6 asks for pagination *and* accessibility, and the two meet here: a
 * pager that only works with a mouse excludes keyboard and screen-reader users
 * from navigating the library at all.
 *
 * So the controls are real `<button>` elements in a labelled `<nav>`, the
 * summary is announced through a live region, the current page carries
 * `aria-current="page"`, and elided gaps render as "…" text rather than a
 * disabled button that invites a pointless click.
 */
function PaperPager({
  page,
  onGo,
  noun,
}: {
  page: ReturnType<typeof paginate>;
  onGo: (page: number) => void;
  noun: string;
}) {
  if (page.totalPages <= 1) {
    return (
      <p className="mt-3 text-xs text-muted-foreground" role="status">
        {pageSummary(page, noun)}
      </p>
    );
  }

  return (
    <nav aria-label="Paper pages" className="mt-4 flex flex-wrap items-center gap-2">
      <button
        onClick={() => onGo(page.page - 1)}
        disabled={!page.hasPrev}
        className="rounded-md border border-input px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
      >
        Previous
      </button>

      <ul className="flex flex-wrap items-center gap-1">
        {pageWindow(page.page, page.totalPages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-xs text-muted-foreground">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                onClick={() => onGo(p)}
                aria-current={p === page.page ? "page" : undefined}
                aria-label={`Page ${p} of ${page.totalPages}`}
                className={
                  p === page.page
                    ? "min-w-8 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
                    : "min-w-8 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-accent/60"
                }
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ul>

      <button
        onClick={() => onGo(page.page + 1)}
        disabled={!page.hasNext}
        className="rounded-md border border-input px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>

      {/* Announced when the page changes, so a screen-reader user knows the
          grid below is a different set of papers. */}
      <p className="sr-only" role="status" aria-live="polite">
        {pageSummary(page, noun)}
      </p>
    </nav>
  );
}
