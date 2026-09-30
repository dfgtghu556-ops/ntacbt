/**
 * OnboardingWizard — goal to first session in under two minutes.
 *
 * The rules this component is built to (from `docs/NEXT-FEATURES-RESEARCH.md`
 * B6, and B7 which sits right next to it):
 *
 *  - **Value first.** The last screen is not a summary of what the student
 *    typed; it is a button that starts a real session. Every screen before it
 *    states what the choice changes, so the input is never busywork.
 *  - **Progressive disclosure.** Four short screens, one question each. A
 *    student who wants to change something later can, from the profile page —
 *    this is not the only place these settings exist.
 *  - **Skip is real.** It is on the first screen, it is the same size as the
 *    primary button, and it produces a working default rather than a broken
 *    one. A wizard that punishes skipping is a dark pattern.
 *  - **No invented urgency.** The exam date is optional and a past date is
 *    rejected. Nothing counts down. `daysUntilExam` returns `null` rather than
 *    a negative number.
 *  - **Segmented controls, not dropdowns**, for four visible options.
 */

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DAILY_OPTIONS,
  GOALS,
  completeOnboarding,
  daysUntilExam,
  planSummary,
  saveStudyProfile,
  weeklyMinutes,
  type GoalId,
  type StudyProfile,
} from "@/features/onboarding/profile";

type Step = "goal" | "time" | "date" | "ready";

const ORDER: Step[] = ["goal", "time", "date", "ready"];

export interface OnboardingWizardProps {
  onDone: () => void;
  /** Where the final "start" button goes. */
  startTo: string;
  startLabel: string;
}

export function OnboardingWizard({ onDone, startTo, startLabel }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("goal");
  const [goal, setGoal] = useState<GoalId>("jeemain");
  const [minutes, setMinutes] = useState(60);
  const [examDate, setExamDate] = useState("");

  const profile: StudyProfile = useMemo(
    () => ({
      goal,
      examDate: examDate || null,
      minutesPerDay: minutes,
      createdAt: Date.now(),
    }),
    [goal, examDate, minutes],
  );

  const index = ORDER.indexOf(step);
  const back = index > 0 ? ORDER[index - 1] : null;
  const next = index < ORDER.length - 1 ? ORDER[index + 1] : null;

  function finish() {
    saveStudyProfile(profile);
    onDone();
  }

  function skip() {
    // Skipping saves nothing but marks the wizard done, so the default profile
    // is what the student gets — a working app, not a blocked one.
    completeOnboarding();
    onDone();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Set up your study plan"
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur sm:items-center"
    >
      <div className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-xl">
        {/* Progress, so the student always knows how much is left. */}
        <div className="flex items-center gap-2" aria-hidden="true">
          {ORDER.map((s, i) => (
            <span
              key={s}
              className={
                i <= index
                  ? "h-1.5 flex-1 rounded-full bg-primary"
                  : "h-1.5 flex-1 rounded-full bg-muted"
              }
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Step {index + 1} of {ORDER.length}
        </p>

        {step === "goal" ? (
          <section className="mt-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Target className="h-5 w-5" /> What are you preparing for?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This decides which chapters the plan draws from and how deep it goes.
            </p>
            <div className="mt-3 grid gap-2">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoal(g.id)}
                  aria-pressed={goal === g.id}
                  className={
                    goal === g.id
                      ? "rounded-2xl border-2 border-primary bg-accent/60 p-3 text-left"
                      : "rounded-2xl border p-3 text-left hover:bg-accent/40"
                  }
                >
                  <span className="block text-sm font-semibold">{g.label}</span>
                  <span className="block text-xs text-muted-foreground">{g.hint}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === "time" ? (
          <section className="mt-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Clock3 className="h-5 w-5" /> How much time on a normal day?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Be honest rather than ambitious — a plan you can keep beats one you cannot.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DAILY_OPTIONS.map((o) => (
                <button
                  key={o.minutes}
                  type="button"
                  onClick={() => setMinutes(o.minutes)}
                  aria-pressed={minutes === o.minutes}
                  className={
                    minutes === o.minutes
                      ? "rounded-full border-2 border-primary bg-accent/60 px-3 py-2 text-sm font-medium"
                      : "rounded-full border px-3 py-2 text-sm hover:bg-accent/40"
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-3 rounded-2xl border bg-muted/40 p-3 text-sm">
              That is <strong>about {weeklyMinutes(minutes)} hours a week</strong>. The plan splits
              it into sessions of 25 minutes or less, so a short day still counts.
            </p>
          </section>
        ) : null}

        {step === "date" ? (
          <section className="mt-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-5 w-5" /> When is the exam?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional. If you do not have a date yet, leave it blank — nothing here counts down.
            </p>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              aria-label="Exam date"
              className="mt-3 h-10 w-full rounded-full border border-input bg-background px-4 text-sm"
            />
            <p className="mt-3 rounded-2xl border bg-muted/40 p-3 text-sm">
              {examDate && daysUntilExam(examDate) !== null
                ? `About ${daysUntilExam(examDate)} days to go. The plan spreads your chapters across them, and re-plans when you fall behind.`
                : "No date set. The plan will still work from today, and you can add the date later."}
            </p>
          </section>
        ) : null}

        {step === "ready" ? (
          <section className="mt-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Check className="h-5 w-5" /> You are set up
            </h2>
            <p className="mt-2 rounded-2xl border bg-muted/40 p-3 text-sm">
              {planSummary(profile)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Everything below comes from your own answers, so the plan changes as you do. You can
              adjust any of this later.
            </p>
          </section>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-2">
          {back ? (
            <Button type="button" variant="ghost" onClick={() => setStep(back)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={skip}>
              Skip for now
            </Button>
          )}

          {next ? (
            <Button type="button" onClick={() => setStep(next)}>
              Next <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={skip}>
                Skip
              </Button>
              <Button asChild type="button" onClick={finish}>
                <a href={startTo}>{startLabel}</a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
