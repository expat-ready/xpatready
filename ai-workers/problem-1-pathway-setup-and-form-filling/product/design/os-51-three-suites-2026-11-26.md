# OS-51 — check_forms_qa53, check_pf24w_environment, check_csw3_firm_scope: why they turned batches red (26 Nov 2026)

Lane OS-51 (P-214). Asked: make these three suites reliable, the most frequent failing suites in 40 red merge-queue logs
(qa53 5, pf24w 4, csw3 4). Finding: **none of the three is flaky.** Each red was the suite catching a real defect in a
PR inside the batch. Every one of those PRs fixed its defect before it merged. Nothing in the three suites or in the
code they check needs fixing, and quarantining them would hide true catches (P-502: no hit-and-trial; nothing changed
without a cause).

## Evidence: 16 failing logs from merge-queue runs (ci.yml shards, 24–25 Nov)

Logs read through the GitHub API (job logs of every failed shard in 25 failed Mergify batch runs, 23–25 Nov). Every row
below is `failed twice`: the retry (a fresh copy, `run-suites.sh --retry`) failed on the same assertion, word for word.
No row was `passed on retry`. No timeout, port, `ECONNREFUSED`, socket or fixture error appears in any excerpt.

| Suite | Runs (job) | The assertion that failed, every time | The PR's change it caught | Fixed in the PR before merge |
|---|---|---|---|---|
| check_forms_qa53.ts | 45473320842 (138729452939), 45475049535, 45479027445 (24 Nov) | QA-53 every configuration read refuses nobody (401)…: `/api/public/booking-site`, `/api/public/firms/:firmKey/book…` answered 404 to nobody; QA-65 every other write names its person: the booking public writes | #3544 (PF-28 A2): an `@OpenRead("… (QA-756)") @Get(…)` reason with parentheses, which the suite's route scan did not read as a mark, and new public booking writes not on the reviewed list | yes: ba5a294d6 "the batch's check_forms_qa53: the @-form open reads and public writes read as reviewed"; merged 504da4f7b |
| check_forms_qa53.ts | 45605471392, 45607401238, 45609322277, 45609512433 (#3647 alone), 45609517449 (25 Nov 11:33–12:0x Z) | the same two lines: `/api/portal/me`, `/api/portal/cases`, `/api/portal/cases/:id` 401 to everyone; `/api/portal/session/local`, `/api/portal/session/end` writes without a named person | #3647 (R1.62 PF-4p part 1): the new client plane `/api/portal/*`, not yet in the QA-53/65 sweep | yes: b5df9272 on #3647 "/api/portal in the QA-53/65 sweep like /api/system (check_forms_qa53)" (still open; its later pr-suites runs are green) |
| check_pf24w_environment.ts | 45458193502 (138676073902), 45461148879, 45461855550, 45462968776 (24 Nov 18:19–18:45 Z) | PF-24w J-15 W1: each setting is read exactly once at start: `PLATFORM_ENVIRONMENT=2`, the second read's stack `features/front-office-signing.ts:42 → appEnv() → platformConfig()` at module load | the FO-6 part 4c change read PLATFORM_ENVIRONMENT a second time, outside PF-24's one loader (a real PF-24w breach: "read once per process") | yes: df81a0b48 "the signing feature reads PLATFORM_ENVIRONMENT through the loader (PF-24w)" |
| check_csw3_firm_scope.ts | 45558737098 (139018777273, #3642 alone), 45561352698, 45561395559 (25 Nov 06:11–07:31 Z) | CS-W3 census: every case-side file that queries a case table is on the allow-list: `api/src/case-reports.ts` is not | #3642 (R1.79 CS-R1): a new case-side file querying case tables, not on the census allow-list | yes: #3642 itself edits tests/check_csw3_firm_scope.ts; merged ff177d524 |
| check_csw3_firm_scope.ts | 45568769194 (139051784199, #3649) | the same census line: `api/src/case-notes/timeline.ts` | #3649: the same rule, a new case-notes file | not checked here (#3649's later history not read) |

Raw excerpts (each shard's full run-suites section, both tries, log tail, shard table) were kept in the session's
scratch folder; the run and job ids above open them on GitHub.

## Why real catches reached the queue at all

The PR-side check could see each of these: for #3544, #3642 and #3647's diffs, `module-suites.py` (the PR pick, SPD-2)
picks check_forms_qa53, check_pf24w_environment and check_csw3_firm_scope (checked on this branch with each PR's diff).
But until 25 Nov the PR's suites were report only (P-651 (2), E2): a red suite left the run green. Example: #3647's
pr-suites run 45558258285 on head caadabf (25 Nov 06:07Z) ended `success` while three of its parts ran their
"logs (only when a suite failed)" step. P-822 made pr-suites required at the label (queue-gate.sh `suites()`, a
check run named `pr-suites` green on the exact head), blocking from 357b3ebcf (25 Nov 06:37Z). Every red above is from
a PR labelled while the check was report-only or warn-only.

**Since then:** of 29 Mergify batch runs started 25 Nov 12:30Z – 26 Nov 06:19Z, 22 green, 7 red; none of the 7 has a
row of these three suites (their causes: a migration stamp, the pf8b migration suites with b164, pf21rs_browser,
fo9b_merge, fo1a_sales_schema). Only failed shards were read, so a `passed on retry` row in a green shard is not ruled
out; the flaky ledger names none of the three.

Unconfirmed: whether the #3647 batches at 11:33–12:0x Z on 25 Nov (after the block) came from a label applied before
06:37Z that the gate did not re-read. If so it was a one-time carry-over; if the gate can still pass a label on a
head whose pr-suites is red, that is a queue-gate gap for its owner, not a suite defect.

## Stable on main: 20 consecutive passes each (scratch copy, commit 220f82567)

`run-suites.sh --only <suite>` 20 times in a row in a fresh cloud copy (cloud-setup.sh; each run its own isolated
copy, as CI):

(running: results land here in the next commit)

## What would actually lower the red-batch rate

These three suites are not the lever: their reds stopped when P-822 started blocking. The 7 reds since are other
suites (listed above); this lane did not root-cause them. check_pf21rs_browser failed twice in run 45657589444 although
run-suites.sh's QUARANTINE names it, which is worth its own look.
