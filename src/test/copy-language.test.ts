/**
 * The UI copy is one language at a time.
 *
 * The app ships a language toggle - English / Hindi / Hinglish - backed by
 * `src/lib/lang.ts`. Its dictionary is deliberately small (the highest-traffic
 * dashboard headings) and `t()` is used in three places, so the toggle is real
 * but narrow.
 *
 * What was not real was the base copy. Seven user-visible strings were written
 * in Hinglish and left that way in an otherwise-English UI:
 *
 *   - the three greeting sub-lines on the dashboard
 *   - the study-plan empty state
 *   - the mock-test CTA paragraph
 *   - the Saarthi image-read error
 *   - two AI-chat rate-limit messages
 *
 * A student who never touched the toggle still read them, so the language was
 * not a choice they had made - it was a fragment someone left mid-edit. It also
 * made the toggle worse than useless: switch to English and the Hinglish
 * sentences stay.
 *
 * This pins the base copy to English. Expanding the dictionary is a content
 * project and would be a separate, deliberate change; leaving stray fragments
 * in place is not a halfway version of that, it is just inconsistent.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Hinglish markers. Matched as whole words or distinctive phrases, because a
 * bare substring like "kar" appears inside ordinary English.
 */
const HINGLISH =
  /\b(karta|karte|karti|karta hai|hota hai|hote|aapka|aapke|aapki|chahiye|nahi|dobara|dheere|ruk|thoda|bahut|saare|tarah|yahan|mein|kar lo|karo|bata|raha|dikh|dekho|abhi)\b/i;

/** Files whose copy a student reads directly. */
const COPY_FILES = [
  "src/routes/app.index.tsx",
  "src/routes/app.saarthi.tsx",
  "src/routes/app.report.tsx",
  "src/routes/app.analytics.tsx",
  "src/routes/app.planner.tsx",
  "src/routes/app.pyq.tsx",
  "src/routes/app.studytube.tsx",
  "src/routes/app.memory.tsx",
  "src/routes/app.focus.tsx",
];

/**
 * `src/lib/lang.ts` is exempt: its dictionary is *meant* to contain Hinglish,
 * and it is the only place that is.
 *
 * The AI mentor's system prompt in `src/routes/api/public/ai-chat.ts` is exempt
 * too, and for the opposite reason to the others. The mentor's voice is
 * *deliberately* Hinglish - it is instructed to open with "Pehle ye batao",
 * close with "Ab ye karo", and to match the student's language. That is a
 * coherent product decision, not a fragment left mid-edit, and "fixing" it
 * would change who the mentor is. The line that makes the intent explicit is
 * the one worth watching:
 *
 *     "Hinglish is fine if the student writes in it."
 *
 * So the prompt is meant to follow the student, and today it leads with Hinglish
 * regardless. That is a real gap, but it is a prompt change with a behaviour to
 * observe rather than a copy edit, so it is recorded here instead of half-done.
 */
const EXEMPT = ["src/lib/lang.ts", "src/routes/api/public/ai-chat.ts"];

describe("copy language", () => {
  it("has no Hinglish left in the base copy", () => {
    const offenders: string[] = [];
    for (const f of COPY_FILES) {
      const lines = read(f).split("\n");
      lines.forEach((line, i) => {
        if (!HINGLISH.test(line)) return;
        // A comment explaining the rule is not copy a student reads.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `Hinglish in English copy:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("keeps the dictionary as the one place Hinglish is allowed", () => {
    // The exemption is a decision. If Hinglish starts appearing in a route file
    // again, the test above catches it; this documents why lang.ts is excluded.
    const lang = read("src/lib/lang.ts");
    expect(lang).toMatch(/hinglish/);
    expect(lang).toMatch(/Ab ye karo/);
  });

  it("still ships a working language toggle, because the dictionary is real", () => {
    // Narrow is not the same as fake: the toggle does translate the dashboard
    // headings it covers. Deleting it would remove working behaviour, so it
    // stays and this asserts it stays wired.
    const shell = read("src/routes/app.tsx");
    expect(shell).toMatch(/LANG_LABEL\[lang\]/);
    expect(shell).toMatch(/setLang\(next\)/);
    const mission = read("src/features/dashboard/components/SurvivalMission.tsx");
    expect(mission).toMatch(/t\("onTrack", lang\)/);
    expect(mission).toMatch(/t\("doThisNext", lang\)/);
  });

  it("passes the language through without a bogus cast", () => {
    // `lang as "hinglish"` narrowed the static type to one member of the union
    // while the runtime value passed through unchanged. It worked by accident
    // and read as a bug, so the cast is gone and the real type is used.
    const mission = read("src/features/dashboard/components/SurvivalMission.tsx");
    expect(mission).not.toMatch(/lang as "hinglish"/);
  });

  it("labels the language toggle for what it actually controls", () => {
    // The toggle is real but narrow: its live consumers are the read-aloud voice
    // in `src/lib/speech.ts` and the three SurvivalMission labels above. It does
    // not translate the app. Calling it "Change language" promised a translated
    // UI that does not exist, so the button now names the voice it switches.
    const shell = read("src/routes/app.tsx");
    expect(shell).toMatch(/aria-label="Change read-aloud language"/);
    expect(shell).not.toMatch(/aria-label="Change language"/);
    expect(shell).not.toMatch(/title="Switch language/);
  });

  it("does not import the dictionary where it is never called", () => {
    // app.index.tsx imported `t` and never used it - the only `t` in scope was a
    // local `.filter((t) => t.isWeakTarget)` arrow parameter shadowing it.
    const dash = read("src/routes/app.index.tsx");
    expect(dash).toMatch(/import \{ useLang \} from "@\/lib\/lang"/);
    expect(dash).not.toMatch(/import \{ useLang, t \} from "@\/lib\/lang"/);
  });
});
