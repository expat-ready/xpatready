# Rule register (Lead keeps it; as of **P-815**, 24 Nov 01:35 IST; earlier: `history/RULES-2026-11-23-2302-ld10-as-of-P-809.md` + older)

One line per rule: `ID | rule | enforced by | as of` (P-611, P-615); what each field and ID form means, word for word: `rules/register-legend.md`.

**Account facts:** `expat-ready/xpatready` on Enterprise Cloud since 18 Nov (500 jobs documented, 1-6 measured); detail and the Pro-era line in `rules/tokens-money-account.md`.

**Retired and moved rows** (B193 part 5; P-312, P-611c, P-641 since): `rules/merged-and-retired-2026-11-16.md`.

## Goal and order (detail: `rules/goal-and-order.md`)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| IDX-1 | Milestone plans stand as recorded (M3 done 29/29 10 Nov; the Bake; the Chrome extension, 40 sessions); the decision list is word for word in `rules/goal-and-order.md` › Index lists. | prose | 12 Nov |
| P-690 | `design/full-power-plan-2026-11-17.md` is the one action list; items leave only when done or dropped by the founder; briefs quote item IDs. | script: plan-watch.py via check-docs.sh and lead-watch.sh | 18 Nov |
| P-728 | Ten a day: J-test merges in the item's last PR; 6 batches at once only after P-730's conditions; proof automatic at the last merge; J4 beside J2; 4 qa lanes. | prose | 19 Nov |
| IDX-18 | Factory and finish-by-capability rows P-724, P-719 stand: word for word in `rules/goal-and-order.md` › Moved 20 Nov. | prose | 20 Nov |
| P-418 | Pick order each check: red main, merged work awaiting qa, blockers, Partials, drafted, new. Full row: `rules/tech-lead.md`. | prose | P-612 |
| P-464 | XFA reuse: ours and theirs head to head per functionality, the better wins, a tie keeps ours; adopt and improve theirs when it is the better base (P-465, P-467). | prose | 11 Nov |
| P-470 | The XFA code is ours: small fixes in PATCHES.md, extended only where our pathways use the form; never read the ER v2 repository. | prose | 11 Nov |
| P-462 | A cloud lane for every ready independent row; lanes push after each step; Mac starts under the preflight caps (P-468). | hook: lane-preflight.sh --hook (part: Mac caps) | 11 Nov |
| P-468 | Stale copies are deleted only when the work is on GitHub, nothing is uncommitted, untracked files are in `archive/`, no session uses them; databases via prune-test-dbs.sh. | prose | 11 Nov |
| IDX-2 | One-time or standing process directions (with P-508, P-512, P-514, P-547, P-566, P-580, P-583, P-589, P-592); the list and rows word for word in `rules/goal-and-order.md` › Index lists. | prose | 16 Nov |
| P-473 | UX style: calm work app, plain second-person client questions with "Why we ask", quiet surfaces, no motion library. | prose | 11 Nov |
| P-558 | Two Leads: Lead B holds platform and front office in fenced modules; the release Lead holds release, Bake, case side, join, DB-SPLIT, firm walls, shared records (P-559). | prose | 13 Nov |
| IDX-5 | Product and Release 1 scope rulings stand as recorded (+P-698, P-700 to P-702, P-704); list in `rules/goal-and-order.md`. | prose | 15 Nov |
| IDX-4 | Product rulings stand in their DECISIONS rows (read one when its capability is touched); the decision list is word for word in `rules/goal-and-order.md` › Index lists. | prose | 14 Nov |
| P-488 | Gate B on a PR runs the REGRESSION-HELD checkpoint packs; records never claim Works that an open Major contradicts. | CI: ci.yml gate B (part) | 12 Nov |
| F-12Nov | Every change is judged on value against cost; no over-engineering; never compromise compliance, money or quality (founder, 12 Nov). | prose | 12 Nov |
| P-500 | The right sample for the purpose in every analysis, named beside the number; speed = app-code PRs or qa-confirmed Works. | script: cockpit-data.py (part: board numbers carry source and class, P-596) | 12 Nov |
| P-501 | lead-watch and flow-watch count only app-code PRs (by files) and Works across M2, M3, M4 and T. | script: lead-watch.sh, flow-watch.sh, app-code-prs.sh | 12 Nov |
| P-502 | No hit-and-trial: measured evidence, root cause, a named framework, standard libraries first; a guess is a labelled hypothesis with its test. | prose | 12 Nov |
| P-503 | Lead reports carry decided (up to five), doing (3-4) and the one thing needing the founder; planners' documents are challenged first. | prose | 12 Nov |
| P-504 | The repository is public: no specifics of the team's app in git; a classifier refusal is never routed around. | prose | 12 Nov |
| P-505 | A PR that once carried team-app detail never merges: its final files land as one clean commit on a fresh branch. | prose | 12 Nov |
| P-521 | The Lead orchestrates; only the Lead writes records; big desk items get a fresh Opus reviewer's verdict. | hook: stop-check.sh (part: lane edits to records) | 13 Nov |
| P-530 | Founder blockers are pushed: a red "Waiting on the founder" line atop STATE, a push notification, re-sent each check after 30 min. | prose | 13 Nov |
| P-532 | The Lead is the founder's single contact and owns every session; hand-over lists each lane's last message and whom it waits on. | script: handover.sh (part) | 13 Nov |
| P-542 | No product row waits on pipeline, tooling or integration work. | prose | 13 Nov |
| P-551 | No new account, key or purchase by anyone but the founder; named people for on call, support and breach before the first customer. | prose | 13 Nov |
| P-553 | Launch on our own build; open-source parts only through STANDARDS §1 (P-563 stands). | prose | 13 Nov |
| P-565 | Vendor facts from public sources; a working session past about half its context is replaced after a written hand-over. | prose | 14 Nov |
| P-576 | Order of work: critical features, then builder speed (contracts, ports with fakes, schema first); never two lanes on one busy file. | prose | 14 Nov |
| P-582 | Every item left out of the first build is a BACKLOG X-row, added in the same change. | prose | 14 Nov |
| P-587 | From public repositories only gold-class code, judged at the STANDARDS §1 gate. | prose | 14 Nov |
| P-593 | The board is the one door with a Library of masters; full row `rules/tech-lead.md`. | script: library-freshness.py (part: a master behind its feeds is listed) | 14 Nov |
| IDX-13 | (P-595 every R1 row has a Source:; P-596 board numbers carry source, sha, time) stand: word for word in `rules/goal-and-order.md`. | script: cockpit-data.py | 19 Nov |
| IDX-12 | (P-597 desk on Fable; P-599 two ready rows per lane; P-613 Plan C lanes; P-614 target kept, same measures) stand: word for word in `rules/goal-and-order.md`. | prose | 19 Nov |
| P-600 | Schema rows run in parallel, each with its own file and migration folder, additive, a later stamp; the Lead reads the migration before the label (P-601). | prose | 14 Nov |
| P-604 | Builders and qa read only the requirement text trace-requirements.py --brief prints. | prose | 15 Nov |
| P-605 | Opus 5.5 is the working model; Fable 5.2 only for the desk and challenges; no model switch mid-session. | hook: agent-model-guard.sh --hook (part; `rules/tokens-money-account.md`) | 15 Nov |
| P-606 | Finish whole: Done when names its test; no new capability while one has parts missing. Full row: `rules/goal-and-order.md`. | CI: pr-rules (part) | 15 Nov |
| P-607 | Trust never negative; fail-closed audit; support sessions read-only; no guessing, times only from the clock (A73). | prose | 15 Nov |
| P-610 | Fix each problem the narrowest way; a row's PR under 800 changed lines; re-review reads only new commits. | CI: pr-rules pr-size.sh (part: 800 changed lines; not yet a required check) | 15 Nov |
| P-611a | Each Lead rule has a script, hook or CI enforcer where one can be written; this register names it. | script: check-docs.sh (register field; test check-rule-register.sh) | 15 Nov |
| P-611b | One queue for reports, questions, blockers, approvals (owner, ack, timeout); no hand-over with an un-acked item. Full row: `rules/tech-lead.md`. | script: items.py | 15 Nov |
| P-609 | Release 1 = all 101 together, 12 Dec, aim 6-7 Dec (P-815); re-decide 1 Dec if under 72 proven. | prose | 24 Nov |
| P-615 | Environment as memory: this register (start read ≤ 70k tokens), module cards checked by CI, why-comments, three behaviour numbers; no memory agent. | script: check-docs.sh (part: register, 25 KB) | 15 Nov |
| IDX-11 | (P-608: model and effort at every start) stands: word for word in `rules/goal-and-order.md`; P-725 overrides it for the new account's Lead. | hook: lane-preflight.sh | 19 Nov |
| P-557 | Always committed, always resumable: push every step; STATE says what is true, in flight and next (AGENTS rule 10). | prose | 13 Nov |
| P-694 | A hand-recorded payment's reversal may take trust below zero, shown red (supersedes P-607 (1)); no other outflow does. | prose (R1.58) | 18 Nov |

