# FO-7q part 2 review: refund actions on a payment (branch claude/modest-heisenberg-7933f2, head 46c64d05d)

The reviewer is a fresh context that did not build this. Scope: `git diff origin/main...46c64d05d` (7 files, +126 −16). The contract is the BACKLOG row "FO-7q part 2" (line 1015). It is API only, with no screen, so concept elements, keyboard, 1024 px, 200 % zoom, menu words, the D1-D20 screen scores and BIC-01-20 are N/A. Retrofit mapping: none.

**Verdict:** Ship. No Blocker or Major. There are 3 Minor findings.

## What I ran
- `tests/check_fo7q_reads.ts`: **52 passed, 0 failed**. All 12 part 2 cases pass.
- `tests/check_fo7b_refunds.ts`: **29 passed, 0 failed**. The file is unchanged in the diff.
- `node product/tools/graph.mjs --check`: exit 0, G1 0, G2 0. The PR adds no route.
- **Mutation runs.** I ran a scratchpad copy of the suite with each rule removed, one at a time:

| Rule removed | Result | Named case that failed |
|---|---|---|
| M1: `!p.cleared` in `standing` | 1 fail | "uncleared" |
| M2: `TRUST` in `standing` | 1 fail | "trust" |
| M3: refund key on REFUND | 4 fail | including "key missing" |
| M4: `payment:record` on KEEP | 2 fail | including "keys" (Case Officer) |
| M5: refund key on REFUND_EXTRA | 2 fail | including "extra waiting" |
| M6: `waitingMinor > 0` → `>= 0` | 5 fail | including "nothing waiting" |
| M7: `refundableMinor > 0` → `>= 0` | 4 fail | including "nothing left" |
| M9: `refundableMinor` = payment amount | 2 fail | "nothing left", "route agrees" |
| M10: `waitingMinor` = stored extra (kept ignored) | 1 fail | "nothing waiting" |
| M8: the missing-extra guard | **0 fail** | none (see m2) |

- **Probes.** These used a probe copy of the suite on a scratch database, which was dropped afterwards. The repo is unchanged.

## Offered ⇒ the route takes it; withheld ⇒ the route refuses
- **`refund()`.** The route checks `agent/refund:create` on the route, then TRUST → 409, then `!cleared` → 409, then `amount > leftToRefund.left` → 409.
  - `standing()` (`invoices/refunds.ts:58-64`) returns refundable 0 for TRUST or uncleared. Otherwise it returns `leftToRefund(...).left`: the same function, on the same snapshot.
  - The database trigger cannot refuse what `left` allows. `money_refund_write` checks `refunded + amount ≤ payment`, and `left ≤ payment − refunds − kept`. `money_credit_kept_holds` is mirrored by the `heldAsCredit` branch.
- **`choose()`.** The order is: 403 for a Refund without the key (checked with `holdsKey` from the database, which is the same source as `ctx.keys`), then TRUST_EXTRA, then `waiting()`, which gives 404 when the stored extra is missing, then `waiting>0 && !cleared` → NOT_CLEARED, then `waiting<=0` → NOTHING_WAITING.
  - `standing` gives waiting 0 in each of the refused branches (TRUST, uncleared, extra missing), and `waiting()`'s own figure otherwise. So Keep and Refund the extra are offered exactly when `choose()` reaches its write.
- **Probe P1.** A CHEQUE of 1,300 on an invoice of 1,000:
  - Uncleared: row `0/0/[]`. `/extra` gives 409 NOT_CLEARED.
  - Cleared: row `1300/300/[REFUND, KEEP_AS_CREDIT, REFUND_EXTRA]`. `/extra` Keep gives 201.
  - After Keep: row `0/0/[]`. A refund of 1 is refused 409 OVER_REFUND with `leftMinor` 0. The kept credit pins the payment: FO-7b's rule, read here, not copied.
- **Probe P2.** A payment whose `payment.recorded` line is duplicated, so the stored extra is unreadable:
  - The detail still answers. The row shows `waitingMinor` 0 and offers only `[REFUND]`. `/extra` gives 404.
  - Refund stays correctly offered, because `refund()` never reads the stored extra.
- **The `row()`/`storedExtra()` extraction is behaviour-identical.**
  - `row()` holds the same SQL text that `lock()` had.
  - `lock()` still reads the row (no lock), then `money_trust_lock`, then the invoice `for update`. That is the same three statements in the same order as on main (FO-7lk).
  - `storedExtra()` returns null on exactly the old `notFound` condition (`length !== 1`, not a safe integer, or `< 0`), and `waiting()` maps null to `notFound("payment")`.
  - FO-7b's 29 cases pass.
