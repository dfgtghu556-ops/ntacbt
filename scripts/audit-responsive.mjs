/**
 * Responsive audit — every screen, every breakpoint, measured not guessed.
 *
 * `npm run audit:responsive` walks every `.tsx` under `src/` and the legacy
 * stylesheet, and reports layout patterns that break on a small screen. It is a
 * report, not a gate: it surfaces candidates and a human judges them, because a
 * fixed-width calculator keypad is correct and a fixed-width content card is
 * not, and only a reader can tell those apart.
 *
 * Why it exists: "optimised for every device" was answered twice by reading
 * files by hand, and both times the answer was "mostly fine". That is not a
 * measurement. This makes the claim checkable, per file, and repeatable after
 * every change.
 *
 * ## What it looks for
 *
 * JSX (`src/**\/*.tsx`)
 *   A1  a bare `grid-cols-N` (N>=2) with no responsive prefix and no
 *       `grid-cols-1` base. Tailwind is mobile-first, so this applies at 320px.
 *   A2  `w-[Npx]` / `min-w-[Npx]` with N>=200 and no responsive prefix.
 *   A3  `whitespace-nowrap` — correct on buttons and badges, wrong on prose.
 *   A4  a `<table>` with no `overflow-x-auto` in the same file.
 *   A5  `text-[Npx]` with N>=20 and no responsive prefix.
 *   A6  `h-screen` / `min-h-screen`, for the record.
 *
 * CSS (`public/css/legacy.css`)
 *   C1  `width: Npx` (N>=200) outside any `@media`.
 *   C2  `min-width: Npx` (N>=180) outside any `@media`.
 *   C3  `grid-template-columns` naming 2+ fixed tracks with no override at a
 *       smaller breakpoint anywhere in the file.
 *   U1  a `src/components/ui/*.tsx` primitive imported nowhere — dead code.
 *
 * ## Reviewed findings
 *
 * A finding that a human has inspected and judged correct is recorded in
 * REVIEWED below with the reason, and is reported as `OK` rather than counted.
 * This is deliberate: an audit that reports ten high-severity problems where
 * none exist is worse than no audit, because it trains the reader to ignore it.
 * Only findings that are still unexplained count.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

/** Directories that are not product UI. */
const SKIP_DIRS = new Set(["node_modules", ".output", "dist", ".git"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, "src")).filter((f) => f.endsWith(".tsx"));

/**
 * Pull every string literal out of a `className=` value.
 *
 * Handles `className="a b"`, `className={`a ${b}`}` and `className={cn("a", x)}`
 * by collecting double-quoted, single-quoted and backtick-quoted runs that
 * appear anywhere inside the braces. Good enough: a class name is a plain token
 * run, and this over-collects rather than misses.
 */
function classNames(source) {
  const found = [];
  const re = /className\s*=\s*/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    let i = m.index + m[0].length;
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const close = source.indexOf(ch, i + 1);
      if (close === -1) continue;
      found.push({ text: source.slice(i + 1, close), at: lineOf(source, i) });
      i = close;
    } else if (ch === "{") {
      // Brace-depth scan to the matching close, then lift string literals.
      let depth = 0;
      let j = i;
      for (; j < source.length; j++) {
        if (source[j] === "{") depth++;
        else if (source[j] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      const inner = source.slice(i + 1, j);
      const strRe = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;
      let s;
      while ((s = strRe.exec(inner)) !== null) {
        found.push({ text: s[1] ?? s[2] ?? s[3] ?? "", at: lineOf(source, i) });
      }
      i = j;
    }
    re.lastIndex = i;
  }
  return found;
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === "\n") line++;
  return line;
}

/** True when any token in the string carries a responsive prefix. */
function hasResponsivePrefix(text) {
  return /(?:^|\s)(?:sm|md|lg|xl|2xl):/.test(text);
}

const findings = [];
function add(file, line, code, severity, detail) {
  findings.push({ file: relative(ROOT, file), line, code, severity, detail });
}

