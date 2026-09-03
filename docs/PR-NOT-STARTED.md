# PR status: NOT started

User asked for a full site-wide UI/UX debug, but explicitly said **do NOT generate a PR yet**.
Wait for user confirmation after verifying on the live preview.

## What was changed in this round (not yet PR'd; already pushed to branch so live preview reflects it)
- StudyTube (orange `/jee-cbt.html`): real YouTube-style sliding shelves (horizontal snap carousels on mobile), global swipe navigation disabled while inside the StudyTube hub so horizontal shelf/sidebar scrolls smoothly instead of fighting the page swipe.
- Practice (orange `/jee-cbt.html`): empty question bank now auto-loads a baked 2026 JEE Main PYQ paper and refreshes the section; no more empty/blank Practice page. A manual "Load a 2026 PYQ paper" button remains as fallback.
- Dashboard (orange `/jee-cbt.html`): added a one-glance quick-launcher grid (StudyTube / PYQ / Practice / AI Planner) right under the hero.
- AI Planner (orange `/jee-cbt.html`): added a 7-step visual stepper (Exam → Chapters → Dream Team → Dream Teacher → Days & depth → Budget → Study style) so it's clear where you are in the wizard.

## Validation (this round)
- HTML inline-script syntax check: ok
- `npm run build`: ok
- `npm test`: 112 passed / 0 failed
- `npx tsc --noEmit`: ok

## User's checklist before I open a PR
1. Orange website opens by default (`/` -> `/jee-cbt.html`), orange color intact.
2. StudyTube horizontal/sidebar sliding feels smooth (no page jumping).
3. Practice section shows questions instead of "kuch nahi".
4. Dashboard feels improved (quick actions visible).
5. AI Planner shows the step indicator.
6. Opening/closing modals, swipe nav, and every route/feature works.
