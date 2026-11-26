# PF-21rs B1 journey test (reviewer, 26 Nov): Data requests to us

Commit `0a4e2c0ec674d6bfbed8f4284e3c26439b400be2`. Isolated copy `pf21rsr` on :4438 (never :4400), AI_LIVE=off, US$0. Chromium (Playwright) at 1440 px, plus 1024, 720 (1440 at 200 %) and 375. Persona: the Sample Platform Owner (ops.sample@expatready.example.com), signed in on the console card. The Auditor is used for the wrong-role journey. Review: `review-b1.md`.

## Journeys (written from concept §4, §6 before walking)
1. **Main.** The Platform Owner logs a request that arrived today, starts work and completes it. Expected: Pending with target +30 days → In progress → Completed, each step listed with who and when.
2. **Alternate (with a firm).** A request about one person in one firm: the firm is picked, the person id pasted, and the page shows the firm by name with the "not checked" caveat.
3. **Hold and resume.** Put on hold → Held offers only the API's moves → resume → complete.
4. **Error.** No name, a bad email, a future day, completing without "What was done", the firm typed by name, an over-long note, a bidi override.
5. **Overdue.** A request received 40 days ago shows Overdue and "10 days late", with one alert step and no Overdue button (from the builder's check, re-run twice).
6. **Wrong role.** The Auditor opens the list and one request by its address: the API's 403 words and no data. A firm token gets 403 on all four routes.
7. **Recovery.** A double click on "Log the request" and on a move; a stale second tab moving the same request; a reload.
8. **Across the boundary.** The request's person id is wanted by B2's hold dialog (§4: "the hold dialog's Advanced takes the id").

## What held
* J1: logged in 407 ms, landing on the request's page with "Logged…" and focus on the h1. Target = received + 30 days, on screen and in the DB. In progress → Completed, steps in order with "Platform Owner (Sample)". DB status and actions taken are exactly as typed; there is one event per move, and audit lines are written.
* J3: Held offers Start work and Mark completed (the migration's MOVES). Overdue is never offered, and the page says why.
* J4: every API refusal lands under its own field, in the API's words, with focus on the first refused field: name, email, "The day received cannot be in the future.", "Say what was done…", "This is too long: at most 2000 characters.", "Write it as ordinary text.". Nothing is stored on a refusal.
* J5, J6: as expected (the check's lines are green twice; I opened the Auditor's view by its address myself). A missing id gives "No such request." with a link back.
* J7: a double click on Log stores 1 row, and a double click on a move adds 1 step. A reload keeps everything.
* Widths: axe-core 0 serious at 1440, 1024, 720 and 375 on both pages; no sideways page scroll; the table scrolls inside its box; a 120-character Polish and Chinese name wraps.

## Findings
| # | Severity | What | Where |
|---|---|---|---|
| 1 | Major | J2: the firm must be typed as a UUID ("Firm id"). A firm name gives "This is not in the expected format." under both fields; a mistyped id is stored. Breaks STANDARDS §3.2 "Pick, don't type" | `requests-page.tsx:47`, walk `04-firm-by-name-1440.png` |
| 2 | Major | J1, J3: after Start work or Mark completed, keyboard focus falls to `<body>` (WCAG 2.4.3) | `request-page.tsx:97` |
| 3 | Minor | J7: a stale tab's move shows the 409 words but the page is not reloaded; it still shows the old status and moves | `request-page.tsx:31` |
| 4 | Minor | J3: "Put on hold" next to "Legal holds" with no "places no legal hold" line (m6); Held → "Start work"; the hint appears twice in the hold dialog | `requests.ts:27`, `request-page.tsx:35,39` |
| 5 | Minor | J8: the full person id can only be seen on hover, so it cannot be copied for B2's hold | `request-page.tsx:81` |
| 6 | Minor | The moves are 36 px tall at 375 (UXL-09 wants 44); status has no tooltip | `request-page.tsx:70`, `:67` |

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J3 end Completed; DB = screen |
| Next step obvious | 1 | One filled move per status; "Overdue is set by the daily check" |
| Plain words | ½ | "Firm id", "This is not in the expected format.", "Put on hold" (findings 1, 4) |
| Feedback and state | ½ | Done lines, busy buttons, field errors; stale status after a 409 (finding 3) |
| Correct data | 1 | Values exact, one row per double click, steps and audit lines present |
| Error recovery | ½ | Field errors are good; the firm error gives no fix; a conflict does not reload (findings 1, 3) |
| Accessibility and screen sizes | ½ | axe 0 at four widths; focus lost after a move (finding 2) |
| Speed | 1 | List 187 ms, log → page 407 ms |
| Visual quality | 1 | Board §5 layout, team frame, long names wrap |
| Trust and sources | 1 | "Unconfirmed: no counsel", Sample, staff names, person caveat |
| **Total** | **7.5 / 10** | **Below the pass mark of 8; no criterion at 0** |

**Fixes that would raise the score, most valuable first:**
1. Reuse A1's firm picker in "Log a request" and put plain words on the person id's refusal (plain words, error recovery).
2. Focus the "Moved to …" line or the h1 after each move (accessibility).
3. Reload the request after a 409 on a move (feedback, error recovery).

## Not tested
A real screen reader; Safari and Firefox; j_85 (its console sign-in waits for qa, §8 M3); the empty register on a fresh copy; an intended user's unaided walk (D17 and D20 stay with the founder).

**Verdict: fail (7.5/10)**: 2 Majors open. Review verdict: Block on `0a4e2c0ec`.
