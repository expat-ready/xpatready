# PF-17 part 4: hand-over to the next runtime session (24 Nov)

The previous runtime session stopped before starting part 4 because its context was too long (Lead 25 allowed this: "if this session is too long, say so and stop"). Nothing of part 4 is built or drafted yet.

**The ask (Lead 25, 24 Nov):** PF-17 part 4, item R1.93. Concept first: skill **screen-concept**, then a fresh challenge. Then **stop for the Lead's approval before building**. Carry the failed-jobs part's three open Minors into part 4, each with a red test first:
* **m1:** PF-14's reader keeps only the oldest 10 000 dead-letter entries (`pgboss-jobs.ts` `deadLetters`, `findJobs` by `created_on`; the list keeps a year), so a newer failure can show 0 with nothing saying so. Fix: say so (a note, or `null`) when the read returns the full cap `DEAD_LETTER_READ` (`system-console/firms.ts`).
* **m2:** DW10 in `tests/check_pf17_console.ts` does not check that the read asks for `DEAD_LETTER_READ` (PF-14's default limit is 100).
* **m3:** "health unchanged by failed jobs" (`firms.ts` header) has no test.

**Where things stand:**
* On main: part 1 (#3155: `GET /api/system/firms`, `/:id`) and part 2 (#3225: `GET /api/system/support/tickets`, `/:id`, `POST /:id/replies`; keys `system/support:list` and `:manage`, Sample, Unconfirmed: SA10-X3 pending).
* **#3431 (failed jobs per firm) is approved (`Reviewer: Approve f8e9c7b39…`) but not merged** at the time of writing. m1-m3 change its code and test, so start them only once #3431 is on main, or stack on its branch `claude/runtime-pf17-failed-jobs`.
* j_93 (on main): 22/24 with #3431. The 2 failing lines are this part's screens:
  * W2: our console's Firms page (`/system/firms`, h1 "Firms") lists firm A and firm B, firm A's row with its failed jobs and plan state.
  * W4: our console's support page (`/system/support`, h1 matching /support/i) shows the ticket's row with firm A's name.
  * j_93 guesses the console's browser session key (`sessionStorage "xr-system-session"`), as its header says; check it against PF-4s before the concept fixes it.
* Lead 15's answer on #3225: the firm's plan on a support-queue row (SA-10 §3.2) comes with this part's screen; R1.93 is not Works without it.
* Health stays as part 1 computes it (HELD, ATTENTION, OK, NOT_LIVE): failed jobs are shown, not judged, until this concept decides otherwise.

**Read first:** `product/screens/PF-17-1/` and `PF-17-2/` (reviews, notes), `product/screens/PF-17-3/review.md`, PF-18s's concept PR #2332 (the firm side of support), the BACKLOG row PF-17, `tests/journeys/j_93.ts`, and `python3 product/tools/trace-requirements.py --brief PF-17`.

**Rules for this part:** a new screen needs reviewer and breaker; live AI off, US$0; port 4400 never used; no migration without asking the Lead for a stamp; push after each step.
