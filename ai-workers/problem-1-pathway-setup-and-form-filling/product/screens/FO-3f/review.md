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

## Round 2 (diff 12c3615c..8f8299c9)

Diff-only (P-277): `service.ts`, `check_fo3_booking.ts`, the new `qa/built/FO-3f.md`. The unchanged code was not re-reviewed. Journey: the diff touches no screen and no journey (API internals and tests only), so the round 1 journey score stands at **8.6 / 10** and was not re-run.

**Run:** `tsx tests/check_fo3_booking.ts` against local Postgres on 127.0.0.1:54329: **125 passed, 0 failed** (122 before, plus 3 new tests). Head is `8f8299c9`. Live AI was off, US$0.

**Mutations** (made in a scratch copy with node_modules symlinked; the scratch copy was restored, and this checkout was never edited):

| # | Mutation on a changed line | Builder's suite |
|---|---|---|
| M1 | `u.until >= now` → `> now` (svc:669), m1 reverted | red: the edge test (:483) |
| M2 | pre-check `stampUsed(…, false)` → `true` (svc:210) | red: F2 test (:503) |
| M3 | pre-check also counts `capPending` (svc:214) | red: F3 test (:527) |
| M4 | firm advisory lock removed (svc:354) | red: F2 and F3 tests |
| M5 | inner release removed (svc:367) | **green** (the builder named this one) |
| M6 | outer release removed (svc:373) | **green** |
| M7 | gate `>=` → `>` (svc:678) | red: cap tests |
| M8 | gate counts `made` only, not `inFlight` (svc:678) | **green** |
| M9 | `keep` does not add the hit | red: 3 tests |
| M10 | `keep` leaves the stamp `pending` | green (the gate still refuses with the same 409; only the cheap pre-check is lost) |
| M11 | `release` keeps the stamp | red |
| M12 | `settle` once-guard removed (svc:683) | green |
| M13 | `release` acts as `keep` | red |
| M14 | `runMail` sequence check removed (svc:482) | red: m4 test (:443) |
| M15 | gate does not record `capPending` (svc:679) | **green** |

**Round 1 items:**
* **m1 / F1: fixed.** `stampUsed` keeps the record while `until >= now`, and pruning drops only `until < now`. At ms + 2 h the stamp is refused 409 at svc:210. At + 1 ms, `checkStamp` (which runs first) refuses it 400. Pinned: M1 turns the test red.
* **m2 / F2 / F3: fixed.**
  * The quick checks outside the lock see only bookings already made.
  * The gate under the lock sees bookings made plus those in flight (`pending` stamps, `capPending`).
  * Both deterministic tests hold the host lock so that the first booking stays in flight. If the machine is slow, the test fails (a false red), never passes falsely: a pass requires A to have passed the gate before B.
  * M2, M3 and M4 each turn a test red.
* **m3: the code is fixed; the claim about tests is not.**
  * The release now runs inside the callback, before the rollback lets the lock go. The outer release covers a failed commit, and the `open` guard makes the second call a no-op. That is correct by reading.
  * The comment (svc:339-345) and the cap test name now say what they prove.
  * The PR body (item 5) still says only "checked and recorded … under `pg_advisory_xact_lock` … undone if it does not commit". Round 1 asked for the same in the PR text. Nit: the code comment is the lasting record.
* **m4: fixed.** The host inbox must hold only `booking.host_moved` for the stale booking. M14 turns it red.
* **F4:** not changed, and goes to Lead B as a note. Round 1 accepted that: the row asks for the lock.

**New findings:**
* **r2-m1 Minor: the three timing windows that the hold-and-give-back exists for are not pinned, and they can be.**
  * M5 and M6 (the two releases) and M8 and M15 (the in-flight count in the gate) all leave the suite green. M8 and M15 are the core of item 5's new design: once the firm lock is let go at COMMIT, the cap rests on `capPending` until `keep()` runs.
  * The builder says no test can force the M5 race. A wrapper on `$transaction` forces each window deterministically. I added three probes to the scratch copy. All three **pass on 8f8299c9** and each **fails under its mutation**:
    1. Delay the resolve by 200 ms after the commit. At cap − 1, fire two bookings at once. Real code: [201, 429]. Under M8 or M15: **[201, 201], 4 bookings against a cap of 3.**
    2. Delay the rejection by 300 ms after the rollback. At cap − 1, a doomed booking (taken time) is followed 150 ms later by a good one. Real code: 409 then 201. Under M5: the good one gets 429 (break F3 comes back).
    3. Throw after the callback returns, as a failed COMMIT would. Then send a good booking at cap − 1. Real code: 201. Under M6: 429 for every booking from then on, because the place leaks, and the failed stamp stays `FORM_ALREADY_SENT`.
  * Each probe sets `svc["db"]` to a `Proxy` over `db` that wraps only `$transaction`, then puts the real `db` back. About 12 lines each, built from the existing `make` / `form3` / `once` helpers.
  * M12 (the once-guard) is the same kind of gap. Without the guard, a failed booking's second release takes away the place, or the `pending` stamp, of the next booking in line. Pinning it needs probe 2 plus a held host lock.
  * The code is right in every case. This is a test gap, so Minor.
  * **Fix:** add probes 1-3 to the cap block. Fix it in this PR if cheap, or carry it to Lead B with this recipe.
* **Note, not a finding:** a Prisma transaction time-out (20 s, TX) while a booking waits on a host lock rolls back before the callback throws. For that moment a place stays held after the lock is gone. That errs on the safe side (a needless 409 or 429), like the failed-commit window above.
* **`qa/built/FO-3f.md`:** one line, PR number, what a person can now do. The suffixed-row form has a precedent (`BK-4b.md`). The text matches the build. OK.

No new defect in the changed code. m1, m2, m4, F1, F2 and F3 are closed. m3 is closed in code and comments. r2-m1 (a test gap) and the PR-body nit are open, and neither blocks.

**Verdict: Approve** at `8f8299c90196c0b75d92f8796b2127268525d711`. No open Blocker or Major. Open Minor r2-m1: pin the commit→keep, rollback→outer-catch and failed-commit windows with the `$transaction`-wrapper probes. Fix it in this PR if cheap, or carry it to Lead B.
