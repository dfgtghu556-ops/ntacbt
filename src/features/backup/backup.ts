/**
 * Backup and restore for a local-first app.
 *
 * The problem this solves: everything a student has done — every attempt, every
 * focus session, every flashcard, every planner tick — lives in this browser's
 * `localStorage` and nowhere else. Clear site data, change phone, or lose the
 * laptop and it is gone. The app builds a humane streak, an XP level and a rank
 * prediction out of that history, so the loss is not abstract.
 *
 * The design constraints, in the order they were chosen:
 *
 *  1. **A backup must never be able to brick the app.** Restore validates before
 *     it writes, refuses an unknown version, and refuses a file that is not a
 *     backup at all. A truncated or hand-edited file produces a readable error,
 *     not an empty dashboard.
 *
 *  2. **Never a blind `localStorage` sweep.** Only the keys in `keys.ts` are
 *     read. Another app sharing the origin must not end up inside a student's
 *     backup file.
 *
 *  3. **No credential travels.** The auth token stays behind; see `keys.ts`.
 *
 *  4. **The student sees what they are about to do.** `describeBackup` reports
 *     what a file contains — how many attempts, sessions, cards — before they
 *     choose to replace or merge.
 */

import { BACKUP_VERSION, STAYING_KEYS, TRAVELLING_KEYS, UNCLASSIFIED_KEYS } from "./keys";

/** One key's contents, as it was read from `localStorage`. */
export interface BackupEntry {
  key: string;
  /** The parsed JSON value. `null` when the key was absent on this device. */
  value: unknown;
  /** Whether the key existed at all, so restore can tell empty from missing. */
  present: boolean;
  /**
   * True when `value` is the raw text of a key that did not parse as JSON.
   *
   * Several NTACBT keys are bare strings rather than JSON — `ntacbt.lang` holds
   * `hi`, `ntacbt.onboarded.v1` holds a timestamp. Without this flag, restoring
   * one writes it back unquoted, so the next read fails to parse and the key is
   * silently corrupt. The flag is what makes "carry the raw string" and "carry a
   * JSON string" distinguishable.
   */
  raw?: boolean;
}

export interface BackupFile {
  /** Identifies this as an NTACBT backup and which shape it is. */
  format: "ntacbt.backup";
  version: number;
  /** When the file was made, as an ISO string. */
  exportedAt: string;
  /** The app version, when it can be determined. */
  appVersion?: string;
  entries: BackupEntry[];
}

/** What restore found in a file, shown to the student before they commit. */
export interface BackupSummary {
  exportedAt: string;
  version: number;
  /** Keys the file carries that this app also knows about. */
  recognised: string[];
  /** Keys in the file this build has never heard of. */
  unknownKeys: string[];
  /** A key present in the file but holding `null`/absent. */
  emptyKeys: string[];
  /** Human-readable counts, so the student can sanity-check the file. */
  counts: Record<string, number>;
}

export type RestoreMode = "replace" | "merge";

export interface RestoreResult {
  mode: RestoreMode;
  /** Keys written. */
  written: string[];
  /** Keys the file carried that were skipped as unknown. */
  skipped: string[];
}

/* ------------------------------------------------------------------ */
/* Reading the current device                                          */
/* ------------------------------------------------------------------ */

function readRaw(key: string): { present: boolean; value: unknown; raw: boolean } {
  if (typeof window === "undefined") return { present: false, value: null, raw: false };
  let text: string | null = null;
  try {
    text = window.localStorage.getItem(key);
  } catch {
    // Private mode or a disabled storage quota. Treat as absent rather than
    // throwing: a backup should degrade to "nothing here", not crash the page.
    return { present: false, value: null, raw: false };
  }
  if (text === null) return { present: false, value: null, raw: false };
  try {
    return { present: true, value: JSON.parse(text) as unknown, raw: false };
  } catch {
    // A key holding something that is not JSON. Carry the raw text so the student
    // does not silently lose it, and flag it so restore writes it back verbatim.
    return { present: true, value: text, raw: true };
  }
}

/**
 * Collect the backup for this device.
 *
 * Keys are read in manifest order so two exports of the same device produce
 * byte-identical files apart from the timestamp — which is what makes a backup
 * diffable and a test stable.
 */
export function collectBackup(now: Date = new Date()): BackupFile {
  const entries: BackupEntry[] = TRAVELLING_KEYS.map((key) => {
    const { present, value, raw } = readRaw(key);
    // `raw` is only written when true, so the common file stays clean and
    // `exactOptionalPropertyTypes` is satisfied.
    return raw ? { key, value, present, raw } : { key, value, present };
  });

  const file: BackupFile = {
    format: "ntacbt.backup",
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    entries,
  };

  const appVersion = readAppVersion();
  if (appVersion) file.appVersion = appVersion;

  return file;
}

