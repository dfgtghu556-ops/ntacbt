/**
 * ETHICAL NUDGES (A10 — the notification half)
 *
 * The research doc asks for "loss-framed reminder ('streak ends in 5 min') +
 * 'today's one thing' push; **respect quiet hours**". It also says, in the same
 * breath, that loss-framing is only ethical "where real value is at stake …
 * never to fabricate urgency", and that the humane streak must "never punish a
 * miss into a rage-quit".
 *
 * Those two requirements are in tension, and this module resolves it with one
 * rule: **a nudge may only name something the student will genuinely lose, and
 * it must lead with what they can still do about it.**
 *
 * Concretely:
 *
 *  - **Quiet hours are absolute.** No nudge fires inside them, whatever the
 *    evidence. A student who set 22:00–07:00 is never woken for a streak.
 *  - **A nudge needs evidence, not a schedule.** "It has been six hours" is not
 *    a reason. A due review, a task due today, or a real streak with hours left
 *    is.
 *  - **The loss is named only when it is real and only alongside the fix.** A
 *    streak with one day of history is not framed as a loss — there is nothing
 *    to lose yet. When a streak is genuinely at risk, the nudge says so *and*
 *    names the five-minute action that saves it, so the message is "here is what
 *    you can still do", never "you are about to fail".
 *  - **Nothing is ever invented to create urgency.** There is no countdown to a
 *    discount, no "others are studying", no streak that exists only if the
 *    student opens the app today.
 *
 * All of this is pure and synchronous so the rules are testable without a
 * browser, a permission prompt or a service worker.
 */

/** Local-time quiet hours. `startHour` may exceed `endHour` to span midnight. */
export interface QuietHours {
  /** 0–23, inclusive. */
  startHour: number;
  /** 0–23, exclusive — 7 means "until 07:00". */
  endHour: number;
}

/** The default: nobody is woken between 22:00 and 07:00. */
export const DEFAULT_QUIET_HOURS: QuietHours = { startHour: 22, endHour: 7 };

/** Below this many streak days there is no real streak to protect. */
export const MIN_STREAK_TO_PROTECT = 2;

/** Below this many hours left in the day, an "ends today" framing is premature. */
export const MIN_HOURS_TO_WARN = 2;

export type NudgeKind =
  /** Memory cards are due. */
  | "due-review"
  /** A real streak is genuinely at risk today. */
  | "streak-at-risk"
  /** Today's single next action. */
  | "one-thing";

export interface Nudge {
  kind: NudgeKind;
  title: string;
  /** One line. Leads with what the student can do. */
  body: string;
  /** Why this nudge exists, for the "how we decided" line. */
  evidence: string;
  /** True when the nudge names something genuinely at stake. */
  lossFramed: boolean;
}

export interface NudgeInput {
  now: Date;
  quiet: QuietHours;
  /** Cards due for review right now. */
  dueReviews: number;
  humane: {
    days: number;
    atRiskToday: boolean;
    /** A tiny action that keeps the streak alive, when one exists. */
    microWin: string | null;
  };
  /** Today's single primary action, when the plan has one. */
  primaryAction: string | null;
  /** Chapters with a measured weakness. */
  weakChapters: number;
}

/** Normalise an hour into 0–23. A malformed value becomes 0, never a crash. */
function hour(n: number | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return ((Math.floor(n) % 24) + 24) % 24;
}

/**
 * True when `now` falls inside the quiet window.
 *
 * A window that spans midnight (22 → 7) is handled by testing both ends, so a
 * student is never nudged at 23:00 or at 03:00.
 */
export function isQuietTime(now: Date, quiet: QuietHours = DEFAULT_QUIET_HOURS): boolean {
  const h = now.getHours();
  const start = hour(quiet?.startHour);
  const end = hour(quiet?.endHour);
  if (start === end) return false; // An empty window is not a quiet window.
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

/** Hours remaining before local midnight, rounded down. */
export function hoursLeftToday(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 3_600_000));
}

