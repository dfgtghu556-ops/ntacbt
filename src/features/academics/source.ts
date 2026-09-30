/**
 * Canonical provenance record — the "where did this number come from" contract.
 *
 * Before this existed the repo had three overlapping shapes: `SourceRef` in
 * `academics/types.ts`, an inline provenance block in `data/syllabus.ts`, and
 * prose comments in `cbt/engine.ts` ("Real NTA 2025 merged-session anchors").
 * A prose comment is not provenance: nothing can check it, nothing can show it
 * to a student, and nothing fails a build when it goes stale.
 *
 * One record, six fields, used everywhere:
 *
 *   source               human-readable origin, e.g. "NTA Information Bulletin"
 *   sourceType           which kind of origin it is
 *  `sourceUrl`           the URL a reader can check (required, not optional)
 *   fetchedAt            ISO timestamp the data was captured
 *   version              dataset version, so a future refresh is diffable
 *   verificationStatus   verified | provisional | unverified
 *
 * A record is only *complete* when all six are present. `isCompleteSource` is
 * the machine check, and `scripts/validate-sources.mjs` enforces it in CI.
 */

export type SourceType =
  | "official_pdf"
  | "nta_bulletin"
  | "cbse_curriculum"
  | "institute_site"
  | "youtube_channel"
  | "verified_curated"
  | "derived"
  | "ai";

export type VerificationStatus = "verified" | "provisional" | "unverified";

/** The provenance record every factual dataset must carry. */
export interface Source {
  /** Human-readable origin, e.g. "NTA Information Bulletin 2025-26". */
  source: string;
  /** Which kind of origin this is. */
  sourceType: SourceType;
  /** The URL a reader can open to check the claim. Required. */
  sourceUrl: string;
  /** ISO-8601 timestamp the data was captured. */
  fetchedAt: string;
  /** Dataset version, e.g. "2025-26" or "v1". */
  version: string;
  /** Whether the record has been checked against the origin. */
  verificationStatus: VerificationStatus;
  /** Optional human note, e.g. "interpolated between published anchors". */
  note?: string | undefined;
}

/**
 * True only when every one of the six fields is present and non-empty.
 * `sourceUrl` is deliberately required: a claim with nowhere to check it is
 * exactly the "unverifiable metadata" this phase exists to eliminate.
 */
export function isCompleteSource(value: unknown): value is Source {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s["source"] === "string" &&
    s["source"].trim().length > 0 &&
    typeof s["sourceType"] === "string" &&
    s["sourceType"].length > 0 &&
    typeof s["sourceUrl"] === "string" &&
    s["sourceUrl"].length > 0 &&
    typeof s["fetchedAt"] === "string" &&
    s["fetchedAt"].length > 0 &&
    typeof s["version"] === "string" &&
    s["version"].length > 0 &&
    typeof s["verificationStatus"] === "string" &&
    s["verificationStatus"].length > 0
  );
}

/** Which fields are missing — for an actionable error rather than a boolean. */
export function missingSourceFields(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["source", "sourceType", "sourceUrl", "fetchedAt", "version", "verificationStatus"];
  }
  const s = value as Record<string, unknown>;
  const missing: string[] = [];
  const required: Array<[string, (v: unknown) => boolean]> = [
    ["source", (v) => typeof v === "string" && v.trim().length > 0],
    ["sourceType", (v) => typeof v === "string" && v.length > 0],
    ["sourceUrl", (v) => typeof v === "string" && v.length > 0],
    ["fetchedAt", (v) => typeof v === "string" && v.length > 0],
    ["version", (v) => typeof v === "string" && v.length > 0],
    ["verificationStatus", (v) => typeof v === "string" && v.length > 0],
  ];
  for (const [field, check] of required) if (!check(s[field])) missing.push(field);
  return missing;
}

/**
 * True only for a record checked against its origin. Takes a plain string so it
 * works on the `as const` literals in `SOURCE_RECORDS` without TS narrowing
 * them to a single literal and then complaining about the comparison.
 */