function readAppVersion(): string | undefined {
  // `import.meta.env.VITE_APP_VERSION` is not set in this project, so this stays
  // undefined rather than inventing a number. The timestamp is the useful part.
  const v = (import.meta.env as Record<string, string | undefined>)["VITE_APP_VERSION"];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/* ------------------------------------------------------------------ */
/* Serialising for download                                            */
/* ------------------------------------------------------------------ */

/** Pretty-printed so a student can open it in an editor and see what it is. */
export function serialiseBackup(file: BackupFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** A filename a student can sort by date. */
export function backupFilename(file: BackupFile): string {
  const day = file.exportedAt.slice(0, 10);
  return `ntacbt-backup-${day}.json`;
}

/* ------------------------------------------------------------------ */
/* Validating a file the student picked                                */
/* ------------------------------------------------------------------ */

export type BackupProblem =
  | { kind: "not-json"; detail: string }
  | { kind: "not-a-backup"; detail: string }
  | { kind: "wrong-version"; found: number; supported: number }
  | { kind: "no-entries" }
  | { kind: "bad-entry"; key: string; detail: string };

export type ParseResult =
  { ok: true; file: BackupFile } | { ok: false; problem: BackupProblem; message: string };

/**
 * Parse and validate a backup file *before* anything is written.
 *
 * This is the function that keeps restore safe. It answers "is this a file this
 * build understands?" and nothing else — no writing, no merging, no side effects.
 */
export function parseBackup(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    return {
      ok: false,
      problem: { kind: "not-json", detail: String(err) },
      message: "That file is not valid JSON. It may be truncated or edited by hand.",
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      problem: { kind: "not-a-backup", detail: "top level is not an object" },
      message: "That file is not an NTACBT backup.",
    };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj["format"] !== "ntacbt.backup") {
    return {
      ok: false,
      problem: { kind: "not-a-backup", detail: `format is ${String(obj["format"])}` },
      message: "That file is not an NTACBT backup.",
    };
  }

  const version = obj["version"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return {
      ok: false,
      problem: { kind: "wrong-version", found: NaN, supported: BACKUP_VERSION },
      message: "That backup does not say which version it is.",
    };
  }
  if (version !== BACKUP_VERSION) {
    return {
      ok: false,
      problem: { kind: "wrong-version", found: version, supported: BACKUP_VERSION },
      message:
        `That backup was made by a different version of NTACBT ` +
        `(file v${version}, this app reads v${BACKUP_VERSION}).`,
    };
  }

  const rawEntries = obj["entries"];
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    return {
      ok: false,
      problem: { kind: "no-entries" },
      message: "That backup is empty — it carries no data to restore.",
    };
  }

  const entries: BackupEntry[] = [];
  for (const raw of rawEntries) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return {
        ok: false,
        problem: { kind: "bad-entry", key: "?", detail: "entry is not an object" },
        message: "That backup is malformed — one of its entries is not an object.",
      };
    }
    const e = raw as Record<string, unknown>;
    const key = e["key"];
    if (typeof key !== "string" || key.length === 0) {
      return {
        ok: false,
        problem: { kind: "bad-entry", key: "?", detail: "entry has no key" },
        message: "That backup is malformed — one of its entries has no key.",
      };
    }
    if (typeof e["present"] !== "boolean") {
      return {
        ok: false,
        problem: { kind: "bad-entry", key, detail: "entry has no `present` flag" },
        message: `That backup is malformed — the entry for "${key}" is incomplete.`,
      };
    }
    entries.push({
      key,
      value: e["value"] ?? null,
      present: e["present"] as boolean,
      ...(e["raw"] === true ? { raw: true } : {}),
    });
  }

  return {
    ok: true,
    file: {
      format: "ntacbt.backup",
      version,
      exportedAt: typeof obj["exportedAt"] === "string" ? obj["exportedAt"] : "",
      entries,
      ...(typeof obj["appVersion"] === "string" ? { appVersion: obj["appVersion"] } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Describing a file before the student commits                        */
/* ------------------------------------------------------------------ */

/** How many of a thing a value holds, for the summary shown before restore. */
function countIn(key: string, value: unknown): number | null {
  if (value === null || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const pick = (field: string): number | null => {
    const v = obj[field];
    return Array.isArray(v) ? v.length : null;
  };
  switch (key) {
    case "ntacbt.cbt.v1":
      return pick("tests");
    case "ntacbt.focus.v1":
      return pick("sessions");
    case "ntacbt.memory.v1":
      return pick("cards") ?? pick("decks");
    case "ntacbt.studytube.v1":
      return pick("watched") ?? pick("progress");
    case "ntacbt.todo.done.v1":
      return Array.isArray(value) ? value.length : null;
    default:
      return null;
  }
}

const COUNT_LABELS: Record<string, string> = {
  "ntacbt.cbt.v1": "saved tests",
  "ntacbt.focus.v1": "focus sessions",
  "ntacbt.memory.v1": "revision cards",
  "ntacbt.studytube.v1": "watched lessons",
  "ntacbt.todo.done.v1": "completed tasks",
};

/**
 * What is in this file, in terms a student can check against what they remember
 * doing. "12 saved tests, 34 focus sessions" is a sanity check; "12 entries" is
 * not.
 */
export function describeBackup(file: BackupFile): BackupSummary {
  const recognised: string[] = [];
  const unknownKeys: string[] = [];
  const emptyKeys: string[] = [];
  const counts: Record<string, number> = {};

  const known = new Set<string>([...TRAVELLING_KEYS, ...Object.keys(UNCLASSIFIED_KEYS)]);

  for (const entry of file.entries) {
    if (!known.has(entry.key)) {
      unknownKeys.push(entry.key);
      continue;
    }
    recognised.push(entry.key);
    if (!entry.present || entry.value === null) {
      emptyKeys.push(entry.key);
      continue;
    }
    const n = countIn(entry.key, entry.value);
    if (n !== null) counts[COUNT_LABELS[entry.key] ?? entry.key] = n;
  }

  return {
    exportedAt: file.exportedAt,
    version: file.version,
    recognised,
    unknownKeys,
    emptyKeys,
    counts,
  };
}

/* ------------------------------------------------------------------ */
/* Writing a file back                                                 */
/* ------------------------------------------------------------------ */

function writeRaw(key: string, value: unknown, raw = false): void {
  if (typeof window === "undefined") return;
  // A `raw` value is text that never parsed as JSON, so it is written back
  // exactly as it came. Anything else is re-serialised, which is what keeps a
  // JSON string a JSON string.
  const text = raw && typeof value === "string" ? value : JSON.stringify(value);
  window.localStorage.setItem(key, text);
}

/**
 * Apply a validated backup.
 *
 * `replace` overwrites every travelling key the file carries and clears the ones
 * it does not — a true restore to the moment the file was made. `merge` only
 * writes keys that are currently absent, so a student who has since done a
 * little work on this device keeps it.
 *
 * Keys the file carries that this build does not know about are skipped, never
 * written: an unknown key is more likely to be a stale schema than something
 * worth trusting.
 */
export function applyBackup(file: BackupFile, mode: RestoreMode): RestoreResult {
  const known = new Set<string>([...TRAVELLING_KEYS, ...Object.keys(UNCLASSIFIED_KEYS)]);
  const carried = new Map(file.entries.map((e) => [e.key, e]));

  const written: string[] = [];
  const skipped: string[] = [];

  for (const [key, entry] of carried) {
    if (!known.has(key)) {
      skipped.push(key);
      continue;
    }
    // A key the exporting device did not have. Under `replace` the device must
    // match the backup exactly, so it is removed — writing `null` here would
    // leave a key that every reader then has to defend against. Under `merge`
    // the device is left alone, because merge only fills gaps.
    if (!entry.present) {
      if (mode === "replace" && typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
      continue;
    }
    if (mode === "merge" && readRaw(key).present) continue;
    writeRaw(key, entry.value, entry.raw === true);
    written.push(key);
  }

  if (mode === "replace") {
    // Anything the file does not carry at all is removed too, so the device
    // matches the backup exactly. Staying keys are never touched.
    for (const key of TRAVELLING_KEYS) {
      if (carried.has(key)) continue;
      if (typeof window !== "undefined") window.localStorage.removeItem(key);
    }
  }

  return { mode, written, skipped };
}

/** Keys this build knows about but the file does not carry. */
export function missingFrom(file: BackupFile): string[] {
  const carried = new Set(file.entries.map((e) => e.key));
  return TRAVELLING_KEYS.filter((k) => !carried.has(k));
}

/** True when the device holds nothing worth backing up. */
export function deviceIsEmpty(): boolean {
  return TRAVELLING_KEYS.every((key) => !readRaw(key).present);
}

export { STAYING_KEYS, TRAVELLING_KEYS, UNCLASSIFIED_KEYS, BACKUP_VERSION };
