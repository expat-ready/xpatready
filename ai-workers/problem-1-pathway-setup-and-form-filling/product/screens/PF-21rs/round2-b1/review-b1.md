# PF-21rs B1 (R1.85): "Data requests to us", the list and one request: independent review, 26 Nov

**Commit reviewed:** `0a4e2c0ec674d6bfbed8f4284e3c26439b400be2` (PR #3818, branch `claude/runtime-pf21rs-b`), diff `origin/main...HEAD`: 10 files, +419 −6. The web part is `privacy/requests.ts` (98), `requests-page.tsx` (108), `request-page.tsx` (104), plus `contract.ts`, `routes.tsx` and the `breach-page.tsx` race fix (+17 −6).
**Read:** concept r2 §3 (BR-5, BR-7, BR-8), §4 "Data requests to us", §5, §6, §8; challenge M4, m1, m6, m7; board r1 §5; `register/requests/{service,routes}.ts`; the migration's MOVES; a2/review.md for calibration. Legal holds, W3 and "Hold this person" are B2 or Not built, so they are not findings here.

**Verdict: Rework (Block).** There are 2 Majors and 7 Minors.

## What I ran (copy `pf21rsr` on :4438, never :4400; AI_LIVE=off; US$0; stopped after)
* `check_pf21rs_browser.ts 4438 xr_studio_pf21rsr`: **52/52**, run twice, 48 s each. I restored the screenshots it rewrites with `git checkout`.
* `tsc -p web --noEmit`: exit 0. `graph.mjs`: G1 0 · G2 0 · G4 0 · G5 0. G3 lists `GET requests/:id` and `POST :id/status` as untested with no web use. That is the tool's known `systemApi()` blind spot (a2 review); the check and my walk both call these routes.
* `module-cards.py pr` with the PR's files and body: **FAIL** (web-shell card; Minor 7).
* My own Playwright walk at 1440 px (Chromium), as the Sample Platform Owner signed in on the console card: through the menu → list → chips → Log a request (with bad input, a firm typed by name, a future day, a 120-character Polish and Chinese name, a real firm and person, then a double click) → Put on hold → Start work → Mark completed by keyboard; two tabs with a stale move; 1024, 720 (1440 at 200 %) and 375 px with axe; a missing id; our Auditor opening a request by its address. I read the DB after each step. Scripts and screenshots are in the session scratchpad.

## Concept fit (held)
* **Menu and title:** a Privacy group with "Requests to us", shown by key. The page is headed "Data requests to us" (j_85 per §8 M3). The crumb and tab title match.
* **List (§4):** columns Received · Requester · Type · Target date ("in 30 days", "10 days late" in red, with the word as well) · Status (word + shape). Status chips (All plus five) with `aria-pressed`. A filter with no match shows "No request has this status." The list opens in 187 ms.
* **Log a request:** has type, name, email and received on (no future day: the API's words appear under the field). The API's 422s land under their fields, and focus moves to the first refused field. A double click stores one row. Logging opens the request's page with "Logged…", focus on the h1, Pending, and target = received + 30 days, on screen and in the DB (BR-5).
* **One request:** shows its facts, the firm by name, the person with §4's copy "…not checked against the firm's records", "Logged by" with our staff member's name, and its steps in order with who and when. It offers only the moves the API accepts (m6). Overdue is never offered (BR-5), and the page says why. "Mark completed" with no "What was done" gives the API's error under that field. The note is optional (BR-7, m1). "Completed: nothing more can be changed." A note over 2,000 characters and a bidi override are each refused under the Note field.
* **Roles (BR-8, W5):** the Auditor sees the API's 403 words on both pages, with no table, no button and no link. A firm token gets 403 on all four routes and nothing is written. A missing id gives "No such request." and a link back.
* **Data:** DB = screen. Status, actions taken, firm and person are exactly as typed. There is one event per move, and audit lines are written on `plat_system_audit` (14 for my walked request, including the refusals).
* **A2 race fix (`breach-page.tsx:91-99`):** Edit and Decide open only after a fresh read, and the stale check compares with `seenAt` from that read. The formerly quarantined step passes twice. The logic is sound: a failed refetch keeps the old copy, but `unchanged()` still catches a change.

## Standards [M]: met except as listed
**Met:** team frame and tokens; a dialog for each change; loading, error with Retry (none on 403 or 404), read-only and filtered-empty states; status shown by word and shape; one filled button per view; one browser request per view (names joined on the server); authorisation on the server; zod shapes with no React (`requests.ts`); comments say why; axe 0 serious with no sideways scroll at 1440, 1024, 720 and 375.
**Not met:** STANDARDS §3.2 "Pick, don't type" and EXPERIENCE §2.8, §2.10 (Major 1); WCAG 2.4.3 under EXPERIENCE §2.12 (Major 2); EXPERIENCE §4 conflict state (Minor 1); EXPERIENCE §2.10 status tooltip (Minor 4); STANDARDS §7 module card (Minor 7).

## D1-D20 (1-5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | W1, W2, W5, W6 and BR-5, BR-7, BR-8 as written; the firm is typed as an id (Major 1) |
| D2 Data integrity | 4 | API refuses bad input; double click stores once; a typed firm id is not checked to exist (runtime, not this PR) |
| D3 Reuse | 4 | Shared Dialog, Field, `firmWords`, `actorWords`; A1's firm picker is not reused |
| D4 Rule integrity | 5 | Moves = the migration's MOVES minus Overdue; Overdue only by the check |
| D5 Stability, recovery | 3 | Reload and double click hold; a stale move is not reloaded (Minor 1); focus is lost after a move (Major 2) |
| D6 Governance | 5 | Steps with who and when; optional note kept; audit line per call, refusals included |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 5 | Crumb, h1, active menu item, back link |
| D9 Flow | 4 | One filled next move per status; Held offers "Start work" (Minor 3) |
| D10 Language | 3 | "Firm id", "This is not in the expected format." (Major 1); "Put on hold" next to Legal holds (Minor 3) |
| D11 Feedback | 4 | Done lines, busy buttons, field errors; stale status after a 409 (Minor 1) |
| D12 Visual | 4 | Board §5 layout; long names wrap; no tooltip on status (Minor 4) |
| D13 Accessibility | 3 | axe 0 at all widths, keyboard reaches every move; focus drops to `<body>` (Major 2); 36 px moves at 375 (Minor 5) |
| D14 Team look | 5 | Same frame as Firms and Breaches |
| D15 Speed | 5 | List 187 ms; log → page 407 ms |
| D16 Testability | 4 | Pass and fail lines for W1, W2, W5, W6; no line for focus after a move or a 409 on a move |
| D17 First-use | simulated only | No intended user walked it |
| D18 Provenance | 5 | "Unconfirmed: no counsel", Sample, staff names, the person caveat |
| D19 Capability closure | 4 | Row W1, W2, W5, W6 for requests; W3 comes with B2 |
| D20 Pain solved | simulated only | |

**BIC-01-BIC-20:** N/A (concept §4c: the console, not a case screen). **Journey score (reviewer, skill journey-test): 7.5/10, below the pass mark of 8** (`journey-test-reviewer-b1-2026-11-26.md`).

## Issues
### Major (Must)
1. **"Log a request" asks the Platform Owner to type a firm's UUID** (`requests-page.tsx:47`, label "Firm id"; hint `requests.ts:89`).
   * This breaks STANDARDS §3.2 [M] "Pick, don't type: where a master exists the UI selects it" and EXPERIENCE §2.8 [M]. It also misses concept §4b "firms picked from the list" and challenge m7.
   * A1's Record dialog already has the firm search (`GET /api/system/firms?q=`, 300 ms, 2+ characters).
   * Typing "Sample immigration firm" gives "This is not in the expected format." under both Firm id and the empty Person record id (walk `04-firm-by-name-1440.png`). That message says neither what is wrong nor how to fix it (EXPERIENCE §2.10 [M]).
   * The API checks only that the value looks like a uuid, so a mistyped firm id is stored and shown as "Firm 3f2a…c91e".
   * Fix: reuse A1's firm picker for the firm. Keep "Person record id" as a pasted id with §4's caveat. Map the person field's refusal to plain words ("Paste the person record id (a 36-character id) from the firm's record").
2. **After a move, keyboard focus drops to `<body>`** (`request-page.tsx:97`). WCAG 2.4.3 (level A), the same defect A1's break report rated Major.
   * `returnFocus` picks the first move button while the dialog closes. The refetch then replaces that button (a new `key`), so focus is lost.
   * Seen on the main path: Pending → "Start work" (the button becomes "Mark completed") and In progress → "Mark completed" (no buttons are left). The keyboard user restarts from the top of the page, 10 Tabs.
   * Fix: after `moved`, focus the "Moved to …" status line or the h1, as on arrival (`:52`). Add a check line for focus after Start work and after Mark completed.

### Minor (Should)
1. **A stale move leaves the page stale** (`request-page.tsx:31`, `:97`).
   * Tab C showed In progress while the request was Held. "Put on hold" gave "already in that status" in the dialog. After Cancel the page still said In progress and offered "Mark completed" and "Put on hold" (walk `08-stale-move-1440.png`).
   * Concept §4: "conflict (409 words + reload)"; EXPERIENCE §4. A2 had the same Minor for Decide.
   * Fix: on a 409, or on close, invalidate `["sys","request",id]`.
2. **Put on hold dialog repeats "Optional: kept with the step."** It is both the dialog's description and the Note field's hint (`request-page.tsx:35`, `:39`).
3. **Move words** (`requests.ts:27`).
   * "Put on hold" sits one link away from "Legal holds", and challenge m6 asked for the line "This marks the request only. It places no legal hold." The board says "Mark held".
   * From Held, the next move reads "Start work" (m6: "Resume work").
   * Fix: use the board's word, add m6's line to the hold dialog's description, and label the move from Held "Resume work".
4. **No tooltip on status** in the list or the header (`requests-page.tsx:64`, `request-page.tsx:67`). EXPERIENCE §2.10 [M]; A2's Minor 6 was the same. Fix: add `title` with a one-line meaning, including that Overdue is set by the daily check.
5. **At 375 px the request page's moves are 36 px tall** (`request-page.tsx:70`). UXL-09 (P-795) asks for 44 px; the list's "Log a request" already has `max-sm:min-h-11`. Fix: give the moves the same class.
6. **The full person record id can only be read on hover** (`request-page.tsx:81`, `title` only). B2's hold dialog takes this id (§4), so the Platform Owner has no way to copy it. Fix: show it chunked and in full in a copyable `<code>`, or add a Copy button.
7. **The PR fails `module-cards`.** It touches web-shell's files without a card change or a `Card unchanged: <reason>` line (STANDARDS §7 [M], P-615 (3)). Fix: add the line to the PR body.

## What I could not check
A real screen reader; Safari and Firefox; j_85 W1-W3 (its console sign-in waits for qa's alignment, §8 M3); the true empty state on a fresh register (my copy already held the check's rows); an intended user's unaided walk (D17 and D20 stay with the founder).

Reviewer: Block 0a4e2c0ec674d6bfbed8f4284e3c26439b400be2

**Verdict: Block** on `0a4e2c0ec`. To fix: Major 1 (`requests-page.tsx:47`, `requests.ts:89`) and Major 2 (`request-page.tsx:97`, plus a check line). Fix Minors 1-7 in this PR or record them on the row.

## Round 2 (head `732dfc8364db113e56393c8eb49c97ca1c122b4d`; diff `0a4e2c0ec..732dfc836` only; the current verdict)
**Ran (copy `pf21rsr` on :4438, never :4400; stopped after):**
* `check_pf21rs_browser.ts`: **56/56**, twice. I restored the screenshots it rewrites.
* My own Playwright probes of the changed parts at 1440, plus 1024 and 375 with the firm picker open: axe 0 serious and no sideways scroll at both widths. I read the DB after each step.

**Re-checked:**
* **Major 1: fixed** (`one-firm.tsx`, `requests-page.tsx:55-56`, `:31-36`).
  * The firm is picked by name, by keyboard: type, Tab to "Choose Sample immigration firm", Enter. Focus then goes to "Change".
  * No "Firm id" field is left. The DB stores the picked firm's id and the person id as pasted. The page shows the firm by name.
  * A person id without a firm gives "Pick the firm this person record is in.", and "abc" gives "…36 characters, like 3f2a0c1e-…-c91e.". Focus moves to the first refused field and nothing is sent.
* **Major 2: fixed** (`request-page.tsx:79`, `:108`). After Mark held, focus is on "Moved to Held."; after a stale move it is on the stale line. Never `<body>`. The check has a line for it (W6, review M2).
* **Minor 1: fixed.**
  * Repro: a colleague completed the request while my "Resume work" dialog was open.
  * Result: nothing was sent and the dialog closed. The page reloaded to Completed and says "…changed by someone else…nothing was saved". The DB keeps the colleague's completion.
  * A 409 with MOVE_REFUSED or SAME_STATUS reloads the same way (`:38`).
* **Minor 2: fixed.** The hold dialog shows the hint once.
* **Minor 3: fixed.** The move reads "Mark held", with "This marks the request only. It places no legal hold.". From Held it reads "Resume work".
* **Minor 4: fixed.** Status has a `title` in the list and the header ("Marked held: paused. This places no legal hold.").
* **Minor 5: fixed.** The moves have `max-sm:min-h-11`.
* **Minor 6: fixed.** The full id shows in a selectable `<code>`.
* **Minor 7: still open.** "Card unchanged" is in a PR comment, not the body (body checked through the API at 732dfc836). The CI `module-cards` check reads the body; the builder says it will add the line there.
* **Breach page:** Decide now opens on the fresh read (`breach-page.tsx:140`), and the check's new A2 line covers it.

**New (Minor, Should):**
* **n1. The stale refusal is shown in success green** (`request-page.tsx:79`: `text-text-ok` for every done line). Fix: a neutral or warning tone when the line is the stale words.
* **n2. Escape or Cancel on a move dialog returns focus to the "Logged…" line, not the button that opened it**, whenever a done line is showing (`request-page.tsx:108`). Focus is not lost, so this is not a WCAG failure. Fix: return to the done line only after a move or a stale reload.
* The breaker's round-2 Minors (`break-report-b1.md`) also stand, and I do not count them twice:
  * r2-m1: one round trip remains between the re-read and the POST. This is the runtime row for an API version (#3538).
  * r2-m2: the check compares only the status (`:33`), so a move away and back passes. Comparing `steps.length` too would catch it.

Reviewer: Approve 732dfc8364db113e56393c8eb49c97ca1c122b4d

**Verdict: Approve** on `732dfc836`: no open Blocker or Major. Minor 7 (put the "Card unchanged" line in the PR body, or CI `module-cards` stays red), n1, n2 and the breaker's r2-m1 and r2-m2 are Minors: fix them here or record them on the row. Journey score after round 2: **9/10**. Plain words, error recovery and accessibility each rise to 1, and feedback and state stays at ½ because of n1. That passes the mark of 8, and no criterion is at 0.
