/**
 * Backup and restore.
 *
 * These tests are weighted toward the ways a backup can *hurt* a student rather
 * than the ways it can help them. A download button that fails is an
 * inconvenience; a restore that silently empties a store is data loss, and this
 * is the one feature in the app that writes many keys at once from a file the
 * student picked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_VERSION,
  TRAVELLING_KEYS,
  applyBackup,
  backupFilename,
  collectBackup,
  describeBackup,
  deviceIsEmpty,
  missingFrom,
  parseBackup,
  serialiseBackup,
} from "@/features/backup/backup";
import { STAYING_KEYS, UNCLASSIFIED_KEYS } from "@/features/backup/keys";

/**
 * A localStorage stub with the surface the app actually uses.
 *
 * Only the global is stubbed, not `window`: under jsdom `window.localStorage`
 * and the global `localStorage` are the same object, so stubbing one is enough.
 * Stubbing `window` as a plain object breaks the shared `beforeEach` in
 * `src/test/setup.ts`, which calls `localStorage.clear()` around every test —
 * a stub missing `clear` fails there rather than in the case under test.
 */
function installStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal("localStorage", storage);
  return map;
}

const at = new Date("2026-09-30T10:00:00.000Z");

beforeEach(() => {
  installStorage();
});

describe("collecting a backup", () => {
  it("reads only the manifest keys, never a blind sweep", () => {
    installStorage({
      "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "t1" }] }),
      // Something another app on the same origin left behind.
      "some.other.app": JSON.stringify({ secret: true }),
      "ntacbt.focus.v1": JSON.stringify({ sessions: [], dailyTargetSec: 5400 }),
    });
    const file = collectBackup(at);
    const keys = file.entries.map((e) => e.key);
    expect(keys).toEqual([...TRAVELLING_KEYS]);
    expect(keys).not.toContain("some.other.app");
    // And it must not be serialised into the file either.
    expect(serialiseBackup(file)).not.toContain("some.other.app");
    expect(serialiseBackup(file)).not.toContain("secret");
  });

  it("never carries a credential", () => {
    installStorage({
      "ntacbt.auth.v1": JSON.stringify({ token: "super-secret-bearer", user: { id: "u1" } }),
      "ntacbt.cbt.v1": JSON.stringify({ tests: [] }),
    });
    const file = collectBackup(at);
    for (const staying of STAYING_KEYS) {
      expect(file.entries.map((e) => e.key)).not.toContain(staying);
    }
    // The whole serialised file, because that is what gets downloaded.
    expect(serialiseBackup(file)).not.toContain("super-secret-bearer");
  });

  it("marks absent keys as absent rather than writing null over them", () => {
    installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "t1" }] }) });
    const file = collectBackup(at);
    const cbt = file.entries.find((e) => e.key === "ntacbt.cbt.v1")!;
    const focus = file.entries.find((e) => e.key === "ntacbt.focus.v1")!;
    expect(cbt.present).toBe(true);
    expect(focus.present).toBe(false);
    expect(focus.value).toBeNull();
  });

  it("carries a value that is not JSON instead of dropping it", () => {
    // A key holding a bare string is not corruption — `ntacbt.lang` and
    // `ntacbt.onboarded.v1` are exactly that.
    installStorage({ "ntacbt.lang": '"hi"', "ntacbt.onboarded.v1": "1759236000000" });
    const file = collectBackup(at);
    expect(file.entries.find((e) => e.key === "ntacbt.lang")!.value).toBe("hi");
    expect(file.entries.find((e) => e.key === "ntacbt.onboarded.v1")!.value).toBe(1759236000000);
  });

  it("stamps a version and a timestamp so a future build can refuse it", () => {
    const file = collectBackup(at);
    expect(file.format).toBe("ntacbt.backup");
    expect(file.version).toBe(BACKUP_VERSION);
    expect(file.exportedAt).toBe("2026-09-30T10:00:00.000Z");
  });

  it("is deterministic apart from the timestamp", () => {
    installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "t1" }] }) });
    const a = serialiseBackup(collectBackup(at));
    const b = serialiseBackup(collectBackup(at));
    expect(a).toBe(b);
  });

  it("names the file so a student can sort by date", () => {
    expect(backupFilename(collectBackup(at))).toBe("ntacbt-backup-2026-09-30.json");
  });

  it("survives storage being unavailable", () => {
    // Private mode, or a quota error. A backup page must not white-screen.
    // The stub keeps `clear` because the shared setup calls it around the test.
    installStorage();
    const failing = {
      getItem: () => {
        throw new Error("QuotaExceededError");
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    vi.stubGlobal("localStorage", failing);
    expect(() => collectBackup(at)).not.toThrow();
    expect(deviceIsEmpty()).toBe(true);
  });
});

