# Rule register (the tech lead keeps it; as of **P-615**, 15 Nov 14:15 IST; the long page as of P-612 is word for word in `history/RULES-2026-11-15-1415-before-register.md`)

One line per rule: `ID | rule | enforced by | as of` (P-611, P-615). **Enforced by** names the hook, CI step or script that blocks or fails a break; `prose` = only the reader enforces it (G-4 candidates at the bottom); `(part)` = covers part of the rule. **Start read**: this page, then the `DECISIONS.md` rows newer than "as of", word for word (P-314, P-440). Long text, word for word: the side files under `rules/`, opened only for a row's detail. `tools/check-docs.sh` fails a row with no enforced-by, a page over 25 KB, or one over 3 rows behind DECISIONS. Earlier pages: `history/RULES-2026-11-15-0938-as-of-P-603.md` and older in `history/`.

## Goal and order (detail: `rules/goal-and-order.md`)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-450.1 | Milestone plans stand as recorded (M3 done 29/29 10 Nov; the Bake; the Chrome extension, 40 sessions), detail in the side file: P-434, P-438, P-450, P-459, P-460, P-463, P-466, P-469, P-471, P-472, P-474, P-475, P-481, P-489, P-494, P-499; with P-435, P-447 to P-449, P-451 to P-457, P-476, P-482 to P-484, P-495. | prose | 12 Nov |
| P-418 | Pick order each check: red on main, merged work awaiting qa, blockers freeing several rows, Partials in journey order, drafted rows, new work; warm rows to the lane with the context (P-348, P-413). | prose (lead-watch skill) | P-612 |
| P-464 | XFA reuse: ours and theirs head to head per functionality, the better wins, a tie keeps ours; adopt and improve theirs when it is the better base (P-465, P-467). | prose | 11 Nov |
| P-470 | The XFA code is ours: small fixes in PATCHES.md, extended only where our pathways use the form; never read the ER v2 repository. | prose | 11 Nov |
| P-462 | A cloud lane for every ready independent row; lanes push after each step; Mac starts under the preflight caps (P-468). | hook: lane-preflight.sh --hook (part: Mac caps) | 11 Nov |
| P-468 | Stale copies are deleted only when the work is on GitHub, nothing is uncommitted, untracked files are in `archive/`, no session uses them; databases via prune-test-dbs.sh. | prose | 11 Nov |
| P-450.2 | One-time or time-boxed directions, done or standing as recorded in the side file: P-485, P-506, P-507, P-533, P-537, P-545, P-547, P-550, P-558, P-569 (integration stopped), P-583, P-589. | prose | 14 Nov |
| P-473 | UX style: calm work app, plain second-person client questions with "Why we ask", quiet surfaces, no motion library. | prose | 11 Nov |
| P-569.3 | Product and Release 1 scope rulings stand as recorded (read the row when its capability is touched): P-477, P-492, P-493, P-540, P-560 to P-562, P-564, P-567, P-568, P-570 to P-572, P-575, P-577 to P-579, P-581, P-584, P-585, P-598, P-603, P-612; with P-573, P-574, P-586, P-590. | prose | 15 Nov |
| P-569.1 | Integration rules, stopped with the integration, kept in the side file for a resume: P-513, P-516, P-518 to P-520, P-522 to P-524, P-528, P-529, P-531, P-534, P-535, P-543, P-546, P-549; with P-517, P-527, P-544. | prose | 14 Nov |
| P-569.2 | Product rulings stand in their DECISIONS rows (read one when its capability is touched): P-441, P-443, P-444, P-487, P-490, P-491, P-496 to P-498, P-510, P-525, P-538, P-548, P-588; with P-72, P-78, P-148, P-154, P-242, P-411; holds P-235 to P-248 lifted (P-316). | prose | 14 Nov |
| P-488 | Gate B on a PR runs the REGRESSION-HELD checkpoint packs; records never claim Works that an open Major contradicts. | CI: ci.yml gate B (part) | 12 Nov |
| F-12Nov | Every change is judged on value against cost; no over-engineering; never compromise compliance, money or quality (founder, 12 Nov). | prose | 12 Nov |
| P-500 | The right sample for the purpose in every analysis, named beside the number; speed = app-code PRs or qa-confirmed Works. | prose | 12 Nov |
| P-501 | lead-watch and flow-watch count only app-code PRs (by files) and Works across M2, M3, M4 and T. | script: lead-watch.sh, flow-watch.sh, app-code-prs.sh | 12 Nov |
| P-502 | No hit-and-trial: measured evidence, root cause, a named framework, standard libraries first; a guess is a labelled hypothesis with its test. | prose | 12 Nov |
| P-503 | Lead reports carry decided (up to five), doing (3-4) and the one thing needing the founder; planners' documents are challenged first. | prose | 12 Nov |
| P-504 | The repository is public: no specifics of the team's app in git; a classifier refusal is never routed around. | prose | 12 Nov |
| P-505 | A PR that once carried team-app detail never merges: its final files land as one clean commit on a fresh branch. | prose | 12 Nov |
| P-508 | Never leave a question card open when the founder may leave (cron fires only when idle); reference folder `reference/` (P-509). | prose | 13 Nov |
| P-511 | One Lead (amended by P-550); the Fable planner is the founder's read-only strategy desk. | prose | 13 Nov |
| P-512 | Questions go in the end-of-turn box (cards only while the founder types); expert facts revalidated on canada.ca (see P-541). | prose | 13 Nov |
| P-514 | The Lead and the desk talk directly; each check looks at the desk's track file; the founder never relays. | prose (lead-watch skill) | 13 Nov |
| P-515 | Every step rests on a framework chosen after comparing the top options; the cto-review skill measures DORA and flow. | prose | 13 Nov |
| P-521 | The Lead orchestrates; only the Lead writes records; big desk items get a fresh Opus reviewer's verdict. | hook: stop-check.sh (part: lane edits to records) | 13 Nov |
| P-530 | Founder blockers are pushed: a red "Waiting on the founder" line atop STATE, a push notification, re-sent each check after 30 min. | prose | 13 Nov |
| P-532 | The Lead is the founder's single contact and owns every session; hand-over lists each lane's last message and whom it waits on. | script: handover.sh (part) | 13 Nov |
| P-536 | Small fixes the desk and the Lead both recommend need no founder word, except money, a lower bar, a day or more, permissions, security. | prose | 13 Nov |
| P-539 | This repository stays public; integration and strategy content goes only to private notes. | prose | 13 Nov |
| P-541 | No immigration expert is booked: a value leaves Sample only with an official citation (page, quote, date). | prose | 13 Nov |
| P-542 | No product row waits on pipeline, tooling or integration work. | prose | 13 Nov |
| P-551 | No new account, key or purchase by anyone but the founder; named people for on call, support and breach before the first customer. | prose | 13 Nov |
| P-553 | Launch on our own build; open-source parts only through STANDARDS §1 (P-563 stands). | prose | 13 Nov |
| P-555 | Tokens and accounts are the founder's; no usage cap; everything on GitHub so a new account resumes in minutes (P-552, P-554 withdrawn). | prose | 13 Nov |
| P-556 | No limit is not waste: every token is justified by the outcome. | prose | 13 Nov |
| P-565 | Vendor facts from public sources; a working session past about half its context is replaced after a written hand-over. | prose | 14 Nov |
| P-566 | Firm sign-up is the standard self-serve SaaS flow; questions best practice settles are decided by the Leads with evidence. | prose | 14 Nov |
| P-576 | Order of work: critical features, then builder speed (contracts, ports with fakes, schema first); never two lanes on one busy file. | prose | 14 Nov |
| P-580 | The Lead fills vendor forms while the founder watches; the founder types every password, code and card detail. | prose | 14 Nov |
| P-582 | Every item left out of the first build is a BACKLOG X-row, added in the same change. | prose | 14 Nov |
| P-587 | From public repositories only gold-class code, judged at the STANDARDS §1 gate. | prose | 14 Nov |
| P-592 | `MVP-CHECKLIST.md` is the one tracking page for Release 1. | prose | 14 Nov |
| P-593 | The board is the one door with a Library: one master per document, a page is a view (P-594: "Release 1 (production grade)"). | prose | 14 Nov |
| P-595 | Every Release 1 backlog row carries a Source:; a shaped row with no source should fail CI (no such step found 15 Nov). | prose | 14 Nov |
| P-596 | Every board number carries source, sha, time and class; missing data shows "not measured"; the data is validated and reconciled. | script: cockpit-data.py, cockpit-reconcile.py; CI: cockpit-tests.yml | 14 Nov |
| P-597 | The strategy desk runs on Fable 5.2 at high effort, set after the start, with five rules. | prose | 14 Nov |
| P-599 | Ready rows at least two per lane; first-time green; at most two review rounds; day-3 check 17 Nov (date per P-609). | prose | 14 Nov |
| P-600 | Schema rows run in parallel, each with its own file and migration folder, additive, a later stamp; the Lead reads the migration before the label (P-601). | prose | 14 Nov |
| P-602 | Overnight on one account; lanes push and STATE says where to resume before 95%. | prose | 14 Nov |
| P-604 | Builders and qa read only the requirement text trace-requirements.py --brief prints. | prose | 15 Nov |
| P-605 | Opus 5.5 is the working model; Fable 5.2 only for the desk and challenges; no model switch mid-session. | prose | 15 Nov |
| P-606 | Finish whole: each Done when names its test; no new capability while a started one has parts missing (amended P-613 (1)); qa scores when all parts merged. | prose | 15 Nov |
| P-607 | Trust never negative; fail-closed audit; support sessions read-only; no guessing, times only from the clock (A73). | prose | 15 Nov |
| P-610 | Fix each problem the narrowest way; a row's PR under 800 changed lines; re-review reads only new commits. | prose | 15 Nov |
| P-611.1 | Each Lead rule has a script, hook or CI enforcer where one can be written; this register names it. | script: check-docs.sh (register field; test check-rule-register.sh) | 15 Nov |
| P-611.2 | One queue for reports, questions, blockers and approvals with owner, ack, timeout (45 min ACT, 90 min founder); no hand-over with an un-acked item. | script: items.py, lead-queue.sh, handover.sh (tests check-items.sh, check-handover.sh) | 15 Nov |
| P-611.3 | Monday "what's new" check into cockpit/whats-new.json, shown as a board box. | prose | 15 Nov |
| P-609 | Release 1 = all 101 together, committed date 29 Nov; under 50% at the 17 Nov check, options to the founder at once. | prose | 15 Nov |
| P-613 | Plan C: lanes may be added for nearly-done capabilities; a feeding Lead; non-urgent asks batched at 09:00 and 21:00 IST; qa per module group. | prose | 15 Nov |
| P-614 | Target kept: all 101 by 29 Nov; no gate lowered; the 17 Nov check reports the forecast with the same measures. | prose | 15 Nov |
| P-615 | Environment as memory: this register (start read ≤ 70k tokens), module cards checked by CI, why-comments, three behaviour numbers; no memory agent. | script: check-docs.sh (part: register, 25 KB) | 15 Nov |
| P-608 | Model and effort at every start: Opus 5.5 medium; high for reviewers, breakers, the fresh reader, risky rows; Fable 5.2 medium for specifying and challenges. | prose | 15 Nov |
| P-557 | Always committed, always resumable: push every step; STATE says what is true, in flight and next (AGENTS rule 10). | script: lead-heartbeat.sh (part) | 13 Nov |

