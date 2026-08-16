import { createFileRoute } from "@tanstack/react-router";

/**
 * Layer 6 fallback for the exam-paper parser (public/jee-cbt.html).
 *
 * Layers 1-5 in the client are all *position-based*: they look at where
 * text sits on the PDF page (columns, margins, x/y coordinates) to find
 * question numbers. That works for the vast majority of papers, but it
 * fails outright on PDFs with an unfamiliar layout.
 *
 * This route is the last resort. The client sends the *raw extracted
 * text* of the paper (no coordinates), and an LLM restructures it into
 * strict JSON: question number, question text, options, and answer.
 * This never runs unless every earlier layer already failed, so it adds
 * no cost or risk to papers that already parse correctly today.
 *
 * Runs on OpenRouter (openrouter.ai) — a free-tier, OpenAI-compatible
 * gateway to many models. Get a key at https://openrouter.ai/keys (sign
 * in with email, GitHub, or Google — no credit card needed for :free models).
 */

const SYSTEM_PROMPT = `You convert a JEE-style exam paper (raw text extracted from a PDF, layout lost) into strict JSON.

Rules:
- Find every question, numbered sequentially (1, 2, 3, ...). Ignore headers, footers, page numbers, and instructions.
- For each question, extract: the question number, the full question text (keep any math/formulas as plain text), and its options if it is multiple-choice (label a/b/c/d and option text).
- If a separate "Answer Key" / "Answers" section exists, match each answer back to its question by number. A letter (a/b/c/d) means single-correct MCQ. A plain number means a numerical-answer question with no options.
- If no answer key is found, still return the question with "answer": null.
- Do not invent, translate, or reword any question or option text — extract it exactly as written.
- Respond with ONLY a single JSON object, no markdown fences, no commentary, in exactly this shape:
{"questions":[{"no":1,"text":"...","type":"mcq","options":[{"label":"a","text":"..."}],"answer":"a"}]}
"type" is "mcq" or "integer" ("options" is an empty array for "integer"). "answer" is a lowercase letter, a numeric string, or null.`;

interface ReformattedQuestion {
  no: number;
  text: string;
  type: "mcq" | "integer";
  options: { label: string; text: string }[];
  answer: string | null;
}

export const Route = createFileRoute("/api/public/pdf-reformat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["OPENROUTER_API_KEY"];
        if (!apiKey) {
          return Response.json(
            {
              error:
                "AI fallback isn't configured yet. Add an OPENROUTER_API_KEY secret to enable Layer 6 parsing.",
            },
            { status: 503 },
          );
        }

        let body: { text?: string; subject?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request body" }, { status: 400 });
        }

        const text = (body.text || "").trim();
        if (!text) {
          return Response.json({ error: "No text supplied" }, { status: 400 });
        }
        // Guard against runaway input (the free tier has a daily request budget too).
        const trimmed = text.slice(0, 120_000);

        // OpenRouter's free (":free") model lineup rotates from time to time —
        // OPENROUTER_MODEL lets you repoint this without a code change if the
        // default below is ever retired. Browse current free models at
        // https://openrouter.ai/models?max_price=0
        const model = process.env["OPENROUTER_MODEL"] || "meta-llama/llama-3.3-70b-instruct:free";
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
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Subject: ${body.subject || "Unknown"}\n\nRaw paper text:\n\n${trimmed}` },
              ],
              temperature: 0,
              max_tokens: 8000,
              response_format: { type: "json_object" },
            }),
          });
        } catch {
          return Response.json({ error: "Couldn't reach the AI service" }, { status: 502 });
        }

        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          const status = r.status === 429 ? 429 : 502;
          return Response.json(
            { error: `AI service error (${r.status})`, detail: errText.slice(0, 300) },
            { status },
          );
        }

        const data = await r.json().catch(() => null);
        const raw: string | undefined = data?.choices?.[0]?.message?.content;
        if (!raw) {
          return Response.json({ error: "AI returned no usable content" }, { status: 502 });
        }

        let parsed: { questions?: ReformattedQuestion[] };
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Some models wrap JSON mode output in ```json fences despite instructions — try stripping.
          try {
            parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
          } catch {
            return Response.json({ error: "AI response wasn't valid JSON" }, { status: 502 });
          }
        }

        const questions = (parsed.questions || []).filter(
          (q) => q && typeof q.no === "number" && typeof q.text === "string" && q.text.trim(),
        );
        if (!questions.length) {
          return Response.json(
            { error: "AI couldn't find any questions in this PDF either" },
            { status: 422 },
          );
        }

        return Response.json({ questions });
      },
    },
  },
});
