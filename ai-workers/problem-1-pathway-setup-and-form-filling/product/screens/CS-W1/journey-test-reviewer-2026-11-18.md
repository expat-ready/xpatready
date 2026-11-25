# CS-W1 part 1: journey test (reviewer, 18 Nov 2026)

**Item:** PR #2125, commit `d59865563`. Part 1 is schema only, so nothing a person sees changes. The journeys check that the case-side paths people use still work. They also check that every case they open carries its firm's platform id underneath.
**How:** isolated copy `rv_csw1` on :4438 with the configured checkpoint loaded, then headless Chromium driven by a Playwright script. The script uses what a person sees: buttons, labels, Enter and Tab. Data was then read in the database. A clean worktree of `d59865563` was used for the data checks, because the shared checkout moved during the review. The scripts and screenshots are in the reviewer's scratchpad, not committed (`csw1_journeys.mts`, `kbd.mts`, `shots/`). US$0.

## Journeys (main path first)
1. **Case officer (Sample firm, user-O): open a case.** Cases › Open a case › principal "Sample Client J1" › Open case. *Expected:* a toast, the case page, and the case and its stages carry sample-firm's `platform_firm.id`. **Held:** toast "Case C-2026-00002 opened", then the case page. The case's and the stage's `firm_id` both equal sample-firm's id. 1.3 s the first time (cold), 0.2 s after.
2. **Solo firm staff (user-S): open a case.** *Expected:* sample-solo's id, and the solo firm's own number sequence. **Held:** `C-2026-00001`, sample-solo's id on the case and its stage.
3. **Wrong firm: user-S opens the Sample firm's case by URL.** *Expected:* unchanged, "No such case.". **Held:** the page reads "This case could not be opened / No such case.", and the API gives 404 "No such case.".
4. **Recovery: double-click Open case.** *Expected:* one case. **Held:** one case more (3 → 4), filled.
5. **Recovery: reload the case page.** **Held:** no error.
6. **Keyboard only (1024 px):** Tab to "Open a case", Enter, Tab to the name, type, Enter. **Held:** reached by Tab, the case opened in 0.1 s, filled.
7. **Author: Demo reset.** *Expected:* no case left, both Sample firms kept. **Held:** 201 in 0.75 s, 0 cases in the demo workspace, both firms present.
8. **Empty or held set-up: a copy started with `PLATFORM_SAMPLE_SEED=off`.** No platform firm at start. Load the configured checkpoint. **Held:** 0 → 2 firms, the checkpoint's case filled, and one audited `platform.demo.reset` bypass line.
9. **Handing to the next step (part 2's input): data kept across the update.** With the firms absent when the migration runs and present afterwards, every existing case, stage and counter **stays null** (review Minor 1).

## Automated checks
* axe WCAG 2.2 A/AA: the case page and the cases list at 1024 px have 0 violations. The case page was scanned while still loading, so that one is weak evidence.
* Widths: the cases list at 400, 1024 and 1440 px, and 1024 px at 200 % zoom (512 CSS px), has no sideways scroll.
* Console: only the 404s that journey 3 causes on purpose; no page errors.
* Run twice: journeys 1-7 passed in both runs. The keyboard script timed out once on its first, cold run (waiting for the button), then passed. I count that as my script's cold start, not a product fault.

## Break-it (15 min)
Lookup with odd keys (100 kB long, Japanese, trailing newline, `%`, NULL, wrong case, injection): nothing returned. Shadowing with a temporary table: nothing returned. `CREATE` in `case_lookup` as the app: refused. Five migrations at once: all applied. Re-applying the migration after a `public`-only reset fails (review **Major 1**, `migration.sql:79`).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journeys 1, 2, 6, 7 |
| Next step obvious | 1 | toast, then the case page (unchanged) |
| Plain words | 1 | "No such case."; the trigger's refusals name the key (they never reach a person in part 1) |
| Feedback and state | 1 | toast with the case number |
| Correct data | ½ | right ids on every new row; kept-data rows stay null (journey 9) |
| Error recovery | 1 | double-click, reload, wrong firm |
| Accessibility and screen sizes | 1 | axe 0; 400/1024/1440 px; 200 % zoom; keyboard-only |
| Speed | 1 | opening 0.1-0.2 s warm (1.3 s cold); reset 0.75 s |
| Visual quality | 1 | screens unchanged (shots `j1`, `j2`, `j3`, `cases-list-*`) |
| Trust and sources | 1 | no AI involved; the firm comes only from the database lookup |

**Total: 9.5/10, pass** (8 or more and no criterion at 0).

## Fixes that raise the low criterion
Correct data: fill rows that are still null after each Sample seed, or have part 2 re-run the backfill (review Minor 1).

## Not tested
A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). The Mac's :4400 data. Heads after `d59865563`.
