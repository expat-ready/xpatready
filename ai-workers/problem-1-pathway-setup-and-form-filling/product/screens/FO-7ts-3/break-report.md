Breaker: fail 738531142067de2d88c428d01af98b44a9eec81a

# FO-7ts part 3: break report (Opus breaker, high effort, P-278)

**What I tested:** branch `claude/sharp-archimedes-rcq3gs`. Postgres 18 on :54329. I built three scratch databases (`xr_brk_fo7ts3_*`): every migration, up to part 2 only, and part 2 then part 3 then the rollback. All three are dropped. The races ran on real `pg` connections at READ COMMITTED (RC) and REPEATABLE READ (RR). The builder's `tests/check_fo7ts_money_settings.ts` gives 140 passed, 0 failed. Nothing was fixed or committed. F = firm id; A, B, C = parties; K, J = case ids.

## Findings

**M1 (Major): a correction of a pick races credit kept on the payee's invoice. At RC both commit, and the kept credit is not backed by money.**
* Before part 3, the correction and the KEPT entry took the same party lock. Comment B6 in part 2 assumes "the entry already holds the party lock". A pick breaks that: the correction locks only A, the payer; the KEPT entry locks B, the invoice's party.
* `money_trust_entry_credit_kept` runs its check before `money_trust_entry_moves` touches the invoice row (AFTER triggers fire in name order). At RC the correction waits on the row, then goes ahead without checking again.
* Setup: B's invoice of 100.00 on case K. A picks 100.00. B pays 50.00 into operating on that invoice, so due = −50.00.
  * T1: `BEGIN; INSERT INTO money_credit_entry (firm_id, person_id, case_id, kind, amount_minor, currency, payment_id, created_by) VALUES (F, B, K, 'KEPT', 5000, 'CAD', <payment>, 'user-R');`
  * T2: `BEGIN; INSERT INTO money_trust_entry (firm_id, person_id, case_id, kind, amount_minor, currency, corrects_entry_id, reason, created_by) VALUES (F, A, K, 'CORRECTION', 10000, 'CAD', <A's pick>, 'Returned to trust', 'user-R'); COMMIT;` T2 blocks.
  * T1: `COMMIT`.
* Result at RC: both commit, ending at due = +50.00 with 50.00 kept, so the kept credit is not backed by any money. Run one after the other, T2 is refused ("must stay paid over"). At RR, T2 gets 40001, which is correct.
* A refund of an operating payment against a correction of a pick (`money_refund_credit_kept`) has the same cause. I did not reproduce it separately.
* Suggested fix, inside the `money_trust_entry_write` this part already replaces: for a CORRECTION that names a WITHDRAWAL_TO_INVOICE, take the invoice party's lock too, smaller id first. Or touch the invoice row (`UPDATE … SET updated_at`) in the BEFORE trigger. Add a DW case for this race.

**M2 (Major): the per-case limit (Lead 95, proposal 3) can be bypassed with one correction row.**
* A CORRECTION can carry any `case_id`. Its branch checks only party and currency, never the corrected entry's case.
* Reproduce. C holds 500 on J and 0 on K.
  * A pick on K is refused: "Only CAD 0.00 is available on it".
  * C pays its own invoice from J: `brk_wd(C, ownInv, 30000, J)`. Then:
    `INSERT INTO money_trust_entry (firm_id, person_id, case_id, kind, amount_minor, currency, corrects_entry_id, reason, created_by) VALUES (F, C, K, 'CORRECTION', 30000, 'CAD', <that withdrawal>, 'Returned to trust', 'user-R');`
  * C now shows K = 300 and J = 200, and a pick of 300.00 on K paying B's invoice is stored. C's money from J has paid B's invoice on K.
* Suggested fix: in the CORRECTION branch, require `NEW.case_id IS NOT DISTINCT FROM` the corrected entry's `case_id`. `money_credit_note_owed_back` already copies it.

**M3 (Major): a pick can pay an invoice that is already paid, and the payer's trust money becomes the payee's credit.**
* `open_amount` (`money_issued_invoice`) counts only credit notes and write-offs. It ignores operating payments and applied credit.
* Reproduce. B's invoice of 100.00 on K is paid in full into operating, so `money_invoice_due` = 0.
  * A's pick of 100.00 is stored, and due becomes −100.00.
  * `INSERT INTO money_credit_entry (…'KEPT', 10000 …, payment_id = B's payment)` is accepted. B now holds 100.00 of credit, and that money came out of A's trust.
* For a single party this overpayment already existed (FO-7a). The pick makes it cross clients.
* Suggested fix: refuse a pick above `greatest(money_invoice_due(firm, invoice), 0)`, read after the invoice row (that is, after `money_issued_invoice`).

