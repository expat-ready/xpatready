# qa after-merge, 19 Nov 2026 11:3x IST: journeys J2 and J4 (qa 5)

**Run:** after-merge for J2 (firm set-up and subscription) and J4 (enquiry and lead handling), per `design/journeys-2026-11-19.md` (on `lead/2026-11-07-lead31`). Main 4aa912c92; its app tree is that of 00378b402 (the two merges after it are qa records only). Cloud qa copy, Opus 5.5 medium. Live AI off, US$0. No isolated copy was needed: there is no Works claim (P-606).
**Verdict:** no J2 or J4 item has all its parts on main, so no row moves to Works. One merge since the last verdicts touches these rows: FO-2 part 3 (#2140, prospects API). On that evidence R1.31 goes from Not built to Partial and R1.30 stays Partial. Both have parts missing.

## Evidence (P-339 steps 1-2)
**CI on main's tree:** run 44444356499 (ci, `mergify/merge-queue/538519e97`, tree = main 00378b402's): success, 8 shards and 5 regression jobs.

| Check | GitHub (run 44444356499) | Re-run here, twice | Rows |
|---|---|---|---|
| `check_fo2p3_prospects.ts` | 44/44, shard 1, job 135294529873 | 44/44, 44/44 | R1.30, R1.31 (R1.28's carry, qa-4) |
| `check_fo2_leads_prospects.ts` | 113/113, shard 7, job 135294529751 | 113/113, 113/113 | R1.26, R1.27, R1.29, R1.30 |
| `check_fo4sf_source_filter.ts` | 34/34, shard 3, job 135294529750 | not re-run (it needs an isolated copy and has no new code) | R1.27, R1.30 |

**What FO-2 part 3 shows on the API:**
* **Won:** a person's move into WON is refused (422). Only Convert moves a prospect to Won; three Converts at once give one.
* **Undo:** Undo convert is refused after a signed retainer.
* **Totals:** the board totals are per currency. CAD and USD are never added together, and "everyone sees all" off counts only your own.
* **Filters:** leads filter by owner and by arrival day in the firm's zone (23:30 Toronto is 1 Nov). The filters stay inside what you are allowed to see, and another firm's staff named as owner gives 400.

## Row by row (parts missing, P-606; no verdict)
| Row | Status | Parts missing (from the journey table and the row) |
|---|---|---|
| R1.19 | Partial | PF-5 part 2 (#1959 open), PF-5s |
| R1.20 | Partial | PF-15 part 2 (#2224 open), PF-4c part 2, PF-6 invite screen (qa 2 scored PF-15 part 1a in #2213) |
| R1.23 | Not built | PF-13 parts 1-2 |
| R1.91 | Not built | PF-5 part 2, PF-5s, PF-16 |
| R1.92 | Partial | PF-18a part 2, PF-18s, PF-4c part 2, PF-5s |
| R1.100 | Partial | PF-5 part 2 (#1959), QA-481 (PF-5v part 2); PF-5t part 2 passed gate A (report 2026-11-19-gate-a-night) |
| R1.26, R1.27 | Partial | FO-4b (embed with campaign) |
| R1.28 | Partial | QA-511: the real ArrivalPort is FO-2 part 3b (#2196, approved, not yet queued) |
| R1.29 | Partial | FO-9a later parts, FO-9b, FO-9s |
| R1.30 | Partial | FO-4 part 2: the board, and the stage, owner and date filters on the Leads screen. The API filters are now met |
| R1.31 | **Partial** (was Not built) | FO-4 part 2 (Pipeline screen); Won by signature and by Signed offline (FO-6) |
| R1.32, R1.33 | Partial | FO-10 and the assign screen; impossible-number refusal (FO-2 / FO-9a later parts) |
| R1.35, R1.36, R1.95, R1.107 | Not built | as their rows |
| R1.98, R1.106, R1.108, R1.110 | Partial | as their rows (R1.110: FO-13s, QA-510) |

## Not tested
* No walk. FO-2 part 3 is API only, so gate A has no screen to walk until FO-4 part 2.
* No coverage run: there is no Works claim.

## Questions for the tech lead
* **R1.28:** when #2196 (FO-2 part 3b, the real ArrivalPort) merges, it is the last named part. Shall qa 5 run the R1.28 Works pass, or does qa-4 keep it? I will take it unless told otherwise.

## Suggestions
None.
