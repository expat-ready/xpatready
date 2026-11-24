# R1.29, qa 8 (cloud, 24 Nov ~20:5x IST): trace of j_29's 9 FAILs on main, no score (P-606)

Lead 30's ask. Run: walks.yml **45418213518** on main **b6fdc65e8** (#3505's merge; FO-9b part 2 on main since #3174, b388f6dee), job 138530760884 "walk j_29": 13 PASS, 9 FAIL. Read from the job log and main's code; nothing re-run here (context near the hand-over line). Live AI off, US$0.

## Verdict
**Partial, parts missing: FO-9s parts 2-3.** No fault was found in FO-9b's routes. Two FAILs are the missing screens. The other seven come from one guessed shape in the journey, plus the steps that depend on it.

## The root cause (journey shape, against a ruling)
* j_29 W1 adds the second record of each pair with Add a lead's **"Add as new"** (`confirmedNew: true`): Lena Parks (`j_29.ts:110`), Omar (`:147`), Kim (`:167`).
* By ruling, "Add as new" writes the pair **Kept separate, decided by the adder**, so the automatic merge never joins them. Sources: `api/src/front-office/duplicates/merge/review.ts:115-131` (`notePairs`, `addedAsNew`), called from `sales/arrival.ts:109`; FO-9b concept §8 B1, founder question 1, AG-2-68 rule 16.
* Without "Add as new", a manual add that matches someone on file is stopped with 409 KNOWN_PERSON (`sales/leads.ts:157-162`). So **an OPEN pair arrives only through a web form or a booking** (`door: "WEB_FORM"`, `sales/public.ts:138`; `"BOOKING"`, `sales/arrival-port.ts`).
* `GET duplicates/review` defaults to the OPEN tab (`review.ts:272`). Its 200 with no Lena pair is therefore correct: the pair is on `?status=KEPT_SEPARATE`.

## The 9 FAILs
| # | Step | Kind | Why |
|---|---|---|---|
| 1 | W2 the pair is on the review list with score and reasons | **journey shape** | the pair is Kept separate (root cause), not OPEN |
| 2 | W2 Sales menu offers People to merge with the count | **missing screen: FO-9s part 2** | no "People to merge" in `web/src` |
| 3 | W3 merging keeps Lena Park and moves the lead and notes | journey shape (follows #1) | no OPEN pair found, so no merge call (status 0); a Kept separate pair would be refused 409 DECIDED (`review.ts:264`) |
| 4 | W3 tombstone and one audit line | journey shape (follows #3) | no merge ran |
| 5 | W4 the Omar pair (money) waits on the review list | journey shape | "Add as new", so Kept separate |
| 6 | W4 the Kim pair (case) waits, `needsCaseSide` | journey shape | the same |
| 7 | W5 Undo merge restores both people | journey shape (follows #3) | `GET duplicates/merges` 200 with no merge for Lena Parks, so no Undo call |
| 8 | W5 a second Undo refused 409 | journey shape (follows #7) | no Undo ran |
| 9 | W5 the review page has To review, Merged, Kept separate and Undo | **missing screens: FO-9s parts 2-3** | no review page in `web/src` |

**The two "vacuous" W4 PASS lines** (money and case pairs never merged by themselves) pass only because no automatic merge runs on a Kept separate pair. They prove nothing until the pairs arrive OPEN.

## The alignment owed (qa's file, next qa lane)
* In W2-W5, make each second record arrive through the firm's published web form (a `POST /api/public/forms/:token/submissions` like j_26's), not "Add as new". The pair is then written OPEN with its score and reasons.
* W4's money and case pairs then test the real refusals of the automatic merge (`review.ts:192-215`): the pair stays OPEN, with `needsCaseSide` for Kim.
* Add one step for the ruling itself: the "Add as new" pair is listed under `?status=KEPT_SEPARATE`, decided by the adder.
* Run it on main twice before any score. It stays Partial until FO-9s parts 2-3 merge.

## Questions for the Lead
1. Is FO-9s parts 2-3 (the People to merge page, merge dialog and Undo) in a lane yet? The BACKLOG row FO-9s reads "not built".
