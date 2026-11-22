# PF-30a journey test (reviewer, 21 Nov 2026), API only

Reviewed commit `62fe3273d8a5c81e81e4f550d8a0cabbe7592dfb`. The isolated copy on :4487 (`runtime_pf28`) runs behind the real guard (local sign-in) and the walled `xr_app` pool. There is no screen: the find box is PF-30s. So the browser steps (visible walk, Playwright replay, axe, widths, keyboard) are N/A. I walked each journey as HTTP calls, which is what PF-30s will send.

## Journeys (persona, goal, result)
1. **Main path.** The representative (R, sees all) types "Ann". It finds Anna Walk, Annabel Walk and Annika, each labelled "Lead L-…" with an opening URL. **Held.**
2. **Email.** R types `ANNA.WALK@EXAMPLE.COM` in any case. It finds Anna, with matched_on EMAIL. **Held.**
3. **Phone.** R types `4165550144`, `416-555-0144` and `(416) 555-0144`. All three find Anna by PHONE. **Held.**
4. **File number.** R types `p00003` and `P-0`. The first finds "P-00003 · Lucy Losthope" labelled Lost; the second finds the P-0000n list. **Held.**
5. **Misspelt name.** R types "Anabel Walk". The trigram match through FO-9a's definer function under `xr_app` finds Annabel. **Held.**
6. **Company.** R types "North". It finds Northwind Hush Holdings Ltd, opening its prospect. **Held.**
7. **Wrong role (own only).** The case manager (T, with "everyone sees all" off) types "Anna". Nothing from R is shown. **Held.** T types "Ann". **Failed:** T's own lead "Anneliese Mine" is missing. The 57 older "Ann…" people of other owners fill the 50-row cap before visibility is applied (review M1). "Anneliese" does find it.
8. **Other firm.** The solo owner (S, firm B) types "Ann", "North" and "P-00003". All return empty. **Held.**
9. **Errors.** Five inputs are refused cleanly:
   * `a` → 400 "Type 2 to 100 characters to search.";
   * 101 characters → 400;
   * `q=a&q=b` → 422 "q: This must be text.";
   * `view=mine` → 422, so the view toggle cannot filter (AG17-D6);
   * no token → 401.

   None of these echo the query.
10. **Load.** 1, 5, 10, 20 and 40 parallel requests ran with no partial answers. p50 was 89, 60, 112, 191 and 261 ms.

## Break-it pass
* "José" and "jose" both find José García.
* 100 × "é" gives 200 and empty; 101 gives 400.
* "🙂🙂", `%_` and `' or 1=1 --` return 200 and empty: no wildcard leak, no error.
* "李" (one character) gives 400, as the row's 2-character minimum says.
* None of the typed queries appear in `var/isolated-runtime_pf28/api.log`. It logs `route":"/api/platform/find"` only.

## Data underneath
* The finder only reads: no audit line, no write.
* Results match each user's own lists, except journey 7: T's lead list shows Anneliese and the find door does not.
* Firm A ids never appear in firm B answers.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Journeys 1-6 and 8 held; 7 fails at real data volume (M1) |
| Next step obvious | 1 | Every hit carries the page that opens it (`/front-office/leads/…`, `/prospects/…`) |
| Plain words | 1 | "Check the search / Type 2 to 100 characters to search.", "Some results could not be loaded" |
| Feedback and state | 1 | `partial` + the line when a finder is dropped (test :153-158); Lost, Won and Closed labelled |
| Correct data | ½ | Never shows a record the caller may not open; under-shows own and unassigned records (M1, m1) |
| Error recovery | 1 | 400/422/401 with field-named words, no echo |
| Accessibility and screen sizes | N/A | No screen (PF-30s) |
| Speed | 1 | 9-89 ms single, p50 261 ms at 40 parallel, under the 400 ms budget |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | `matched_on` says why each hit matched; no AI; Sample data only |

**Raw score: 7 of 8 applicable. Scaled to 10: 8.75.** No criterion is at 0. This passes by number, but the review holds it at **Changes** for M1.

The fixes that would raise the low criteria, most valuable first:
1. Apply visibility inside the capped queries (M1). This raises both task completed and correct data.
2. Apply the deactivated-owner-is-Unassigned mapping (m1).

## Could not test
* A browser walk, screen reader, widths and keyboard (no screen).
* An intended user's unaided walk (D17/D20 stay with the founder).
* A production-sized firm for the 400 ms budget.
