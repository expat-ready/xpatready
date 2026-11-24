# Journey test (reviewer), round 7: FO-9b part 2, API journeys, 23 Nov 2026

Commit `e720342c11653968934b356d550514b7792188da`, PR #3174. Full read (the tech lead allowed it after the pair-rules redesign), by a fresh reviewer. There is still no screen (FO-9s parts 2-3 build it), so these are API journeys: what a person would do, written as calls to the service the routes use. The routes themselves are covered by the suite's in-process HTTP app.

**Setup**
* Both suites ran at the head from the main checkout: review 64/64, model 17/17.
* The probes ran in a detached scratch worktree at the head (removed afterwards). They use the model suite's harness: Owner (user-R) context, Sample people, and a scratch database on 127.0.0.1:54329 that the probe made and dropped. Never :4400, and no live copy on a runtime port. The probe file stays in the reviewer's scratchpad and is not committed. US$0.

## Journeys (persona · goal · result)
1. **The Owner works the list for a while (P-A).** Over 6 seeds × 30 steps, the Owner makes arrivals, Add as new, Keep separate, guided merges, merges by itself and Undo.
   * After every step, each pair's tab in `list()` is compared with the single-pair answer (`preview` → 200, or 409 `KEPT_SEPARATE`, `NOT_LISTED`, `MERGED_AWAY` or `DECIDED`).
   * **1,462 pair states, 0 disagreements. Held.**
2. **Several people act at the same moment while new enquiries arrive (P-B).** There are 90 bursts. Each burst gets a fresh trio who share one phone. One merge is done first, then these start together:
   * an arrival or an Add as new with the same phone;
   * often an Undo of that merge;
   * two of Keep separate, guided merge or merge by itself.

   Results: arrival 41/41 and Add as new 49/49 done. Undo: 34 done, 32 refused 409 (`UNDO_REFUSED`). Merge: 41 done, 32 refused 409 (`MERGED_AWAY`). Keep separate: 36 done, 23 refused 409 (`MERGED_AWAY`). Merge by itself: 20 done, 1 refused (`KEPT_SEPARATE`), and **27 thrown 409 `ALREADY_MERGED`** instead of `{ refused }` (r7-m4).
   * **0 errors, 0 Kept separate pairs joined, 0 deadlocks counted. Held.**
3. **Undo of the last change gives the list back (model I2).** The model suite holds it, and the mutations that drop the withdrawn rule (m7) or the noting merge (m10) turn it red. **Held.**
4. **A merge while a colleague edits a third person's phone (P-C).** W, then Y (flagged against W), then X (flagged against Y) arrive with one phone. Another session holds W `for update` for 3 s while the Owner merges Y into X.
   * The merge answers **200 after 2.6 s**: it waits at commit, in the deferred live-party check.
   * An unrelated arrival started during that wait took **2.2 s**: the merge holds the platform-wide event-order lock.
   * **Held (no deadlock, no error); slow while the third person is locked** (r7-m1, r7-m3).
5. **Undo after a new enquiry matched the merged record (P-D).** In order:
   * A (email a) and B (email b, same phone) exist. B merges into A, and the Owner picks B's email.
   * N arrives with email b, giving the pair N-A. Undo: 200.
   * To review then shows **N-A with reason `[EMAIL]`**, although A's email is a again. **N-B, who share email b, is not listed.**
   * **Fails, minor** (r7-m2; the class of round 2's n2).
6. **Keys, firm walls and visibility.** Covered by the suite: no session 401, missing key 403, firm B gets the one not-found, and a viewer of one side never sees the pair. **Held.**

## Break-it pass
There were 13 one-line mutations; the review's Round 7 lists them.
* **Not pinned** (both suites stay green): the NOT_LISTED refusal in `listed()`, the withdrawn check in `mergeIfSafe`, re-noting a pair that an undone merge wrote, and `list()` hiding a merged-away side (R7-1). Weak: `mergeIfSafe` without `lockPeople` fails 1 seed of 8.
* **Pinned:** `pair()`'s `lockPeople`, `list()`'s withdrawn rule, `listed()`'s merged-away rule and its `keptBetween`, the merge's noting ref, `list()`'s Kept derivation, and Undo reopening its pair.

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 to J3: every action ends done or with a worded refusal |
| Next step obvious | ½ | Unchanged: preview gives no consent-copy count (BR-9, n5) |
| Plain words | 1 | NOT_LISTED, MERGED_AWAY and KEPT lines say what happened and that nothing changed |
| Feedback and state | 1 | `keptThrough` names the deciding pair; the tabs agree with the single-pair answers (J1) |
| Correct data | ½ | J1 to J3 hold; J5 leaves a false reason on N-A and misses N-B after an Undo |
| Error recovery | 1 | J2: races give 409 or 503 with words, never a 500; 0 deadlocks |
| Accessibility and screen sizes | ½ | N/A (no screen), scored ½ on round 1's convention |
| Speed | 1 | Normal calls are fast; J4's 2.2 s needs a third person held by another session (a phone edit holds it for milliseconds) |
| Visual quality | ½ | N/A (no screen), scored ½ on the same convention |
| Trust and sources | 1 | Decisions are credited to who made them, a merge by itself is marked automatic, audit lines carry no contact values |
| **Total** | **8 / 10** | **Passes** (8 or more, no 0). Round 4 gave 7 |

To raise it, most valuable first:
1. r7-m2: refuse an Undo after a new person matched the merged record, or re-note the loser's pairs (Correct data).
2. n5: the consent-copy count in preview (Next step).

## Not tested
* No browser, keyboard, axe, widths or zoom: there is no screen. No real screen reader.
* No unaided walk by an intended user: D17 and D20 stay with the founder.
* No live copy on a runtime port: the suite serves the real controller over HTTP, and the probes call the service.
* The web form and booking doors were not driven. They share `arrive`'s new-person branch, which was read and driven through MANUAL.
