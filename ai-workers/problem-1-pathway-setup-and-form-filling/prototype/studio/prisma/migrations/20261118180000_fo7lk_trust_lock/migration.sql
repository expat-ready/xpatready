-- FO-7lk (brief product/design/build-lead-c-briefs/FO-7lk.md; Lead 73's money read on #1991): one key and one order for
-- the party's trust lock. Adds money_trust_lock(firm, party, currency), the only place the key text
-- 'money_trust:' || firm || ':' || party || ':' || currency is written, and moves the four call sites to it
-- (money_issued_invoice from FO-7a; money_trust_entry_write, money_move_batch_owed_back, money_move_line_write from FO-7a2):
-- each function's text is FO-7a's or FO-7a2's with only its lock line changed. money_credit_note_write ("Move back to
-- trust", OVERPAID_TO_TRUST) takes the withdrawal's party lock before it touches the invoice row. Functions only, no
-- table. Every trust write takes the party lock before the invoice row. The lock is held to the end of the transaction,
-- so taking it again (money_issued_invoice, the trust entry the credit note writes) waits for nothing.
-- Rollback: rollback.sql in this folder (restores FO-7a's and FO-7a2's function text exactly, then drops the helper).

-- The party's trust lock (one per firm, party and currency), held to the end of the transaction. A null party takes
-- none (pg_advisory_xact_lock is strict), as the inline key did. Keeps its caller's rights, as FO-7a2's helpers do.
CREATE OR REPLACE FUNCTION money_trust_lock(f uuid, party uuid, cur "MoneyCurrency") RETURNS void LANGUAGE sql VOLATILE SET search_path = pg_catalog, public, pg_temp AS
  $$ SELECT pg_advisory_xact_lock(hashtextextended('money_trust:' || f || ':' || party || ':' || cur, 0)) $$;

-- FO-7a's, its lock line only.
CREATE OR REPLACE FUNCTION money_issued_invoice(f uuid, inv uuid, cur "MoneyCurrency", what text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE i record; credited bigint; written bigint; party uuid; pcur "MoneyCurrency";
BEGIN
  SELECT coalesce(x.person_id, x.company_id), x.currency INTO party, pcur FROM "money_invoice" x WHERE x.firm_id = f AND x.id = inv;
  IF party IS NOT NULL THEN
    PERFORM money_trust_lock(f, party, pcur);
  END IF;
  UPDATE "money_invoice" x SET updated_at = now() WHERE x.firm_id = f AND x.id = inv RETURNING x.issued_at, x.currency INTO i;
  IF NOT FOUND THEN PERFORM money_missing(what, 'invoice', inv); END IF;
  IF i.issued_at IS NULL THEN
    RAISE EXCEPTION '%: a draft invoice cannot have one (issue it first)', what USING ERRCODE = 'check_violation';
  END IF;
  IF i.currency <> cur THEN
    RAISE EXCEPTION '%: in the invoice''s currency (%), not %', what, i.currency, cur USING ERRCODE = 'check_violation';
  END IF;
  SELECT coalesce(sum(amount_minor), 0) INTO credited FROM "money_credit_note" WHERE firm_id = f AND invoice_id = inv;
  SELECT coalesce(sum(amount_minor), 0) INTO written FROM "money_write_off" WHERE firm_id = f AND invoice_id = inv;
  RETURN money_invoice_total(f, inv) - credited - written;
END $$;


-- FO-7a2's, its lock line only.
CREATE OR REPLACE FUNCTION money_trust_entry_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d record; reversal boolean := false; last_seq integer; last_balance bigint; party uuid := coalesce(NEW.person_id, NEW.company_id); bal bigint; applied bigint; open_amount bigint; returned bigint;
BEGIN
  -- The party's lock first, before any invoice row is touched, so a "Trust first" deposit and withdrawal in one
  -- transaction never deadlock with another withdrawal on the same invoice (review round 2, Minor 2: 40P01).
  IF party IS NOT NULL THEN
    PERFORM money_trust_lock(NEW.firm_id, party, NEW.currency);
  END IF;
  IF NEW.kind = 'DEPOSIT' THEN
    PERFORM money_trust_on(NEW.firm_id, 'money_trust_entry');
  END IF;
  -- A missing id is the checks' to refuse (money_trust_entry_deposit_payment, _withdrawal_invoice).
  IF NEW.kind = 'DEPOSIT' AND NEW.payment_id IS NOT NULL THEN
    SELECT p.amount_minor, p.currency, p.received_into, p.trust_request_id, p.invoice_id, i.person_id AS inv_person, i.company_id AS inv_company INTO d
      FROM "money_payment" p LEFT JOIN "money_invoice" i ON i.firm_id = p.firm_id AND i.id = p.invoice_id WHERE p.firm_id = NEW.firm_id AND p.id = NEW.payment_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'payment', NEW.payment_id); END IF;
    IF d.received_into <> 'TRUST' THEN
      RAISE EXCEPTION 'money_trust_entry: a deposit comes from a payment received into trust (this one went to %)', d.received_into USING ERRCODE = 'check_violation';
    END IF;
    IF (d.amount_minor, d.currency) IS DISTINCT FROM (NEW.amount_minor, NEW.currency) THEN
      RAISE EXCEPTION 'money_trust_entry: a deposit is its payment''s amount and currency (% %)', d.amount_minor, d.currency USING ERRCODE = 'check_violation';
    END IF;
    -- "Trust first" (AG-6-69 rule 5): money paid on an invoice into trust is held for that invoice's party (review round 1, m2).
    IF d.invoice_id IS NOT NULL AND (d.inv_person, d.inv_company) IS DISTINCT FROM (NEW.person_id, NEW.company_id) THEN
      RAISE EXCEPTION 'money_trust_entry: a deposit paid on an invoice is held for that invoice''s party' USING ERRCODE = 'check_violation';
    END IF;
    IF d.trust_request_id IS NOT NULL AND NEW.trust_request_id IS DISTINCT FROM d.trust_request_id THEN
      IF NEW.trust_request_id IS NOT NULL THEN
        RAISE EXCEPTION 'money_trust_entry: a deposit names its payment''s trust request' USING ERRCODE = 'check_violation';
      END IF;
      NEW.trust_request_id := d.trust_request_id;
    END IF;
  END IF;
  IF NEW.trust_request_id IS NOT NULL THEN
    SELECT r.person_id, r.company_id, r.currency INTO d FROM "money_trust_request" r WHERE r.firm_id = NEW.firm_id AND r.id = NEW.trust_request_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'trust request', NEW.trust_request_id); END IF;
    IF (d.person_id, d.company_id, d.currency) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.currency) THEN
      RAISE EXCEPTION 'money_trust_entry: an entry is on its trust request''s party and currency' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.kind = 'WITHDRAWAL_TO_INVOICE' AND NEW.invoice_id IS NOT NULL THEN
    SELECT i.issued_at, i.person_id, i.company_id, i.currency INTO d FROM "money_invoice" i WHERE i.firm_id = NEW.firm_id AND i.id = NEW.invoice_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'invoice', NEW.invoice_id); END IF;
    IF d.issued_at IS NULL THEN
      RAISE EXCEPTION 'money_trust_entry: trust is applied only to an issued invoice (Code s. 32(f): invoice before withdrawing)' USING ERRCODE = 'check_violation';
    END IF;
    IF (d.person_id, d.company_id, d.currency) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.currency) THEN
      RAISE EXCEPTION 'money_trust_entry: trust pays only an invoice of the same party and currency' USING ERRCODE = 'check_violation';
    END IF;
    -- Touches the invoice row, so it goes one at a time with the invoice's credit notes and write-off (see
    -- money_issued_invoice); returns what is open after them.
    open_amount := money_issued_invoice(NEW.firm_id, NEW.invoice_id, NEW.currency, 'money_trust_entry');
  END IF;
  IF NEW.kind = 'CORRECTION' AND NEW.corrects_entry_id IS NOT NULL THEN  -- another kind naming one: money_trust_entry_corrects_check
    SELECT e.person_id, e.company_id, e.currency, e.kind, e.amount_minor, p.method INTO d FROM "money_trust_entry" e
      LEFT JOIN "money_payment" p ON p.firm_id = e.firm_id AND p.id = e.payment_id WHERE e.firm_id = NEW.firm_id AND e.id = NEW.corrects_entry_id;
    IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'entry', NEW.corrects_entry_id); END IF;
    IF (d.person_id, d.company_id, d.currency) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.currency) THEN
      RAISE EXCEPTION 'money_trust_entry: a correction is on the same party and currency as the entry it corrects' USING ERRCODE = 'check_violation';
    END IF;
    IF d.kind NOT IN ('WITHDRAWAL_TO_INVOICE', 'DEPOSIT') THEN
      RAISE EXCEPTION 'money_trust_entry: a correction names a withdrawal (to return money from it) or a deposit (to correct it), never a % (P-603: money leaves trust only to an issued invoice or back to the client)', d.kind USING ERRCODE = 'check_violation';
    END IF;
    -- FO-7a2 (AG-6-75 rules 2, 4): a correction of a deposit with a reversal kind is recorded even below zero, and the
    -- shortfall is shown (money_trust_shortfall). "Returned" is a bounced cheque or wire: an e-Transfer, card, card
    -- terminal or cash payment is cleared when recorded (AG-6-63 rule 7; break B-17).
    IF d.kind = 'DEPOSIT' AND NEW.correction_kind IN ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER') THEN
      reversal := true;
      IF NEW.correction_kind = 'RETURNED' AND d.method::text IN ('E_TRANSFER', 'CARD', 'CARD_TERMINAL', 'CASH') THEN
        RAISE EXCEPTION 'money_trust_entry: a % payment is cleared when recorded and is never "Returned"; reverse it as "Recorded by mistake", "Wrong client" or with a typed reason', d.method USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    -- What the earlier corrections of that entry add up to (the party's lock is held, so they are read after every
    -- earlier one; a stale read at REPEATABLE READ takes a seq already taken and is refused, 23505).
    SELECT coalesce(sum(c.amount_minor), 0) INTO returned FROM "money_trust_entry" c WHERE c.firm_id = NEW.firm_id AND c.corrects_entry_id = NEW.corrects_entry_id;
    -- Money returned from a trust application: positive, and never more than was applied.
    IF d.kind = 'WITHDRAWAL_TO_INVOICE' AND (NEW.amount_minor <= 0 OR returned + NEW.amount_minor > -d.amount_minor) THEN
      RAISE EXCEPTION 'money_trust_entry: money returned from a trust application is positive and at most what was applied (% applied, % returned)', -d.amount_minor, returned USING ERRCODE = 'check_violation';
    END IF;
    -- A deposit corrected: negative, and all its corrections together never more than the deposit.
    IF d.kind = 'DEPOSIT' AND (NEW.amount_minor >= 0 OR -(returned + NEW.amount_minor) > d.amount_minor) THEN
      RAISE EXCEPTION 'money_trust_entry: a correction of a deposit takes money out, at most the deposit (% deposited, % corrected before)', d.amount_minor, -returned USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.kind = 'WITHDRAWAL_TO_INVOICE' AND NEW.invoice_id IS NOT NULL THEN
    -- Paid from trust so far: the invoice's withdrawals less the money returned to trust from them (corrections naming
    -- them), so a return frees the amount again (review round 2, Major 2).
    SELECT coalesce(-sum(e.amount_minor), 0) - coalesce((SELECT sum(c.amount_minor) FROM "money_trust_entry" c JOIN "money_trust_entry" w ON w.firm_id = c.firm_id AND w.id = c.corrects_entry_id
        WHERE c.firm_id = NEW.firm_id AND c.kind = 'CORRECTION' AND w.invoice_id = NEW.invoice_id), 0)
      INTO applied FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.invoice_id = NEW.invoice_id;
    -- FO-7a2 (Devin review on #1991): trust money a credit note's "Refund to the client" sent back from operating no
    -- longer pays the invoice, as the credit-note and write-off checks count it.
    applied := greatest(applied - (SELECT coalesce(sum(c.overpaid_minor), 0) FROM "money_credit_note" c
      WHERE c.firm_id = NEW.firm_id AND c.invoice_id = NEW.invoice_id AND c.overpaid_choice = 'OVERPAID_REFUND'), 0);
    IF applied - NEW.amount_minor > open_amount THEN
      RAISE EXCEPTION 'money_trust_entry: % from trust would pay more than is open on the invoice (% open after credit notes and write-off, % already paid from trust)', -NEW.amount_minor, open_amount, applied USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.person_id IS NOT NULL THEN
    SELECT e.seq, e.balance_after_minor INTO last_seq, last_balance FROM "money_trust_entry" e
      WHERE e.firm_id = NEW.firm_id AND e.person_id = NEW.person_id AND e.currency = NEW.currency ORDER BY e.seq DESC LIMIT 1;
  ELSE
    SELECT e.seq, e.balance_after_minor INTO last_seq, last_balance FROM "money_trust_entry" e
      WHERE e.firm_id = NEW.firm_id AND e.company_id = NEW.company_id AND e.currency = NEW.currency ORDER BY e.seq DESC LIMIT 1;
  END IF;
  bal := coalesce(last_balance, 0) + NEW.amount_minor;
  -- FO-7a2 (AG-6-68 rule 8): money taken out never goes past the ledger balance, "Only CAD 169.50 is available."; a
  -- reversal is always recorded, even below zero (AG-6-75 rule 4, AG-6-60 rule 7; break B-10); money in always is.
  IF bal < 0 AND NEW.amount_minor < 0 AND NOT reversal THEN
    RAISE EXCEPTION 'money_trust_entry: Only % % is available; the trust balance would go below zero (held % %, entry %)',
      NEW.currency, to_char(greatest(coalesce(last_balance, 0), 0) / 100.0, 'FM999,999,990.00'), coalesce(last_balance, 0), NEW.currency, NEW.amount_minor USING ERRCODE = 'check_violation';
  END IF;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.balance_after_minor := bal;
  NEW.created_at := now();
  RETURN NEW;
END $$;


-- FO-7a2's, plus the party's lock first for "Move back to trust".
CREATE OR REPLACE FUNCTION money_credit_note_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE open_amount bigint; trust bigint; w record; freed bigint := 0; whole bigint;
BEGIN
  IF NEW.number IS NOT NULL THEN
    RAISE EXCEPTION 'money_credit_note: the number is the database''s' USING ERRCODE = 'check_violation';
  END IF;
  IF num_nonnulls(NEW.overpaid_choice, NEW.overpaid_entry_id, NEW.overpaid_minor) NOT IN (0, 3) THEN
    RAISE EXCEPTION 'money_credit_note: a refund or move-back choice carries its amount and its trust application, all three (money_credit_note_overpaid_check)' USING ERRCODE = 'check_violation';
  END IF;
  -- FO-7lk: "Move back to trust" writes a trust entry for the withdrawal's party (money_credit_note_owed_back, after the
  -- insert). Take that party's lock now, before money_issued_invoice touches the invoice row, so this path keeps the
  -- order a withdrawal to the invoice keeps: the party's lock first, the invoice row second (no 40P01). Only for a
  -- withdrawal to this invoice (so of the invoice's party): an entry the checks below refuse takes no lock of another
  -- party (review and break B-1 on 9f30e673: that would be a new two-party order).
  IF NEW.overpaid_choice = 'OVERPAID_TO_TRUST' THEN
    SELECT coalesce(e.person_id, e.company_id) AS party, e.currency INTO w FROM "money_trust_entry" e
      WHERE e.firm_id = NEW.firm_id AND e.id = NEW.overpaid_entry_id AND e.kind = 'WITHDRAWAL_TO_INVOICE' AND e.invoice_id = NEW.invoice_id;
    IF FOUND THEN PERFORM money_trust_lock(NEW.firm_id, w.party, w.currency); END IF;  -- anything else is refused below
  END IF;
  open_amount := money_issued_invoice(NEW.firm_id, NEW.invoice_id, NEW.currency, 'money_credit_note');
  -- Trust paid and not returned, less what earlier "Refund to the client" choices already freed (refunded from operating).
  trust := money_trust_paid(NEW.firm_id, NEW.invoice_id) - (SELECT coalesce(sum(c.overpaid_minor), 0) FROM "money_credit_note" c
    WHERE c.firm_id = NEW.firm_id AND c.invoice_id = NEW.invoice_id AND c.overpaid_choice = 'OVERPAID_REFUND');
  -- Rule 2c (P-634 (2)): trust money of this invoice that already moved to operating is freed for the credit note only
  -- with the person's choice, "Refund to the client" or "Move back to trust", never kept in operating; at most what moved
  -- and no earlier choice covers.
  IF NEW.overpaid_entry_id IS NOT NULL THEN
    SELECT e.kind, e.invoice_id INTO w FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.id = NEW.overpaid_entry_id;
    IF NOT FOUND THEN PERFORM money_missing('money_credit_note', 'trust entry', NEW.overpaid_entry_id); END IF;
    IF w.kind IS DISTINCT FROM 'WITHDRAWAL_TO_INVOICE' OR w.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      RAISE EXCEPTION 'money_credit_note: a refund or move-back choice names a trust application to this invoice' USING ERRCODE = 'check_violation';
    END IF;
    freed := money_moved_live(NEW.firm_id, NEW.overpaid_entry_id, 'TRUST_TO_OPERATING') - money_owed_back(NEW.firm_id, NEW.overpaid_entry_id, false);
    IF NEW.overpaid_minor > freed THEN
      RAISE EXCEPTION 'money_credit_note: only % % of that trust application has moved to operating and has no refund or move-back choice yet', to_char(greatest(freed, 0) / 100.0, 'FM999,999,990.00'), NEW.currency USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.overpaid_minor > NEW.amount_minor - (open_amount - greatest(trust, 0)) THEN
      RAISE EXCEPTION 'money_credit_note: a refund or move-back choice covers only the part of this credit note that trust paid and that has moved (at most % %)',
        to_char(greatest(NEW.amount_minor - (open_amount - greatest(trust, 0)), 0) / 100.0, 'FM999,999,990.00'), NEW.currency USING ERRCODE = 'check_violation';
    END IF;
    trust := trust - NEW.overpaid_minor;
  END IF;
  trust := greatest(trust, 0);
  IF NEW.amount_minor > open_amount - trust THEN
    IF NEW.amount_minor <= open_amount THEN
      RAISE EXCEPTION 'money_credit_note: % % of this invoice was paid from trust: return % % to trust first (a correction naming the withdrawal, AG-6-48 rule 4), then credit it; for money already moved to operating, choose Refund to the client or Move back to trust (OVERPAID_REFUND, OVERPAID_TO_TRUST)',
        to_char(trust / 100.0, 'FM999,999,990.00'), NEW.currency, to_char((NEW.amount_minor - (open_amount - trust)) / 100.0, 'FM999,999,990.00'), NEW.currency USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'money_credit_note: % is more than is left to credit on the invoice (%)', NEW.amount_minor, open_amount - trust USING ERRCODE = 'check_violation';
  END IF;
  -- A full credit note cancels all that is left (AG-6-48 rule 2), trust-paid part included: that part is returned (or
  -- chosen) first (Devin review on #1991: a "full" credit of only the unpaid part).
  whole := open_amount;
  open_amount := open_amount - trust;
  IF NEW."full" AND NEW.amount_minor <> whole THEN
    RAISE EXCEPTION 'money_credit_note: a full credit note credits all that is left (%)', whole USING ERRCODE = 'check_violation';
  END IF;
  NEW.number := money_take_number(NEW.firm_id, 'CREDIT_NOTE');
  NEW.created_at := now();
  RETURN NEW;
END $$;


-- FO-7a2's, its lock line only.
CREATE OR REPLACE FUNCTION money_move_batch_owed_back() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l record;
BEGIN
  IF NEW.undoes_batch_id IS NULL OR EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = NEW.firm_id AND u.undoes_batch_id = NEW.undoes_batch_id) THEN
    RETURN NEW;  -- not an undo, or already undone (FO-7mv's unique index refuses the second)
  END IF;
  FOR l IN SELECT x.source_entry_id, x.currency, coalesce(x.person_id, x.company_id) AS party, x.invoice_id, sum(x.amount_minor) AS amount
             FROM "money_move_line" x WHERE x.firm_id = NEW.firm_id AND x.batch_id = NEW.undoes_batch_id AND x.direction = 'TRUST_TO_OPERATING' AND x.kind = 'TRUST_APPLIED'
            GROUP BY 1, 2, 3, 4 ORDER BY 3, 1 LOOP
    PERFORM money_trust_lock(NEW.firm_id, l.party, l.currency);
    UPDATE "money_invoice" i SET updated_at = now() WHERE i.firm_id = NEW.firm_id AND i.id = l.invoice_id;
    IF money_owed_back(NEW.firm_id, l.source_entry_id, false) > 0
       AND money_moved_live(NEW.firm_id, l.source_entry_id, 'TRUST_TO_OPERATING') - l.amount < money_owed_back(NEW.firm_id, l.source_entry_id, false) THEN
      RAISE EXCEPTION 'money_move_batch: a credit note''s refund or move-back choice covers this move, so it is never undone (record the money''s way back instead)' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;


-- FO-7a2's, its lock line only.
CREATE OR REPLACE FUNCTION money_move_line_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b record; s record; party uuid; earlier integer; moved bigint; returned bigint; cap bigint; arrived boolean;
BEGIN
  SELECT x.undoes_batch_id, x.currency, x.direction, pg_xact_status(((pg_current_xact_id()::text::bigint >> 32 << 32) | x.xmin::text::bigint)::text::xid8) = 'in progress' AS mine
    INTO b FROM "money_move_batch" x WHERE x.firm_id = NEW.firm_id AND x.id = NEW.batch_id;
  IF NOT FOUND THEN PERFORM money_missing('money_move_line', 'batch', NEW.batch_id); END IF;
  IF b.undoes_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'money_move_line: an undo batch carries no lines (the undone batch''s lines go back to the list)' USING ERRCODE = 'check_violation';
  END IF;
  IF b.mine IS NOT TRUE THEN
    RAISE EXCEPTION 'money_move_line: a batch takes its lines in the transaction that records it; a recorded batch is never added to' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = NEW.firm_id AND u.undoes_batch_id = NEW.batch_id) THEN
    RAISE EXCEPTION 'money_move_line: an undone batch never gains a line, also in the transaction that records it' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.currency, NEW.direction) IS DISTINCT FROM (b.currency, b.direction) THEN
    RAISE EXCEPTION 'money_move_line: a line is in its batch''s currency and direction (% %); CAD and USD never share a batch', b.currency, b.direction USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'CARD_FEE_ON_TRUST' THEN
    RAISE EXCEPTION 'money_move_line: card fees on the trust account wait for card payments into trust (held, P-567; FO-7c)' USING ERRCODE = 'check_violation';
  END IF;
  SELECT e.kind, e.amount_minor, e.currency, e.person_id, e.company_id, e.invoice_id, e.correction_kind, d.kind AS corrected_kind, p.id AS deposit_payment_id
    INTO s FROM "money_trust_entry" e LEFT JOIN "money_trust_entry" d ON d.firm_id = e.firm_id AND d.id = e.corrects_entry_id
      LEFT JOIN "money_payment" p ON p.firm_id = d.firm_id AND p.id = d.payment_id
    WHERE e.firm_id = NEW.firm_id AND e.id = NEW.source_entry_id;
  IF NOT FOUND THEN PERFORM money_missing('money_move_line', 'trust entry', NEW.source_entry_id); END IF;
  -- The party's lock first, before anything that can change is read (break B-22: a "Returned" still open was missed).
  party := coalesce(s.person_id, s.company_id);
  PERFORM money_trust_lock(NEW.firm_id, party, s.currency);
  IF NEW.kind = 'TRUST_APPLIED' AND s.kind IS DISTINCT FROM 'WITHDRAWAL_TO_INVOICE' THEN
    RAISE EXCEPTION 'money_move_line: a trust application moves a withdrawal to an invoice, not a %', s.kind USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'WRONG_ACCOUNT' AND (s.kind IS DISTINCT FROM 'CORRECTION' OR s.corrected_kind IS DISTINCT FROM 'DEPOSIT' OR s.correction_kind IS DISTINCT FROM 'WRONG_ACCOUNT') THEN
    RAISE EXCEPTION 'money_move_line: only a WRONG_ACCOUNT correction of a deposit licenses a wrong-account move out of trust (this entry is a %): a bounced cheque or an entry error never reached the trust account as money to move',
      coalesce(s.correction_kind::text || ' ', '') || s.kind USING ERRCODE = 'check_violation';
  END IF;
  -- A wrong-account line moves only money that arrived: its payment is cleared and was never "Returned" (break B-20: a
  -- bounced cheque ticked cleared afterwards), read after the party's lock (a "Returned" takes it too) and with the
  -- payment row share-locked, so a "Cleared" tick written after this snapshot fails to serialise (40001) at REPEATABLE
  -- READ instead of being missed.
  IF NEW.kind = 'WRONG_ACCOUNT' THEN
    SELECT x.cleared AND NOT EXISTS (SELECT 1 FROM "money_trust_entry" r JOIN "money_trust_entry" c ON c.firm_id = r.firm_id AND c.id = NEW.source_entry_id
             WHERE r.firm_id = NEW.firm_id AND r.corrects_entry_id = c.corrects_entry_id AND r.correction_kind = 'RETURNED')
      INTO arrived FROM "money_payment" x WHERE x.firm_id = NEW.firm_id AND x.id = s.deposit_payment_id FOR SHARE;
  END IF;
  IF NEW.kind = 'WRONG_ACCOUNT' AND arrived IS NOT TRUE THEN
    RAISE EXCEPTION 'money_move_line: the payment this wrong-account correction names is not cleared, or was returned; it moves only once it has cleared' USING ERRCODE = 'check_violation';
  END IF;
  -- FO-7a2 rule 2c: back into trust only a trust application's money a credit note owes ("Move back to trust").
  IF NEW.direction <> 'TRUST_TO_OPERATING' AND NEW.kind <> 'TRUST_APPLIED' THEN
    RAISE EXCEPTION 'money_move_line: a % line moves from trust to operating (money into trust waits for its own ledger entry)', NEW.kind USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.currency <> s.currency THEN
    RAISE EXCEPTION 'money_move_line: a line is in its entry''s currency (%)', s.currency USING ERRCODE = 'check_violation';
  END IF;
  NEW.invoice_id := coalesce(NEW.invoice_id, s.invoice_id);
  IF NEW.person_id IS NULL AND NEW.company_id IS NULL THEN
    NEW.person_id := s.person_id; NEW.company_id := s.company_id;
  END IF;
  IF (NEW.invoice_id, NEW.person_id, NEW.company_id) IS DISTINCT FROM (s.invoice_id, s.person_id, s.company_id) THEN
    RAISE EXCEPTION 'money_move_line: a line''s invoice and party are its trust entry''s' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'TRUST_APPLIED' THEN
    UPDATE "money_invoice" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id AND x.id = s.invoice_id;
  END IF;
  SELECT count(*) INTO earlier FROM "money_move_line" l WHERE l.firm_id = NEW.firm_id AND l.source_entry_id = NEW.source_entry_id;
  moved := money_moved_live(NEW.firm_id, NEW.source_entry_id, NEW.direction);
  IF NEW.direction = 'OPERATING_TO_TRUST' THEN
    cap := money_owed_live(NEW.firm_id, NEW.source_entry_id);
    IF moved + NEW.amount_minor > cap THEN
      RAISE EXCEPTION 'money_move_line: a TRUST_APPLIED line moves from trust to operating, or back into trust only what a credit note owes (% % owed back, % moved back)', cap, NEW.currency, moved USING ERRCODE = 'check_violation';
    END IF;
    NEW.move_ordinal := earlier + 1;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF NEW.kind = 'TRUST_APPLIED' THEN
    SELECT coalesce(sum(c.amount_minor), 0) INTO returned FROM "money_trust_entry" c WHERE c.firm_id = NEW.firm_id AND c.corrects_entry_id = NEW.source_entry_id;
  ELSE
    returned := 0;
  END IF;
  -- What a credit note owes back to trust from this application can move out again only after it is moved back (rule 2c).
  cap := -s.amount_minor - returned + CASE WHEN NEW.kind = 'TRUST_APPLIED' THEN money_owed_live(NEW.firm_id, NEW.source_entry_id) ELSE 0 END;
  IF moved + NEW.amount_minor > cap THEN
    RAISE EXCEPTION 'money_move_line: % % would move more than this entry still holds (% % to move: % less % returned to trust, % moved before)',
      NEW.amount_minor, NEW.currency, cap - moved, NEW.currency, -s.amount_minor, returned, moved USING ERRCODE = 'check_violation';
  END IF;
  -- Break B-4 (AG-6-75 rules 3-4): after a reversal took the party below zero, its unmoved trust applications are undone
  -- money: what moves out never exceeds the party's ledger balance plus what it still has to move, so a shortfall is only
  -- ever money that had already moved.
  IF NEW.kind = 'TRUST_APPLIED' THEN
    SELECT coalesce((SELECT e.balance_after_minor FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND (e.person_id = party OR e.company_id = party)
      AND e.currency = s.currency ORDER BY e.seq DESC LIMIT 1), 0) INTO returned;
    IF returned < 0 AND returned + (cap - moved) - NEW.amount_minor < 0 THEN
      RAISE EXCEPTION 'money_move_line: this party''s trust balance is % % after a reversal; its unmoved trust applications are undone money and do not move (AG-6-75 rule 3)',
        to_char(returned / 100.0, 'FM999,999,990.00'), s.currency USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.move_ordinal := earlier + 1;
  NEW.created_at := now();
  RETURN NEW;
END $$;


-- PF-12: trigger functions on firm tables run as the wall reader (SECURITY DEFINER, search_path pinned); CREATE OR
-- REPLACE keeps the owner but resets these settings, so they are set again (as FO-7a2 does). money_issued_invoice keeps
-- its caller's rights (FO-7a's).
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['money_trust_entry_write()', 'money_credit_note_write()', 'money_move_line_write()', 'money_move_batch_owed_back()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
