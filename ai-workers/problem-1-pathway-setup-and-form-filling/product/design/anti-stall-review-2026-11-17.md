# Did yesterday's anti-stall changes work? Review of founder-away nights 6-7 to 16-17 Nov

Written 17 Nov 09:30 IST (TZ=Asia/Kolkata date). Read-only review: nothing on GitHub or in the repo was changed.
Data was fetched 08:04-09:23 IST by five lenses: Lead loop, merge flow, answer speed, CI capacity and a mechanism inventory, plus per-mechanism verdicts and a critic pass.
Night window: a fixed 23:30-07:30 IST for all 11 nights, so they compare fairly. The real away times differ on some nights. On 16-17 the founder answered cards until about 00:5x (DECISIONS P-649 to P-652) and was back at about 07:40 (P-653). On 10-11 he was typing at 00:4x (P-457).
Baseline: all 11 nights, 6-7 to 16-17 Nov, unless a line names a smaller sample. The answer-speed lens covers only 5 nights (12-13 to 16-17), because it read only PRs updated since 13 Nov.

---

## 1 The answer in five lines

1. **The Lead loop is better, but not fixed.** The longest Lead silence was 272-452 min on 5 of the 7 nights 6-7 to 12-13 Nov, then 28-65 min on 13-14, 14-15 and 15-16, then 103 min on 16-17 (150 min counting commits only). Over all 11 nights, 6 had a silence over 90 min. Sources: git log --all plus the issues/comments API.
2. **The permission-prompt stall (7.4 h, P-388) has not come back since 9 Nov** (8 nights). But every watcher that should catch a stuck Lead runs inside a Lead session, and none leaves a record. There were 0 check commits on 16-17 from 23:01 to 07:30 (2f6cb38d7, 780637979). The only check run that can be proven is the one at 00:14 (works-20261117.txt mtime).
3. **The delivery pipeline did not hold on 16-17.** Nothing merged from 21:32 to 02:37 (5h05; pulls API). 14 of 26 merge batches failed (3134b2eae). The median time to answer a lane's question was 194 min, against 1-21 min on the 3 nights before (5-night sample). Release 1 Proven stayed at 11 of 101, +0 overnight (STATE.md:5, the Lead's own record, not re-measured).
4. **The cause was the pipeline, not idle agents.** Run volume was about 8 times the earlier nights (2,223 runs against 43-639; actions/runs). On top of that came merge conflicts on shared module cards, flaky suites, and Lead-only actions (re-runs, requeues, diff reads) waiting on one Lead. The night queue started more work (13-14 lane PRs against a median of 2) but did not add merges (4 merged, the same as 15-16 Nov without it).
5. **So keep the ideas, but move them out of the Lead's session.** Watchers belong in scheduled GitHub workflows or a Mac background job, with a pushed log. Answer detection must count Build Lead replies. The routines need a work-in-progress brake. Each "prose" rule becomes a hook or CI step, always on, not only while the founder is away.

---

## 2 Measured, night by night

### 2a Lead loop: did a Lead keep working? (sample: all 11 nights; Lead commits on all refs plus Lead-signed PR comments)

