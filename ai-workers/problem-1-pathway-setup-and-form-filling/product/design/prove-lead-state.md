# Prove Lead state (P-644): the channel to the Lead

**Seat:** Prove Lead, a cloud session (Opus 5.5, medium, P-608). It cannot message other sessions: **this file on branch `prove-lead/records` is the channel**; the Lead reads it at every 30-minute check and answers in the Prove Lead's session.
**Updated:** 16 Nov 21:1x IST (clock: `TZ=Asia/Kolkata date` read 21:08 IST), on main d66bcfd2d (20:11 IST).
**Sources read:** `qa/CAPABILITIES.md` and `qa/BUGS.md` on main d66bcfd2d; `MVP-CHECKLIST.md`, `BACKLOG.md`, `RULES.md` (as of P-644), the operating model and the forecast on `origin/lead/2026-11-07-lead31` (a61485f69); merged and open PR titles from GitHub's search API, read 21:0x IST.

## Needs the Lead (read first)
1. **The "built, awaiting qa" list is shorter than the forecast says.** Of R1.4, R1.16, R1.38, R1.40, R1.80 and R1.100, only **R1.4** has every part merged and no open Major on it. The other five each have a part not merged or an open Major (table below, with the evidence). Scoring them now gives Partial again and spends a lane for nothing (P-606 (2); `design/qa-optimisation-2026-11-16.md` §1.3: 95% of first verdicts were Partial because rows were scored before they were whole). **Records to correct (yours, P-314):** MVP-CHECKLIST rows 38 and 40 say "Merged" on FO-3 alone; qa's rows list FO-3w part 1 (merged #1921 12:29 IST), FO-3st1 (R1.38) and J-38 as parts; row 80 says "Merged" while QA-315 and QA-165 (Majors) hold it.
2. **R1.4 is 7.5 h old (built 13:47 IST).** The 12 h target means its verdict by **01:47 IST 17 Nov**. Please start lane 1 first.
3. **QA-165 (R1.80) needs the Mac's Adobe Validate run** (P-442, P-439): no cloud lane can do it. Please run it or say when.
4. **QA-449 (R1.16) is pipeline work:** container smoke (`skeleton.yml`) on every merge batch, BACKLOG CI-1, never built. It is yours (CI, P-371) or Lead B's (PF-7). R1.16 cannot be proven until it lands.
5. **Idle qa capacity tonight:** only one row is ready, so one of the two "qa: score Built R1 rows" lanes should end rather than wait (P-337); restart it on the next merge signal below.

## Prove queue (every part merged, not yet qa Works; oldest built first)
| Row | Built (last part merged, IST) | Age at 21:08 | Owner of fixes | Lane |
|---|---|---|---|---|
| **R1.4** Each query runs inside its firm | PF-12 #1910, 16 Nov 13:47 | 7.4 h | Lead B (PF) | start qa lane 1 |

**Nothing else is whole yet.** The Lead's list, checked part by part:
| Row | What is merged | What holds it (evidence) | Ready when |
|---|---|---|---|
| R1.100 Terms acceptance | PF-5 part 1 #1815 (07:39 IST 16 Nov) | PF-5t part 1 PR #1957 open (no label); PF-5t part 2 (screens) not started (BACKLOG PF-5t) | PF-5t parts 1 and 2 merged |
| R1.16 Automated testing | PF-7 | QA-449 Major open: the container smoke never runs on merge batches; CI-1 not built | CI-1 merged, QA-449 retested |
| R1.38 Time zones | FO-3 #1760, FO-3w part 1 #1921 (12:29 IST 16 Nov) | FO-3st1 and J-38 not built (no PR); qa #1968 (queued) walked the new page: Partial | FO-3st1, J-38 merged |
| R1.40 Invite files | FO-3, FO-3w part 1 #1921 | J-38 not built | J-38 merged |
| R1.80 IRCC forms per applicant | BK-10, BK-16, BK-22 to BK-24; C7.1, C7.8 Works | C7.2 Partial on QA-315 and QA-165 (Majors); no commit since 15 Nov names them | QA-315 fixed, QA-165's Validate run |

