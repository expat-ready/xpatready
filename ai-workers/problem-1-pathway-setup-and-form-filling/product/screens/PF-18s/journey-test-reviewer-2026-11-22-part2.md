# PF-18s part 2 — journey test (reviewer, 22 Nov 2026)

Commit 2ed09e077c74d205611195331d49c81bdb50b700 (PR #2906). Isolated copy `review_pf18s2` :4731, fresh database, `AI_LIVE=off PLATFORM_IDENTITY=local`, US$0. Walked in headless Chromium through Playwright scripts that only click, type and read what is shown. API and database were read underneath. Screenshots are in the session scratchpad and not committed; the builder's `screenshots/pf18s-help-*` cover the same states. Review: `review.md`.

## Journeys (persona · goal · result)
1. **Main path:** a Case Officer on Licence: "I'm stuck here, ask for help." "?" → panel notes `/account/licence` (query and fragment dropped) → type two lines → Send → "Ticket sent … Open your ticket" → ticket headed by the first line. **Held.** One ticket in the database, `page = /account/licence`.
2. **Double send:** same person, impatient. With the first POST held: a second click, two form submits, then Enter twice on the reply's Send plus a submit. **Held:** 1 POST and 1 row each time. With the guards stripped from the served bundle: 3 and 2 (the test can fail).
3. **Error:** the server answers 500 once. "Not sent. Your message is still here; try again.", text kept, Send enabled; the retry makes one ticket. **Held.**
4. **Empty and bad input:** Send an empty box, then 4 files, then an `.exe`-like file named `.pdf`. **Held for data** (refused, nothing written, errors on the field plus a summary). **Words weak:** "write what you need help with, without control characters", "at most 3 attachments" (review m-2).
5. **Follow the answer:** support replies (SQL scaffolding for PF-17) → "Waiting on firm" in orange → reply by keyboard only (13 Tabs from the list to the first ticket, Enter, 13 Tabs to the box, type with a newline, Tab, Enter) → focus on the new message, newline kept, status "Waiting on support". **Held.**
6. **Owner (alternate):** sees the firm's tickets with "Raised by"; opens the Case Officer's ticket ("Raised from /account/licence by Case officer (Sample)"); the Owner's reply shows the Owner's name to the Case Officer. **Held.**
7. **Attachments:** raise with a PDF and a text file → open the ticket → "Attachment 1". **Failed:** the tab leaves the app for a raw 401 JSON page, "Sign in again … (a bearer token)" (review M-1).
8. **Wrong person and conflict:** the Case Officer opens the Owner's ticket by address → "Ticket not found". **Held.** A ticket closed while the Case Officer types a reply → Send → page shows Closed; **the reply text and the "Not sent" words vanish** (review m-1).
9. **Across the boundary:** with terms pending, the terms page replaces the page and there is no "?" (m6). **Held.** After accepting, the "?" is back.
10. **Empty, long and zoom:** a solo firm's Owner sees "No one in the firm has raised a ticket yet." A French and Japanese first line of 120+ characters becomes an 80-character subject with "…"; a 4,923-character body is accepted. At 1024 px and 200 % (720 CSS px) there is no sideways scroll and the "?" stays visible. **At 720 px, "Last change" heads an empty column** (review m-3).

## Automated replay
The builder's `check_pf18s_help_browser.ts` (DW1–DW6) ran on my copy: **25/25 twice** (the second time on a used database), exit 0, 17 s. It covers axe WCAG 2.2 A/AA on the panel, list and ticket at 375, 1024 and 1440 px, the keyboard path to "?", and no page errors. My scripts add the stripped-guard red run, files, 409, terms, zoom and a keyboard reply.

## Data underneath
One ticket per send; `page` is the path only; the failed send wrote nothing; replies are counted exactly; names come from the ticket's own firm; another person's ticket gives 404; a Closed ticket refuses a message (409). Live AI was never called.

## Break-it (15 min)
Duplicates: safe in the browser; two direct API POSTs make two tickets (no server key, m10, recorded). Non-English and long text: fine. Hostile file: refused ("the file is not a PDF as its type says"). Wrong person by URL: 404 in words. Reload mid-send: not tried. Two tabs on one ticket with a close in between: m-1. **Severity:** M-1 Major; m-1 to m-4 Minor.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Raise, follow and reply work; opening an attachment fails (J7) |
| Next step obvious | 1 | "Open your ticket", Waiting on firm in orange, the empty states teach the "?" |
| Plain words | ½ | Subjects, not ids; server fragments in lower case (J4); raw JSON (J7) |
| Feedback and state | ½ | Busy, sent, not sent, closed; silent loss on 409 (J8) |
| Correct data | 1 | One row per send, path only, firm-scoped names (J1–J3, J6) |
| Error recovery | ½ | 500 recovers with text kept; 409 loses the text; the 401 page has no way back but the browser's Back |
| Accessibility and screen sizes | 1 | axe clean on every state; keyboard-only reply; 200 % with no sideways scroll; tips hover-only (minor) |
| Speed | 1 | List first view 338 ms; a send under 1 s locally |
| Visual quality | ½ | Team look; empty "Last change" column at 640–767 px; squeezed status dot |
| Trust and sources | 1 | The exact page noted is shown before sending; every message names its author; Sample labelled |
| **Total** | **7.5 / 10** | **Below the pass (8); no criterion at 0** |

## Fixes that raise the score, most valuable first
1. Open attachments with the bearer as a download (M-1): task +½, recovery +½.
2. Keep the reply and the server's words on a 409 Closed (m-1): feedback +½.
3. Plain field errors, or a disabled Send on an empty box (m-2): words +½.
4. Build `headClass` from the column list and add `shrink-0` to the dot (m-3): visual +½.

## Not tested
A real screen reader, files over 10 MB, browsers other than Chromium, reload while a send is held, and an intended user's unaided walk (D17/D20 stay with the founder).

---
## Round 2 (commit 5ee13db4ec1c158a23db7962793c4ffcdf3976ee, 22 Nov 2026)
This round used isolated copy `review2_pf18s2` :4732 with a fresh database, `AI_LIVE=off PLATFORM_IDENTITY=local`, at US$0. The copy is stopped and the builder's shots are restored. I re-walked only the journeys the fixes touch, in headless Chromium, by clicking, typing and reading:
* **J7 (attachments): held.** Raised from the "?" with a PDF and a PNG, then opened the ticket. "Attachment 1" saved `support-1.pdf` (bytes `%PDF-`) and "Attachment 2" saved `support-2.png`; the page stayed on the ticket both times. An expired link (the file route's own 410 words) shows "File not opened · This download link has expired. Open the ticket again."
* **J8 (closed while typing): held.** Typed a reply, then closed the ticket by SQL (scaffolding for PF-17) and pressed Send. The result: "Not sent · A closed ticket takes no new message: raise a new ticket instead.", the text kept read-only, no Send, the hint "copy your text into a new ticket", focus on the box, axe clean. A fresh visit to the Closed ticket shows the Closed notice only (1024 px, axe clean).
* **J4 (bad input): words better.** Send is off on an empty or spaces-only box. The errors are now sentences: "At most 3 attachments." and "File 2: The file is not a PDF as its type says.". They still do not say how to fix the problem.
* **J10 (zoom): held.** At 720 px the list's heads match its cells ("Last change" hidden with its column). There is no sideways scroll.
* **Status words:** the ticket page shows the meaning beside the status ("Closed · No more messages on this ticket."). The list and the "?" keep hover-only tips.
* **Automated:** `check_pf18s_help_browser.ts` ran **30/30 twice**, exit 0, 15 s. It now covers the download (PNG bytes plus a 401 without the bearer), closed-while-typing, the footer Close prompt and a CRLF body. No page errors appeared in either run.

| Criterion | R1 | R2 | Evidence (round 2) |
|---|---|---|---|
| Task completed | ½ | 1 | Raise, follow, reply and open attachments (J7) |
| Next step obvious | 1 | 1 | Unchanged; the closed hint says what to do with the kept text |
| Plain words | ½ | ½ | Sentences now, but the file refusals say what is wrong, not how to fix it |
| Feedback and state | ½ | 1 | Closed while typing says "Not sent" and why (J8); "File not opened" with the reason |
| Correct data | 1 | 1 | One row per send; CRLF stored as one character (DW1) |
| Error recovery | ½ | 1 | 409 keeps the text to copy; 410 says to open the ticket again; no raw JSON page |
| Accessibility and screen sizes | 1 | 1 | axe clean, including the new closed-with-text state; 720 px columns fixed; list and "?" tips still hover-only (minor) |
| Speed | 1 | 1 | Check 15 s for 30 lines; download under 1 s locally |
| Visual quality | ½ | 1 | Column mismatch and the squeezed dot are gone |
| Trust and sources | 1 | 1 | Unchanged |
| **Total** | **7.5** | **9.5 / 10** | **Pass (8 or more, no 0)** |

**Raise the last half point:** file refusal words that say how to fix the problem ("Attach a real PDF, PNG or JPEG", "Remove a file: at most 3"). After that, the team's tooltip on the list status and the "?".
**Not tested (round 2):** a real screen reader, files over 10 MB, other browsers, and an intended user's unaided walk (D17/D20 stay with the founder).
