# AUD-1b journey test (reviewer, 18 Nov 2026), commit dac6a7a08

**What this covers:** a runtime row with no screen. The "people" are callers, and the journeys are walked through the API against a scratch database and Nest on a random port (never 4400 or the builder's ports): `check_aud1b_adapter.ts` plus my own breaker script, kept in the session scratchpad and not in the repo. The data underneath was read with SQL after each journey.

## Journeys (main path first)
1. **Firm staff (user-R, firm A) signs out.**
   * Expected: one line with firm A, FIRM_STAFF and the X-Request-Id they sent.
   * Got: exactly that (DW1 pass).
2. **The same person sends a malformed X-Request-Id.**
   * Expected: a new id, sent back in the answer and stored on the line.
   * Got: as expected, and no `example.com` id is stored anywhere (DW1 fail).
3. **A job for firm B writes its line.**
   * Expected: SYSTEM, firm B, `job:<key>`.
   * Got: as expected. In my breaker, 20 real pg-boss jobs enqueued from inside staff requests all came out the same, with no request id or actor leaking in.
4. **A line written outside any request or job.**
   * Expected: no correlation id, and the actor word's own type.
   * Got: SEED, empty correlation (DW2 fail).
5. **Our staff (a scope marked ours).**
   * Expected: the context says OUR_STAFF, and the line is refused, never mislabelled.
   * Got: as expected (DW3).
6. **A change whose audit line fails** (forced by a trigger).
   * Expected: the change rolls back, one alert with ids only, 500.
   * Got: as expected (DW4). The front-office sales routes held too (breaker report B7).
7. **500 interleaved requests, two firms, waits across awaits.**
   * Expected: 500 lines, none swapped.
   * Got: as expected, in 2.5 s.
8. **Firm A's request writes a line for firm B.**
   * Expected: refused, nothing written, one alert.
   * Got: as expected (DW6, and my breaker).
9. **Wrong actor inside a staff request** (`system:x`, another staff member's word).
   * Expected: refused.
   * Got: **written** as SYSTEM or FIRM_STAFF (breaker report M1; review Major 1).
10. **A recovery step:** the same request id sent again after a failure.
    * Expected: succeeds, nothing stuck.
    * Got: as expected (breaker report B7b).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | 29/29 adapter checks; breaker 4/4; journeys 1-8 and 10 as expected |
| next step obvious | 1 | the answer's X-Request-Id header is the id to quote, and it matches the line and the alert |
| plain words | ½ | a refused line answers a bare `{"statusCode":500,"message":"Internal server error"}` (DW6). Right for a programming error, but no words for the person |
| feedback and state | 1 | one `audit_write_failed` alert, the metric line (`attempts: 1`) and the error line; ids only |
| correct data | ½ | firm, type, correlation and case are right in journeys 1-8, but journey 9 writes a staff request's line as SYSTEM or in another person's name |
| error recovery | 1 | rollback checked in the database (no workspace row, no lead change); a retry after a failure succeeds |
| accessibility and screen sizes | 1 | N/A: no screen, no page changes; counted 1 |
| speed | 1 | 500 requests in 2.5 s; no request per row added |
| visual quality | 1 | N/A: no screen; counted 1 |
| trust and sources | 1 | each line shows who (actor type) and which request or job (correlation). Departures from SA-11-7, BR-5 and NFR5-08 are recorded, "Unconfirmed: no counsel" |

**Score: 9 / 10. Pass** (8 or more, no criterion at 0). This is the one journey score for this check. The review's verdict still depends on its two Majors.

**What would raise the low criteria, most valuable first:**
* Refuse an entry whose actor is not the request's own actor (journey 9; review Major 1).
* The person-facing words for a failed audit line belong to the screen rows; not this row's scope.

**Not tested:**
* A real screen reader, keyboard or widths (no screen).
* An intended user's unaided walk (D17 and D20 stay with the founder).
* AUD-1a Part B (it needs the builder's copy on 4606).
* The full `ci`.