| Night (Lead) | Lead commits / PR comments | Longest Lead silence | Hand-over gap | Check commits |
|---|---|---|---|---|
| 6-7 (24) | 1 / 4 | 452 min, 23:57-07:29 (241590c96) | none in window | 0 |
| 7-8 (33) | 1 / 6 | 366 min, 01:24-07:30 (comment #1246) | none | 0 |
| 8-9 (36) | 0 / 2 | 389 min, 01:01-07:30 (the records say stalled 00:48-08:02, 2f15d0693) | none in window | 0 |
| 9-10 (3->4->5) | 31 / 2 | 61 min | 23 min and 42 min (6354cd635..351924465) | 9 |
| 10-11 (10) | 7 / 3 | 272 min, 02:58-07:30 (47113e038, "queue empty") | none | 0 |
| 11-12 (20->21->22) | 24 / 3 | 31 min | 4 min and 6 min | 14 |
| 12-13 (28) | 6 / 0 | 303 min, 02:27-07:30 (network down, P-508) | none in window | 6 |
| 13-14 (38->39) | 34 / 6 | 65 min | 2 min | 10 |
| 14-15 (50) | 36 / 18 | 28 min | none | 5 |
| 15-16 (61->62->63) | 82 / 45 | 58 min | 2 min and 2 min | 9 |
| 16-17 (70->71->72) | 31 / 26 | 103 min, 05:30-07:13 (150 min commits only, 04:43-07:13; 6ba80aff0, bab2ca020) | 11 min; 7-12 min | 0 (last 23:01, next 07:30) |

The longest silences, sorted (n=11): 28, 31, 58, 61, 65, 103, 272, 303, 366, 389, 452 min. The median is 103 min.
Recorded causes of the long silences: two permission prompts (6-7, P-388; 8-9, "probably" a run_in_terminal prompt, 2f15d0693), an empty queue waiting for the founder's clicks (10-11, 47113e038), the network (12-13, P-508/P-509), and for 7-8 and the end of 16-17 none is recorded.

### 2b Merge flow to main (sample: 450 merged PRs, 6 Nov 00:00 to 17 Nov 08:04 IST; the baseline is the 10 nights 6-7 to 15-16)

| Night | Merged (app / records, title rule) | Merges per hour | Longest no-merge in window | Recorded cause |
|---|---|---|---|---|
| 6-7 | 3 (2 / 1) | 0.38 | 7h29 (ran on to 08:40) | Lead stalled on a prompt (P-388) |
| 7-8 | 15 (12 / 3) | 1.88 | 1h37 | - |
| 8-9 | 4 (3 / 1) | 0.50 | 6h24 (ran on to 08:59) | Lead stalled (2f15d0693) |
| 9-10 | 10 (5 / 5) | 1.25 | 2h53 | - |
| 10-11 | 9 (8 / 1) | 1.12 | 4h46 (ran on to 10:54) | queue empty (47113e038) |
| 11-12 | 17 (14 / 3) | 2.12 | 2h07 | - |
| 12-13 | 4 (4 / 0) | 0.50 | 3h08 (ran on to 08:42) | Mac offline (P-508) |
| 13-14 | 10 (9 / 1) | 1.25 | 2h51 | - |
| 14-15 | 8 (8 / 0) | 1.00 | 2h01 | - |
| 15-16 | 33 (8 / 25) | 4.12 | 0h54 | 22% of batches failed (P-622) |
| 16-17 | 20 (13 / 7) | 2.50 | 3h07 in window; 5h05 counting from 21:32 (#1982 to #1988) | CI jam (1b0513701, P-648); 14 of 26 batches failed (3134b2eae) |

Baseline: the mean is 11.3 merges a night and the median 9.5 (10 nights). By count, 16-17 ranks 2nd of 11, but its merges came in 6 bursts after 02:37.
The two lenses count app code differently. Under the title rule 16-17 had 13 app-code merges; under app-code-prs.sh it had 8 (inventory lens). The P-500 measure (app code by files changed) is the second one.

### 2c Answer speed to lanes (sample: 61 "Question for the tech lead" comments on 418 PRs over 5 nights; broad rule = any Lead, Lead B or Build Lead A/C reply)

| Night | Questions | Answered within 30 min | Median wait | Unanswered at 07:30 | Lane PRs quiet 120 min or more (of those, waiting on a Lead) |
|---|---|---|---|---|---|
| 12-13 (partly covered) | 3 | 0 (all closed unanswered) | 134 min | 2 | 5 of 7 (1) |
| 13-14 | 1 | 1 | 21 min | 0 | 2 of 6 (0) |
| 14-15 | 8 | 7 | 1 min | 1 (#1750, carried in) | 6 of 13 (1) |
| 15-16 | 23 | 22 | 8 min | 0 | 5 of 39 (1) |
| 16-17 | 26 | 6 | 194 min (worst 462) | 5 (#1991 482 min, #2000 454 and 446, #2014 372, #2019 289) | 27 of 40 (14) |

On 16-17 the questions split as: 11 CI re-run, requeue or not-started asks; 7 asks for the Lead's read of a diff (P-423); 6 product rulings; 2 other (read by hand).
13 answers came in a burst at 07:20-07:29, after Lead 72 took over at 07:13. Only 6 Lead comments were posted between 00:00 and 07:13.
The "~590 min unanswered" at the 07:17 check matches the narrow rule (only "Lead N" counts; #2003, 589 min). Under the broad rule the worst at 07:17 was about 470 min (#1991). The inventory lens's regex gives a maximum of 556 min (#2011).
Lanes "quiet up to ~650 min": not re-measured. This lens found at most about 480 min inside the window.

### 2d CI capacity (sample: all 9,732 runs created 21:30-07:30 IST, 6-17 Nov; job timings for all 1,157 ci runs plus 1 in 6 of the other runs)

| Night | Runs (all / ci) | Shard wait p90 | Peak ci jobs queued | Merge batches (pass / fail) |
|---|---|---|---|---|
| 6-7 | 43 / 16 | 0.0 min | 8 | not measured |
| 7-8 | 247 / 38 | 0.0 | 41 | 11 / 0 |
| 8-9 | 80 / 12 | 0.0 | 12 | not measured |
| 9-10 | 254 / 34 | 0.1 | 12 | not measured |
| 10-11 | 223 / 38 | 0.1 | 12 | not measured |
| 11-12 | 639 / 103 | 10.4 | 31 | 9 / 8 |
| 12-13 | 178 / 30 | 0.1 | 14 | 3 / 2 |
| 13-14 | 195 / 20 | 0.1 | 14 | 5 / 5 |
| 14-15 | 454 / 59 | 4.5 | 24 | not measured |
| 15-16 | 1,769 / 172 | 4.7 | 20 | 21 / 0 |
| 16-17 | 2,223 / 164 | 43.0 | 62 (04:30) | 9 / 0, 3 still queued |
| Jam, 21:30-02:37 | 2,233 / 195 | 68.4 | 118 (22:47) | 2 / 5 |

The 40-job limit (RULES.md:5) was already full on 7, 9, 13 and 14 Nov, yet the waits stayed short then. What changed was demand. New workflows multiply runs: skeleton (c203d3cdd), module-cards and pr-rules (1e1d72d04), and queue-gate (4442c87fb) mean one push starts 6 workflows. On night 16, queue-gate made 531 runs, label-guard 395 and comment-run 212.
384 startup failures came from a GitHub outage of pull_request_target, 22:12-23:30.
The Namespace overflow added at most 8 jobs from about 01:30. About 113 runs were queued again at 07:29 (estimate from the sample).
Batch failure rate across the 4 nights where the records count it: 27% on 6-7 (P-388), 10% on 9 (P-432), 22% on 15-16 (P-622), 54% on 16-17 (3134b2eae).

---

## 3 Each mechanism: effect, confidence, keep or change, permanent home, when on

Effect is measured against all 11 nights unless stated. "Cannot separate" means another change landed at the same time and the data cannot tell them apart.

| Mechanism | Effect | Confidence | Keep / change / drop | Permanent home | When on |
|---|---|---|---|---|---|
| P-286 two idle standby Leads | unknown: hand-overs 2-12 min since 11 Nov against 23-42 min on 9-10, but standbys existed on every night, so there is no control | medium | change: the first standby becomes an active watchdog and takes over by itself when the check is over 40 min stale | lead-heartbeat.sh in the standby's start brief (lead SKILL.md:56) plus a lead-watch.sh line "fewer than 2 standbys" | always |
| P-446 hand over 200k past the start read | no measurable effect: did not fire overnight. Lead 71 ran to about 381k, about 250k past its start read (bab2ca020, the Lead's own figure). In the daytime it churned: 4 hand-overs in about 11 h | medium | change: each check commit records the context; when the line is passed, the next check hands over with no deferral | lead-watch SKILL.md:25 plus a lead-watch.sh ACT line; RULES.md:159 from prose to script | always |
| F-6Nov 30-min CronCreate check plus lead-check-guard.sh | unknown: the guard stops stale prompts, but the cron dies with each session; 0 check commits on 16-17 | medium | change: each check appends one IST line to a pushed log; a watcher outside the session alarms when it is over 40 min old | lead-watch.sh appends and pushes; a scheduled GitHub workflow reads the log; lead SKILL.md line "recreate the cron in the first minute" | always |
| P-388 stall guard (lead-watch step 0; no prompt-waiting call while away) | no measurable effect: step 0 fires only at the next check, so it cannot fire while the Lead is stuck. Lead 72's 07:30 check logged no "checks missed" line after a gap of about 7 h | medium | change: dead-man's switch outside the Lead; the prompt rule becomes a hook | scheduled workflow every 15 min plus a PreToolUse hook refusing run_in_terminal and AskUserQuestion while an away flag is set | always (hook: away flag) |
| P-389 watchdog (lead-heartbeat.sh from the standby's cron) | no measurable effect: no last-check.alerted file since 13 Nov; STATE.md:37 still names "Lead 34"; its one firing (9 Nov) never reached the phone (2f15d0693) | medium | change: run from a Mac launchd job, log every run, test the push once per setup | launchd job (founder's yes) plus a RULES row naming it | always |
| P-402 / P-485 standing approvals (local allow line) | no measurable effect: the allow line covers only the label; 4 of 28 night labels used it; labels were not the bottleneck | medium | change: retire the local line; queue-gate does label, requeue and re-run on its conditions; correct RULES.md:106 | queue-gate CI workflow (P-637/B200) | always |
| P-628 Lead rules on product questions while away | unknown: rulings came mostly from row owners (#2044 confirmed in 2 min; #2016 in 4 min); 3 items deferred to 09:00 that the founder then decided as recommended (P-653) | medium | change: non-blocking; the row owner or the Lead rules in 30 min and the lane builds the recommended option; only P-170 values, money and permissions wait | lead and next SKILL.md lines plus a lead-watch.sh step listing open product questions | always |
| P-611b needs-Lead queue (items.py, lead-queue.sh) | no measurable effect: 16 items, all "ready"; 0 of 28 night questions reached it (no LANE-REPORT line); malformed blocked reports dropped (items.py:23) | high | change: also ingest every "Question for the tech lead"; close only on a Lead or Build Lead reply | items.py plus check-items.sh in CI; RULES P-611b | always |
| sle-watch.py wait-time alarm | no measurable effect: 22 of 23 answered quickly on 15-16 and 6 of 26 on 16-17, both with it; it misses Build Lead answers (sle-watch.py:30); it is on the Lead branch only | medium | change: scheduled workflow every 30 min, wider answer pattern, re-raise every open miss | CI workflow on main plus lead-watch step 9 | always |
| P-647 app view each check | no measurable effect: the Lead copy has no app-view tools; the Stop wiring is dead code even on main (settings.json Stop runs only stop-check.sh) | medium | change: merge main's B197 tools into the Lead copy; wire lead-check-guard on Stop; log each read | .claude/settings.json Stop hook (founder's line) plus lead-watch.sh step 10 | always |
| P-646 jam alarms (no merge 60 min, over 30 queued, disk, temp packs) | no measurable effect: added at 23:09, after the jam had been found at 22:56 (2f6cb38d7); no firing recorded; on the Lead branch only; "no merge 60" would fire on 10 of 11 nights | medium | change: land on main; scheduled workflow; fire only when queued PRs exist; record each firing; named response | CI workflow on main; correct RULES.md:149 | always |
| P-645 hourly lane-starter routines (3) | unknown: lane app-code PRs 13 against a median of 2 (9 nights), but merged 4, the same as 15-16 without routines; 21 of 30 runs ended at once (one log read: "CI busy") | medium | change: add a WIP brake (for example 15 open or 3 unanswered over 60 min); a run log line per run; the prompt in an undated repo file; trigger ids in STATE | the routines plus product/tools/night-starter.sh; RULES P-645 | always |
| Night-queue claims (claim/<row>) | unknown: 0 duplicate builds in 14 claims, but no collision was ever shown to be stopped; claim/CS-W3-part-0 leaked (no PR, no expiry) | medium | change: claims record their time; a workflow releases them on PR close or after 90 min with no PR | tools/claim-row.sh plus a CI release workflow | always |
| Night queue file plus draft until Approve | no measurable effect on merges: builder PRs opened 14 against a median of 2 (10 nights); merged by 07:30, 2 against a mean of 1.3; the draft rule was followed (12 of 14 show ready_for_review) | medium | change: one script in front of each routine run (Test 0, WIP cap, run log) | P/tools/night-starter.sh; the queue file stays Lead input | always |
| Test 0 CI brake (over 30 queued means start nothing) | not measured as a verdict (the verdict input was cut off). Evidence elsewhere: it stopped 21 of 30 routine runs (only one log read); 9 queue PRs still opened 02:20-06:54 while 59-113 runs were queued | low | keep, inside night-starter.sh with a logged result | night-starter.sh | always |
| P-637 queue-gate auto-label | working: 7-8 bot labels and 5 removals overnight (33-PR sample) | medium | keep; widen per P-402 above | queue-gate.yml (already CI) | always |
| P-639 board and check verify each other | no measurable effect for the Lead: step 11 is on main only; board inputs were hand-written (STATE.md:15) | medium | change: Lead copy runs main's tools | lead-watch.sh on main | always |
| P-635 overnight hooks (B193: queued-push-guard, lead-read-guard, ist-time-guard, lead-act-check) | inactive: not wired in settings.json on main or locally | high | change: wire them (founder's settings lines, P-387) | .claude/settings.json | always |
| P-530 push to the founder; P-643 96% usage stop | not measured (no log); P-643 not triggered (27% weekly at 07:34) | low | change: log every push; usage ACT line in lead-watch | lead-watch.sh | always |

---

## 4 Stalls no mechanism covers, with the narrowest fix

| Stall | Evidence | Narrowest fix | Home |
|---|---|---|---|
| Merge conflicts cascade on shared module-card lines | 15 PRs conflicted on an api/src/*/MODULE.md line overnight; the label guard removed the approved label on 9 after a merge of main; #2010 conflicted 3 times (comments API); there is no .gitattributes; P-270 is prose (RULES.md:83) | Generate the card's list lines in the module-cards job (or one sorted entry per line with merge=union for MODULE*.md) | .gitattributes plus the module-cards tool; a RULES row in place of prose P-270 |
| Small gate jobs wait behind 40-minute shards; comment runs cancel each other | non-ci first-job wait p90 37.4 min on night 16; module-cards waited 38.6 min median for a 0.8 min job; #2017, #2021, #1991 green but waiting on queue-fresh (9462cc855) | Gate and label jobs on their own runner pool; queue-gate concurrency per PR with cancel-in-progress: false | queue-gate.yml, label-guard.yml, records-label.yml |
| Flaky suites fail batches; quarantine waits on a person | 26 "passed only on retry" notes overnight; shard 8 in 5 failed batches (3134b2eae); QA-498 quarantined only at 06:28 (#2034); batch_size 6 (.mergify.yml:25,39) | Auto-quarantine a suite that passes only on retry twice in 24 h (records PR plus qa bug); smaller batches while failures are over 20% | CI job plus .mergify.yml |
| Lead-only actions pile up on one Lead | 11 re-run or requeue asks and 7 diff-read asks out of 26; at 07:23 the Lead posted 5 next steps in 2 min and lanes merged main within 2-5 min | Workflow re-runs failed shards once and requeues after a timeout or conflict dequeue; a Build Lead's diff read counts for rows it owns | queue-gate workflow; RULES amending P-423; lead and next skills |
| Questions addressed to a Lead that has left | #2021 at 23:36 and 01:41, #2014 at 01:18 to "Lead 70" after its 23:31 hand-over; #2014 waited 406 min | Lanes write "Question for the tech lead" with no number; the tools treat every open question as the current Lead's | next SKILL.md; sle-watch.py; items.py |
| Quiet PRs whose lane session ended are never resumed | #1991 no commit since 20:57; #2021 quiet 480 min; 10 of 40 lane PRs had no commit all night | Routines take quiet PRs with an answered question or a conflict before new rows | night-starter.sh plus the routine prompt |
| Standby top-up and usage need the founder present | only 1 standby at 08:4x (STATE.md:11); P-643 and P-440d are prose | A 2-minute going-away checklist (2 standbys, usage under 85%); lead-watch ACT lines | WAY-OF-WORKING Night playbook; lead-watch.sh |
| lead-watch.sh discards gh errors | 44 gh TLS fallback lines in queue.txt at 07:35 and 09:01; errors go to 2>/dev/null | Use the REST/curl path; print ACT on any failed call | lead-watch.sh plus a check-*.sh case in CI |
| The Lead copy is on a stale branch | lead/2026-11-07-lead31 is 84 tool, workflow and .claude files apart from main; main lacks the jam alarms and the Lead lacks app-view, board-check and B193 (git diff) | Merge main into the Lead branch daily and land the Lead-only tools on main | Lead routine; replaces P-388 (1) "fresh branch daily", which is not followed |

---

## 5 What to make permanent, and exactly where

Order of strength: a hook or CI step beats a script the Lead runs, a script beats a skill line, and a skill line beats prose. Each item is always on, not only when the founder is away, unless stated.

**The Lead can do these** (tools and records inside today's permissions, by ordinary PRs):
- A check log: lead-watch.sh appends one IST line per run (context, ACT count, app-view result) to a pushed file (product/state/check-log). This makes every other item auditable.
- A scheduled read-only GitHub workflow every 15-30 min on main: the check-log age (dead-man's switch), sle-watch.py, the jam checks 1b/2b, and claims with no PR. It writes its findings to one state file or issue.
- sle-watch.py and items.py count Build Lead A/C, Lead B and "Lead read the diff" as answers, ingest every "Question for the tech lead", and re-raise every open miss. check-items.sh cases go in CI.
- Land the Lead-only tools (1b/2b, sle-watch section 9) on main, and merge main into the Lead copy daily. Update RULES "Enforced by" for P-646, P-647, P-639, P-402 and P-611b to what really enforces them.
- night-starter.sh in front of every routine run: Test 0, a WIP cap, quiet-PR first, and one log line per run. claim-row.sh writes claims with a time stamp, and a release workflow frees them.
- The module-cards job generates the card list lines, so PRs stop conflicting on them.
- Skill lines: lead SKILL.md ("recreate the cron in minute one"; "the first standby runs the heartbeat"); next SKILL.md ("Question for the tech lead" with no number; build the recommended option behind a product question); lead-watch SKILL.md (record context in each check commit).
- Remove the stale "Lead 34" watchdog line from STATE.md:37.

**These belong to the founder** (money, permissions, settings, or a lower bar):
- .claude/settings.json lines: wire the B193 hooks and lead-check-guard on Stop, and a PreToolUse hook that refuses prompt-waiting calls while the away flag is set (settings lines are the founder's, P-387).
- A launchd job on the Mac running lead-heartbeat.sh every 15 min (persistent configuration), and one live push test.
- queue-gate re-running failed shards and requeueing by itself (wider automation permission than P-402).
- A Build Lead's diff read counting for P-423 on rows it owns (changes a review bar).
- Automatic flaky-suite quarantine (a temporary lower bar on one suite).
- A separate runner pool for gate jobs, or more Namespace capacity (money; the STANDARDS §1 gate).
- The going-away checklist (only a founder-typed turn can start standbys).

---

## 6 Decisions for the founder

One per line, with the recommendation and its time, cost and quality impact. Time figures are estimates. Money figures are not measured unless stated.

1. **An away watcher outside every session (launchd heartbeat plus a scheduled GitHub check-log workflow):** yes. Time about 1 lane-row; cost: no money for launchd, GitHub minutes not measured. Quality: a stuck Lead is caught within about 40 min instead of at the next morning's check (16-17: about 7 h with no recorded check).
2. **Add the settings.json lines (B193 hooks, lead-check-guard on Stop, the away-flag prompt hook):** yes. Time: minutes for the founder to add. Cost: none. Quality: turns 4 inactive guards and 1 dead hook into enforced ones.
3. **Let queue-gate re-run failed shards once and requeue after a timeout or conflict dequeue:** yes, once per head commit. Time: 1 row. Cost: more CI minutes (not measured). Quality: removes 11 of 26 Lead-only night asks (16-17).
4. **Let a Build Lead's "Lead read the diff: <sha>" satisfy P-423 for rows it owns, except money and permissions:** yes, with the Lead auditing next morning. Time: a RULES row and a skill line. Cost: none. Quality: removes 7 of 26 night asks; the review bar moves from one Lead to the row owner.
5. **Automatic quarantine of a suite that passes only on retry twice in 24 h, with a qa bug opened:** yes. Time: 1 row. Cost: none. Quality: fewer failed batches (54% on 16-17); a temporary gap in that suite's cover until it is fixed.
6. **A separate runner pool for gate and label jobs (self-hosted Mac or Namespace):** yes for gate jobs only, through the STANDARDS §1 gate. Time: 1 row. Cost: not measured. Quality: removes a gate wait with a p90 of 37 min (night 16).
7. **A 2-minute going-away checklist before each absence (2 standbys, usage under 85%, latest check under 30 min old):** yes. Time: 2 min each night. Cost: none. Quality: covers the standby and usage gaps that only a founder-typed turn can fix.
