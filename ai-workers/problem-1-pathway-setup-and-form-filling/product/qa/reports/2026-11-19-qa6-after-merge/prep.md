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
* Lead 90 (~12:2x IST) opens the R1.80 evidence PR after its reviewer approves 16286b647, then sends qa 6 the number.
* R1.80's pack: `acceptance/C7.2.test.ts` (11/11 on the checkpoint, 16 Nov). The proof is nightly with `capabilities=C7.2`, `data=checkpoint` on main's head (P-339). Rehearsal run on main 4aa912c92: nightly 44471642021.
* J-77 rehearsal walk on its branch: refused by the session's permission check (dispatch on another lane's branch). The proof walk runs on main after the merge.
* R1.80 evidence PR is **#2235** (head 16286b647; Lead 90 labels it on green CI).
* Rehearsal: nightly **44471642021** (main 4aa912c92, `capabilities=C7.2`, `data=checkpoint`), job 135382343344 "packs (C7.2)": `C7.2.test.ts on the checkpoint: exit 0, 11/11 passed (96 s)`, "Gate B: passed". After #2235 merges, two more runs on the new head (pack run + independent re-run); the merge changes only `evidence/c7-2-adobe-validate/result.json`.
* #2000 head 093d9829b: 31 PR checks green, not yet in a batch. #2214 head ee835cc53: module-cards failed (jobs 135324426439, 135324314780; MODULE.library.md not updated, P-615 (3)). Sent to Lead 90.
* Founder's choice (12:0x IST, via Lead 90): the Lead starts walks.yml runs for qa lanes; qa sends one line (item, journey, pack run or independent re-run) and gets the run id. qa 6 asks only for walks on main after an item's last part merges; the refused branch rehearsal is not re-requested.
* Disk rule (Lead 90, 12:0x IST): one scratch clone, one node_modules, one test database, 3 GB at most. qa 6 scratch: 8.9 MB.
* **Lead 91** (local_d2a979e6-f888-4a43-b02f-763424a049d1) took over from Lead 90 (~12:3x IST): walk requests and verdict lines go there.
* P-733 (founder, 12:28 IST): once #2233 is on main, proof is automatic at an item's last merge; qa walks items touching money, permissions, firm walls, schema or IRCC forms (R1.80 IRCC forms; R1.8 permissions and schema) and samples the rest daily. Until #2233 merges, prove as before.
* **Lead 92** (local_9e102072-cfa3-44e7-b027-32b06363cdb5) took over from Lead 91 at 12:57 IST: walk requests and reports go there.
* Lead 92 (~13:0x IST): R1.80's verdict belongs to qa 4 (cloud; claimed on #2235, P-722). qa 6 stands down on R1.80; rehearsal 44471642021 stays as supporting evidence. Handed back only if qa 4 cannot run. qa 6 keeps R1.77, R1.74, R1.8.
* **Lead 93** (local_ce66c66a-3387-466b-9cfa-bcbc781648bd) is current Lead (after Lead 92): reports go there.
* Batch **#2246** (head 02a6da1c9, on main 8cefcc6): #2235 + #2208 + #2214 + #2000 + #1961 + #2207. qa 6 reads its failing suites when its ci completes.
* 14:2x IST, batch #2246 failed (ci 44481360910). Shard 5, job 135416108446: `check_pf19r_case_links.ts` STOP; its fixture's `firm_key` breaks CS-K1's FK `runtime_case_client_id_workspace_id_firm_key_fkey` (test from #2177 PF-19r part 2, in the batch ahead; not on main). types, job 135416108346: tsc api heap out of memory (SIGABRT, 0 files checked). Neither traces to #2000 or #2214. Mergify closed #2246 because the batch ahead (#2224 #2012 #2102 #2181 #2169 #2177) failed. Sent to Lead 93.
* **#2169 merged 15:19 IST** (09:49:01Z). R1.77 now waits only on J-77: `claude/j77-journey` (c81ed249d) has no PR yet; asked Lead 93 at 15:23 IST. Batch #2259 (#2235 #2208 #2214 #2000 #1961 #2204 on main a668cfd) running.
* J-77 PR is **#2263** (opened ~15:3x IST by a fresh cloud lane). On its merge, Lead dispatches walks.yml j_77 on main twice.
* **Lead 94** (local_8d88d9c8-bb18-4895-af87-797aa32c61bf) took over from Lead 93 at 15:46 IST: reports go there.
* 16:2x IST, batch **#2259** (ci 44500117743): every shard green; only types, job 135479683421, failed: tsc api heap out of memory (SIGABRT 119 s, 0 files checked). The same OOM hit 7 single-PR ci runs 15:26-15:44 IST (44501033834, 44501826898, 44503847441, …), which passed on re-run after 15:48 IST: a flaky runner limit, not #2000's or #2214's. Sent to Lead 94 with the heap-size suggestion.
* Lead 94: tsc api heap fix #2250 is on main 497837f30 (15:47 IST). Batches #2266 (ci 44504995341) and #2267 (ci 44506709103) run on it: types green in both.
* 17:0x IST, both batches failed. `check_c617_stages_browser.ts` (#2266 shard 5, job 135496557476; #2267 shard 4, job 135502334633): documents panel "Passport information page copy" state words time out after 30 s; only #2253 (CS-D1t, J-67) edits that test and `case-checklist.ts`, and #2266 has no #2000. `check_csv1_inputs.ts` (#2267 shard 5, job 135502334567): `POST /api/runtime/clients/:id/open-case` body has no zod parse, from #2255 (FO-8). Neither is #2000's or #2214's. Sent to Lead 94.
