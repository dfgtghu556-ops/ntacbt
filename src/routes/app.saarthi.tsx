import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Send, ShieldAlert, Sparkles } from "lucide-react";
import { DataStore } from "@/lib/store";
import { computeReadiness } from "@/features/readiness/readiness";

export const Route = createFileRoute("/app/saarthi")({
  component: Saarthi,
});

interface Msg {
  role: "user" | "model" | "system";
  text: string;
}

type Mode = "hint" | "guidance" | "explanation" | "verification";

const MODE_HINTS: Record<Mode, string> = {
  hint: "Teaching mode: HINT-FIRST. On any academic question, ask the student to think and offer only a small structural hint first — do NOT give the final answer. If they ask for the answer, move to explanation mode only after they showed effort.",
  guidance:
    "Teaching mode: GUIDANCE. Offer a guided path (step 1, 2, 3) with encouragement, leave the student to compute the final step. Do not dump a full worked solution.",
  explanation:
    "Teaching mode: EXPLANATION. Once the student asks for it, give the full correct explanation with the caveat that AI is not the source of truth for academic facts.",
  verification:
    "Teaching mode: VERIFICATION. Help the student check their own work, point out a specific error or confidence gap, and confirm what they got right. Do not re-solve.",
};

const LADDER: Mode[] = ["hint", "guidance", "explanation", "verification"];

const QUICK_PROMPTS: Array<{ label: string; text: string; to: Mode }> = [
  {
    label: "🔍 Find my weak topic",
    text: "Use my performance data to tell me my weakest chapter and give me ONE hint to start repairing it.",
    to: "hint",
  },
  {
    label: "🧭 Plan my next 30 min",
    text: "Plan my next 30 minutes using my weak topic and today's plan. Give me a guided path, not the answer.",
    to: "guidance",
  },
  {
    label: "📘 Explain a concept",
    text: "Explain the concept behind my weakest topic. Give the full teaching explanation and flag anything that isn't verified academic fact.",
    to: "explanation",
  },
  {
    label: "✅ Check my work",
    text: "Help me verify a mistake I keep making. Walk me through how to check my own work.",
    to: "verification",
  },
];

function Saarthi() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "system",
      text: "I'm Saarthi, your context-aware study mentor. I know your target exam, current plan and weak topics — ask anything about a topic, a mistake, or how to revise. I'll teach with hints before answers.",
    },
  ]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("hint");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [context, setContext] = useState("");
  const [contextNote, setContextNote] = useState("");

  useEffect(() => {
    const store = new DataStore();
    const readiness = computeReadiness(store);
    const weak = readiness.weakTopics[0];
    setContextNote(
      (weak
        ? `Weak evidence: ${weak.subject} ${weak.chapter} (${weak.accuracy}%).`
        : "No weak topic evidence yet.") +
        (readiness.today.completedMinutes
          ? ` Today: ${readiness.today.completedMinutes}/${readiness.today.plannedMinutes} min done.`
          : " Today: no plan started."),
    );
    setContext(
      `Target: ${readiness.examTarget}. ` +
        `Attempts: ${readiness.attempts}. Accuracy: ${readiness.accuracy}%. ` +
        (weak
          ? `Weak topic: ${weak.subject} ${weak.chapter} (${weak.accuracy}%).`
          : "No weak topic yet.") +
        (readiness.today.plannedMinutes
          ? ` Today planned: ${readiness.today.plannedMinutes} min, ${readiness.today.completedMinutes} done.`
          : ""),
    );
  }, []);

  function nextMode() {
    setMode((m) => {
      const i = LADDER.indexOf(m);
      return i < LADDER.length - 1 ? (LADDER[i + 1] as Mode) : m;
    });
  }

  function prevMode() {
    setMode((m) => {
      const i = LADDER.indexOf(m);
      return i > 0 ? (LADDER[i - 1] as Mode) : m;
    });
  }

  async function send(textOverride?: string, modeOverride?: Mode) {
    const text = (textOverride ?? input).trim();
    const sendMode = modeOverride ?? mode;
    if (!text || busy) return;
    const user: Msg = { role: "user", text };
    const next = [...messages, user];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");

    try {
      const r = await fetch("/api/public/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next
            .map((m) => ({ role: m.role, text: m.text }))
            .filter((m) => m.role !== "system"),
          studentContext: context,
          systemHint: MODE_HINTS[sendMode],
        }),
      });
      const data = (await r.json().catch(() => null)) as { reply?: string; error?: string };
      if (!r.ok || !data.reply) {
        setError(data?.error ?? "Saarthi is temporarily unavailable — try again in a moment.");
      } else {
        setMessages((prev) => [...prev, { role: "model", text: data.reply as string }]);
      }
    } catch {
      setError("Couldn't reach Saarthi. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col space-y-4">
      <section>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" /> Saarthi
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hint → guidance → explanation → verification.
        </p>
      </section>

      <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
        <section className="rounded-xl border p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" /> Teaching ladder
          </div>
          <div className="mt-2 space-y-1">
            {LADDER.map((m, i) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs capitalize ${
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "border border-input text-muted-foreground"
                }`}
              >
                <span className="mr-1 font-semibold">{i + 1}</span> {m}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-1">
            <button
              onClick={prevMode}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-input px-2 py-1.5 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button
              onClick={nextMode}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-accent px-2 py-1.5 text-xs"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        <section className="rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Your live context
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{contextNote}</p>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            Saarthi is an AI mentor. For academic facts (syllabus, official answer keys, exam rules)
            the app's academic source-of-truth is what counts — don't treat AI text as verified.
          </p>
        </section>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setMode(p.to);
              void send(p.text, p.to);
            }}
            className="rounded-full border border-input px-3 py-1.5 text-xs text-muted-foreground"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border p-4">
        {messages.map((m, i) =>
          m.role === "system" ? (
            <p key={i} className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {m.text}
            </p>
          ) : (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "border bg-background"
              }`}
            >
              {m.text}
            </div>
          ),
        )}
        {busy ? (
          <div className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Saarthi is thinking…
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about a topic, a mistake, or what to revise…"
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send
        </button>
      </div>
    </div>
  );
}
