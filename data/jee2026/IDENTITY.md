# JEE Main 2026 — user PDF identity map (from OCR of each paper's page-1 header)

All 19 files under `data/jee2026/` are "Question Paper with Solutions"
PDFs for JEE (Main) 2026 Session-1. Identity was OCR'd directly from each
paper's own title block — no guessing.

## January 2026 Session-1 (10 papers)

| File (prefix)        | Paper              |
| -------------------- | ------------------ |
| X0dVBbZomUVsyDED1JZx | 21 January 2026 S1 |
| hzPlYFzdqkFPaQIgWcBN | 21 January 2026 S2 |
| BPD4dLYdvGj7xm8cDL66 | 22 January 2026 S1 |
| EtBWnJs3E0PPblHCTwq2 | 22 January 2026 S2 |
| 75UG8OUubPYvBFELOMtO | 23 January 2026 S1 |
| OV8iq7inKceolGYsbYCn | 23 January 2026 S2 |
| sbYuHEX7JdgSJ5l1liBf | 24 January 2026 S1 |
| RfF8KJW24khYaqoVbSjO | 24 January 2026 S2 |
| cEDaK5Wn5ILe4nOdotd6 | 28 January 2026 S1 |
| GZhYQcqGs7JdWcFJlYCQ | 28 January 2026 S2 |

## April 2026 Session-1 (9 papers)

| File (prefix)        | Paper            |
| -------------------- | ---------------- |
| vjbspTs09FPcGY3xbonJ | 02 April 2026 S1 |
| qi62GA4EorhhC40ZKWzq | 02 April 2026 S2 |
| 5Vhxm2G5vqu3EYX1Vs0a | 04 April 2026 S1 |
| uw8LHJQzwX36Pxa5GFEA | 04 April 2026 S2 |
| v2Bl3Hd2dHXr4yGJGFMs | 05 April 2026 S1 |
| wn5Es1sxkATmuDcSPsxA | 05 April 2026 S2 |
| aG4gsIczmgvS9AXfC0RN | 06 April 2026 S1 |
| 2i7F6SsQOGUlrHyYx6V1 | 06 April 2026 S2 |
| zSsCaG617CetJiuFdYdi | 08 April 2026 S2 |

## Dedup vs. existing baked Samkarya coverage

Samkarya source-2 already bakes: `2026_02April s1`, `2026_02April s2`,
`2026_04April s1`. So 3 of the user's April papers duplicate existing
coverage and should be skipped when transcribing:

- vjbspTs09FPcGY3xbonJ (02 Apr S1) → existing `2026_02April s1`
- qi62GA4EorhhC40ZKWzq (02 Apr S2) → existing `2026_02April s2`
- 5Vhxm2G5vqu3EYX1Vs0a (04 Apr S1) → existing `2026_04April s1`

Net NEW papers to transcribe: **16** (10 Jan + 6 April: 04-S2, 05-S1,
05-S2, 06-S1, 06-S2, 08-S2).
