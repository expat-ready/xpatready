# A Lead never works from a stale copy: design (A363)
Lead O 2 for Lead 26, 24 Nov 2026, 14:5x IST. Design only; nothing built. Read-only, US$0.

## What was measured (main 649fae886, lead branch as fetched at 14:53 IST)
* The lead branch is **2782 commits ahead of main and 6374 behind**; a test merge stops on **54 conflicts** (records, tools, skills). "Merge main" is therefore no quick fix.
* Product/tools: 153 files only on main, 2 only on the branch, 46 differ.
* **cycle-plan.json is not on the lead branch at all; the 21 Nov one is main's** (last changed 21 Nov 11:20 UTC). So running main's tools does not refresh it: the Lead's plan edits have nowhere to land. This corrects the row's wording.
* **The skills (lead-watch, lead) and .claude/settings.json on the branch are old too** (settings differ by 38 lines). A session loads its skills and hooks from its own copy, so a rule in main's skill, and a new hook, do not reach this Lead. Any fix inside lead-watch.sh has the same hole: the old one is what gets typed.
* **Speed.** My earlier trial on a loaded Mac: main's lead-watch 12 min 52 s, the branch's 5 min 15 s. The fix makes the check slower unless it is also cut, and the check runs every 10 minutes.
* One `gh.sh` read, 12 tries each, interleaved, load 16 to 24: today median 2.23 s (mean 2.48), always curl 1.73 (1.83), always curl with the token read once 1.12 (1.58). At 60 to 93 reads that is about **0.9 to 1.7 min saved (median difference), not the whole 6 min**; the rest is not traced. Noisy: one machine, loaded.

## Design
**(1) `lead-run.sh`: main's tools, always.** Fetches main; puts product/tools of that sha (3.4 MB by my `git archive`; the Lead's sparse trial 9 MB) into a folder named by the sha, by `git archive`, complete before it is renamed into place; keeps the newest three, names the rest, deletes nothing. Runs the tool asked for there. **Records stay the Lead's:** today tools find STATE, items.json and the boards beside themselves (`$TOOLS/..`), so a run from a scratch folder would read and write the wrong ones. The run folder therefore links the Lead's own STATE.md and state/ and takes the rest (tools, DECISIONS, CAPABILITIES, design boards, cycle-plan) from main. Which boards are the Lead's is question 1.
**The way in must not live in the stale copy.** The line to type works from any copy, with no file of ours:
`git fetch -q origin main && git show origin/main:<product>/tools/lead-run.sh | bash -s -- lead-watch.sh 30`
A failed fetch stops here: nothing is run from old tools under a new name. takeover.sh, founder-report.py and the standby's `lead-watch.sh gap` go through the same line (gap without a fetch: it must not touch the network).
**(2) First line of every check:** `tools  main 649fae886, committed 14:41 IST (12 min old), is main's head: yes`. When lead-watch.sh, takeover.sh or founder-report.py are not started by lead-run.sh, or their folder's files do not hash to main's head: `ACT tools: stale ...` first, and founder-report.py prints no report and exits 2. Main moving during a check is not stale: the sha is compared with the head fetched at that check's start, at most 10 min old.
Limit: an old copy without this code still runs. Only a hook stops that (below).
**(3) cycle-plan.json:** `cycle_start` older than the cycle now (07:00 to 07:00 IST) is the first ACT, and founder-report.py prints "plan of <date>" in red in its header instead of a forecast. Unreadable or missing file: same ACT.
**(4) The report at :03 and :33.** `founder-report.py` saves what it printed (time, sha, blocks). lead-watch reads that **and** the Lead's transcript (last assistant texts, by the current_lead id): ACT when no six-block full report in the 15 minutes after a :03 or :33 since the last check.
Sees: whether the script ran, whether its block headings, in order, are in what the Lead wrote. Cannot see: whether the founder read it, whether the numbers were edited, a Lead on another machine or in the cloud (no transcript: "not seen", never "ok"); it is after the fact.
**(5) Speed, same PR or its own:** gh.sh tries gh once per run; after a TLS failure a run flag (as GH_TLS_NOTE_ONCE today) sends later reads straight to curl, and lead-watch reads the token once into the environment (as it does for FLOW_TOKEN today). Each step also prints its seconds, so the rest of the 6 min is named before anything else is cut (P-502).

## Files, cost
New: lead-run.sh, fresh-tools.py (2, 3), report-watch.py (4), one check file each. Changed: lead-watch.sh, takeover.sh, founder-report.py, gh.sh, check-guards.sh. Three PRs: A (1, 2, 3), B (4), C (5). Estimate, not measured: A one day, B half, C half. No app code, migration, vendor or spend.
**Red tests on today's code:** a copy with one old tool file: today runs silently; a report from it: today printed; fetch failing: must run nothing; plan of 21 Nov: today no ACT; plan of today: none; :03 passed with no report, with five blocks, with blocks out of order, with no transcript; ten reads after a TLS failure: today ten gh tries, then one. Each rule has a mutation row.

## What a hook would need from the founder (settings are theirs)
The only thing that stops a typed old command is a **PreToolUse hook on Bash** in the Lead's copy refusing `lead-watch.sh`, `takeover.sh` and `founder-report.py` unless run through the line above; for (4), the Stop hook that exists (`stop-check.sh`) could refuse to end a :03 or :33 turn without the six blocks. Both need the founder's yes to a .claude/settings.json or hook change, **and** the Lead's copy must then carry that settings file: today it loads the branch's. The hook's command must also read main's script, or it goes stale the same way.

## The root cause, and the recommendation
The cause is one long-lived branch that keeps records and code together. (1) to (4) treat the symptom for tools; skills and hooks stay old. The cure is a new lead branch cut from main's head at a hand-over, with only the Lead's records copied on (STATE, RULES, DECISIONS rows, items, history), the old branch kept as history. That is the Lead's and founder's move (records); I make none.
**Recommend:** PR A then C, then B; decide the new branch at the next hand-over.

## Questions for the Lead
1. Boards (design/board-lead-*.md), DECISIONS and cycle-plan: main's copy or yours when they differ? My default: main's, with a line naming each that differs.
2. Where do you edit cycle-plan.json, given it exists only on main? Default: a small PR each cycle.
3. Settings and the new branch go to the founder through you: yes or no?
