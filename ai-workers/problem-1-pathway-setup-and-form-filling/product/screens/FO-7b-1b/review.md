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

## Round 3 (diff 7e6e48c1f..521e016ee)

Same reviewer role, diff-only (Lead's "Lead allows round 3:" on #2953). **Commit reviewed: `521e016eeb4127e2648dda7b2da875f8ea80d28e`** on `claude/sleepy-archimedes-3a0op2`. I read `git diff 7e6e48c1f..521e016ee`: 4 code files (`documents.ts`, `money.ts`, `ports/client-money.ts`, `tests/check_fo7b_invoices.ts`), plus round 2 and `break-report.md` R2-F1 to F5. Still no screen, so no browser walk and no journey score. Paths below are under `prototype/studio/`.

### Blocker
None.

### Major
1. **A trust payment from a client who already holds money in trust takes that held money too, and the stored `extraMinor` goes negative.** This is new in this diff. It reopens the trust part of round-2 M1 and fails the "`extraMinor` never negative" check.
   * Cause: `api/src/client-money/invoices/money.ts:115` is `applied = max(0, min(dueBefore, held))`, where `held` is the party's whole balance after the deposit. Round 2 capped `applied` at `min(amount, due)` first. This diff drops the cap at the payment's own amount, so `:118` `extra = amount − shortfall − applied` can be below zero.
   * Probe, API only (throwaway copy of the suite under /tmp/r3probe, on its own scratch database at :54329):
     * Client pp pays 130.00 into trust on a 100.00 invoice. 30.00 stays in trust, which is right, and the receipt says "kept in trust".
     * The same client then pays **50.00** into trust on a new 100.00 invoice. The answer is 201 with `trust.appliedMinor 8000` and balance 0. The ledger reads `DEPOSIT 5000→8000, WITHDRAWAL_TO_INVOICE −8000→0`, and 20.00 is due.
     * The audit line stores `extraMinor: -3000`. Its summary says "CAD **-30.00** is extra".
     * Receipt R-0020 (emailed, and never changes) says "Received: CAD 50.00 … Balance due … after this payment: CAD 20.00 **CAD -30.00 is more than this invoice asked: kept in trust.**"
   * So 30.00 that an earlier receipt told the client was "kept in trust" was moved to this invoice. Nobody asked for that, and the receipt calls it a negative extra. Using held trust money for an invoice without the client's instruction is also a trust-rule question (Unconfirmed: no counsel).
   * **Fix:** `applied = max(0, min(dueBefore, p.amountMinor − shortfall))`. Then `extra ≥ 0` always holds, and this payment never moves more than it brought in. Add a pass case with a positive balance before (the API-only path above: expect applied 50.00, extra null, balance 30.00, and no "-" on the receipt). Add a fail case that asserts the stored `extraMinor ≥ 0` and the ledger's untouched 30.00.
   * The suite missed it because every trust case starts at a balance of 0 or below. PK has no trust before `kTrust`.

### Minor
1. **Kept credit, partial** (`money.ts:219`). Refund · Keep as credit stays on offer while any of the extra is still waiting, but `extra.amountMinor` still shows the whole stored extra, not what is left. R2-F4's example (60.00 extra, 20.00 net kept) offers both choices against 60.00. This is latent, since no route writes KEPT yet. It needs no change before Approve; the KEPT route should show what is still waiting.
2. **`paymentView` has no fallback for a line with no stored letterhead.** It prints an empty firm name, where `storedHead` falls back to the live one. Today this can't happen, because only `record()` writes `money_payment` and it always stores the letterhead.
3. **Carried from round-2 Minor 3:** the stored address still prints the country key in lower case ("…, ON M5V 1A1, canada"). It is now frozen into each stored letterhead.

### Each claimed fix (pass / fail)
* **R2 M1 / R2-F2 (shortfall worded "kept in trust"): holds below zero, fails above zero** (Major 1). The stored figures from the probes:
  * Balance −50.00, pays 100.00: shortfall 50.00, applied 50.00, extra 0, 50.00 due. The receipt has the shortfall sentence and no "kept in trust".
  * Balance −150.00, pays 100.00: shortfall 100.00, applied 0, extra 0, and the balance is −50.00.
  * Balance **−0.01**, pays 100.00: shortfall 0.01, applied 99.99, extra 0, 0.01 due. A further 50.00 then gives applied 0.01 and extra 49.99, kept in trust.
  * Balance **0**: exact gives extra 0, and an overpay of 130.00 gives extra 30.00 kept in trust.
  * Balance **positive**: wrong, as Major 1 shows.
  * `shortfall = max(0, min(amount, −balanceBefore))` is right in all four cases.
* **R2 M2 / R2-F1 (receipt read by `created_at`): holds.**
  * The figures are decided under the invoice's lock in `record()` and stored in `audit_event.detail`. `paymentView` reads them back with `firm_id = ${firmId}`, `action = 'payment.recorded'`, `entity = 'money_payment'` and `entity_key = payment id`. That is one line per payment, so `limit 1` picks it.
  * The as-of queries that depended on time order are deleted.
  * The scripted race (a credit note opened first and saved after the payment) holds 700.00 on the emailed and the re-downloaded receipt, in 2 of 2 runs.
  * The replay answers the stored figures. For a payment that was "Paid twice?", the replay matches the first answer exactly.
* **R2 Minor 1 (weak fails, no F3): holds.** F3 now has a case (201 + 409 KEY_USED, one row). There are fail cases at −150.00 and for a replay after kept credit, and the `mailsBefore` order is fixed.
* **R2 Minor 2 (every P2002 read as KEY_USED): holds.** KEY_USED now needs the error meta to name `idempotency_key`; anything else falls through.
* **R2 Minor 3 / R2-F3 (letterhead read at download time): holds.** It is stored as `firmName_after`, `firmAddress_after`, `taxNumber_after` and `billTo_after` on `payment.recorded`, `invoice.issued` and `invoice.credit_note_issued`. The renamed-firm case passes. "How to pay" stays live (`invoiceOf`).
* **R2-F4 (kept credit): holds for credit kept in full** (the replay offers no choices). Partial: Minor 1.
* **R2-F5 (wording): holds**, as "from the year 2000 to 2999".

### What held (rules from rounds 1 and 2, re-checked on the diff)
* **Lock order:** unchanged. The only reads added inside the transaction are the letterhead reads, which take no locks.
* **Idempotency:** read under the lock as before. A replay gets the stored figures.
* **Overpayment is never refused.** An operating overpay of 120.00 on 100.00 gives extra 20.00 with Refund · Keep as credit. A second full payment gives applied 0 and extra 100.00, "Paid twice?". Below zero is never refused.
* **R9:** the invoice still prints the stored lines.
* **Firm walls:** both audit reads are scoped by `firm_id`.
* **One audit line per change:** the suite's count case passes, now excluding the one credit note the race case seeds by SQL.
* **Outbox last:** audit, then `module_event`, then the invoice event, in all three paths.
* **Integers only:** the stored values are JSON integers read with `Number`.
* **No secret field and no email in `after`.** The keys are firmName, firmAddress, taxNumber and billTo, and none matches `SECRET_FIELD`. The bill-to email from `letterhead()` is not stored. I checked the stored key list of a live line.

### Checks run (on 521e016ee, in this checkout)
* `check_fo7b_invoices.ts`: **101 passed, 0 failed**, twice.
* `node studio/tools/check-port-contracts.mjs`: **exit 0**, 27 ports with 0 problems.
* Probe: a copy of the suite plus the cases above, under /tmp/r3probe, on its own scratch database (dropped). With them it still reports 101/0, because the probes are prints and not cases.

**Verdict: Block** `521e016eeb4127e2648dda7b2da875f8ea80d28e`. Fix before Approve:
* Major 1: in the trust path, cap `applied` at what this payment brings after the shortfall (`money.ts:115`), so `extraMinor` is never negative and held trust money is never taken without being asked. Add pass and fail cases for a positive balance before.

Then re-review the new head (diff only).

Reviewer: Block 521e016eeb4127e2648dda7b2da875f8ea80d28e

## Round 4 (diff 521e016ee..7c3c0b5ba)

Same reviewer role, diff-only (the Lead's "Lead allows round 4: diff-only from 521e016ee" on #2953). **Commit reviewed: `7c3c0b5baae55ceb9b0751035283ab7e52d9b959`** on `claude/sleepy-archimedes-3a0op2`. I read `git diff 521e016ee..7c3c0b5ba`: 3 code files (`api/src/client-money/invoices/money.ts`, `ports/client-money.ts`, `tests/check_fo7b_invoices.ts`). There is still no screen, so no browser walk and no journey score. Paths below are under `prototype/studio/`.

### Blocker
None.

### Major
1. **The new `xmin` match makes a receipt return 404 after a cheque is ticked "Cleared", and after a backup restore.** This is new in this diff (the R3-F2 fix).
   * Cause: `money.ts:216` finds the receipt's audit line with `e.xmin::text = m.xmin::text`, which compares it against the `money_payment` row's *current* `xmin`. But the payment row is allowed to change once. The FO-7a trigger (`prisma/migrations/20261115042334_fo7a_client_money_tables/migration.sql:991-994`) lets an uncleared cheque be ticked `cleared = true`, once. That UPDATE writes a new row version with the clearing transaction's `xmin`. From then on no audit line matches, and `paymentView` returns `notFound("payment")`.
   * Probe (a throwaway copy of the suite under /tmp, on its own scratch database at :54329, dropped afterwards): I took the cheque `c1` (500.00, ref 4471) and fetched its receipt, which gave **200**. I then ran the update the trigger permits (`update money_payment set cleared = true, cleared_at = now(), cleared_by = 'user-R' where id = c1`). The same receipt then gave **404**. The suite still reported 104/0, because the probe printed its result rather than running as a case.
   * The same thing happens to a replay. `record()` ends in `paymentView` (`money.ts:129`), so a retry with the cheque's idempotency key after clearing also gets 404. A receipt has to stay readable and unchanged (AG-6-63 rule 8), and clearing a cheque is a normal step for that payment.
   * Backup restore: the official drill (`tools/restore-drill.sh:130`, NFR5-04) runs `pg_restore` without `--single-transaction`. Each table's data is then loaded in its own transaction, so the restored `money_payment` and `audit_event` rows get different `xmin`s, and every receipt and replay would return 404 on a restored database. The drill checks row counts and the smoke test, not receipts, so it would still pass. I could not run pg_dump here (the local client is 16 and the server is 18), so this part is reasoned from how pg_restore works, not measured. The cheque case above was measured.
   * **Fix (the builder's choice):** link the receipt to its audit line by something that survives an UPDATE and a dump, never by `xmin`. For example, both rows' insert-transaction timestamp, or a key stored when the payment is written. Add a case: tick a cheque Cleared, then fetch its receipt and replay it (expect 200, word for word the same).

### Minor
1. **The planted fail for round-3 M1 cannot fail on its own** (`tests/check_fo7b_invoices.ts:353`). `Math.min(30000, 15000) - 10000 === 5000` is constant arithmetic, and `appliedMinor !== 15000` is already implied by the pass case's `=== 10000`. It never runs the old rule. A real plant would check that the stored `extraMinor ≥ 0` and that the held 50.00 is untouched in the ledger, with the old formula expected to fail that check.
2. **The new figure check is never reached by a test** (`money.ts:218`). The forged line's `"x"` is filtered out by the `xmin` match before the loop runs, so no case reaches the 404 for a stored figure that is not a non-negative whole number. That is acceptable as a defensive check. Say so, or add a case.
3. **Carried, not changed by this diff:** round-3 Minor 2 (no letterhead fallback in `paymentView`) and Minor 3 (lower-case country key in the stored address).

### Each claimed fix (pass / fail)
* **R3 M1 / R3-F1 (trust payment spending held money): holds.** Let B be the balance before and A the amount. The deposit row's `balanceAfterMinor` is B + A, so `shortfall = max(0, min(A, −B))` and `applied = max(0, min(due, A − shortfall))`:
  * B > 0 or B = 0: shortfall 0, applied min(due, A), extra A − applied ≥ 0. Balance after is B + A − applied ≥ B, so held money is never taken.
  * −A < B < 0 (for example −0.01): shortfall −B, applied min(due, A + B), extra A + B − applied ≥ 0. Balance after ≥ 0.
  * B = −A: shortfall A, applied 0, extra 0. Balance after 0.
  * B < −A: shortfall A, applied 0, extra 0. Balance after B + A < 0 (P-634 allows that), and it is never driven lower.
  * due ≤ 0 ("Paid twice?"): applied 0, extra A − shortfall ≥ 0.
  * In every case `shortfall + applied + extra = A` (extra is defined as the remainder) and every term is ≥ 0. `dueMinor` is clamped at 0 (`facts.ts:37`), so the operating path's `min(A, due)` is ≥ 0 too. The new +50.00 case passes: applied 100.00, 200.00 due, balance 50.00, no extra, no negative `extraMinor` in the audit table.
* **R3-F2 (forged second audit line): holds against the forged line, at the cost of Major 1.**
  * One transaction: `write()` is a single Prisma interactive `$transaction(fn)` (`money.ts:183`). Nothing between `moneyPayment.create` (`:110`) and `audit.record` (`:122`) opens a savepoint: `writeAuditWithAlarm` only retries the closure (1 attempt here), and `AuditEventAdapter.record` inserts with the same `tx`. Measured on PG 18.3: two inserts in one transaction share `xmin`, and inserts on either side of a SAVEPOINT do not. So the "same transaction" premise holds today, but it would silently break if a savepoint were ever added around the audit write.
  * Freezing is not a risk. Since 9.4, freezing sets the infomask bits and keeps the stored xid, and the `xmin` column returns that raw value. Measured: `xmin` 196404 before and after `VACUUM FREEZE` on both tables, still equal. Xid wraparound (the 32-bit `xmin` repeats after about 4.3 billion transactions) would only matter for a forger who already has SQL, which is negligible.
  * The real risks are an UPDATE of the payment row and a logical restore (Major 1).
* **R3 Minor 1 (partial kept credit): holds.** `extra.waitingMinor` = extra − net kept (0 for trust), it is in the port's strict schema, and the replay case after a full keep asserts `waitingMinor === 0`.

### What held (rules from rounds 1-3, re-checked on the diff)
* **Lock order, idempotency under the lock, outbox last:** unchanged by the diff.
* **Firm walls:** the new audit query is scoped by `m.firm_id = firmId` and `e.firm_id = m.firm_id`. The walls case passes.
* **The receipt is never recomputed:** the figures still come from the stored line. The renamed-firm and race cases still pass. A forged backdated line leaves the receipt word for word the same.
* **One audit line per change:** the count case now leaves out only the forged `"x"` line the suite plants.
* **Integers only, overpayment never refused, and below zero never refused:** unchanged.

### Checks run (on 7c3c0b5ba, in this checkout)
* `check_fo7b_invoices.ts`: **104 passed, 0 failed** (exit 0).
* The suite copy with the cleared-cheque probe: 104/0, plus the probe's print "receipt before clearing: 200; after the permitted Cleared tick: 404".
* The SQL probe on its own scratch database (`xmin` with and without a savepoint, after `VACUUM FREEZE`, after an UPDATE). Both scratch databases were dropped, and /tmp was cleaned. A leftover `xr_studio_fo7b_scratch_24427` (created 06:23 UTC, not by this review) was left alone.

**Verdict: Block** `7c3c0b5baae55ceb9b0751035283ab7e52d9b959`. Fix before Approve:
* Major 1: the receipt's audit line must still be found after the permitted "Cleared" UPDATE and after a pg_dump/pg_restore. Do not match on `money_payment.xmin`. Add a case that ticks a cheque Cleared and then reads its receipt and replay.

Then re-review the new head (diff only).

Reviewer: Block 7c3c0b5baae55ceb9b0751035283ab7e52d9b959

## Round 5 (diff 7c3c0b5ba..2d8eaa844)

Same reviewer role, diff-only (the Lead's round 5 on #2953, from `7c3c0b5ba`). **Commit reviewed: `2d8eaa844d82537ebcf7352add433bacb7b5ca33`** on `claude/sleepy-archimedes-3a0op2`. I read `git diff 7c3c0b5ba..2d8eaa844` on its 2 code files (`api/src/client-money/invoices/money.ts`, `tests/check_fo7b_invoices.ts`). There is no screen, so no browser walk and no journey score. Paths below are under `prototype/studio/`.

### Blocker
None.

### Major
None. Round 4's Major 1 (R4-F1) is fixed (see below).

### Minor
1. **New in this diff (test only): the R4-F2 case's title claims more than it tests** (`tests/check_fo7b_invoices.ts:430-433`). The forged line is missing `dueAfterMinor`, but the receipt returns 404 because two lines now match, so `lines.length === 1` fails before the figure check runs. No case reaches the per-figure or boolean checks at `money.ts:221` with a lone line. Through the app that cannot happen: `audit_event` refuses UPDATE always and DELETE outside the demo reset (`aud1a_audit_insert_only/migration.sql:113`, `:155`), so the genuine line can't be altered or removed. The checks are defensive. Rename the case ("a second line, also missing a figure"), or say in the comment that the figure check guards a write that bypasses the triggers.
2. **Carried, not changed by this diff:** round-3 Minor 2 (no letterhead fallback in `paymentView`) and Minor 3 (lower-case country key in the stored address).

Observation (not a finding, not new in substance): a forged second line now makes the genuine receipt **and the replay** answer 404 "No such payment", where round 4 ignored it. That is the stated fail-closed rule (R3-F2, R4-F2: never other figures). It can only be reached by direct SQL inserts into the audit trail, which is tampering. A 404 there could read as "not recorded", but nothing in the product can produce that state.

### Each claimed fix (pass / fail)
* **R4-F1 / round-4 Major 1 (the `xmin` link): holds.** The predicate (`money.ts:218-219`) is now: `m.firm_id`, `m.id`, `e.firm_id = m.firm_id`, `action`, `entity`, `e.entity_key = m.id::text`, `e.detail->>'paymentId' = m.id::text` and `e.detail->>'receiptNumber' = receipt.number`. Every term is a stored column value:
  * `money_payment.id` and `firm_id` never change. The fo7a trigger (`fo7a_client_money_tables/migration.sql:991-994`) allows only `cleared false→true` with `cleared_at`/`cleared_by`, and lists `id` and `firm_id` among the columns that must stay the same.
  * `money_receipt.number` is assigned by the database, NOT NULL, unique per firm (`:331`, `:612`) and insert-only (`:666`, `:671`).
  * `audit_event` is insert-only (above), and its `detail` is jsonb written once, with `paymentId`, `receiptNumber` (`money.ts:123`) and `cleared_after` (from `after.cleared`, through `flattenValues`, `ports/audit.ts:47-55`).
  * So a Cleared tick, a table rewrite and a logical dump/restore all keep the link. None of them changes a stored value, and nothing physical (`xmin`, ctid) is read any more.
  * Measured (a throwaway copy of the suite under /tmp, own scratch DB at :54329, dropped): after the cheque was ticked Cleared, I ran `VACUUM FULL` on both tables, then `ALTER TABLE … ADD COLUMN … DEFAULT gen_random_uuid()` on both (a forced rewrite). The receipt was **200, word for word the original** (still "Not yet cleared"), and the replay was **200, `appliedMinor` 1000**. Dump/restore is argued from the above, not run.
* **Firm scope: holds.** The payment is read with `firmScope`, and the audit query pins `m.firm_id = firmId` and `e.firm_id = m.firm_id`. A receipt number repeated in another firm can't match. The walls case passes.
* **Exactly one line for a real payment: holds.** `payment.recorded` / `money_payment` is written only at `money.ts:121`, inside the single interactive `$transaction` of `write()` (`:182-183`), which commits or rolls back whole. The adapter runs `attempts: 1` (`platform/audit/audit-event.ts`, both paths), so nothing is retried inside the transaction. A replay returns at `:86` before any write. The same key at the same moment is serialised by the invoice lock, or refused by the unique key (P2002 → KEY_USED) with the whole transaction rolled back. In the probe, all 25 payments in the suite DB were classified: every staff-recorded payment had exactly one line, except the one where the suite plants a forgery (2 lines, as intended). The other 5 are the suite's SQL-seeded fixtures (`seed:FO-7b-1b`), which have no line and are never read as receipts.
* **The cheque replay after a Cleared tick answers the same figures: holds.** `appliedMinor`, `extra`, the due amount, `trust` and `shortfall` come from the stored line. The JSON `cleared` field shows the live state (true after the tick). The receipt (PDF and email, both through `receiptOf`, `money.ts:259-260`) prints the stored `cleared_after`, so it never changes (AG-6-63 rule 8). The new case at `:424-428` asserts this word for word.
* **R4-F2 / round-4 Minor (missing figure read as 0): holds.** `?? 0` is gone. Each figure must be `Number.isSafeInteger` and ≥ 0, `paidTwice` and `cleared_after` must be booleans, and anything else is 404. `num()` now reads the value as is.
* **Round-4 Minor 1 (planted fail that could not fail): holds.** `round3Rule` is now fed the response's stored `balanceMinor + appliedMinor`. If the code applied 150.00, `planted3` would equal `appliedMinor` and the case would fail.

### What held (rounds 1-4, re-checked on the diff)
* Lock order, idempotency under the lock and outbox last: unchanged.
* The receipt is never recomputed: figures, letterhead and now the cleared state come from the stored line.
* The trust arithmetic (R3-F1), partial kept credit (R3 Minor 1) and the walls: unchanged, and their cases pass.
* `clearedThen` is stripped from the API response (`money.ts:130`) like the other print-only fields, so `PaymentView`'s strict schema is unchanged.
* The audit count case now counts lines whose `dueAfterMinor` is a whole number, which leaves out exactly the suite's two forged lines.

### Checks run (on 2d8eaa844, in this checkout)
* `check_fo7b_invoices.ts`: **106 passed, 0 failed** (exit 0).
* The probe copy: 106/0 plus the rewrite and line-count prints above. Its scratch DB was dropped and /tmp was cleaned. A leftover `xr_studio_fo7b_scratch_24427` (already noted in round 4, not made by this review) was left alone.

**Verdict: Approve** `2d8eaa844d82537ebcf7352add433bacb7b5ca33` (no open Blocker or Major; Minor 1 and the carried Minors may follow in a later row).

## Batch fix 2 (diff 2311bc168..3b0f5bb54)

A diff-only read of commit `3b0f5bb54c9386c8f740e80febd0d2113fb3e54c` on `claude/sleepy-archimedes-3a0op2`. This row is API-only, so there was no browser walk and there is no journey score. Why the fix exists: merge batch run 45010308900, shard 21, failed `tests/check_b164_no_engine_keys.ts`. Its `keyLike` (line 149, `/^[a-z]{2,5}\.[a-z][a-z0-9_]*$/`) read `"money.invoice"`, `"money.receipt"` and `"money.credit_note"` as a new program's combination key.

### What was checked
* **Scope.** The diff touches 3 files and 8 lines: `MONEY_TEMPLATES` in `api/src/client-money/invoices/documents.ts`, five literals in `money.ts` (three `key:` returns in the PDF path and two `email(...)` calls), and two literals in `tests/check_fo7b_invoices.ts`. Only the string constants changed. The mail idempotency keys `money-invoice:<id>` and `money-receipt:<id>` are unchanged, which is correct: renaming them would let a retry send the email again.
* **No old names left.** `git grep -nE '(^|[^_a-z])money\.(invoice|receipt|credit_note)'` across the whole problem folder found nothing: no hits in code, tests, web, samples or Prisma. Because `MoneyTemplate = keyof typeof MONEY_TEMPLATES`, the type checker would have flagged any literal that was missed.
* **Port contracts.** `client_money.invoice`, `client_money.receipt` and `client_money.credit_note` match `TemplateKey` in `ports/render.ts` (`/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/`) and `templateKey` in `ports/mail.ts` (`/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/`), and each is under 100 characters. The PF-0c DW2 `DocumentRenderPort` contract run on `MoneyDocuments` passes (3 of 3).
* **keyLike.** The head `client_money` has 12 characters, so it fails the `{2,5}` combination pattern. A known key would only be flagged if its first part were `client_money`, and none is.
* **Persistence.** The template key reaches only `mail.send({ templateKey })`. No Prisma model, audit line or web file stores or reads it, so no earlier rows still carry the old name.

### Checks run (on 3b0f5bb54, in this checkout)
* `check_b164_no_engine_keys.ts`: **67 passed, 0 failed**.
* `check_fo7b_invoices.ts` (scratch database on 127.0.0.1:54329): **107 passed, 0 failed** (exit 0).

### Findings
None.

**Verdict: Approve** `3b0f5bb54c9386c8f740e80febd0d2113fb3e54c` (no open Blocker or Major; the Minors carried from earlier rounds are unchanged).
