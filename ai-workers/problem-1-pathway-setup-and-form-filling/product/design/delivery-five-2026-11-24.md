# Five delivery problems: what we do now (24 Nov 2026)

Asked by the founder 24 Nov, about 09:30 IST, in the ended Lead 17's chat: "Can we do something about these 5 things so that it gets implemented from now and we can keep using it without delaying the product work ... send it to the current lead and he will take care of it and he can ask me any question."
Written by Lead 17 (ended). The current Lead owns it: check each line against main, fold it into the recovery plan (A348), challenge anything wrong. Nothing here is built. A348's "lessons 1 to 5" are already with Lead O 2: merge, do not duplicate.

## Rules for this list
1. Product first. Lead O 2's tooling lane does A to D, one PR at a time; no product builder, no migration slot.
2. Every new check starts report-only for 24 h or 10 PR runs (P-717 (b)), then blocks.
3. No new vendor, no new standing cost, no relaxed gate. Stryker stays inside its B203 gate.
4. Stop rule: an item that makes main's queue slower, or costs its lane more than its size below, stops and goes to the founder.

## Evidence (read 24 Nov, 08:30 to 09:35 IST)
* Merge-queue CI runs finished 00:59 to 08:30 IST: 42; 14 failed (33%). One night, one sample; split re-runs of the same PRs are counted.
* The 14 failed runs came from about 7 causes (first failing suite per run read from its log). Causes are the failing check's message, not a traced root cause.

| Failing check | Runs | Looks like (hypothesis) |
|---|---|---|
| check_csdl3_milestones: "kind is added after the earlier kinds" | 5 | Test pins a list's order; two PRs each add a kind |
| check_csd5_flags: 401 days against 400 | 4 (2 alone; 2 inferred from the same part, 18, red beside another failure) | Clock change; fixed by #3355 |
| check_pf30s_find_box: 320 px top bar | 2 (1 also in the row above) | Real overlap of two PRs on one bar |
| "strict mode": two tabpanels / two matches | 2 (about 20 parts each) | Shared layout changed under selectors |
| check_pf5s1_signup: keyboard | 1 (also in csd5 row) | Race in the test; #3361 |
| check_aud1m_case_writes: exact count of writes | 1 | Test pins a whole-repo count |
| check_pf4s_system_signin | 1 | Race; #3366 |

  Some runs had two causes, so the rows add to 16. The csdl3 check failed five runs, all started between 01:32 and 02:05 IST.
* Text search of main's studio/tests: 798 lines use `waitForTimeout` (a fixed sleep) and 28 files use a fixed "N days" interval. A count of patterns, not of faults.
* Leads handed over at 04:26, 05:45, 07:20, 08:31 and 09:23 IST: about one per 75 minutes (git log of STATE.md).
* No `deploy.yml` on main (25 workflows listed). The ECS circuit breaker with rollback is coded (cdk/lib/service.ts:229), not proven. Backups with a tested restore (R1.14): Works; nightly drill exists.
* 53 of 101 Works (STATE, 09:30 IST).

## The actions

### 1. Too much half-finished
Have: caps 8 building and 12 built-not-proven (P-745, waves.py), the PROVE stream (A348).
* **A1 (now, Lead, no code).** Each check starts with "which row is one step from Works?" and that step is done first. A lane finishing takes the next step of a Partial row before any Not built row, unless the Partial list has no unblocked step. Does not stop RQ-01 or a D-group lane the founder ordered.
  Done when: the check prints the nearest five rows with their one missing step. Number: Works per day, Partial count falling.

### 2. Integration
Have: merge queue, scopes, migration capacity 1, full run after a failed batch (P-731), bisecting by Mergify.
* **B1 (first; about half a day).** Same-cause alarm: the second failed batch with the same suite and same FAIL line in 12 h prints one ACT line naming both runs, the PRs common to both, and main's last result for that suite. Uses the existing failure logs; a line in `known-failures.tsv`. It would have fired on run 2 of the 5.
  Done when: a fixture of last night's five csdl3 runs fires once at run 2; two different causes do not fire.
