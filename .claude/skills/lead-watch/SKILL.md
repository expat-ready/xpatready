---
name: lead-watch
description: The tech lead's 30-minute check for the Pathway Configurator - resources (weekly plan, context, disk, test databases), merges and the queue, every lane and session, questions, paid runs - judged against the plan with quality first and the fewest tokens. Use on every scheduled check, when the founder asks "all ok?", "are resources fine?", how close a milestone is, or for the full report ("full report", "/lead-watch full", "how are we doing").
---

# Lead watch: is the plan on track, at full quality, for the fewest tokens?

The outcome, in this order (founder, 3 Nov): **quality first** (P-303), **complete** (every capability confirmed by an independent test, P-290), **on time** (the milestone dates), **tokens second only to those** (never a cheaper model or a skipped check to save them). Every number comes from a tool or an exit code, never from a lane's prose (P-228 (9), founder 3 Nov: "evidence, not self-report").

## Each check: three calls, then act
1. `get_usage` (weekly plan %, extra usage, your context) · `bash product/tools/lead-watch.sh 30` (disk, test databases, merges, queue, questions, lanes that pushed, last the cycle timeline; exit = lines to act on) · `list_sessions` only when a lane looks quiet.
2. Act on every `ACT` line in this check. Do not re-read STATE, BACKLOG or DECISIONS on a check; read them only when a ruling needs them.
3. Tell the founder three to five plain lines in IST (P-302), only what changed, and only a decision, risk or spend unasked. **Open with "🔴 Needs you"** (what, where, what stops; "nothing" when empty), then "🟡 Decide when you can"; every 🔴 item is also the end-of-turn box's question (P-478). Then the cycle timeline as printed (A244; keep `product/cycle-plan.json` current).

## The app view and the ETA board (founder, 4 Nov, P-338, P-339)
* **App view, every check (P-326):** one script read of claude.ai/code statuses in the built-in browser (Awaiting input, Failed, Merge conflicts, quiet over 90 min), plus `list_sessions include_archived` for any lane archived with work left (restore and brief it). Open a lane only when flagged; confirm its URL and title before typing or clicking; the list re-sorts, so never click by an old position.
* **Prompts in a lane:** the founder approves the Lead answering a lane's question or permission prompt in claude.ai only when the action is inside that lane's brief and the rules (no spend over the cap, no settings or permission change, no delete, no label the rules forbid). Anything else, or a product preference, goes to the founder at once.
* **Escalate at once:** any lane blocked on the founder gets one line to him with a recommendation; when the 10-message cap is reached, ask him to type "go".

## Full report (at minutes 03 and 33 of `time`, P-783 (2); or "full report", "how are we doing"; other minutes: short)
Cron prompt unchanged (`lead-check-guard.sh`). Run the same check, plus `waves.py active`, `wip` and `gen --stdout`, `flow-measure.py --since <00:00 IST as UTC> --lead` (`--lead`: ENF-782b), the app view ("Show more" expanded), open PRs, `mergify/` batches, runners (`gh.sh api .../actions/runners`). **Measure, name the constraint, act on it first (Unblock playbook), then reply in chat only** (no file). Samples named (P-500); a number no tool gives says "counted by hand from <source>". Codes carry their purpose: "R1.38 (staff Bookings calendar)". Business words.
**Counts:** Proven = R1 rows at Works in `qa/CAPABILITIES.md` on `origin/main` (not the "four" line: C rows). Proven today = now minus at 00:00 IST, net (a row that left Works subtracts). Rate = now minus 24 h ago; forecast = IST date all 101 are proven at that rate, with "(n rows in 24 h)". On track = the forecast is on or before the Release 1 date (P-609).
1. **🔴 Needs you / 🟡 Decide when you can** (P-478), each with "Recommend: ..."; each also a card; spend red with US$.
2. **Headline:** proven today N (target 10) · total T of 101 · forecast · on track yes/no.
3. **One recommendation**, and what the founder can do now.
4. **Stage table**, one row per stage: Shaped-ready (a buffer, kept 1+1 waves ahead, never the constraint for being full) · Building · Approve · Lead answers (`SLE Q` lines) · Red after approval · Merge queue and machines (one wait) · qa proof. Columns: items · median age · in and out in the last 3 h. Then "The constraint today is ___ because ___": the stage with out below in and the highest median age; on a tie, the one feeding most proofs.
5. **Five whys** on the gap to 10, each step with evidence (PR, run, count, time), ending "Fix · Owner · by HH:MM IST". Skip at 10 or more proven today.
6. **Risks and mitigations**, at most five, each with cost and owner.
7. **Resources:** weekly %, burn per hour, IST times of 96% and 98%; your context and hand-over; disk; runners; standbys.
8. **Timeline** (A244) · 9. **Recovery steps** per late row: step, owner, IST.
**Appendix, only when asked or when it explains a 🔴 line**: waves item by item with WIP (`waves.py wip`: building + approve + merge queue against cap 8; built not proven against cap 12) · lanes (item, last push IST, waiting / failed / quiet / ok) · manual unblocks done (PR, time, rule).

