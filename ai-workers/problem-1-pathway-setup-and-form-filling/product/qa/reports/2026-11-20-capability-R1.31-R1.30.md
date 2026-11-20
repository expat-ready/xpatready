# qa 9 — R1.31 and R1.30 re-proved together after FO-2pv (Lead B's ruling)

qa 9 (front office and platform, cloud lane). Main under test: **54ba0cce3** (FO-2pv #2323 merged 23:51 UTC 19 Nov). Opus 5.5, high. Live AI off, US$0, no priced button.

## R1.31: **Works on condition**, so the row stays **Partial** until P-339's runs exist
The fresh Opus reader (high effort, read only; ~85% confident) gives **Works**, once the independent re-run is green. The pack run is the automatic item-proof **44641146727** on 54ba0cce3: PASS, journey j_31 (P-728 (3)). The independent re-run is walks.yml `j_31` on main, asked of Lead 98 on #2296.
- **Totals per currency, never mixed: by screens.**
  - `tests/qa/check_r131_gate_a_value.ts` **6/6 twice.** It failed 1/6 on 19 Nov. A person types 5000 on the prospect's Value panel; 500000 USD is stored; the board's open totals read "USD 5,000" at 400, 1024 and 1440 px.
  - j_31 / J-30 **55/55 twice:** values set by screens (keyboard, decimals, the firm's default currency); CAD 6,200 · USD 3,000 side by side, never summed.
- **Only Convert or Signed offline reach Won (P-741):**
  - Convert works by screens. Signed offline works by API.
  - A person's move into Won is refused: 422, not offered by Move to…, a drag onto Won refused in words, a Won card not draggable.
- `check_fo2pv_prospect_value.ts`: 26/26.
- **Closed:** QA-530 (fixed by FO-2pv, retested) and QA-531 (out of scope, P-741).
- Reader's Minor note: no API test that a move *out of* Won is refused (only the screen path). Not a row.

## R1.30: **Partial** (Works refused). Its records go in their own PR (Lead 98: one records PR per item)
The fresh Opus reader (~80% confident) gives Partial, on **QA-533** (Gap, Major).
- The prospects List and board cannot be filtered by source.
- `GET /prospects?source=` is silently ignored. AG-2-23 says "board/list".
- **Met:** owner, date and stage filters; drag at 1440, 1024 and 400 px; the keyboard path. j_30 55/55 twice.
- **Test gaps:** j_30 walks neither the Leads Source filter nor the List's engaged-day filter.
- **Conditions for Works**, either one of:
  - a Source filter on the prospects List, walked;
  - a written Lead ruling that Leads' Source filter satisfies row 30, with j_30 walking it.
  - And, in both cases, walks.yml `j_30` green twice on main.

## Evidence (`2026-11-20-capability-R1.31-R1.30/`)
`r131-gate-a-value-run{1,2}-mine.txt`, `j31-run{1,2}-mine.txt`, `j30-run{1,2}-mine.txt`, `fo2pv-mine.txt`, `r131-*.png`. R1.30's first walk on 133f70d9d: `2026-11-19-capability-R1.30.md`.

## Questions for the Lead
1. Please dispatch walks.yml `j_30 j_31` twice on main.
2. QA-533: is source on Leads alone enough for row 30?
