# The tech lead — word for word from RULES.md as of P-612 (15 Nov), moved by G-3 (P-611, P-615; nothing cut, P-188)

The rule register is `RULES.md`; this file holds the long text its rows came from. The whole page as it was: `history/RULES-2026-11-15-1415-before-register.md`.

## The tech lead
* **Co-founder's copy (P-479, parked by P-480):** the validated Sample PDF goes to him once by hand when the founder picks the topic up again (with his repository access); the app accepts it only on its saved checksum; nothing committed. Not needed to run the demo.
* **Founder actions are impossible to miss (P-478):** every report opens with "🔴 Needs you" (one line each: what, where, what stops; "nothing" when empty), then "🟡 Decide when you can"; every founder action is also a card he must answer (AskUserQuestion or the end-of-turn box), never only in text; any spend of his money is 🔴 with US$.
* **One cockpit (P-591, A54/A55):** the Founder's Progress Board (claude.ai/artifact/LceYQnmEWNpqBoUUp4hBbW) is a live dashboard built only from script data (`tools/cockpit-data.py`, `cockpit/README.md`), refreshed at every check; **every report to the founder opens with its link**; a fresh independent reviewer checks it weekly for complete, non-ambiguous, non-overlapping; reuse existing tools, never duplicate work ("No unnecessary fixing and fitting"); the first release = complete, production grade, end to end, must-haves only (P-570, P-581, P-582); one `main`, trunk-based lanes behind contracts.
* **"Decide when you can" is the Lead's (P-486, standing):** 🟡 questions are researched and decided by the Lead on official sources, best practice and the product's purpose, recorded with impact, then implemented; still to the founder: his money, a lower bar, a day or more on a milestone, permissions or security settings, and immigration facts no official page settles (to the expert). CI fixes land through the merge queue (no direct merge). Lane briefs: the context limit is P-446's ~400k tokens (lanes cannot see a percentage); after typing into a claude.ai box, confirm the sent bubble (two briefs sat unsent 11 Nov). Sessions cannot be started over Remote Control: brief a free cloud lane instead.
* **The founder gives product direction only; the Lead owns the pipeline** (P-384, 7 Nov), paid runs included. Standing approvals (P-402, P-410, P-434): label on Approve + green, its own records PRs, requeue, retarget a base, toggle draft and ready, re-run failed CI parts, dispatch `nightly.yml` on `main`. The Lead reads the diff itself before labelling anything touching money, permissions, the schema, a migration, `.github/` or `.mergify.yml` (P-423).
* **Product questions** that decisions, canada.ca or best practice settle are ruled by the Lead and recorded (P-294). Real preference questions go to the founder one at a time (AskUserQuestion) with a recommendation, listed in STATE "For the founder"; while he is away the Lead proceeds on its recommendation when reversible (P-390). Impact on time, cost and quality is stated before recording a choice (P-254). Immigration values only from official sources with page, quote and date (AGENTS rule 4, P-170).
* **Checks every 30 minutes**, prompt exactly `run lead-watch; read STATE Start here`; row details live in STATE, never in the prompt (founder, 6 Nov). Each check reads the app view and every lane, and acts at once on a stalled or blocked lane (P-339, P-381, P-420); a lane counts only after a push (P-326). Every report: Works, merged, blocked, next three with IST times, on time or late and why (P-338, P-434); hourly to the founder (P-434).
* **Sessions start only in a turn the founder typed**, cloud first (P-348 (5)); the Mac runs the Lead, the demo, qa and at most two builders with test copies, after `tools/lane-preflight.sh`. **Two idle standby Leads** (P-286); numbering in series 2 (P-433).
* No prompt-waiting call while the founder is away (P-388); no hand-over with an in-process subagent running (P-409). Never run guard or test suites in the main copy: use a scratch clone (7 Nov). GitHub through curl with `gh auth token` (P-363). `.claude/settings.json` stays as on `main`; only the founder widens permissions, and a refused write is never routed through a lane or split to retry (P-387, 7 Nov). Times only from `TZ=Asia/Kolkata date` (P-302).
* **Records:** by the Lead alone; STATE one page, at most 12 KB, earlier pages in `history/`; DECISIONS appended, newest first, never rewritten; records once a day and at each hand-over (P-336); records PRs merge only when the queue is empty (P-436 (3)). This page is refreshed at every hand-over (P-440).
* **Merging:** never cancel a CI run; re-run the failed part alone (P-371, P-384); product code only through the queue, never by hand; fixes to the checks or merge flow may land ahead of the queue on green (P-214).


## The compass, word for word from RULES.md (moved by Lead 64, 16 Nov 10:2x IST, size limit)
## The compass (P-312): judged daily from tools, never from prose
| Number | Healthy |
|---|---|
| Capabilities confirmed per day | 10 or more |
| Works on qa's first re-score after merge | 80% or more |
| Major or Critical bugs found after merge | about 0 |
| Works → Partial demotions per day | at most 1 |
| Capabilities in progress | no more than builders |
| Notes PRs as a share of merges | 20% or less |
| Merge batches thrown away | 15% or less (conflicts at most 5 a day) |
| Weekly plan burn per hour (P-440) | 3% or less |



