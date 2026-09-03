/**
 * StudyTube feature contracts.
 * Discovery is server-backed by `/api/public/study-planner`.
 */

export interface StudyTubeVideo {
  id: string;
  title: string;
  channel: string;
  channelId?: string;
  durationSec: number;
  published?: string;
  score: number;
  why: string;
  teacher?: string;
  institute?: string;
  subject?: string;
  topic?: string;
  depth?: string;
  kind?: string;
  playlistUrl?: string | undefined;
  verified?: boolean | undefined;
  isCurated?: boolean | undefined;
  /** When set, the item is an offline "search pick" that opens YouTube search (no single video id). */
  externalUrl?: string | undefined;
}

export interface StudyTubeRequest {
  topic: string;
  subject: string;
  language: "en" | "hi" | "hinglish";
  kind: "learn" | "practice" | "revision" | "advanced";
  depth: "oneshot" | "lecture" | "detailed";
  target: "jeemain" | "jeeadv" | "board12" | "board11" | "cbse27";
  teacher?: string | undefined;
  institute?: string | undefined;
  maxMinutes?: number | undefined;
}

export interface StudyTubeResult {
  items: StudyTubeVideo[];
  fetchedAt: number;
  fallback: boolean;
  cached: boolean;
  error?: string;
}

export interface StudyTubeSection {
  id: string;
  title: string;
  subtitle: string;
  request: StudyTubeRequest;
}
