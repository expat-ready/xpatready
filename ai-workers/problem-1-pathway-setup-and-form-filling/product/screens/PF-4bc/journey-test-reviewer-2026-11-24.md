# PF-4bc journey test, reviewer role, 24 Nov 2026 (round 3)

Head 8d6af7978f6a47bd13e0a6fa0fc046f8b6e79277. Earlier rounds are in `journey-test-reviewer-2026-11-23.md`.

**PF-4bc is an API adapter with no page**, so the browser walk, axe, the screen widths and keyboard testing (skill steps 2-3) do not apply. I walked the journeys through the port on the recorded fake Cognito, and this time also on a real scratch PostgreSQL 18 (:54329):
* the PR's test, 46/0;
* probes `probe_lock.ts`, `probe_gate.ts` and `probe_race.ts` in the session scratchpad;
* mutations in a scratch copy, listed in review.md Round 3.

The two web pages these errors reach (accept-page.tsx, frame.tsx) were read in the code, not walked: there is no app on `PLATFORM_IDENTITY=cognito` in this session and no live pool.

## Journeys (persona · goal · expected · what happened)
1. **Owner resets a person's two-step sign-in while another Owner resets someone else in the same firm, with Cognito slow (0.9 s per request).** Expected: never "Cognito changed, our records rolled back".
   * Held. The first reset completes. The second waits 1.5 s and gets 409 FIRM_BUSY "Try again in a moment" before any Cognito call. For both people, Cognito and our audit agree.
   * On the round-2 code the same run gives an expired transaction and person B's app is off with no audit line (mutation A).
2. **The Owner retries after FIRM_BUSY.** Expected: it works.
   * Held. The lock is free again, the transaction rolled back cleanly, and the pooled connection keeps its own lock_timeout.
3. **Owner opens a 40-person Team list while Cognito is down.** Expected: the list answers in about 1.5 s with rows unknown.
   * Held: 1521-1526 ms, all 503 (shown unknown).
   * The next read answers at once, and no slot is lost after 2 400 interleaved aborts and releases.
4. **Owner opens the Team list with Cognito healthy.** Expected: about 1 s, every row read.
   * Held: the round-2 figure, unchanged; ten rows, at most 4 at a time.
5. **Invitee accepts while the firm is busy (another accept or reset with a slow Cognito, a plan change, a close).** Expected: "try again", and a way to do it.
   * The server is right: 409 FIRM_BUSY, nothing written, a retry works.
   * The page is not: accept-page.tsx:75 shows "This link cannot be used" with no Continue, above words that say "Try again in a moment" (r3-m1). Recovery is only by reopening the email link.
6. **Invitee of a firm closed on day 90 (PF-11c, merged).** Expected: 410.
   * Held: check_pf11c_close.ts 47/0. The status is read under the firm lock.
7. **Staff member signs out while the firm lock is held for more than 1.5 s.** Expected: the session ends on the server.
   * Not held. The server returns 409 FIRM_BUSY. frame.tsx:92 forgets the token in the browser, but no revocation row is written (r3-m2, from code).
8. **Break it.**
   * The lock-timeout error leaves the transaction aborted (25P02), so the code never continues on it. It does not: the 409 rolls back.
   * The regex does not mistake a statement timeout or a deadlock for FIRM_BUSY.
   * Removing the service's wiring of lockFirm/FIRM_TX is not caught by any test (r3-m3).

## Data underneath
* **Scratch database:** the audit rows match Cognito's state person by person (journey 1). `lock_timeout` is restored to the database default after the lock (9s before, 9s after).
* **Fake's record:** no request reaches Cognito for a reset refused with FIRM_BUSY.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Every adapter call and both races work; 46/46, run twice (the repository and the scratch copy) |
| Next step obvious | ½ | FIRM_BUSY says "Try again in a moment", but the accept page removes Continue (journey 5, r3-m1) |
| Plain words | 1 | Our own words on every error. Only the invitee's "your firm" is slightly off (r3-m1) |
| Feedback and state | ½ | A refused sign-out looks done in the browser but stays live on the server (r3-m2). The passkey after a reset is still unverified (declared) |
| Correct data | 1 | R2-M1 is fixed and proven on real PostgreSQL. The late-answer case is safe to retry (declared) |
| Error recovery | 1 | FIRM_BUSY rolls back cleanly and a retry works. Create, reset and sign-out are safe to repeat |
| Accessibility and screen sizes | n/a | No page |
| Speed | 1 | 40 rows: 1.5 s with Cognito down, about 1 s when healthy. The lock wait is capped at 1.5 s |
| Visual quality | n/a | No page |
| Trust and sources | 1 | Limits are declared in the contract header, challenge.md and the fixture's "Not verified" list |

**7 of 8 applicable criteria (8.8/10), none at 0. A pass.** Fixes that would raise it, most valuable first:
1. FIRM_BUSY as a retryable 503, or Continue kept on the accept page (r3-m1). This raises next step.
2. Sign-out keeps the plain wait (r3-m2). This raises feedback and state.
3. Pin the service's wiring (r3-m3). This protects correct data from regressions.

Not tested: a real screen reader, an intended user's unaided walk (D17/D20 stay with the founder), a live Cognito pool (C21), the two web pages in a browser, and `tsc` (out of memory).
