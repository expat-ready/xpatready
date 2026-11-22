# Track B board (case side, client money, and the rows Lead 4 added under A286)

Kept by Lead B (Track B) on branch `lead-b/2026-11-22-track-b`; the Lead takes it with each records PR. Times IST. Goal (founder, A286): 12-15 proven capabilities. Briefs: `design/briefs/track-b/`. Plan and forecast: `design/track-b-plan-2026-11-22.md`.

**Lead B 2 pass, 01:2x IST 23 Nov:** **#2913 CS-S1 part 2 merged** (19:40 UTC). #3073 CS-MV1 merged main, own 6 files: Lead B re-read OK 2366ac2be (adapter unchanged; census 49); needs a diff-only Approve, green ci, label. #3041 dequeued (not its failure; requeues). #2368 queued; #3001 after #2368.

**Lead B 2 pass, 00:5x IST 23 Nov:** #2368 F7 fix d251cd34b and #3041 f7ce263ad: Lead B re-read OK (00:42). Queued: #3041, #2913. #2368 waits green ci and Lead 8's label; #3001 dequeued until #2368 merges; #3073 after #2913; #3042 after #2368.

**Lead B 2 pass, 00:2x IST 23 Nov** (current Lead: Lead 8, local_82fee93b): #2368 FO-7ts part 3 out of the queue (shard 8 alone on main: check_pf8b_f7_data_walls from #3068 rejects its three data blocks, not in F7's lift shape); lane text sent to Lead 8 (rewrite in F7's shape, trigger gate for the UPDATE). #3001 queued but needs #2368's index: asked Lead 8 to dequeue it until #2368 merges. #3041 PF-F1b out: conflict in settings.ts; lane text sent. #3073 waits #2913.

**Lead B 2 pass, 23:5x IST 22 Nov:** #3001 FO-7q Lead B re-read OK 85d577218 (own 13 files; refusals now PF-28's 422; scope unchanged, fail closed). Queues after #2368 (DW1 needs #2368's index). New BACKLOG row **FO-7q part 2** (refund actions in allowedActions, from #3036). #2368 and #3041 queued; #2913 full run (Lead 7), then #3073.

**Lead B 2 pass, 23:2x IST 22 Nov:** **#3048 FO-7g part 1w and #3036 FO-7b part 1c merged.** #3041 PF-F1b Lead B re-read OK 497134613, Lead 7 labelled, queued. #2368 waits its full run. #3001 FO-7q in conflict with main: lane text sent (merge main, own files, re-run, diff-only Approve, ready, Lead B re-read; visibility stays fail closed until CS-MV1's binding line). #3073 waits #2913 (fix e379f7a9a, unlabelled).

**Lead B 2 pass, 22:5x IST 22 Nov:** **#2955 PF-F1 and #2938 FO-7c part 1 merged** (17:15 UTC). #2368 Lead B read OK 048bbee68 (per-firm fill, R7-1), reviewer Approve; waits the Lead's read and label; #3042 next in the slot. #3041 PF-F1b: lane text sent (merge main, diff-only Approve, ready, Lead B re-read). Queued: #3036, #3048. #3073 waits #2913.

**Lead B 2 pass, 22:2x IST 22 Nov:** #2368 FO-7ts part 3 and #2913 CS-S1 part 2 left the queue (each failed a shard alone on main). #2368's fix c561f07e7 Lead B read OK (re-stamp 20261122170000; PF-8b F6 owner-lifts-FORCE pattern; part 1b test seeds carry refund method/date); needs a diff-only Approve, then the Lead's read and label. #2913's fix is the find-box race (#3109 on main) and a main merge. Queued: #2955, #2938, #3036, #3048. #3073 waits #2913; #3042 waits #2368.

**Lead B 2 pass, 21:5x IST 22 Nov:** no Track B head moved. No Track B merge since #2953 (15:03 UTC); batches #3107 (ci + regression shard failed) and #3110-#3114 cycled; #2955 "not the cause". Seven Track B PRs still queued. Told Lead 7.

**Lead B 2 pass, 21:2x IST 22 Nov** (current Lead: Lead 7, local_d7cc573e, from 21:14): #3048 FO-7g 1w Lead B re-read OK 77f989a10 (own 8 files after #2953), Lead 7 read OK, labelled, queued. Queued: #2955, #2938, #2913, #2368, #3036, #3048. #3073 re-queues after #2913; #3042 slot after #2368.

**Lead B 2 pass, 20:5x IST 22 Nov:** **#2953 FO-7b part 1b merged** (15:03 UTC, 3264e2510). #3036 FO-7b 1c merged main, own 9 files as read, re-approved, queued. #3048 FO-7g 1w now conflicts with main: lane text sent to Lead 6 (merge main, re-run, diff-only Approve, ready, Lead B re-read). Queue checking: #2955, #2938, #2913, #2368, #3036.

