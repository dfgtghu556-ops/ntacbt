/**
 * Responsive audit gate.
 *
 * `scripts/audit-responsive.mjs` reports layout patterns that could break on a
 * small screen. Most of what it finds is correct by design — a calculator
 * keypad is four keys across on a phone, a calendar is seven narrow columns —
 * so each finding is either inspected and recorded in that script's REVIEWED
 * map, or it is a real problem.
 *
 * This test runs the audit for real and asserts two things:
 *
 *   1. no unexplained high/medium/low finding exists. A new one means someone
 *      added a layout that breaks at 320px, or that a REVIEWED excuse went
 *      stale and is now masking a real regression.
 *   2. no REVIEWED entry is stale. A stale entry would silently excuse the
 *      same pattern if it ever came back, which is the failure mode this whole
 *      audit exists to prevent.
 *
 * The audit is run as a child process rather than imported, so the test fails
 * if the script itself stops running.
 */

import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const SCRIPT = "scripts/audit-responsive.mjs";

function runAudit() {
  return execFileSync("node", [SCRIPT], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("responsive audit", () => {
  const output = runAudit();

  it("runs and reports a finding count", () => {
    expect(output).toMatch(/Responsive audit — \d+ JSX files, legacy\.css/);
    expect(output).toMatch(/Findings: \d+ high, \d+ medium, \d+ low, \d+ info/);
  });

  it("leaves no unexplained high, medium or low finding", () => {
    const line = output.split("\n").find((l) => l.startsWith("Findings:"));
    expect(line).toBeDefined();
    const m = /Findings: (\d+) high, (\d+) medium, (\d+) low, (\d+) info/.exec(line ?? "");
    expect(m).not.toBeNull();
    const [, high, medium, low] = m ?? [];
    expect(
      { high: Number(high), medium: Number(medium), low: Number(low) },
      `unexplained findings — run \`npm run audit:responsive\` and inspect them`,
    ).toEqual({ high: 0, medium: 0, low: 0 });
  });

  it("leaves no stale REVIEWED entry", () => {
    // A stale entry is one whose finding no longer exists: the excuse is still
    // on the books and would hide the pattern if it reappeared.
    expect(output).not.toMatch(/REVIEWED entr(y|ies) no longer matches/);
  });

  it("finds the reviewed calculator keypad and dismisses it with a reason", () => {
    // Proves the review path works: a finding is matched, excused, and the
    // reason is printed, rather than the finding being silently dropped.
    expect(output).toMatch(/OK\s+A1 L\s+57\s+bare grid-cols-4/);
    expect(output).toMatch(/└─ reviewed: calculator keypad/);
  });

  it("reports the dead UI primitives it found", () => {
    // `src/components/ui/table.tsx` is rendered by no route. Recording it as
    // dead code is how the A4 table finding got dismissed honestly.
    expect(output).toMatch(/ui\/table is imported nowhere — dead code/);
  });
});
