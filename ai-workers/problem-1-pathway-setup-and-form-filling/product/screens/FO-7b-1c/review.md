# Review: FO-7b part 1c (refunds of operating payments, and the choice on an extra), round 1

Independent reviewer (money row, P-278, P-423), Opus 5.5 at high effort, 22 Nov. **Commit reviewed: `5f49018bf62ef08e5e0cdccee260d5dd50770fc3`** on `claude/runtime-fo7b-1c` (draft PR #3036). Scope: `git diff bb83bcec7..5f49018bf`, which is 6 files and +417 lines. The prompt said 7 files, but the list it gave has 6 and the diff has 6.
Spec: `design/briefs/track-b/FO-7b-1c.md` (branch `lead-b/2026-11-22-track-b`), Lead B's comment 7077723592, and the builder's alignment comment 7077742708. Supporting sources: AG-6-23 and AG-6-21 (AG-06 v2.1); `money_refund_write` (FO-7a); `money_credit_entry_write`, `money_refund_credit_kept` and `money_credit_kept_holds` (FO-7ts); `money_trust_lock` (FO-7lk); part 1b's `record()` and `paymentView()`.
This row is API only, so there is no browser walk and no journey score (the coordinator's instruction).

**Branch switch.** For about 10 minutes the shared checkout was switched to part 1b's branch (builder's notice, about 10:45-10:55 UTC). So every result below was run again on a `git archive` copy of exactly 5f49018bf in `/tmp/fo7b1c-exact`. Results: the check passed 21/21 and the reviewer probes gave the same answers. The four source files I read are byte-identical to that commit (`cmp`). The checkout's HEAD is now `4e49b08b8`, which only adds the breaker's `break-report.md`.

## Runs
- `tsx studio/tests/check_fo7b_refunds.ts` gives **21 passed, 0 failed**, both on the shared checkout and on the exact-commit copy.
- `check_fo7lk_lock_order.ts` gives 16/0, and `check_pf12_walls.ts` gives 110/0.
- `tsc -p api/tsconfig.json --noEmit`: no errors in the new files. The errors it does report are older ones in other tests.
- Reviewer probes (P1-P8) run on a copy of the check under `/tmp`, on a scratch database on :54329 that was dropped afterwards. Results are cited below.
- CI on 5f49018bf: **`module-cards` failed** (see Minor 8). Most other jobs were skipped because the PR is a draft, so "full `ci` green" has not been shown yet.

## Blocker
None.

## Major
1. **A Refund choice whose idempotency key was already used by a plain refund answers as if the extra had been refunded. Nothing was refunded from the extra.** (`api/src/client-money/invoices/refunds.ts:60-63`)
   - Probe P4: an invoice of 100.00 and a payment of 120.00, so 20.00 is extra. `POST …/refunds {amountMinor: 500, key K, reason "Plain (Sample)"}` gives 201. Then `POST …/extra {choice: "REFUND", key K, same reason}` gives **201** `{choice: "REFUND", amountMinor: 500, waitingMinor: 1500}`.
   - So a money write reports a success that did not happen: the extra is still waiting. The breaker found the same thing independently (F1).
   - The brief's Done-when line says "the same idempotency key … with other data (409)". This earlier refund has other data: it was not taken from the extra, and it is not for the amount that was waiting.
   - Cause: the replay compares only `paymentId` and `reason`.
   - **Fix:** a choice replay is valid only when the stored refund was written by a choice. Check its audit line (`detail->>'fromExtra' = 'true'`), and compare method and reference too (see Minor 3). Anything else gives 409 KEY_USED. Add a failing case for this to the check.

## Minor
1. **An uncleared cheque's extra: Keep is refused, but Refund goes through** (`refunds.ts:43-46`, `66-71`).
   - Probe P1: a CHEQUE payment of 130.00 on an invoice of 100.00. Part 1b offers `REFUND, KEEP_AS_CREDIT`.
   - Keep gives 409 MONEY_RULE. That is right, and it is not a 500.
   - A Refund choice gives 201: 30.00 is paid back from a cheque that has not cleared. A plain refund of the same cheque is also allowed.
   - No source settles refunds of money that has not arrived, so this is not a request for a change. Put it to Lead B as "Question for the tech lead". The database refuses `KEPT` for the same reason ("credit is kept only from money that arrived").
2. **The database's refusal loses its reason and its remedy** (`refunds.ts:90`). The regex cuts everything from the first "(", so:
   - The cheque refusal (P1) reads "credit is kept only from money that arrived." It loses "(this cheque is not cleared yet)".
   - A refund after Keep (P2) reads "…must stay paid over by that much." It loses ": reverse the kept credit first".
   - Both still answer 409 and write nothing (P2: no refund row, no audit line, no event). That held.
   - Related: the OVER_REFUND precheck (`refunds.ts:44-45`) ignores kept credit, so its "left to refund" figure can be too high (the breaker's F4).
   - The check has no case that goes down the MONEY_RULE path at all. **Fix:** keep the database's text after the colon, and add the two P1/P2 cases.
3. **A replay ignores a changed method or reference** (`refunds.ts:40`, `62`).
   - Probe P3: the same key with method CASH and reference ZZZ999, after E_TRANSFER and AAA111, gives 200 `replayed: true`. The new method and reference are dropped without a word.
   - Both are stored in the refund's audit line. Part 1b's `record()` refuses a changed method (`money.ts:85`), and the brief's Done-when line says "with other data (409)".
4. **The two routes answer a replay differently** (`refund-routes.ts:18` vs `:21`, `refunds.ts:63`). `/refunds` answers 200 with `replayed: true`. `/extra` answers 201 with no replay flag, so a client cannot tell a replay from a new refund.
5. **Keep as credit with a reason is refused with 422** (`ports/client-money.ts:174`, a `strictObject` with no `reason`). The brief's shape is `{ choice, reason? }`. Either accept an optional reason for Keep (put it in the audit line), or say in the PR why it is refused.
6. **The departure from AG-6-23 r7 is now asserted as a pass** (`tests/check_fo7b_refunds.ts:142-143`).
   - The check asserts "Part paid with 30.00 due again". AG-6-23 r7 says a refund "does not make the invoice due again" (PARTIALLY_REFUNDED).
   - The departure is disclosed on the PR (comment 7077742708, point 2), and it follows the brief: facts.ts stays untouched and the status follows `invoiceStatus`.
   - But neither the row nor the check records a ruling, and the PR body still recommends following r7 (question 2). The Lead should rule on it in writing before the label.
   - Also a gap against AG-6-23 r2: an offline refund records amount, method and reference, but no date. A refund paid on an earlier day is dated the day it is entered.
7. **Check hygiene** (`tests/check_fo7b_refunds.ts`).
   - Every case is named "FO-7c …", and the scratch database is `xr_studio_fo7c_scratch_*` (line 29). FO-7c is the card row; this is FO-7b part 1c.
   - Left over from part 1b: unused imports and helpers (lines 19-25, 59-64, 102-116: `FakeClock`, `runContract`, the contracts, `MoneyDocuments`, `taxOf`, `stored`, `pdfText`, `auditN`, `events`).
   - Also left over: three cases that test no refund rule (lines 39-42 and 95-97).
   - The "one audit line per change" case (line 196) compares totals only. The per-refund count is checked once, at line 140.
8. **The PR body is out of date, and `module-cards` is red on CI.**
   - CI log: "module api-features: … `features/MODULE.md` not … put `Card unchanged: <reason>` in the PR body". Locally, `module-cards.py pr` on this diff gives the same FAIL for `client-money-refunds.ts`.
   - `features/MODULE.md` is not in the touch list, so the fix is a `Card unchanged:` line in the body. No code change is needed.
   - The body also still lists the old routes (`invoices/:id/payments/…`), an `amountMinor` on the choice, and "pending Lead B" cases. Rewrite it before the PR is made non-draft (P-683).

## What held
- **Lock order** (`refunds.ts:94-104`): the payment and invoice are read without a lock, then `money_trust_lock(firm, invoice party, currency)`, then the invoice row `FOR UPDATE`. This is the same as part 1b's `lock()`.
  - The database triggers then take the same advisory lock again (it is re-entrant) and touch only rows that are already locked. `check_fo7lk_lock_order` passes.
  - Two refunds at once, and Keep racing Refund at once: one wins and the other gets 409. Refunded plus kept never goes over the payment.
- **Idempotency** for a plain refund: a replay gives 200 with the same row, and a different amount gives 409 KEY_USED. The key is looked up under the lock. A P2002 on the key or on `refund_ordinal` maps to 409.
- **Over-refund:** 409 OVER_REFUND with `leftMinor`, and nothing written. The database's `money_refund_write` cap stands behind it.
- **Trust:** a payment received into trust is refused with the brief's words, "Money received into trust is refunded from the trust ledger" (TRUST_REFUND). The choice on its extra is refused (TRUST_EXTRA). Nothing is refunded or kept. This follows P-603.
- **The waiting extra** (`refunds.ts:111-120`): the `extraMinor` stored in the payment's one `payment.recorded` audit line, less net kept, less this payment's refunds, capped at `InvoiceView.extraMinor`.
  - That cap is net of all kept credit on the invoice (`facts.ts:37`).
  - Probe P6: after a plain refund of 10.00 out of a 30.00 extra, exactly 20.00 is kept.
  - Probe P7: with two payments on one invoice, when the other payment's extra was used up by a refund, the answer is NOTHING_WAITING.
- **A choice takes exactly what is waiting, once.** An amount sent gives 422. A second Keep or Refund gives 409 NOTHING_WAITING.
- **KEPT on the right holder:** the invoice's person or company and case, in the payment's currency, with `payment_id`. The database's holder check and overpaid cap agree.
- **Permissions:** a REFUND choice needs `agent/refund:create`. The service checks it, and the check proves it with the role's refund key removed (403 MISSING_PERMISSION). `/refunds` carries `agent/refund:create`, and Keep carries `agent/payment:record`. A Case Officer gets 403 (P8).
- **A database refusal is a 409, never a 500** (P1, P2).
- **Audit:** one audit line per refund (`payment.refunded`; it stores method, reference and reason) and one per Keep (`payment.extra_kept`), each with a `staff:<id>` actor. The outbox row `payment.refunded` is written last, and the payment row is never edited (BR-9).
- **Firm walls:** every query is scoped to the session's firm. Firm B gets 404 on both routes, and a malformed id gets 404. `check_pf12_walls` passes.
- **Input:** a hidden-character reason gives 422 at `reason` (`money_text_ok`), an unknown field gives 422, and method CARD gives 422 (`HandMethod`, so OFFLINE only).
- **Touch list:** the brief's six files only. `facts.ts`, `money.ts`, `drafts.ts` and `check_fo7b_invoices.ts` are untouched. `ports/client-money.ts` gets additive lines only (one `MONEY_EVENT` key and new shapes). The route registers in its own `features/client-money-refunds.ts` (P-214), and the row fragment is in `MODULE.rows/FO-7b-1c.md`.
- **Done-when lines:** each has a passing and a failing case, except where noted in Major 1 and Minor 3.
- **Readings** are labelled ("Unconfirmed: no accountant / no counsel", `refunds.ts:12` and the check's header). There are no personal names.

**Verdict: Block** on `5f49018bf62ef08e5e0cdccee260d5dd50770fc3`. To fix: Major 1 (a choice replay must have been written from the extra, otherwise 409, with a failing case). Minors 2, 3, 4, 7 and 8 are cheap to fix in the same round. Minors 1 and 6 go to Lead B as questions.
