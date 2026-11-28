# FO-9b part 2m: journey test, reviewer role (2026-11-25, head a22b7445c826ed6e65f7e672b83574c0fdb782b1)

Backend only: no page changes ("On the demo: nothing visible changes"). The journeys were walked at the API, as a person records money through the routes. I used the new suite's Nest app (scratch database; nothing on :4400), plus one probe of my own on the services. No browser, axe or width checks apply.

## Journeys (persona: staff who record client money; the Owner, and a narrower-scoped colleague)
1. **Main path:** the Owner records a trust deposit on a live client and gets 201 with a receipt. Held (suite line "a live party unchanged").
2. **Error:** the Owner starts a draft, records a payment, refunds, pays from trust or reverses on a person merged into another. Every writer answers 409 `PARTY_MERGED`: "This person was merged into another record, so no money is recorded on it. Use the record it was merged into. Nothing was saved." The answer gives `survivorId`. Held: all 12 writers, plus a company. The money tables and the audit count were unchanged after each.
3. **Recovery, the survivor:** the same deposit on the survivor gives 201. Held.
4. **Recovery, Undo:** after Undo clears the tombstone, a deposit and a payment on the person give 201. Held.
5. **Race:** a merge holds the person's row while a deposit, a draft create, a refund and a payee refund wait. Each waits, then answers 409 and writes nothing. Held in three runs. The lock is proven: with it removed, all four answered 201.
6. **Other way round:** while a money write is open, the merge's NOWAIT lock is refused (55P03). Held, at SQL level only (review m3).
7. **Another firm:** firm B's person id gives 404 on draft and deposit. Held.
8. **Wrong scope (break):** a colleague who does not see the merged-away person records a trust deposit on it. Expected 404, the same as a missing person. **Got 409 `PARTY_MERGED`**, which tells them the person exists and was merged (review M1, `trust/service.ts:172`). Draft create and trust request answer 404 correctly.
9. **Double click or retry (break):** a repeated deposit on the merged-away person. By reading the code, not run: `liveParty` runs before the replay check (`service.ts:172`), so every repeat answers 409 and writes nothing.
10. **Payee by id (break):** naming as payee a merged-away person the caller cannot see. By reading the code, not run: it answers 409, not as an unknown payee (review m1, Minor).

## Data underneath
After each refused write: `money_invoice`, lines, `money_payment`, trust entries, requests, credit notes, refunds, credit entries and money audit lines are unchanged. Issued count unchanged. Roles: the route guards are unchanged by this PR; the C5 scope gap is M1.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1–7: no money lands on a merged-away record, and the survivor works |
| Next step obvious | 1 | "Use the record it was merged into" plus `survivorId`; "Ask someone who sees…" when the survivor is hidden |
| Plain words | 1 | One sentence, says nothing was saved, no jargon |
| Feedback and state | 1 | 409 with a stable code; waits instead of failing during a merge |
| Correct data | ½ | Nothing written on refusal (verified counts), but scope is not enforced on deposit (journey 8) |
| Error recovery | 1 | Undo makes the person payable again; the survivor is payable |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | One indexed read per write; waits only while a merge holds the row; new suite 12 s |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | No AI, no model call; the survivor's id is shown only to a caller who sees it (except M1) |

**7.5 of 8 applicable (9.4 / 10 scaled): pass** (8 or more, no 0). To raise correct data to 1: fix M1 (move the deposit's check after the scope check) and add a route line where an unseen merged-away person gets 404.

## Not tested
A real screen reader and an intended user's own walk: there is no UI (D17 and D20 stay with the founder). The race against the real merge route (review m3).

## Round 2 (head 538a906e9e459e5fd15601945d524042caaa3cbc)
Journey 8 now holds. The route line: user-O, seeing no client, depositing on the merged-away person, gets 404; a trust request also gets 404. Nothing is written. Journey 10 is now covered by `liveParty`'s 404 for an unseen merged-away party. "Correct data" rises to 1: **8 of 8 applicable (10/10 scaled): pass.**
