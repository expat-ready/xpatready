# PF-17 part 1: break report, round 3 (diff-only, head 47716a7d3; breaker, own git-archive copy)

Builder's check 41/41 in the copy. The diff touches only `system-console/firms.ts` and the check; `firm-scope.ts` and the routes are unchanged. Round-1 and round-2 attacks all re-run and held: tokens, case, path tricks, methods, Content publisher 403, ids 404, PF-15 figures, no leak, fail-closed on both audit writes, limits, LIKE escape, unknown-key 400. Speed unchanged: 100 firms take 520–612 ms; `?health=HELD` takes 573 ms and writes 100 bypass lines (ruled, R1.87).

* **CLOSED combined with other states (ruling 3):** CLOSED wins and keeps its one reason.
  * Deleted, on hold, with a failed job → CLOSED ["firm deleted"].
  * Deleted, active, 7 of 5 seats → CLOSED.
  * Abandoned, overdue, on trial with 1 TB, or with no subscription → CLOSED ["sign-up abandoned"].
  * Lock plus hold → HELD ["on payment hold; security lock on"].
  * Lock with no subscription → ATTENTION.
  * Still being set up with no subscription → ATTENTION.
* **`?health=closed` never shows an open firm.**
  * Any letter case returns the 10 closed firms only.
  * `closed%20`, `close` and `CLOSED,OK` get 400; repeating `health` gets 400.
  * Across all 31 firms, health is CLOSED exactly when the status is DELETED or ABANDONED. The order is HELD, ATTENTION, OK, CLOSED; the counts agree with the filter.
* **Echo gone (break r2 m4 fixed).** 13 unknown-key queries got the same 400, "Search by health, q and page only.", with none of the 11 marker strings in any reply, raw or escaped:
  * an email-shaped key, zero-width spaces, NUL, newline, U+202E, empty, emoji, `__proto__`, `constructor[prototype][x]`, a 500-character key, `health[]`, and an unknown key next to `q`.
* **Failed jobs not counted (break r2 m5 fixed).**
  * With the queue down, a plain firm shows OK ["failed jobs not counted"].
  * HELD and ATTENTION firms keep their real reasons with that one added; CLOSED firms keep their single reason; the page note shows.
  * At the cap: 10 000 dead letters → null with the note; 9 999 → counted.
* **Notes, not defects:**
  * CLOSED hides a still-live subscription, as ruled; `subscriptionStatus` still shows it, so part 4 could surface it.
  * Two comments in `firms.ts` still name only HELD, ATTENTION and OK (`parseListQuery`, `list()`): cosmetic.
* **Earlier findings:** M1 ruled (closed); m1 (speed) goes in the PR body; m2, m3, m4 and m5 are fixed and verified.

Verdict: Approve