describe("parsing a picked file", () => {
  const good = () => {
    installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "t1" }] }) });
    return serialiseBackup(collectBackup(at));
  };

  it("round-trips its own output", () => {
    const parsed = parseBackup(good());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.entries).toHaveLength(TRAVELLING_KEYS.length);
    expect(parsed.file.entries.find((e) => e.key === "ntacbt.cbt.v1")!.value).toEqual({
      tests: [{ id: "t1" }],
    });
  });

  it("refuses a file that is not JSON", () => {
    const parsed = parseBackup('{"format":"ntacbt.backup","vers');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problem.kind).toBe("not-json");
    expect(parsed.message).toMatch(/not valid JSON/);
  });

  it("refuses a file from another app that happens to be JSON", () => {
    const parsed = parseBackup(JSON.stringify({ some: "other", app: true }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problem.kind).toBe("not-a-backup");
  });

  it("refuses an array, which is valid JSON but not a backup", () => {
    const parsed = parseBackup("[1,2,3]");
    expect(parsed.ok).toBe(false);
  });

  it("refuses a version it does not understand instead of guessing", () => {
    const future = JSON.stringify({
      format: "ntacbt.backup",
      version: 99,
      exportedAt: "2030-01-01T00:00:00.000Z",
      entries: [{ key: "ntacbt.cbt.v1", value: { tests: [] }, present: true }],
    });
    const parsed = parseBackup(future);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problem.kind).toBe("wrong-version");
    expect(parsed.message).toMatch(/different version/);
  });

  it("refuses a backup with nothing in it", () => {
    const empty = JSON.stringify({
      format: "ntacbt.backup",
      version: BACKUP_VERSION,
      exportedAt: at.toISOString(),
      entries: [],
    });
    const parsed = parseBackup(empty);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problem.kind).toBe("no-entries");
  });

  it("refuses a malformed entry rather than writing half a backup", () => {
    for (const bad of [
      { key: "ntacbt.cbt.v1", value: {} }, // no `present`
      { value: {}, present: true }, // no `key`
      "not-an-object",
    ]) {
      const parsed = parseBackup(
        JSON.stringify({
          format: "ntacbt.backup",
          version: BACKUP_VERSION,
          exportedAt: at.toISOString(),
          entries: [bad],
        }),
      );
      expect(parsed.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("writes nothing when the file is rejected", () => {
    const map = installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "keep" }] }) });
    const parsed = parseBackup('{"format":"wrong"}');
    expect(parsed.ok).toBe(false);
    // The reject path must not have touched the device.
    expect(map.get("ntacbt.cbt.v1")).toBe(JSON.stringify({ tests: [{ id: "keep" }] }));
  });
});

