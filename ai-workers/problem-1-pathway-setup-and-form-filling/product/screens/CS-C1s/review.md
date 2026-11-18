# CS-C1s part 2: independent review (skill `screen-review`, with `journey-test` as the reviewer)

Reviewed commit **fa22d256** on `claude/blissful-ritchie-et5yw7`: `git diff origin/claude/serene-newton-knjcpc...HEAD` (23 files, +812/-11). Inputs: brief (a7014c0bb, Part 2, Build Lead C rulings, Overlapped chain), concept r2 §3-§8, `design/board.html`, `build-notes.md`, `screenshots/`, `STANDARDS.md`, `EXPERIENCE.md`, `QUALITY.md`, `PRODUCT.md` §3-§4. Isolated copy `rev` on :4492 only (AI off, local identity, sample seed), stopped after use; no model call, US$0. The journey-test report is folded into this file (§4): the reviewer's instructions name this file as the only one to write.

**Verdict: Ship after fixes.** 0 Blocker, **2 Major** (Must), 4 Minor (Should). The rules, the server and the data underneath held everywhere I pushed. The Majors are two places where the screen tells staff something wrong or nothing at all: the header's "Decision:" (M1), and an act that disappears when the session ends (M2).

## 1. What I ran (evidence)
* `tsx studio/tests/check_csc1s_view.ts` (DS1, DS2): **25 pass, 0 fail**.
* `node studio/tests/check_csc1s_decision_browser.cjs 4492 xr_studio_rev` (DS3-DS5, 1440 and 375 px, axe): **49 pass, 0 fail** (2 min 53 s).
* qa's `tests/qa/check_r177_case_decision.ts 4492 xr_studio_rev`: **45/45 pass**, including the screen line "R1.77 person (Gap)", which failed before this branch. The brief says 46/46; this copy counts 45 checks. I did not find out why the count differs by one.
* **Rule-removal spot-check (STANDARDS §7):** I removed `ruled.length === 0` from `can.withdraw` and `filings.every(latest)` from `can.close` in `case-close.ts`, ran the check and got **21 pass, 4 fail** (the BR-4 and BR-5 cases). Then I restored the file (`git status` clean).
* **My own walk** (Playwright, scripts in the scratchpad):
  * Paths: keyboard only at 1024 px (signed in inline, recorded Approved with a note in non-Latin text, closed, reloaded, reopened); 720 px at 2x, i.e. 200 % zoom (the panel and the Correct dialog fit); 1440 px (withdrew a case, then opened it with no session).
  * Break pass: a double click on Record gives 1 row, on Close 1 audit line. 3 parallel closes give 200/409/409, 2 reopens 200/409. The same idempotency key twice gives 201/201 and 1 row. A reason of invisible characters only (U+200B, U+00A0, U+2060) gets "Give a reason."; 1,001 characters "At most 1000 characters."; a 2,001-character note its field error; each time the case is unchanged and the text kept. The case officer: GET 200, withdraw and reopen 403. No token 401. A malformed or unknown id: 404 "No such case in your firm."
  * Data underneath: audit lines `case.decision.recorded`, `case.closed`, `case.reopened` by `staff:<id>`; `runtime_case` back to OPEN at the stage it closed from, closing fields cleared.

## 2. Concept fit, words, code
* **Concept §3-§6, all present:** the panel under Submission to IRCC with a skeleton while it loads. Rows of every stage ("(earlier stage)", Submitted on / Not submitted yet, the latest decision with its Sample mark, "1 earlier decision" opening the history with who and when). At most one filled button; the hint "{n} of {m} decided" names any filing not submitted. Four dialogs: filing in the title, date empty, counter, correction note. The §5 refusal words in the dialog, with "Nothing was changed.", and the panel reads again. No session: sign-in inline; no key: who can is named. Header pill Closed / Withdrawn and the closing line.
* **Rule parity:** `can` (`case-close.ts:131-136`) matches the four acts' checks line for line: withdraw counts DECISION rows of any filing, as `locked` does; close counts active filings of every stage.
* **Firm scope:** the case is matched by firm key plus the platform firm id (`:100-103`). The read is GET-only with no lock and makes 4 queries whatever the row count (no N+1). The web side sends one request, shared by the header and the panel (`useCaseDecisions`, one query key).
* **Keys:** checked on the server (`@PermissionKeys("agent/case:show")`). The four POSTs are unchanged. No schema or migration.
* **Words:** they match `PRODUCT.md` §4 (Withdraw, Representative, Case officer, firm staff). No ids or rule numbers on the main path: the API's texts with rule numbers are replaced by the §5 words.
* **Retrofit:** build notes say no team code exists for a case decision (concept §2): recorded.
* **Named honestly (not scored):**
  * `start.sh` is not changed and goes to the tech lead as a question (build notes, Known gaps).
  * The outcome words stay Sample, with a tooltip.
  * Concept §3's out-of-scope list: other panels on a closed case still offer their actions (seen on my walk: Change channel, Add finding and others); no check that a decision date is not in the future.
  * 1024 px was not walked by the builder: it is named as an [S] gap. I walked it: no sideways scroll, axe clean.