// ── JSX pass ────────────────────────────────────────────────────────────────
for (const file of files) {
  const src = readFileSync(file, "utf8");

  // A4 — a table with no scroll container anywhere in the file.
  const tableCount = (src.match(/<table\b/g) ?? []).length;
  if (tableCount > 0 && !/overflow-x-auto/.test(src)) {
    add(file, 1, "A4", "high", `${tableCount} <table> and no overflow-x-auto in the file`);
  }

  for (const { text, at } of classNames(src)) {
    // A1 — bare multi-column grid.
    const gridMatch = /(?:^|\s)grid-cols-(\d+)(?=\s|$)/.exec(text);
    if (gridMatch && Number(gridMatch[1]) >= 2) {
      const hasBase = /(?:^|\s)grid-cols-1(?=\s|$)/.test(text);
      if (!hasBase && !hasResponsivePrefix(text)) {
        add(
          file,
          at,
          "A1",
          "high",
          `bare grid-cols-${gridMatch[1]} applies at 320px: ${trim(text)}`,
        );
      }
    }

    // A2 — fixed width >= 200px.
    for (const wm of text.matchAll(/(?:^|\s)(?:min-)?w-\[(\d+)px\]/g)) {
      if (Number(wm[1]) >= 200 && !hasResponsivePrefix(text)) {
        add(file, at, "A2", "medium", `${wm[0].trim()} is ${wm[1]}px at every width`);
      }
    }

    // A3 — nowrap.
    if (/(?:^|\s)whitespace-nowrap(?=\s|$)/.test(text)) {
      add(file, at, "A3", "low", `whitespace-nowrap: ${trim(text)}`);
    }

    // A5 — large fixed type.
    for (const tm of text.matchAll(/(?:^|\s)text-\[(\d+)px\]/g)) {
      if (Number(tm[1]) >= 20 && !hasResponsivePrefix(text)) {
        add(file, at, "A5", "low", `text-[${tm[1]}px] at every width`);
      }
    }
  }

  // A6 — viewport-height containers, for the record.
  for (const hm of src.matchAll(/(?:^|\s)(min-h-screen|h-screen)(?=\s|"|`)/g)) {
    add(file, lineOf(src, hm.index), "A6", "info", hm[1]);
  }
}

// ── CSS pass ────────────────────────────────────────────────────────────────
const cssPath = join(ROOT, "public/css/legacy.css");
let cssBlocks = [];
if (statSync(cssPath, { throwIfNoEntry: false })) {
  const css = readFileSync(cssPath, "utf8");
  // Blank comments to spaces, but keep every newline: the replacement must
  // preserve both length and line structure, or every line number after a
  // multi-line comment is wrong.
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  cssBlocks = [];
  (function collect(start, end, media) {
    let k = start;
    while (k < end) {
      const open = src.indexOf("{", k);
      if (open === -1 || open >= end) break;
      const selector = src.slice(k, open).replace(/^\}+/, "").trim().replace(/\s+/g, " ");
      let depth = 1;
      let j = open + 1;
      for (; j < end && depth > 0; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
      }
      const body = src.slice(open + 1, j - 1);
      if (/^@(media|supports|container)/.test(selector)) collect(open + 1, j - 1, selector);
      else if (selector) cssBlocks.push({ selector, body, media, line: lineOf(src, open) });
      k = j;
    }
  })(0, src.length, null);

  /** Split a selector list into its individual selectors. */
  const parts = (sel) =>
    sel
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  /**
   * True when some rule inside a `@media` block re-declares
   * `grid-template-columns` for this selector or for a selector in its family.
   *
   * Matching runs in both directions because CSS overrides are written at
   * either specificity: `.mini-grid` inside a breakpoint covers a base rule
   * written `.mini-grid.two` (the override is less specific), and
   * `.mini-grid.two` inside a breakpoint covers a base `.mini-grid` (more
   * specific). Substring containment catches both; `endsWith` alone does not,
   * because ".mini-grid.two" ends with ".two".
   */
  const hasBreakpointOverride = (selector) => {
    const base = parts(selector);
    return cssBlocks.some(
      (o) =>
        o.media !== null &&
        /grid-template-columns/.test(o.body) &&
        parts(o.selector).some((p) => base.some((b) => p === b || b.includes(p) || p.includes(b))),
    );
  };

  for (const b of cssBlocks) {
    if (b.media) continue;
    for (const wm of b.body.matchAll(/(?:^|[;{\s])width\s*:\s*(\d+)px/g)) {
      if (Number(wm[1]) >= 200) {
        add(cssPath, b.line, "C1", "medium", `width:${wm[1]}px on ${b.selector.slice(0, 60)}`);
      }
    }
    for (const wm of b.body.matchAll(/(?:^|[;{\s])min-width\s*:\s*(\d+)px/g)) {
      if (Number(wm[1]) >= 180) {
        add(cssPath, b.line, "C2", "medium", `min-width:${wm[1]}px on ${b.selector.slice(0, 60)}`);
      }
    }
    // C3 — 2+ fixed grid tracks with no smaller-breakpoint override.
    if (/grid-template-columns\s*:\s*(?:repeat\(\s*[2-9]\s*,|[^;]*\d+px\s+\d+px)/.test(b.body)) {
      if (!hasBreakpointOverride(b.selector)) {
        add(
          cssPath,
          b.line,
          "C3",
          "high",
          `multi-track grid on ${b.selector.slice(0, 60)} with no breakpoint override`,
        );
      }
    }
  }
}

// ── U1 — unused UI primitives ───────────────────────────────────────────────
const uiDir = join(ROOT, "src/components/ui");
if (statSync(uiDir, { throwIfNoEntry: false })) {
  const allSrc = walk(join(ROOT, "src"))
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  for (const f of walk(uiDir).filter((f) => /\.tsx?$/.test(f))) {
    const base = f.slice(uiDir.length + 1).replace(/\.tsx?$/, "");
    const re = new RegExp(`from\\s+["'][^"']*\\b${base}["']`, "m");
    if (!re.test(allSrc)) {
      add(f, 1, "U1", "info", `ui/${base} is imported nowhere — dead code`);
    }
  }
}

/**
 * Findings a human has inspected and judged correct, keyed
 * `relative/path:line:CODE`, with the reason. Reported as OK, not counted.
 */
const REVIEWED = {
  // A1 — calculator keypad. Four keys across is the correct phone layout;
  // collapsing it would make the calculator unusable, not responsive.
  "src/features/exams/components/Calculator.tsx:57:A1":
    "calculator keypad — 4 keys across is the intended phone layout",
  // A1 — correct/wrong/skipped/negative summary tiles. Two 1-up tiles is the
  // right density at 320px; a 4-up row would be unreadable.
  "src/features/exams/components/ExamResult.tsx:299:A1":
    "summary tiles — 2-up is the intended phone layout",
  // A4 — the shadcn table primitive. No route renders it, and the one route
  // with a wide table (app.report.tsx) wraps it in `overflow-x-auto` itself.
  "src/components/ui/table.tsx:1:A4": "primitive is unused; callers own their scroll container",
  // C3 — calculator keypad. A fixed key grid is the intended layout.
  "public/css/legacy.css:604:C3": "calculator keypad — a fixed key grid is the intended layout",
  // C3 — a 7-day month grid. Narrow cells are what a calendar is.
  "public/css/legacy.css:1665:C3": "7-day month grid — narrow cells are what a calendar is",
  // C1/C2 — `.exam-calc` is absolutely positioned inside a wrapper that gets
  // its own max-width at <=900px, so the width never overflows the viewport.
  "public/css/legacy.css:549:C1": "absolute panel inside a max-width wrapper at <=900px",
  // C1 — `.palette` becomes a full-width bottom sheet at <=860px.
  "public/css/legacy.css:1324:C1": "becomes a full-width bottom sheet at <=860px",
  // C1 — decorative blur orbs inside an `overflow:hidden` parent.
  "public/css/legacy.css:1591:C1": "decorative blur orb inside overflow:hidden",
  "public/css/legacy.css:2069:C1": "decorative blur orb inside overflow:hidden",
  "public/css/legacy.css:3536:C1": "decorative blur orb inside overflow:hidden",
  "public/css/legacy.css:3678:C1": "decorative blur orb inside overflow:hidden",
  "public/css/legacy.css:3689:C1": "decorative blur orb inside overflow:hidden",
  "public/css/legacy.css:5325:C1": "decorative blur orb inside overflow:hidden",
  "public/css/legacy.css:6024:C1": "decorative blur orb inside overflow:hidden",
  // C2 — `.prow-main` sits in a flex-wrap parent, so it wraps rather than
  // pushing the row wider than the screen.
  "public/css/legacy.css:1909:C2": "flex-wrap parent — wraps instead of overflowing",
  // C2 — the search box widens into a full-width flex row at <=900px.
  "public/css/legacy.css:2923:C2": "search box widens to a full flex row at <=900px and <=380px",
  // C2 — an absolutely positioned dropdown, so it is never in flow.
  "public/css/legacy.css:3791:C2": "absolutely positioned dropdown, not in flow",
  // A2 — inside an `overflow-x-auto` wrapper, so the wide table scrolls
  // instead of widening the page.
  "src/routes/app.report.tsx:404:A2":
    "inside an overflow-x-auto wrapper — scrolls, does not overflow",
  // A3 — buttons and badges. nowrap is correct on a control label.
  "src/components/ui/select.tsx:21:A3": "control label — nowrap is correct",
  "src/components/ui/tabs.tsx:29:A3": "tab label — nowrap is correct",
  "src/routes/app.report.tsx:426:A3": "badge — nowrap is correct",
};

function trim(s) {
  return s.length > 70 ? `${s.slice(0, 70)}…` : s;
}

// ── report ──────────────────────────────────────────────────────────────────
const ORDER = { high: 0, medium: 1, low: 2, info: 3 };
findings.sort(
  (a, b) =>
    ORDER[a.severity] - ORDER[b.severity] || a.file.localeCompare(b.file) || a.line - b.line,
);

const counts = { high: 0, medium: 0, low: 0, info: 0 };
const okCount = { high: 0, medium: 0, low: 0, info: 0 };
for (const f of findings) {
  const key = `${f.file}:${f.line}:${f.code}`;
  if (REVIEWED[key]) okCount[f.severity]++;
  else counts[f.severity]++;
}

const touched = [...new Set(findings.map((f) => f.file))];

process.stdout.write(`Responsive audit — ${files.length} JSX files, legacy.css\n`);
process.stdout.write(
  `Findings: ${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.info} info` +
    ` unexplained, across ${touched.length} files\n`,
);
const okTotal = okCount.high + okCount.medium + okCount.low + okCount.info;
if (okTotal > 0) {
  process.stdout.write(
    `${okTotal} inspected and judged correct ` +
      `(${okCount.high} high, ${okCount.medium} medium, ${okCount.low} low, ${okCount.info} info)\n`,
  );
}

// A REVIEWED key that matches nothing is stale: the finding it excused has gone
// away, and leaving it in place would silently excuse the same pattern if it
// ever came back. Say so rather than let it rot.
const stale = Object.keys(REVIEWED).filter(
  (k) => !findings.some((f) => `${f.file}:${f.line}:${f.code}` === k),
);
if (stale.length > 0) {
  process.stdout.write(
    `\n${stale.length} REVIEWED entr${stale.length === 1 ? "y" : "ies"} no longer matches a finding:\n`,
  );
  for (const k of stale) process.stdout.write(`  ${k}\n`);
}
process.stdout.write("\n");

let last = null;
for (const f of findings) {
  if (f.file !== last) {
    process.stdout.write(`\n${f.file}\n`);
    last = f.file;
  }
  const key = `${f.file}:${f.line}:${f.code}`;
  const reason = REVIEWED[key];
  if (reason) {
    process.stdout.write(
      `  OK     ${f.code} L${String(f.line).padStart(4)}  ${f.detail}\n` +
        `         └─ reviewed: ${reason}\n`,
    );
  } else {
    process.stdout.write(
      `  ${f.severity.toUpperCase().padEnd(6)} ${f.code} L${String(f.line).padStart(4)}  ${f.detail}\n`,
    );
  }
}

if (STRICT && counts.high > 0) {
  process.stdout.write(`\n${counts.high} unexplained high-severity findings.\n`);
  process.exit(1);
}
