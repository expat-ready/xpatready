# R1.20, qa 7 (cloud, 24 Nov): work in progress

`j_20-merged-draft.ts.txt` is the one j_20 for R1.20 (#3430 item 3): #3465's j_20 (W1-W7, DW1) with qa's acceptance steps from draft 0a9b3ed54 added as W8-W12 (the API's seat refusals and duplicate flag, 50 rows on the screen and 51 by API, the downgrade check through PlanBookings.book, one entitlement check in code and in the running app, wrong roles and another firm, 400/1024/1440 px). It is saved here as text because #3465 has not merged; once it merges, it replaces `prototype/studio/tests/journeys/j_20.ts` in qa's records PR.

QA-775 (Gap · Minor, open): the change-plan route answers 409 NO_BILLING_ACCOUNT on a local copy before its downgrade check. In the merged journey its two answers are printed as NOTE lines, not judged; the check is judged through PlanBookings.book, which that route calls, and one step checks the route books nothing.

Runs (isolated copies, PLATFORM_IDENTITY=local, live AI off, US$0):
* #3465's head aa2ad42d4, :4471: run 1 66/66 exit 0; run 2 66/66 exit 0.
* main 649fae886 (before the fix), :4472: 38 PASS, 21 FAIL, exit 1. Every FAIL is QA-773 (W1-W3: Send never goes, so no batch call, no invitations, W6 has no link) or QA-774 (W4 and W10 seat line / words; W10 code: Team's seat line does not read seatLimitOf), or follows from them (W11: A has no pending invitation). So the journey is red on main and green on the fix.