describe("describing a backup before committing", () => {
  it("counts what the student can recognise", () => {
    installStorage({
      "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "a" }, { id: "b" }, { id: "c" }] }),
      "ntacbt.focus.v1": JSON.stringify({ sessions: [{ id: "s1" }], dailyTargetSec: 5400 }),
      "ntacbt.memory.v1": JSON.stringify({ cards: [{ id: "c1" }, { id: "c2" }] }),
      "ntacbt.todo.done.v1": JSON.stringify(["task-1", "task-2", "task-3", "task-4"]),
    });
    const summary = describeBackup(collectBackup(at));
    expect(summary.counts).toEqual({
      "saved tests": 3,
      "focus sessions": 1,
      "revision cards": 2,
      "completed tasks": 4,
    });
  });

  it("flags a key this build has never heard of", () => {
    const parsed = parseBackup(
      JSON.stringify({
        format: "ntacbt.backup",
        version: BACKUP_VERSION,
        exportedAt: at.toISOString(),
        entries: [
          { key: "ntacbt.cbt.v1", value: { tests: [] }, present: true },
          { key: "ntacbt.from-the-future", value: { x: 1 }, present: true },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const summary = describeBackup(parsed.file);
    expect(summary.unknownKeys).toEqual(["ntacbt.from-the-future"]);
    expect(summary.recognised).toContain("ntacbt.cbt.v1");
  });

  it("reports the export date so a student can pick the right file", () => {
    const parsed = parseBackup(serialiseBackup(collectBackup(at)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(describeBackup(parsed.file).exportedAt).toBe("2026-09-30T10:00:00.000Z");
  });

  it("lists what a file does not carry", () => {
    const parsed = parseBackup(
      JSON.stringify({
        format: "ntacbt.backup",
        version: BACKUP_VERSION,
        exportedAt: at.toISOString(),
        entries: [{ key: "ntacbt.cbt.v1", value: { tests: [] }, present: true }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const missing = missingFrom(parsed.file);
    expect(missing).toContain("ntacbt.focus.v1");
    expect(missing).not.toContain("ntacbt.cbt.v1");
  });
});

describe("restoring", () => {
  const backupOf = (seed: Record<string, string>) => {
    installStorage(seed);
    return parseBackup(serialiseBackup(collectBackup(at)));
  };

  it("replace writes every carried key back", () => {
    const file = backupOf({
      "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "t1" }] }),
      "ntacbt.focus.v1": JSON.stringify({ sessions: [{ id: "s1" }], dailyTargetSec: 5400 }),
      "ntacbt.lang": '"hi"',
    });
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    // Wipe the device, then restore.
    const map = installStorage();
    const result = applyBackup(file.file, "replace");

    expect(result.written).toContain("ntacbt.cbt.v1");
    expect(result.written).toContain("ntacbt.focus.v1");
    expect(JSON.parse(map.get("ntacbt.cbt.v1")!)).toEqual({ tests: [{ id: "t1" }] });
    expect(JSON.parse(map.get("ntacbt.focus.v1")!)).toEqual({
      sessions: [{ id: "s1" }],
      dailyTargetSec: 5400,
    });
    // A bare-string key survives as a bare string, not as a quoted JSON string.
    expect(map.get("ntacbt.lang")).toBe('"hi"');
  });

  it("replace removes what the backup does not carry, so the device matches it", () => {
    const file = backupOf({ "ntacbt.cbt.v1": JSON.stringify({ tests: [] }) });
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    const map = installStorage({
      "ntacbt.cbt.v1": JSON.stringify({ tests: [] }),
      "ntacbt.focus.v1": JSON.stringify({ sessions: [{ id: "since" }], dailyTargetSec: 60 }),
    });
    applyBackup(file.file, "replace");
    expect(map.has("ntacbt.focus.v1")).toBe(false);
  });

  it("replace never touches a staying key", () => {
    const file = backupOf({ "ntacbt.cbt.v1": JSON.stringify({ tests: [] }) });
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    const map = installStorage({
      "ntacbt.auth.v1": JSON.stringify({ token: "keep-me" }),
      theme: "dark",
    });
    applyBackup(file.file, "replace");
    expect(map.get("ntacbt.auth.v1")).toBe(JSON.stringify({ token: "keep-me" }));
    expect(map.get("theme")).toBe("dark");
  });

  it("merge keeps work done since the backup was made", () => {
    const file = backupOf({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "old" }] }) });
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    const map = installStorage({
      // Done after the backup was taken.
      "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "new" }] }),
    });
    applyBackup(file.file, "merge");
    expect(JSON.parse(map.get("ntacbt.cbt.v1")!)).toEqual({ tests: [{ id: "new" }] });
  });

  it("merge still fills a key the device does not have", () => {
    const file = backupOf({
      "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "old" }] }),
      "ntacbt.focus.v1": JSON.stringify({ sessions: [], dailyTargetSec: 5400 }),
    });
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    const map = installStorage({ "ntacbt.cbt.v1": JSON.stringify({ tests: [{ id: "new" }] }) });
    applyBackup(file.file, "merge");
    expect(JSON.parse(map.get("ntacbt.cbt.v1")!)).toEqual({ tests: [{ id: "new" }] });
    expect(JSON.parse(map.get("ntacbt.focus.v1")!)).toEqual({ sessions: [], dailyTargetSec: 5400 });
  });

  it("never writes a key it does not recognise", () => {
    const parsed = parseBackup(
      JSON.stringify({
        format: "ntacbt.backup",
        version: BACKUP_VERSION,
        exportedAt: at.toISOString(),
        entries: [
          { key: "ntacbt.cbt.v1", value: { tests: [] }, present: true },
          { key: "ntacbt.evil", value: { nope: true }, present: true },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const map = installStorage();
    const result = applyBackup(parsed.file, "replace");
    expect(result.skipped).toEqual(["ntacbt.evil"]);
    expect(map.has("ntacbt.evil")).toBe(false);
  });

  it("writes an empty key as absent, not as the string null", () => {
    // A key that was missing on the exporting device must not become the literal
    // text "null" on the restoring one — that would break every reader.
    const file = backupOf({ "ntacbt.cbt.v1": JSON.stringify({ tests: [] }) });
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    const map = installStorage();
    applyBackup(file.file, "replace");
    // `replace` clears keys the file does not carry.
    expect(map.has("ntacbt.focus.v1")).toBe(false);
  });
});

describe("the manifest stays complete", () => {
  it("classifies every key the app writes", () => {
    // If a store gains a new key, this fails until it is deliberately put in
    // one of the three lists. That is the point: a backup that silently omits a
    // store is a backup that loses it.
    const classified = new Set<string>([
      ...TRAVELLING_KEYS,
      ...STAYING_KEYS,
      ...Object.keys(UNCLASSIFIED_KEYS),
    ]);
    expect(classified.size).toBe(
      TRAVELLING_KEYS.length + STAYING_KEYS.length + Object.keys(UNCLASSIFIED_KEYS).length,
    );
    for (const key of ["ntacbt.cbt.v1", "ntacbt.focus.v1", "ntacbt.auth.v1", "theme"]) {
      expect(classified.has(key), key).toBe(true);
    }
  });

  it("has no key in two lists", () => {
    const seen = new Set<string>();
    for (const key of [...TRAVELLING_KEYS, ...STAYING_KEYS, ...Object.keys(UNCLASSIFIED_KEYS)]) {
      expect(seen.has(key), `${key} is listed twice`).toBe(false);
      seen.add(key);
    }
  });

  it("keeps the auth token out of the travelling list", () => {
    expect(TRAVELLING_KEYS).not.toContain("ntacbt.auth.v1");
    expect(STAYING_KEYS).toContain("ntacbt.auth.v1");
  });
});
