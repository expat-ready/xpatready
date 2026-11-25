# PF-21rs A1: journey test (reviewer), 24 Nov

**Commit:** `fdb60f0106b7ca3b3593d2d556d5195d3517692b`.
**Setup:**
* Isolated copy `rsrev` on :4437, started fresh, with AI_LIVE=off, PLATFORM_IDENTITY=local and PLATFORM_SYSTEM_IDENTITY=local. US$0.
* Playwright Chromium (headless; no visible pane in this cloud session) at 1440, 1024, 1024 at 200 % and 400 px. The browser zone was IST for the time journeys.
* The scripts and screenshots are in the session scratchpad.

**Score: 8.5 / 10. Pass** (8 or more, and no criterion at 0).

## Journeys (from concept §4-§5, j_86 W1/W9, row W5/W6)
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Platform Owner: "log the bucket exposure the moment we know" | Sign in on the card → Privacy › Breaches → Record a breach → time, text, firm by search, 1 category, reason → Record the breach | Row first with "Decision owed"; status line gives the next step; stored once as typed | Held. 152 ms. DB: RECORDED, 04:00 UTC from 09:30 IST, firm A, `identity_documents`, our staff member; 1 audit line with the reason |
| J2 alternate | PO, little known | Only "What happened" and a reason | "Under investigation", "Not decided", "—" | Held |
| J3 empty | PO, first visit on a fresh copy | Open Breaches | Concept §5 empty line | Held, exact words; axe 0 |
| J4 error | PO makes mistakes | Empty time; 2030 time; 4001 characters; reason "   " and "..." | Each refusal under its own field; nothing stored; focus on the first refused field | Held. 0 rows after the refusals; 2 `REASON_REQUIRED` guard lines |
| J5 wrong role | Support by URL; Auditor; firm Owner | Open `/system/privacy/breaches` | Support: the API's 403 words, no table, no link. Auditor: rows, the read-only line, no button. Firm: the card | Held (my walk plus the check's W5) |
| J6 recovery | PO, network trouble | Double click; offline then retry; lost answer then retry; lost answer then edit and retry; reload | Records once each time; never stuck | **Partly.** The first 3 recorded once each. An edit after a lost answer gets stuck on "This Idempotency-Key was used for another request…" (review issue 1). Reload drops the status line and keeps the row |
| J7 keyboard | PO, no mouse | Tab to Record a breach → Enter → fields → Add firm (Enter) → Space on a category → Enter | Stored; focus never lost | **Partly.** Stored (the check's W6). Focus falls to `<body>` after Cancel, Escape and recording (issue 2) |
| J8 sizes | PO at 1024, at 200 %, and at 400 | List and dialog | No sideways page scroll; axe 0 | Held. At 1024 the Status column needs a scroll inside the table (issue 5) |
| J9 boundary | PO after recording | Read the list | Next step named; the breach's page is A2's | "Recorded. Next: decide whether firms are told."; rows are not links yet (A2, by design) |

## Break-it pass (15 min)
* **Hostile or long text:**
  * German, Chinese and a 300-character text without spaces are all stored exactly as typed.
  * React escapes the text.
  * Long words wrap inside the cell. A long description makes the row very tall (issue 4).
* **Two openings:** two openings make two breaches. Each opening has its own key, which is correct.
* **Wrong role by URL:** covered above.
* **A fresh opening:** it starts blank with a new key. Escape on it can still ask "Discard your unsaved changes?" (issue 3).
* **Firm search:** 1 letter shows the hint and no request is made. "zzzz" shows "No firm matches.". My walk wrote 3 `GET /firms` lines in all.
* **Blockers / Majors found:** none.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1/J2 stored as typed (DB) |
| Next step obvious | 1 | The status line and "Decision owed" name it; one primary button |
| Plain words | 1 | Concept §5 copy; "Times in UTC" and "Your local time; stored in UTC" (the one jargon line is counted under error recovery) |
| Feedback and state | 1 | Loading, empty, busy, status line, field errors, read-only, 403 |
| Correct data | 1 | List equals the API (A1-1); DB values exact; 1 audit line |
| Error recovery | ½ | Gets stuck after an edit following a lost answer (issue 1) |
| Accessibility and sizes | ½ | axe 0 everywhere, no sideways scroll, keyboard path; focus is lost on close, and Status is off-screen at 1024 |
| Speed | 1 | Sign-in → list 610 ms; record 152 ms; firm matches about 0.5 s after the 300 ms wait (sample data) |
| Visual quality | ½ | Team look; full descriptions take over the table (issue 4) |
| Trust and sources | 1 | Sample marked; reason on the audit line; "Nothing is sent to anyone."; no AI |

**Raising the ½s, most valuable first:**
1. The key-reuse state: reload, then say in plain words that an earlier try may already have recorded the breach.
2. Return the focus when the dialog closes.
3. Clamp the description, and keep Status in view at 1024.

**Not tested:**
* A real screen reader.
* A visible headed browser.
* An intended user's unaided walk (D17/D20 stay with the founder).
* A Draft row in the browser (drafts have no screen).
