import { createFileRoute } from "@tanstack/react-router";

/**
 * JEE MAIN PYQ PAPERS — FALLBACK API behind the "PYQ Papers" tab.
 *
 * PRIMARY serving path is STATIC: scripts/build-pyq.mjs bakes the full
 * dataset into public/pyq/ at build time, so papers ship WITH the site
 * itself (like every big ed-tech company hosts its own PYQs) — no cloud
 * storage, no third-party service in the serving path.
 *
 * This endpoint only serves when the static files aren't there yet
 * (e.g. the very first deploy raced the bake, or a build ran without
 * network). It reads the same fixed dataset snapshot
 * (ruh-ai/grafite-jee-mains-qna-no-img, 11,392 rows) and keeps it
 * in memory — nothing is ever written anywhere.
 *
 * GET ?list=1     → { papers: PaperMeta[], source }
 * GET ?paper=<id> → { paper: { id, meta, questions } }
 */

interface PyqQuestion {
  no: number;
  subject: "Physics" | "Chemistry" | "Mathematics";
  chapter: string;
  topic: string;
  type: "mcq" | "integer";
  text: string;
  options: { label: string; text: string }[];
  answer: string;
  /** Non-exact integer keys NTA published: {kind:"range",lo,hi} | {kind:"any",vals} | {kind:"all"} (bonus) */
  accept?:
    { kind: "range"; lo: number; hi: number } | { kind: "any"; vals: number[] } | { kind: "all" };
  sol: string;
}
interface PaperMeta {
  id: string;
  year: number;
  month: string; // "January" | ... | "Offline" | "AIEEE"
  label: string; // "27 Jan · Morning Shift"
  total: number;
  counts: { Physics: number; Chemistry: number; Mathematics: number };
  mcq: number;
  integer: number;
}
interface Dataset {
  v: number;
  builtAt: number;
  papers: Record<string, PyqQuestion[]>;
  index: PaperMeta[];
}

const HF_PARQUET =
  "https://huggingface.co/datasets/ruh-ai/grafite-jee-mains-qna-no-img/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet";
let DATA: Dataset | null = null;
let building: Promise<Dataset | null> | null = null;
let source = "none";