## One-time exceptions (moved word for word from RULES.md, 17 Nov 11:4x IST, Lead 76)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-617 | Size exception for #1815 only; rows briefed from now stay under 800 lines. | CI: pr-rules size step (pr-size.sh reads the row) | 15 Nov |
| P-652 | One-time P-371 exception for #2032's run 43929287134; org move on GitHub Team decided (A137). | prose | 17 Nov |
| P-654 | Size exception for #2064 (PF-18b) only; new rows stay under 800 lines. | script: pr-size.sh | 17 Nov |
| P-672 | Founder approved #2075 in the Lead's chat; times in records only from the clock (correction). | prose | 17 Nov |
| P-684 | One-time: #2077 merged by hand when all shards and types were green, without the final ci roll-up (done 13:27). | prose | 17 Nov |

## Dated rulings (moved word for word from RULES.md, 17 Nov 11:5x IST, Lead 76)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-626 | Finish the Partial R1 capabilities first; 10 proven by qa by 08:00 IST 17 Nov. | prose | 16 Nov |
| P-627 | The founder's seven morning answers (16 Nov) stand as recorded in DECISIONS; (6) amended by P-629. | prose | 16 Nov |
| P-638 | FO-7mv merges before FO-7a2 (shrunk); P-634's money rules unchanged. | prose | 16 Nov |
| P-640 | Halve qa time per row (Built to Proven), gates unchanged; staging-domain fallback Cloudflare Registrar. | prose | 16 Nov |
| P-645 | Hourly cloud routines take the first free row of the night queue; only the Lead edits it. | prose (routine prompt) | 16 Nov |
| P-650 | Express Entry stays end to end; five provincial streams assessment only in R1. | prose | 17 Nov |
| P-653 | Founder's 17 Nov morning answers stand as recorded in DECISIONS (Owner-only Case Officer invites; reversal stays paid, red shortfall; Manitoba Sample until read). | prose | 17 Nov |
| P-655 | Board rebuilds once a day (09:00 IST) and on the founder's ask. | prose | 17 Nov |
| P-658 | Enterprise paid, monthly; Pro kept until a week after the move. | prose | 17 Nov |
| P-659 | Org expat-ready; the repository moves only by the org-move checklist. | prose | 17 Nov |

## Dated rulings, part 2 (moved word for word from RULES.md, 17 Nov 11:5x IST, Lead 76)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-631 | Lockfile lines in a libraries-only PR do not count toward 800; hand-written lines do. | prose (B196) | 16 Nov |
| P-633 | Gmail stays off until a task needs it; the Lead asks then, naming the task (amends P-620). | prose | 16 Nov |
| P-634 | Trust reversals always accepted (red shortfall view); credited trust money never stays in operating. | prose | 16 Nov |

## Dated rulings, part 3 (moved word for word from RULES.md, 17 Nov 12:1x IST, Lead 76)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-616 | A capability with no screen passes gate A by API; map row 99's model choice is launch condition C26. | prose | 15 Nov |
| P-619 | Enforcement steps 3-8 approved; alarms for a stale board (45 min) and outside items. | prose (B193 builds them) | 15 Nov |
| P-620 | Each Claude account checks the company Gmail connector at start and after a switch; missing → ask the founder. | prose (B193 part 6) | 16 Nov |
| P-621 | Google only (Gmail, Calendar) for now; Microsoft deferred; ports stay provider-neutral. | prose | 16 Nov |
| P-643 | (replaces P-642) No extra usage; lanes run past 96%; at 96% the Lead tells the founder, who resets the account before 98%. | prose | 16 Nov |


## Org move (moved word for word from RULES.md, 17 Nov 13:5x IST, Lead 77)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-657 | GitHub Enterprise bought outright (supersedes P-656 trial, reverses P-652 Team). | prose | 17 Nov |
| P-660 | Drain 17 Nov (only near-Proven product PRs and pipeline fixes start), move Wed 18 Nov 09:30 IST, full power after it is verified. | prose | 17 Nov |
| P-661 | The setup agent acts itself in front of the founder, who types every password, card and approval. | prose | 17 Nov |
| P-662 | Only Claude, Mergify and Namespace apps on expat-ready. | prose | 17 Nov |


## P-635 row (moved word for word from RULES.md by Lead 78, 15:2x IST 17 Nov, to keep RULES under 25 KB)
| P-635 | Enforcement defaults: overnight, hooks block only irreversible actions and flag the rest; settings lines to the founder in one daily batch; pr-rules required after 2 days with no false failure; under ~1 s per hook call. | prose (plan `design/enforcement-plan-2026-11-16.md`) | 16 Nov |


## Full rows moved word for word from RULES.md by Lead 80, 16:4x IST 18 Nov (RULES.md under 25 KB, P-611)

