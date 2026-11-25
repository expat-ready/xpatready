# Why the targets are missed: measured, 24 Nov 2026

Written 22:20-23:10 IST 24 Nov by a read-only analyst for the founder (his spoken question, ~22:3x IST). Nothing was changed, run, labelled or pushed. Sources: GitHub's REST API (pull requests, comments, issue events, Actions runs and jobs, check annotations), `git` on `origin/main` (head a040b46d5, 22:32 IST), and the records named below. **The window** for most numbers is the last 72 hours: 21 Nov 22:23 IST to 24 Nov 22:23 IST. Each number names its sample. A guess is marked **Hypothesis** with the test that would settle it.

Words used once and then plainly: a **PR** is one change waiting to join the main copy. A **batch** is the merge queue's test of one or two approved PRs together on top of main (Mergify). **Red** means a test failed. A **flaky** test fails sometimes with no change to the code. **Works** is a capability that qa has proven on main. **PR-minutes** add up the waiting of every PR (two PRs waiting 10 minutes = 20 PR-minutes).

## Answer in five lines

1. Proving runs at **4.7 Works a day** (net, 22-24 Nov), against the 10-15 a day you asked for. Merging is not the brake: **95 PRs merged a day** and machines start CI jobs with **0 minutes median wait**.
2. Each capability is a chain of parts and counts only when the last part lands: **141 product merges gave 14 new Works** in 72 hours, about 10 merges per Works. By Little's Law (rate = work in flight ÷ time per item), about 16 capabilities in flight taking about 3.4 days each gives exactly the 4.7 a day we see. 10-15 a day needs 34-51 in flight, or much shorter chains.
3. **14 of the 46 unproven rows** need outside accounts (Stripe, BoldSign, Google and Microsoft sign-in, AWS, an alarm address) that only you can open. Without them the ceiling is **87 of 101**, however many builders run.
4. **A third of merge batches fail** (121 of 368 batch runs). Each failure costs the PR a median **88 minutes** to get back in the queue. For 18 of the 33 real defects, a test that already runs on the PR showed red before the queue, but it is set to warn only.
5. The steering layer eats the rest: **32 Lead sessions in 35 hours** (median life 60 minutes, start read 170-205k tokens each). It carries 815 decisions, 132 rules (62% prose only) and a 237-item plan (15% done, untouched since 20 Nov). Enforcement waits on a Lead who changes every hour.

## What we measured

