# OS backlog: every pending pipeline, operating-system, tooling, hook and enforcement item, in one order (P-828)

Owner: **OS-PM**, the dedicated operating-system owner (founder rule P-828, 25 Nov; records PR #3641). Started 25 Nov 10:43 IST from `origin/main` 63f5cc913. The Lead folds rule changes into RULES.md and DECISIONS.md; OS-PM never edits them.

**Sources read:** `product/RULES.md` as of P-826 (156 rule rows; the 133 whose "Enforced by" says prose, owed or part are mapped in the appendix); `design/full-power-plan-2026-11-17.md` (Open and Doing items about pipeline, tools and enforcement; what is left out and why: "Left out" below); `design/why-targets-missed-2026-11-24.md` (top 5 actions); the Lead's tool items (a) to (f) from the OS-PM brief; the tools and workflows on main (`product/tools/`, `.github/workflows/`).

**Duplicate check:** Lead 4, 25 Nov ~10:3x IST: no open PR or file named os-backlog.md; `git ls-tree origin/main` finds none at 10:43 IST. Related lanes whose files OS-PM does not touch: **OS-1** (`.mergify.yml`, pipeline-first P-827), **OS-3** (`queue-gate.sh`: P-822 PR A, P-823 PR B, then ENF-778a), **#3623** (`cloud-setup.sh || exit 1`).

**Priority order (brief):** 1. what removes Lead waits and red batches; 2. what turns Lead-loop prose rules into lead-watch ACT lines; 3. PR rules into gate checks; 4. retiring stale rules. Inside a tier, the measured gain (why-targets) decides.

**How each item is worked:** one item per PR, under 800 changed lines, tools, workflows and records only (never product code); a fresh Opus reviewer on the exact head; a breaker pass for anything that labels or blocks; the label only after Approve. A new blocking check starts as a warning (P-717 (b)) unless the Lead says otherwise. Pipeline PRs use the pipeline queue (P-827). Each PR updates this list's Status. Never cancel CI, never force-push.

**Kinds:** hook (Claude Code hook), CI (a workflow step or check), ACT (a lead-watch ACT line from a script), retire (the rule goes, with the Lead's yes). **Status words:** Open · Doing (PR or lane named) · Done (merged, its check green on main) · Retired (Lead's yes named) · Blocked (whom it waits on).

**Done for the whole list:** every item is Done with its check green in CI (`check-docs.sh` and the item's own test exit 0), or Retired with the Lead's yes.

## Tier 1: remove Lead waits and red batches

Measured (why-targets, 72 h to 24 Nov 22:23 IST): a third of batches fail (121 of 368), median 88 min to come back; 209 label holds waited for a Lead read; #3035 waited 55 h for a label.

| ID | What | Rule | Kind | Owner | Status | Done when |
|---|---|---|---|---|---|---|
| OS-01 | `pr-suites` green on the head before the label and the queue (why-targets action 3: 18 of 33 real batch defects showed red on the PR first; about 1,000-1,800 PR-min a day) | P-822 | CI: queue-gate.sh | OS-3 (PR A) | Doing (OS-3) | queue-gate refuses `review: approved` on a head whose `pr-suites` is red or missing; its case is in `check-queue-gate.sh`, which exits 0 in CI |
| OS-02 | Auto-label additive-migration, money and public-route PRs after the fresh reviewer's Approve on the exact head and green ci; the Lead reads afterwards (money within the hour, others 1 in 3) | P-823 (relaxes P-423, P-731) | CI: queue-gate.sh | OS-3 (PR B) | Open (after OS-01) | a fixture PR with a migration, `Reviewer: Approve <head>` and green ci is labelled by the bot in `check-queue-gate.sh`; lead-watch prints an ACT for an auto-labelled money PR not Lead-read after 60 min |
| OS-03 | The pipeline queue goes before product batches | P-827 | CI: .mergify.yml | OS-1 | Doing (OS-1) | `check-mergify-scopes.sh` asserts the pipeline queue is first and exits 0 in CI |
| OS-04 | A cloud setup error stops the session start instead of passing silently | AGENTS rule 10, P-557 | script | #3623 lane | Doing (#3623) | #3623 merged; its test shows a failing step exits 1 |
| OS-05 | **Auto-requeue** (Lead item b; why-targets action 4). Measured on main: queue-gate.sh (CI-PRE, B206 part 2) already starts the full run when a failed batch dequeues a PR, and already puts the label back once that run is green on the head **and** a "Batch failures covered: <run>: <parts>" line by someone with write access names every failed part. The remaining Lead wait is writing that line. The gap: the bot writes the covered line itself when the green full run on the head passed every part the batch failed, so the PR requeues once with no Lead turn | P-731 (needs a ruling: today a person names the parts), P-402 (requeue) | CI: queue-gate.sh | OS-3 (its file) or OS-PM after OS-3 hands it over | Blocked (Lead 5 listed it first; the P-731 ruling is still owed: does a green full run on the head that passed every failed part count as "named"? Then OS-3 sequencing, since it changes queue-gate.sh) | `check-queue-gate.sh` cases: green full run on the head with every failed part passing → covered line and label by the bot; one part not run, red run, or another head → no label and one reason line; a breaker pass recorded on its PR |
| OS-06 | **Dispatch the full run on ask** (Lead item d): an open PR's "Question for the tech lead" that asks for a full run gets `/run full` posted once by the Lead copy's lead-watch (new step 3a, `tools/full-run-ask.py`); comment-run.yml (main's copy) then checks the head, starts `ci.yml` and replies, or replies why not | P-439, P-731, P-293b | ACT + script (lead-watch 3a) | OS-PM | Doing (#3671: approved after two rounds and labelled by Lead 5; dequeued for a conflict with #3676, merged main in 9007dab0b, re-reviewed, waits on the Lead's label again) | `check-full-run-ask.sh` (stand-in gh, 21 cases) exits 0: an ask on an open PR → one post; the same ask again, a closed PR, a code block or a comment that only mentions the tech lead → none; a failed post → ACT and retried next check; `check-lead-watch-speed.sh` step-3 cases exit 0 |
| OS-07 | **Walks after a qa merge** (Lead item c). Measured on main: walks.yml already walks on every push to main that is a PR's merge commit (ENF-733), but `walk-plan.mjs:89` skips a PR that changes nothing under studio/, contracts/, p2/ or p5/, and test T12 (`walk-plan.mjs:241`) asserts a records-only "qa: R1.3 …" PR walks nothing. The change: the push plan walks the journeys a merged qa PR names | P-733 (automatic proof on merge) | CI: walk-plan.mjs (walks.yml's plan job) | OS-PM | Open | `walk-plan.mjs` tests: a merged qa PR naming R1 items → those journeys walk (T12 changed, its reason in the PR); a records-only non-qa PR → none; walks.yml's plan test exits 0 |
| OS-08 | Quarantine the suites that pass only on retry (why-targets action 3's companion; full-power #203 card 8c): after two retry-only passes in 24 h a suite is listed and reported, not blocking, until its fix PR | P-822 (with P-371) | CI: retry-watch.py → list read by run-suites | OS-PM after the ruling | Blocked (founder ruling, full-power #203 card 8c; the Lead asks) | the quarantine file is written by retry-watch's PR only, run-suites reports a listed suite as a warning, `check-retry-watch.sh` exits 0 with the list cases |
| OS-09 | ENF-778a | IDX-23 | CI: queue-gate.sh | OS-3 | Open (after OS-02) | as written in OS-3's brief; `check-queue-gate.sh` exits 0 |
| OS-10 | One migration slot per schema area (the migration wait; held 55 h for a label) | P-600, P-438b | CI | Lead | **Done** (#3035 merged; main 63f5cc913, 25 Nov) | merged; its check green on main |
| OS-11 | The Lead's tools are main's (the Lead branch was 1,944 behind main; hooks ran the branch's scripts; full-power #88) | P-82, P-557 | script | Lead | Blocked (#3506: approved, draft, conflicting) | #3506 merged; lead-watch prints the sha of the tools it ran and it equals origin/main |
| OS-13 | Graduate the report-only checks (8 workflows, why-targets 24 Nov; 28 workflows on main at 63f5cc913): `pr-suites`, `walks`, skeleton parts, `red-on-old`, `review-rounds` (+P-277's round cap, full-power #166 A5) | P-717 (b), P-277 | CI | OS-PM prepares, Lead decides each | Open | for each: a PR with its false-block count over its warning window makes it blocking, or the Lead retires it with a reason; that check's own test exits 0 |
| OS-49 | A merge wakes the next lane by automation (why-targets action 2; full-power #205 hourly wake of stalled lanes): `merge-wake.py` is report-only today (lead-watch 4b ACT with the words to type) | P-339b, P-646 | script: merge-wake.py → a send to the waiting session | OS-PM (sending: the Lead copy) | Doing (#3674: round-2 Approve on eebf5ce90, labelled and queued) | `check-merge-wake.sh` case: a PR whose waits are all on main → one message sent to its lane (stand-in sender) and no repeat next check; exits 0 |
| OS-50 | Mergify priority for near-Proven product PRs (full-power #129) | P-733, P-820 | CI: .mergify.yml | OS-1 (its file) | Open (after OS-03) | `check-mergify-scopes.sh` asserts the priority rule; exits 0 |
| OS-51 | Fix the top flaky suites and the nightly's reds (full-power #146); feeds OS-08 | P-822, P-371 | product tests | the area's builder lane (product code; OS-PM only lists it) | Open | retry-watch.py names no suite with two retry-only passes in 24 h |
| OS-52 | Runs that end `startup_failure` are an ACT (full-power #158) | P-339b | ACT | OS-PM | **Done** (#3676 merged, 25 Nov) | fixture runs list with a `startup_failure` → one ACT naming the workflow; test exits 0 |
| OS-71 | A staging deploy runs by itself after a secret changes, so new account values reach the app with no Lead step (Lead 5, 25 Nov 11:19 IST; founder ask A385). Placed in Tier 1 because each secret change today waits on a Lead turn; the gain is not measured yet (count Lead deploy steps per day first) | P-821, P-824 | CI (with PF-8c) | OS-PM with the PF-8c lane | Blocked (OS-PM 2, 25 Nov 12:3x IST: main has no deploy workflow; PF-8c is not built and the staging deploy runs in the founder's AWS account, so there is no secret-change trigger to add; waits on the PF-8c lane) | a workflow test shows a secret change (or its dispatch event) starts one staging deploy and reports its result; no deploy without a change; test exits 0 |

## Tier 2: Lead-loop prose rules into lead-watch ACT lines

Measured: 32 Lead sessions in 35 h; start read 170-205k tokens; each hand-over drops items.

| ID | What | Rule | Kind | Owner | Status | Done when |
|---|---|---|---|---|---|---|
| OS-14 | **Only fresh branches** (Lead item a): lead-watch prints only branches pushed in the last 7 days; today about 90 stale "not on main" lines hide the real ones. `branch-sweep.sh` already cuts at 7 days by committer date and ACTs only for 24 h, so the first step measures which section prints the 90 (suspects: committer date of a merge-from-main, `gh pr list --limit 500` missing merged PRs older than ~5 days, `lane-cleanup.py`) | P-339b, G-4 (5) | ACT | OS-PM | Blocked on OS-11 (measured 25 Nov 12:0x IST: 90 branches pushed in 7 days have commits not on main and no open PR, 25 in 24 h. Main's branch-sweep.sh already prints one summary line plus ACTs for 24 h only, ENF-761 part 5; the Lead branch `lead/2026-11-07-lead31` runs the old copy, one ACT per branch. Fixed when the Lead runs main's tools) | the measured cause is named in the PR; a fixture with a branch last pushed 8 days ago and one whose merged PR is outside the newest 500 prints no ACT or "not on main" line; `check-branch-sweep.sh` (and `check-g4-rules.sh`) exit 0 |
| OS-15 | **Records PR in one script** (Lead item e): one command commits the Lead's records, refreshes the RULES "as of" line and lag, runs check-docs, and opens or updates the records PR | P-336, P-440, P-526c, P-402 | script | OS-PM (the Lead runs it) | Doing (#3693, branch `claude/trusting-hopper-7jun9g`: two review rounds used; round-2 fixes at 4414b7970 wait on the Lead under P-277) | `tools/records-pr.sh --dry-run` on a fixture copy prints the files, the new as-of row and the PR it would open; `check-records-pr.sh` (stand-in gh) exits 0; check-docs exits 0 after it |
| OS-16 | **One-page Lead start read under 40k tokens** (Lead item f; why-targets action 5): `product/LEAD-START.md` names what a fresh Lead reads and in what order, nothing from history (also closes full-power #140, the 70k check). P-615 says ≤ 70k today: the check warns at 40k and fails at 70k until a Lead row amends P-615 to 40k | P-615, P-440b, P-446 | CI: check-docs.sh | OS-PM (P-615 amendment: Lead) | Doing (#3696, branch `claude/trusting-hopper-7jun9g-os16`: Reviewer: Approve bc7c0eb55, ready; waits on the Lead's read and label, P-423) | check-docs prints the start-read total (bytes ÷ 4) of the files LEAD-START.md lists, warns over 40k, fails over 70k (40k once P-615 is amended); `check-start-read.sh` exits 0; the lead skill points to it (Lead) |
| OS-17 | Records PRs open over 24 h are an ACT (full-power #145) | P-526c | ACT | OS-PM | Doing (#3699, branch `claude/trusting-hopper-7jun9g-os17`: Reviewer: Approve 39964999f, ready; waits on the Lead's read and label, P-423) | lead-watch prints one ACT per records PR older than 24 h; test case in `check-lead-watch-*.sh` exits 0 |
| OS-18 | A 🔴 "Waiting on the founder" line atop STATE is an ACT each check ("re-send the push") | P-530 | ACT | OS-PM | Doing (#3703, branch `claude/trusting-hopper-7jun9g-os18`: Reviewer: Approve 28a4fa8b3 after two rounds, ready; waits on the Lead's read and label, P-423) | lead-watch prints the ACT while the line exists and none when it is gone; test exits 0 |
| OS-18b | founder-wait.py follow-ups from #3703's round 2: take a line's wait start from the time it carries (P-530 (1)), not the first sighting (an empty or corrupt memory gives a long wait 30 more quiet minutes); report a corrupt memory; keep a line's wait when the Lead appends an item (key on its start time); clamp a clock that goes back; match 🔴 with U+FE0F | P-530 | ACT | OS-PM | Open (after #3703 merges) | check-founder-wait.sh cases: a line saying "(06:00 IST 25 Nov" first seen at 08:00 IST gives the re-send ACT at once; an appended item keeps the wait; a corrupt memory prints one ACT; exits 0 |
| OS-19 | A CI run cancelled by a person (not by concurrency or Mergify) is an ACT naming the run | P-371 | ACT | OS-PM | Open | fixture runs: a `cancelled` run with a human actor → one ACT; a concurrency-cancelled one → none; test exits 0 |
| OS-20 | An open PR that has merged main three times is an ACT "lands next" | P-270 | ACT | OS-PM | Open | fixture PR with three "Merge branch 'main'" commits → one ACT; test exits 0 |
| OS-21 | Two open PRs that already both change a hot file (prisma/schema.prisma, api/src/case-prepare.ts) are an ACT. `touch-overlap.py` (via `lane-preflight.sh --hook`, test check-touch-overlap.sh) already refuses a lane brief whose "Touches:" overlaps an open PR at lane start; this covers what lands outside a brief | P-438b, P-526b | ACT | OS-PM | Open | fixture with two open PRs on schema.prisma → one ACT naming both; test exits 0 |
| OS-22 | lead-watch and the board judge red from `ci` only, and any failed gh call is an ACT (full-power #169) | P-339b | ACT | OS-PM | Open | stand-in gh failing once → one ACT; a red non-`ci` check → not counted red; test exits 0 |
| OS-23 | Burn watch: over 3% of the weekly plan an hour at two checks in a row is an ACT (usage-log.sh logs only today; first restart the usage log and commit the baseline snapshot script, full-power #134) | P-440d | ACT | OS-PM | Open | fixture usage log → ACT on the second high check only; test exits 0 |
| OS-24 | Hourly pipeline numbers from one batch-failure definition (full-power #51): batch failure rate, median come-back minutes, label-wait minutes | P-738, P-500 | ACT (flow-constraint.py, ENF-738, part) | OS-PM | Open (measure what flow-constraint.py already prints first) | lead-watch prints the three numbers with their sample each check; `check-flow-constraint.sh` exits 0 |
| OS-25 | A script prints the 30-minute report (why-targets action 5): Needs you, Decide when you can, Works, merged, blocked, next three with IST times | P-338, P-478, P-503 | script | OS-PM | Blocked (Lead ruling asked on #3683, 25 Nov 13:0x IST: founder-report.py (ENF-783c) already prints Needs you, Proven, merged, blocked and ETAs on time or late; only P-478's "Decide when you can" block is missing; add `--decide` to the founder's fixed template, or mark Done) | `tools/lead-report.sh` on fixture state prints the parts in order; `check-lead-report.sh` exits 0 |
| OS-26 | Hand-over at the context line: a Stop hook reads the session's transcript size and warns at the P-446 / P-565 line | P-446, P-446f, P-565 | hook (research first: what a hook can read) | OS-PM | Open | the PR names what the hook reads and its test exits 0; or the Lead retires the item with a reason |
| OS-27 | Lanes' "Question for the tech lead" and LANE-REPORTs become queue items without a Lead read (full-power #202: items.py ingests lane questions) | P-611b, P-293b | ACT | OS-PM | Open | a fixture PR comment with the heading → one item in items.json and an ACT until acked; `check-items.sh` exits 0 |
| OS-28 | WIP limits per group: `wip-guard.py` (hook on starting a builder; check-wip-guard.sh in check-guards.sh) already enforces them at start; the ACT adds a group already over its limit (lanes started outside the hook, cloud lanes) at each check (B193 part 4; full-power #188) | P-622, P-623 | ACT | OS-PM | Open (confirm the hook is in force first; if it covers cloud lanes, Retire) | fixture with a group over its limit → one ACT; test exits 0 |
| OS-29 | Push before stop: `stop-check.sh:84` already notes unpushed commits (in `.claude/settings.json`); only the test is missing (full-power #165 A7) | P-557 | hook (test only) | OS-PM | Open | `check-stop-check.sh` cases: an unpushed commit → the note; a branch with no upstream → no crash; exits 0 |
| OS-68 | lead-watch reads the claude.ai sidebar ("Show more" until gone) and prints one ACT for each lane idle over 30 min with its last line; today the Lead does this by hand with a browser script (Lead 5, 25 Nov 11:19 IST; A385) | P-647, P-339b | ACT (built-in browser script → a saved app view, as app-view.js does) | OS-PM | Open (check what app-view.js and lead-watch-idle already cover first) | fixture app view with a lane idle 31 min → one ACT with its last line; idle 29 min → none; a cut list ("Show more" still there) → an ACT; test exits 0 |
| OS-69 | A lane whose PR merged over 1 h ago and is still not archived is an ACT (Lead 5; A385) | P-337, P-468 | ACT (lane-cleanup.py lists them today, no ACT) | OS-PM | Open | fixture: a completed lane whose PRs all merged 61 min ago → one ACT; 59 min → none; test exits 0 |
| OS-53 | Per-stage flow measures as ACT lines (full-power #189); folded with OS-24 when built | P-646, P-738 | ACT | OS-PM | Open (with OS-24) | as OS-24 |
| OS-54 | Routines: a turn cap, a WIP brake, a run log, a starter script (full-power #176); the 30-queued-runs brake retuned (#133) | P-622 | script | Lead (routine prompts) | Open | each routine prompt names its cap; the run log is written; a script prints the last run of each |
| OS-55 | Unattended nights: a push alert at 85% of the plan, trim lanes over 4%/h after 22:00 (full-power #177); with OS-23 | P-440d, P-461 | ACT | OS-PM | Open (with OS-23) | fixture usage at 86% → one ACT; test exits 0 |
| OS-56 | Anti-stall rest (full-power #202): away-flag hook, launchd heartbeat with a push test, retire the P-402 local line, generated module-card lines, questions without a Lead number | P-388, P-402, P-293b | hook / script | OS-PM (hook settings: founder, P-387) | Open (split into one PR each; check main first) | each part's own test exits 0, or the Lead retires it |

## Tier 3: PR rules into gate checks (each starts as a warning, P-717 (b))

| ID | What | Rule | Kind | Owner | Status | Done when |
|---|---|---|---|---|---|---|
| OS-12 | Make `pr-rules` steps that say "not yet a required check" required in the ruleset: 800 lines (P-610) and the Duplicate check line (P-526) | P-610, P-526 | CI: ruleset | Lead (ruleset admin) | Open (precondition: full-power #163, pr-rules false failures) | a ruleset read (`gh api .../rulesets`) lists `pr-rules` as required; RULES rows drop "not yet a required check" (Lead) |
| OS-30 | Approve on the branch before the PR leaves draft; builder skill and night queue still say draft (full-power #120) | P-683 | CI: pr-rules step | OS-PM (skill text: Lead) | Open | a non-draft PR with no `Reviewer: Approve` line gets the warning; test exits 0 |
| OS-70 | Every lane brief carries "post through the GitHub connector when gh is refused" (R1.112 stalled on this, 25 Nov; Lead 5; A385) | P-293b, P-486b | CI: brief-check.sh (warning first) | OS-PM | Open | brief-check.sh warns on a brief without the line and passes one with it; its test exits 0 |
| OS-31 | Builders never edit STATE, RULES, DECISIONS, BACKLOG: the Stop hook's rule also in CI for non-Lead branches | P-314, P-521 | CI: pr-rules step | OS-PM | Open | a fixture non-Lead PR touching STATE.md → warning (later failure); a `lead/` branch → none; test exits 0 |
| OS-32 | No combination key, form number or program-specific branch in engine code (slice guards retired 8 Nov) | P-319 | CI: grep check on engine paths | OS-PM | Open | a fixture engine file with a form number → warning; test exits 0 |
| OS-33 | Live AI off by default: a check fails a default-on `STUDIO_*_LIVE` | P-175, P-175b | CI | OS-PM | Open | fixture with a default-on flag → failure; test exits 0 |
| OS-34 | `guards` required by path, wider paths, the 5 orphan tests wired (full-power #156); drop label-guard's `workflow_run` (#157) | P-611a | CI | OS-PM (ruleset part: Lead) | Open | every `check-*.sh` is run by `check-guards.sh` or listed as exempt; label-guard.yml has no `workflow_run` trigger; a ruleset read lists `guards` required for product/tools/**; the test exits 0 |
| OS-35 | check-docs fails on a future time in STATE (warns today; full-power #164) | P-302 | CI: check-docs.sh | OS-PM | Open | a fixture STATE with a time ahead of the clock fails; `check-docs` exits 0 on main |
| OS-36 | Schema PRs additive with a later migration stamp | P-600 | CI | OS-PM | Open (check what #3035 already covers first) | a fixture migration with an older stamp or a DROP → warning; test exits 0 |
| OS-37 | Every check prints its rule id, reason and allowed fix (full-power #215) | P-611a | CI (all checks) | OS-PM | Open (last in tier) | check-docs or a lint lists checks whose failure line lacks a rule id; exits 0 when none |
| OS-57 | pr-rules false failures (full-power #163; precondition of OS-12) | P-610, P-526 | CI | OS-PM | Open (check main first) | the false-failure cases named in #163 pass in `check-pr-rules`-type tests; exits 0 |
| OS-58 | One allow-list door for GitHub writes (curl writes pass the gh deny lines; full-power #165 A3); workflow lint actionlint/zizmor (A10, through STANDARDS §1) | P-384, P-387 | hook; CI | OS-PM (settings: founder; new tool: STANDARDS §1) | Open | a curl POST to api.github.com from a lane copy is refused by the hook in its test; a workflow lint step runs report-only |
| OS-67 | Supply chain: actions pinned by SHA (P-583 steps 8-11), a report-only dependency audit, SEC-1 shaped for Dependabot alerts (full-power #191) | P-583, P-553 | CI (report-only first) | OS-PM (SEC-1 row: Lead) | Open (check main first: check-npm-audit-report.sh exists) | a check lists every `uses:` not pinned to a 40-hex SHA as a warning; the audit step reports without failing; their tests exit 0 |
| OS-59 | Migration stamp check in pr-rules (full-power #167 A6); folded into OS-36 | P-600 | CI | OS-PM | Open (with OS-36) | as OS-36 |
| OS-60 | `pr-open-guard.sh` in pre-push (PR-W, full-power #168): a pushed branch with commits and no PR is said at push | P-557, G-4 (5) | hook (git pre-push) | OS-PM | Open (check main first) | `check-push-guard-fixtures.sh` case: push of a branch with no PR → the note; exits 0 |
| OS-61 | Measuring scripts and the board read through GraphQL (F14, full-power #170; about 150 REST calls a run) | none: speed only (not a rule's enforcer; OS-48 applies) | script | OS-PM | Open (later: speed, not a rule) | app-code-prs.sh and the board make at most 10 calls a run in their tests |
| OS-62 | Edit-loop lint hook: PostToolUse on Edit/Write runs eslint on the edited file (full-power #214; the lint rules themselves, #213, are product code for the builder lanes) | STANDARDS | hook | OS-PM (settings line: founder) | Open (time it first) | the hook's test lints one fixture file under 2 s and prints the rule id |
| OS-63 | Factory changes tested before they merge: skill, agent-prompt and rule PRs run the replay suite; no factory PR changes the check that judges it (full-power #219) | P-611a | CI | OS-PM | Open (later) | a fixture PR changing both a check and its judge is refused; test exits 0 |
| OS-64 | Read-only tokens for lanes and routines (full-power #222) | P-312a, P-387 | settings | founder (tokens), Lead | Open | the token list names each token's scopes; `check-write-token.sh` exits 0 |
| OS-65 | The remaining enforcement-plan and backlog rows (full-power #187: B197/B198 settings lines, hook 18 weekly audit, health owner fields; #188: B194 hot-file split, B198, B200, B201 tests, B199 part 2) | P-611a, P-622 | each its own | OS-PM | Open (read each against main, then split into rows here or mark Done) | each has an OS row or a Done line with its commit |

## Tier 4: retire stale rules (each needs the Lead's yes; the Lead edits RULES)

| ID | What | Rule | Kind | Owner | Status | Done when |
|---|---|---|---|---|---|---|
| OS-40 | P-734 ran "unchanged to 22 Nov evening": expired | P-734 | retire | Lead | Open | the Lead's yes named; RULES row moved to the retired file |
| OS-41 | IDX-17's `FULL_RUN_FROM` to 22 Nov 20:00 IST: the date has passed; P-822 now covers full runs | IDX-17, P-743 | retire (date part) | Lead | Open | the Lead's yes; queue-gate no longer reads the date (OS-3 lane) |
| OS-42 | P-651 (CI overflow on the Namespace trial; full tests only in the queue): partly reversed by P-822; its capacity reason ended 18 Nov (Enterprise Cloud; why-targets §2) | P-651 | retire or re-word | Lead | Open | the Lead's yes |
| OS-43 | P-439 "cloud lanes cannot dispatch Actions": comment-run.yml's `/run` commands (D3) let them | P-439 | re-word | Lead | Open | the Lead's yes; RULES points to comment-run.yml |
| OS-44 | P-363 "GitHub through curl with `gh auth token`": check whether it is still how the Lead works | P-363 | retire or keep | Lead | Open | the Lead's yes |
| OS-45 | The full-power plan as "the one action list" (237 items, 15% done, untouched since 20 Nov): its pipeline and enforcement items now live here | why-targets action 5 | retire (status) | Lead | Open | STATE names this file as the OS list; the plan is history |
| OS-46 | P-286 two idle standby Leads, measured against 32 Leads in 35 h | P-286 | re-decide | Lead (founder if a cost) | Open | the Lead's ruling |
| OS-47 | P-458 and P-461 (account switch, weekly meter) beside the newer P-826 | P-458, P-461 | merge | Lead | Open | the Lead's yes |
| OS-48 | The rows marked J in the appendix are judgement or product rulings with no machine check that can be written; they stay prose under P-611a ("where one can be written") | P-611a | retire (as enforceable) | Lead | Done (Lead 5, 25 Nov 11:3x IST: the J list stays judgement, one yes) | one Lead yes for the J list, or a row moved to an OS item |
| OS-66 | Guard review: each of the 28 guards with the incident it prevents, its catches and false blocks; keep, tune or merge with evidence, never drop blindly (full-power #237, founder 20 Nov) | P-611a | retire / tune | OS-PM prepares, Lead decides | Open | one table in design/ with each guard's catches and false blocks over 7 days; each verdict the Lead's |

## Left out, and why

* **why-targets action 1** (outside accounts in one sitting) and **action 2's builder start** (a builder on every unproven row, the cap from 8 to about 25): founder and Lead capacity decisions (P-821, P-825), not pipeline or enforcement. Action 2's "a merge wakes the next lane by automation" is OS-49.
* **full-power #142 to #155 and #172 to #186, #190, #194 to #197, #199, #200, #206, #207** that are not named above: records chores and one-time Lead tasks (#142-#147, #154, #155, #173, #183, #184, #206), clean-up stages and their protocol (#148-#151, #194-#197), founder settings, dates and domains (#152, #153, #185, #190, #199), private-home upkeep (#200), qa and skill work (#172, #174, #207), weekly or dated reviews (#175, #178-#182, #186). #158 is OS-52; #134 is in OS-23; #140 is in OS-16; #191 is OS-67.
* **full-power #1 to #141** that are not named above: the org move and transfer (done 18 Nov), one-time clean-ups and records chores, not standing enforcement. Those still open there stay in that file as history (OS-45).
* **#225 to #236** (dependency alerts, staging and production on AWS, deploy, monitoring, backups, release candidate, privacy review, feature flags, on-call, analytics): release and infrastructure rows the Lead plans with the founder; not operating-system enforcement.
* **#171, #213, #216, #217, #223** (test tooling, lint rules, performance budgets, graders, property and race tests): product code and tests, built by the area lanes; OS-62 takes only the hook.
* **#192, #193, #204, #218, #220, #221** (audits, registry extras, next-week list, a private trace store, the five human jobs, a nightly explore loop): later, once batches fail under 15% (why-targets); each comes back here as a row when the Lead picks it.
* **#159 to #162, #198, #201** (CI speed: container proof, fast checks first, shard sizing, gate jobs, affected-only CI, CI cost): why-targets measured 0 min median job wait and idle machines, so CI speed is not the constraint now; re-listed when a measure says so.
* Statuses of full-power items are as that file left them on 20 Nov 15:56 IST; each item's PR checks main first and records Done when it already is.

## Appendix: every RULES row not fully machine-enforced (133 of 156, as of P-826)

Codes: **OS-nn** the item that enforces it · **K** a machine part exists; the rest is judgement; keep · **J** judgement or a product ruling; no check can be written (OS-48) · **R** retire or re-word (Tier 4).

| Row | Enforced by today | Next |
|---|---|---|
| IDX-1, IDX-2, IDX-4, IDX-5, IDX-7, IDX-8, IDX-9, IDX-10, IDX-12, IDX-14, IDX-18, IDX-26, IDX-27 | prose (index rows: rulings stand as recorded) | J |
| P-728 | prose | J (its parts: OS-07, item-proof.yml) |
| P-418 | prose | J |
| P-464, P-470, P-473, P-558, QA-221, P-335, P-694, P-609, P-820 | prose (product rulings) | J |
| P-462 | hook (part: Mac caps) | K |
| P-468 | prose | K (lane-cleanup.py lists; deletion stays human) |
| P-488 | CI gate B (part) | K |
| F-12Nov, P-502, P-254, P-294, P-390, P-486, P-628, P-699, P-682 | prose | J |
| P-500 | script (part) | K, OS-24 |
| P-503 | prose | OS-25 |
| P-504, P-505 | prose | J (a classifier refusal is the guard; never routed around) |
| P-521 | hook (part) | OS-31 |
| P-530 | prose | OS-18 |
| P-532 | script (part) | K |
| P-542 | prose | J |
| P-551, P-553, P-587, P-821, P-824 | prose | J (founder-only actions; STANDARDS §1 gate) |
| P-565 | prose | OS-26 |
| P-576 | prose | J; hot-file part OS-21 |
| P-582 | prose | J |
| P-593 | script (part) | K |
| P-600 | prose | OS-10 (Done), OS-36 |
| P-604 | prose | J |
| P-605, P-303 | hook (part) | K |
| P-606 | CI pr-rules (part) | K, OS-12 |
| P-607 | prose | J |
| P-610 | CI (part: not required) | OS-12 |
| P-615, P-440b | check-docs (part) | OS-16 |
| P-557 | prose | OS-29 |
| P-339, P-305 | CI gate B (part) | K |
| P-348c, P-405, P-434b | prose (qa skill) | J |
| P-442 | prose | J |
| P-439 | prose | OS-43, OS-06 |
| P-312a | CI (part) | K |
| P-278 | script (part) | K |
| P-526 | CI (part: not required) | OS-12 |
| P-526b | prose | K (touch-overlap.py at lane start) + OS-21 |
| P-526c | prose | OS-17, OS-15 |
| P-337 | prose | J |
| P-438b | prose | K (touch-overlap.py) + OS-21 (OS-10 Done for migrations) |
| P-270 | prose | OS-20 |
| P-277 | prose | OS-13 (review-rounds) |
| P-352 | prose | J |
| P-319 | prose | OS-32 |
| P-251 | prose | J |
| P-293b | script (part) | K, OS-27 |
| P-175, P-175b | script (part) | OS-33 |
| P-478, P-338 | prose | OS-25 |
| P-591, P-636 | script (part) | K |
| P-486b | prose | J |
| P-384, P-402 | hook (part) | K; P-402 requeue OS-05 |
| P-423 | prose | OS-02 (P-823 relaxes) |
| P-823 | CI owed (OS-3) | OS-02 |
| P-170 | prose | J (AGENTS rule 4; citation review) |
| P-339b | script (part) | OS-14, OS-22 |
| P-348e | hook (part) | K |
| P-286 | prose | OS-46 |
| P-388 | prose | J |
| F-7Nov | prose | J |
| P-363 | prose | OS-44 |
| P-387 | hook (part) | K |
| P-302 | prose (warns) | OS-35 |
| P-371 | prose | OS-19 |
| P-622, P-623 | prose (B193, B194) | K (wip-guard.py hook) + OS-28 |
| P-632, P-635, P-673, P-674, P-680, P-691 | prose | J |
| P-637 | CI (part) | OS-02 |
| P-639 | prose (part script) | K |
| P-644, P-663 | prose (plan) | J (the daily number: OS-24) |
| P-647 | prose (browser script) | J |
| P-651 | prose | OS-42 |
| P-683 | prose | OS-30 |
| P-731 | CI owed | OS-05 |
| P-822 | CI owed (OS-3) | OS-01 |
| P-733 | CI walks.yml, #2233; prose | OS-07, OS-13 |
| IDX-21 | script (part) | K |
| P-446, P-446f | prose | OS-26 |
| P-440c, P-445b | prose | J |
| P-440d | prose (logs only) | OS-23 |
| P-295, P-295b | script (part) | K |
| P-377 | prose | J |
| P-458, P-461 | prose | OS-47 |

Rows whose "Enforced by" names a whole machine enforcer (23 of 156: e.g. P-501, P-611a, P-611b, P-317, P-348d, P-385, P-314, P-336, P-440, P-618, P-678, P-685, P-686, P-734, P-738, IDX-11, IDX-13, IDX-17, IDX-19, IDX-20, IDX-25, F-6Nov) are out of this list unless a tier item names them (P-734 and IDX-17: Tier 4).

## OS-PM hand-over

**Written 25 Nov ~13:1x IST by OS-PM 2** (session https://claude.ai/code/session_018BSQJq3dhw56vCQs8vPeM6), handing over at about 45% context. OS-PM 1's hand-over (12:1x IST) is in git history at 1acfdc281; its orders still stand: Tier 1 in order, skipping OS-1, OS-3 and #3623; then Tier 2; one item per PR on its own branch; a fresh Opus reviewer on the exact head; label after Approve; a one-line status on the newest OS-PM records PR after each PR opens.

**Done:** OS-52 (#3676), OS-10, OS-48; this list.

**In flight (each waits on the Lead; none needs OS-PM until the Lead answers):**
* **OS-15, #3693** (`records-pr.sh`): both review rounds used (2 blocking found in round 1, 1 in round 2, all fixed). The fixes at 4414b7970 wait on the Lead (P-277): on a yes, post `Reviewer: Approve <head>`, mark it ready. Its pr-rules run failed on c58c1be only for a missing "Done when" line, now in the body: re-run pr-rules on the next push.
* **OS-16, #3696** (LEAD-START.md, start read summed by check-docs, 29.7k today): approved on bc7c0eb55, ready; the Lead reads (check-docs, stop-check, check-guards) and labels. After merge the Lead points the lead skill at LEAD-START.md and may amend P-615 to 40k.
* **OS-17, #3699** (known-failures `records-pr-age`; 5 records PRs over 24 h now): approved on 39964999f, ready; the Lead reads (lead-watch step 12 facts) and labels.
* **OS-18, #3703** (lead-watch 13d + founder-wait.py: the 🔴 founder line, P-530 (2) timing): approved on 28a4fa8b3 after two rounds, ready; the Lead reads and labels. Round 2's minors are row OS-18b. Main's STATE still carries the 22 Nov 🔴 line: after merge its re-send ACT starts 30 min after the first check.
* **OS-06 #3671, OS-49 #3674:** labelled and queued (OS-PM 1's).
* **Conflicts to expect:** #3696, #3699 and #3703 each add a TESTS line and mutation rows at the same spot of check-guards.sh, and #3699/#3703 both edit lead-watch.sh. The second to merge conflicts: merge main, keep both lines, re-run the tests, and the reviewer re-checks the merge (P-293), as OS-PM 1 did for #3671.

**Blocked:** OS-05 (P-731 ruling, then OS-3), OS-14 (fixed by OS-11, #3506), OS-71 (PF-8c), OS-25 (Lead ruling on `--decide`, asked on #3683).

**Added by Lead 5 (13:1x IST, founder ruling 25 Nov 13:04 IST "Yes, start now"; rows on records PR #3711): OS-72, OS-73, OS-77b are Tier 1, after the Tier 1 items in hand.** Design: design/self-checking-builders-2026-11-25.md (on #3711 until it merges). Each is one PR, under 800 lines, warning only, pipeline queue; none changes a merge queue, gate or required check.
* **OS-72, #3715** (`claude/trusting-hopper-7jun9g-os72`): the root `.claude/skills/verify` skill, gated by `lanes.txt` (empty = off), plus `prototype/studio/tools/verify-plan.sh`. The plan takes the nearest 4 capabilities, on CI's scoring data, on the lane's own port. Approved on f0fe070ad after two rounds and ready; the Lead reads, labels, and names the trial lane in lanes.txt. **OS-72b** follow-ups from round 2:
  * put the data regex in a variable (bash 3.2);
  * reserve ports 4438/4448/4458/4468 for verify in WAY-OF-WORKING;
  * qa's held checkpoint packs off CI;
  * the `next` skill line (the question for the Lead on #3715).
* **OS-73 (next):** LCP 2.5 s / CLS 0.1 read in the Playwright packs (acceptance/lib/browser.ts, the walker: `PerformanceObserver` for largest-contentful-paint and layout-shift), printed as one line per page, warning only; verify's check row 3 then reads it; the Lead writes STANDARDS §9.
* **OS-77b (after it):** every API route signed out and with the wrong role refuses 401/403; list the routes from the Nest controllers, call each on an isolated copy, print the table; a planted open route fails the fixture test; warning only in CI.

**Next, in order:** OS-73, OS-77b, then OS-18b (after #3703 merges), OS-19 (a CI run cancelled by a person is an ACT), OS-20 (three merges of main: "lands next"), OS-21 (two open PRs on a hot file), OS-22, OS-23, then the rest of Tier 2 (OS-24 with OS-53; check what flow-constraint.py already prints first).

**Lessons (add to OS-PM 1's):**
* **Read main first:** OS-25 was mostly built (founder-report.py) and OS-17 fitted known-failures.tsv with no new lead-watch step; a known-failures line is the cheapest ACT.
* **pr-rules needs a "Done when" line in every PR body**, beside the Duplicate check.
* **gh is refused here for PR comments, body edits and ready-for-review:** use the GitHub connector (add_issue_comment, update_pull_request with `draft: false`).
* **Reviewers found, in every first round:** a hook or harness that reads a new output line differently (stop-check's `docs_files`; check-guards' tools-only copy), a cap on a list (`--limit 80`), and staged or symlinked git state. Test each of those up front.
