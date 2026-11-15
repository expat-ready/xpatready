# FO-3h journey test (reviewer), 15 Nov 2026

Commit `0d40a7419a9ac0a64ce400d78b737a20e107f9b2`, PR #1799. This is a runtime row with no screen: the only thing a person sees is the text of a booking email. So the journeys were walked on the booking service with FO-3's fakes (clock, JobPort, mail): `tests/check_fo3_booking.ts` and qa's QA-470 check. There was no browser walk; axe, widths and keyboard are N/A. Never :4400. The scratch databases were dropped afterwards.

## Journeys
| # | Persona, goal | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Host in Toronto: "when is my new consultation?" | Client books from Asia/Dubai for Tue 17 Nov 10:00 Toronto; mail job runs | Host mail subject and text: "10:00 a.m. (America/Toronto)" | **Held**: "Consultation is booked: Tuesday, November 17, 2026 at 10:00 a.m. (America/Toronto)" (DW1). On main it read "7:00 p.m. (Asia/Dubai)" |
| 2 | Client in Dubai: "when is my consultation?" | Same booking | Confirmation in the client's zone, "7:00 p.m. (Asia/Dubai)" | **Held** (DW2; unchanged from main) |
| 3 | Host, after the client moves the meeting from Tokyo | Rebooked 11:00 Toronto, booker's zone now Asia/Tokyo; then cancelled | Host's moved and cancelled mails in Toronto time, no Tokyo or Dubai | **Held** (DW3 pass/fail); the booker's own moved mail reads "1:00 a.m. (Asia/Tokyo)" |
| 4 | Host after the meeting: "record attendance" | Clock 30 min past the end; attendance job runs | "Your consultation of … 10:00 a.m. (America/Toronto) has ended …" | **Held** (DW4). On main it read Asia/Dubai |
| 5 | Calendar app of the host and the client | Open invite.ics | DTSTART/DTEND in UTC, same bytes as before | **Held** (DW5; it passes on main and on the branch, so the bytes are unchanged) |
| 6 | Client: reminders | 24 h / 1 h reminder | Booker's zone, unchanged | **Held by inspection**: `runReminder` is not in the diff (service.ts:542 still uses `b.bookerTimeZone`); FO-3's reminder cases pass |
| 7 | qa's QA-470 journey | qa's check | 3/3 | Unchanged file: **0/3 on main and on the branch** (stale harness since #1785, no job runner). With its 3 job-runner lines added: **1/2 on main, 3/0 on the branch** |

## Data underneath
* Only `platform.time_zone` is read, through `readSetting` with `firmScope(firmId)`, and the firm comes from the booking row loaded under the job's firm.
* No write paths changed. The suite's audit, outbox and token cases are unchanged and pass (132/0).

## Break it
* Mutant `hostZone` returning the literal "America/Toronto" (setting ignored): **132/0, survives**. The test firm's zone equals the setting's default, so nothing proves the setting is read (review m1).
* A host mail or the attendance question left in the booker's zone: caught (main runs give 5 FAIL).
* A firm whose stored zone is invalid: `readSetting` throws, the job fails and is retried. This is the same behaviour as the slots path, so it is not a regression.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | The host reads their own office time in all four mails (DW1, DW3, DW4) |
| Next step obvious | 1 | The attendance question still says what to record; nothing else changed |
| Plain words | ½ | The zone is always named, as ruling 2 says. It is an IANA name ("America/Toronto"), not rule 9's "(Calgary)" style. This is the existing `wallLabel` format and the ruling's choice, so it is not a finding for this row |
| Feedback and state | 1 | Each kind (booked, moved, cancelled, attendance) carries its own verb and the current time |
| Correct data | 1 | The right instant in the right zone; the .ics bytes are unchanged; DB reads are firm-scoped |
| Error recovery | 1 | A failed setting read fails the job, and the runner retries it (FO-3f) |
| Accessibility and screen sizes | ½ | Plain-text mail. Not checked in a real mail client or with a screen reader |
| Speed | 1 | One extra indexed setting read per host mail |
| Visual quality | ½ | Plain text, unchanged layout; not seen in a mail client |
| Trust and sources | 1 | The zone is named on every staff time; source cited in code (AG-04 Part B rule 9, AG01-24) |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0) |

**Raising the low scores:** m1's second firm zone would make "correct data" provable, not just true by inspection. A city label is PF-18a's or the founder's call (not this row).

**Could not test:** a real mail client, a screen reader, and an intended user's unaided read (D17/D20 stay with the founder). I did not run the live app with the pg-boss JobPort: the change is inside `runMail`/`runAttendanceAsk`, which that path calls unchanged (FO-3f's review ran it live).
