/**
 * SPEECH — audio summary for the mentor report.
 *
 * The research doc's A8 asks for a "global EN/HI/Hinglish toggle + audio
 * summary". The toggle ships in `lib/lang`; this is the audio half, and it
 * exists because a student who is commuting, or a parent who does not read
 * English comfortably, should be able to hear what the report says.
 *
 * **It uses the device's own voices.** The Web Speech API (`speechSynthesis`)
 * is built into every modern browser, so this needs no API key, sends nothing
 * anywhere, and works offline. That matters more than voice quality for the
 * low-connectivity case the research doc calls out.
 *
 * **Three honesty rules.**
 *
 *  1. **Never claim a voice that is not there.** Voice lists are populated
 *     asynchronously and vary wildly by device — an Android phone in India may
 *     have `hi-IN` and an iPhone may not. So the module reports availability
 *     rather than assuming it, and the UI says "no voice on this device"
 *     instead of silently doing nothing.
 *  2. **Read what is written, not more.** Markdown is stripped and the text is
 *     capped, because a 2,400-character AI context string read aloud is a wall
 *     of noise, not a summary.
 *  3. **One utterance at a time.** A second request cancels the first, so two
 *     buttons never talk over each other.
 *
 * SSR-safe throughout: `window.speechSynthesis` is only touched inside
 * functions, never at module scope.
 */

import type { Lang } from "./lang";

/** Strip the markdown a report body carries, so it is not read aloud. */
export function speechText(raw: string, max = 600): string {
  const cleaned = (raw || "")
    // Markdown emphasis, headings, code fences, strike-through.
    .replace(/[*_`>#~]/g, "")
    // Markdown link targets: [label](url) → label.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // A list bullet at the start of a line, so "- item" is not read "dash item".
    .replace(/^\s*[-+]\s+/gm, "")
    // Collapse the whitespace the stripping leaves behind.
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  // Cut on a word boundary so the audio does not stop mid-word.
  const cut = cleaned.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * The BCP-47 tag to request for each UI language.
 *
 * Hinglish is Roman-script Hindi, so an Indian English voice reads it correctly
 * while a Hindi voice would mispronounce the Latin letters. Requesting `hi-IN`
 * for Hinglish would be worse, not better.
 */
export function speechLocale(lang: Lang): string {
  if (lang === "hi") return "hi-IN";
  return "en-IN";
}

/** True when the browser exposes the Web Speech API at all. */
export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Pick the best available voice for a locale.
 *
 * Prefers an exact locale match, then any voice with the same language subtag,
 * then null. A null result is a real outcome the UI must handle — it is not an
 * error, it just means this device cannot speak that language.
 */
export function pickVoice(locale: string): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!Array.isArray(voices) || voices.length === 0) return null;
  const exact = voices.find((v) => v.lang?.toLowerCase() === locale.toLowerCase());
  if (exact) return exact;
  const language = locale.split("-")[0]?.toLowerCase() ?? "";
  return voices.find((v) => v.lang?.toLowerCase().startsWith(language)) ?? null;
}

/** True when a voice for this locale actually exists on this device. */
export function hasVoiceFor(locale: string): boolean {
  return pickVoice(locale) !== null;
}

/**
 * Speak text, cancelling anything already speaking.
 *
 * Returns false when speech is unavailable, so a caller can surface the reason
 * instead of leaving a dead button.
 */
export function speak(text: string, lang: Lang): boolean {
  if (!isSpeechSupported()) return false;
  const body = speechText(text);
  if (!body) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(body);
    const locale = speechLocale(lang);
    const voice = pickVoice(locale);
    // Set the locale even without a matching voice: the browser may still pick
    // a usable one, and a wrong-locale guess is worse than a stated preference.
    utterance.lang = locale;
    if (voice) utterance.voice = voice;
    // Slightly brisk, because a report read at the default rate drags.
    utterance.rate = 1.05;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/** Stop any speech in progress. Safe to call when nothing is speaking. */
export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * Wait for the voice list to populate.
 *
 * Chrome populates `getVoices()` asynchronously, so a check made during the
 * first render can wrongly report "no voice". Resolving on `voiceschanged`
 * (with a short timeout fallback) makes the availability signal honest.
 */
export function whenVoicesReady(timeoutMs = 1200): Promise<void> {
  if (!isSpeechSupported()) return Promise.resolve();
  if (window.speechSynthesis.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve();
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, timeoutMs);
  });
}