**Lead B 2 pass, 20:2x IST 22 Nov:** no Track B head moved. The base batch failure (#3093: FO-8 DW4 client number twice, PF-30s find box timeout; neither in #2955's files) is Lead 6's; batches #3093-#3096 gone; five Track B PRs back to "checking". FO-8 DW4 not seen on any other Track B head.

**Lead B 2 pass, 19:5x IST 22 Nov:** no Track B head moved. Queued with no Track B merge since ~18:50: #2953, #2955, #2938, #2913, #2368; waiting on them: #3036, #3048, #3073.

**Lead B 2 pass, 19:2x IST 22 Nov** (current Lead: Lead 6, local_d4609e9d, from 19:0x): quiet. #2938 FO-7c part 1 re-stamped to 20261122060000 by Lead 6's ask (after #3068's PF-8b F7), SQL byte-identical: no new Lead B read. #2368 queued (slot 1); #3042 next in the slot. #3073 waits #2913's merge.

**Lead B 2 pass, 18:5x IST 22 Nov:** merged since 18:2x: #3046 PF-5 part 4, #3067 records (P-805 on main). #3042 FO-9b part 1 Lead B read OK f05ab1de3 (F4 grant pair present; Lead 5's read OK 18:39; slot after #2368). #3073 dequeued as foreseen; #2913 requeued at 782f481e6; #3073 re-queues after #2913 merges. #2953, #2955, #2938 queued; #3036 and #3048 wait #2953.

**Lead B 2 pass, 18:2x IST 22 Nov:** #3036 FO-7b 1c read OK 9c4becfff (uncleared-refund fix as ruled; queue after #2953). #3073 CS-MV1 Lead read OK and queued (census line in, 49), but #2913 left the queue (shard 17 failed) and #3073 carries its files: told Lead 5 to clear #2913 first. #3042 round 5 running. Others unchanged.

**Lead B 2 pass, 18:0x IST 22 Nov** (took over from Lead B at 18:03; passes at :17 and :47; open PRs read 18:0x).
* #3073 CS-MV1 (new, stacked on #2913): Lead B read OK 7ebc43d7b. Census Q1 answered: one CS-W3 allow-list line for `client-money/visibility-adapter` (as Lead 5's Option A on #2999), for the Lead to confirm; `search/party-search` is #2913's. Merges after #2913. Follow-ups: `caseScope` ACTIVE-only (CS-S1); no-case invoice to a non-prospect party is seen by nobody (question for FO-7q's walk); binding line after #3001.
* #3036 FO-7b 1c: one fix before the label at 4db6219c7: `/refunds` refuses an uncleared payment (NOT_CLEARED) as `/extra` does, one test, the comment labelled a reading (Unconfirmed: no accountant). Diff-only reviewer round. Queues after #2953.
* No change: #3001 (head af8d54b4c, read OK); #3048 waits #2953 (queued); #3033 tests only, no code yet; #3017 waits P-805 in DECISIONS (records #3067 queued); #3042 round 5 running on ade4a847c.

**As of 22 Nov 14:4x IST** (main `68f74620b` read at 14:40; open PRs read at 14:40 and 14:5x).

| R1 item | Part (brief) | PR | Stage | Migration | Waits on | Next |
|---|---|---|---|---|---|---|
| R1.56 invoices, tax | FO-7g part 1 (`FO-7g-1.md`) | #2967 | merged 14:10 | no | — | — |
| R1.56, R1.60 | FO-7b part 1b (`FO-7b-1b.md`) | #2953 | labelled; CI waits on #2980 and records #2952 | no | #2980, #2952 | merge |
| R1.56 | FO-7g part 1w (`FO-7g-1w.md`) | — | lane given P-797 text | no | #2953 | build |
| R1.56 | FO-7q (paged reads; BACKLOG row) | — | the FO-7s1 lane builds it first | no | #2953 | build |
| R1.56 | FO-7g part 3 (Bill-to province, P-797; BACKLOG row) | — | not started | yes | FO-7g part 1w; slot | — |
| R1.56 | FO-7s1 (invoice screens) | — | waits | no | FO-7q | — |
| R1.57 card payments | FO-7c part 1 (`FO-7c-1.md`) | #2938 | labelled, queued | yes (re-stamped 20261122040000) | queue | merge |
| R1.65 storage | PF-F1 (`PF-F1.md`) | #2955 | labelled, queued | no | queue | merge |
| R1.65 | PF-F1b (`PF-F1b.md`) | — | lane LX943 | no | #2955 | build |
| R1.3 walls | CS-W3 2-review (`CS-W3-2-review.md`) | — | lane LX944 | no | — | build |
| R1.58 trust | FO-7ts part 3, resume #2368 (`FO-7ts-3-resume.md`) | #2368 | lane redirected | yes (stamp collides; re-stamp) | slot: 2nd | re-stamp, review |
| R1.29 duplicates | FO-9b part 1 (`FO-9b-1.md`) | — | lane redirected | yes | slot: 3rd | build |
| R1.29 | FO-9s part 2 (`FO-9s-2.md`) | #2896 (concept) | concept | no | FO-9b part 2, #2921 | concept |
| R1.55 decline | FO-5d (`FO-5d.md`; BACKLOG row) | — | lane redirected | yes | FO-6 part 3; slot: 5th | build later |
| R1.54, R1.61 signing | FO-6 part 3 (`FO-6-3.md`) | — | lane redirected | no | #2933, #2919 | build |
| R1.105 keep periods | PF-5 part 4 (`PF-5-4.md`; P-799 days 0/16/46/83) | — | lane redirected from AUD-5 (merged #2197) | no | — | build |
| R1.105 | PF-11c | — | stopped (blocked) | — | PF-11, AUD-2, PF-21b | — |
| R1.85 legal hold | PF-21b part 2 (`PF-21b-2.md`) | — | lane redirected | yes | #2927; slot: 4th | build |
| R1.93 console | PF-17 part 1 (`PF-17-1.md`) | — | lane redirected | no | #2927 | build |
| R1.76 notes | CS-NT1 part 1 | #2320 | draft; owner card waits for the founder | yes | slot | — |

**Migration slot order (Lead 4, 14:5x):** #2968 (AWS) → #2368 FO-7ts part 3 → FO-9b part 1 → PF-21b part 2 → FO-5d.
**Decisions today:** P-797 (tax follows the client's province, Bill-to editable, firm province as fallback; CRA Memorandum 3-3-6 para 20, Example 6); P-799 (payment-hold notices on day 0, then 16, 46 and 83; SA-02 v2.24 line 354).
