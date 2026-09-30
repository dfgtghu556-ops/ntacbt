/**
 * StudyTube progress + watch→practice handshake store.
 *
 * Scoped to StudyTube and persisted locally under one versioned key so the
 * watch->recall->practice->mastery loop survives reloads. It is a write
 * store (unlike the legacy DataStore, which is read-only), but it is small,
 * isolated from `jeecbt.v1`, and does not feed the legacy engine yet.
 */

export type MasteryState = "Not Started" | "Learning" | "Improving" | "Strong" | "Mastered";

export interface WatchRecord {
  videoId: string;
  title: string;
  watchedAt: number;
  finished: boolean;
}

export interface HandshakeRecord {
  videoId: string;
  /** Active-recall self-score: 0–5. `null` = not done. */
  recall: number | null;
  /** Targeted/practice-question count completed. `null` = not done. */
  practice: number | null;
  mastery: MasteryState;
  updatedAt: number;
  /**
   * The chapter this lesson teaches, recorded at write time so the mastery
   * store can aggregate watched lessons by chapter without re-resolving the
   * video id against the catalog. Optional because handshakes written before
   * the mastery store existed carry none; the store skips those rather than
   * guessing a chapter.
   */
  subject?: string | undefined;
  chapter?: string | undefined;
  topic?: string | undefined;
}

export interface StudyTubeProgressStore {
  schemaVersion: number;
  watched: Record<string, WatchRecord>;
  notes: Record<string, { text: string; updatedAt: number }>;
  watchLater: string[];
  handshakes: Record<string, HandshakeRecord>;
}

export const STUDY_PROGRESS_KEY = "ntacbt.studytube.v1";

function empty(): StudyTubeProgressStore {
  return {
    schemaVersion: 1,
    watched: {},
    notes: {},
    watchLater: [],
    handshakes: {},
  };
}

export function loadStudyTubeProgress(): StudyTubeProgressStore {
  if (typeof window === "undefined") return empty();
  try {
    const raw = JSON.parse(localStorage.getItem(STUDY_PROGRESS_KEY) || "{}");
    return {
      ...empty(),
      ...(raw as Partial<StudyTubeProgressStore>),
      watched: (raw as Partial<StudyTubeProgressStore>)?.watched ?? {},
      notes: (raw as Partial<StudyTubeProgressStore>)?.notes ?? {},
      watchLater: Array.isArray(raw?.watchLater) ? raw.watchLater : [],
      handshakes: (raw as Partial<StudyTubeProgressStore>)?.handshakes ?? {},
    };
  } catch {
    return empty();
  }
}

/**
 * Persist the store, and report whether it actually landed.
 *
 * `localStorage.setItem` throws rather than returning a status. It throws when
 * the quota is exceeded, and in Safari private mode and with storage blocked by
 * policy `localStorage` itself throws on access. Left unguarded, that exception
 * unwound through `toggleWatchLater` into the click handler, so the button
 * flipped to its new state and the write was silently lost - the student
 * believed a lecture was saved when nothing had been stored.
 *
 * Every caller now checks the result and tells the student when a save failed,
 * because a silent failure on a local-first app is indistinguishable from
 * success until they come back later and find their notes gone.
 */
function save(store: StudyTubeProgressStore): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(STUDY_PROGRESS_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function markWatched(videoId: string, title: string, finished = true): WatchRecord {
  const store = loadStudyTubeProgress();
  const record: WatchRecord = { videoId, title, watchedAt: Date.now(), finished };
  store.watched[videoId] = record;
  save(store);
  return record;
}

/** Save the student's own note. Returns false if the write did not land. */
export function setNote(videoId: string, text: string): boolean {
  const store = loadStudyTubeProgress();
  store.notes[videoId] = { text, updatedAt: Date.now() };
  return save(store);
}

export function toggleWatchLater(videoId: string): boolean {
  const store = loadStudyTubeProgress();
  const has = store.watchLater.includes(videoId);
  store.watchLater = has
    ? store.watchLater.filter((x) => x !== videoId)
    : [...store.watchLater, videoId];
  // Only report the new state if it was actually stored.
  return save(store) ? !has : has;
}

export function saveHandshake(
  videoId: string,
  handshake: Pick<HandshakeRecord, "recall" | "practice" | "mastery"> &
    Partial<Pick<HandshakeRecord, "subject" | "chapter" | "topic">>,
): HandshakeRecord {
  const store = loadStudyTubeProgress();
  const record: HandshakeRecord = {
    videoId,
    recall: handshake.recall,
    practice: handshake.practice,
    mastery: handshake.mastery,
    updatedAt: Date.now(),
  };
  // Only write the mapping when it is known — an empty string would make the
  // mastery store treat the lesson as mapped to a blank chapter.
  if (handshake.subject) record.subject = handshake.subject;
  if (handshake.chapter) record.chapter = handshake.chapter;
  if (handshake.topic) record.topic = handshake.topic;
  store.handshakes[videoId] = record;
  save(store);
  return record;
}
