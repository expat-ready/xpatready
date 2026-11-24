# Journey test, reviewer role: FO-7t part 1, round 11 (Lead 17, cancel visibility; head db39eccd6)

Run 24 Nov by the Opus 5.5 reviewer. The row is **API only, with no screen**, so the journeys are **simulated through the routes**: no browser walk.
* How it was run: the check's own Nest app on isolated copies (run-suites.sh --only, ports +14000). :4400 was not touched, and no model was called.
* Earlier journeys and the full score table: `journey-test-reviewer-2026-11-23.md`. Later rounds raised the score to 8.5 (review.md rounds 2-10).
* This round re-walks only the journey the diff changes.

## Journeys re-walked
1. **Wrong scope (a Case Officer with agent/payment:record).** user-O is on CASE's team, owns no prospect and has no view-all. Its attempts to cancel:
   * Client A's request with no case → 404.
   * A request on CASE2 → 404.
   * An already cancelled request on CASE2 → 404, never "DR-… is already cancelled".
   * The rows are unchanged and no audit line is written.
   * Reading those requests by `GET /requests/:id`, the same caller gets 404 under the same rule (`reads.ts:27`, checked for Client A's request at `check_fo7t_trust.ts:331`). The two routes now agree, and neither tells the request's number.
   * **Held.**
2. **In scope, by case.** The same caller cancels a request on CASE: 200, Cancelled, the reason stored, one audit line. **Held.**
3. **In scope, by party.** The Owner cancels Client A's request with no case: 200, one audit line. **Held.**
4. **Before the fix (probe: the 3e8d36f5f service.ts).** Journey 1 failed: 200, 200, then 409 "DR-0009 is already cancelled". The out-of-scope caller could cancel and learn the number. **Red before, as expected.**

## Data underneath
* After each step: `money_trust_request` (`cancel_reason`), and the `audit_event` count for `trust.request_cancelled`.
* The DW10 balance (one audit line per cancelled row, all by `staff:`) holds at the end.

## Break-it
* **Nit:** nothing pins the case "unseen case, seen client → 404" (review round 11, n1). The code follows the read's rule (`service.ts:130`).
* No Blocker, Major or Minor.

## Score
**8.5/10 stands (pass, no criterion at 0).**
* No criterion moves. "Correct data" and the wrong-role half of "error recovery" were already at their round-10 level. This round closes a C5 gap on a write that had not been scored before (it was noted out of scope in round 10).
* 62/0 twice on db39eccd6.

## Not tested
* A real screen reader, an intended user's unaided walk, and widths or zoom: there is no screen, and D17/D20 stay with the founder.