## When a capability counts as Works (detail: `rules/works.md`)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-339 | Works = pack green on main's head on GitHub's runners on the counted data, run id in qa's row, an independent re-run, a fresh Opus reader's verdict (P-322, P-290, P-303, P-432). | CI: ci.yml gate B (part) | P-612 |
| P-348c | Gate A: qa walks the capability by screens to the next one's first step. | prose (qa skill) | P-612 |
| P-317 | Gate B: CI fails a PR naming a capability with an open Major or Critical unless it fixes it; never drop a capability id (P-330 (7)). | CI: ci.yml gate B (gate-b.mjs) | P-612 |
| P-442 | Adobe Validate proves Paper PDF copies only; a capability with no PDF is never held on it. | prose | P-612 |
| P-305 | An open Major or Critical keeps a capability Partial. | CI: ci.yml gate B (part) | P-612 |
| P-405 | A run with no pack, no server or only the fixture is Not tested; a WAIT or HELD line is never green (P-334 (6)). | prose (qa skill) | P-612 |
| P-439 | Cloud lanes cannot dispatch Actions: they ask, and the Lead dispatches nightly.yml. | prose | P-612 |
| P-312a | Live AI tokens and write tokens are never widened for lanes (P-387). | CI: check-write-token.sh (part) | P-612 |

