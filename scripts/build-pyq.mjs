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
const SK_TREE_API =
  `https://api.github.com/repos/Samkarya/online-exam-questions/git/trees/${SK_COMMIT}?recursive=1`;
// Baseline: the exact machine-readable 2025/2026 papers known to exist at
// the pinned commit. Every remaining 2025/2026 shift is published only as
// an NTA PDF, so today this is genuinely all there is.
const SK_FILES = [
  "jeeMain_2025_22Jan_shift1.json",
  "jeeMain_2025_22Jan_shift2.json",
  "jeeMain_2026_02April_shift1.json",
  "jeeMain_2026_02April_shift2.json",
  "jeeMain_2026_04April_shift1.json",
];

/** File name must map to a paper via skPaperId() — keeps junk/partial files out. */
const SK_NAME_RE = /^jeeMain_\d{4}_\d{1,2}[A-Za-z]+_shift\d\.json$/;

/**
 * Discover every machine-readable JEEMains paper at the pinned commit.
 * This is the "coverage keeps growing" mechanism: the moment the pinned
 * source repo adds a new 2025/2026 shift file, this build picks it up
 * automatically — no code change needed. It's still a FROZEN snapshot
 * (the pinned commit's tree, never anyone's future pushes).
 * Falls back to SK_FILES if the tree API is unreachable so a network
 * hiccup can never reduce coverage below the known baseline.
 */
async function discoverSkFiles() {
  try {
    const r = await fetch(SK_TREE_API, {
      signal: AbortSignal.timeout(30_000),
      headers: { accept: "application/vnd.github+json", "user-agent": "jee-cbt build" },
    });
    if (!r.ok) throw new Error("tree http " + r.status);
    const tree = await r.json();
    const found = (tree.tree || [])
      .map((t) => t.path || "")
      .filter((p) => /^India\/undergraduate\/JEEMains\/[^/]+\.json$/.test(p))
      .map((p) => p.slice("India/undergraduate/JEEMains/".length))
      .filter((n) => SK_NAME_RE.test(n))
      .sort();
    if (found.length) {
      const added = found.filter((n) => !SK_FILES.includes(n));
      if (added.length) console.log(`[pyq] discovered ${added.length} new machine-readable paper(s): ${added.join(", ")}`);
      return found;
    }
  } catch (e) {
    console.warn("[pyq] paper discovery unavailable (" + e.message + ") — using the pinned baseline list.");
  }
  return SK_FILES;
}

const SUBJ = { physics: "Physics", chemistry: "Chemistry", maths: "Mathematics", mathematics: "Mathematics" };
const pretty = (s) => String(s || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/* ---------- HTML cleanup + image baking ----------
   Dataset text carries HTML markup (<p>, <b>, <br>, &nbsp;, <img …>).
   Students must see clean text, real math and real images — never tags.
   • layout tags → stripped (line breaks preserved)
   • <sub>/<sup> → plain/caret notation (H2O, x^2)
   • entities → decoded
   • <img src="https://…"> → image DOWNLOADED into public/pyq/img/ and the
     tag rewritten to our own path, so figures ship with the site. */
const IMG_TASKS = new Map(); // remote url -> local path (dedup across questions)
function cleanHTML(raw) {
  let t = String(raw || "");
  // protect svg + img from the tag stripper
  const keep = [];
  t = t.replace(/<svg[\s\S]*?<\/svg\s*>/gi, (m) => { keep.push(m); return `\u0001K${keep.length - 1}\u0001`; });
  t = t.replace(/<img\b[^>]*>/gi, (m) => { keep.push(m); return `\u0001K${keep.length - 1}\u0001`; });
  t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n").replace(/<\/tr>/gi, "\n");
  t = t.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, "$1").replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, "^$1");
  t = t.replace(/<td[^>]*>/gi, " ").replace(/<\/td>/gi, "  ");
  t = t.replace(/<\/?(p|b|strong|i|em|u|s|span|div|ul|ol|li|table|tbody|thead|tr|th|h[1-6]|a|center|font|small|big|blockquote|pre|code|section|figure|figcaption)(\s[^>]*)?\/?>/gi, "");
  t = t.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
       .replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'").replace(/&hellip;/gi, "…").replace(/&mdash;/gi, "—")
       .replace(/&times;/gi, "×").replace(/&deg;/gi, "°").replace(/&plusmn;/gi, "±");
  t = t.replace(/\u0001K(\d+)\u0001/g, (_, i) => keep[+i] || "");
  return t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
