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
