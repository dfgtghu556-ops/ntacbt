/**
 * StudyTube progress — the local store behind Watch later and the notes.
 *
 * `localStorage.setItem` throws instead of returning a status: on quota
 * exhaustion, and in Safari private mode or wherever storage is blocked, the
 * write fails and the exception unwinds. The mutators here used to let that
 * exception reach the click handler, so the button flipped to its new state and
 * the write was silently lost — a student believed a lecture was saved when
 * nothing had been stored, and would only find out later when it was gone.
 *
 * These tests pin the two properties that fix depends on: a failed write is
 * reported rather than thrown, and the UI is never told a save succeeded when it
 * did not.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadStudyTubeProgress,
  markWatched,
  saveHandshake,
  setNote,
  toggleWatchLater,
} from "@/features/studytube/progress";

const KEY = "ntacbt.studytube.v1";

/**
 * A localStorage stand-in whose writes can be made to fail mid-test.
 *
 * The flag is mutable rather than a constructor argument because the interesting
 * cases are a store that is written successfully and *then* stops accepting
 * writes — re-stubbing would throw the stored data away and test nothing.
 */
function stubStorage() {
  const data = new Map<string, string>();
  const state = { failWrites: false };
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      if (state.failWrites) {
        // What Safari private mode and an exceeded quota actually do.
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  });
  return { data, state };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("a write that fails is reported, not thrown", () => {
  it("does not throw out of toggleWatchLater when storage is full", () => {
    stubStorage().state.failWrites = true;
    // Before the guard this unwound into the click handler.
    expect(() => toggleWatchLater("vid_abcdefghij")).not.toThrow();
  });

  it("does not throw out of setNote when storage is blocked", () => {
    stubStorage().state.failWrites = true;
    expect(() => setNote("vid_abcdefghij", "my own words")).not.toThrow();
  });

  it("does not throw out of markWatched when storage is blocked", () => {
    stubStorage().state.failWrites = true;
    expect(() => markWatched("vid_abcdefghij", "A lecture", true)).not.toThrow();
  });

  it("reports the failure so the caller can tell the student", () => {
    stubStorage().state.failWrites = true;
    // false means "this did not land" — the caller must not flip its label.
    expect(setNote("vid_abcdefghij", "text")).toBe(false);
  });
});

describe("the caller is never told a save succeeded when it did not", () => {
  it("leaves the watch-later state alone when the write fails", () => {
    stubStorage().state.failWrites = true;
    // Not present to begin with, and still not present after a failed add.
    expect(toggleWatchLater("vid_abcdefghij")).toBe(false);
    expect(loadStudyTubeProgress().watchLater).toEqual([]);
  });

  it("keeps it on the list when a remove fails", () => {
    const { data, state } = stubStorage();
    toggleWatchLater("vid_abcdefghij");
    expect(loadStudyTubeProgress().watchLater).toContain("vid_abcdefghij");

    // Storage now refuses every write, and the student tries to remove it.
    state.failWrites = true;
    // The old code returned the new state unconditionally, so the UI would show
    // it as removed while the store still held it.
    expect(toggleWatchLater("vid_abcdefghij")).toBe(true);
    expect(loadStudyTubeProgress().watchLater).toContain("vid_abcdefghij");
    expect(data.size).toBe(1);
  });

  it("still succeeds normally when storage works", () => {
    stubStorage();
    expect(toggleWatchLater("vid_abcdefghij")).toBe(true);
    expect(toggleWatchLater("vid_abcdefghij")).toBe(false);
    expect(setNote("vid_abcdefghij", "note")).toBe(true);
    expect(loadStudyTubeProgress().notes["vid_abcdefghij"]?.text).toBe("note");
  });
});

describe("reading degrades rather than throwing", () => {
  it("returns an empty store when the stored JSON is corrupt", () => {
    stubStorage();
    localStorage.setItem(KEY, "{not json");
    const store = loadStudyTubeProgress();
    expect(store.watchLater).toEqual([]);
    expect(store.notes).toEqual({});
  });

  it("returns an empty store when getItem itself throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });
    expect(loadStudyTubeProgress().watchLater).toEqual([]);
  });
});

describe("the handshake mapping stays honest", () => {
  it("does not write a blank chapter", () => {
    stubStorage();
    saveHandshake("vid_abcdefghij", {
      recall: 4,
      practice: 3,
      mastery: "Learning",
      subject: "Physics",
      chapter: "",
    });
    const h = loadStudyTubeProgress().handshakes["vid_abcdefghij"];
    expect(h?.subject).toBe("Physics");
    expect(h?.chapter).toBeUndefined();
  });

  it("keeps a chapter that is known", () => {
    stubStorage();
    saveHandshake("vid_abcdefghij", {
      recall: 4,
      practice: 3,
      mastery: "Strong",
      subject: "Physics",
      chapter: "Gravitation",
    });
    expect(loadStudyTubeProgress().handshakes["vid_abcdefghij"]?.chapter).toBe("Gravitation");
  });
});
