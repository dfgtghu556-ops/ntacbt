import { describe, expect, it } from "vitest";
import {
  XP,
  achievements,
  badgesFor,
  levelForXp,
  levelSpan,
  xpBreakdown,
  xpForLevel,
  type AchievementInput,
} from "@/features/focus/achievements";
import type { FocusSession } from "@/features/focus/focus";
import type { HumaneStreak } from "@/features/focus/streak";

function session(minutes: number, completed = true): FocusSession {
  return {
    id: `s-${minutes}-${completed}`,
    startedAt: 1_700_000_000_000,
    seconds: minutes * 60,
    completed,
    label: "Focus",
  };
}

function streak(days: number): HumaneStreak {
  return {
    days,
    frozen: false,
    freezesLeft: 2,
    atRiskToday: false,
    hoursLeftToday: 12,
    autoProtected: false,
    nudge: null,
    microWin: "",
  };
}

function input(patch: Partial<AchievementInput> = {}): AchievementInput {
  return {
    focusSessions: [],
    questionsAttempted: 0,
    lessonsFinished: 0,
    masteredChapters: 0,
    humane: streak(0),
    survival: null,
    personalBestDays: 0,
    ...patch,
  };
}

describe("levelForXp", () => {
  it("starts at level 1 with no XP", () => {
    const l = levelForXp(0);
    expect(l.level).toBe(1);
    expect(l.xpIntoLevel).toBe(0);
    expect(l.toNext).toBe(100);
  });

  it("levels up exactly at the span boundary", () => {
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100).level).toBe(2);
    expect(levelForXp(100).xpIntoLevel).toBe(0);
  });

  it("makes each level cost more than the last", () => {
    expect(levelSpan(2)).toBeGreaterThan(levelSpan(1));
    expect(levelSpan(3)).toBeGreaterThan(levelSpan(2));
  });

  it("is consistent with xpForLevel", () => {
    for (const level of [1, 2, 3, 5, 10]) {
      expect(levelForXp(xpForLevel(level)).level).toBe(level);
    }
  });

  it("gives every level a descriptive title", () => {
    for (const level of [1, 5, 20, 100]) {
      expect(levelForXp(xpForLevel(level)).title.length).toBeGreaterThan(0);
    }
  });

  it("clamps a negative total instead of going below level 1", () => {
    expect(levelForXp(-500).level).toBe(1);
  });

  it("terminates on an absurd XP figure", () => {
    const l = levelForXp(10_000_000);
    expect(l.level).toBeLessThanOrEqual(500);
    expect(l.toNext).toBeGreaterThan(0);
  });
});

describe("xpBreakdown", () => {
  it("is empty for a student with no evidence", () => {
    expect(xpBreakdown(input())).toEqual([]);
  });

  it("explains every part it awards", () => {
    const b = xpBreakdown(
      input({
        focusSessions: [session(30), session(45)],
        questionsAttempted: 12,
        lessonsFinished: 3,
        masteredChapters: 2,
        humane: streak(5),
        survival: { score: 80 },
      }),
    );
    expect(b.length).toBe(6);
    for (const part of b) {
      expect(part.xp).toBeGreaterThan(0);
      expect(part.reason.length).toBeGreaterThan(0);
    }
    // 75 focus minutes, 12 questions, 3 lessons, 2 chapters, 5 streak days.
    expect(b.find((p) => p.source === "Focus time")?.xp).toBe(75 * XP.perFocusMinute);
    expect(b.find((p) => p.source === "Questions attempted")?.xp).toBe(12 * XP.perQuestion);
  });

  it("counts only completed focus sessions, so a timer left running earns nothing", () => {
    const running = xpBreakdown(input({ focusSessions: [session(120, false)] }));
    expect(running).toEqual([]);
  });

  it("awards the readiness bonus only at the threshold", () => {
    expect(
      xpBreakdown(input({ survival: { score: 69 } })).find((p) => p.source === "Readiness"),
    ).toBeUndefined();
    expect(
      xpBreakdown(input({ survival: { score: 70 } })).find((p) => p.source === "Readiness")?.xp,
    ).toBe(XP.readinessBonus);
  });

  it("survives a malformed session list", () => {
    expect(() =>
      xpBreakdown(
        input({ focusSessions: [null as never, undefined as never, { id: "x" } as never] }),
      ),
    ).not.toThrow();
  });
});

