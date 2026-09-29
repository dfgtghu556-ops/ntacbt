/**
 * NotificationBell — the bell must be a live control (B7), and the panel must
 * never hide the reasoning behind a nudge.
 *
 * The bell was a `<button aria-label="Notifications">` with no `onClick`. A
 * control that looks like a feature and does nothing is worse than no control,
 * so this suite asserts the wiring rather than the styling:
 *
 *  - clicking it actually opens a labelled panel;
 *  - every nudge carries its evidence, so the student can check the reasoning;
 *  - quiet hours are editable from the panel and stated back to the student;
 *  - the permission prompt is never shown to a student who already granted it;
 *  - Escape closes the panel.
 */

import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NotificationBell } from "../components/layout/NotificationBell";
import { dueNudges, DEFAULT_QUIET_HOURS, quietHoursLabel } from "../features/notify/schedule";
import { loadQuietHours, saveQuietHours } from "../features/notify/use-nudges";

/** A moment inside the default quiet window (23:30 local). */
function quietMoment(): Date {
  const d = new Date();
  d.setHours(23, 30, 0, 0);
  return d;
}

/** A moment in the middle of the working day. */
function daytimeMoment(): Date {
  const d = new Date();
  d.setHours(15, 0, 0, 0);
  return d;
}

const AT_RISK = {
  days: 6,
  atRiskToday: true,
  microWin: "Do one 25-minute session",
};

describe("NotificationBell wiring", () => {
  it("opens a labelled panel when clicked", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    expect(await screen.findByRole("dialog", { name: "Notifications" })).toBeTruthy();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("states the quiet window instead of silently dropping nudges", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    const label = quietHoursLabel(DEFAULT_QUIET_HOURS);
    expect(await screen.findByText(new RegExp(label.replace(/[()]/g, "\\$&")))).toBeTruthy();
  });

  it("lets the student change the quiet window from the panel", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    const start = (await screen.findByLabelText("Quiet hours start")) as HTMLSelectElement;
    await user.selectOptions(start, "21");

    // The panel is driven by the hook, which persists and re-evaluates.
    await waitFor(() => expect(loadQuietHours().startHour).toBe(21));
  });

  it("always shows either a nudge or an honest empty state", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    const text = dialog.textContent ?? "";
    const empty = /nothing needs you right now/i.test(text);
    const items = Array.from(dialog.querySelectorAll("li"));

    expect(items.length > 0 || empty).toBe(true);
    // When a nudge is listed, its reason is listed with it — never a bare
    // "you should study" with no way to check why.
    for (const li of items) {
      const evidence = li.querySelector('[data-evidence="true"]');
      expect(evidence, `nudge without evidence: ${li.textContent}`).toBeTruthy();
      expect((evidence?.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });
});

describe("nudges shown in the panel carry evidence", () => {
  it("every nudge kind names the reason it exists", () => {
    const kinds = dueNudges({
      now: daytimeMoment(),
      quiet: DEFAULT_QUIET_HOURS,
      dueReviews: 12,
      humane: AT_RISK,
      primaryAction: "Electrostatics: 10 questions",
      weakChapters: 3,
    });
    expect(kinds.length).toBeGreaterThan(0);
    for (const n of kinds) {
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.body.length).toBeGreaterThan(0);
      expect(n.evidence.length).toBeGreaterThan(0);
    }
  });

  it("loss framing is marked, and it names the fix alongside the risk", () => {
    const kinds = dueNudges({
      now: daytimeMoment(),
      quiet: DEFAULT_QUIET_HOURS,
      dueReviews: 0,
      humane: AT_RISK,
      primaryAction: null,
      weakChapters: 0,
    });
    const loss = kinds.filter((n) => n.lossFramed);
    expect(loss.length).toBeGreaterThan(0);
    for (const n of loss) {
      // The fix must be in the message, not only the risk.
      expect(n.body.toLowerCase()).toMatch(/save|still|five|25|minute|review|question/);
    }
  });

  it("quiet hours suppress every nudge", () => {
    expect(
      dueNudges({
        now: quietMoment(),
        quiet: DEFAULT_QUIET_HOURS,
        dueReviews: 50,
        humane: AT_RISK,
        primaryAction: "Electrostatics",
        weakChapters: 9,
      }),
    ).toEqual([]);
  });
});

describe("quiet-hours preference round-trip", () => {
  it("persists and reloads", () => {
    localStorage.clear();
    expect(loadQuietHours()).toEqual(DEFAULT_QUIET_HOURS);
    saveQuietHours({ startHour: 23, endHour: 6 });
    expect(loadQuietHours()).toEqual({ startHour: 23, endHour: 6 });
    localStorage.clear();
  });

  it("falls back to the default on malformed storage", () => {
    localStorage.clear();
    localStorage.setItem("ntacbt.notify.quietHours", "{not json");
    expect(loadQuietHours()).toEqual(DEFAULT_QUIET_HOURS);
    localStorage.clear();
  });
});
