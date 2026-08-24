#!/usr/bin/env node
/**
 * BAKE PYQ PAPERS INTO THE SITE — runs automatically before every build
 * (see package.json "prebuild"). Like every serious ed-tech company, the
 * previous-year papers are served from OUR OWN site as static files:
 *
 *   public/pyq/index.json      → list of all papers (meta)
 *   public/pyq/<paper-id>.json → one full paper each (questions+answers+solutions)
 *
 * Zero runtime dependencies: after the build, students download papers
 * from this site itself — no cloud storage, no third-party API, works
 * even if the upstream dataset disappears tomorrow.
 *
 * Source: fixed versioned snapshot of an open JEE Main PYQ dataset
 * (ruh-ai/grafite-jee-mains-qna-no-img, 11,392 rows; derived from public
 * examside data). The snapshot never changes, so builds are reproducible.
 *
 * Resilience:
 * - If public/pyq/index.json ALREADY exists (committed to the repo or
 *   produced by an earlier build), the script keeps it and exits 0 —
 *   builds never break because of a network hiccup.
 * - Parquet path first (1 request); rows-API paging as fallback.
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "pyq");
const HF_PARQUET =
  "https://huggingface.co/datasets/ruh-ai/grafite-jee-mains-qna-no-img/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet";
const ROWS_API =
  "https://datasets-server.huggingface.co/rows?dataset=ruh-ai%2Fgrafite-jee-mains-qna-no-img&config=default&split=train";
// Source 2: latest-session papers (2025, 2026) — a PINNED list of exact
// files at a PINNED commit (frozen snapshot, exactly like the parquet
// source). NOTHING here auto-updates from anyone's future pushes: the
// same bytes are fetched forever; only we can ever move this pin.
const SK_COMMIT = "4d5a80388c3a86fd278f0a581e0de069e5dfae34";
const SK_RAW =
  `https://raw.githubusercontent.com/Samkarya/online-exam-questions/${SK_COMMIT}/India/undergraduate/JEEMains/`;
const SK_FILES = [
  "jeeMain_2025_22Jan_shift1.json",
  "jeeMain_2025_22Jan_shift2.json",
  "jeeMain_2026_02April_shift1.json",
  "jeeMain_2026_02April_shift2.json",
  "jeeMain_2026_04April_shift1.json",
];

const SUBJ = { physics: "Physics", chemistry: "Chemistry", maths: "Mathematics", mathematics: "Mathematics" };
const pretty = (s) => String(s || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

function parseIntegerKey(raw) {
  const s = String(raw || "").trim();
  if (!s || /bonus/i.test(s)) return { answer: "0", accept: { kind: "all" } };
  const range = s.match(/^(-?[\d.]+)\s*to\s*(-?[\d.]+)$/i);
  if (range) {
    const lo = parseFloat(range[1]), hi = parseFloat(range[2]);
    if (isFinite(lo) && isFinite(hi))
      return { answer: String(lo), accept: { kind: "range", lo: Math.min(lo, hi), hi: Math.max(lo, hi) } };
  }
  const anyOf = s.split(/\s*OR\s*/i).map((x) => parseFloat(x)).filter((x) => isFinite(x));
  if (anyOf.length > 1) return { answer: String(anyOf[0]), accept: { kind: "any", vals: anyOf } };
  const n = parseFloat(s.replace(/,/g, ""));
  return { answer: isFinite(n) ? String(n) : s };
}

