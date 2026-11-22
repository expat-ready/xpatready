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

## Round 2 (diff 5f49018bf..872a2b8b5)

Method: a temporary harness copied from `tests/check_fo7b_refunds.ts` with about 90 more cases, run on scratch databases on 127.0.0.1:54329 (created, then dropped; the harness is deleted). The shipped check passes 24/24.

**R2-1: Minor. The cap ignores credit kept from the payment itself, so the database refuses instead (still a 409).** All of this goes through the API: an invoice of 100.00, a payment of 200.00, then one of 50.00, then Keep on the 50.00 (50.00 kept). A refund of 0.01 on the 50.00 gives 409 MONEY_RULE: "credit kept from a payment is never more than the payment less its refunds: reverse the kept credit first". It should be OVER_REFUND with `leftMinor` 0. The words still name the kept credit and its remedy. `leftToRefundMinor` for that payment would read 50.00 when nothing can be refunded. Cause: `own` at `refunds.ts:128` does not subtract `this.kept(p.id)`. With a seeded KEPT of 20.00 on a payment of 20.00 the result is the same.
**R2-2: Minor (F5 follow-up, for the Lead).** On the extra, the NOT_CLEARED rule can be bypassed by a plain refund. An uncleared CHEQUE of 120.00 on 100.00: both choices give 409 NOT_CLEARED, but `POST …/refunds {amountMinor:2000}` gives 201 and pays back the same 20.00, which has not arrived. The comment at `refunds.ts:64-66` says "a refund of it follows the same rule"; `refund()` (`refunds.ts:38-44`) has no check for `cleared`.
**R2-3: Minor.** Keep now accepts a `reason` and writes it to the audit line as `reason_after` (`refunds.ts:75`). Only `words()` checks it (`ports/client-money.ts:176`), never `money_text_ok`. So `{choice:"KEEP_AS_CREDIT", reason:"‮gnp.exe ​"}` gives 201 and stores the bidi and zero-width characters. The same reason on a Refund is refused with 422.
**R2-4: Minor.** A true retry after midnight is refused. A refund sent with no `refundedOn` stores today's date. The identical retry sent the next day (clock moved forward 24 h) then gives 409 KEY_USED, because `day()` fills in the new day before `replay()` compares (`refunds.ts:38-39`, `refunds.ts:107`).

**What held**
- **One key is one request.** A choice's key reused on `/refunds` with the same data gives 409 KEY_USED. So do another method, reference, `refundedOn` or reason, another payment, and the choice route with a plain refund's key. The same goes for a plain key with another amount, a missing reference, or no date against a stored date in the past. A true replay gives 200 with `replayed:true`, on both routes and with today's date sent explicitly. A reason with padding around it replays. Ten calls at once with one key across both routes wrote one row with no 500. Eight identical choices at once gave one 201 and seven 200s.
- **Firms.** Firm B sending firm A's key on A's payment gets 404. On B's own payment, the same key gives 201. That is by design: the unique index is (firm_id, idempotency_key), and a 409 there would cross the firm wall.
- **Uncleared cheque.** Refund and Keep both give 409 NOT_CLEARED. Once `cleared` is set to true by SQL, Refund gives 201 and Keep gives 201 for the 20.00.
- **Cap.** A seeded KEPT of 30.00 with a REVERSED of -10.00 (held 20.00): the cap was exactly the payment less the net held credit, with the boundary 201 and boundary+1 409. With several payments, refusals named `heldAsCreditMinor` and "reverse the kept credit first". The cap was never too low.
- **`refundedOn`.** Tomorrow, 1999-12-31, 2026-02-30, 2026-1-01, "", null and a number all give 422 at `refundedOn`. 2000-01-01 is accepted. With no date, today is stored.
- **Shape.** `foo` and `__proto__` (in both choices) give 422 naming the field. Keep with method, reference, `refundedOn` or a key gives 422 "Only a Refund takes this". A Refund missing method, reason or key gives 422 naming each one. A missing, lower-case or null `choice`, an array body, or `amountMinor` all give 422. Nothing was written.
- **`?dueDate`.** An unknown field, the date given twice, `dueDate[x]`, 2026-02-30, an empty value and `__proto__` all give 422, with nothing issued. A body `dueDate` is ignored (the firm default applies), and the query date is stored. A malformed id gives 404, or 422 if the query is also bad. Issuing twice gives 409; firm B gets 404. Never a 500.
- **Races and records.** Four rounds of 8 mixed Keep, Refund and refund calls across two payments: never a 500, and kept credit stayed at or below the amount paid over. Each refund has one `payment.refunded` audit line and one event; each Keep has one `extra_kept` line. A Case Officer gets 403.

