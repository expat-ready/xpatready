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
