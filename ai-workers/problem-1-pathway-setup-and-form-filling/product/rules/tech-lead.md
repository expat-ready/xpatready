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

## Morning of 19 Nov (moved word for word by Lead 84, 06:4x IST)
| P-712 | Module cards: the shared Tables/Tests lines are generated or one file per row; no PR hand-edits a shared card line; skills say so. | prose (tooling PR owed) | 19 Nov |
| P-713 | Build in parallel through warm lanes (P-341) on disjoint touch lists; parallel building does not slow proving. | prose | 19 Nov |
| P-714 | Account switch plan: forecast each check; 94% tell the founder; 96% lanes push and stop, RESUME pushed; 97% the founder switches. | prose | 19 Nov |

## Morning of 19 Nov, continued (Lead 86, 08:1x IST; register rows moved word for word)

| ID | Rule | Enforced by | As of |
|---|---|---|---|
| IDX-9 | Night of 18-19 Nov rows (P-703 to P-710) stand as recorded; word for word in `rules/tech-lead.md` › Night of 18-19 Nov. | prose | 19 Nov |
| IDX-10 | Morning of 19 Nov rows stand as recorded: P-712 (cards never hand-edited), P-713 (parallel via warm lanes), P-714 (account switch: 94% tell, 96% stop, 97% switch), P-715 (Mergify parallel lanes per module); word for word in `rules/tech-lead.md` › Morning of 19 Nov. | prose | 19 Nov |
| P-716 | Pipeline freeze until Release 1 Proven reaches 30; only red-main or broken-queue fixes; P-712 first. | prose | 19 Nov |
| P-717 | Records, rules and pipeline work take effect at once in their own lane, never blocking product merges; a new blocking check runs report-only 24 h first; P-715 resumes as the exception. | prose | 19 Nov |
| P-718 | Merge queue first (P-712, P-715); staging (PF-8a/8b/8c) shaped now, started at Proven 30; cost to the founder before the first deploy. | prose | 19 Nov |
| P-719 | Finish by capability: a lane owns one Release 1 item's whole chain (parts, J-row, qa proof); about 8 items in flight, parallel, disjoint touch lists; next = fewest parts left, nothing waiting outside; a new item starts when one is Proven. | prose | 19 Nov |

