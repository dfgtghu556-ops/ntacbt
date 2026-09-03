# NTACBT — Data Governance & Source-of-Truth Rules

## 1. Data categories (never silently mixed)

| Category | Definition | Examples | Trust rule |
|---|---|---|---|
| **Official data** | Published by CBSE/NTA/government. | syllabus, exam pattern, marking scheme, sample papers | Use official source; do not paraphrase. Keep `sourceUrl`. |
| **Verified educational data** | Human-curated, fact-checked. | faculty, channels, playlists, courses | Needs `verificationStatus`, `verifiedAt`, `source`. |
| **Derived data** | Computed by the app from student evidence. | mastery, weakness, readiness, recommendation | Never presented as official fact; show the evidence. |
| **AI-generated data** | Model output. | hints, explanations, strategies | Tag as AI; never an authoritative answer by itself. |

## 2. Mandatory metadata per academic record

Every syllabus/chapter/topic record must carry:
- `exam` (e.g. `"JEE Main"`, `"JEE Advanced"`, `"CBSE Class 12"`)
- `classLevel` (e.g. `11`, `12`)
- `subject` (`Physics`, `Chemistry`, `Mathematics`)
- `chapter`, `topic`
- `academicYear` (e.g. `"2026-27"`, `"2025-26"`)
- `source` + `sourceUrl` + `sourceType` (`official_pdf` | `nta_bulletin` | `cbse_curriculum` | `verified_curated` | `derived` | `ai`)
- `verificationStatus` (`verified` | `provisional` | `unverified`)
- `verifiedAt` (ISO timestamp when last verified)

## 3. Exam & year isolation

`JEE Main 2026` and `CBSE Class 12 2026-27` must never share a chapter list by accident. Rules:

1. Every dataset is scoped by `exam + academicYear`.
2. Lookups always pass an explicit `ExamScope`:
   ```ts
   type ExamScope = { exam: "JEE_MAIN" | "JEE_ADVANCED" | "CBSE_11" | "CBSE_12"; academicYear: string };
   ```
3. A chapter that exists for JEE but not CBSE (or vice-versa) is simply not returned in the other scope — nothing silently "borrows" it.
4. Planner/StudyTube/analytics/recommendation services receive one scope at a time.

## 4. Current repo status

- ✅ `src/data/syllabus.ts` carries official NTA provenance for JEE Main 2026.
- ✅ `src/data/teachers.ts` carries verified institute/teacher records with subject + exam target + channel mapping.
- ⚠️ `public/jee-cbt.html` carries inline legacy copies of `JEE_TOPICS` and `AIP_TEACHERS` **without** per-record source/verification fields.
- ⚠️ PYQ records are derived from a public third-party dataset; per-question `verificationStatus` is not yet stored.
- ❌ No shared `ExamScope` / provenance type is enforced at runtime.

## 5. Validation rules to automate (increasingly strict)

1. Every syllabus/teacher record has non-empty `subject`, `classLevel`, `exam`, `academicYear`, `source`, `verificationStatus`.
2. No chapter appears in a class/exam scope it doesn't belong to.
3. Every PYQ has `exam`, `year`, `subject`, `chapter`, `answer`, `solution`, `verificationStatus`. Integer questions have a bounded accept rule when the NTA key is a range.
4. Duplicate PYQ detection by normalized question hash.
5. Unavailable/empty video metadata is reported, not silently shown as success.
6. Malformed/incomplete datasets fail the build or produce a visible warning.

## 6. Storage strategy

- Official + verified data: checked into `src/features/academics/data/`, source-linked, versioned.
- Derived data: versioned client store (`src/lib/store.ts`) with a `schemaVersion` + migration hooks.
- AI data: never persisted as authority; stored with `source: "ai"` and shown with uncertainty language.
