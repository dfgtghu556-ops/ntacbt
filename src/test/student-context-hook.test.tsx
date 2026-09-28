import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/config/constants";
import type { StudentContext, StudentContextActions } from "@/features/context";

/**
 * The React binding is what actually stops the leakage: a single module-level
 * store means every surface renders from the *same* context in the same pass.
 * These tests exercise it through React, not just as pure functions.
 *
 * The store is a module singleton by design, so each case gets a fresh module
 * instance via `vi.resetModules()` — otherwise one test's goal would leak into
 * the next, which is exactly the bug class under test.
 */
async function freshStore() {
  vi.resetModules();
  return import("@/features/context");
}

beforeEach(() => {
  localStorage.clear();
});

describe("useStudentContext", () => {
  it("returns the persisted context, not the shipped default", async () => {
    localStorage.setItem(
      STORAGE_KEYS.STUDENT,
      JSON.stringify({ goal: "cbse-11", subjects: ["Physics"] }),
    );
    const mod = await freshStore();
    const { result } = renderHook(() => mod.useStudentContext());
    expect(result.current.goal).toBe("cbse-11");
    expect(result.current.classLevel).toBe(11);
    expect(result.current.subjects).toEqual(["Physics"]);
  });

  it("re-renders every subscriber when the context changes", async () => {
    const mod = await freshStore();
    const first = renderHook(() => mod.useStudentContext());
    const second = renderHook(() => mod.useStudentContext());
    const actions = renderHook(() => mod.useStudentContextActions());
    expect(first.result.current.goal).toBe("jee-main");

    act(() => actions.result.current.setGoal("cbse-12"));

    expect(second.result.current.goal).toBe("cbse-12");
    expect(first.result.current.goal).toBe("cbse-12");
  });

  it("persists through the actions so the next mount agrees", async () => {
    const mod = await freshStore();
    const { result } = renderHook(() => ({
      ctx: mod.useStudentContext(),
      actions: mod.useStudentContextActions(),
    }));

    act(() => result.current.actions.setGoal("cbse-12"));

    expect(mod.loadStudentContext().goal).toBe("cbse-12");
    expect(mod.studyTubeTarget(mod.loadStudentContext())).toBe("board12");
    expect(mod.studyTubeTarget(mod.loadStudentContext())).not.toBe("jeemain");
  });

  it("moves the class level with the goal, never the other way round", async () => {
    const mod = await freshStore();
    const { result } = renderHook(() => ({
      ctx: mod.useStudentContext(),
      actions: mod.useStudentContextActions(),
    }));

    act(() => result.current.actions.setGoal("cbse-11"));
    expect(result.current.ctx.classLevel).toBe(11);
    expect(result.current.ctx.syllabusYear).toBe("2026-27");

    act(() => result.current.actions.setGoal("jee-advanced"));
    expect(result.current.ctx.classLevel).toBe(12);
    expect(result.current.ctx.syllabusYear).toBe("2025-26");
  });

  it("keeps the language toggle and the context in step", async () => {
    const mod = await freshStore();
    const { result } = renderHook(() => ({
      ctx: mod.useStudentContext(),
      actions: mod.useStudentContextActions(),
    }));

    act(() => result.current.actions.setLangPref("hi"));

    expect(result.current.ctx.lang).toBe("hi");
    // The global toggle must not be left behind — that is the same class of bug.
    expect(mod.loadStudentContext().lang).toBe("hi");
  });

  it("toggles a subject but never empties the list", async () => {
    const mod = await freshStore();
    const { result } = renderHook(() => ({
      ctx: mod.useStudentContext(),
      actions: mod.useStudentContextActions(),
    }));

    act(() => result.current.actions.toggleSubject("Physics"));
    expect(result.current.ctx.subjects).not.toContain("Physics");
    expect(result.current.ctx.subjects).toEqual(["Chemistry", "Mathematics"]);

    // Removing the last one would leave nothing to teach.
    act(() => result.current.actions.toggleSubject("Chemistry"));
    act(() => result.current.actions.toggleSubject("Mathematics"));
    expect(result.current.ctx.subjects.length).toBeGreaterThan(0);
  });

  it("toggles teachers on and off, and caps the list at twelve", async () => {
    const mod = await freshStore();
    const { result } = renderHook(() => ({
      ctx: mod.useStudentContext(),
      actions: mod.useStudentContextActions(),
    }));

    act(() => {
      for (const id of ["a", "b", "c"]) result.current.actions.toggleTeacher(id);
    });
    expect(result.current.ctx.teachers).toEqual(["a", "b", "c"]);

    act(() => result.current.actions.toggleTeacher("b"));
    expect(result.current.ctx.teachers).toEqual(["a", "c"]);

    act(() => {
      for (let i = 0; i < 20; i += 1) result.current.actions.toggleTeacher(`t${i}`);
    });
    expect(result.current.ctx.teachers).toHaveLength(12);
  });

  it("reset() clears storage and returns to the seeded default", async () => {
    const mod = await freshStore();
    const { result } = renderHook(() => ({
      ctx: mod.useStudentContext(),
      actions: mod.useStudentContextActions(),
    }));

    act(() => result.current.actions.setGoal("cbse-12"));
    act(() => result.current.actions.reset());

    expect(result.current.ctx.goal).toBe("jee-main");
    expect(localStorage.getItem(STORAGE_KEYS.STUDENT)).toBeNull();
  });

  it("set() validates a patch rather than trusting it", async () => {
    const mod = await freshStore();
    const { result } = renderHook(() => ({
      ctx: mod.useStudentContext(),
      actions: mod.useStudentContextActions(),
    }));

    act(() => result.current.actions.set({ goal: "not-a-goal" } as never));

    expect(result.current.ctx.goal).toBe("jee-main");
    expect(mod.loadStudentContext().goal).toBe("jee-main");
  });

  it("survives a corrupt stored blob", async () => {
    localStorage.setItem(STORAGE_KEYS.STUDENT, "{{{");
    const mod = await freshStore();
    const { result } = renderHook(() => mod.useStudentContext());
    expect(result.current.goal).toBe("jee-main");
  });

  it("sees storage written by another tab while mounted", async () => {
    const mod = await freshStore();
    const { result } = renderHook(() => mod.useStudentContext());
    expect(result.current.goal).toBe("jee-main");

    act(() => {
      localStorage.setItem(
        STORAGE_KEYS.STUDENT,
        JSON.stringify({ goal: "cbse-11", subjects: ["Physics"] }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEYS.STUDENT, newValue: "x" }),
      );
    });

    expect(result.current.goal).toBe("cbse-11");
  });

  it("ignores a storage event for an unrelated key", async () => {
    const mod = await freshStore();
    const { result } = renderHook(() => mod.useStudentContext());

    act(() => {
      localStorage.setItem(STORAGE_KEYS.STUDENT, JSON.stringify({ goal: "cbse-11" }));
      window.dispatchEvent(new StorageEvent("storage", { key: "some.other.key" }));
    });

    expect(result.current.goal).toBe("jee-main");
  });

  it("exposes a typed action surface", async () => {
    const mod = await freshStore();
    const { result } = renderHook(() => mod.useStudentContextActions());
    const keys: Array<keyof StudentContextActions> = [
      "set",
      "setGoal",
      "setInstitute",
      "toggleTeacher",
      "toggleSubject",
      "setLangPref",
      "setGoals",
      "reset",
    ];
    for (const key of keys) expect(typeof result.current[key]).toBe("function");
    // The context itself carries no action methods.
    const ctx: StudentContext = mod.normalizeContext(null);
    expect(Object.keys(ctx)).not.toContain("set");
  });
});
