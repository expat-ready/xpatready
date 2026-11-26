# qa capability R1.29 — 25 Nov 2026, ~22:xx IST (cloud qa, under Lead 10)

**Run:** `/qa capability R1.29` on main **373cf8d8c** (after #3769; FO-9s part 3 merged in #3716 at 15:28 IST, the one-dialog follow-up #3754 after it). Live AI off, US$0, no priced button, never :4400 (cloud copy: no shared demo here, so the read-only demo walk was not done).

## Verdict: **Works**
All parts are on main (P-606): FO-9a, FO-9b parts 1, 2 (#3174), 2b (#3527), 2b follow-ups (#3710), 2m (#3702), FO-9s parts 1 (#2900), 2 (#3700), 3 (#3716), the one-dialog change (#3754). The two "parts missing" of qa 9 (24 Nov) are both merged, and every step that failed then passes now. No open Major or Critical names R1.29 in `qa/BUGS.md`.

## Pack on GitHub's machines, main's head (P-339)
| Run | What | Result |
|---|---|---|
| walks [45662478296](https://github.com/expat-ready/xpatready/actions/runs/45662478296) (dispatched by qa, `journeys="j_29 j_45"`, ref main = 373cf8d8c) | j_29 recorded walk, job 139376206483 | success |
| item-proof [45662548306](https://github.com/expat-ready/xpatready/actions/runs/45662548306) (pr=3716, by hand on main's head) | R1.29 pack (the row's pack is j_29) + secret scan; verdict `qa/verdicts/auto/R1.29-373cf8d8c….json` on auto-verdicts | **PASS**, 1 of 1 planned run |
| on merge: walks [45590483353](https://github.com/expat-ready/xpatready/actions/runs/45590483353), item-proof [45590483426](https://github.com/expat-ready/xpatready/actions/runs/45590483426) (main 73d509e26) | j_29 | PASS 27/27 |

Independent re-run: the two runs on 373cf8d8c are separate jobs on separate machines from the merge-commit runs; plus two local runs below.

## Walk by screens (gate A, P-348c) — isolated copies here, headless (no display in a cloud copy; the recorded video in walks run 45662478296 is the headed equivalent)
`isolated.sh qa_j29 4471 start --ttl 30` then j_29 twice on the same copy: **27/27 and 27/27, exit 0 both**.
* W1: Add a lead warns before Save (similar name + same phone in another spelling; the same email in other capitals), names who is on file with the reason; the warning never blocks; "Add as new" puts the pair on **Kept separate**, decided by the adder.
* W2: a web-form arrival that looks like Lena is on **Sales › People to merge** with its count, What matched and the score (FO-9s part 2).
* W3: Merge… → 1 Choose what to keep → 2 What moves → 3 Confirm ("… will be merged into … 1 lead and 1 note move.") → **Merge 2 people**; the survivor keeps both histories; the other record is a tombstone with one audit line carrying no email or phone.
* W4: a safe exact duplicate merges **by itself** (twice, before and after the money and case arrivals); a person with money (draft invoice) and a person with a case are never merged by themselves and wait on To review (the case one says "This person has a case; merge them from the client record", Merge… disabled).
* W5: Undo merge on the Merged tab restores both people and their leads; a second Undo is refused (409) in words.
* W6: no session 401; a Case Officer without `agent/prospect:merge` 403 on a merge.
* **W7 = the next capability's first step:** the walk ends on R1.30's Leads list (all open) showing Lena's lead with its filters. PASS.
* No page error.

## My own probes (`tests/qa/probe_r129_r145.ts`, on a fresh copy after j_29 and j_45): 31/31 PASS, exit 0 (rerun after the reviewer's round 1 tightened the reload check)
* 400 and 1024 px: People to merge (To review and Merged) — no sideways scroll, axe WCAG 2.2 A/AA clean, no page error. Screenshot 400 px: rows stack, the case row's reason sits under its disabled Merge….
* Wrong role by URL: the Case Officer opening `/front-office/duplicates` sees the pairs but **no Merge button** (the API refuses with 403 in j_29 W6).
* Keyboard: Enter on Merge… opens the dialog, Escape closes it, focus returns to the Merge… button.
* Reload mid-dialog (open Merge…, Next, reload): no dialog open, and the count of merged-away people is the same before and after (2 = 2, `fo_person.merged_into_id`).
* The same probe also covers R1.45's template screens and API (400/1024 px, axe, Case Officer 403, stale 409, empty and too-long subject 422); those lines are reported in the R1.45 report (#3790).

## Suites underneath (local, `run-suites.sh --only`, main 373cf8d8c)
All 10 PASS, exit 0 (records commit c7a094701 over main 373cf8d8c; app code identical to main; logs in `studio/var/suites`, not committed):

| Suite | Result |
|---|---|
| check_fo9a_duplicates.ts | 53/53 |
| check_fo9b_merge.ts | 88/88 |
| check_fo9b_review.ts | 82/82 |
| check_fo9b_auto_merge.ts (part 2b) | 39/39 |
| check_fo9b_2m_money_merged.ts (part 2m) | 30/30 |
| check_fo9s_duplicates_browser.ts | 32/32 |
| check_fo9s_review_browser.ts | 38/38 |
| check_fo9s_merge_browser.ts | 25/25 |
| check_pf19s_templates_browser.ts (R1.45/R1.46) | 30/30 |
| check_fo5f2_template_safety.ts (R1.45 nearest) | 72/72 |

## Bugs
0 Blocker · 0 Critical · 0 Major · 0 Minor new. Builder-listed Minors from #3716 (not re-logged; for the Lead's list): after the lost-answer message Back then Next turns Merge on again (a second click is a safe 409); very long unbroken names overflow headers; the notice can outlive an Undo in another tab; `fieldWhy` trims differently from the server; 36 px buttons at 375 px; j_29's fixed 500 ms wait.
Housekeeping (no row): j_29's step labels still say "part missing: FO-9b part 2b, #3527" and "bites once W4's control passes" although #3527 is merged — the steps themselves pass; the words are stale. Suggestion below.

## Known flaky suite
`check_fo9s_merge_browser.ts` (being quarantined by #3760): passed first try here, 25/25; nothing it covers changed since #3716.

## What I could not test
Headed browser pane (cloud copy, no display; the walks recording stands in). The shared demo :4400 read-only walk (not on this machine). Coverage (c8) not run this round.

## Questions for the Lead
None blocking.

## Suggestions
* j_29 labels: drop the "part missing … #3527" and "bites once …" wording now that part 2b is on main — *Later*, *Scaffolding*.
