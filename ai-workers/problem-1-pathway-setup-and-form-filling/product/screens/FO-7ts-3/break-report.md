Breaker: pass a15e5f7ece04fbc91c335d34724e8dd62ebd8104

# FO-7ts part 3: break report, round 4 (head a15e5f7ec, one commit on top of fce13845d)

**What I tested:** a fresh scratch database with every migration at this head, plus a reference database and a rollback database; all three are dropped. Races ran on real connections at READ COMMITTED (RC) and REPEATABLE READ (RR). `check_fo7ts_money_settings.ts`: 154 passed, 0 failed. Nothing was fixed or committed. I found no Blocker, Major or new Minor.

## What held

* **R3-m2 is fixed.**
  * The round-3 reproduction: W's −500.00 bounce on K, while 500.00 is held before a case, is refused in words ("takes from before a case first (CAD 500.00 held there)").
  * Booked before a case it is stored. K keeps its 500.00, and nothing is left before a case to move to J.
* **Pre-case first, then the case (G):** a 500.00 cheque, 300.00 of it moved to K.
  * The correction on K is refused while 200.00 is held before a case.
  * 200.00 before a case, then 300.00 on K, are both stored, and every pool ends at 0.
* **A bounce larger than the pre-case pool plus what was moved can always be booked (X):** a 500.00 cheque; 100.00 moved to K; 300.00 paid X's own invoice before a case.
  * 100.00 before a case, then 100.00 on K, are both stored. 300.00 more on K is refused (cap 0.00).
  * The remaining 300.00 is stored before a case, taking that pool and the party to −300.00, with the shortfall shown (−300.00).
  * So no correction is left that can never be booked: the deposit's own pre-case booking always takes a reversal, even below zero.
* **A pre-case pool below zero:** a later deposit before a case only reduces the shortfall (−250.00). Moves from that pool stay refused, because the move check refuses at zero or below.
* **The bounce on K racing a move pair, 20 runs each.** Setup: 300.00 held before a case, the cheque's money already moved to K.
  * RC: the move was always stored; the bounce on K was stored once the move had emptied the pre-case pool (17) and refused otherwise (3).
  * RR: the bounce on K was always refused, because its snapshot still saw the 300.00.
  * Invariant: no booking on K was ever made while the pre-case pool held money (checked by seq).
* **The bounce on K racing a deposit before a case, 20 runs each:**
  * RC: the deposit was always stored; the bounce on K was stored 18 times and refused twice.
  * RR: the stale write fails on the duplicate key (23505).
  * No booking on K was ever made while the pre-case pool held money.
* **Unchanged from round 3:**
  * M1 (kept credit against a correction): refused at RC, fails to serialise (40001) at RR.
  * A credit note against a pick: 40 of 40 races with no 40P01.
  * An undo racing a credit note and a pick, 25 runs each at RC and RR: no 40P01.
  * A single pick-line: no 40P01 at RC or RR.
  * Two 0.60 corrections against a 1.00 move: both are refused now, because pre-case money is still held (as the rule intends).
* **Rollback:** run from the wrong folder it is refused. From the studio folder the catalog is identical to part 2, and part 3 then applies again.
* **R3-m1 wording:** the comments, `FO-7t.md` and `FO-7m.md` now say the route takes every lock its lines need, sorted, before the first line. Both multi-line forms still give 40P01 at RC and RR, the unsorted batch and the batch sorted by line party, as documented. That is assigned to FO-7t part 3.

## Note (not a finding)

* A party can still choose which moved-to case takes a bounce, by first emptying the pre-case pool with a move.
* Example V: 500.00 cash moved to K, a 500.00 cheque moved to J, then the cheque's bounce booked on K. The result is K 0 and J 500.00.
* This choice is built in: a move does not name the deposit it came from. It is limited by the cap and needs a deliberate move.

---

Breaker: pass fce13845d0cea57092eb0cc1fa4277fa738c1777

# FO-7ts part 3: break report, round 3 (head fce13845d, main merged, #2204 on main)

**What I tested:** a fresh scratch database with every migration at this head, plus a part-2 reference database and a rollback database; all three are dropped. Races ran on real connections at READ COMMITTED (RC) and REPEATABLE READ (RR). `check_fo7ts_money_settings.ts`: 154 passed, 0 failed. Nothing was fixed or committed. No Blocker or Major is left. The two Minors below are for the move route (FO-7t part 3) and for the Lead.

## Round-2 fixes: all hold

