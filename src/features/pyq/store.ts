/**
 * The baked question bank, read once and shared by every route that needs it.
 *
 * `public/pyq/` is generated at build time by `scripts/build-pyq.mjs` and is
 * gitignored, so a missing or partial bake is a normal state — every function
 * here degrades to an empty result rather than throwing, because a student who
 * cannot reach the network should still get a usable app.
 *
 * ## Why this module exists
 *
 * Four routes (`/app`, `/app/pyq`, `/app/tests`, `/cbt`) each fetched the index
 * and then every paper, with `cache: "no-store"` on all 15 fetch sites. The
 * baked payload is ~254 KB of JSON, and it is immutable once built, so this
 * re-downloaded and re-parsed the whole bank on every navigation. On the slow
 * connections this app targets that is the difference between the PYQ list
 * appearing and a spinner that never resolves.
 *
 * Two fixes, both invisible to the caller:
 *
 * 1. **The baked files are cached.** They are build artifacts with no freshness
 *    question to answer, so they are read with the browser's default cache
 *    rather than being invalidated on every request. The live API route stays
 *    `no-store` — see `livePaper`.
 * 2. **Each payload is fetched and parsed once per session.** The index and
 *    every paper are memoised in module scope, so moving Home → PYQs → Tests
 *    costs no further network round-trips and no re-parse.
 *
 * Memoising in module scope is safe here: every consumer loads from inside an
 * effect, so the cache only ever populates on the client, and a failed fetch is
 * not cached — a transient network error should not be remembered as "the bank
 * is empty" for the rest of the session.
 */

/* ── shapes ──────────────────────────────────────────────────────────── */

/** One entry in the baked index — enough to render a paper row. */
export interface PaperMeta {
  id: string;
  year: number;
  month: string;
  label: string;
  total: number;
  counts: { Physics: number; Chemistry: number; Mathematics: number };
  mcq: number;
  integer: number;
}

/** One option of an MCQ, already carrying its label ("1".."4"). */
export interface PyqOption {
  label: string;
  text: string;
}

/**
 * A single question, as transcribed.
 *
 * `type` is narrowed to the two values the baker is allowed to emit —
 * `scripts/validate-pyq-store.mjs` fails the build on anything else — and
 * `options` is always an array, empty for an integer question. Both were
 * transcribed loosely at first and then tightened at every call site, which is
 * why each consumer used to re-declare this shape.
 */
export interface PyqQuestion {
  no: number;
  text: string;
  subject: string;
  chapter?: string;
  topic?: string;
  type: "mcq" | "integer";
  options: PyqOption[];
  answer: string;
  sol?: string;
}

/** A whole paper file. The questions are nested under `paper`. */
export interface PaperFile {
  paper?: { id?: string; meta?: PaperMeta; questions?: PyqQuestion[] };
  questions?: PyqQuestion[];
}

/** A question flattened out of its paper, carrying where it came from. */
export interface BankQuestion {
  id: string;
  paperId: string;
  paperLabel: string;
  subject: string;
  chapter: string;
  topic: string;
  type: "mcq" | "integer";
  text: string;
  options: PyqOption[];
  answer: string;
  sol?: string;
}

/* ── the cache ───────────────────────────────────────────────────────── */

const indexCache = new Map<string, Promise<PaperMeta[]>>();
const paperCache = new Map<string, Promise<PyqQuestion[]>>();
const bankCache = new Map<string, Promise<BankQuestion[]>>();

/** Drop every memoised payload. Test-only. */
export function clearPyqCache(): void {
  indexCache.clear();
  paperCache.clear();
  bankCache.clear();
}

/**
 * Memoise `load`, but only once it has actually produced something.
 *
 * An empty result is ambiguous: it means either "this build genuinely has no
 * bake" or "the request just failed". Caching it would remember a dropped
 * connection as "the bank is empty" for the rest of the session, which is the
 * bug this whole module exists to avoid. So an empty result is evicted and the
 * next caller retries — a 404 is cheap, and a retry is what a student who just
 * got their signal back actually wants.
 *
 * Callers that arrive while a fetch is in flight share the same promise, so a
 * slow connection still costs one round-trip rather than four.
 */
