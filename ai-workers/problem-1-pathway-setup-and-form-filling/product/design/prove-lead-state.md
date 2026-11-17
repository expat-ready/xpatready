# Prove Lead state (P-644): the channel to the Lead

**Seat:** Prove Lead, a cloud session (Opus 5.5, medium, P-608). It cannot message other sessions: **this file on branch `prove-lead/records` is the channel**; the Lead reads it at every 30-minute check and answers in the Prove Lead's session.
**Updated:** 17 Nov 21:43 IST (no merge since 21:32 IST 16 Nov); earlier 22:0x IST (22:00 check: R1.4 scored Partial on QA-499; #1982 merged → R1.42 brief; first records 21:08 IST), on main d66bcfd2d (20:11 IST).
**Sources read:** `qa/CAPABILITIES.md` and `qa/BUGS.md` on main d66bcfd2d; `MVP-CHECKLIST.md`, `BACKLOG.md`, `RULES.md` (as of P-644), the operating model and the forecast on `origin/lead/2026-11-07-lead31` (a61485f69); merged and open PR titles from GitHub's search API, read 21:0x IST.

## Needs the Lead (read first)
0. **21:43 IST: #2105 (AS-1m) merged 21:33 IST; no PR for any of the six last parts; no new qa PR; 4 runs queued (runners free). #2088 (QA-397 closed) has no review label yet.** Earlier, 20:53 IST: 24 h summary below: 0 new Works; six build PRs would make six rows whole (list in the summary). #2021, #2086, #2080, #2099 merged; queue checks #2105, #2008. #1959 still dequeued (Lead's read).** Earlier, 19:51 IST: QA-478 is closed on main by #2010 (merged 18:39 IST); #2097 was closed as a duplicate. #2073 (P-664: qa verdict records first in the queue) merged 19:23 IST with #2052, #2075, #2087. #1959 (R1.19) dequeued again: it waits on the Lead's diff read (P-423, head 57b0c2a, after PF-5t's lock change). 13 runs queued.** Earlier, 19:03 IST: batch #2095 merged 18:39 IST: #1956 PF-19b part 2 (SES, bounces, one-click unsubscribe), #2010 (QA-477/479 closed, on main), #1991 FO-7a2, #1918 FO-3a part 1a, #2062, #2092. #1956's signal: no row becomes whole. R1.28 still misses FO-2 part 3; R1.47/R1.49 stay held by QA-495 (case-side link mails bypass the one path; Build Lead C, not moved by #1956). **The after-merge lane takes them as its next re-score** (rows named by merged PRs; QA-498 retest after #2054 too); no new session. FO-3a parts 1b-i #2103 and 2a #2102 opened (R1.41, R1.42). qa #2097 (QA-478 closed) was dequeued: needs requeue. #1959 queued. 15 runs queued.** Earlier, 18:16 IST: batch #2094 merged 17:54 IST (#2054 QA-498 fix, #2017, #2030, #2079, #2071, #2042); none makes a row whole. #2095 (#1956 → R1.47/49, #2010) still checking; #2097 (QA-478 closed) queued. 20 runs queued.** Earlier, 17:29 IST: #2045 (PF-6m2) merged 16:46 IST; the queue runs again in big batches: #2094, #2095 (with #1956 → R1.47/49, #2010), #2096. qa #2097 (open): **QA-478 closed** (PF-6m/PF-6m2), R1.6 stays Partial (PF-6 part 2b, J-6 part 2). #1959 lost its label again. 40 runs queued.** Earlier, 16:42 IST: main unmoved 3 h 15 min. #2093 (#2045 alone) is near the end: 5 of 8 shards and all regression jobs green, shards 1, 6, 7 running since 15:57 IST. Only 4 runs queued. #1959 queued again.** Earlier, 15:54 IST: main unmoved since 13:27 IST (2 h 27 min); #2089 failed too and the queue now checks #2045 (PF-6m2) alone (#2093): one bad PR at the queue's head is holding every row signal, qa records included (#1956, #2010, #2073 wait behind it). The Lead: if #2045 fails alone, take it out so the rest can merge.** Earlier, 15:06 IST: main unmoved since 13:27 IST (1 h 39 min); batches #2083 (#1956, #2010), #2090, #2091 closed unmerged and the queue split again (#2089 checks #2045 + #2021). 14 runs queued, so the runners are free: the hold is failing batches. QA-478's retest (signal 03:34 IST) still has no qa PR (search by body too; #2045 PF-6m2 names it but is a build PR). R1.42 has no qa PR since 21:32 IST 16 Nov: **please restart the front office lane** from ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.42.md.** Earlier, 14:18 IST: correction: the R1.77 lane was not silent.** Its verdict rode in qa #2013 (merged 09:13 IST): **R1.77 Partial, QA-474 closed, QA-502 new (no screen for decision, close, reopen)**. qa #2088 (after-merge, open) closes **QA-397** (BK-21) and adds Minors QA-504, QA-505, QA-506, with verdicts for every app-code merge of 17 Nov; R1.6, R1.100, R1.98, R1.54, R1.102, R1.109 still have parts missing. R1.77 now waits on B5-filings and QA-502's screen (Build Lead C). Batch #2083 (#1956, #2010) still checking; 76 runs queued. Earlier, 13:30 IST: #2077 merged 13:27 IST (check fix). #1956 (PF-19b part 2 → R1.47/49 QA-495 retest) and qa #2010 requeued, together in batch #2083. No part PR yet for R1.4, R1.6, R1.77, R1.100. 71 runs queued.** Earlier, 12:44 IST: no merge since 11:31 IST; #2010 (QA-477/479) queued again. New PRs are tooling and checks (#2077, #2079-#2081), none a part of today's rows. 67 runs queued. Today's prove count stays 0 new rows until a Build Lead finishes one of: QA-499 fix #2029 (R1.4), PF-5t part 2 (R1.100), PF-6 part 2b + J-6 part 2 (R1.6), B5-filings (R1.77).** Earlier, 11:57 IST: qa #2059 (after-merge log) merged 11:31 IST. #2073 (P-664: qa verdict records first in the merge queue) opened: it answers tonight's loss 1. Unchanged: #1959, #1956, #2010 approved, not queued; #2032 dequeued; no PR for the last parts of R1.4, R1.6, R1.77, R1.100; 70 runs queued.** Earlier, 11:10 IST: no change since 10:38 IST (no merge, no new build or qa PR for today's rows; 68 runs queued). Checks move to every 45 min while nothing moves.** Earlier, 10:38 IST: #2035 (CS-S1 part 1, R1.102; parts PF-30a, PF-30s still open), #2020, #2043 merged 10:24 IST; none makes a row whole. Unchanged: #1959, #1956, #2010 approved, not queued; #2032 dequeued; no PR for the last parts of R1.4, R1.6, R1.77, R1.100; 69 runs queued.** Earlier, 10:05 IST: no merge since 09:13 IST; no new build or qa PR for today's rows; 82 runs queued; #1959, #1956, #2010 approved but not queued (they need the queue label again); #2032 dequeued.** Earlier, 09:34 IST: qa #2013 (QA-315 closed, on main) and #2056 (R1.4 gate A 17/17) merged 09:13 IST; R1.80 now waits only on QA-165 (the Lead's Validate run). #2010 (QA-477/479 closed) lost its queued label. No PR yet for the last parts of R1.4, R1.6, R1.77, R1.100; 93 runs queued.** Earlier, 09:02 IST: no merge since 08:00 IST; 85 runs queued. No open PR for PF-5t part 2 (R1.100), PF-6 part 2b or J-6 part 2 (R1.6), B5-filings (R1.77), or QA-499's #2029 out of draft (R1.4): the Build Leads' rows that would make today's rows whole. No new qa PR from the QA-478, R1.42, R1.77 or R1.100 lanes. #1959, #1956 approved, not queued; #2032 dequeued.** Earlier, 08:29 IST: #2041 BK-21 (QA-397's fix) and #2044 PF-6 part 2a (Team, Invite, Person panel) merged 08:00 IST. Signals: the R1.77 lane retests QA-397 with QA-474 (R1.77 then waits on B5-filings only); the permissions lane runs the part of `check_r16_walk.ts` that 2a covers, with QA-478's retest (R1.6 waits on PF-6 part 2b and J-6 part 2). #1959 and #1956 approved but not queued; #2032 dequeued; 74 runs queued.** Earlier, 07:57 IST: #1957 (PF-5t part 1) merged 07:07 IST → the platform lane runs R1.100's API half now (brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.100.md); the row waits on PF-5t part 2 (not started: Lead B). #2048 (R1.4 follow-up) merged. #1959 and #1956 lost their queued labels again; #2032 still dequeued. Day count below. Still no qa PR for QA-478, R1.42, R1.77.** Earlier, 07:04 IST: qa #2006 merged 06:35 IST (QA-493 closed on main). Batches checking: #2051 (#1957 R1.100), #2053 (#2041 BK-21 QA-397), #2055 (#2044 PF-6 part 2a, approved: R1.6 next). #2054 fixes QA-498 (Build Lead C). Still no qa PR for QA-478, R1.42, R1.77. 14 runs queued.** Earlier, 06:31 IST: #2034 and qa #1968 (R1.38/R1.40 walked on the booking page, Partial, QA-496) merged 06:28 IST. BK-21 #2041 (QA-397 fix, R1.77) approved and queued. #1957, #1959 still queued. Still no qa PR for QA-478, R1.42 or R1.77.** Earlier, 05:59 IST: no merge since 04:00 IST (2 h). #1957 (PF-5t part 1, R1.100) and #1959 (R1.19) are queued again; #1957 is in batch #2051 with #2040, #2048, stacked on #2034, #1968, #2006. Still no qa PR for QA-478, R1.42 or R1.77.** Earlier, 05:27 IST: still no merge since 04:00 IST (1 h 27 min). #1959 (R1.19) relabelled approved, not yet queued; #2048 (R1.4 follow-up) approved; #2006 batching (#2050). #1956 and #2032 still dequeued; #1957 unlabelled. No qa PR yet for QA-478, R1.42 or R1.77: please check those three lanes are running (they may have ended). 32 runs queued.** Earlier, 04:54 IST: no merge since 04:00 IST. CI-RUN #2032 (overflow runners) was dequeued; #1956 still dequeued; #1957, #1959 still unlabelled. Batch #2049 checks #2034 + #1968 (qa R1.38/R1.40). No qa PR yet for QA-478's retest, R1.42 or R1.77. 34 runs queued.** Earlier, 04:23 IST: batch #2037 merged at 04:00 IST: #2002 CS-C1b (R1.77's signal), #1999 (R1.4's Partial verdict, now on main), #1998, #2025, #2028, #2015, #1990. R1.77's start line is live below: the case side lane is free (R1.80 done) and should take it rather than a new session. #1957 and #1959 lost the label because new commits put ci back to pending (queue gate B194, 22:13 IST on #1957): they need green ci and a label again. qa #2048 (R1.4 follow-up on Lead 70's QA-499 ruling) opened. 50 runs queued.** Earlier, 03:50 IST: batch #2036 merged at 03:34 IST: #1945 PF-6m (QA-478's fix), #1950 (qa), #1865, #1989, #1997, #2007. Signal fired: the permissions lane retests QA-478 now. PF-6 part 2a #2044 (Team, Invite, Person panel) opened for R1.6. #1957 (R1.100) and #1959 (R1.19) are no longer labelled queued: please check why. #1956 still dequeued. 31 runs queued.** Earlier, 03:18 IST: batches #2036 (#1945) and #2037 (#2002, #1999) still checking; #1956 still dequeued (not requeued). New: BK-21 #2041 (open) fixes QA-397, R1.77's other hold, so R1.77 needs #2002, #2041 and B5-filings.** Earlier, 02:47 IST: main moved: #1988 merged 02:37 IST (50cb489bd), the first merge in 5 h 5 min. Two batches now check on it: #2036 (#1945 R1.6, #1950 qa) and #2037 (#2002 CS-C1b → R1.77, #1999 R1.4's qa verdict). #1956 (PF-19b part 2 → R1.47/49) was dequeued 02:37 IST (CHECKS_TIMEOUT); its lane asks the Lead to requeue it (Question for the tech lead on #1956, 02:38 IST). A failure in batch #2004 shard 2 was `check_fo3w_manage_browser.ts` (`fo_consultation_type` check constraint), FO-3w part 2's pack on main (#1982): if it fails again on main, it is a front-office bug for Lead B and R1.42's lane should see it.** Earlier, 02:14 IST: main unmoved 4 h 42 min, but the runner backlog has cleared (4 queued, 10 running); #2033 (#1988) still checking. CS-C1b #2002 is now approved and queued: R1.77's signal is next in line.** Earlier, 01:43 IST: main unmoved 4 h 11 min; #2033 (#1988 alone) still checking; 51 queued, 6 running; no new PR since 00:05 IST. Prove output tonight is zero until the queue moves; the qa lanes have their next rows and wait.** Earlier, 01:11 IST: main unmoved 3 h 39 min. Batch #2022 (#1988 + #1956) closed unmerged; the queue now checks #1988 alone (#2033), so #1956 (R1.47/49) has dropped back. 54 runs queued, 8 running.** qa #1999 (R1.4) is now queued. Earlier, 00:40 IST: main still unmoved (3 h 8 min); runs queued fell 125 → 61, 10 in progress; no new PR since 00:05 IST.** Earlier, 00:08 IST 17 Nov: main unmoved 2 h 36 min (since 21:32 IST). Cause, measured: GitHub Actions has 125 runs queued and 9 in progress; merge batch #2022 (#1988 + #1956) has been checking since 22:38 IST.** The bigger 22:05 IST batch #2004 was split at 22:37 IST. CI-RUN #2032 (overflow runners, opened 23:5x IST) is the only fix in sight; it is the Lead's. Every prove signal tonight (#1945 R1.6, #1957 R1.100, #1956 R1.47/49, #1959 R1.19, #2029 R1.4) sits behind it. R1.4 misses its 01:47 IST target: its first verdict came in time (21:5x IST, Partial), but Works needs #2029 merged and a re-run. Earlier, 23:36 IST: QA-499's fix is open: PF-12b part 1 #2029 (draft, 23:32 IST; audit row, so "Ready for Lead read", P-423).** When it merges, R1.4 goes back in the prove queue (if PF-12b has a later part, R1.4 waits for it). qa #1999 is now labelled. **Main has still not moved since 21:32 IST (2 h 4 min);** every row-moving PR is queued behind it. Earlier, 23:04 IST: still nothing merged since #1982 (21:32 IST), 92 min; main f7dde02c8.** Merge-queue batches #2023 and #2024 closed without merging (22:3x-23:0x IST); #2022 is checking #1988 + #1956. Every prove signal tonight sits behind this queue (P-644 §2 item 0: runners). No QA-499 fix PR yet (Lead B). Earlier, 22:33 IST: The merge queue holds eight approved PRs that move rows: #1945 (R1.6), #1957 (R1.100), #1956 (R1.47/49), #1959 (R1.19) and the qa records #2006, #2010, #2013, #1968, #1950. qa #1999 (R1.4's verdict, QA-499) has no label yet: it needs its Opus Approve and the label (P-385). No qa PR yet for R1.42 (front office lane) or R1.4's re-run (after-merge lane): please check that both lanes have their next row.
1. **The "built, awaiting qa" list is shorter than the forecast says.** Of R1.4, R1.16, R1.38, R1.40, R1.80 and R1.100, only **R1.4** has every part merged and no open Major on it. The other five each have a part not merged or an open Major (table below, with the evidence). Scoring them now gives Partial again and spends a lane for nothing (P-606 (2); `design/qa-optimisation-2026-11-16.md` §1.3: 95% of first verdicts were Partial because rows were scored before they were whole). **Records to correct (yours, P-314):** MVP-CHECKLIST rows 38 and 40 say "Merged" on FO-3 alone; qa's rows list FO-3w part 1 (merged #1921 12:29 IST), FO-3st1 (R1.38) and J-38 as parts; row 80 says "Merged" while QA-315 and QA-165 (Majors) hold it.
2. **R1.4 is 7.5 h old (built 13:47 IST).** The 12 h target means its verdict by **01:47 IST 17 Nov**. Please start lane 1 first.
3. ~~QA-165's Validate run~~: the Lead's, scheduled on the Mac (Lead 69, 21:10 IST).
4. **QA-449 (R1.16) is pipeline work:** container smoke (`skeleton.yml`) on every merge batch, BACKLOG CI-1, never built. The Lead takes it (CI) and shapes a lane (Lead 69, 21:10 IST). R1.16 cannot be proven until it lands.
5. **Idle qa capacity tonight:** only one row is ready, so one of the two "qa: score Built R1 rows" lanes should end rather than wait (P-337); restart it on the next merge signal below.

## 24 h summary, 16 Nov 21:08 → 17 Nov 20:53 IST (the seat's first day)
Source: `qa/CAPABILITIES.md` R1 rows on main d66bcfd2d (start) against main 255ebb17c (20:53 IST); merged and open PRs from GitHub's API. Sample: all 101 R1 rows.
* **Works: 11 → 11 (0 new). Target 10 a day, floor 7: missed.** Partial 22 → 26, Not built 67 → 64, "Built, awaiting qa" 1 → 0. Rows moved by first verdicts: R1.4 (Not built → Partial, QA-499), R1.77 (Partial, QA-474 closed, QA-502 new), R1.100 and two others to Partial with parts named.
* **Built → first verdict:** R1.4 8 h (13:47 → 21:5x IST), under the 12 h target. No row reached Works, so built → Works is not measured.
* **Majors closed on main:** QA-477, QA-479, QA-478 (#2010), QA-493 (#2006), QA-315 (#2013), QA-474 (#2013). QA-397 closed in #2088 (open). QA-498's fix #2054 merged (retest due). **New:** QA-499 (Major, R1.4), QA-502 (R1.77), Minors QA-500, QA-504, QA-505, QA-506.
* **What holds each candidate row now (none is whole):**
| Row | Hold | Owner |
|---|---|---|
| R1.4 | QA-499 fix #2029 still a draft (opened 23:32 IST 16 Nov) | Lead B |
| R1.6 | PF-6 part 2b, J-6 part 2 (no PR) | Lead B |
| R1.100 | PF-5t part 2 (no PR) | Lead B |
| R1.19 | #1959 waits on the Lead's diff read (P-423); PF-5s | the Lead, Lead B |
| R1.28 | FO-2 part 3 (no PR) | Lead B |
| R1.42 | FO-3a part 2a #2102, 1b-i #2103 (open), FO-3st1, FO-3st3 | Lead B |
| R1.47, R1.49 | QA-495: case-side link mails bypass the one path (no row) | Build Lead C |
| R1.77 | B5-filings (no PR), QA-502 screen | Build Lead C |
| R1.80 | QA-165's Adobe Validate run on the Mac | the Lead |
* **Three biggest losses, with one fix each:**
  1. **Merge queue stalls: ~8.4 h with main unmoved** (21:32 → 02:37 IST, then 13:27 → 16:46 IST), from runner starvation at night and failing batches by day. *Fix:* #2073 (qa verdicts first) merged 19:23 IST; land CI-RUN #2032 (dequeued since 22:3x IST 16 Nov).
  2. **No PR for the last part of any candidate row all day.** Build output went to other rows (FO-7ts, FO-9, CS-NK1, AS-1m, PF-4dn ...). *Fix (P-644 rule 2, fewest parts left first):* Build Leads take next: #2029 out of draft; PF-5t part 2; PF-6 part 2b + J-6 part 2; FO-2 part 3; B5-filings; a row for QA-495. Those six PRs make six rows whole.
  3. **qa lanes slow or silent:** R1.42's lane has given no qa PR in 23 h; the QA-478 retest came 15 h after its signal. My own title-only search wrongly called the R1.77 lane silent for 10 h (its verdict rode in #2013). *Fix:* restart the front office lane on R1.42 from its brief; I now search PR bodies too.

## Day count, 16 Nov 08:00 → 17 Nov 08:00 IST (P-644: 10, floor 7)
Source: `qa/CAPABILITIES.md` R1 rows with status Works, main 39604190f (last first-parent commit before 08:00 IST 16 Nov) against main bcc505afd (07:57 IST 17 Nov). Sample: all 101 R1 rows.
* **Works: 4 → 11 (+7), at the floor.** Of the 7, **1 is a new R1 verdict (R1.99, 11:5x IST 16 Nov)**; **6 are M2/M3 C-row proofs re-confirmed when the table grew to 101 rows** (R1.63, 73, 82, 83, 84, 101; 18:23 IST). By P-500 the proving rate on newly built rows is **1 a day**, not 7.
* **Prove Lead's window (21:00 → 08:00 IST): 0 Works.** First verdicts: R1.4 Partial (QA-499), **8 h** from built (13:47) to first verdict (21:5x), under the 12 h target; built → Works not reached (fix #2029 still a draft). Majors closed or narrowed on qa PRs: QA-477, QA-479 (#2010, not yet merged), QA-493 (#2006, on main), QA-315 (#2013, queued).
* **Three biggest prove losses tonight, with one fix each:**
  1. **The merge queue and runners:** main did not move from 21:32 to 02:37 IST (5 h 5 min); 125 runs queued at 00:08 IST; batches #2004, #2022, #2023, #2024 failed or timed out; #1956 and #2032 were dequeued. Every prove signal waited behind it. *Fix:* land CI-RUN #2032 (overflow runners; the Lead's) and keep qa PRs out of code batches (records-only batches merge alone).
  2. **Rows called built that were not whole:** 1 of the 6 rows on the 16 Nov list (R1.4) had every part merged; the other 5 had a part open or a Major. *Fix:* the queue is built only from merged part titles and qa's open Majors (as this file now does); the checklist's "Merged" marks for rows 38, 40 and 80 corrected by the Lead.
  3. **Silent lanes after a signal:** QA-478's retest (signal 03:34 IST), R1.42 (21:32 IST) have no qa PR at 07:57 IST: 4.4 h and 10.4 h (correction 14:18 IST: R1.77's verdict rode in qa #2013, merged 09:13 IST). *Fix:* the Lead's 30-minute check restarts a lane with no push 60 min after its signal (P-339b), from its brief.
* **Today's need (P-644):** 10 proven needs rows that are whole. Whole or nearly whole this morning: R1.4 (on #2029), R1.100 (PF-5t part 1 #1957 merged 07:07 IST; part 2 not started), R1.80 (on QA-165's Validate run), R1.6 (#2044 queued; part 2b and J-6 part 2 open). That is at most 3-4 rows today unless Build Leads finish more parts; the shortfall is in building whole rows, then in the queue.

## Prove queue (every part merged, not yet qa Works; oldest built first)
**Empty at 22:00 IST.** R1.4 (PF-12, built 13:47 IST) got its first verdict at ~21:5x IST, 8 h after built: **Partial, held by QA-499 (Gap · Major: a bypass use writes no audit line)**, qa #1999 (open, no label yet). Pack run for P-339: merge batch ci 43872700544, job 133320361478, `check_pf12_walls.ts` 100/100; gate A by API `tests/qa/check_r14_walls_gate_a.ts` 16/16 twice. R1.4 returns to the queue when QA-499's fix merges (Lead B); the after-merge lane then retests and makes the independent re-run.

**Nothing else is whole yet.** The Lead's list, checked part by part:
| Row | What is merged | What holds it (evidence) | Ready when |
|---|---|---|---|
| R1.100 Terms acceptance | PF-5 part 1 #1815 (07:39 IST 16 Nov) | PF-5t part 1 PR #1957 open (no label); PF-5t part 2 (screens) not started (BACKLOG PF-5t) | PF-5t parts 1 and 2 merged |
| R1.16 Automated testing | PF-7 | QA-449 Major open: the container smoke never runs on merge batches; CI-1 not built | CI-1 merged, QA-449 retested |
| R1.38 Time zones | FO-3 #1760, FO-3w part 1 #1921 (12:29 IST 16 Nov) | FO-3st1 and J-38 not built (no PR); qa #1968 (queued) walked the new page: Partial | FO-3st1, J-38 merged |
| R1.40 Invite files | FO-3, FO-3w part 1 #1921 | J-38 not built | J-38 merged |
| R1.80 IRCC forms per applicant | BK-10, BK-16, BK-22 to BK-24; C7.1, C7.8 Works | C7.2 Partial on QA-165 only (QA-315 closed, qa #2013 queued: C7.2 pack 11/11 on the checkpoint) | QA-165's Validate run |

**Next to become whole (merge signals the lanes watch):**
| Signal | Rows it moves | Still missing after it |
|---|---|---|
| ~~#1945 PF-6m~~ merged 03:34 IST; ~~PF-6 part 2a #2044~~ **merged 08:00 IST 17 Nov** | R1.6 | PF-6 part 2b, J-6 part 2 (qa #2010; walk written ahead, `check_r16_walk.ts`) |
| ~~#1957 PF-5t part 1~~ **merged 07:07 IST 17 Nov** | R1.100 | PF-5t part 2 (not started) |
| #1959 PF-5 part 2 (open; QA-481's fix) | R1.19 | PF-5s sign-up screens |
| ~~#1982 FO-3w part 2~~ **merged 21:32 IST** | R1.42 | FO-3a, FO-3st1, FO-3st3 (to confirm by the front office lane) |
| #1956 PF-19b part 2 (queued) | R1.47, R1.49 | QA-495 (invitation, sign-up and case-side link mail bypass the one path) |
| ~~CS-C1b #2002~~ **merged 04:00 IST 17 Nov** | R1.77 | B5-filings; C8.2 on QA-397 (fix BK-21 #2041 open) |
| QA-499's fix: PF-12b part 1 #2029 (draft, opened 23:32 IST) | R1.4 | PF-12b's later parts, if any |
| QA-165's Validate run (the Lead, Mac) | R1.80 | nothing: QA-315 closed by qa #2013 (queued), so R1.80 waits only on QA-165 |

## Start qa (for the Lead)
**Lead 69's answer (read at 3edc29173, 21:10 IST): existing lanes take R1.4, R1.6, R1.27, R1.80 (table below); no new starts now.** New lanes start only on these signals; the Prove Lead writes a live `start qa:` line here when one fires:
* **start qa: R1.77 brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.77.md** — signal fired: CS-C1b #2002 merged 04:00 IST 17 Nov. Give it to the free **qa · case side group** lane if it is still running; else start a session. The row stays Partial (B5-filings, QA-397 fix BK-21 #2041 open); the lane closes or narrows QA-474.
* waiting: R1.100 brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.100.md — signal: #1957 (PF-5t part 1) and PF-5t part 2 both merged
* **fired 21:32 IST:** R1.42 brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.42.md — #1982 merged; **for the existing qa · front office group lane** (no new start)
* fired 18:39 IST: #1956 merged → R1.28, R1.47, R1.49 to the **existing after-merge lane** (re-score; parts check: R1.28 misses FO-2 part 3; R1.47/49 held by QA-495). No new session.

No new session needed at 22:00 IST: R1.42 goes to the front office lane.

## Next row per qa lane (existing lanes)
| Lane | Next row | Why, and the signal |
|---|---|---|
| qa after-merge | done: qa #2006 (QA-493 closed, R1.27 parts missing FO-4b, QA-500 new). Next: **R1.4's independent re-run** (run 43872700544, job 133320361478) now, and QA-499's retest when its fix merges | the re-run must be a lane other than the one that scored |
| qa · front office group | **R1.42 now**, brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.42.md (#1982 merged 21:32 IST) | QA-496 retest; R1.38/R1.40 walk on the same run |
| qa · case side group | done: qa #2013 (QA-315 closed). Next: **R1.77** QA-474 and QA-397 retests now (brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.77.md); score on CS-C1b #2002 | R1.80 waits on the Lead's Validate run |
| qa · platform group | done: qa #1999 (R1.4 Partial, QA-499). Next: **R1.19** on #1959 merging (approved, queued: QA-481 retest); meanwhile **R1.100**'s check written ahead (brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.100.md), scored on #1957 (queued) and PF-5t part 2 | — |
| qa: score Built (permissions…) | done: qa #2010 (QA-477, QA-479 closed; parts missing PF-6 part 2a/2b, J-6 part 2). Next: **QA-478 retest now** (#1945 merged 03:34 IST 17 Nov; `check_r16_money_keys_by_invitation.ts`); then R1.6 in full when PF-6 part 2a #2044, part 2b and J-6 part 2 merge (walk written ahead) | — |
| qa: score Built (platform, money, sales) | ended by Lead 69 | restart on a signal above |

## Bugs to route
No Blocker or Critical is open (BUGS.md on main d66bcfd2d). Majors first, then the new Minor; the fix, where one is in flight, is named.
| Bug | Sev | Row | To | Fix in flight / ask |
|---|---|---|---|---|
| **QA-499** | **Major (new, qa #1999)** | **R1.4** | **Lead B** | **a use of the bypass role writes no audit line; the only hold on R1.4; fix PF-12b part 1 #2029 (draft)** |
| QA-481 | Major | R1.19 (next R1.5) | Lead B | sign-up code never confirmable in the app; PF-5 part 2 #1959 open |
| QA-478 | Major | R1.6 | — | closed on main by qa #2010 (merged 18:39 IST 17 Nov) |
| QA-477 | Major | R1.6 | — | closed on main (qa #2010 merged 18:39 IST 17 Nov) |
| QA-493 | Major | R1.27 | — | closed on main (qa #2006 merged 06:35 IST 17 Nov) |
| QA-494 | Major | R1.27 | the Lead (wording) / Lead B | capability text to "manual; import when AG-18's engine lands" |
| QA-495 | Major | R1.47, R1.49 | **Build Lead C** (case-side link and code mails: `person-link.ts` writes `demo_message` directly) | PF-19b part 2 #1956 merged 18:39 IST but does not move these; no row yet |
| QA-452 | Major | R1.13 | Lead B | job queue not in ready, no job metrics, stuck-job alarm has no caller; no fix seen |
| QA-482 | Major | R1.59 | Lead B (FO-7) | tax rounded per line, round-half-to-even not stated; FO-7b not built |
| QA-449 | Major | R1.16 | the Lead (CI) | CI-1: Lead 69 shapes a lane |
| QA-474 | Major | R1.77 | — | closed by qa #2013 (merged 09:13 IST 17 Nov) |
| QA-502 | (new, qa #2013) | R1.77 | Build Lead C | no screen for decision, close and reopen |
| QA-471 | Major | R1.74 | Build Lead C | CS-DL1 not built |
| QA-472 | Major | R1.76 | Build Lead C | CS-NT1 not built |
| QA-397 | Major | R1.77 (C8.2) | — | closed by qa #2088 (open, after-merge) on BK-21 #2041 |
| QA-504, QA-505, QA-506 | Minor (new, qa #2088) | R1.6 (403 shows a raw key; Team table at 375 px), R1.109 (no menu entry to Complaints) | Lead B | — |
| QA-315 | Major | R1.80 (C7.2) | — | closed on main (qa #2013 merged 09:13 IST 17 Nov) |
| QA-165 | Major | R1.80 (C7.2) | the Lead (Mac Validate run) | scheduled by Lead 69 |
| QA-497 | Major | C4.11 suite (retry pass) | Build Lead C | #1988 C4.11-G5 queued (flake fix) |
| QA-498 | Major | BK-5 demo start double click | Build Lead C | fix #2054 merged 17:54 IST 17 Nov; retest by after-merge |
| QA-427, QA-439 | Major (UX) | C6.1, C6.2, C4.9 | Build Lead C | no fix seen |
| QA-201, QA-181 | Major (tooling) | CI type check, qa lane setup | the Lead | — |
| QA-496 | Minor (on #1968, queued) | R1.42 | Lead B | FO-3w part 2 #1982 merged; retest by the front office lane |
| QA-500 | Minor (new, qa #2006) | R1.27 (FO-4sf pack) | Lead B | the pack cannot run twice on one database (line 177 never restores a lead) |

## Making proving smaller per row, never weaker (P-640)
* **Score only whole rows** (P-606 (2)): lanes check parts first (`python3 tools/trace-requirements.py --brief <row>` and merged titles) and, with a part missing, write one line "parts missing: <ids>" with no walk and no reader. Most of yesterday's qa time went on rows that could only be Partial.
* **One pack per row, written ahead:** a lane waiting on a signal writes the row's journey and check now (`tests/qa/check_r1<n>_*.ts`), so on the merge it runs once on GitHub's runners and the reader rules.
* **Reuse journeys:** R1.4 reuses `check_pf12_walls.ts`; R1.6 reuses `check_r16_*`; R1.38/40/42 reuse `check_r140_inbox_walk.ts` and the TZ walk.
* **GitHub runners are the bottleneck (~90 min waits):** P-339's run is the merge batch that made main's head (its run id and job ids) whenever it covers the row; lanes ask for a dispatch only when no batch covers it, and run nothing heavy locally twice.
* **Gate A** by screens; by API where no screen exists (P-616): R1.4 is by API. **Gate B** per P-339 and P-317: an open Major keeps a row Partial.

## UI/UX bar (P-473, P-352)
Each module's first proven row adds a best-in-class design check to the walk, gaps as qa *Suggestions* (never Bugs unless a rule is broken). Module firsts in the queue: front office (R1.38/R1.40/R1.42, the booking pages: the first front-office screen row), platform staff screens (R1.6 when PF-6's screens land), sign-up and terms (R1.100). R1.4 has no screen, so no design check.

## Own qa run
Not started this turn. The brief allowed R1.100, but R1.100 is not whole (PF-5t open), so a run would give "parts missing" only. If the Lead cannot start lane 1 within the next check, the Prove Lead will run R1.4 itself as a qa PR from origin/main (`qa:` title), on an Opus `Reviewer: Approve <sha>` and green ci (P-385). Superseded: the platform lane has R1.4 (Lead 69).

## Log
* 16 Nov 21:1x IST: first records; queue checked part by part; briefs R1.4, R1.6, R1.77, R1.100.
* 16 Nov 21:29 IST: Lead 69's answer applied: lanes mapped to existing qa sessions; R1.77, R1.100, R1.42, R1.47/49 wait on their signals; QA-165 and QA-449 are the Lead's.
* 16 Nov 22:0x IST: check: R1.4 Partial (QA-499, qa #1999), 8 h built → first verdict; QA-477, 479, 493, 315 closed by qa #2010, #2006, #2013; #1982 merged → R1.42 brief for the front office lane; next rows per lane refreshed.
* 16 Nov 22:33 IST: check: no merge since 21:32 IST; eight row-moving PRs queued; #1999 unlabelled; no R1.42 or R1.4 re-run PR yet. No new start line.
* 16 Nov 23:04 IST: check: no merge in 92 min; batches #2023, #2024 closed unmerged; #1999 still unlabelled; no QA-499 fix, no R1.42 or re-run PR. No new start line.
* 16 Nov 23:36 IST: check: QA-499 fix PF-12b part 1 #2029 opened (draft); #1999 labelled; main unmoved 2 h 4 min. No new start line.
* 17 Nov 00:08 IST: check: runners starved (125 queued, 9 running); batch #2022 checking 90 min; CI-RUN #2032 open. No new start line.
* 17 Nov 00:40 IST: check: main unmoved 3 h 8 min; 61 runs queued, 10 running. No new start line.
* 17 Nov 01:11 IST: check: #2022 failed, #2033 checks #1988 alone; main unmoved 3 h 39 min; #1999 queued. No new start line.
* 17 Nov 01:43 IST: check: main unmoved 4 h 11 min; #2033 checking; 51 queued, 6 running. No new start line.
* 17 Nov 02:14 IST: check: runners cleared (4 queued); main unmoved 4 h 42 min; #2002 CS-C1b approved and queued. No new start line.
* 17 Nov 02:47 IST: check: #1988 merged 02:37 IST; #2036, #2037 batching #1945, #2002, #1999; #1956 dequeued (timeout, requeue asked). No new start line yet.
* 17 Nov 03:18 IST: check: batches #2036, #2037 checking; #1956 still dequeued; BK-21 #2041 opened for QA-397. No new start line.
* 17 Nov 03:50 IST: check: #2036 merged (#1945 PF-6m → QA-478 retest now); #2044 PF-6 part 2a opened; #1957, #1959 lost their queued label; #1956 still dequeued.
* 17 Nov 04:23 IST: check: #2037 merged (#2002 CS-C1b, #1999); R1.77 start line live (case side lane); #1957, #1959 need ci and label again; qa #2048 opened.
* 17 Nov 04:54 IST: check: no merge since 04:00; #2032 dequeued; no new qa PR. No new start line.
* 17 Nov 05:27 IST: check: no merge 1 h 27 min; #1959 relabelled; no qa PR for QA-478, R1.42, R1.77 (lanes to check).
* 17 Nov 05:59 IST: check: no merge 2 h; #1957, #1959 queued again (#1957 in batch #2051).
* 17 Nov 06:31 IST: check: #1968, #2034 merged 06:28; #2041 queued.
* 17 Nov 07:04 IST: check: #2006 merged; #2044 PF-6 part 2a queued; #2054 for QA-498.
* 17 Nov 07:57 IST: day count written (+7 Works at the floor; 1 new R1 verdict); #1957 merged → R1.100 API half; #1959, #1956 unqueued again.
* 17 Nov 08:29 IST: check: #2041 BK-21 and #2044 PF-6 part 2a merged 08:00; R1.77 and R1.6 lanes have work.
* 17 Nov 09:02 IST: check: no merge since 08:00; no PR for the last parts of R1.4, R1.6, R1.77, R1.100; lanes still silent.
* 17 Nov 09:34 IST: check: #2013, #2056 merged 09:13; #2010 unqueued; 93 runs queued.
* 17 Nov 10:05 IST: check: no change; #1959, #1956, #2010 approved, unqueued.
* 17 Nov 10:38 IST: check: #2035, #2020, #2043 merged; no row whole.
* 17 Nov 11:10 IST: check: no change; next check 45 min.
* 17 Nov 11:57 IST: check: #2059 merged; #2073 (qa records first) opened.
* 17 Nov 12:44 IST: check: no merge; #2010 queued; no part PR for today's rows.
* 17 Nov 13:30 IST: check: #2077 merged; #1956 and #2010 in batch #2083.
* 17 Nov 14:18 IST: correction: R1.77 scored Partial in #2013 (QA-474 closed, QA-502 new); QA-397 closed in #2088; new Minors QA-504-506.
* 17 Nov 15:06 IST: check: main unmoved 1 h 39 min; batches failing, runners free; R1.42 lane restart asked.
* 17 Nov 15:54 IST: check: main unmoved 2 h 27 min; queue bisecting to #2045 alone.
* 17 Nov 16:42 IST: check: #2093 5/8 shards green, 3 running; main unmoved 3 h 15 min.
* 17 Nov 17:29 IST: check: #2045 merged 16:46; QA-478 closed (qa #2097); #1956 in batch #2095.
* 17 Nov 18:16 IST: check: #2094 merged (QA-498 fix #2054); #2095 checking.
* 17 Nov 19:03 IST: check: #2095 merged (#1956, #2010); R1.28/47/49 to the after-merge lane; QA-495 to Build Lead C; #2097 dequeued.
* 17 Nov 19:51 IST: check: QA-478 closed on main (#2010); #2073 merged; #1959 waits on the Lead's diff read.
* 17 Nov 20:53 IST: 24 h summary written: 0 new Works; holds per row; three losses and fixes.
* 17 Nov 21:43 IST: check: #2105 merged; no last-part PR; runners free. Checks every 60 min while nothing moves.
