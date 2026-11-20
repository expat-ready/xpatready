# qa capability R1.98: re-score on main 4a44f5832, 20 Nov (cloud qa lane; Opus 5.5 medium; fresh Opus reader, ran nothing; live AI off; US$0)

**Item:** R1.98 "Corporate clients, employers, LMIA" (front office + case side).
**Asked:** re-score after FO-8 (#2255, 438daf142) and CS-K1 part 2 (#2406, 617acff07) merged after the 17 Nov note. The brief also said "LMIA case rows are deferred by P-568 (check the Done when)". They are not deferred (see below).

**Verdict: parts missing, no verdict (P-606 (2)).** Status stays Partial. The fresh Opus reader reached the same answer on its own reading of the records and code.
Parts missing: **CS-98r, CS-98a to CS-98e, CS-98s1, CS-98s2** (MVP-CHECKLIST row 98; BACKLOG also has CS-98s3a to s3c). There is also **a corporate screen with no backlog row (QA-604)**.

## Is LMIA in R1.98? Yes
| Record | Says | Date |
|---|---|---|
| P-568 (DECISIONS:191) | employer and LMIA work stays in the build, but is not on the first five firms' path | 14 Nov |
| **P-607 (5)** (DECISIONS:152) | "row 98's CS-98* rows stay in Release 1 and are scheduled last in the case-side lane; **amends P-568 for row 98 only**" | **15 Nov (later)** |
| MVP-CHECKLIST:76 | lists the CS-98* rows as parts of row 98, citing P-607 (5) | — |
| MVP-CHECKLIST:180 | "98 (LMIA on the case side; after the first five firms, P-568)" | out of date |
| CAPABILITIES R1.98 Done when | "LMIA case work gets its own capability rows" | no such rows exist |

P-607 (5) is the later decision, so LMIA is part of R1.98 and must merge before the row can be scored. The Done when hands LMIA to rows that do not exist, so as written LMIA is covered nowhere. **Question 1** below.

## What merged, and what runs (main 4a44f5832)
| Part | On main | Runs here (fresh copies; never :4400) |
|---|---|---|
| FO-2b corporate prospects (API only) | #2019 | `tests/check_fo2b_corporate.ts`: **61/61, twice** (`2026-11-20-capability-R1.98/fo2b-run{1,2}.txt`) |
| FO-8 `prospect.won` → client (person or company with its contact), "Open a case?" | #2255 | `tests/check_fo8_prospect_won.ts` on isolated `fo8_won` :4472: **43/43, twice**, including DW2 pass: a company prospect makes a COMPANY client linked to its front-office company, with its contact person by id (`fo8-run{1,2}.txt`) |
| CS-K1 part 2 (poll, links; J-72) | #2406 | J-72 walks Individual prospects only (`tests/journeys/j_72.ts`: Ana, Ben, Cyd) |
| CS-98r … CS-98s2 (LMIA) | **none** | no code on main; the only CS-98 commits are shaping records |

Both checks are API or in-process. Neither one is a gate A walk.

## Gate A (by screens): the corporate half cannot be walked
- `web/src/modules/front-office/sales/lead-page.tsx:6` says "Corporate Engage is FO-4c's", and the page offers only Engage as Individual. `pipeline-page.tsx:6` says "The Corporate switch is FO-4c's". `prospect-page.tsx:88` allows moves only for INDIVIDUAL.
- FO-4c has **no BACKLOG row**. It appears only as a split-off option in FO-4 (BACKLOG:332) and in a note (:851). It is also missing from MVP-CHECKLIST row 98's parts.
- No journey walks a company client (`tests/journeys/` has no j_98).

So "a corporate prospect with company and contacts is created and won" can only be done through the API today. **QA-604** (Gap · Major).

## GitHub walks
None was asked for. No walk exists for this row's clause: there is no screen and no j_98. Dispatching j_72 twice would prove the Individual path (R1.72's), not R1.98's, so it would spend CI without moving this row.
**Failing clause:** "a corporate prospect with company and contacts is created and won" has no screen to walk (QA-604), and the LMIA parts have not merged.

## Bugs: 0 Blocker · 0 Critical · 1 Major · 0 Minor (new: QA-604)
- **QA-604** (Gap · Major): the Corporate prospect has no screen. Engage as Corporate, the Corporate board and switch, and Change type (FO-2b review m6, "FO-4c builds it") are in no backlog row. R1.98's front-office clause cannot pass gate A.

## Records out of date (for the Lead; qa does not edit them)
- MVP-CHECKLIST:180 cites P-568 for row 98. P-607 (5) amended it.
- BACKLOG:640 and :647 show FO-2b and FO-8 as "not built". Both have merged (#2019, #2255).

## Questions for the Lead
1. **R1.98's Done when vs P-607 (5).** Recommended: drop "LMIA case work gets its own capability rows" from the Done when and add the LMIA clauses (CS-98b to e: open an LMIA file, the advertising clock, submit and decide, positions to workers), because P-607 (5) keeps them in this row. The alternative is to make separate R rows for LMIA, but then MVP-CHECKLIST row 98 needs editing to match. Either way, the founder's later decision applies. Settling it silently is not allowed (AGENTS rule 2).
2. **QA-604.** Should FO-4c (the Corporate screens) get a row and join row 98's parts, with a join-and-walk j_98 (P-606 (5))? Recommended: yes. Without it, R1.98 can never pass gate A, even after LMIA merges.

## Suggestions
- FO-4c row: Engage as Corporate on the lead page, the Corporate board switch, and Change type on the prospect page, with J-98 walking corporate win → COMPANY client → "Open a case?". *Needed for the proof · Capability.*

## Could not test
- Gate A on screens: there is no screen (QA-604).
- LMIA: not built.
- Coverage (c8): not run, because no Works claim was made.
