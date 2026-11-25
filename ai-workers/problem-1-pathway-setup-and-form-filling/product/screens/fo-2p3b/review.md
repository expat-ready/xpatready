# Review: FO-2 part 3b, the real ArrivalPort (PrismaArrival)

Reviewer (independent; did not build it), 19 Nov 2026. Branch `claude/runtime-arrival-port`, **head 7d0294fde912c69c2017c0390b66c210bff12b0d**, against `origin/main` 9d440b2f4. Brief `design/lead-b-briefs/FO-2p3b.md` rev 17.39 (origin/lead-b-front-office). Cards read: AG-2-84 rules 2, 3, 8; AG-2-26 rules 6, 8, 10, 12 and §8; AG-4-19.

**Verdict: Changes needed (Block).** 2 Major, 7 Minor. Journey score 9/10 (`journey-test-reviewer-2026-11-19.md`).

## Scope of this check
API only, no new screen. D1–D20 and the BIC scorecard (EXPERIENCE §6) are N/A apart from the walk below. The screens used (public booking, Leads) are unchanged and passed axe at 1440 and 1024 px. GRAPH: no new page or route.

## What I ran (all on this head)
* `check_fo2p3b_arrival_port.ts`: 37 passed, 0 failed.
* DW6 suites: `check_fo3_booking` 133/0, `check_fo3pa_public_answers` 45/0, `check_fo2_leads_prospects` 113/0, `check_fo2p3_prospects` 44/0, `check_fo3w_booking_browser` 67/0 on isolated copy :4432. Its R1–R3 now book through the real binding.
* Walk on isolated copy :4433 (never :4400), firm `sample-firm` starting with no sales setup row:
  * Tick empty: 1 person, 1 lead (BOOKING / "Booking page"), receipt CREATED, 0 consent rows, audit "Lead L-00001 arrived by a booking." The firm was seeded on this first booking.
  * Ticked, keyboard only, at 1024 px: 1 row (BOOKING_FORM / EMAIL / MARKETING, the firm's wording).
  * An open-prospect holder typing the email in upper case: no lead, Engaged → Consult; a repeat booking moves nothing more.
  * Leads shows both new leads. POST took 50–122 ms. No page errors.
* A race probe on a scratch database (not committed), described under the findings below.

## Findings
**M1 (Major): a staff stage move that commits while a booking waits on the row lock makes the booking count open prospects wrongly.** At `sales/arrival-port.ts:118-122`, `moveToConsult` locks with `… join fo_stage s … where s.kind = 'ACTIVE' … for update of p`. After the wait, PostgreSQL checks the join again with the updated `p` row and the old `s` row. A prospect whose stage just changed therefore drops out of the result. This is the same trap `prospects.ts:164-165` already avoids ("break M1").
Failing scenario, reproduced:
* Person P has two open prospects at Engaged. Staff move prospect 1 from Engaged to Qualified (row locked, not yet committed). P books, then the staff move commits.
* Result: prospect 2 moves to **CONSULT** and is named on the booking. This breaks AG-2-26 rule 8 ("more than one prospect in an ACTIVE stage, no card moves by itself").
* With a single open prospect the same race moves nothing. The receipt is then ON_OPEN_PROSPECT with no lead and no prospect (the same family as the breaker's m2, a prospect marked lost mid-booking).

Fix: lock the person's prospect rows on `fo_prospect` alone, in id order, then read their stage kinds. Choose the ON_OPEN_PROSPECT branch only after that lock, which closes m2 too. Add a two-transaction fail test for both cases.

**M2 (Major; the breaker's M1, confirmed from the code): an open-prospect booking drops the details the booker typed.** The ON_OPEN_PROSPECT branch (`sales/arrival.ts:67-75`) uses only the person id. A PHONE booking (`booking/service.ts:278` requires the number) by a holder with no phone on file, or an old one, leaves the host without the number: `contactOf` returns the record's phone. The brief says "the person as typed". The fake disagrees: `ports/arrival.ts` `contacts.set(…, a.person)` keeps what was typed. The contract does not cover this, so it passes on both.
Fix: keep the typed phone (on the person when the record has none, else as a note), and add a contract case.

**m1 (Minor): lock-order deadlock.** The adapter locks the email (`arrival-port.ts:44`). `arrive()` then locks `[email, phone].sort()` (`arrival.ts:82`), and "+…" sorts first. Every other door locks the phone first, then the email. Reproduced: a booking and a web-form or Add-lead arrival with the same email and phone → `40P01 deadlock detected`. The booking side retries (`isContention`). The form or Add has no retry, so it gets a 500. Fix: take the same sorted key set in the adapter.

**m2 (Minor): `contactOf` breaks its own type** (`arrival-port.ts:93`). A phone-only person (a hand-added lead) gets `email: ""`, which the port says is `z.email()`. A staff booking for that person makes the confirmation and reminder mail fail `MailMessage.parse` with a ZodError, not `MessageRefused`. The job is then retried instead of ending as final (`booking/service.ts:602-608`, `refusedIsFinal`). Fix: return no email and let the booking side skip the mail, or refuse the staff booking with words.

**m3 (Minor, needs a ruling; the breaker's m3; reproduced):** two people share an email and each has an open prospect → a third person and a new lead, flagged against the newer one. This fits AG16-60 and AG-2-84 rule 8's "any other known person" reading, but no rule says so and no test covers it. The Lead should rule, and a test should then pin it.

**m4 (Minor; the breaker's m5): repeat by key.** `repeat()` (`:35-38`) works the prospect out again instead of returning the first answer. It can differ after the prospect is lost. There is no live trigger today: `create()` makes a new booking id for every attempt.

**m5 (Minor): outside the touch list, and not stated.** `arrive()` gained the `onOpenProspectPersonId` branch, plus a consent source by door (`arrival.ts:62`: MANUAL → STAFF_RECORDED, which is dead code today because `leads.ts:181` passes no consent). The README and the fake also changed.
I judge `arrive()` the **right place**: the receipt comes first on the one path, and `fo_arrival_receipt_outcome_check` ties ON_OPEN_PROSPECT to door BOOKING with no lead. But the brief said "door type and summary only". The PR must state both changes (never deviate silently).

**m6 (Minor): test gaps.** `check_fo2p3b` has none of these:
* a concurrency case (M1, m1);
* a case with several people sharing an email (m3);
* consent ticked on the ON_OPEN_PROSPECT path;
* an unseeded firm (the `setup()` path; only my walk and FO-3w R2 run it);
* a typed phone on an open-prospect booking (M2).

**m7 (Minor; the breaker's m4, m6, m7):** the adapter does not check that a wording is the current one (the public door does, with a 409); `bookingForPerson` is not idempotent by key as the header says; and the id check `/^[0-9a-f-]{36}$/` lets 36 dashes through to a Prisma throw.

## Decisions judged
* **Booker found by exact lower-case email, among primary contacts of ACTIVE-stage prospects, only when exactly one person matches:** sound. It uses AG-2-26 rule 12's "open", never matches across firms, and the corporate primary contact is right. The several-people case is m3.
* **The firm's newest EMAIL/MARKETING wording:** right. AG-4-19 §3 and rule 3 say there is no booking-only store and the tick is email marketing. Ownership is checked by firm, channel and purpose (DW2 fail).
* **Seeding FO-1a once for a firm with no setup row:** acceptable. The seed is idempotent under a row lock (`firm-seed.ts:99-102`), public bookings are already serialised by the firm lock, and a DELETED firm fails the whole booking.
* **`bookingForPerson` writes no receipt and audits as `system:staff-booking`:** right. AG-2-26 §8 says auto-moves run as the system with the cause recorded, and `booking.scheduled` names the staff member.
* **`contactOf` returns empty strings:** wrong as built (m2).
* **Consent:** none is written without the tick (DW1, and my walk). Audit actors are typed, and no personal data is in the summaries. Moves are chained correctly: the trigger passed and the move goes forward only.

## Not checked
A real screen reader; a walk by an intended user (D17 and D20 stay with the founder); the :4400 walk itself (the Lead's).

**Verdict: Block.** To fix before Approve: **M1** (lock prospect rows without the join, choose the branch after the lock, add a two-transaction fail test) and **M2** (keep the typed phone, add a contract case). Fix the Minors or list them in the PR.
