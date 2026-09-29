/**
 * Global search.
 *
 * One box, one result set, across papers, chapters, topics, teachers,
 * institutes, your saved tests and your notes. Results are grouped, ranked and
 * every academic hit shows the dataset it came from — the search never invents
 * a record it cannot attribute.
 */
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search as SearchIcon, X } from "lucide-react";
import {
  buildIndex,
  groupHits,
  indexNotes,
  indexPapers,
  indexSavedTests,
  searchRecords,
  TYPE_LABEL,
  type SearchRecord,
  type SearchResultType,
} from "@/features/search";
import { DataStore } from "@/lib/store";
import { loadCbtStore } from "@/features/cbt/store";
import { Badge } from "@/components/ui/badge";
import { socialMeta } from "@/config/site";

interface PaperMeta {
  id: string;
  year: number;
  month?: string;
  label: string;
  total: number;
}

export const Route = createFileRoute("/app/search")({
  head: () => ({
    meta: [
      { title: "Search JEE Papers, Chapters, Topics and Teachers" },
      {
        name: "description",
        content:
          "Search across previous-year questions, syllabus chapters and topics, teachers, institutes and your own notes in one place.",
      },

      // Open Graph + Twitter + canonical. Without this every route inherits
      // the root card, so sharing this page previews the root title.
      ...socialMeta(
        "Search Questions, Chapters and Lectures",
        "Search every transcribed JEE Main question, syllabus chapter and lecture in NTACBT.",
        "/app/search",
      ),
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { q: string } => ({
    q: typeof search["q"] === "string" ? search["q"] : "",
  }),
  component: SearchPage,
});

function SearchPage() {
  const search = useSearch({ from: Route.id });
  const [query, setQuery] = useState(search.q);

  const [papers, setPapers] = useState<PaperMeta[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(true);
  // Legacy state is only readable in the browser; the store is built after mount.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedTests, setSavedTests] = useState<
    Array<{ id: string; name: string; questions: unknown[] }>
  >([]);

  useEffect(() => {
    setQuery(search.q);
  }, [search.q]);

  useEffect(() => {
    // Local-only indexes: notes + saved tests live in this browser.
    const store = new DataStore();
    const raw = store.state.notes;
    setNotes(
      raw && typeof raw === "object"
        ? (Object.fromEntries(
            Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>)
        : {},
    );
    setSavedTests(loadCbtStore().tests);
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoadingPapers(true);
      try {
        const r = await fetch("/api/public/pyq-papers?list=1", { cache: "no-store" });
        if (r.ok) {
          const data = (await r.json()) as { papers?: PaperMeta[] };
          if (alive && data.papers?.length) {
            setPapers(data.papers);
            setLoadingPapers(false);
            return;
          }
        }
        const b = await fetch("/pyq/index.json", { cache: "no-store" });
        if (b.ok) {
          const data = (await b.json()) as { index?: PaperMeta[]; papers?: PaperMeta[] };
          if (alive) setPapers(data.index ?? data.papers ?? []);
        }
      } catch {
        /* papers are simply absent from the index — everything else still searches */
      } finally {
        if (alive) setLoadingPapers(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const index = useMemo(
    () =>
      buildIndex([...indexPapers(papers), ...indexSavedTests(savedTests), ...indexNotes(notes)]),
    [papers, savedTests, notes],
  );

  const hits = useMemo(() => (query.trim() ? searchRecords(index, query) : []), [index, query]);
  const groups = useMemo(() => groupHits(hits), [hits]);

  const trimmed = query.trim();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Papers, chapters, topics, teachers, institutes, your tests and your notes — in one place.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-input bg-background px-4 py-2 focus-within:ring-2 focus-within:ring-ring">
        <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try “electrostatics”, “Rotational motion”, “Physics Wallah”…"
          aria-label="Search NTACBT"
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {loadingPapers && !trimmed ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Indexing previous-year papers…
        </p>
      ) : null}

      {!trimmed ? (
        <EmptyIndex index={index} />
      ) : hits.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Nothing matched “{trimmed}”</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a chapter name, a topic, a teacher, or a paper year. Spelling matters less than the
            main word.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {hits.length} result{hits.length === 1 ? "" : "s"} for “{trimmed}”
          </p>
          {groups.map((group) => (
            <section key={group.type}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {TYPE_LABEL[group.type]} · {group.hits.length}
              </h2>
              <ul className="space-y-1.5">
                {group.hits.map((hit) => (
                  <li key={hit.record.id}>
                    <ResultRow record={hit.record} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({ record }: { record: SearchRecord }) {
  return (
    <Link
      to={record.to}
      search={record.search ?? {}}
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent/60"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{record.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{record.subtitle}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {record.source ? (
          <Badge variant="outline" className="text-[10px]" title={record.source}>
            {record.verified ? "verified" : "unverified"}
          </Badge>
        ) : null}
        <Badge variant="secondary" className="text-[10px]">
          {TYPE_LABEL[record.type].replace(/s$/, "")}
        </Badge>
      </span>
    </Link>
  );
}

/** Shown before the first keystroke so the page is never a dead end. */
function EmptyIndex({ index }: { index: SearchRecord[] }) {
  const counts = index.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});
  const rows: SearchResultType[] = [
    "topic",
    "chapter",
    "teacher",
    "institute",
    "paper",
    "test",
    "note",
  ];
  return (
    <div className="rounded-xl border border-dashed p-6">
      <p className="text-sm font-medium">Ready to search</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {rows.map((type) => (
          <li key={type} className="rounded-md border px-3 py-2">
            <span className="block text-lg font-semibold">{counts[type] ?? 0}</span>
            <span className="text-xs text-muted-foreground">{TYPE_LABEL[type]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Topics, chapters, teachers and institutes come from the verified academic source-of-truth;
        papers, tests and notes are whatever this device has.
      </p>
    </div>
  );
}