* **R2-M1:**
  * The round-2 reproduction (1.00 moved to K, a −500.00 bounce put on K) is refused, with the cap named in words ("at most … CAD 1.00").
  * A split works: 1.00 on K plus 499.00 before a case are both stored. Every pool ends at 0, and nothing is left before a case to move to J.
  * Two corrections of 0.60 each against 1.00 moved: the second is refused with "0.40" available, and 0.40 is then accepted. A second cheque bounced on K after that is refused (0.00).
  * The same two corrections run as a race, 15 runs each: at RC one is refused (23514); at RR one fails on the duplicate key (23505). K never went below what was moved there.
* **R2-m2:** an unrelated party's correction naming A's pick no longer waits on B's lock (16 ms, refused).
* **Refund dates:** a refund dated before the party's first trust entry is refused; one dated today is accepted.
* **Credit note and undo:**
  * A "Move back to trust" credit note against a pick: no 40P01 in the forced order (RC 23514, RR 40001), and 40 of 40 natural races with none.
  * A three-line undo racing a credit note and a pick, 25 runs each at RC and RR: no 40P01 (only 23514 or 40001).
* **Unchanged from earlier rounds:**
  * M1 (kept credit against a correction) is refused at RC and fails to serialise at RR.
  * Crossing picks, 20 runs each: all accepted, no deadlock.
  * Four payers on one invoice never paid more than was due.
  * Deposits, a credit note and a write-off racing a pick never credited an invoice past its total.
* **Rollback:** run from the wrong folder it is refused. From the studio folder the catalog (all five functions included) is identical to part 2, and part 3 then applies again. An invoice issued before part 3 becomes TAXABLE at migration.

## The move-line race (forced order: the pick starts between the batch's lines)

* **Single line**, a pick's line (payer A, invoice of B) against another pick on B's invoice, both id orders, pick started before and after the line:
  * RC: all accepted.
  * RR: one side fails to serialise (40001).
  * No 40P01 in any case.
* **Two lines, inserted unsorted** (B's line, then C's, with C < B) against C's pick on B's invoice: **40P01** at RC and at RR. This is the case that was documented as expected.
* **Two lines, sorted by the line's party** (C's line, then B's): no 40P01 (RC accepted, RR 40001).
* **Not confirmed: "only the unsorted case still deadlocks"** (see R3-m1).

## New findings (Minor only)

**R3-m1 (Minor): sorting a batch's lines by their own party is not enough; a sorted batch still deadlocks (40P01 at RC and RR).**
* A pick's line also locks the invoice's party, so one line holds two parties.
* Reproduce with P1 < P2 < Q:
  * Line 1 is P1's pick on Q's invoice, sorted first. It locks P1 and Q, then takes the row of Q's invoice.
  * Line 2 is P2's own withdrawal.
  * Meanwhile P2 picks on Q's invoice: it locks P2, then waits on Q.
  * Line 2 then waits on P2, and the two deadlock.
* The comments in `money_move_line_write` and the header both offer "sorted by party (the smaller id first)". Only their other option holds: take every line's locks (each payer and each invoice's party), sorted, before the first line.
* Suggested fix: drop the "sorted by party" wording and assign "lock all parties first" to FO-7t part 3, with this case as its test.

**R3-m2 (Minor): the cap counts money moved to K from any deposit made before a case, so a real bounce booked on K can free money that was moved to K.**
* Reproduce. W holds 1,000.00 on M. W has cash of 500.00 before a case, all moved to K, and a cheque of 500.00 before a case that was never moved.
  * The cheque bounces, and its −500.00 is booked on K. This is accepted although the pre-case pool covers it.
  * W now shows K = 0 and 500.00 before a case. W moves that 500.00 to J and picks it for B's invoice on J (accepted).
* No money is created: the party balance stays right, and the shift is limited to what was moved to K. But the cash staff moved to case K ends up paying another client's invoice on J.
* Suggested fix: book on a moved-to case only the part the pre-case pool cannot cover (`-NEW.amount_minor - pre-case held`, floored at 0), within the cap. Or have the route offer pre-case first.

---

Breaker: fail 73adf83e5c19d82d86517ccf037ac5ce86909856

# FO-7ts part 3: break report, round 2 (head 73adf83e5)

**What I tested:** a fresh scratch database at this head, plus a part-2 reference database and a rollback database; all three are dropped. Races ran on real connections at READ COMMITTED (RC) and REPEATABLE READ (RR). `check_fo7ts_money_settings.ts`: 150 passed, 0 failed. Nothing was fixed or committed. Round 1 is kept in full below (P-188), so the file is now over 100 lines. F = firm; G, B, C = parties; K, J, M = cases.

## Round-1 fixes: all hold

