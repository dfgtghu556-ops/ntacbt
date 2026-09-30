/**
 * The key manifest — which parts of a student's data travel in a backup.
 *
 * Every NTACBT key is listed here exactly once, in one of two lists, so the
 * question "is this in a backup?" has one answer that a test can check. A key
 * that is in neither list is a bug, and `backup.test.ts` fails if a new key
 * appears in `localStorage` without being classified.
 *
 * The dividing line is *whose data it is*, not how big it is:
 *
 *   - **Travelling keys** are the student's own work and choices. They are worth
 *     moving to a new phone, and losing them costs the student real effort.
 *
 *   - **Staying keys** belong to this device or are a credential. Copying them
 *     into a file is either useless or actively harmful.
 *
 * The one exclusion that needs explaining is the auth token. A backup file is a
 * thing a student will email to themselves or drop in cloud storage; a bearer
 * token in that file is a credential sitting in a place nobody is watching.
 * Restoring on a new device should mean signing in again, which is what happens
 * when the token is left behind.
 */

/** Keys that carry the student's work. These are exported and restored. */
export const TRAVELLING_KEYS = [
  "ntacbt.cbt.v1", // attempts, saved tests, results
  "ntacbt.exam.v1", // an in-progress exam draft
  "ntacbt.focus.v1", // focus sessions
  "ntacbt.memory.v1", // spaced-repetition cards
  "ntacbt.streak.v1", // streak state
  "ntacbt.studytube.v1", // watch progress, notes, watch-later
  "ntacbt.todo.done.v1", // planner ticks
  "ntacbt.profile.v1", // the student's profile
  "ntacbt.student.v1", // goal, class, subjects
  "ntacbt.user.v1", // user data
  "ntacbt.onboarded.v1", // whether onboarding is done
  "ntacbt.lang", // the language they chose to read in
] as const;

/** Keys that stay on the device. Never written into a backup file. */
export const STAYING_KEYS = [
  "ntacbt.auth.v1", // a session token — a credential, not data
  "theme", // this device's display preference
  "ntacbt.pwa.dismissedAt", // this device already dismissed the install prompt
] as const;

/**
 * Keys that exist in the app but are deliberately in neither list, with why.
 * Anything appearing here is known and accounted for rather than forgotten.
 */
export const UNCLASSIFIED_KEYS: Readonly<Record<string, string>> = {
  "ntacbt.notify.quietHours":
    "A device schedule. Re-derived on the new device from the same settings, " +
    "so carrying a stale copy could contradict the student's current choice.",
  "ntacbt.v2":
    "The forward path for a typed store. Declared but never written today, so " +
    "there is nothing to carry.",
  "jeecbt.v1":
    "The legacy monolithic blob. Read-only for the React app; it is migrated " +
    "on read, so a copy would be a snapshot of something already consumed.",
};

export type TravellingKey = (typeof TRAVELLING_KEYS)[number];

/** Every key the app is known to write. */
export const ALL_KNOWN_KEYS: readonly string[] = [
  ...TRAVELLING_KEYS,
  ...STAYING_KEYS,
  ...Object.keys(UNCLASSIFIED_KEYS),
];

/** The schema version stamped into every backup file. */
export const BACKUP_VERSION = 1;
