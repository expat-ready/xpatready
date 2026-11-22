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

## Round 2 (diff d6948072e..7e6e48c1f)

Commit broken: `7e6e48c1f3222d282722c16ac16c8e40f8e54c7e`. Only the diff was attacked. How I tested: a scratch copy of `tests/check_fo7b_invoices.ts` (its setup) plus about 40 attacks, on scratch databases `xr_studio_brk7b2_scratch_*` at :54329. They were dropped and the copy deleted. The shipped check passes 98/98. The oracle for "what was due right after the payment" is the payment's own audit line (`invoiceDueMinor_after`, written under the lock).

**R2-F1, Major: a receipt's "balance after" is wrong under concurrent writes, and can change after it was emailed (F2 not fully fixed).**
The as-of read orders credit notes, write-offs, trust withdrawals, trust returns and credit entries by `created_at <= receipt.issued_at`. Every one of those is the database's `now()`, which is the *transaction's start*, not its commit order. A writer that began first but waited on the lock is counted as earlier. One that began later but committed first is left out. Operating payments are ordered by receipt number, which is correct, so the two orders disagree.
- Seeded, deterministic: a credit note of 100.00 in a transaction that began before a 300.00 payment on 1,000.00 and committed after it. The emailed receipt said 700.00, the re-download says **600.00**, the truth is 700.00.
- API only: one operating payment and one trust payment at the same moment, 20 runs. 2 receipts were wrong; one says 690.00 against a true 700.00 *after* the email said 700.00. Operating payment plus credit note: 1 of 20 in one run, 0 of 20 in another, the same change after email.
- Storms of 24 writes on one invoice: 6 of 8 storms produced wrong receipts, worst R-0107, which prints 130.00 against a true 60.00.

No 500, and the answer's `appliedMinor` always equalled the audit line's.
Where: `api/src/client-money/invoices/money.ts:203-217` (`c.created_at <= r.issued_at`, `w.created_at`, `e.created_at`, credit `e.created_at <= issuedAt`). Timestamps come from fo7a `money_receipt_write` (`issued_at := now()`, migration line 1088) and the `created_at := now()` triggers.

**R2-F2, Major: in the new F1 path, the receipt tells the client their money is "kept in trust" when it covered a shortfall and the invoice is still owed.**
- A client at −50.00 pays 100.00 into trust on a 100.00 invoice. The answer gives 201, 50.00 applied, trust balance **0.00**, 50.00 due. The receipt prints "Balance due … after this payment: CAD 50.00" and then "**CAD 50.00 is more than this invoice asked: kept in trust.**" Both are on one page, and nothing is in trust.
- A client at −150.00 pays 100.00: 0 applied, balance −50.00, 100.00 due. The receipt says "CAD 100.00 is more than this invoice asked: kept in trust". The audit says "CAD 100.00 is extra". The answer's `extra` is 100.00 with no note.
- A client at −50.00 pays exactly 50.00: the same text for 50.00.

Expected: the receipt does not call shortfall money extra or held. Where: `money.ts:106` (applied capped by `held`), `money.ts:226-227` (`extraNow = amount − applied`), `money.ts:112` (audit summary), `documents.ts:44` (`keptInTrust` wording).

**R2-F3, Minor: a receipt reprints the firm's *current* address (new in this diff), so its text changes when the firm moves.**
What I did: changed `platform_firm.business_address` after a receipt was issued. The same receipt then read "99 New Rd, Toronto, Canada" instead of "1 Main … St, Ottawa …". Firm name and bill-to are read live too (from round 1, not new).
Where: `money.ts:233,238`, `documents.ts:30`.

**R2-F4, Minor (latent): the payment's own `extra` ignores KEPT credit.**
What I did: an invoice where a payment of 160.00 overpaid by 60.00, with 30.00 of that seeded KEPT and then 10.00 REVERSED. Replaying that payment's key answers `extra` 60.00 with choices REFUND and KEEP_AS_CREDIT, although 20.00 is already kept. The invoice view is right. No route writes KEPT yet.
Where: `money.ts:226-227`.

