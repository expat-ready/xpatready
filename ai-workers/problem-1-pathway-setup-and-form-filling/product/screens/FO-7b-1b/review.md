# Review: FO-7b part 1b (issue, PDF, receipts, offline payments, credit notes; R1.56, R1.60)

Independent reviewer (money row, P-608), fresh Opus, 22 Nov. **Commit reviewed: `d6948072ee713669f29a979fc9b812620ba57077`** on `claude/sleepy-archimedes-3a0op2` (`git diff origin/main..d6948072e`, 14 files, +747 −26). Spec, read in this order: `briefs/track-b/FO-7b-1b.md`, Lead B `FO-7b.md` amendments 1, 3, 6, 8, 10, Build Lead C `FO-7b.md` / `FO-7b-1a.md`, the AG-06 cards (AG-6-1, -19, -21, -46, -48, -63, -69 r4-5, -71), and the FO-7 migrations' functions.
**No screen.** Screen-review checks (2), (3) and (7), D1-D20 and the BIC table are N/A. There is no browser walk and **no journey score**.
While I worked, the builder committed `efb471b50` (fixes for break-report F1-F4, F6, F7) into the same checkout. I have not reviewed it. Every result below comes from an exact `git archive` copy of d6948072e unless the line says otherwise.

## Blocker
None.

## Major
1. **CI goes red: the port-contract check fails.** On the exact copy, `node studio/tools/check-port-contracts.mjs` exits 1. On `origin/main` it exits 0. ci.yml:328-335 runs it.
   * "ClientMoneyPort (ports/client-money.ts) has a real adapter (ClientMoney) and no contract".
   * "real adapter MoneyDocuments (api/src/client-money/invoices/documents.ts) runs no contract".
   * The row brief asks for "ClientMoneyPort … with its fake and contract", and the part brief's Done-when says "full `ci` green".
   * **Fix:** add `ports/contracts/client-money-port.contract.ts`, then run it for `ClientMoney` and `fakeClientMoney`. Add `runContract(documentRenderPortContract, "MoneyDocuments", …)` in `check_fo7b_invoices.ts`. The contract file is outside the touch list, so ask Lead B on the PR first.
2. **CI goes red: a static sweep fails.** `check_pf19r_every_sender.ts` gives 20 passed, 1 failed: "client-money/invoices/money.ts: {"mailSend":1,"anySend":1} send call(s) not in the table: route it through MessagePort and classify it". The call is `money.ts:237`. `static-sweeps.mjs --base origin/main` reports the same failure (ci.yml:288-296). **Fix:** classify the sender in the suite's table, through MessagePort, with `MAIL_PORT` bound to MESSAGES_MAIL in the app. Or ask, because the suite file is outside the touch list.
3. **Money received into trust is refused for a party below zero.** This confirms breaker F1.
   * Probe: a 100.00 WIRE deposit, applied to an invoice and then reversed as RETURNED, leaves the balance at −100.00. Next, 100.00 received into TRUST on a second invoice gets **409 MONEY_RULE** "Only CAD 0.00 is available", and no payment is stored.
   * Cause: `money.ts:95` sets `applied = min(amount, dueMinor)` and ignores the party's balance. `:100-101` then writes the DEPOSIT and an over-balance WITHDRAWAL in one transaction, and the database refuses the pair.
   * The database says "money in always is". P-634 (1) caps only outflows.
   * **Fix:** cap the application at `max(0, balance after the deposit)`. Add a pass and a fail case.
4. **A receipt and a credit note change after they are issued.** This confirms breaker F2.
   * Probe: R-0013 for 300.00 on a 1,000.00 invoice reads "after this payment: CAD 700.00". After a second payment, the same PDF reads **CAD 400.00**.
   * Cause: `documents.ts:42-43` print the invoice's current `dueMinor` and extra, and `documents.ts:46` does the same for the credit note. They are fed from today's facts (`money.ts:113-115, 149-153, 157, 192-216`).
   * AG-6-63 r8: "A receipt is never edited". R9: documents print stored figures.
   * **Fix:** print the figures as of the document's own moment. Store them (this part has no migration, so in the audit `after` or the event payload) or derive them by receipt order. Add a pass and a fail case.