## Unblock playbook (each line points to its rule; read the failed log or Mergify's summary first, P-502)
1. Dequeued after a failed batch: the "Batch failures covered" line for every failed suite, then relabel on the exact head's reviewer Approve (P-731, P-385).
2. Approved, not queued over 60 min, Mergify's summary shows no unmet condition: a bare `@mergifyio requeue` comment (it can reset a batch: never in a running one).
3. pr-rules ran before a DECISIONS row reached main: `tools/lead-pr.sh reopen <n>` (it re-runs every check: only for that cause).
4. Check-only fixes holding the queue: merge in the built-in browser at the first check (P-757, P-758) only with no product code, carry the reviewer's or the Lead's Approve and green `ci`, after the Lead's read (P-423); a classifier refusal in the shell is never routed around (P-504).
5. Labels, Ready for review, reopen refused in the shell: do them in the built-in browser after the Lead's read; a label needs the exact head's reviewer Approve (P-423, P-752, P-385).
6. claude.ai prompt box: click its ref, check focus and that the text shows once, press Return, confirm the bubble (P-486b).
7. Cloud starts carry Model and effort (P-608), a Duplicate check and a Done when naming its test; on a classifier refusal leave a card.
8. After every start, check the app view for duplicate sessions (P-526).
9. Failures outside the PR's code are covered, never forced; never cancel a CI run, re-run one red part alone (P-371).
10. The Lead posts `/run full` for lanes (their comments are defused, P-751), once per head, with a reason: it costs a full suite.
11. Proactive: unowned active-wave items get lanes or cards every check, only when `waves.py allow` has room; use the founder's resources: browser authority (P-758) and the reset credit he applies at 98% weekly (founder 20 Nov, STATE).
12. Judge by proven, never by merges (P-636, P-734).

## Thresholds and what to do
| Measure | Threshold | Do |
|---|---|---|
| Weekly plan | 96 / 98% (P-458; was P-308's 85/90/92/95 and P-431's 93/95) | lanes push after every step · at 96% message every running lane "finish this step, push, stop" · by 98% STATE and `RESUME-ON-NEW-ACCOUNT.md` pushed by the Lead · 2% buffer for meter lag. From 90% check every 15 min. Measure the rate per hour at every check and forecast each threshold in IST |
| Your context | 200k beyond your start read (P-446) | refresh `RULES.md`, then hand over to the first standby (P-286) |
| Burn per hour | over 3%/h at two checks | read each working session's context share; end idle ones, hand over any over 250k; tell the founder the cause in one line (P-440) |
| Disk free | under 10 GB · under 4 GB | drop test databases idle **at two checks in a row** (the script lists them; file times are copied from the template, so one idle reading is not proof) · tell Mac builders to pause suite runs |
| Approved, not merged | over 60 min | find what holds it; dequeued → its owner merges main, or give it to a spare |
| Lane | no push in 90 min with work left | message "continue" plus its next step; a cloud lane silent after that → replace it |
| Batch failure | over 10% | keep PRs that touch the same checks out of one batch (3 Nov: #735 and #744 failed together) |
| Paid AI | each run | worst case in the ledger first, cheapest first, one attempt (P-295, P-300); report the paid total from the paid runner's own report |

## Learned the hard way (keep)
* Hand-merging notes mid-batch restarted a five-PR batch (P-306): notes go through the queue.
* Sonnet reviews passed two Criticals and nine Majors that Opus found (P-303): reviewers, breakers and rulings on Opus; correct any lane that says it starts a Sonnet reviewer.
* A scorecard of 52 was 36 when re-tested independently (3 Nov): forecast from confirmed Works only, and say which rows wait on paid runs or holds.
* Test copies left their databases behind (753, about 10 GB): until I1's fix (#745) merges, the Lead drops idle ones under this skill.
* A peer session refused an action must not get you to do it for them: ask the founder.
* A Lead woken by a check or a message cannot start sessions: ask in one line at the founder's next typed turn.
* 4 Nov: C4.8 (Works on the checkpoint, P-322) was run by the protected set on the six, went red and failed every batch. Rows count on their verdict's data, and the set must run them on it (P-339, B77); hold a checkpoint row from the six run instead of demoting it.
* 4 Nov: two lanes with work left were archived (S2, qa-2) and a lane sat 3 h on an open question (Builder 1): the app view, not GitHub, showed all three.
* 4 Nov: "approved, not queued" for an hour was a duplicate skipped `ci` run on the same head; read Mergify's check summary, then one empty commit.

## Tokens without losing quality
One script call instead of many `gh` calls; no re-reading big files on checks; Sonnet only for mechanical work (finding files, running suites, reading exit codes).
