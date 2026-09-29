/**
 * Phase 6 — accessibility guards that can be checked from source.
 *
 * The rebuild plan asks for an accessibility and performance pass plus device
 * QA. Device QA needs a real browser or a device lab, but several of the defects
 * it would surface are visible in the source, and a guard test catches them on
 * every commit instead of whenever somebody remembers to look.
 *
 * Each check here corresponds to a defect that was actually found and fixed in
 * this app, not to a checklist item nobody measured.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every `.tsx` under `src/` except `src/components/ui/`, which holds the shadcn
 * primitives. Those forward whatever props they are given, so an input with no
 * accessible name there is correct — the caller supplies it.
 */
function appSources(): Array<{ path: string; src: string }> {
  const root = join(process.cwd(), "src");
  const out: Array<{ path: string; src: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith(".tsx")) continue;
      const rel = full.slice(process.cwd().length + 1);
      if (rel.startsWith("src/components/ui/")) continue;
      if (rel.startsWith("src/test/")) continue;
      out.push({ path: rel, src: readFileSync(full, "utf8") });
    }
  };
  walk(root);
  return out;
}

/**
 * Every `<tag …>` opening tag, brace-aware.
 *
 * A regex cannot do this: `onChange={(e) => setLabel(e.target.value)}` contains
 * a `>` inside the attribute value, so `[^>]*` stops at the arrow function and
 * silently reports the wrong attribute set. That is how the first version of
 * this check missed four real defects. Braces are balanced instead, so a `>`
 * inside a JSX expression does not end the tag.
 */
function openingTags(src: string, name: string): Array<{ attrs: string; offset: number }> {
  const out: Array<{ attrs: string; offset: number }> = [];
  const needle = `<${name}`;
  let i = 0;
  for (;;) {
    const start = src.indexOf(needle, i);
    if (start < 0) break;
    const after = start + needle.length;
    // `<input` must not be a prefix of `<inputgroup` or similar.
    if (after < src.length && /[A-Za-z0-9_-]/.test(src[after] as string)) {
      i = after;
      continue;
    }
    let depth = 0;
    let p = after;
    while (p < src.length) {
      const c = src[p];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
      p += 1;
    }
    out.push({ attrs: src.slice(after, p), offset: start });
    i = p + 1;
  }
  return out;
}

/**
 * The `className` of the element that encloses `offset`.
 *
 * Walks backwards from the offset keeping a nesting depth, so the first opening
 * tag that is not already closed is the parent. Looking merely at the closest
 * preceding `className=` does not work: inside
 * `<div className="… focus-within:ring-2"><Icon className="h-4 w-4"/><input …/>`
 * the closest preceding class list is the icon's, not the wrapper's.
 */
function enclosingClassName(src: string, offset: number): string {
  let depth = 0;
  let i = offset - 1;
  while (i >= 0) {
    // A closing tag read backwards means we are inside a child.
    if (src.startsWith("</", i)) {
      depth += 1;
      i -= 2;
      continue;
    }
    if (src[i] === ">") {
      // Find the tag name that opens this tag.
      const open = src.lastIndexOf("<", i);
      if (open < 0) break;
      const name = /^<\/?([a-zA-Z][\w.-]*)/.exec(src.slice(open, i + 1))?.[1];
      if (!name) break;
      // Self-closing is a `/` immediately before the `>`, e.g. `<Icon … />`.
      const selfClosing = src[i - 1] === "/" || VOID.has(name.toLowerCase());
      if (!selfClosing) {
        if (depth === 0) return classListAt(src, open);
        depth -= 1;
      }
      i = open - 1;
      continue;
    }
    i -= 1;
  }
  return "";
}

