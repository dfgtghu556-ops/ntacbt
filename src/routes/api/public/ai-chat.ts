import { createFileRoute } from "@tanstack/react-router";

/**
 * Backs the "🤖 AI Doubt Solver" chat widget in public/jee-cbt.html.
 *
 * Runs on Google Gemini — get a free key at https://aistudio.google.com/apikey
 * (sign in with Google, no credit card needed). Uses the same
 * GEMINI_API_KEY secret as the Layer 6 PDF fallback
 * (src/routes/api/public/pdf-reformat.ts) — no extra setup needed if
 * that's already configured.
 *
 * Streams the reply back token-by-token (Gemini's SSE stream is proxied
 * through as-is) so the widget can show a live "typing" effect, and
 * accepts an optional photo of a handwritten/printed question on the
 * latest user turn (vision input).
 */
/* Runs non-streaming: waits for the full reply, then returns it in one
   JSON response — more reliable across serverless hosts than proxying a
   live SSE stream through. Trades away the live "typing" effect. */

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
        const apiKey = process.env["GEMINI_API_KEY"];
        if (!apiKey) {
          return Response.json(
            { error: "The AI doubt-solver isn't configured yet — ask the site owner to add a GEMINI_API_KEY secret." },
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
        const contents = recent.map((m, i) => {
          const parts: Record<string, unknown>[] = [];
          const isLast = i === recent.length - 1;
          if (isLast && m.role === "user" && m.image && m.image.data && m.image.mimeType) {
            parts.push({ inline_data: { mime_type: m.image.mimeType.slice(0, 40), data: m.image.data.slice(0, 8_000_000) } });
          }
          parts.push({ text: (m.text || "(see attached photo)").slice(0, 4000) });
          return { role: m.role, parts };
        });

        const model = process.env["GEMINI_MODEL"] || "gemini-3.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        let r: Response;
        try {
          r = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents,
              generationConfig: { temperature: 0.4, maxOutputTokens: 1536 },
            }),
          });
        } catch {
          return Response.json({ error: "Couldn't reach the AI service" }, { status: 502 });
        }

        if (!r.ok) {
          const status = r.status === 429 ? 429 : 502;
          return Response.json(
            { error: r.status === 429 ? "The AI is getting a lot of questions right now — try again in a moment." : `AI service error (${r.status})` },
            { status },
          );
        }

        const data = await r.json().catch(() => null);
        const reply: string | undefined = data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text || "")
          .join("")
          .trim();
        if (!reply) {
          return Response.json({ error: "The AI didn't return a reply — please try again." }, { status: 502 });
        }

        return Response.json({ reply });
      },
    },
  },
});
