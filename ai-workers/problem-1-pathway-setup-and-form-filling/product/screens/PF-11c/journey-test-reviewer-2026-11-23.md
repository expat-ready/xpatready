# PF-11c part 1 + AUD-2 part 1: journey test (reviewer), 23 Nov 2026

Head reviewed: 71f3131daf1c8426d0474ec20f6b3e1c6033d7a4. This is a runtime row with no screen. The journeys are walked through the job, the API (isolated copy on :4435, runtime ports; never :4400) and the one surface a person sees: the staff sign-in card.
Note: while I worked, the builder's uncommitted fixes appeared in this shared checkout (05:44 UTC). Every result below comes from the head: the suites ran before those edits, the :4435 server started at 05:40:59, and the repros and mutations ran on a scratch copy that I checked is byte-identical to 71f3131.

## Journeys (persona · goal · expected)
1. **Main, job (the platform, on behalf of the founder):** "A firm 90 days on payment hold, notices sent: close it, archive first, delete nothing." Expected: copy in the write-once archive, firm DELETED, staff sessions ended, one `firm.closed` line.
2. **Main with a real clock:** the same, with the job clock and the store clock both on wall time (as `systemClock` is in production).
3. **Alternate, legal hold:** a hold stands on day 90, then is released. Expected: nothing archived or closed while held, one `firm.closure_held` a day, closed after the release.
4. **Error:** no archive wired / a failed write / notices missing / no hold check. Expected: blocked, alert, firm unchanged.
5. **Wrong role / crossing the firm boundary:** firm B must stay untouched, and its staff still sign in.
6. **Closed firm's staff member (Client A's consultant at the closed firm):** "I try to sign in." Expected: refused, in plain words they can read.
7. **Recovery / race:** the firm pays at the moment of the close. Expected: either still open (paid first) or closed and staying closed.
8. **Repeat:** the job runs twice the same day. Expected: nothing the second time.
9. **Boundary to the next step:** a staff member invited before the close accepts the invitation afterwards.

## What happened
| # | Result | Evidence |
|---|---|---|
| 1 | Held with a frozen fake clock: closed, archived, nothing deleted | `check_pf11c_close.ts` 33/33, exit 0 |
| 2 | **Fails.** Every run ends `blocked: PF-11c.archive_unreadable`; the firm can never close for that hold (key is write-once) | scratch repro on the head copy, runs 1 and 2 both blocked; `closure.ts:60,82,86` |
| 3 | Held: `held` twice, one held line, closes on the first run after release | suite; mutation M4 is caught |
| 4 | Held: each case blocked with one alert, firm unchanged | suite; mutations M8, M10, M13, M14 caught |
| 5 | Held: B stays on hold, has no copy, loses no row; B's `/api/platform/me` 200 in 13 ms; keyboard-only sign-in for B works at 1024 px | suite; HTTP on :4435; Playwright (Chrome) |
| 6 | **Partly.** API: the old token and a new token both get 401 `FIRM_CLOSED`. But the local sign-in door answers 200 with a token and writes `last_sign_in_at`. In the browser the person lands back on an empty sign-in card with **no message** (1440 and 1024 px). The 401's title "Sign in again" contradicts its detail "Sign-in is no longer possible". | curl on :4435; `scratchpad/closed-firm-signin-1440.png`, `-1024.png` |
| 7 | **Fails.** If billing's `refresh` reads the firm before the close commits, it writes ACTIVE after it. Result: `firm.closed` line, then status ACTIVE, and the billing line says "firm PAYMENT_HOLD → ACTIVE" | scratch repro `race_head.mts` on the head copy |
| 8 | Held: the second run is `not_due`; no second copy, line or revocation | suite |
| 9 | **Fails** (read at head, the breaker's M3): `PlatformSession.accept` never reads the firm's status | `identity/session/service.ts:105-131` at 71f3131 |

Data underneath: per-table row counts never drop; `audit_event` refuses a delete; the `firm.closed` detail names the key, sha256 and keep-until. Firm isolation in the bundle is **not** proven by the suite: mutation M12 (no `firmId` filter in `bundle`) passes 33/33, because the Sample firms' lines are scoped by the walls.

## Break it (15 min)
Mutations on a scratch copy of the head, with `check_pf11c_close.ts` re-run each time. These were **not caught**:
* M1: the hold re-check removed from the close transaction.
* M2: the clock re-check removed. The `status: DELETED` update at `:94` is unconditional, so a firm that has just paid would be closed.
* M3: `FOR UPDATE` removed.
* M5: every read-back check removed.
* M12: the firm filter removed from the bundle.

Caught: M4, M6-M11, M13-M15. The billing race (journey 7) and the real-clock failure (journey 2) are also break results.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 0 | Journey 2: with a real clock the close can never succeed |
| Next step obvious | 0 | Journey 6: the closed firm's staff see a silent sign-in loop. Ops' `firm_closure_blocked` alert is not alarmed (`deploy/cdk/lib/observability.ts:25`) |
| Plain words | ½ | The detail is plain, but the title "Sign in again" contradicts it (`identity/keys.ts:65`) |
| Feedback and state | ½ | Audit lines and alerts are right; the person sees nothing; a failure inside the close's transaction raises no alert |
| Correct data | ½ | Nothing deleted and B untouched; but journey 7 revives a DELETED firm with a false audit line, and a stale or partial copy is accepted |
| Error recovery | ½ | Fails closed everywhere; but a missed notice or the real-clock block can never clear for that hold |
| Accessibility and screen sizes | 1 | No new UI; the card works keyboard-only at 1024 and 1440 px (axe not run: the card is unchanged) |
| Speed | 1 | 401 and 200 in under 20 ms; the job is per firm |
| Visual quality | 1 | No new UI |
| Trust and sources | 1 | SA ids, "Unconfirmed: no counsel", archive key, sha256 and keep-until recorded |
| **Total** | **6 / 10** | **Fail** (below 8, two zeros) |

**Fixes that raise it, most valuable first:**
1. Make the read-back compare the bytes written and the date asked for, not the store's own clock. This fixes task completed.
2. Take billing's `plat_billing:<firm>` lock in the close transaction (correct data).
3. Refuse `FIRM_CLOSED` at the local door, so the card shows the words, and give it a matching title (next step, plain words).
4. Add `firm_closure_blocked` to the alarmed kinds, or record who watches it (next step).

## Not tested
A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). The S3 adapter (not built). The client portal (PF-4p not built).