describe("badgesFor", () => {
  it("earns nothing for a student with no evidence", () => {
    expect(badgesFor(input()).every((b) => !b.earned)).toBe(true);
  });

  it("earns a badge exactly at its target", () => {
    const atTarget = badgesFor(input({ questionsAttempted: 100 }));
    const below = badgesFor(input({ questionsAttempted: 99 }));
    expect(atTarget.find((b) => b.id === "hundred-questions")?.earned).toBe(true);
    expect(below.find((b) => b.id === "hundred-questions")?.earned).toBe(false);
  });

  it("reports progress between 0 and 1 for an unearned badge", () => {
    const badges = badgesFor(input({ questionsAttempted: 50 }));
    const b = badges.find((x) => x.id === "hundred-questions");
    expect(b?.earned).toBe(false);
    expect(b?.progress).toBeCloseTo(0.5, 5);
  });

  it("never reports progress above 1", () => {
    const badges = badgesFor(input({ questionsAttempted: 5000, focusSessions: [session(600)] }));
    for (const b of badges) expect(b.progress).toBeLessThanOrEqual(1);
  });

  it("has a description for every badge", () => {
    for (const b of badgesFor(input())) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(b.bonus).toBeGreaterThan(0);
    }
  });
});

describe("badgesFor — earning-based, never guilt", () => {
  it("has no badge that can be earned by NOT doing something", () => {
    // Every predicate asserts a completed positive act. There is no "you failed
    // to…" badge and no countdown, because those nag rather than motivate.
    const badges = badgesFor(input());
    for (const b of badges) {
      expect(b.description).not.toMatch(/\b(fail|missed|skipped|didn't|haven't|without)\b/i);
      expect(b.label).not.toMatch(/\b(fail|missed|skipped|lost)\b/i);
    }
  });

  it("does not shame a student with an empty week in the summary", () => {
    const summary = achievements(input());
    // Word boundaries matter: "badges" contains "bad", and a naive pattern would
    // fail on perfectly good copy.
    expect(summary.note).not.toMatch(/\b(fail|bad|lazy|poor|shame|missed|loser)\b/i);
    expect(summary.note).toContain("none of them can be lost");
  });

  it("earns the personal-record badge only against the student's own best", () => {
    const beaten = badgesFor(input({ humane: streak(8), personalBestDays: 5 }));
    expect(beaten.find((b) => b.id === "beat-your-best")?.earned).toBe(true);

    const notBeaten = badgesFor(input({ humane: streak(3), personalBestDays: 5 }));
    expect(notBeaten.find((b) => b.id === "beat-your-best")?.earned).toBe(false);

    // A first-ever streak is not a "personal best" — there is nothing to beat.
    const first = badgesFor(input({ humane: streak(3), personalBestDays: 0 }));
    expect(first.find((b) => b.id === "beat-your-best")?.earned).toBe(false);
  });
});

describe("achievements", () => {
  it("is all zeroes and no badges for a brand-new student", () => {
    const a = achievements(input());
    expect(a.xp).toBe(0);
    expect(a.level.level).toBe(1);
    expect(a.earned).toEqual([]);
    expect(a.nextBadge).not.toBeNull();
  });

  it("adds badge bonuses on top of the activity XP", () => {
    const a = achievements(input({ questionsAttempted: 100 }));
    const activity = xpBreakdown(input({ questionsAttempted: 100 })).reduce((n, p) => n + p.xp, 0);
    const bonus = a.earned.reduce((n, b) => n + b.bonus, 0);
    expect(a.xp).toBe(activity + bonus);
  });

  it("suggests the closest unearned badge", () => {
    const a = achievements(input({ questionsAttempted: 90 }));
    expect(a.nextBadge?.id).toBe("hundred-questions");
    expect(a.nextBadge?.progress).toBeCloseTo(0.9, 5);
  });

  it("has no next badge when everything is earned", () => {
    const a = achievements(
      input({
        focusSessions: [session(600)],
        questionsAttempted: 500,
        lessonsFinished: 10,
        masteredChapters: 10,
        humane: streak(30),
        survival: { score: 90 },
        personalBestDays: 5,
      }),
    );
    expect(a.earned.length).toBe(a.badges.length);
    expect(a.nextBadge).toBeNull();
    expect(a.note).toContain("All of them, in fact");
  });

  it("levels up as the evidence grows", () => {
    const small = achievements(input({ questionsAttempted: 5 }));
    const large = achievements(input({ questionsAttempted: 400, focusSessions: [session(300)] }));
    expect(large.level.level).toBeGreaterThan(small.level.level);
    expect(large.xp).toBeGreaterThan(small.xp);
  });

  it("is derived, so it can never be inflated by editing stored state", () => {
    // The same evidence always produces the same XP — there is no counter to
    // tamper with, and a re-read after a reload is identical.
    const a = achievements(input({ questionsAttempted: 60, humane: streak(4) }));
    const b = achievements(input({ questionsAttempted: 60, humane: streak(4) }));
    expect(a.xp).toBe(b.xp);
    expect(a.level.level).toBe(b.level.level);
  });
});
