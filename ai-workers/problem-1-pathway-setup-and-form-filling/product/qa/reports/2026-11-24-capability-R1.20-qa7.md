# qa capability R1.20 after #3465: qa 7 (cloud), 24 Nov

**Row:** R1.20, "One entitlement check; seat and plan limits; downgrade check; invite many". Done when: "Every gated action asks one check; an invite past the seat limit refused naming the limit; a downgrade that breaks a limit refused listing what to remove; a 1-50 row invite accepts the good rows and names each bad row's reason".
**Run:** main 245e2ce8e (#3465 merged 10:14 UTC: QA-773 and QA-774). Opus 5.5, medium effort. Isolated copies :4471-:4472, fresh each run, PLATFORM_IDENTITY=local. Live AI off, US$0, no live mail.
**Verdict: Works**, on the walks.yml run named below (P-339). There is no open Major or Critical (P-305). QA-775 stays open as a Minor.

## The one j_20 (#3430 item 3)
`tests/journeys/j_20.ts` is #3465's j_20 (W1-W7, DW1), unchanged, plus qa's acceptance steps from draft 0a9b3ed54, added as W8-W12:
* W8: the API's seat refusals (409 PLAN_LIMIT_REACHED with metric, limit and used; the batch row OVER_SEAT_LIMIT); a batch with a duplicate (DUPLICATE_IN_FORM, INVALID_EMAIL, the good rows invited); 50 rows on the screen in one call, all invited; 51 rows refused by the API (422 ROWS_COUNT).
* W9: the downgrade check through `PlanBookings.book` refuses 409 DOWNGRADE_CONFLICTS. It lists used, limit and how many to remove, in SA-4-56's words, and nothing is booked. A lower plan that breaks nothing is booked, with its audit line.
* W10: one check. In the code, the seat, case and storage gates each call `PgEntitlements.check`, and Team's seat line reads `seatLimitOf`. In the running app, one booked lower plan makes the invite and case gates refuse together, and both allow again once it is withdrawn.
* W11: the wrong roles (403) and another firm (404).
* W12: 400, 1024 and 1440 px, with no sideways scroll and axe clean.

No check of main's j_20 was removed or weakened. The reader confirmed this from the diff: only imports, the `client()` line and the cleanup changed.

## Runs
| Where | Journey | Result |
|---|---|---|
| #3465's head aa2ad42d4, local ×2 | before the reader's W9 fix | 66/66, exit 0, twice |
| main 649fae886 (before #3465), local | before the fix | 38 PASS, 21 FAIL, exit 1. Every FAIL is QA-773 or QA-774, or follows from them |
| main 245e2ce8e, local ×2 | before the reader's W9 fix | 66/66, exit 0, twice |
| walks run 45374070232 (job 138375835266), branch head 3dd1459be (app = main 245e2ce8e) | before the reader's W9 fix | 66 PASS, 0 FAIL, success |
| main 245e2ce8e, local ×2 | **final** | **65 PASS, 4 NOTE, 0 FAIL, exit 0, twice** |
| walks run 45375315224 (job 138380264677), branch head 1d494014e (app = main 245e2ce8e) | **final** | **65 PASS, 4 NOTE, 0 FAIL, exit 0, success** |

The raw outputs are in `2026-11-24-capability-R1.20-qa7/`. Each file's first line names its commit.

## QA-775 (Gap · Minor, stays open)
On a local copy the change-plan route answers 409 NO_BILLING_ACCOUNT before its downgrade check, because no Sample firm has a billing subscription. **The fresh reader decided (Lead 27's ruling 3) that these steps do not count as failures, and the clause is met.** Every path a real firm takes through `plan-change/service.ts` reaches the same check and lists what to remove: the preview at :77, the change at the renewal through `bookings.book` (:98, :149-152), a trial or "now" move at :104, and a repair at :92-93. The route itself is judged with fake Stripe in `check_pf16_billing_rules.ts:220-222` (CI shards). The 409 is never counted as a pass. The route's two answers are NOTE lines, and "the route books nothing" is judged only when the route reached its check (the reader's change). Minor is the right severity: this is a gap in the local test set-up, not a fault real users meet.

## Bugs
* **Closed:** QA-773 and QA-774 (rows in `BUGS-CLOSED.md`).
* **Still open:** QA-775 (Minor).
* **New:** none.

## Fresh reader (Opus, a new context; it only read, P-339)
**Round 1 (on 3dd1459be):** every clause has a real judge that bites, because the same judges fail on 649fae886. QA-773 and QA-774 are fixed. QA-775 is met as a Minor. The merge into one j_20 weakened nothing.
It asked for three changes:
1. Make W9's "the change-plan route books nothing" a NOTE, or judge it only when the route reached its check. It passed only because of the 409.
2. Fix j_20's stale header, which said the downgrade check was "not here".
3. Fix this folder's stale README.

All three are made on 1d494014e and later. It also noted, without blocking: W10's screen judge reads the form's seat text but does not judge it, and DW1 is loose where W8 is strict.

## What could not be tested
* The downgrade on a screen: there is no change-plan screen yet (R1.91, PF-16's screen).
* The change-plan route with a real billing subscription on a copy: QA-775.

## Suggestions
* *Later · Scaffolding:* the local plan-change stand-in gives seeded firms a test subscription id, so j_20 can judge the route too (QA-775).
* *Later · Capability:* judge W10's form seat text.

## On main after the merge
walks run 45383961944 (job 138410185818), workflow_dispatch on main 30e97254c (#3480 merged): j_20 65 PASS, 4 NOTE, 0 FAIL, exit 0, success. That is the run on main the reader asked for (P-339); R1.20 stays Works.
