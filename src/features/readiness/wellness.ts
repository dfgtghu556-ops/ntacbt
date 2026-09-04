/**
 * Wellness / balance signals — never guilt, always support.
 *
 * Sleep, breaks and "identity beyond the exam" nudges. These build trust
 * (research: burnout comes from no breaks, no recovery). Everything here is
 * derived from real focus minutes / study load, and it explicitly refuses to
 * push a student into 12-hour days.
 */

export interface WellnessSignal {
  id: string;
  tone: "green" | "amber" | "blue";
  title: string;
  body: string;
}

const HEALTHY_DAILY_MIN = 6 * 60; // 6h of deep study is a strong, sustainable day
const MAX_BEFORE_BREAK_MIN = 90; // take a break after 90 continuous minutes

export function computeWellness(focusMinutesToday: number, plannedMinutes: number): WellnessSignal[] {
  const out: WellnessSignal[] = [];
  const total = focusMinutesToday + plannedMinutes;

  if (focusMinutesToday === 0 && plannedMinutes === 0) {
    out.push({
      id: "start",
      tone: "blue",
      title: "Fresh start",
      body: "No load yet today. Start small — a 5-minute win is a real start, not a failure.",
    });
    return out;
  }

  if (focusMinutesToday > HEALTHY_DAILY_MIN * 0.75) {
    out.push({
      id: "cap",
      tone: "amber",
      title: "Recovery matters",
      body: `You've logged ${focusMinutesToday} min of focus. Beyond ~6h returns drop fast and burnout rises. A real break (walk, meal, 20-min sleep) makes the next session better.`,
    });
  } else {
    out.push({
      id: "pace",
      tone: "green",
      title: "Healthy pace",
      body: `${focusMinutesToday} min focused today. Sustainable beats heroic — keep a ` + "`break after ~90 min` habit.",
    });
  }

  if (focusMinutesToday > MAX_BEFORE_BREAK_MIN) {
    out.push({
      id: "break",
      tone: "amber",
      title: "Time for a break",
      body: "You've been going a while. Stand up, drink water, 5 minutes of nothing. It resets your focus better than pushing through.",
    });
  }

  out.push({
    id: "identity",
    tone: "blue",
    title: "You are not just an exam",
    body: "Your marks are a part of you, not the whole of you. A walk, a hobby, family time — those recharge the brain that scores.",
  });

  return out.slice(0, 3);
}
