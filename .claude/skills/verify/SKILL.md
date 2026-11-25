---
name: verify
description: Prove a Pathway Configurator app-code change works in the running Studio before it is committed - walk the nearest capabilities the change touches through gate B on the lane's own isolated copy, on CI's scoring data, live AI off, at most 3 fix rounds, then one evidence line on the pull request. Runs before each app-code commit in a builder copy; never for docs, records or tests-only commits. Trial (OS-72, P-717 (b)) - only on lanes listed in lanes.txt beside this file.
---

# verify - the builder's own check before a commit (OS-72)

Design: product/design/self-checking-builders-2026-11-25.md (founder, 25 Nov; records PR
#3711). It is the early catch: CI's gates A and B still decide the merge. Nothing here labels or blocks
(warning only, P-717 (b)). S = `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio`,
P = `ai-workers/problem-1-pathway-setup-and-form-filling/product`.

## 0. Should it run?
1. `bash P/tools/lane.sh whoami` names the lane. Go on only when that name is a line (not a `#` comment) of
   `.claude/skills/verify/lanes.txt` (the trial lanes the Lead names; no line or no file: off). Never in the Lead's copy.
2. `bash S/tools/verify-plan.sh --lane <lane>`. It reads the change since origin/main (commits, staged, unstaged, new).
   * `CAPS` empty (records, notes, tests only, or no pack reads it): add `Verify: <sha> · skipped — <its reason>` to the
     PR (step 4) and commit; done.
   * exit 2: the plan could not be made. `Verify: <sha> · skipped — <its line>` on the PR and commit; CI still runs.

## 1. Walk the nearest touched capabilities (about 5 minutes; stop at 10)
Note the time. `unset STUDIO_AI_LIVE STUDIO_PEOPLE_AI_LIVE` (live AI off, P-175), then run the `RUN` line as printed:
gate B on fresh isolated copies of this branch, on the lane's own port (never :4400), each row on the data CI scores it on.
At most 4 capabilities run (nearest first); `LEFT` rows are CI's. For each `ALSO <file>`, run that browser test by the run
line at its top, its copy started and stopped in the same command. Past 10 minutes: stop the run (its copies stop
themselves, `--ttl`) and report the minutes; the trial counts it.

## 2. The five checks (phase 1: what is built today)
| Check | Read from | Full when |
| --- | --- | --- |
| Journeys pass | the packs' PASS/FAIL lines and exit codes | now |
| No console errors, no axe violations | page errors the packs' walker collects (`S/acceptance/lib/browser.ts`); axe in the browser tests that run it | now, where the test checks them |
| Loads in 2.5 s, layout shift under 0.1 | OS-73 adds the counters | after OS-73 merges |
| Screenshot matches the reference | not yet | OS-74 (phase 2) |
| Data saved exactly once | the packs' own database checks | now, where the pack checks it |

Write "not checked yet" for a row not built; never "passed".

## 3. A failure
Fix the cause in the app (never the pack, a fixture or a check), then run step 1 again: at most 3 verify runs per commit.
After the third red run, still commit and push the work in progress (P-557) with a message that claims no fix, and ask
the Lead on the PR under "Question for the tech lead" with the last FAIL lines.

## 4. Evidence (the trial's numbers)
One PR comment per commit (the GitHub connector when gh is refused):
`Verify: <short sha> · <PASS|FAIL> · CAPS <ids> (+<n> left to CI) · ALSO <n> · <minutes> min · run <k>/3 · checks: journeys, console/axe, saved-once (speed, screenshots: not yet)`
The Lead reads these for the 27 Nov 12:00 IST decision: minutes per commit, red CI runs avoided.

## Never
* :4400, the demo database, another lane's port, or a copy left running.
* Live AI, paid runs, or editing a pack, a fixture or a check to make it pass.
* Skipping silently: a commit with no `Verify:` line on a trial lane is a gap the Lead asks about.
