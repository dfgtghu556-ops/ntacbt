/**
 * Keyboard operation of the exam runner.
 *
 * Real JEE Main is keyboard-driven: you pick an option with A–D, move with the
 * arrow keys, and save-and-next with Enter. A student who practises here with a
 * mouse sits the actual exam with a keyboard, so the muscle memory built in this
 * app does not transfer. It is also the accessibility gap with the largest blast
 * radius — the timed, high-stakes surface is the one place a keyboard-only or
 * motor-impaired user is slowest.
 *
 * **This hook's guards matter more than its features.** A stray keypress that
 * answers a question, advances the paper, or submits it is a catastrophic bug in
 * a timed exam, so every shortcut is refused unless all of these hold:
 *
 *   1. The exam is live. Not on the instructions or the result screen.
 *   2. No modifier key is down. Ctrl/Meta/Alt combos belong to the browser.
 *   3. No dialog is open. Checked in the DOM rather than through a prop, so a
 *      dialog added later cannot forget to opt in.
 *   4. Focus is not in a text field, so typing an integer answer never answers
 *      the question behind it.
 *   5. Enter and Space are left alone when a control has focus, so native
 *      button and link activation always wins.
 *
 * Nothing here can submit the paper. Submitting stays behind the explicit dialog
 * and its own confirmation, exactly as before.
 */

import { useEffect, useRef } from "react";

export interface ExamKeyHandlers {
  /** Select an option by label, e.g. `"a"`. Ignored for a non-MCQ question. */
  onSelect: (label: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  /** Save the current answer and advance — the NTA Enter behaviour. */
  onSaveAndNext: () => void;
  onMarkReview: () => void;
  onClear: () => void;
}

export interface ExamKeyOptions {
  /** False on the instructions and result screens, and before a paper loads. */
  enabled: boolean;
  /** The labels available on this question, e.g. `["a","b","c","d"]`. */
  optionLabels: string[];
  /** Whether the current question accepts a chosen option at all. */
  isMcq: boolean;
}

/**
 * The event's target as an `Element`, or null.
 *
 * A keydown can target `document` or `window` — which is the *common* case,
 * because nothing is focused at the start of a paper. Neither has a `tagName`,
 * so reading one throws. Every guard below goes through this rather than
 * trusting the target is an element.
 */
function asElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

/** Keys that mean "the user is typing", so nothing is intercepted. */
function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

/** Keys that activate a control, so the browser's own behaviour wins. */
function isActivatableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "button" || tag === "a" || tag === "summary";
}

/**
 * True when a modal is on screen.
 *
 * Read from the DOM on every keypress rather than threaded through as a prop:
 * the cost is one `querySelector`, and the benefit is that the guard cannot be
 * forgotten when someone adds a dialog — which is the whole point of it.
 */
function aDialogIsOpen(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.querySelector('[role="dialog"], [role="alertdialog"], [data-state="open"]') !== null
  );
}

/** Map a digit to the option it selects, so `1` means the first option. */
function digitToLabel(digit: string, labels: string[]): string | null {
  const i = Number(digit) - 1;
  return labels[i] ?? null;
}

export function useExamKeys(
  handlers: ExamKeyHandlers,
  { enabled, optionLabels, isMcq }: ExamKeyOptions,
): void {
  // The route re-creates these on every render, so they are read through a ref:
  // the listener is attached once rather than re-bound on every keystroke.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Holding a key down must not machine-gun through the paper. The arrows
      // are allowed to repeat because scrubbing the palette is a real gesture.
      if (
        event.repeat &&
        event.key !== "ArrowRight" &&
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowUp" &&
        event.key !== "ArrowDown"
      ) {
        return;
      }
      if (aDialogIsOpen()) return;

      const target = asElement(event.target);
      const key = event.key;

      // Typing an integer answer must never answer the question behind it.
      if (isTypingTarget(target)) return;

      const lower = key.length === 1 ? key.toLowerCase() : key;

      // Option selection: 1–4 or A–D, on a question that has options.
      if (isMcq) {
        if (/^[1-4]$/.test(key)) {
          const label = digitToLabel(key, optionLabels);
          if (label) {
            event.preventDefault();
            latest.current.onSelect(label);
            return;
          }
        }
        if (/^[a-z]$/.test(lower)) {
          const idx = lower.charCodeAt(0) - 97; // 'a' -> 0
          const label = optionLabels[idx];
          if (label) {
            event.preventDefault();
            latest.current.onSelect(label);
            return;
          }
        }
      }

      switch (key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
          event.preventDefault();
          latest.current.onNext();
          return;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          event.preventDefault();
          latest.current.onPrevious();
          return;
        case "Enter":
        case " ":
          // Let a focused button or link handle its own activation.
          if (isActivatableTarget(target)) return;
          event.preventDefault();
          latest.current.onSaveAndNext();
          return;
        default:
          break;
      }

      if (lower === "m") {
        event.preventDefault();
        latest.current.onMarkReview();
        return;
      }
      // `x`, not `c`: `c` is an option label on every four-option question.
      if (lower === "x") {
        event.preventDefault();
        latest.current.onClear();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, optionLabels, isMcq]);
}

/** The shortcuts, for the legend shown to the student. */
export const EXAM_SHORTCUTS: ReadonlyArray<{ keys: string; what: string }> = [
  { keys: "A–D or 1–4", what: "Choose an option" },
  { keys: "← →", what: "Previous / next question" },
  { keys: "Enter", what: "Save and go to the next question" },
  { keys: "M", what: "Mark for review" },
  { keys: "X", what: "Clear your response" },
];
