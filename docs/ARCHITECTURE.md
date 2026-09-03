# NTACBT — Target Architecture

## 1. Non-negotiables

1. **Incremental migration, never a blind rewrite.** `public/jee-cbt.html` stays as the compatibility surface until every feature it owns has a React equivalent behind it.
2. **One academic source of truth.** Official syllabus, verified educators, derived mastery, and AI output are separate layers, never silently mixed.
3. **Exam + academic-year isolation is a first-class domain constraint**, not a tag that can be forgotten.
4. **Explainability is a feature.** Every recommendation, planner task, and suggestion must carry a "why".
5. **No fabricated academic data.** `verificationStatus`, `source`, `sourceUrl`, `lastVerifiedAt` travel with every academic record.

## 2. Layers

```
┌──────────────────────────────────────────────────────────────┐
│  Routes (TanStack Router / TanStack Start)                    │
│  /            → legacy launcher (redirects to /jee-cbt.html) │
│  /app/*       → React feature routes (new)                    │
│  /api/public/* → server-only service routes (existing)         │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│  Feature modules (src/features/)                              │
│  dashboard / planner / studytube / pyq / cbt / analytics /     │
│  focus / saarthi / mistakes / mastery                          │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│  Domain services (src/services/)                              │
│  academic-sot · mastery-engine · planner-engine ·             │
│  mistake-doctor · recommendation · readiness                   │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│  Data layer                                                   │
│  src/features/academics/data/  → official + verified data     │
│  src/features/academics/auth/  → derived + AI data            │
│  src/lib/store.ts              → versioned local persistence  │
│  Supabase (public_tests, planner_imports, test_scores)        │
└───────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│  UI system (src/components/ui + design tokens in styles.css)  │
└──────────────────────────────────────────────────────────────┘
```

## 3. Directory plan (adapted to the existing repo)

```
src/
  features/
    academies-types.ts        # exam/year/subject/chapter/topic contracts
    academics/
      data/
        official/             # official syllabus snapshots (parsed, source-linked)
        verified/             # teachers, institutes, playlists, courses
        derived/              # mastery, weaknesses, recommendations
        ai/                   # AI explanations/hints (tagged as AI-generated)
      academics.ts            # read API + provenance assertions
    planner/
    studytube/
    pyq/
    cbt/
    analytics/
    mistakes/
    mastery/
    focus/
    saarthi/
  components/
    ui/                       # shadcn primitives (existing)
    layout/                   # app shell, bottom nav, sidebar
  services/
    planner-engine.ts
    mastery-engine.ts
    recommendation-engine.ts
    mistake-doctor.ts
    readiness-engine.ts
  lib/
    store.ts                  # versioned localStorage adapter
    error-handling.ts
  routes/
    _app/
      _layout.tsx             # new React app shell (bottom nav / sidebar)
      index.tsx               # Mission Control dashboard
      planner.tsx
      studytube.tsx
      pyq.tsx
      analytics.tsx
      focus.tsx
      saarthi.tsx
```

## 4. Migration strategy

1. **Split data first.** Move inline `JEE_TOPICS` and `AIP_TEACHERS` into generated/bridged modules consumed by both the legacy HTML (via a small build-time inject script) and React. Nothing breaks because the HTML still gets the same arrays at build time.
2. **Route out the shell.** Create `/app` with a React layout and a "feature flag" that lazily mounts the legacy page for features not yet migrated.
3. **Feature-by-feature parity.** Each feature that reaches parity gets a real React route; the legacy route is kept alive for the rest and used as a fallback on any route (e.g. `/app/cbt/*` can embed or redirect to `/jee-cbt.html#...` while the React CBT is incomplete).
4. **Retire the monolith only after all of Route X is behind React + covered by tests.**

## 5. Design system

- Use the existing shadcn/ui primitives and Tailwind v4 tokens in `src/styles.css`.
- Keep a single design language: premium, minimal, mobile-first, dark/light via `.dark`.
- New screens use `Card`, `Badge`, `Tabs`, `Progress`, `Dialog`, `Sheet`; charts via `recharts`.
- Do not introduce a second visual language.

## 6. API conventions (already largely in place)

- Server-only logic in TanStack Start file routes under `src/routes/api/public/*`.
- Never expose private keys to the browser; never trust client-only secrets.
- Every network feature returns: loading / empty / retry / timeout / fallback / useful error.
- AI endpoints are rate-limited and carry an `unverified` note when the source is not official.
