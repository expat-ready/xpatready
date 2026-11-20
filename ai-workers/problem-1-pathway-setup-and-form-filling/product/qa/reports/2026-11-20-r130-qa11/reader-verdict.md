# R1.30 — fresh reader's verdict (Opus, fresh context, read code, logs and screenshots only, ran nothing; 20 Nov, main 418be9f1a)

**(1) Verdict: Works.** J-30 green on GitHub (two runs as qa reported) and 55/55 twice locally; no open Major or Critical names R1.30 or FO-4 in `qa/BUGS.md` (no open row for R1.30, FO-4 part 2, pipeline-page or leads-page). P-305 is met.

**(2) Done-when clauses (facts):**
- Source (Leads): qa check at 1440, 1024 and 400 (chip, address, reload, focus back after Escape, axe, no sideways scroll); an unknown source is dropped safely.
- Owner: Leads, J-30 W1 (`j_30.ts:110`) at 1440 plus the qa check at all three widths; the List, the qa check at all three widths and J-30 W5 (:281).
- Date: Leads "Arrived" J-30 W1 (:117, reload kept) and the qa check at all three widths; List "Engaged" the qa check at all three widths.
- Stage: a positive result only in J-30 W5 (:281) at 1440; the qa check shows only the empty case at the three widths. (qa 11 then added a positive Stage = Qualified line at 400/1024/1440: see below.)
- Drag: J-30 W3d at 1440, 1024 and 400 (loop at :226): stage, one PERSON move, audit and timeline read back; Won refused; Lost opens the loss flow. Code `pipeline-page.tsx:41-44, 65, 78`.
- Keyboard "Move to…": J-30 W3 DW9 (:185, :195) and W3d (:242), at 1440 only. (qa 11 then added keyboard Move to… at 400/1024/1440: see below.) Board no-sideways-scroll and axe at 375/1024/1440 (W4).
- Visibility: filters only narrow inside it: `leads.ts:56-64` (ANDed with `seenWhere`, `sees()`), `prospects.ts:192`, `board-totals.ts:11`; proven on the API earlier by `check_fo2p3_prospects.ts`.
Judgement: keyboard at 400/1024 and a positive Stage filter at 400/1024 were not shown at those widths: a coverage gap, not a defect.

**(3) Gate A: yes.** A filtered List row opens the prospect and its Value panel (Amount); `r130-next-r131-value.png` shows "Set the value", Amount focused, Currency CAD.

**(4) Date-range finding: real, UX · Minor (confirmed), owner screens.** `prospects.ts:43` returns `bad("from: on or before to.", "from")`; `Failed` (`pipeline-page.tsx:28-29`) replaces the list with a page alert carrying the API's raw words; its "Try again" re-sends the same bad query. The date inputs only set browser min/max (`:117-118`; `leads-page.tsx:151-152`). Breaks EXPERIENCE.md:27, :43 and BIC-13 (:74) (errors on the field, say how to fix, no internal field names). No wrong result, no data at risk; "Clear filters" or the picker recovers; close to Major because "Try again" cannot succeed. Expected: check from ≤ to before sending; a message at the "from" field ("The from date must be on or before the to date") with aria-invalid and aria-describedby; keep the list, send no request; map an API 400's `fields.from` to the field.

**(5)** The final qa logs were `check_r130_run1.txt`/`run2.txt`; the check had to be committed (P-557) — done since.

## qa 11's follow-up on (2)
The check gained, at each of 400, 1024 and 1440: "Move to…" by keyboard only (focus, Enter, ArrowDown, Enter) moves a card to Qualified with exactly one PERSON move into Qualified underneath, no sideways scroll; then the List's Stage = Qualified shows that prospect and none of the Engaged ones. 53/55 twice (`check_r130_run1.txt`, `check_r130_run2.txt`); the two FAILs are the date-range lines of (4).

## qa 11, after the records review
This reader was not shown QA-533 (its row was out of `BUGS.md` after #2296's split, and qa's brief did not name it). qa 9's earlier readers refused Works on it. R1.30 is scored **Partial** on QA-533 (see the report).