* **M1:** the correction now waits on the advisory lock, then is refused at RC ("must stay paid over"); at RR it fails to serialise (40001). The sequential control is still refused.
* **M2:** a withdrawal's correction tagged with another case is refused. The bounce variant (a 500.00 cheque before a case, all of it moved to K, then bounced, with the correction put on K) is accepted, and every pool ends at 0.
* **M3:** a pick on an invoice already paid from operating is refused ("0 due"). Four payers each picking 200.00 on one 300.00 invoice: trust paid never went over 200.00.
* **m1:**
  * The forced-order reproduction no longer deadlocks at RC or RR, and a natural race of a pick against a credit note gave 40 of 40 with no 40P01.
  * A three-line undo racing a "Move back to trust" credit note and a pick, 25 runs each at RC and RR, with the party order alternated: no 40P01 (only 23514 or 40001).
* **m2:** an invoice issued before part 3 becomes TAXABLE at migration.
* **m4:** a refund dated today + 2 is refused (dates far in the past are still accepted).
* **Unchanged:** crossing picks, and a pick racing deposits, a credit note and a write-off, behave as in round 1.
* **Rollback:** from the wrong folder it is refused. From the studio folder the catalog (all four functions included) is identical to part 2, and part 3 then applies again.

## New findings

**R2-M1 (Major): the moved-to-case exception for a deposit's correction has no amount limit, so the per-case limit (M2) can be bypassed again.**
* A deposit made before a case may now be corrected on any case its party ever moved money to, for any amount. The amount the correction takes off that case stays visible as pre-case money, which can be moved to another case and picked.
* Reproduce. G holds 1,000.00 on M.
  * `brk_dep(G, 50000, NULL)` (cheque Q). Move 1.00 from pre-case to K with the pair (−100 with no case, then +100 on K, naming it).
  * `INSERT INTO money_trust_entry (firm_id, person_id, case_id, kind, amount_minor, currency, corrects_entry_id, correction_kind, reason, created_by) VALUES (F, G, K, 'CORRECTION', -50000, 'CAD', Q, 'RETURNED', 'Cheque bounced', 'user-R');` This is accepted. G now shows pre-case 499.00 and K −499.00.
  * Move the 499.00 to J (accepted), then pick 499.00 from G on B's invoice on J (accepted).
  * Result: G ends at a balance of 501.00 while M still shows 1,000.00. G's money on M paid B's invoice on J. No shortfall is shown, because G's party balance stays positive.
* `OTHER`, `WRONG_CLIENT` and `RECORDED_BY_MISTAKE` work the same way; no bounced cheque is needed.
* **Suggested fix:** in the exception, take only what is needed. Put the correction on the moved-to case only when the pre-case pool cannot cover it, and for at most what this party moved to that case net of earlier deposit corrections put there:
  `-NEW.amount_minor <= sum(+ halves on NEW.case_id) - sum(-(deposit corrections) already on NEW.case_id)`
  Anything more goes on pre-case. Add a DW case using this reproduction.

**R2-m1 (Minor): a move batch with lines from two parties deadlocks against a pick (new with picks).**
* `money_move_line_write` takes each line's party lock and then that line's invoice row, one line at a time. A pick takes both parties first, then the row.
* Reproduce with C < B.
  * T1: `BEGIN;` insert the batch, then line 1, whose source is B's own withdrawal on iB. This locks B and takes the row of iB.
  * T2: C picks on iB, in B's case. It locks C, then waits on B.
  * T1: insert line 2, whose source is C's withdrawal on iD. It waits on C.
  * Result: 40P01 at RC and at RR.
* `money_move_line_write` is on the brief's do-not-edit list, so this needs a Lead ruling. Options: the route writes a batch's lines sorted by party, or the line writer also takes the invoice party's lock, smaller id first.

**R2-m2 (Minor): a correction that will be refused still waits on another party's lock.**
* The new pre-lock reads the corrected entry's invoice and locks its party before the "same party" check runs.
* Reproduce: X, an unrelated party, writes a correction naming A's pick while B's lock is held. It waits 1.0 s on B, then is refused (23514).
* This is the FO-7lk break B-1 concern ("a refused write takes no lock of another party"). No money is wrong. Suggested fix: lock the invoice's party only when the corrected entry's party equals `NEW`'s party.

**R2-m3 (Minor, note): an operating payment can race past the M3 cap.**
* A payment on the invoice touches neither the invoice row nor a party lock.
* Reproduce: B's payment of 100.00 on iB is left uncommitted while A's pick of 100.00 commits. Both commit at RC and at RR, due ends at −100.00, and B can keep 100.00 as credit.
* The end state is the same as the allowed order (pick first, then B pays), so this is noted only. A fix would mean the payment writer touches the invoice row (FO-7a, outside this part).

---

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