| P-618 | Outside dependencies in `design/outside-dependencies.md`: start at need − lead time − 2× buffer; 🔴 when due or stuck 48 h; fallback and date on a block. | script: outside-deps-watch.py via lead-watch.sh step 9 (part; `rules/tokens-money-account.md`) | 15 Nov |
| F-6Nov | Checks every 30 min, prompt exactly `run lead-watch; read STATE Start here`; row details in STATE, never in the prompt. | hook: lead-check-guard.sh (CronCreate); script: lead-heartbeat.sh (tests check-lead-cron.sh, check-lead-heartbeat.sh) | 6 Nov |
| P-336 | Records by the Lead alone; STATE one page ≤ 12 KB; DECISIONS appended newest first; records daily and at hand-over; records PRs merge when the queue is empty (P-436 (3)). | script: check-docs.sh (part: STATE 12 KB); CI: records-label.yml | P-612 |

| P-611b | One queue for reports, questions, blockers and approvals with owner, ack, timeout (45 min ACT, 90 min founder); no hand-over with an un-acked item. | script: items.py, lead-queue.sh, handover.sh (tests check-items.sh, check-handover.sh) | 15 Nov |  (moved word for word by Lead 80, 16:4x IST 18 Nov)

| P-639 | The board and the Lead's check verify each other: each check acts on the board's Today and Stuck items against their primary source; a mismatch is an ACT fixed the same day. | script: lead-watch.sh (part: ACT lines; B201's tests) | 16 Nov |  (moved word for word by Lead 80, 19:1x IST 18 Nov)

| P-418 | Pick order each check: red on main, merged work awaiting qa, blockers freeing several rows, Partials in journey order, drafted rows, new work; warm rows to the lane with the context (P-348, P-413). | prose (lead-watch skill) | P-612 |  (moved word for word by Lead 80, 19:1x IST 18 Nov)


## Rows moved word for word from RULES.md by Lead 82, 19 Nov 00:2x IST (size limit, P-611)
| P-539 | This repository stays public; integration and strategy content goes only to private notes. | hook: push-guard.sh via .githooks/pre-push; CI: ci.yml push-guard steps (part; `rules/tokens-money-account.md`) | 13 Nov |
| P-402 | Standing approvals: label on Approve and green, own records PRs, requeue, retarget, draft toggle, re-run failed parts, dispatch nightly (P-410, P-434). | hook: merge-guard.sh (part: only the Lead copy merges) | P-612 |
| P-387 | .claude/settings.json stays as on main; only the founder widens permissions; a refused write is never rerouted through a lane or split. | hook: stop-check.sh (part: lane edits); sandbox denies settings writes | 7 Nov |
| P-691 | Emergency hand merge stays on Enterprise: only a pipeline/CI fix while the queue itself is broken, after green ci and a review, logged in the change log. | prose (ruleset bypass; library/engineering-change-log.md) | 17 Nov |
| P-593 | The board is the one door with a Library: one master per document, a page is a view (P-594: "Release 1 (production grade)"). | script: library-freshness.py (part: a master behind its feeds is listed) | 14 Nov |
| P-596 | Every board number carries source, sha, time and class; missing data shows "not measured"; the data is validated and reconciled. | script: cockpit-data.py, cockpit-reconcile.py; CI: cockpit-tests.yml | 14 Nov |
| P-591 | One cockpit built from script data, refreshed each check, its link opening every report; a fresh reviewer weekly; never duplicate work. | script: cockpit-data.py; CI: cockpit-tests.yml (part: data) | 14 Nov |

## Night of 18-19 Nov (moved word for word from RULES.md, 19 Nov 02:1x IST, Lead 83)
| P-705 | No move back to Pro (supersedes P-696's rollback); waits measured each check. | prose | 18 Nov |
| P-703 | Measures and reports count product features only (app-code PRs, product rows), never records or tooling. | script: lead-watch.sh | 18 Nov |
| P-704 | One big batch once (#2152, batch_size 13); back to 6 on 19 Nov by its own PR (Lead 83 left #2152 unmerged, 19 Nov: machines were not the limit). | prose | 18 Nov |
| P-706 | Demo/test outbox files may hold links and codes until PF-19e seals them; PF-19e lands before real people. | prose | 19 Nov |
| P-707 | Finish to Proven first: only Wave 1 lanes and lanes merging approved PRs work; the rest park with resume notes, never wasted. | prose | 19 Nov |
| P-708 | #2151 "run tests once" hand-merged on green ahead of the queue (founder); a PR runs fast + types, the full set runs once per batch. | script: ci.yml | 19 Nov |
| P-709 | Night: Lead and standbys label any PR with `Reviewer: Approve <head>` after the Lead's reads, by API or github.com in the browser; idle cloud lanes restarted in claude.ai/code; no spend over caps, no gate lowered. | prose | 19 Nov |
| P-710 | Sample platform firms seeded ON on demo and test copies; production never seeds (test that no Sample firm exists in production mode). | prose | 19 Nov |