/** A human label for the quiet window, for the settings UI. */
export function quietHoursLabel(quiet: QuietHours = DEFAULT_QUIET_HOURS): string {
  const pad = (n: number) => `${hour(n)}`.padStart(2, "0");
  return `${pad(quiet?.startHour)}:00 – ${pad(quiet?.endHour)}:00`;
}

/**
 * The nudges worth sending now, in priority order.
 *
 * An empty array is a normal, common result — most hours of the day have nothing
 * worth interrupting a student for, and that is the point.
 */
export function dueNudges(input: NudgeInput): Nudge[] {
  // Quiet hours override everything. This is the one rule with no exception.
  if (isQuietTime(input.now, input.quiet)) return [];

  const out: Nudge[] = [];
  const hoursLeft = hoursLeftToday(input.now);

  // 1. Due reviews. The strongest reason to open the app: the schedule says now.
  if (input.dueReviews > 0) {
    out.push({
      kind: "due-review",
      title:
        input.dueReviews === 1
          ? "1 card is ready for review"
          : `${input.dueReviews} cards are ready for review`,
      body:
        input.dueReviews === 1
          ? "One question you got wrong is due. Answering it now is what makes it stick."
          : "Questions you got wrong are due. Answering them now is what makes them stick.",
      evidence: `${input.dueReviews} card${input.dueReviews === 1 ? "" : "s"} reached their review date.`,
      lossFramed: false,
    });
  }

  // 2. A real streak at genuine risk. Both conditions must hold, and the fix is
  //    named alongside the risk.
  const realStreak = input.humane.days >= MIN_STREAK_TO_PROTECT;
  const timeLeft = hoursLeft >= MIN_HOURS_TO_WARN;
  // `hoursLeft` comes from the clock, not from the caller. A caller-supplied
  // figure could disagree with the actual time of day, and a nudge that says
  // "five hours left" when there are two is a lie about something the student
  // can check by looking at their own clock.
  if (input.humane.atRiskToday && realStreak && timeLeft) {
    const fix = input.humane.microWin ? ` ${input.humane.microWin}` : " Any five minutes counts.";
    out.push({
      kind: "streak-at-risk",
      title: `Your ${input.humane.days}-day streak is still alive`,
      // The loss is real, so it is named — but the message leads with what is
      // still there, not with what is about to go.
      body: `You have not studied yet today, and about ${hoursLeft} hour${
        hoursLeft === 1 ? "" : "s"
      } are left.${fix}`,
      evidence: `${input.humane.days}-day streak, no activity logged today, ${hoursLeft} hour${
        hoursLeft === 1 ? "" : "s"
      } left before the day ends.`,
      lossFramed: true,
    });
  }

  // 3. Today's one thing. Never mentions what is missing.
  if (input.primaryAction) {
    out.push({
      kind: "one-thing",
      title: "Today's one thing",
      body: input.primaryAction,
      evidence:
        input.weakChapters > 0
          ? `Chosen from ${input.weakChapters} chapter${input.weakChapters === 1 ? "" : "s"} below the accuracy bar.`
          : "Chosen from your plan for today.",
      lossFramed: false,
    });
  }

  return out;
}

/**
 * Whether the browser may show a notification, and why not if it may not.
 *
 * A nudge the student cannot receive is not a nudge, so the caller is told
 * plainly rather than being left to discover it.
 */
export function notificationReadiness(permission: NotificationPermission | "unsupported"): {
  canNotify: boolean;
  reason: string | null;
} {
  if (permission === "unsupported") {
    return { canNotify: false, reason: "This browser cannot show notifications." };
  }
  if (permission === "denied") {
    return {
      canNotify: false,
      reason:
        "Notifications are blocked for this site. You can re-enable them in your browser settings.",
    };
  }
  if (permission === "default") {
    return { canNotify: false, reason: "Turn notifications on to get today's one thing." };
  }
  return { canNotify: true, reason: null };
}