**R2-F5, Minor (wording):** due date `3000-01-01` → 422 "A date from the year 2000 on." The rule is a 2999 upper bound, and the message names only the lower one. Where: `ports/client-money.ts:84` (`day`).

### What held (round 2)
- **Receipts, sequential.** Two receipts (one operating, one trust) stayed word for word after: later operating and trust payments, an API credit note, a seeded refund, a seeded trust return (CORRECTION naming the withdrawal), seeded KEPT, APPLIED and REVERSED credit, and a seeded write-off. A payment after all of them prints the true balance, and the view equals `money_invoice_due`. A credit-note PDF prints no balance. A trust receipt's balance after is right when nothing runs at the same time.
- **F1.** No 500 and no WITHDRAWAL_TO_INVOICE row below zero in these cases: −50.00, −150.00, exactly cured (−50.00 + 50.00), a balance of 0, USD, a company bill-to, and 6 concurrent trust payments for one short party over two invoices.
- **F5.** With KEPT, APPLIED and REVERSED (of both kinds), `dueMinor`, `extraMinor` and the status equal `money_invoice_due` and `money_invoice_credit` at each step. `extraMinor` was never negative. A receipt after applied and reversed credit is right.
- **F3.** One key on two parties' invoices at once: 201 + 409 KEY_USED in 6 of 6 runs. One key in two firms: 201 + 201 in 6 of 6. 16 parties, each with a payment and a credit note, all at once: all 201, no number clash read as KEY_USED.
- **F4 and F6.** 1999-12-31 gets 422; 2000-01-01 gets 200 and reads Overdue; 2999-12-31 gets 200. An invoice cancelled by two part credit notes, or part paid and then fully credited, is not sent (409 CANCELLED).
- **F7.** The shipped case holds, and lines can't be negative (the DB checks `unit_amount_minor >= 0`), so no total below zero can be issued.
- **Address.** `{{balance}}` in a street name prints literally. A newline was only possible by direct SQL; the writer refuses control characters (`platform/billing/account.ts:23`). Non-string parts are dropped.
- **Regressions.** R3-F2: a backdated well-formed second line, and one in firm B, left the receipt text unchanged, and the replay still answered 300.00. 12 payments at once sum to exactly 1,000.00, with invoice.paid written once. One key 8 times at once gives one 201 and seven 200s. A Case Officer gets 403, and firm B gets 404 on a receipt. There is one audit line per payment, and no storm produced a 500, a 40P01 or a 40001.

Verdict: Changes. Commit `7e6e48c1f3222d282722c16ac16c8e40f8e54c7e` has two Majors (R2-F1 and R2-F2).

## Round 3 (diff 7e6e48c1f..521e016ee)

Commit broken: `521e016eeb4127e2648dda7b2da875f8ea80d28e`, diff only. How I tested: a scratch copy of `tests/check_fo7b_invoices.ts` plus about 45 attacks, on `xr_studio_brk7b3_scratch_*` at :54329. The databases were dropped and the copy deleted. The shipped check passes 101/101. Oracles: the emailed PDF bytes against every later download, and each invoice's audit lines (payments and credit notes) sorted into one before→after chain from the total down to today's due.

