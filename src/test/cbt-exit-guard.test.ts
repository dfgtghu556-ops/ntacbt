import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The exam runner must never lose a student's work silently.
 *
 * Measured before this pass: `src/routes/cbt.tsx` had no `beforeunload`, no
 * router blocker and nothing else. A student forty minutes into a paper who
 * swiped back or refreshed got no warning at all. The draft *was* autosaved
 * every 30s and could be resumed — but nothing said so, so the gesture read as
 * "I just threw away forty minutes" and they started again.
 *
 * The other half was cosmetic but in the wrong place: submitting called
 * `window.confirm("Submit test?")`, a native browser dialog, in the one flow
 * where the app most needs to look like it belongs to itself.
 *
 * These are source-level guards. The end-to-end condition they stand for is:
 * refreshing mid-paper produces a browser "leave site?" prompt, and submitting
 * produces the app's own dialog naming how many questions are answered.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("the exam runner guards an in-progress attempt", () => {
  const src = read("src/routes/cbt.tsx");

  it("has a beforeunload listener for leaving or reloading the tab", () => {
    expect(src).toContain("beforeunload");
    expect(src).toContain("addEventListener");
    expect(src).toContain("removeEventListener");
  });

  it("blocks in-app navigation too, which beforeunload does not cover", () => {
    // A client-side route change fires no beforeunload, so tapping a nav item
    // mid-paper would otherwise walk straight out.
    expect(src).toContain("useBlocker");
    expect(src).toContain("shouldBlockFn");
  });

  it("keys every guard off one condition", () => {
    // Two guards with two conditions is how one of them ends up firing on the
    // instructions screen. There must be exactly one source of truth.
    expect(src).toContain('const attemptLive = mode === "exam"');
    const uses = src.match(/attemptLive/g) ?? [];
    // Declared once, then read by the beforeunload effect and the blocker.
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });

  it("does not warn on the instructions or result screens", () => {
    // A warning a student cannot act on is noise, and noise teaches them to
    // dismiss the real one.
    expect(src).toContain("if (!attemptLive) return;");
    expect(src).toContain("if (!attemptLive) return false;");
  });

  it("removes the listener when the attempt ends", () => {
    // Otherwise the prompt keeps firing on the result page.
    expect(src).toMatch(/return \(\) => window\.removeEventListener\("beforeunload"/);
  });

  it("uses the app's own dialog to submit, not window.confirm", () => {
    // The call, not the word — a comment explaining what was replaced must not
    // make the guard pass on broken code.
    expect(src).not.toMatch(/window\.confirm\s*\(/);
    expect(src).toContain("AlertDialog");
    expect(src).toContain("Submit the test?");
  });

  it("tells the student the draft is safe rather than only threatening", () => {
    // The honest message. Autosave runs every 30s and the attempt resumes, so
    // the warning is a courtesy, not a rescue.
    expect(src).toContain("saved automatically every 30 seconds");
  });

  it("quotes the answered count from the same source the header shows", () => {
    // A submit dialog saying "12 answered" over a header saying "9 answered"
    // is the kind of small lie that costs trust in the scoring.
    expect(src).toContain("answeredCount");
    expect(src).toMatch(/Object\.values\(answers\)\.filter/);
  });

  it("offers a way out that is not a trap", () => {
    // Blocking outright would be safer and worse: the student is told their work
    // is safe, so they must be allowed to leave.
    expect(src).toContain("Keep going");
    expect(src).toContain("Leave");
  });
});

describe("the draft that makes the guard safe", () => {
  const autosave = read("src/features/exams/autosave.ts");

  it("still autosaves and can resume", () => {
    // The guard is only honest because this exists. If autosave were removed the
    // warning would become a lie.
    expect(autosave).toContain("export function saveDraft");
    expect(autosave).toContain("export function loadDraft");
  });

  it("still clears the draft on a successful submit", () => {
    // Otherwise a finished paper would offer to resume.
    expect(autosave).toContain("export function clearDraft");
  });
});
