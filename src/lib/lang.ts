/**
 * NTACBT language preference (EN / HI / Hinglish).
 *
 * A single global language toggle that persists across sessions and is shared
 * by every screen. The app is Hinglish-first by default (matching its student
 * base), but a student can switch to clean English, formal Hindi, or Hinglish —
 * and the UI reads from this hook so it can be applied broadly later.
 *
 * Dependency-free React binding via useSyncExternalStore so it is safe in both
 * client and SSR (returns a stable default during server render).
 */

import { useSyncExternalStore } from "react";

const LANG_KEY = "ntacbt.lang";

export type Lang = "en" | "hi" | "hinglish";

export const LANG_LABEL: Record<Lang, string> = {
  en: "English",
  hi: "हिंदी",
  hinglish: "Hinglish",
};

let current: Lang = readLang();

function readLang(): Lang {
  if (typeof window === "undefined") return "hinglish";
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "en" || v === "hi" || v === "hinglish" ? v : "hinglish";
  } catch {
    return "hinglish";
  }
}

const listeners = new Set<() => void>();

/** Read the current language (never throws). */
export function getLang(): Lang {
  return current;
}

/** Set + persist + notify. */
export function setLang(lang: Lang) {
  current = lang;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}

export function subscribeLang(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** React hook — returns the current language and re-renders on change. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, () => "hinglish" as Lang);
}

/** Small localised text dictionary for the highest-traffic surfaces. */
export const I18N: Record<Lang, Record<string, string>> = {
  en: {
    onTrack: "Am I on track?",
    doThisNext: "Do this next",
    nextMission: "Next mission",
    guarantee: "Our guarantee is the system, not a score",
    trust: "Why you can trust these numbers",
    balance: "Balance, not burnout",
    mockReality: "Mock to reality",
  },
  hi: {
    onTrack: "क्या मैं सही रास्ते पर हूँ?",
    doThisNext: "अब ये करो",
    nextMission: "अगला मिशन",
    guarantee: "हमारी गारंटी सिस्टम की है, स्कोर की नहीं",
    trust: "इन आँकड़ों पर भरोसा क्यों करें",
    balance: "संतुलन, थकान नहीं",
    mockReality: "मॉक से असलियत",
  },
  hinglish: {
    onTrack: "Am I on track?",
    doThisNext: "Ab ye karo",
    nextMission: "Agla mission",
    guarantee: "Hamari guarantee system ki hai, score ki nahi",
    trust: "In numbers par bharosa kyun karein",
    balance: "Balance, burnout nahi",
    mockReality: "Mock se reality",
  },
};

export function t(key: string, lang: Lang = current): string {
  return I18N[lang]?.[key] ?? I18N.hinglish[key] ?? I18N.en[key] ?? key;
}
