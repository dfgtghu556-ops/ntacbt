/**
 * Keyboard operation of the exam runner.
 *
 * The features are easy; the guards are the point. A keypress that answers,
 * advances or submits in a timed exam is a catastrophic bug, so most of these
 * tests assert that something *does not* happen. Each guard was checked by
 * removing it and watching a test fail.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useExamKeys, type ExamKeyHandlers } from "@/features/exams/use-exam-keys";

/** A tiny host that records what the hook fired. */
function Harness({
  handlers,
  enabled = true,
  optionLabels = ["a", "b", "c", "d"],
  isMcq = true,
  children,
}: {
  handlers: ExamKeyHandlers;
  enabled?: boolean;
  optionLabels?: string[];
  isMcq?: boolean;
  children?: React.ReactNode;
}) {
  useExamKeys(handlers, { enabled, optionLabels, isMcq });
  return <div>{children}</div>;
}

function setup(over: Partial<Parameters<typeof Harness>[0]> = {}) {
  const handlers: ExamKeyHandlers = {
    onSelect: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onSaveAndNext: vi.fn(),
    onMarkReview: vi.fn(),
    onClear: vi.fn(),
  };
  const user = userEvent.setup();
  render(<Harness handlers={handlers} {...over} />);
  return { handlers, user };
}