5. **The derived status ignores the credit ledger the database already counts.** Breaker F5 rated it Minor. I rate it Major because of a trust consequence the break report does not name.
   * `facts.ts:19-29` builds paid, due and extra without `money_credit_entry`. The database's own `money_invoice_due` (migration `20261119080000_fo7ts_ledgers`, line 242) subtracts APPLIED credit.
   * Probe: a 30.00 APPLIED entry on a 100.00 invoice reads "Open", 100.00 due, while `money_invoice_due` gives 70.00. Then 100.00 received into TRUST writes `WITHDRAWAL_TO_INVOICE −10000`, and `money_invoice_due` becomes **−3000**. So 30.00 left trust that the invoice did not owe, and no extra was reported.
   * Same root: 37.00 KEPT from an overpayment still shows `extraMinor 3700` and still offers "Refund · Keep as credit".
   * Nothing writes credit entries today, so this is latent. But `invoiceStatus` and the facts are "the one derivation FO-7r and FO-7t reuse", and AG-6-21 r5 (apply credit) is next.
   * **Fix:** take due from `money_invoice_due` (or add APPLIED net of reversals to paid), and net KEPT out of the waiting extra. Add seeded pass and fail cases, as was done for the write-off.

## Minor
1. **The same idempotency key on two clients' invoices at once gives 500.** It is not 409 (breaker F3, confirmed: 500 and 201). The P2002 unique-index error is not mapped by `write()` (`money.ts:166-171`).
2. **Amendment 1 asks for "a pass and a fail each, plus a neither".** `check_fo7b_invoices.ts:301` has the pass and the neither, but no fail.
3. **AG-6-63 r4 lists the firm's address on a receipt.** `documents.ts:29` (`head`) prints only the name and the tax number, though `platform_firm.business_address` exists. The wording is Sample.
4. **Graph G3 (P-86) lists the seven new routes as reached by no test.** This is the tool's limit: the suite composes the paths through helpers. Every route is called (76 checks).
5. Breaker F4, F6, F7 and F8 are not re-verified here. `efb471b50` says it fixes F4, F6 and F7.

## What held (with evidence)
* **Lock order.** `lock()` (`money.ts:174-181`) takes `money_trust_lock` and then `select … for update` on the invoice row, on every write path. Two full payments at once give 10000 and 0 applied, "Paid twice?", and `invoice.paid` once.
* **Idempotency.** It is read under the lock. A double click gives 201 plus a 200 replay. The same key with another amount gives 409 KEY_USED.
* **Overpayment is never refused.** Extra into operating offers `REFUND, KEEP_AS_CREDIT` and makes no trust entry, even with trust YES. Money into trust writes DEPOSIT + WITHDRAWAL_TO_INVOICE in one transaction, and the remainder stays in trust.
* **Methods and trust.** CARD_TERMINAL into TRUST gives 422 at receivedInto. TRUST with trust off gives 409. A cheque into trust needs the uncleared acknowledgement (P-634 (1)).
* **Credit-note caps** match `money_credit_note_write`: open less trust paid, net of OVERPAID_REFUND. A trust-paid invoice gives 409 TRUST_PAID in words. A written-off invoice gives 409. A part credit carries the gross amount (Lead B (Track B) ruling 3).
* **facts.ts arithmetic.** Paid = operating − refunds + `money_trust_paid` (net of OVERPAID_REFUND). Trust money counts only through its application. Figures are integers parsed from bigint text. One invoice is in one currency.
* **invoiceStatus order:** Draft, Written off, Credited, Refunded, Paid, Overdue, Part paid, Open. Overdue starts the UTC day after the due date (moved-clock case).
* **R9.** The invoice PDF, the receipt and the `invoice.issued` payload print the stored 0.06 and 0.56. The planted half-up document is caught.
* **Firm walls.** Every query is `firmScope`d or uses raw SQL with the firm id, under PF-12 RLS. Firm B gets 404 on pay, credit, send and PDF.
* **Audit and outbox.** One audit line per change inside the transaction (`staff:<id>`), with outbox rows after it.
* **Touch list** kept; no migration; `ports/events.ts` untouched.
* **Labels.** No personal names. Sample and "Unconfirmed: no accountant / no counsel" labels are on the wording and the readings.
* **Size.** 773 changed lines, under 800.
* **Lead 91's P-423 note:** a pass, plus a planted fail.