function transformRow(row) {
  const paperId = String(row.paper_id || "");
  const subject = SUBJ[String(row.subject || "").toLowerCase()];
  const text = String(row.question || "").trim();
  const qtype = String(row.question_type || "").toLowerCase();
  if (!paperId || !subject || !text) return null;
  let options = [], answer = "", accept;
  if (qtype === "integer") {
    const parsed = parseIntegerKey(String(row.answer ?? ""));
    answer = parsed.answer; accept = parsed.accept;
  } else {
    try {
      options = JSON.parse(String(row.options || "[]"))
        .filter((o) => o && o.identifier)
        .map((o) => ({ label: String(o.identifier).toLowerCase(), text: String(o.content || "").trim() }));
    } catch { return null; }
    if (options.length < 2) return null;
    try { answer = String((JSON.parse(String(row.correct_option || "[]"))[0]) || "").toLowerCase(); }
    catch { return null; }
    if (!answer || !options.some((o) => o.label === answer)) return null;
  }
  const sol = String(row.explanation || row.solution || "").trim().slice(0, 2400);
  return { paperId, no: 0, subject, chapter: pretty(String(row.chapter || "")), topic: pretty(String(row.topic || "")),
    type: qtype === "integer" ? "integer" : "mcq", text, options, answer, ...(accept ? { accept } : {}), sol };
}

function parsePaperId(id) {
  let m = id.match(/^jee-main-(\d{4})-online-(\d+)(?:st|nd|rd|th)?-([a-z]+)-(morning|evening)-(?:shift|slot)$/i);
  if (m) { const month = pretty(m[3]); return { year: +m[1], month, label: `${m[2]} ${month.slice(0, 3)} · ${pretty(m[4])} Shift` }; }
  m = id.match(/^jee-main-(\d{4})-offline$/i);
  if (m) return { year: +m[1], month: "Offline", label: "Offline Paper" };
  m = id.match(/^jee-main-(\d{4})-online-(\d+)(?:st|nd|rd|th)?-([a-z]+)-(?:morning|evening)?-?(?:shift|slot)?$/i);
  if (m) { return { year: +m[1], month: pretty(m[3]), label: `${m[2]} ${pretty(m[3]).slice(0, 3)}` }; }
  m = id.match(/^aieee-(\d{4})$/i);
  if (m) return { year: +m[1], month: "AIEEE", label: `AIEEE ${m[1]} (Full Paper)` };
  return null;
}

const SUBJECT_ORDER = { Physics: 0, Chemistry: 1, Mathematics: 2 };

function buildDataset(rows) {
  const byPaper = new Map();
  for (const row of rows) {
    const q = transformRow(row);
    if (!q) continue;
    const list = byPaper.get(q.paperId) || [];
    list.push(q); byPaper.set(q.paperId, list);
  }
  const papers = {}, index = [];
  for (const [id, qs] of byPaper) {
    const meta = parsePaperId(id);
    if (!meta || qs.length < 30) continue;
    qs.sort((a, b) => SUBJECT_ORDER[a.subject] - SUBJECT_ORDER[b.subject] || (a.type === b.type ? 0 : a.type === "mcq" ? -1 : 1));
    const counts = { Physics: 0, Chemistry: 0, Mathematics: 0 };
    let mcq = 0, integer = 0;
    qs.forEach((q, i) => { q.no = i + 1; counts[q.subject]++; q.type === "mcq" ? mcq++ : integer++; });
    papers[id] = qs.map(({ paperId, ...rest }) => rest);
    index.push({ id, year: meta.year, month: meta.month, label: meta.label, total: qs.length, counts, mcq, integer });
  }
  index.sort((a, b) => b.year - a.year || a.id.localeCompare(b.id));
  return { papers, index };
}

