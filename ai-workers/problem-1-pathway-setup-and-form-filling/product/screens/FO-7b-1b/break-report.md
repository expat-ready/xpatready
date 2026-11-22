# Break report: FO-7b part 1b (issue, payments recorded by hand, receipts, credit notes, PDFs)

Commit broken: `d6948072ee713669f29a979fc9b812620ba57077` (branch `claude/sleepy-archimedes-3a0op2`). API only, no screen.
Spec: briefs/track-b/FO-7b-1b.md; Lead B FO-7b.md amendments 1, 3, 6, 8, 10; Build Lead C FO-7b.md breaker list.
Not built in this part, so not findings: refunds and "Refund · Keep as credit", the cheque "Cleared" tick, drafting from retainer fees, the unsigned-retainer acknowledgement, the invoice.overdue job, any screen, any migration.
How I tested: a scratch copy of `tests/check_fo7b_invoices.ts` (its setup, every migration, a Nest app, sample staff of two firms) plus about 60 attacks, on scratch databases `xr_studio_brk7b_scratch_*` at :54329. I dropped them afterwards and deleted the copy. The shipped check passes 76/76.
Paths below are under `prototype/studio/`.

## Findings

**F1, Major: money received into trust can't be recorded for a party whose trust balance is below zero.**
What I did: put a party at -50.00 in trust (a deposit applied to an invoice, then reversed as RETURNED; `money_trust_shortfall` lists the party). Then I recorded 100.00 received into TRUST on that party's 100.00 invoice.
Expected: the deposit is always recorded. The DB says "money in always is", and P-634 says only outflows are capped at the balance. The application to the invoice should be capped at what the balance allows.
Actual: 409 MONEY_RULE, "Only CAD 50.00 is available; the trust balance would go below zero". Nothing was saved. 40.00 on the same invoice gets "Only CAD 0.00". The money that would cure the shortfall can't be entered at all.
Where: `api/src/client-money/invoices/money.ts:95` (`applied = min(amount, dueMinor)` ignores the party's balance) and `:101`, where the deposit and the withdrawal share one transaction.

**F2, Major: a receipt changes after it is issued.**
The receipt prints the invoice's current balance and current extra, not the figures at the time of the payment.
What I did: paid 300.00 on a 1,000.00 invoice and got receipt R-0027. The emailed copy and the first PDF say "Balance due … after this payment: CAD 700.00". After a second payment of 300.00 and a 300.00 credit note, the same R-0027 PDF says 100.00. After a third payment it says 0.00.
Second case: a 100.00 payment in full, then a full credit note. Re-downloading that receipt adds "CAD 100.00 is more than this invoice asked: we will be in touch about it."
The emailed balance also comes from a read after the commit, so a concurrent payment can leak into it.
Expected: a receipt reprints the figures it was issued with (R9's spirit: printed figures are the stored ones).
Where: `invoices/documents.ts:387-388` (`balance: MONEY(v.dueMinor)`, `extra`); `money.ts:113-115,152,206-212` (applied and extra recomputed from today's facts).

**F3, Minor: a 500 when one idempotency key is used on two invoices at once.**
What I did: sent the same key at the same moment to two invoices of two different clients in one firm.
Expected: one 201 and one 409 KEY_USED.
Actual: one 201 and one **500**, in 6 of 6 runs. Nothing is doubled. The losing writer hits the `(firm_id, idempotency_key)` unique index (P2002), which `write()` does not map because the message is not `money_…:`. The lock is per party and invoice, not per key.
For contrast, the same key on two invoices of one client gives a correct 409.
Where: `money.ts:75,96,166-171`.

**F4, Minor: a 500 on issue with due date `0000-01-01`.**
What I did: `POST …/issue {"dueDate":"0000-01-01"}`.
Expected: 422 at dueDate.
Actual: 500. The zod `day` check accepts year 0, which PostgreSQL rejects.
Where: `ports/client-money.ts:84`, `money.ts:50`. Note that `0001-01-01` and past dates are accepted and read Overdue; AG-6-46 rule 12 allows that.

**F5, Minor (latent): the status derivation ignores the credit ledger the database counts.**
What I did: seeded FO-7ts `money_credit_entry` rows: 50.00 APPLIED to a 100.00 invoice.
Actual: the view says Open with 100.00 due, while `money_invoice_due` says 50.00. Paying 100.00 then shows `extra` null and `extraMinor` 0, but the database says the invoice is paid over by 50.00, and nobody is offered a choice for it.
Also, 50.00 KEPT from an overpayment still shows as waiting extra, and its receipt still says "we will be in touch".
No route writes credit entries yet, so this is not reachable today. It must be fixed before "Keep as credit" or applying credit lands.
Where: `invoices/facts.ts:327-343`, which builds `paidMinor`, `dueMinor` and `extraMinor` without `money_credit_entry`.

**F6, Minor: `send` emails a cancelled invoice.**
What I did: issued with the operating details empty (email HELD), sent a full credit note (Credited), filled the details, then called send.
Expected: refused, because there is nothing to pay.
Actual: 200 SENT. The client gets "Invoice INV-0004 from …" with "Balance due: CAD 0.00" and "How to pay".
Where: `money.ts:63`, which checks only `status !== "ISSUED"`.

**F7, Minor: a zero-total invoice reads Paid with no payment.**
What I did: added one 0.00 line and issued.
Actual: 200, statusWord "Paid", and invoice.paid is never written. A later payment is all extra, "Paid twice?".
Where: `money.ts:47` (no check that the total is above zero); `ports/client-money.ts` `invoiceStatus`.

**F8, Minor (spec-literal, latent): a part write-off reads "Written off" while money is still due.**
What I did: seeded a 1.00 write-off row on a 100.00 invoice.
Actual: "Written off" with 99.00 due. A 99.00 payment is still taken and still reads "Written off".
Lead B's text ("when a money_write_off row exists") allows this. AG-6-1 rule 7 says "settled by a write-off". Raise it with FO-7r; the write-off action is FO-7r's.

**F9, Minor (stated limit): non-Latin text prints as "?" in the PDFs.**
A bill-to of "李 …" prints "?", and a 200-emoji reason prints a row of "?". The stored text and the email keep the characters.
Where: `documents.ts:350-351,398`.

## What held
- **Concurrency.** These ran with no 500, no 40P01 or 40001, and no deadlock:
  - 12 payments with distinct keys at once: the applied amounts sum to exactly the 1,000.00, 200.00 is extra, invoice.paid is written once.
  - One key 8 times at once: one 201 and seven 200 replays, one row.
  - Payment against a full credit note, 4 runs: consistent, voided once.
  - 3 full credit notes at once: one 201 and two NOTHING_LEFT, one audit line.
  - Issue against add-line: always serialized, and the payload total equals `money_invoice_total`.
  - Trust payment against an operating payment, 3 runs: trust applied 100.00, operating all extra, paid once.
  - A 24-write storm (trust, operating, credit notes, duplicate references): the view's `paidMinor` equals the rows, `dueMinor - extraMinor` equals `money_invoice_due`, there are 19 audit lines for 19 writes, and invoice.paid is written once.
- **Idempotency.** The same key in another firm makes a new payment. Another method or amount gets KEY_USED. A replay after a full credit note returns the original. A replay after the trust answer flips to NO returns the original.
- **Trust.** Answer NO or unanswered gets TRUST_OFF. A card terminal into trust gets 422. A cheque needs the acknowledgement. A USD cheque into trust is applied up to what is due and the rest stays in trust. A company bill-to works (balance, receipt "kept in trust", email to its primary contact). An extra into operating never makes a trust entry. Trust money leaves only as WITHDRAWAL_TO_INVOICE to the invoice being paid.
- **Credit notes.** Amounts of 0, -1, 1.5, "100", 2^31, null and 1e309 get 422. Over the remaining gets OVER_CREDIT. A trust-paid invoice gets TRUST_PAID, and a write-off row gets WRITTEN_OFF. Reasons of 201 characters, bidi, zero-width only, a lone surrogate, NUL, tab or blank get 422. 200 accented letters or 200 emoji are stored.
- **Inputs.** Floats, strings, 2^31, -1, dates 0000-00-00, 1999-12-31 and 9999-12-31 for receivedOn, a lone surrogate or bidi in the reference, bad keys, unknown fields, `__proto__`, an array body and malformed ids all get 422 or 404, never 500 (except F3 and F4). Invoices at 21,474,836.47 with payments totalling over 2^31 stay exact.
- **Permissions.** A Case Officer gets 403 on issue, send, payments and credit notes, and may read the three PDFs (agent/invoice:show). No session gets 401 on all seven routes. A receipt or credit-note PDF under another invoice or another firm gets 404.
- **Documents.** `{{total}}`, `) Tj ET BT (pwn) Tj \ (`, parentheses and backslashes in descriptions, names, references and reasons print literally. They are not substituted, and the xref offsets and stream lengths stay valid. The tax and totals printed are the stored ones.
- **Email.** The invoice email is HELD while the details are empty. There is no Cc. A failing mail port gives NOT_SENT and the payment, receipt and event stay. A refused change writes no audit line.
- **Events.** invoice.paid is never written twice, and payment.succeeded is written once per payment. `hasMoney` matches an uppercase company id and refuses malformed input.

Verdict: Changes. Commit `d6948072ee713669f29a979fc9b812620ba57077` has two Majors (F1 and F2).
