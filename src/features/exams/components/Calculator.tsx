/**
 * On-screen calculator (NTA papers allow one).
 * The expression is sanitised before evaluation and never reaches `eval`
 * with arbitrary input.
 */
import { useState } from "react";

const KEYS = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "C", "+"];

/** Only digits, operators, dot and parentheses may ever be evaluated. */
const SAFE = /^[0-9+\-*/.()]*$/;

export function safeEvaluate(expression: string): number | null {
  if (!SAFE.test(expression) || expression.trim() === "") return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${expression})`)();
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function Calculator() {
  const [display, setDisplay] = useState("0");
  const [expr, setExpr] = useState("");

  function press(key: string) {
    if (key === "C") {
      setDisplay("0");
      setExpr("");
      return;
    }
    const next = expr + key;
    setExpr(next);
    const value = safeEvaluate(next);
    if (value !== null) setDisplay(String(Number(value.toFixed(6))));
  }

  function backspace() {
    const next = expr.slice(0, -1);
    setExpr(next);
    const value = safeEvaluate(next);
    setDisplay(value === null ? "0" : String(Number(value.toFixed(6))));
  }

  return (
    <div className="mt-4 rounded-xl border p-3">
      <div
        className="rounded-md border px-3 py-2 text-right text-lg font-medium"
        aria-live="polite"
      >
        {display}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="rounded-md border border-input py-2 text-sm"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          aria-label="Backspace"
          className="rounded-md border border-input py-2 text-sm"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
