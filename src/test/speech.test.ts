import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasVoiceFor,
  isSpeechSupported,
  pickVoice,
  speak,
  speechLocale,
  speechText,
  stopSpeaking,
  whenVoicesReady,
} from "@/lib/speech";

/** A minimal SpeechSynthesisUtterance, because jsdom does not ship one. */
class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  pitch = 1;
  voice: unknown = null;
  constructor(text: string) {
    this.text = text;
  }
}

/** A minimal SpeechSynthesis mock. */
function mockSpeech(voices: Array<{ lang: string; name: string }> = []) {
  const spoken: Array<{ text: string; lang: string }> = [];
  let cancelled = 0;
  const listeners = new Set<() => void>();
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
    FakeUtterance;
  const synth = {
    getVoices: () => voices,
    speak: (u: { text: string; lang: string }) => {
      spoken.push({ text: u.text, lang: u.lang });
    },
    cancel: () => {
      cancelled += 1;
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth;
  return {
    spoken,
    get cancelled() {
      return cancelled;
    },
    fireVoicesChanged: () => listeners.forEach((l) => l()),
  };
}

afterEach(() => {
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
  vi.restoreAllMocks();
});

describe("speechText", () => {
  it("strips markdown so it is not read aloud", () => {
    expect(speechText("## Heading\n- **bold** and _em_")).toBe("Heading bold and em");
    // A leading list bullet is stripped, so "- item" is not read as "dash item".
    expect(speechText("- first\n- second")).toBe("first second");
    expect(speechText("See [the report](/app/report) now")).toBe("See the report now");
    expect(speechText("`code` and ~~strike~~")).toBe("code and strike");
  });

  it("collapses whitespace", () => {
    expect(speechText("a\n\n  b\t c")).toBe("a b c");
  });

  it("caps the length and cuts on a word boundary", () => {
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const out = speechText(long, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith("…")).toBe(true);
    // Cuts on a word boundary, so the text before the ellipsis ends with a
    // COMPLETE word from the input — never a fragment like "wor".
    const body = out.slice(0, -1);
    const lastToken = body.split(" ").at(-1) ?? "";
    expect(long.split(" ")).toContain(lastToken);
    expect(lastToken).toMatch(/^word\d+$/);
  });

  it("returns empty for empty input", () => {
    expect(speechText("")).toBe("");
    expect(speechText("   ")).toBe("");
  });
});

describe("speechLocale", () => {
  it("maps each UI language to a BCP-47 tag", () => {
    expect(speechLocale("hi")).toBe("hi-IN");
    expect(speechLocale("en")).toBe("en-IN");
  });

  it("reads Hinglish with an Indian English voice, because it is Roman script", () => {
    // A Hindi voice would mispronounce the Latin letters in "Ab ye karo".
    expect(speechLocale("hinglish")).toBe("en-IN");
  });
});

describe("availability is reported honestly", () => {
  it("reports unsupported when the browser has no Web Speech API", () => {
    expect(isSpeechSupported()).toBe(false);
    expect(pickVoice("en-IN")).toBeNull();
    expect(hasVoiceFor("en-IN")).toBe(false);
    expect(speak("hello", "en")).toBe(false);
  });

  it("reports no voice when the device has none", () => {
    mockSpeech([]);
    expect(isSpeechSupported()).toBe(true);
    expect(pickVoice("en-IN")).toBeNull();
    expect(hasVoiceFor("hi-IN")).toBe(false);
  });

  it("reports no voice when the requested locale is absent", () => {
    mockSpeech([{ lang: "en-US", name: "US" }]);
    expect(hasVoiceFor("hi-IN")).toBe(false);
    expect(hasVoiceFor("en-IN")).toBe(true);
  });

  it("prefers an exact locale match over a language-only one", () => {
    mockSpeech([
      { lang: "en-US", name: "US" },
      { lang: "en-IN", name: "India" },
    ]);
    expect(pickVoice("en-IN")?.name).toBe("India");
  });

  it("falls back to the same language when the region differs", () => {
    mockSpeech([{ lang: "en-GB", name: "British" }]);
    expect(pickVoice("en-IN")?.name).toBe("British");
  });

  it("still speaks when no voice matches, rather than staying silent", () => {
    const m = mockSpeech([{ lang: "en-US", name: "US" }]);
    expect(speak("hello", "hi")).toBe(true);
    // The locale is stated as a preference even without a matching voice.
    expect(m.spoken[0]?.lang).toBe("hi-IN");
  });
});

describe("speak", () => {
  it("cancels anything already speaking, so two buttons never overlap", () => {
    const m = mockSpeech([{ lang: "en-IN", name: "India" }]);
    speak("first", "en");
    speak("second", "en");
    expect(m.cancelled).toBe(2);
    expect(m.spoken.map((s) => s.text)).toEqual(["first", "second"]);
  });

  it("speaks the cleaned and capped text", () => {
    const m = mockSpeech([{ lang: "en-IN", name: "India" }]);
    speak("## Do this next\n- **Revise** Electrostatics", "en");
    expect(m.spoken[0]?.text).toBe("Do this next Revise Electrostatics");
  });

  it("refuses to speak nothing", () => {
    const m = mockSpeech([{ lang: "en-IN", name: "India" }]);
    expect(speak("", "en")).toBe(false);
    expect(speak("   ", "en")).toBe(false);
    expect(m.spoken).toEqual([]);
  });

  it("returns false when speechSynthesis throws", () => {
    mockSpeech([{ lang: "en-IN", name: "India" }]);
    const synth = (window as unknown as { speechSynthesis: { speak: () => never } })
      .speechSynthesis;
    synth.speak = () => {
      throw new Error("blocked");
    };
    expect(speak("hello", "en")).toBe(false);
  });

  it("stopSpeaking is safe when nothing is speaking", () => {
    mockSpeech([]);
    expect(() => stopSpeaking()).not.toThrow();
  });
});

describe("whenVoicesReady", () => {
  it("resolves immediately when voices are already populated", async () => {
    mockSpeech([{ lang: "en-IN", name: "India" }]);
    await expect(whenVoicesReady()).resolves.toBeUndefined();
  });

  it("resolves on the voiceschanged event", async () => {
    const m = mockSpeech([]);
    const promise = whenVoicesReady(5000);
    m.fireVoicesChanged();
    await expect(promise).resolves.toBeUndefined();
  });

  it("resolves even when the browser never fires the event", async () => {
    mockSpeech([]);
    // A short timeout so the test does not wait for the real 1.2s fallback.
    await expect(whenVoicesReady(10)).resolves.toBeUndefined();
  });

  it("resolves when speech is unsupported", async () => {
    await expect(whenVoicesReady()).resolves.toBeUndefined();
  });
});
