# Track B board (case side, client money, and the rows Lead 4 added under A286)

Kept by Lead B (Track B) on branch `lead-b/2026-11-22-track-b`; the Lead takes it with each records PR. Times IST. Goal (founder, A286): 12-15 proven capabilities. Briefs: `design/briefs/track-b/`. Plan and forecast: `design/track-b-plan-2026-11-22.md`.

## Hand-over, Lead B 2 → the next Lead B, 11:15 IST 23 Nov (stop order: account switch; Lead 10)
**Role:** the first read of Track B money, permission and schema PRs ("Lead B read: OK <sha>" or findings on the PR), answers to row questions, and rows and briefs 2-3 days ahead. Never label, merge, open PRs or type into lanes: send lane text to the current Lead. Passes at :17 and :47 (a session cron, prompt `Lead B pass`).
**Merged since 22 Nov 18:00 IST:** #2953, #2955, #2938, #3036, #3048, #2913, #3073, #2368, #3041, #3017, #3001, #3157, #3042, #3156, #3159, #2999, #3165, #3175 (records: rows FO-7q part 2, FO-9b part 2b, FO-7t part 1p).
**Reads posted, waiting for a label or ci:** #3033 FO-7t part 1 (money OK 0f1acb674 after the C5-on-writes fix; red ci and pr-rules; needs a fresh lane, a reviewer Approve on its head, and the CS-W3 census line for `client-money/trust/service.ts`); #3155 PF-17 part 1 (permissions OK cd306cb67; labelled); #3065 FO-6 part 3 (OK a255e0321 plus the 404-before-body commit 7d7979437; full run, then label).
**Reads owed when ready:**
* #3174 FO-9b part 2: money. `hasMoney` must count `money_party_tax_treatment` and the trust payee columns. Keys are `agent/prospect:edit` (review) and `agent/prospect:merge` (merge), Lead 10's ruling. Breaker yes; migration if keys are seeded (F4 pair, F7 lift).
* #3189 PF-21b part 3: the migration, with the F4 pair and the F7 lift shape.
* #3190 FO-7g part 3 follow-up (j_56 W3).
* FO-7q part 2's PR (FO-7s1 lane): the refund actions in `allowedActions`, with the same keys and the TRUST / NOT_CLEARED refusals as `refunds.ts`.
* FO-5d's PR (after #3065): it replaces the signing webhook bypass with a narrow definer lookup.
**Next rows ready on main:** FO-5d (after #3065), FO-9b part 2b (after #3174), FO-7t part 1p (after #3033), CS-NT1 parts 2-3 then CS-NT1t (R1.76).
**Notes carried:** PF-11's brief must say the export archive may outgrow the 25 MB FilesPort cap (from #3165). A rare invoice status in a very large firm reads every candidate's facts (FO-7q limit; a stored status column later).
**Method:** list open PRs with the gh auth token and compare head SHAs with the last pass; read moved heads with the compare API; post via a JSON body file. Commit board records with a temporary `GIT_INDEX_FILE` (never check out `lead-b/*` in a sandboxed worktree: `.claude/skills` is read-only). In zsh write `"${r}:path"`, not `"$r:path"`.

**Lead B 3 pass, 12:32 IST 23 Nov:** no Track B merge (main fix #3208 labelled, not queued). Reads: #3184 FO-3c part 2 OK 0b6dc934b; #3188 CS-D5 part 1 OK e695fa1f3 (used-token table needed before two tasks or a screen: row to write); #3225 PF-17 part 2 OK f1829d063 (Lead 2: after #3178). **Stamps:** #3178, #3033 and #3174 all 20261123030000; #3184 050000; #3225 060000; #3189 and #3185 100000 (Lead 2: #3189 first, #3185 re-stamps). **Owed when ready:** #3180 CS-D7c, #3207 and #3224 FO-6d parts 1-2 (stacked on #3065). #3065, #3197, #3190, #3033, #3189, #3174, #3195 heads unchanged.

**Lead B 3 pass, 12:01 IST 23 Nov** (current Lead: Lead 2, local_2158cd24): no Track B merge. Reads: #3174 re-read OK 744cc7919 (draft); #3185 PF-21c OK 21adefa9c; #3195 PF-11c part 1 OK eef90d8c8. **Two stamp clashes:** #3033 with #3174 (20261123030000), #3189 with #3185 (20261123100000, both edit platform-register.prisma). #3197 and #3190 have Lead 1's read and wait for the main fix #3208. **Owed when ready:** #3184 FO-3c part 2 (8927036b4, draft, migration), #3207 FO-6d (draft, stacked on #3065), #3180 CS-D7c (draft, schema). No Lead B read made of #3178 AUD-3a, #3188, #3191, #3209.

**Lead B 3, 11:55 IST 23 Nov (Lead 1's asks):** #3033 re-read OK 7f99ccd1b (pr-rules red, ci running, stamp clash open). The refund and extra routes are **confirmed unscoped** on main by code path (not run), and so is every other invoice write, `GET :id` and PDF: Critical row **CS-MV2**. Rows shaped in `design/track-b-rows-2026-11-23.md`: CS-MV2, FO-7w1 (R1.56 W1), PF-21b part 3r, FO-9b part 2m, PF-21f (firm's erasure request). No Lead B read of #3184 exists. #3208 no read (Lead 1). This replaces "Rows to write" and "To check" in the pass below.

**Lead B 3 pass, 11:34 IST 23 Nov** (took over from Lead B 2; current Lead: Lead 1, local_a085acf2; passes at :17 and :47). The six reads owed at the hand-over are posted:
* #3197 FO-7q part 2: OK 3f4d72bd3. #3190 FO-7g part 3 follow-up: OK f755aae17 (walk j_56 red, W1 and W9 by the lane's word; not re-run here).
* #3033 FO-7t part 1: head still 0f1acb674, OK stands. Red: `check-port-contracts` (TrustDocuments runs no contract) and pr-rules (Completes line).
* #3189 PF-21b part 3: OK c62d4bcb3; the Lead's own read of the seed row is still owed (P-601 (1)).
* #3174 FO-9b part 2: OK 9db9ca2d0 (code read at 15d40b474); reviewer round 3 allowed by Lead 1, diff-only re-read if code moves.
* #3065 FO-6 part 3: OK 7d7979437; its full run 45115724477 is red on check_fo3st3_types_browser J-T3 ("No host hours", date-driven, not in the PR's paths; cause unproven).
* **Stamp clash:** #3033 and #3174 both carry 20261123030000; #3189 is 20261123100000. Whichever merges later re-stamps past main's newest.
* **Rows to write (not yet on main):** PF-21b part 3r (a read key on the register's two GETs for the Owner and the Auditor, SA-11 v2.16 lines 88 and 243; never dsr-manage for the Auditor); FO-9b part 2m (money writers refuse a merged-away party, then re-point money in the merge; **before part 2b** turns the automatic merge on).
* **To check:** the refund and extra routes on main (FO-7b part 1c) take any payment of the firm by id with no MoneyVisibility scope, unlike FO-7t's writes and FO-7q's reads (seen by grep, no test run); same for GET tax-default by invoiceId (#3190, province only).

**Lead B 2 pass, 10:5x IST 23 Nov:** **records PR #3175 merged** (rows FO-7q part 2, FO-9b part 2b, FO-7t part 1p on main). #3033 C5 fix re-read OK 0f1acb674. #3155 PF-17 part 1 permissions read OK cd306cb67. #3065 404-before-body fix, no money read. Drafts: #3174 FO-9b part 2, #3189 PF-21b part 3 (migration), #3190 FO-7g part 3 follow-up. qa journeys #3043-#3045 queued.

**Lead B 2 pass, 10:3x IST 23 Nov:** **#3165 PF-Fw merged.** Records PR #3175 (Lead 10, my 7732294b5: rows FO-7q part 2, FO-9b part 2b, FO-7t part 1p) queued. #3033 FO-7t part 1 money read at 0738e3818: OK with one fix (C5 on writes with no caseId: party must be in scope, else 404) plus the CS-W3 census line. #3174 FO-9b part 2, #3155 PF-17 part 1 drafts. #3065 full run.

**Lead B 2 pass, 09:5x IST 23 Nov** (current Lead: Lead 10, local_d4a6b1cd): #3065 shard 10 fix re-read OK a255e0321. #3165 queued. #3033 FO-7t part 1 and #3155 PF-17 part 1 drafts.

**Lead B 2 pass, 09:2x IST 23 Nov:** #3065 FO-6 part 3 out of the queue (shard 10: check_forms_qa53 QA-65, the signing webhook not on PUBLIC_DOOR_WRITES); lane text sent (add it as FO-7c did in 2766ef4f0). #3033 FO-7t part 1 now has code (draft; migration 20261123030000). #3165 full run going. #3155 draft.

**Lead B 2 pass, 08:5x IST 23 Nov:** quiet. #3065 queued; #3165 dequeued, full run going. #3033 FO-7t part 1 tests-only since 10:50 UTC 22 Nov (lane may be idle; flagged to Lead 9). #3155 draft.

**Lead B 2 pass, 08:2x IST 23 Nov:** #3065 FO-6 part 3 bypass move re-read OK 0c41fa139; queued with #3165 PF-Fw. FO-5d lane text sent (after #3065; replaces the webhook bypass). qa asks answered: R1.76 person timeline = CS-NT1t (BACKLOG line 1086, in scope, after CS-NT1 part 3); j_58 data fix → fresh qa lane. qa verdicts: R1.58, R1.76, R1.65, R1.56, R1.29 Partial.

**Lead B 2 pass, 07:5x IST 23 Nov:** **#3156 FO-7g part 3 merged** (02:23 UTC). #3165 PF-Fw Lead B read OK 24d0691f9 (note for PF-11's brief: the export archive may outgrow the 25 MB port cap). #3065 FO-6 part 3 ready, needs the Lead's read and label; FO-5d after it. #3155 PF-17 part 1 draft.

**Lead B 2 pass, 07:2x IST 23 Nov:** **#3159 CS-MV1 binding merged** (01:35 UTC): R1.56's invoice list now scoped by case and prospect on main (j_56 walkable). #3156 FO-7g part 3 queued (types fix only since read). #3065 FO-6 part 3 merged main, needs ready + label; FO-5d waits it. FO-9b lane → FO-9b part 2 (with the hasMoney fix folded in; replaces row 1m). #3165 PF-Fw and #3155 PF-17 part 1 drafts.

**Lead B 2 pass, 06:5x IST 23 Nov:** **#3042 FO-9b part 1 merged.** #3156 FO-7g part 3 takes the slot (Lead 9's read and label). #3159 queued. FO-9b part 1m and FO-7q part 2 wait on the held records branch (founder). Rows on main for free lanes: PF-Fw, FO-5d (after #3156).

**Lead B 2 pass, 06:2x IST 23 Nov:** #3157 merged; #3042 queued again. #3159 (CS-MV1 binding: PgMoneyVisibility in place of failClosed) Lead B read OK bd7d9f531 — R1.56's list walkable once it merges. #3156 waits #3042 (stamp order). #3155 PF-17 part 1 draft.

**Lead B 2 pass, 05:5x IST 23 Nov:** **#3001 FO-7q merged** (23:56 UTC): R1.56's money reads on main. #3156 FO-7g part 3 fix: Lead B re-read OK c239c2175 (re-rate on Bill-to change). Next row sent: CS-MV1 binding line (adapter in place of failClosed in features/client-money-reads.ts) to the FO-7q or CS-MV1 lane. Slot: #3157 → #3042 → #3156. #3155 PF-17 part 1 draft.

**Lead B 2 pass, 05:2x IST 23 Nov:** **#3073 CS-MV1 merged** (23:26 UTC); its binding line follows #3001. #3157 (PF-21b DW6 test fix) Lead B read OK db799f6fa, queued; #3042 waits it. #3156 FO-7g part 3: one fix before the label (re-rate existing taxed lines on a Bill-to change, or refuse while taxed lines exist); lane text sent. #3155 PF-17 part 1 draft. #3001 queued.

**Lead B 2 pass, 04:5x IST 23 Nov:** **#3041 PF-F1b and #3017 PF-21b part 2 merged** (23:04 UTC). Queued: #3001, #3042, #3073. Next rows sent to Lead 9 for the three free lanes: PF-21b lane → PF-17 part 1 (brief PF-17-1.md, ready); PF-F1b lane → PF-Fw (no migration); FO-7ts part 3 lane → FO-7g part 3 (migration, slot after #3042). Held: FO-7q part 2 (after #3001), FO-9b part 1m (after #3042), both waiting on the records PR decision.

**Lead B 2 pass, 04:2x IST 23 Nov:** **#2999 CS-NT1 part 1 merged** (R1.76). #3001 FO-7q OVERDUE fix: Lead B re-read OK 84b4ab16e (chunked candidates, facts once per row; limit noted: rare status in a very large firm). #3073 merged main again (343981ef3), own 6 files, queued. #3042 labelled; #3041, #3017 queued. Records branch lead-b/2026-11-23-track-b-records @a1c2ce3ae waits the founder's decision (PR open refused in this session).

**Lead B 2 pass, 03:5x IST 23 Nov:** no merge since 02:5x. #3001 dequeued: its own DW1 OVERDUE page 696 ms > 300 ms; Lead 9 prompting its lane (session_01Ln6TiQZEG25BKeaDRJjEfy). #3042 full run going; hasMoney answered from main (port.ts:11-16 does not count tax treatments or trust payees) → new BACKLOG row **FO-9b part 1m**. Queued: #3073, #3017, #3041, #2999.

**Lead B 2 pass, 03:2x IST 23 Nov:** #3042 FO-9b part 1 re-stamped 20261123010000 with the F7 lift: Lead B re-read OK 4a36e3e92; question to the lane on whether hasMoney counts per-party tax treatments and trust payees (else a follow-up row FO-9b part 1m). #3001 and #3041 full runs re-running; queued: #3073, #3017, #3041, #2999.

**Lead B 2 pass, 02:5x IST 23 Nov:** **#2368 FO-7ts part 3 merged** (20:58 UTC). Risk sent to Lead 9: #3042 FO-9b part 1 queued on CI from before F7 (#3068) and #2368: its stamp 20261122100000 is older than main's newest, and its re-added foreign keys on walled fo_* tables are untested against check_pf8b_f7_data_walls; suggested dequeue, #3017 first, re-stamp + F7 lane text. #3001 full run going; #3041 re-run attempt 2; #3073, #3017, #2999 queued.

**Lead B 2 pass, 02:2x IST 23 Nov** (current Lead: Lead 9, local_482034a7): #2927 PF-4s part 1 merged. #3017 PF-21b part 2 Lead B read OK 96a6b1974 (F4 pair; seed in F7 shape; note: DB gate is "no firm", route key is the real gate). #3041 third main merge b91dc1eb9, no new read. Queued: #2368, #3073, #2999. #3001 after #2368; slot #2368 → #3042 → #3017.

**Lead B 2 pass, 01:5x IST 23 Nov:** correction to 01:2x: #3041's batch failure was its own (Lead 8: check_pff1b_bind shard 5, qa621 shard 6). Fix 0df34a67e: Lead B re-read OK 98bc7e023; /run full and label next. #3073 waits its diff-only Approve on 2366ac2be. #2368 queued; #3001 after it.

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