## The builder's deliberate gaps (not findings)
None of these is on the part-1b list, so none is a finding: refunds and the two choice actions, the cheque "Cleared" tick, retainer-row drafting, the deposit refusal, the `invoice.overdue` job, `MONEY_EVENT` in the port file while #2919 is open, 422 for field errors, and the UTC day.
The unsigned-retainer warning is amendment 3, inside "part 1", so the question is a fair one. Until it is answered, the PR body must say that issuing has no warning yet.

## Checks run
* **On the exact copy:**
  * `check_fo7b_invoices.ts`: **76 passed, 0 failed**, in 15 s.
  * Port contracts: **exit 1**.
  * `check_pf19r_every_sender.ts`: **1 failed**.
  * Probes, as throwaway scripts in the scratchpad: Majors 3-5 and Minor 1.
* **On the shared checkout,** which may already have been at efb471b50 (that commit does not touch the feature wiring):
  * `check_pf12_walls.ts`: 110/0. On the exact copy, 5 of its cases fail only because `prototype/p2/` was not in my archive.
  * Typecheck: no new errors.
  * `graph.mjs --check`: exit 0.
  * `count-any`: unchanged.
  * Module cards: PASS, 44 fixtures.
* **Not run:** j_59 (it needs an isolated server), the other money suites and the demo reset.

**Verdict: Block** (screen-review scale: Ship after fixes). Fix before Approve: Major 1 (port contracts), Major 2 (every-sender sweep), Major 3 (trust money in for a party below zero), Major 4 (receipt and credit-note figures fixed at issue), Major 5 (derive due from `money_invoice_due`, credit ledger included). Then re-review the new head.

Reviewer: Block d6948072ee713669f29a979fc9b812620ba57077

## Round 2 (diff d6948072e..7e6e48c1f)

Same reviewer role, diff-only (P-277). **Commit reviewed: `7e6e48c1f3222d282722c16ac16c8e40f8e54c7e`** on `claude/sleepy-archimedes-3a0op2`. I read `git diff d6948072e..7e6e48c1f` (12 files, +298 −40), the round-1 review and `break-report.md`. The two files outside the touch list (`ports/contracts/client-money-port.contract.ts`, `tests/check_pf19r_every_sender.ts`) and the size are covered by Lead 2's ruling on #2953, so they are not findings. Still no screen and no journey score.
Paths below are under `prototype/studio/`.

### Blocker
None.

