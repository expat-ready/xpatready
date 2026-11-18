# Build Lead C: state (P-644; case side, money-and-audit, forms, release, CS-*, BK-*, AUD-*, AS-*, J-* and evidence rows)

updated: 17 Nov 2026 07:13 IST by Build Lead C (local_d5287293, Opus 5.5 medium; branch `claude/build-lead-c-647b40`). Reports to the current Lead (`tools/current-lead.sh`): **Lead 81, local_bd570ff6** since 20:22 IST 18 Nov (after Lead 80, local_d018e333, from 12:50 IST 18 Nov (after Lead 79, local_25aa8878, from 18:35 IST 17 Nov (after Lead 78, local_68613e56, from 13:56 IST 17 Nov (after Lead 77, local_baa78a6d, from 13:02 IST 17 Nov (after Lead 76, local_f6824017, from 11:11 IST 17 Nov (after Lead 75, local_c9752f73, from 10:22 IST 17 Nov (after Lead 74, local_fa783599, from 08:39 IST 17 Nov (after Lead 73, local_9b98cea4, from 07:59 IST 17 Nov (after Lead 72, local_af927c49, from 07:13; Lead 71, local_0c9cccec, from 23:3x IST 16 Nov; Lead 70, local_9ae95739, from 21:52) (took over from Lead 69, local_28bf6046; seven start lines were queued with Lead 69: CS-C1b, CS-DL1 part 1, CS-V1 part 1, AUD-1a, FO-7s0 (lane 13), AUD-5 part 1 (lane 14), CS-SD1).

**Sources read:** RULES.md as of P-644 and MVP-CHECKLIST.md on `origin/lead/2026-11-07-lead31`; `qa/CAPABILITIES.md` R1 table on `main` d66bcfd2d; merged and open PRs from the GitHub API (21:0x IST); the case-side shaping lane's draft briefs `design/briefs/*.md` on `main` (#1867-#1877, #1882, #1883, #1886).

**Split rule used:** a row is in my group when it has a non-PF/FO part; I own those parts only. PF-* and FO-* parts are Lead B's (P-558), **except client money**: FO-7 (all but FO-7a2 #1991, which Lead B keeps until it merges) is mine (Lead 69, 21:1x IST 16 Nov). PF-F file parts stay Lead B's. Mixed rows are finished only when Lead B's parts merge too.

**Today's target (P-644):** at least 5 of my group's rows fully built a day.

## 1. My group's unproven rows, fewest of my parts left first
PRs = pull requests per the drafts (P-610). "Ready" = every wait in the draft is on `main` now.

| R1 row | Capability | My parts left (PRs) | Lead B parts left | Ready now | Waits on |
|---|---|---|---|---|---|
| R1.80 | IRCC forms per applicant | 0 (BK-10, BK-16, BK-22..24 merged) | — | — | qa (Prove Lead) only |
| R1.77 | Submission number, UCI; decide, close, reopen | **CS-C1b (1, #2002)**; **BK-21** (fixes QA-397) | — | both | BK-21: the Lead names the `case-prepare.ts` holder |
| R1.74 | Deadlines that remind; working days | **CS-DL1a, CS-DL1b (2)** | — | CS-DL1a | b after a |
| R1.68 | Preview for staff review | CS-D5 (2) | — | no | CS-D1 parts 1-2 (which wait on PF-F rail) |
| R1.10 | Checking every input | **CS-V1 PR 1, 2, 3a, 3b (4)** | PF-28 | PR 1 | PR 3a/3b: Bake tag (P-499), CS-D1b, CS-K1, CS-NT1 p1, CS-W1 |
| R1.70 | Expiry, translation, notarisation flags | CS-D7c (1), CS-D7 (2) | — | no | Bake tag, `library.prisma` baton, two Lead answers |
| R1.69 | Read log, fingerprint, keep period | CS-D6 (3) | — | no | CS-D1, CS-D5, AUD-5 |
| R1.72 | Case with applicants, representative | CS-K1 (2) | FO-8 | no | CS-C1b (createCase series); part 2: FoPersonPort |
| R1.102 | Find a person or case | CS-S1 (2) | PF-30a, PF-30s | **part 1** | part 2: PF-30a, CS-K1, CS-K3 |
| R1.79 | Dashboards and reports | CS-R1 (2) | PF-R1, R2fo, R2cm, R3 | no | PF-R1 `MetricRegistry` |
| R1.88 | Firm reads its own audit log | AUD-4 (1), AUD-4s (concept + build) | — (PF-6 p1 merged) | AUD-4s concept | AUD-1a, AUD-1b; AUD-1c p2 |
| R1.105 | Keep periods; leaving firm closed | AUD-5 (2) | PF-11c, PF-5 | **part 1** (`AUD-5-1.md`) | part 2: PF-21b |
| R1.76 | Notes; one timeline | **CS-NT1 (4)** | FO-2 rest | p1 after CS-C1b leaves `runtime.ts` | — |
| R1.8 | Audit trail nobody can edit | **AUD-1a (1), AUD-1b (1), AUD-1m (3)** | — | AUD-1a | series |
| R1.34 | One person's export | CS-X1 (3) | PF-26, PF-26s | no | PF-26 port |
| R1.64 / R1.67 | Resumable upload / file-type check | CS-D1 (3) | PF-F2 / PF-F4 | no | PF-F rail |
| R1.97 | Tamper-evident chain | AUD-1c (2), AUD-2 (2), AUD-2c (2) | — | no | AUD-1a; AUD-2c: AWS (PF-8a/8b/8c) |
| R1.87 | Our access logged and shown | AUD-3 (3), AUD-3b (3) | PF-4s | no | PF-4s, AUD-1b, AUD-1m p1 |
| R1.75 | Tasks, Unassigned, handover | CS-T1 (5) | PF-29a..f | no | CS-K3, PF-29a |
| R1.3 | Walls between firms (case tables) | CS-W1 (2), CS-W2 (many), CS-W3 (spike + parts), CS-W4 (2) | (PF-12 merged) | CS-W3 part 0 spike | CS-W1: CS-K1 + `cases.prisma` holder |
| R1.106 | Assessment AS-1 | AS-1m, AS-1g, AS-1s, AS-1c, CS-106c (2) | FO-15a, b, s | AS-1m after CS-V1 part 2; AS-1g after #2017 + baton | AS-1s: AS-1m+1g; AS-1c: AS-1g+1s + Question 3 (assessment-only release?) |
| R1.107 | Assessment AS-2 | AS-2c, AS-2cs, AS-2e, AS-2d1, AS-2d2 (no briefs) | — | no | founder card on streams (P-607 (9)); P-650 (2): streams assessment only, "Assessment only: no forms". **Streams proposal for the founder card:** `AS-2-streams-proposal.md` (ON Workforce Priority, BC Skilled Worker, SK ISW, AB Opportunity eligibility-only, MB Not verified). Briefs AS-2e, AS-2d1, AS-2d2 written |
| R1.98 | Corporate clients, LMIA | CS-98r (2), 98a, 98b (2), 98c (2), 98d, 98e, 98s1 (concept + 2), 98s2 (2), 98s3 (proposed) | FO-2b, FO-8 | CS-98s1 concept | P-607 (5): last; CS-98r step 0 on the Mac |

**Client money (mine since 21:1x IST):** merged FO-7a #1758, FO-7mv #1924; FO-7a2 #1991 open (Lead B). One chain on `client-money.prisma`: FO-7ts p1 → p2 → p3 → FO-7b → FO-7c ∥ FO-7t (3) → FO-7v, FO-7m, FO-7p, FO-7g (2), FO-7r (3), FO-7q; screens FO-7s0 (concept, **ready now**) → FO-7s1, s2, s3a, s3b, s4, s5. No lane touches `money_move_line_write`, `money_trust_entry_moves`, `money_to_move`, `money_move_batch`, `money_trust_entry_write`, `money_credit_note_write` until #1991 merges.

| R1 row | Capability | My parts left | Ready now |
|---|---|---|---|
| R1.59 | Money arithmetic | FO-7b (tax per line) | no (after FO-7ts p1-2) |
| R1.60 | Deposit invoice on signature | FO-7b | no |
| R1.56 | Invoices, tax, government fee | FO-7b, FO-7g, FO-7q, FO-7s0, FO-7s1 | FO-7s0 |
| R1.57 | Card payment into operating | FO-7c, FO-7s2 | no (FO-7c also needs PF-5's Stripe hook) |
| R1.58 | Trust or operating; ledger; to move | FO-7ts (3), FO-7t (3), FO-7s3a, FO-7s3b, FO-7m | FO-7ts p1 after #1991 |
| R1.96 | Reversals, refunds, credit notes, plans | FO-7p, FO-7r, FO-7v, FO-7s4 | no |
| R1.111 | Statement and exports | FO-7r, FO-7s5 | no |

**Money rulings (23:1x IST, on #2016):** P-634 (1) supersedes FO-7v's "never below zero": a reversal may go below zero, shown red and labelled in `money_trust_shortfall`. **Done 16 Nov 23:4x IST:** FO-7v brief refreshed to P-634 (`build-lead-c-briefs/FO-7v.md`): parts 1-3; #1991 builds the ledger side; the shortfall line and ruling 4 are dropped. **New row to shape after #1991 merges:** covering a trust shortfall from operating (AG-6-73 r1(b)). Its migration amends #1991's operating → trust refusal; the Lead reads it (P-423). Legal: Unconfirmed: no counsel.

Rows proven or Lead-B-only are not listed. R1.77 finishes on CS-C1b + QA-397; R1.74 on CS-DL1b.

**New row CS-SD1 (16 Nov 21:5x IST, Lead 69):** main's schema drifts on 5 statements (PF-8r #2014). The schema is behind the database: the four `id` fields get `dbgenerated("gen_random_uuid()")`, because migrations insert rows without an id. `canonical_field_name` is kept as an `@@ignore` model, because it is the live guard for unique shared-field names. Its group is the configurator, so the WIP limit does not stop it.

## 2. Lanes (8 slots; two ready briefs each, P-599)
**Night queue (P-645, Lead 70's `design/night-queue-2026-11-16.md`):** AUD-1b, CS-DL1 part 2, CS-V1 part 2 (the last one moved back to #2007's lane by Lead 70; its scope was ruled on #2007, comment 6923205608), plus my night lines from 22:0x IST: AUD-1c part 1, AUD-4s part 1, CS-S1 part 1 (only while the case side has fewer than 2 rows waiting for qa) and CS-W3 part 0. The running lanes do not take their follow-ons; the night queue does.
**New bug row CS-NK1 (23:0x IST, Lead 70):** #2017's breaker F2 (Major, on main): for non-ASCII names, the database's field-name key differs from the app's `normalizeLabel`, so a rename race lets two same names in. Brief `CS-NK1.md`; configurator group; sent as a night line.
**CI saturated (Lead 70, 23:0x IST):** every lane keeps its PR a draft until the reviewer approves the head, then marks it ready once. Comments posted 23:0x on #2000, #2002, #2003, #2008, #2016 and #2017; #2007 is queued with its label.
**Standing rule (Lead 70, 23:2x IST):** never ask for or wait on a network or environment change; write "Not verified: <site> blocked on the cloud network" and go on. Posted on #2000, #2002, #2003, #2007, #2008, #2016, #2017 and #2027. #2027 is AUD-4s part 1 from the night queue; it also got the CI draft rule.
**Rulings 23:4x IST 16 Nov (Lead 71 asked; late against the 30-minute target):**
* **#2000:** add `web/src/runtime/stages.tsx` (weekday, mark, Missed; DW7 browser). ~~bypass~~ **Changed after Build Lead A refused the bypass (rev 16.86; QA-499: every bypass use writes an audit line):** a SECURITY DEFINER function `platform_firm_calendar(firm_key)`, owned by `xr_wall_reader`, returning only the three settings; DW8 + DW9 (catalogue check). It is now a schema PR: breaker on, and the Lead reads the migration.
* **#2003:** test-word fixes accepted in 7 PF/FO test files (`system:` prefixes; `session_replication_role` on the scratch copy for the FO-2v back-dating). The mapping is not widened.
* **#2008:** keep `demo-reset.ts` and `sample-seed.ts` (Lead B's files). My extra test ask is withdrawn so the approved head bcb3c9150 is not voided.
* **Lead 71 (23:5x IST):** BK-21 is named the `case-prepare.ts` holder and the walk-2 condition is met. AS-1g gets the baton when #2017 merges, never alongside CS-NK1. Tell Lead 71 when #2000's head is approved, for its migration read.
* **Draft rule:** the ready PRs #2002, #2008 and #2017 each have a Reviewer Approve on their exact head, so they correctly stay ready. #2007 is queued. Everything else is a draft (#2000, #2003, #2016, #2027, #2031).
* **#2003 (added):** with `app.audit_sample_reset` on, platform audit lines stay undeletable (a fail case). **#2008 (added):** the PR body states that the seed runs only under the Sample seed and that the tsx dynamic import loads; no push if both hold.
**Running (pushed, read 21:56 IST 16 Nov):** #2002 CS-C1b (`claude/runtime-csc1b`) · #2000 CS-DL1 part 1 (`claude/runtime-csdl1a`) · #2007 CS-V1 part 1 (`claude/runtime-csv1-check`) · #2003 AUD-1a (`claude/upbeat-planck-5h4zoh`; its title says "AUD-1a part 1", which is wrong because AUD-1a is a whole id) · #2008 AUD-5 part 1 (`claude/upbeat-bardeen-k2tdqn`). Since 22:0x: #2016 FO-7s0 (draft), #2017 CS-SD1 (ready; the test change stays by Lead 70's ruling). #2003's title is fixed. #2007 is labelled and queued.

| Lane | Now | Next | Status |
|---|---|---|---|
| C1 | `build-lead-c-briefs/CS-C1b.md` | `CS-NT1-1.md` (after CS-C1b leaves `runtime.ts`) | start asked 21:0x IST |
| C2 | `CS-DL1a.md` | `CS-DL1b.md` | start asked 21:0x IST |
| C3 | `CS-V1-1.md` | `CS-V1-2.md` | start asked 21:0x IST |
| C4 | `AUD-1a.md` | `AUD-1b.md` | start asked 21:0x IST |
| C5 | `FO-7s0.md` (concept, now) | `FO-7ts-1.md` (after #1991) | start asked 21:1x IST |
| C6 | `AUD-5-1.md` (now) | — | start asked 21:2x IST |
| C7 | `CS-SD1.md` (schema drift, now; Lead reads the diff) | — | start asked 21:5x IST |
| C8 | to fill: CS-S1 part 1, CS-W3 part 0 spike, AUD-4s concept, CS-98s1 concept (briefs next) | | |

**Holders (P-438b, P-526b):** C1 holds `api/src/runtime.ts` `createCase`; C4 holds `governance.prisma` / new `audit.prisma`; C2 touches Lead B's `leads.ts`/`open-minutes.ts` import lines only. Nobody in my group holds `prisma/schema/cases.prisma` or `api/src/case-prepare.ts` now.

## 3. To do next (me)
1. Briefs for lanes C5-C8 (CS-S1 part 1, CS-W3 part 0, AUD-4s concept, CS-98s1 concept).
2. Done 23:4x IST: QA-397 is BACKLOG row BK-21; brief `build-lead-c-briefs/BK-21.md`.
3. Done 23:4x IST: briefs AS-1m and AS-1g. Still to write: AS-1s (waits on both) and AS-1c (cited canada.ca values; waits on AS-1g, AS-1s and Question 3). **Question 3 answered as P-650 (00:4x IST 17 Nov): Express Entry stays end to end, and AS-1c ADDS the assessment to the existing Profile combination; the five provincial streams are assessment only.** Briefs AS-1s and AS-1c written 23:5x IST. `engine/channels.ts` already has a "No forms yet" state, so a release with no form lines looks supported; AS-1c step 0 confirms it.
4. Done 21:2x IST: the College citation (Client File Management Regulation 2021-001 s. 7.2, page 7, read 16 Nov 2026) is in `build-lead-c-briefs/AUD-5-1.md`; AUD-5 part 1 is ready now.
5. Each check: read my lanes' PRs and pushes; a lane counts only after a push (P-326); answer "Question for the tech lead" comments within 30 min.

**WIP (P-623, Lead 69's reading 21:1x IST): when 2 capabilities of one module group wait for qa, that group starts no new build row.** Per group now:
* **Case side:** 1 waiting (R1.80). It reaches **2 when CS-C1b merges (R1.77)**. From then until qa clears one, start no new case-side row (CS-NT1, CS-S1, CS-K1, CS-T1, CS-W*, CS-D*, CS-X1, CS-R1, CS-98*). Parts of rows already started (CS-DL1 part 2, CS-V1 part 2) carry on, and stopped lanes fix case-side qa bugs first.
* **Audit:** 0 waiting (AUD-1a, AUD-1b, AUD-5 part 1 free to start).
* **Client money:** 0 waiting (FO-7s0 free; FO-7ts part 1 after #1991).
* **Configurator / assessments (AS-*):** 0 waiting.

**07:2x IST 17 Nov (Lead 72):** #2035 (CS-S1 part 1): Lead read done on fb809ad15. Next steps posted for its cloud lane (comment 6935466207): the reviewer reads only the MODULE.cases.md merge, posts Approve fb809ad15, then ready and label. The qa53 keep-alive fix becomes its own small forms row. #2008: AUD-5 part 2 starts once #2008 merges (draft's Part 2, part 1 decisions, LegalHoldPort fake). #2003: merge origin/main, then ask for the migration read. Lead 72 still to read #2000, #2016 and #1991.

**07:34 IST 17 Nov:** #2016 (FO-7s0): Lead 72's read is done, the label is on, and it is in the queue. I ruled Q1-Q5 as recommended (comment 6935644111). FO-7v is refreshed for Q4. Lead B is asked to amend FO-7b amendment 1 for Q5. Q6 (the invoice stays paid, against AG-6-75 r3) is on the founder's 09:00 list, as are the streams card, Manitoba and the #2031 close.

**07:35 IST 17 Nov, FO-7b (Lead B, 76c67aaf6, rev 16.94):** amendments 1, 8 and 9 match Q1, Q2 and Q5. My rulings on Lead B's two points:
* **(1) "Invoice payments go to" sets no default.** Following FO-7s0's concept (`concept-payments.md` line 8, AG-6-69): when the setting is Operating, `receivedInto` is fixed to OPERATING and no pick is shown. When it is Trust first, the payment needs a pick ("Where did this money arrive? Operating account · Trust account") with **no default**. If the route gets no `receivedInto` under Trust first, it answers 400. The setting only decides whether the pick is asked; it never guesses where the money arrived.
* **(2) The split is accepted.** FO-7b part 1 covers invoices and the payment route (amendments 1, 3, 6, 8). FO-7b part 2 covers the settings writes (amendments 2, 9). Part 2's tests include the 400 from (1).
* **07:36 IST:** Lead B wrote both rulings in as amendment 10 (ddf0317b8, rev 16.95). Titles are "runtime: FO-7b part 1 — …" and "runtime: FO-7b part 2 — …". Lead B's file stays the brief; I write no wrapper of my own until FO-7b is next. **Not startable yet:** in the `client-money.prisma` chain, FO-7b follows FO-7ts parts 1-3, which wait for #1991. Part 2 follows part 1.

**07:58 IST 17 Nov, founder answers (P-653, through Lead 72):** the streams are "As proposed". AS-2d1 and AS-2d2 now name them, and both wait only for AS-2e. Manitoba stays Sample until the next Lead reads its page through the founder's Chrome. FO-7s0 Q6: the invoice stays paid and the shortfall shows red, a recorded departure from AG-6-75 r3. #2031 is closed on the founder's word.

**08:06 IST 17 Nov (Lead 73):** Lead 73's money read on #1991 has started. #2035 is labelled and in Mergify batch #2061. Manitoba gets the Chrome read today. **WIP (P-623):** #2002 (CS-C1b, R1.77) merged at 04:00 IST 17 Nov, so the case side has **2 waiting for qa** (R1.80, R1.77). I had missed telling the Lead at that merge; told Lead 73 now. Until qa clears one, no new case-side row starts: CS-NT1, CS-K1, CS-T1, CS-W*, CS-D*, CS-X1, CS-R1, CS-98*, and CS-W3 part 0 from the night queue. Parts already started (CS-DL1, CS-V1 part 2, CS-S1 part 1 in the queue) carry on.

**08:09 IST 17 Nov:** Lead 73 read #1991 (FO-7a2) for money and labelled it on b8be2f9; it is in Mergify. Lead 73's Minor became **FO-7lk** (`build-lead-c-briefs/FO-7lk.md`): a "Move back to trust" credit note takes the party lock before the invoice row, so it cannot deadlock (40P01) with a withdrawal. It joins the `client-money.prisma` series after FO-7ts part 1. **On #1991's merge:** start FO-7ts part 1, then FO-7lk, and shape the shortfall-cover row (AG-6-73 r1(b)).

**08:35 IST 17 Nov:** Lead 73 put CS-W3 part 0, CS-DL1b and CS-NK1 under "Held" in the night queue (be971f925); they return when qa clears R1.80 or R1.77. CS-S1 part 1 is taken (#2035). I raised two of the holds with Lead 73: CS-DL1b is part 2 of a row already started, and CS-NK1 is a bug fix (the #2017 breaker's F2), not a new capability. The decision is Lead 73's. On #1991's merge: resend the FO-7ts part 1 start line.

**08:39 IST 17 Nov:** Lead 74 is now the current Lead. Lead 73 put CS-DL1b and CS-NK1 back in the night queue; CS-W3 part 0 stays held. When #1991 is on main, send Lead 74 the FO-7ts part 1 start line.

**11:10 IST 17 Nov, P-660 (founder, through Lead 75):** today, lanes finish open work and start only near-Proven product PRs and pipeline fixes; no new big rows. The repository moves to the org expat-ready on Wed 18 Nov at 09:30 IST, and lanes go to full power after it is verified. No work may be lost. FO-7ts part 1 and FO-7lk wait until after the move; if FO-7ts part 1 is small and ready when #1991 lands, ask Lead 75 first. Lead 75 wants my list of open PRs (head, tonight or after the move) by 20:00 IST.
Merged on main: #2002, #2007, #2016, #2035. #2000 got "Reviewer: Approve 1fb7ca098" at 08:33 IST; it was addressed to Lead 73, and I only passed it on at 11:1x, late because the API was rate-limited. #2008 says "Ready for the label" on c510727ab but has no label. #2027 (AUD-4s part 1) has had no push since 16 Nov 23:2x IST.

**11:15 IST 17 Nov (Lead 76):** #2008 is labelled. #2000: the migration read is OK, but the PR conflicts with main; the lane was asked to merge main, get a diff-only re-review and post the new head for the label. #2003: labelled when shard 7 is green. FO-7ts part 1 and FO-7lk wait for the move; ask Lead 76 when #1991 lands.

**12:03 IST 17 Nov:** #2042 was dequeued at 11:45 IST with CHECKS_TIMEOUT: `ci` never reported on batch #2067. There is no conflict and no failed shard, so it needs a requeue, which is the Lead's action; I told Lead 76. #2077 fixes `check_css1_index.ts` (drops its own-PR git-diff assertion); the check belongs to my case side.

**13:00 IST 17 Nov:** Manitoba's SWM eligibility page has been read by Lead 76 through the founder's Chrome (`official-sources/manitoba/README.md`). AS-2d2 is updated: its eligibility rules are cited, while the grid, EOI ranking, fees and language minimums stay Sample. No new row starts today (P-660, P-663).

**13:05 IST 17 Nov (Lead 77):** #2042 is back in the queue. **P-683 (founder):** lanes get the reviewer's Approve on the branch first, then open the PR as non-draft. Every brief of mine now says so, replacing Lead 71's draft rule. Open lanes are told on their PRs.

**13:36 IST 17 Nov:** P-685: the Lead marks old drafts ready with `tools/pr-ready.sh`, but only with a 'Reviewer: Approve <head>' line; I send the Lead the PR and its Approve sha, never route a draft to the founder. #2077 merged at 13:27 IST. #2027 was approved at 7197eed81 and is ready; I asked for the label, and it may now merge tonight. #2063 is a draft with no Approve.

**13:38 IST 17 Nov:** #2008 conflicts with main (MODULE.md; Lead 77's 13:3x sweep). Its lane was asked to merge main, get a diff-only re-review and post the new head for the label. AUD-5 part 2 waits until after the move (P-660).

**13:56 IST 17 Nov:** Lead 77 nudged the #2008 lane at 14:1x IST; it may wait for #2045, which is ahead of it in the queue. #2027 gets the Lead's read when ci is green. Lead 78 is now the current Lead.

**14:02 IST 17 Nov (Lead 78):** #2027 was read and labelled at 14:00 IST. AUD-4s part 2 waits on a founder question (AG-13-43 against SA-11-6), which Lead 78 carries. Send Lead 78 the new head and Approve sha for #2000 and #2008.

**14:08 IST 17 Nov:** P-687 (founder): the AUD-4s Activity log shows before and after values in full to holders of agent/audit:read (AG-13-43). AUD-4s part 2 is unblocked and starts after the move; its brief is still to write.

**15:06 IST 17 Nov:** #1991 FO-7a2 is out of the queue. Its DW7 check (the migration's functions are all money_) saw #2035's case_party_index_* functions and broke batches #2082-#2084. The steps are on the PR (6944267988): merge main, narrow DW7 to its own migration's functions, re-review, new head to Lead 78. Lead B was asked to wake the lane.

**16:36 IST 17 Nov (Lead 78):** #2003 AUD-1a: Lead 78 answered the open security question (comment 6925389114) with option 1, close it fully: `aud_event_workspace_guard` trigger on workspace in its migration, plus `check_pf0p_ports` back to unique keys and count deltas (approved outside the touch list; posted on the PR). Its cloud lane (`claude/upbeat-planck-5h4zoh`, head still fda324948) pushes that, gets a diff-only Opus re-review, then the new head and Approve sha go to Lead 78. Not labelled until then. #1991 is labelled and back in the queue at 16:3x (head 8b5dffe06). I could not post on #2003: `gh` fails the TLS check in this sandbox (x509 OSStatus -26276); git reads still work.

**17:19 IST 17 Nov (Lead 78, P-600 stamps):** #2003 is at head 7cb538d19 with "Reviewer: Approve 7cb538d" (17:18 IST): guard trigger, pf0p revert, review rounds 3-5. It has not merged main, so its migration is still 20261116150000, which clashes with #2012. Lead 78 plans 20261117124500_aud1a_audit_insert_only. Sent to Lead 78: hold the label; the lane merges main, renames, gets a diff-only re-review. Taken slots: 120000 #2009, 121500 #1961, 123000 #2012. #1991 (20261116133000) and #2038 (20261116190000) ask Lead 78 for a slot before their next merge of main.

**17:3x IST 17 Nov:** #2003 merged main (ddca3abec) and renamed its migration to 20261117124500_aud1a_audit_insert_only (SQL unchanged); head e2947b887 has "Reviewer: Approve e2947b8" (17:31 IST). Sent to Lead 78 for the read and label.

**18:35 IST 17 Nov:** Lead 79 (local_25aa8878) is now current, after Lead 78.

**18:37 IST 17 Nov (Lead 79, P-692, B1 freeze for the org move):** my lanes push no new commits, open no PRs and run no re-runs (renames included) until Lead 79 says the move is verified. #1991 and #2038 get their migration slots after the move. Lead 79 labels #2003 e2947b8 when it is green. The 20:00 IST list still goes to Lead 79.

**18:4x IST 17 Nov:** #1991 FO-7a2 merged (18:39 IST, from head 8b5dffe06); #2042 CS-V1 schemas merged earlier (17:54 IST). The client-money baton is free. FO-7ts part 1 then FO-7lk start only after the move is verified (P-660, P-692 freeze), with Lead 79 asked first.

**19:30 IST 17 Nov (P-660 list sent to Lead 79):** tonight if green: #2000 (2048a997e, Approve on head) and #2003 (e2947b887, Approve on head). Wait for move: #2063 (856cebb23, draft, no Approve). #2008 and #2038 have merged, so #2038 needs no slot. Not started until after the move: FO-7ts part 1 then FO-7lk, AUD-5 part 2, AUD-4s part 2, CS-W3 part 0. Asked Lead 79 whether my records pushes pause too. Until the answer, records stay committed locally.

**19:31 IST 17 Nov (Lead 79):** #2003 e2947b8 labelled (ci green). #2000 gets its label after the move. Records pushes to this branch are fine (no PR; ci runs on pull_request only). Correction: FO-7ts part 1 is in flight as draft #2106 (head 8a34b34e5), opened about 18:5x by the cloud lane "FO-7s0 · client money lane 13". Frozen since 19:0x until the move is verified. FO-7lk follows it.

**12:41 IST 18 Nov (Lead 79: move verified; B1 freeze lifts 13:0x IST):** remote is expat-ready/xpatready (origin already set). #2003 relabelled; #2000 labelled on green; #2106 FO-7ts part 1 resumes. Brief `build-lead-c-briefs/AUD-5-2.md` written: ready now (#2008 part 1 and #2025 PF-21b `LegalHoldPort` on main); adds DW10 (two holds, both reasons) and DW11 (another firm's hold); start line sent to Lead 79. **AUD-4s part 2 is not ready**: it waits on AUD-4 (`firmLog` read and export) and AUD-1c part 2 (integrity), neither built; the concept is still `concept-draft.md` with challenge verdict "Build after these changes" (7 Majors), and my `concept.md` approval is still owed. Next after merges: AUD-1b after #2003, CS-DL1b after #2000, FO-7lk after #2106.

**12:46 IST 18 Nov (Lead 79):** AUD-5 part 2 is approved to start. Lead 79 sends `AUD-5-2.md` (d53415ff1) to the free "AUD-5 part 1" cloud lane at the next check: Opus 5.5 high, reviewer plus breaker. It counts as started only after its first push (P-326).

**12:50 IST 18 Nov:** Lead 80 (local_d018e333) is now current, after Lead 79.

**12:52 IST 18 Nov (Lead 80):** took my list onto its checks and does the PR steps. #2003 is in Mergify batch #2115. #2000 gets its label on green. #2000 and #2012 get migration slots at their next merge of main. AUD-5 part 2 goes to the AUD-5 part 1 cloud lane at Lead 80's next check.

**15:54 IST 18 Nov (stall sent to Lead 80):** nothing has merged to main since #2008 (about 21:45 IST 17 Nov). Mergify batch #2115 (#2003, #2014, #2011; built 12:46 IST) is still open after 3 hours; asked Lead 80 to check its CI and the Mergify/runner wiring after the org move. #2003 is at fdf4c6d84 (Approve fdf4c6d); #2000 is at 2048a997e (Approve), waiting for its label; #2106 is at 8a34b34e5.

**15:55 IST 18 Nov (Lead 80):** the stall is GitHub's hosted-job limit since the move: 1-6 jobs at once, 59 queued. Mergify and the runners are wired to expat-ready, and batch #2115 is running. Multi-cloud was set at 13:4x; the founder has a Support ticket open. #2000 has had its label since 13:3x and is queued. No re-pushes of heads, because each one adds jobs. My records branch has no PR, so its pushes start no CI.

**16:54 IST 18 Nov (Lead 80):** batch #2115 failed on shard 3: #2011's FO-13i test writes actor `test`, which #2003 now refuses. #2003 re-checks alone in #2119. My open PRs are clear: #2000 uses `user-A`/`user-O`, #2106 writes no audit lines (`user-R` in fo7a_money_schema is mapped), #2063 is records. Typed-actor line added to briefs AUD-1b, CS-DL1b, FO-7lk, AUD-5-2, CS-NK1.

**18:23 IST 18 Nov (Lead 80):** CodeQL high alert on #2003, `check_aud1a_insert_only.ts:107` (`.replace` swaps only the first newline). It is test code, so #2003 is not held. The one-line `replaceAll` fix is in the AUD-1b brief.

**19:01 IST 18 Nov (Lead 80, wave 1, P-697 target +20 Proven on 19 Nov, rulings P-698):** CS-W1 started in the cloud. Lead 80's start of AUD-1b was refused by the permission check and waits for the founder. Shaping asked, ready for Lead 80's next founder-typed turn:
* Messages: PF-19ms (new row for G4/QA-495), J-48, J-49.
* Money: FO-7ts parts 2-3, FO-7b (QA-482 per-line rounding), FO-7g (official tax-rate source).
* Case: CS-K1 (after CS-W1), CS-C1s (new screen row for G3/QA-502).
Three drafting agents are running, one per lane. I check each draft before committing.

**19:12 IST 18 Nov:** wave 1 briefs done and sent to Lead 80 (7763a67c2):
* Messages: PF-19r (was PF-19ms, an id already taken), J-48, J-49.
* Money: FO-7ts-2, FO-7ts-3, FO-7b, FO-7g.
* Case: CS-K1, CS-C1s.
For Lead 80: BACKLOG rows for PF-19r and CS-C1s; assign PF-19b part 3 (delivery state) and a FoPersonPort row; PF-19ad is not built. For the founder: no PST in Release 1 (Unconfirmed: no accountant or counsel).

**19:13 IST 18 Nov (Lead 80):** CS-C1s part 1 (concept) started in the cloud. Its approval is mine once its challenge is done. Lead 80 adds the PF-19r and CS-C1s BACKLOG rows at the next check. Lead B is asked to own PF-19b part 3 and the FoPersonPort row. FO-7g part 1 (GST/HST only, no PST) goes to the founder as a question. The rest start as their predecessors merge.

**19:30 IST 18 Nov (Lead B):** PF-19b part 3 (`lead-b-briefs/PF-19b3.md`, after PF-19p #1961) and FO-1p FoPersonPort (`lead-b-briefs/FO-1p.md`, can start now), both on `lead-b-front-office` 6aa1391f9. Added to J-48 and CS-K1. Mine to shape: CS-K1 part 2 (after FO-1p and CS-K1 part 1), and the case-page MessagesPanel mount (after PF-19b part 3).

**19:53 IST 18 Nov (Lead 80):** batch #2122 merged at 19:47 IST (#2113, #2081, #2117, #2121, #2114, #2009). #2003 is on main. #2000 now conflicts and its CI is red. Steps sent to its cloud lane: merge main once, rename to 20261118194500_csdl1_firm_calendar (later than 20261117124500 and #2106's 133000), re-run with typed actors, diff-only Opus re-review with the full sha. Lead 80 re-reads the migration and relabels. AUD-1b can start now (#2003 on main; Lead 80's start waits for the founder).

**20:14 IST 18 Nov:** #2000 at head 64ab036a5, with "Reviewer: Approve" on it (20:13 IST): merge of main (37bb48d9a), and DW8 now acts as `seed:csdl1`. The migration is renamed to 20261118194500 with byte-identical SQL (blob 03b8346ea). Sent to Lead 80 for the P-423 re-read and relabel.

**20:22 IST 18 Nov:** Lead 81 (local_bd570ff6) is now current, after Lead 80.

**20:25 IST 18 Nov (Lead 81, local_bd570ff6, current):** #2000 had its P-423 re-read from Lead 80 and is labelled at 64ab036, now queued. #2106 is a draft: Lead 81 marks it ready and labels it once it has a matching Approve. BACKLOG row text for PF-19r and CS-C1s is in `build-lead-c-briefs/backlog-rows-2026-11-18.md`. The PF-19r brief's id line is fixed (the clash was PF-19ms) and the brief is now approved. The PST line was sent to Lead 81.

**20:28 IST 18 Nov (Lead 81):** Lead 80 had already added the PF-19r (line 1029) and CS-C1s (line 1081) BACKLOG rows on the lead branch. They match in substance, so my row-text file is removed (it is in git history). CS-C1s part 1 is PR #2132. The PST question is recorded for the founder; Lead 81 sends me the answer.

**20:29 IST 18 Nov (Lead 81):** the founder answered "Yes, GST/HST only" at 20:29 IST; recorded as P-701. Quoted in FO-7g, FO-7b and FO-7ts-3.
* 22:05 IST 18 Nov: Lead 81 asked about CS-W1 (#2125). It is running; head 216aa33e6 (round 4 Major fixed) still needs a reviewer Approve (the last Approve is on 25d1427c8). Lead 81 reads the migration (P-423) and Lead B's platform_firm grant question. Told Lead 81 that 'Prove Lead' is qa's, not mine.
* 22:25 IST 18 Nov: Lead 81 read the #2125 (CS-W1 part 1) migration (P-423): OK, labelled on 216aa33e6. Lead B's platform_firm policy and grant: accepted (a NOLOGIN role that owns only the lookup). 'Prove Lead' is Lead 81's (qa). Next: CS-K1 part 1 starts once #2125 merges (in series on cases.prisma).
* 22:55 IST 18 Nov (Lead 81, the founder's "start doing it"): overlap the chains. Each next part branches from the in-flight part's head and gets its Approve on the branch; its PR opens only after the earlier part merges, then main is merged in (P-270). P-703: report in product terms only. CS-C1s concept (#2132) approved: all 6 Majors were answered in r2. Rulings Q1 to Q3: Q3 was checked on :4400, where the local sign-in is off (403 LOCAL_SIGN_IN_OFF), so part 2 adds PLATFORM_IDENTITY=local and PLATFORM_SAMPLE_SEED=on to start.sh, named in the PR. AUD-1m brief written (branches from #2124's head).
* 23:01 IST 18 Nov (Lead 81): the overlap rows start as fresh cloud sessions once the founder says go: CS-K1 part 1, CS-C1s part 2, AUD-1m part 1 (#2124's merge first), the #2129 main merge, PF-19r, and one money session (FO-7lk, then FO-7ts part 2). Lead 81 sends the lane names. The earlier lanes declined the next parts (their task ended at the label).
