# FO-7a break report: client-money tables (breaker: money, schema)

Commit 6e19e4ef2 on claude/affectionate-thompson-m1w7kd (PR #1758). Scratch database `xr_studio_fo7a_break_1` on :54329 had every migration applied in name order, plus two `platform_firm` rows (A `aaaaaaaa-…01`, B `bbbbbbbb-…01`) and a `money_payment_settings` row for each. I attacked it with psql and with `pg` clients from the studio's node_modules, at READ COMMITTED, REPEATABLE READ and SERIALIZABLE. The database was dropped at the end. Line numbers refer to `prisma/migrations/20261114131305_fo7a_client_money_tables/migration.sql`. In the SQL, `:A` stands for firm A's id and `:P` for a person uuid. Cost: US$0.

## Breaks

**B-1 Major: a single statement skips every `IF FOUND AND …` check.** Several triggers look up the row they point at and check it only `IF FOUND`, on the idea that "the foreign key refuses it" otherwise. If the row they point at is inserted in the same statement (through a data-modifying CTE, or an earlier row of a multi-row INSERT), the trigger cannot see it yet, so the check is skipped. The foreign key is checked at the end of the statement, finds the row, and passes. Every case below committed:
- (a) A payment on a **draft** invoice, in another currency (lines 868-876):
  `WITH inv AS (INSERT INTO money_invoice (id,firm_id,person_id,currency,created_by,updated_at) VALUES ('c0..01',:A,:P,'CAD','staff',now())) INSERT INTO money_payment (firm_id,invoice_id,method,amount_minor,currency,received_into,received_at,idempotency_key,recorded_by) VALUES (:A,'c0..01','E_TRANSFER',500,'USD','OPERATING',now(),'key-b1-000001','staff');`
  Result: payment USD 500 on an unnumbered CAD draft. Run as two statements, it is refused.
- (b) A trust **deposit of 1,000,000 from a 1-cent CARD payment received into OPERATING** (lines 945-961). This puts card money into the trust ledger:
  `WITH pay AS (INSERT INTO money_payment (id,firm_id,method,amount_minor,currency,received_into,received_at,stripe_payment_intent_id,idempotency_key) VALUES ('d0..01',:A,'CARD',1,'CAD','OPERATING',now(),'pi_b2','key-b2-000001')) INSERT INTO money_trust_entry (firm_id,person_id,kind,amount_minor,currency,payment_id,created_by) VALUES (:A,:P,'DEPOSIT',1000000,'CAD','d0..01','staff');`
  Result: balance_after 1000000. A later withdrawal of 400000 against it was accepted.
- (c) A **refund of 1,000,000 USD by CARD of a 1-cent CAD CASH payment** (line 899, `IF NOT FOUND THEN RETURN NEW`):
  `WITH pay AS (INSERT INTO money_payment (…'d0..02',:A,'CASH',1,'CAD','OPERATING',…)) INSERT INTO money_refund (firm_id,payment_id,amount_minor,currency,reason,route,idempotency_key,created_by) VALUES (:A,'d0..02',1000000,'USD','x','CARD','key-b3-ref-01','staff');`
- (d) A trust **withdrawal to a draft invoice of another party (a company) in USD**, taken from a person's CAD trust (lines 968-976). Same shape: the CTE inserts the draft invoice and the main query inserts a `WITHDRAWAL_TO_INVOICE` naming it.
- (e) An **undo of an undo, in another currency** (lines 1004-1015). One INSERT whose rows come in this order: (U2 undoes U1, USD), (B1 normal, CAD), (U1 undoes B1, CAD). All three rows committed.
- (f) A **line inside an undo batch**, USD in a CAD batch, `CARD_FEE_ON_TRUST` of 99,999,999 from a 1-cent payment received into OPERATING (lines 1026-1052). The CTE inserts the undo batch and the payment; the main query inserts the line.

Should: each of these is refused as it is when written as separate statements. Fix: when the row is not found, raise (as `money_issued_invoice` and `money_receipt_write` already do, and those held), or make the check a deferred constraint trigger. A rule that only holds if the API never writes a CTE is a rule kept by application code.

**B-2 Major: refunds exceed the payment at REPEATABLE READ.** Two connections, each `BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT 1 FROM money_payment_settings;`, then both run `INSERT INTO money_refund (firm_id,payment_id,amount_minor,currency,reason,route,idempotency_key,created_by) VALUES (:A,'<10000 payment>',6000,'CAD','r','OFFLINE','<distinct key>','staff'); COMMIT;`. Both committed, so 12000 was refunded on a 10000 payment. The `FOR UPDATE` at line 898 makes the second writer wait, but the sum at line 906 is read from its old snapshot. Held at READ COMMITTED and SERIALIZABLE. Credit notes survive the same race only by accident: the number take that follows hits a series-row conflict (40001). Fix: after the lock, refuse when the payment row's xmin is not visible to the snapshot, or bump a counter column on the payment (a real UPDATE gives 40001 at RR), or require SERIALIZABLE.

**B-3 Major: two firms can hold one Stripe account at REPEATABLE READ.** Firm A and firm B each RR-insert `money_payment_account (firm_id, stripe_account_id='acct_RR1', status='PENDING', updated_at=now())`. Both committed. The advisory lock at line 637 serialises the two writers, but the SELECT at line 638 reads the stale snapshot. Webhooks are routed by this id. Fix: a unique index on `stripe_account_id`, or an "account owner" table keyed by account id with `(firm_id)` as its own column.

**B-4 Major: a trust request is paid after being cancelled, and its amount changes with money on it (READ COMMITTED).** Race A: T1 runs `UPDATE money_trust_request SET cancelled_at=now(),cancelled_by='s',cancel_reason='client withdrew' WHERE id=:R` while T2 runs `INSERT INTO money_payment (…, trust_request_id=:R, 'E_TRANSFER', 1000, 'CAD', 'TRUST', …)`. Both commit, leaving DR-0002 cancelled with one payment. Race B: T1 runs `UPDATE … SET amount_minor=1` while T2 inserts the payment. Both commit, leaving an amount of 1 against 1000 paid. Reproduced at RC and RR. The payment trigger reads the request without a lock (line 878); the foreign key's KEY SHARE does not conflict with a non-key UPDATE, and the amount check at line 844 cannot see the uncommitted payment. Fix: `SELECT … FOR SHARE` on the request in `money_payment_write`, and `FOR UPDATE` plus a re-check in the request trigger.

**B-5 Major: a trust withdrawal is not bounded by the invoice.** Firm A, person :P holds 500000 in trust, and invoice INV-0010 totals 1 cent and is fully credited (CN-0005, `"full"=true`). Then `INSERT INTO money_trust_entry (firm_id,person_id,kind,amount_minor,currency,invoice_id,created_by) VALUES (:A,:P,'WITHDRAWAL_TO_INVOICE',-500000,'CAD','c5..01','s');` was accepted: the whole 5,000.00 went to a 0.01 invoice that owes nothing. The rule "names an issued invoice of the same party and currency" holds, but a withdrawal larger than what is owed is kept only by application code (Code s. 32(f) intent; legal reading Unconfirmed: no counsel). Fix: refuse when the withdrawals to the invoice exceed its total minus credit notes and write-off (lock the invoice FOR UPDATE, as credit notes do).

**B-6 Minor: a series prefix can be changed at any time, so two documents print the same number and the INV- run appears to skip.** Firm B had issued up to INV-10000. Then `UPDATE money_number_series SET prefix='CN-' WHERE firm_id=:B AND kind='INVOICE';` and the next issue gave invoice **CN-10001**. A credit note also got **CN-10001** (a CN series inserted by hand at 10001, which INSERT allows with no trigger). With default series the same collision appears once the invoice number reaches the credit-note number: for example, prefix `R-` against receipts. Also `UPDATE … SET next_number=9999` after INV-0016 was accepted, leaving a gap of 0017-9998. Fix: the prefix is fixed once a number is taken, prefixes are distinct across a firm's kinds, and raising is allowed only before the first number (lines 665-678).

**B-7 Minor: lines can be added to a batch after it was recorded, including after it was undone.** `INSERT INTO money_move_line (firm_id,batch_id,kind,direction,currency,amount_minor,source_payment_id) VALUES (:A,'<batch already undone>','WRONG_ACCOUNT','OPERATING_TO_TRUST','CAD',900,'<payment>');` was accepted. The line lands in a batch that is already undone, so its created_at is later than the undo's. "Batches never change" fails, and the history of the undone batch changes. Fix: refuse a line in a batch that has an undo, and preferably any line not written in the batch's own transaction.

**B-8 Minor: credit notes and a write-off together exceed the total.** On a 1-cent invoice, a full credit note of 1 and then a write-off of 1 were both accepted (line 796 compares only against the total). Fix: write-off ≤ total − credit notes, and credit notes ≤ total − write-off.

**B-9 Minor: free text that looks blank passes.** The databases here use the C ctype (demo included), so `[:space:]` is ASCII only. `money_text_ok(E'　　',200)` (ideographic spaces), `E'‏'`, `E'‮‮'` and `E'a b'` all return true, while NBSP, tab, DEL and C1 are refused (line 487). A reason, cancel reason or undo reason can therefore be invisible, and a bidi override can disguise a line description. Fix: add U+3000, U+2028/9, U+200E/F, U+202A-E and U+2066-9 to the blank and refused classes.

**B-10 Minor: an issue time typed by the caller.** `UPDATE money_invoice SET issued_at='1999-01-01', issued_by='s' WHERE id=…` was accepted and gave INV-0011, dated 1999 and later in the series than INV-0010, dated today. Receipts and trust entries force `now()`; invoices and trust requests (`sent_at`) do not. Fix: set `issued_at` and `sent_at` to `now()` in the trigger.

**B-11 Minor: a card-fee line names a payment that is not a card payment.** `CARD_FEE_ON_TRUST` requires a source received into TRUST (line 1049), and a card payment can never be received into TRUST. The only lines it accepts therefore name a non-card payment (verified with a CHEQUE). Fix: settle the rule with Lead B (a card payment into trust is not allowed yet, so refuse this kind until card into trust exists).

## Rules that rest on application code only (not proved broken at the database)
- `tax_minor` is not tied to `amount_minor × tax_rate_bp`. A 1-cent line at 1 bp with tax 2,000,000,000 was accepted. Invoice rates are not checked against `money_payment_settings.tax_rates`.
- `trust_enabled = false` does not stop trust requests, trust payments or ledger entries: 20 entries were written for firm A with trust off.
- A payment received into TRUST does not have to get a DEPOSIT entry. A deposit can come from an uncleared cheque and be withdrawn at once.
- Party uuids have no foreign key (FO-1k, by design). An invoice total can exceed int4 (6,294,967,295 seen), so a single `"full"` credit note on it can never be written. A party's trust balance stops at 2^31−1 cents with "integer out of range": it is refused, never wrapped.

## What held
- Numbers. 20 parallel issuers at RC, with rollbacks and savepoint rollbacks mixed in, gave INV-0001..0016 with no gap and no repeat. At RR the losers got 40001. Other checks that held: lowering next_number, deleting or truncating the series, changing kind or firm_id, and INV-9999 → INV-10000. At 999999999 the issue is refused, never wrapped. A typed number is refused on insert or update for invoices, credit notes, receipts and trust requests.
- An issued invoice: changing currency, party, number, un-issuing or deleting it is refused. Line insert, update or delete is refused, including in one CTE together with the issue. Changing its id is blocked by the lines' foreign key. Only the due date changes.
- Payments: a duplicate payment intent or idempotency key in a firm is refused. Card into trust is refused, as is a trust request paid by card or into operating, and an intent on a non-card payment. Only one Cleared tick is accepted (with an amount change, a second time, un-clearing or a non-cheque, it is refused).
- Trust balance: 20 parallel withdrawals of 300 against 1000 at RC, RR and SERIALIZABLE, for person and company parties, with savepoints, never went below zero; balance = sum and seq has no gaps. Seq and balance values given by the caller were replaced. Also held: a deposit on another party than its request, a second deposit of one payment, trust entry UPDATE, DELETE and TRUNCATE.
- Credit notes: 2 × 6000 on 10000 at RC, RR and SERIALIZABLE. A second write-off, a write-off on a draft, and write-off UPDATE or DELETE are refused. Two receipts for one payment, and a trust receipt on a withdrawal, are refused.
- Moves: two writers on one source at RC and RR (23505); an undo racing a re-move; a second undo of a batch (unique).
- Cross-firm references (payment, refund, credit note, receipt and move line naming firm A's rows from firm B) are refused. firm_id updates are refused on every table I tried. TRUNCATE is refused on every money table.
- firm_id is first in every non-primary index. Every amount column is an integer and every row with an amount carries its currency. No column holds a secret. A NULL second column in a composite foreign key only means "no reference": firm_id is NOT NULL everywhere.

## Round 3: head 3c88ac486 (diff `6e19e4ef2..3c88ac486`, focus `1863c935a..3c88ac486`)
Scratch database `xr_studio_fo7a_break_3` on :54329 had every migration applied and two firms with trust on; it was dropped at the end. I tested with psql and with `pg` clients at RC, RR and SERIALIZABLE. Line numbers refer to the migration.sql at 3c88ac486. Cost: US$0.

**Round 1 reproductions on the new head.**
- B-1 (a)-(f) all hold. Every CTE and multi-row shape is refused, either by `money_missing` (23503) or, when the CTE runs first, by the rule itself.
- B-2 holds: RC gives 23514, RR gives 23505.
- B-3 holds: 23505 at RC and RR.
- B-4 holds. With the payment first, a later cancel or amount change gets 23514 at RC and 40001 at RR. With the change first, the request is changed while nothing is paid on it, which is allowed.
- B-5 holds (refused, 0 open). B-8 holds (write-off refused).
- B-6 holds: the shared prefix is refused (`default_prefix_check`), and so is a direct `next_number + 1`. See B-13.
- B-7 holds: a line into an earlier batch, or into an undone batch, is refused. See B-15 and B-16.
- B-9 holds for the four characters reported (see B-17). B-10 holds: `issued_at` is set to now(). B-11 holds: a card fee on a wire into trust is refused.

**B-12 MAJOR (for the tech lead): correcting a return to trust re-opens the invoice's trust cap.** The cap nets out returns (CORRECTION naming a withdrawal, line 1115), but not a correction of a return, and a correction naming a CORRECTION is unchecked. Person :P holds 500.00 in trust; invoice FAC-0002 totals 100.00.
```sql
INSERT INTO money_trust_entry (id,firm_id,person_id,kind,amount_minor,currency,invoice_id,created_by) VALUES (:W1,:A,:P,'WITHDRAWAL_TO_INVOICE',-10000,'CAD',:INV,'s');
INSERT INTO money_trust_entry (id,firm_id,person_id,kind,amount_minor,currency,corrects_entry_id,reason,created_by) VALUES (:C1,:A,:P,'CORRECTION',10000,'CAD',:W1,'returned','s');
INSERT INTO money_trust_entry (firm_id,person_id,kind,amount_minor,currency,corrects_entry_id,reason,created_by) VALUES (:A,:P,'CORRECTION',-10000,'CAD',:C1,'return was a mistake','s');
INSERT INTO money_trust_entry (firm_id,person_id,kind,amount_minor,currency,invoice_id,created_by) VALUES (:A,:P,'WITHDRAWAL_TO_INVOICE',-10000,'CAD',:INV,'s');  -- accepted
```
I repeated the loop once more. The ledger then shows three WITHDRAWAL_TO_INVOICE entries of 100.00 on one 100.00 invoice, and 300.00 left trust for it. Should: refused at the third withdrawal, because 100.00 is still applied. Fix (either):
- refuse a CORRECTION whose `corrects_entry_id` names a return (a return is final; a mistaken return is undone by re-applying);
- or have `applied` follow the chain, so it also subtracts corrections of returns.

**B-13 Minor: a number can be taken, skipped or reset outside a numbered row.**
- (a) `SELECT money_take_number(:A,'INVOICE');` returned INV-0006, and the next issued invoice was INV-0007. EXECUTE is granted to PUBLIC; a "preview next number" query in FO-7b would leave a gap each time it is called.
- (b) `SET money.taking_number='on'; UPDATE money_number_series SET next_number=next_number+100 WHERE firm_id=:A AND kind='INVOICE';` was accepted, and the next invoice was INV-0108.
- (c) In one transaction: `SET LOCAL money.taking_number='on'; UPDATE … SET next_number=1, numbers_taken=0;`. Then `DELETE` of the series and a re-insert with prefix `FAC-` were both accepted, and the next invoice restarted at FAC-0001.

Does the flag matter? We run as the owner, who can disable triggers anyway, so the flag is not a security boundary, and an accident needs a deliberate `SET`. But the flag turns off every check at line 719, including the "never goes back" check that round 1 enforced unconditionally. It also lets `numbers_taken` be reset, which removes the guard on deleting the series. Fix:
- drop the flag;
- allow an update only when (next+1 and taken+1) together, or while taken = 0;
- never decrease either column;
- `REVOKE EXECUTE ON FUNCTION money_take_number FROM PUBLIC`, plus `IF pg_trigger_depth() = 0 THEN RAISE`.

**B-14 Minor: deadlock when something touches the invoice before a trust withdrawal in the same transaction.**
- T1: credit note (or write-off, or `UPDATE money_invoice SET due_date=…`) on X.
- T2: withdrawal on X. It takes the party lock, then waits on X's row.
- T1: withdrawal on X. It waits on the party lock, and the deadlock follows: 40P01 in 6 of 6 runs at RC and RR.

It fails safe and can be retried. But "part credit note, then apply trust" is a likely FO-7t flow. Fix: `money_issued_invoice` (and the invoice update) take the invoice party's trust lock before touching the row, the same order as at line 1060.

**B-15 Minor (by reading; the NULL case was shown with a DO block): the "batch is mine" test passes when the status is unknown.** At line 1189, `IF NOT b.mine` does not raise when `pg_xact_status(...)` is NULL, which happens once the commit log for the batch's xmin has been truncated after a freeze. It also misreads xmins from an earlier epoch (line 1184). On this cluster, `pg_xact_status('100'::xid8)` is NULL, and `DO $$ … IF NOT (NULL = 'in progress') THEN RAISE … $$` does not raise. So, years later, old batches would accept lines again. Fix: `IF b.mine IS NOT TRUE`; better, a database-set column `recorded_xact = pg_current_xact_id()` (the top-level id, which also covers savepoints), compared for equality.

**B-16 Minor: a line can go into an undone batch inside the batch's own transaction.**
```sql
BEGIN;
INSERT batch B;
INSERT line (ordinal 1);
INSERT undo U of B;
INSERT line into B;  -- accepted, ordinal 2
COMMIT;
```
Fix: also refuse when an undo of the batch exists (line 1186).

**B-17 Minor: B-9 leftovers.** `money_text_ok` still accepts these as visible text: U+2800 (braille blank), U+E0020 (tag space), U+1D159, U+17B4 and U+1F3FB (a skin-tone modifier alone). Fix: add them to the blank class.

**Held in round 3:**
- 20 parallel issuers with rollbacks and savepoints: INV-0001..0016 with no gap (RR losers got 40001).
- 20 parallel withdrawals at RC, RR and SERIALIZABLE, for person and company parties, never went below zero.
- Same-statement pairs (CTE and multi-row) were all refused: two credit notes, two withdrawals, two refunds, a withdrawal plus a write-off, and two returns.
- Payment first against a cancel or amount change, at RC and RR.
- Quebec tax: 1,000.00 at 149750 ppm with tax 149.75 is accepted; 1 cent off is accepted and 2 cents off is refused. ppm rates are accepted in settings, while 99750.5 and anything above 1,000,000 are refused.
- An invoice total above 2^31−1 is refused at issue.
- A batch from a released savepoint takes lines; a batch committed earlier refuses them.
- A payment into TRUST with no deposit is refused at commit.

## Round 4: head 35b028dae (diff `6f48fe29e..35b028dae`)
Scratch database `xr_studio_fo7a_break_4` on :54329 had all 87 migrations applied in name order, plus firms A and B with trust on. It was dropped at the end. I tested with psql and with `pg` clients at RC, RR and SERIALIZABLE. Line numbers refer to `20261115042334_fo7a_client_money_tables/migration.sql`. `:A` stands for firm A and `:P` for a person. Cost: US$0.

**Reproductions from round 3.**
- B-12 holds. A correction naming a CORRECTION is refused, and so is one naming a REFUND_TO_CLIENT (23514). A bare correction is refused by `money_trust_entry_corrects_check` (23514). A negative or over-cap return is refused (23514). A third withdrawal on a 100.00 invoice is refused (23514).
- B-13 holds. A direct `SELECT money_take_number(...)` is refused, also from a DO block (42501). These are refused with 23514: `SET money.taking_number='on'` with +100, a direct "+1 on both columns", `numbers_taken` alone, a reset to 1/0, and `INSERT … ON CONFLICT DO UPDATE SET next_number=1`. Deleting a used series is refused (42501).
- B-14 holds. A credit note or write-off, then a withdrawal racing another withdrawal: 6/6 ok at RC, and 40001 for the loser at RR. A `due_date` UPDATE first still gives 40P01 in 6/6 runs, which is the stated known case (fails safe).
- B-15 holds by reading (`IS NOT TRUE`, line 1218). B-16 holds: line, undo, line is refused (23514), and so are a line and an undo in one CTE (23514 at commit).
- B-17 holds for U+2800, U+E0020, U+1F3FB, U+17B4, U+1D159 and U+FE0F. See B-21.

**B-18 MAJOR: a trust application moves its full withdrawal out of trust even after the money was returned to trust.** Line 1233 caps a TRUST_APPLIED line at `-s.amount_minor`, the withdrawal itself. It does not subtract the returns, although the comment at line 1203 says "less what was returned before moving". Returns also do not look at the move list. So the trust bank can be emptied while the ledger still shows the money held. Person :P deposits 300.00; invoice INV totals 100.00. This loop was run three times and every statement committed:
```sql
INSERT INTO money_trust_entry (firm_id,person_id,kind,amount_minor,currency,invoice_id,created_by) VALUES (:A,:P,'WITHDRAWAL_TO_INVOICE',-10000,'CAD',:INV,'s') RETURNING id;  -- :W
BEGIN; INSERT INTO money_move_batch (id,firm_id,currency,transfer_date,recorded_by) VALUES (:B,:A,'CAD',current_date,'s');
INSERT INTO money_move_line (firm_id,batch_id,kind,direction,currency,amount_minor,source_trust_entry_id) VALUES (:A,:B,'TRUST_APPLIED','TRUST_TO_OPERATING','CAD',10000,:W); COMMIT;
INSERT INTO money_trust_entry (firm_id,person_id,kind,amount_minor,currency,corrects_entry_id,reason,created_by) VALUES (:A,:P,'CORRECTION',10000,'CAD',:W,'r','s');
```
- Result: the ledger shows 300.00 held for :P, while 300.00 has moved from trust to operating for one 100.00 invoice. The ledger has no item to move anything back.
- The other order also passes. Withdraw W1, return all of it, withdraw W2 (the cap re-opens, correctly), then move 100.00 for W1 and 100.00 for W2 in one batch. Both commit: 200.00 leaves trust for 100.00 applied (moved 20000, ledger out 10000).

Should: a TRUST_APPLIED line is at most the withdrawal less its returns. A return of a withdrawal that has a live (not undone) move is refused until the move is undone, or is at most the withdrawal less returns less live moves. Because the move takes only the `money_move:` lock and a return takes the party lock, the move line should also take the party's trust lock, so the two cannot race.

**B-19 MAJOR (for the tech lead; the P-603 rule as written allows it): the deposit-correction cap lets a WRONG_ACCOUNT move take other clients' money out of trust.** Lines 1246-1252 cap a trust→operating move at the negative corrections of the payment's deposit. A correction does not say why it was made, so two cases pass:
- (a) **A bounced cheque.** `t_dep` makes a CHEQUE payment of 300.00 into TRUST plus its DEPOSIT. Then `INSERT … ('CORRECTION',-30000,…,corrects_entry_id=:DEP,reason='cheque bounced')` and a WRONG_ACCOUNT TRUST_TO_OPERATING line of 30000 on that payment. Both committed. 300.00 that never arrived is moved to operating, so it comes out of the other clients' trust money: the bank ends 300.00 below the ledger.
- (b) **A deposit refunded, then also corrected.** On a 200.00 deposit, `REFUND_TO_CLIENT -20000`, then `CORRECTION -20000` naming the same deposit, then a WRONG_ACCOUNT move of 20000. All committed. The ledger fell by 400.00 for one 200.00 deposit, and 200.00 of the party's other money went to operating with no invoice.

Line 1147 counts only earlier corrections, never refunds. Fix (the lead decides): give a deposit correction a cause, and let only a "wrong account" correction license a move. A bounced or uncleared cheque never does (the `cleared` flag defaults to true even for a cheque). Bound the corrections of a deposit by what is still held from it.

**B-20 Minor: two documents still print one number, across kinds, when a prefix is reused.** The unique prefix index only holds at one moment. Firm B:
```sql
INSERT INTO money_number_series (firm_id,kind,prefix,next_number) VALUES (:B,'INVOICE','XA-',1);
-- issue an invoice → XA-0001
UPDATE money_number_series SET prefix='INV-' WHERE firm_id=:B AND kind='INVOICE';
INSERT INTO money_number_series (firm_id,kind,prefix,next_number) VALUES (:B,'CREDIT_NOTE','XA-',1);
-- a credit note on it → XA-0001
```
All committed: an invoice and a credit note are both XA-0001. This is the B-6 class: a prefix change is allowed on purpose (AG-6-44 rule 5), but a prefix a firm has used is never freed. Fix: keep a firm's used prefixes (per kind) and refuse them for another kind.

**B-21 Minor: invisible text still passes `money_text_ok` (line 507).** These single characters return true:
- U+FFF9–FFFB (interlinear annotation);
- U+1BCA0–1BCA3 (shorthand format controls);
- U+13430–1343F (Egyptian format controls);
- U+0600, U+070F, U+110BD (prepended format marks);
- U+16FE4 (Khitan filler);
- a lone combining mark (U+0301, U+05AE);
- noncharacters U+FFFF, U+2FFFE, U+10FFFF;
- unassigned U+0378 and U+1D455;
- private use U+E000 and U+F0000.

Fix: add the Cf ranges and the noncharacters, and require at least one character that is not a combining mark (U+0300–036F and friends). Listing characters one by one in a C-ctype regex will keep leaking. An allow-list of visible blocks is the safer form.

**Held in round 4:**
- Corrections in parallel (10 pg clients). 10 × −30.00 on a 100.00 deposit: RC gives 3 ok and 7 × 23514; RR gives 1 ok and 9 × 23505; SERIALIZABLE gives 1 ok and 9 × 40001. Returns of 10 × 30.00 on a 100.00 withdrawal end the same way. Returns and re-withdrawals mixed on one invoice never put more than 100.00 applied at RC, RR or SERIALIZABLE.
- Cross references refused. A correction on another party or currency (23514). A correction from firm B naming firm A's entry (23503). A positive deposit correction (23514). A withdrawal carrying `corrects_entry_id` (23514).
- Same statement. Two deposit corrections in one multi-row INSERT are each within the cap and together over it: refused (23514; the second row sees the first). A correction and a withdrawal in one CTE that overdraw are refused (23514). A withdrawal and its return in one CTE are accepted (net zero, correct). Over-cap after a savepoint rollback is refused.
- WRONG_ACCOUNT out of trust. With no correction, it is refused (23514). After an undo, a re-move above the payment is refused, and the ordinal stays unique.
- Numbers. 20 parallel issuers with savepoint rollbacks and rollbacks gave INV-0002..0019 with no gap at RC, and 40001 for the losers at RR.
- `money_move_line_not_undone`. Line and undo in one CTE are refused at commit. With `SET CONSTRAINTS … IMMEDIATE`, a line then an undo of the same batch commits. That only reorders an ordinary later undo, so it is not a finding.

## Round 5 (B-20, B-21 only, at `73a93e32c`)
Scope: the release holder's ruling, B-20 and B-21 only; the move list has left the PR and was not tested. Scratch database `fo7a_break_r5` on :54329 had all 93 migration folders applied in name order with psql (C ctype, as the team's). Firms came from a scratch `mkfirm()` (platform_firm, then settings with trust on). `mkinv()` issues a 100.00 invoice and `mkcn()` writes a 0.01 credit note. I used psql, plus `pg` clients at RC and RR, each race run 3 times. The database was dropped at the end. Line numbers refer to `20261115042334_fo7a_client_money_tables/migration.sql`. `:f` stands for the firm. Cost: US$0.

**B-20 holds** (lines 95 and 628-684). The round-4 reproduction (`INSERT … INVOICE 'XA-'`; issue → XA-0001; `UPDATE … SET prefix='INV-'`; `INSERT … CREDIT_NOTE 'XA-'`) is now refused with 23514 "XA- printed the INVOICE series' numbers". These were also refused:
- The update path (`UPDATE … SET prefix='XA-' WHERE kind='CREDIT_NOTE'`), the upsert (`… ON CONFLICT (firm_id,kind) DO UPDATE SET prefix=excluded.prefix`), and RECEIPT and TRUST_REQUEST to XA- (all 23514).
- Several renames XA-→YA-→ZA-, each printed: `used_prefixes` is `{XA-,YA-,ZA-}`, and each of them is refused to the credit-note series. The invoice series may go back to XA-, and its numbering continues (XA-0002, no repeat).
- Numbers from every trigger: a receipt (XR-0001) and trust requests sent on insert and on update (XT-0001, XT-0002). After a rename, XR- and XT- are refused to INVOICE, CREDIT_NOTE and the other kind (23514).
- Delete and re-create: a printed series cannot be deleted (42501). An unprinted one can be, and a re-created credit-note series still cannot take XA- (23514).
- Default prefixes: after INV-0001 and a rename to TOR-, INV- is refused to the other three kinds, and CN- to INVOICE, by `money_number_series_default_prefix_check`.
- One statement and CTEs: `UPDATE … SET prefix = CASE kind WHEN 'INVOICE' THEN 'YA-' ELSE 'XA-' END` was refused in both physical row orders (23514). So were `WITH a AS (UPDATE … INVOICE 'YA-') UPDATE|INSERT … 'XA-'` and the reverse CTE order (23514, or 23505 when the insert runs first).
- In one transaction: print, rename, then RECEIPT to PA- is refused (23514).
- A caller writing `used_prefixes`: `INSERT … used_prefixes '{ZZ-}'` and `… NULL` are refused. So are `UPDATE … SET used_prefixes='{}'` or `NULL`, `SET prefix='ZA-', used_prefixes='{}'`, `ON CONFLICT DO UPDATE SET used_prefixes='{}'`, and `SET used_prefixes='{XA-}'` on another series. All give 23514 "used_prefixes is the database's". A kind change is refused too (23514).
- Real connections, each race run 3 times with the same outcome:
  - Rename (uncommitted) against a credit-note insert of XA-: RC 23514, RR 40001.
  - Rename committed after the other side's snapshot: RC 23514, RR 40001.
  - Three-way: an uncommitted XA-0001 on a fresh series, a rename waiting on the row, and a credit-note insert of XA-. At RC the rename records XA- (its trigger reads the refreshed row, `numbers_taken`=1) and the insert gets 23505. At RR the rename gets 40001 and the insert 23505.
  - Issue committed after the renamer's snapshot: RC records XA- and the later insert gets 23514; RR gives 40001.
  - Two renames at once (INVOICE away from XA-, CREDIT_NOTE to XA-): RC 23514, RR 40001.
  - 13 writers (one rename, 12 inserts or renames of CN, R and DR to XA-): 1 ok and 12 refused (23514, 23505 or 40001), at RC and RR, every run.

**B-21 broken (in part; the round-4 characters hold)** (line 443). Each round-4 and round-3 character now returns false: U+FFF9–FFFB, 1BCA0/3, 13430/F, 0600, 070F, 110BD, 16FE4, 0301, 05AE, FFFF, 2FFFE, 10FFFF, 0378, 1D455, E000, F0000, 2800, E0020, 1F3FB, 17B4, 1D159 and FE0F. No unassigned or private-use code point passes (`unicode_assigned()` over the full scan). The class "a lone combining mark" still passes whenever the mark has Unicode's Alphabetic property, because `[[:alnum:]]` under pg_c_utf8 counts it. 905 Mn and 423 Mc code points pass alone. Scan: `select cp from generate_series(1,1114111) cp where cp not between 55296 and 57343 and money_text_ok(chr(cp),10)`, run in two ranges because `chr` refuses surrogates. These committed:
```sql
INSERT INTO money_credit_note (firm_id,invoice_id,amount_minor,currency,reason,created_by)
  VALUES (:f, lastinv(:f), 1, 'CAD', U&'\064E', 'user-R');                          -- Arabic fatha alone → CN-0001
INSERT INTO money_credit_note (firm_id,invoice_id,amount_minor,currency,reason,created_by)
  VALUES (:f, lastinv(:f), 1, 'CAD', U&'\+013441\+013442', U&'\3000\0345');         -- Egyptian FULL/HALF BLANK (Lo); created_by = ideographic space + U+0345 → CN-0002
SELECT money_text_ok(U&'\064E\064E\064E',50), money_text_ok(U&'\200B\05B0\2800',50), money_text_ok(U&'\3164\0345',50),
       money_text_ok(U&'\00A0\0E31\FEFF',50), money_text_ok(U&'\FE0F\064E\+0E0020',50);   -- all true
```
Other single marks that pass: U+0345, 0363–036F, 05B0–05BD, 0610–061A, 064B–0657, 0670, 0E31, 1DE7, 1BC9E and 1171E. Should: the text holds at least one character that is not a mark (Mn, Mc or Me). In SQL, that means removing `\p{M}`-like ranges before the `[[:alnum:][:punct:]]` test, or testing `[[:alnum:][:punct:]]` on a copy with marks stripped. U+13441/13442 (Egyptian blanks, Lo) belong in the blank class.

**B-22 Minor: a prefix that never printed is kept from every other kind, and the refusal says it printed.** Line 661 appends OLD.prefix whenever `OLD.numbers_taken > 0`. That count covers the whole series, not the outgoing prefix. So a mistyped prefix, fixed before any use, is locked away for good:
```sql
SELECT mkinv(:f);                                                                      -- INV-0001
UPDATE money_number_series SET prefix='TRO-' WHERE firm_id=:f AND kind='INVOICE';      -- typo, nothing printed
UPDATE money_number_series SET prefix='TOR-' WHERE firm_id=:f AND kind='INVOICE';      -- used_prefixes = {TRO-}
INSERT INTO money_number_series (firm_id,kind,prefix) VALUES (:f,'CREDIT_NOTE','TRO-');
-- 23514 "TRO- printed the INVOICE series' numbers" (it never did)
```
The same happens after XA-→TOR-→XA- (`{XA-,TOR-}`), and when the only number under a prefix was rolled back to a savepoint (`{PA-}`, with PA-0002 never committed). It fails safe and never repeats a number. Fix: record the prefix only if a number was taken under it, for example by keeping `numbers_taken` at the moment the prefix was set and comparing.

**B-23 Minor (regression from the B-21 fix): text written only in non-ASCII digits is refused.** Under pg_c_utf8, `[[:alnum:]]` is Alphabetic plus ASCII 0-9 only, and the digits are not punctuation, so all 670 non-ASCII Nd code points (and the No ones such as ½, ①, ²) fail alone. The expression before `33926119a` accepted all three of these:
```sql
INSERT INTO money_payment (firm_id,invoice_id,method,amount_minor,currency,received_into,received_at,idempotency_key,recorded_by,reference)
  VALUES (:f, lastinv(:f), 'CHEQUE', 100, 'CAD', 'OPERATING', now(), 'key-r5-t8-01', 'user-R', '１２３４５');   -- 23514 money_payment_reference_check (full-width cheque number)
-- same with reference '۱۲۳۴۵۶' (Persian digits): 23514
UPDATE money_payment_settings SET tax_number = '١٢٣٤٥٦٧٨٩' WHERE firm_id = :f;  -- 23514 money_payment_settings_tax_number_check
```
`'No. ١٢٣'` passes, and so does text in 26 scripts (Devanagari, Tamil, Thai, Han, Kana, Hangul, Arabic, Hebrew, Greek, Cyrillic, Ethiopic, Georgian, Armenian, Khmer, Myanmar, Sinhala, Tibetan, Mongolian with FVS, Cherokee, Javanese, decomposed é, Persian with ZWNJ, emoji with skin tone, a flag, a keycap, a ZWJ family). Fix: `[[:digit:]]` under pg_c_utf8 is ASCII-only too (checked: `'١' ~ '[[:digit:]]' COLLATE pg_c_utf8` is false), but `'١' ~ '[[:alnum:]]' COLLATE pg_unicode_fast` is true, so add that as a second test (pg_unicode_fast alone drops symbols: `'€' ~ '[[:punct:]]'` is false there).

**Held in round 5:** everything under B-20 above, and every listed B-17 and B-21 character.
