# Journey test (reviewer), round 2: FO-9b part 2, API journeys, 23 Nov 2026

Commit `3168257452e42c1df0b117fe101d9354d891538b`, PR #3174. Round 1 is in `journey-test-reviewer-2026-11-23.md`; this round re-walks the paths the diff touched. There is still no screen (FO-9s parts 2-3 build it), so these are API journeys: what a person would do, written as calls to the routes the screen will use.

**Setup**
* The isolated copy `fo9brev2` ran on **:4436** (the runtime range; never :4400), started from the branch checkout at `3168257` with `PLATFORM_IDENTITY=local` and `AI_LIVE=off`. It was stopped afterwards, which dropped its database.
* Sign-in went through `POST /api/platform/session/local` (`secondStep: true`).
* The front-office setup was seeded by hand (`seedSampleFirmsFrontOffice`), as in round 1; that is not this PR.
* **Arrange step:** a few rows were set up through SQL.
  * Since M7, every pair made through Add a lead's "Add as new" is written Kept separate, and the copy has no enabled form. So to get an OPEN pair, a Kept separate pair was set back to OPEN, standing in for a web-form arrival.
  * Invoices and case clients were also inserted directly.
* The script is in the reviewer's scratchpad, not committed. Every value is Sample. US$0.

## Journeys (persona · goal · result)
1. **Add as new, Owner (user-R): "this is someone else with the same email."**
   * Add Mira Sato, then the same email again: 409 `KNOWN_PERSON`. Then **Add as new**: 201.
   * The pair is `KEPT_SEPARATE`, decided by the Owner. It is on the Kept separate tab and not on To review (30-40 ms). **Held (M7).**
2. **Main guided merge with the preview's `updatedAt`, Owner.**
   * Preview: 200, with `hasMoney false`, `needsCaseSide false`, moves and `updatedAt` (64 ms).
   * Merge with `familyName: LOSER` and a mixed-script reason: 200 (136 ms). The survivor holds "Satou", and the merge is on the Merged tab.
   * Undo: `{restored:true}`, and the pair is OPEN again. **Held.**
3. **Stale preview: someone else edits the loser after the preview.**
   * Merge with the old `updatedAt`: **409 `STALE_VERSION`**, "One of these records was changed after you opened the merge. Nothing was merged. Open it again to see the changes." Nothing was merged.
   * A malformed `updatedAt`: 422 naming both fields. **Held (M4).** The message does not say what changed (review n4).
4. **Money, Owner.**
   * The loser has an invoice. Preview says `hasMoney true`, and the merge gives **409 `HAS_MONEY`** with a plain sentence.
   * With the survivor being the record that has the money, the answer is also 409. **Held as built.** The refusal on both sides is with the tech lead (M6).
5. **Undo after a case is opened on the survivor:** **409 `NEEDS_CASE_SIDE`**, "This person has a case now; undo the merge from the client record." **Held (M5).**
6. **Errors:**
   * `choices.emial`, `choices.__proto__` (raw JSON) and `choices.constructor` each give a 422 naming the field.
   * `email: BOTH` gives a 422 "not one of the allowed choices". An array gives 422.
   * `merges?x=1` gives 422.
   * The pair stays OPEN. **Held (m1, m2).**
7. **Double click:** two merges at once give 200 + 409 `DECIDED`, with one merge record. **Held.**
8. **Wrong role and wrong firm:** a Case Officer's preview gives 403, firm B's Keep separate gives 404, and no session gives 401. **Held.**
9. **Across a merge: a person who was "added as new" against B.**
   * A has email E. B has E and phone P. C has P only and was added as new, so B-C is Kept separate by the adder, and there is no A-C pair.
   * Guided merge A←B: 200, and A takes B's phone by the default pick. **A-C is now OPEN on To review**, asking the Owner again a question the adder already answered.
   * A probe in the suite's harness shows that `mergeIfSafe(A-C)` then merges C into A by itself. **Fails (review n1, Major).**
   * After Undo, A-C stays on To review with `[PHONE]`, although A no longer has that phone (review n2).

## Break-it pass (15 min)
* Hostile keys: `__proto__` and `constructor` inside `choices` are refused and named.
* Two requests at once: held (journey 7).
* Stale tab: refused (journey 3).
* Wrong firm by URL: 404.
* Mixed-script text in the reason: stored fine.
* Re-noting after a merge: journey 9.
* The suite's own races (F2, F3) were re-run by mutation: removing either re-check after the locks turns the suite red.

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 2 and 5 end to end, including Undo and its refusal |
| Next step obvious | ½ | `hasMoney`, `needsCaseSide`, `STALE_VERSION` and `HAS_MONEY` say what to do. Picks still give no reason (BR-8), and there is no consent-copy count (BR-9; n5) |
| Plain words | 1 | Every refusal is a plain sentence. Unknown fields get named 422s (round 1's terse 400 is gone) |
| Feedback and state | 1 | Kept separate tab for "Add as new", the pair reopens on Undo, `openCount`, automatic merges marked |
| Correct data | ½ | Chosen values kept, and money and stale values are refused. But a decided "not the same person" is reopened after a merge and can be merged by itself (n1). Undo leaves a pair whose reason no longer holds (n2) |
| Error recovery | 1 | 409 for a stale preview, double merge safe, Undo refused under a case, nothing half-written |
| Accessibility and screen sizes | ½ | N/A (no screen). Scored ½ on round 1's convention. Every refusal is RFC 9457 with field messages |
| Speed | 1 | Every call 25-136 ms on the copy; no request per row |
| Visual quality | ½ | N/A (no screen), scored ½ on the same convention |
| Trust and sources | 1 | Score, reasons, `automatic` and who decided on every item. The adder is recorded as the decider of an "Add as new" pair |
| **Total** | **8 / 10** | **Passes (8 or more, no 0)**. Up from 7 in round 1 |

To raise it, most valuable first:
1. n1: carry a Kept separate decision to the survivor's new pairs (Correct data).
2. n2: close the pairs a merge wrote when it is undone (Correct data).
3. Picks say why (BR-8), and preview names the consent copies (BR-9) (Next step).

## Not tested
* No browser, keyboard, axe, widths or zoom: there is no screen.
* No real screen reader.
* No unaided walk by an intended user: D17 and D20 stay with the founder.
* The web form door: no form is enabled on the copy, so OPEN pairs were arranged through SQL as stated above.
