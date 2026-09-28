/**
 * NTACBT application constants.
 *
 * Single place for the values that used to be scattered as inline literals
 * across routes and components: routes, storage keys, timing, and the
 * environment-derived app config. Nothing here may contain academic data —
 * that lives in the verified source-of-truth (`src/features/academics`).
 */

/**
 * `import.meta.env` is injected by Vite. It is `undefined` in plain Node —
 * which is exactly where the data validators run (`scripts/validate-*.mjs`
 * bundle these modules with rolldown for `platform: "node"`). Reading a
 * property off it unguarded throws, so the whole module becomes unimportable
 * from Node. Guard it: an absent env means "local-first, no cloud", which is
 * also the correct default.
 */
const env: Record<string, string | undefined> =
  (typeof import.meta !== "undefined" && import.meta.env) || {};

export const APP_CONFIG = {
  name: "NTACBT",
  version: "2.0.0",
  description: "Next-Generation Computer-Based Testing Platform",
  /** Base URL for the JSON API. Empty string = same origin (the default). */
  apiUrl: env["VITE_API_URL"] ?? "",
  isProd: env["PROD"] === "true" || env["NODE_ENV"] === "production",
  /** Supabase is only used when both public env vars are present. */
  supabaseUrl: env["VITE_SUPABASE_URL"] ?? "",
  supabaseKey: env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "",
} as const;

/** True when a cloud backend is configured; otherwise everything is local-first. */
export const hasCloudBackend = (): boolean =>
  Boolean(APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseKey);

export const ROUTES = {
  HOME: "/",
  LOGIN: "/app/login",
  REGISTER: "/app/register",
  DASHBOARD: "/app",
  PROFILE: "/app/profile",
  EXAMS: "/app/pyq",
  EXAM_START: "/cbt",
  RESULTS: "/app/analytics",
  RESULT_DETAIL: "/app/report",
  ADMIN: "/app",
  PLANNER: "/app/planner",
  STUDYTUBE: "/app/studytube",
  SAARTHI: "/app/saarthi",
  FOCUS: "/app/focus",
} as const;

export const EXAM_CONFIG = {
  /** NTA-style default paper length in minutes. */
  defaultTimeLimit: 180,
  /** Autosave cadence for an in-progress attempt (ms). */
  autosaveInterval: 30000,
  /** Warn the student when this much time is left (ms). */
  warningTime: 300000,
  /** NTA marking scheme. */
  marksCorrect: 4,
  marksWrong: -1,
  marksSkipped: 0,
  /** Integer/numerical questions carry no negative marking (official 2026 rule). */
  marksIntegerCorrect: 4,
  marksIntegerWrong: 0,
} as const;

export const STORAGE_KEYS = {
  /** Legacy monolithic blob — read-only for the React app. */
  LEGACY_STATE: "jeecbt.v1",
  AUTH: "ntacbt.auth.v1",
  USER_DATA: "ntacbt.user.v1",
  THEME: "theme",
  EXAM_STATE: "ntacbt.exam.v1",
  LANG: "ntacbt.lang.v1",
  /** Who is studying: goal, class, subjects, institute/teacher prefs, goals. */
  STUDENT: "ntacbt.student.v1",
} as const;

/** Milliseconds in a day — kept as a named constant so streak maths is auditable. */
export const DAY_MS = 24 * 60 * 60 * 1000;
