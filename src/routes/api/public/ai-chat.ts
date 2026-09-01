import { createFileRoute } from "@tanstack/react-router";

/**
 * Backs the "AI Doubt Solver" chat widget in public/jee-cbt.html.
 *
 * PROVIDERS (checked in this order, with automatic failover):
 * 1. OpenRouter (OPENROUTER_API_KEY) — free frontier-class open models:
 *      thinking tier  : OPENROUTER_MODEL        (default openai/gpt-oss-120b:free)
 *      light tier     : OPENROUTER_MODEL_LIGHT  (default meta-llama/llama-3.3-70b-instruct:free)
 *    Free tier is rate-limited per day, so 429/5xx automatically falls
 *    back to Gemini below. Image messages skip OpenRouter entirely —
 *    free-tier vision there is unreliable; Gemini reads photos best.
 * 2. Google Gemini (GEMINI_API_KEY) — vision + fallback when OpenRouter
 *    is unavailable or rate-limited. Get a free key at
 *    https://aistudio.google.com/apikey (sign in with Google, no credit
 *    card needed). Uses the same GEMINI_API_KEY secret as the Layer 6
 *    PDF fallback (src/routes/api/public/pdf-reformat.ts) — no extra
 *    setup needed if that's already configured.
 *
 * PERSONALIZATION: the client sends a compact "studentContext" string
 * (real performance data: last scores, weak chapters, streak, due
 * reviews, upcoming schedule). It is appended to the system prompt so
 * the tutor answers like a mentor who knows this exact student —
 * Vedantu-AI style — instead of a generic chatbot.
 */
/* Runs non-streaming: waits for the full reply, then returns it in one
   JSON response — more reliable across serverless hosts than proxying a
   live SSE stream through. Trades away the live "typing" effect.
   Uses two model tiers (see needsThinking() below): a stronger model for
   problems that need working-through, a fast/light one for plain chat. */

const SYSTEM_PROMPT = `You are Saarthi, the all-capable AI mentor inside this JEE Main preparation platform — a world-class tutor, counsellor and guide in one. Be confident about everything you CAN do; never say "I can't" when a capability below covers it.

YOUR CAPABILITIES (own them — tell students about these when asked "what can you do"):
1. SOLVE ANYTHING: any Physics/Chemistry/Maths doubt, any JEE Main or Advanced question, step by step, at exam level. Photos of questions (including handwriting) too.
2. LIVE WEB KNOWLEDGE: when WEB RESULTS are provided below, use them to answer current questions — exam dates, NTA notifications, cutoffs, counselling (JoSAA/CSAB), syllabus changes, college info, latest news. Cite what you found naturally ("as per the latest notification…"). If web results are provided, they are fresh and trustworthy — prefer them over memory for anything time-sensitive.
3. PERSONAL COACH: STUDENT DATA below is their REAL performance from this app — real scores, percentiles, weak chapters, streaks, schedule. Review performance, plan revision, assess exam readiness with actual numbers. Never invent data that isn't given.
4. THIS PLATFORM'S GUIDE: you know every feature of this site and can tell the student exactly where to go (the app shows tappable buttons for sections you mention):
   • Dashboard — streak, stats, quick start · • Test Library — full mock tests, publish/share
   • PYQ Papers — real JEE Main previous-year papers (every session/shift), attempted in the real NTA CBT interface
   • Upload PDFs — turn any coaching PDF into a CBT mock · • Planner — study schedule, pomodoro, calendar
   • Analytics — percentile trajectory, marks, subject breakdown · • Mastery — chapter-wise mastery levels
   • Mistake Notebook — every wrong question with tags · • Formulas — formula cards & flashcards
   • Practice — chapter drills · • Review — spaced-repetition reviews due today
   • Live Classes — free live classes from top institutes streaming right now · • Search — question bank search
   • Settings — theme, exam date, target percentile, backups
5. STRATEGY & MOTIVATION: attempt strategy, time management, stress handling, last-month plans, college/branch guidance.

SOCRATIC TEACHING (for learning-oriented "why/how" conceptual questions):
- Don't dump the full answer immediately. First give ONE guiding question or hint that points at the key idea ("Socho: agar conductor ke andar field hota, to free electrons ka kya hota?"), then reveal the reasoning step by step.
- For direct problem-solving requests ("solve this", exam practice, doubts before a test) — skip Socratic, give the full stepwise solution.
- After teaching a concept, offer a similar practice question and invite the student to try it; evaluate their attempt honestly when they reply.

MENTOR MINDSET (this is who you are, not just what you do):
- You are a REAL mentor on a mission: getting THIS student their JEE rank. Their goal (in STUDENT DATA) is YOUR goal. Act invested — like a coach whose own reputation rides on their selection.
- Be proactively demanding, with love: if their data shows missed days, falling accuracy or an untouched weak chapter, BRING IT UP YOURSELF at the start of your reply ("Pehle ye batao — 3 din se Daily 10 kyun chhoda?"). Don't wait to be asked.
- Every reply should end with ONE concrete next action ("Ab ye karo: ...") — a specific chapter, a specific drill, a specific number of questions. A mentor never leaves a student without a next step.
- MISTAKE DNA: STUDENT DATA may include self-tagged mistake types (concept / formula / calculation / misread / silly / guessed) and a detected pattern. Treat a repeated pattern as the #1 coaching point — e.g. 9 calculation slips in Physics means "do rough work in 2 columns, recheck last line", NOT "practice more". Match the intervention to the mistake TYPE.
- BAD STUDY PATTERNS: if STUDENT DATA flags one (many lectures but few questions solved; tests without mistake review; over-grinding one chapter), address it head-on — watching more lectures never fixes low problem-solving, and re-tests without error review repeat the same mistakes.
- Celebrate real wins from their data ("streak 12 din — ye consistency hi rank layegi"). Call out excuses gently but firmly. Never fake-praise.
- If exam date is near (see STUDENT DATA), inject urgency naturally — days-left math, what fits in the time remaining.

STYLE:
- Warm, encouraging, personal — like their favourite teacher. Hinglish is fine if the student writes in it.
- Format with markdown: **bold** key results, "- " bullets, "1. " numbered steps, ### headings for sections. Put the final answer of a solved problem on its own line starting with "Answer:". Simple math notation (x^2, sqrt(x), fractions) — no LaTeX.
- Focused answers by default; go deep when asked.
- Only truly unrelated topics (politics, entertainment gossip) get a gentle redirect back to studies.`;

