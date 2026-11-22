# PF-28 part 4 (booking): journey test (reviewer, 22 Nov)

Head: 6b8ca678d23bf2e20b26b9344fe10b2487f0d5e5 (PR #2908). Isolated copy `rev_pf28p4` on :4491, `PLATFORM_IDENTITY=local`; never :4400. Live AI was off; cost US$0. Script: the reviewer's own Playwright walk, kept in the session scratchpad and not committed. It ran clean twice in a row (20/20 each) after a restart.

One earlier run hit the public door's limit of 10 bookings per IP in 10 minutes. That is a 429 by design, caused by my hand probes and the builder's walk on the same copy. A restart clears the in-memory limit.

This diff changes no screen layout. The journeys walk the screens whose server answers changed: the public booking page, the manage link, Settings → Booking types, My account → Availability (time off), and the Bookings calendar.

## Journeys
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | A booker (Client A) books a free consultation, 1024 px; the form is filled by keyboard only | Picks a time, types a name of only U+200B (the page's own check passes it), Tab, family name, Tab, email, Enter | The server refuses it (422); the words show on Given names and in the summary; nothing is booked | Held. "Enter your given names." on the field and in "There is a problem"; `aria-invalid=true`; focus on the summary. axe is clean at 1024 and 400 px, with no sideways scroll. |
| J1b | The same booker puts it right | Types "Client", presses Enter on Book this time | Booked | Held: 201, the booked view; axe clean |
| J2 | The booker moves the meeting by the manage link (1440 px) | Opens the link, Reschedule (the slots door now reads `?tz` strictly), picks a time, Move to this time | Times load; moved | Held: slots 200 in 79 ms; move 200; axe clean |
| J3 | Error: a link cut short by a mail client | Opens `manage#<first 20 characters>` | The bad-link page, not an error | Held. "This link is no longer valid…": the link's shape is checked first, so the answer is the one 404. |
| J4 | An Owner edits a booking type, 1024 px | Settings → Booking types → a type → Web address "manage" → Save type | 422; "This web address is reserved." at the field | Held: the words come from the server (`aria-describedby`); axe clean; no sideways scroll |
| J5 | The Owner enters time off back to front | My account → Availability → Add time off, From 10 Mar 2030, To 5 Mar 2030, Save | 422; "End must be after start." on the form; nothing saved | Held |
| J6 | The Owner opens the Bookings calendar | `/front-office/bookings` | The feed loads (strict `view/from/to`) | Held: no refused call; no sideways scroll at 1024 px |
| — | Builder's walk `part-4-walk/walk.cjs` on my copy | — | — | 4/4 |

## Data underneath
- One `fo_booking` row per completed booking (4 rows: 3 from my runs, 1 from the builder's walk). There are 4 `booking.scheduled` audit lines; the refused attempts stored nothing.
- The 3 moves gave 3 `booking.rescheduled` lines, and the builder's cancel gave 1 `booking.cancelled`.
- The type's slug is unchanged after J4's refusal, and no time off was stored by J5.
- The only refused calls were the ones provoked: the public POST 422, the type PATCH 422, the time-off 422, and the cut-short link 404. There were no page errors.

## Break it (about 15 minutes, by API)
- **`__proto__`.**
  - Staff create, booking types and hours: refused for their other missing fields, but `__proto__` is never named.
  - The consult record (random id) and the cancel by link: `{"__proto__":{…}}` passes to the 404.
  - zod drops the key, so nothing is polluted: the output's prototype is still `Object.prototype`. See review m1.
- **Deeply nested body** (5,000 levels) on staff create: 422, never 500.
- **Wrong types:** numbers for `startsAt`/`endsAt` on time off, a number for the cancel `reason`. Each gives 422 naming the field.
- **No body:** staff create and attendance give 422 naming the required fields. Cancel by link with an unknown link gives 404.
- **Repeated query key** (`?from=…&from=…` on the feed, `?address=a&address=b`): 422 "This must be text."
- **Found:** a malformed id with a bad body on `PUT /bookings/:id/consult-record` gives 422, not 404. See review M1.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J6 all completed |
| Next step obvious | 1 | Each refusal sits on its field, with a summary; the bad link says to use the latest email |
| Plain words | 1 | The page and field words are unchanged ("Enter your given names.", "This web address is reserved.", "End must be after start.") |
| Feedback and state | 1 | `aria-invalid`, the summary, focus moved to it (J1); busy states on submit |
| Correct data | 1 | One row and one audit line per change; nothing stored on a refusal (above) |
| Error recovery | 1 | Refused, then corrected and booked (J1/J1b); a cut-short link gets the bad-link page (J3) |
| Accessibility and screen sizes | 1 | axe WCAG 2.2 A/AA clean on 6 states; 400, 1024 and 1440 px with no sideways scroll; the form filled by keyboard only |
| Speed | 1 | Slots 79 ms; the booking answered within the page's own minimum-fill wait; no step over 1 s |
| Visual quality | 1 | The screenshots match the earlier ones; nothing moved |
| Trust and sources | 1 | Sample labels are kept (the firm, the wording, names); no AI on these screens |

**10/10, pass** (8 or more, and no criterion at 0). The open review items (M1, m1, m2) are API precedence and contract points, which no person on these screens meets.

Not tested:
- A real screen reader, and an intended user's own walk (D17/D20 stay with the founder).
- The consult-record screen in a browser: its server answer changed only from 400 to 422, and the screen reads `issues` whatever the status (`consult-record.tsx:176`).
- Choosing the time on the calendar by keyboard: it was clicked. Only the form was keyboard-only.
