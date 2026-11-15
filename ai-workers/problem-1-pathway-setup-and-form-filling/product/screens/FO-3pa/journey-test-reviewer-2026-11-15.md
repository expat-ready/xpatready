# FO-3pa journey test (reviewer role), 15 Nov 2026, commit d53843344

FO-3pa has no screen; it is the API that FO-3w's pages will call. So the journeys were walked over HTTP, as the future page would make the calls. There was no browser walk; that and axe belong to FO-3w. The harness was the suite's own: scratch database, fake clock, mail and arrival, Nest listening on :4431 (the runtime range; never :4400), run against a `git archive` of d53843344.

## Journeys (persona: visitor / booker, Client B)
1. **Main path.** "I want to book a free call." List `/firms/fo3pa-a/book` → open `free` → book with the box left empty → confirmation carries manage token, join link, firm contact → `.ics` download → manage → cancel with a reason. **Held**, except for the cancel-with-reason step when the reason is long (J5).
2. **Alternate.** Tick the box → one consent with the wording id. **Held.** Tick with an old wording → 409. **Held.**
3. **Empty.** A firm with no address → phone and address null, no error. **Held.** A firm with no consent sentence: not covered by the harness's fake (it always has a wording). See review #4.
4. **Error / bad link.** Unknown firm, capitals, a firm UUID, a hidden type, voided or garbage token → the same 404 body. **Held for the body.** The `.ics` 404 comes with `text/calendar` and an attachment header, so a browser saves it as `invite.ics`. Major, review #2.
5. **Error / free text.** Cancel with a 300-char reason, a 500-char reason, or one quoting an email → **500 Internal server error**, booking not cancelled. Blocker, review #1. A 501-char reason, a control character, a number, an array or an extra key → 400. **Held.**
6. **Type switch.** allowCancel false → manage shows `canCancel:false` and the cancel is refused 409, booking unchanged. Cancelling switched off after the page loaded → still refused. allowReschedule false → move and its times refused. **Held.**
7. **Recovery / reload.** After a move the old link (including `.ics`) is 404, the new one has SEQUENCE raised. A repeat call on a cancelled link → 404. **Held.**
8. **Across the boundary (to FO-3w).** The answers carry everything FO-3w's BR-8/BR-9 need: `canReschedule`, `canCancel`, `selfServiceLimitHours`, `firm.phone`. **Held.**

## Data underneath
The booking row is unchanged after every refusal and after the 500 (rolled back). Consent goes to the arrival port only when ticked, with the wording id and the clock time. The audit entry carries the reason for short reasons. No ids appear in any public answer. The business address's other keys (`owner_note`) are never shown.

## Break-it (15 min)
Unicode and right-to-left reasons work up to 200 characters. Over 200 → 500 (J5). The rate limits on the list and `.ics` could not be triggered: the harness fixes them at 1000 and the service copies the limits when it is built. The code does call `limit` on both routes (review #3). I did not run two tabs cancelling at once; the row lock plus the ACTIVE re-check covers it in the code.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Booking, consent, list, .ics, manage: yes. Cancel with a reason over 200 characters or containing an email fails (J5). |
| Next step obvious | 1 | The answers carry the flags, the limit hours, the manage token and the join link FO-3w needs (J8). |
| Plain words | ½ | Refusals use plain sentences ("This booking can't be cancelled here…"). J5 answers "Internal server error". |
| Feedback and state | ½ | 409 codes are distinct and the row is unchanged. The 500 tells the booker nothing. |
| Correct data | 1 | Consent, audit, switches, no ids, booking unchanged on refusal (data underneath). |
| Error recovery | ½ | A 400 or 409 can be acted on. The 500 cannot. The `.ics` 404 downloads as a file (J4). |
| Accessibility and screen sizes | ½ | Not applicable: no screen. Checked with FO-3w. |
| Speed | 1 | List, manage, .ics: p50 4.9 ms, p95 6.6 ms over 30 calls (harness, local DB). |
| Visual quality | ½ | Not applicable: no screen. |
| Trust and sources | 1 | No AI. All data is labelled Sample. The firm's own contact details come from its record. |
| **Total** | **7 / 10** | **Below the pass mark (8)** |

Fixes that would raise the score, most valuable first: (1) no 500 from the cancel reason (raises task, words, feedback, recovery); (2) the `.ics` 404 identical to the other not-founds, with no download headers (raises recovery).

Not tested: a real browser or screen reader, and an intended user's own walk. D17 and D20 stay with the founder.
