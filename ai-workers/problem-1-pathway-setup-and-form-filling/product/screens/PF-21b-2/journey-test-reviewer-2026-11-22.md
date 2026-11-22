# PF-21b part 2: journey test, reviewer (22 Nov 2026)

Head **78861110ae7926c0d6cea7289112503c9012eae6**. This row has no screen (PF-21rs builds the console screens), so I walked the journeys on the API, the way a console screen will call it.
- Copy: an isolated copy `rv21b` on **:4431** (a runtime port; never :4400) with `PLATFORM_SYSTEM_IDENTITY=local PLATFORM_IDENTITY=local`. It was stopped afterwards and its database dropped.
- People: a Sample Platform Owner and a Sample Support person, inserted as `plat_system_staff` rows, plus the Sample firm's user-R.
- Replay: the row's suite (`tests/check_pf21b_holds.ts`, 47/47, run twice) is the automated version of these journeys.
- Script: kept in my scratchpad as `walk.sh`, not committed.

## Journeys (persona · goal · result)
1. **Main path.** Platform Owner: "Put a litigation hold on this case." POST a CASE hold with a reason → 201 with the full hold (`active: true`, `placedBy: staff:<id>`). The list filtered by firm and `state=active` shows it. The firm's Activity log has one line: "ExpatReady placed a legal hold on case …". **Held.**
2. **Alternate.** Platform Owner: "Hold Q1's records" and "hold every case note". A DATE_RANGE hold and a CATEGORY hold → 201 each. A French/Chinese/Arabic reason is stored exactly. **Held, with one finding:** `to: "2026-03-31"` is stored as 31 March 00:00 UTC, so the rest of 31 March is not held (review M3).
3. **Empty.** "Does Sample Solo have any holds?" → 200 `{"holds":[]}`. **Held.**
4. **Errors.** All refused, nothing placed:

   | Input | Answer |
   |---|---|
   | CASE scope without an id | 422 `fields.scope.id` |
   | A range that ends before it starts | 422 |
   | A date that is not a date | 422 `scope.from` |
   | An unknown firm | 404 `FIRM_NOT_FOUND` |
   | No reason | 400 `REASON_REQUIRED` |
   | A BEL character in the reason | 422 "Write the reason as ordinary text." |
   | A 501-character reason | 400 "Give a reason" (PF-4s's guard wording, not this row's) |
   | `state=bogus` | 422 |

   **Held.**
5. **Wrong role.** All refused, nothing changed: Support placing → 403 `MISSING_PERMISSION`; Support releasing → 403; firm token → 403 `FIRM_SESSION_REFUSED`. **Held.**
6. **Recovery (double click).** Two parallel identical placements → two active holds. This is the safe direction: the case stays held until both are released. **Held** (noted, not a finding).
7. **Release.** "Litigation settled": release → 200 with `active: false`, who and why. A second release → 409 "already released; nothing was changed". A bad id → 404. **Held.**
8. **Two tabs releasing at once** (suite): 200 + 409, exactly one release line. **Held.**
9. **Held delete** (suite, across the boundary to AUD-5): a firm deleter calling `KeepPeriods.check` gets HELD with the reason, and the row is kept. After the release it deletes. Firm B is never held by firm A's hold. A hold placed while a deleter is open waits for that deleter. **Held.**
10. **The firm reads its trail.** The firm's Activity log shows every hold line, but:
    - Who = "The system"; action words = none (the raw code under Advanced).
    - `changes` = [] (review M1).
    - The "ExpatReady's actions" filter (`ours=true`) gives 0 lines (review m2).

    **Partly.**

## Data underneath
- Each hold is one row with the values exactly as sent; `placed_at` and `released_at` are the database's time.
- One audit line per place and per release, on the held firm's trail, with actor `system:platform.register.legal-hold`, actor type SYSTEM and `staffId` in its detail.
- The seed gives `system/compliance:legal-hold` to `platform-owner` only.
- Roles are enforced on the server: the guard first, then the service. The database refuses inside a firm session.

## Break-it (15 min)
- A firmless xr_app connection can call the place and release definers directly. The real gate is `@SystemKeys`, the same model as PF-4s (review m4).
- A category outside the port's list, placed through the definer, is accepted by the database's pattern. It is harmless: no ask names it.
- A release with a null reason or a bare actor is refused by the trigger or the CHECK.
- The firm B session's read of firm A's holds is refused.
- I found no SQL injection path.

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J7: place, list and release work end to end as the Platform Owner |
| Next step obvious | ½ | The answers carry the full hold and clear 409/404 words; there is no screen yet to guide the next step |
| Plain words | ½ | Error words are plain; the firm's log says "The system" with no action words |
| Feedback and state | 1 | Every answer's status matches what happened; the `active` flag is accurate |
| Correct data | ½ | Rows are exact; the audit lines lack before/after and cut the reason to 200 characters (M1); a date-only `to` covers less than it says (M3); the list cap hides active holds (M2) |
| Error recovery | 1 | Field errors are named; 409 says nothing changed; a double click is safe |
| Accessibility and screen sizes | N/A | No screen in this row |
| Speed | 1 | 14-43 ms per call (walk timings) |
| Visual quality | N/A | No screen in this row |
| Trust and sources | ½ | "Unconfirmed: no counsel" and Sample labels are present; the firm sees "The system", not "ExpatReady staff" |

**6 of 8 applicable = 7.5/10. Not a pass (the bar is 8). No criterion is at 0.**
Fixes that would raise the low criteria, most valuable first:
1. M1: before/after on both lines, with the reason in full.
2. M3: refuse or normalise date-only ranges.
3. M2: filter `state` in SQL and show when the list is cut.
4. Register the two actions' words with `AuditActionNames` (m2).

**Could not test:** a real screen reader; widths and zoom (no screen); an intended user's unaided walk (D17/D20 stay with the founder); an RDS deploy (review B1).