Verdict: Approve on `872a2b8b5`. F1–F4 are fixed (F6 was not retested). F5 is fixed on the extra, but plain refunds bypass it (R2-2, for the Lead). R2-1 to R2-4 are Minor follow-ups.

## Round 3 (diff 872a2b8b5..d5cb7512b)

Method: a temporary copy of `tests/check_fo7b_refunds.ts` (psql path changed to `/usr/local/bin`), plus about 45 more cases on a scratch database on 127.0.0.1:54329. The database was dropped and the copy deleted afterwards. All 27 shipped cases pass in the copy.

**R3-1: Minor (comes from the R2-4 fix).** A refund was recorded with an explicit past date (`refundedOn: yesterday`). The same key sent again with no date now gives 200 `replayed` and the refund still carries yesterday's date. Round 2 recorded this case as a 409 that held. A missing date means "today", so this is a different request. It is the same on the choice route. Cause: `refunds.ts:124` skips the date check whenever no date is sent, and the audit line does not record whether the first request sent a date. Nothing is paid twice.

**What held**
- **R2-1, the cap.** Each case compared the app's `leftMinor` with a rolled-back direct `INSERT` into `money_refund`. The database accepted exactly `left` and refused `left`+1, and the app answered 409 OVER_REFUND at `left`+1. `left` was never MONEY_RULE and never negative. Cases tested:
  - two payments with Keep on one;
  - a part refund then a partial Keep of 20.00, plus a second payment kept;
  - a 50.00 KEPT then a REVERSED -20.00 by SQL, a refund of 20.00 after it, then a full reversal (130.00 left, and the extra waits again for exactly 30.00);
  - a KEPT seeded on each of two payments, one partly reversed;
  - a KEPT equal to the whole payment;
  - a credit note after Keep;
  - 12 refunds at once next to kept credit, and Keep racing two refunds (only 201 or 409 OVER_REFUND, never MONEY_RULE or a 500).
- **R2-3, Keep's reason.** RLO, LRI, a lone high or low surrogate, 201 characters, `""`, spaces only, zero-width characters only, a soft hyphen only, a Hangul filler, NUL, a number and `null` all give 422 with nothing kept and no audit line. Exactly 200 characters, non-English text and emoji give 201. Parity: Keep's reason and a plain refund's reason give the same answer for each of 8 strings. Seen, not in this diff: `money_text_ok` accepts ZWSP, BOM, a word joiner, ALM, LRM and tag characters when visible text sits around them. It does so on both routes, although the 422 wording says "no hidden ... characters".
- **R2-4, dates on retry.** A retry with no date, or with exactly the stored default date, gives 200 (`refunds.ts:124`). Another date gives 409 KEY_USED. With the clock moved 24 h forward: no date gives 200, the stored date gives 200, the new today gives 409, on both routes. A future date or one before 2000 on a retry still gives 422. One row per key.
- **Regressions.** The same key sent 8 times at once wrote one row with no 500. A Case Officer gets 403 and firm B gets 404, Keep with a reason included. An uncleared cheque gives 409 NOT_CLEARED, and trust gives 409 TRUST_EXTRA, before the reason is read. Audit lines and events still equal refunds, and `extra_kept` lines still equal Keeps.

Verdict: Approve on `d5cb7512b`. R2-1, R2-3 and R2-4 are fixed. R3-1 is a Minor follow-up.