## Builders and qa (detail: `rules/builders-and-qa.md`)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-278 | One row per session and per PR, fresh branch from origin/main, one session per branch (P-436 (2)). | script: lane.sh (part: binding) | P-612 |
| P-526 | No duplicates: a duplicate check before shaping and building, one `Duplicate check:` line in row and PR. | CI: pr-rules brief-check.sh (part: the "Duplicate check:" line; not yet a required check) | 13 Nov |
| P-526b | Rows name what they touch and wait on; overlapping touch lists never run at once. | prose | 13 Nov |
| P-526c | No ruling lives only in an unmerged PR: records PRs over 24 h are merged or closed. | prose | 13 Nov |
| P-337 | A lane ends when its PR is labelled; a warm lane may take one more row it knows (P-341). | prose | P-612 |
| P-438b | One builder at a time on prisma/schema.prisma and api/src/case-prepare.ts; the Lead names the holder in STATE. | prose | P-612 |
| P-270 | Merge main in only on a conflict; a PR that has merged main three times lands next (P-436 (1)). | prose | P-612 |
| P-303 | Reviews on Opus: reviewer always; breaker only for money, schema, permissions or a new screen (P-278). | hook: agent-model-guard.sh --hook (part; `rules/tokens-money-account.md`) | P-612 |
| P-277 | Re-review reads only the diff since the last Approve; a pure main merge needs no review (P-318 (1)); at most two rounds, then the Lead decides (P-293 (3)). | prose | P-612 |
| P-385 | Label only on `Reviewer: Approve <exact head sha>` and green CI. Full row: `rules/builders-and-qa.md`. | CI: label-guard.yml | P-612 |
| P-352 | New screens: a walk by screens before the first review and a best-in-class section in the concept (P-392). | prose | P-612 |
| P-319 | No combination key, form number or program-specific branch in engine code (P-425). | prose (slice guards retired 8 Nov) | P-612 |
| P-348d | A mutating route a pack's set-up calls needs a caller in web/src or an allow-list line. | CI: route-has-screen.mjs | P-612 |
| QA-221 | Each form's own official words decide who fills it and what it asks (ruling, 4 Nov). | prose | 4 Nov |
| P-335 | No multi-tenant work in the reference-app code, except the PF-* and FO-* modules (P-357, P-559); POC code held to production grade. | prose | P-612 |
| P-251 | Held parts are listed in STATE, nobody builds them (P-265, P-284, P-316); EE police and medical block is the one hard stop besides Validate (P-172, P-315). | prose | P-612 |
| P-293b | Questions as a PR comment headed "Question for the tech lead"; briefs say report to the current Lead (P-373, P-409). | script: current-lead.sh, check-docs.sh (part: one current_lead line) | P-612 |
| P-314 | Builders never edit STATE.md, RULES.md, DECISIONS.md, BACKLOG.md; qa alone edits qa/CAPABILITIES.md and qa/BUGS.md. | hook: stop-check.sh (Stop) | P-612 |
| P-434b | qa: one row per lane in parallel, packs on GitHub's machines, gate A by screens. | prose | P-612 |
| P-175 | Live AI off and US$0 in every lane; never press a priced button. | script: p2/ledger.ts, launcher live off by default (part) | P-612 |