### Major
1. **A client below zero in trust gets a receipt that says the money was "more than this invoice asked: kept in trust". It was neither.** The M3 / F1 fix records the money correctly. It reports it wrongly.
   * Probe (the suite's own PZ case): the client is at −50.00 and pays 100.00 into trust on a 100.00 invoice. The ledger is right: deposit, 50.00 applied, balance 0.00, and 50.00 still due.
   * Receipt R-0011 reads "Balance due on INV-0009 after this payment: CAD 50.00", and then "**CAD 50.00 is more than this invoice asked: kept in trust.**" The invoice asked 100.00. Nothing is in trust: that 50.00 covered the shortfall.
   * The API answer is `extra: {amountMinor: 5000, choices: [], note: null}` while `invoice.extraMinor` is 0. The audit summary (`money.ts:112`) says "CAD 50.00 is extra".
   * The receipt never changes and is emailed, so the client keeps this wording.
   * Cause: `money.ts:225-227` sets `extraNow = amount − applied`, so for trust it also counts what the cap at `:106` held back. `documents.ts:44` words every extra as overpayment. The pass case at `tests/check_fo7b_invoices.ts:342` asserts only `extra?.note === null`, so it accepts the 50.00 "extra".
   * **Fix:** for trust, extra is only what is over the invoice's due. Report what went to cover a shortfall apart from extra (or not at all on the receipt), and in words that are true. Add a pass case that asserts the receipt text and `extra === null` for this case.
2. **The receipt's "as of its moment" read orders four kinds of rows by transaction start, not by lock order. A receipt can still change after it is issued** (M4 / F2, not fully closed).
   * Operating payments are ordered by receipt number (`money.ts:214`), which is lock order, and that part is right. Credit notes, write-offs, trust applications with their corrections, refunds and credit entries are ordered by `created_at <= r.issued_at` (`money.ts:208-212, 216`).
   * The database's triggers set every one of those times to `now()`, which is the transaction's start (`money_credit_note_write`, `money_write_off_write`, `money_trust_entry_write`, `money_refund_write`, `money_credit_entry_write`, and `money_receipt_write` for `issued_at`).
   * So a writer whose transaction began first but waited on the party lock gets an earlier time than a receipt it never saw. Round 1's own comment, deleted in this diff, said exactly this: "created_at is a transaction's start, which a waiting writer's precedes".
   * **Probe A** (throwaway harness under /tmp: the suite plus a `pg` client playing the waiting writer):
     * A credit-note transaction begins at 01:39:19.307. A 100.00 payment is then recorded in full, with receipt R-0015 issued at 01:39:19.367, reading "after this payment: CAD 0.00" with no extra.
     * The credit note then takes the lock and is written, with `created_at` 19.307.
     * Downloaded again, **R-0015 now adds "CAD 100.00 is more than this invoice asked: we will be in touch about it."** The payment's replay flips from `appliedMinor 10000, extra null` to `appliedMinor 0, extra 100.00 "Paid twice?"`, which offers Refund · Keep as credit.
   * **Probe B:** the same order with a trust application. An operating receipt's "after this payment: CAD 40.00" becomes **CAD 0.00**.
   * Through the in-process API, 30 racing payment-and-full-credit pairs gave no inversion, so locally the window is narrow. Two app instances or a real network round trip between BEGIN and the lock make it wider. Breaker F2 was this same class of fault, and break-report "What held" already races payments against full credit notes.
   * Smaller, same place: the credit-entry query at `:216` compares µs database times with a JS `Date` parameter, which is truncated to the millisecond.
   * **Fix:** print the figures written under the lock instead of deriving them again. The `payment.recorded` audit line already stores `detail.appliedMinor` and `after.invoiceDueMinor` (`money.ts:113-114`), which is the round-1 suggestion. Or order every kind by lock order, not by time. Add a planted waiting-writer case.

### Minor
1. **Some fail cases restate the pass instead of catching a planted wrong rule.**
   * `tests/check_fo7b_invoices.ts:343` (F1 "stand-in"), `:352` (M5 "stand-in") and `:358` (F2 "planted") only re-check the pass's own values.
   * F3 (the P2002 → 409 mapping) has no case at all. I confirmed it by probe: 6 of 6 runs gave 201 / 409 KEY_USED.
   * At `:374`, `mailsBefore` is read *after* the send, so "no email" is always true. The 409 assertion still holds the rule.
2. **Every P2002 inside `write()` becomes "This idempotency key is already in use"** (`money.ts:175`), whatever unique index was hit, such as a number series clash. Check the error's target or constraint is the `(firm_id, idempotency_key)` index, and let anything else fall through.
3. **The letterhead is read at download time, not stored with the document.** That covers the firm's name, the new address, the tax number and the bill-to (`money.ts:232-238`). A reprint after a firm or client edit differs from the copy emailed. This was already true of the name and tax number in round 1, and the address adds one more such field. It also prints the stored country key in lower case ("…, ON M5V 1A1, canada").

### Each claimed fix (pass / fail)
* **M1, holds.** Port contracts exit 0, with "ClientMoneyPort ×2" and "DocumentRenderPort ×3". The suite runs ClientMoney and fakeClientMoney 3/3 each, a planted always-true adapter fails, and MoneyDocuments passes 3/3.
* **M2, holds.** `check_pf19r_every_sender.ts` gives 21 passed, 0 failed.
* **M3 / F1, partly holds.** `applied = max(0, min(applied, held))` is right, and `held` is the deposit row's `balance_after_minor`, which the trigger sets before RETURNING. The money is recorded, and the ledger never goes below zero from this payment. The reporting is Major 1.
* **M4 / F2, holds when writes come one after another, not under a waiting writer** (Major 2). The credit note prints only its own figures: the balance line is removed, and the rest is the note's row plus the invoice's fixed total.
* **M5 / F5, holds.** `applied = −money_invoice_credit(APPLIED)` and `kept = money_invoice_credit(KEPT)` match `money_invoice_due` (migration `fo7ts_ledgers`:242-252), including reversals. The suite's 70.00 matches the database's 7000, and 100.00 into trust applies 70.00 and leaves 30.00. A kept 30.00 is no longer waiting extra.
* **F3, holds.** It is a 409 (probe D: 6/6), with no case in the suite (Minor 1).
* **F4, holds.** 0000-01-01 and 1999-12-31 give 422, 3000-01-01 gives 422, and 2000-01-01 gives 200 (probe E).
* **F6, holds.** A Credited invoice's send gives 409 CANCELLED before any read of the mail port.
* **F7, holds.** A total of 0.00 gives 409 NOTHING_TO_BILL and the invoice stays a draft. Lines are never negative, so `=== 0` covers it.
* **Minor 1, holds.** The address prints on the invoice, receipt and credit note, from `platform_firm.business_address` under `ownFirm`.
* **Minor 2, holds.** Amendment 1 has a fail: the database refuses a planted trust deposit naming the operating payment.

### What held (rules from round 1, re-checked on the diff)
* **Lock order:** `lock()` is unchanged, and every write path still takes the trust lock and then the invoice row.
* **Idempotency** is read under the lock. The P2002 mapping only changes how a lost race is answered (409, not 500), and nothing is doubled.
* **Overpayment is never refused.** The P-pass cases still hold. A trust overpayment still leaves the remainder in trust.
* **Firm walls:** every new query is scoped by `r.firm_id` or `${firmId}`, under PF-12 RLS. The address is read through `ownFirm`.
* **Audit and outbox:** one audit line per change, unchanged. The new refusals (NOTHING_TO_BILL, CANCELLED) write nothing, and events are still written last.
* **Integers only:** bigint text goes through `Number`, and no float appears in a figure.
* **R9:** the invoice still prints the stored lines' figures.

### Checks run (on 7e6e48c1f, in this checkout)
* `check_fo7b_invoices.ts`: **98 passed, 0 failed**.
* `node studio/tools/check-port-contracts.mjs`: **exit 0**, 27 ports with 0 problems.
* `check_pf19r_every_sender.ts`: **21 passed, 0 failed**.
* Probes A-F, as a throwaway copy of the suite under /tmp/r2probe on its own scratch databases at :54329 (dropped). A Prisma probe confirmed that the client fills `@default(now())` itself, but the money triggers overwrite it with the transaction's `now()`.

**Verdict: Block** `7e6e48c1f3222d282722c16ac16c8e40f8e54c7e`. Fix before Approve:
* Major 1: the trust shortfall is reported as "extra, kept in trust" on the receipt, the answer and the audit line.
* Major 2: the receipt's figures must not depend on transaction-start order. Print the figures stored under the lock.

Then re-review the new head (diff only).

Reviewer: Block 7e6e48c1f3222d282722c16ac16c8e40f8e54c7e
