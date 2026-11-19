# qa 6 — after-merge prep, 19 Nov 2026 (from 11:47 IST)

qa 6 (fresh Mac qa lane after the account switch), branch `claude/qa-6-after-merge-1119` from main 4aa912c92. Lead: Lead 90.

## State at ~12:0x IST: none of qa 6's items has merged
| Item | Last part(s) | State | Proof when it lands |
|---|---|---|---|
| R1.80 | evidence commit 16286b647 on `claude/r180-adobe-evidence` ("Completes: R1.80"; Adobe Validate passed 19 Nov ~11:29 IST, 5/5 barcodes, 186/186 positions) | branch only, **no PR yet** (asked Lead 90) | on merge: close QA-165 (the only hold on C7.2), C7.2's pack in the merge batch's ci, fresh reader, row R1.80 |
| R1.77 | #2169 CS-C1s part 2 (queued) → J-77 `claude/j77-journey` (c81ed249d, `tests/journeys/j_77.ts`, stacked on #2169; no PR yet) | in flight | walks.yml j_77 on main twice; QA-502 (no screen) closes if the walk does the four actions by screens |
| R1.74 | #2000 CS-DL1 part 1 (queued) → CS-DL1b → J-74 | no CS-DL1b/J-74 branch found | QA-471 (Gap, Major) holds it until reminders + working days with holidays |
| R1.8 | #2124 AUD-1b merged 03:28Z; #2214 AUD-1m part 1 (dequeued) → AUD-1m 2a, 2b → J-8 | in flight | no open QA row on R1.8; probes per the row's fail cases |

## Notes
* Merge-queue batches have failed since ~03:34Z (ci runs 44452375664 … 44459511901, all failure); not qa's to fix, but no item can merge until the queue is green.
* No ci run found with main 4aa912c92's tree (2c345b32e) in the last 400 ci runs; the next proof uses the merge batch of the item's own PR.
* Merge batch ci 44459511901 (failure). #2169's code fails two checks. (1) Shard 4, job 135344310367: `check_bk2_fold_outs`, `runtime/case-decision.tsx:179` has aria-expanded and no FoldArrow. (2) Shard 8, job 135344310440: `check_forms_qa53`, `GET /api/runtime/cases/:id/decisions` returns 401 for officer and client. Shard 5, job 135344310400 (not #2169's): `check_pf19b_mail` TypeError on `wordingId`. Sent to Lead 90 at ~12:1x IST.
