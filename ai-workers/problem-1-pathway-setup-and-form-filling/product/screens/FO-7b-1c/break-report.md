# FO-7b part 1c: break report, round 1

Target: commit `5f49018bf` on `claude/runtime-fo7b-1c` (draft PR #3036). Scope: `git diff bb83bcec7..5f49018bf`, against brief `design/briefs/track-b/FO-7b-1c.md` (branch `lead-b/2026-11-22-track-b`). Out of scope, so not findings: card refunds, refunds from trust, refunds of credit, the "Refund issued" email, and a part refund making money due again.
Method: copied `tests/check_fo7b_refunds.ts` to a temporary harness with 60 more cases, on a scratch database on 127.0.0.1:54329 (every migration applied; dropped at the end). The harness file has been deleted. The shipped check passes 21/21. With the attacks added, 82 cases pass and 1 fails.

## Findings

**F1: Major. A plain refund's idempotency key, reused as a Refund-choice key, is answered as if the extra were refunded, but nothing was.**
- Steps: an invoice of 100.00 with a payment of 130.00, so the extra is 30.00. `POST …/refunds {amountMinor:1000, key K, reason "Same"}` returns 201. Then `POST …/extra {choice:"REFUND", key K, reason "Same", method CASH}`.
- Expected: 409 KEY_USED. The earlier refund has other data: it was a plain refund, not from the extra, and for 10.00, not the 20.00 still waiting. The brief says the same key with other data is a 409.
- Actual: 201 with `{choice:"REFUND", amountMinor:1000, refundId:<the plain refund>}`. No refund of the extra was written, and the response's own `waitingMinor` still reads 2000. Someone who retries, or a screen that reuses keys, is told the extra went back when it is still waiting.
- Cause: the choice's replay compares only `paymentId` and `reason`. It never checks that the stored refund was written from the extra (its audit line's `fromExtra`). File: `api/src/client-money/invoices/refunds.ts:62-63`.
- The reverse also replays. A Refund choice's key, sent to `/refunds` with the same amount and reason, answers 200 `replayed:true`. That is the same money, so it is Minor at most (`refunds.ts:40`).

**F2: Minor. A replay ignores a changed method or reference.**
- Steps: a Refund choice with key K and method CASH, then the same key with method WIRE and reference "different".
- Expected: 409 KEY_USED. Method and reference are data of the refund, and they are stored in its audit line.
- Actual: 201, the first refund answered again; the new method and reference are dropped without a word. `/refunds` does the same: it compares only amount and reason. Files: `refunds.ts:40` and `refunds.ts:62`.

**F3: Minor. A replayed Refund choice answers 201 with no `replayed` flag.**
- Steps: eight identical Refund choices at once, same key.
- Actual: eight 201s and one refund row. The money is right, but a client cannot tell a replay from a new refund. `/refunds` answers a replay with 200 and `replayed:true`, so the two routes disagree. Files: `refund-routes.ts:21` and `refunds.ts:63`.

**F4: Minor. The database's refusal loses its remedy, and "left to refund" ignores kept credit.**
- Steps: a payment of 150.00 on 100.00, a refund of 30.00, then Keep of 20.00, then a refund of 100.00 (or 120.00).
- Actual: 409 MONEY_RULE, "…20.00 of what was paid on this invoice is held as credit, so the invoice must stay paid over by that much. Nothing was changed." This is the right answer, never a 500. But the regex strips everything from the first "(", which cuts the database's own remedy, "(now …): reverse the kept credit first" (`refunds.ts:90`).
- Also: the OVER_REFUND precheck (`refunds.ts:44`) offers "CAD 120.00 left to refund" when 0.00 can actually be refunded while the credit is kept.

