# PF-21rs A1 (R1.86): Breaches list, "Record a breach", the console menu's Privacy group: independent review, 24 Nov

**Commit reviewed:** `fdb60f0106b7ca3b3593d2d556d5195d3517692b` (branch `claude/gracious-cray-5oqalp`), diff `origin/claude/runtime-pf17-screens..fdb60f010` only (14 files, +561 −6; web 318 lines, check 226).
**Line numbers** are at `fdb60f010`; uncommitted edits another session made later in this checkout are not reviewed.
**Read:** concept r2 (§3, §4 Breaches, §5, §7 Q1), challenge (M5 A1 line, m2, m3, m5, m7, m10), board r1 §1-§2, `a1/build-notes.md`, the BACKLOG row (W5, W6), PF-21c `api/src/platform/register/breaches/` and the guard. A2's parts (the breach's page, decide, notices, Edit, Confirm a draft) and B's are not findings here.

**Verdict: Ship** (no Blocker, no Major). There are 7 Minors, all "Should".

## What I ran (isolated copy `rsrev` on :4437, never :4400; AI_LIVE=off; US$0)
* `check_pf21rs_browser.ts 4437 xr_studio_rsrev`: **22/22** on a fresh copy, and **22/22** again on the same copy with my breaches added. `j_86.ts rsrev 4437`: **25/28**, as the builder (W1, W9 pass; W6 is A2's page; W10 waits on AUD-3).
* `tsc -p web --noEmit` exit 0. `scan-logs.ts` on `rsrev-api.log`: 184 lines, 0 findings. `graph.mjs`: G1 0, G2 0; its G3 lists only A2's routes (breach `GET :id`, `PATCH`, `:id/notices`, `from-alert`).
* My own Playwright walk (Chromium /opt/pw-browsers/chromium) at 1440, 1024, 1024 at 200 % (512 CSS px, DPR 2) and 400, the browser in IST; as the Platform Owner, Support, and an Auditor added by SQL; keyboard only; probes for offline, a lost answer, an edit after a lost answer, a double click. Screenshots in the session scratchpad.
* The check and j_86 rewrite committed screenshots (`a1-*.png`, `J-86/screenshots/`); I restored them with `git checkout`.

## Concept fit (held, with evidence)
* **Menu (§4, m10):** a labelled "Privacy" group holding Breaches, link and heading shown only with `system/breach:read`; the phone row reads "Firms Breaches" at 400 px; Support sees no Breaches link.
* **List (§4, board §1):** columns Discovered · What happened · Firms · Decision · Notices · Status; the API's order; firms named by R0; no firms = "Under investigation"; UTC times with `<time datetime>`; each row equals the API (A1-1); the exact §5 empty line; "Showing the newest 500." matches `LIST_MAX` (`service.ts:96`).
* **Status (m5):** `contract.ts:45-52` covers Firms to be named and a firm no longer named; word plus shape; pass and fail lines in P.
* **Roles (BR-8, W5 a-c):** the Auditor sees rows, "Read only: you hold system/breach:read." and no button; Support sees the API's 403 words, no table; a firm Owner's token gets 403 on all 5 routes and their browser sees the card.
* **Record a breach (BR-1, BR-7, m2, m3):** only the time and "What happened" are needed; the reason is never pre-filled, and a missing, "..." or blank one gets the guard's `fields.reason` under the field; a future time, 4001 characters and an empty time each get their refusal under their field; focus moves to the first refused field. German and Chinese text stored as typed; 09:30 IST stored and shown as 04:00 UTC under "Times in UTC". A double click, an offline retry and a same-body retry after a lost answer each record once (one audit line with the reason). `systemApi` drops any caller `authorization` (`session.ts:74`).
* **Firm picker (m7):** waits for 2 letters and 300 ms (3 searches wrote 3 `GET /api/system/firms` lines); "No firm matches."; focus returns to the box after Add or Remove.

## Standards [M] (both files): met except as listed
* **Met:** team tokens and components; path "ExpatReady console › Breaches" and tab title; edit in a dialog; loading, empty, error with Retry, read-only, 403, busy and "Recorded. Next: …" states; status by shape and text; one primary action; axe WCAG 2.2 A/AA 0 in every state and width; no sideways page scroll at 1024, 200 % or 400; one request per view (names joined on the server); server authorisation, deny by default; idempotent create; Problem Details on fields; zod contract; comments say why; MODULE row; 610 ms to the list, 152 ms to record.
* **Not met, Minor:** EXPERIENCE §1 #14 long text (issue 4), §1 #10 status tooltips (issue 7), §1 #12 / WCAG 2.4.3 focus on close (issue 2), STANDARDS §6 rule test for m7 (issue 6).

## D1-D20 (1-5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | BR-1, -4, -7 and -8, m2, m3, m5, m7 shown as concept §3-§5; A2's parts are correctly absent |
| D2 Data integrity | 5 | Stored as typed, once (DB read); audit line with the reason; nothing else changed |
| D3 Reuse | 5 | #3489's frame, `FirmsPage` contract, shared controls; one form ready for A2's Edit and Confirm |
| D4 Rule integrity | 4 | Every rule is the API's; m7 has no test (issue 6) |
| D5 Stability, recovery | 4 | Offline and lost-answer retries record once; an edit after a lost answer gets stuck (issue 1) |
| D6 Governance | 5 | Reason never pre-filled; "kept 7 years; never deleted"; no delete anywhere |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 4 | Menu group, crumb, title, lead line |
| D9 Flow | 4 | Record → list with "Recorded. Next: decide whether firms are told." (the page is A2's) |
| D10 Language | 4 | Concept copy throughout; one API line in jargon (issue 1) |
| D11 Feedback | 4 | Busy, banner, field errors, 403 words |
| D12 Visual | 4 | Team look; long descriptions take over rows (issue 4) |
| D13 Accessibility | 3 | axe 0 and a keyboard path, but focus is lost on close (issue 2) and Status is off-screen at 1024 (issue 5) |
| D14 Team look | 5 | Same frame as Firms |
| D15 Speed | 5 | 610 ms list, 152 ms record |
| D16 Testability | 4 | 22 lines with pass and fail; data attributes |
| D17 First-use | simulated only | No intended user walked it |
| D18 Provenance | 4 | Sample marked; UTC named; "Nothing is sent to anyone." |
| D19 Capability closure | 3 | R1.86's A1 only: j_86 25/28 |
| D20 Pain solved | simulated only | |

**BIC-01-BIC-20:** N/A for every check. Concept §4c says this is the console, not a case screen, which is outside EXPERIENCE §6's scope. BIC-19 and BIC-20's content is covered above under the standards.

## Issues (every one Minor, Should; none blocks)
1. **An edit after a lost answer leaves the dialog stuck, showing the API's jargon** (`record-breach.tsx:132`, `:145`).
   * Probe: the first POST reached the server, and the browser saw a network error. The person changed "What happened" and pressed "Record the breach" again.
   * Result: "This Idempotency-Key was used for another request; nothing was recorded. Use a new key for a new breach." (422 `IDEMPOTENCY_KEY_REUSED`, `service.ts:107`). Every later try gives the same refusal.
   * Meanwhile the first breach is stored, but the list behind the dialog has not reloaded. A person who closes and re-records makes a permanent duplicate in a register that is never deleted (BR-4).
   * Fix: on this code, reload the list and say in plain words that an earlier try may already have recorded the breach, and to check the list (concept §4: "conflict: words + reload").
2. **Focus falls to `<body>` whenever the dialog closes**: by Escape, by Cancel (`record-breach.tsx:152`) and after recording (`breaches-page.tsx:40`).
   * The shared Dialog has no Radix Trigger to return to (`controls.tsx:82-85`), so a keyboard user starts again at the top of the page (WCAG 2.4.3).
   * Fix: focus "Record a breach" after Cancel or Escape, and the new row or the status line after recording.
3. **A fresh, untouched form asks "Discard your unsaved changes?" on Escape** after an earlier opening was recorded or cancelled.
   * Cause: the Dialog's `touched` ref (`controls.tsx:79-80`) is reset only by its own close path. The page closes it directly instead (`record-breach.tsx:152`, `breaches-page.tsx:40`).
   * Fix: give the Dialog a new `key` per opening, or close through the guarded path.
4. **"What happened" is shown in full in the list** (`breaches-page.tsx:21`).
   * A 300-character description took 11 lines at 1024. The field allows 4000 characters, and drafts from alerts are long.
   * The board §1 clips with "…", and EXPERIENCE §1 #14 asks for one line with the full text on hover.
   * Fix: clamp to 1-2 lines with the full text in `title` (the breach's page in A2 shows all of it).
5. **At 1024 px with the menu open, the Status column sits outside the table's box** (columns' minimum widths, `breaches-page.tsx:20-25`; walk screenshot `05-list-1024`).
   * Scrolling inside the box is allowed (§4), but the calculated status is the column that says what is owed.
   * Fix: narrow "What happened" (`min-w-64`), or move Status ahead of it.
6. **m7 has no test.** No line of `check_pf21rs_browser.ts` counts firm searches or types 1 letter, so removing the 300 ms wait or the 2-letter minimum (`record-breach.tsx:99-100`, `:103`) leaves 22/22 green.
   * Fix: one pass line (typing "Sample" quickly makes 1 `GET /firms` line) and one fail line (1 letter makes none, and the hint is shown).
7. **The status cell has no tooltip** (`breaches-page.tsx:25`; EXPERIENCE §1 #10 [M]).
   * Fix: a `title` with the status's meaning and its next step, for example "Recorded; whether firms are told is not decided yet." The words are in `STATUS_WORDS`.

## What I could not check
A real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); two simultaneous same-key POSTs at the database (PF-21c's, on main); a Draft row in the browser (drafts come only from `from-alert`, no screen; `statusOf` covers it in P); the 500-row truncation in the browser (code only).

Reviewer: Approve fdb60f0106b7ca3b3593d2d556d5195d3517692b

**Verdict: Approve** (commit `fdb60f0106b7ca3b3593d2d556d5195d3517692b`). Nothing to fix before merge. Issues 1-7 above are Minors to fix in A2 or record on the row.
