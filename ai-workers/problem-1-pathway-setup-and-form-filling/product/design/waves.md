# Release 1 waves (P-745; founder 20 Nov 00:2x IST: "journey by journey ... one batch is build is one batch ahead, then building and proving")

Source: a read-only Fable 5.2 analysis for Lead 96, 20 Nov, on main 37d1b196d (qa/CAPABILITIES.md statuses, open PRs, design/journeys-2026-11-19.md). Parts left are qa's "parts missing" notes updated by merges to 19 Nov 17:49 UTC; Lead to confirm per item when its wave opens. The list is `design/waves.tsv` (B204); the block "Waves as code" below is generated from it by `tools/waves.py gen` and checked by `tools/check-waves.sh`. The prose above and below is the 20 Nov analysis, kept as written.

## The model (and why)
- **Little's law:** flow time = work in progress ÷ throughput. On 20 Nov about 27 R1 items were in flight across all 11 journeys while about 1 item a day was Proven, so each item waited about 27 days. At 8 in flight it waits about 8.
- **Kanban WIP caps:** at most **8 items being built** at once; at most **12 items Built but not yet Proven**. Over either cap, builders stop starting items and help close proofs.
- **Release train of vertical slices:** wave N+1 builds while wave N is proved. Wave N+2 does not start until wave N has at most 3 unproven items.
- **Proof starts automatically** when an item's last part merges (item-proof workflow, P-724; seen working on R1.28, 19 Nov).
- **The one number:** items in flight. 27 on 20 Nov against a cap of 8.

## Now (20 Nov, main 37d1b196d)
12 Works (Proven), 52 Partial, 37 Not built. Open PRs touch 24 distinct R1 items in 9 of 11 journeys; with lanes that have no PR, about 27 items.

