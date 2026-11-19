# Brief: FO-2 part 3b, the real ArrivalPort: a booking's person and lead go through front office (QA-511; finishes R1.28) (cloud builder lane; row owner Lead B / Build Lead A)

Written 19 Nov 06:45 IST by Lead B (6), on Lead 84's QA-511 ruling (#2189). The real ArrivalPort is part of R1.28, because FO-2 part 3's own Done when (rev 16.27) has the clause: "the real ArrivalPort accepts a booking with no consent and records none". **R1.28 stays Partial until this merges.**

**Model:** Opus 5.5 high (a shared port's adapter; reviewer + breaker). **PR title:** `runtime: FO-2 part 3b — the real ArrivalPort (booking arrivals through front office)`.
**Starts when:** now, from `origin/main`. It goes to the FO-2 lane after part 4, or to a warm FO lane. Its API files must not be in any queued PR (P-526b): `sales/arrival.ts` and `booking/runtime-ports.ts` are in none today, but check at start. No hand edits to shared module-card lines (P-712).

## What `main` has (so nothing is built twice)
* `ports/arrival.ts`: `ArrivalPort` with `bookingArrived(tx, BookingArrival)` and `bookingForPerson(tx, …)`, the key `booking:<bookingId>`, `fakeArrival()`, and the rules in its header (one person and one lead per key; an open prospect makes no new lead; the only open prospect moves forward to Consult with the cause "consult booked", never backward; several open prospects move none; consent optional).
* `api/src/front-office/booking/runtime-ports.ts` line 15 still binds `arrival: fakeArrival()`.
* `api/src/front-office/sales/arrival.ts`: `arrive(tx, ArrivalIn, {audit, consent})` is the one path for the WEB_FORM and MANUAL doors (receipt first, person, lead, attribution, consent through ConsentPort). The type `ArrivalIn.door` has no `BOOKING`, but the database enum `FoDoor` already has `BOOKING`. **No schema change and no migration.**
* `possibleMatch` (FO-9a): a possible match is shown, never linked.

## What to build
1. **The adapter** `api/src/front-office/sales/arrival-port.ts` implements `ArrivalPort` on top of `arrive()`, so there is still one path:
   * **`bookingArrived`:** door `BOOKING`, key `arrivalKey(bookingId)`, the person as typed. **With consent**, it is recorded through ConsentPort with the firm's wording. **With no consent, no consent row is written** (the QA-511 clause) and the person is still made.
   * The booker already has an open prospect → no new lead, and the prospect rules in the port's header apply (forward only, and several open prospects move none).
   * It returns `{ personId, prospectId? }`. It is idempotent by key: a repeat returns the same ids and writes nothing.
2. **`bookingForPerson`:** no arrival and no lead. The only open prospect moves forward to Consult. A person of another firm, or an unknown person → `null`, which the booking side turns into 404.
3. **`arrive()`** gets door `BOOKING` in `ArrivalIn`. The summary line says "by a booking".
4. **The binding:** `booking/runtime-ports.ts` binds the real adapter. `fakeArrival()` stays for the suites that pass it in.
5. **The contract:** a new `ports/contracts/arrival-port.contract.ts` runs against the fake **and** the adapter. If the fake disagrees with the header rules, fix the fake.

## Done when (P-606; `tests/check_fo2p3b_arrival_port.ts`, a pass and a fail each)
* **DW1:** a booking with no consent → one person and one lead (door BOOKING, key `booking:<id>`), and **zero** consent rows. Fail: with consent removed from the request, a consent row is still written → the test fails.
* **DW2:** a booking with consent → one consent row with the firm's wording id, through ConsentPort.
* **DW3:** the same booking id twice → one person and one lead (idempotent), and no second receipt.
* **DW4:** a booker with one open prospect at Lead → no new lead, and the prospect moves to Consult with the cause "consult booked". With two open prospects → neither moves. A prospect already past Consult → it is not moved back.
* **DW5:** `bookingForPerson` with firm B's person → `null`. With the firm's own person → the prospect moves forward, and no lead is made.
* **DW6:** the contract passes on both the fake and the adapter. FO-2's, FO-3's and FO-3pa's suites pass. `check_fo3_booking`, `check_fo3pa_public_answers` and `check_fo3w_booking_browser` run once more with the real binding. Test actors are typed (#2003).
* **The walk:** on the :4400 demo, book a consult on the public booking page with the tick empty → Leads shows the new lead "by a booking", and the person has no consent line.

## Touch list (nothing else)
* new `api/src/front-office/sales/arrival-port.ts`;
* `api/src/front-office/sales/arrival.ts` (the door type and the summary only);
* `api/src/front-office/booking/runtime-ports.ts` (the binding line);
* new `ports/contracts/arrival-port.contract.ts`;
* `ports/arrival.ts` (the fake only, if the contract finds it wrong);
* `tests/check_fo2p3b_arrival_port.ts`.

**Size (P-610):** about 350 lines.

## Duplicate check (P-526; 19 Nov 06:45 IST)
* **`main`:** `fakeArrival()` is still bound, and no file implements `ArrivalPort`.
* **Open PRs:** none names ArrivalPort or FO-2 part 3b. #2181 (FO-2 part 4) touches `sales/calls.ts`, `routes.ts` and `timeline.ts`, not `arrival.ts`.
* **BACKLOG:** no row; the Lead adds it.
* The PR writes its own `Duplicate check:` line.

## Rules
The standard PF/FO rules at the end of `wave1-sales.md` apply.
