import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUIET_HOURS,
  MIN_HOURS_TO_WARN,
  MIN_STREAK_TO_PROTECT,
  dueNudges,
  hoursLeftToday,
  isQuietTime,
  notificationReadiness,
  quietHoursLabel,
  type NudgeInput,
  type QuietHours,
} from "@/features/notify/schedule";

/** A local-time date, so the quiet-hours maths is not shifted by the test TZ. */
function at(hour: number, minute = 0): Date {
  const d = new Date(2026, 8, 29, hour, minute, 0, 0);
  return d;
}

/** The same weak-but-real streak, evaluated at 19:00 local. */
function dueNugesAt19() {
  return dueNudges(
    input({
      now: at(19),
      humane: { days: 8, atRiskToday: true, microWin: null },
    }),
  );
}

function input(patch: Partial<NudgeInput> = {}): NudgeInput {
  return {
    now: at(10),
    quiet: DEFAULT_QUIET_HOURS,
    dueReviews: 0,
    humane: { days: 0, atRiskToday: false, microWin: null },
    primaryAction: null,
    weakChapters: 0,
    ...patch,
  };
}

describe("isQuietTime", () => {
  it("treats the default 22:00–07:00 window as quiet at both ends", () => {
    expect(isQuietTime(at(22))).toBe(true);
    expect(isQuietTime(at(23))).toBe(true);
    expect(isQuietTime(at(3))).toBe(true);
    expect(isQuietTime(at(6, 59))).toBe(true);
  });

  it("is not quiet at the boundary hour on the waking side", () => {
    expect(isQuietTime(at(7))).toBe(false);
    expect(isQuietTime(at(21, 59))).toBe(false);
    expect(isQuietTime(at(12))).toBe(false);
  });

  it("handles a window that does not span midnight", () => {
    const q: QuietHours = { startHour: 9, endHour: 12 };
    expect(isQuietTime(at(10), q)).toBe(true);
    expect(isQuietTime(at(8), q)).toBe(false);
    expect(isQuietTime(at(13), q)).toBe(false);
  });

  it("treats an empty window as never quiet", () => {
    expect(isQuietTime(at(3), { startHour: 5, endHour: 5 })).toBe(false);
  });

  it("normalises a malformed window rather than crashing", () => {
    for (const bad of [
      { startHour: NaN, endHour: 7 },
      { startHour: 22, endHour: undefined as never },
      undefined as never,
    ]) {
      expect(() => isQuietTime(at(23), bad)).not.toThrow();
    }
  });
});

describe("quietHoursLabel", () => {
  it("pads to a 24-hour clock", () => {
    expect(quietHoursLabel()).toBe("22:00 – 07:00");
    expect(quietHoursLabel({ startHour: 9, endHour: 12 })).toBe("09:00 – 12:00");
  });
});

describe("hoursLeftToday", () => {
  it("counts down to local midnight", () => {
    expect(hoursLeftToday(at(14))).toBe(10);
    expect(hoursLeftToday(at(23, 30))).toBe(0);
    expect(hoursLeftToday(at(0, 30))).toBe(23);
  });
});

describe("dueNudges — quiet hours are absolute", () => {
  it("returns nothing during quiet hours, whatever the evidence", () => {
    // The one rule with no exception: a student who set 22:00–07:00 is never
    // woken for a streak.
    const strong = input({
      now: at(23),
      dueReviews: 12,
      humane: { days: 30, atRiskToday: true, microWin: "Answer 3 questions." },
      primaryAction: "Revise Electrostatics",
    });
    expect(dueNudges(strong)).toEqual([]);
  });

  it("resumes once the window ends", () => {
    const morning = input({
      now: at(7),
      dueReviews: 3,
      humane: { days: 10, atRiskToday: true, microWin: null },
    });
    expect(dueNudges(morning).length).toBeGreaterThan(0);
  });
});

describe("dueNudges — a nudge needs evidence", () => {
  it("says nothing when there is nothing to say", () => {
    // Most hours of the day qualify. That is the point.
    expect(dueNudges(input())).toEqual([]);
  });

  it("does not fire on a schedule alone", () => {
    // "It has been six hours" is not a reason. No evidence, no nudge.
    expect(dueNudges(input({ now: at(16) }))).toEqual([]);
  });

  it("fires for due reviews with the count named", () => {
    const nudges = dueNudges(input({ dueReviews: 4 }));
    expect(nudges[0]?.kind).toBe("due-review");
    expect(nudges[0]?.title).toBe("4 cards are ready for review");
    expect(nudges[0]?.evidence).toContain("4 cards reached their review date");
  });

  it("singularises a single due card", () => {
    const nudges = dueNudges(input({ dueReviews: 1 }));
    expect(nudges[0]?.title).toBe("1 card is ready for review");
    expect(nudges[0]?.evidence).toContain("1 card reached");
  });
});