## 3. Findings
**Blocker:** none.

**Major (Must):**
1. **M1. The header's "Decision:" can name an outcome no current filing has.** At `case-close.ts:116,129`, `decision` is `ruled[0].outcome`: the newest DECISION row of *any* filing, **active or not**, because `c.decisions` is not filtered to active filings, unlike `filings` at `:101`.
   * Two decided filings (Approved, then Refused): the header names only the last one recorded.
   * A filing decided and then removed: the header names its outcome, while the panel's only row says something else.
   * This contradicts the panel (concept §4 header line; STANDARDS §3.9, "explains itself"; journey "correct data"). My walks were one-filing cases, which read correctly; this is from the code at fa22d256. The breaker's M1 reproduced both cases in SQL (`break-report.md`).
   * Fix: build the header from the active filings' `latest`: one outcome per filing, or no "Decision:" when they differ. Add a DS1 case for each.
   * The working tree already holds an uncommitted change to `:129` (`decisions: …filings…latest`), not by me. It is not reviewed here: re-review the commit that carries it.
2. **M2. An act sent after the session has ended disappears without a word, and the typed text is lost.** In my walk, the same person signed in elsewhere, then Withdraw the case… was sent with a date and a reason. The dialog vanished, no toast or line appeared, the case stayed OPEN, and the panel showed the plain sign-in card. A person can believe the case was withdrawn.
   * Cause: `case-decision.tsx:106` (`act && q.data`) unmounts the dialog when the token is cleared, and `SignInCard embedded` at `:101` is given no `failed` reason. A token that expires does the same.
   * This breaks EXPERIENCE §2.10 [M] ("errors say what happened and how to fix it") and BIC-13 ("what was typed is kept").
   * Fix: keep the dialog open with the 401 words in it, or say in the panel "Your session ended; nothing was recorded", with the reason, and keep the draft.

**Minor (Should):**
1. **Focus is lost after the inline sign-in.** When the rows replace the card, focus falls to `<body>` (walk: "focus after sign-in: BODY", twice), so a keyboard user starts again at the top of a long page. `case-decision.tsx:98-105` moves no focus when the token appears.
   * Fix: focus the panel heading (its `heading` ref, already `tabIndex={-1}`) when `token` turns on.
2. **Tooltips are `title` attributes, so they show on hover only.** This applies to the Sample mark, "Signed in as" and "1 earlier decision" (`:44`, `:96`, `:157`). BIC-14 asks for hover and keyboard focus, and the app has `Tip` with `focusable` (`components/status.tsx:15`).
   * Fix: use `Tip`.
3. **Field errors hide the counter, and the empty-date message names a different format.**
   * When a field error shows, the counter is hidden: `Field`'s error replaces its hint (`controls.tsx:59`).
   * The local message for an empty date is "A real date as YYYY-MM-DD." (`case-decision.tsx:188`), but the control shows mm/dd/yyyy.
   * There is no error summary at the top (BIC-13). The dialogs have at most 4 inputs.
   * Fix: "Give the decision date." / "Give the withdrawal date."; keep the counter beside the error.
4. **The graph (P-86) does not see the screen's calls.** `graph.mjs` (G1 0, G2 0) lists `POST …/withdraw`, `…/close` and `…/reopen` under G3 as "no test reaches, no page uses it". `case-decision.tsx:191-192` builds the path in a ternary, so the graph detects no caller (`check_csc1_close.ts` and DS3-DS5 do reach them).
   * Fix: a literal path per act. I restored `qa/graph.json` after the run.

