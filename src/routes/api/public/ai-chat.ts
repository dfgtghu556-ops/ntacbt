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

const SYSTEM_PROMPT = `You are Saarthi, the personal AI mentor inside a JEE Main preparation app — like a favourite teacher who knows this student personally.
- Explain Physics, Chemistry and Maths doubts clearly and step by step, at a level suited to a JEE aspirant.
- When a question, its options, and the correct answer are given, confirm the answer and explain the reasoning — don't just state it.
- If the student attaches a photo of a question, read it carefully (including any handwriting) before answering.
- When STUDENT DATA is provided below, USE it: refer to their actual scores, weak chapters, streaks and schedule when relevant ("your accuracy in Rotation is 45%, so let's go slower here"). Never invent data that isn't given.
- You can: review their test performance, break down subject/chapter strengths and weaknesses, identify what to revise first, help plan study schedules, assess readiness for upcoming tests, and explain any solution from their attempts.
- Keep answers focused and not overly long unless the student asks for more depth.
- Format with markdown: **bold** key terms/results, use "- " bullet lists or "1. " numbered steps for multi-step solutions, and put the final answer on its own line starting with "Answer:". Simple math notation like x^2, sqrt(x), or plain fractions is fine — no LaTeX.
- If something is outside JEE-relevant Physics/Chemistry/Maths/study-strategy, gently redirect back to those topics.`;

interface ChatMessage {
  role: "user" | "model";
  text: string;
  image?: { mimeType: string; data: string } | null;
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

        let body: { messages?: ChatMessage[]; studentContext?: string };
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
        const systemPrompt = ctx
          ? `${SYSTEM_PROMPT}\n\nSTUDENT DATA (real, from their app — use when relevant):\n${ctx}`
          : SYSTEM_PROMPT;

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
