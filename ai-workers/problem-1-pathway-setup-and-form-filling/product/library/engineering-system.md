# Engineering System
Version: 1.1
Updated 20 Nov 2026 (v1.0 was 17 Nov 2026) · owner: the tech lead · status: living master

The founder's single page on how the engineering system works end to end: talks, failure modes, target system, models and effort, reconciled conflicts and decision cards. Board Library row: "Engineering system".

## Change log
| Version | Date (IST) | Change |
|---|---|---|
| 1.0 | 17 Nov 2026 | First master (public-safety review applied), assembled from Engineering System v1 (17 Nov 2026, revised 10:45-11:15 IST) and its independent critic |
| 1.1 | 20 Nov 2026 | Refreshed against DECISIONS P-685 to P-755 and the RULES.md register as of P-752: card outcomes of 17 Nov, the org move to Enterprise Cloud, merge-flow and CI changes, automatic proof, roles and operations, work-in-progress caps, the pipeline lock to 22 Nov, environments and the scale baseline. New section 11; superseded lines marked in place. Every v1.0 fact kept |

**The founder's single page.** 17 Nov 2026. First written 10:30-11:00 IST; revised after the critic 10:45-11:15 IST (clock from `TZ=Asia/Kolkata date`). Owner: the tech lead. It joins three reviews written today: the three-talk verdict, the reconciliation of every report, and the decision cards. This was read-only work. Nothing on GitHub, in the repository or in any setting was changed, run or paid for.

**Evidence labels.** [A] study or controlled experiment ([A*] = preprint or venue not confirmed). [B] official docs or a measured first-party report. [B-sec] official or first-party data that reaches us second-hand, for example through the press. [B-own] measured by our own agents and not audited; it counts as B only once a committed script reproduces it. [C] practitioner with numbers. [D] opinion or marketing. [inf] our reasoning; no source states it.

**Security note.** Known gaps are tracked privately by the tech lead.

---

## 1. Summary in 10 lines

**Since v1.0 (20 Nov):** the lines below are the 17 Nov morning picture and stay as written. What was decided after them (Enterprise bought and the move done on the night of 17-18 Nov, cards adopted, the merge flow, automatic proof, the WIP caps and the lock to 22 Nov) is in section 11.

1. **Where we are.** 11 of 101 Release 1 capabilities are Proven. At 08:01 IST all 40 CI machines were busy and 116 jobs were waiting. A PR check has taken 91 min at the median (176 at p90) since 16 Nov noon. 23% of merge batches failed this week, and 73% of those failures were clashes. 57% of PR-check minutes are second and later runs. 37% of merges are records PRs. There were 44 tech leads in 5 days. [B-own]
2. **The honest forecast for 08:00 IST 18 Nov:** most likely **13-16 Proven**. 17-19 only if everything goes right. **21 is the ceiling.** **30 is not reachable** without counting Built as Proven or skipping a re-run, and P-636 and P-651 (2) forbid both. The range leans to its low end: its top (16) assumed the move would finish by 12:00 today, and the move is now tomorrow. [B-own, inf]
3. **When 30 is credible:** about **20 Nov** at 7 a day, or about **23 Nov** at today's 2.5 a day. [B-own, inf]
4. **What limits us is rework and waiting, not model speed.** CI machines come first, then qa proving and the records queue. 71% of PRs needed a re-review. [B-own]
5. **What changes.** Rules move from prose into machines. The judge moves away from the builder. Machines write status, not agents. Changes start today, and each one has its own reading. [A][B]
6. **Agents fail mostly by leaving things out.** 41% of pre-merge Majors are incomplete changes. Next come tenant and permission holes, races and silent false success. Blocking checks ended repeats. Written rules and warnings did not. [B-own][A]
7. **No talk is best alone.** Talk 2 fixes the codebase, talk 1 the harness and proof, talk 3 the outer loop. None covers races, domain correctness, cost per change or running with no person at the top. Talks [C]-[D]; what we take [A]-[B].
8. **Quality and speed are one priority here.** Builders move to high effort. Its cost, all of it: about +3% per call in our harness [B-own], +38% per task on the official benchmark [B], about +5-10% overall [inf], and up to about 37% more model time per row [C]. Each avoided bounce saves a 91-min CI round, which outweighs that. The Lead stays on Opus 5.5 medium. Fast mode stays off.
9. **Biggest decision 1 (yours, T1):** turn "30 by tomorrow" into a dated forecast and cap new work, so the rows closest to Proven get the machines. This reverses P-462. While the cap holds, "build 10 a day" (P-644 (1)) and "101 by 29 Nov" (P-614) cannot be met; the desk already put 101 by 29 Nov at 5% on 15 Nov.
10. **Biggest decisions 2 and 3:** buy Team today and move tomorrow from about 09:30 IST in a drained window, deciding Enterprise there by a stated rule. Give agents their own GitHub identity, so each approval can be attributed to you or to an independent reviewer. That reverses P-423's "no second account".

---

## 2. The three talks

Speakers are named by role only. The full detail is in `a150/out/three-talks-verdict.md`: 26 ideas picked, 20 dropped, 19 things we do beyond the talks and 23 gaps, with every unit cited.

| Rank for us | Talk | Who (role) | Strongest idea | Own evidence | Verdict |
|---|---|---|---|---|---|
| **1** | Talk 2 | Engineer on an AI coding product team, promoting that product | Agents copy the codebase: keep it clean, enforce with checks, ratchet old cases out | [C] 31 units, [D] 55 units; all numbers self-reported | Best single talk **for us**. It is strongest where our controls are weakest: copied patterns, risky APIs, and no linter since 5 Nov |
| **2** | Talk 1 | Engineer on the Claude Code team at the model vendor | The rule-or-model test; two controls per "never"; "done" needs a check that a plausible wrong change would fail | Most accurate: 19 of 20 checked claims hold and 0 are wrong, **but 8 hold only with a catch the talk skipped**. Example: it shows a lab figure of 89%, while on real traffic about 17% of overeager actions got through (n=52). [B via doc audit] | Most trustworthy, but we already do 33 of its 84 units |
| **3** | Talk 3 | Founder and chief executive of a "software factory" vendor | Measure on your own past tasks; the factory as versioned code; failures counted by class | [D] for 54 of 55 units. The demo failed live, n=1, and an LLM judges its only chart | Weakest evidence, but its measuring ideas hold up elsewhere [A][B] |

**Best one or the combination (A148):** the combination. Each talk covers a different layer, with little overlap.

* **Picked now, from talk 2:**
  * a linter with bulk suppressions, so only new violations fail;
  * risky APIs allowed only inside one wrapper;
  * import boundaries;
  * check messages that say how to fix the problem;
  * "fix the inner loop first".

  Support [A]: one bug in the context cut the pass rate from 54.9% to 3.1%.
* **Picked now, from talk 1:**
  * irreversible items become harness rules;
  * the hard stop sits outside the agent's reach;
  * a log of every refusal;
  * proof written by a machine.

  Support: 29.6% of test-passing patches were wrong [A]; 0 of 15 agent PRs could be merged as they were [B].