## The tech lead (detail: `rules/tech-lead.md`)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-478 | Every report opens with "Needs you" then "Decide when you can"; every founder action is also a card; any spend is red with US$. | prose | P-612 |
| P-591 | One cockpit from script data, refreshed each check; full row `rules/tech-lead.md`. | script: cockpit-data.py; CI: cockpit-tests.yml (part: data) | 14 Nov |
| P-486 | "Decide when you can" is the Lead's (research, decide, record, implement); to the founder: money, a lower bar, a day or more, permissions, security, unsettled immigration facts. | prose | 11 Nov |
| P-486b | Lane briefs: context limit ~400k tokens; confirm the sent bubble; sessions are not started over Remote Control. | prose | 11 Nov |
| P-384 | The founder gives product direction only; the Lead owns the pipeline, paid runs included. | hook: merge-guard.sh (part: only the Lead copy merges, closes or reviews) | 7 Nov |
| P-402 | Standing approvals (label, records PRs, requeue, retarget); full row `rules/tech-lead.md`. | hook: merge-guard.sh (part: only the Lead copy merges) | P-612 |
| P-423 | The Lead reads the diff before labelling money, permissions, schema, a migration, .github/ or .mergify.yml. | prose | P-612 |
| P-294 | Product questions that decisions, canada.ca or best practice settle are ruled by the Lead and recorded. | prose | P-612 |
| P-390 | Preference questions go to the founder one at a time with a recommendation, listed in STATE; while away, proceed when reversible. | prose | P-612 |
| P-254 | Impact on time, cost and quality is stated before recording a choice. | prose | P-612 |
| P-170 | Immigration values only from official sources with page, quote and date (AGENTS rule 4). | prose | P-612 |
| F-6Nov | Checks every 30 min, prompt exactly `run lead-watch; read STATE Start here`. Full row: `rules/tech-lead.md`. | hook: lead-check-guard.sh | 6 Nov |
| P-339b | Each check reads the app view and every lane and acts at once on a stalled lane (P-381, P-420); a lane counts only after a push (P-326). | script: lead-watch.sh (part) | P-612 |
| P-338 | Every report: Works, merged, blocked, next three with IST times, on time or late and why; hourly to the founder (P-434). | prose | P-612 |
| P-348e | Sessions start only in a founder-typed turn, cloud first; the Mac runs the Lead, demo, qa and at most two builders. | hook: lane-preflight.sh --hook (part: Mac disk, load, copy cap) | P-612 |
| P-286 | Two idle standby Leads; numbering in series 2 (P-433). | prose | P-612 |
| P-388 | No prompt-waiting call while the founder is away; no hand-over with an in-process subagent running (P-409). | prose | P-612 |
| F-7Nov | Never run guard or test suites in the main copy: use a scratch clone. | prose | 7 Nov |
| P-363 | GitHub through curl with `gh auth token`. | prose | P-612 |
| P-387 | settings.json stays as on main; only the founder widens permissions; full row `rules/tech-lead.md`. | hook: stop-check.sh (part: lane edits); sandbox denies settings writes | 7 Nov |
| P-302 | Times only from `TZ=Asia/Kolkata date`. | prose (check-docs.sh warns on STATE times, never fails) | P-612 |
| P-336 | Records by the Lead alone; STATE ≤ 12 KB; DECISIONS appended. Full row: `rules/tech-lead.md`. | script: check-docs.sh | P-612 |
| P-440 | This page is refreshed at every hand-over and lags DECISIONS by at most 3 rows. | script: check-docs.sh (RULES LAG; test check-rules-lag.sh) | 9 Nov |
| P-371 | Never cancel a CI run; re-run the failed part alone (P-384); product code only through the queue; check fixes may land ahead on green (P-214). | prose | P-612 |
| P-618 | Outside dependencies: start at need − lead time − 2× buffer; 🔴 when due or stuck 48 h. Full row: `rules/tech-lead.md`. | script: outside-deps-watch.py | 15 Nov |
| P-622 | Theory of Constraints: finish before starting (WIP per group), hot files split, one full run per change, fewer Leads; gates unchanged. | prose (B193, B194) | 16 Nov |
| P-623 | WIP limits per group and who orders qa's queue: row in `rules/tech-lead.md` › Moved 19 Nov. | prose (B193, B194) | 16 Nov |
| P-628 | While the founder is away the Lead decides product questions, records each ruling and its reason for his review. | prose | 16 Nov |
| P-632 | A needed tool that is off goes to the founder at once with the best fix, never a workaround (`design/required-tools.md`). | prose (B198) | 16 Nov |
| P-635 | Enforcement defaults (overnight hooks, daily settings batch, pr-rules timing, hook speed): row word for word in `rules/tech-lead.md`. | prose | 16 Nov |
| P-636 | Board words Planned, Built, Proven (+ In progress); only Proven counts as delivered; Refresh on demand. | script: cockpit-data.py (part) | 16 Nov |
| P-637 | Labels need no founder click: the bot labels on the rules; a Lead-read path also needs "Lead read the diff: <sha>" (B200). | CI: queue-gate.sh label (part) | 16 Nov |
| P-639 | The board and the Lead's check verify each other. Full row: `rules/tech-lead.md`. | prose (part script; see full row) | 16 Nov |
| P-644 | Build 10, prove 10 R1 rows a day (floor 7/7); who leads what: row in `rules/tech-lead.md` › Moved 19 Nov. | prose (plan in design/) | 16 Nov |
| P-646 | Jam alarms each check; drafts until Approve; act unasked: row in `rules/tech-lead.md` › Moved 19 Nov. | script: lead-watch.sh (1b, 2b) | 16 Nov |
| P-647 | Each check reads claude.ai/code statuses and acts on waiting lanes; no lane waits on a network change. | prose (built-in browser script) | 16 Nov |
| P-651 | (with P-648, P-649) CI overflow on the Namespace trial; full tests once, in the merge queue. | prose | 17 Nov |
| IDX-7 | Dated rulings (P-616, P-619, P-620, P-621 and the rest) stand as recorded; the list word for word in `rules/goal-and-order.md`. | prose | 15 Nov |
| IDX-10 | Rows (IDX-6 one-time exceptions, P-617 and others; P-539 public repo, private strategy) stand: word for word in `rules/goal-and-order.md` (Lead 87, 19 Nov). | prose | 19 Nov |
| IDX-8 | Org move rows (P-657, P-660, P-661, P-662) stand as recorded; word for word in `rules/tech-lead.md` › Org move (moved 17 Nov by Lead 77). | prose | 17 Nov |
| P-663 | Ramp targets by date and the stop on new rows while the queue is slow: row in `rules/tech-lead.md` › Moved 19 Nov. | prose | 17 Nov |
| IDX-15 | 17 Nov rows (P-664 qa records first, P-665 CI-B, P-666 high effort and 48 h stop, P-667 rules v2, P-668 cards, P-669 5-hour bar, P-670 T7 deny lines; P-693 multi-cloud compute) stand: word for word in `rules/tech-lead.md` › Moved 19 Nov (Lead 94). | prose (see rows) | 19 Nov |
| P-673 | Cloud environment reads canada.ca for citations; Limited network, no secrets. | prose | 17 Nov |
| P-674 | Clean-up plan (with P-675 to P-677): row in `rules/tech-lead.md` › Moved 19 Nov. | prose | 17 Nov |
| P-678 | Private home expat-ready/private (P-679: the only one); side notes synced each check by tools/private-sync.sh; big folders on the Mac's backup. | script: private-sync.sh | 17 Nov |
| P-680 | Spend master kept private; board card parked (P-681); architecture sized for ~500 capabilities with an AI layer. | prose | 17 Nov |
| P-683 | Approve on the branch first, then open the PR non-draft. Full row: `rules/builders-and-qa.md`. | prose | 17 Nov |
| P-685 | Old drafts with a matching Approve: the Lead runs `tools/pr-ready.sh`, never the founder. | script: tools/pr-ready.sh | 17 Nov |
| P-686 | Records PRs skip the 800-line limit; tooling rows exempt; IDX-moved rules count (#2086). | script: pr-size.sh, decision-impact.sh, check-docs.sh | 17 Nov |
| P-682 | Modular monolith: fenced modules, AI behind its own port, outbox events, affected-only CI; split only on a measured trigger. | prose | 17 Nov |
| P-691 | Emergency hand merge stays: only a pipeline/CI fix while the queue is broken; full row `rules/tech-lead.md`. | prose (ruleset bypass; library/engineering-change-log.md) | 17 Nov |
| P-699 | Agents build, review, test and label; when a tool path is stuck, the Lead does the step in the signed-in browser (safety rules still apply). | prose | 18 Nov |
| IDX-9 | Row word for word in `rules/tech-lead.md` › IDX-9. | prose | 19 Nov |
| P-731 | A PR that failed a batch is relabelled only after a green full run on its head, every failing suite named (P-733 (4)). | CI: label-guard (CI-PRE, owed) | 19 Nov |
| P-733 | Lanes on the items nearest done first, one lane per item to Proven; PRs near 800 lines; automatic proof on merge; qa walks risky items. | CI: #2233 (owed); prose (focus) | 19 Nov |
| P-734 | P-733 runs unchanged to 22 Nov evening; no new workflow row before 23 Nov unless a fix; daily number: Proven. | script: ENF-733 (owed) | 19 Nov |
| IDX-14 | Product rulings P-735, P-736, P-737, P-741 stand: row word for word in `rules/tech-lead.md` › IDX-14. | prose | 19 Nov |
| IDX-17 | Test-run rows P-742, P-743 (`FULL_RUN_FROM` to 22 Nov 20:00 IST), P-744 (B203 now): word for word in `rules/tech-lead.md` › Moved 20 Nov. | CI: queue-gate.sh FULL_FROM; script: records-only.sh | 20 Nov |
| IDX-19 | 20 Nov rows P-739, P-740, P-745 to P-748: row word for word in `rules/tech-lead.md` › IDX-19. | script: B204 waves check | 20 Nov |
| IDX-20 | 20 Nov rows P-749 to P-756 stand: list word for word in `rules/tech-lead.md` › IDX-20 row. | script: lead-pr.sh | 20 Nov |
| IDX-21 | 20 Nov P-757 to P-765 stand: row word for word in `rules/tech-lead.md` › IDX-21. | script: lead-watch.sh (part), check-docs.sh lock; hook: founder-click-guard | 20 Nov |
| IDX-23 | P-766 to P-780 stand, word for word in `rules/tech-lead.md` › IDX-23 (P-770, P-778 the Lead does every step; P-780 recovery swap; P-781 Opus 5.5 medium for all, Fable 5.2 medium critical). | hook: founder-click-guard.sh (#2587), resource-claim-guard.sh (stop-check part 5); owed ENF-778a/g | 21 Nov |
| IDX-25 | P-782-P-815 stand: `rules/tech-lead.md` › IDX-25. | script: ENF-782b (owed) | 22 Nov |
| P-738 | Each check the Lead measures the flow, names the one constraint, fixes it the simplest way, re-measures; no cause claimed unmeasured. | script: lead-watch.sh constraint section (ENF-738, owed) | 19 Nov |

## Tokens, money, account (detail: `rules/tokens-money-account.md`)
| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-446 | A Lead hands over at the first check after 200k tokens beyond its start read, never compacts; at ~150k the standby reads RULES and STATE once. | prose (lead skill) | 9 Nov |
| P-446f | Context by session type: builders end with the row (split before ~400k), qa ~300k, reviewers fresh (~150k); nobody reaches auto-compact. | prose | 9 Nov |
| P-440b | The start read is this page plus the newer DECISIONS rows; never re-read big files on a check (P-372 (3)). | script: check-docs.sh (part: 25 KB, lag) | 15 Nov |
| P-440c | No raw dumps into a Lead's context: filter every tool output. | prose | 9 Nov |
| P-440d | Burn watch every check; over 3%/h twice in a row: end idle sessions, hand over any over 250k, tell the founder. | prose (usage-log.sh logs only) | 9 Nov |
| P-445b | Unused connectors stay off. | prose | 11 Nov |
| P-175b | Live AI is off on every copy; a live call only as a paid run the Lead approved, from a Terminal tab. | script: STUDIO_*_LIVE off by default in api/src (part) | P-612 |
| P-295 | Day cap US$30, US$50 on 9 Nov (P-309, P-429, P-434); the Lead approves inside it, the founder above. | script: p2/ledger.ts (part: reserve before the call) | 9 Nov |
| P-295b | Every paid run: usual and worst cost first, worst reserved in the ledger, one attempt, an independent check, one PR per result, qa labels; job cap US$5 (P-232). | script: p2/ledger.ts (part) | P-612 |
| P-377 | Live runs from a Terminal tab (sandbox network); a paid run on the data Works counts on, never fixture-only. | prose | 9 Nov |
| P-461 | Use the plan to its limit (P-344; P-431 replaced); the weekly meter is not a stop line; at 98% tell the founder; lanes push after every step (P-458). | prose | 11 Nov |
| P-458 | On an account switch: get_usage first, then `RESUME-ON-NEW-ACCOUNT.md`. | prose | 11 Nov |

## The compass (P-312)
Word for word in `rules/tech-lead.md` (judged daily from tools, never from prose).

## Prose-only rows: G-4 candidates (P-611)
The list, word for word: `rules/prose-only-g4-candidates.md`. Each prose row's outcome (check, merge, retire) and the check queue by breaks: `design/rule-triage-2026-11-16.md` (16 Nov).
