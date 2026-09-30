import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Dark mode must not have light-only tinted surfaces.
 *
 * The bug: the dashboard hero was
 * `bg-gradient-to-br from-blue-50 via-background to-violet-50` — fixed light
 * colours with no `dark:` variant — so in dark mode you got a pale lilac card
 * floating on a near-black background. There was exactly one `dark:`
 * declaration in the whole 1,532-line dashboard file, and the same light-only
 * treatment appeared in the report page's severity tones.
 *
 * `app.map.tsx` and `app.memory.tsx` already did this correctly. `app.index.tsx`
 * and `app.report.tsx` did not. This pins the convention so a new tinted surface
 * cannot ship light-only.
 *
 * The convention used across the app is `dark:bg-<hue>-950/40` with
 * `dark:text-<hue>-300`, which is what `app.map.tsx` and `app.memory.tsx` use.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const FILES = ["app.index.tsx", "app.report.tsx", "app.map.tsx", "app.memory.tsx"];

const TINTED =
  /\bbg-(blue|violet|green|rose|amber|emerald|red|indigo|purple|cyan|orange|teal)-50\b/;
const GRADIENT = /\b(from|via|to)-(blue|violet|green|rose|amber|indigo|purple|cyan|orange)-50\b/;

/** Every `className` value in a file, as plain strings. */
function classNamesOf(src: string): string[] {
  return [...src.matchAll(/className[=:]\s*[`"]([^`"]*)[`"]/g)].map((m) => m[1] ?? "");
}

describe("dark mode", () => {
  it("has no light-only tinted surface", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const cn of classNamesOf(read(`src/routes/${f}`))) {
        if (!TINTED.test(cn)) continue;
        if (!cn.includes("dark:")) offenders.push(`${f}: ${cn}`);
      }
    }
    expect(offenders, `light tint with no dark variant:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("has no light-only gradient", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const cn of classNamesOf(read(`src/routes/${f}`))) {
        if (!GRADIENT.test(cn)) continue;
        if (!/dark:(from|via|to)-/.test(cn)) offenders.push(`${f}: ${cn}`);
      }
    }
    expect(offenders, `light gradient with no dark variant:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("actually declares dark variants on the pages that needed them", () => {
    // The two files that were broken. A test that passes on an empty file is not
    // a test, so assert the fix is present rather than only that the bug is gone.
    for (const f of ["app.index.tsx", "app.report.tsx"]) {
      const src = read(`src/routes/${f}`);
      expect(src, `${f} should have dark variants`).toMatch(/dark:bg-/);
    }
  });
});
