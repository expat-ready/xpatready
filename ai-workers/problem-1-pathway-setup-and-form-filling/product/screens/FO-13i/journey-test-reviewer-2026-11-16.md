# FO-13i journey test (reviewer): the identity check API

Reviewer, 16 Nov 2026, at `29d6dd498`. **API only:** FO-13i has no screen (FO-13s builds the panel), so there is no browser walk, no axe check and no widths. The journeys below are the suite's API journeys (`tests/check_fo13i_identity.ts`, 22/22 on my run) plus my own probes, run on a scratch copy of the suite's setup ("everyone sees all" off, real FilesPort, PF-4's guard, scratch database on :54329, dropped after). Port :4400 was not used. US$0.

## Journeys (persona · goal · result)
1. **Case officer, main path:** "I saw the passport in person; record it." `POST people/:id/identity-checks` (IN_PERSON, PASSPORT, CA, last 4 `q7r2`, NAME + HOME_ADDRESS) → 201. Last 4 stored as `Q7R2`, one row, one audit line, one `identity.checked` event. **Held.**
2. **Case officer, alternate:** "The client sent a copy." Multipart with a PDF → 201. Key `identity/<person>/<uuid>.pdf` and sha256 in the same row. The link opens the same bytes as an attachment (no-store, nosniff, CSP sandbox). **Held.**
3. **Empty:** a person with no checks → `{ checks: [] }`. A check with no copy → its link is 404. **Held.**
4. **Error, bad input:** 5 characters or the full number → 400 `documentNumberLast4`. `documentNumber` → 400 naming it. `XX` → 400. Unknown detail → 400. Text renamed `.pdf` → 415. 11 MB → 413 in plain words. Nothing stored. **Held.**
5. **Error, ordinary note:** a note with a line break, a tab, or only `U+200B` → **500 "Try again."**. A retry fails the same way and, with a copy attached, leaves an unreferenced copy each time. **Broke (review M3).**
6. **Wrong role:** READ_ONLY recording → 403. BILLING_FINANCE asking for the link → 403. A Case Officer on another's lead → 404 on list, record and link. Firm B → 404. **Held.**
7. **Recovery:** link replay after 5 min → 410 "Open the check again". Replay by another staff member → 404. The retainers' `files/:token` → 404. A forced failed insert → 500 that says the copy is attached to no record, and no row is stored. **Held.**
8. **Double click:** two identical POSTs at once → 201, 201, two permanent rows. **Minor (m4).**
9. **Across the boundary (retainer → check):** Send without a check → 200 with the warning on the answer and the audit line. With a check → no warning. **Held for an individual.** For a company prospect whose SIGNATORY has no lead, the owning Case Officer is warned about that signer but gets **404** on recording or listing their check. **Broke (review M4).**
10. **Data underneath:** stored values equal the input (upper-cased). Audit and event counts equal the check count. Logs, outbox and audit hold no number, last 4, key, sha256, link or bytes (suite DW6). My probes' log lines hold code and constraint only. **Held.**

## Break pass (15 min)
`__proto__` field → 400. Expiry `2031-02-30` → 400. Lower-case `in` → stored `IN`. `details` as `"NAME,PHONE"` → 201 with 2 details. A polyglot `%PDF-` + HTML → 201, served `application/pdf` as an attachment with a sandbox CSP (the brief allows "by its first bytes"). `AB 123 4567` in the note → 201 (the same as FO-13's table rule; review m1). The breaker's report (`break-report.md`) covers the long tail. I confirmed its B2 and B3.

## Score (each 0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J4, J6, J7 pass in the suite |
| Next step obvious | ½ | the 410 says what to do; but a company signer's warning cannot be acted on (J9) |
| Plain words | ½ | the service's messages are plain and name the field; multer's own refusals are raw ("Unexpected field - file", breaker B5) |
| Feedback and state | ½ | `fields` on every service refusal; J5 is a 500 for input the user can fix |
| Correct data | 1 | J10 |
| Error recovery | ½ | J7 held; J5 "Try again" can never succeed and leaves orphan copies |
| Accessibility and screen sizes | 1 | N/A without a screen. API share met: each refusal carries a `fields` key for the panel to place (FO-13s scores the rest) |
| Speed | 1 | 22 cases, including setup, in 8 s; about 4 queries a call, no per-row requests |
| Visual quality | 1 | N/A (no screen); download headers and answer shape are consistent |
| Trust and sources | 1 | s. 24(2)(a) quoted with date (Lead B, at source); Sample labels; "Unconfirmed: no counsel"; audit line per check |

**Score: 8/10, no criterion at 0 → pass by the rule.** Counting only the 8 testable criteria, it is 6/8. The pass does not override the review's Block, which rests on two red suites and two code Majors. In order, the fixes that would raise the low scores: M3 (feedback, recovery), M4 (next step), m3 (plain words).

Not tested: a screen reader, keyboard, widths and zoom (no screen); an intended user's unaided walk (D17, D20 stay with the founder); the real app booted (the suite mounts the features directly).
