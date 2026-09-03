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

function save(store: StudyTubeProgressStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STUDY_PROGRESS_KEY, JSON.stringify(store));
}

export function markWatched(videoId: string, title: string, finished = true): WatchRecord {
  const store = loadStudyTubeProgress();
  const record: WatchRecord = { videoId, title, watchedAt: Date.now(), finished };
  store.watched[videoId] = record;
  save(store);
  return record;
}

export function setNote(videoId: string, text: string) {
  const store = loadStudyTubeProgress();
  store.notes[videoId] = { text, updatedAt: Date.now() };
  save(store);
}

export function toggleWatchLater(videoId: string): boolean {
  const store = loadStudyTubeProgress();
  const has = store.watchLater.includes(videoId);
  store.watchLater = has
    ? store.watchLater.filter((x) => x !== videoId)
    : [...store.watchLater, videoId];
  save(store);
  return !has;
}

export function saveHandshake(
  videoId: string,
  handshake: Pick<HandshakeRecord, "recall" | "practice" | "mastery">,
): HandshakeRecord {
  const store = loadStudyTubeProgress();
  const record: HandshakeRecord = {
    videoId,
    recall: handshake.recall,
    practice: handshake.practice,
    mastery: handshake.mastery,
    updatedAt: Date.now(),
  };
  store.handshakes[videoId] = record;
  save(store);
  return record;
}
