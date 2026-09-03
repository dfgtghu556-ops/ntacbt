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

const SYSTEM_PROMPT = `You convert an exam paper (or a slice of one) into strict JSON. You may receive the actual page images, raw extracted text, or both — when images are present, read them directly like a person would (tables, matched-list questions, diagrams, multi-column layouts, even scanned/handwritten pages) rather than relying only on the raw text, which can be jumbled or lose structure.

FORMAT KNOWLEDGE BASE — you are expected to recognize ALL of these real-world paper families and their variants:
- LAYOUTS: single column; two/three column; question-per-box; table-based question banks; questions flowing across page breaks; landscape sheets; booklet scans with two physical pages per image.
- PAPER FAMILIES: NTA-style CBT papers (JEE/NEET/CUET: 4-option MCQs + numerical-value questions, separate answer key, solutions section); board exams (CBSE/ICSE/state: mixed MCQ + subjective — extract ONLY objective/MCQ/numeric questions and skip pure essay questions); coaching institute material (Allen/Aakash/FIITJEE/Resonance/PW/Vedantu DPPs, sheets, test series: often exercise-wise with "Exercise-1", "Level-2", "JEE Main Archive" sections — treat each numbered question in sequence); Olympiads (NTSE/KVPY/NSEJS); previous-year-question books (chapterwise PYQ collections where numbering restarts per chapter — continue in reading order); worksheets and quizzes.
- QUESTION NUMBERING: "1." "1)" "(1)" "[1]" "#1" "Q1." "Q.1" "Q-1" "Ques. 1" "Question 1" "प्रश्न 1"; numbering may restart mid-document (new section/chapter) — when it restarts, continue reporting the printed number as-is (duplicates are handled downstream by order of appearance).
- OPTION LABELS: (a)-(d), a)-d), A.-D., 1)-4), (1)-(4), (i)-(iv), circled numbers — normalize all to a/b/c/d in reading order.
- QUESTION TYPES: single-correct MCQ; numerical/integer answer; assertion-reason (extract as MCQ with its 4 standard options); match-the-column (extract as MCQ if options give combinations); fill-in-the-blank with options (MCQ) or without (integer if the answer is numeric). Multi-correct MCQs: mark type "mcq" and use the FIRST correct option as the answer.
- ANSWER PLACEMENT: separate key section ("Answer Key", "Answers", "ANSWER SHEET", "उत्तरमाला", key grids/tables mapping number→letter); inline after each question ("Ans: B", "Answer. (3)", "Correct option: c", "Sol. ... hence (B)"); bold/circled option in solutions; per-chapter keys in PYQ books. Match answers to questions by printed number within the same section.
- BILINGUAL PAPERS (Hindi/English): each question printed twice — extract the ENGLISH version only, once.
- COACHING-PAPER PITFALLS (the most common upload — be extra careful): section banners mid-paper ("SECTION-A", "PART-II: NUMERICAL", "SECTION-B (Attempt any 5)") — numbering usually CONTINUES across them, so do not restart your count; a question's options may sit on the NEXT page or NEXT column — join them; passage/paragraph-based groups ("Comprehension for Q.12-14") — attach the passage text to EACH question in the group; two questions side-by-side in the same visual row; watermark text overlapping questions — read through it; question numbers printed in bold circles or boxes; negative-marking notes inside the question area — not part of the question text; space-for-working gaps between a question and its options.
- Ignore: headers, footers, page numbers, watermarks, institute branding, instructions pages, formula sheets, blank OMR sheets, advertisement pages.

Rules:
- Find every question on the given pages.
- You may be given only a SLICE of a longer paper: questions can start at any number (e.g. 26). Always report each question's PRINTED number exactly as it appears. If questions are unnumbered, number them by order of appearance starting from 1.
- For each question, extract: the question number, the full question text (keep any math/formulas as plain text), and its options if multiple-choice.
- A letter answer (or normalized option position) means single-correct MCQ. A plain number with no options means a numerical-answer question.
- If no answer is found for a question, still return it with "answer": null.
- Do not invent, translate, or reword any question or option text — extract it exactly as written.
- Return ONLY the JSON object described by the response schema. No commentary.`;

interface ReformattedQuestion {
  no: number;
  text: string;
  type: "mcq" | "integer";
  options: { label: string; text: string }[];
  answer: string | null;
}

/* RATE LIMIT: Gemini-backed and token-heavy (page images!). 6/min per IP is
 * generous for legitimate PDF uploads and blocks accidental client loops. */
const rlBuckets = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (rlBuckets.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 6) {
    rlBuckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  rlBuckets.set(ip, arr);
  if (rlBuckets.size > 2000) rlBuckets.clear();
  return false;
}

export const Route = createFileRoute("/api/public/pdf-reformat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip =
          request.headers.get("cf-connecting-ip") ||
          (request.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() ||
          "anon";
        if (rateLimited(ip)) {
          return Response.json(
            { error: "Too many AI parsing requests — wait a minute and retry." },
            { status: 429 },
          );
        }
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

        let body: {
          text?: string;
          subject?: string;
          images?: { mimeType?: string; data?: string }[];
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request body" }, { status: 400 });
        }

        const text = (body.text || "").trim();
        const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
        if (!text && !images.length) {
          return Response.json({ error: "No text or page images supplied" }, { status: 400 });
        }
        // Guard against runaway input (Gemini free tier has a token budget too).
        const trimmed = text.slice(0, 120_000);

        const model = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";
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

        interface ImgIn {
          mimeType?: string;
          data?: string;
        }
        const imgParts = images
          .filter((im: ImgIn) => im && im.mimeType && im.data)
          .map((im: ImgIn) => ({
            inline_data: {
              mime_type: String(im.mimeType).slice(0, 40),
              data: String(im.data).slice(0, 6_000_000),
            },
          }));

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