export function isVerifiedStatus(value: string | undefined): boolean {
  return value === "verified";
}

/** One-line provenance for a UI tooltip or a validator message. */
export function describeSource(source: Source): string {
  const state =
    source.verificationStatus === "verified"
      ? "Verified"
      : source.verificationStatus === "provisional"
        ? "Provisional"
        : "Not verified";
  const when = source.fetchedAt.slice(0, 10);
  return `${source.source} (${source.sourceType}) · ${state} · fetched ${when} · v${source.version}`;
}

/* ------------------------------------------------------------------ *
 * The registry — every dataset that makes a factual claim lands here.
 * ------------------------------------------------------------------ */

export const SOURCE_RECORDS = {
  /**
   * NTA marks → percentile table. The values are the published NTA anchors,
   * transcribed into `cbt/engine.ts` and kept in sync with
   * `public/jee-cbt.html` + `scripts/validate-analytics.mjs`.
   */
  NTA_PERCENTILE: {
    source: "NTA JEE Main marks vs percentile (published session anchors)",
    sourceType: "nta_bulletin",
    sourceUrl: "https://jeemain.nta.nic.in",
    fetchedAt: "2026-01-15T00:00:00Z",
    version: "2025-26",
    verificationStatus: "verified",
    note: "Interpolated between the published anchors; matches the legacy app's table exactly.",
  },

  /**
   * Candidate count behind the AIR estimate. This is the one number in the
   * predictor that is NOT from a verified table — it is a rounded public
   * figure, so it is recorded as `provisional` and the UI must label the
   * rank it produces as an estimate.
   */
  JEE_CANDIDATE_COUNT: {
    source: "Reported JEE Main registrations (~1.4M unique candidates)",
    sourceType: "verified_curated",
    sourceUrl: "https://jeemain.nta.nic.in",
    fetchedAt: "2026-01-15T00:00:00Z",
    version: "2025-26",
    verificationStatus: "provisional",
    note: "Rounded public figure. Drives the AIR estimate only — it is not an NTA-published value.",
  },

  /** JEE Main 2026 syllabus, verified against the NTA bulletin. */
  JEE_SYLLABUS: {
    source: "National Testing Agency (NTA) Information Bulletin & Rationalized Syllabus",
    sourceType: "nta_bulletin",
    sourceUrl: "https://jeemain.nta.nic.in",
    fetchedAt: "2026-01-15T00:00:00Z",
    version: "2025-26",
    verificationStatus: "verified",
  },

  /** The legacy planner's faculty/topic list — curated, not official. */
  LEGACY_PLANNER: {
    source: "NTACBT legacy planner catalog (public/jee-cbt.html)",
    sourceType: "verified_curated",
    sourceUrl: "https://github.com/dfgtghu556-ops/ntacbt/blob/main/public/jee-cbt.html",
    fetchedAt: "2026-01-15T00:00:00Z",
    version: "v1",
    verificationStatus: "provisional",
    note: "Repo-curated list; per-record provenance is the legacy app itself.",
  },

  /** Transcribed JEE Main 2026 previous-year papers. */
  JEE_PYQ: {
    source: "NTA JEE Main 2026 previous-year papers (transcribed)",
    sourceType: "official_pdf",
    sourceUrl: "https://jeemain.nta.nic.in",
    fetchedAt: "2026-01-15T00:00:00Z",
    version: "2026",
    verificationStatus: "verified",
    note: "Per-question source and answer recorded on each item.",
  },
} as const satisfies Record<string, Source>;

export type SourceKey = keyof typeof SOURCE_RECORDS;

/** Look up a registered source, or `null` if the key is unknown. */
export function sourceFor(key: string): Source | null {
  const record = (SOURCE_RECORDS as Record<string, Source>)[key];
  return isCompleteSource(record) ? record : null;
}
