# Journey test (reviewer): FO-9b part 2, API journeys, 23 Nov 2026

Commit `b0eee18ea9faa8cb3d58e68a95e5265ec7adee55`, PR #3174. There is no screen (FO-9s parts 2-3 build it), so these are API journeys: what a person would do, written as calls to the routes the screen will use.

The isolated copy `fo9brev` ran on **:4436** (the runtime range; never :4400), with `PLATFORM_IDENTITY=local` and `AI_LIVE=off`. It was started from the branch checkout, whose only difference from `b0eee18` is two `MODULE.rows/*.md` files. Sign-in went through `POST /api/platform/session/local`. The front-office setup was seeded by hand (`firm-seed.ts`): the copy did not seed it on start, and that is not this PR. The script and probes are in the reviewer's scratchpad (not committed), and every value is Sample. US$0.

## Journeys (persona · goal · result)
1. **Main, Owner (user-R): "these two are one person; merge them, then change my mind."**
   * Add Mira Sato, then the same email again: 409 `KNOWN_PERSON`, then **Add as new** → 201.
   * `GET duplicates/review`: the pair is there once, `score 100`, `[EMAIL]`, both lead numbers, `needsCaseSide false`, `openCount` right.
   * Preview with `survivorId`: six fields with both values and a pick, `moves` and `updatedAt`.
   * Merge with `familyName: LOSER` and a mixed-script reason → 200 `mergeRef`. The survivor holds the loser's family name, both leads moved, and the loser has `merged_into_id` set.
   * `?status=MERGED` and `GET merges` both list it. The audit line has ids only.
   * Undo → `{restored:true}`: both people are live, the lead is back, and the pair is OPEN again. **Held.**
2. **Keep separate, Case Officer (user-O): "two people share an email; they are not the same."** O's own two leads give a pair on O's list. Keep separate → 200, and it moves to the Kept separate tab. A second click → 409 "This pair was already decided." **Held** (the flag clearing is in the suite, BR-11).
3. **Empty, firm B (user-S):** list → `items: []`, `openCount 0`. The Merged tab is empty. **Held.**
4. **Wrong role and wrong firm:**
   * O previews → 403, naming `agent/prospect:merge`.
   * S merges firm A's pair → 404 "No such pair in your firm."
   * No session → 401 "Sign in first…".
   * Read-only staff → 403 on the list and on Keep separate (suite). **Held.**
5. **Errors:**
   * A survivor outside the pair → 422 on `survivorId`. A 501-character reason → 422, named. `status=bogus` → 422. An unknown merge id on Undo → 404. **Held.**
   * An unknown `choices` field → 400 "not a PERSON field" (no field named). `{"__proto__":"LOSER"}` → 200: it merged and dropped the input. **Minor** (review m1).
6. **Recovery, double click:** two Merge calls at once → 200 + 409 `DECIDED`, one merge record. Two Undos at once → 200 + 409 "This merge was already undone." **Held.**
7. **Case pair:** merge → 409 with "This person has a case; merge them from the client record." (suite, BR-7). **Held** when the case already exists. The breaker's race shows it failing when the case is opened mid-merge (review M3).
8. **Money on the loser (probe):** lead B has an invoice, and the Owner merges B into A → 200. The invoice still names tombstone B, and preview said nothing about it. **Fails** (review M6).
9. **Across the boundary:** the Merged tab → Undo (BR-10) works. Keep separate clears the lead's possible-match flag (BR-11, suite). The hand-off to FO-9s's screen can only be scored once it exists.

## Break-it pass (15 min, plus the breaker's report on the same commit)
* Mixed-script and long text: the reason took "…同一人物" fine, and 501 characters were refused.
* Hostile keys: `__proto__` (above).
* Two tabs and double clicks: held (journey 6).
* Wrong firm by URL: 404.
* My two probes:
  * **M1:** a draft retainer with no signer on the prospect is not counted as a DOCUMENT.
  * **M6:** money is left on the tombstone.
* The breaker's races and stale cases are agreed and restated in the review: M2 (stored reasons), M3 (check before lock), M4 (no stale-save check), M5 (Undo under a case).

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1 and 2 end to end, including Undo and the pair reopening |
| Next step obvious | ½ | `needsCaseSide`, `mergeRef` and `status` are returned. Preview's picks do not say why ("only value", "newer", BR-8), and `moves` has no "what stays" (BR-9) |
| Plain words | ½ | Refusals are plain, and BR-7's sentence is word for word. The unknown-field 400 is terse and names no field |
| Feedback and state | 1 | Tabs per status, `openCount`, automatic merges marked, the pair reopens after Undo |
| Correct data | ½ | Chosen values kept and leads moved. But money is left on the tombstone (M6), and a value nobody saw can be written (M4) |
| Error recovery | ½ | Double merge and double Undo are safe; a decided pair gives 409. No 409 for a stale preview (M4) |
| Accessibility and screen sizes | ½ | N/A (no screen). Scored ½ rather than 1, so a missing screen does not raise the score. RFC 9457 with field messages, except m1 |
| Speed | 1 | Every call 9-120 ms on the copy; no request per row |
| Visual quality | ½ | N/A (no screen), scored ½ on the same convention. Response shapes are consistent across the tabs |
| Trust and sources | 1 | Score and reasons on every pair; `automatic` and `by` on every merge; audit lines with no contact values |
| **Total** | **7 / 10** | **Below the pass mark (8)**, no criterion at 0 |

To reach 8 or more, most valuable first:
1. M6: preview shows what stays and the consent copies, and the merge refuses to leave money on a tombstone (raises Correct data and Next step).
2. M4: a stale-save 409 naming the changed fields (raises Error recovery and Correct data).
3. Picks say why (BR-8).
4. m1: an unknown `choices` field gets a named 422 (raises Plain words).

## Not tested
* No browser, keyboard, axe, widths or zoom: there is no screen.
* No real screen reader.
* No unaided walk by an intended user: D17 and D20 stay with the founder.
* The web form door: no form is enabled on the copy. The shared `arrive` path covers it by reading.