## When a capability counts as Works (detail: `rules/works.md`)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-339 | Works = pack green on main's head on GitHub's runners on the counted data, run id in qa's row, an independent re-run, a fresh Opus reader's verdict (P-322, P-290, P-303, P-432). | CI: ci.yml gate B (part) | P-612 |
| P-348.3 | Gate A: qa walks the capability by screens to the next one's first step. | prose (qa skill) | P-612 |
| P-317 | Gate B: CI fails a PR naming a capability with an open Major or Critical unless it fixes it; never drop a capability id (P-330 (7)). | CI: ci.yml gate B (gate-b.mjs) | P-612 |
| P-442 | Adobe Validate proves Paper PDF copies only; a capability with no PDF is never held on it. | prose | P-612 |
| P-305 | An open Major or Critical keeps a capability Partial. | CI: ci.yml gate B (part) | P-612 |
| P-405 | A run with no pack, no server or only the fixture is Not tested; a WAIT or HELD line is never green (P-334 (6)). | prose (qa skill) | P-612 |
| P-439 | Cloud lanes cannot dispatch Actions: they ask, and the Lead dispatches nightly.yml. | prose | P-612 |
| P-312.1 | Live AI tokens and write tokens are never widened for lanes (P-387). | CI: check-write-token.sh (part) | P-612 |