## Wave 1: Finish (17 items: 5 need proof only, 12 need one part)
| Journey | Items |
|---|---|
| J0 Platform | R1.4 walls per query (#2029), R1.8 audit (#2338) |
| J1 Configurator | R1.80 IRCC forms (proof, #2291) |
| J2 Firm set-up | R1.100 terms (QA-481) |
| J3 Messaging | R1.47 layout (re-score after PF-19r) |
| J4 Enquiry and leads | R1.28 consent (proof, #2328), R1.26 enquiry form (FO-4b), R1.30 lead board, R1.33 phones (#2268) |
| J5 Booking | R1.37 booking (proof), R1.40 invites (proof), R1.41 hours (#2302) |
| J7 Case | R1.72 case from a win (#2321, then CS-K1 part 2), R1.74 deadlines (#2317), R1.77 decision and close (proof) |
| J8 Documents | R1.67 file type (QA-520) |
| J10 Compliance | R1.109 complaints (#2315) |

About 15 PRs; 8 builders, 4 qa lanes. Proven range: 21-24 Nov at 4-5 a day; to 1 Dec at today's pace.

## Wave 2: Next (12 items plus enablers), builds while Wave 1 is proved
J0 R1.10, R1.16; J2 R1.19; J3 R1.48, R1.49; J4 R1.27, R1.31, R1.32, R1.108, R1.110; J5 R1.42; J9 R1.59. Enablers: PF-5 part 2 (#1959), FO-4b, FO-13s, FO-7b. About 40 PRs. 24-28 Nov best case; 2-8 Dec at measured pace.

## Wave 3: Rest of Partial (20, plus 3 waiting on the AWS account)
J0 R1.3, R1.5; J2 R1.20, R1.24, R1.90, R1.92, R1.93; J4 R1.29, R1.98, R1.106; J5 R1.38 (finishes its 4 nearly done PRs now, as an exception); J6 R1.53, R1.54, R1.55, R1.61; J7 R1.102; J9 R1.56, R1.58; J10 R1.85, R1.105; AWS R1.13, R1.14, R1.15. About 120 PRs.

## Wave 4: Not built (37), in journey order
R1.1; J2 R1.21, 22, 23, 89, 91; J3 R1.45, 46, 50, 52; J4 R1.35, 36, 95, 107; J5 R1.39, 43, 112; J6 R1.104; J7 R1.62, 75, 76, 79; J8 R1.64, 65, 66, 68, 69, 70; J9 R1.57, 60, 96, 111; J10 R1.34, 86, 87, 88, 97. About 260 PRs at about 7 each.

## What stops now (20 Nov)
In-flight work outside Waves 1-2 finishes its current PR and stops: R1.76 (#2320, then part 2 parked), R1.88 (AUD-4 #2339, then AUD-4s parked), R1.92 (#2304, then PF-18s parked), R1.65 (CS-D1 part 1 not started), R1.3 (CS-W3 part 1 not started), R1.20 (#2307 finishes), R1.54 (#2038 parked). R1.38 finishes its four PRs (exception: nearly done).

## Honest forecast for 29 Nov (P-740)
- Work left about 435 PRs; at 21-32 merges a day, build alone ends 4-11 Dec. **101 by 29 Nov is not reachable.**
- At measured pace (about 1 Proven a day): about 22 of 101. Focused on Waves 1-2 (about 3 a day, estimate): about 40. Best case, never yet measured (5-6 a day from 21 Nov): 60-65.
- Blocked whatever we do (about 14): the founder's AWS account (R1.1, 13, 14, 15, 24, 65, 97); Stripe test keys (R1.57, 61, 21, 91); vendor connections (R1.52, 43); FO-6v held under P-561 (R1.54).
- **The founder's decision:** keep 29 Nov with a named "Release 1 core" of about 45-50 items (Waves 1-2 plus J6 and the J9 core), deferring by name the rest; or move the date.

<!-- waves.py gen: start (generated from design/waves.tsv and qa/CAPABILITIES.md; edit waves.tsv, then run tools/waves.py gen) -->
## Waves as code (B204)

Now: 64 Works, 29 Not built, 17 Partial; active wave 3; lane starts open for waves 0, 1, 2, 3, 4.

### Wave 0: Proven before the waves (fixes only) (12)

| Journey | Items |
|---|---|
| J0 | R1.2 (Works), R1.6 (Works), R1.9 (Works), R1.11 (Works), R1.12 (Works) |
| J1 | R1.83 (Works), R1.84 (Works), R1.99 (Works) |
| J7 | R1.73 (Works), R1.82 (Works), R1.101 (Works) |
| J8 | R1.63 (Works) |

### Wave 1: Finish (17)

| Journey | Items |
|---|---|
| J0 | R1.4 (Works), R1.8 (Works) |
| J1 | R1.80 (Works) |
| J2 | R1.100 (Works) |
| J3 | R1.47 (Works) |
| J4 | R1.26 (Works), R1.28 (Works), R1.30 (Works), R1.33 (Works) |
| J5 | R1.37 (Works), R1.40 (Works), R1.41 (Works) |
| J7 | R1.72 (Works), R1.74 (Works), R1.77 (Works) |
| J8 | R1.67 (Works) |
| J10 | R1.109 (Works) |

### Wave 2: Next (12)

| Journey | Items |
|---|---|
| J0 | R1.10 (Partial), R1.16 (Works) |
| J2 | R1.19 (Works) |
| J3 | R1.48 (Works), R1.49 (Works) |
| J4 | R1.27 (Works), R1.31 (Works), R1.32 (Works), R1.108 (Works), R1.110 (Works) |
| J5 | R1.42 (Works) |
| J9 | R1.59 (Works) |

### Wave 3: Rest of Partial (23)

| Journey | Items |
|---|---|
| J0 | R1.3 (Partial), R1.5 (Partial) *, R1.13 (Works) *, R1.14 (Works) *, R1.15 (Partial) * |
| J2 | R1.20 (Works), R1.24 (Works), R1.90 (Works), R1.92 (Works), R1.93 (Works) |
| J4 | R1.29 (Works), R1.98 (Partial), R1.106 (Partial) |
| J5 | R1.38 (Works) * |
| J6 | R1.53 (Works), R1.54 (Partial), R1.55 (Partial), R1.61 (Partial) |
| J7 | R1.102 (Works) |
| J9 | R1.56 (Partial), R1.58 (Partial) |
| J10 | R1.85 (Partial), R1.105 (Partial) |

### Wave 4: Not built (46)

| Journey | Items |
|---|---|
| J0 | R1.1 (Partial), R1.113 (Not built), R1.114 (Not built), R1.115 (Not built), R1.116 (Not built), R1.117 (Not built), R1.118 (Not built), R1.119 (Not built), R1.120 (Not built), R1.121 (Not built) |
| J2 | R1.21 (Works), R1.22 (Not built), R1.23 (Works), R1.89 (Works), R1.91 (Not built) |
| J3 | R1.45 (Partial), R1.46 (Works), R1.50 (Works), R1.52 (Not built) |
| J4 | R1.35 (Not built), R1.36 (Not built), R1.95 (Not built), R1.107 (Not built) |
| J5 | R1.39 (Works), R1.43 (Not built), R1.112 (Not built) |
| J6 | R1.104 (Works) |
| J7 | R1.62 (Not built), R1.75 (Not built), R1.76 (Partial), R1.79 (Not built) |
| J8 | R1.64 (Not built), R1.65 (Works), R1.66 (Not built), R1.68 (Works), R1.69 (Works), R1.70 (Works) |
| J9 | R1.57 (Not built), R1.60 (Not built), R1.96 (Not built), R1.111 (Not built) |
| J10 | R1.34 (Not built), R1.86 (Works), R1.87 (Partial), R1.88 (Works), R1.97 (Not built) |

\* R1.5: allow: P-774 wave 3 exception, J0 nearest-first (Lead 8, 21 Nov); R1.13: allow: P-774 wave 3 exception, J0 nearest-first (Lead 8, 21 Nov); R1.14: allow: P-774 wave 3 exception, J0 nearest-first (Lead 8, 21 Nov); R1.15: allow: P-774 wave 3 exception, J0 nearest-first (Lead 8, 21 Nov); R1.38: allow: P-745 (3), finishes its four nearly done PRs; the Lead removes this note when they have merged

<!-- waves.py gen: end -->

## Enforcement (B204, built as code, not text)
| Where | Rule |
|---|---|
| `design/waves.tsv` | `R1.x <tab> wave <tab> journey`; the only hand-kept list; changed only with a DECISIONS row. |
| `tools/waves.py` | `gen` writes this page from waves.tsv plus qa/CAPABILITIES.md; `allow R1.x` passes only for the active or next wave; `wip` prints building and Built-not-Proven against caps 8 and 12. |
| `tools/brief-check.sh --brief` (run by the lane-start hook) | A lane brief needs `Item: R1.x` (or `Item: none (tooling/qa/records)`) and `waves.py allow` must pass, or the start is refused. |
| `tools/lead-watch.sh` | A WIP section each check: ACT when building > 8, Built-not-Proven > 12, or an open PR names an item outside the two waves. |
| `pr-rules` CI | Flags (label `outside-wave`, warning) a PR naming an item outside the two waves; never blocks fixes (P-214). |
| `tools/check-waves.sh` (guards) | Fails when waves.tsv lacks any of the 101 ids or this page differs from `waves.py gen`. |
