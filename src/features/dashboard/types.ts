/**
 * Dashboard / Mission Control contracts.
 * Fed by the versioned store and the readiness engine; never writes data.
 */

export interface MissionSummary {
  title: string;
  subject: string;
  chapter: string;
  minutes: number;
  target: string;
  why: string;
  kind: "learn" | "practice" | "revision" | "test";
  taskId?: string;
}

export interface WeakTopic {
  subject: string;
  chapter: string;
  topic: string;
  accuracy: number;
  attemptCount: number;
  /** Human-readable reason based on (explainable) evidence. */
  reason: string;
}

export interface TodayPlan {
  plannedMinutes: number;
  completedMinutes: number;
  tasks: MissionSummary[];
  doneTasks: number;
  totalTasks: number;
}

export interface TrendPoint {
  at: number;
  marks: number;
  accuracy: number;
}

export interface ReadinessSnapshot {
  examTarget: string;
  attempts: number;
  totalQuestions: number;
  accuracy: number;
  marks: number;
  maxMarks: number;
  syllabusCompletionPct: number;
  weakTopics: WeakTopic[];
  recentTrend: TrendPoint[];
  messages: {
    good: string[];
    holdingBack: string[];
    next: string[];
  };
  nextMission: MissionSummary | null;
  today: TodayPlan;
}

/** A single explainable signal that composes the Survival Score. */
export interface SurvivalComponent {
  key: string;
  label: string;
  /** 0–1 normalized weight of how much this signal contributes. */
  contribution: number;
  /** 0–100 value of this signal on its own. */
  rating: number;
  /** Short human explanation of how it was computed. */
  how: string;
}

export interface SurvivalScore {
  /** 0–100 overall "am I on track?" score. Never lies; explainable. */
  score: number;
  /** Semantic bucket: on-track | watch | at-risk. */
  status: "on-track" | "watch" | "at-risk";
  /** Short headline the student reads first. */
  headline: string;
  /** The single executable next action ("one thing to do next"). */
  nextAction: string;
  components: SurvivalComponent[];
  /** Proof: each number shown on screen is derived, not guessed. */
  basis: string;
}

export interface DualLaneReadiness {
  jee: { score: number; label: string; message: string };
  board: { score: number; label: string; message: string };
  split: string;
}

export interface RankPrediction {
  marks: number;
  maxMarks: number;
  percentile: number;
  rank: number;
  tier: string;
  expectation: string;
  topFix: string;
  basis: string;
}

/** One active-recall card in a Mistake-DNA micro-drill (flip to self-check). */
export interface MicroDrillCard {
  id: string;
  prompt: string;
  answer: string;
  tag: string;
  tagLabel: string;
  topic: string;
  subject: string;
  recallType: "formula" | "concept" | "definition" | "misread-check" | "quick-calc" | "diagram";
  /** Optional 2–3 answer options for a quick multiple-choice style recall. */
  options?: string[];
  correctOption?: number;
}