## 4. Journey test (reviewer's score, the one for this check)
Journeys: J1 main path (the Representative records Approved, closes with a reason, reads the header, reopens: back at Visitor visa) · J2 a correction, with the history by name · J3 withdraw before any decision (header: Withdrawn on 12 Nov, recorded 18 Nov) · J4 empty (nothing submitted: no Record, the filing named) · J5 error (empty, spaces, invisible or over-length reason; no outcome or date) · J6 wrong role (the case officer, by screen and by API) · J7 recovery (reload while closed, double click, parallel requests) · J8 no session (sign-in inline, then the rows) · J9 session lost mid-dialog (M2).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J3 done by screen only; qa's R1.77 screen line passes |
| Next step obvious | 1 | One filled button per state; the "0 of 1 decided" hint (walk 1024 panel) |
| Plain words | 1 | §5 words; no codes; Minor 3's date words only |
| Feedback and state | 1 | Toasts "Decision recorded." / "Closed."; skeleton; refusal in the dialog (`9-refusal-1440.png`) |
| Correct data | ½ | Single rows and audit lines under a double click and parallel requests; reopen at the same stage; but the header's Decision (M1) |
| Error recovery | ½ | Field errors keep the input and a 409 reads again; but M2 (a session lost mid-dialog drops the act and the text, with no word) |
| Accessibility and screen sizes | ½ | axe clean (1440, 1024, 375); 200 % fits; keyboard path complete; but focus lost after sign-in (Minor 1); tooltips hover-only (Minor 2) |
| Speed | 1 | Rows 0.8 s after sign-in; one GET per case page |
| Visual quality | 1 | Team Pill, Notice, Dialog; the closing line wraps at 375 px (`8-reopened-375.png`) |
| Trust and sources | 1 | Every outcome word marked Sample with a tooltip; "recorded by {name} on {date}" |

**Journey score 8.5/10: pass** (8 or more, no 0). To raise it: M1, then M2, then Minor 1.

## 5. D1-D20 (1-5)
D1 4 (every BR in §3 behaves; the header line misses concept §4 for several filings: M1) · D2 5 (races, idempotency) · D3 5 (no copy of a rule; shared zod shape) · D4 5 (`can` equals the acts; the removal check fails 4) · D5 3 (reload and double click hold; M2) · D6 4 (audit by `staff:<id>`, no freshness needed) · D7 N/A (no AI) · D8 5 (case header plus a named panel) · D9 5 (one next act per state) · D10 4 (Minor 2, 3) · D11 5 · D12 4 (team components) · D13 4 (Minor 1, 2) · D14 4 (team components) · D15 5 · D16 5 (pass and fail per BR; screenshots) · D17 simulated only · D18 3 (Sample marked, recorded by; M1) · D19 4 (R1.77 closes by screens; `start.sh` on :4400 open) · D20 simulated only.

## 6. BIC scorecard (EXPERIENCE §6)
01 Met (filing words and dates from the records) · 02 N/A · 03 N/A · 04 Met ("Note (optional)"; required fields refused at the field) · 05-07 N/A · 08 Met (each row names person, stage, submitted and decision) · 09 N/A · 10 N/A · 11 Met (one filled button, named for the act: walk `j1-closed-panel-1024`, `4-decided-1440.png`) · 12 N/A · 13 Partly (on the field and in the dialog, plain words, input kept; no top summary, date words: Minor 3; M2) · 14 Partly (tooltips present, hover only: Minor 2) · 15 N/A · 16 Met (each act an audit line with who and when; history by name) · 17 N/A · 18 Met (loading skeleton, no session, no key, empty, closed, withdrawn, refusal) · 19 Met (one h2, one filled button, red only for refusals; 1440 and 1024) · 20 Partly (keyboard-complete, 200 % and 1024 with no sideways scroll, headings h2/h3; focus lost after sign-in: Minor 1).
BIC-13 is a **Must** through M2, which breaks EXPERIENCE §2.10 [M]. BIC-14 and BIC-20 are Shoulds: the keyboard path exists and the tooltips are present.

## 7. Not checked
* A real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); terms not accepted (428), not reachable on the sample seed.
* The regression suites named in the brief (`check_csc1_close`, `check_csc1_count`, C8.2, `check_b78`, demo reset, C10.1) and full `ci`: not rerun here; the build notes point to the PR body.
* Two tabs with the same person: each tab has its own session and a second sign-in ends the first (PF-4), so I checked that race through the API. Never :4400.
* The breaker's report (`break-report.md`) appeared in the tree during my review. My findings are my own walk and code reading; I read its Majors only to check severity. M1(b), the removed filing, is its reproduction, confirmed against the code.

