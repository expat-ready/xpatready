# PF-R3 Reports page (R1.79 part 4) · independent review

Reviewer: a fresh agent that did not build it (skills screen-review and journey-test) · PR #3864 · concept `concept-draft.md` r2 + `challenge.md` + `design/draft-reports.html` (branch `claude/runtime-pfr3-concept`, #3849; Lead 5's answers 1-3) · isolated copies only, never :4400 · 26 Nov 2026.

## Round 2 · commit `2af419e2e07be078159f1874028f91d9f507400c` (diff from `b6b1178` only)
**Verdict: Approve** (skill scale: Ship). All four Majors of round 1 are fixed and tested. One new Minor (r2-m1) and two small Shoulds remain: fix them, or list them in the PR with a follow-up row.

**What I ran**
- `check_pfr3_reports_browser.ts` on a fresh copy (:4741, `pfr3r2`): **35/35**. `j_79.ts` on its own fresh copy (:4742): **12/12**. A second run on the same copy refuses with "STOP … start a fresh copy" (round-1 m9 closed).
- My own walk (Playwright, my script) at 375, 512 (1024 at 200 %), 1024 and 1440 px. Each Major was checked with the query slowed by 2.5 s.

**Round-1 Majors**
- **M1 "What this counts": fixed.**
  - (i) is now a 24 px toggletip. Enter, click or tap shows the words in the page; Escape, blur, a tap elsewhere or a second press hides them.
  - The words equal `source` (new check).
  - The new problem is r2-m1, below.
- **M2 stale figures: fixed.** Mid-load after picking a person, every card is a skeleton, the grid is `aria-busy="true"`, and no badge or Export button shows. The settled card reads "No invoices in this period · Case officer (Sample)'s work".
  - An outside `person=` id is dropped ("Everyone", no `staffId`), and the query waits for the filter context.
- **M3 month picker: fixed.**
  - The Month select lists November 2026 back to December 2025, plus "Custom dates…".
  - A month writes `from`/`to` to the address and hides the date fields; "Custom dates…" shows them prefilled.
  - From after To keeps both dates, shows "The end date is before the start date. Change one of them." on the To field (`aria-invalid`, `aria-describedby` with `role=alert`), and sends no query.
- **M4 tests: fixed.** New checks cover:
  - BR-6's own empty words ("No payments…", "No invoices…");
  - BR-1's "<Name>'s work" over the person's own empty figures;
  - BR-2's Read-only → Case Officer;
  - BR-3's Billing / Finance (All, "You", no `staffId`; the person in the address is dropped);
  - the outside person id;
  - From after To with no query;
  - the keyboard toggletip.

**Round-1 Minors**
- **Closed:**
  - empty table → 422 `NOTHING_TO_EXPORT`, no line;
  - CSV header in the page's words and amounts written as numbers (my Overdue ageing file: `Currency,Current,1-30 days,…` / `CAD,1130.00,0.00,…`);
  - the refusal names WITHHELD apart from a missing key;
  - "(inactive)";
  - no nested table border;
  - Person select capped;
  - Retry `min-h-11` at 375;
  - real dates only and a strict uuid;
  - one export per press (three sequential presses gave three files and three lines, never two at once);
  - the bar list stops at 15 rows with "Show all n".
- **Left as known, with the builder's reasons; I accept them as Minors:**
  - Reports reached only from Home's list, with the path "My account › Reports";
  - audit `detail` stores the filters as sent (a `view.own` viewer never sends a person, and `scope` records the narrowing);
  - `headingOf` mirrors the web's `heading`;
  - table rows 37 px.
- **Billing / Finance defaulting to All** departs from r2's BR-3 ("Individual for others") towards AG-14-32. It is the breaker's m11, recorded in `contract.ts`. Accepted: this is money for the firm.

