---
name: pulse
description: The founder's on-demand pipeline report from the tech lead, in chat only - proven today against ten a day, the one constraint (Theory of Constraints) with five whys, stages, waves, lanes, manual browser unblocks (P-752, P-757, P-758), resources, risks and one recommendation, in a fixed order with every number from a tool. Use when the founder types /pulse or asks "how are we doing", "full report", "where are we" or "progress report". The 30-minute check stays lead-watch.
---

# Pulse: the founder's full pipeline report (founder, 20 Nov)

Run by the tech lead only (`lead` skill guard). The target: **ten capabilities proven a day** (R1 items at Works in `qa/CAPABILITIES.md`, confirmed by qa, P-290), quality never lowered (P-303); Release 1 has 101 items, the core (Waves 1-2) is due 29 Nov (P-746). lead-watch gives three to five lines every 30 minutes; pulse is the long report, same evidence rules.

## Rules
* **Every number from a tool output or an exit code**, never from a lane's prose, STATE or memory (P-228 (9)). A tool that fails is shown as "unreadable (<tool> exit N)", never estimated.
* **IST times read from the clock** (`TZ=Asia/Kolkata date`, P-302); forecasts as IST clock times, not "in 3 hours".
* **Plain business words**; every code carries its purpose beside it: "R1.38 (staff Bookings calendar)", "P-757 (check fixes merged in the browser)", "#2322 (calendar part 1)".
* **In chat only.** No report file, no artifact, no doc. The only writes are the tools' own state (app-view-save.sh) and the actions in step 2.
* Keep it readable: tables where listed, one line per item elsewhere; no raw tool dumps.

## 1. Gather everything first (one round, in parallel where possible)
Short names below are under `ai-workers/problem-1-pathway-setup-and-form-filling/` (`product/tools/...`).
1. `get_usage` on yourself and on each running Mac session (weekly plan %, extra usage, context share).
2. `bash product/tools/lead-watch.sh 180` (disk, test databases, merges in 3 h, queue, runs waiting for a machine, lanes that pushed, the "four" line, needs-Lead queue; exit = ACT lines).
3. `python3 -I product/tools/waves.py active`, `waves.py wip` (building against cap 8, Built-not-Proven against cap 12; exit = breaches), `waves.py gen --stdout` (every wave, item by item, with status).
4. `python3 -I product/tools/flow-measure.py --since <00:00 IST today as UTC>` (thrown-away machine hours, batch failures, records share, approved-to-merged).
5. The app view: `product/tools/app-view.js` in the built-in browser on claude.ai/code (signed in, with "Show more" expanded so no lane is hidden), saved with `app-view-save.sh`, then `bash product/tools/app-view-check.sh` (exit = flags).
6. Open PRs and merge-queue batches through the REST API, as lead-watch does (`bash product/tools/gh.sh api`): each open PR's labels, draft state, head age, last push, `ci` result, reviewer "Approve <head>" comment; batches = open PRs on `mergify/` branches with their check runs; runners online from `gh.sh api repos/<owner>/<repo>/actions/runners` (refused = "runners unreadable"); github.com in the built-in browser when the API is refused (P-758 (3)).
7. Proven counts from git: R1 rows at Works on `origin/main` now, on the last main commit before 00:00 IST (`git rev-list -1 --before=<today>T00:00:00+05:30 origin/main`) and on the last one before 24 h ago (the rate): column 4 of `qa/CAPABILITIES.md` (`awk -F'|' '$2~/^ R1\.[0-9]+ $/ && $5~/^ Works /'`). The "four" line counts milestone C rows: never use it for Proven.

## 2. Act on what is safe inside the rules, then report
Before writing a word: act on each ACT line (lead-watch, waves wip, app-view-check) that the rules allow now: relabel a dequeued PR whose full run is green with "Batch failures covered: <run>: <every failed suite of that batch run>" (P-731 (2)); add `review: approved` or Ready for review after your read when the shell is refused (P-752, in the built-in browser); after your P-423 read, merge a check-only fix with the reviewer's or the Lead's Approve and green `ci` (tests, CI, Mergify, guard tools; no product code) on github.com the same check when checks hold the queue (P-757, P-758 (1)); answer a lane's prompt only inside its brief (P-758 (3)); "continue" plus its next step to a lane quiet 90 min with work left. Never: product code outside the queue, a stand-in for the reviewer's Approve, a settings, permission, spend or delete step, or a shell refusal routed around (P-504).

## 3. The reply, in this order (headings exactly as numbered)
**(1) Headline**: "Proven today N of 10 · total T of 101 · core (Waves 1-2) X of Y · forecast: 10 today by HH:MM IST (or not today: N by 23:59 IST), core by <date HH:MM IST> · on track: yes/no". Forecast from the measured rate (Proven in the last 24 h and since 00:00 IST), never a hoped rate; say which rate you used.

**(2) 🔴 Needs you** (what, where, what stops; "nothing" when empty) then **🟡 Decide when you can**; each item ends "Recommend: ...". Every 🔴 item is also the end-of-turn box's question (P-478).

**(3) Stages**, one table, rows in flow order:

| Stage | Items | Oldest wait | Done in last 3 h | Healthy |
|---|---|---|---|---|
| Shaped-ready, next wave ("1+1 ahead": active wave building, next wave shaped) | | | | |
| Building (open non-draft PRs and lanes on an item; cap 8) | | | | |
| Approve (green `ci`, waiting for the reviewer's Approve or the Lead read, P-423) | | | | |
| Merge queue (approved, queued, dequeued; batches; approved-to-merged target under 1 h) | | | | |
| Machines (runs waiting under 6 h, runners, batch failures target under 10%) | | | | |
| qa proof (merged, Built-not-Proven; cap 12) | | | | |

Healthy = yes/no against the cap or target named in the row. Then one line: **"The constraint today is <stage> because <numbers>"**: the stage with the longest oldest wait and the pile in front of it while the stage after it starves (Theory of Constraints: only that stage's throughput sets proven per day).

**(4) Five whys on the gap to target** (10 minus proven today): Why 1 ... Why 5, each one line with its evidence (a PR, a run id, a count, a time). End with "Fix: ... · Owner: <role> · by HH:MM IST".

**(5) Waves**: the active wave item by item (R1 id and purpose, owner lane, PR, state: shaping, building, approve, queue, merged, qa, Proven); next wave readiness (items shaped of total, what is missing); WIP: building N of 8, Built-not-Proven N of 12, any item outside the open waves.

**(6) Lanes** from the app view: one line each: lane title, item, last push (IST), waiting / failed / quiet / ok, and what you did about it.

**(7) Manual unblocks**: done this time in the built-in browser under P-752 (labels, Ready for review, reopen), P-757 and P-758 (check-only merges, lane prompts), each with PR, time and why; then any still possible without lowering quality, or "none".

**(8) Resources**: weekly plan % and burn per hour, with the IST times it reaches 96% and 98% (P-458) at that burn; extra usage on or off; your context against 200k beyond your start read (P-446) and the hand-over plan; each Mac session's context share; disk free and test databases; runners online; standbys (two expected, P-286).

**(9) Risks and mitigations**: at most five, each "risk → what it would cost (items, hours, date) → mitigation, owner".

**(10) One recommendation** and what the founder can do now (a typed "go", a decision, a sign-in, nothing).

## After the reply
If the founder answers, record the ask in STATE "Founder asks" as the `lead` skill says. Pulse itself never edits records.