Reviewer: Changes requested fa22d256

**Verdict: Block**. Fix before the `review: approved` label:
1. M1: the header's "Decision:" from the active filings only, and one outcome per filing or none when they differ (`case-close.ts:116,129`), with DS1 cases.
2. M2: a 401 while a dialog is open keeps the dialog (or says so in the panel) and keeps what was typed (`case-decision.tsx:101,106`), with a DS5 case.

## Re-review cc35af51 (diff only: `git diff fa22d256..cc35af513c2d112bb058144d3e6f23be30fd77b0`)
The diff changes `case-close.ts` (1 line), `contracts/runtime.ts` (the `decisions` shape), `case-decision.tsx`, both CS-C1s tests, the build notes and the screenshots. It also commits `break-report.md` and my review as I wrote it. Copy `rev` on :4492 only, built from cc35af51 (not rebuilt), stopped after use; US$0.
* **Reran:** `check_csc1s_view.ts` **26/26**; `check_csc1s_decision_browser.cjs` **52/52**, including "break M2" and "review M2".
* **Rule-removal check on the M1 fix:** I put back the header's decisions from every filing's rows (the old behaviour). The check fails exactly the "break M1" case (25 pass, 1 fail). I restored the file; `git status` is clean.
* **M1: closed.** `case.decisions` is now each *active* filing's latest decision (`case-close.ts:129-130`). The header reads "Decision: X" when they agree and "Decisions: X for A, Y for B" when they differ.
  * Walk, one filing: "Closed by staff (Sample) on 18 Nov 2026 · Decision: Approved (Sample) · Reason: …".
  * Two different outcomes: walked with the read's answer replaced in the browser, because the copy turns a second filing added in SQL inactive. The line reads "Decisions: Approved (Sample) for Reviewer Client M, Refused (Sample) for <Arabic name> Spouse" (screenshot `rr-m1-header-1024`). Both names are isolated with `<bdi>`. No sideways scroll at 1024 or 375 px.
* **M2: closed.** I repeated my earlier walk: Record a decision with an outcome, a date and a note, then the same person signed in elsewhere, then I sent it.
  * The panel says "Record a decision: Reviewer Client M · Visitor visa was not sent: nothing was recorded. You signed in on another device. Sign in again: what you typed is kept and opens again." It is a `role=status` notice; axe is clean; 0 rows were written.
  * After the inline sign-in, the dialog opens again with Approved, 2026-11-16 and the note, plus "What you typed is kept. Nothing was sent yet." Sending it records 1 row.
  * The next dialog opens empty.
* **My Minors:**
  * m1 closed: focus goes to the "Decision and closing" heading after the sign-in.
  * m2 closed: `Tip` with `focusable`; the Sample tooltip opens on keyboard focus.
  * m3 closed: the counter stays visible beside an error, and the empty-date message is "Give the date.".
  * m4 answered: the four POSTs are literal calls. The graph reads `api(...)` only, so it misses every `staffApi` caller in the app; that is a tool follow-up, accepted.