* **Picked next, from talk 3:**
  * a replay suite built from our own past rows;
  * factory changes tested before they merge;
  * a private trace store;
  * cost per accepted change, shown beside stability.

  Support [A]: developers felt 20% faster and were 19% slower.
* **Dropped:**
  * every headline number (30,000 changes a day, 3,000 and 11,000 PRs a month, 0.5% reverts, 93% vs 95%);
  * talk 2's "70% of tokens go to verification" as a target: one second-hand anecdote [D], against the vendor's published figure of about 8%. We measure our own split instead;
  * the comment ban, which conflicts with P-615 (4);
  * merging the fuzzer's fixes automatically, since about 44% of agent bug reports are invalid [A*];
  * Lean proofs;
  * the Projects orchestrator for now, because its threads lose our skills and guards;
  * LLM judges as the signal of correctness;
  * every vendor pitch.
* **What we already do that none of the talks mentions:**
  * a merge queue that tests the merged batch;
  * a breaker on risky paths: on the same 133 items it found 166 Majors, against the reviewer's 107;
  * qa after merge, with an independent re-run;
  * 442 database CHECK constraints and append-only ledgers;
  * a server switch that keeps live AI off;
  * immigration values only from cited official sources.

  Keep all of them.
* **Gaps none of them covers:**
  * races in product code (60 race findings);
  * incomplete changes, our largest class of error;
  * domain correctness (5 of 7 post-merge Criticals);
  * protecting the judge;
  * having no person at the top.
* **What none of them is honest about:**
  * all three keep a person at the end while selling autonomy;
  * none shows quality next to throughput;
  * **none gives cost per change** (tokens or CI minutes per merged change). Talk 3 tells you to measure it but shows no figure of its own;
  * **agents game the checks:** none says that Claude models cheat mostly by editing tests [A*], and talk 3 sells a self-improving factory without saying that the best-known self-improving coding agent gamed its own checks;
  * none says who approves changes to the factory itself.

**Critic corrections applied:**
* Most of talk 3's "A" grades were cautions against the practice, so its support grades are D.
* The forum incident about gamed graders involved cyber-exploitation agents and about 7% of transcripts. The tasks were broken, not the grader.
* The "cannot do" exit worked much less well for Claude than for GPT-5.

**Still to do:** our talk 1 transcript is a third-party copy. Compare it with the official recording (17 min 31 s) before relying on any exact quote. It is on your reminder list in section 7.

---

## 3. How agents fail, and the control that removes each

**From our record:** 380 pre-merge Majors, 75 post-merge Majors and Criticals, and 32 incidents, coded into 36 failure modes [B-own]. **From research:** 71 graded sources.

* **Why mistakes get through.** Our tests check the code, not the rule: 46 findings say "the test passes with the rule removed". And the breaker does not run on every item; its coverage is tracked privately by the tech lead.
* **Why wrong patterns spread.** The app has no linter, no mutation step, no import rule and no property-test library. Nothing carries a lesson to the next item.
* **What ended repeats.** Blocking mechanisms did, such as the live-AI switch and the type-check self-test. Warnings did not: the IST-time rule broke 17 times under a warning hook. [B-own]

| # | Failure mode | Size here | Deterministic control | Grade |
|---|---|---|---|---|
| 1 | **Incomplete change**: the main path works, but a second way in, a dead end, an invariant or an error path is left out | 41% of pre-merge Majors (156) | One owning module per table; database constraints; contract lint; generated probes with long and Unicode input | [B-own][A] |
| 2 | **Tenant, permission and personal-data holes** | Counts tracked privately by the tech lead | Controls tracked privately by the tech lead | [B-own][B] |
| 3 | **Races, stale writes, double creates** | 60 race and 53 stale findings | Double-submit and stale-version probes; versioned updates; idempotency keys; SERIALIZABLE plus retry for money; property tests | [B-own][A] |
| 4 | **Silent false success**, in the product and in our own tools | 41 + 11 post-merge + 8 incidents | Every gate has a self-test that must fail on an empty run | [B-own][A] |
| 5 | **Tests that pass without the rule; tests edited to pass** | 46 findings | A mutation step on the diff; tests written and frozen by a separate session before the build; a check that flags deleted assertions, `.skip`, `.only` or fewer tests | [A*] Over 79% of Claude models' cheating was editing tests |
| 6 | **Parallel PRs clashing** | 73% of failed batches; 8,518 machine-minutes in 4 days | Settle one batch-failure measure; refuse lane starts that touch the same files; a migration stamp | [B-own][C] |
| 7 | **Progress claims that are not true** | M2 claimed 52, confirmed 36 | Status written by machines from systems of record, never by the agent | [A] |
| 8 | **Silent stalls** | 13 h, 7.4 h, 7.2 h, 3 h | A heartbeat outside every session; a pushed check log; a refusal counter | [B-own] |
| 9 | **Domain misreads** | 5 of 7 post-merge Criticals | A cited, founder-approved golden fixture per pathway, compared in CI. Values not in it are asked, never guessed | [B-own] |
| 10 | **Flaky behaviour** | 17 flaky events in 7 days | Quarantine with a ledger and a qa bug, never for suites guarding the high-risk classes; automatic re-run only on infrastructure failures | [A][B-own] |
| 11 | **Copied wrong patterns** | The same bad pattern in unrelated items, days apart | Linter with a ratchet; risky APIs only in one wrapper; import boundaries | [A] |
| 12 | **Wrong words on screen** | 140 of 227 open qa findings | One typed message catalogue per route; a screen-text check | [B-own] |
| 13 | **Giving in to pushback** | 13 review files accept facts "as the builder says" | A position changes only with evidence; disagreements go to `challenge.md` | [A] |

**The loop that keeps this list short** is the correction-to-check registry, which has 16 entries.
* A **correction** to anything irreversible or high-risk becomes a check on its **first** occurrence.
* Any other correction becomes a check on its **second** occurrence, and only if a machine can judge it without false alarms.
* A **direction** (a new preference) becomes a decision row, not a check.
* Each check names its layer and has a self-test, a false-alarm budget and a retire date.

---

## 4. The target system, end to end

