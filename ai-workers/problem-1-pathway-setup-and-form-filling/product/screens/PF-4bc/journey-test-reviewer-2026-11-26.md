# PF-4bc journey test, reviewer role, 26 Nov 2026 (round 4, after the merge only)

Head b78fbee32ba169643c08334114a48c451777db5b, a pure merge of origin/main into 7a7740278. No PR file changed. Earlier rounds: `journey-test-reviewer-2026-11-23.md`, `journey-test-reviewer-2026-11-24.md`.

**What this round tests.** PF-4bc is an API adapter with no page, so skill steps 2-3 (browser, axe, widths, keyboard) do not apply. This round re-walks the journeys that main's code could reach:
* the suites on b78fbee32;
* one probe through main's real app pool (`walledPool`; `probe_walled_lock.mts` in the session scratchpad).

## Journeys (persona · goal · expected · what happened)
1. **Invitee accepts the invitation, while a second click accepts again.** Expected: one account, the other click 410.
   * Held: check_pf4b_session_reads.ts 57/0. Both run through the Nest app on core.ts Db, so through main's pool P1/M1/M2 guards.
2. **Owner resets two-step sign-in for two people at once, with Cognito slow.** Expected: one completes, the other gets "try again" before any Cognito call.
   * Held: check_pf4bc_cognito_admin.ts 46/0.
3. **The same contention on the app's own pool.** Expected: 409 FIRM_BUSY in about 1.5 s, and the pool stays clean.
   * Held: 1535 ms.
   * Afterwards the connections show lock_timeout at its default and no open transaction, with no connection destroyed.
   * The retry commits.
4. **Owner opens the Team list (two-step column and seat line).** Expected: it reads as before, with the seat line now from the gate's own reader (main's QA-774).
   * Held: the suite's staff-read checks pass. `twoStep()` is unchanged.
5. **The deployed app calls Cognito.** Expected: every command the adapter sends is granted on the task role.
   * Held: the five imported commands are a subset of main's SIGN_IN_ACTIONS (checked by hand; the cdk test cannot run here).
6. **Invitee accepts while the firm is busy.** Expected: try again, and a way to do it.
   * Unchanged from round 3. The server is right, but the page drops Continue (r3-m1).
7. **Staff member signs out while the firm lock is held for more than 1.5 s.**
   * Unchanged from round 3: the session ends in the browser only (r3-m2).
   * Main's `signOutHere()` now also clears drafts first, which does not change this.

## Data underneath
* **Probe:** the audit table holds exactly the two committed rows. The FIRM_BUSY attempt wrote nothing.
* **pf4_identity:** 120/120 with `STUDIO_DB` set to the lane copy's database. Without it, part B reads a database that does not exist (a harness gap, review.md Round 4).

## Score (unchanged from round 3)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | 46/0, 57/0, 120/120, and the probe on the app's pool |
| Next step obvious | ½ | r3-m1 open (accept-page.tsx:75) |
| Plain words | 1 | Unchanged |
| Feedback and state | ½ | r3-m2 open |
| Correct data | 1 | FIRM_BUSY rolls back with nothing written, also through main's pool |
| Error recovery | 1 | The retry after FIRM_BUSY commits. The pool is not poisoned |
| Accessibility and screen sizes | n/a | No page |
| Speed | 1 | The lock wait is still capped at 1.5 s (1535 ms) |
| Visual quality | n/a | No page |
| Trust and sources | 1 | Unchanged |

**7 of 8 applicable criteria (8.8/10), none at 0. A pass.** The fixes that would raise it are as in round 3: r3-m1, then r3-m2, then r3-m3.

Not tested: a real screen reader, an intended user's unaided walk (D17/D20 stay with the founder), a live Cognito pool, the web pages in a browser, the cdk test itself (aws-cdk-lib not installed), and `tsc`.