* **Breaker's minors:** m3 (no firm key in the 404), m4 (403 words, `/me` read again) and m6 (`<bdi>`) are fixed. m1, m2, m5 and m7 are held as follow-ups and named in the build notes: they are outside this row's touch list (CS-C1's older checks), or concept §4's session-dependent header.
* **New, Minor (Should):**
  * The note counter's `aria-live="polite"` (`case-decision.tsx:268`) announces after every keystroke. Announce it near the limit only, or link it through `aria-describedby`.
  * No browser case for the mixed "Decisions: … for …" line. DS1 checks the API's array only.
  * If the person who signs in again lacks the key, the reopened dialog sends and gets the 403 words, which the server enforces. It is acceptable, but not tested.
* **Journey score, re-scored:** correct data 1, error recovery 1, accessibility and screen sizes 1 → **10/10**, pass.
* **Not checked:** the token-expiry path (`TOKEN_EXPIRED`), seen in the code only; the regression suites (the builder ran them on fa22d256, and this diff touches only this row's files); full `ci`.

Reviewer: Approve cc35af513c2d112bb058144d3e6f23be30fd77b0

**Verdict: Approve** (no open Blocker or Major at cc35af51).

## Re-review f954a886 (merge of main, diff only)
Diff only (P-270). Since cc35af51 there are two commits: 763081bd (this review record, records only) and the merge of origin/main, f954a886. No copy was started and :4400 was not used; web/dist was not rebuilt; US$0.
* **This row's files did not change.** `git diff cc35af51 f954a886` is empty for `api/src/case-close.ts`, `api/src/features/case-close.ts`, `contracts/runtime.ts`, `web/src/runtime/case-decision.tsx`, `web/src/runtime/cases.tsx`, `web/src/runtime/MODULE.md`, `tests/check_csc1s_view.ts` and `tests/check_csc1s_decision_browser.cjs`. Only three files near this row changed: `MODULE.cases.md` (+2/-1), `frame.tsx` (+5/-2) and `cases.prisma` (+11). All of them came from main.
* **The conflict resolution is correct.** The merge base's Tests line had neither test. Main (f954a886^2) added `check_csw1_firm_id.ts`, and this branch added `check_csc1s_view.ts`. The merged line keeps main's order and has both, once each (`git diff f954a886^2 f954a886` shows only this row's two card edits: the Entry points `GET cases/:id/decisions` and the Tests line). Main's new CS-W1 invariant line is kept as written. Both test files exist, and the studio tree has no conflict markers.
* **`frame.tsx` (PF-5t part 2 terms gate).**
  * `SignInCard`'s signature and its `embedded` path are unchanged. Only `PlatformFrame` changed: it now waits for `useTermsPending` and shows `TermsPage` instead of the page.
  * The case page does not render `PlatformFrame`. `case-decision.tsx:17,123` imports and renders `SignInCard embedded` only. So the gate and its query-cache subscriptions (`terms-gate.tsx:21-35`) are not mounted on `/cases/:id`.
  * The panel still handles the server's 428 itself (`case-decision.tsx:137`, "Accept the terms first" with a link to My account), and on `/account` the new gate now shows the terms page. Main brought no server change to terms or the guard (no `api/src/platform/terms` or guard file in the merge's stat), so the 428 behaviour this row was approved against is unchanged.
* **`cases.prisma` and migration `20261118090000_csw1_firm_id` (CS-W1 part 1).**
  * They add a nullable `firm_id` on `runtime_case`, `case_stage` and `firm_case_counter`. The triggers run BEFORE INSERT only. This row's close and reopen are UPDATEs on `runtime_case`, and `case_decision` has no new trigger, so none of this row's writes meets the new triggers.
  * Opening a case (the tests' setup) now fills `firm_id` from the key, or leaves it null when the key has no platform firm. Part 1 never refuses that insert, so the DS1 case "a case whose firm key names no platform firm is 404 too" still holds (it passes, below).
  * Identity checks still compare `firm_key` until CS-W1 part 2. That part will need to switch `CaseClose.view` and the four POSTs. This is noted for CS-W1 part 2 and is not a gap in this row.
* **Nothing on main calls this row's routes or edits the case header.** The merge's stat has no file under `web/src/runtime/`, `web/src/components/` or `contracts/`, and no `case-close.ts` or `api/src/runtime.ts`. A grep of the API at f954a886 for the decisions route outside `case-close.ts` and the card finds nothing. The new `main.ts` start step (`fillCaseFirmIdsOnStart`) and the `firms.ts` helpers do not touch decisions or closing.
* **Reran:** `check_csc1s_view.ts` on f954a886 against PostgreSQL :54329: **26 passed, 0 failed**. I did not rerun the browser check (the builder reports 52/52 on f954a886), because it needs a built copy, and this diff changes no file it serves for this row. I also did not rerun the type check (the builder reports no new errors).
* **Journey score:** carried, **10/10**. The merge changes nothing a user of this panel sees or does. I did not walk the page again; the score stands on the cc35af51 walk plus the unchanged files above.
* **Not checked:** full `ci` on the merge; main's own new checks (`check_csw1_firm_id.ts`, `check_pf5t_terms_browser.ts`), which main's CI covers; a walk of a signed-in staff member with pending terms on `/cases/:id`. That last one is code-read only: the 428 notice shown is the one approved earlier.

Reviewer: Approve f954a886fedb79009c1bc30efc4140d504fb01a2

**Verdict: Approve** (no open Blocker or Major at f954a886; the merge brings in nothing that breaks this row).