### 1. Proving rate
**Works on main at the end of each IST day** (sample: `qa/CAPABILITIES.md` at the last main commit before 24:00 IST; R1 rows only): 15 Nov 2 · 16 Nov 11 · 17 Nov 11 · 18 Nov 11 · 19 Nov 12 · 20 Nov 25 · 21 Nov 41 · 22 Nov 46 · 23 Nov 50 · 24 Nov 55 (at 22:32). Daily change: +9, 0, 0, +1, +13, +16, +5, +4, +5. Today's split: 55 Works, 25 Partial, 21 Not built. The "Why proven is flat" counts in `RESUME-ON-NEW-ACCOUNT.md` (25, 41, 46, 50, 55) match.
* **Gaps with no new Works** (sample: every status change on main since 14 Nov, 216 changes). The longest is **19 hours**, 23 Nov 04:04 IST to 22:58 IST, across the 23 Nov account switch. From 15:00 to 21:00 IST that day, 1 product PR merged in 6 hours. Since 16:53 IST today, 0.
* **Merges against Works** (sample: 286 PRs merged in the window, Mergify's own batch drafts left out): 141 product build (49%), 71 qa verdicts and journeys (25%), 54 operating-system work: tooling, pipeline, tests, Lead (19%), 20 records (7%). They gave 15 new Works and 1 lost (R1.53 reopened 24 Nov 16:14).
* **Builder PRs naming R1.n** (sample: 104 merged in the window, qa PRs left out):
  * Time from open to merged: median 4.6 h, p75 13.1 h, p90 18.6 h.
  * Time from open to the first `Reviewer: Approve`: median 0.4 h. From Approve to label: median 0.2 h, p90 10.9 h.
  * Time from the first label to merged: median 1.9 h, p90 10.9 h. From the last label to merged: median 1.1 h.
  * Labels per PR: mean 1.7. 44 of the 104 needed 2 or more.
  * Approve comments per PR: median 3, p90 7. 66 of 104 had a Changes or Block verdict (97 in all).
  * Review rounds (sample: 221 PRs with a numbered round since 21 Nov 11:10 IST): median 3, p90 5, maximum 16. 30 PRs went 5 rounds or more.
  * 27 of the 104 were thrown out of a batch for failed checks (29 times in all). 46 of the 104 left the queue at least once for some reason. None was stacked on another branch at merge.
* **Proof lag, from a capability's last named part merging to its Works record** (sample: the 15 new Works in the window; "last part" = the last non-qa PR whose title names that R1 id): median **145 minutes**, range 45-369. qa is not the brake.
* **Capability lead time, from the first named part to Works** (same 15; understated, because many titles name module ids, not R1 ids): median 1.1 days, mean 2.3 days.
* **Work still on unproven rows:** in 72 hours, 21 Partial rows took 68 builder-PR mentions and are still Partial (for example, R1.10 took 10 PRs: "PF-28 parts 2-6 hold 83 + 244 allow-listed gaps"). The 15 rows that became Works took 47.

### 2. Merge queue and CI
**Batches** (sample: 371 Mergify batch drafts opened in the window):
* By queue: product 303 opened, 161 merged (53%), median 31 min each when it passed. pipeline 18 opened, 18 merged (10 min). records 25 opened, 19 merged (9 min). verdicts 25 opened, 23 merged (8 min).
* The 142 product batches that did not land used **3,772 batch-minutes of CI**. Across all queues, 150 batches did not land. Of the 83 that give a reason: 42 were thrown away because a batch or PR ahead of them failed or left; 30 had a PR taken out; 10 were reset because main moved outside the queue; 1 was updated by hand. Of the other 67, 13 were failing and being split, 48 were closed during their checks, 2 were still preparing and 4 are still open.
* **Batch CI runs** (sample: 368 finished `ci.yml` runs on batch branches): 245 green, **123 red (33%)**. Of the 121 red runs whose jobs were read, 65 had exactly one red test part, 33 had two and 23 had three or more. The red parts are spread over the 25 parts (part 10: 31, 22: 28, 21: 25, 2: 25). The type check failed 2 times and the fast checks 7.

**Time in the queue** (sample: Mergify's own record on each PR, 381 queue exits in the window):
* product, merged (199): median 45 min in the queue, 31 min of it CI. p90 115 min.
* product, left without merging (99): 53 for failed checks, 31 taken out, 5 conflicts, 5 taken out by hand, 3 updated, 2 merged by hand. These 99 add up to 5,935 PR-minutes.
* From label to joining the queue (294 product exits): median 1 min, p90 40 min.
* Waiting in the queue that is not CI, by area (merged product PRs): migrations 36 PRs, median 17 min, 1,310 PR-minutes. Money 14 PRs, median 6 min, 623. Pipeline 15 PRs, median 7 min, 237. Other module areas 71 PRs, median 20 min, 2,249. No area 63 PRs, median 6 min, 755. In all, **5,174 PR-minutes, about 1,725 a day**. Migrations wait longest on average (mean 76 min in the queue, against 50 for PRs with no area), because only one migration may be in the queue at a time.

**The rework loop after a red batch** (sample: the 54 queue exits for failed checks in the window, 53 of them product):
* Time from leaving the queue to joining it again: median **88 min**, p75 273 min, 15,600 PR-minutes in all.
* **33 came back with a new commit (a real defect).** Their median was 100 min and mean 402 min. **20 came back unchanged and 17 of those merged**: probably flaky.
* Total cost: 4,114 PR-minutes spent in the failed batches plus 15,600 to come back, about **6,570 PR-minutes a day**. That is the largest wait in the merge path.
* **18 of the 33 real defects were already red on the PR** in `pr-suites`, the workflow that runs the affected suites on every ready PR. It warns only ("the queue still decides"), so nothing stopped them (sample: 56 pr-suites runs on those heads, checked by their annotations). 14 were clean there, and 20 of the 21 flaky ones were clean too.
* Why defects show up so late: since P-651 (2) (17 Nov), **a builder's PR runs no suite in its required check**; the full set runs only on the batch. That choice was made for CI capacity (GitHub's 40 jobs plus a Namespace trial). The repository moved to Enterprise Cloud on 18 Nov, and today job wait is median 0 min, p90 9 min (sample: 7,314 test-part jobs on batch runs).
* After a red batch, the label guard asks for a green full run on the PR's head and a comment by someone with write access, "Batch failures covered: <run>: <every part>". That is a Lead step, and it applies to flaky failures too.
* **Tests that most often pass only on a second try** (sample: 148 bot comments "Passed only on retry" in the window, counted per batch part): check_s5_slice3_browser 19, check_c69_page_browser 17, check_c83_review_browser 13, check_fo8_prospect_won 11, check_pf5s1_signup_browser 8, check_uxa1_counts_browser 7, check_csc1s_decision_browser 7. The names of tests that failed twice sit in job summaries and logs, which the API does not return (see the last section).

**`ci.yml` overall** (sample: 2,371 runs in the window, read in eight time slices because of the API's 1,000-result cap):
* Run-level queue time: median 0 min everywhere.
* Run time: batches median 30 min, p90 51. Full runs started by hand on main heads median 30 min. PR runs median 3 min.
* Failure rate: batches 33%, full runs by hand 30% (35 of 118), PR runs 6% (92 of 1,568). 313 PR runs were cancelled by newer pushes.

**Before the queue, the Lead's read:**
* The queue gate refused to label by itself **209 times** in the window because the PR touches a path that needs the Lead's read (P-423: workflows, Mergify, migrations, money).
* From Approve to the first label (sample: 166 PRs with both inside the comment window): migration PRs median **26 min**, p90 240 min. Money median 19 min, p90 95. Pipeline median 19 min, p90 125. All others median 2 min.
* For migration, money and pipeline PRs this adds up to about **2,270 PR-minutes a day**.

### 3. Work in progress, now (sample: 40 open PRs at 22:2x IST, Mergify drafts left out)
* 26 ready and 14 draft. 8 labelled, 5 of them in the queue.
* 18 are ready but have no label. 5 are stacked on another branch. 8 conflict with main and 2 are blocked. 15 are over 800 changed lines. 12 are migrations.
* Age: median 11.5 h, 15 older than 24 h. The oldest are #2129 (147 h, conflicting), #2332 (120 h) and #2459 (105 h, a draft of 226,848 lines).
* **Unproven rows against open PRs:** 16 of the 46 have an open PR naming them, 14 of those ready. **30 have no open PR naming them**, including 17 of the 21 Not built. This is an upper bound, because some PRs name module parts only (FO-6 4b and 4c, AS-1g, AUD-1c).
* **All 21 Not built rows are in wave 4** (`design/waves.tsv`). Under P-745, a wave opens only when the wave two below it has 3 or fewer unproven items. Wave 4 (37 rows) opened at **17:41 IST on 21 Nov**, when wave 2 fell to 3. `waves.py wip` caps "building" at 8 and the founder's A376 approves "up to 8 builders". Today 14-16 unproven rows are already building.
* **Little's Law, PR level:** 40 open ÷ 95 merged a day = 10.1 h expected, against a measured mean of 11.8 h from open to merge (286 PRs). The pipeline is in steady state.
* **Little's Law, capability level:** about 16 in flight ÷ 4.7 a day = 3.4 days each. The 46 left need 2.6 a day to finish by 12 Dec, or 3.7 a day for 6-7 Dec. At today's rate that is about 4-5 Dec, if the remaining rows behaved like the finished ones. They will not, as causes 1 and 2 show.

### 4. Steering overhead (sample: STATE "Leads, in order", `history/STATE-2026-11-24-0800-lead18-leads-line.md`, `history/STATE-2026-11-23-1705-lead6-cs-mv2-and-older-leads.md`, the recovery-plan file)
* **Lead starts:** 23 Nov had 13 (2 on the old account, then Leads 1-11 on the new one). 24 Nov had 21 (Leads 12-31, then Lead 1 on the newest account at 22:09). 22 Nov had 8.
* **Life of each Lead** (31 finished lives, 23 Nov 11:24 IST to 24 Nov 22:09 IST): median 60 min, mean 67, range 24-148.
* Hand-overs happened at 345-535k tokens of context. Start reads were "about 169-205k" each (the files' own figures), so about 5.6M tokens of start reading in 35 hours.
* From hand-over to the first written entry: 2-25 minutes (9 hand-overs on 24 Nov; median 4).
* **"My errors" lists:** 12 lists on 24 Nov with about 49 items. The main kinds:
  * times written without the clock (5 or more);
  * claims made before they were checked (8 or more);
  * messages typed but never delivered to lanes (4);
  * full reports at :03 and :33 not sent or sent without the measured stage table (at least 14:53, 15:03, 15:33, 16:03 and 17:03; "Stage table never measured");
  * a merge that restarted two running batches (#3381);
  * next steps left only in PR comments, which do not wake lanes (25 min lost).
* **Idle lanes:** at 10:56 IST 24 Nov, "no cloud lane shows Running or Awaiting input; every open lane is idle". A study done for the Lead found "a merge does not wake the dependent lane". RESUME notes no qa after 20:51 tonight, at the switch. Lead 10 (23 Nov) measured job wait at 3-4 s and wrote: "the wait is on the Lead, idle lanes, red tests".

### 5. Enforcement and the operating system
* **RULES.md** (132 rule rows on main, by their "Enforced by" field):
  * prose only: **82 (62%)**;
  * a script: 23;
  * CI: 18;
  * a hook: 5;
  * 6 rows say their enforcer is still owed (P-731 label guard CI-PRE; P-733 #2233; P-734 ENF-733; P-738 ENF-738; IDX-23 ENF-778a/g; IDX-25 ENF-782b).
  * Of the 50 enforced by a machine, 30 say "(part)". Two CI checks say "not yet a required check".
* **Report-only by design:** under P-717 (b), every new blocking check starts as a warning for 24 h or 10 runs. The Lead then makes it blocking in a second PR. **8 of the 37 workflows** are report-only now, among them pr-suites (since 21 Nov), walks, skeleton parts, red-on-old and review-rounds.
* **Stuck pipeline PRs:**
  * **#3035** (pipeline: one migration slot per schema area, the fix for the migration wait): approved at 22:40 IST 23 Nov. Lead 10 read it at 22:57 and found "no fault". It was "not labelled yet on purpose" until three migrations landed, then 22 more Leads came and went. It is now conflicting with main, 55 h old.
  * #3506 (tooling: the Lead's tools are main's): approved, still a draft, conflicting.
  * #2459 (cleanup stage 1): 105 h, draft, waits on a size-exception row from the Lead.
  * #3421: out of the queue, 11 h.
  * #3508 is in the queue now.
  * Operating-system work does land: 54 PRs in the window. The pipeline queue merged 18 of 18 batches.
* **Full-power plan** (`design/full-power-plan-2026-11-17.md`; 237 items counted by status word): Done 36 (15%), Doing 15, Open 152, Decided 8, Superseded or duplicate 14, Unverified 4, other 8. The file has not changed on main or on the Lead branch since **20 Nov 15:56 IST**, although STATE calls it "the one action list" that every Lead ticks.
* **Size of the records:**
  * DECISIONS.md: 776 KB, P-1 to P-815. It grew 35 rows a day from 10 to 15 Nov, 30 a day from 15 to 20 Nov and 12 a day since.
  * CAPABILITIES.md: 658 KB. RULES.md: 25 KB.
  * The product folder holds 3,660 `.md` files on main (history 749, design 522).
  * STATE "Start here" holds about a dozen standing orders. Each 30-minute report has a fixed 7-part format plus a timeline.
* **Judgement:** yes, the volume slows delivery. It does not block merges: the pipeline lane is separate. It slows the one serial resource, the Lead. A 170-205k start read leaves room for under an hour of work before the hand-over line, and each hand-over drops items (cause 4). That is why approved pipeline fixes such as #3035 wait days for a label.

## Root causes ranked (by measured effect on proven capabilities a day)

1. **Not enough capabilities in flight for the target, and none started on most of the tail.** Framework: Little's Law, plus Theory of Constraints (find and feed the bottleneck). Rate = in flight ÷ time each, so 16 ÷ 3.4 days = 4.7 a day. 10-15 a day needs 34-51 in flight. Evidence:
   * 30 of the 46 unproven rows have no open PR naming them, including 17 of the 21 Not built;
   * all 21 Not built rows sit in wave 4, closed to starts until 21 Nov 17:41 IST;
   * the cap is 8 building items (`waves.py wip`, A376);
   * lanes do not wake when a merge they wait on lands (10:56 IST: every open lane idle).
2. **Capabilities are long chains of parts, and a row counts only when the last part lands.** Framework: batch size (smaller batches give shorter lead times), Little's Law. Evidence:
   * 141 product merges gave 14 net Works in 72 h;
   * 21 Partials took 68 PR mentions and are still Partial;
   * the recovery plan's own count: 33 of the then 50 open rows needed 3 or more PRs;
   * builder PRs need a median 3 review rounds (p90 5, maximum 16);
   * 15 of the 40 open PRs are over 800 lines.
3. **Outside accounts cap the total at 87.** Framework: Theory of Constraints (an external constraint). Evidence:
   * 14 rows (R1.1, R1.5, R1.13, R1.15, R1.22, R1.43, R1.52, R1.54, R1.55, R1.57, R1.61, R1.66, R1.91, R1.112) are all unproven today;
   * 9 of the 14 row notes name the account (AWS, Cognito, CloudShell, alarm, Google, OAuth, Stripe test mode, sandbox);
   * the other 5 come from Lead 25's list and are not confirmed in the row text.
   This cause limits how high the count can go, not today's rate. It becomes the binding limit after about 87.
4. **Red batches and the rework loop.** Framework: DORA four keys (change failure rate 33% of batches; time to restore median 88 min), and shift-left testing. Evidence:
   * 121 of 368 batch runs red;
   * 54 PR exits for failed checks, about 6,570 PR-minutes a day;
   * 18 of the 33 real defects were already red in report-only pr-suites;
   * 17 of 20 unchanged requeues merged (flaky);
   * the per-PR run has no suites (P-651 (2)) for a capacity reason that ended on 18 Nov.
   Share of PR lead time (**Hypothesis**): about 2.3 h of the 11.8 h mean. The test: the same split on the next 72 h after the change.
5. **One Lead, replaced hourly, sits on the critical path.** Framework: Theory of Constraints (keep the bottleneck on bottleneck work only). Evidence:
   * 32 Lead sessions in 35 h, median life 60 min;
   * about 49 recorded hand-over errors;
   * 209 label refusals waiting on the Lead's read, about 2,270 PR-minutes a day;
   * a 19 h gap with no new Works across the 23 Nov switch;
   * #3035 held 55 h.
   Effect on proven a day: **Hypothesis**, not measurable from the records. The test: log idle-lane minutes for 48 h.
6. **Process weight: rules grow faster than they are enforced.** Framework: DORA's "lightweight change approval" capability. Evidence:
   * 62% of rules are prose only;
   * 6 enforcers owed;
   * 8 of 37 workflows report-only, each needing a second Lead PR;
   * the plan is 15% done and untouched for 4 days;
   * 19% of merges are operating-system work;
   * 815 decisions.
   It acts through cause 5.

## What "unlimited resources" does and does not fix

**Does not fix:**
* The outside accounts. 14 rows need your sign-ins, keys or terms.
* Parts in one capability that must follow each other (FO-6 part 4b before 4c; PF-28 parts 2-6).
* One migration at a time in the queue (36 migration PRs, mean 76 min in the queue against 50) and the barrier files, which every area waits on.
* The single Lead's steps: reads for migration, money and pipeline paths, "Batch failures covered" comments, rulings, waking lanes, the reports.
* qa can walk only after the last part merges (145 min median, already short).
* Flaky tests. More machines rerun them faster but do not make them pass.
* The queue's own limits: batches of 2 and at most 4 checked at once. That was cut from 12 on 22 Nov 15:47 IST after 10 batches starved the runners: 113 jobs running, 163 runs waiting.

**Would fix:**
* Starting a builder now for each of the 30 rows with no open PR, in areas that do not collide.
* Running the affected suites (or all 25 parts) on every PR before the label. Minutes are free on a public repository and machine wait is median 0.
* More qa sessions writing journeys ahead (Track B already does this).
* One Lead per area (builders, operating system, qa), so no single session holds every decision.

## Top 5 actions

| # | What | Expected gain | Cost | Risk | Who |
|---|---|---|---|---|---|
| 1 | **Open all outside accounts in one sitting** (about 2 h): Stripe test mode, the BoldSign sandbox, Google and Microsoft OAuth test apps, AWS Cognito, CloudShell reads and the alarm address. The Lead drives the browser and you sign in. | Lifts the ceiling from 87 to 101 (14 rows). **Hypothesis:** +2-3 Works a day once those rows are fed. | About 2 h of your time. US$0 if test modes stay test (check each page) | Keys and terms handled by you only | **Founder** (accounts, terms) |
| 2 | **Start a builder on every unproven row that has no open PR, area by area** (30 rows). Raise the cap from 8 to about 25. Make a merge wake the next lane by automation, not by the Lead. | Little's Law: 30 in flight at 3.4 days each is about 8.8 a day. **Hypothesis:** test with 10 extra builders for 48 h and count Works a day. | Tokens; more queue load | More conflicts in shared areas, so start one migration area per lane | **Founder** (the 8-builder approval is his); the Lead runs it |
| 3 | **Make `pr-suites` a required check before the label and the queue**, and quarantine the 4 tests that most often pass only on retry. | 18 of 54 red-batch loops in 72 h would have been stopped on the PR: **about 1,000-1,800 PR-minutes a day** (the low figure counts only the failed-batch time, the full run, the relabel and the partner's lost batch; the high one counts the whole come-back time). About 6 fewer red batches a day. | One small config PR. PRs wait about 20 min more before the label | Flaky tests now block PRs: that is why the quarantine goes with it | The Lead builds it. **Founder** ruling, because it reverses part of his P-651 (2), whose capacity reason ended on 18 Nov |
| 4 | **Take the Lead out of routine labels.** Auto-label migration, money and pipeline PRs after the Approve, green ci and a second independent reviewer agent. Requeue once by itself when a re-run of a red batch part passes, with no "Batch failures covered" comment. | About 2,270 PR-minutes a day of label wait, plus about 770 a day of flaky come-back time. #3035-type holds end. | 1-2 tooling PRs | Money or migration errors without the Lead's eye, so keep migrations one at a time and the second reviewer | **Founder** (it relaxes P-423 and P-731) |
| 5 | **Lighten steering.** A start read under 40k tokens (one page; no history). Lead sessions of 6-8 h. No new process rows until 12 Dec unless a measured break. Collapse the 237-item plan into the 10 items that move Works. A script prints the 30-minute report. | From about 32 to about 5 hand-overs per 35 h. About 5M tokens of start reads saved. **Hypothesis:** +0.5-1 Works a day from fewer idle lanes and missed checks. | 2-3 h of Lead time | Losing context, but git keeps every record | The Lead. **Founder** for the freeze on new process rows |

**The merge-queue change to make first: action 3, `pr-suites` blocking before the label.** It cuts the largest wait in the queue path. Today that is the come-back after a red batch: 5,200 PR-minutes a day, plus 1,371 PR-minutes a day inside the failing batches. The gain is about **1,000-1,800 PR-minutes a day (17-30 PR-hours)**. Changing batch size or parallel checks would not help: machines are idle, and the non-CI queue wait is only 1,725 PR-minutes a day, spread over every area.

## What we could not measure

* **The names of tests that failed twice** in red batches. They are in job summaries and logs, which the REST API does not return; downloading logs needs your yes. Retry-pass comments stand in for them.
* **Cloud lane states and idle minutes.** No session listing was read; idle-lane evidence comes from the records only.
* **Each Lead's real token use.** The start-read and hand-over sizes are the records' own figures, not re-measured.
* **Capability lead time and "no open PR" are approximate.** Titles often name module ids (PF-, FO-, CS-) instead of R1 ids, so lead time is understated and "no open PR" is an upper bound.
* **Why each label waited:** a Lead absent or a deliberate hold, except #3035, whose hold is written down.
* **The batches closed during their checks** (48) without a reason in their body. They are counted as not landed only.
* **Review-round lengths**, and how much of the 11.8 h mean PR time is building rather than waiting.
* **A queue slot against batch filling** inside Mergify's non-CI wait: only the total is recorded.
* **Lead 25's outside-account list** for R1.22, R1.55, R1.61, R1.66 and R1.112: the row text does not say it.
* **The RESUME line "#3500 failed two batches":** batch data shows one failed batch (#3518, with #3467), then a new push.