interface ChatMessage {
  role: "user" | "model";
  text: string;
  image?: { mimeType: string; data: string } | null;
}

/** ---------- FREE WEB SEARCH (no API key) ----------
 *  DuckDuckGo's html endpoint + Wikipedia's REST API give Saarthi live
 *  knowledge: exam dates, NTA notices, cutoffs, current affairs. Only
 *  fires when the message actually needs fresh facts (see needsWeb),
 *  runs both sources in parallel, hard 6s cap so chat never hangs. */
function needsWeb(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (t.length < 8) return false;
  return /\b(20(2[4-9]|3\d)|latest|current|today|this year|next year|kab|कब|date|dates|schedule|notification|admit card|result|cutoff|cut-off|cut off|counselling|counseling|josaa|csab|nta\b|registration|application|eligibility|percentile required|closing rank|opening rank|fees|placement|nirf|ranking|when is|when will|news|update|syllabus change|pattern change|how many attempts|attempt limit)\b/.test(
    t,
  );
}
async function webSearch(query: string): Promise<string> {
  const out: string[] = [];
  const clean = (s: string) =>
    s
      .replace(/<[^>]+>/g, " ")
      .replace(
        /&(amp|lt|gt|quot|#39|nbsp);/g,
        (m) =>
          ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " })[
            m
          ] || " ",
      )
      .replace(/\s+/g, " ")
      .trim();
  const ddg = (async () => {
    try {
      const r = await fetch(
        "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query.slice(0, 200)),
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(6_000),
        },
      );
      if (!r.ok) return;
      const html = await r.text();
      // result blocks: <a class="result__a" ...>title</a> ... <a class="result__snippet">snippet</a>
      const items = [
        ...html.matchAll(
          /class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g,
        ),
      ];
      for (const m of items.slice(0, 4)) {
        const title = clean(m[1] ?? ""),
          snip = clean(m[2] ?? "");
        if (title && snip) out.push(`• ${title}: ${snip}`.slice(0, 300));
      }
    } catch {
      /* optional source */
    }
  })();
  const wiki = (async () => {
    try {
      const r = await fetch(
        "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
          encodeURIComponent(query.slice(0, 150)) +
          "&format=json&srlimit=2&srprop=snippet",
        { signal: AbortSignal.timeout(6_000), headers: { "User-Agent": "jee-cbt-saarthi/1.0" } },
      );
      if (!r.ok) return;
      const d = (await r.json()) as { query?: { search?: { title?: string; snippet?: string }[] } };
      for (const s of d.query?.search || [])
        if (s.title && s.snippet)
          out.push(`• ${clean(s.title)}: ${clean(s.snippet)}`.slice(0, 300));
    } catch {
      /* optional source */
    }
  })();
  await Promise.allSettled([ddg, wiki]);
  return out.slice(0, 6).join("\n");
}