* **B2 (about 1 day, small PRs).** A lint for brittle test patterns, new lines only: exact whole-repo counts, "is last in the list" order checks, `waitForTimeout`, "N days" arithmetic where hours are meant. Old lines stay until touched. The message says what to write instead (OpenAI's practice).
  Done when: fails on a seeded new line, passes on main untouched.
* **B3 (Lead, no code).** Before labelling, two queued PRs editing the same shared list or top bar go one after the other. Batch size stays 2: Mergify gives no failure-rate rule, so change it only on our measurement.
  Number: batch failure rate, 33% to under 10% (the standing threshold).

### 3. Verification that can be fooled
Have: reviewer, breaker, independent qa, packs, gate B, B203's Stryker pilot (status to be confirmed).
* **C1 (about 1 day, report-only).** "Red on the old code": for a PR with new checks, run only those new or changed suites on the base commit's app code. At least one new check must fail there; if all pass, the report says "this test would pass without the change". Refactors and test-only PRs say why in one line.
  Method: FrontierCode, as described at ai.engineer; Anthropic's playbook says the same for bug fixes: failing test first, not edited by the fix.
  Cost: one extra suite run, measured on 10 PRs before it can block.
* **C2 (half a day, report-only).** A PR that edits or removes an existing check lists those lines for the reviewer ("checks weakened or removed"), with a reason in the PR.
* **C3 (qa, no code).** For each money, firm-wall and document row, qa keeps two or three scenarios builders do not see, in the founder's private home, run at the Works walk. Not in this public repository.
* **C4.** Run P-702, due 21 Nov; no result found in STATE history, design, reports or a title search of transcripts. One independent Opus reader, keep / fix / drop per adopted change.
  Number: escaped Majors found after Works, per week.

### 4. Release and operations
Have: container image, CDK for staging and production, synth tests, restore drill, log and alarm code, smoke skeleton.
* **D1 (inside the 101: part of R1.1).** PF-8c: `deploy.yml` with GitHub OpenID Connect to AWS (no stored keys; the trust names this repository, and main), image by digest, migration task, smoke test, production behind a person's approval, rollback in one step. Build as a normal product row. It touches pipeline paths: Lead's read.
* **D2 (after D1; needs the founder's yes and a cap for each run).** A weekly rehearsal in staging: deploy, break it on purpose, see it roll back, restore. ECS rolls back only to the last COMPLETED deployment, so the first deployment has nothing to return to. Migrations do not roll back: use add first, remove later.
  Numbers: deploys, change fail rate, time to recover. Today they cannot be measured.

### 5. Coordination
Have: STATE, standbys, scripted watch, lane briefs.
* **E1 (Lead O 2, 2 h, read-only).** Where the last five Leads' context went (start read, checks, messages, browser pages), measured from transcripts with numbers; then one proposal. No change before that.
* **E2 (Lead, no code).** One owner and one end for each owed item; the hand-over list is closed items removed, open items with an owner.
  Number: hours per Lead (now about 1.25), target 4 or more without raising the 200k line.

## Order
B1 → C2 → C1 → B2. A1, B3, C3, E2 start with the Lead now. C4 and E1 are read-only readers. D1 is a product row in its place. Sizes are estimates, not measured.
Review on 27 Nov at about 09:30 IST: the four numbers against today's; keep, fix or drop each item.

## Tools: what we use, what we do not add
* Claude Code is the worker, not the DevOps system. The playbook keeps approvals, branch protection, release authorisation and alert detection outside the model.
* Keep: Git and GitHub Actions, Mergify, Docker, AWS CDK, ECS Fargate, RDS, CloudWatch, Playwright, c8. Add only what is already decided: Stryker pilot (B203), OpenID Connect deploy (PF-8c).
* Not now: Kubernetes, Argo, Terraform, Bazel, SonarQube, Datadog. No measured problem of ours needs them, and each adds upkeep.
* Frameworks: DORA's five metrics; Minimum CD; Kanban WIP limits with theory of constraints; SRE release engineering; expand-then-contract migrations.

## Where our practice differs from the sources (for the Lead to judge)
* DORA: feedback under 10 minutes, three or fewer active branches, branches of hours. Ours: queue run 31 min median for passes, 31 open PRs.
* Minimum CD: all feature work stops when main is red. Ours does not; not proposed, as it would stop product lanes for tests that fail by the clock.
* Anthropic's playbook: a human code owner approves each PR. Ours is agent review plus the Lead's read. That is the founder's decision; see `library/engineering-system.md` C1 to C7.

## Sources read in full by readers on 24 Nov
Anthropic Academy AI-native SDLC playbook (feedback loop, evals in CI, PR review, hooks, CI/CD, metrics) and Claude Code best practices; OpenAI harness engineering; Stripe Minions parts 1 and 2; Willison on StrongDM; DORA (WIP, small batches, trunk, test and deploy automation, metrics); minimumcd.org; Google SRE release engineering; Mergify batches; Stryker incremental; GitHub OIDC for AWS; ECS circuit breaker. The two ai.engineer talks: write-ups only, transcripts did not load. Most case-study numbers are self-reported. Books and full courses were not read.

## Questions for the founder (the Lead asks when the item is reached)
1. D2: may staging run one weekly rehearsal, and at what US$ cap? (A349's US$2 covers one run only.)
2. C1 and C2: after the report-only trial, may they block a PR?

## Lead 20's check (24 Nov)
* The founder's message is in Lead 17's transcript, typed at 09:27 IST. He asked for the list and to implement it; he has not read it item by item.
* Confirmed on main: no `deploy.yml` (`deploy-synth.yml` is another workflow), 25 workflows, 798 `waitForTimeout` lines, the circuit breaker at service.ts:229. Not re-measured by me: the 14 of 42 runs, the seven causes, the 28 files, the sizes, the sources.
* Already on main: csdl3's line is add-only, csd5 uses hours. So B1 prevents the next repeat; it fixes nothing open. `check_bk3_links_browser` hung in batch #3369 after the list's sample (cause unknown).
* In force now, Lead: A1, B3, E2. qa: C3 (private home only). Lead O 2, merged with A348's lessons: B1, C2, C1, B2 one at a time, report-only, and E1 read-only. C4: first confirm no result exists, then run. D1 in its place.
* Not approved, not started: D2; C1 or C2 blocking a PR; B2 blocking a PR (its "Done when" says "fails": report-only until the founder is asked too).