## Builders and qa (detail: `rules/builders-and-qa.md`)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-278 | One row per session and per PR, fresh branch from origin/main, one session per branch (P-436 (2)). | script: lane.sh (part: binding) | P-612 |
| P-526 | No duplicates: a duplicate check before shaping and building, one `Duplicate check:` line in row and PR. | prose | 13 Nov |
| P-526.2 | Rows name what they touch and wait on; overlapping touch lists never run at once. | prose | 13 Nov |
| P-526.3 | No ruling lives only in an unmerged PR: records PRs over 24 h are merged or closed. | prose | 13 Nov |
| P-337 | A lane ends when its PR is labelled; a warm lane may take one more row it knows (P-341). | prose | P-612 |
| P-436.4 | PRs under ~800 lines, split by layer: schema, API, screen (P-438 (1), P-610). | prose | P-612 |
| P-438.2 | One builder at a time on prisma/schema.prisma and api/src/case-prepare.ts; the Lead names the holder in STATE. | prose | P-612 |
| P-348.8 | Two PRs carrying a migration take different stamps. | prose | P-612 |
| P-270 | Merge main in only on a conflict; a PR that has merged main three times lands next (P-436 (1)). | prose | P-612 |
| P-303 | Reviews on Opus: reviewer always; breaker only for money, schema, permissions or a new screen (P-278). | prose | P-612 |
| P-277 | Re-review reads only the diff since the last Approve; a pure main merge needs no review (P-318 (1)); at most two rounds, then the Lead decides (P-293 (3)). | prose | P-612 |
| P-385 | Label review: approved only on a `Reviewer: Approve <exact head sha>` comment and green CI; builders label, qa labels paid-result PRs (P-277, P-275). | CI: label-guard.yml, label-guard.sh, label-sweep.sh (tests check-label-guard.sh, check-label-sweep.sh) | P-612 |
| P-352 | New screens: a walk by screens before the first review and a best-in-class section in the concept (P-392). | prose | P-612 |
| P-319 | No combination key, form number or program-specific branch in engine code (P-425). | prose (slice guards retired 8 Nov) | P-612 |
| P-348.4 | A mutating route a pack's set-up calls needs a caller in web/src or an allow-list line. | CI: route-has-screen.mjs | P-612 |
| QA-221 | Each form's own official words decide who fills it and what it asks (ruling, 4 Nov). | prose | 4 Nov |
| P-335 | No multi-tenant work in the reference-app code, except the PF-* and FO-* modules (P-357, P-559); POC code held to production grade. | prose | P-612 |
| P-251 | Held parts are listed in STATE, nobody builds them (P-265, P-284, P-316); EE police and medical block is the one hard stop besides Validate (P-172, P-315). | prose | P-612 |
| P-293.2 | Questions as a PR comment headed "Question for the tech lead"; briefs say report to the current Lead (P-373, P-409). | script: current-lead.sh, check-docs.sh (part: one current_lead line) | P-612 |
| P-314 | Builders never edit STATE.md, RULES.md, DECISIONS.md, BACKLOG.md; qa alone edits qa/CAPABILITIES.md and qa/BUGS.md. | hook: stop-check.sh (Stop) | P-612 |
| P-434.2 | qa: one row per lane in parallel, packs on GitHub's machines, gate A by screens. | prose | P-612 |
| P-175 | Live AI off and US$0 in every lane; never press a priced button. | script: p2/ledger.ts, launcher live off by default (part) | P-612 |