/** Heuristic router: a photo of a question, or wording that asks for a
 *  worked solution, gets the stronger reasoning model. Plain conversation
 *  gets the fast, lightweight model instead. */
function needsThinking(text: string, hasImage: boolean): boolean {
  if (hasImage) return true;
  const t = (text || "").toLowerCase();
  const wordSignals =
    /\b(solve|calculate|derive|prove|integrate|differentiate|simplify|evaluate|find (the )?(value|answer|x|roots?)|step[- ]by[- ]step|show (the )?(work|steps)|explain how|compute|balance the equation|what('| i)?s the (value|answer))\b/;
  const mathySignals = /[=^√∫∑]|\bd\/dx\b|\d+\s*[+\-*/]\s*\d+/;
  return wordSignals.test(t) || mathySignals.test(t);
}

/** Call OpenRouter (OpenAI-compatible API). Returns the reply text, or
 *  null when the caller should fall back to Gemini (rate limit, error,
 *  or empty response — free-tier models rotate and hiccup). */
async function tryOpenRouter(
  apiKey: string,
  systemPrompt: string,
  recent: ChatMessage[],
  thinking: boolean,
): Promise<string | null> {
  const model = thinking
    ? process.env["OPENROUTER_MODEL"] || "openai/gpt-oss-120b:free"
    : process.env["OPENROUTER_MODEL_LIGHT"] || "meta-llama/llama-3.3-70b-instruct:free";
  const messages = [
    { role: "system", content: systemPrompt },
    ...recent.map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: (m.text || "").slice(0, 4000),
    })),
  ];
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://jee-cbt.app",
        "X-Title": "JEE CBT Saarthi",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: thinking ? 1536 : 700,
      }),
      // free models occasionally hang — cap the wait so Gemini can take over
      signal: AbortSignal.timeout(thinking ? 45_000 : 25_000),
    });
    if (!r.ok) return null; // 429/5xx → fall back to Gemini
    const data = await r.json().catch(() => null);
    const reply: string | undefined = data?.choices?.[0]?.message?.content?.trim();
    // Strip <think> traces some free reasoning models emit
    return reply ? reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null : null;
  } catch {
    return null;
  }
}

/** Call Gemini (handles images natively). Returns reply text or an error. */
async function tryGemini(
  apiKey: string,
  systemPrompt: string,
  recent: ChatMessage[],
  thinking: boolean,
): Promise<{ reply?: string; status?: number }> {
  const contents = recent.map((m, i) => {
    const parts: Record<string, unknown>[] = [];
    const isLast = i === recent.length - 1;
    if (isLast && m.role === "user" && m.image && m.image.data && m.image.mimeType) {
      parts.push({
        inline_data: {
          mime_type: m.image.mimeType.slice(0, 40),
          data: m.image.data.slice(0, 8_000_000),
        },
      });
    }
    parts.push({ text: (m.text || "(see attached photo)").slice(0, 4000) });
    return { role: m.role, parts };
  });
  const model = thinking
    ? process.env["GEMINI_MODEL"] || "gemini-3.5-flash"
    : process.env["GEMINI_MODEL_LIGHT"] || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: thinking ? 1536 : 700 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { status: 502 };
  }
  if (!r.ok) return { status: r.status };
  const data = await r.json().catch(() => null);
  const reply: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text || "")
    .join("")
    .trim();
  return reply ? { reply } : { status: 502 };
}