**R3-F1, Major (new in this diff): a trust payment from a client who already has money in trust takes that money too, and the receipt prints a negative extra.**
- What I did: a client with +50.00 in trust (the 50.00 extra from an earlier trust payment) pays 100.00 into trust on a 300.00 invoice.
- Expected: 100.00 applied, 200.00 due, the 50.00 stays in trust.
- Actual: 201 with **150.00** applied (`trust.appliedMinor` 150.00 against `depositedMinor` 100.00). The WITHDRAWAL_TO_INVOICE is −150.00, so the balance is 0 and nobody chose to use the held 50.00. 150.00 stays due. The audit line has `extraMinor` −5000 and the summary says "CAD −50.00 is extra". The receipt says "**CAD -50.00 is more than this invoice asked: kept in trust.**"
- The same happens in USD (+20.00: 120.00 applied, "USD -20.00 …"), with a company bill-to, and in 3 of 3 runs of two trust payments at once (one applies 150.00, the other 100.00).
- Where: `api/src/client-money/invoices/money.ts:115` (`applied = min(dueBefore, held)` caps by the balance, not by this payment's amount minus the shortfall), `:118`, and `documents.ts:45` (prints any non-zero `extraMinor`, including a negative one). The fix test only covers balances ≤ 0.

**R3-F2, Minor: the receipt and the replay trust whichever audit row is earliest, and don't check its fields.**
- Two rows: I seeded by SQL a second `payment.recorded` row for the same payment in the same firm, backdated by a day. The receipt then printed "Forged Firm", "Paid by: Mallory", 1,234.56 due and 999.99 extra. The replay of the key answered `appliedMinor` 1 and "Paid twice?". A later-dated row and another firm's row changed nothing.
- Bad fields: a row without the new keys (the shape before this commit) prints "Paid by: Client", an empty letterhead and 0.00 due. A row with non-number fields prints "CAD N.aN" and "1..5". The replay of that key gets a **500**.
- Only reachable through SQL, because audit_event takes inserts only. Where: `money.ts:214` (`order by at limit 1`, with no check on actor or `paymentId`), `:216` (`Number(…)` with no integer check).

**R3-F3, Minor (latent, R2-F4 only partly fixed):** with 20.00 of a 60.00 extra seeded KEPT, the replay still offers 60.00 with Refund · Keep as credit, while the view says 40.00. Choices disappear only when every cent is kept. Where: `money.ts:226` (`amountMinor: extraThen`, not `waiting`).

### What held (round 3)
- **R2-F1.** Operating payment, trust payment and credit note at once, 20 runs: no 500. Every emailed PDF is byte-identical to the download after later writes, every "after this payment" equals its audit line, and every chain is unbroken. 8 storms of 24 writes gave the same, with no 500 (one 409 TRUST_PAID). The shipped overlapping credit note case passes.
- **R2-F2 (trust at zero and below).** Balances of 0, −0.01, exactly −payment and −150.00, in CAD, USD and for a company: never a negative extra, never "kept in trust" on shortfall money, the balance after = before + paid − applied. A paid invoice at −50.00 with 100.00 into trust: 50.00 made up and 50.00 kept, both said. Two trust payments at once at −50.00 (5 runs) and six at once over six invoices (4 runs): the shortfall is made up exactly once, with no 500.
- **Audit read.** A payment with no audit line (seeded): receipt 404 and replay 404, and the invoice can still be read and paid.
- **Letterhead (R2-F3).** After renaming the firm, moving it, changing its tax number, turning tax registration off and renaming the client, the issued invoice prints the old name, address, tax number and bill-to, with the new "How to pay". The receipt and the credit note are byte-identical. A receipt issued after the change prints the new letterhead.
- **P2002.** The same key on two parties' invoices at once: 201 + 409 KEY_USED, 6 of 6.
- **Regressions.** R3-F2: a backdated well-formed second line, and one in firm B, left the receipt text unchanged, and the replay still answered 300.00. 12 payments at once sum to 1,000.00 with 200.00 extra and paid once. One key 8 times gives 201 + 7×200. A Case Officer gets 403 and firm B gets 404 on a receipt. R2-F5's message now says 2000 to 2999.

Verdict: Changes. Commit `521e016eeb4127e2648dda7b2da875f8ea80d28e` has one Major (R3-F1).

## Round 4 (diff 521e016ee..7c3c0b5ba)

Commit broken: `7c3c0b5baae55ceb9b0751035283ab7e52d9b959`, diff only. How I tested: a scratch copy of `tests/check_fo7b_invoices.ts` plus 43 attacks, on `xr_studio_brk7b4_scratch_*` at :54329. The databases were dropped and the copy deleted. The shipped check passes 104/104. Paths are under `prototype/studio/api/src/client-money/invoices/`.

**R4-F1, Major (new in this diff): the one change the schema allows to a payment, the cheque's "Cleared" tick, makes its receipt and its replay 404 for good.**
- What I did: recorded a 10.00 cheque, then ran fo7a's permitted `update money_payment set cleared = true, cleared_at = now(), cleared_by = 'user-R'` (the same statement FO-7mv's check uses). The payment's xmin moved from 226607 to 226608, and its audit line stayed at 226607.
- Actual: `receipt.pdf` was 200 before the tick and **404** after it. Replaying the same key also gives **404** "No such payment in your firm", so a retry reads as unrecorded and invites a second cheque under a new key.
- Any table rewrite does the same to every payment. After `alter table audit_event add column … default gen_random_uuid()`, 0 of 89 payments match and every receipt is 404. A logical dump and restore would load the two tables in separate transactions with new xmins. I couldn't run that here (pg_dump is 16, the server is 18).
- What held: VACUUM FREEZE and VACUUM FULL kept 88/89 (the one miss was the ticked cheque), and the receipt stayed 200.
- The Cleared action is not built in this part. This finding is about the receipt, which is: its read depends on a physical row version. Where: `money.ts:215-216`. A key that never changes, such as `detail->>'paymentId'` plus the actor and the payment's `recorded_by`, or the receipt's own row, would not have this problem.

