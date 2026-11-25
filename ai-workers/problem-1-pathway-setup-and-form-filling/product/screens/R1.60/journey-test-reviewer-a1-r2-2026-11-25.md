# R1.60 a1: journey test, round 2 (reviewer, 25 Nov 2026)

Head: `cf13fc383088b6bdca25d047a103b5fc8d6549b8`. This round looks only at the diff from round 1 (`bd28f653a`), and the change is still API only. There is no screen, so no browser walk.

How the journeys ran:
- through the builder's suite `tests/check_r160_deposit_prepare.ts` (47/0);
- on scratch databases on :54329, never :4400;
- the data was read underneath with psql.

Round 1's walled walk, as `xr_app` on both signing paths (`journey-test-reviewer-a1-2026-11-25.md`), is not affected by this diff: the listener's insert is unchanged except for the size check.

## Journeys (each: persona · goal · result)
1. **Representative, paper signing, firm on trust Yes** (main). One Prepared request, tax 13 %. **Held** (suite case 1).
2. **Firm not registered for tax** (alternate, new). The deposit row is prepared with 0 estimated tax: `100000:0`. **Held** (`:266-272`).
3. **A very large deposit row** (break it, new). 21,474,836.47 plus 13 % is past one request, so nothing is prepared and one "with the estimated tax" not-prepared line is written. 19,000,000.00 plus 2,470,000.00 is prepared. **Held** (`:244-249`).
4. **A malformed signed payload** (error, new). It is held in its savepoint, with one held line, and the transaction commits. **Held** (`:260-264`). This covers a bad version id only; review r2 m9 covers the rest.
5. **Someone deletes a Prepared request, or moves its version, or writes a version on a staff request, by raw SQL** (break it, new). All three are refused by the database. #3033's unsent request with no version still deletes. **Held** (`:238-243`).
6. **The operator rolls the migration back, then forward** (recovery, new). The columns are gone and fo7ts's function is back as a definer owned by `xr_wall_reader`. #3033 still saves. The Prepared row is kept, and the migration applies again. **Held** (`:279-289`). I also diffed the function body: byte-identical.
7. **A listener fails** (error). The signature stands. The held line now says plainly that nothing retries it. **Held. The recovery gap is open and named** (no retry).
8. **The representative opens Needs you** (the boundary). The item still has no words and no page. **Named gap** (FO-7s3 / PF-18n).
9. **FO-7ts's own database rules** (regression). `check_fo7ts_money_settings.ts` crashes at DW9 `:249`, because the new insert guard refuses its sent-with-version setup. With DW9 cut out, the other 151 of 157 pass. **Finding: review r2 M2.** No app path is refused.

## Data underneath
- One request per version.
- The amounts are the signed row; the tax is stored apart and is 0 when the firm is not registered.
- No `money_invoice` row is written.
- After rollback and forward, the request row and its version are kept.
- `prosecdef`, the owner and the `search_path` match fo7ts.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 |
| Next step obvious | ½ | J8: the Needs you item has no words or page (named gap) |
| Plain words | 1 | "No deposit request prepared: … its amount with the estimated tax is more than one request can hold. Bill it by hand." |
| Feedback and state | 1 | The request reads Prepared; the held line is honest about recovery (J7) |
| Correct data | 1 | J1-J6. App data is correct; M2 is a sibling suite's contract, not wrong data |
| Error recovery | ½ | J4 and J6 improved, but a held listener has no retry (J7) |
| Accessibility and screen sizes | N/A | API only |
| Speed | 1 | One extra comparison; the suite runs in about 10 s |
| Visual quality | N/A | API only |
| Trust and sources | 1 | The actor is named; tax is Sample; "Unconfirmed: no counsel" is kept in the migration header |

**7 of 8 applicable, scaled to 8.75/10: pass**, with no criterion at 0.

Fixes that would raise the score, most valuable first:
1. Words and a page for the Needs you item.
2. A retry for a held listener.

The fix needed before merge is M2, the FO-7ts DW9 suite. It does not change the score.

## Could not test
- A browser walk: there is no screen.
- A real screen reader.
- An intended user's unaided walk (D17, D20 stay with the founder).
- Real email: a1 sends none.
