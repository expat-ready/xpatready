# FO-3f review: booking hardening (FO-3's review Minors; API only)

Independent Opus reviewer (P-303), 15 Nov 2026; I did not build it. Commit **12c3615c9d742436945a5a2c5a0d349bac744732**, branch `claude/lucid-rubin-4o339x`, draft PR #1785.
* **Read:** `git diff origin/main...12c3615c` (4 files); row FO-3f and brief (`lead-b-front-office`, rows rev 16.8); `screens/FO-3/review.md` (m3, m7, m10) and `break-report.md` (B-8, cap race); `ports/jobs.ts`, `api/src/platform/jobs/*`; the parallel breaker's `screens/FO-3f/break-report.md` (items 4-5).
* **Not applicable:** no screen, so the walks, 1024 px / 200 %, D1-D20 and the BIC table are N/A (FO-3 precedent).
* **Journey test:** `journey-test-reviewer-2026-11-15.md`, **8.6 / 10, pass** (6 of 7 applicable criteria).

## What I ran (never :4400)
* **Suite:** `tsx --tsconfig api/tsconfig.json tests/check_fo3_booking.ts`: **122 passed, 0 failed** (twice, about 11 s).
* **Type check:** `product/tools/typecheck.mjs`: **PASS, no new type errors (15 known)**. Needs `NODE_OPTIONS=--max-old-space-size=6144` on this 15 GB box (the default heap aborts tsc api); this comes from the environment, not the diff.
* **Graph:** `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0 (no hard gap).
* **Live app** on :4431 (runtime ports), own database `xr_studio_rv_fo3f`, dropped afterwards:
  * The app boots with PF-14's `PlatformJobs` injected into `Booking`.
  * Persian given name "علی‌رضا" (U+200C) gives 201.
  * Same stamp again gives 409 with the exact text "This form was already sent. Reload the page to book again."
  * One stamp sent 7 times in parallel over HTTP: 1 × 201, 6 × 409.
  * `platform_jobs.job`: `booking:<id>:0:mail-person` and `mail-host` **completed** through pg-boss, plus the reminder and attendance jobs created; 2 live tokens (the answer's and the email's).
* **Mutations** (scratch copy, the branch untouched):

| Mutation | Result |
|---|---|
| Gate checks the cap without reserving | 3 FAIL (cap pass/fail, door 429) |
| No `undo` on failure | check stops (FAIL) |
| Gate does not check the stamp | FAIL "one stamp sent 10 times" (10 × 201) |
| U+200C/D forbidden again | FAIL m10 pass |
| Joiners allowed anywhere | FAIL m10 fail |
| Failed send not voiding its token | 2 FAIL |
| Failed send swallowed (no rethrow) | 2 FAIL |
| `staffCreate` returns a token | FAIL m7 |
| Fixed nonce | 3 FAIL |
| One mail key for both recipients | 3 FAIL |
| **Firm advisory lock removed** | **122 / 122 pass** (m3 below) |
| **`runMail`'s sequence check removed** | **122 / 122 pass** (m4); both it and `mailToken`'s removed: FAIL |
| Outer `stampUsed` pre-check removed | 122 / 122 (redundant by design: the gate decides) |

* **Probes** (scratch copy):
  * The firm lock held from another session for 24 s: the booking's transaction expires at 20 s. The answer is a 500 with no leak: no stamp marked, no row, and the stamp books afterwards.
  * 40 rounds of two parallel forms for a taken time at an empty cap of 1: 80 × 409, never a 429 from the in-lock path.

## What holds (each item: a pass and a fail test, shown to bite)
1. **m10:** `JOINER_OUT_OF_PLACE` allows U+200C/U+200D only after a letter or mark and before a letter. The other B-9 refusals stay (svc:94-98).
2. **m3:** emails are keyed `booking.mail` jobs, one per recipient, with ids only in the payload.
   * The link token is issued inside the job, under the booking's row lock, only while it is active at that sequence.
   * A failed send voids its token and rethrows, so pg-boss retries it (3 retries, then dead letter). Token growth is bounded at 4 rows per email.
   * A stale job is skipped.
   * The running app gets `PlatformJobs` through an `@Optional` injection; `bookingPortsWith` refuses to start with no JobPort.
3. **m7:** `staffCreate` and staff moves return `view()` only and issue no token in the transaction; the person's link comes by email.
4. **B-8:** the HMAC stamp now carries a nonce and is canonical; 14 tampered spellings are refused (breaker). Used stamps are kept in memory, with the same per-process scope as the stamp key. I accept that argument: a stamp from another process or from before a restart already fails `checkStamp`. **No schema needed.**
5. **Cap race:** the in-lock `gate` checks and reserves the cap and the stamp in one synchronous step and undoes both when the transaction does not commit. That covers contention retries, NoSlot, zone refusal, a commit error and arrival or audit failures. 20 in parallel at cap − 1 give exactly 1 × 201 and 19 × 429; the breaker found no overshoot live (300 at 85/200 gave exactly 200).
* **Lock order:** public create takes the firm lock, then the sorted host locks. Moves take the row lock, then host locks; staff create takes host locks only; nobody takes the firm lock after a host or row lock. **No cycle.** The breaker ran 54 mixed writers: no deadlock, no overlap.
* **Touch list:** only `booking/{public.controller,runtime-ports,service}.ts` and the test changed. No schema, no new route, `features/front-office-booking.ts` untouched. Running reminders on pg-boss in the app is the change `runtime-ports.ts` itself had planned for PF-14.

## Findings
**Blocker:** none. **Major:** none.

**Minor**
* **m1. A used stamp books again at exactly 2 h** (reproduced in my probe and by the breaker, F1).
  * `stampUsed` counts a stamp as used only while `until > now`, with until = ms + 2 h (svc:660, 669). `checkStamp` refuses only `age > 2h` (svc:687).
  * At now = ms + 2 h the stamp is both valid and unused. My probe got 201 again; at +1 ms it got 400.
  * **Fix:** `>= now` in `stampUsed`, or record ms + 2 h + 1. Add the edge to the B-8 fail test.
* **m2. The pre-checks outside the lock read in-flight reservations** (breaker F2 and F3).
  * A form that is about to fail makes a concurrent good form get 409 `FORM_ALREADY_SENT` (svc:208) or 429 (svc:211), so nothing books.
  * This errs on the safe side, but it contradicts the design note at svc:336-339 and gives the visitor a wrong message.
  * **Fix:** keep pending reservations apart from committed ones; the pre-checks read the committed set only, and the gate reads both.
* **m3. The firm lock does not carry the cap, and its test overclaims.**
  * With the lock line (svc:350) removed, the suite still passes 122 / 122. The gate's check and record are synchronous, so the cap holds in one process without the lock.
  * The count lives in memory per process, so the lock gives no cross-process cap either.
  * Its cost is real: one firm's burst holds the shared pool. Breaker F4: in a 300-booking burst, another firm's booking took 2.6 s.
  * The row asks for the lock, so it stays. **Fix:** say this in the PR and the comment, and rename the cap test to what it proves (reservation inside the transaction).
* **m4. The stale-email guard is tested only through `mailToken`.**
  * Removing `runMail`'s `b.sequence !== p.sequence` (svc:476) passes every test, yet the host's stale email and a stale cancel email would then go out.
  * **Fix:** assert in the test at :442 that the host inbox holds no stale `booking.host_booked`.

**Notes, not findings:**
* Delivery is at least once: a crash after a send but before pg-boss marks the job complete sends a second email with a second live link. A "sent" mark would need schema.
* A crash between the commit and the enqueue still loses the email (FO-3 m3's second half). That is outside this row's wording.
* A Malayalam name in the older encoding, ending in virama + ZWJ, is refused; the row says "between letters".

## Could not check
* A COMMIT that succeeds on the server while the client sees an error (`undo` would free a booking's stamp and count). It needs the connection cut mid-COMMIT; code reading only.
* Several API processes (by design, one process, P-562).
* A real mail adapter. The runtime still has `fakeMail`, so a live retry was shown only on the fake JobPort, not on pg-boss.

**Verdict: Approve** at `12c3615c9d742436945a5a2c5a0d349bac744732`. No open Blocker or Major. m1-m4 are Minor: fix them in this PR if cheap (m1 and m4 are one line each), or carry them to Lead B.
