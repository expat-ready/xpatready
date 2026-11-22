# Journey test: FO-3a part 2b, the staff read feed (reviewer, 19 Nov)

Commit `84a6ba0d3afc41f018afeb274825ff2a5949bada`. The row is API only: it is the feed FO-3st1's calendar will read. The journeys were walked over HTTP against a scratch database on 127.0.0.1:54329, with no browser and never :4400. Live AI was off; cost US$0.

The harness was the suite's own: PF-4's guard, PF-3's seeded roles and the fake clock. Unlike the suite, it used the real `runtimeBookingPorts`: the real `auditEvent` adapter and `PrismaArrival`. That means FO-3sa's own write fed the `outsideHours` read. The harness lives in the scratchpad and nothing in the worktree changed.

## Journeys (persona · goal · steps · expected · result)
1. **Main path.** Case Officer: "book Client J at 22:00 my time and see it on my calendar".
   * Steps: POST → 409 OUTSIDE_HOURS → Book anyway → 201 → `GET feed/:id`.
   * Expected: the item with the person, type, host, lead and `outsideHours: true`.
   * **Held.** The audit line is `booking.scheduled ["OUTSIDE_HOURS"]`. The item has "Client J Sample", the email, "Free consultation", the host, `hangsOn` lead L-00001, `outsideHours: true`, `canEdit: true`, and `officeTimeZone` America/Toronto.
2. **Alternate, moved.** The same booking is moved to a free time in hours.
   * Expected: `outsideHours: false`.
   * **Held.** The latest placement line wins.
3. **During the meeting.** The host opens the booking at 15:10, inside a 15:00-15:30 meeting.
   * Expected (BR-14, AG-4-39 rule 7): no attendance buttons yet.
   * **Failed.** `canAnswerAttendance: true` (review M1).
4. **Pinned question.** At end + 30 minutes, the host's own booking is due; an Owner who is not the host gets no pin but may answer.
   * **Held.** The suite also shows that end + 29 minutes is not due.
5. **Wrong role.** Read-only (list key, no edit key) opens a colleague's ended booking.
   * Expected: no buttons, and a POST refused.
   * **Held.** `canAnswerAttendance: false`, `canEdit: false`, and the POST gets 403. No test pins this (review M2).
6. **Q4, a host with no list key.** Billing and finance:
   * `view=team` → 403, with the sentence "This needs the permission agent/booking:list.".
   * Their own booking appears in mine and by id.
   * Another host's booking by id → 404.
   * **Held.**
7. **Errors.**
   * Date-only `from` → 400 "Ask with from and to as ISO times, and view mine or team.".
   * A repeated `view` → 400. Over 62 days → 400, naming the limit.
   * A non-UUID id → 404 "No such booking.". Firm B's owner on firm A's id → 404.
   * **Held.**
8. **Empty.** A week with no bookings → 200 with `items: []` and the office zone, so the screen can draw its empty state.
   * **Held.**
9. **Host change (AG-4-67 edge case).** The old host loses the booking unless the record rule allows it.
   * **Held** (suite, DW11).

## Data underneath
* One booking row per POST. The audit line is written by the real adapter with `firm_id` set.
* The feed's values match the rows: times in UTC, `bookerTimeZone` as booked, and the lead number as stored.
* Nothing is written by a feed read.
* The FO-3vr suite (22/0) and the FO-3sr suite (29/0) are unchanged.

## Break-it
* **Mutations of `feed.ts`:**
  * Removing the host filter on `view=mine`: caught by DW9 and DW11.
  * Removing `live` from `canEdit`: caught.
  * Removing `(mine || editKey)`: not caught (review M2).
  * Removing `DISTINCT ON` from the audit read: not caught (review m1).
  * Removing the audit read's `firm_id` filter: not caught. Booking ids are UUIDs read from firm-scoped rows, so this is not exploitable, and it is not raised as a finding.
* **Route collision:** the consult feature's `:id/consult-record` and `feed/:id` share only `feed/consult-record`, which is 404 on both.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journeys 1, 2, 4 and 6-9: the week, list and detail come from one call each |
| Next step obvious | ½ | the per-viewer flags are there, but the consult-record and inside-the-limit answers are not (review m4) |
| Plain words | 1 | the 400, 403 and 404 sentences say what to do |
| Feedback and state | 1 | the right status for each case; the empty week is a 200 with the zone |
| Correct data | ½ | attendance buttons offered mid-meeting (M1); a case call is labelled as a prospect (m3) |
| Error recovery | 1 | each 400 names the limit or the format |
| Accessibility and screen sizes | N/A | no screen (FO-3st1) |
| Speed | 1 | the team feed answers in about 20 ms on the scratch data; a fixed 8 reads per answer |
| Visual quality | N/A | no screen |
| Trust and sources | 1 | `outsideHours` comes from FO-3sa's recorded line, not guessed; no AI |

7 of the 8 criteria that apply, which is **8.75/10 scaled. Pass** (8 or more, no 0).

**Fixes, most valuable first:**
1. `canAnswerAttendance` only once the meeting has ended, with its test (M1; raises correct data).
2. A Read-only fail line for the permission clause (M2).
3. The consult-record and inside-the-limit answers (m4; raises next step obvious).

**Could not test:**
* A browser walk, axe, widths, keyboard and a screen reader: no screen until FO-3st1.
* A real attendance POST in the harness: the database trigger checks the start against its own clock, not the fake one.
* D17 and D20 stay with the founder.
