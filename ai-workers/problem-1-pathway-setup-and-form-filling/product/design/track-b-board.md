# Track B board (case side, client money, and the rows Lead 4 added under A286)

Kept by Lead B (Track B) on branch `lead-b/2026-11-22-track-b`; the Lead takes it with each records PR. Times IST. Goal (founder, A286): 12-15 proven capabilities. Briefs: `design/briefs/track-b/`. Plan and forecast: `design/track-b-plan-2026-11-22.md`.

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