| Stage | Control | Evidence |
|---|---|---|
| **Coding** | One ready row per fresh session. The row has an outcome, numbered rules, examples, "must stay the same", "no open questions" and Done-when. Builders run on Opus 5.5 high, with lint on edited files. At most two CI-fix rounds, then the row goes back to the queue. "Blocked: spec conflict" is a valid result | [A*] rule-following falls as rules pile up; [A] hidden details cost 16 points of success; [B] |
| **Tests** | Written and frozen by a separate session before the build, and shown red on main first. Property tests on money and rule invariants. Mutation testing on changed rule code, not coverage targets | [A][A*] |
| **Review** | A fresh-context reviewer at high effort reports defects only and skips style. At most three rounds; re-reviews read only the new diff. The Approve is tied to the reviewed commit. The seven classes below also get their class checks, the breaker and the Lead's read; a breaker on a different model comes only after the trial (L7) | [B-sec] one-round pass rate rose from 65% to 78% and reverts fell over 40% (vendor's internal data via the press; date uncertain); caution [A] reviewers from the same model family favour its output |
| **qa and proof** | qa runs after merge, independent of the builder. "Proven" only on an independent re-run with a data check per step (gates A and B). Five qa lanes by journey group. Golden fixtures for immigration values. **Changed since (section 11.3):** proof is automatic when an item's last part merges; qa walks items touching money, permissions, firm walls, schema or IRCC forms and samples the rest (P-732 (2)-(3), P-733 (3)) | [A] self-report differs from reality; [B-own] qa found 5 of 7 Criticals |
| **CI** | Cheap checks first. One full PR check after Approve, if you say yes to T6 (it changes P-651 (2)). Container proof inside the required check. One clean pipeline definition. Get more machines (Team now, then Enterprise only by the rule in T2) and cut wasted runs before paying for capacity. No self-hosted runners while the repository is public. **Changed since (section 11.2):** Enterprise bought outright (P-657); T6 adopted (P-665), then "full run before the label" (P-731) narrowed to repeat failures only (P-733 (4), P-743); 18 test parts (#2282, P-738) | [B] GitHub limits and runner security docs; [B-own] 57% of minutes are re-runs |
| **Merge** | Mergify tests the merged batch. PRs closest to Proven and qa verdict records go first. A fail-closed class job labels the seven classes by path and SQL; an unknown class is blocked. Ordinary changes keep auto-merging on green plus Approve. **Changed since (section 11.2):** qa verdict records first (P-664); parallel batches with per-area scopes (#2207, P-715) and six at once (P-739); one emergency hand merge kept for a broken queue (P-691) | [B] merge-queue practice; [B] risk tiers by path |
| **Main** | Server-side rules: `ci` required, no force-push and no deletion. Two rulesets already exist; their review is card T8. One nightly run a night. Red is judged only from the deciding check. The demo updates within 10 min of a merge | [B] |
| **Operations** | A heartbeat and check log outside every session. A script starts routines, with a brake on work in progress. The Lead stays on medium with a small context, plus a one-day compaction trial. Plan burn watched hourly. The factory's own settings are listed in a manifest and changed only by tested PRs | [B] vendor long-running harness; [A] LLMs attribute multi-agent failures poorly; [B-own] |

**Seven change classes never go through the ordinary auto-merge** (C1-C7 in the model matrix, section 5). They were 16% of app-code merges since 23 Oct and 14% since 3 Nov [B-own]:
* **C1 Client money and trust.**
* **C2 Any invariant weakened:** a dropped constraint, trigger or policy, a disabled trigger, a dropped NOT NULL, an edited guard function.
* **C3 Firm walls and privileges:** row-level security, grants, roles, the firm-scope code, and bumps of the database libraries.
* **C4 Personal-data flows:** new personal fields, export, erasure, legal hold, and sends to mail, AI or payment providers.
* **C5 Audit trail:** the audit port, the audit table, append-only triggers, and routes that change data.
* **C6 Destructive or locking migrations** (the "contract" step): drops, renames, type changes, constraints added without NOT VALID, non-concurrent indexes. **Additive "expand" migrations keep auto-merging.**
* **C7 The verification machinery:** `.github`, `.mergify.yml`, guard tools, the classifier, and the tests that guard C1-C6.

How they merge: a separate queue that needs green CI plus the class checks, the breaker, and the Lead's read label (P-423, made mechanical). **Your named word** is needed only for the marked cases: C2 when a business rule changes, C3 for a new bypass use or a cross-firm read, and C4 for a new purpose, recipient or retention. [B][A]

**Government-form output and immigration values** are not among the seven classes. They are covered by the cited golden fixtures you approve (row 9 in section 3) and by the rule that values come only from official sources. [inf]

**What this system does not do.** It does not raise tomorrow's count, and it does not remove the reviewer's Approve during the push. No published study tests an AI-only, unreviewed pipeline end to end. [inf]

---

## 5. Models and effort per role

| Role | Model | Effort | Ultracode | Fast | Why |
|---|---|---|---|---|---|
| Tech lead | Opus 5.5 | **medium** (unchanged). **Changed 19 Nov for one case (P-725):** the Lead on the new account, after a plan switch, runs Fable 5.2 medium in auto mode; builders, reviewers and breakers keep P-608 | off | off | Fable as orchestrator gets the same score for 19% more cost [B]. Fable also draws the main weekly plan faster than Opus, up to a 50% share [B], at about 3 times an Opus high call in our data [B-own]. The lever is context size (median peak 333k tokens), not effort [B-own] |
| Specifying (shaping) lanes | Fable 5.2 | **medium** (P-608 (3)); the spec template says high for risky rows | off | off | Using high on risky rows would **change P-608 (3)**: your call, in card W6. Fable draws the main plan at about 3 times an Opus high call [B][B-own] |
| Builder, ordinary row | Opus 5.5 | **high** (a change; adopted 17 Nov, card T10, P-666) | off | off | SWE-bench Pro: 92.8% to 95.3%, a third fewer failures, for +38% cost per task [B]. About +3% per call in our harness [B-own]; about +5-10% overall [inf]; up to about 37% more model time per row [C] |
| Builder, high-risk row | Opus 5.5 | high; xhigh only if measured | off | off | Above high: +1.4 points for 2.6 times the cost [B] |
| Reviewer | Opus 5.5 | high | off | off | High beats xhigh on real-bug review [C]. A cheaper-model pilot was a net loss [B-own] |
| Breaker | Opus 5.5; a different model on money and walls only after a trial | high | trial, small | off | High beats medium on defect search [B] |
| qa prover | Opus 5.5 | high for verdicts; medium for scripted replays | off | off | Screenshot judges miss hidden state, so every step checks data [A] |
| Test writer, fresh reader | Opus 5.5 | high | off | off | Tests the builder can edit get gamed [A*] |
| Research and audits | Opus 5.5 readers; Opus or Fable for the synthesis | medium for readers, high for the synthesis | yes, small or medium | off | Breadth work gains from parallel agents, at about 15 times the tokens [B] |
| Strategy desk | Fable 5.2 | high for written analyses (unchanged) | off | off | P-597 and P-608 (3) already keep the desk on Fable high; no change. Fable's guide says to start at high [B]. It draws the main weekly plan faster than Opus, up to a 50% share [B]; a desk call costs about US$0.22 against US$0.072 for an Opus high call [B-own]. The desk is 4% of Mac spend today |
| Routines | a script first | medium where judgement is needed | never | off | Reading status needs no model [B] |

**Output per hour: today's baseline (A149).** You asked that tokens be judged by lasting output per hour. These are our estimates, before any change [B-own]:

| Measure | Value |
|---|---|
| Normal burn with all lanes | 2.8-3.2 weekly plan points an hour |
| Plan points per merged app-code PR | about 2.0-2.3 (best day, 15 Nov: about 1.5; 16 Nov push: 2.8-3.7) |
| Plan points per newly Proven capability | about 19-32 |
| Where the plan goes | Lead-type sessions 52% of Mac spend; helper agents 13%; desk 4%; qa 1.5%; reviewer and breaker under 1%. Cache reads are 52% of spend |
| Today's research runs | about 8-9 points in 90 minutes (9 runs, 80 helpers, 7 runs at xhigh) |

The rule that follows: spend fast only when the model is the bottleneck, plan would otherwise expire unused, and the work lasts without needing CI or qa. The biggest saving is the Lead's context, not the builders' effort. Each change in section 8 is read against points per Proven capability and per merged PR. [B-own][inf]

**Fast mode** does not use the weekly plan. It spends cash at twice the per-token price, paid only from usage credits, which P-643 rules out. It speeds up model output only, while CI and qa set our pace: the model is 25% of a main session's active time. **Off everywhere.** Trial it only for a live session where you wait on the model, with credits you approve. [B][B-own]

**Ultracode** turns one request into a workflow of many helper agents. Effort sets each agent's depth, so the two multiply.
* **Off as a standing setting.**
* Use it by keyword only for named breadth jobs: research, audits, invariant sweeps.
* Run its helpers at high, keep the size small, and give a token estimate first.
* Never launch with `--effort ultracode`, because it silently sets xhigh.
* Give every helper an explicit model and effort. [B][inf]

**Fix now:** four Lead-line sessions moved to xhigh this morning, at +33% per call. Set them back to medium. [B-own]

---

## 6. Conflicts reconciled (one line each)

| Conflict | Settled as |
|---|---|
| Every change today (operating model) vs one change at a time (blank sheet) | Start all today. Changes with their own metric run in parallel. Changes judged only by an overall rate get one per window. Changes that can fail the same way land one after another |
| "At most one workflow change a week" (P-188) | Superseded by A144, but only with your yes (card T4). **Since 19 Nov:** one change at a time, each measured (P-730 (3)); no new workflow decision before 23 Nov unless it fixes something broken (P-734) |
| Team (P-652) vs Enterprise now (decision cards) | Buy Team now. Upgrade to Enterprise right after the move is verified **only if** peak jobs wanted in busy hours still exceed about 50 after the demand cuts, **and** the purchase page shows monthly billing, no seat minimum and a step-down path. Otherwise stay on Team. **Superseded 17 Nov:** Enterprise bought outright, no trial (P-657, P-658); no move back to Pro (P-705) |
| Move at 09:00 or 11:00 today vs the checklist | Move tomorrow from about 09:30 IST: the move takes 5-7 h and stops merges for 3-4 h. **Superseded 17 Nov:** moved the same night once the queue read empty twice 6 min apart, with 09:30 18 Nov as the fallback (P-688, P-689, P-692) |
| Create a ruleset on main vs one already exists | Two rulesets already exist. Review them (card T8); do not create a duplicate |
| Self-hosted gate pool vs no self-hosted runners while public | Cut gate runs first. Use Namespace hosted machines for gate jobs only if waits stay long. Never self-hosted for any job an outsider can trigger |
| Fable Lead (CI D11) vs Opus medium | Opus 5.5 medium; no Fable Lead |
| Script dispatcher vs compaction trial vs Lead on medium | All three, in order: the watcher moves out of the Lead today, the compaction trial runs today, the dispatcher runs in shadow from about 27 Nov |
| Builders on medium (P-608) vs high | High on every builder row, measured per PR, with a 48-hour stop rule (card T10) |
| Every correction becomes a check (talk 2) vs "recurred twice" | One trigger: first occurrence if irreversible or high-risk, otherwise the second, and only if a machine can judge it |
| Retire the 30 target (blank sheet) vs the founder's 30 | We do not retire your targets. We report against 30, against the forecast, and against 101 by 29 Nov (P-614), and ask you to re-date |
| A fixed cap of 10-12 lanes vs admission by queue wait | Admission control by queue wait (no new capability row while P95 queue wait is over 60 min **or** batch waits are over 15 min), plus P-623 (1)'s WIP rule made blocking: 6 lanes opened against it on 15 Nov. Ceiling: 10-12 code lanes now, about 15 after the move. Needs your yes (card T1) |
| Admission control vs "build 10 a day" (P-644 (1)) and 101 by 29 Nov (P-614) | A real tension, not settled here. The cap frees machines for near-Proven rows but stops the build half of P-644 and puts P-614 further out of reach. Your call (card T1) |
| Retire process records vs P-557 | P-557 kept word for word. Process state is pushed at every step and merged twice a day; qa verdicts go first |
| Re-run failed shards once (anti-stall item 3) | Only on infrastructure failures. A test that passes only on retry is suspect, not green |
| Auto-quarantine of flaky suites (anti-stall item 5) | Yes, but never for suites guarding the high-risk classes or listed as required |
| A Build Lead's read counts as the tech lead's (anti-stall item 4) | Declined: it would lower the migration and tenant-wall gates |
| All test paths on the Lead's read list vs a narrow check | Narrow check: only PRs that weaken tests need the Lead's read |
| Replay budget of 25-45 weekly points vs a trimmed run | Trimmed: 12 rows, one attempt each, about 7-14 points, run only when plan would otherwise expire |
| Cheaper helper models (model matrix) vs P-303 | No: they measured −4 points, and quality comes first |
| Comment ban (talk 2) vs P-615 (4) | Keep comments that give a reason with an id; ban inline lint escapes |
| Our usage numbers graded B vs unaudited | Labelled B-own until a committed script reproduces them |
| Private repository cost: US$1,250-1,700 a month (P-539) vs about US$5,000 (blank sheet) | Both rough. P-539 (13 Nov) used about 281,000 Linux-equivalent minutes in 30 days (±30%). The blank sheet used today's volume, about 190,000 machine-minutes a week (about 820,000 a month), at US$0.006-0.008 a minute, not re-checked. The gap is volume. Stay public either way (L8) [inf] |

---

## 7. The decision cards, in order

"You do" lists only what needs your card details, password, 2FA, a settings paste, a browser click or your word.

**Outcomes (added 20 Nov):** the cards below are kept as proposed on 17 Nov. What was chosen is in section 11.1.

### Today

| # | Card | Recommendation | Cost | Reverses or changes | You do |
|---|---|---|---|---|---|
| T1 | The target and the cap | 30 becomes a dated goal (about 20-23 Nov). North star: Proven a week, with change-fail beside it. **Admission control now**: no new capability row while P95 queue wait is over 60 min or batch waits are over 15 min; make P-623 (1)'s WIP rule blocking; ceiling 10-12 code lanes, about 15 after the move. Lanes finish near-Proven rows, review fixes and qa bugs. **The trade:** while the cap holds, "build 10 a day" and "101 by 29 Nov" cannot be met | US$0; saves plan | P-462. In practice P-644 (1)'s build half and P-614's 29 Nov date | Your call on the target, the cap and the dates |
| T2 | GitHub plan | Buy **Team** before the move (P-652 stands). File the free Support ticket for a higher job limit now. Enterprise only by the rule in section 6 (peak demand over about 50 jobs after the cuts; monthly billing, no seat minimum, a step-down path). The Enterprise trial does not include the higher job limit (as read from GitHub's page) [B]. Keep Pro for a week as the rollback floor | Team about US$4 a month; Pro about US$4 for the extra week; Enterprise about US$21 a month a seat, terms unverified | Nothing (Enterprise would reverse P-652) | Enter the card details; file the ticket |
| T3 | The move | Tomorrow, 18 Nov, from about 09:30 IST, in a drained window, following the checklist | 45 min of your time today, 1.5-2 h tomorrow | P-652's timing only | Answer the checklist's nine questions |
| T4 | Start changes today | Under the rule in section 6, not one change a week | US$0 | P-188; WAY-OF-WORKING line 85 | Yes |
| T5 | qa verdict records first | qa verdict records PRs go first in the queue. They are the biggest single risk to tonight's count | US$0 | B119; P-376 (1) | Yes |
| T6 | "Full tests once" | One full PR check after Approve, plus every suite in the merge batch. Never "no suites on the PR": 32% of PRs went red on their own check | US$0; frees about 30,000 machine-minutes a week | **Changes P-651 (2)**, which chose fast checks on each PR and the full set once on the batch and main. This adds one full PR check, a different design. Fits P-623 (3)'s intent | Yes or no |
| T7 | One settings paste | The paste text is in the operating model, section 5a; the reasons are tracked privately by the tech lead. Hooks come in a second paste | US$0 | Nothing; narrows permissions under P-387 | Paste it on the Mac |
| T8 | Repository settings review | The items are tracked privately by the tech lead | US$0 | Nothing | 15 min in the browser |
| T9 | Queue tuning | Two batch checks at once instead of three, after the 08:00 report, alone for 24 h | US$0 | P-224 (5) | Yes, tomorrow |
| T10 | Builders on high | From the next lane start, with a stop rule at 48 h | About +3% a call [B-own]; +38% a task on the benchmark [B]; about +5-10% overall [inf] | P-608 (1); P-605 (2) for builders | Yes |
| T11 | One Lead for the day | One-day compaction trial on Opus medium; stop at the first missed item; no Fable Lead | US$0 | P-446 (1) and (6) for one day | Yes |
| T12 | A watcher outside every session | A Mac heartbeat and a scheduled read of the check log, before tonight | US$0 | Nothing | The 2-minute going-away checklist |
| T13 | Rules v2 | About 21 enforced rules and 12 principles, plus the single check trigger. Every old row is kept word for word in an ID map | US$0; avoids about 78 check PRs | Narrows P-611 (1); P-619 (6); P-615 (2) | One batch yes |
| T14 | Tools | eslint 9.39.5, typescript-eslint 8.62.1 and eslint-plugin-react-hooks 7.1.1, plus pins of fast-check 3.23.2 and playwright 1.64.1. Lint reports only, at first | US$0 | Completes P-358 | Yes under STANDARDS §1 |
| T15 | Weekly plan | Keep P-643's manual reset. At 5.8% an hour, the 96% line comes at about 03:00 IST 18 Nov. **Why the Usage check:** verified Ultra accounts have no 5-hour window (Help Center, as read [B]). A "Current session" bar on ours likely means verification is incomplete [inf]. If it shows, ask Anthropic support to complete it; that would remove the burst limit | US$0 | Nothing | Check Settings › Usage for a "Current session" bar; contact support if it shows |
| T16 | Two product items | #2062: keep P-574 (2) and warn on similar names only. Record it as a departure from the requirements, with the 0.6 threshold as Sample. Manitoba stays Sample until the browser read works | US$0 | Nothing | Reconnect Claude in Chrome |
| T17 | Mac housekeeping | Private items tracked privately by the tech lead; run consolidate-memory; amend P-203; no comment ban; put this page's master in the board Library | US$0 | Nothing | 10 min |

### This week

| # | Card | Recommendation | Cost | Reverses or changes | You do |
|---|---|---|---|---|---|
| W1 | Agent identity | **Why:** so each approval can be attributed to you, or to a reviewer separate from the builder (today 1,633 commits carry one identity). That is the "something we can't ignore" P-423 asked for. A machine identity for agents: try it on one canary lane in tomorrow's window, after the move is verified, with a 30-minute rollback. Auto-fix only after this | Likely US$0-4 a month (unverified) | P-423's "no second account" | Agree; create the account and its 2FA |
| W2 | Cloud environment | One Limited environment with named trusted hosts and no paid AI key. A one-week trial of deny-instead-of-prompt | US$0 | Nothing | Create it yourself (P-387) |
| W3 | High-risk classes | The fail-closed class job for C1-C7 (section 4) lands now; the tech lead does it, since it adds a gate. A separate queue for these classes later this week | US$0 | Nothing | Nothing |
| W4 | Replay to settle models | 12 past rows, medium against high, one attempt each, run when plan would otherwise expire | About 7-14 weekly points | Nothing | Yes to the budget |
| W5 | Spec template | Tests written and frozen by a separate session. You approve example tables only for regulated or new behaviour | US$0 | Nothing | Approve examples when asked |
| W6 | Other model settings | Desk stays at Fable high (as P-597 and P-608 (3) already say); routines as scripts; no cheaper helper models; fast mode off. **One change to decide:** the spec template's "Fable high for risky rows" for specifying lanes | US$0; Fable high draws the main plan at about 3 times an Opus high call | Only the specifying-lane item would change P-608 (3) | Yes or no on the specifying-lane item |

### Later (each comes back as its own card)

| # | Item | Recommendation | Reverses |
|---|---|---|---|
| L1 | Auto-fix and the GitHub App | After W1; its other preconditions are tracked privately by the tech lead | Nothing |
| L2 | Paid overflow machines | Decide 48 h after T2 and T6 with fresh numbers. Pay only if batch waits stay over 15 min. Cost about US$1,600-2,400 a month for batch-only load (CI D4); your decision, since it is over US$10 (P-254) | P-651 (3) timing |
| L3 | Self-hosted runners | No, while the repository is public | Declines anti-stall item 6 |
| L4 | Script dispatcher | Shadow from about 27 Nov, live in December | The Lead's role in P-384 |
| L5 | Work state out of the public repository | Later; records batch twice a day for now | P-557 in part |
| L6 | Projects (beta) | Later | Nothing |
| L7 | A second breaker or reviewer on a different model | After the replay trial | P-605 (3); P-455 (5) |
| L8 | Private repository | Stay public. P-539 put private at about US$1,250-1,700 a month on 13 Nov volume; at today's volume it would be roughly US$5,000 [inf]; see section 6. Revisit when CI minutes fall | Nothing |
| L9 | Outside heartbeat service | After the Mac heartbeat | Nothing |
| L10 | A Build Lead's read counting as the tech lead's | Declined | P-423 (declined) |

**Kept, not reversed:** P-557, P-636, P-214, P-423 (the Lead's read), P-643, P-635 (3), P-608 for the Lead and the desk, P-597, P-615 (4).

### Reminders for you to check (A145)

| When (IST) | Check |
|---|---|
| Now | The Support ticket is filed. Settings › Usage shows no "Current session" bar (T15) |
| Today | Card T8's repository settings review is done |
| 12:30, 16:30, 20:30 | Readings after the settings paste (false blocks) |
| Before the move | The checklist's go/no-go items are all green, and the Team payment has cleared |
| Move day | The checklist's move-day test steps all pass before work restarts. This is the biggest move risk |
| 18 Nov 08:00 | Proven against the 30 asked and the 13-16 forecast (which leans low), with slip reasons |
| 18 Nov 09:00 | Peak jobs wanted and gate-job wait. These decide Enterprise (over about 50 jobs) and machines for gate jobs |
| This week | Compare our talk 1 transcript with the official recording before quoting it |
| This week | Points per Proven capability and per merged PR, against the baseline in section 5 |
| +48 h | Plan points, review rounds and CI rounds per PR, for PRs built at medium against PRs built at high |
| Weekly | Any "enforced" rule that broke again: its check is reviewed |
| 29 Nov | Where we stand against 101 (P-614), whatever you decide on T1 |

---

## 8. What the tech lead does alone today, and how each change is measured

None of these spends money, widens a permission, lowers a gate or moves a milestone (P-384, P-486). The one exception is marked: it runs only after your yes on T1. The tech lead reads each `.github` or Mergify diff (P-423). Each can be undone with one revert.

**Rule for every change:** keep it only if its own metric moves toward its target, and Proven a day, open Majors, batch failures, red-on-main and points per Proven capability do not get worse. Readings come at three points:
* +2 h, for false blocks;
* +24 h, for a day and night of load (about 60 batches);
* +48 h, for finished PRs.

| Clock (IST) | Action | Metric (target) |
|---|---|---|
| 10:30 | Restart the usage log. Commit the baseline snapshot script. Set the four xhigh Lead-line sessions back to medium | Plan % an hour (≤3%); cost per call; points per merged PR |
| 10:30 | Narrow #2032 before it merges, so only overflow jobs use the trial machines | Long jobs stay on GitHub's machines |
| 10:30-11:45 | Your session: cards T1-T17 | Cards answered |
| 11:00 | Shrink the start hook's output from 12,215 characters to under 1.5 KB | Characters printed |
| 11:00 | A heartbeat plus a pushed check log. A starter script in front of each routine, with a brake on work in progress | Checks over 40 min late: 0 |
| 11:00 | Split queue failures into real, flaky and clash. Settle one definition of batch failure | One definition |
| 11:45 | First pipeline merge: Mergify priority for near-Proven product PRs, and for qa verdicts after T5 | Approved to merged under 1 h |
| about 13:15 onward | Then the other pipeline PRs, one at a time, with one green batch (about 90 min) between them: (1) a guard PR (tracked privately by the tech lead); (2) the startup-failure fix; (3) fast checks first, plus container proof; (4) one PR check after Approve (only after your yes on T6); (5) lint, reporting only (after T14) | Gate runs a day; startup failures: 0; shard minutes after a part-1 failure: about 0; re-run share under 30% at +48 h; new lint violations: 0 |
| 12:00-18:00 | In parallel, each with its own revert trigger: pin actions to full SHAs; a dependency audit that only reports; the fail-closed class job for C1-C7; a review brief with round caps and diff-only re-review | Review rounds ≤2; unknown-class PRs blocked |
| Every 30 min | Five qa lanes by journey group; a slip table for the rows closest to Proven | Proven a day; Built to Proven ≤12 h |
| Evening | The correction-to-check registry, starting with the gate self-test. The narrow weakened-test check. The hourly metrics workflow | Every gate fails on an empty run; 15 metrics each hour |
| Overnight | The heartbeat watches | A check-log commit at every check |
| Overnight, **only after your yes on T1** | No new capability rows while queue waits are over the T1 thresholds. Without your yes, lanes start rows as P-462 and P-623 allow today | New rows started while waits are high: 0 |
| 18 Nov 08:00 | Report Proven against 30 and against 13-16, with slip reasons | An honest count |
| 18 Nov 09:00 | Daily refresh of this page and its master | Master not "behind" |

**Why pipeline merges land one at a time:** if `ci` breaks, we revert one PR instead of guessing among five. It delays the machine savings by a few hours. [inf]

---

## 9. Sources and grades (short)

| Source | What it shows | Grade |
|---|---|---|
| ImpossibleBench | Over 79% of Claude models' cheating edited tests; read-only tests stopped those edits | [A*] |
| METR randomised trial | Developers felt 20% faster and were 19% slower | [A] |
| Study of test-passing patches | 29.6% of patches that passed the tests behaved differently from the real fix | [A] |
| METR review of agent PRs | 38% passed the maintainers' tests; 0 of 15 could be merged as they were | [B] |
| Instruction-following at scale | Rule-following falls as rules pile up (68% followed at 500 instructions) | [A*] |
| Context-bug study | One bug in context cut the pass rate from 54.9% to 3.1% | [A] |
| Self-preference studies | Models favour their own output; judges are wrong in both directions on code | [A] |
| Property-test study | About 50 times the mutants killed per test | [A] |
| Cursor-adoption study | Warnings +30% and complexity +41% after adoption | [A*] |
| DORA 2024 and 2025 | AI amplifies what is already there; stability fell about 7.2% with adoption | [B] |
| Claude Code docs (permissions, hooks, memory, auto mode, cloud, fast mode, effort) | Deny rules are checked first; hook output is capped; prose is context, not enforcement; fast mode costs credits | [B] |
| Claude Help Center, Fable on your plan | Fable draws the regular weekly limits, faster than other models, up to a 50% share | [B] |
| Official SWE-bench Pro results for Opus 5.5 | Medium 92.8% at US$0.21 a task, high 95.3% at US$0.29, xhigh 96.7% | [B] |
| Independent model-time index | Up to about 37% more model time per row at high | [C] |
| Anthropic code-review results | One-round pass rate from 65% to 78%; reverts down over 40%. Internal data reported through the press; date uncertain | [B-sec] |
| GitHub limits and runner security docs | 40, 60 or 500 jobs at once by plan; no self-hosted runners on public repositories | [B] |
| Our own record (380 + 75 Majors, 32 incidents, 2,521 CI runs, usage logs) | The numbers on this page | [B-own] |
| Talk 1 | Accurate on the docs, with 8 of 20 claims needing a catch; promotes features and a beta | [C]-[D] (B via audit) |
| Talk 2 | Self-reported numbers | [C]-[D] |
| Talk 3 | Vendor demo, n=1 | [D] |

**Limits.**
* One coder per talk, so failure-mode boundaries may be off by about ±15%.
* Our record was coded by one agent and never audited.
* Many of talk 3's outside grades rest on search excerpts.
* No talk was re-watched, and the talk 1 transcript is not yet compared with the official recording.
* Rough figures: the cost of high effort (+3% per call, +5-10% overall), the 35-hour median from Built to Proven (only 4 rows), the output-per-hour baseline, and both private-repository prices.
* The forecast leans low because its top end assumed a move by 12:00 today.

**Detail files:** `a150/out/three-talks-verdict.md`, `a150/out/reconcile.md`, `a150/out/decision-cards.md`, `a147/out/failure-modes-and-talks.md`, `a149/out/model-matrix-and-practice.md`, `a146/out/engineering-system-v1.md`, `a142/out/operating-model.md`.

---

## 10. How this page stays live

* **One master; this page is a view of it (P-593).** The master is the engineering operating model, to live at `product/design/engineering-operating-model.md`, with this page as its founder view. Known gaps are tracked privately by the tech lead. (P-539)
* **Before the master enters the public repository:** the tech lead re-reads it line by line and moves anything that hints at an open control, or its status, to the private notes. Only then is it committed.
* **Registered in the board Library** in two places, whose names must match: `cockpit/library.json` (read by `library-freshness.py`) and the `LIBRARY` array in `cockpit/index.html`. Feeds: `.github/workflows`, `.mergify.yml`, `.githooks`, `.claude/settings.json`, `product/RULES.md`.
* **Refresh triggers:**
  * any change to a feed marks the master "behind" at the next check;
  * daily at 09:00 IST: baselines, the Proven line, points per Proven capability and the change log;
  * each reading at +2 h, +24 h and +48 h: keep the change or undo it.
* **Numbers come from scripts, never by hand:** the baseline snapshot, the flow and queue-cause scripts, the hourly metrics workflow, the usage log, and the Proven count from `qa/CAPABILITIES.md`.
* **Owner:** the tech lead. Builders and qa never edit it. Every step is committed and pushed (P-557).
* **Version history:** v1, 17 Nov 2026 11:00 IST, from today's three joined reviews. v1 revised the same morning after an independent critic: the seven classes corrected to C1-C7, five grades lowered, the full cost of high effort, the output-per-hour baseline, the target tension, the Enterprise rule, and founder-gated items marked. The next version follows tomorrow's 08:00 report and the move. v1.1, 20 Nov 2026: refreshed against DECISIONS P-685 to P-755 and RULES.md as of P-752 (section 11).
* **Feeds as registered (20 Nov):** the Library feed list for this master is RULES.md and DECISIONS.md, not the list in the third bullet above.

---

## 11. What changed since v1.0 (17-20 Nov 2026)

Each line comes from a DECISIONS row (P-NNN) or the RULES.md register as of P-752 (20 Nov 11:15 IST). Product-scope rows are left out. Estimates in those rows are marked as estimates. Lines are grouped by part of the system and listed oldest first within each group.

### 11.1 Card outcomes (17 Nov)

| Card | Outcome | Row |
|---|---|---|
| T1 | Adopted as a **ramp**: 5-7 Proven a day 19-20 Nov, 8-10 on 21-23 Nov, 10-15 from 24 Nov; no new capability row while P95 queue wait is over 60 min or batch wait over 15 min; daily checkpoint | P-663 |
| T2 | **Enterprise bought outright, no trial** (the trial lacks the higher job limit); this reverses P-652's Team. Personal Pro kept at first | P-656, P-657, P-658 |
| T3 | Moved the same night, 17-18 Nov, not 18 Nov 09:30 (see 11.2) | P-688, P-692 |
| T5 | qa verdict records PRs first in the merge queue | P-664 |
| T6 | One full PR check after Approve, plus every suite once in the batch (CI-B); later reshaped (11.2) | P-665 |
| T7 | 36 more deny lines in `.claude/settings.json` (75 in all), run by the founder at 11:48 IST | P-670 |
| T10 | Builders on high effort, with a 48 h stop rule | P-666 |
| T13 | Rules v2 adopted; RULES.md stays the register until the v2 page lands | P-667 |
| T15 | Contact support; keep the free reset as backup | P-669 |
| T9, T11, T12, T14, T16, T17, W1, W3-W6 | Adopted as recommended in one batch, including W1's reversal of P-423's "no second account" | P-668 |
| W2 | The cloud environment reads canada.ca for citations; Limited network, no secrets | P-673 |
| Apps | Only the Claude, Mergify and Namespace apps on the organization | P-662 |

### 11.2 Account, CI and merge flow

* **Account (RULES.md, 20 Nov):** the repository is on Enterprise Cloud since 18 Nov. The register says "500 jobs documented, 1-6 measured". This replaces "GitHub Pro, 40 Actions jobs at once".
* **The move:** prepared on 17 Nov and done that night. The rule was to move only when the queue read empty twice, 6 min apart, with no batch in flight (P-688, P-689, P-692).
* **Machines after the move:** only 1-3 hosted jobs ran at once. Job wait was a median 65.7 min, against 0.1 min before the move (P-695). The Lead switched the enterprise to multi-cloud hosted compute in the browser (change log C26), and the founder said no Support ticket for now (P-693). Later the same day a ticket was filed, with a rollback deadline (P-695). Waits then fell to a median of 0.0 min, and the enterprise runner page showed a 180-job limit (P-696). **No move back to Pro:** the rollback triggers were withdrawn (P-705).
* **Records PRs:** a PR made only of records is exempt from the 800-line limit (P-686, #2086, change log C19). P-742 (19 Nov) rules that data under `product/qa/reports/` also counts as a record, so qa proof PRs would not pay a full run; not in force yet: #2355 is still open and `tools/records-only.sh` is unchanged since 18 Nov.
* **Drafts:** a PR is opened non-draft only after Approve (P-683). Older drafts are marked ready by the Lead with `tools/pr-ready.sh`, never by the founder (P-685, change log C18).
* **Emergency hand merge kept:** the only exception to queue-only merging is a pipeline or CI fix while the queue itself is broken. The Lead may merge it by hand after green `ci` and a review, and logs it in `library/engineering-change-log.md` (P-691).
* **One-off big batch:** on 18 Nov the product queue's batch size went from 6 to 13 for one night (#2152, manifest 1.2.1). It was set back to 6 on 19 Nov (P-704).
* **"Run tests once":** #2151 (CI-RUN part 2) was merged by hand on green, ahead of the queue (P-708).
* **Module cards:** the shared Tables and Tests lines are generated or kept one file per row, so PRs stop conflicting on them. This shipped as #2195 (P-712, P-721).
* **Merge lanes:** Mergify parallel mode with one files scope per fenced module (P-715). Pipeline PRs get their own lane and are never batched with product PRs. A new blocking check reports only for its first 24 h or 10 runs (P-717 (1)-(2)). Per-area scopes are on main (#2207). Six batches run at once since 19 Nov evening, up from 3 (P-728 (2), P-730, P-739, #2290).
* **Full run before the label:**
  * P-731 required one green full run of every suite before `review: approved`, enforced by the label guard and the queue gate (CI-PRE, #2249).
  * P-733 (4) narrowed this to a PR that failed a merge batch. Such a PR is relabelled only after a green full run, with every failing suite named.
  * #2249, as merged, required a full run on every PR. It dequeued about 15 PRs, so it was switched back to P-733 (4) with the repository variable `FULL_RUN_FROM` (to 22 Nov 20:00 IST). Every merge batch still runs every suite (P-651, P-743).
  * Owed: after a failed batch, the full run starts by itself on each dequeued PR (P-751 (2)).
* **Faster batches:** 18 test parts instead of 8, so batch time falls from about 60 to about 25 min (estimate, P-738, #2282).
* **Test quality and impact map (B203), an exception to the lock:** per-test coverage with c8, a generated capability → code → test map, PR-stage runs of only the affected suites (the merge batch keeps every suite), and a Stryker mutation pilot on one module. New tools go through the STANDARDS §1 gate first (P-744).
* **Quarantine:** a date-dependent staff-hours suite is held out of PR and batch runs until its fix lands, which is due 21 Nov (#2435). The nightly full set still runs it (P-754).
* **Size exceptions** under P-610 are recorded one PR at a time: #2169 (P-711), #2204 (P-720), #2322 (P-748) and #2427 (P-753). P-753 moved the business files to the private repository. The 800-line limit stands, and P-733 (2) dropped the 3,000-line cap.

### 11.3 Proof and qa

* **qa walks on GitHub's machines,** with a replayable video. The Mac keeps 1-2 exploratory sessions. Gate A counts once qa reviews the recording (P-700).
* **Automatic proof:** when an item's last part merges, GitHub runs its J-test and pack on main and posts the verdict (P-722, P-724 (4), P-728 (3), P-732 (2), P-733 (3); #2233). The J-test merges in the item's last PR (P-728 (1)).
* **qa audits, a lower bar told to the founder before he chose:** qa walks items that touch money, permissions, firm walls, schema or IRCC forms, plus a daily sample of the others. A failed audit takes the item back to Partial (P-732 (3), P-733 (3)).
* **Heavy gates only on risk paths:** the breaker and the Lead's read cover money, permissions, firm walls, schema, migrations, IRCC forms and `.github/`; one Opus reviewer covers the rest (P-732 (4)/(7)). Owed: drop screenshots and records from the Lead-read path list (P-751 (3)).
* **GitHub add-ons:** journey videos kept 90 days; a batch-failure alert (#2234); an evaluation of the Claude Code GitHub Action, with nothing installed (P-729).
* **Four qa lanes,** up from 2 (P-728 (4), P-740).

### 11.4 Roles and operations

* **Agents do the work.** When a tool path is stuck, the Lead does the step itself in the signed-in built-in browser: no passwords, money, security settings or deletes (P-699). This was made standing for labels, Ready for review and reopens after the Lead's read, never in place of the reviewer's Approve on code (P-752; `tools/lead-pr.sh`). Night labelling and lane restarts were covered by a blanket approval (P-709).
* **Lead PRs** get an independent Opus reviewer's Approve before the Lead labels them (P-695, A168).
* **Plan switch:** at 94% of the weekly plan the founder gets the forecast; at 96% lanes push and stop; at 97% the founder switches account and the new Lead resumes from `RESUME-ON-NEW-ACCOUNT.md` (P-714). On that account the Lead runs Fable 5.2 medium, auto mode (P-725). Extra paid usage for lanes is allowed (P-746 (2)).
* **Bottleneck at every check:** the Lead measures the flow from tools, names the one constraint, applies the simplest fix and re-measures. No cause is claimed unmeasured. A "constraint" section in lead-watch.sh is owed (ENF-738, P-738, P-751 (4)). lead-watch counts only runs under 6 h old as waiting (P-751 (1)).
* **Product numbers only:** speed means app-code PRs (`tools/app-code-prs.sh`) and qa-confirmed Works. Records, tooling and CI are shown apart (P-703).
* **One action list:** `design/full-power-plan-2026-11-17.md`, enforced by plan-watch.py (P-690). The changes adopted from the talks are evaluated on 21 Nov by an independent reviewer on measured numbers (P-702).
* **Session names** read `<role> · <what it works on>`. Lead numbering restarts at Lead 1 (series 3) after Lead 100 (P-749).

### 11.5 Work in progress and the lock

* **Finish to Proven first:** lanes outside the finish list park with a resume note; nothing is deleted (P-707).
* **The unit of work is one Release 1 item's whole chain:** build parts, J-row, proof (P-719). This is grouped into journeys on two team tracks (P-723, P-724, P-726). From 20 Nov it runs as **waves with enforced caps** in `design/waves.md` (P-745, B204 checks):
  * at most 8 items building and at most 12 Built-not-Proven;
  * wave N+1 builds while wave N is proved.
* **Pipeline freeze** until 30 Proven, except fixes for a red main or a broken queue (P-716). Records and pipeline work take their own lane, so it never blocks product (P-717).
* **Lock:** P-733 runs unchanged to the evening of 22 Nov. A new workflow row before 23 Nov must be marked as a fix (P-734, ENF-733 owed).
* **Targets (for the T1 line):** Release 1 stays 29 Nov (P-740). Its core is Waves 1 and 2, about 45-50 items, against 101 (P-746). The target for 20 Nov is 20-25 Proven (P-746 (3)).

### 11.6 Environments and scale baseline

* **Staging, dev and AWS** wait until 30 R1 items are Proven, with 40 as the upper mark. The demo stays on the Mac (:4400) until then (P-718, P-750).
* **Scale baseline:**
  * size: 50 firms at launch, 100 at most, 1-10 staff each (about 1,000 staff users plus clients);
  * hosting: one AWS region in Canada, one managed PostgreSQL with automatic backups, a managed container service, two environments;
  * out of scope as over-engineering: Kubernetes, several regions, microservices and an operations team (P-755).

---

## The independent critic (17 Nov 2026)

An independent critic checked v1 against the A142-A149 outputs, the reconciliation, the decision cards, the three-talk verdict, the anti-stall and CI research, and DECISIONS rows. Verdict: **ready with fixes**. Every point was checked against its source and applied in this page:
* **Grades and numbers (12 spot-checked, 6 issues, 8 points):** the seven change classes corrected to C1-C7 (invariant weakened and audit trail restored; additive expand migrations keep auto-merging); ImpossibleBench graded A* throughout; "0 of 15 agent PRs mergeable" graded B; "rule-following falls as rules pile up" graded A*; the Anthropic code-review figures graded B-sec; the full cost of high effort shown (+3% per call, +38% per task, +5-10% overall, up to 37% more model time per row); talk 1's "8 hold only with a catch" added; the private-repository price gap explained.
* **Checked and matching:** 116 jobs, 91/176 min, 23%/73%, 57%, 37%, 44 Leads, 13-16 / 17-19 / 21 and 20-23 Nov, 166 vs 107 on 133 items, 41% (156), talk 2 C31/D55, talk 3 D 54 of 55, SWE-bench Pro 92.8/95.3/96.7, +1.4 for 2.6x, xhigh +33%, 14-16%, the 5.8%/h line at about 03:00 IST, reviewer high over xhigh [C].
* **Missing items added:** Fable's draw on the weekly plan; the output-per-hour baseline (A149); the 101-by-29-Nov target (P-614) and the build half of P-644; the full admission-control trigger and the ceiling after the move; the forecast's downward bias; why agent identity matters; the Enterprise decision rule; why the T15 Usage check; the talk-verdict reminders.
* **Founder decisions flagged:** the overnight cap runs only after T1; T6 is called a change to P-651 (2); W6 no longer "settles" P-597 against P-608; P-608 (3) is on the model table.
* **Personal names:** none found.
* **Security:** handled in a form suitable for the public repository. Known gaps are tracked privately by the tech lead.
