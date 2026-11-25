# Journey test (reviewer), round 3: FO-9b part 2, API journeys, 23 Nov 2026

Commit `9db9ca2d015b3452bd5fb05f5c149d6c3fd2461b`, PR #3174. Diff only (`3168257..9db9ca2`), as the tech lead allowed. Rounds 1 and 2 are in `journey-test-reviewer-2026-11-23.md` and `-r2.md`. There is still no screen (FO-9s parts 2-3 build it), so these are API journeys: what a person would do, written as calls to the routes the screen will use.

**Setup**
* The journeys ran inside the suite's own harness (`check_fo9b_review.ts`), in a detached scratch worktree at `9db9ca2`. The Nest app listens on 127.0.0.1 on a random port, never :4400. The database is the suite's scratch database on 127.0.0.1:54329, made and dropped by the suite.
* Pairs come through `arrive` (web-form-like). "Add as new" goes through `Leads.add` with `confirmedNew`. Calls go over HTTP with the Owner's (user-R) session token.
* The probe blocks are in the reviewer's scratchpad, not committed. Every value is Sample. US$0.

## Journeys (persona · goal · result)
1. **Across a merge, an "Add as new" person (round 2 n1), Owner.** A has email E. B has E and phone P. C has P and is added with **Add as new**, so B-C is Kept separate.
   * Preview A-B: 200. Guided merge A←B with the preview's `updatedAt`: 200. A takes P.
   * A-C is written **`KEPT_SEPARATE`**, decided by the adder. It is on the Kept separate tab with score, reasons and `decidedAt`, and not on To review. **Held (n1 fixed).**
   * The automatic variant is the suite's own n1 test: `mergeIfSafe(A-C)` is refused, and C stays live.
2. **Undo of that merge, Owner.** Undo: 200, and A has no phone again. **A-C stays `KEPT_SEPARATE`**, credited to the adder, who never saw A-C. A later real match between A and C would never be shown on To review. **Partly holds (R3-2 below, minor).**
3. **An explicit Keep separate, then the merge by itself (three records sharing a family phone).** A (E, P), B (E, P), C (P) arrive in that order, which gives A-B, A-C and B-C, all OPEN.
   * The Owner keeps B-C separate: 200.
   * `mergeIfSafe(A-B)` merges B into A. **A-C stays `OPEN`.**
   * `mergeIfSafe(A-C)` then merges C into A. **B and C, which the Owner said are different people, are now one record.**
   * **Fails (R3-1, Major).** It is latent until arrival calls `mergeIfSafe`, as n1 was. The breaker's round 3 found the same thing, with a second order: Keep separate on a pair whose side was already merged away.
4. **A hostile key inside `updatedAt`.** `{"updatedAt":{"__proto__":null,...}}`: **422**, with `fields: {"updatedAt.__proto__": "This field is not allowed here."}`, and nothing is merged. **Held (R2-8).**
5. **Wrong role, wrong firm, double merge, stale preview, money, case:** not touched by this diff. The suite's tests for them stay green (55/55).

## Break-it pass (diff only)
* I ran one-line mutations on the claimed fixes; the review's Round 3 lists them.
* n1, the identity-copy line, the `fo_signer` line and the `updatedAt.__proto__` check each turn the suite red when removed.
* The suite stays green when any of these is removed:
  * the R2-2 live keys under the locks;
  * the R2-5 Undo re-check under its locks;
  * the "holding a copy" qualifier.
* A race on the loser's email during the lock wait still merges, because the re-check reads the survivor after the picks were applied. I found this by reading; the breaker's R3-3 shows it with a second session.
* J1-J4 together took 396 ms; no call made a request per row.

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J4 end to end; preview, merge and Undo all answer |
| Next step obvious | ½ | Unchanged from round 2: picks give no reason (BR-8), and there is no consent-copy count (BR-9; n5) |
| Plain words | 1 | The new 422 names `updatedAt.__proto__` in a plain sentence |
| Feedback and state | 1 | A carried decision shows on the Kept separate tab and leaves To review |
| Correct data | ½ | J1 holds. But J3 joins two people a person kept apart (R3-1), and J2 leaves a decision on a pair nobody decided (R3-2) |
| Error recovery | 1 | Refusals roll back whole; nothing is half-written (suite F2, F3, F5) |
| Accessibility and screen sizes | ½ | N/A (no screen), scored ½ on round 1's convention |
| Speed | 1 | 396 ms for four journeys; the carry query is one indexed lookup per match |
| Visual quality | ½ | N/A (no screen), scored ½ on the same convention |
| Trust and sources | 1 | Who decided, when, score and reasons on every item. A carried row names the original decider (see R3-2) |
| **Total** | **8 / 10** | **Passes (8 or more, no 0).** Same as round 2 |

To raise it, most valuable first:
1. R3-1: check for a Kept separate decision between the two sides (including records merged into either) in `mergeIfSafe` under the locks, and flip an existing OPEN pair in `notePairs` (Correct data).
2. R3-2: when a merge is undone, reopen or remove the pairs whose decision it carried (Correct data).
3. BR-8 and BR-9 in preview (Next step).

## Not tested
* No browser, keyboard, axe, widths or zoom: there is no screen.
* No real screen reader.
* No unaided walk by an intended user: D17 and D20 stay with the founder.
* No live copy on a runtime port this round: the diff touches only the service, the route guard and the suite. The harness serves the real controller over HTTP.
