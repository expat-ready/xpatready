# qa capability — Track B, lane 2 (23 Nov 2026, from 02:xx IST)

Lane: qa Track B 2 (replaces the stopped Track B qa lane; its hand-over is on PR #3045). Main `9787e68ae`. Isolated copies only (`tools/isolated.sh`), live AI off, US$0.

## Watched merges (step 1)
At 02:xx IST none of the watched parts had merged: #2368 (FO-7ts part 3, R1.58) labelled and queued; #3001 (FO-7q, R1.56) dequeued; #3042 (FO-9b part 1, R1.29), #2999 (CS-NT1, R1.76) and #3041 (PF-F1b, R1.65) open with no label. No verdicts yet; each is walked within 60 min of its merge and added below.

## R1.56: j_56 aligned and re-run (step 2)
The issue step read `number` and `dueDate` at the top level; FO-7b part 1b answers `{ invoice: { … } }`. j_56 now reads `w7.body.invoice ?? w7.body` (W7 and W9).

| Run | Result |
|---|---|
| 1 | 13/17 |
| 2 | 13/17, the same lines |

Pass: setup, W2 ×3 (Ontario HST from the cited CRA table; a rate in the request refused), W4 ×2 (FO-7g part 1w: the default tax, an own rate refused), W5 ×2, W6, W7 ×3 (INV-0001, due 2026-12-06, one `invoice.issued` line; tax frozen; PDF), W8.
Fail, all on missing parts: W1 (422 "Unrecognized key: retainerId": invoice from retainer, row to be named by Lead B), W3 (Bill-to province, FO-7g part 3, P-797), W9 ×2 (no Money › Invoices screen: FO-7s1, FO-7q; R1.57's first step FO-7c).
**Verdict: Partial, no score (P-606).**

## Flaky checks rated (step 3)
QA-752 `check_aud4s_activity_log_browser.ts` (batch #3099), QA-753 `check_fo8_prospect_won.ts` DW4 (batch #3022), QA-754 `check_c69_page_browser.cjs` (batch #3019): all Minor, passed on retry, no wrong result seen. The CI artifacts could not be downloaded from this cloud copy (the artifact host is not allowed); QA-752's likely cause is read from the check's code.

## Questions for the Lead
None new; the old lane's pending decisions stand (hand-over on #3045, item 4).
