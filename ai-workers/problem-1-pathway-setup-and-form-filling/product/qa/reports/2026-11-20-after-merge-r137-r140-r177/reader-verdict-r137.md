VERDICT: WORKS

R1.37 "Public booking page; no double booking", main c66a41c96. Fresh reader (Opus 5.5, P-303), read only, ran nothing.
Tree check: in rec/, `git rev-parse` gives studio tree 1b360046e for both c66a41c96 and HEAD c8c808fff. That equals the
tree of batch #2344 (batch-checks.txt), so the CI suites ran on main's app code.

## Clause 1: a client books a type and a free time on the firm's page
- walk-steps-rerun.txt (main c66a41c96, run 44600062791 job 135829239530):
  "PASS J-37 W1: the public page lists the day's free times, among them Thursday 19 November, 15:45 ..." {"offered":100}
  "PASS J-37 W2: booker A books it: "You are booked" for Thursday 19 November, 15:45 America/Toronto time"
- j_37.ts:96-111 is a person's path on screens: /book/<firm> → "Choose Free consultation" → month → day → time →
  Given names/Family name/Email → "Book this time". The same lines PASS in walk-steps-autoproof.txt (ee24ed8b1).
- Screens: product/screens/J-37/screenshots/W1-times, W2-booked, W3-refused, W5-manage (1440). I looked at W3: the
  refusal and the next free times are shown. These pictures come from an earlier run (10:00), not this one.

## Clause 2: two bookings of one host and time at once → one booking and one refusal in words (database rule, two connections)
- Refusal in words, on the page: rerun "PASS J-37 W3: booker B is refused on the page: "This time was just booked."
  and "Please choose another time."". Also "PASS J-37 W3: underneath, one booking at that time, A's; none for B" and
  "PASS J-37 W3: B got no mail at all". The words come from web/src/modules/front-office/booking-public/type-page.tsx:192
  (slug slot-taken). The API side is api/src/front-office/booking/service.ts:85 (409 SLOT_TAKEN) and :920-929 (23P01).
- The database rule: prisma/migrations/20261115170000_fo3sa_booking_overlap_confirmed/migration.sql:10 adds
  `fo_booking_no_overlap EXCLUDE USING gist (firm_id =, staff_id =, block_range &&)`.
- Two connections: tests/check_fo1b_booking_schema.ts:144 "FO-1b fail (two connections): an overlapping SCHEDULED
  booking for the same host waits for the first, then is refused (23P01 fo_booking_no_overlap); exactly one exists".
  CI: 80 passed, 0 failed (job 135744274298).
- At once: tests/check_fo3_booking.ts:188 "20 parallel requests for one slot → exactly one booked, 19 answered 409
  SLOT_TAKEN". CI: 133 passed, 0 failed (job 135744274422).
- Note: J-37's two browsers submit one after the other (j_37.ts:133-137), not truly at once. "At once" is shown by the
  two suites above; the walk shows the refusal words a person sees.

## Clause 3: confirmation in the client's zone
- The J-37 walk alone cannot show this: the firm and the browser are both America/Toronto (j_37.ts:48, 80, 91).
- check_fo3w_booking_browser.ts covers it, with the firm in Toronto and the visitor in another zone:
  - :140 a Dubai browser sees the 14:00 Toronto slot as 22:00, with "Times shown in Asia/Dubai (change)";
  - :155 the visitor switches to London: bookerTimeZone=Europe/London is stored and the instant stays 18:00 UTC;
  - :156 "the confirmation says the time in the visitor's zone" ("19:00 Europe/London time").
  CI: 67/67 (job 135744274241).
- Mails use the booker's zone: service.ts:582 (confirmation, wallLabel(startsAt, bookerTimeZone)) and :636 (reminder).
  Rerun "PASS J-37 W4: A's confirmation arrives in the demo inbox ... (America/Toronto)".

## P-339
- Pack green on GitHub's runners on main's tree: ci 44575502680, all 18 shards and 5 regression jobs success (batch #2344).
  Its studio tree 1b360046e = main c66a41c96's. Main's own head batch ran only fast+types (a records change).
- Machine proof: run 44562311132 on ee24ed8b1, overall PASS (auto-verdict.json). Independent re-run on main c66a41c96:
  run 44600062791, 21/21 PASS.
- Gap (minor): the re-run file has no "secret check" line; the auto-proof has one. I could not open the run ids on
  GitHub (no network), so they are taken from the pack.
- Gate A (P-348c): the walk goes by screens to row 42's first step: rerun "PASS J-37 W5: the link opens A's own page for
  this booking ..., which offers Reschedule: row 42's first step".

## Open findings (P-305)
- QA-475 (Minor; jobs are queued after commit, service.ts:559-564 `safe(...)`) names R1.37. A Minor does not hold it.
- No open Major or Critical names R1.37: I grepped qa/BUGS.md for "R1.37" and only QA-475 matched.
- QA-511 (Major) names only R1.28, so it does not hold R1.37. It is still marked Open, but the code it cites has changed:
  booking/runtime-ports.ts:8 and :17 now wire PrismaArrival, and J-37 DW2 passes. Worth re-checking for R1.28.

## Earlier "parts missing"
- J-37: now exists (tests/journeys/j_37.ts) and passes on main. Closed.
- Staff screen for booking types (FO-3a's screens = FO-3st3, "Settings → Booking types"): still missing. web/src has no
  such screen; front-office/routes.tsx:16-26 has only Availability (FO-3st2, now built) and the public /book pages.
  Booking types exist only through FO-3a's API (check_fo3a_booking_types.ts 48 passed).
  - Does not block R1.37: the Done when is the client's booking, not the firm's setup. BACKLOG.md:1129 lists J-37's parts
    as FO-3f, FO-3sr, FO-3sc→FO-3w and PF-23w. FO-3st3 is a part of J-42 / row 42 (BACKLOG.md:1131) and is "parked"
    (BACKLOG.md:372).
  - Gap to carry: a firm still cannot set up its page by screens (j_37.ts:25 writes firm, host, hours and type straight to
    the database). That belongs to rows 41/42 and PF-5. It is not this capability's Done when.

## What would hold it
Nothing found. Things that would change the verdict: a Major naming R1.37, the run ids failing to match on GitHub,
or a ruling that the firm's booking-type setup screens are part of R1.37 (the backlog says they are not).