**Next to become whole (merge signals the lanes watch):**
| Signal | Rows it moves | Still missing after it |
|---|---|---|
| #1945 PF-6m (queued; fixes QA-478) | R1.6 | PF-6 staff screens beyond part 1 (#1912): Team, Invite, Person panel (BACKLOG PF-6) |
| #1957 PF-5t part 1 (open) | R1.100 | PF-5t part 2 |
| #1959 PF-5 part 2 (open; QA-481's fix) | R1.19 | PF-5s sign-up screens |
| #1982 FO-3w part 2 (queued; QA-496's fix) | R1.42 | FO-3a, FO-3st1, FO-3st3 |
| #1956 PF-19b part 2 (queued) | R1.47, R1.49 | QA-495 (invitation, sign-up and case-side link mail bypass the one path) |
| CS-C1a #1818 (merged 16 Nov 03:03 IST) | R1.77 | CS-C1b, B5-filings; C8.2 on QA-397 |

## Start qa (for the Lead)
One row per lane, Opus 5.5 medium (P-608), each a cloud session from origin/main with prompt `/qa capability <ROW>` and the brief path. Lanes 1-4 now; 5-6 only on their merge signal.
* start qa: R1.4 brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.4.md
* start qa: R1.6 brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.6.md
* start qa: R1.77 brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.77.md
* start qa: R1.100 brief ai-workers/problem-1-pathway-setup-and-form-filling/product/design/prove-lead-briefs/R1.100.md
* (on #1982 merging) start qa: R1.42 — brief to follow in this file's next push
* (on #1956 merging) start qa: R1.47 and R1.49 retest of QA-495 — brief to follow

Lanes 2-4 are honest about their worth: R1.6 and R1.77 cannot reach Works tonight (parts missing); each lane closes or narrows Majors (QA-477, QA-478, QA-474) so the row is whole-and-clean the moment its last part lands, and writes the row's proof pack ahead. R1.100's lane writes its journey ahead and scores only on the merge signal. If lanes are short, start lane 1 alone.

## Next row per qa lane (existing lanes)
| Lane | Next row | Why, and the signal |
|---|---|---|
| qa after-merge | after-merge round from d66bcfd2d: **R1.27** (FO-4sf #1962 merged 18:23 IST: QA-493 retest) and QA-484 (PF-5v #1955) | merged PRs name them; R1.27 still misses FO-4b, so verdict Partial, but QA-493 closes |
| qa · front office group | **R1.42** on #1982 merging: QA-496 retest, parts check | until then, finish #1968's records (queued) |
| qa · case side group | **R1.80**: QA-315 retest on main's head; ask the Lead for QA-165's Validate run | the row's last hold |
| qa · platform group | **R1.4 independent re-run** (P-339: an independent re-run) once lane 1 posts its pack run; then **R1.19** on #1959 merging (QA-481 retest) | — |
| qa: score Built R1 rows (1) | **R1.6** if lane 2 is not started (same brief); else end the lane | avoid two lanes on one row |
| qa: score Built R1 rows (2) | **end the lane** (no other built row); restart on #1957 (R1.100) or #1956 (R1.47/49) | P-337, tokens |

## Bugs to route
No Blocker or Critical is open (BUGS.md on main d66bcfd2d). Majors first, then the new Minor; the fix, where one is in flight, is named.
| Bug | Sev | Row | To | Fix in flight / ask |
|---|---|---|---|---|
| QA-481 | Major | R1.19 (next R1.5) | Lead B | sign-up code never confirmable in the app; PF-5 part 2 #1959 open |
| QA-478 | Major | R1.6 | Lead B | PF-6m #1945 queued; retest in lane 2 |
| QA-477 | Major | R1.6 | Lead B | FO-2v #1933 merged 12:29 IST; retest in lane 2 |
| QA-493 | Major | R1.27 | Lead B | FO-4sf #1962 merged; retest by after-merge |
| QA-494 | Major | R1.27 | the Lead (wording) / Lead B | capability text to "manual; import when AG-18's engine lands" |
| QA-495 | Major | R1.47, R1.49 | Lead B (PF-19) + Build Lead C (case-side link mail) | PF-19b part 2 #1956 queued covers part of it |
| QA-452 | Major | R1.13 | Lead B | job queue not in ready, no job metrics, stuck-job alarm has no caller; no fix seen |
| QA-482 | Major | R1.59 | Lead B (FO-7) | tax rounded per line, round-half-to-even not stated; FO-7b not built |
| QA-449 | Major | R1.16 | the Lead (CI) / Lead B (PF-7) | CI-1 not built |
| QA-474 | Major | R1.77 | Build Lead C | CS-C1a #1818 merged; retest in lane 3 |
| QA-471 | Major | R1.74 | Build Lead C | CS-DL1 not built |
| QA-472 | Major | R1.76 | Build Lead C | CS-NT1 not built |
| QA-397 | Major | R1.77 (C8.2) | Build Lead C | no fix seen |
| QA-315 | Major | R1.80 (C7.2) | Build Lead C | no fix seen |
| QA-165 | Major | R1.80 (C7.2) | the Lead (Mac Validate run) | P-442 |
| QA-497 | Major | C4.11 suite (retry pass) | Build Lead C | #1988 C4.11-G5 queued (flake fix) |
| QA-498 | Major | BK-5 demo start double click | Build Lead C | no fix seen |
| QA-427, QA-439 | Major (UX) | C6.1, C6.2, C4.9 | Build Lead C | no fix seen |
| QA-201, QA-181 | Major (tooling) | CI type check, qa lane setup | the Lead | — |
| QA-496 | Minor (on #1968, queued) | R1.42 | Lead B | FO-3w part 2 #1982 queued |

## Making proving smaller per row, never weaker (P-640)
* **Score only whole rows** (P-606 (2)): lanes check parts first (`python3 tools/trace-requirements.py --brief <row>` and merged titles) and, with a part missing, write one line "parts missing: <ids>" with no walk and no reader. Most of yesterday's qa time went on rows that could only be Partial.
* **One pack per row, written ahead:** a lane waiting on a signal writes the row's journey and check now (`tests/qa/check_r1<n>_*.ts`), so on the merge it runs once on GitHub's runners and the reader rules.
* **Reuse journeys:** R1.4 reuses `check_pf12_walls.ts`; R1.6 reuses `check_r16_*`; R1.38/40/42 reuse `check_r140_inbox_walk.ts` and the TZ walk.
* **GitHub runners are the bottleneck (~90 min waits):** P-339's run is the merge batch that made main's head (its run id and job ids) whenever it covers the row; lanes ask for a dispatch only when no batch covers it, and run nothing heavy locally twice.
* **Gate A** by screens; by API where no screen exists (P-616): R1.4 is by API. **Gate B** per P-339 and P-317: an open Major keeps a row Partial.

## UI/UX bar (P-473, P-352)
Each module's first proven row adds a best-in-class design check to the walk, gaps as qa *Suggestions* (never Bugs unless a rule is broken). Module firsts in the queue: front office (R1.38/R1.40/R1.42, the booking pages: the first front-office screen row), platform staff screens (R1.6 when PF-6's screens land), sign-up and terms (R1.100). R1.4 has no screen, so no design check.

## Own qa run
Not started this turn. The brief allowed R1.100, but R1.100 is not whole (PF-5t open), so a run would give "parts missing" only. If the Lead cannot start lane 1 within the next check, the Prove Lead will run R1.4 itself as a qa PR from origin/main (`qa:` title), on an Opus `Reviewer: Approve <sha>` and green ci (P-385). **The Lead: say "Prove Lead runs R1.4" to make that happen.**

## Log
* 16 Nov 21:1x IST: first records; queue checked part by part; briefs R1.4, R1.6, R1.77, R1.100.
