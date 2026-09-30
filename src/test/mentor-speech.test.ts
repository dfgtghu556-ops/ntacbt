import { describe, expect, it } from "vitest";
import { hasSpeechContent, mentorSpeechScript } from "@/features/mentor/speech";
import type { MentorReport } from "@/features/mentor/report";

/** A mentor report with only the fields the speech script reads. */
function reportOf(patch: Partial<MentorReport> = {}): MentorReport {
  return {
    generatedAt: 1_700_000_000_000,
    learner: {
      examTarget: "jeemain",
      targetLabel: "JEE Main 2026",
      language: "hinglish",
      depth: "lecture",
      dailyGoalMin: 120,
    },
    performance: {
      attempts: 0,
      totalQuestions: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      accuracy: 0,
      marks: 0,
      maxMarks: 0,
      percentile: 0,
    },
    mastery: {
      syllabusCompletionPct: 0,
      weakTopics: [],
      strongTopics: [],
    },
    study: { watched: 0, notes: 0, watchLater: 0, handshakes: 0, lessonsFinished: 0 },
    preparation: {
      chaptersTouched: 0,
      chaptersWithEvidence: 0,
      questionsAttempted: 0,
      pyqAttempts: 0,
      lessonsFinished: 0,
      accuracy: null,
      distribution: {},
      rows: [],
    },
    actions: [],
    risks: [],
    summary: "",
    readinessScore: 0,
    readinessLevel: "at-risk",
    ...patch,
  } as unknown as MentorReport;
}

describe("mentorSpeechScript — structure", () => {
  it("leads with readiness, matching the page's order", () => {
    const script = mentorSpeechScript(reportOf({ readinessScore: 62, readinessLevel: "good" }));
    expect(script.startsWith("Your readiness score is 62 out of 100, which is good")).toBe(true);
  });

  it("speaks the accuracy once there are attempts", () => {
    const script = mentorSpeechScript(
      reportOf({
        performance: {
          attempts: 12,
          totalQuestions: 120,
          correct: 60,
          wrong: 40,
          skipped: 20,
          accuracy: 50,
          marks: 200,
          maxMarks: 480,
          percentile: 80,
        },
      }),
    );
    expect(script).toContain("Across 12 attempts your accuracy is 50 percent");
  });

  it("pluralises a single attempt", () => {
    const script = mentorSpeechScript(
      reportOf({
        performance: {
          attempts: 1,
          totalQuestions: 10,
          correct: 5,
          wrong: 5,
          skipped: 0,
          accuracy: 50,
          marks: 20,
          maxMarks: 40,
          percentile: 50,
        },
      }),
    );
    expect(script).toContain("Across 1 attempt your accuracy is 50 percent");
  });

  it("says there is nothing to measure when nothing was attempted", () => {
    // 0 percent would be read as a failing score. It is a measurement of nothing.
    const script = mentorSpeechScript(reportOf());
    expect(script).toContain("not attempted any questions yet");
    expect(script).not.toContain("accuracy is 0 percent");
  });
});

describe("mentorSpeechScript — the next action", () => {
  it("speaks the highest-priority action first", () => {
    const script = mentorSpeechScript(
      reportOf({
        actions: [
          { priority: "high", title: "Revise Electrostatics", detail: "Two lessons.", reason: "" },
          { priority: "low", title: "Tidy your notes", detail: "Later.", reason: "" },
        ],
      }),
    );
    expect(script).toContain("Do this next: Revise Electrostatics. Two lessons.");
    expect(script).not.toContain("Tidy your notes");
  });

  it("falls back to the first action when none are critical or high", () => {
    const script = mentorSpeechScript(
      reportOf({
        actions: [{ priority: "low", title: "Tidy your notes", detail: "Later.", reason: "" }],
      }),
    );
    expect(script).toContain("Next step: Tidy your notes.");
  });

  it("says nothing about an action when there are none", () => {
    const script = mentorSpeechScript(reportOf({ actions: [] }));
    expect(script).not.toContain("Do this next");
    expect(script).not.toContain("Next step");
  });
});

describe("mentorSpeechScript — weak chapters", () => {
  it("names up to three chapters below half accuracy", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      subject: "Physics",
      chapter: `Chapter ${i}`,
      state: "Learning",
      accuracy: 20,
      attempts: 4,
      pyqAttempts: 0,
      lessonsFinished: 1,
      reason: "",
      nextAction: "",
      lastActivityAt: 0,
    }));
    const script = mentorSpeechScript(
      reportOf({ preparation: { ...reportOf().preparation, rows } }),
    );
    expect(script).toContain("Chapters that need the next round");
    expect(script).toContain("Physics Chapter 0, Physics Chapter 1, Physics Chapter 2");
    // Capped at three so the audio actually finishes.
    expect(script).not.toContain("Chapter 3");
  });

  it("omits a chapter whose accuracy is null, because there is no score to report", () => {
    const rows = [
      {
        subject: "Physics",
        chapter: "Thin",
        state: "Learning",
        accuracy: null,
        attempts: 1,
        pyqAttempts: 0,
        lessonsFinished: 0,
        reason: "",
        nextAction: "",
        lastActivityAt: 0,
      },
    ];
    const script = mentorSpeechScript(
      reportOf({ preparation: { ...reportOf().preparation, rows } }),
    );
    expect(script).not.toContain("Thin");
  });

  it("says no chapter is weak once there are attempts", () => {
    const script = mentorSpeechScript(
      reportOf({
        performance: {
          attempts: 4,
          totalQuestions: 40,
          correct: 30,
          wrong: 10,
          skipped: 0,
          accuracy: 75,
          marks: 120,
          maxMarks: 160,
          percentile: 90,
        },
      }),
    );
    expect(script).toContain("No chapter is below half accuracy right now");
  });

  it("survives a report with no preparation block at all", () => {
    const r = reportOf();
    delete (r as unknown as { preparation?: unknown }).preparation;
    expect(() => mentorSpeechScript(r)).not.toThrow();
  });
});

describe("mentorSpeechScript — spoken form", () => {
  it("is short enough to finish and free of markdown", () => {
    const script = mentorSpeechScript(
      reportOf({
        actions: [
          {
            priority: "critical",
            title: "**Revise** `Electrostatics`",
            detail: "See [the lesson](/app/studytube).",
            reason: "",
          },
        ],
      }),
    );
    expect(script).not.toMatch(/[*_`#[\]]/);
    expect(script.length).toBeLessThanOrEqual(701);
    expect(script).toContain("Revise Electrostatics");
    expect(script).toContain("See the lesson");
  });

  it("reports whether there is anything to say", () => {
    expect(hasSpeechContent(reportOf())).toBe(true);
  });
});
