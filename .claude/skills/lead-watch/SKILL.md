---
name: lead-watch
description: The tech lead's 30-minute check for the Pathway Configurator - resources (weekly plan, context, disk, test databases), merges and the queue, every lane and session, questions, paid runs - judged against the plan with quality first and the fewest tokens. Use on every scheduled check, when the founder asks "all ok?", "are resources fine?", how close a milestone is, or for the full report ("full report", "/lead-watch full", "how are we doing").
---

# Lead watch: is the plan on track, at full quality, for the fewest tokens?

The outcome, in this order (founder, 3 Nov): **quality first** (P-303), **complete** (every capability confirmed by an independent test, P-290), **on time** (the milestone dates), **tokens second only to those** (never a cheaper model or a skipped check to save them). Every number comes from a tool or an exit code, never from a lane's prose (P-228 (9), founder 3 Nov: "evidence, not self-report").

## Each check: three calls, then act
1. `get_usage` (weekly plan %, extra usage, your context) · `bash product/tools/lead-watch.sh 30` (disk, test databases, merges, queue, questions, lanes that pushed; exit = lines to act on) · `list_sessions` only when a lane looks quiet.
2. Act on every `ACT` line in this check. Do not re-read STATE, BACKLOG or DECISIONS on a check; read them only when a ruling needs them.
3. Tell the founder three to five plain lines in IST (P-302), only what changed, and only a decision, risk or spend unasked. **Open with "🔴 Needs you"** (what, where, what stops; "nothing" when empty), then "🟡 Decide when you can"; every 🔴 item is also the end-of-turn box's question (P-478).

## The app view and the ETA board (founder, 4 Nov, P-338, P-339)
* **App view, every check (P-326):** one script read of claude.ai/code statuses in the built-in browser (Awaiting input, Failed, Merge conflicts, quiet over 90 min), plus `list_sessions include_archived` for any lane archived with work left (restore and brief it). Open a lane only when flagged; confirm its URL and title before typing or clicking; the list re-sorts, so never click by an old position.
* **Prompts in a lane:** the founder approves the Lead answering a lane's question or permission prompt in claude.ai only when the action is inside that lane's brief and the rules (no spend over the cap, no settings or permission change, no delete, no label the rules forbid). Anything else, or a product preference, goes to the founder at once.
* **Escalate at once:** any lane blocked on the founder gets one line to him with a recommendation; when the 10-message cap is reached, ask him to type "go".
* **ETA board in every report:** 3–6 capabilities next to reach Works (qa-confirmed), each with an IST time and the one step it waits on, and whether the last estimate was on time or late by N minutes and why; built only from this check's own data.

## Full report (when the founder says "full report", "/lead-watch full" or "how are we doing")
Run the same check, plus `waves.py active`, `wip` and `gen --stdout`, `flow-measure.py --since <00:00 IST as UTC>`, the app view with "Show more" expanded, open PRs, `mergify/` batches and runners (`gh.sh api .../actions/runners`). **Act first** (Unblock playbook), then reply **in chat only** (no file), every number from a tool. Proven = R1 rows at Works in `qa/CAPABILITIES.md` on `origin/main`, now, at 00:00 IST and 24 h ago (never the "four" line, which counts C rows). Codes carry their purpose: "R1.38 (staff Bookings calendar)".
1. **Headline:** proven today N of 10 · total T of 101 · forecast in IST at the measured 24 h rate · on track yes/no.
2. **🔴 Needs you / 🟡 Decide when you can**, each with "Recommend: ...".
3. **Stage table** (Shaped-ready next wave "1+1 ahead" · Building, cap 8 · Approve · Merge queue · Machines · qa proof, cap 12) with columns items, oldest wait, done in last 3 h, healthy; then "The constraint today is ___ because ___" with numbers (the stage with the longest wait and the pile in front of it).
4. **Five whys** on the gap to 10, each step with evidence (PR, run, count, time), ending "Fix · Owner · by HH:MM IST".
5. **Waves:** active wave item by item (owner, PR, state), next wave readiness, WIP against caps 8 and 12.
6. **Lanes** from the app view: item, last push (IST), waiting / failed / quiet / ok.
7. **Manual unblocks** done this time (PR, time, rule) and any still possible without lowering quality.
8. **Resources:** weekly %, burn per hour, IST times of 96% and 98%; your context and hand-over; disk; runners; standbys.
9. **Risks and mitigations**, at most five, each with its cost and owner.
10. **One recommendation**, and what the founder can do now.

## Unblock playbook (each line points to its rule)
1. Dequeued after a failed batch: the "Batch failures covered" line for every failed suite, then relabel (P-731).
2. A PR stuck in the queue: a bare `@mergifyio requeue` comment.
3. pr-rules ran before a DECISIONS row reached main: `tools/lead-pr.sh reopen <n>`.
4. Check-only fixes holding the queue: merge them in the built-in browser at the first check (P-757, P-758); a shell refusal is never retried (P-504).
5. Labels, Ready for review, reopen refused in the shell: do them in the built-in browser (P-752).
6. claude.ai prompt box: click its ref, check the focus and that the text appears once, press Return, confirm the bubble.
7. Cloud starts carry Model and effort (P-608), a Duplicate check and a Done when naming its test; on a classifier refusal leave a card.
8. After every start, check the app view for duplicate sessions.
9. Read the failed log before any re-run; failures outside the PR's code are covered, never forced.
10. The Lead posts `/run full` for lanes (their comments are defused, P-751).
11. Proactive: unowned active-wave items get lanes or cards every check; use the founder's resources: browser authority (P-758) and the reset credit he applies at 98% weekly (founder 20 Nov, STATE).
12. Judge by proven, never by merges.

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
One script call instead of many `gh` calls; messages only when something changed; no re-reading big files on checks; Sonnet only for mechanical work (finding files, running suites, reading exit codes).
