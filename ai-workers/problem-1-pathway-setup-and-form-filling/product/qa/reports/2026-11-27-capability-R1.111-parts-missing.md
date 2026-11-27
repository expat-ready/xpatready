# qa capability R1.111 — 27 Nov 2026: parts missing, no verdict

**Run:** `/qa capability R1.111` · cloud qa copy (new account, first hour) · Opus 5.5, effort medium (P-608, P-788) · main **0c90a3cf6** (merge of #3822, 26 Nov 22:42Z) · live AI off, US$0, no priced button pressed (P-175).

## Verdict
**parts missing: FO-7r part 3, FO-7s5.** No verdict given (P-606). No isolated copy started and no walk run: with the export missing, the Done-when's second half ("a period export sums to the same totals") cannot be walked, and a half-walk would be a verdict.

## The row's parts (from `MVP-CHECKLIST.md`)
Map row 111 (line 120): "FO-7r; FO-7s5". Parts list (line 302): "R1.56/R1.57/R1.58 (R1.96/R1.111): … FO-7r parts 1-3". So R1.111's own parts are FO-7r parts 1-3 and FO-7s5.

| Part | What | On main 0c90a3cf6? | Evidence |
|---|---|---|---|
| FO-7r part 1 | a client's money summary and statement (running balance) | **Merged** | #3634, merge aa5fa20c7 |
| FO-7r part 2 | statement PDF and Send statement | **Merged** | #3753, merge a616591ec (26 Nov) |
| FO-7r part 3 | period exports API: one CSV each for invoices, payments, refunds, credit notes, write-offs, trust ledger; `JobPort` job; expiring link; key `agent/billing:export` | **Missing** | no commit or PR names it (`git log --grep "FO-7r part 3"` on main: none; GitHub PR search: none); `grep -r "billing:export" api/src web/src`: no match; `api/src/client-money/reports/` holds common, metrics, routes, send, statement-document, statement, summary — no export |
| FO-7s5 | Money tab › Send statement and Money › Exports screens | **Missing** | no commit or PR names it; `web/src/modules/client-money/` has area, invoices, payments, routes, trust — no statements or exports folder. Its brief (`design/briefs/FO-7s5.md` line 7) is ready only after FO-7r part 3 merges |

## GitHub runners
No ci run is recorded on main's head sha 0c90a3cf6 itself (main CI runs on the PR merge ref; the only run on the head sha is walks **45919089701**, j_35 and self-tests, unrelated to R1.111). No R1.111 journey exists (`tests/journeys/j_111*`: none), so there was nothing of R1.111's to run.

## Records
* `qa/CAPABILITIES.md` R1.111: status left as recorded (Not built) with "parts missing: FO-7r part 3, FO-7s5", commit 0c90a3cf 27 Nov.
* **Overlap:** open records PR #3809 (qa 2 after-merge, 26 Nov) moves R1.111 to Partial naming only FO-7s5 as missing. This round finds FO-7r part 3 missing as well. Whichever merges second should keep both names.
* No new `qa/BUGS.md` row: a missing part is not a bug (P-606).

## Questions for the Lead
1. #3809 and this PR both change the R1.111 row. Should R1.111 read "Partial" (two of its five parts merged) or stay "Not built" until FO-7r part 3 lands? This PR leaves the status as it was and only adds the parts-missing note.

## Suggestions
* *Needed for the proof · Capability:* FO-7r part 3 is next in line for R1.111 (it gates FO-7s5 and FO-7m part 2). When both merge, a `j_111` journey should check the statement's running balance against `money_*` rows and the export CSVs' sums against the same totals per currency.
