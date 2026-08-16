import { createFileRoute } from "@tanstack/react-router";

/**
 * Backs the "🤖 AI Doubt Solver" chat widget in public/jee-cbt.html.
 *
 * Runs on OpenRouter (openrouter.ai) — a free-tier, OpenAI-compatible
 * gateway to many models. Get a key at https://openrouter.ai/keys (sign
 * in with email, GitHub, or Google — no credit card needed for :free
 * models). Uses the same OPENROUTER_API_KEY secret as the Layer 6 PDF
 * fallback (src/routes/api/public/pdf-reformat.ts) — no extra setup
 * needed if that's already configured.
 *
 * Streams the reply back token-by-token (OpenRouter's OpenAI-style SSE
 * stream is proxied through as-is) for a live "typing" effect, and
 * switches to a vision-capable free model automatically when the student
 * attaches a photo of a question.
 */

const SYSTEM_PROMPT = `You are a friendly, encouraging JEE Main tutor helping a student inside their exam-prep app.
- Explain Physics, Chemistry and Maths doubts clearly and step by step, at a level suited to a JEE aspirant.
- When a question, its options, and the correct answer are given, confirm the answer and explain the reasoning — don't just state it.
- If the student attaches a photo of a question, read it carefully (including any handwriting) before answering.
- Keep answers focused and not overly long unless the student asks for more depth.
- Format with markdown: **bold** key terms/results, use "- " bullet lists or "1. " numbered steps for multi-step solutions, and put the final answer on its own line starting with "Answer:". Simple math notation like x^2, sqrt(x), or plain fractions is fine — no LaTeX.
- If something is outside JEE-relevant Physics/Chemistry/Maths/study-strategy, gently redirect back to those topics.`;

interface ChatMessage {
  role: "user" | "model";
  text: string;
  image?: { mimeType: string; data: string } | null;
}

export const Route = createFileRoute("/api/public/ai-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["OPENROUTER_API_KEY"];
        if (!apiKey) {
          return Response.json(
            { error: "The AI doubt-solver isn't configured yet — ask the site owner to add an OPENROUTER_API_KEY secret." },
            { status: 503 },
          );
        }

        let body: { messages?: ChatMessage[] };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request body" }, { status: 400 });
        }

        const messages = (body.messages || []).filter(
          (m) => m && (m.role === "user" || m.role === "model") && ((typeof m.text === "string" && m.text.trim()) || m.image),
        );
        if (!messages.length) {
          return Response.json({ error: "No message supplied" }, { status: 400 });
        }
        // Keep the request small and bounded — this is a chat widget, not a document pipeline.
        const recent = messages.slice(-16);
        const hasImage = !!recent[recent.length - 1]?.image;

        const chatMessages = recent.map((m, i) => {
          const role = m.role === "model" ? "assistant" : "user";
          const isLast = i === recent.length - 1;
          if (isLast && role === "user" && m.image && m.image.data && m.image.mimeType) {
            return {
              role,
              content: [
                { type: "text", text: (m.text || "What's happening in this photo?").slice(0, 4000) },
                { type: "image_url", image_url: { url: `data:${m.image.mimeType.slice(0, 40)};base64,${m.image.data.slice(0, 8_000_000)}` } },
              ],
            };
          }
          return { role, content: (m.text || "").slice(0, 4000) };
        });

        // OpenRouter's free (":free") model lineup rotates from time to time.
        // OPENROUTER_MODEL/OPENROUTER_VISION_MODEL let you repoint these without
        // a code change if a default below is ever retired — browse current
        // free models at https://openrouter.ai/models?max_price=0. A
        // vision-capable model is only needed (and used) on turns with a photo.
        const model = hasImage
          ? process.env["OPENROUTER_VISION_MODEL"] || "google/gemma-4-31b-it:free"
          : process.env["OPENROUTER_MODEL"] || "meta-llama/llama-3.3-70b-instruct:free";
        const url = "https://openrouter.ai/api/v1/chat/completions";

        let r: Response;
        try {
          r = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": "https://ntacbt.lovable.app",
              "X-Title": "Someshwar JEE Main CBT Platform",
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "system", content: SYSTEM_PROMPT }, ...chatMessages],
              temperature: 0.4,
              max_tokens: 1536,
              stream: true,
            }),
          });
        } catch {
          return Response.json({ error: "Couldn't reach the AI service" }, { status: 502 });
        }

        if (!r.ok || !r.body) {
          const status = r.status === 429 ? 429 : 502;
          return Response.json(
            { error: r.status === 429 ? "The AI is getting a lot of questions right now — try again in a moment." : `AI service error (${r.status})` },
            { status },
          );
        }

        // Proxy OpenRouter's OpenAI-style SSE stream straight through — the client
        // parses each "data: {...}" chunk (choices[0].delta.content) and appends it live.
        return new Response(r.body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