/** The `className` value on the tag starting at `offset`, if it has one. */
function classListAt(src: string, offset: number): string {
  const m = /className=(?:\{`([^`]*)`\}|"([^"]*)")/.exec(src.slice(offset, offset + 2000));
  return m ? (m[1] ?? m[2] ?? "") : "";
}

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const NAMING_ATTRS = ["aria-label", "aria-labelledby", "id=", "aria-placeholder"];

describe("form controls carry an accessible name", () => {
  const sources = appSources();

  it("finds the sources to check", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  /**
   * A `placeholder` is not an accessible name. It vanishes the moment the
   * student types, so a screen-reader user who has started typing loses the
   * field's identity entirely — and many screen readers do not announce
   * placeholders at all.
   *
   * Four controls were relying on one: the focus-timer label, the Saarthi ask
   * box, the StudyTube search and the active-recall notes textarea.
   */
  it("never names an input, textarea or select with a placeholder alone", () => {
    const offenders: string[] = [];
    for (const { path, src } of sources) {
      for (const tag of ["input", "textarea", "select"]) {
        for (const { attrs, offset } of openingTags(src, tag)) {
          if (attrs.includes('type="hidden"')) continue;
          if (!attrs.includes("placeholder")) continue;
          if (NAMING_ATTRS.some((a) => attrs.includes(a))) continue;
          offenders.push(`${path}:${src.slice(0, offset).split("\n").length} <${tag}>`);
        }
      }
    }
    expect(offenders, `placeholder-only controls: ${offenders.join(", ")}`).toEqual([]);
  });

  it("never leaves an icon-only button unnamed", () => {
    // A button whose whole content is one self-closing element is an icon
    // button. Without a label it is an unlabelled control to a screen reader.
    const offenders: string[] = [];
    for (const { path, src } of sources) {
      const re = /<button\b[^>]*>[\s\S]*?<\/button>/g;
      for (const m of src.matchAll(re)) {
        const whole = m[0];
        const openEnd = whole.indexOf(">");
        const inner = whole.slice(openEnd + 1, whole.lastIndexOf("</button>")).trim();
        if (!inner) continue;
        if (!/^<[A-Za-z][\w.-]*\b[^>]*\/>$/.test(inner)) continue;
        const openTag = whole.slice(0, openEnd + 1);
        if (openTag.includes("aria-label") || inner.includes("sr-only")) continue;
        offenders.push(`${path}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders, `unlabelled icon buttons: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("focus is never removed without a replacement", () => {
  const sources = appSources();

  /**
   * `outline-none` with nothing in its place leaves a keyboard user with no
   * idea where they are.
   *
   * Both `focus:` and `focus-visible:` count — the shadcn primitives use the
   * latter, and a class list of `focus-visible:outline-none focus-visible:ring-1`
   * is a correct pairing, not an offender. `focus-within:` counts for the
   * enclosing element too.
   *
   * The indicator does not have to be on the same element. The two search bars
   * put it on the wrapper with `focus-within:ring-2`, which is the better
   * treatment for a control that spans a whole pill-shaped container — so an
   * `outline-none` is acceptable when either its own class list carries a focus
   * style or the nearest enclosing element does.
   *
   * "Nearest enclosing element" is approximated by the last `className=` before
   * it in the file. That is a guard test, not a parser: it will not catch a
   * focus style three levels up, and it errs toward letting a real defect
   * through only in a file where the class list it finds happens to mention
   * `focus-within` for an unrelated element. Everything it does catch was a
   * real defect when this was written.
   */
  it("pairs every outline-none with a focus indicator", () => {
    const offenders: string[] = [];
    for (const { path, src } of sources) {
      const classLists = [...src.matchAll(/className=(?:\{`([^`]*)`\}|"([^"]*)")/g)];
      for (const m of classLists) {
        const cls = m[1] ?? m[2] ?? "";
        if (!cls.includes("outline-none")) continue;
        if (/focus(?:-visible)?:(ring|border|outline)/.test(cls)) continue;
        // The ring may live on the enclosing element.
        if (/focus(?:-within|-visible)?:(ring|border|outline)/.test(
          enclosingClassName(src, m.index ?? 0),
        )) {
          continue;
        }
        offenders.push(`${path}:${src.slice(0, m.index).split("\n").length}  ${cls.slice(0, 60)}`);
      }
    }
    expect(offenders, `outline-none with no focus indicator: ${offenders.join(" | ")}`).toEqual([]);
  });
});