**R4-F2, Minor (R3-F2 not fully closed): the figure check passes null or missing as 0, and the same-xmin line it trusts can still be forged by SQL.**
- In one SQL transaction: tick a cheque Cleared, then insert a `payment.recorded` line for it. That line now has the payment's xmin. The receipt printed "Forged Firm", "Paid by: Mallory" and 1,234.56 due, and the replay answered `appliedMinor` 1.
- With `dueAfterMinor: null`, or the key removed, the receipt prints "after this payment: CAD 0.00" against a true 580.00, with no 404. A forged `paidTwice: true` with extra 5.00 offers Refund · Keep as credit. The letterhead fields are not checked.
- A string, a negative, 1.5, 1e20, true, "5" or an object each gave a 404 with no 500. SQL only. Where: `money.ts:218` (`a.d[k] ?? 0`), `:219`, `:229-230`.

### What held (round 4)
- **R3-F1.** For a +50.00 balance, 100.00 into trust on 300.00 applied 100.00, left 200.00 due and kept the balance at 50.00, with no extra. Same in CAD and USD, and for a company in both currencies.
- **Other balances.** Held +0.01, equal to the amount due, equal to the payment, above the payment (200.00), and 20,000,000.00 behaved the same way. +50.00 on 80.00 due: 80.00 applied and "CAD 20.00 … kept in trust", with a balance of 70.00. An invoice already paid: all 100.00 is extra, "Paid twice?". Balances of 0, −0.01, −50.00, −150.00, and −50.00 USD for a company all came out right.
- **The sums.** In all 18 cases `shortfall + applied + extra = amount`, the extra was ≥ 0, the receipt words were exact and no amount was negative.
- **Races.** Two trust payments at once (3 runs) applied 100.00 each and left the balance at 50.00. Six at once on one 300.00 invoice (3 runs) applied 300.00 in total, with a 300.00 extra, a 350.00 balance and invoice.paid written once.
- **R3-F3.** With 20.00 KEPT, `waitingMinor` is 40.00, the amount is 60.00, both choices are offered and the view says 40.00. After 10.00 is reversed, all three say 50.00. When everything is kept: 0, no choices. The database refuses KEPT beyond the extra. The receipt still prints 60.00.
- **Regressions.** R3-F2: a backdated well-formed second line, and one in firm B, left the receipt text unchanged, and the replay still answered 300.00. 12 payments at once summed to 1,000.00 with 200.00 extra and paid once. One key 8 times gave one 201 and seven 200s. A Case Officer gets 403, and firm B gets 404 on a receipt. No 500 anywhere.