function memoised(
  cache: Map<string, Promise<unknown>>,
  key: string,
  load: () => Promise<unknown[]>,
): Promise<never> {
  const existing = cache.get(key);
  if (existing) return existing as Promise<never>;
  const promise = load().then((rows) => {
    if (rows.length === 0) cache.delete(key);
    return rows;
  });
  cache.set(key, promise);
  return promise as Promise<never>;
}

/**
 * The baked index, or `[]` when the bake is absent.
 *
 * The index carries either an `index` or a `papers` array depending on which
 * version of the baker wrote it, so both are accepted.
 */
export function loadPaperIndex(): Promise<PaperMeta[]> {
  return memoised(indexCache, "index", fetchIndex) as Promise<PaperMeta[]>;
}

async function fetchIndex(): Promise<PaperMeta[]> {
  try {
    const res = await fetch("/pyq/index.json");
    if (!res.ok) return [];
    const data = (await res.json()) as { index?: PaperMeta[]; papers?: PaperMeta[] };
    return data.index ?? data.papers ?? [];
  } catch {
    return [];
  }
}

/**
 * One paper's questions, or `[]` if it cannot be read.
 *
 * Questions are nested under `paper` in the current bake; older bakes put them
 * at the top level, so both are read.
 */
export function loadPaperQuestions(paperId: string): Promise<PyqQuestion[]> {
  return memoised(paperCache, paperId, () => fetchPaper(paperId)) as Promise<PyqQuestion[]>;
}

async function fetchPaper(paperId: string): Promise<PyqQuestion[]> {
  try {
    const res = await fetch(`/pyq/${encodeURIComponent(paperId)}.json`);
    if (!res.ok) return [];
    const data = (await res.json()) as PaperFile;
    return data.paper?.questions ?? data.questions ?? [];
  } catch {
    return [];
  }
}

/**
 * Every question in the bank, flattened and tagged with its paper.
 *
 * This is what the DPP builder, global search and the test picker need. It is
 * memoised as a whole rather than composed from `loadPaperQuestions` so that a
 * paper already fetched for a paper view is reused instead of being fetched
 * again for the bank.
 */
export function loadQuestionBank(): Promise<BankQuestion[]> {
  return memoised(bankCache, "bank", fetchBank) as Promise<BankQuestion[]>;
}

async function fetchBank(): Promise<BankQuestion[]> {
  const papers = await loadPaperIndex();
  const rows: BankQuestion[] = [];
  const perPaper = await Promise.all(
    // Parallel, not sequential: awaiting in a loop costs one round-trip per
    // paper, which on a slow connection is the whole latency budget.
    papers.map(async (meta) => {
      const questions = await loadPaperQuestions(meta.id);
      const out: BankQuestion[] = [];
      for (const q of questions) {
        const text = q["text"];
        const subject = q["subject"];
        if (typeof text !== "string" || typeof subject !== "string" || !text.trim()) continue;
        out.push({
          id: `${meta.id}::${String(q["no"] ?? out.length)}`,
          paperId: meta.id,
          paperLabel: meta.label,
          subject,
          chapter: String(q["chapter"] ?? ""),
          topic: String(q["topic"] ?? ""),
          type: q["type"] === "integer" ? "integer" : "mcq",
          text,
          options: Array.isArray(q["options"]) ? (q["options"] as PyqOption[]) : [],
          answer: String(q["answer"] ?? ""),
          ...(typeof q["sol"] === "string" ? { sol: q["sol"] as string } : {}),
        });
      }
      return out;
    }),
  );
  for (const batch of perPaper) rows.push(...batch);
  return rows;
}

/**
 * A paper from the live library API, falling back to the baked file.
 *
 * Unlike the baked store this endpoint proxies an upstream snapshot, so its
 * answers can change between deploys and it is deliberately never cached. The
 * caller gets `[]` when neither source has anything, which is a real state on a
 * partially baked build.
 */
export async function loadPaperWithFallback(paperId: string): Promise<PyqQuestion[]> {
  try {
    const res = await fetch(`/api/public/pyq-papers?paper=${encodeURIComponent(paperId)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { paper?: { questions?: PyqQuestion[] } };
      const questions = data.paper?.questions ?? [];
      if (questions.length) return questions;
    }
  } catch {
    /* fall through to the baked file */
  }
  return loadPaperQuestions(paperId);
}