- **The read path never writes or locks.**
  - `standing` calls only `row`, `storedExtra`, `waiting`, `leftToRefund`, `kept` and `refunded`, and `invoiceFacts`. None of these locks or writes. `money_invoice_credit` is `STABLE`.
  - Probe P3 used a proxied transaction that logs every query. For 20 payments it saw 200 statements, with no `for update`, no `money_trust_lock` and no insert or update.
  - The counts of audit_event, money_refund, money_credit_entry and module_event were the same before and after the reads (82/2/3/50).
  - The `READ_ONLY` audit port (`reads/payments.ts:63`) throws if anything ever calls it.
  - Both callers read under RepeatableRead, so the figures and the rows come from one snapshot.
- **Trust off.** `paymentRows` drops trust and no-invoice rows before `standing` runs (`payments.ts:49`). A zero refundable figure therefore never reveals a hidden trust payment.

## Findings
**Minor**
- **m1: about 10 queries per payment on the detail (an N+1; STANDARDS §5 "[M] … no N+1" is only partly met).**
  - Where: `reads/payments.ts:70-71` (one `standing` per row) and `invoices/refunds.ts:62`. `storedExtra` runs twice per cleared operating payment: once directly and once again inside `waiting()`. `invoiceFacts` and `refunded`/`kept` also run twice.
  - Measured (P3): 1 payment = 10 queries, 11 ms. 20 payments = 200 queries, 116-145 ms.
  - Failure scenario: an invoice paid in 100 instalments makes about 1,000 queries and takes about 0.6 s per detail open. The cost grows linearly and is unpaged.
  - This is bounded by one invoice and is the price of "read, not copied", so it is not Major.
  - Fix now: pass the extra already read into `waiting` (or give `waiting` an internal overload) so `storedExtra` runs once. Record the per-payment cost in the module row. A set-based `standing` for many payments is a later item if the tech lead wants one.
- **m2: the missing-stored-extra guard has no test.**
  - Where: `invoices/refunds.ts:62`, `=== null ? 0 :`. Mutation M8 removes it and all 52 cases still pass.
  - Failure scenario: a later edit drops the guard. Then any invoice holding a payment without exactly one `payment.recorded` line (one recorded before part 1b, a seeded or imported payment, or a future non-hand writer) makes `waiting()` throw `notFound("payment")` inside the detail's transaction. **The whole invoice detail answers 404.**
  - Fix: add a case that inserts a second `payment.recorded` line (with `firm_id`) for an over-payment. Assert that the detail answers `waitingMinor` 0 and `[REFUND]`, and that `/extra` gives 404 (probe P2 does exactly this).
- **m3: route agreement is asserted for only some withheld cases.**
  - "Uncleared" and "nothing left" call the route. "Trust", "key missing" and "nothing waiting" assert only the read (`tests/check_fo7q_reads.ts:204`, `:202`, `:219`).
  - Each of these still fails as named under mutation, so the row's done-when holds.
  - Failure scenario: `choose()` someday accepts a second Keep (for example a changed `waiting`), while the read keeps withholding. No part 2 case would catch the drift.
  - Fix: one `/extra` call after the Keep (expect 409 NOTHING_WAITING) and one `/refunds` call on `tPay` (expect 409 TRUST_REFUND).

## Journey test (reviewer, API only): 9.4 / 10, pass
I walked the journeys over HTTP and service calls. The full report is `journey-test-reviewer-2026-11-23-part2.md`. Scores:

| Criterion | Score |
|---|---|
| Task completed | 1 |
| Next step obvious | 1 |
| Plain words | 1 |
| Feedback and state | 1 |
| Correct data | 1 |
| Error recovery | 1 |
| Speed | ½ (m1) |
| Trust and sources | 1 |
| Accessibility and screen sizes | N/A, no screen |
| Visual quality | N/A, no screen |

That is 7.5 of the 8 that apply.

## Could not check
- No screen exists yet to render the actions. The words "Refund" and "Refund · Keep as credit" will be checked on the screen that renders them.
- The app's C5 scope is fail closed (ruling 3). So `GET …/payments/:id` over HTTP answers 404 in the app, and I read the one-payment view through a test "ALL" scope.
- D17 and D20 are simulated only.

Verdict: Approve on 46c64d05d
