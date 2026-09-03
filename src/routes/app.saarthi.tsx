import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
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

  useEffect(() => {
    const store = new DataStore();
    const readiness = computeReadiness(store);
    const weak = readiness.weakTopics[0];
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

  async function send() {
    const text = input.trim();
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
          systemHint: MODE_HINTS[mode],
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

      <div className="flex flex-wrap gap-2">
        {(Object.keys(MODE_HINTS) as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium capitalize ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "border border-input text-muted-foreground"
            }`}
          >
            {m}
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
          onClick={send}
          disabled={busy || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send
        </button>
      </div>
    </div>
  );
}