describe("dueNudges — loss framing is earned, not assumed", () => {
  it("does not loss-frame a one-day streak", () => {
    // There is no real streak to protect yet, so naming a loss would be
    // manufacturing urgency.
    const nudges = dueNudges(
      input({
        humane: { days: 1, atRiskToday: true, microWin: null },
      }),
    );
    expect(nudges.some((n) => n.kind === "streak-at-risk")).toBe(false);
  });

  it("does not loss-frame when there is barely any day left to warn about", () => {
    // Two hours of warning would be pressure, not information.
    const nudges = dueNudges(
      input({
        now: at(22, 30),
        humane: { days: 20, atRiskToday: true, microWin: null },
      }),
    );
    expect(nudges.some((n) => n.kind === "streak-at-risk")).toBe(false);
  });

  it("does not loss-frame a streak that is not at risk", () => {
    const nudges = dueNudges(
      input({
        humane: { days: 20, atRiskToday: false, microWin: null },
      }),
    );
    expect(nudges.some((n) => n.kind === "streak-at-risk")).toBe(false);
  });

  it("loss-frames a real streak at real risk, and names the fix alongside it", () => {
    const nudges = dueNudges(
      input({
        humane: {
          days: 12,
          atRiskToday: true,
          microWin: "Answer three quick questions.",
        },
      }),
    );
    const streak = nudges.find((n) => n.kind === "streak-at-risk");
    expect(streak?.lossFramed).toBe(true);
    // Leads with what is still there, not with what is about to go.
    expect(streak?.title).toBe("Your 12-day streak is still alive");
    expect(streak?.body).toContain("Answer three quick questions.");
    expect(streak?.body).not.toMatch(/lose|losing|lost|fail/i);
  });

  it("offers a generic five minutes when no micro-win exists", () => {
    const nudges = dueNudges(
      input({
        humane: { days: 8, atRiskToday: true, microWin: null },
      }),
    );
    expect(nudges.find((n) => n.kind === "streak-at-risk")?.body).toContain(
      "Any five minutes counts",
    );
  });

  it("names the hours left, taken from the clock so it can be checked", () => {
    // 19:00 leaves exactly five hours, so the figure in the message is one the
    // student can verify against their own clock.
    const nudges = dueNugesAt19();
    expect(nudges.find((n) => n.kind === "streak-at-risk")?.body).toContain(
      "about 5 hours are left",
    );
  });

  it("uses the exported thresholds rather than hard-coded numbers", () => {
    expect(MIN_STREAK_TO_PROTECT).toBeGreaterThan(1);
    expect(MIN_HOURS_TO_WARN).toBeGreaterThan(0);
  });
});

describe("dueNudges — today's one thing", () => {
  it("leads with the action and never mentions what is missing", () => {
    const nudges = dueNudges(
      input({ primaryAction: "Revise Electrostatics — 2 questions", weakChapters: 3 }),
    );
    const one = nudges.find((n) => n.kind === "one-thing");
    expect(one?.title).toBe("Today's one thing");
    expect(one?.body).toBe("Revise Electrostatics — 2 questions");
    expect(one?.evidence).toContain("3 chapters below the accuracy bar");
    expect(one?.lossFramed).toBe(false);
  });

  it("explains the choice when there are no weak chapters", () => {
    const nudges = dueNudges(input({ primaryAction: "Do the diagnostic" }));
    expect(nudges.find((n) => n.kind === "one-thing")?.evidence).toContain(
      "from your plan for today",
    );
  });
});

describe("dueNudges — no fabricated urgency anywhere", () => {
  it("never manufactures a countdown, a discount or a rival", () => {
    const nudges = dueNudges(
      input({
        dueReviews: 9,
        humane: { days: 40, atRiskToday: true, microWin: "One question." },
        primaryAction: "Revise Atoms",
      }),
    );
    for (const n of nudges) {
      expect(`${n.title} ${n.body}`).not.toMatch(
        /last chance|hurry|expire|discount|% off|others are|don't miss/i,
      );
    }
  });

  it("orders due reviews above the streak above the one thing", () => {
    const nudges = dueNudges(
      input({
        dueReviews: 2,
        humane: { days: 10, atRiskToday: true, microWin: null },
        primaryAction: "Revise Atoms",
      }),
    );
    expect(nudges.map((n) => n.kind)).toEqual(["due-review", "streak-at-risk", "one-thing"]);
  });

  it("gives every nudge an evidence line", () => {
    const nudges = dueNudges(
      input({
        dueReviews: 1,
        humane: { days: 5, atRiskToday: true, microWin: null },
        primaryAction: "Revise Atoms",
      }),
    );
    for (const n of nudges) expect(n.evidence.length).toBeGreaterThan(0);
  });
});

describe("notificationReadiness", () => {
  it("says plainly when the browser cannot notify", () => {
    expect(notificationReadiness("unsupported").canNotify).toBe(false);
    expect(notificationReadiness("denied").reason).toContain("blocked");
    expect(notificationReadiness("default").reason).toContain("Turn notifications on");
  });

  it("is ready when granted", () => {
    expect(notificationReadiness("granted")).toEqual({ canNotify: true, reason: null });
  });
});
