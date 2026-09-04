/**
 * NTACBT versioned client persistence.
 *
 * The legacy app writes one monolithic blob to `localStorage["jeecbt.v1"]`.
 * This module reads that blob (never mutating it) and exposes typed, derived
 * views. New NTACBT screens use this store so legacy progress, planner data,
 * attempts and settings remain the single source of truth during migration.
 *
 * It also defines the forward path: `STORAGE_KEY_NEXT` (v2) with a
 * `schemaVersion` and migration hooks. Nothing writes to v2 yet — adding it
 * is intentional, so no existing student data is at risk.
 */

export interface StatusMeta {
  /** Read (raw) or written (committed) view of the legacy state. */
  mode: "read" | "write";
  schemaVersion: number;
  migratedAt?: string;
}

export interface LegacyState {
  attempts: AttemptSummary[];
  tests: LegacyTest[];
  settings: LegacySettings;
  dailyQuestions: Record<string, number>;
  reviewSchedule: Record<string, unknown>;
  qtags: Record<string, string>;
  studyLog?: Record<string, number>;
  masteries?: Record<string, unknown>;
  aiPlanner?: LegacyPlanner | null;
  plannerDone?: Record<string, boolean>;
  plannerEdits?: Record<string, unknown>;
  focusSessions?: unknown[];
  formulaSRS?: unknown[];
  notes?: Record<string, unknown>;
  ytWatchLater?: string[];
  ytNotes?: Record<string, string>;
  bookmarks?: Record<string, boolean>;
  goal?: Record<string, unknown>;
  contract?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Minimal grading facts needed by analytics and the dashboard. */
export interface AttemptSummary {
  id: string;
  testId: string;
  submittedAt: number | null;
  startedAt?: number;
  timeTaken?: number;
  tabSwitches?: number;
  result?: {
    all: {
      correct: number;
      wrong: number;
      skipped: number;
      marks: number;
      neg: number;
      time: number;
      total: number;
      max?: number;
      accuracy?: number;
    };
    per?: Record<
      string,
      {
        correct: number;
        wrong: number;
        skipped: number;
        marks: number;
        total: number;
        time: number;
      }
    >;
  };
  responses?: Record<
    string,
    {
      ans: string | null;
      status: string;
      time: number;
      changes: number;
    }
  >;
}

export interface LegacyTest {
  id: string;
  name: string;
  createdAt: number;
  date?: string;
  duration: number;
  cloud?: boolean;
  practice?: boolean;
  pyq?: boolean;
  difficulty?: string;
  test_type?: string;
  exam_year?: number;
  questions: Array<{
    id: string;
    subject: string;
    chapter?: string;
    topic?: string;
    type: "mcq" | "integer";
    text: string;
    options: Array<{ label: string; text: string }>;
    answer: string;
    accept?: { kind: string; lo?: number; hi?: number; vals?: number[] };
  }>;
}

export interface PlannerTaskRow {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  kind: "learn" | "practice" | "revision" | "test";
  date: string;
  estMin: number;
  status: "pending" | "done";
  teacher?: string;
  teacherId?: string;
  instituteId?: string;
  videoTitle?: string;
  videoId?: string;
  completedAt?: number;
  why?: string;
  /** Real wall-clock minutes actually watched when a longer-than-planned video
   *  was completed (falls back to estMin when the task wasn't video-driven). */
  actualMin?: number;
  [key: string]: unknown;
}

export interface PlannerProfile {
  target: string; // jeemain | jeeadv | board12 | board11 | cbse27
  language: string;
  depth: string;
  speed: number;
  dailyMin: number;
  weekdayMin: number;
  startDate: string;
  days: number;
  examDate?: string;
  [key: string]: unknown;
}

export interface LegacyPlanner {
  profile: PlannerProfile;
  tasks: PlannerTaskRow[];
  createdAt?: number;
}

export interface LegacySettings {
  theme: string;
  accent: string;
  density: string;
  fontSize: string;
  cards: string;
  anim: string;
  candidate: string;
  negMarking: boolean;
  randomizeOrder: boolean;
  dailyGoal: number;
  examDate: string;
  dailyReminder: boolean;
  focusGoal: number;
  strictMode: boolean;
  targetPercentile: number | null;
  examFontScale: number;
  questionDisplay: string;
  [key: string]: unknown;
}

export const LEGACY_STATE_KEY = "jeecbt.v1";
/** Forward path for a typed, explicit versioned store. Not yet written. */
export const STORAGE_KEY_NEXT = "ntacbt.v2";

export class DataStore {
  private readonly _raw: LegacyState;

  constructor(raw?: LegacyState) {
    this._raw = raw ?? DataStore.readLegacy();
  }

  /** Read the legacy blob without touching it. */
  static readLegacy(): LegacyState {
    if (typeof window === "undefined") return emptyLegacyState();
    try {
      const parsed = JSON.parse(localStorage.getItem(LEGACY_STATE_KEY) || "{}") as LegacyState;
      return {
        ...emptyLegacyState(),
        ...parsed,
        settings: { ...emptySettings(), ...(parsed.settings || {}) },
      };
    } catch {
      return emptyLegacyState();
    }
  }

