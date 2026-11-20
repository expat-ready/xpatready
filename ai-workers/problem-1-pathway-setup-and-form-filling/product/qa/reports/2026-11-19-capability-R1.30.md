# qa 9 — capability R1.30 (lead lists, filters and board)

qa 9 (front office and platform, cloud lane), at Lead B (7)'s split (R1.30 walked with R1.31). Main under test: **133f70d9d** (FO-4 part 2a-ii #2279, native drag, merged). Opus 5.5, high. Live AI off, US$0, no priced button.

## Verdict: **Partial** (all named parts merged; Works refused)
Fresh Opus reader (high effort, read only, ran nothing; ~70% confident): Partial. qa agrees.

| Clause | On main |
|---|---|
| Filter by owner | By screens: Leads (All open) and the prospects List |
| Filter by date | By screens: Leads by arrival day (walked); List by engaged day (built, checked by API only) |
| Filter by stage | By screens: the prospects List (leads have no stage) |
| Filter by source | Leads only (FO-4sf, 34/34). **Not on the prospects List or board; `?source=` silently ignored (QA-533)** |
| Board moves by drag | Native drag-and-drop at 1440, 1024 and 400 px: stage, one PERSON move, audit and timeline line read back; Won drop refused in words; Lost drop asks why first; no key, no drag |
| Board moves by keyboard | Move to… (Enter, ArrowDown, Enter), still beside drag |
| 400, 1024, 1440 px | Board at 400 exactly (drag); List and Leads no-sideways-scroll checked at 375, 1024, 1440 |

## Runs
- `tests/journeys/j_30.ts`: **47/47 twice** on fresh isolated copies (`2026-11-19-capability-R1.30/j30-run{1,2}-mine.txt`).
- `tests/check_fo4sf_source_filter.ts`: **34/34** (`…/fo4sf-mine.txt`).
- walks.yml `j_30` twice on main: asked of Lead 94 on #2296, not yet run.

## Gate A
The walk ends at the won card in the Won column: it passes through R1.31's first step (Won refused, Convert). The case side's next step (FO-8 #2255) is not merged.

## Findings
0 Blocker · 0 Critical · 1 Major · 0 Minor. New: **QA-533** (Gap, Major, or Minor if the Lead rules that source filters Leads only).

## Questions for the Lead
1. QA-533: is the source filter on Leads enough for row 30, or must the prospects List filter by source too (AG-2-23 says "board/list")?

## Suggestions
- j_30 should walk the List's engaged-day filter by screens, and Leads and the List at exactly 400 px (today 375). (*Needed for the proof*, *Scaffolding*)
