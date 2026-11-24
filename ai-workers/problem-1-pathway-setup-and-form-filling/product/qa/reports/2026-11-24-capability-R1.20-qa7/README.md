# R1.20, qa 7 (cloud, 24 Nov): work in progress

`j_20-merged-draft.ts.txt` is the one j_20 for R1.20 (#3430 item 3): #3465's j_20 (W1-W7, DW1) with qa's acceptance steps from draft 0a9b3ed54 added as W8-W12 (the API's seat refusals and duplicate flag, 50 rows on the screen and 51 by API, the downgrade check through PlanBookings.book, one entitlement check in code and in the running app, wrong roles and another firm, 400/1024/1440 px). It is saved here as text because #3465 has not merged; once it merges, it replaces `prototype/studio/tests/journeys/j_20.ts` in qa's records PR.

QA-775 (Gap · Minor, open): the change-plan route answers 409 NO_BILLING_ACCOUNT on a local copy before its downgrade check. In the merged journey its two answers are printed as NOTE lines, not judged; the check is judged through PlanBookings.book, which that route calls, and one step checks the route books nothing.

Runs on #3465's head aa2ad42d4 (isolated copy :4471, PLATFORM_IDENTITY=local, live AI off, US$0): run 1 66/66, exit 0.
