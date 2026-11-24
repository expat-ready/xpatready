# qa 10 (Track B) — capability prep on PR heads: R1.69, R1.87, R1.93, R1.85, R1.68

**Run:** `/qa capability R1.69 R1.87 R1.93 R1.85 R1.68`, 24 Nov 22:1x-23:0x IST, cloud qa lane on the new account (Opus 5.5, effort medium, as the Lead's brief says). Main 4cd0091f4 at start (a040b46d5 at the end; none of the five rows' parts merged in that time). Isolated copies only (:4473, :4475, :4476, :4478, :4485), live AI off, US$0, no priced button. Requirement text: the BACKLOG rows' own words (CS-D5, CS-D6, AUD-3, PF-17, PF-21d); `trace-requirements.py --brief` has no Release 1 row for R1.68 or CS-D5 (it answers "no Release 1 row"), so CS-D5's BACKLOG row was read directly.

**Verdict:** no row scored (P-606: every row still has a part in a PR). Each journey now passes the steps its PR covers on that PR's head, twice; each remaining FAIL names a part that is not in any of these PRs. Ready for the re-score within the hour each last part merges.

## Results on PR heads (each run twice, the same steps both times)
| Row | PR (head) | Journey | Result | FAILs left (part) |
|---|---|---|---|---|
| R1.69 | #3497 CS-D6 part 2 (2836de75c) | `j_69` (the builder aligned W5 on the PR) | **21/21, exit 0, twice** | none: the last parts (the keep list, the weekly reminder) pass. Once #3497 merges, R1.69 has every part on main |
| R1.87 | #3491 AUD-3 part 2 (36a32698a) | `tests/qa/probe_r187_firm_sees_our_read.ts` (aligned here) | **8/11 twice** (5/9 before) | AUD-3 part 3 (our audit search, 404); AUD-3b (support session, 404; and the read's "why", QA-776) |
| R1.93 | #3489 PF-17 part 4 PR B (8e7f454d6) | `j_93` (W2 tightened here) | **23/24 twice** | W4, the Support page: PR C |
| R1.93 | #3517 PF-17 part 4 PR C, stacked on #3489 (2df7793ef) | `j_93` | **24/24, exit 0, twice** | none |
| R1.85 | #3235 PF-21d part 1b, stacked on 1a (2e859e10f) | `j_85` (W5 aligned here) | **17/21 twice** (15/21 before) | PF-21rs (console Privacy pages: W1, W2, W7 to R1.86's Breaches page, with PF-21c); **PF-21d part 2** (the platform and front-office erasers) |
| R1.85 | #3234 PF-21d part 1a (c2e3ece25) | `j_85` | 15/21 | as above, plus 1b's two W5 steps (approve, the run): not in 1a. j_85 has no step on 1a's own switch (not in R1.85's Done when) |
| R1.68 | #3500 CS-D5 part 2 (b9612365c) | **`j_68`, new** (written here) | **15/15, exit 0, twice** | none |

## What changed in the packs
* **j_68 (new, R1.68):** the officer clicks the file's name on its line ("Preview bank-statements.pdf"); the panel (a dialog titled with the name) shows type, size, upload date, "Not scanned yet" (never "Checked: clean" before PF-F3) and draws page 1 of 3 (26 332 dark pixels); one preview link and bytes only from `/document-previews/`, never the download route, no download, no iframe/embed/object; one "previewed" line naming the officer and no "viewed" line; Next/Previous (Page 2 of 3, back to 1), Zoom 200% and Rotate redraw (783x1108 → 1586x2245 → 2245x1586) and write no line; Close and Escape return focus to the name; the stored SHA-256 unchanged; part 1's link inline + nosniff + `default-src 'none'; sandbox`, nameless URL, single use (second fetch 404), other firm 404, client 403; keyboard only; 400/1024/1440 px no sideways scroll, axe clean on the panel; ends at **R1.69's first step**: the line's File details shows "Read by" with "Case officer (Sample) · Previewed".
* **j_85 W5 (R1.85):** the guessed `register/requests/:id/approve` and `erase-now` routes replaced by 1b's real ones: `POST /api/system/erasure/requests/:id/approve` (no reason asked) and `GET /api/system/erasure/requests/:id` (In progress, erasing on approval day + 7: 1 Dec). The erasure is the daily job, so `Erasure.run` is run in-process on a fake clock (day 7) against the copy's database, with the real switch and the real hold adapter; part 1b registers no eraser, so the hold-first rule is walked with one stand-in eraser that only counts calls (said in the step): HELD, the stand-in never called, the hold's reason on the step ("ERASURE_HELD: On legal hold; nothing was erased. hold …: Sample litigation (J-85)"), the person's row stays. A new step for a person with no hold fails, naming **PF-21d part 2**: with no eraser the run says "SKIPPED" (never a false COMPLETED, as the brief rules). The service modules are imported only when present, so j_85 still runs on main.
* **R1.87 probe P5:** AUD-3 part 2 as built: firm A's report (200) lists P1's read and never firm B's own read (made for the test); the report's call writes one more `platform.system.firm_read` on firm A's trail; the CSV export (`text/csv`) holds P1's line and not B's and writes one `audit.exported` line on firm A's trail (SA-11-9); firm A's own Owner's firm session gets 403.
* **j_93 W2:** the Firms page check read the whole row's text, which held "150" (a usage figure), so "1 failed job" was found in any row. It now reads each row's Failed jobs cell (`[data-failed-jobs]`) against that firm's own dead letters: firm A "1", firm B "0", as the database.

## Bugs
None new. QA-776 (R1.87's "why", Ambiguity, Minor) and QA-755 (Minor, nearest R1.93) stay open; no Major or Critical names these five rows. The j_93 W2 looseness was the test's, fixed here.

## Coverage
Not measured in this round (no Works claim; prep on PR heads only).

## What I could not test
* The walks on GitHub's runners: cloud lanes cannot dispatch Actions (P-439). The Lead is asked on the records PR.
* R1.68's "Checking for viruses…" and "Removed — infected file" (no scan state for case files until PF-F3, R1.66) and a PDF whose script must not run: the builder's `check_csd5_preview_browser.ts` covers these on the same head; j_68 does not repeat them.
* No headed walk in a browser pane from the cloud; the journeys ran headless at 1440 px, plus 400 and 1024 px where they size.

## Questions for the Lead
1. When #3497 merges: `gh workflow run walks.yml --ref main -f journeys="j_69"`, twice (the run and the independent re-run), so qa can score R1.69 with both run ids and a fresh reader.
2. When #3500 merges: `gh workflow run walks.yml --ref main -f journeys="j_68"`. R1.68's only part left is CS-D5 part 2, so that walk is its score.
3. R1.85 has one more missing part than its row named: **PF-21d part 2** (the erasers; the brief's own part 2). Is it planned for Release 1? Without it an approved deletion is never carried out (each run says SKIPPED).

## Suggestions
* *Needed for the proof · Capability:* a walk of j_93 on #3517's head on GitHub's runners before it leaves draft (gate A), so R1.93 scores the hour PR B and PR C merge.
* *Later · Scaffolding:* runners that check out PR heads in one clone should return to the lane's branch on every exit (a commit made while detached was nearly lost here; recovered from the reflog).
