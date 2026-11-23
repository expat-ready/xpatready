# R1.42 qa 12b: independent reader's verdict

Reader: a fresh read-only context (Opus 5.5), 21 Nov 2026. Ran nothing. Read: `prototype/studio/tests/journeys/j_42.ts`
(all 323 lines), the walk log `walk_j42_job136831103939.txt` (walks.yml run 44899086096 on fdb3ba39e), the booking API
(`api/src/front-office/booking/{tokens,service,public.controller}.ts`, `consult/{controller,service}.ts`), the fo1b
migration's token trigger, and the web pages listed below. Paths are under `prototype/studio/` unless stated.

App tree check: `git diff --stat fdb3ba39e 55a9aba2f -- prototype/studio` changes only
`tests/check_fo3st3_types_browser.ts` (a test, not the app, not j_42). The walk's commit has the same app as main's head.

## 1. Done-when, clause by clause

| Clause | Met by | Evidence |
|---|---|---|
| Single-use link reschedules inside the firm's notice rule | **Screens** | j_42.ts:196-212: the link from the real email (DW1, :213-217) opens the manage page, Reschedule, choose a radio, "Move to this time", "Booking updated…"; DB RESCHEDULED at the new time. A is ~90 min out against a 60-min limit set on screen in W0 (:174-178). |
| Single-use link cancels | **Screens** | j_42.ts:226-231: Cancel, dialog, "Cancel booking", "Your booking is cancelled…"; DB CANCELLED; cancel mail arrives (:235-237). |
| Later (inside the limit) refused in words | **Screens** (server state drives it) | j_42.ts:240-246: B's link inside 60 min shows "It is less than 1 hour before your meeting. Please reply … call us on +1 416 555 0100." and `main button` count 0. The words come from `manage-page.tsx:33,85` on the server's `canChange:false` (`service.ts:310-318`). |
| Used link refused | **Screens** + server | j_42.ts:220-223 (A's first link after the move) and :233-237 (the link that cancelled). The page shows `bad-link` only on a 404 from the server (`manage-page.tsx:55,70`). |
| Expired link refused | **Screens**, real clock | j_42.ts:249-254: real wait (log: "waiting 616 s"), then the bad-link words, no buttons. |
| Staff record the outcome | **Screens** (Attended only) | j_42.ts:257-270: booking detail asks "Did … attend?", one click Attended, DB COMPLETED + one `booking.completed` audit line naming the host. No-show is offered (`detail-panel.tsx:30`) but not walked. |
| Staff record the note | **Screens** | j_42.ts:273-298: Consult record panel, time pre-filled with booked length, a fee with no currency refused in words and nothing stored, then notes + item + CAD fee saved ("Saved"), DB row with who/when, one audit line without the note text. |

## 2. Gate A

* **Start:** W0, an Admin on Settings → Booking types adds the type and sets its timings under Advanced
  (j_42.ts:143-178), then two people book on the public page (:185-192). That covers where R1.41 ends (a booking and its
  confirmation email carrying the link).
* **End:** W9 (:303-317): the saved record's Next step shows "Engage and prepare retainer" (`consult-record.tsx:229-243`),
  which opens FO-4's Engage panel on B's lead page; "Engage as Individual" creates one prospect and opens it. That is row
  53's first step and one click past it. The walk honestly NOTEs FO-5s (retainer draft) is not on main.
* **SQL/API stand-ins:** firm, staff, role grants, firm zone and closed-days settings, host hours (:79-88) and the 5-min
  slot interval (:182) are written to the DB, all declared in the log as "setup (not through the product)". None is a
  step of R1.42. The only API call inside R1.42's span is W8 (route) EUR (:299-300), a declared break check, not a step.
  Mail is read from the demo inbox (declared stand-in SI-20, :62), but the outbox rows are proven real (DW1).
* **Clock:** real clock, no seam (:26-30). Notice rule: A is 90 min out vs a 60-min limit (open), B is minutes out (closed).
  Expiry: a real ~10-minute wait for B's 5-minute meeting to end. Honest; nothing faked.

## 3. Server-side enforcement

Yes, all server side:
* Token = selector + verifier, only the SHA-256 hash stored, constant-time compare; voided or `expiresAt <= now` returns
  null (`tokens.ts:31-39`); expiry is the meeting's end (`tokens.ts:17-19`).
* Single use: the DB trigger `fo_booking_void_tokens` voids every live token on a change of status/time/host
  (`prisma/migrations/20261114120000_fo1b_booking_tables/migration.sql:325-335`); a move issues a fresh token
  (`service.ts:583`).
* Every token route goes through `byToken` (`service.ts:836-851`) → one identical 404; writes recheck the token and the
  limit under the row lock (`recheckToken`, `service.ts:854-860`, called at :567 and :610); limit test `service.ts:862`.
* `tests/check_fo3_booking.ts:311` asserts POST cancel/reschedule inside the limit answer 409 `SELF_SERVICE_CLOSED`.
* Consult record: COMPLETED required, currency CAD/USD, fee needs a currency, version check
  (`consult/service.ts:70,127,132-136`).

## 4. Could the walk pass while the feature is broken?

Mostly no. The "fail" cases assert the refusal itself (state `bad-link`, exact words, zero buttons) plus DB state where it
matters. Residual weak spots:
* W5 shows the page hides buttons; it does not itself POST a reschedule inside the limit. A server that let the POST
  through would still pass the walk. Mitigated by `check_fo3_booking.ts:311` and `recheckToken`, so not a hole in the product.
* W3/W6 check the page's words only; they would also pass if the server 404'd for the wrong reason. Acceptable: 404 is
  deliberately uniform (tokens.ts:5-6).
* W8 "no currency" may be stopped by the page before any request; the server's own refusal (`consult/service.ts:127`)
  is not proven by the walk (EUR is, by route).
* No data a step depends on is pre-seeded by SQL: the bookings, links, attendance, record and prospect are all made by screens.

## 5. Bugs / findings

1. **Minor (test honesty).** j_42.ts:29 says host hours are "setup a person cannot do through the product yet", but an
   availability screen exists (`web/src/modules/front-office/booking/availability/availability-page.tsx`; API
   `settings/availability.controller.ts:26-49`, sets with windows up to 24:00). Fix: set the host's hours on that screen
   in W0, or correct the comment to say why SQL is kept. Not in R1.42's span, so not gating.
2. **Minor (coverage).** "Outcomes" is plural; only Attended is walked. Fix: add a No-show branch (or a second booking)
   to the walk, or cite the check that covers No-show and the record's 409 `NOT_ATTENDED`.
3. **Minor (coverage).** W5 does not try the refused action on the server. Fix: one declared break call, POST
   `/api/public/bookings/<B token>/reschedule` expecting 409 `SELF_SERVICE_CLOSED`, beside the EUR route check.
4. **Minor (wording).** Done-when says "the firm's notice rule"; the walk sets the type's own 1-hour override (FO-3st3b),
   not the firm-wide Timings default. Fine as product behaviour (the firm's Admin sets it); say so in the walk header.

No Blocker, Critical or Major found.

## 6. Verdict

**Works**, conditional on a second green GitHub walk of j_42 on main's head 55a9aba2f (P-339's independent re-run).
Every Done-when clause is met by screens, the walk reaches row 53's first step, stand-ins are declared and outside
R1.42's span, refusals are server-enforced, and the clock is real. Confidence: **85%** (the remaining doubt is the
missing re-run and the unwalked No-show outcome).