async function fromParquet() {
  const r = await fetch(HF_PARQUET, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error("parquet http " + r.status);
  const buf = await r.arrayBuffer();
  const { parquetReadObjects } = await import("hyparquet");
  const { compressors } = await import("hyparquet-compressors");
  return parquetReadObjects({ file: buf, compressors });
}

/* ---- Source 2: recent-year papers kept as plain JSON files ----------------
   Format (examify): [{question_number, subject, question_text,
   options:{a..d}, correct_answer, explanation, topic, difficulty}, ...]
   File names: jeeMain_2025_22Jan_shift1.json → paper id + label.
   Some rows have subject:null — infer by position (25 PHY / 25 CHE / 25 MAT
   is NOT reliable there; instead use the printed order + topic keywords). */
const PHY_T = /physic|mechanic|thermo|optic|electro|magnet|current|wave|kinemat|gravit|semicond|units|dimension|modern|nuclei|atom|dual|communication|alternating|capacit|oscillat|motion|power|energy|momentum|elastic|fluid|kinetic/i;
const CHE_T = /chem|organic|inorganic|periodic|bond|acid|base|salt|solution|equilibri|electrochem|metallurg|polymer|biomolec|alcohol|alde|amine|halo|hydrocarbon|coordination|block|table|mole|atomic structure|surface|environment/i;
const MAT_T = /math|algebra|calculus|integr|differenti|matrix|matrices|determinant|vector|probability|statistic|trigono|geometr|parabola|ellipse|hyperbola|circle|line|series|sequence|binomial|permutation|complex|function|limit|continuity|set|relation|reasoning/i;
function skSubject(row, idx, total) {
  const s = String(row.subject || "").toLowerCase();
  if (SUBJ[s]) return SUBJ[s];
  const t = String(row.topic || "");
  if (MAT_T.test(t)) return "Mathematics";
  if (CHE_T.test(t)) return "Chemistry";
  if (PHY_T.test(t)) return "Physics";
  // positional fallback: papers print MAT → PHY → CHE or PHY → CHE → MAT in thirds
  const third = Math.floor((idx / Math.max(1, total)) * 3);
  return ["Physics", "Chemistry", "Mathematics"][third] || "Physics";
}
function skTransform(rows, paperId) {
  const out = [];
  rows.forEach((row, i) => {
    const text = String(row.question_text || "").trim();
    if (!text) return;
    const optsObj = row.options || {};
    const keys = Object.keys(optsObj);
    const isInt = keys.length === 0 || row.question_type === "integer";
    let options = [], answer = "", accept;
    if (isInt) {
      const parsed = parseIntegerKey(String(row.correct_answer ?? row.answer ?? ""));
      answer = parsed.answer; accept = parsed.accept;
      if (!answer) return;
    } else {
      options = keys.map((k) => ({ label: k.toLowerCase(), text: String(optsObj[k] ?? "").trim() }));
      if (options.length < 2) return;
      answer = String(row.correct_answer || "").toLowerCase();
      if (!answer || !options.some((o) => o.label === answer)) return;
    }
    out.push({ paperId, no: 0, subject: skSubject(row, i, rows.length),
      chapter: pretty(String(row.topic || "")), topic: pretty(String(row.topic || "")),
      type: isInt ? "integer" : "mcq", text, options, answer, ...(accept ? { accept } : {}),
      sol: String(row.explanation || "").trim().slice(0, 2400) });
  });
  return out;
}
function skPaperId(name) {
  // jeeMain_2025_22Jan_shift1.json → {id, year, month, label}
  const m = name.match(/^jeeMain_(\d{4})_(\d{1,2})([A-Za-z]+)_shift(\d)\.json$/);
  if (!m) return null;
  const months = { jan: "January", feb: "February", mar: "March", apr: "April", april: "April", jun: "June", jul: "July", aug: "August", sep: "September" };
  const month = months[m[3].toLowerCase()] || pretty(m[3]);
  return { id: `jee-main-${m[1]}-online-${m[2]}-${month.toLowerCase()}-${m[4] === "1" ? "morning" : "evening"}-shift`,
    year: +m[1], month, label: `${m[2]} ${month.slice(0, 3)} · ${m[4] === "1" ? "Morning" : "Evening"} Shift` };
}
async function fromLatestJson() {
  const out = { rowsByPaper: new Map(), metas: [] };
  for (const name of SK_FILES) {
    const meta = skPaperId(name);
    if (!meta) continue;
    try {
      const pr = await fetch(SK_RAW + name, { signal: AbortSignal.timeout(60_000) });
      if (!pr.ok) continue;
      const rows = await pr.json();
      if (!Array.isArray(rows) || rows.length < 30) continue;
      const qs = skTransform(rows, meta.id);
      if (qs.length >= 30) { out.rowsByPaper.set(meta.id, qs); out.metas.push(meta); }
    } catch { /* skip one bad file, keep the rest */ }
  }
  return out;
}

async function fromRowsApi() {
  const first = await fetch(`${ROWS_API}&offset=0&length=100`, { signal: AbortSignal.timeout(30_000) });
  if (!first.ok) throw new Error("rows http " + first.status);
  const fd = await first.json();
  const total = fd.num_rows_total || 0;
  const all = (fd.rows || []).map((r) => r.row);
  const offsets = [];
  for (let o = 100; o < total; o += 100) offsets.push(o);
  for (let i = 0; i < offsets.length; i += 5) {
    const batch = offsets.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(async (o) => {
      const r = await fetch(`${ROWS_API}&offset=${o}&length=100`, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(String(r.status));
      return ((await r.json()).rows || []).map((x) => x.row);
    }));
    for (const res of results) if (res.status === "fulfilled") all.push(...res.value);
  }
  if (all.length < total * 0.9) throw new Error(`rows api gaps: ${all.length}/${total}`);
  return all;
}

async function main() {
  // Already baked (committed or from a previous build)? Keep it — never
  // fail a build over the network.
  try {
    await access(join(OUT, "index.json"));
    console.log("[pyq] public/pyq/index.json already present — keeping the baked papers.");
    return;
  } catch { /* not baked yet */ }

  console.log("[pyq] baking PYQ papers into public/pyq/ …");
  let rows = null;
  try { rows = await fromParquet(); console.log(`[pyq] parquet snapshot: ${rows.length} rows`); }
  catch (e) {
    console.log("[pyq] parquet failed (" + e.message + "), trying rows API …");
    try { rows = await fromRowsApi(); console.log(`[pyq] rows API: ${rows.length} rows`); }
    catch (e2) { console.warn("[pyq] snapshot dataset unavailable (" + e2.message + ")"); }
  }
  // Source 2: latest sessions (2025/2026 …) from plain-JSON papers
  const latest = await fromLatestJson();
  if (latest.metas.length) console.log(`[pyq] latest-session source: ${latest.metas.length} paper(s) (${latest.metas.map((m) => m.year).join(", ")})`);

  if (!rows && !latest.metas.length) {
    console.warn("[pyq] WARNING: no source reachable. Site still builds; the PYQ tab will use the API fallback until the next build.");
    return; // never break the build
  }

  const { papers, index } = rows ? buildDataset(rows) : { papers: {}, index: [] };
  // merge latest-session papers (they win on id collision — newer data)
  for (const meta of latest.metas) {
    const qs = latest.rowsByPaper.get(meta.id);
    qs.sort((a, b) => SUBJECT_ORDER[a.subject] - SUBJECT_ORDER[b.subject] || (a.type === b.type ? 0 : a.type === "mcq" ? -1 : 1));
    const counts = { Physics: 0, Chemistry: 0, Mathematics: 0 };
    let mcq = 0, integer = 0;
    qs.forEach((q, i) => { q.no = i + 1; counts[q.subject]++; q.type === "mcq" ? mcq++ : integer++; });
    papers[meta.id] = qs.map(({ paperId, ...rest }) => rest);
    const entry = { id: meta.id, year: meta.year, month: meta.month, label: meta.label, total: qs.length, counts, mcq, integer };
    const at = index.findIndex((p) => p.id === meta.id);
    if (at >= 0) index[at] = entry; else index.push(entry);
  }
  index.sort((a, b) => b.year - a.year || a.id.localeCompare(b.id));
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "index.json"), JSON.stringify({ v: 1, builtAt: Date.now(), papers: index }));
  for (const meta of index)
    await writeFile(join(OUT, meta.id + ".json"),
      JSON.stringify({ paper: { id: meta.id, meta, questions: papers[meta.id] } }));
  const totalQ = index.reduce((s, p) => s + p.total, 0);
  const years = [...new Set(index.map((p) => p.year))].sort((a, b) => b - a);
  console.log(`[pyq] baked ${index.length} papers (${years[years.length - 1]}–${years[0]}), ${totalQ} questions → public/pyq/`);
}

main().catch((e) => { console.warn("[pyq] non-fatal:", e.message); });
