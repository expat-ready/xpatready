# Journey test (reviewer), round 4: FO-9b part 2, API journeys, 23 Nov 2026

Commit `744cc791972988285a8b1c3aa865e8dc3135f2e3`, PR #3174. Diff only (`9db9ca2..744cc79`, screenshots excluded), as the tech lead allowed. Rounds 1-3 are in `journey-test-reviewer-2026-11-23.md`, `-r2.md` and `-r3.md`. There is still no screen (FO-9s parts 2-3 build it), so these are API journeys: what a person would do, written as calls to the routes the screen will use.

**Setup**
* The journeys ran inside the suite's own harness (`check_fo9b_review.ts`), in a detached scratch worktree at `744cc79`, removed afterwards. The Nest app listens on 127.0.0.1 on a random port, never :4400. The database is the suite's scratch database on 127.0.0.1:54329, made and dropped by the suite.
* Three records come through `add`, using the suite's own `trio`: A (name N, phone P), B (phone P, email E), C (name N, email E). That gives the pairs A-B, B-C and A-C, all OPEN. Calls go over HTTP with the Owner's (user-R) session token.
* The probe blocks are in the reviewer's scratchpad, not committed. Every value is Sample. US$0.

## Journeys (persona · goal · result)
1. **Keep separate, then a guided merge (the R3-1 case), Owner.** The Owner keeps B-C separate (200), then merges A←B (200).
   * The A-C pair, which was already listed, becomes **`KEPT_SEPARATE`**, and `mergeIfSafe(A-C)` is refused. **Held** (suite R3-1 test, and my P4).
2. **Keep separate on a side already merged away, Owner.** B merges into A by itself, then the Owner asks for Keep separate on B-C.
   * The answer is **409 `MERGED_AWAY`**, with the sentence, and the pair stays OPEN. **Held.**
3. **Undo after the carried decision, Owner (P4).** In order:
   * A-C is `OPEN` before anything happens.
   * Keep B-C separate: 200. Guided merge A←B: 200.
   * A-C is now `KEPT_SEPARATE`, credited to the person who kept B-C apart. **No audit line is written for A-C** (0 rows in `audit_event`).
   * Undo: 200. **A-C stays `KEPT_SEPARATE`** and is not on To review. A pair that was open before the merge stays hidden after its Undo, credited to someone who never decided it.
   * **Fails (R4-2, Major).**
4. **Two people merge overlapping pairs at the same moment (P2).** They merge A←B and A←C at once, through the real routes, three runs:
   * A-B answers 200. **A-C answers 500** ("Server error") after about 1 s. `pg_stat_database.deadlocks` goes from 0 to 3.
   * With the old `on conflict do nothing`, both merges answer 200 in about 100 ms.
   * **Fails (R4-1, Major).**
5. **Keep separate on A-C racing a guided merge of A←B (P1).** The Keep separate side was emulated with the same statements in the same order (pair row `for update`, then the sorted advisory locks).
   * The guided merge answers **500**, and the merge by itself throws **40P01 `deadlock detected`**.
   * With the real routes fired together (P3), Keep separate finished before the merge took its locks, so 3/3 answered 200. The window is real, but narrow.
6. **The newer record's email changes while the merge by itself waits (R3-3).** The merge is refused `NOT_EXACT` and nothing is merged. **Held** (suite test; it turns red when `liveReasons` is put back).

## Break-it pass (diff only)
* I ran 12 one-line mutations; the review's Round 4 lists them.
* These are pinned (the suite turns red): the upsert, the `KEPT_SEPARATE` check in `whyNotSafe`, the `MERGED_AWAY` check, `lockedReasons` (both its email and its phone halves), the `a <> b` guard, the `merged_into_id` hops, the identity copy qualifier, and the carry in `notePairs`.
* These are **not pinned** (still 61/61): Keep separate's advisory locks, and the upsert's `status = 'OPEN'` qualifier.

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 and J6 end to end; Keep separate, merge and Undo all answer |
| Next step obvious | ½ | Unchanged: picks give no reason (BR-8), and there is no consent-copy count (BR-9; n5) |
| Plain words | 1 | The `MERGED_AWAY` sentence says what happened and that nothing changed |
| Feedback and state | 1 | A carried decision leaves To review and shows on the Kept separate tab |
| Correct data | ½ | J1, J2 and J6 hold. But J3 leaves a pair that was open before the merge stuck as decided after its Undo (R4-2) |
| Error recovery | ½ | J4 and J5: a race answers an unworded 500, not the merge's own 503 `BUSY`; nothing is half-written (R4-1) |
| Accessibility and screen sizes | ½ | N/A (no screen), scored ½ on round 1's convention |
| Speed | 1 | Normal calls are as fast as in round 3; the 1 s deadlock wait is counted under R4-1 |
| Visual quality | ½ | N/A (no screen), scored ½ on the same convention |
| Trust and sources | ½ | A flipped pair is credited to a person who never saw it, and no audit line records the change (J3) |
| **Total** | **7 / 10** | **Does not pass** (below 8). Round 3 gave 8 |

To raise it, most valuable first:
1. R4-1: take Keep separate's and the merges' locks in one order, or refuse with `MergeBusy` instead of waiting (Error recovery).
2. R4-2: when a merge is undone, reopen the pairs it carried; write an audit line for each carry, naming the merge and the source pair (Correct data, Trust).
3. BR-8 and BR-9 in preview (Next step).

## Not tested
* No browser, keyboard, axe, widths or zoom: there is no screen.
* No real screen reader.
* No unaided walk by an intended user: D17 and D20 stay with the founder.
* No live copy on a runtime port: the diff touches only the service and the suite. The harness serves the real controller over HTTP.
