# PF-18b journey test: reviewer, 17 Nov 2026 (API only, head e2e8b06e)

PF-18b has no screen, so the "?" button and Help & support page are PF-18s. I walked the journeys over HTTP against a Nest app built from the row's own feature file, behind PF-4's guard, as xr_app through the PF-12 walls. That is the suite's harness on a scratch database. I did not use a browser, and the screen-only steps (axe, widths, keyboard) are N/A.

## Journeys
1. **Main.** A Case Officer raises "the intake form will not save" from `/cases/abc/intake?tab=2#top` with a PDF and a PNG. Expected: the ticket is OPEN, the page is noted without the query, both files are stored, there is one support email, and the officer sees the ticket. **Held:** 201, page `/cases/abc/intake`, files `[1,2]`, emailed true.
2. **Alternate.** The Admin opens the officer's ticket and adds a message. **Held:** 200, Waiting on support, author is the Admin.
3. **Our reply and the follow-up.** `replyAsSupport` sets Waiting on firm, the officer reads it and answers, and the ticket goes back to Waiting on support. **Held.**
4. **Empty.** Firm B's Owner opens the list. **Held:** 200, 0 items.
5. **Error: bad input.** Tried a blank body (spaces and zero-width), a 5,001-character body, a 301-character page, a page without a leading slash, a full URL, no fields, and a `priority` field. **Held:** each is 422 with the field and plain words, and no ticket is made.
6. **Error: files.** Tried 11 MB, an EXE type, a PDF labelled PNG, SVG, 4 files, 5 files, a 21 MB file, and a field named `file`. **Held:** each is refused, with nothing stored and no ticket. The first four are 422 with the reason. 5 files gives 400 "Too many files", 21 MB gives 413 "File too large", and the field name gives 400 "Unexpected field" (framework words; review m1).
7. **Wrong person.** A second Case Officer and a Case Manager open the officer's ticket by id, try to message it, and use the officer's download link. **Held:** 404 every time, with the same body as a guessed id.
8. **Recovery.** Mail is down when a ticket is raised. **Held:** 201, emailed false, the ticket is readable. A forced audit failure after a stored file leaves no ticket and the file in place (reported, cleanup PF-F2).
9. **Race.** Four messages are sent at once by the raiser and the Owner. **Held:** all 200, 5 messages, final status Waiting on support. A double-submitted raise gives **two tickets** (review m4).
10. **Boundary to PF-17 and PF-18s.** No `/api/system` route. The answers carry `status`, `messages[].authorKind` and `files[]` numbers, which is enough for the screens.

## Data underneath
Each raise gives one ticket row, one message row, one `support.ticket.raised` audit line (field names and ids only), and one `support.ticket_created` outbox row (ids and a count). The database refuses update, delete and truncate of messages, delete of a ticket, a change of page, a key outside the ticket's folder, and a raiser from another firm. Both tables have forced RLS with one policy each.

## Break pass (15 min)
* 5,000 Hindi characters are accepted.
* 3,000 emoji are refused as "at most 5000 characters", because the length is counted in UTF-16 units (m2).
* A text/plain file holding `<script>` is stored, then served as an attachment with `nosniff`.
* An upper-case id in the URL resolves.
* Link numbers `0` and `../1` give 404.
* No ticket body appears in any email.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-3 |
| Next step obvious | 1 | Each answer carries status and messages. A closed ticket gives 409 "raise a new ticket instead". |
| Plain words | ½ | Field errors are plain. The multer 400 and 413 answers are not (m1). |
| Feedback and state | 1 | `status`, `emailed`, 201/200/404/409/410/422 |
| Correct data | 1 | Data underneath. One gap: the double submit (m4, a screen guard). |
| Error recovery | 1 | Journey 8 |
| Accessibility and screen sizes | N/A | No screen (PF-18s) |
| Speed | 1 | The whole suite runs in 7 s. A list is one query. |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Limit and inbox labelled Sample. No AI. |

**7.5 of 8 applicable, so 9/10 scaled. Pass (8 or more, no 0).** Fixes that would raise it: map the upload layer's 400 and 413 answers to the product's 422 shape with the reason (m1).

Not tested: a real screen reader, an intended user's unaided walk (D17/D20 stay with the founder), the 410 expiry over HTTP, and a real mail adapter.