Verdict: Changes. Commit `7c3c0b5baae55ceb9b0751035283ab7e52d9b959` has one Major (R4-F1).

## Round 5 (diff 7c3c0b5ba..2d8eaa844)

Commit broken: `2d8eaa844d82537ebcf7352add433bacb7b5ca33`, diff only (`money.ts` paymentView, `receiptOf`, the check). How I tested: a scratch copy of `tests/check_fo7b_invoices.ts` plus 36 attacks, on `xr_studio_brk7b5_scratch_*` at :54329. Everything passed (140/140, shipped cases included), the databases were dropped and the copy deleted.

**No findings.**

### What held (round 5)
- **R4-F1, Cleared tick.** I recorded a 10.00 cheque into operating and a 20.00 cheque into trust (acknowledged), then ticked both Cleared by SQL. Both receipts are 200 before and after, word for word, and still say "Not yet cleared", as the emailed receipt did. The trust replay answers 200 with the same applied amount and `cleared: true`, the live state. The database refuses an un-tick ("a payment never changes").
- **R4-F1, rewrites.** I rewrote `audit_event`, `money_payment` and `money_receipt` with `add column … default gen_random_uuid()` (the payment's xmin moved), then ran VACUUM FULL. For all 53 staff payments, each receipt and each replay (status, text, applied, extra, trust) matched the snapshot taken before.
- **Dump and restore.** pg_dump here is 16 and the server is 18, so pg_dump refuses to run. In its place I built a fresh database from the migrations, copied every public table out and in with COPY (triggers off, sequences set), renamed it into place and reconnected the app. That gives every row a new xmin and loads each table separately. All 53 receipts were word for word the same and all replays gave the same status and figures: 46 at 200, 7 at 404 (the forged ones, below).
- **Forged lines (R3-F2, R4-F2).** Each was tried on its own fresh payment:
  - Gave 404 for both the receipt and the replay: an exact copy, a copy with other figures, a missing figure, `paidTwice: "true"` and `cleared_after: null`.
  - Left the receipt text unchanged and the replay at 200 with 30.00 applied: another firm's id, receiptNumber R-9999, the receipt number in lower case or with a leading space, an upper-case paymentId, another payment's id, and the action with a trailing space.
- **The only line damaged in place** (triggers off as owner): `dueAfterMinor` set to 1.5, "5", null, −1 or 1e20, `appliedMinor` set to 2^53+1, `cleared_after` set to "false", `paidTwice` set to 0, and the whole detail set to `[]`, `"x"` or `null`. Each gave 404, never a 500. A value of 3000.0 (the same number) gave the unchanged receipt. Restoring the line brought the receipt back to 200, the same.
- **Exactly one line per legitimate payment:**
  - 12 at once on one invoice summed to 1,205.00, all 201.
  - One key sent 8 times at once gave one 201 and seven 200s, with the same payment and figures.
  - A client at −150.00 paid into trust twice at once: both 201, with no negative extra.
  - Overpayments into trust and into operating, and a payment on an invoice already paid, were all recorded.
  - Every staff payment in the database has exactly one matching line, apart from the two the shipped check forges. All of the receipts above are 200.
- **Regressions.** Firm B gets 404 on a receipt, and a Case Officer can read one (200, invoice:show). The shipped R3-F1, R3-F3, race, wall and audit-count cases pass.
- **Observation, not a finding.** A duplicate line forged by SQL makes the replay answer 404 "No such payment in your firm", which reads as unrecorded. That is the 404 the diff promises, and it can only be reached through SQL.

Verdict: Approve. Commit `2d8eaa844d82537ebcf7352add433bacb7b5ca33`: R4-F1 and R4-F2 are closed, with no new finding.
