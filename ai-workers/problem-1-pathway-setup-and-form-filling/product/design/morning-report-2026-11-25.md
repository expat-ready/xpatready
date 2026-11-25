# Morning report, 25 Nov 2026 (Lead 3, for the founder's ask A380)

Written 07:4x-08:0x IST from GitHub, `origin/main` and a read-only analyst's per-row read. Nothing here is a claim without its source.

## Where we are
* **56 of 101 Works** (+1 since midnight, R1.65); 24 Partial; 21 Not built. 36 PRs merged 00:00-07:33 IST.
* Main green since 07:25 IST (#3602 fixed a test that compared a UTC date with Toronto's day and failed every batch 05:30-10:30 IST).
* Weekly plan 26% (15% at 23:56: about 1.5% an hour overnight, 5-6% an hour in the evening).

## Root cause in five lines (measured 24 Nov in `design/why-targets-missed-2026-11-24.md`, confirmed tonight)
1. **A row counts only when its last part lands**: about 10 merges per new Works; tonight 36 merges gave 1. Merging is not the brake (95 merges a day, CI wait 0 min).
2. **14 of the 46 unproven rows need outside accounts** only the founder can open (Stripe, BoldSign, Google and Microsoft sign-in, AWS, an alarm address): without them the ceiling is 87 of 101.
3. **A third of merge batches fail**; each failure costs a PR about 1.5 h to return. 18 of 33 real defects were already red on the PR in `pr-suites`, which only warns.
4. **The Lead's reads hold work**: 209 queue-gate holds in 72 h for a Lead read (migrations, money, public routes, workflows); tonight one question waited 4 h before it was seen.
5. **Leads change too often** (32 in 35 h before tonight; Lead 3 has run 8 h on 39% context, which helps).

## Operations and enforcement tonight
* Live and proven tonight: walks on merge (ENF-733: a merged PR naming R1.n walks its journey on main by itself, seen on #3493), flow constraint by stage (ENF-738), human sample counted only from GitHub (ENF-782b), start.sh re-installs packages when the lockfile changes (#3569, after main's demo went red 01:21-01:37 IST).
* RULES records the new enforcers (#3596). New Lead habit: each check sweeps every open PR for an unanswered question.

## Partials: distance to Works (analyst's table, nearest first)
| Row | Plain name | % done (basis) | What is left | Open PRs | Smallest next step |
|---|---|---|---|---|---|
| R1.68 | Staff preview of a document | 100% (j_68 15/15, walks on merge #3575, main f1282ab6f) | b: second GitHub walk + fresh reader | none | Lead dispatches walks.yml j_68 once more; qa reader moves row |
| R1.93 | Our team's console, firm health, support | 100% (j_93 24/24, same run) | b: second walk + fresh reader; QA-755 Minor only | none | same run as R1.68 (`-f journeys="j_68 j_93"`) |
| R1.69 | Read log, fingerprint, keep-period reminder | 100% (j_69 21/21 twice locally on main 4328e3dac with #3575's fix; #3497 merged 20:43Z) | b: no GitHub walk on main yet (#3497 merged 9 s before walks-on-merge went live) | none | walks.yml j_69 twice, fresh reader |
| R1.53 | Retainer with the 26 items, versioned until sent | 100% walk (j_53 21/21 on main d717a6ffd, #3587); control check_s17 was 7/8 before #3587 | b: QA-779 (b) fixed by #3587, not re-scored; check_s17 8/8 not yet run | none | qa re-runs check_s17 on main, closes QA-779 |
| R1.104 | Consultation agreement signed before first consult | 100% walk (j_104 20/20 on main 278256502, #3566) | b: QA-777 Major fixed by #3498 (merged 19:43Z), qa has not closed it | #3471 draft (design Q1/Q2, for Lead's ruling; not named as a blocker) | qa re-runs check_qa777 on main, closes QA-777, reader |
| R1.13 | Logs, metrics, error reports, alerts | 100% (j_13 10/10 twice locally after #3548; main had 8/8 W1-W4) | c: founder's own words that the alarm email reached him (no DECISIONS row); then b: j_13 walks on main head, pf23 pack, re-run, reader | none | founder confirms the email; Lead records the row |
| R1.58 | Trust or operating on every payment; "to move" list | 92% (j_58 22/24, walks on merge #3594, main 969de1ae7) | a: move-to-case route (no row name), FO-7s3a, FO-7s3b (Trust in red), FO-7m | #3593 (FO-7t R4-1) dequeued | name the move-to-case row; build FO-7s3b |
| R1.56 | Client invoices, tax by province, gov-fee line | 89% (j_56 16/18, #3594, main 969de1ae7) | a: FO-7w1 (draft from signed retainer, `retainerId` 422), FO-7c (pay-link route), FO-7s2 (its button) | none | FO-7w1 (one API field) |
| R1.86 | Breach register with firm notices | 89% (j_86 25/28, #3538, main 5aeb71942; 27/27 expected after A2 once W10 moved to R1.87) | a: PF-21rs A2 (breach page), QA-757 (no route returns a notice's words) | #3579 (PF-21rs A2) dequeued | requeue #3579 |
| R1.85 | Data-request register with legal hold | 86% (j_85 18/21, #3235, main 525a2c358) | a: PF-21d part 2 (erasers), PF-21rs Privacy pages, PF-21c link (R1.86's first step); c (per Lead): retention periods | #3583 draft (PF-21d part 2a) | ready #3583 |
| R1.29 | One person record, duplicate warning, safe merge | 85% (j_29 22/26 on main a040b46d5; 24/26 on #3527's head) | a: FO-9b part 2b, FO-9s parts 2-3 (screens; no PR) | #3527 draft; #2896 FO-9s concept draft | ready #3527; approve FO-9s concept |
| R1.55 | Withdraw, re-issue, decline, signed offline | 82% (j_55 28/34, 23 Nov, main 5b70af11a; not re-walked after FO-6 4a #3433, 4b #3460) | a: QA-770 (withdraw does not cancel the envelope), FO-6 door decline with reason, FO-5s later part (Withdraw/Signed offline panels, declined state) | none naming R1.55 | re-walk j_55 on main (stale number) |
| R1.105 | Keep periods; leaving firm closed, not deleted | 81% (j_105 17/21, 23 Nov, main 5c9b15ed4) | a: AUD-5 callers, PF-21d erasure, PF-11c purge (W2), PF-11/PF-11s download (W4, = R1.22); d: AUD-2 S3 write-once archive (W5); c/Lead: W3 read-only vs 402 conflict on #2992 | #3411 (PF-11 part 1, titled R1.22) | merge #3411 |
| R1.10 | Checking every input | 74% (j_10 14/19, #3594, main 969de1ae7) | a: A2 (booking + platform fields, 9 public booking doors without schema), A5 (case side malformed id 400 not 404) | #3544 (PF-28 A2) open, no label | review + label #3544 |
| R1.76 | Notes; one timeline per record | 74% (j_76 20/27, 23 Nov, draft #3045 journey) | a: CS-NT1 part 3, part 4, FO-4 part 2b; c/Lead: a person's timeline has no BACKLOG row | none | Lead names the person-timeline row; CS-NT1 part 3 |
| R1.1 | Hosting, data, backups, logs in Canada | 80% (parts: PF-7, PF-8a, PF-8b, PF-23c merged of 5 named; PF-8c missing) | a: PF-8c deploy from CI; b: commit Step 15/16/20 cloud reads with sha256; signed-in smoke needs R1.5 chain; d: AWS reads by the founder's account | none | commit the AWS reads (no code) |
| R1.87 | Our access to a firm's data, logged and shown | 56% (probe 5/9 on main 3af5fc4b0; 8/12 on #3491's head with P6) | a: AUD-3 part 2 (#3491), part 3 (our audit search), AUD-3b (support sessions, QA-776), breach-read line (no PR) | #3491 open, no label | review + label #3491 |
| R1.54 | E-signature with evidence; any document | 43% (j_54 9/21 on main f7ec61c91, #3542; 14/21 on #3490's head) | a: FO-6 4c (#3490), FO-5s signed-copy button, QA-786 Major (other signers never emailed); d: FO-6v vendor sandbox (held P-561, needs sandbox key on the Mac) | #3490 open no label; #3220 concept (records) | merge #3490 |
| R1.3 | Walls between firms | 43% (parts: PF-12, CS-W1, CS-W3 p1 merged of 7; walk none) | a: CS-W2, CS-W3 parts 2-3 (case-side row security; 8 case tables lack firm_id), CS-W4 gate test | none | CS-W2 |
| R1.5 | Staff sign-in, two-step, passkeys, lock-out | 40% (parts: PF-4s p1, PF-4bs p1 merged of 5 named; j_5 28/28 does not cover the missing parts) | a: PF-4s part 2 (DW6, DW7), PF-4bc (#3217 + #3479), QA-643 passkey setting, sign-in screen (PF-4bs concept); d: real Cognito pool lines | #3217, #3479 open no label; #3214 draft | review #3217 |
| R1.106 | Pathway assessment AS-1: EE and FSW scores | 40% (j_106 4/10, 22 Nov) | a: AS-1g, AS-1s, AS-1c, FO-15a, FO-15b, FO-15s, CS-106c | #3478 draft (AS-1g) | ready #3478 |
| R1.61 | Sign and pay by single-use link | 30% (j_61 6/20, 23 Nov; not re-walked after FO-6 4a/4b) | a: FO-6 door/email W1-W3, W6-W8 (part merged since), signing-to-paying row (gap G2, no row), FO-7c pay step | #3177 draft (challenge: not ready) | re-walk j_61 on main; name the G2 row |
| R1.15 | Secrets in a managed store | 25% (clauses: 1 of 4 fully met on AWS) | a: firms' own keys stored encrypted; b: secret-value scan of image and log group, AWS quote of missing-secret stop; d: AWS reads | none | scan image + log group for secret values |
| R1.98 | Corporate clients, employers, LMIA | 25% (parts: FO-2b, FO-8, CS-K1 p2 merged of 12 named) | a: CS-98r, CS-98a to e, CS-98s1, CS-98s2, Corporate prospect screen, FO-4c (no row, QA-604); c/Lead: Question 1 (LMIA own rows) | none | Lead answers Question 1, writes FO-4c row |


## Not built (21)
R1.22 Suspend, cancel, failed-payment hold, data download on exit **(R1.105 W4 needs PF-11)** · R1.91 Plans, invoices, card update, refunds · R1.34 One person's data export · R1.35 Contacts import · R1.36 Simple automation, consented bulk messages · R1.95 Custom fields, saved views · R1.43 Google/Outlook calendar sync · R1.112 Video meeting links · R1.45 Firm templates, field picker · R1.52 Connected mailbox, WhatsApp · R1.57 Card payment of invoiced fees **(R1.56 W9 and R1.61 W4-W5 end at its first step: FO-7c)** · R1.60 Deposit invoice on signature **(likely the R1.61 G2 signing-to-paying join; not stated in the note)** · R1.96 Reversals, refunds, credit notes, write-offs · R1.111 Client statement, accountant exports · R1.62 Client portal, progress stream · R1.107 AS-2 provincial streams · R1.97 Tamper-evident audit chain · R1.64 Resumable upload · R1.66 Virus scan · R1.75 Tasks · R1.79 Firm dashboards.

## Soonest to Works (8-10)
1. **R1.68, R1.93, R1.69**: every part merged and packs green on main; only a second GitHub walk (Lead dispatch) and a fresh reader are left.
2. **R1.53, R1.104**: walks 21/21 and 20/20 on main; the last Major (QA-779 b, QA-777) fixed by merged PRs, so qa only re-runs one check each.
3. **R1.13**: all code and AWS evidence in; waits only on the founder's sentence that the alarm email arrived, then walks.
4. **R1.86**: one PR (#3579, dequeued) takes j_86 to 27/27 per the Lead's ruling; QA-757 must be settled with it.
5. **R1.58, R1.56** next (22/24, 16/18), but each still needs 2-4 unbuilt parts and FO-7c/R1.57; R1.85 (#3583 + PF-21rs) behind them.

## Done at 07:5x IST on this report
* Walks dispatched on main e397c7dc1 (run 45531293372): j_68 j_93 j_69 j_53 j_104 j_55 j_61; qa 10 (R1.68, R1.93, R1.69), qa 11 (R1.53, R1.13), qa 9 (R1.104, R1.55, R1.61) told to score from it.
* Founder's inbox read in the built-in browser (read only): ALARM `xr-staging-5xx-rate` 24 Nov 09:52, OK 09:58 (R1.13 evidence).
* Two standby Leads started (Lead 4, Lead 5).

## Decisions for the founder, one at a time (recommendation first)
1. R1.13: his own words that the alarm email reached him.
2. R1.85: keep periods for consent, signing, retainer, identity and conflict evidence (or Sample for now).
3. Build order: finish the nearest Partials first, pulling Not-built rows only where a Partial needs them (R1.57's FO-7c for R1.56/R1.61, R1.22's PF-11 for R1.105, R1.60 for R1.61), not "build everything then approve".
4. Outside accounts in one sitting (the 14 rows).
5. `pr-suites` required before the label (catches 18 of 33 real defects before the batch).
6. Auto-label migrations, money and pipeline PRs after the reviewer's Approve when the change is additive (fewer Lead-read holds), with a weekly Lead sample.