## The tech lead (detail: `rules/tech-lead.md`)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-479 | Co-founder's copy parked (P-480): the Sample PDF goes by hand later, accepted on its checksum, nothing committed. | prose | P-612 |
| P-478 | Every report opens with "Needs you" then "Decide when you can"; every founder action is also a card; any spend is red with US$. | prose | P-612 |
| P-591 | One cockpit built from script data, refreshed each check, its link opening every report; a fresh reviewer weekly; never duplicate work. | script: cockpit-data.py; CI: cockpit-tests.yml (part: data) | 14 Nov |
| P-486 | "Decide when you can" is the Lead's (research, decide, record, implement); to the founder: money, a lower bar, a day or more, permissions, security, unsettled immigration facts. | prose | 11 Nov |
| P-486.2 | Lane briefs: context limit ~400k tokens; confirm the sent bubble; sessions are not started over Remote Control. | prose | 11 Nov |
| P-384 | The founder gives product direction only; the Lead owns the pipeline, paid runs included. | prose | 7 Nov |
| P-402 | Standing approvals: label on Approve and green, own records PRs, requeue, retarget, draft toggle, re-run failed parts, dispatch nightly (P-410, P-434). | hook: merge-guard.sh (part: only the Lead copy merges) | P-612 |
| P-423 | The Lead reads the diff before labelling money, permissions, schema, a migration, .github/ or .mergify.yml. | prose | P-612 |
| P-294 | Product questions that decisions, canada.ca or best practice settle are ruled by the Lead and recorded. | prose | P-612 |
| P-390 | Preference questions go to the founder one at a time with a recommendation, listed in STATE; while away, proceed when reversible. | prose | P-612 |
| P-254 | Impact on time, cost and quality is stated before recording a choice. | prose | P-612 |
| P-170 | Immigration values only from official sources with page, quote and date (AGENTS rule 4). | prose | P-612 |
| F-6Nov | Checks every 30 min, prompt exactly `run lead-watch; read STATE Start here`; row details in STATE, never in the prompt. | hook: lead-check-guard.sh (CronCreate); script: lead-heartbeat.sh (tests check-lead-cron.sh, check-lead-heartbeat.sh) | 6 Nov |
| P-339.2 | Each check reads the app view and every lane and acts at once on a stalled lane (P-381, P-420); a lane counts only after a push (P-326). | script: lead-watch.sh (part) | P-612 |
| P-338 | Every report: Works, merged, blocked, next three with IST times, on time or late and why; hourly to the founder (P-434). | prose | P-612 |
| P-348.5 | Sessions start only in a founder-typed turn, cloud first; the Mac runs the Lead, demo, qa and at most two builders. | hook: lane-preflight.sh --hook (part: start_session) | P-612 |
| P-286 | Two idle standby Leads; numbering in series 2 (P-433). | prose | P-612 |
| P-388 | No prompt-waiting call while the founder is away; no hand-over with an in-process subagent running (P-409). | prose | P-612 |
| F-7Nov | Never run guard or test suites in the main copy: use a scratch clone. | prose | 7 Nov |
| P-363 | GitHub through curl with `gh auth token`. | prose | P-612 |
| P-387 | .claude/settings.json stays as on main; only the founder widens permissions; a refused write is never rerouted through a lane or split. | hook: stop-check.sh (part: lane edits); sandbox denies settings writes | 7 Nov |
| P-302 | Times only from `TZ=Asia/Kolkata date`. | script: check-docs.sh (part: STATE time warning) | P-612 |
| P-336 | Records by the Lead alone; STATE one page ≤ 12 KB; DECISIONS appended newest first; records daily and at hand-over; records PRs merge when the queue is empty (P-436 (3)). | script: check-docs.sh (part: STATE 12 KB); CI: records-label.yml | P-612 |
| P-440 | This page is refreshed at every hand-over and lags DECISIONS by at most 3 rows. | script: check-docs.sh (RULES LAG; test check-rules-lag.sh) | 9 Nov |
| P-371 | Never cancel a CI run; re-run the failed part alone (P-384); product code only through the queue; check fixes may land ahead on green (P-214). | prose | P-612 |

