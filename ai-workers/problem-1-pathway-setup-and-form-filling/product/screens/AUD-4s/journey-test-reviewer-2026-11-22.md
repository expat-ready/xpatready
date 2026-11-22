# AUD-4s part 2: journey test, reviewer, 22 Nov 2026 (commit 4f779ef1d)

Scope: the built Activity log page (R1.88), against `concept.md` C1–C9. Run on isolated copy rv_aud4s :4444 (twice, fresh each time), AI_LIVE=off, US$0. The builder's check was replayed (44/44 PASS, twice), and my own Playwright walk ran on top of it (headless, scripted like a person: clicks, keys, reading text).

## Journeys
| # | Persona · goal | Steps | Result |
|---|---|---|---|
| J1 main | Owner: "who changed what this week?" | My account › Activity log by keyboard; the last 7 days; shortcut; open the 600-character line; raw before and after; export | Held. The sentence reads the filters back with "(UTC)". "role: Case Officer → Admin" shown. One file, and the export is the new top line (W1) |
| J2 alternate | Admin: "what did the rep who left change?" | Person → "Case officer B (Sample) (left the firm)", or "Show only this person's changes"; export | Held. Five lines, name kept. The CSV holds those five (W1 Admin) |
| J3 empty | Owner picks a quiet range | `?from=-200d&to=-199d` | "No changes from 6 May 2026 to 7 May 2026" plus help text; no Clear button when no filter is set |
| J4 error | Bad input or failure | Range over a year; To before From; forced `person=`/`area=`; read aborted; export 413 | Stopped on the field with the limit named. The server's 422 words are shown. Retry works. The 413 is shown with its numbers |
| J5 wrong role | Case Officer by address | `/platform/activity-log` | No menu entry. "You do not have access to the activity log" plus who to ask. The API answers 403 on both routes |
| J6 recovery | Reload or double press | Reload mid-export; double press of the confirm; Back | One line per export. Page clean after reload. Back leaves the page (filters use `replace`) |
| J7 session | The Owner signs in on another device; firm B signs in in the same tab | Change a filter on the old tab; sign-out, then firm B | "Signed in elsewhere" with no firm A text. DW1b: no firm A text in the DOM while B's read is held |
| J8 boundary | Export, then open the CSV | Read the file | Header `When (UTC),Who,…`; row count = lines matched; values in full; no other firm's lines |
| J9 zoom | Keyboard at 200 % on 1024 px | Tab order; open a line | Logical order (menu → Export → From → To → Person → Area → shortcut → Advanced → When buttons). Focus ring visible. No sideways scroll; axe clean |
| J10 break | Long and non-English text | `entityKey` of 60–140 CJK characters or 120–200 ASCII characters | **Page scrolls sideways** (1024 px: 1053 against 1024 with 60 CJK characters). The chip `<li>` is not width-bound |

## Data underneath
The export line is written once per export, with `detail` = {rangeFrom, rangeTo, rows, firmId}, by the person who pressed it. Two tabs give two lines (two real exports). The page shows lines in the database's order, each once (DW5, 159 = 159). The other firm's line is never shown. The server enforces the roles (403).

## Findings
* Minor: long filter chip overflows the page (`activity-log-page.tsx:198`); see J10.
* Minor: focus drops to `<body>` after removing a chip (`:199`) or pressing Clear filters (`:225`).
* Minor: the shortcut's tooltip is a `title` attribute, so nothing shows on keyboard focus (`:178`).
* Minor: a refused filter from the address shows the server's codes (`"area" is one of team, front-office, …`).
* Outside this diff (AUD-4): the export file name and line summary read one day past the chosen To (exclusive bound) and use ISO times.

## Score (each 0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J8 |
| Next step obvious | 1 | Export is the only action; the shortcut and person action sit where needed |
| Plain words | ½ | Concept copy exact; change chips show raw field names and ISO times (AUD-4's render); refused-filter codes |
| Feedback and state | 1 | Skeleton, dimmed busy, "Showing N lines", "Export saved … now a line in the log" |
| Correct data | 1 | Data underneath, DW5, DW3/DW3b |
| Error recovery | 1 | J4, J6, J7 |
| Accessibility and screen sizes | ½ | axe clean everywhere and keyboard complete, but focus loss (chip, Clear) and J10 overflow |
| Speed | 1 | First view 379 ms; filter 58 ms; API 13–33 ms |
| Visual quality | 1 | `screenshots/aud4s-3-line-open-1440.png`, `aud4s-13-list-open-1024.png` |
| Trust and sources | 1 | No AI. Who, action code and raw detail under Advanced. Keep sentence from AUD-5. Times say "UTC" honestly |

**8.5 / 10, pass (8+ and no 0).** The fixes that would raise the score, most valuable first: bind the chip width (`li` `max-w-full min-w-0`); return focus after chip removal and after Clear; give the shortcut a focusable tooltip.

Not tested: a real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); a visible browser pane (headless only).
