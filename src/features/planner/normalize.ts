/**
 * AI Planner — input hygiene layer.
 *
 * The recommendation route receives arbitrary JSON from the browser. This is
 * the single place where untrusted input is coerced into a bounded, typed,
 * always-valid `PlannerRequest`. It is deliberately framework-free so it can
 * be unit-tested in isolation and guarantees the engine never sees an
 * object/array where a string belonged, a `NaN` where a number belonged, or
 * a length that blows up query construction.
 *
 * Rules (hard):
 *  - If the payload is not a plain object, it is treated as `{}` (never throw).
 *  - String fields are trimmed and capped; arrays/objects become `""` rather
 *    than leaking `"[object Object]"` into search queries.
 *  - Numeric fields are finite-clamped into a safe range.
 *  - Enum fields fall back to a safe default when unknown.
 */

export type PlannerLanguage = "en" | "hi" | "hinglish";
export type PlannerKind = "learn" | "practice" | "revision" | "advanced";
export type PlannerDepth = "oneshot" | "lecture" | "detailed";
export type PlannerTarget = "jeemain" | "jeeadv" | "board12" | "board11" | "cbse27";

export interface PlannerRequest {
  topic: string;
  subject: string;
  language: PlannerLanguage;
  kind: PlannerKind;
  depth: PlannerDepth;
  target: PlannerTarget;
  channel: string;
  teacher: string;
  institute: string;
  maxMinutes: number;
  minMinutes: number;
}

export const PLANNER_LANGUAGES: readonly PlannerLanguage[] = ["en", "hi", "hinglish"];
export const PLANNER_KINDS: readonly PlannerKind[] = ["learn", "practice", "revision", "advanced"];
export const PLANNER_DEPTHS: readonly PlannerDepth[] = ["oneshot", "lecture", "detailed"];
export const PLANNER_TARGETS: readonly PlannerTarget[] = [
  "jeemain",
  "jeeadv",
  "board12",
  "board11",
  "cbse27",
];

/** Bound a string field. Rejects objects/arrays instead of coercing them. */
function asText(value: unknown, max: number): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.slice(0, max).trim();
  // Numbers/booleans are safe scalar inputs, but objects/arrays are not.
  if (typeof value === "number" || typeof value === "boolean") return String(value).slice(0, max);
  return "";
}

/** Finite-clamp an integer field into [lo, hi], defaulting on garbage. */
function asInt(value: unknown, fallback: number, lo: number, hi: number): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** Pick a known enum value, else a safe default. */
function choose<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Coerce any unknown JSON payload into a safe `PlannerRequest`.
 * Never throws. `topic` may legitimately be `""` (caller decides to 400).
 */
export function sanitizePlannerRequest(input: unknown): PlannerRequest {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return {
    topic: asText(source["topic"], 120),
    subject: asText(source["subject"], 40),
    language: choose(source["language"], PLANNER_LANGUAGES, "en"),
    kind: choose(source["kind"], PLANNER_KINDS, "learn"),
    depth: choose(source["depth"], PLANNER_DEPTHS, "lecture"),
    target: choose(source["target"], PLANNER_TARGETS, "jeemain"),
    channel: asText(source["channel"], 60),
    // Preserve legacy `teacherId || teacher` truthiness semantics.
    teacher: asText(source["teacherId"] || source["teacher"], 60),
    institute: asText(source["instituteId"] || source["institute"], 60),
    maxMinutes: asInt(source["maxMinutes"], 180, 10, 600),
    minMinutes: asInt(source["minMinutes"], 0, 0, 300),
  };
}

/** A planner request with no topic is un-actionable (handled as a 400 upstream). */
export function hasPlannerTopic(req: PlannerRequest): boolean {
  return req.topic.length > 0;
}
