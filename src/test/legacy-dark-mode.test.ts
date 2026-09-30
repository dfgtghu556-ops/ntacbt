/**
 * The legacy tool's dark mode must not leave a hardcoded light surface behind.
 *
 * `public/jee-cbt.html` is the front door - `/` redirects to it - and it has a
 * working theme toggle (light / dark / system) in `public/js/app.js`. The React
 * app at `/app` has no dark mode at all, so *this* is the dark mode students
 * actually use.
 *
 * It themes through tokens: `:root` sets light values, `html.dark` overrides
 * them. Every rule using `var(--panel)` follows the theme. Every rule with a
 * hardcoded `#fff` or `white` does not, and sits as a bright slab on a dark
 * page - the "elements stay white and cannot be seen" report.
 *
 * The invariant this suite pins is the one the fix actually restores:
 *
 *     a rule with a hardcoded light value must carry an `html.dark` override
 *
 * which is exactly the pattern `.qfig` and `.qsvg svg` already followed before
 * this suite existed. A naive "no `#fff` anywhere" rule would be wrong twice
 * over - it would demand changes to blocks that must stay light, and it would
 * pass on a file whose overrides had all been deleted.
 *
 * ## What is deliberately exempt
 *
 * Judged per rule, not by a blanket colour ban:
 *
 *   - `@media print`. Browsers print computed colours and ignore
 *     `prefers-color-scheme`, so print is always light. Same reasoning as the
 *     React app's own `@media print` block.
 *   - `html[data-nta="on"] #examView`. A faithful TCS-iON/NTA console replica:
 *     white paper, black ink, Verdana. The real exam console is white.
 *   - Amber and red surfaces - `.timer.warn`, `.timer.crit`, `.btn.warn`,
 *     `.offline-bar`. Dark ink on a saturated light background is readable in
 *     *both* themes, so there is nothing to fix.
 *   - `.live-thumb .lbadge` and its dot. White on the red LIVE badge; the red is
 *     dark enough to carry white in either theme.
 *
 * `.qfig` and `.qsvg svg` are the precedent for the fix: a question image is ink
 * on paper, so it keeps a light surround via an `html.dark` override.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const CSS = read("public/css/legacy.css");

/** A light background: white, or a #fff/#eee-family hex. */
const LIGHT_BG = /background(-color)?\s*:\s*(white|#[fFeE][0-9a-fA-F]{2,5})\b/;

/** Dark ink, which would be unreadable on a dark panel. */
const DARK_INK = /(?<![-\w])color\s*:\s*#[0-3][0-9a-fA-F]{5}\b/;

/** Rules whose light surface is correct in both themes. */
const EXEMPT_SELECTORS = [
  ".timer.warn",
  ".timer.crit",
  ".btn.warn",
  ".offline-bar",
  ".live-thumb .lbadge",
  ".live-thumb .lbadge .dot",
];

/** Blocks where a light surface is correct, matched against surrounding text. */
const EXEMPT_CONTEXT = ["@media print", 'data-nta="on"'];

interface Rule {
  selector: string;
  body: string;
  /** Line the selector starts on, 1-based. */
  line: number;
}

/**
 * Flatten the stylesheet into top-level rules.
 *
 * Comments are blanked to spaces rather than deleted, so every offset and line
 * number still refers to the real file - a test that reports line 1 for every
 * offender is worse than no line numbers at all.
 */
function rules(): Rule[] {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  const out: Rule[] = [];
  let depth = 0;
  let selStart = 0;
  let bodyStart = -1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      if (depth === 0) bodyStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && bodyStart >= 0) {
        out.push({
          selector: src.slice(selStart, bodyStart).trim(),
          body: src.slice(bodyStart + 1, i),
          line: lineOf(selStart),
        });
        selStart = i + 1;
        bodyStart = -1;
      }
    } else if (ch === ";" && depth === 0) {
      selStart = i + 1;
    }
  }
  return out;
}

/** 1-based line number of a character offset in the original file. */
function lineOf(offset: number): number {
  return CSS.slice(0, offset).split("\n").length;
}

/** Text around a rule, so it can be recognised by the block it sits in. */
function contextOf(rule: Rule, window = 30): string {
  const lines = CSS.split("\n");
  const from = Math.max(0, rule.line - 1 - window);
  const to = Math.min(lines.length, rule.line + window);
  return lines.slice(from, to).join("\n");
}

