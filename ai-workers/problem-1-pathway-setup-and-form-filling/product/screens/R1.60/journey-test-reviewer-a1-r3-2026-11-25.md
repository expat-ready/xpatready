# R1.60 a1: journey test, round 3 (reviewer, 25 Nov 2026)

Head: `a2f21789b2d3d70825708c3837310a33b31d5b17`. This round looks only at the diff from round 2 (`cf13fc383`). The change is API only, so there is no screen and no browser walk.

How the journeys ran:
- through the builder's suite `tests/check_r160_deposit_prepare.ts` (47/0), plus FO-7ts (157/0) and FO-7a (122/0);
- a raw-SQL probe on a fully migrated scratch database;
- everything on :54329, never :4400.

Round 1's walled walk (`journey-test-reviewer-a1-2026-11-25.md`) is not affected: this diff changes only trigger branches that the app never reaches (delete, plus a version written on insert or update).

## Journeys (each: persona · goal · result)
1. **Representative, paper signing, firm on trust Yes** (main). One Prepared request, tax 13 %. **Held** (suite case 1).
2. **The same signing delivered again** (recovery, double click). Still one request, one audit line, one item. **Held** (case 2; the planted index-drop fails as expected).
3. **Firm not registered for tax** (alternate). `100000:0`. **Held** (`:266-272`).
4. **Someone deletes a Prepared request by raw SQL** (break it). Refused with "a deposit request of a signed retainer is never deleted; cancel it with a reason". The row is kept, and the same holds after a cancel. **Held** (`:238-239`, probe).
5. **Staff deletes or edits #3033's unsent request** (FO-7ts contract). It still deletes, and its version may still change. Every DW9 check passes. **Held** (`:240-242`; fo7ts log lines 39-44).
6. **Someone moves a Prepared request's version by raw SQL** (break it, new). **Accepted**: this is the one way a second deposit could later be prepared for that version. No app path does it. **Finding m11** (Minor).
7. **The operator rolls the migration back, then forward** (recovery). The function is byte-identical to fo7ts's. #3033 still saves, and the prepared row is kept. **Held** (`:279-289`).
8. **A listener fails** (error). The signature stands, and the held line says nothing retries it. **Held. The no-retry gap is named.**
9. **The representative opens Needs you** (the boundary). The item still has no words and no page. **Named gap** (FO-7s3 / PF-18n).

## Data underneath
- One request per version.
- The amounts are the signed row; the tax is stored apart.
- No `money_invoice` row is written.
- The demo reset and the orphan sweep never reach `money_trust_request`: it has no `workspace_id`.
- No cascade reaches it: every foreign key is RESTRICT.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 |
| Next step obvious | ½ | J9: the Needs you item has no words or page (named gap) |
| Plain words | 1 | The refusal names the way out: "cancel it with a reason" |
| Feedback and state | 1 | The request reads Prepared; the held line is honest (J8) |
| Correct data | 1 | J1-J5 and J7. m11 is reachable by raw SQL only |
| Error recovery | ½ | J2 and J7 hold; a held listener has no retry (J8) |
| Accessibility and screen sizes | N/A | API only |
| Speed | 1 | The delete branch adds one comparison; the suite runs in about 10 s |
| Visual quality | N/A | API only |
| Trust and sources | 1 | The actor is named; tax is Sample; "Unconfirmed: no counsel" is in the migration header |

**7 of 8 applicable, scaled to 8.75/10: pass**, with no criterion at 0.

Fixes that would raise the score, most valuable first:
1. Words and a page for the Needs you item.
2. A retry for a held listener.
3. (Data, m11) Hold a Prepared request's version in the database.

## Could not test
- A browser walk: there is no screen.
- A real screen reader.
- An intended user's unaided walk (D17, D20 stay with the founder).
- Real email: a1 sends none.
