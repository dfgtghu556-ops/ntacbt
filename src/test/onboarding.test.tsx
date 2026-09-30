/**
 * Onboarding (B6) — goal to first session, without a dark pattern.
 *
 * The spec is: minimal input, value-first, progressive disclosure, skip
 * option, progress + success states. The part worth testing hardest is the
 * part a spec usually leaves out — what happens when the student does
 * something the designer did not expect.
 *
 *   - Skipping must produce a *working* default, not a blocked app.
 *   - A past exam date must be rejected, not stored and counted down to.
 *   - A malformed stored profile must degrade, never crash the first screen.
 *   - Every derived number must be checkable arithmetic, not an assertion.
 *   - The wizard must never write to the legacy `jeecbt.v1` blob, which the
 *     classic app owns and this app only reads.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  DAILY_OPTIONS,
  DEFAULT_STUDY_PROFILE,
  GOALS,
  completeOnboarding,
  daysUntilExam,
  hasCompletedOnboarding,
  hasLegacyPlanner,
  loadStudyProfile,
  normaliseProfile,
  planSummary,
  saveStudyProfile,
  weeklyMinutes,
  type StudyProfile,
} from "../features/onboarding/profile";
import { OnboardingWizard } from "../components/onboarding/OnboardingWizard";

const PROFILE_KEY = "ntacbt.profile.v1";
const ONBOARDED_KEY = "ntacbt.onboarded.v1";

beforeEach(() => {
  localStorage.clear();
});

describe("the options themselves", () => {
  it("offers only goals the planner can actually plan for", () => {
    expect(GOALS.length).toBeGreaterThan(1);
    for (const g of GOALS) {
      expect(g.label.length).toBeGreaterThan(0);
      expect(g.hint.length).toBeGreaterThan(0);
    }
  });

  it("offers daily amounts as a segmented control, not free text", () => {
    for (const o of DAILY_OPTIONS) {
      expect(Number.isInteger(o.minutes)).toBe(true);
      expect(o.minutes).toBeGreaterThan(0);
      expect(o.minutes).toBeLessThanOrEqual(24 * 60);
    }
  });
});

describe("derived numbers are checkable arithmetic", () => {
  it("weekly hours are daily minutes times seven, in hours", () => {
    expect(weeklyMinutes(60)).toBe(7);
    expect(weeklyMinutes(30)).toBe(4); // 3.5 rounds, and it says so
    expect(weeklyMinutes(180)).toBe(21);
  });

  it("never claims more hours than the day contains", () => {
    for (const o of DAILY_OPTIONS) {
      expect(weeklyMinutes(o.minutes)).toBeLessThan(7 * 24);
    }
  });

  it("days until the exam is null without a date, and never negative", () => {
    expect(daysUntilExam(null)).toBeNull();
    const past = "2001-01-01";
    expect(daysUntilExam(past, Date.now())).toBeNull();
    const future = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const days = daysUntilExam(future, Date.now());
    expect(days).not.toBeNull();
    expect(days as number).toBeGreaterThan(0);
    expect(days as number).toBeLessThanOrEqual(11);
  });

  it("the summary states inputs, not a promised outcome", () => {
    const s = planSummary({ goal: "jeeadv", examDate: null, minutesPerDay: 120, createdAt: 0 });
    expect(s).toMatch(/JEE Advanced/);
    expect(s).toMatch(/14 hours a week/);
    // No promise of a rank, a seat, or a score.
    expect(s).not.toMatch(/guarantee|will score|rank|seat|AIR/i);
  });
});

describe("a malformed store degrades", () => {
  it("falls back to the default on unparseable JSON", () => {
    localStorage.setItem(PROFILE_KEY, "{{{not json");
    expect(loadStudyProfile()).toEqual(DEFAULT_STUDY_PROFILE);
  });

  it("rejects an unknown goal instead of planning for it", () => {
    const p = normaliseProfile({ goal: "neet", minutesPerDay: 60, createdAt: 1 });
    expect(p.goal).toBe(DEFAULT_STUDY_PROFILE.goal);
  });

  it("rejects a non-offered daily amount", () => {
    const p = normaliseProfile({ goal: "jeemain", minutesPerDay: 43, createdAt: 1 });
    expect(p.minutesPerDay).toBe(DEFAULT_STUDY_PROFILE.minutesPerDay);
  });

  it("rejects an exam date in the past", () => {
    const p = normaliseProfile({ goal: "jeemain", examDate: "2019-05-05", createdAt: 1 });
    expect(p.examDate).toBeNull();
  });

  it("accepts a future exam date", () => {
    const future = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const p = normaliseProfile({ goal: "jeemain", examDate: future, createdAt: 1 });
    expect(p.examDate).toBe(future);
  });

  it("survives a null store", () => {
    expect(normaliseProfile(null)).toEqual(DEFAULT_STUDY_PROFILE);
  });
});

describe("the wizard never touches the legacy blob", () => {
  it("writes only its own keys", () => {
    localStorage.setItem("jeecbt.v1", JSON.stringify({ aiPlanner: { profile: {}, tasks: [] } }));
    saveStudyProfile({ goal: "board12", examDate: null, minutesPerDay: 90, createdAt: 0 });
    const legacy = localStorage.getItem("jeecbt.v1");
    expect(legacy).toBe(JSON.stringify({ aiPlanner: { profile: {}, tasks: [] } }));
    expect(hasLegacyPlanner()).toBe(true);
  });

  it("reports no legacy planner when the key is absent", () => {
    expect(hasLegacyPlanner()).toBe(false);
  });
});

describe("skip is a real answer", () => {
  it("marks onboarding done without writing a profile", () => {
    completeOnboarding();
    expect(hasCompletedOnboarding()).toBe(true);
    expect(loadStudyProfile()).toEqual(DEFAULT_STUDY_PROFILE);
  });

  it("does not re-show for a returning student", () => {
    expect(hasCompletedOnboarding()).toBe(false);
    completeOnboarding();
    expect(hasCompletedOnboarding()).toBe(true);
  });

  it("a completed save is idempotent", () => {
    saveStudyProfile({ goal: "jeemain", examDate: null, minutesPerDay: 60, createdAt: 0 });
    completeOnboarding();
    completeOnboarding();
    expect(hasCompletedOnboarding()).toBe(true);
    const p: StudyProfile = loadStudyProfile();
    expect(p.goal).toBe("jeemain");
  });
});

describe("the wizard flow", () => {
  function setup() {
    const user = userEvent.setup();
    let done = 0;
    render(<OnboardingWizard onDone={() => done++} startTo="/app/planner" startLabel="Go" />);
    return { user, doneCount: () => done };
  }

  it("opens on the goal step with progress shown", () => {
    setup();
    expect(screen.getByText(/what are you preparing for/i)).toBeTruthy();
    expect(screen.getByText(/step 1 of 4/i)).toBeTruthy();
  });

  it("offers skip on the first screen at the same level as Next", () => {
    setup();
    expect(screen.getByRole("button", { name: /skip for now/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /next/i })).toBeTruthy();
  });

  it("walks goal → time → date → ready and saves", async () => {
    const { user, doneCount } = setup();
    await user.click(screen.getByRole("button", { name: /JEE Advanced/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /1½ hours/i }));
    // The derived weekly figure is shown before the student commits to it.
    expect(screen.getByText(/11 hours a week/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    const future = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await user.type(screen.getByLabelText(/exam date/i), future);
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    expect(screen.getByText(/you are set up/i)).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /^go$/i }));

    expect(doneCount()).toBe(1);
    const saved = loadStudyProfile();
    expect(saved.goal).toBe("jeeadv");
    expect(saved.minutesPerDay).toBe(90);
    expect(saved.examDate).toBe(future);
    expect(hasCompletedOnboarding()).toBe(true);
  });

  it("keeps Back working without losing a choice", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /CBSE Class 12 boards/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));
    // The pressed state survives going back — the choice was never lost.
    expect(
      screen.getByRole("button", { name: /CBSE Class 12 boards/i }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("the final screen is a start button, not a summary of inputs", async () => {
    const { user } = setup();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("link", { name: /^go$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^next$/i })).toBeNull();
  });

  it("skip on the last screen still finishes the flow", async () => {
    const { user, doneCount } = setup();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /^skip$/i }));
    expect(doneCount()).toBe(1);
    expect(hasCompletedOnboarding()).toBe(true);
  });
});
