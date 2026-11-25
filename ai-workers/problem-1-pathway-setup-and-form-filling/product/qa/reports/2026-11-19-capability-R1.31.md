# qa 9 — capability R1.31 (stage kinds; won by signature; totals per currency)

qa 9 (front office and platform, cloud lane, alongside qa 7). Main under test: **67ae91df2** (FO-4 part 2a #2251 merged 12:34 UTC; nothing under `studio/` changed up to c6a502512). Opus 5.5, high. Live AI off, US$0, no priced button. QA numbers for qa 9: QA-530 to QA-539.

## Verdict: **Partial** (all named parts merged; Works refused)
Fresh Opus reader (high effort, read only, ran nothing; ~85% confident): Partial. qa agrees.

| Done-when clause | On main | How shown |
|---|---|---|
| A person's move into Won refused | Met | By screens: Move to… never offers Won (keyboard too); API 422 WON_BY_EVENT (`sales/prospects.ts:212`) |
| Convert → Won | Met | By screens: yes/no with warning, Won by CONVERT, Undo needs a reason, Undo refused once a retainer is signed (409) |
| Signed offline → Won | API only | `retainers/routes.ts:66`; no retainer screen; J-30 makes the retainer with SQL (QA-531) |
| A signature (e-sign) → Won | Not built | `E_SIGNED` never written; FO-6 not merged (QA-531) |
| Totals per currency, never mixed | Logic met, unreachable | `board-totals.ts` groups by currency; nobody can enter a value (QA-530) |

## Runs
- `tests/journeys/j_31.ts` (imports J-30's walk): **39/39 twice** on fresh isolated copies (`2026-11-19-capability-R1.31/j31-run{1,2}-mine.txt`).
- `tests/check_fo2p3_prospects.ts`: **44/44** (`…/fo2p3-mine.txt`).
- GitHub: ci **44515431994** green (merge-queue batch checking #2251 + #2247 together on 89c0d96).
- walks.yml `j_31` twice on main (P-339): **asked of Lead 94 on #2296, not yet run.** Not needed for a Partial; needed before any Works.

## Gate A by screens
`tests/qa/check_r131_gate_a_value.ts` (new, qa's own; fails today **1/6**): the Owner engages a lead by screens; the prospect shows Value "Not set" with no field or Edit; PATCH and PUT on the prospect answer 404; the board reads "Open prospects by value: no values yet" at 400, 1024 and 1440 px (`r131-board-*.png`, `r131-prospect-1440.png`). J-31's own green totals step sets values with SQL (`j_30.ts:138`). The walk does reach a won prospect in the Won column with no Move to… (next step: the case side's "Open a case?", FO-8 #2255, not merged), but only through Convert by screens; the signature doors need SQL rows.

## Findings
0 Blocker · 0 Critical · 2 Major · 0 Minor. New: **QA-530** (Gap, Major: no way to set a prospect's value or currency; the reader said Critical, qa keeps Major because nothing gives a wrong result: a part is missing), **QA-531** (Gap, Major: e-signature door not built, Signed offline API only; row-parts question).

## Rulings since (19 Nov, Lead B (7) for Lead 95)
- **QA-531 is out of R1.31's scope (P-741):** Convert by screen and Signed offline by API prove the stage rule. FO-6 and FO-5s prove their doors in their own J-tests.
- **QA-530 stays in R1.31:** its fix is FO-2pv (PATCH prospects/:id {value, currency}, a Value row, J-31 through the screen), now building. R1.31 is re-proved together with R1.30 after it merges, and `tests/qa/check_r131_gate_a_value.ts` should then pass.

## Questions for the Lead (answered above)
1. QA-531: should row 31's parts name FO-5's retainer screens and FO-6, or should the founder narrow the Done when for Release 1? Not settled here.
2. QA-530: which part owns the value field? It is in AG-2-2, and no FO-4 row names it.

## Suggestions
- J-30 sets its totals and retainers with SQL, so a green J-31 overstates what a person can do. When QA-530 and QA-531 are built, those steps should use screens. (*Needed for the proof*, *Capability*)

## Not tested
axe on the prospect screen in qa's own walk (J-30 runs axe on the board, the List and Mark lost); 200% zoom.