  /** Copies of the parsed state; never a live reference. */
  get state(): LegacyState {
    return JSON.parse(JSON.stringify(this._raw)) as LegacyState;
  }

  get attempts(): AttemptSummary[] {
    const all = Array.isArray(this._raw.attempts) ? this._raw.attempts : [];
    return all
      .filter((a) => a && typeof a.submittedAt === "number")
      .map((a) => JSON.parse(JSON.stringify(a)) as AttemptSummary)
      .sort((a, b) => (a.submittedAt as number) - (b.submittedAt as number));
  }

  get tests(): LegacyTest[] {
    // Guard against corrupt/cross-window shapes: always return a real array.
    if (!Array.isArray(this._raw.tests)) return [];
    return JSON.parse(JSON.stringify(this._raw.tests)) as LegacyTest[];
  }

  get settings(): LegacySettings {
    return JSON.parse(JSON.stringify(this._raw.settings || {}));
  }

  get planner(): LegacyPlanner | null {
    const p = this._raw.aiPlanner;
    if (!(p && "profile" in p && "tasks" in p)) return null;
    // The legacy app records completion in `plannerDone[id]` (see
    // public/jee-cbt.html), not on the task row itself. Overlay it here so the
    // React planner + readiness engine see the same done-state as the legacy UI.
    const done = this._raw.plannerDone || {};
    const tasks = (Array.isArray(p.tasks) ? p.tasks : []).map((t) => ({
      ...t,
      status: done[t.id] ? "done" : ((t as PlannerTaskRow).status ?? "pending"),
    }));
    return { ...p, tasks } as LegacyPlanner;
  }

  get dayKey(): string {
    return localDayKey();
  }

  /** Today's planner rows (by date), plus a one-day grace fallback for older plans. */
  todayTasks(now = Date.now()): PlannerTaskRow[] {
    const p = this.planner;
    if (!p?.tasks?.length) return [];
    const today = localDayKey(now);
    const tomorrow = localDayKey(now + 24 * 3600 * 1000);
    const done = this._raw.plannerDone || {};
    return p.tasks
      .filter((t) => t && (t.date === today || t.date === tomorrow))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((t) => ({ ...t, status: done[t.id] ? "done" : t.status }));
  }

  /** Legacy progress facts for the dashboard and readiness model. */
  totals() {
    const attempts = this.attempts;
    const submitted = attempts.filter((a) => a.submittedAt);
    const totalQuestions = submitted.reduce((n, a) => n + (a.result?.all?.total || 0), 0);
    const correct = submitted.reduce((n, a) => n + (a.result?.all?.correct || 0), 0);
    const wrong = submitted.reduce((n, a) => n + (a.result?.all?.wrong || 0), 0);
    const skipped = submitted.reduce((n, a) => n + (a.result?.all?.skipped || 0), 0);
    const marks = submitted.reduce((n, a) => n + (a.result?.all?.marks || 0), 0);
    const max = submitted.reduce(
      (n, a) => n + (a.result?.all?.max ?? (a.result?.all?.total || 0) * 4),
      0,
    );
    const attempted = correct + wrong;
    return {
      attempts: submitted.length,
      totalQuestions,
      correct,
      wrong,
      skipped,
      attempted,
      marks,
      max,
      accuracy: attempted ? Math.round((correct / attempted) * 1000) / 10 : 0,
    };
  }

  /** Recent completed sessions (planner tasks + focus blocks) for the streak surface. */
  completedToday(now = Date.now()): PlannerTaskRow[] {
    const today = localDayKey(now);
    return (this.planner?.tasks || []).filter((t) => t.status === "done" && t.date === today);
  }

  meta(): StatusMeta {
    return {
      mode: "read",
      schemaVersion: 1,
    };
  }
}

function emptySettings(): LegacySettings {
  return {
    theme: "system",
    accent: "orange",
    density: "comfortable",
    fontSize: "md",
    cards: "elevated",
    anim: "on",
    candidate: "Candidate",
    negMarking: true,
    randomizeOrder: false,
    dailyGoal: 20,
    examDate: "",
    dailyReminder: false,
    focusGoal: 100,
    strictMode: false,
    targetPercentile: null,
    examFontScale: 1,
    questionDisplay: "image",
  };
}

function emptyLegacyState(): LegacyState {
  return {
    attempts: [],
    tests: [],
    settings: emptySettings(),
    dailyQuestions: {},
    reviewSchedule: {},
    qtags: {},
    studyLog: {},
    masteries: {},
    aiPlanner: null,
    plannerDone: {},
    plannerEdits: {},
    focusSessions: [],
    formulaSRS: [],
    notes: {},
    ytWatchLater: [],
    ytNotes: {},
    bookmarks: {},
    goal: {},
    contract: {},
  };
}

export function localDayKey(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
