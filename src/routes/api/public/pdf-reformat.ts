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
 * Runs on Google Gemini — get a free key at https://aistudio.google.com/apikey
 * (sign in with Google, no credit card needed).
 */

const SYSTEM_PROMPT = `You convert a JEE-style exam paper into strict JSON. You may receive the actual page images, raw extracted text, or both — when images are present, read them directly like a person would (tables, matched-list questions, diagrams, multi-column layouts) rather than relying only on the raw text, which can be jumbled or lose structure.

Rules:
- Find every question, numbered sequentially (1, 2, 3, ...). Ignore headers, footers, page numbers, and instructions.
- For each question, extract: the question number, the full question text (keep any math/formulas as plain text), and its options if it is multiple-choice (label a/b/c/d and option text).
- If a separate "Answer Key" / "Answers" section exists, match each answer back to its question by number. A letter (a/b/c/d) means single-correct MCQ. A plain number means a numerical-answer question with no options.
- If no answer key is found, still return the question with "answer": null.
- Do not invent, translate, or reword any question or option text — extract it exactly as written.
- Return ONLY the JSON object described by the response schema. No commentary.`;

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
        const apiKey = process.env["GEMINI_API_KEY"];
        if (!apiKey) {
          return Response.json(
            {
              error:
                "AI fallback isn't configured yet. Add a GEMINI_API_KEY secret to enable Layer 6 parsing.",
            },
            { status: 503 },
          );
        }

        let body: { text?: string; subject?: string; images?: { mimeType?: string; data?: string }[] };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request body" }, { status: 400 });
        }

        const text = (body.text || "").trim();
        const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
        if (!text && !images.length) {
          return Response.json({ error: "No text or page images supplied" }, { status: 400 });
        }
        // Guard against runaway input (Gemini free tier has a token budget too).
        const trimmed = text.slice(0, 120_000);

        const model = process.env["GEMINI_MODEL"] || "gemini-3.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const schema = {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  no: { type: "integer" },
                  text: { type: "string" },
                  type: { type: "string", enum: ["mcq", "integer"] },
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        text: { type: "string" },
                      },
                      required: ["label", "text"],
                    },
                  },
                  answer: { type: ["string", "null"] },
                },
                required: ["no", "text", "type", "options", "answer"],
              },
            },
          },
          required: ["questions"],
        };

        interface ImgIn { mimeType?: string; data?: string }
        const imgParts = images
          .filter((im: ImgIn) => im && im.mimeType && im.data)
          .map((im: ImgIn) => ({ inline_data: { mime_type: String(im.mimeType).slice(0, 40), data: String(im.data).slice(0, 6_000_000) } }));

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
              contents: [
                {
                  role: "user",
                  parts: [
                    ...imgParts,
                    {
                      text: `Subject: ${body.subject || "Unknown"}\n\n${imgParts.length ? "The attached images are the actual pages of this paper — read them directly (tables, matched-list questions, diagrams, anything the raw text below may have mangled). Raw extracted text (for cross-checking only):\n\n" : "Raw paper text:\n\n"}${trimmed}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema,
                temperature: 0,
              },
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
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw) {
          return Response.json({ error: "AI returned no usable content" }, { status: 502 });
        }

        let parsed: { questions?: ReformattedQuestion[] };
        try {
          parsed = JSON.parse(raw);
        } catch {
          return Response.json({ error: "AI response wasn't valid JSON" }, { status: 502 });
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
