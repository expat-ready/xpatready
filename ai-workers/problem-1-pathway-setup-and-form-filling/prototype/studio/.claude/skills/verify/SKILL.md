---
name: verify
description: Prove an app-code change works in the running Studio before it is committed - walk only the journeys the change touches on the builder's own isolated copy, live AI off, at most 3 fix rounds, then put the evidence on the pull request. Runs before each app-code commit in a builder copy (never for docs, records or tests-only commits). Trial (OS-72, P-717 (b)) - only on lanes listed in lanes.txt beside this file.
---

# verify - the builder's own check before a commit (OS-72)

Design: `product/design/self-checking-builders-2026-11-25.md` (founder, 25 Nov). It is the early catch. CI's gates A and B
still decide the merge; nothing here replaces them, labels anything or blocks anything (warning only, P-717 (b)).
Paths below are from `prototype/studio/` (S) and `product/` (P).

## 0. Should it run?
1. `bash P/tools/lane.sh whoami` prints the lane. Run only when that name is a line (not a `#` comment) of `S/.claude/skills/verify/lanes.txt`
   (the trial lanes the Lead names); otherwise say "verify: not on for this lane (trial)" and stop. Never in the Lead's copy.
2. `bash S/tools/verify-plan.sh --port <yours>` (a free port 4000-4999, never 4400; one per lane, e.g. 4691 screens,
   4692 forms, 4693 runtime, 4694 evidence). It reads the change since origin/main (commits, staged, unstaged, new files).
   * `CAPS` empty ("records only", "no acceptance pack reads them"): say so in one line and commit; verify is done.
   * exit 2: the plan could not be made. Say why on the PR and commit anyway; CI's gate B still runs (never guess a set).

## 1. Walk the touched journeys (about 5 minutes; stop at 10)
Start the clock. Run the `RUN` line the plan printed, as printed. It is gate B on fresh isolated copies of this branch
(`tools/isolated.sh`, own database, own port, removed after the run; demo data or the pack's own fixture; US$0).
Before it: `unset STUDIO_AI_LIVE STUDIO_PEOPLE_AI_LIVE` (live AI stays off, P-175). For each `ALSO <file>` line, run that
browser test by the run line at its top, on its own copy, started and stopped in the same command.

## 2. The five checks (phase 1: what is built today)
| Check | How it is read now | When it is full |
| --- | --- | --- |
| Journeys pass | the packs' PASS/FAIL lines and exit codes | now |
| No console errors, no axe violations | page errors the packs' walker collects (`acceptance/lib/browser.ts`); axe in the browser tests that run it | now, where the test checks them |
| Loads in 2.5 s, layout shift under 0.1 | OS-73 adds the counters to the packs and to this line | after OS-73 merges |
| Screenshot matches the reference | not yet | OS-74 (phase 2) |
| Data saved exactly once | the packs' own database checks | now, where the pack checks it |

Say "not checked yet" for a row that is not built; never claim it passed.

## 3. A failure
Fix the cause in the app (never the pack, never a skip), then run step 1 again. At most 3 rounds in all. After the third
red round: commit nothing that claims the fix; write on the PR what still fails, the round count and the last FAIL lines,
and ask the Lead under "Question for the tech lead".

## 4. Evidence (the trial's numbers)
After a pass, commit as usual, then add one line to the PR (a comment; through the GitHub connector when gh is refused):
`Verify: <CAPS> · PASS · <minutes> min · round <n>/3 · checks: journeys, console/axe, saved-once (speed, screenshots: not yet)`
After a stop at round 3: the same line with `FAIL`. The Lead reads these lines for the 27 Nov 12:00 IST decision
(minutes per commit, red runs avoided).

## Never
* :4400 or the demo database; a copy left running (start and stop in one command; `--ttl` caps it).
* Live AI, paid runs, or editing a pack, a fixture or a check to make it pass.
* Skipping verify silently: when it does not run, the PR line says why.
