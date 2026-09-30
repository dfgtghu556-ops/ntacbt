/**
 * Looking up an attempt by id, across both stores.
 *
 * Extracted from the reopen route so the lookup is testable on its own - a route
 * component needs a router harness, and a function that has to be reached through
 * one tends not to be tested at all.
 *
 * ## Why both stores
 *
 * The attempt history renders the merged view, so it links to legacy attempts too.
 * A route that searched only the React store turned every legacy row into "Attempt
 * not found" - worse than no row, because it tells a student their work is not on a
 * device that is holding it.
 *
 * ## What a legacy attempt actually carries
 *
 * Checked against `public/js/app.js` rather than assumed. At submit the legacy tool
 * pushes `{ id, testId, startedAt, responses, submittedAt, tabSwitches, timeTaken,
 * result, autoSubmitted, pyqId? }` - so `responses` and `result` are both stored,
 * and both are the *same shape* the React engine produces (`evaluate` builds an
 * identical `all`/`per` record, and a response is `{ans, status, time, changes}`).
 * The conversion is lossless except for one field: the paper.
 *
 * The paper is never stored on a legacy attempt - only `testId`, plus `pyqId` on
 * PYQ papers, which the legacy code uses to "self-restore the paper if it's ever
 * pruned". That restore is not reproduced here, because it would mean matching a
 * legacy `pyqId` against the React paper dataset, and a wrong match would render a
 * review that contradicts the score. The honest outcome is the degraded screen,
 * which is what a missing `test` produces.
 *
 * The legacy blob is therefore read **directly** rather than through `DataStore`:
 * `DataStore.attempts` returns `AttemptSummary`, which drops `responses`, and the
 * responses are worth carrying even though nothing reads them yet.
 */

import { loadCbtStore } from "@/features/cbt/store";
import type { CbtAttemptRecord, CbtResponseState, CbtResult } from "@/features/cbt/types";

const LEGACY_KEY = "jeecbt.v1";

/**
 * The response statuses the engine uses, as a lookup table.
 *
 * A table rather than a cast: a status string read out of `localStorage` is
 * `unknown`, and `value as Status` would wave anything through. Looking the string
 * up means an unrecognised value falls back to `notvisited` instead of becoming a
 * status the engine has never heard of.
 */
const STATUS: Record<string, CbtResponseState["status"]> = {
  notvisited: "notvisited",
  notanswered: "notanswered",
  answered: "answered",
  marked: "marked",
  answeredmarked: "answeredmarked",
};

/** Parse a legacy response row. Same shape as `CbtResponseState`. */
function asResponses(raw: unknown): Record<string, CbtResponseState> {
  const out: Record<string, CbtResponseState> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const r = value as Record<string, unknown>;
    const ans = r["ans"];
    if (typeof ans !== "string" && ans !== null) continue;
    const status = r["status"];
    const time = r["time"];
    const changes = r["changes"];
    out[id] = {
      ans: ans ?? null,
      status: typeof status === "string" ? (STATUS[status] ?? "notvisited") : "notvisited",
      time: typeof time === "number" ? time : 0,
      changes: typeof changes === "number" ? changes : 0,
    };
  }
  return out;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Parse a `result`. Returns null rather than a zeroed record: an attempt with no
 * gradeable result must not be shown as "0 marks", which is a claim the data does
 * not make.
 */
function asResult(raw: unknown): CbtResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const all = r["all"];
  const per = r["per"];
  if (!all || typeof all !== "object" || !per || typeof per !== "object") return null;
  const a = all as Record<string, unknown>;
  if (typeof a["correct"] !== "number" || typeof a["marks"] !== "number") return null;
  return {
    all: {
      correct: num(a["correct"]),
      wrong: num(a["wrong"]),
      skipped: num(a["skipped"]),
      marks: num(a["marks"]),
      neg: num(a["neg"]),
      time: num(a["time"]),
      total: num(a["total"]),
      max: num(a["max"]),
      accuracy: num(a["accuracy"]),
      percentage: num(a["percentage"]),
    },
    per: per as CbtResult["per"],
  };
}

/**
 * Read the legacy blob and return the attempt with `id`, validated.
 *
 * Returns null on anything unexpected - a missing key, a value that is not JSON,
 * an `attempts` array that is not one, or an attempt missing the fields the
 * screens read. Every one of those is "no such attempt", which is the same answer
 * the caller gives for an id that was never stored, so a corrupt legacy key cannot
 * turn into a crash or a fabricated result.
 */
function legacyAttempt(attemptId: string): CbtAttemptRecord | null {
  if (typeof window === "undefined") return null;
  let parsed: unknown;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const attempts = (parsed as Record<string, unknown>)["attempts"];
  if (!Array.isArray(attempts)) return null;

  for (const row of attempts) {
    if (!row || typeof row !== "object") continue;
    const a = row as Record<string, unknown>;
    if (a["id"] !== attemptId) continue;
    const testId = a["testId"];
    const submittedAt = a["submittedAt"];
    const startedAt = a["startedAt"];
    const tabSwitches = a["tabSwitches"];
    const timeTaken = a["timeTaken"];
    if (typeof testId !== "string" || typeof submittedAt !== "number") continue;
    const result = asResult(a["result"]);
    return {
      id: attemptId,
      testId,
      startedAt: typeof startedAt === "number" ? startedAt : submittedAt,
      submittedAt,
      responses: asResponses(a["responses"]),
      tabSwitches: typeof tabSwitches === "number" ? tabSwitches : 0,
      timeTaken: typeof timeTaken === "number" ? timeTaken : 0,
      ...(result ? { result } : {}),
    };
  }
  return null;
}

/**
 * Find an attempt by id, or null if neither store has it.
 *
 * The React store wins when an id exists in both. In practice the two id schemes
 * do not collide - React ids are `att-<base36 time>` and the legacy tool uses its
 * own `uid()` - but a deterministic winner beats whichever store happens to be
 * read first, and the React copy is the one that carries the paper.
 *
 * A legacy attempt comes back without `test`, which is what routes it to the
 * degraded screen. Its `responses` are carried through because they are real and
 * the shapes match; nothing reads them yet, and dropping data that is present in
 * order to make a type convenient would be the wrong trade.
 */
export function findAttempt(attemptId: string): CbtAttemptRecord | null {
  try {
    const react = loadCbtStore().attempts.find((a) => a.id === attemptId);
    if (react) return react;
  } catch {
    // Fall through to the legacy blob rather than reporting "not found" for an
    // attempt that is sitting in storage.
  }
  return legacyAttempt(attemptId);
}
