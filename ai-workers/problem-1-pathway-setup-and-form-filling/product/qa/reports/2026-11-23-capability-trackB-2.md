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

## R1.58: walked after #2368 (FO-7ts part 3) merged
#2368 merged 20:58Z 22 Nov (02:28 IST 23 Nov); walked on main `884d1a1ec` at ~02:35 IST, within 60 min. j_58 from draft #3043 (`claude/jolly-knuth-42casq-d`, unchanged), isolated copy `qa_j58`, twice.

| Run | Result |
|---|---|
| 1 | 6/22 |
| 2 | 6/22, the same lines |

Pass: setup; W1 underneath (TRUST or OPERATING, the database refuses neither and anything else); W2 underneath (a withdrawal over the balance refused, "Only CAD 1,000.00 is available."); W3 underneath (a move to a case over the pre-case money refused); W4 underneath (earned 300.00 on `money_to_move`); W5 underneath (a reversal below zero accepted, `money_trust_shortfall` lists the client at −200.00).
Fail, all on missing parts (each 404 or no screen): FO-7t parts 1-3 (trust answer, deposits, ledger, Pay from trust, refunds, To move and its batches); FO-7b's offline payment route (422 "Unrecognized key: receivedAt": the route exists, j_58's guessed body does not fit it, to align when FO-7t lands); the move-to-case route (unnamed FO-7t part); FO-7v (reversal route); a read and a screen of the shortfall list (no row names one); FO-7s3b (Money › Trust). FO-7s3a and FO-7m are not reached by any step yet.
**#2368's own step (W3 underneath, the pick):** the pick within what the payer holds is accepted (`picked_other_funds_by` column present, balance falls by 50.00). The over-pick of 0.01 is **refused**, but by the general trust-balance rule ("Only CAD 250.00 is available; the trust balance would go below zero") before #2368's own rule ("a pick takes only what the payer holds on that case"), because the payer holds nothing outside that case. The product refuses correctly; j_58 should give the payer pre-case money elsewhere so the pick rule is the one that fires (or accept either refusal). A journey alignment for #3043, not a product bug.
**Verdict: Partial, no score (P-606).** Parts missing: FO-7t (parts 1-3 and the move-to-case part), FO-7v, the shortfall read and screen, FO-7s3a, FO-7s3b, FO-7m.

## R1.76: walked after #2999 (CS-NT1 part 1) merged
#2999 merged 22:33Z 22 Nov (04:03 IST 23 Nov); walked on main `3ffb68753` at ~04:10 IST, within 60 min. j_76 from draft #3045 (`claude/jolly-knuth-42casq-f`), isolated copies.
First pair (`qa_j76`, j_76 as on #3045): 17/27, 16/26. W1's "adds a note (201)" and both W2 edit steps failed though the add answered 201: j_76 read the note key as `body.id`; CS-NT1 part 1 answers `{ note: { id, … } }` (`api/src/case-notes/service.ts`, as `tests/check_csnt1_notes.ts` reads it). One line aligned (`added.body?.note?.id ?? …`; this PR carries j_76 with it).
Second pair (`qa_j76b`, aligned):

| Run | Result |
|---|---|
| 1 | 20/27 |
| 2 | 19/26 (the checkpoint is already loaded, so its setup line is skipped), the same 7 fails |

Pass: W1 ×3 (a note on case A1, 201; listed with the Owner's name and time; `case_note` once with `staff:<id>` and the database's time); W2 ×3 (an edit writes version 2, the history shows both; the database keeps both; UPDATE and DELETE refused on `case_note` and on `fo_note`); W3 prospect note on its person (FO-2 part 4); W6 ×2 (the prospect timeline, and not another's); W7 ×2 (firm B's prospect note and case notes never shown; firm A reading firm B's is 404 while its own is 200); W8 the case page opens; no page errors.
Fail, all on missing parts: W3 a note on the case client and W4 ×2, W7 the case timeline (CS-NT1 part 3); W5 a person's timeline (no BACKLOG row names one; Lead decision pending since the old lane's hand-over); W8 the case page panel (CS-NT1 part 4) and the prospect page timeline (FO-4 part 2b).
**Verdict: Partial (was Not built), no score (P-606).**