**F5: Minor (question for the Lead). The choice offers Refund on an uncleared cheque's extra, while Keep is refused.**
- Steps: a CHEQUE payment of 120.00 on 100.00 (not cleared), then Keep, then Refund.
- Actual: Keep gives 409 "credit is kept only from money that arrived", which is correct. A Refund choice on the same extra gives 201 and pays back 20.00 of money that has not arrived (the cheque could still bounce).
- The brief does not settle refunds of uncleared money, so this is raised as a question for the Lead, not a request for changes. File: `refunds.ts:66-70`.

**F6: Minor. A payment with no receipt is handled differently by the two routes (reachable only by seeding SQL).**
- Steps: a payment inserted by SQL on an invoice, with no receipt and no `payment.recorded` audit line.
- Actual: a refund gives 201, with the audit summary "…from the payment with receipt null." Keep gives 404 (`refunds.ts:105` and `refunds.ts:128`). The UI and API cannot reach this state.

## What held
- **Concurrency.** 20 and then 60 refunds of 6.00 at once on a 100.00 payment: 16 got 201 and the rest got 409 OVER_REFUND. Nothing went over the payment, and there was no 500, 40P01 or 40001.
- **Refund racing a choice.** A refund, a Refund choice and Keep at once: the total refunded plus kept never went over the payment.
- **Keep racing Refund.** 10 Keep and 10 Refund choices at once: exactly one 201, and the extra was taken once.
- **Races on one invoice.** Six rounds, each a Keep, a Refund choice, a refund, a credit note, a 1b payment, a second Keep and a second refund at once on one invoice: never a 500. The invoice's extra stayed at or above zero, and kept credit never exceeded the amount paid over.
- **Same key at once.** Eight refunds with one key wrote one row.
- **Arithmetic: part refund.** After a part refund of 30.00 on a 150.00-on-100.00 payment, Keep took exactly 20.00.
- **Arithmetic: credit note.** A credit note on a 120.00-on-100.00 invoice: Keep took the stored 20.00, not the larger amount now paid over.
- **Arithmetic: second payment.** With a second overpaying payment, 50.00 was kept from one and 30.00 refunded from the other. The invoice extra ended at 0, and a third choice was refused.
- **Arithmetic: seeded credit.** A KEPT entry then REVERSED: the extra waited again and was taken exactly once. A KEPT of 15.00 seeded on a 40.00 extra: the Refund choice took exactly 25.00.
- **Arithmetic: waiting never negative.** `waitingMinor` was never below zero.
- **Database refusals.** Keep on an uncleared cheque's extra, and Keep after the overpay was refunded on another payment, both came back as 409 in words.
- **Trust.** For a payment into trust, the refund (TRUST_REFUND), the Refund choice and Keep were all refused with 409. The trust check runs on `receivedInto` before any balance is read, so a party below zero cannot change the answer (checked by reading the code, `refunds.ts:43` and `refunds.ts:66`; no below-zero balance was seeded).
- **Idempotency.** The same key on another payment gives 409 KEY_USED. In firm B, firm A's payment gives 404.
- **Inputs, refused with 422.** Floats, strings, 2^53, MINOR_MAX+1, 0, negatives, unknown keys, `__proto__`, bidi characters in the reason or the reference, lone surrogates (both escaped and raw JSON), 201 characters, only zero-width characters, only spaces, method CARD, `route`, a short or non-ASCII key, `amountMinor` on either choice, a reason on Keep, a lower-case choice, and an array.
- **Inputs, other.** A body of `null` or a bare string gets 400. Malformed ids, SQL-like ids and NUL ids get 404. An upper-case id is accepted. A non-English reason is stored.
- **Permissions and walls.** No session: 401. A Case Officer (user-O): 403 on all three calls. Firm B: 404. A payment on no invoice: 404 from both routes, with nothing written.
- **Audit and events.** 61 refunds, 61 `payment.refunded` audit lines and 61 events. 14 Keeps and 14 `payment.extra_kept` lines. Refused calls wrote nothing. The outbox row is written last (`refunds.ts:131`).

Verdict: Changes on `5f49018bf`. F1 must be fixed: a reused key must not report the extra as refunded. F2–F6 are Minor; F5 is a question for the Lead.
