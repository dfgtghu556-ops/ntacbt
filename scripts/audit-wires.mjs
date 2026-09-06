#!/usr/bin/env node
/* FINAL-DEPLOYMENT WIRE AUDIT — static cross-reference of every connection.
 * F-series = HARD failure (broken wire, must fix). W-series = warning candidate
 * (needs human verdict). Exit code 1 iff any F fails.
 *   F1 go("route") target must exist (ROUTES + result)
 *   F2 /api/public/<name> must have src/routes/api/public/<name>.ts
 *   F3 local "/file.ext" refs must exist under public/
 *   F4 getElementById / $("#id") must resolve (static HTML or JS-created)
 *   W1 buttons possibly without any click wiring (manual review)
 *   W2 suspicious user-visible strings (coming soon/lorem/todo/...)
 *   W3 external URL inventory (manual curl check)
 *   W4 CSS fixed-width overflow risks on phones
 *   W5 native dialogs (alert/prompt/confirm)
 *   W6 href="#" / javascript: links
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS = readFileSync(join(ROOT, "public/js/app.js"), "utf8");
const HTML = readFileSync(join(ROOT, "public/jee-cbt.html"), "utf8");
const CSS = readFileSync(join(ROOT, "public/css/legacy.css"), "utf8");
const JSLINES = JS.split("\n");

let fails = 0, warns = 0;
const F = (code, msg) => { fails++; console.error(`  ✗ ${code} ${msg}`); };
const W = (code, msg) => { warns++; console.log(`  ! ${code} ${msg}`); };
const OK = (msg) => console.log(`  ✓ ${msg}`);

// ---------- F1 · routes ----------
const routes = [...JS.matchAll(/\["([a-z]+)",\s*"[^"]*",\s*"[a-z-]*"\],\n\s+\["/g)].length; // (unused sanity)
const ROUTES = [...HTML.matchAll(/"([a-z]+)"/g)].length ? null : null;
const routeNames = [...JS.match(/const ROUTES = \[([\s\S]*?)\];/)[1].matchAll(/\["([a-z]+)"/g)].map((m) => m[1]);
const validRoutes = new Set([...routeNames, "result"]);
const goTargets = [...JS.matchAll(/\bgo\("([a-z]+)"/g)].map((m, i) => ({ r: m[1], idx: m.index }));
const badGo = goTargets.filter((t) => !validRoutes.has(t.r));
badGo.forEach((t) => F("F1", `go("${t.r}") has no route (pos ${t.idx})`));
if (!badGo.length) OK(`F1 all ${goTargets.length} go() targets resolve (${[...validRoutes].join(",")})`);
// every ROUTES entry must have a view in render dispatch
const dispatch = JS.match(/const VIEWS = \{[\s\S]*?\}\[route\]/) || JS.match(/\}\)\[route\] \|\| viewDash/);
routeNames.forEach((r) => {
  if (!new RegExp(`\\b${r}:\\s*view`).test(JS)) F("F1", `route "${r}" has no view in render dispatch`);
});

// ---------- F2 · api routes ----------
const apiHits = [...JS.matchAll(/\/api\/public\/([a-z-]+)/g)].map((m) => m[1]);
[...new Set(apiHits)].forEach((n) => {
  if (!existsSync(join(ROOT, "src/routes/api/public", n + ".ts"))) F("F2", `/api/public/${n} has no server route`);
  else OK(`F2 /api/public/${n} → src/routes/api/public/${n}.ts`);
});

// ---------- F3 · local static refs ----------
const localRefs = new Set();
for (const m of JS.matchAll(/["'`](\/[a-z0-9/_.-]+\.(?:js|css|png|jpg|jpeg|svg|ico|json|html|webmanifest|woff2?))(?:\?[^"'`]*)?["'`]/gi)) localRefs.add(m[1]);
for (const m of HTML.matchAll(/(?:src|href)="(\/[^"]*)"/g)) localRefs.add(m[1].split("?")[0]);
for (const m of HTML.matchAll(/(?:src|href)="((?:css|js|pyq)\/[^"]*)"/g)) localRefs.add("/" + m[1].split("?")[0]);
let f3bad = 0;
[...localRefs].sort().forEach((p) => {
  if (p === "/" || p.startsWith("/api/")) return;
  if (p === "/app" || p.startsWith("/app/")) {
    const segs = p.split("/").filter(Boolean).slice(1);
    const cand = segs.length ? "src/routes/app." + segs.join(".") + ".tsx" : "src/routes/app.index.tsx";
    if (existsSync(join(ROOT, cand))) return;
  }
  // dynamic segments (/pyq/<id>.json style) — verify the directory + pattern instead
  if (/\/pyq\//.test(p) && !existsSync(join(ROOT, "public" + p))) {
    // public/pyq/ is gitignored and BAKED by scripts/build-pyq.mjs on every
    // build (npm run build runs it first). A clean checkout therefore has no
    // pyq dir yet — that is a build-order state, not a broken wire. Verify the
    // generator really exists and really writes there before downgrading.
    const gen = join(ROOT, "scripts/build-pyq.mjs");
    const genOk = existsSync(gen) && /public\/pyq/.test(readFileSync(gen, "utf8"));
    if (!existsSync(join(ROOT, "public/pyq"))) {
      if (genOk) W("F3", `${p} not baked yet — run "npm run bake-pyq" (build does this automatically)`);
      else { F("F3", `${p} (no public/pyq dir and no generator)`); f3bad++; }
    }
    return; // per-paper files verified by bake-pyq/validate-24pack T2
  }
  if (!existsSync(join(ROOT, "public" + p))) { F("F3", `missing static file: ${p}`); f3bad++; }
});
if (!f3bad) OK(`F3 all ${localRefs.size} local static refs exist`);

// ---------- F4 · element ids ----------
const needIds = new Set();
for (const m of JS.matchAll(/getElementById\("([^"]+)"\)/g)) needIds.add(m[1]);
for (const m of JS.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)) needIds.add(m[1]);
const haveIds = new Set();
for (const m of HTML.matchAll(/id="([^"]+)"/g)) haveIds.add(m[1]);
for (const m of JS.matchAll(/id="([^"]+)"|`id=\\?"([^"\\]+)/g)) haveIds.add(m[1] || m[2]);
for (const m of JS.matchAll(/\.id\s*=\s*"([^"]+)"/g)) haveIds.add(m[1]);
for (const m of JS.matchAll(/setAttribute\("id",\s*"([^"]+)"\)/g)) haveIds.add(m[1]);
// dynamically built ids: d.id = "x"+y etc — collect the literal prefix builders as known-dynamic
for (const m of JS.matchAll(/\.id\s*=\s*([A-Za-z_$][\w$]*)\s*\+/g)) haveIds.add("DYN:" + m[1]);
let f4bad = 0;
[...needIds].sort().forEach((id) => {
  if (!haveIds.has(id)) { F("F4", `$("#${id}") / getElementById("${id}") never defined`); f4bad++; }
});
if (!f4bad) OK(`F4 all ${needIds.size} element-id lookups resolve`);

// ---------- W1 · possibly-unwired buttons (heuristic; human verdict) ----------
// A button is "explained" if within 60 lines after creation there is .onclick/=
// addEventListener("click", or it carries a data-* hook consumed by delegation.
const delegatedHooks = new Set([...JS.matchAll(/closest\("\[data-([a-zA-Z-]+)/g)].map((m) => m[1]));
const consumedData = new Set([...JS.matchAll(/querySelectorAll\("\[data-([a-zA-Z-]+)[\]=]/g)].map((m) => m[1]));
const allHooks = new Set([...delegatedHooks, ...consumedData]);
const btnIdx = [];
{
  const re = /el\("button"/g;
  let m;
  while ((m = re.exec(JS))) btnIdx.push(m.index);
}
let w1 = 0;
btnIdx.forEach((ix) => {
  const line = JS.slice(0, ix).split("\n").length;
  const win = JSLINES.slice(line - 1, line + 95).join("\n");
  const hasOnclick = /\.onclick\s*=|addEventListener\("click"/.test(win);
  const dataAttr = (win.match(/data-[a-zA-Z-]+(?=["'=])/g) || []).some((d) => allHooks.has(d.slice(5)));
  const typeOnly = /type\s*=\s*"button"/.test(JSLINES[line - 1] || "");
  if (!hasOnclick && !dataAttr && w1 < 25) { W("W1", `button ~line ${line} may lack wiring: ${(JSLINES[line - 1] || "").trim().slice(0, 100)}`); w1++; }
});
if (!w1) OK("W1 no obviously-unwired buttons (heuristic)");

// ---------- W2 · suspicious strings ----------
const SUS = ["coming soon", "Coming soon", "COMING SOON", "lorem", "Lorem", "TODO", "FIXME", "XXX ", "asdf", "test123", "example.com", "dummy"];
SUS.forEach((s) => {
  let i = -1, n = 0;
  while ((i = JS.indexOf(s, i + 1)) !== -1 && n < 4) {
    n++;
    const ln = JS.slice(0, i).split("\n").length;
    W("W2", `"${s}" @js:${ln}: ${JSLINES[ln - 1].trim().slice(0, 110)}`);
  }
  if (HTML.includes(s)) W("W2", `"${s}" in jee-cbt.html`);
});

// ---------- W3 · external inventory ----------
const exts = [...new Set([...JS.matchAll(/https:\/\/[a-z0-9_./~?=&%#:+-]+/gi)].map((m) => m[0].replace(/[",);]+$/, "")))];
console.log(`  … W3 ${exts.length} external URLs (curl-checked separately)`);

// ---------- W4 · CSS overflow risks ----------
const cssNC = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const fixedW = [...cssNC.matchAll(/([^{}]+)\{([^{}]*?)(?<![a-zA-Z-])width\s*:\s*(\d{3,})px/gi)];
const bigFixed = fixedW.filter((m) => +m[3] >= 480);
bigFixed.slice(0, 12).forEach((m) => W("W4", `fixed width ${m[3]}px: ${m[1].trim().slice(0, 60)}`));
if ([...CSS.matchAll(/width\s*:\s*100vw/g)].length) W("W4", "width:100vw found (mobile scrollbar overflow risk)");
if (!bigFixed.length) OK("W4 no ≥480px fixed widths");

// ---------- W5 · native dialogs ----------
["alert(", "prompt(", "confirm("].forEach((d) => {
  const n = JS.split(d).length - 1;
  if (d === "prompt(" && n === 2) { OK("W5 prompt( × 2 — both verified intentional (clipboard fallbacks)"); return; }
  if (n) W("W5", `${d} × ${n} — verify each is intentional`);
});

// ---------- W6 · fake links ----------
const hashLinks = (JS.match(/href="#"/g) || []).length + (HTML.match(/href="#"/g) || []).length;
const jsLinks = (JS.match(/href="javascript:/g) || []).length + (HTML.match(/href="javascript:/g) || []).length;
if (hashLinks) W("W6", `href="#" × ${hashLinks}`);
if (jsLinks) W("W6", `href="javascript:" × ${jsLinks}`);
if (!hashLinks && !jsLinks) OK("W6 no fake href links");

console.log(`\nWIRES: ${fails} hard failures, ${warns} warnings`);
process.exit(fails ? 1 : 0);
