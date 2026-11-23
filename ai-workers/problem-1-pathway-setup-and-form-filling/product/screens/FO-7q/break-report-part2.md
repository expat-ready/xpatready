# Break report: FO-7q part 2, refund actions on a payment (head 46c64d05d)

Commit broken: `46c64d05d351ea0b01b96a7959b7d4102af55784` (branch `claude/modest-heisenberg-7933f2`). API only, no screen. Scope: `git diff origin/main...46c64d05d`.
The promise under attack: an action is offered exactly when its route would take it, and withheld exactly when the route would refuse. It is never offered on a trust payment, on an uncleared cheque, or to someone without the key. The read path never writes or locks. `refund()` and `choose()` behave as before.

How I tested: a scratch script (not committed) with the setup of `tests/check_fo7q_reads.ts`: every migration, a Nest app with PF-4's guard, PF-12's walls, and FO-7b's invoices, reads and refunds features. Database `xr_studio_fo7q2_break_<pid>` on :54329, dropped afterwards.
- All reads went over HTTP through the shipped wiring (`features/client-money-reads.ts`, PgMoneyVisibility). To make case-less invoices visible, I seeded a prospect for the person.
- The PR's own test, `tests/check_fo7q_reads.ts`, passes: 52 passed, 0 failed.
- For each payment state, I compared the detail's payment row with `GET …/payments/:id`. Then I posted to the routes: `refundableMinor + 1` (must be refused) and exactly `refundableMinor` (must be 201), plus Keep and Refund-the-extra.
- 34 attacks; 32 held.

Paths below are under `prototype/studio/api/src/client-money/`.

## Findings