**m1 (Minor): a pick and a "Move back to trust" credit note take the two party locks in opposite orders, which causes 40P01.**
* The pick locks the smaller id first. `money_credit_note_write` (FO-7lk) locks the withdrawal's party first, then the invoice's party. Its comment says the withdrawal is "of the invoice's party", which a pick makes untrue.
* The credit note takes the lock even when its own checks refuse it a moment later.
* Reproduce with A < B. B picks on A's invoice. Then race `INSERT INTO money_credit_note (…, overpaid_choice, overpaid_entry_id, overpaid_minor) VALUES (…, 'OVERPAID_TO_TRUST', <B's pick>, 100)` against a second pick by B on the same invoice.
* Result: 15 of 40 natural RC races ended in `40P01 deadlock detected`. The forced order gives 40P01 at RC and at RR.
* No money is wrong, but the "no 40P01" aim of FO-7lk and DW26 does not hold. The brief forbids editing `money_credit_note_write`. Suggested fix: the Lead allows a one-line sort there, or this is written up as a known retry.

**m2 (Minor): invoices issued before part 3 keep `tax_treatment` NULL forever.**
* The new freeze counts NULL as a frozen value, so `UPDATE … SET tax_treatment = 'TAXABLE'` is refused ("INV-0001 is fixed").
* Under "null = the party's", a later party row marked EXEMPT would change how FO-7g reads an invoice that was already issued.
* Suggested fix: in the migration, before the function is replaced, set every issued invoice to `TAXABLE`. That is what issuing would have chosen, because no party treatments exist yet.

**m3 (Minor): the migration cannot run on a database that already has trust refunds.**
* It refuses a database with any REFUND_TO_CLIENT and says "record them by hand, then rerun". That is impossible: the entries can only be inserted (UPDATE is refused), and a refund cannot be corrected.
* No route or seed writes such refunds today. The refusal is safe, but its wording sends the reader into a dead end. Suggested fix: name the real way out, or note that this is not expected.

**m4 (Minor): `refunded_on` accepts any date.** `9999-12-31` and `0001-01-01` were both stored. Suggested fix: a bound check, for example `refunded_on <= current_date + 1` and no earlier than the firm's first trust entry, or the route checks it.

**m5 (Minor; the documented boundary, carried over from part 2): the database cannot tell whether the payer is on the case.**
* "Same case" compares two `case_id` values the caller supplies. There is no foreign key and no case-party check (contract §1 rule 4).
* A deposit from any stranger tagged with case K can pay B's invoice on K. For example, a company with no link to K deposited onto it and then picked.
* The route (FO-7t part 2) has to prove the payer is on the case. Its tests should include a stranger tagged with the case.

## What held

* **Pick refused:**
  * across cases, or with no case on either side, with the specific wording;
  * with no reason, a blank reason, a reason of 201 characters, a `by` that is not the writer, or a lone `at`;
  * with no pick fields at all;
  * on a draft invoice;
  * in another currency (USD money on a CAD invoice);
  * when the invoice is in another firm;
  * with pick fields on a DEPOSIT;
  * as "nothing to pick" when it is the same party on the same case.
* **The database's clock:** a typed `picked_other_funds_at` of 2001 is replaced with the database's time.
* **Below zero (DW25):** a pick of 100.01 against 100.00 on the case is refused. After a bounced cheque left the payer at −100.00, and again at −70.00 after a deposit on another case, any pick is refused with #1991's words.
* **Company payers:** a company paying a person's invoice, and a person paying a company's, both work, and the per-case limit applies in the company branch.
* **Running as `xr_app`:** a pick works with the wall's firm id set.
* **Races:**
  * Two picks crossing on one case, 20 runs each at RC and RR: 40 ok, no 40P01.
  * Four payers each picking 200.00 on one 300.00 invoice, 10 rounds each at RC and RR: trust paid never went over 200.00. The rest were refused with 23514 at RC and 40001 at RR.
  * A pick racing a deposit to A, a deposit to B, a credit note and a write-off, 20 rounds each at RC and RR: no invoice was credited past its total.
* **Refunds:** CARD and CARD_TERMINAL are refused in words. A third-party payee needs a reason (a blank one is refused), and a reason given for the entry's own person is refused. Refund details on any other kind are refused.
* **Tax treatment:**
  * The treatment is set at issue, from the party row (person and company) or Taxable when there is none. A row in another firm is not used.
  * A treatment set on the draft is kept. Changing it, or setting it to NULL, on an issued invoice is refused.
  * A later change to the party row does not move an issued invoice.
  * Uniqueness holds, and so does exactly-one-party.
* **PF-12's walls from `xr_app`:** rows are visible only in the session's firm. Inserting into another firm, moving a row to another firm, or writing with no firm set are all refused. Updates and deletes aimed at the other firm reach nothing.
* **Index:** `(firm_id, issued_at DESC, id)` exists, and an index-only scan uses it.
* **Rollback:**
  * Run from the wrong folder, it is refused and the transaction is undone.
  * It is refused when picks, refunds or treatments are recorded.
  * Run from the studio folder, the catalog (columns, constraints, indexes, function bodies, owners and settings, enums, triggers, policies, rights) is identical to a part-2-only database. Part 3 then applies again cleanly.
