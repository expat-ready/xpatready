# FO-3f break report: items 4 (one stamp books once) and 5 (cap race)

Commit `12c3615c9d742436945a5a2c5a0d349bac744732` (branch `claude/lucid-rubin-4o339x`, draft PR #1785). Tester: break agent, 15 Nov 2026.
Scope: items 4 and 5 only. This is an API with no screen, so the UI attacks (keyboard, 1024 px, 200 % zoom, reload and back) do not apply. No live AI was used (US$0). No code was edited.
Set-up: an isolated copy `brk_fo3f` on :4562 (stopped at the end, so its database was dropped). I seeded it with `seed-sample-firms.ts` and `booking-seed.ts`, then added three types: `solo-consult` and `solo-two` (sample-solo, same host, 30 min, gap 0) and `firm-consult` (sample-firm).
Two ways in:
* **Live:** HTTP to :4562, from source addresses 127.0.x.y so each request has its own `req.ip`.
* **Harness:** a scratch script that builds `BookingService` on the same database with `limits.bookPerFirm` = N. Its clock is either the real time plus an offset, or frozen.
`svc` below is `api/src/front-office/booking/service.ts`.

## Findings

**F1 Minor (item 4): at exactly 2 h after it was drawn, a used stamp books again, any number of times.**
- Cause: the two checks disagree at the edge.
  - `checkStamp` refuses only when `age > 2h` (svc:687), so a stamp is still valid when age = 2 h.
  - The used-stamp record expires at `ms + 2h` and counts as used only while `until > now` (svc:660, 669).
  - At `now = ms + 2h` the stamp passes the validity check and also counts as unused.
  - After each booking, `gate` writes the same expiry (`ms + 2h`) again, so every request in that millisecond passes.
- Repro (harness, frozen clock):
  1. Draw a page at T and book once at T+5 s: 201.
  2. Send the same stamp at T+5 s: 409 `FORM_ALREADY_SENT`. At T+2h−1 ms: 409 `FORM_ALREADY_SENT`.
  3. At exactly T+2h, send 3 more with the same stamp: **2 × 201** (the third asked a time that was now inside the shortest notice: 409 `SLOT_TAKEN`).
- With a real-time clock the window is about 1 ms. The pre-check at svc:208 runs right after `checkStamp`, so a request has to land on that exact millisecond. Sends 20 to 150 ms early got 409 or 400, and none booked.
- Expected: refused, as the claim says ("sending the same formStamp again … is refused 409").
- Impact is small, because a fresh stamp costs only one GET.

**F2 Minor (item 4): a stamp whose booking is being refused still blocks a second send of it while the first is in flight, so nothing books.**
- Cause: `gate` records the stamp before the commit (svc:669). The pre-check outside the lock (svc:208) reads that record.
- Repro (harness):
  1. Hold the host's advisory lock for 1.5 s, as a concurrent staff write on that host does briefly.
  2. A sends stamp S for a time that is already taken. It passes `gate` and waits on the host lock.
  3. 200 ms later, B sends the same S for a free time: **409 `FORM_ALREADY_SENT`**.
  4. A then ends 409 `SLOT_TAKEN`. Nothing was booked with S. Sending S again afterwards gives 201.
- The same shows in plain parallel runs:
  - 12 parallel sends of one stamp, 11 for a taken time and 1 for a free time: in 1 of 5 rounds the result was `10×SLOT_TAKEN, 2×FORM_ALREADY_SENT, 0×201`.
  - The same with 11 arrival failures: in 1 of 5 rounds `11×500, 1×FORM_ALREADY_SENT, 0×201`.
- Expected (claim: "a stamp whose booking was refused inside the transaction … may be used again"): B books, or B gets an answer that does not say the form "was already sent". Today the stamp is reusable only one after another, not while the first is in flight.

**F3 Minor (item 5): at cap − 1, a booking in flight that then fails makes the next real booking 429, so nothing books.**
- Cause: `gate` counts the hit before the commit (svc:667). The per-firm pre-check outside the lock (svc:211, `limit(..., false)`) counts in-flight hits, so it answers 429 before the failing booking has given its hit back.
- This contradicts the design note at svc:338-339: "a booking in flight that then fails (time taken) has given its count back before the next one is checked". That holds for the check inside the lock, but not for the pre-check.
- Repro (harness, `bookPerFirm: 3`):
  1. Make 2 bookings. Hold the host lock for 1.5 s.
  2. A asks a taken time and is in flight.
  3. 200 ms later, B (own stamp, free time): **429 Too many requests**.
  4. A ends 409 `SLOT_TAKEN`. B's form sent again: 201. Hits: 3.
- Result: for that moment the cap is under-used (zero successes where one was due). It never overshoots.

**F4 Minor (item 5, side effect of the lock): one firm's burst holds the shared connection pool, so other firms and reads wait.**
- Cause: each public booking takes a pool connection first and then waits for the firm's lock inside the transaction (svc:348-350).
- Live, 300 parallel bookings at sample-solo, each from its own IP and with its own stamp, while sample-firm was booked 50 ms in:
  - The sample-firm booking took **2597 ms** (201).
  - The 300 took 2.6 s in all.
- Live, during 80 parallel bookings, a public slots read took **2039 ms** (the reads after it took 15 to 30 ms).
- No time-outs or 500s: 500 parallel bookings in the harness with no cap all booked in 6.7 s. The cap of 200 also bounds a burst to about 5 s.
- Expected: one firm's burst does not stall the other firms' doors. Recorded as a cost of the design, not a correctness failure.

## What held
- **Item 4, sequential (live):** after a 201, the same stamp got 409 `FORM_ALREADY_SENT` with the exact text "This form was already sent. Reload the page to book again." I tried four ways:
  - another time
  - the other type (`solo-two`)
  - PHONE with a phone number
  - another IP
- **Item 4, tampering (live):** these 14 variants were each refused 400 "We could not take this booking. Please reload…", and nothing booked:
  - upper-case nonce
  - a trailing dot, or two dots in a row
  - a leading or trailing space
  - a leading `0` or `+` on the ms
  - an extra `.0.` part
  - `=` padding
  - upper-case mac
  - empty mac
  - a NUL byte
  - a full-width digit
- The stamp is canonical: the mac is compared as a string of fixed length, so no second spelling of a stamp exists.
- **Item 4, firm and type (live):**
  - Another firm's stamp gave 400, whether fresh or already used at its own firm.
  - The stamp sent as an array gave 400 (schema).
  - A stamp is tied to the firm, not to the type. Reuse across the firm's types was refused (409).
- **Item 4, parallel (live):** one stamp sent 30 and then 60 times at once, from 10 IPs, alternating two types: exactly **1×201**, and the other 29 / 59 got 409 `FORM_ALREADY_SENT` (max 240 ms).
- **Item 4, reuse after a refusal (live, one after another):**
  - After 409 `SLOT_TAKEN`, the same stamp booked (201), and was then refused 409.
  - After 409 consent-wording-changed (refused before the transaction), the same stamp booked.
- **Item 4, restart (live):** a used stamp sent after `isolated.sh restart` got 400. The key is random per process, so old stamps die with the process.
- **Item 5, cap race (live):** at 85 of 200 bookings, 300 sent in parallel gave **115×201 and 185×429**: exactly 200 in the window, no overshoot.
- **Item 5, cap race (harness), exactly one success every time:**
  - cap 5, 50 in parallel: 1×201, 49×429
  - cap 3, 80 in parallel: 1×201, 79×429
  - cap 2, 30 in parallel: 1×201, 29×429
  - cap 3 at 2, 60 in parallel, a third for a taken time and a third with arrival failing: 1×201, 2×409, 57×429
  - five rounds of 12 at cap 3 at 2, 11 of them with a late arrival failure
- **Failures undo cleanly:** 5 arrival failures and 5 audit failures (500 each) left the firm count at 2 and recorded no stamp. A failed stamp then booked, and the next one got 429 at cap 3.
- **No deadlocks or overlaps:** 54 writers on 8 times of one host at once:
  - 30 public bookings on 2 types
  - 12 staff creates
  - 6 staff moves
  - 6 self-service moves

  Result: 8×201, 46×409 `SLOT_TAKEN`, no 500, no deadlock, 0 overlapping active bookings, 831 ms.
- **No advisory lock left held** in the copy's database after any run (checked on `pg_locks` for that database).

## Not tested
- A COMMIT that succeeds on the server while the client sees an error: `undo` would free the stamp and the count of a booking that was made (svc:363, 367). Code reading only; it needs the connection cut during COMMIT.
- Several API processes: by design the stamps and the cap live in one process's memory.