const SUBJ: Record<string, PyqQuestion["subject"]> = {
  physics: "Physics",
  chemistry: "Chemistry",
  maths: "Mathematics",
  mathematics: "Mathematics",
};
const pretty = (slug: string) =>
  String(slug || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/** "600to700" | "30OR60" | "58" | "Bonus" → answer + accept rule */
export function parseIntegerKey(raw: string): { answer: string; accept?: PyqQuestion["accept"] } {
  const s = String(raw || "").trim();
  if (!s || /bonus/i.test(s)) return { answer: "0", accept: { kind: "all" } };
  const range = s.match(/^(-?[\d.]+)\s*to\s*(-?[\d.]+)$/i);
  if (range) {
    const lo = parseFloat(range[1] ?? ""),
      hi = parseFloat(range[2] ?? "");
    if (isFinite(lo) && isFinite(hi))
      return {
        answer: String(lo),
        accept: { kind: "range", lo: Math.min(lo, hi), hi: Math.max(lo, hi) },
      };
  }
  const anyOf = s
    .split(/\s*OR\s*/i)
    .map((x) => parseFloat(x))
    .filter((x) => isFinite(x));
  if (anyOf.length > 1) return { answer: String(anyOf[0]), accept: { kind: "any", vals: anyOf } };
  const n = parseFloat(s.replace(/,/g, ""));
  return { answer: isFinite(n) ? String(n) : s };
}

/** Raw dataset row → clean question (null = unusable row, skipped). */
export function transformRow(
  row: Record<string, unknown>,
): (PyqQuestion & { paperId: string }) | null {
  const paperId = String(row["paper_id"] || "");
  const subject = SUBJ[String(row["subject"] || "").toLowerCase()];
  const text = String(row["question"] || "").trim();
  const qtype = String(row["question_type"] || "").toLowerCase();
  if (!paperId || !subject || !text) return null;

  let options: { label: string; text: string }[] = [];
  let answer = "";
  let accept: PyqQuestion["accept"] | undefined;

  if (qtype === "integer") {
    const parsed = parseIntegerKey(String(row["answer"] ?? ""));
    answer = parsed.answer;
    accept = parsed.accept;
  } else {
    try {
      const opts = JSON.parse(String(row["options"] || "[]")) as {
        identifier?: string;
        content?: string;
      }[];
      options = opts
        .filter((o) => o && o.identifier)
        .map((o) => ({
          label: String(o.identifier).toLowerCase(),
          text: String(o.content || "").trim(),
        }));
    } catch {
      return null;
    }
    if (options.length < 2) return null;
    try {
      const co = JSON.parse(String(row["correct_option"] || "[]")) as string[];
      answer = String(co[0] || "").toLowerCase();
    } catch {
      return null;
    }
    if (!answer || !options.some((o) => o.label === answer)) return null;
  }
  const sol = String(row["explanation"] || row["solution"] || "")
    .trim()
    .slice(0, 2400);
  return {
    paperId,
    no: 0,
    subject,
    chapter: pretty(String(row["chapter"] || "")),
    topic: pretty(String(row["topic"] || "")),
    type: qtype === "integer" ? "integer" : "mcq",
    text,
    options,
    answer,
    ...(accept ? { accept } : {}),
    sol,
  };
}

/** "jee-main-2024-online-27th-january-morning-shift" → meta parts */
export function parsePaperId(id: string): { year: number; month: string; label: string } | null {
  let m = id.match(
    /^jee-main-(\d{4})-online-(\d+)(?:st|nd|rd|th)?-([a-z]+)-(morning|evening)-(?:shift|slot)$/i,
  );
  if (m) {
    const month = pretty(m[3] ?? "");
    return {
      year: +(m[1] ?? 0),
      month,
      label: `${m[2]} ${month.slice(0, 3)} · ${pretty(m[4] ?? "")} Shift`,
    };
  }
  m = id.match(/^jee-main-(\d{4})-offline$/i);
  if (m) return { year: +(m[1] ?? 0), month: "Offline", label: "Offline Paper" };
  m = id.match(
    /^jee-main-(\d{4})-online-(\d+)(?:st|nd|rd|th)?-([a-z]+)-(?:morning|evening)?-?(?:shift|slot)?$/i,
  );
  if (m)
    return {
      year: +(m[1] ?? 0),
      month: pretty(m[3] ?? ""),
      label: `${m[2]} ${pretty(m[3] ?? "").slice(0, 3)}`,
    };
  m = id.match(/^aieee-(\d{4})$/i);
  if (m) return { year: +(m[1] ?? 0), month: "AIEEE", label: `AIEEE ${m[1]} (Full Paper)` };
  return null;
}

const SUBJECT_ORDER = { Physics: 0, Chemistry: 1, Mathematics: 2 } as const;

export function buildDataset(rows: Record<string, unknown>[]): Dataset {
  const byPaper = new Map<string, (PyqQuestion & { paperId: string })[]>();
  for (const row of rows) {
    const q = transformRow(row);
    if (!q) continue;
    const list = byPaper.get(q.paperId) || [];
    list.push(q);
    byPaper.set(q.paperId, list);
  }
  const papers: Record<string, PyqQuestion[]> = {};
  const index: PaperMeta[] = [];
  for (const [id, qs] of byPaper) {
    const meta = parsePaperId(id);
    if (!meta) continue;
    if (qs.length < 30) continue; // stray fragments (1-2 salvaged questions) aren't a paper
    // Real NTA on-screen order: Physics → Chemistry → Maths, MCQs before numericals.
    qs.sort(
      (a, b) =>
        SUBJECT_ORDER[a.subject] - SUBJECT_ORDER[b.subject] ||
        (a.type === b.type ? 0 : a.type === "mcq" ? -1 : 1),
    );
    const counts = { Physics: 0, Chemistry: 0, Mathematics: 0 };
    let mcq = 0,
      integer = 0;
    qs.forEach((q, i) => {
      q.no = i + 1;
      counts[q.subject]++;
      if (q.type === "mcq") mcq++;
      else integer++;
    });
    papers[id] = qs.map(({ paperId: _p, ...rest }) => rest);
    index.push({
      id,
      year: meta.year,
      month: meta.month,
      label: meta.label,
      total: qs.length,
      counts,
      mcq,
      integer,
    });
  }
  index.sort((a, b) => b.year - a.year || a.id.localeCompare(b.id));
  return { v: 1, builtAt: Date.now(), papers, index };
}

async function loadFromUpstream(): Promise<Dataset | null> {
  try {
    const r = await fetch(HF_PARQUET, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const { parquetReadObjects } = await import("hyparquet");
    const { compressors } = await import("hyparquet-compressors");
    const rows = (await parquetReadObjects({ file: buf, compressors })) as Record<
      string,
      unknown
    >[];
    if (!rows?.length) return null;
    const data = buildDataset(rows);
    return data.index.length ? data : null;
  } catch {
    return null;
  }
}

/** Belt-and-braces: if the parquet path fails (dependency missing, file
 *  moved), page through the dataset-server rows API — same snapshot,
 *  no libraries needed. Result stays in memory only. */
async function loadFromRowsApi(): Promise<Dataset | null> {
  const base =
    "https://datasets-server.huggingface.co/rows?dataset=ruh-ai%2Fgrafite-jee-mains-qna-no-img&config=default&split=train";
  try {
    const first = await fetch(`${base}&offset=0&length=100`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!first.ok) return null;
    const fd = (await first.json()) as {
      num_rows_total?: number;
      rows?: { row: Record<string, unknown> }[];
    };
    const total = fd.num_rows_total || 0;
    if (!total || !fd.rows?.length) return null;
    const all: Record<string, unknown>[] = fd.rows.map((r) => r.row);
    const offsets: number[] = [];
    for (let o = 100; o < total; o += 100) offsets.push(o);
    // 5-way concurrency: fast but polite
    for (let i = 0; i < offsets.length; i += 5) {
      const batch = offsets.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (o) => {
          const r = await fetch(`${base}&offset=${o}&length=100`, {
            signal: AbortSignal.timeout(20_000),
          });
          if (!r.ok) throw new Error(String(r.status));
          const d = (await r.json()) as { rows?: { row: Record<string, unknown> }[] };
          return (d.rows || []).map((x) => x.row);
        }),
      );
      for (const res of results) if (res.status === "fulfilled") all.push(...res.value);
    }
    if (all.length < total * 0.9) return null; // too many gaps to trust
    const data = buildDataset(all);
    return data.index.length ? data : null;
  } catch {
    return null;
  }
}

async function ensureData(): Promise<Dataset | null> {
  if (DATA) return DATA;
  if (!building) {
    building = (async () => {
      let d = await loadFromUpstream();
      if (d) source = "snapshot";
      else {
        d = await loadFromRowsApi();
        if (d) source = "rows-api";
      }
      DATA = d;
      building = null;
      return d;
    })();
  }
  return building;
}

export const Route = createFileRoute("/api/public/pyq-papers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const data = await ensureData();
        if (!data) {
          return Response.json(
            {
              error:
                "PYQ library is warming up or temporarily unreachable — try again in a minute.",
            },
            { status: 503 },
          );
        }
        const paperId = u.searchParams.get("paper");
        if (paperId) {
          const qs = data.papers[paperId];
          const meta = data.index.find((p) => p.id === paperId);
          if (!qs || !meta) return Response.json({ error: "Paper not found" }, { status: 404 });
          return Response.json(
            { paper: { id: paperId, meta, questions: qs } },
            { headers: { "cache-control": "public, max-age=86400" } },
          );
        }
        return Response.json(
          { papers: data.index, source },
          { headers: { "cache-control": "public, max-age=3600" } },
        );
      },
    },
  },
});