/** Register every remote <img> for download; rewrite src to /pyq/img/… */
function collectImages(text) {
  return String(text || "").replace(/<img\b([^>]*?)src\s*=\s*["'](https?:\/\/[^"']+)["']([^>]*)>/gi, (m, pre, url, post) => {
    let local = IMG_TASKS.get(url);
    if (!local) {
      const ext = (url.match(/\.(png|jpe?g|gif|webp|svg)(\?|$)/i) || [, "png"])[1].toLowerCase().replace("jpeg", "jpg");
      let h = 0; for (let i = 0; i < url.length; i++) h = ((h << 5) - h + url.charCodeAt(i)) | 0;
      local = `/pyq/img/${(h >>> 0).toString(36)}.${ext}`;
      IMG_TASKS.set(url, local);
    }
    return `<img src="${local}">`;
  });
}
async function downloadImages() {
  if (!IMG_TASKS.size) return 0;
  await mkdir(join(OUT, "img"), { recursive: true });
  let ok = 0;
  const entries = [...IMG_TASKS.entries()];
  for (let i = 0; i < entries.length; i += 6) {
    const batch = entries.slice(i, i + 6);
    const results = await Promise.allSettled(batch.map(async ([url, local]) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000),
        headers: { "user-agent": "Mozilla/5.0 (jee-cbt bake)" } });
      if (!r.ok) throw new Error(String(r.status));
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 2_000_000) throw new Error("too big");
      await writeFile(join(root, "public", local), buf);
    }));
    results.forEach((res) => { if (res.status === "fulfilled") ok++; });
  }
  return ok;
}
/** Full text pipeline for any question/option/solution string. */
function cleanText(s) { return collectImages(cleanHTML(s)); }

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
  const sol = cleanText(String(row.explanation || row.solution || "").trim()).slice(0, 2400);
  return { paperId, no: 0, subject, chapter: pretty(String(row.chapter || "")), topic: pretty(String(row.topic || "")),
    type: qtype === "integer" ? "integer" : "mcq", text: cleanText(text),
    options: options.map((o) => ({ ...o, text: cleanText(o.text) })), answer, ...(accept ? { accept } : {}), sol };
}

function parsePaperId(id) {
  let m = id.match(/^jee-main-(\d{4})-online-(\d+)(?:st|nd|rd|th)?-([a-z]+)-(morning|evening)-(?:shift|slot)$/i);
  if (m) { const month = pretty(m[3]); return { year: +m[1], month, label: `${m[2]} ${month.slice(0, 3)} · ${pretty(m[4])} Shift` }; }
  m = id.match(/^jee-main-(\d{4})-offline$/i);
  if (m) return { year: +m[1], month: "Offline", label: "Offline Paper" };
  m = id.match(/^jee-main-(\d{4})-online-(\d+)(?:st|nd|rd|th)?-([a-z]+)-(?:morning|evening)?-?(?:shift|slot)?$/i);
  if (m) return { year: +m[1], month: pretty(m[3]), label: `${m[2]} ${pretty(m[3]).slice(0, 3)}` };
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
      type: isInt ? "integer" : "mcq", text: cleanText(text),
      options: options.map((o) => ({ ...o, text: cleanText(o.text) })), answer, ...(accept ? { accept } : {}),
      sol: cleanText(String(row.explanation || "").trim()).slice(0, 2400) });
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
async function fromLatestJson(files) {
  const out = { rowsByPaper: new Map(), metas: [] };
  for (const name of files || SK_FILES) {
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
  // Source 2: latest sessions (2025/2026 …) from plain-JSON papers.
  // Auto-discover the pinned source's current machine-readable papers so
  // coverage expands as the source repo adds new shifts.
  const skFiles = await discoverSkFiles();
  const latest = await fromLatestJson(skFiles);
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
  // download every referenced figure into public/pyq/img/ (ships with the site)
  const gotImgs = await downloadImages();
  if (IMG_TASKS.size) console.log(`[pyq] figures: ${gotImgs}/${IMG_TASKS.size} downloaded into public/pyq/img/`);
  const totalQ = index.reduce((s, p) => s + p.total, 0);
  const years = [...new Set(index.map((p) => p.year))].sort((a, b) => b - a);
  console.log(`[pyq] baked ${index.length} papers (${years[years.length - 1]}–${years[0]}), ${totalQ} questions → public/pyq/`);
}

main().catch((e) => { console.warn("[pyq] non-fatal:", e.message); });