| P-731 | 19 Nov | **Full run before the label (founder, 11:5x IST, chose "Yes, full run first (Recommended)"; the one next change under P-730 (3)).** Lead 90's measured cause, today's data only: no merge to main between 09:01 and 11:5x IST; every merge batch since ~09:04 failed; the three faults traced (#2169 FoldArrow and `check_forms_qa53` on its new decisions route, #2196 consent wording seed) fail every time in the full suites, which a PR first meets inside its merge batch (~1 h a batch, batches stacked, so one fault fails all behind it); #2169 was relabelled with its second fault unfixed; qa's proof records wait in the same queue. (1) A PR gets `review: approved` only after one full run of every suite has passed on its head (merged with main's head at that time); a PR command starts that run (tooling row CI-PRE). (2) Until CI-PRE is on main: before any relabel after a failed batch, the Lead lists every failing suite of that batch run and the fix covers each. (3) Measure: share of batches that pass first time, before and after; reported at the 20 Nov ~19:00 IST checkpoint. Impact stated (P-254): about 1 h more before a label, US$0 (public repository, free runners), no gate lowered. Supersedes nothing; P-665's "one full check after Approve" is what this builds. (4) **Enforced, not text (founder, 11:5x IST: "make this as an enforced rule ... not just a text"):** the label guard and the queue gate refuse the label without the green full run, and refuse a relabel after a failed batch unless a PR comment lists every failing suite of that batch run (checked against the run); both are parts of CI-PRE and are required checks when it lands. |  (word for word from DECISIONS, Lead 90, 19 Nov)

| P-721 | 19 Nov | **Proof sprint (founder, 10:2x IST, "Yes, proof sprint", on Lead 87's measured cause: 60 app-code merges 16-19 Nov, Proven still 11; 52 items Partial; 8 PRs dequeued this morning on module-card conflicts; stacked batches all failed on one fault).** (1) #2195 (P-712 card fragments) merges first. (2) Five nearest items only, each one PR then at most a J-row then qa: R1.4 (#2029), R1.109 (#2012 → J-109), R1.77 (#2169 → J-77), R1.19 (#1959), R1.28+R1.37 (#2196 → J-37). (3) qa 2 and qa 3 walk each the moment it merges. (4) No new part starts on an item with three or more steps left (R1.59 part 3+, R1.8 AUD-1m 2a/2b, R1.74 CS-DL1b, R1.41 FO-3st2) until 4 items are Proven; PRs already approved still merge. (5) Every gate, review and qa walk stays (no quality cut). Expected 3-5 Proven by tonight if the queue moves (estimate, not measured). Refines P-719's ~8 in flight. |  (word for word from DECISIONS, Lead 90, 19 Nov)

| P-722 | 19 Nov | **Verification stays per item (founder, 10:3x IST, "Per item now, auto later (Recommended)", on A197 (c)).** qa proves each Release 1 item right after its last part merges, as today (P-339, gate A); qa never blocks merging. After Proven 30 (when P-716's freeze lifts), a row makes per-item proof automatic: when an item's last part merges, GitHub runs its pack and J-row and posts the verdict; qa keeps only the screen walk (gate A). No end-of-release big-bang verification. Same bar. |  (word for word from DECISIONS, Lead 90, 19 Nov)

| P-723 | 19 Nov | **Drain, then journey by journey (founder, 10:3x IST, spoken: "use all the resources parallelly, and merge the next 2 3 hour everything ... then pick up the another logical build and parallel team members which is needed for that journey, and build that way, and then prove that journey. So why we are not building the logical order journey by journey?"; chose "Client case journey (Recommended)" first).** Cause named by Lead 87: Release 1 was run as 101 items split by module (P-609, P-558), so 52 sit Partial; journeys (J-rows) only came last. (1) Drain to ~13:30 IST: every lane only gets approved PRs merged (conflict merges, re-reviews, re-runs); nothing new starts; P-721's five items finish inside it. (2) Meanwhile the Lead maps each journey to its R1 items and what is missing. (3) Journey 1, the client case journey (enquiry → booking → case opened → client record → checklist and forms → decision), from ~13:30: one lane per missing item, in parallel, disjoint files; one end-to-end J-test; qa walks it; all its items are Proven together. (4) Then journey 2, 3; shared platform items built thin when a journey first needs them. Every gate stays (P-722 per-item proof, P-339). Returns to P-348's journey order. Refines P-719 and P-721. |  (word for word from DECISIONS, Lead 90, 19 Nov)

| P-725 | 19 Nov | **The Lead on the new account runs Fable 5.2, medium effort, auto mode (founder, 10:4x IST, spoken: "once it is mapped ... we may run out of the usage. Make sure that the new lead, right, from the new account uh, runs the Fable 5.2 medium effort auto and review everything and fix everything and update everything").** When this account's weekly plan stops (A196), the founder opens the new account and types `/lead`; that Lead is started on Fable 5.2, medium effort, permission mode auto (set at the start, no switch mid-session, P-605), reads RULES (as of P-724+), STATE "Start here" and `design/journeys-2026-11-19.md`, then reviews, fixes and updates everything in flight. Overrides P-605/P-608's "Opus 5.5 is the working model" for the Lead on that account only; builders, reviewers and breakers keep P-608. Lead 87's note: this account's Fable weekly pool was 0% used at 10:4x IST. |  (word for word from DECISIONS, Lead 90, 19 Nov)

| P-726 | 19 Nov | **Two tracks by team, journeys in dependency order (founder, 10:4x IST, chose "Two tracks by team (Recommended)" on `design/journeys-2026-11-19.md`, J0-J10).** From ~13:30 IST: Build Lead C: J1 Pathway Configurator (finish R1.80), then J7 case opened on a release, J8 documents, J9 client money. Lead B: J2 firm set-up and subscription, then J3 messaging, J4 enquiry, J5 booking, J6 retainer and signature. J0 platform items are built thin when a journey first needs them; J10 last. Each team in its own files; P-724's limits hold (≤6 items in flight per journey, pull on Proven). Replaces P-723's "client case journey first" (the client case is J4-J7 and needs J1, J2). |  (word for word from DECISIONS, Lead 90, 19 Nov)

| P-727 | 19 Nov | **Bulk staff invite: 1-50 rows, the good ones are sent (founder, 10:5x IST, chose "1-50 rows, send good ones (Recommended)"; D4, STATE founder ask (a) R1.20 vs PF-4c).** An owner may invite 1 to 50 people in one batch; every valid row is invited at once; each flagged row (bad email, already staff, over the seat limit, role not allowed) is listed with its reason to fix and resend; nothing flagged is sent. Settles R1.20 and PF-4c part 2; PF-15 part 2 unparks. |  (word for word from DECISIONS, Lead 90, 19 Nov)

| P-729 | 19 Nov | **GitHub adds: journey videos, batch-failure alert, Claude GitHub Action evaluation (founder, 11:2x IST, chose all three; asked for a video "only my surface", told when ready, researched in official docs).** Lead 87's research (playwright.dev videos, trace viewer, CI pages; GitHub artifacts and billing pages, read 19 Nov): Playwright records video (`on`, `retain-on-failure`, `on-first-retry`; default size the viewport scaled to fit 800x800) and traces (`on-first-retry` recommended on CI); GitHub keeps artifacts 90 days by default; runners are free for public repos; public-repo artifact storage cost not stated (overage US$0.25 per GB-month). (1) **Videos:** every passing journey test on main records a short video, kept 90 days as a run artifact; failing tests keep a trace; one founder page lists each proven journey with its video; the founder is notified when one is ready; folded into AUTO-PROOF; Sample data only, and a check that no secret appears. (2) **Batch-failure alert:** a workflow comments on the likely PR with the failing suite the moment a merge-queue batch fails. (3) **Evaluate** Anthropic's Claude Code GitHub Action (builders run from a PR comment): cost and STANDARDS §1 gate result to the founder first; nothing installed (P-551: account and key are his). |  (word for word from DECISIONS, Lead 90, 19 Nov)

| P-732 | 19 Nov | **One capability, one PR, automatic proof (founder, 12:10 IST, chose "One PR + auto proof (Recommended)" after saying: "This way, this will take ages ... how to get 10 capabilities per day at least ... people are delivering 100 capabilities also. How they are able to do it.").** Lead 90's cause: we pay a fixed cost of hours (review rounds, a ~1 h merge batch, then a 3-5 h qa session) several times per capability because each is cut into 3-6 parts under the 800-line limit; 52 items are Partial, 11 Proven; at 5-7 a day from 21 Nov about 45-60 of 101 would be done by 29 Nov (estimate). (1) **One PR per capability:** one lane builds every part left of an R1 item plus its J-test in one PR with `Completes: R1.n`; P-610's 800-line limit does not apply to such a PR (cap 3,000 changed lines, tooling row CI-ONE); one review, one full run (P-731), one merge. Extends P-728 (1) and P-719; exception to P-278's one row per PR for these PRs. (2) **Automatic proof:** when that PR merges, GitHub runs the item's J-test and pack on main's head twice (run and independent re-run) and records the item Proven when both are green and no Major or Critical is open on it (AUTO-PROOF, #2233); qa no longer walks every item first. (3) **qa audits:** qa walks every item that touches money, permissions, firm walls, the schema or IRCC forms, and a daily sample of at least 3 of the others; a failed audit takes the item back to Partial with a QA row. **This lowers the bar from "qa walks every item" (P-339, P-348c) to "qa walks the risky ones and samples the rest": stated to the founder before he chose (P-254).** (4) Heavy gates stay where the risk is: breaker and the Lead's read for money, permissions, schema, migrations, `.github/` (P-303, P-423); one Opus reviewer elsewhere. (5) Enforced, not text (founder, 11:5x IST): pr-size accepts the larger PR only with `Completes: R1.n` and its J-test file in the diff; the proof is written by the workflow, never by hand. (6) Estimate 8-12 Proven a day once (1) and (2) run; measured from the first day; reported at the 20 Nov ~19:00 IST checkpoint. Items already in flight as parts finish as they are; new starts follow (1). (7) **Points 3 and 4 as well, started at once (founder, 12:11 IST: "Can we do 3 and 4 also and give our best effort and then immediately start on those?"):** (3) heavy gates only where the risk is, as (4) above, applied per capability PR: one Opus reviewer, at most two rounds (P-277), breaker and the Lead's read only on money, permissions, firm walls, schema, migrations, IRCC forms and `.github/`; (4) a faster test run: a PR's full run and the merge batch run only the suites its changed modules can affect, with every suite still run nightly on main (tooling row CI-AFF); lanes for CI-ONE and CI-AFF start 12:11 IST. (8) **Held for an evidence review before any of it is built (founder, 12:11 IST: "be very mindful before suggesting anything ... make a check that up to date knowledge. Don't speak from memory. Just research, proven methodology ... and tell me whether what we are doing is going to give that capability or not").** Lead 90's 8-12 a day was reasoning, not evidence (P-502). No CI-ONE or CI-AFF lane starts and no brief changes until three reads are back and challenged: published methodology with sources, how fast agent teams gate their work, and our own measured chain per capability under the current model; the verdict and any change to this row go to the founder the same day. P-731's CI-PRE continues. |  (word for word from DECISIONS, Lead 90, 19 Nov)

| P-733 | 19 Nov | **Corrected speed plan after the evidence review (founder, 12:28 IST, chose "Yes, corrected plan (Recommended)"; replaces P-732 (1) and its 3,000-line cap, narrows P-731 (1); evidence word for word in `design/speed-evidence-2026-11-19.md`).** Measured 16-19 Nov: 73 app-code PRs merged in 3.53 days (~21 a day), 4 items reached Works, R1.6 took 10 PRs over 91 h; 52 items Partial at once, 19 of them one part from done and 9 two; on 19 Nov fresh batches passed first time 41% (13 of 32), all 8 sampled failures were deterministic faults in a member PR and one fault failed about 5 stacked runs; a full run costs ~7.3 job-hours. Published sources: review quality falls with size (1,000 lines usually too large); vertical slices with their tests are supported; automated acceptance tests are preferred to manual inspection, with extra scrutiny for flagged high-risk changes; affected-only testing needs a full run every few hours; no published team reports features per day proven end to end in a multi-tenant, client-money or compliance product. Lead 90's earlier claim that the merge step is the constraint held for 19 Nov only; the week's constraint is spread. (1) **Focus:** every builder lane works the items nearest to done, the 19 with one part left first, then the 9 with two, one lane per item until it is Proven (P-719); no new item starts while a nearer one has no lane. (2) **Size:** PRs stay near 800 changed lines (P-610 stands; no 3,000 cap, CI-ONE dropped); an item's parts go back to back in one lane, the J-test in the last one (P-728 (1)). (3) **Automatic proof** as P-732 (2), on one green run of the J-test and pack on main's head; qa walks items touching money, permissions, firm walls, schema or IRCC forms, and explores a daily sample of the rest. (4) **Full run only for repeat failures:** P-731 (1) is narrowed to P-731 (2) and (4): a PR that failed a merge batch is relabelled only after a green full run on its new head with every failing suite named; no full run on every PR (it would take about half the runners). (5) **Smaller batches, less stacking** while the batch failure rate is over 5% (tooling row MQ-SMALL, shaped from Mergify's docs). (6) Affected-only tests (CI-AFF) parked: not the binding limit. (7) Risk-only heavy gates as P-732 (4). Forecast from the measured model: about 1 a day as is, 6-7 likely with (1) and (3); 10 a day needs about 28-30 lanes and review rounds that do not grow (estimate); measured at the 20 Nov ~19:00 IST checkpoint. No quality bar lowered beyond P-732 (3)'s qa change, which stands. |  (word for word from DECISIONS, Lead 90, 19 Nov)


## Moved 19 Nov (Lead 91; rows word for word as they stood on RULES.md)
| P-644 | Build 10, prove 10 R1 rows a day (floor 7/7); Lead + Build Leads A, C + Prove Lead; whole parts first; no scope cuts. | prose (plan in design/) | 16 Nov |
| P-663 | Ramp: 5-7 Proven a day 19-20 Nov, 8-10 21-23 Nov, 10-15 from 24 Nov; no new capability row while P95 queue > 60 min or batch wait > 15 min; daily checkpoint. | prose | 17 Nov |
| P-623 | WIP: 2 waiting per group or 24 h; stopped builders fix qa bugs first; release Lead orders qa's queue; board leads with qa verdicts a day. | prose (B193, B194) | 16 Nov |
| P-668 | Engineering System v1 cards T9, T11, T12, T14, T16, T17, W1, W3-W6 adopted as recommended. | prose | 17 Nov |
| P-646 | Jam alarms each check (disk, no merge 60 min, CI queue over 30); drafts until Approve; act unasked. | script: lead-watch.sh (1b, 2b) | 16 Nov |
| P-674 | Clean-up (with P-675 to P-677): plan now, staged moves after the org move; repo name platform; October files out (tagged); business plan private. | prose | 17 Nov |


## Moved 19 Nov (Lead 94): RULES rows P-664 to P-670, word for word
| P-664 | qa verdict records PRs go first in the merge queue. | prose (.mergify.yml priority owed) | 17 Nov |
| P-665 | Fast PR checks, one full check after Approve, every suite once in the batch (CI-B on CI-A). | prose (CI-B owed) | 17 Nov |
| P-666 | Builders start on high effort; 48 h stop rule on review rounds, CI rounds, plan points. | prose | 17 Nov |
| P-667 | Rules v2 (21 enforced, 12 judged) replaces this page when it lands; old rows in an ID map. | prose | 17 Nov |
| P-668 | Engineering System v1 cards adopted as recommended: list in `rules/tech-lead.md` › Moved 19 Nov. | prose | 17 Nov |
| P-669 | 5-hour bar over 90% before its reset: slow lanes; the free reset only if work would stop, and the founder is told. | prose | 17 Nov |
| P-670 | T7: 36 more deny lines (CI cancel, secrets, protection, gh api writes, hook skips, Drive writes) in every copy via #2075. | hook: .claude/settings.json deny | 17 Nov |
| P-693 | Enterprise hosted compute is Multi-cloud (Azure plus AWS); no Support ticket at that point (founder A167). | prose (enterprise setting; change log C26) | 18 Nov |

## Moved 20 Nov (Lead 96, from RULES.md, word for word)

Moved by Lead 99, 20 Nov, word for word:

| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-740 | Release 1 stays 29 Nov (founder 19 Nov 20:0x); Proven per day reported each evening; slips said plainly. | prose | 19 Nov |
| P-739 | Six merge batches at once (max_parallel_checks 6; P-730's hold lifted by the founder 19 Nov); back to 3 if failures cascade. | prose | 19 Nov |

| P-744 | Test quality and impact map now (exception to P-734): c8 per-test coverage → capability → code → test graph, test impact analysis at the PR stage, Stryker mutation pilot; merge batch keeps every suite (B203). | prose (B203) | 20 Nov |
| P-743 | No full run on every PR (CI-PRE back to P-733 (4)): `FULL_RUN_FROM=2026-11-22T14:30:00Z`; a PR that failed a batch still needs `/run full` and its failures named; code fix owed, then delete the variable. | CI: queue-gate.sh FULL_FROM (repository variable) | 20 Nov |
| P-742 | Cut wasted test runs, no lower bar: qa proof data under `qa/reports/` is a record (#2355); affected-only tests via B203. | script: records-only.sh (#2355) | 19 Nov |


### IDX-19 row, moved word for word from RULES.md (Lead 100, 11:1x IST 20 Nov, size limit)
| IDX-19 | 20 Nov rows P-739, P-740, P-745 (waves, WIP caps 8/12), P-746 (core = Waves 1-2 by 29 Nov), P-747, P-748: word for word in DECISIONS and `rules/tech-lead.md` › Moved 20 Nov. | script: B204 waves check (part, owed); prose | 20 Nov |

### IDX-9 row, moved word for word from RULES.md (Lead 100, 20 Nov, size limit)
| IDX-9 | 18-19 Nov rows stand as recorded: P-703 to P-715 and P-716 (freeze to Proven 30), P-717 (records and pipeline in their own lane), P-718 (queue first, staging at Proven 30), P-721 to P-723, P-725 to P-727, P-729, P-730 (19 Nov proof sprint, tracks, hold); word for word in `rules/tech-lead.md`. | prose | 19 Nov |

### IDX-20 row, moved word for word from RULES.md (Lead 2 (series 3), 14:4x IST 20 Nov, size limit)
| IDX-20 | 20 Nov rows P-749 (titles; Lead 1 series 3), P-750 (staging at Proven 30), P-751 (self-adjusting pipeline, B206), P-752 (blocked label/ready/reopen: browser), P-753 (#2427 size), P-754 (FO-3st2 hold), P-755 (scale 50-100 firms), P-756 (guard tunes 1-2): word for word in DECISIONS. | script: lead-pr.sh | 20 Nov |

## IDX-14 (moved from RULES.md word for word by Lead 3 (series 3), 20 Nov 16:2x IST, size)
| IDX-14 | Product rulings P-735 (an expired identity document is refused as the firm's own rule), P-736 (native drag on the sales board), P-737 (a locked PDF is refused as the app's rule), P-741 (R1.31 includes FO-2pv, not QA-531) stand in their DECISIONS rows, each for the founder's review. | prose | 19 Nov |


## IDX-21 (moved word for word from RULES.md, 21 Nov 01:1x IST, Lead 6 series 3, P-611)
| IDX-21 | 20 Nov P-757 to P-765 (browser merges and authority, clean-up window, QA-542 Sample, 10-min check, tooling fast path, agents do outside steps, tooling apart from product, lock exceptions) stand: word for word in DECISIONS; earlier row in `history/RULES-2026-11-20-1615-lead3s3-as-of-P-761.md`. | script: lead-watch.sh (part), check-docs.sh lock; hook: founder-click-guard | 20 Nov |

## IDX-23 (moved from RULES.md by Lead 10 (series 3), 21 Nov 08:2x IST, word for word)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| IDX-23 | P-766 to P-777 stand as in DECISIONS (P-770 Lead does every GitHub step; P-771 measured numbers only; P-772 enforce in code, tooling queue apart; P-773 R1.32 = P-574 + AG-02, FO-10c; P-774 wave 3 tonight, 32 first; P-775 a PR's own screens records and P-776 a generated lockfile sit outside the 800-line count, body says the split; P-777 P-752 and P-775 stay, R1.108 Works only after #2651). | hook: founder-click-guard.sh (#2587), resource-claim-guard.sh (stop-check part 5) | 21 Nov |
| P-778 | No browser-doable ask to the founder (shell refusal → built-in browser, P-752 widened to close, archive, Run workflow); product questions answered at the next check (gate 20 min, tooling 60 min); app view read within 35 min; enforcer PRs apart, full checks (E-a to E-g). | owed: ENF-778a (stop-check E-a/E-b, founder-click-guard E-c), ENF-778g (walks), ENF-778b held | 21 Nov |
| P-779 | 21 Nov | Kind: workflow. **Size exception for #1959, PF-5 part 2 (R1.19: Stripe's webhook, payment hold 402, billing) (Lead 10 (series 3), 08:4x IST, P-384; asked on #1959 in comment 7050125346).** Code and tests are about 824 changed lines against P-610's 800; the PR's own screens records (review, break report, step 0: 674 lines) already sit outside the count under P-775. The body carries "Size exception: P-779". Why: the 24 lines over come from the PF-12b bypass-audit change and two checks Lead B asked for, and splitting a webhook flow mid-feature is riskier than 24 more lines (precedents P-711, P-720, P-748). Lead 10's P-423 read of head 803e6b0d0 (money, a public door): the signature is checked by Stripe's own `constructEvent` (300 s tolerance); receipts are stored once and duplicates ignored; the subscription is re-read from Stripe, never taken from the payload, under a per-firm advisory lock; status moves follow fixed tables (ENDED final, a hold lifts only on a paid invoice); billing routes carry PermissionKeys and @HoldOpen. Impact (P-254): time, saves a split and two re-reviews on a money row; cost US$0; quality unchanged (reviewed 11 rounds, suites green). |
| P-780 | 21 Nov | Kind: product and workflow. **Recovery swap for the 07:00 cycle (founder, typed 09:5x IST 21 Nov, A246: "I follow your recommendation"; Lead 11 (series 3)).** (1) Rows whose proof needs the founder's AWS account (R1.13 PF-23c, R1.14 PF-8rc, R1.15 managed store, R1.24 wildcard DNS and certificate; R1.5's two Cognito lines) move behind rows provable in CI. Their code still merges; they count only when the AWS proof runs (P-551: accounts are the founder's). (2) First, close the gaps qa found in today's proofs: QA-619 (R1.32 walk), QA-621 Major (R1.108: case opening skips the conflict check), FO-3st1 part 2 and FO-3st3 (R1.42). Swap-ins: FO-5b (R1.53), then PF-5s and PF-16 (R1.90) after #1959 merges, and PF-12b2 (R1.4) after #1959, #2633, #2626 and #2627. Five cloud builders started 09:5x. (3) The founder restated the operating model: the Lead does every step itself, in the signed-in built-in browser or Claude in Chrome (GitHub, claude.ai/code with "Show more" until gone, every lane's prompt box), and the founder unblocks only where it is stuck (P-699, P-752, P-770, P-778). Impact (P-254): time, the cycle forecast goes from ~9-10 to ~12-14 of 15 if the builders land by ~16:00 IST and the queue holds; cost US$0 (live AI off); quality unchanged (gates, Opus reviews, qa proofs as before). |
| P-781 | 21 Nov | Kind: workflow. **One model set; no model routing (founder, typed 10:3x IST 21 Nov, Lead 11 (series 3)): "I don't want to optimize the model by scrutiny ... I want to use only one model, which is Opus 5.5 medium for all the tasks, and Fable 5.2 medium for a high level task, which is like intake or something very critical."** Every new session and agent (Lead, builders, reviewers, breakers, qa, helpers) starts on Opus 5.5 at medium effort; Fable 5.2 at medium only for a high-level or critical step the Lead names (intake or readiness judgment, the strategy desk, a fresh challenger). No Haiku or Sonnet, and no risk-based model routing. Running sessions keep their model and effort until they end (P-605: no switch mid-session). It supersedes the effort parts of P-608, P-303 ("Opus high") and P-597 (desk and challenger "Fable at high"; helpers on Sonnet). It is also a binding scope line for Strategy desk 08. Impact (P-254): cost lower (medium effort); quality watched through the same gates and qa proofs, so a drop shows as more review rounds or Partials; time unchanged. |


## IDX-25 (moved 22 Nov, Lead 2)
To 07:00 IST 23 Nov: P-784 cap 12 → P-785 cap 16 (structural changes now, each step backward compatible and merged alone; queue/CI config only after the Lead's read, never 19:00-07:00; staging under `lab.`) → P-786 cap follows the work, Track B builds today, tokens not the limit (be mindful) → P-787 keep all lanes, the founder adds usage himself; the Lead measures the rate each check and asks again at 90%. Word for word in DECISIONS.
Also folded here (was IDX-24, word for word): | IDX-24 | P-782, P-783 stand as in DECISIONS. | script: ENF-782b (owed) | 21 Nov |
P-788 (Opus 5.5 medium everywhere, never silently), P-789 (Lead mental model; Show more every 10-min check; agreed rules made live), P-790 (size exceptions #2927, #2953, #2955), P-791 (unclog playbook: never merge by hand while batches run) stand, word for word in DECISIONS (folded 22 Nov, Lead 2).
Lead 3 (22 Nov): P-792 (capability PRs first; a held merge named to the founder with why and until when), P-793 (size exception #2916), P-794 (EXPERIENCE §7, the team's 14 UX-law screen checks, scored by every screen review at 1280 and 375 px), P-795 (phone primary buttons at least 44 px; screen-law enforcers LX936; goal 12, target 15, by 07:00-09:00 IST 23 Nov).
Lead 4 (22 Nov): P-796 (R1.21 proven without a Stripe key, its Done when re-worded), P-797 (the tax on a client invoice follows the client's province: an editable Bill-to province, the firm's province when there is no Canadian address; CRA GST/HST Memorandum 3-3-6), P-798 (the Lead's triggers follow the 10-minute check: a lane's ended turn or a question acted on at the next check; approved not queued for 20 min fixed; no push for 30 min gets its next step; a step past twice today's median gets a builder; enforcer owed: `lead-watch.sh` thresholds), P-799 (payment-hold deletion warnings on day 0, then days 16, 46 and 83, from SA-02 v2.24) stand, word for word in DECISIONS. Domain questions are settled from official sources and the team's requirements, not asked (the founder, 14:4x, in P-797 and P-799).
Lead 4 (22 Nov, later): P-800 (plan 2-3 days of capability ahead per track; every Partial capability on a track board; one lane per open part), P-801 (domain, CRM and technical choices from sources: requirements, official pages, market research; never a founder question), P-802 (track queues, qa proof on the batch, migration slot per area, affected tests), P-803 (never act on stale information: fresh reads with source and time), P-804 (size exceptions #2922, #2919) stand, word for word in DECISIONS.

Added 23 Nov (Lead 4; full rows in DECISIONS): P-805 size exceptions #3042, #2368, #2999, #3017 · P-806 Tasks screen (PF-29f, R1.75): the founder's three choices, see the row · P-807 size exception #3065 only · P-808 size exceptions #3179, #3033, #3035, #2459 · P-809 the ten stacked tooling PRs land as one through #2590.

Added 23 Nov (Lead 10; full rows in DECISIONS): P-810 size exception #3185 · P-811 the four stacked tooling PRs land as one through #2444 (founder) · P-812 size exception #3174 · P-813 size exceptions #3184, #3193.
Added 24 Nov (Lead 13; full rows in DECISIONS): P-814 case rows RQ-02 to RQ-08 first within the 101, RQ-01 shaped only until the founder confirms, four rows stay, programs by official volume, the list beyond the 101 · P-815 Release 1 keeps all 101, committed 12 Dec, aim 6-7 Dec (replaces P-609's date).

### IDX-15 line
Moved word for word from RULES.md, 27 Nov (Lead 3, size limit):
| IDX-15 | 17 Nov rows (P-664 qa records first, P-665 CI-B, P-666 high effort and 48 h stop, P-667 rules v2, P-668 cards, P-669 5-hour bar, P-670 T7 deny lines; P-693 multi-cloud compute) stand: word for word in `rules/tech-lead.md` › Moved 19 Nov (Lead 94). | prose (see rows) | 19 Nov |

### IDX-23 line
Moved word for word from RULES.md, 27 Nov (Lead 3, size limit):
| IDX-23 | P-766 to P-780 stand, word for word in `rules/tech-lead.md` › IDX-23 (P-770, P-778 the Lead does every step; P-780 recovery swap; P-781 Opus 5.5 medium for all, Fable 5.2 medium critical). | hook: founder-click-guard.sh (#2587), resource-claim-guard.sh (stop-check part 5); owed ENF-778a/g | 21 Nov |
