/**
 * Subject coercion, in one place.
 *
 * The three subjects are a closed set (`SUBJECTS` in `academics/types.ts`), so
 * anything unrecognised has to fall back somewhere. It falls back to
 * Mathematics because that is the only subject whose canonical name is
 * unambiguous across the JEE and CBSE catalogs — "Maths" and "Mathematics" both
 * appear in the legacy data, and neither collides with a physics/chemistry
 * alias.
 *
 * This existed as a copy in `app.tests.tsx` and `app.pyq.tsx`; a third copy in
 * the Study Theater is what made it worth extracting.
 */

import type { Subject } from "./types";

export function toSubject(value: string | undefined | null): Subject {
  if (value === "Physics") return "Physics";
  if (value === "Chemistry") return "Chemistry";
  return "Mathematics";
}

/** True when the string is exactly one of the three canonical subject names. */
export function isSubject(value: unknown): value is Subject {
  return value === "Physics" || value === "Chemistry" || value === "Mathematics";
}
