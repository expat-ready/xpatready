# qa capability R1.20: one entitlement check, seat and plan limits, downgrade check, invite many (24 Nov)

**Run:** `/qa capability R1.20` (Lead 23's order, after R1.90), cloud qa copy, Opus 5.5 medium, live AI off, US$0. Tested on main a79e246c6, after #3370 merged as 8cf73a987. Every part named in the row is now on main: PF-15, PF-4c parts 1 and 2 (#3031, #3173), and the batch Invite screen (#3370). Isolated copies on :4479 only; :4400 not touched.

**Verdict: Partial.** Two app bugs remain (QA-773, QA-774), and no journey is green on GitHub on main's code, so P-339 is not met.

## Evidence
| What | Where | Result |
|---|---|---|
| qa's walk of the whole Done when (39 steps, by screens) | draft commit 0a9b3ed54 (branch history), fresh copies of a79e246c6, run twice | 35/39 both times, the same 4 FAILs |
| The builder's j_20 (#3370) | walks.yml 45323417054 on #3370's head 685abc262 | green on the PR head, not on main |
| item-proof | none: no PR carries `Completes: R1.20` | — |

**Why qa's draft is not merged.** It replaced #3370's j_20 and, in doing so, lost five of the builder's checks:
* focus moving to the first flagged row (break m5);
* rows locked while sending (break M1);
* a corrected row clearing its words and then being invited;
* someone else's invite taking a seat mid-form;
* the free seats going to the first valid rows.

walks.yml accepts one journey per row (`^j_(\d{1,3})$`). So main keeps the builder's j_20 unchanged, and the job left is one merged j_20 that keeps both sets of checks. Merging the draft as written would have lowered the bar.

## Clauses
* **"An invite past the seat limit refused naming the limit": holds.** On screen, the form says beforehand there is no free seat, and Send keeps the row with "No seat left … your plan (Team (Sample)) has N seats". The single invite API answers 409 PLAN_LIMIT_REACHED, and the batch API flags the row OVER_SEAT_LIMIT. Nothing is stored.
* **"A 1-50 row invite accepts the good rows and names each bad row's reason": holds except one case.** A 7-row form sends its 2 good rows, and each bad row keeps its own words and code (existing member, already invited, bad email, past the seats). 50 rows go in one batch; no 51st row is offered, and the API refuses 51 (422 ROWS_COUNT). **QA-773:** a duplicate email stops the whole Send, so no good row is sent.
* **"A downgrade that breaks a limit refused listing what to remove": holds through the service.** `PlanBookings.book`, which the route calls, refuses a move to Solo with 409 DOWNGRADE_CONFLICTS, listing used, limit, how many to remove and "Remove N staff"; nothing is booked. A lower plan that breaks nothing is booked, with its audit line. The route itself stops at 409 NO_BILLING_ACCOUNT on a local copy, because seeded firms have no billing subscription (QA-775, Minor, test setup). There is no change-plan screen yet (R1.91, PF-16's screen).
* **"Every gated action asks one check": holds for the gates; one screen does not follow it.** Seats (single and batch invite), active cases and storage each call `PgEntitlements.check`, and no gate reads a limit column itself. In the running app, one booked lower plan makes the invite gate and the case gate refuse together, and withdrawing it lets both through. **QA-774:** Team's seat line reads the plan's limit itself, so it shows free seats that the gate then refuses. The storage gate is checked in code only.
* **Walls and sizes: hold.** A Case Officer opening Team by URL is refused; Case Officer and Case Manager get 403 on the batch invite and on change-plan; another firm gets 404. 400, 1024 and 1440 px, axe clean, no page error.
* **Next step: holds.** The invited person opens the email link, accepts and is signed in with the name typed on the form, and Team lists them as active.

## Bugs (new)
* **QA-773 (Bug · Major, screens PF-6):** a duplicate row stops the whole Send. Smallest fix: drop `if (rows.some(twice)) return;` in `invite-panel.tsx` `send()` and let the server flag the row. If blocking is intended (BR-3), the Lead rules and the step is re-worded.
* **QA-774 (Bug · Major, runtime PF-15):** the seat line is a second read of the limit. Smallest fix: `staff-read/service.ts` `seats()` reads through `PgEntitlements.limitOf` and `seatsUsed`, and the refusal names the plan whose limit it quotes.
* **QA-775 (Gap · Minor):** the change-plan route can't reach the downgrade check on a local copy (NO_BILLING_ACCOUNT first).

## What is left for Works
1. QA-773, fixed or ruled.
2. QA-774, fixed.
3. One merged j_20 (the builder's checks plus qa's), green on GitHub's runners on main. Its run needs a walks.yml dispatch: see the question below.

## Questions for the Lead
* **QA-773:** is a duplicate row meant to block the whole Send (BR-3), or should the good rows go? Recommendation: let them go, as the server already flags DUPLICATE_IN_FORM per row and the Done when says "accepts the good rows".
* **Dispatch, once the merged j_20 is on a branch:** walks.yml, ref = that branch, input `journeys: "j_20"`.

## Hand-over
The merge of the two j_20s is not started. Context: the draft is at 0a9b3ed54 (`git show 0a9b3ed54:…/tests/journeys/j_20.ts`), and the builder's version is on main.
