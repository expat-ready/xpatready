# Enforcement plan: what goes into code, what stays written (P-772, 21 Nov 01:3x IST, Lead 7 series 3)

The founder asked (P-772, his words word for word in DECISIONS) to put into code every rule where that adds stability, scale, quality or agent consistency, without over-engineering, to merge it fast, and never to slow product work. Inputs: `design/enforcement-audit-2026-11-21.md` (main 12f270bb9: 151 rules, 17 enforced, 35 partial, 99 prose) and `design/rule-triage-2026-11-16.md` (which proposed 99 checks, one per prose row).

**The Lead's call: about 20 checks, not 99.** A check earns its place only if the rule was actually broken or guards the queue, the tests or the records the Lead starts from. A check on a rule nobody breaks costs upkeep and false alarms and stops nothing (F-12Nov). Rulings and "stands as recorded" index rows stay written; nothing checks them in code anyway.

**One standing trigger replaces the other ~75 checks:** a written rule that is broken twice in 7 days gets a check in its own tooling row. lead-watch counts breaks from the items queue. That way the list grows from evidence, not from guesses.

How every row below is built: a tooling row, one row per PR, the P-762 fast path (fresh Opus reviewer plus a guard test), the pipeline queue apart from product (P-764, ENF-764). New required checks start non-blocking and become required only after 3 green days. Cloud lanes start at the founder's next typed turn (P-348e). Cost: US$0 CI (Enterprise minutes); tokens for short lanes.

## Tier 1: the five audit items, plus the gaps that hurt the proof rate (build first)
| # | What | Rule | Enforcer | Size | Why it is worth it |
|---|---|---|---|---|---|
| E1 | Nightly finishes: 18 parts (as ci.yml) or a 75-min limit; lead-watch ACT line when the newest scheduled nightly is not green | P-651, audit item 2 | nightly.yml, lead-watch.sh | S | Main is not tested end to end today (3 of 8 parts cut at 59 min, 20 Nov). It's broken, so it counts as a fix under the P-734 lock |
| E2 | PRs run their affected suites: `run-suites.sh --changed` (select-suites.mjs, already built) as a non-blocking PR job, required after 3 green days | B203, audit item 1 | ci.yml PR job | S | Failures surface on the PR, not in a merge batch that bounces a partner PR |
| E3 | Test-impact map capability → module → file → suite from coverage; feeds E2 | B203 step 3 | #2370 (+#2359 c8 gate note) | M | Makes E2 precise; without it, E2 picks suites by path rules alone |
| E4 | Mutation pilot: STANDARDS §1 gate note first (#2359), then Stryker on one core module, report-only | B203, P-744 (c) | new workflow, weekly | M | Measures how good the tests are. Low urgency, so it comes last in tier 1 |
| E5 | Clean-up stage 0 checks wired (check-cleanup-checks.sh into check-guards.sh); stages 1 and 2a (#2459, #2458) land if their reviews pass | P-674 to P-677 | check-guards.sh | S | The safety net for file moves exists but runs nowhere |
| E6 | pr-rules becomes a queue condition (`check-success = pr-rules` in .mergify.yml product queue) | P-606, P-526, P-610 | .mergify.yml | S (one line; Lead reads the diff, P-423) | Today a PR can merge with a red "Done when" / 800-line / "Completes:" check; item-proof depends on "Completes:" |
| E7 | Register tells the truth: check-rule-register.sh fails when a named enforcer file is missing; fix stale cells (P-690, P-651, P-731, P-769, P-557) | P-611a, P-615 | check-docs.sh | S | The Lead's start read was wrong on 5 rows tonight |
| E8 | Land the three queued guards | P-769, P-770, P-771 | #2578, #2587, #2590 | queued | Already built and approved |

## Tier 2: written rules that were broken, or that protect agent consistency (build after tier 1)
| # | What | Rule | Breaks (13-16 Nov triage) | Enforcer | Size |
|---|---|---|---|---|---|
| E9 | IST times: make the existing check-docs warning a failure, and extend it to every time the Lead writes | P-302 | 17 | check-docs.sh, stop-check.sh | S |
| E10 | Touch-list overlap: a lane whose declared touch list overlaps an open PR's files is refused; one hot-file holder (schema, case-prepare) | P-576, P-526b, P-438b | 4 + 4 | lane-preflight.sh | M |
| E11 | Fewer than two ready rows for a lane is an ACT line | P-599 | 4 | lead-watch.sh | S |
| E12 | Lead context at start read + 200k is an ACT line (hand-over) | P-446, P-565 | 2 | lead-watch.sh | M |
| E13 | Private-home sync runs at every check | P-678 | runs by hand only | lead-watch.sh calls private-sync.sh | S |
| E14 | Index integrity: every ID an IDX row lists exists in DECISIONS | IDX-1, -2, -4, -5 | 0, but the start read depends on it | check-docs.sh | S |
| E15 | Each new DECISIONS row states time, cost and quality impact | P-254, F-12Nov | founder ask | decision-impact.sh | S |
| E16 | No dependency added without a "STANDARDS §1:" line | P-553, P-587 | 0, but a gate for new technology | pr-rules step | S |
| E17 | Flow constraint: lead-watch names the one constraint from measured waits; close the duplicate PR (#2285 or #2431) | P-738 | n/a | lead-watch.sh | M |
| E18 | Lead PR helper and the 10-min cadence: lead-watch flags a missed check (gap > 15 min) | IDX-20, P-761 | missed checks 20 Nov | lead-watch.sh gap mode (ENF-761) | S |

Already enforced, so no new row: P-371 cancel guard (refused by the guard), P-557 pr-open-guard (runs on every push, seen 21 Nov 01:3x), P-764 product and tooling apart, P-765, P-768.

## Tier 3: stays written (no check)
- About 60 rulings and index rows ("stands as recorded"; product and Release 1 scope rulings; immigration values P-170; UX style P-473). Their content is a decision, not a behaviour code can test.
- About 40 duty rows nobody broke in the 13-16 Nov count (for example P-464, P-470, P-505, P-514, P-530, P-542, P-551, P-582, P-589, P-592). The two-breaks trigger above puts any of them into tier 2 the week it breaks.
- Judgment rows (P-502 no hit-and-trial, P-486 who decides, P-294, P-390): a check would only test the wording, not the judgment. The reviewer and the founder's reading hold them.

## Order and impact (P-254)
- **Order:** E8 (already queued), E1, E6, E7, E2, E5, E3, then E9 to E18, then E4. One lane per row, at most 4 tooling lanes at once, so product lanes keep the machines (P-764 queue apart).
- **Time:** none on product. Tooling merges in its own queue. Tier 1 is about 1 day of lane time, tier 2 about 2 days.
- **Cost:** US$0 in CI; tokens for about 18 short lanes.
- **Quality:** up (tests on PRs, a nightly that finishes, a true register). The one risk is a new required check blocking the queue; it starts non-blocking (E2) or as a one-line condition the Lead can revert (E6).