/* RATE LIMIT: the most expensive endpoint on the site. A stuck client loop
 * or abuse script could burn the whole free-tier quota for every student.
 * Sliding 1-minute window per IP, in-memory (single instance is fine for
 * this deployment). 12 requests/min is far above any human chat speed. */
const rlBuckets = new Map<string, number[]>();
const RL_MAX = 12;
const RL_WINDOW = 60_000;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (rlBuckets.get(ip) || []).filter((t) => now - t < RL_WINDOW);
  if (arr.length >= RL_MAX) {
    rlBuckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  rlBuckets.set(ip, arr);
  if (rlBuckets.size > 2000) rlBuckets.clear(); // bounded memory
  return false;
}

export const Route = createFileRoute("/api/public/ai-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const orKey = process.env["OPENROUTER_API_KEY"];
        const gemKey = process.env["GEMINI_API_KEY"];
        if (!orKey && !gemKey) {
          return Response.json(
            {
              error:
                "The AI doubt-solver isn't configured yet — add an OPENROUTER_API_KEY or GEMINI_API_KEY secret.",
            },
            { status: 503 },
          );
        }
        const ip =
          request.headers.get("cf-connecting-ip") ||
          (request.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() ||
          "anon";
        if (rateLimited(ip)) {
          return Response.json(
            {
              error: "Thoda dheere — bahut saare messages ek saath. 1 minute mein dobara try karo.",
            },
            { status: 429 },
          );
        }

        let body: { messages?: ChatMessage[]; studentContext?: string; systemHint?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request body" }, { status: 400 });
        }

        const messages = (body.messages || []).filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "model") &&
            ((typeof m.text === "string" && m.text.trim()) || m.image),
        );
        if (!messages.length) {
          return Response.json({ error: "No message supplied" }, { status: 400 });
        }
        // Keep the request small and bounded — this is a chat widget, not a document pipeline.
        const recent = messages.slice(-16);
        const lastMsg = recent[recent.length - 1];
        const hasImage = !!lastMsg?.image;
        const thinking = needsThinking(lastMsg?.text || "", hasImage);

        // Personalization: bounded, sanitized student snapshot from the client.
        const ctx =
          typeof body.studentContext === "string" ? body.studentContext.slice(0, 2500) : "";
        let systemPrompt = ctx
          ? `${SYSTEM_PROMPT}\n\nSTUDENT DATA (real, from their app — use when relevant):\n${ctx}`
          : SYSTEM_PROMPT;
        // Optional Socratic/mentor-mode instruction from the client (applied
        // on top of the base mentor persona, so both providers see it).
        const sysHint =
          typeof body.systemHint === "string" ? body.systemHint.slice(0, 1500) : "";
        if (sysHint) systemPrompt += `\n\nUSER-SELECTED MODE:\n${sysHint}`;

        // Live web knowledge: only when the question needs fresh facts.
        if (!hasImage && needsWeb(lastMsg?.text || "")) {
          const results = await webSearch(lastMsg?.text || "");
          if (results) {
            systemPrompt += `\n\nWEB RESULTS (live search for this question — fresh, prefer over memory for dates/numbers):\n${results.slice(0, 2200)}`;
          }
        }

        // 1) OpenRouter first (free frontier models) — text-only messages.
        if (orKey && !hasImage) {
          const reply = await tryOpenRouter(orKey, systemPrompt, recent, thinking);
          if (reply) return Response.json({ reply });
          // fall through to Gemini on any failure
        }

        // 2) Gemini — vision messages, or OpenRouter fallback.
        if (gemKey) {
          const out = await tryGemini(gemKey, systemPrompt, recent, thinking);
          if (out.reply) return Response.json({ reply: out.reply });
          const status = out.status === 429 ? 429 : 502;
          return Response.json(
            {
              error:
                status === 429
                  ? "The AI is getting a lot of questions right now — try again in a moment."
                  : `AI service error (${out.status})`,
            },
            { status },
          );
        }

        return Response.json(
          {
            error: hasImage
              ? "Photo answering needs a GEMINI_API_KEY secret (OpenRouter free vision is unreliable)."
              : "The AI is temporarily unavailable — try again in a moment.",
          },
          { status: 503 },
        );
      },
    },
  },
});