**m1, Minor: the invoice detail now costs 10 sequential SQL statements per payment. The time grows with the number of payments, and at about 750 payments the detail gives a 500.**
What I did: one invoice, n payments of 1.00 each recorded through the route. I timed the detail over HTTP and, in-process, `paymentRows` against `withPaymentActions`, with a proxy counting statements on `tx`.
Expected: the detail stays about as fast as before the change (STANDARDS §9 "no request per row"; AG-6-30's 300 ms example). In every case it answers.
Actual:

| payments | `paymentRows` | `withPaymentActions` | statements | HTTP detail |
|---|---|---|---|---|
| 1 | 3 ms | 13 ms | 10 | 29 ms |
| 10 | 1 ms | 62 ms | 100 | 98 ms |
| 50 | 1 ms | 331 ms | 500 | 344 ms |
| 200 | 4 ms | 1,069 ms | 2,000 | 1,330 ms |
| 600 | | | | **500 "Internal server error" after 5,034 ms** |

The 500 at 600 payments is Prisma's default 5 s timeout for an interactive transaction: `reads/invoices.ts:135` sets no `timeout`. The one-payment read stays at 10-20 ms.
Why: `reads/payments.ts:70-71` calls `refunds.standing` once per row, in sequence. `standing` (`invoices/refunds.ts:58-64`) does the following for every payment:
- re-reads the payment row;
- reads the audit line twice (`storedExtra`, then again inside `waiting`);
- reads `invoiceFacts` for the same invoice (2 statements, and 2 more when credit is kept);
- reads `kept` and `refunded` twice (once in `waiting`, once in `leftToRefund`).

Severity: Minor. An invoice with tens of payments is rare in this domain, and the read stays correct, consistent and lock-free at every size I tried. The fail mode at the top end is an opaque 500, though, and the cost is roughly 6.5 ms per payment on a local database (more with network latency).
Possible remedies, not fixed here: read the invoice's facts and its kept credit once per detail, read the audit line once per payment, or set an explicit transaction timeout.

## What held (each checked against the route, to the cent)
1. **Kept from this payment, then refund the rest.** Setup: 13.00 paid on a 10.00 invoice.
   - Before the choice: detail and one-payment read agree: refundable 1300, waiting 300, `[REFUND, KEEP_AS_CREDIT, REFUND_EXTRA]`.
   - After Keep (201): refundable 0, actions `[]`; the route refuses 1 cent with 409 OVER_REFUND ("reverse the kept credit first").
   - After a 4.00 credit note: refundable 400, `[REFUND]`; the route refuses 401 (409) and takes 400 (201). Afterwards 0, and 1 cent is refused.
2. **Credit kept from another payment on the same invoice (heldAsCredit > 0).** Setup: p1 6.00 and p2 7.00 on 10.00; p2's 3.00 kept.
   - p1: refundable 0, and the route refuses.
   - After a 2.50 credit note: p1 refundable 250; the route refuses 251 and takes 250. Then p2 is 0, and the route refuses.
3. **Cheque that clears afterwards / overpayment by cheque.** Setup: an uncleared CHEQUE of 12.50 on 10.00.
   - Uncleared: refundable 0, waiting 0, actions `[]`. Refund, Keep and Refund-extra all answer 409 NOT_CLEARED.
   - Ticked cleared (SQL): 1250 / 250 / all three.
4. **Partly refunded extra.** Setup: a plain refund of 1.00 on the cleared cheque.
   - Waiting 150, refundable 1150, all three offered.
   - Refund-extra takes exactly 150 (201). After it, Keep and Refund-extra are withheld and Keep answers 409.
   - The remaining refundable is 1000: the route refuses 1001 and takes 1000.
5. **Audit line missing (deleted with triggers off) or duplicated.** Waiting 0, so Keep and Refund-extra are withheld, and the route answers 404 for both. REFUND is still offered at 1300, and the route takes 1300 (201) and refuses 1301.
6. **Another firm, scope and keys.**
   - Firm B's payment: 404 on the detail, the one-payment read and both routes.
   - A Case Officer sees the payment with `allowedActions: []`; both routes answer 403.
   - A Case Manager (`invoice:show` only) gets `[]`.
   - With `agent/payment:record` granted but not `agent/refund:create`: only `[KEEP_AS_CREDIT]`. Refund and Refund-extra answer 403 MISSING_PERMISSION; Keep answers 201.
7. **Trust off, then on.**
   - An operating payment's figures and actions are identical with trust off and on.
   - A TRUST payment shows `[]` with 0/0; the routes answer 409 TRUST_REFUND and TRUST_EXTRA.
   - With trust answered No while trust money is held, the row is still answered (trust shows while money is held, an earlier rule), still with `[]`.
8. **USD.** 55.55 on 50.00: 5555 / 555 / all three. Refund-extra takes USD 5.55; the remaining 5000 is taken exactly and 5001 is refused.
9. **Read only.**
   - Five reads of detail and one-payment leave the counts of `audit_event`, `module_event`, `money_refund` and `money_credit_entry` unchanged.
   - `standing` runs inside `SET TRANSACTION READ ONLY`.
   - While another session held the party trust lock, the invoice row and the payment row `FOR UPDATE`, plus an uncommitted refund (3 s), four parallel reads answered in 74 ms with the pre-write figures (refundable 1300): no lock wait and no deadlock.
   - A refund route call queued behind the held locks then got 201, and the reads after the commit showed 1150 / 150.
10. **Race.** Two simultaneous refunds of the whole offered amount: one 201, one 409 OVER_REFUND.
11. **refund() and choose() unchanged.**
    - `row()` is `lock()`'s old query verbatim, and `lock()` still takes the trust lock and then the invoice row.
    - `storedExtra()` returns null under exactly the old 404 conditions: not exactly one line, an unsafe integer, or a negative value.
    - Refund-extra replay gives 201 and then 200 `replayed`, same 300.
    - A bad or unknown id gives 404 on both routes. An upper-case id is answered by the one-payment read with the same actions.
    - The payments list carries no actions.

Verdict: Approve on 46c64d05d