**New in round 2**
- **r2-m1 (Minor, Should): the toggletip bubble spills off the right edge.** It is `absolute left-0 w-64` (`reports-page.tsx:29`), with no flip or clamp.
  - Opened on the right-hand tile at 1440 (Fees collected), the page scrolls 63 px sideways and the last quarter of each line is off-screen.
  - At 375 it spills 20 px (Fees collected) and 29 px (Overdue ageing); see `tip-open-375.png` in the reviewer's walk.
  - None at 1024 or at 512 / 200 % (measured 0 on every card), so EXPERIENCE §2.12 [M] holds. UXL-10 and BIC-14 are Partly.
  - **Fix:** anchor it `right-0` when the trigger is in the right half, or use the team's Radix popover (collision-aware).
- **r2-m2 (Minor, Should):** with From after To, the cards pulse as skeletons forever and the grid stays `aria-busy`, though nothing is loading (BIC-18: loading uses skeletons only while loading). Show the cards empty, with "Fix the dates to see figures", or drop `aria-busy` while `rangeProblem`.
- **r2-m3 (Minor, Should): M2's own rule has no failing test.** No check switches a filter while an answer is in flight, so removing `stale` (`reports-page.tsx:110-111`) would leave 35/35 green. Add a slowed-route check: switch the person, and assert no badge, no figure and `aria-busy` until the new answer.

## D1–D20 (round 2; independent reviewer, browser and script)
D1 4 every BR met; drill-through deferred by Lead 5 · D2 4 line before file; empty export refused · D3 4 reuses the door, `csvRow`, `auditEvent`; heading words in two places · D4 N/A · D5 4 reload keeps filters; one export per press; Retry; check refuses a used copy · D6 4 audit line with scope and rows, in the Activity log · D7 N/A · D8 3 "My account › Reports", not in the left menu · D9 4 a month is one choice; custom dates on request · D10 4 per-metric empty words, "(inactive)", the right refusal · D11 4 busy skeletons and a field error (r2-m2) · D12 4 calm team look; bubble clip (r2-m1) · D13 4 axe 0 serious at 375, 1024 (custom dates open) and 1440; keyboard path; 200 % clean · D14 4 · D15 5 LCP within budget, one query per view · D16 4 35 checks, a pass and a fail per BR; M2 lacks a mutation test (r2-m3) · D17 simulated only · D18 4 source words reachable; scope always matches the figures · D19 4 J-79 12/12, re-run in round 2 on a fresh copy · D20 simulated only.

## Scorecard (concept 4c: BIC-11, -13, -14, -18, -19, -20 apply; the rest N/A)
| BIC | R2 | Evidence |
|---|---|---|
| 11 | Met | Only Retry is filled; Export and "Show all" are not |
| 13 | Met | From after To: error on the To field with its fix; both dates kept; nothing asked |
| 14 | Partly | Toggletip on Enter, tap and hover; bubble clipped at the right edge (r2-m1) |
| 18 | Partly | Busy skeletons on reload; endless skeleton on a bad range (r2-m2) |
| 19 | Met | One heading per card; red only for the date error |
| 20 | Met | Keyboard-complete; 1024 and 200 % with no sideways scroll; headings in order |

UXL: 01-06 Met · 07, 08, 13 N/A · 09 Met (Retry 44 px at 375) · 10 Partly (r2-m1, only while a bubble is open) · 11 Met · 12 Met · 14 Met.

**Journey score: 9.5/10, pass** (accessibility and sizes ½ for r2-m1; see the journey-test report, round 2).

## Round 1 · commit `b6b1178` · Verdict: Block (in git history)
The Majors were:
1. BR-5 words reachable by hover only (native `title`).
2. Old figures under new scope words while loading.
3. No month picker, and From after To silently undone.
4. Named BR cases untested.

Nine Minors (m1-m9), with the scorecard and D-scores, are in this file at `2af419e2e`'s parent. The round-1 journey score was 7/10.

## Not checked
A real screen reader (the toggletip's `role=status` mounts with its text, so it may not be announced; the button's accessible name carries the words anyway); an intended user's unaided walk (D17 and D20 stay with the founder); the walk video (no ffmpeg).

Reviewer: Approve 2af419e2e07be078159f1874028f91d9f507400c