function isExempt(rule: Rule): boolean {
  // A rule that *is* the override is not a rule that needs one. `.qfig` and
  // `.imgzoom-body img` deliberately keep a light surround because a question
  // image is ink on paper.
  if (rule.selector.startsWith("html.dark")) return true;
  if (EXEMPT_SELECTORS.includes(rule.selector)) return true;
  const ctx = contextOf(rule);
  return EXEMPT_CONTEXT.some((needle) => ctx.includes(needle));
}

/** Every `html.dark` selector that overrides `background` or `color`. */
function darkOverridesFor(prop: "background" | "color"): Set<string> {
  const found = new Set<string>();
  for (const m of CSS.matchAll(/html\.dark\s+([^{]+)\{([^}]*)\}/g)) {
    const body = m[2] ?? "";
    if (!new RegExp(`${prop}\\s*:`).test(body)) continue;
    for (const sel of (m[1] ?? "").split(",")) found.add(sel.trim());
  }
  return found;
}

describe("legacy dark mode", () => {
  it("carries an html.dark override for every hardcoded light surface", () => {
    const bgOverrides = darkOverridesFor("background");
    const offenders: string[] = [];
    for (const rule of rules()) {
      if (!LIGHT_BG.test(rule.body)) continue;
      if (isExempt(rule)) continue;
      if (bgOverrides.has(rule.selector)) continue;
      offenders.push(`${rule.line}: ${rule.selector}`);
    }
    expect(
      offenders,
      `light background with no html.dark override:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("carries an html.dark override for every hardcoded dark ink", () => {
    const inkOverrides = darkOverridesFor("color");
    const offenders: string[] = [];
    for (const rule of rules()) {
      if (!DARK_INK.test(rule.body)) continue;
      if (isExempt(rule)) continue;
      if (inkOverrides.has(rule.selector)) continue;
      offenders.push(`${rule.line}: ${rule.selector}`);
    }
    expect(offenders, `dark ink with no html.dark override:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("overrides the token set, which is what makes the rest of the theme work", () => {
    // A suite that only checks for absence can pass on a file whose overrides
    // were all deleted. The overrides are the mechanism, so assert they exist.
    expect(CSS).toMatch(/html\.dark\s*\{[^}]*--panel\s*:/);
    expect(CSS).toMatch(/html\.dark\s*\{[^}]*--bg\s*:/);
    expect(CSS).toMatch(/html\.dark\s*\{[^}]*--ink\s*:/);
  });

  it("keeps a light surround on question images, which are ink on paper", () => {
    // The precedent the `.imgzoom-body img` fix follows. A question image is a
    // scan of paper; a dark surround would make it unreadable, not themed.
    expect(CSS).toMatch(/html\.dark\s+\.qfig\s*\{[^}]*background\s*:/);
    expect(CSS).toMatch(/html\.dark\s+\.qsvg svg\s*\{[^}]*background\s*:/);
    expect(CSS).toMatch(/html\.dark\s+\.imgzoom-body img\s*\{[^}]*background\s*:/);
  });

  it("has the overrides the fix added, so the fix cannot silently regress", () => {
    const bgOverrides = darkOverridesFor("background");
    const inkOverrides = darkOverridesFor("color");
    for (const sel of [".sb-boost .brand b", ".nba-start", ".imgzoom-body img"]) {
      expect(bgOverrides.has(sel), `missing html.dark background override for ${sel}`).toBe(true);
    }
    expect(inkOverrides.has(".sb-boost .brand b")).toBe(true);
  });

  it("leaves the NTA console replica white, because the real one is", () => {
    // The exemption is a decision, not an oversight. If someone "fixes" the
    // exam screen to follow the theme, this fails and they have to say why.
    expect(CSS).toMatch(/html\[data-nta="on"\] #examView\s*\{[^}]*background:\s*#fff/);
    expect(CSS).toMatch(/html\[data-nta="on"\] #examView\s*\{[^}]*color:\s*#000/);
  });

  it("reports a real line number, so an offender can be found", () => {
    // The parser is the thing most likely to be wrong, and a parser that
    // returns nothing passes both checks above for the wrong reason.
    const parsed = rules();
    expect(parsed.length).toBeGreaterThan(500);
    expect(parsed.every((r) => r.line >= 1)).toBe(true);
    const qfig = parsed.find((r) => r.selector === ".qfig");
    expect(qfig, "the parser should find .qfig").toBeTruthy();
    expect(qfig!.line).toBeGreaterThan(5000);
  });
});
