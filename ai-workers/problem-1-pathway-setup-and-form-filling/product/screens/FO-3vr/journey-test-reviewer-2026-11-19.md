# FO-3vr journey test (reviewer role): booking visibility (runtime, no screen)

PR #2308, head `74c6936e661c552604820d12f589654b18fc8e92`, 19 Nov 2026, Opus 5.5, effort high. This is the one journey score for this check.
**What changes for the method.** The row has no screen, so there is no browser walk. Section 2 (visible browser), axe, the 400/1024/1440 px widths and keyboard use do not apply. Each journey was run against `BookingService` with PF-0p's fakes, from scratch scripts kept in the session scratchpad (not in the repo). Each script used its own scratch database on 127.0.0.1:54329, with Sample rows, US$0 and live AI off, and dropped it at the end. The data underneath was read with psql.

## Journeys (persona, goal, expected result)
1. **Main path, own-only Case Officer** (everyone-sees-all on, the role copy without `view.all`): "show me my week's consultations". Expected: their own hosted bookings and the bookings on their own leads, nothing of a colleague's. **Held** (DW1, DW7: 3 of 150+).
2. **Host, alternate:** "I host a call on a colleague's lead". Expected: in the list and by id, with or without the list key. **Held** (DW2).
3. **Manager with view.all:** "show me everything". Expected: every booking of the firm. **Held** (DW1 pass, DW6 READ_ONLY).
4. **Assigner, empty or unassigned:** "show me what nobody owns". Expected: not-linked bookings, bookings on ownerless leads and prospects, and bookings whose owner has left. **Held** (DW4, DW5; probe B4 for a lead owner who left, B6 for an ownerless lead).
5. **Wrong role by id:** the own-only officer pastes a colleague's booking id into the get, attendance, reschedule and cancel routes. Expected: the one not-found, with nothing written. **Held** (probe B2: 404 ×3).
6. **Wrong filter:** `staff=<colleague>` from the own-only officer. Expected: only the bookings the officer may see. **Held** (probe B1). An upper-case id works (B1b). `' OR 1=1 --` is refused (B9).
7. **Recovery, reassignment between list and open** (AG-2-64 rule 7). Expected: visibility moves on the next read. **Held** (probe B3, B3b).
8. **Across the boundary, a host change** (AG-4-67 edge case). Expected: the old host loses the booking unless the record rule keeps it. **Held** (DW3).
9. **Firm wall:** firm B's booking, asked for by firm A. Expected: never listed, 404 by id. **Held** (DW6).
10. **Consistency sweep:** list, attendance-due and by-id give the same answer. Run for 7 viewers × 159 bookings on the PR's own data set: **0 mismatches**.

## Data underneath
For each journey I read the rows directly. A refused write leaves the booking's status, time and host unchanged (B2; the breaker also checked audit and events, `break-report.md` attempt 3). The record rule runs in SQL before the one `findMany` (DW7 spy).

## Break-it (15 min)
Tried: a hostile `staff=` value, an upper-case id, deactivating and reactivating an owner, moving a lead's owner back and forth, and a person whose prospect the viewer owns (rule 2c). All held.
Found:
- the check is flaky: about 1 run in 4 fails at the DW4 setup, 2 of 5 here (review M1);
- the module-card CI job is red (review B1);
- parts of the rule have no test (review m1).
The breaker's F1–F3 were not re-found as new issues; they are graded in the review.

## Score (each 0, ½ or 1; 2 criteria N/A for an API-only row, scaled)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1–10 hold; 17/17 on a good run, 11/11 probes, sweep 0 mismatches |
| Next step obvious | 1 | A refusal is the module's one not-found or 403. A visible booking keeps its full view (rule 5) |
| Plain words | 1 | `notInFirm("booking")`, the same message as for a missing id (AG-2-64 rule 4 e) |
| Feedback and state | 1 | A reassignment shows on the next read (B3) |
| Correct data | 1 | List, due and by-id agree. Firm walls hold. Nothing is written on a refused write |
| Error recovery | 1 | A bad `staff=` gives 400, never a 500, in the normal range |
| Accessibility and screen sizes | N/A | No screen |
| Speed | ½ | DW7 is fast, and the breaker timed 68–91 ms for 2,203 bookings. But the id list hits the parameter limit at about 32.7k visible due bookings (breaker F1; review m2) |
| Visual quality | N/A | No screen |
| Trust and sources | ½ | The rule cites AG-4-67 and AG-2-64 line by line. But the check's own evidence is flaky (M1), and the module-cards job is red on this head (B1) |

**Score: 7 of 8 applicable = 8.75, reported as 8.5/10.** No criterion at 0. **Pass by the journey bar**, but the review blocks on B1 and M1.
Fixes that would raise the low criteria, most valuable first:
1. Make the DW4 stage pick deterministic (`kind = 'ACTIVE' order by sort_order`).
2. Move the tests line to `MODULE.rows/FO-3vr.md` and fit the card in 40 lines.
3. Bound attendance-due, or send the id list in pieces.

**Not tested:** the walls under the `xr_app` role (every script runs as the table owner), a live HTTP guard (DW6 reads the route metadata), a real screen reader, and an intended user's unaided walk (D17/D20 stay with the founder).
