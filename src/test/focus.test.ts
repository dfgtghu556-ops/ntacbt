import { describe, expect, it } from "vitest";
import { focusStreak, todayFocusSeconds, type FocusSession } from "@/features/focus/focus";

const NOW = new Date("2026-09-29T12:00:00").getTime();

function session(startedAt: number, seconds = 30 * 60): FocusSession {
  return { id: `s-${startedAt}`, startedAt, seconds, completed: true, label: "Focus" };
}

describe("focus helpers survive a corrupt store", () => {
  it("ignores a null session instead of throwing", () => {
    // A partially-written or hand-edited localStorage entry can leave a null in
    // the array. Before this guard, `s.completed` threw and blanked the whole
    // dashboard rather than degrading to a smaller number.
    const sessions = [null, undefined, { id: "x" }, session(NOW)] as unknown as FocusSession[];
    expect(() => todayFocusSeconds(sessions, NOW)).not.toThrow();
    expect(todayFocusSeconds(sessions, NOW)).toBe(30 * 60);
  });

  it("ignores a malformed session when computing the streak", () => {
    // focusStreak counts DISTINCT days, not sessions, so two sessions on
    // different days around one bad entry is a streak of 2.
    const sessions = [
      { id: "bad" } as unknown as FocusSession,
      session(NOW),
      session(NOW - 24 * 60 * 60 * 1000),
    ];
    expect(() => focusStreak(sessions, NOW)).not.toThrow();
    expect(focusStreak(sessions, NOW)).toBe(2);
  });

  it("handles a non-array session list", () => {
    expect(() => todayFocusSeconds(null as never, NOW)).not.toThrow();
    expect(todayFocusSeconds(null as never, NOW)).toBe(0);
    expect(focusStreak(undefined as never, NOW)).toBe(0);
  });

  it("still counts only sessions that reached the 25-minute bar", () => {
    const sessions = [session(NOW), session(NOW - 24 * 60 * 60 * 1000, 10 * 60)];
    expect(focusStreak(sessions, NOW)).toBe(1);
  });

  it("still counts only today's seconds", () => {
    const sessions = [session(NOW), session(NOW - 24 * 60 * 60 * 1000)];
    expect(todayFocusSeconds(sessions, NOW)).toBe(30 * 60);
  });
});