## Tokens, money, account (detail: `rules/tokens-money-account.md`)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-436.1 | Cost is context size: about 75% of spend is long sessions re-reading 300k+ contexts. | prose | 9 Nov |
| P-446 | A Lead hands over at the first check after 200k tokens beyond its start read, never compacts; at ~150k the standby reads RULES and STATE once. | prose (lead skill) | 9 Nov |
| P-446.6 | Context by session type: builders end with the row (split before ~400k), qa ~300k, reviewers fresh (~150k); nobody reaches auto-compact. | prose | 9 Nov |
| P-440.2 | The start read is this page plus the newer DECISIONS rows; never re-read big files on a check (P-372 (3)). | script: check-docs.sh (part: 25 KB, lag) | 15 Nov |
| P-440.3 | No raw dumps into a Lead's context: filter every tool output. | prose | 9 Nov |
| P-440.4 | Burn watch every check; over 3%/h twice in a row: end idle sessions, hand over any over 250k, tell the founder. | script: usage-log.sh (part: logging) | 9 Nov |
| P-436.6 | Models: Opus builds, reviews, breaks and reads fresh; Sonnet or Haiku for read-only side work; standbys idle; Fable never builds or reviews (P-455). | prose | P-612 |
| P-445.2 | Unused connectors stay off. | prose | 11 Nov |
| P-175.2 | Live AI is off on every copy; a live call only as a paid run the Lead approved, from a Terminal tab. | script: launcher live off by default (part) | P-612 |
| P-295 | Day cap US$30, US$50 on 9 Nov (P-309, P-429, P-434); the Lead approves inside it, the founder above. | script: p2/ledger.ts (part: reserve before the call) | 9 Nov |
| P-295.2 | Every paid run: usual and worst cost first, worst reserved in the ledger, one attempt, an independent check, one PR per result, qa labels; job cap US$5 (P-232). | script: p2/ledger.ts (part) | P-612 |
| P-377 | Live runs from a Terminal tab (sandbox network); a paid run on the data Works counts on, never fixture-only. | prose | 9 Nov |
| P-461 | Use the plan to its limit (P-344; P-431 replaced); the weekly meter is not a stop line; at 98% tell the founder; lanes push after every step (P-458). | prose | 11 Nov |
| P-458 | On an account switch: get_usage first, then `RESUME-ON-NEW-ACCOUNT.md`. | prose | 11 Nov |
| P-312 | Process freeze until 10 Nov 22:30 IST (expired); changes on a measured number, checked after a fixed period, kept or undone. | prose | 10 Nov |

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

