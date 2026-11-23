# FO-7q part 2 journey test: reviewer, 23 Nov 2026 (head 46c64d05d)

This row is API only (refund actions on a payment), so there are no pages to walk in a browser. I walked each journey as a screen would call it:
- HTTP calls through PF-4's guard to FO-7b's `/refunds` and `/extra` routes;
- the invoice detail and the one-payment read through a test "ALL" scope (the app's C5 scope is fail closed, ruling 3).

The test bed was a probe copy of `tests/check_fo7q_reads.ts` in the scratchpad, on a scratch database (every migration and the sample firms), on a random local port. It never used :4400. The scratch database was dropped afterwards, and nothing in the repo was changed.

## Journeys (persona · goal · result)
1. **Owner: "refund part of this cash payment"** (main path).
   - The detail row shows refundable CAD 10.00 and `[REFUND]`.
   - POST `/refunds` for 1.00 gives 201.
   - The one-payment read then shows 9.00 left, with Refund still offered. **Held.**
2. **Owner: "the client paid 3.00 too much; keep it as credit".**
   - The row shows waiting 300 and `[REFUND, KEEP_AS_CREDIT, REFUND_EXTRA]`.
   - Keep gives 201.
   - Afterwards the row shows waiting 0, and no choice is offered. **Held.**
3. **Billing person without the refund key.** The over-payment offers only `[KEEP_AS_CREDIT]`. The cash payment offers no Refund. **Held.**
4. **Case Officer (wrong role).** The row has amounts but `allowedActions: []`. **Held.**
5. **Cheque not yet cleared (error).**
   - For 400 on 1,000 and for 1,300 on 1,000, the row shows `0/0/[]`.
   - `/refunds` gives 409 NOT_CLEARED, and `/extra` gives 409 NOT_CLEARED.
   - Once cleared, the row offers all three actions, and Keep gives 201. **Held.**
6. **Money received into trust (trust Yes).** The row shows refundable 0 and no action. With trust off, the row is not answered at all. **Held.**
7. **Fully refunded payment.** The row shows refundable 0 and no Refund. `/refunds` for 1 gives 409 OVER_REFUND. **Held.**
8. **Kept credit pins the payment (boundary to FO-7t).** After Keep on the 1,300 cheque, the row shows refundable 0. `/refunds` for 1 gives 409 OVER_REFUND with `leftMinor` 0, and its words say to reverse the kept credit first. **Held.**
9. **Stored extra unreadable (recovery).**
   - The payment's audit line is duplicated, so the stored extra cannot be read.
   - The detail still answers, with waiting 0 and only `[REFUND]` offered. `/extra` gives 404.
   - This holds, but no test asserts it (review m2).
10. **Repeat or reload.** Reads are idempotent. The counts of audit, refund, credit and outbox rows were the same before and after every read (82/2/3/50). The read path took no lock (probe P3). **Held.**

## Break-it
- 20 payments on one invoice make 200 queries per detail and take 116-145 ms. The cost grows linearly (review m1, **Minor**).
- With the missing-extra guard removed, the whole detail would 404, and no test catches it (review m2, **Minor**).
- A stale offer after another person's change: the route refuses with 409 and the words "Nothing was refunded/changed". Acceptable for a read.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 2 and 5: an offered action is taken by its route. |
| Next step obvious | 1 | Each withheld action is refused by its route (journeys 5, 7, 8 and 9). |
| Plain words | 1 | No new words. The codes map to the row's "Refund" and "Refund · Keep as credit", and the refusals keep refunds.ts's worded 409s. |
| Feedback and state | 1 | `refundableMinor` and `waitingMinor` appear with each payment, each in its payment's currency. |
| Correct data | 1 | Figures equal what the route accepts; 1 more is refused (journey 8). |
| Error recovery | 1 | Journey 9 gives no 404 on the detail; stale offers are refused with words. |
| Speed | ½ | 10 queries per payment (m1). |
| Trust and sources | 1 | Trust payments offer nothing; with trust off, rows are not answered. |
| Accessibility and screen sizes | N/A | No screen. |
| Visual quality | N/A | No screen. |

**Score: 7.5 of the 8 that apply, which scales to 9.4 / 10. Pass** (8 or more, and no criterion at 0). To raise speed: run `storedExtra` once per payment, and later read the standing set-based (m1).

## Could not test
- A real screen reader, and an intended user's unaided walk. D17 and D20 stay with the founder.
- The screen that renders these actions does not exist yet.
