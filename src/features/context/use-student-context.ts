/**
 * React binding for StudentContext.
 *
 * Uses `useSyncExternalStore` over a module-level singleton so every surface
 * reads the *same* context in the same render pass — which is the whole point.
 * SSR-safe: the server render returns the shipped default, then the client
 * hydrates from storage on its first `getSnapshot()` call.
 *
 * Two tabs are kept in step via the `storage` event, so a student who changes
 * their goal on their phone does not keep seeing the old one on their laptop.
 */
import { useCallback, useSyncExternalStore } from "react";
import {
  clearStudentContext,
  loadStudentContext,
  normalizeContext,
  saveStudentContext,
  type StudentContext,
} from "./student-context";
import { setLang } from "@/lib/lang";
import { STORAGE_KEYS } from "@/config/constants";

/**
 * `null` means "not read from storage yet". Hydration is lazy so that storage
 * written before the first render — by another tab, or by a seeding pass — is
 * always seen. `useSyncExternalStore` requires a stable reference, so this is
 * hydrated exactly once and only replaced by an explicit mutation.
 */
let current: StudentContext | null = null;
const listeners = new Set<() => void>();

function hydrate(): StudentContext {
  if (current === null) current = loadStudentContext();
  return current;
}

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Keep this tab in step with a context written by another tab. The legacy key is
 * watched too because a change there can change what `seedFromLegacy` returns.
 */
if (typeof window !== "undefined") {
  const watched = new Set<string>([STORAGE_KEYS.STUDENT, STORAGE_KEYS.LEGACY_STATE]);
  window.addEventListener("storage", (event) => {
    if (event.key !== null && !watched.has(event.key)) return;
    current = loadStudentContext();
    emit();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StudentContext {
  return hydrate();
}

/** Server render must not read storage. */
function getServerSnapshot(): StudentContext {
  return normalizeContext(null);
}

export function useStudentContext(): StudentContext {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export interface StudentContextActions {
  /** Replace the whole context (validated + persisted). */
  set: (patch: Partial<StudentContext>) => void;
  /** Change only the goal, keeping the class level and syllabus year in step. */
  setGoal: (goal: StudentContext["goal"]) => void;
  setInstitute: (institute: string | null) => void;
  toggleTeacher: (teacherId: string) => void;
  toggleSubject: (subject: StudentContext["subjects"][number]) => void;
  setLangPref: (lang: StudentContext["lang"]) => void;
  setGoals: (patch: Partial<StudentContext["goals"]>) => void;
  reset: () => void;
}

export function useStudentContextActions(): StudentContextActions {
  const update = useCallback((patch: Partial<StudentContext>) => {
    const base = current ?? loadStudentContext();
    current = saveStudentContext({ ...base, ...patch });
    // Language is shared with the global toggle; keep the two in step.
    if (patch.lang) setLang(patch.lang);
    emit();
  }, []);

  const setGoal = useCallback((goal: StudentContext["goal"]) => {
    const base = current ?? loadStudentContext();
    // Changing the goal moves the class level and the syllabus year with it,
    // so a Class 12 board student can never end up on a Class 11 scope.
    const next = normalizeContext({
      ...base,
      goal,
      classLevel: goal === "cbse-11" ? 11 : 12,
      syllabusYear: goal === "cbse-11" || goal === "cbse-12" ? "2026-27" : "2025-26",
    });
    current = saveStudentContext(next);
    emit();
  }, []);

  const setInstitute = useCallback((institute: string | null) => {
    const base = current ?? loadStudentContext();
    current = saveStudentContext({ ...base, institute });
    emit();
  }, []);

  const toggleTeacher = useCallback((teacherId: string) => {
    const base = current ?? loadStudentContext();
    const has = base.teachers.includes(teacherId);
    const teachers = has
      ? base.teachers.filter((t) => t !== teacherId)
      : [...base.teachers, teacherId].slice(0, 12);
    current = saveStudentContext({ ...base, teachers });
    emit();
  }, []);

  const toggleSubject = useCallback((subject: StudentContext["subjects"][number]) => {
    const base = current ?? loadStudentContext();
    const has = base.subjects.includes(subject);
    // Never allow an empty subject list — the product teaches three subjects.
    const subjects = has
      ? base.subjects.length > 1
        ? base.subjects.filter((s) => s !== subject)
        : base.subjects
      : [...new Set([...base.subjects, subject])];
    current = saveStudentContext({ ...base, subjects });
    emit();
  }, []);

  const setLangPref = useCallback((lang: StudentContext["lang"]) => {
    const base = current ?? loadStudentContext();
    current = saveStudentContext({ ...base, lang });
    setLang(lang);
    emit();
  }, []);

  const setGoals = useCallback((patch: Partial<StudentContext["goals"]>) => {
    const base = current ?? loadStudentContext();
    current = saveStudentContext({ ...base, goals: { ...base.goals, ...patch } });
    emit();
  }, []);

  const reset = useCallback(() => {
    clearStudentContext();
    current = loadStudentContext();
    emit();
  }, []);

  return {
    set: update,
    setGoal,
    setInstitute,
    toggleTeacher,
    toggleSubject,
    setLangPref,
    setGoals,
    reset,
  };
}
