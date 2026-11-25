# qa 8 — capability prep, 24 Nov (cloud; main 7d2d14e2d; Opus 5.5 medium; live AI off; US$0)

Rows in order (the start message): R1.104, R1.56, R1.58, R1.85, R1.93, R1.69, R1.87, R1.68. **None of their PRs had merged at 19:2x IST**, so no row is re-scored here (P-606: parts missing, no verdict). This round did the work that needs no merge.

## 1. j_74 W7: date-dependent, the journey's fault (QA-781, Minor; fixed in this PR)
* **Seen on main 7d2d14e2d, twice, isolated copies:** 24/25, only W7 red, `m1: done, cancelled, cancelled` (right) and `m2: waiting, waiting` (W7 expects three).
* **Cause, from the code:** W6b moves the walk's clock to the first step's 7-working-day reminder (15 Dec 09:01 today). W7 re-records the step due one day earlier (23 Dec), whose 7-day reminder day is 14 Dec, before the clock. `stillToCome` (`api/src/case-deadlines/plan.ts:35`) drops a reminder whose day is before today. That is the right behaviour (W4: "the passed one never fires late"). It passed on 21 Nov because 21 Nov was a Saturday: due − 1 fell on a Sunday, whose count lands on the same day as Monday's.
* **Over 400 start days** (`tests/qa/check_j74_w7_dates.ts`, the app's own `countBack`): the old choice fails 286/400 (no closed days) and 273/400 (13 Sample closed days).
* **Fix:** re-record the step a week later (due + 7). That fails on 0/400, and W7b NR (the new step's 7-day reminder is on or before the old step's 2-day point) holds on 400/400. **j_74 25/25 twice on main 7d2d14e2d** with the fix.
* **R1.74 stays Works** (the app is right; only the test was date-blind). Its run id on main is owed: walks.yml j_74 on main after this PR merges (a cloud lane asks the Lead, P-439).

## 2. j_54 W3: the firm signer's link body (from #3490)
* FO-6 part 4c's `FirmSigningLinkBody` is strict: `{ consent: true, consentTextVersion: "sign-electronically-v1" }`. j_54 posted `{}` (422 after 4c).
* Aligned. **On #3490's head 052d20a98 with this j_54:** W2 2/2 and **W3 PASS** ("the representative signs last; the request reads SIGNED"), W4's evidence row PASS; 14 PASS, 7 FAIL. Each FAIL names a part not built (FO-6v sandbox key; FO-6 part 3's downloads, whose route is the journey's guess; FO-6d).

## 3. j_85's console sign-in, j_86 W6's date form (from #3492, PF-21rs concept r2 §8 M3)
* **j_85:** its browser opened console pages with a bare `goto` and never signed in. Our console keeps its session in the tab's `sessionStorage` "xr-system-session" (#3489). A new `consoleGoto` signs our Platform Owner in through the card, with the same labels as j_86's `consolePage` and #3489's frame: "Work email", "Sign in". The three page opens use it.
* **j_86 W6:** the notice's time is read from the page's `<time datetime>` cells (same instant within a minute, or the same day), with the printed day ("24 Nov 2026", en-GB) as the fallback.
* **On main 7d2d14e2d:** j_85 15 PASS, 4 FAIL, and j_86 21 PASS, 7 FAIL. Every FAIL names a missing part (PF-21rs, PF-17, PF-21d, AUD-3, PF-21c), with no page error. The new code paths run for real only when #3489 and PF-21rs merge.

## 4. Prep for the rows (state at 19:2x IST)
| Row | Waits on | State |
|---|---|---|
| R1.104 | #3477 (queued), #3498 (draft) | qa 7: on 75747bc2f QA-777 check 5/5 and j_104 20/20 twice. After the merge: re-score, close QA-777, ask for walks j_104 on main |
| R1.56 | #3305 (queued) | W9 to align (HST from the invoice detail); stays Partial (W1 from retainer, FO-7c missing) |
| R1.58 | #3442 (dequeued), #3493 | W3 to align (`pick`; a real case's invoice); then FO-7t part 3 |
| R1.85 | #3234 (approved), #3235 | stays Partial after both (PF-21rs, PF-17 console) |
| R1.93 | #3470, #3489 (draft) | waits |
| R1.69 | #3497 (queued) | j_74 is not its pack; QA-781 does not hold it |
| R1.87 | #3491 | waits |
| R1.68 | #3500 (draft) | waits |

## Questions for the Lead
1. When this PR merges, please dispatch walks.yml for **j_74** on main (R1.74's run id, QA-781's close).
2. The j_54, j_85 and j_86 alignments are made ahead of their parts. If #3490's or #3489's builders change the body or labels before merging, they should tell qa.

## Suggestions
* *Later · Scaffolding:* journeys that re-record a dated item after moving a fake clock should compute dates from the clock, not from today. j_74 was the one found.
