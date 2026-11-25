# PF-12b part 4: journey test (reviewer, 21 Nov 2026), commit deb5389090c1cac4eaabd17cd70791b794e85581

This is a backend row with no screen. Its one user-visible effect is the platform audit trail, plus whether a firm-less email (sign-up's verification) gets sent.
- I used the isolated copy `rv_pf12b4` on runtime port 4434 (never :4400), with the real pg-boss scheduler and the real AuditPort.
- I read the database with SQL and the copy's `api.log` after each step.
- To simulate the audit store failing, I added an owner trigger on the copy only. It refused the `sweep.platform-rows` line and nothing else.
- I removed the trigger afterwards, then stopped the copy and dropped its database.

## Journeys (persona, goal, expected result: outcome)
1. **The platform team audits the sweep.** Goal: "every time the sweep picks up an unsent sign-up email, our trail says so". Steps: a due PLATFORM_ACCOUNT row; wait for the minute's sweep.
   - Expected: one firm-null line, then the send job.
   - **Held.** The 14:52 sweep (24 ms) wrote one line:
     - firm_id NULL, `system:job:messages.outbox_sweep`, SYSTEM, entity `bypass use`;
     - detail `{use, step: "sweep.platform-rows", key: null, method: "none"}`;
     - summary "Our platform used the bypass role for its own records, no firm's (job:messages.outbox_sweep, sweep.platform-rows)."
   - `msg.send:platform:<id>:sweep:<hour>` was queued and ran 2 s later. No firm's trail was touched.
2. **The audit store refuses the line.** Goal: "no firm-less send happens unrecorded".
   - **Held, fail-closed.** No send job for the row, and the row stayed `QUEUED` with no reason.
   - The log showed `messages_sweep_platform_skipped` (`reason: bypass_not_recorded`), then the sweep job `failed` and went to pg-boss `retry`.
3. **Recovery.** I dropped the trigger.
   - **Held.** The retry (`retry_count` 1) completed, queued the send at 09:53:06 and wrote the second firm-null line. Nothing was queued twice.
4. **Idle minutes.** Goal: "the trail is not flooded".
   - **Held.** Two more completed sweeps with nothing due: the line count stayed at 2.
5. **Firm and platform together** (firm B's line fails; firm A's row and a platform row are due). This was not walked on the copy.
   - The suite's PF-12b1m and PF-12b4 lines prove it: B is skipped, A is queued, the platform row is queued with its own line, and the firm's error is thrown. I re-ran the suite: 70/0.
6. **Wrong role.** None applies: the use runs only as the recurring job (`outside: true`, no routes).
   - `touchPlatform` refuses in any firm's scope (`firm-scope.ts:234`).

Console and page errors: N/A (no page). Server errors in `api.log`: only the intended failed sweep in journey 2.

## Break-it pass
- **Mutation A** (line removed): the PF-12b4 pass and fail tests go red (68/2).
- **Mutation B** (line written on every read): the idle test and DW7 go red (68/2).
- **Retry in the same hour:** the firm rows are re-read and nothing is queued twice (job keys), but their lines are written again. That is over-recording, and main already behaves this way. Review m1 is the related wording point.
- **Correlation:** the line's `correlationId` is null because a recurring run's id fails `CORRELATION` (`firm-scope.ts:198`). This also happens on main; it is a note for qa.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1 and 3: the line, then the send |
| Next step obvious | 1 | Operator sees `messages_sweep_platform_skipped` plus a failed job; the runner retries by itself |
| Plain words | 1 | The line's summary names the use and step in plain words; the log event is self-explanatory |
| Feedback and state | 1 | The skip is logged, the job is failed, the row is left `QUEUED` |
| Correct data | 1 | Exactly one firm-null line per picking run, none on a firm's trail, none when idle |
| Error recovery | 1 | Journey 3: the retry queued the send with no duplicate |
| Accessibility and screen sizes | 1 | N/A: no UI in the diff |
| Speed | 1 | Sweep 24 to 43 ms; one indexed read plus one insert when due, none when idle |
| Visual quality | 1 | N/A: no UI in the diff |
| Trust and sources | ½ | The line names the use, step and actor, but `correlationId` is null for recurring runs (main already does this), so it cannot be joined to the run's log |

**9.5 / 10: pass** (8 or more, and no 0). Trust stays at ½ because of a correlation-id point on main, not something this row must fix.

Not tested:
- a real provider send (the rows I inserted had no rendered file, so they ended `FAILED content changed`);
- the firm-and-platform failure on the copy (suite only);
- a screen reader, and an intended user (D17 and D20 stay with the founder).