describe("selecting an option", () => {
  it("selects with A–D", async () => {
    const { handlers, user } = setup();
    await user.keyboard("b");
    expect(handlers.onSelect).toHaveBeenCalledWith("b");
    await user.keyboard("D");
    expect(handlers.onSelect).toHaveBeenCalledWith("d");
  });

  it("selects with 1–4", async () => {
    const { handlers, user } = setup();
    await user.keyboard("3");
    expect(handlers.onSelect).toHaveBeenCalledWith("c");
  });

  it("is case-insensitive, because a student may have caps lock on", async () => {
    const { handlers, user } = setup();
    await user.keyboard("A");
    await user.keyboard("a");
    expect(handlers.onSelect).toHaveBeenCalledTimes(2);
    expect(handlers.onSelect).toHaveBeenCalledWith("a");
  });

  it("ignores a label the question does not have", async () => {
    // A two-option question must not answer "c".
    const { handlers, user } = setup({ optionLabels: ["a", "b"] });
    await user.keyboard("c");
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("ignores 5 on a four-option question", async () => {
    const { handlers, user } = setup();
    await user.keyboard("5");
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("does nothing on an integer question, where A–D mean nothing", async () => {
    const { handlers, user } = setup({ isMcq: false, optionLabels: [] });
    await user.keyboard("a");
    await user.keyboard("2");
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });
});

describe("moving between questions", () => {
  it("moves with the arrow keys", async () => {
    const { handlers, user } = setup();
    await user.keyboard("{ArrowRight}");
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    await user.keyboard("{ArrowLeft}");
    expect(handlers.onPrevious).toHaveBeenCalledTimes(1);
  });

  it("moves with up and down too", async () => {
    const { handlers, user } = setup();
    await user.keyboard("{ArrowDown}");
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    await user.keyboard("{ArrowUp}");
    expect(handlers.onPrevious).toHaveBeenCalledTimes(1);
  });

  it("moves with PageUp and PageDown", async () => {
    const { handlers, user } = setup();
    await user.keyboard("{PageDown}");
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    await user.keyboard("{PageUp}");
    expect(handlers.onPrevious).toHaveBeenCalledTimes(1);
  });

  it("Enter saves and advances", async () => {
    const { handlers, user } = setup();
    await user.keyboard("{Enter}");
    expect(handlers.onSaveAndNext).toHaveBeenCalledTimes(1);
  });

  it("does not machine-gun through the paper when a key is held", () => {
    // `userEvent` does not set `repeat`, so this fires the event the way the
    // browser does when a key is held down. Without the guard, one long press
    // on `m` would mark every question in the paper for review.
    const { handlers } = setup();
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(document, { key: "m", repeat: i > 0 });
    }
    expect(handlers.onMarkReview).toHaveBeenCalledTimes(1);
  });

  it("allows the arrows to repeat, because scrubbing is a real gesture", () => {
    const { handlers } = setup();
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(document, { key: "ArrowRight", repeat: i > 0 });
    }
    expect(handlers.onNext).toHaveBeenCalledTimes(3);
  });

  it("still refuses a held option key, which would answer everything", () => {
    const { handlers } = setup();
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(document, { key: "b", repeat: i > 0 });
    }
    expect(handlers.onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("marking and clearing", () => {
  it("marks for review with M", async () => {
    const { handlers, user } = setup();
    await user.keyboard("m");
    expect(handlers.onMarkReview).toHaveBeenCalledTimes(1);
  });

  it("clears with X, not C — C is an option label", async () => {
    const { handlers, user } = setup();
    await user.keyboard("x");
    expect(handlers.onClear).toHaveBeenCalledTimes(1);
    await user.keyboard("c");
    // "c" selected option c; it must not have cleared.
    expect(handlers.onClear).toHaveBeenCalledTimes(1);
    expect(handlers.onSelect).toHaveBeenCalledWith("c");
  });
});

describe("the guards that make this safe in a timed exam", () => {
  it("does nothing when the exam is not live", async () => {
    // Instructions screen, result screen, or no paper loaded.
    const { handlers, user } = setup({ enabled: false });
    await user.keyboard("a{ArrowRight}{Enter}mx");
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(handlers.onNext).not.toHaveBeenCalled();
    expect(handlers.onSaveAndNext).not.toHaveBeenCalled();
    expect(handlers.onMarkReview).not.toHaveBeenCalled();
    expect(handlers.onClear).not.toHaveBeenCalled();
  });

  it("ignores every key while a dialog is open", async () => {
    // The submit dialog, the leave dialog, or any dialog added later. The guard
    // reads the DOM, so it holds without the dialog opting in.
    const { handlers, user } = setup({
      children: (
        <div role="alertdialog" aria-label="Submit the test?">
          <button type="button">Submit</button>
        </div>
      ),
    });
    await user.keyboard("a{ArrowRight}{Enter}mx");
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(handlers.onNext).not.toHaveBeenCalled();
    expect(handlers.onSaveAndNext).not.toHaveBeenCalled();
    expect(handlers.onMarkReview).not.toHaveBeenCalled();
    expect(handlers.onClear).not.toHaveBeenCalled();
  });

  it("never types into the integer answer field", async () => {
    // The single most damaging mistake available: a student typing "9" into the
    // numeric answer must not also select option B behind it.
    const { handlers, user } = setup({
      isMcq: false,
      optionLabels: [],
      children: <input aria-label="Your answer" type="text" />,
    });
    await user.click(screen.getByLabelText("Your answer"));
    await user.keyboard("9ab{ArrowRight}");
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(handlers.onNext).not.toHaveBeenCalled();
  });

  it("leaves Enter to a focused button rather than hijacking it", async () => {
    // A separate spy for the button, so the click's own activation is
    // distinguishable from anything the shortcut did.
    const clicked = vi.fn();
    const { handlers, user } = setup({
      children: (
        <button type="button" onClick={clicked}>
          Next
        </button>
      ),
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(clicked).toHaveBeenCalledTimes(1);
    clicked.mockClear();

    await user.keyboard("{Enter}");
    // The button activates itself. The shortcut must not also have fired.
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(handlers.onSaveAndNext).not.toHaveBeenCalled();
    expect(handlers.onNext).not.toHaveBeenCalled();
  });

  it("leaves Enter to a focused link", async () => {
    const { handlers, user } = setup({
      children: (
        <a href="#somewhere" onClick={(e) => e.preventDefault()}>
          Palette
        </a>
      ),
    });
    await user.click(screen.getByRole("link", { name: "Palette" }));
    await user.keyboard("{Enter}");
    expect(handlers.onSaveAndNext).not.toHaveBeenCalled();
  });

  it("ignores modified keys, which belong to the browser", async () => {
    const { handlers, user } = setup();
    await user.keyboard("{Control>}a{/Control}");
    await user.keyboard("{Meta>}b{/Meta}");
    await user.keyboard("{Alt>}c{/Alt}");
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(handlers.onMarkReview).not.toHaveBeenCalled();
    expect(handlers.onClear).not.toHaveBeenCalled();
  });

  it("cannot submit the paper — there is no submit handler at all", () => {
    // Submitting stays behind the explicit dialog and its confirmation. The hook
    // has no submit action to call, so no key can reach one.
    const { handlers } = setup();
    expect(Object.keys(handlers)).not.toContain("onSubmit");
    expect(Object.keys(handlers).sort()).toEqual([
      "onClear",
      "onMarkReview",
      "onNext",
      "onPrevious",
      "onSaveAndNext",
      "onSelect",
    ]);
  });

  it("stops listening once disabled, mid-exam", async () => {
    // The paper auto-submits on the timer: the shortcuts must go with it.
    let setEnabled: (v: boolean) => void = () => {};
    const handlers: ExamKeyHandlers = {
      onSelect: vi.fn(),
      onNext: vi.fn(),
      onPrevious: vi.fn(),
      onSaveAndNext: vi.fn(),
      onMarkReview: vi.fn(),
      onClear: vi.fn(),
    };
    function Toggle() {
      const [enabled, setEn] = useState(true);
      setEnabled = setEn;
      useExamKeys(handlers, { enabled, optionLabels: ["a", "b"], isMcq: true });
      return <div />;
    }
    render(<Toggle />);
    const user = userEvent.setup();
    await user.keyboard("a");
    expect(handlers.onSelect).toHaveBeenCalledTimes(1);

    // `act` so React flushes the effect cleanup before the next keypress.
    act(() => setEnabled(false));
    await user.keyboard("a");
    expect(handlers.onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not leak a listener when the component unmounts", async () => {
    const handlers: ExamKeyHandlers = {
      onSelect: vi.fn(),
      onNext: vi.fn(),
      onPrevious: vi.fn(),
      onSaveAndNext: vi.fn(),
      onMarkReview: vi.fn(),
      onClear: vi.fn(),
    };
    const { unmount } = render(<Harness handlers={handlers} />);
    unmount();
    const user = userEvent.setup();
    await user.keyboard("a{ArrowRight}");
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(handlers.onNext).not.toHaveBeenCalled();
  });

  it("keeps working after the handlers change identity", async () => {
    // The route re-creates them every render; the listener must see the new ones.
    const first = vi.fn();
    const second = vi.fn();
    let swap: (() => void) | undefined;
    function Swap() {
      const [which, setWhich] = useState(0);
      swap = () => setWhich((w) => w + 1);
      const handlers: ExamKeyHandlers = {
        onSelect: which === 0 ? first : second,
        onNext: vi.fn(),
        onPrevious: vi.fn(),
        onSaveAndNext: vi.fn(),
        onMarkReview: vi.fn(),
        onClear: vi.fn(),
      };
      useExamKeys(handlers, { enabled: true, optionLabels: ["a"], isMcq: true });
      return <div />;
    }
    render(<Swap />);
    const user = userEvent.setup();
    await user.keyboard("a");
    expect(first).toHaveBeenCalledTimes(1);
    swap?.();
    await user.keyboard("a");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });
});

describe("the legend", () => {
  it("names every shortcut the hook implements", async () => {
    // A legend that omits a shortcut is the folklore problem again.
    const { EXAM_SHORTCUTS } = await import("@/features/exams/use-exam-keys");
    const words = EXAM_SHORTCUTS.map((s) => `${s.keys} ${s.what}`)
      .join(" ")
      .toLowerCase();
    for (const needed of ["choose", "previous", "next", "save", "mark", "clear"]) {
      expect(words, needed).toContain(needed);
    }
  });
});