## Prose-only rows: G-4 candidates (P-611)
G-4's five first (BACKLOG G-4): PR still open before a push (P-557); reviewer model Opus (P-303, P-608); Done when in every brief (P-606); label only after Approve on the current head (P-385, verify); unmerged lane branch sweep (P-557). All 99 rows marked `prose`: P-450.1, P-418, P-464, P-470, P-468, P-450.2, P-473, P-569.3, P-569.1, P-569.2, F-12Nov, P-500, P-502, P-503, P-504, P-505, P-508, P-511, P-512, P-514, P-515, P-530, P-536, P-539, P-541, P-542, P-551, P-553, P-555, P-556, P-565, P-566, P-576, P-580, P-582, P-587, P-592, P-593, P-595, P-597, P-599, P-600, P-602, P-604, P-605, P-606, P-607, P-610, P-611.3, P-609, P-613, P-614, P-608, P-348.3, P-442, P-405, P-439, P-526, P-526.2, P-526.3, P-337, P-436.4, P-438.2, P-348.8, P-270, P-303, P-277, P-352, P-319, QA-221, P-335, P-251, P-434.2, P-479, P-478, P-486, P-486.2, P-384, P-423, P-294, P-390, P-254, P-170, P-338, P-286, P-388, F-7Nov, P-363, P-371, P-436.1, P-446, P-446.6, P-440.3, P-436.6, P-445.2, P-377, P-461, P-458, P-312.
