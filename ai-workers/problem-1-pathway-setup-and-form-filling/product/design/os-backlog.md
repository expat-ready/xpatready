# OS backlog: every pending pipeline, operating-system, tooling, hook and enforcement item, in one order (P-828)

Owner: **OS-PM**, the dedicated operating-system owner (founder rule P-828, 25 Nov; records PR #3641). Started 25 Nov 10:43 IST from `origin/main` 63f5cc913. The Lead folds rule changes into RULES.md and DECISIONS.md; OS-PM never edits them.

**Sources read:** `product/RULES.md` as of P-826 (156 rule rows; the 133 whose "Enforced by" says prose, owed or part are mapped in the appendix); `design/full-power-plan-2026-11-17.md` (Open and Doing items about pipeline, tools and enforcement); `design/why-targets-missed-2026-11-24.md` (top 5 actions); the Lead's tool items (a) to (f) from the OS-PM brief; the tools and workflows on main (`product/tools/`, `.github/workflows/`).

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
| OS-02 | Auto-label additive-migration, money and public-route PRs after the fresh reviewer's Approve on the exact head and green ci; the Lead reads afterwards (money within the hour, others 1 in 3) | P-823 (relaxes P-423, P-637) | CI: queue-gate.sh | OS-3 (PR B) | Open (after OS-01) | a fixture PR with a migration, `Reviewer: Approve <head>` and green ci is labelled by the bot in `check-queue-gate.sh`; lead-watch prints an ACT for an auto-labelled money PR not Lead-read after 60 min |
| OS-03 | The pipeline queue goes before product batches | P-827 | CI: .mergify.yml | OS-1 | Doing (OS-1) | `check-mergify-scopes.sh` asserts the pipeline queue is first and exits 0 in CI |
| OS-04 | A cloud setup error stops the session start instead of passing silently | AGENTS rule 10, P-557 | script | #3623 lane | Doing (#3623) | #3623 merged; its test shows a failing step exits 1 |
| OS-05 | **Auto-requeue** (Lead item b): a PR that left a red batch is relabelled by the bot once a `/run full` on its exact head is green and a "Batch failures covered:" line names every failing suite of that batch; today the Lead does it by hand | P-731, P-402 (requeue) | CI: new workflow + script (reads queue-gate's verdict; does not edit queue-gate.sh) | OS-PM | Open | `check-auto-requeue.sh` exits 0 with cases: green run + covered line → label; red run, wrong head, or a suite not named → no label and one reason line; a breaker pass recorded on its PR |
| OS-06 | **Dispatch the full run on ask** (Lead item d): an open PR's "Question for the tech lead" that asks for a full run gets `ci.yml` dispatched on its head and a reply, without a Lead turn; lanes are also pointed to `/run full` (comment-run.yml) | P-439, P-731, P-293b | ACT then CI: script run by lead-watch, dispatch by the Lead copy's token | OS-PM | Open | `check-full-run-ask.sh` (stand-in gh) exits 0: an asking comment → one dispatch and one reply; a head already run green or red → none; a non-member comment → none |
| OS-07 | **Walks after a qa merge** (Lead item c): a merged qa PR (qa/CAPABILITIES.md or qa/BUGS.md) dispatches `walks.yml` on main for the journeys it names | P-733 (automatic proof on merge) | CI: workflow on `pull_request` closed+merged | OS-PM | Open | a workflow test (`check-walks-after-qa.sh`) shows a merged qa fixture yields one `workflow_dispatch` of walks.yml with its journeys and an unmerged or non-qa PR yields none |
| OS-08 | Quarantine the suites that pass only on retry (why-targets action 3's companion; full-power #203): after two retry-only passes in 24 h a suite is listed and reported, not blocking, until its fix PR | P-822 (with P-371) | CI: retry-watch.py → list read by run-suites | OS-PM, **Lead yes first** | Blocked (Lead yes: a quarantine stops a test blocking) | the quarantine file is written by retry-watch's PR only, run-suites reports a listed suite as a warning, `check-retry-watch.sh` exits 0 with the list cases |
| OS-09 | ENF-778a | IDX-23 | CI: queue-gate.sh | OS-3 | Open (after OS-02) | as written in OS-3's brief; `check-queue-gate.sh` exits 0 |
| OS-10 | One migration slot per schema area (the migration wait; held 55 h for a label) | P-600, P-438b | CI | Lead | **Done** (#3035 merged; main 63f5cc913, 25 Nov) | merged; its check green on main |
| OS-11 | The Lead's tools are main's (the Lead branch was 1,944 behind main; hooks ran the branch's scripts; full-power #88) | P-82, P-557 | script | Lead | Blocked (#3506: approved, draft, conflicting) | #3506 merged; lead-watch prints the sha of the tools it ran and it equals origin/main |
| OS-12 | Make `pr-rules` steps that say "not yet a required check" required in the ruleset: 800 lines (P-610) and the Duplicate check line (P-526) | P-610, P-526 | CI: ruleset | Lead (ruleset admin) | Open | a ruleset read (`gh api .../rulesets`) lists `pr-rules` as required; RULES rows drop "not yet a required check" (Lead) |
| OS-13 | Graduate the report-only checks (8 of 37 workflows): `pr-suites`, `walks`, skeleton parts, `red-on-old`, `review-rounds` (+P-277's round cap) | P-717 (b), P-277 | CI | OS-PM prepares, Lead decides each | Open | for each: a PR with its false-block count over its warning window makes it blocking, or the Lead retires it with a reason; that check's own test exits 0 |

## Tier 2: Lead-loop prose rules into lead-watch ACT lines

Measured: 32 Lead sessions in 35 h; start read 170-205k tokens; each hand-over drops items.

| ID | What | Rule | Kind | Owner | Status | Done when |
|---|---|---|---|---|---|---|
| OS-14 | **Only fresh branches** (Lead item a): lead-watch prints only branches pushed in the last 7 days; today about 90 stale "not on main" lines hide the real ones. `branch-sweep.sh` already cuts at 7 days by committer date and ACTs only for 24 h, so the first step measures which section prints the 90 (suspects: committer date of a merge-from-main, `gh pr list --limit 500` missing merged PRs older than ~5 days, `lane-cleanup.py`) | P-339b, G-4 (5) | ACT | OS-PM | Open | the measured cause is named in the PR; a fixture with a branch last pushed 8 days ago and one whose merged PR is outside the newest 500 prints no ACT or "not on main" line; `check-branch-sweep.sh` (and `check-g4-rules.sh`) exit 0 |
| OS-15 | **Records PR in one script** (Lead item e): one command commits the Lead's records, refreshes the RULES "as of" line and lag, runs check-docs, and opens or updates the records PR | P-336, P-440, P-526c, P-402 | script | OS-PM (the Lead runs it) | Open | `tools/records-pr.sh --dry-run` on a fixture copy prints the files, the new as-of row and the PR it would open; `check-records-pr.sh` (stand-in gh) exits 0; check-docs exits 0 after it |
| OS-16 | **One-page Lead start read under 40k tokens** (Lead item f; why-targets action 5): `product/LEAD-START.md` names what a fresh Lead reads and in what order, nothing from history | P-615, P-440b, P-446 | CI: check-docs.sh | OS-PM | Open | check-docs fails when the files LEAD-START.md lists total over 40k tokens (bytes ÷ 4) and prints the total; `check-start-read.sh` exits 0; the lead skill points to it (Lead) |
| OS-17 | Records PRs open over 24 h are an ACT (full-power #145) | P-526c | ACT | OS-PM | Open | lead-watch prints one ACT per records PR older than 24 h; test case in `check-lead-watch-*.sh` exits 0 |
| OS-18 | A 🔴 "Waiting on the founder" line atop STATE is an ACT each check ("re-send the push") | P-530 | ACT | OS-PM | Open | lead-watch prints the ACT while the line exists and none when it is gone; test exits 0 |
| OS-19 | A CI run cancelled by a person (not by concurrency or Mergify) is an ACT naming the run | P-371 | ACT | OS-PM | Open | fixture runs: a `cancelled` run with a human actor → one ACT; a concurrency-cancelled one → none; test exits 0 |
| OS-20 | An open PR that has merged main three times is an ACT "lands next" | P-270 | ACT | OS-PM | Open | fixture PR with three "Merge branch 'main'" commits → one ACT; test exits 0 |
| OS-21 | Two open PRs touching one hot file (prisma/schema.prisma, api/src/case-prepare.ts) or overlapping "Touches:" lists are an ACT | P-438b, P-526b | ACT | OS-PM | Open | fixture with two PRs on schema.prisma → one ACT naming both; test exits 0 |
| OS-22 | lead-watch and the board judge red from `ci` only, and any failed gh call is an ACT (full-power #169) | P-339b | ACT | OS-PM | Open | stand-in gh failing once → one ACT; a red non-`ci` check → not counted red; test exits 0 |
| OS-23 | Burn watch: over 3% of the weekly plan an hour at two checks in a row is an ACT (usage-log.sh logs only today) | P-440d | ACT | OS-PM | Open | fixture usage log → ACT on the second high check only; test exits 0 |
| OS-24 | Hourly pipeline numbers from one batch-failure definition (full-power #51): batch failure rate, median come-back minutes, label-wait minutes | P-738, P-500 | ACT (flow-constraint.py, ENF-738, part) | OS-PM | Open (measure what flow-constraint.py already prints first) | lead-watch prints the three numbers with their sample each check; `check-flow-constraint.sh` exits 0 |
| OS-25 | A script prints the 30-minute report (why-targets action 5): Needs you, Decide when you can, Works, merged, blocked, next three with IST times | P-338, P-478, P-503 | script | OS-PM | Open | `tools/lead-report.sh` on fixture state prints the parts in order; `check-lead-report.sh` exits 0 |
| OS-26 | Hand-over at the context line: a Stop hook reads the session's transcript size and warns at the P-446 / P-565 line | P-446, P-446f, P-565 | hook (research first: what a hook can read) | OS-PM | Open | the PR names what the hook reads and its test exits 0; or the Lead retires the item with a reason |
| OS-27 | Lanes' "Question for the tech lead" and LANE-REPORTs become queue items without a Lead read (full-power #202: items.py ingests lane questions) | P-611b, P-293b | ACT | OS-PM | Open | a fixture PR comment with the heading → one item in items.json and an ACT until acked; `check-items.sh` exits 0 |
| OS-28 | WIP limits per group as an ACT (B193 part 4; full-power #188) | P-622, P-623 | ACT | OS-PM | Open | fixture with a group over its limit → one ACT; test exits 0 |
| OS-29 | Push before stop: the Stop hook warns on commits not pushed (full-power #165 A7) | P-557 | hook | OS-PM (settings line: founder, P-387) | Open | `check-stop-check.sh` case with an unpushed commit prints the warning and exits 0 |

## Tier 3: PR rules into gate checks (each starts as a warning, P-717 (b))

| ID | What | Rule | Kind | Owner | Status | Done when |
|---|---|---|---|---|---|---|
| OS-30 | Approve on the branch before the PR leaves draft; builder skill and night queue still say draft (full-power #120) | P-683 | CI: pr-rules step | OS-PM (skill text: Lead) | Open | a non-draft PR with no `Reviewer: Approve` line gets the warning; test exits 0 |
| OS-31 | Builders never edit STATE, RULES, DECISIONS, BACKLOG: the Stop hook's rule also in CI for non-Lead branches | P-314, P-521 | CI: pr-rules step | OS-PM | Open | a fixture non-Lead PR touching STATE.md → warning (later failure); a `lead/` branch → none; test exits 0 |
| OS-32 | No combination key, form number or program-specific branch in engine code (slice guards retired 8 Nov) | P-319 | CI: grep check on engine paths | OS-PM | Open | a fixture engine file with a form number → warning; test exits 0 |
| OS-33 | Live AI off by default: a check fails a default-on `STUDIO_*_LIVE` | P-175, P-175b | CI | OS-PM | Open | fixture with a default-on flag → failure; test exits 0 |
| OS-34 | `guards` required by path, wider paths, the 5 orphan tests wired (full-power #156); drop label-guard's `workflow_run` (#157) | P-611a | CI | OS-PM | Open | every `check-*.sh` is run by `check-guards.sh` or listed as exempt; test exits 0 |
| OS-35 | check-docs fails on a future time in STATE (warns today; full-power #164) | P-302 | CI: check-docs.sh | OS-PM | Open | a fixture STATE with a time ahead of the clock fails; `check-docs` exits 0 on main |
| OS-36 | Schema PRs additive with a later migration stamp | P-600 | CI | OS-PM | Open (check what #3035 already covers first) | a fixture migration with an older stamp or a DROP → warning; test exits 0 |
| OS-37 | Every check prints its rule id, reason and allowed fix (full-power #215) | P-611a | CI (all checks) | OS-PM | Open (last in tier) | check-docs or a lint lists checks whose failure line lacks a rule id; exits 0 when none |

## Tier 4: retire stale rules (each needs the Lead's yes; the Lead edits RULES)

| ID | What | Rule | Kind | Owner | Status | Done when |
|---|---|---|---|---|---|---|
| OS-40 | P-734 ran "unchanged to 22 Nov evening": expired | P-734 | retire | Lead | Open | the Lead's yes named; RULES row moved to the retired file |
| OS-41 | IDX-17's `FULL_RUN_FROM` to 22 Nov 20:00 IST: the date has passed; P-822 now covers full runs | IDX-17, P-743 | retire (date part) | Lead | Open | the Lead's yes; queue-gate no longer reads the date (OS-3 lane) |
| OS-42 | P-651 (CI overflow on the Namespace trial; full tests only in the queue): partly reversed by P-822; the trial ended | P-651 | retire or re-word | Lead | Open | the Lead's yes |
| OS-43 | P-439 "cloud lanes cannot dispatch Actions": comment-run.yml's `/run` commands (D3) let them | P-439 | re-word | Lead | Open | the Lead's yes; RULES points to comment-run.yml |
| OS-44 | P-363 "GitHub through curl with `gh auth token`": check whether it is still how the Lead works | P-363 | retire or keep | Lead | Open | the Lead's yes |
| OS-45 | The full-power plan as "the one action list" (237 items, 15% done, untouched since 20 Nov): its pipeline and enforcement items now live here | why-targets action 5 | retire (status) | Lead | Open | STATE names this file as the OS list; the plan is history |
| OS-46 | P-286 two idle standby Leads, measured against 32 Leads in 35 h | P-286 | re-decide | Lead (founder if a cost) | Open | the Lead's ruling |
| OS-47 | P-458 and P-461 (account switch, weekly meter) beside the newer P-826 | P-458, P-461 | merge | Lead | Open | the Lead's yes |
| OS-48 | The rows marked J in the appendix are judgement or product rulings with no machine check that can be written; they stay prose under P-611a ("where one can be written") | P-611a | retire (as enforceable) | Lead | Open | one Lead yes for the J list, or a row moved to an OS item |

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
| P-526b | prose | OS-21 |
| P-526c | prose | OS-17, OS-15 |
| P-337 | prose | J |
| P-438b | prose | OS-21 (OS-10 Done for migrations) |
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
| P-622, P-623 | prose (B193, B194) | OS-28 |
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

Not yet written (OS-PM writes it here at 45% context: done, in flight, next).
