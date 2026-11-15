# qa optimisation: prove 8-10 capabilities a day without lowering a gate (16 Nov 2026)

**What this is.** A research and design page, read-only except this file (founder, 16 Nov 00:1x IST: optimise all qa lanes "using best in class science and the facts and proven framework … when to do it, how to do it, how much to do it, what all to do it, when not to do it, so that it matches the speed" of 8-10 capabilities a day). It changes no product code, no skill and no rule; each change in §8 goes through the Lead as its own row. Live AI off, US$0.
**Measured on** `main` e593accc (15 Nov 18:4x UTC) and GitHub's API read 15 Nov 18:4x-19:0x UTC (16 Nov 00:1x-00:3x IST). Every number names its source and sample (P-500); "not measured" where no source holds it (P-596).
**Duplicate check:** no qa-optimisation page under `product/design/` and no PR whose title names qa optimisation, read 16 Nov 00:1x IST (GitHub PR list, 472 PRs since 9 Nov).

---

## 1. Measured baseline

### 1.1 Facts given in the brief, and what the records say
| Fact | Brief | Records (source) |
|---|---|---|
| Release 1 capabilities built (every part merged) | 12 of 101 | 15 of 101 at the Lead's last pass: 9 qa Works\*, 6 Merged (`MVP-CHECKLIST.md` §A counts, 15 Nov 16:3x IST); 7 of the 9 Works\* are old C-row proofs carried over (asterisk) |
| Proven (qa Works on an R1 row) | about 6 | R1 rows Works in `qa/CAPABILITIES.md`: **2** (R1.2, R1.9); plus map 99 Works on qa #1833 and P-616; so 3 Release 1 rows by a qa verdict this week, + 6 carried C-row proofs the checklist marks qa Works\* without a fresh R1 verdict = the checklist's 9 |
| Items waiting for qa | 9 | not countable from files: `qa/built/` holds 38 notes, most older than this week (they are deleted only on a re-score) |
| "No first qa verdict since 13 Nov" | — | **Not so for first verdicts**: R1 first verdicts were given on 14 Nov (#1748) and 15 Nov (#1789, #1792, #1833). True for **first-time Works on a newly built Release 1 capability other than R1.2** (14 Nov): every other first verdict was Partial or Not tested (§1.3) |

### 1.2 Time from the newest part merged to qa's first verdict (Release 1, 13-15 Nov)
Sample: every R1 capability that had a part merge between 13 Nov 19:00 UTC and 15 Nov 04:00 UTC and then got a verdict (n = 7 newest-part merges covering 10 capabilities). **The start event is the newest merged part, not the last of all parts:** R1.109 (PF-21 part 2 missing), R1.53 (FO-5b, FO-5s missing) and R1.55 (FO-6, FO-5s missing) were scored with parts still missing (`2026-11-15-capability-R1-fo.md`; Devin review on #1854). That early scoring is what change 1 (§8) stops. Times: the part PR's `merged_at` and the qa commit that wrote the verdict (GitHub API).
| Capability | Newest part (merged, UTC) | First verdict (commit, UTC) | Hours | Verdict |
|---|---|---|---|---|
| R1.12 Screen framework | PF-1 #1711, 13 Nov 19:42 | #1748, 14 Nov 09:57 | 14.3 | Partial |
| R1.11, R1.16 Server framework, automated testing | PF-7 #1713, 13 Nov 22:41 | #1748, 14 Nov 09:57 | 11.3 | Not tested, Partial |
| R1.2 Database | PF-3 #1728, 14 Nov 05:55 | #1748, 14 Nov 09:57 | 4.0 | **Works** |
| R1.9 Background jobs | PF-14 #1757, 14 Nov 19:03 | #1789, 15 Nov 02:48 | 7.8 | Partial (QA-453 Major); **Works 16.0 h after merge** (#1833, 11:02) |
| R1.38, R1.40 Time zones, invite files | FO-3 #1760, 14 Nov 22:52 | #1792, 15 Nov 02:46 | 3.9 | Partial |
| R1.109 Complaints | PF-21 part 1 #1753, 15 Nov 00:54 | #1789, 15 Nov 02:48 | 1.9 | Partial (parts missing) |
| R1.53, R1.55 Retainer | FO-5 part 2 #1777, 15 Nov 03:20 | #1792, 15 Nov 03:35 | 0.25 | Partial |
**Median 4.0 h from the newest part merged to a first verdict (n = 7 merges).** **All parts merged → first verdict, the completed-capability figure:** only R1.2 (4.0 h, Works) and R1.9 (7.8 h, Partial; 16.0 h to Works) clearly had every part merged (n = 2); §6 item 4 (the ready-for-qa signal) makes this sample measurable for every capability. Then the verdict waits for its records PR to merge: verdict commit → records merged 17.5 h (#1748), 4.1 h (#1789, from its 02:48 verdict commit), 1.7 h (#1792), 1.6 h (#1833); **median 2.9 h (n = 4)**.

### 1.3 How often a first verdict is Works
* **Release 1, 14-15 Nov: 1 of 20 first verdicts = 5%** (n = 20 rows scored for the first time, Not built and Not tested left out; PR titles and reports #1748 (3), #1789 (7 new), #1792 (8), #1833 (2)). The compass asks 80% or more (`RULES.md`, "Works on qa's first re-score after merge").
* **Why Partial** (the five Partials in the newest report, `qa/reports/2026-11-15-capability-R1-rescore.md` §4, n = 5): 3 for a part, screen or run not on `main` (R1.12 no UI-kit pack, R1.16 container proof not on merge batches, R1.38 booking page not built); 1 for an open Critical (map 80, QA-383); 1 for an open founder choice (map 99). The front-office round says the same in words: "Setup is not through the product … any route or screen to set them" missing (`2026-11-15-capability-R1-fo.md`).
* So most of the 95% is **scored before it is finished**, not found broken: qa time spent on capabilities that P-606 (2) says not to score yet.
* **Contrast, the M3 C-rows on 9 Nov:** 13 distinct capabilities moved to Works in one day (C3.16, C6.12, C6.13, C6.14, C6.16, C6.17, C6.19, C7.3, C7.7, C7.9, C7.10, C9.2, C11.6; qa PRs #1410 to #1472), from 3-4 qa sessions in parallel on a mature checkpoint (P-432). **10 or more a day has been done here once**, on capabilities that were already whole.

### 1.4 qa wall time and tokens per verdict
* **Wall time, one session timed end to end** (session "qa: score the 7 fully-merged capabilities", 15 Nov 10:29-11:03 UTC, transcript events; n = 1 session, 8 rows): **34.4 min for 8 rows = 4.3 min a row** (API-only rows and re-scores; two walks by API, no screen walk), of which 8.2 min idle waiting for the fresh reader (the reader itself ran 8.7 min). That session started warm on a Mac copy; the first three `isolated.sh` starts failed (sandbox), costing about 3 min.
* **Report windows** (each report's own "Run" line): after-merge #1730, 3 verdicts in about 40 min (07:0x-07:4x IST 14 Nov); walk 1 rehearsal #1617, one journey in about 45 min (08:55-09:40 IST 12 Nov).
* **Tokens per verdict (same session, n = 1, main session only, the reader's not included):** 101 model messages; cache read 17.8 M, cache creation 0.20 M, input 206, output recorded 1,917 (the output field looks partial). **≈ 2.2 M cache-read tokens and ≈ 25 k new context a row.** The session's result events report 0 in every usage field, so the board cannot read tokens today; no qa report records them. A qa session hands over at about 300k context (P-446f).

### 1.5 Share of qa time by kind
Sample: the same timed session (n = 1 session, 102 tool calls, 34.4 min; transcript events classified by call; model writing time added to the call it led to).
| Kind | Min | Share | Calls | What it was |
|---|---|---|---|---|
| Setup | 7.7 | 22% | 39 | bind and fetch, npm ci, prisma, sandbox shims (tsx, pg_ctl, nohup), three failed copy starts |
| Walking (gate A, journeys) | 5.8 | 17% | 13 | the R1.9 jobs walk (written in the session, passed on the third run), tz walk, gate-A-by-API |
| Regression (re-runs, reading CI) | 6.7 | 19% | 23 | local re-run of four packs (2.6 min), reading run, job and log lines from GitHub by curl |
| Writing (report, records, PR) | 5.3 | 16% | 21 | report, evidence, CAPABILITIES, BUGS, commits, PR |
| Fresh reader | 8.6 | 25% | 2 | idle 8.2 min while the reader ruled |
| Other | 0.3 | 1% | 4 | — |
**Reading:** walking, the part only qa can do, is 17%; setup, collecting CI lines and waiting on the reader are 66%. One session is a thin sample: change 5 (§8) measures every session.

### 1.6 What CI already does (so qa need not)
* **Test impact analysis on PRs:** `select-suites.mjs` runs only the suites a change can affect; PR runs median **2.2 min** (n = 99 `ci.yml` PR runs, 15 Nov 10:38-18:4x UTC). The merge queue still runs every suite.
* **Sharding:** 8 parallel parts per merge batch (`ci.yml` header); merge-batch runs median **53 min**, 3 of 14 failed (n = 14 Mergify batch runs in the same window).
* **The protected regression set** (every Works capability's pack on the configured checkpoint) runs on **every merge batch of code** (`ci.yml` jobs `regression-plan`, `regression`; P-320 (b)). The R1 re-score used exactly that batch run as its P-339 evidence (run 43689837365).
* **Flaky quarantine:** `flaky.mjs` + `tools/flaky-ledger.tsv` quarantine a suite that passed only on retry twice in 7 days (B122); the nightly still runs it unretried.
* **Gate B** (`gate-b.mjs`) fails a PR that names a capability with an open Major or Critical.
* **Not on main's code:** `skeleton.yml` (the container proof, PF-7) runs on PR heads only; on merge batches it is skipped (13 of 13 Mergify runs skipped, n = 100 most recent `skeleton.yml` runs). This alone keeps R1.11 Not tested (QA-449).
* `nightly.yml`: 32 runs since 9 Nov, 21 dispatched runs green, 4 failed, 6 cancelled; cloud lanes cannot dispatch it (P-439), and a Mac qa session's dispatch was refused by its permission check on 15 Nov (rescore report §1).

### 1.7 Build side, for scale
* Merged PRs a day, 9-15 Nov: 42, 23, 31, 36, 23, 22, 41 (all PRs; GitHub API, n = 218); qa records PRs among them 21, 6, 3, 7, 4, 1, 6.
* 101 capabilities name **2.4 build rows each on average** (median 2; 238 row mentions in `MVP-CHECKLIST.md` §A, some rows shared), plus a join-and-walk row where multi-part (P-606 (5)).
* 33% of last week's 119 app changes were fixes of qa findings (P-606, desk 06).

---

## 2. The target
* **86 capabilities left** (101 − 15 built in `MVP-CHECKLIST.md`; 89 on the brief's 12) by **29 Nov** (P-609, P-614): 13 working days from 16 Nov → **6.6 a day average (6.8 on the brief's count); 8-10 a day planned**, so a bad day and the re-scores of fixed Partials fit.
* **qa can never prove faster than capabilities finish.** At ~2.4 rows a capability and ~10 new rows a day (15 a day × 67% not fixes), the build finishes about **4 capabilities a day** now. Proving 8-10 a day needs building to finish 8-10 a day too, which is a building and ordering question (P-606 (3), P-613 (1)); this page makes qa ready for it and stops qa time going to unfinished rows.
* **Quality target unchanged:** first verdict Works ≥ 80% (the compass), Works → Partial at most 1 a day, Major or Critical after merge about 0.

## 3. The qa capacity that needs
| Item | Per capability | At 10 a day |
|---|---|---|
| API-only capability (no screen; gate A by API, P-616) | ~15-25 min qa wall (timed session: 4.3 min a row for re-scores and API rows, n = 8) | — |
| Screen capability (gate A by screens to the next step, 3 widths twice, axe, data, 15-min break pass, fresh reader) | ~60-90 min qa wall (report windows §1.4; estimate, to be measured by change 5) | — |
| Mix of the remaining 86 (rows with a screen in their Done when: about two thirds) | ~55 min average | **~9 qa hours a day** |
| Lanes (one per module group, P-613 (4): platform, front office and booking, client money and retainer, case side) | — | **4 lanes × ~2.5 h of active scoring**, each scoring in batches as capabilities finish; a 5th lane only on a day with more than 10 finished |
| Fresh Opus reader (P-303, P-432) | one reader per batch of rows, high effort | 4-6 reader runs a day |
| Tokens | ~2.2 M cache-read and ~25 k new context a row (§1.4, n = 1 session, reader not included) | **~25-40 M cache-read a day** for 10 rows plus readers; no cap (P-555), every token justified (P-556); measured from change 5 on |
| GitHub machine time | none new: evidence comes from the merge batch that already runs the packs (§1.6) | — |

## 4. Frameworks compared (when to use, when not, what it changes here)
Links are the official sources; this cloud session's network refuses these hosts, so none was re-fetched today (each is a standard, long-published reference; verify before quoting a number from it).
| Framework | Use when | Not when | What it changes here |
|---|---|---|---|
| **Risk-based testing** (ISTQB CTFL 4.0 §5.2: risk = likelihood × impact sets depth; https://www.istqb.org/certifications/certified-tester-foundation-level) | Choosing how deep each capability is tested | As a reason to skip a gate | Tier by risk: money, permissions, firm walls, audit, schema, a new screen get the full walk and break pass; a framework or table-only row with no screen gets gate A by API (P-616) and no width matrix. Depth changes; the Works gate does not |
| **Test pyramid** (Cohn; Fowler, "The Practical Test Pyramid", https://martinfowler.com/articles/practical-test-pyramid.html) | Deciding where a check lives: many fast unit and API checks, few end-to-end | Using it to drop the human-like walk | Builders' Done-when tests (pass and fail per rule) are the base; qa adds only what the base cannot: the walk across the screen boundary and the data underneath |
| **Testing trophy** (Dodds, https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) | A web app whose risk is in integration: most value from integration tests on real PostgreSQL | Pure logic (money arithmetic): unit tests win | The packs on the checkpoint are the trophy's middle; qa's own checks in `tests/qa/` should be integration checks that join two capabilities, not repeats of one pack |
| **Shift-left, in-sprint testing** (DORA "Test automation", https://dora.dev/capabilities/test-automation/) | Moving checks to before merge: testers write acceptance checks with the builder | Letting the builder judge their own Works (independence, P-290, P-303) | qa writes the gate-A walk script **when the row is shaped**, not after merge; the builder must make it pass; qa's verdict stays independent |
| **Test impact analysis, selective re-runs** (Fowler, https://martinfowler.com/articles/rise-test-impact-analysis.html; Google TAP, https://research.google/pubs/taming-google-scale-continuous-testing/; Meta, https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/) | PR checks and qa's after-merge smoke | The merge queue and the nightly (they must run everything) | Already on PRs (`select-suites.mjs`). qa's after-merge "smoke of every Works capability" duplicates the protected set on every batch: **stop it**; re-score only rows a merge touched |
| **Contract testing** (Fowler ContractTest, https://martinfowler.com/bliki/ContractTest.html; Pact, https://docs.pact.io/) | Parts built in parallel on ports with fakes (P-576, P-606 (8)) | One-team, one-repo calls with no fake | Each port's fake and real adapter pass one shared contract test in CI; qa stops finding "the running app still uses the fake" by hand (QA-453, QA-473 were that) |
| **Exploratory charters with time boxes** (Bach, Session-Based Test Management, 2000, https://www.satisfice.com/download/session-based-test-management) | Finding what scripts miss; once per capability batch and per milestone | Per part merge (too early, too costly) | Keep the 15-min break pass per screen capability and the 60-min `explore` charter per module group per milestone; never an open-ended explore while capabilities wait |
| **DORA continuous testing and CI** (https://dora.dev/capabilities/test-automation/, https://dora.dev/capabilities/continuous-integration/) | Every merge proves itself; fast feedback | — | The P-339 run id comes from the merge batch automatically; `skeleton.yml` runs on merge batches; a red protected pack demotes in CI, not by a qa session |
| **Google's flaky-test practice** (Micco, "Flaky Tests at Google and How We Mitigate Them", 2016, https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html) | A check passes and fails on the same code | Hiding a real failure by re-running it | Already in `flaky.mjs`. qa's "twice to catch flakiness" stays for its own new checks only; a quarantined suite cannot carry a Works verdict until its fix lands |
| **Playwright sharding and parallel workers** (https://playwright.dev/docs/test-sharding, https://playwright.dev/docs/test-parallel) | Long browser suites; the 3 widths × 2 runs matrix | Checks that share one database row (they must be isolated first) | Run qa's widths as Playwright projects in parallel workers on one isolated copy (3 widths at once, not one after another); CI already shards suites 8 ways |

## 5. Tiered plan: what qa does, when, how much
| When | qa does | How much | qa does not |
|---|---|---|---|
| **A row is shaped** (before build) | Writes or reviews the capability's gate-A walk script stub (journeys from `journey-test` §1) beside the Done when; names the next capability's first step | 10-15 min a capability | Score anything |
| **Per part merge** | Nothing by hand. CI runs the selected suites, the protected set and gate B | 0 qa min | No smoke of every Works capability; no "parts missing" report (the checklist already shows it) |
| **Per capability, all parts merged** (the signal, P-606 (2)) | Batch: reads the merge-batch run id (P-339), re-runs the pack once on its own copy (P-290), walks gate A by screens to the next step (by API where no screen, P-616), widths and axe in parallel workers, data underneath, a 15-min break pass for risky tiers, then one fresh Opus reader rules the batch (P-303, P-432) | API-only ~20 min; screen ~60-90 min; a batch of 2-4 per lane | Score a row with a part, a screen or the join-and-walk row missing |
| **Per fix of a Partial** | Re-score only the failing line and gate A, within 4 h of the fix (P-613 (4)) | ~15-30 min | Re-walk the whole capability |
| **Per milestone or module group done** | `/qa milestone`: every role, coverage (c8, floor only rises), every suite, a 60-min charter per group, the graph | Half a day per group | — |
| **Nightly** | Reads the nightly full journey (P-322); a red Works row goes to `REGRESSION-HELD.md` | 10 min | Re-run what the nightly ran |

**Expected effect on the timed session's 34 min (§1.5):** setup −5 min (copy starts first time), regression −4 min (evidence line printed, change 4), reader idle −8 min (reader in parallel with writing): about 17 min for the same 8 rows, walking then about a third of qa time.

**qa stops doing:** (1) the after-merge smoke of every Works capability (CI's protected set does it on every batch); (2) scoring before the signal, including "parts missing" verdict rounds; (3) hand dispatch of runs for evidence (the merge batch is the run; `skeleton.yml` moves into it); (4) one-at-a-time width runs; (5) re-proving builders' unit-level rules qa did not find a gap in (the pack's pass and fail per rule is the builder's proof; qa re-runs the pack once, P-290).

## 6. What to automate in CI instead
1. **Works evidence line:** a script reads the merge-batch run that contains main's head tree and prints, per capability, the pack, job id and counts, so qa pastes the P-339 line instead of collecting it (the R1 re-score did this by hand, §1 of its report).
2. **`skeleton.yml` on merge batches of code** (QA-449's fix), so R1.11 and R1.16 are judged on main's code with no dispatch.
3. **Port contract tests** (P-606 (8)): one shared test per port run against fake and real adapters; a module wired to a fake where the real adapter is on `main` fails CI.
4. **"Ready for qa" signal:** when the last named part and the join-and-walk row of a checklist row merge, CI or `lead-watch` writes the capability into one queue file with the merge time; qa pulls from it (this also gives §1.2 automatically).
5. **Gate-A walk scripts in the protected set** once Works, so a later merge that breaks the walk demotes in CI.
6. **A qa copy that starts first time:** the setup the timed session lost to sandbox shims (tsx, pg_ctl, nohup) and three failed starts goes into `isolated.sh` or the environment's setup, so setup falls from 22% toward 5%; the reader runs in the background while qa writes, not after it (the 8.2 min idle).
7. **qa time and tokens per verdict** written by the qa session to its report header (start, end, rows, turns), so §3 is measured, not estimated.

## 7. Risks to quality and how each is held (no gate lowered)
| Risk | Held by |
|---|---|
| Dropping the after-merge smoke misses a regression | The protected set runs every Works pack on every merge batch and red blocks the batch (§1.6); the nightly full journey stays (P-322); a red Works row is held in `REGRESSION-HELD.md` as now |
| Lighter depth for low-risk rows lets a defect through | Only depth varies; every Works still needs P-339's run, the independent re-run (P-290), gate A to the next step (P-348 (3)) and a fresh Opus reader (P-303, P-432); risk tier is set by the row's kind (money, permissions, schema, new screen get the full pass, as the breaker rule P-278 already does) |
| qa writing the walk before build makes it the builder's own test | The builder must pass it; qa's verdict still re-runs it on its own copy and the fresh reader ran nothing (P-290, P-303); qa may add journeys after merge |
| Batching rows per reader weakens the reader's attention | Reader batch at most 4 rows, high effort (P-608); one verdict per row with its own evidence lines |
| Evidence read from the merge batch is not "independent" | P-290's independent re-run stays qa's own run on its own copy; the batch is only the P-339 GitHub run |
| Parallel workers share data and flake | Each width runs on its own seeded firm or copy; a check that flakes goes to the flaky ledger and cannot carry Works until fixed |
| qa idles waiting for finished capabilities | The idle time goes to shaping-time walk scripts (§5 first row) and fix re-scores, never to scoring unfinished rows |

## 8. The first five changes, in order
1. **Stop scoring before the signal; one ready-for-qa queue.** qa takes a capability only when its checklist row says every part and its join-and-walk row merged; the Lead's brief names rows from that list only. *Done when:* for 24 h of qa PRs after the change, no verdict row reads "parts missing" or Partial for a missing part, and each scored row's last-part merge time is in the report (checked by reading the PRs' reports).
2. **Drop the per-merge smoke of every Works capability; rely on the protected set.** A skill change for the Lead to make (this page changes no skill). *Done when:* the qa skill's `after-merge` row no longer asks for the smoke, and `ci.yml`'s regression job is shown to include every Works row's pack (a script lists Works rows with no pack in the protected set and prints none).
3. **`skeleton.yml` runs on merge batches of code** (QA-449). *Done when:* the next merge batch of code shows a `skeleton.yml` run with conclusion success on its head, and R1.11 is scored from it with no hand dispatch.
4. **Works evidence line from the merge batch.** *Done when:* one command prints, for a named capability and main's head, the batch run id, job id and pack counts, and matches by hand the line in `2026-11-15-capability-R1-rescore.md` §1 for R1.2 and R1.9.
5. **Measure qa per verdict.** Each qa report header carries start and end times (from the clock, P-302), rows scored, turns and, where the session reports them, tokens; the board shows merge→verdict and first-verdict Works share. *Done when:* the next three qa reports carry the header and a script prints median merge→verdict, first-verdict Works share and minutes per verdict from them.

## Questions for the tech lead (also in the PR)
1. P-290's "independent re-run": does qa's own local re-run stay required when the merge-batch run on main's tree and the nightly are both green, or may a second GitHub run on a fresh database count? (This page keeps the local re-run.)
2. Risk tiers: may "gate A by API" (P-616) be the rule for every row whose Done when has no screen, so those rows skip the width and axe matrix?
3. Network: the framework links could not be re-fetched from this cloud session; allow the hosts for a later check, or accept the citations as given?

**Answers (tech lead, Lead 61, 00:3x IST 16 Nov, PR #1854 comment 6899582079):**
1. **Independent re-run (P-290):** a second GitHub run on a fresh database, started and read by qa itself, may count as qa's independent re-run after a trial. For the next 10 capability verdicts qa runs both (local and GitHub) and records whether they agree. If 10 of 10 agree, the GitHub run replaces the local one; any disagreement keeps the local run and logs the cause. The batch run and the nightly alone never count, because they are not qa's.
2. **Risk tiers:** yes. A row whose Done when has no screen is walked by API (P-616) and skips the width and axe matrix; any row with a screen keeps the full matrix.
3. **Citations:** accepted as given, marked "not re-fetched from the cloud"; the Lead checks the links from the Mac before the plan's first change lands.
