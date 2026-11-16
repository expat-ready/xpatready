-- FO-7a2 (brief product/design/lead-b-briefs/FO-7a2.md rev 16.53, order rev 16.58; P-634, P-638; AG-6-60 rule 7, AG-6-63 rule 7,
-- AG-6-68 rules 5 and 8, AG-6-75 rules 1-6, AG-6-48 rules 3-4, AG-6-73 rules 1 and 4, AG-6-21; breaks B-1, B-3, B-4, B-10 to B-13,
-- B-17 of FO-7mv's break report; legal reading Unconfirmed: no counsel): the trust ledger's reversal and credit-note rules.
-- Replaces FO-7a's money_trust_entry_write, money_credit_note_write and money_write_off_write (CREATE OR REPLACE; owner and
-- PF-12's reader settings kept below) and its balance check; adds money_trust_paid, money_payment_returned_not_cleared and
-- the view money_trust_shortfall. No table or column. Rollback: re-run FO-7a's three functions from its migration, put back
-- money_trust_entry_balance_check (balance_after_minor >= 0 AND seq >= 1) once no row is below zero, DROP VIEW
-- money_trust_shortfall, DROP TRIGGER money_payment_returned_not_cleared ON money_payment, DROP FUNCTION
-- money_payment_returned_not_cleared(), money_trust_paid(uuid, uuid).

-- Trust applied to an invoice and not returned: its withdrawals less the money returned to trust from them (FO-7a's sum).
CREATE OR REPLACE FUNCTION money_trust_paid(f uuid, inv uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS
  $$ SELECT coalesce(-sum(e.amount_minor), 0) - coalesce((SELECT sum(c.amount_minor) FROM "money_trust_entry" c JOIN "money_trust_entry" w ON w.firm_id = c.firm_id AND w.id = c.corrects_entry_id
       WHERE c.firm_id = f AND c.kind = 'CORRECTION' AND w.invoice_id = inv), 0)
     FROM "money_trust_entry" e WHERE e.firm_id = f AND e.invoice_id = inv AND e.kind = 'WITHDRAWAL_TO_INVOICE' $$;

-- A balance may be below zero only after a reversal (AG-6-60 rule 7), and money in leaves it as it is or raises it.
ALTER TABLE "money_trust_entry" DROP CONSTRAINT "money_trust_entry_balance_check",
  ADD CONSTRAINT "money_trust_entry_balance_check" CHECK ("seq" >= 1 AND ("balance_after_minor" >= 0 OR "amount_minor" > 0
    OR ("kind" = 'CORRECTION' AND "correction_kind" IN ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER'))));

CREATE OR REPLACE FUNCTION money_trust_entry_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d record; reversal boolean := false; last_seq integer; last_balance bigint; party uuid := coalesce(NEW.person_id, NEW.company_id); bal bigint; applied bigint; open_amount bigint; returned bigint;
BEGIN
  -- The party's lock first, before any invoice row is touched, so a "Trust first" deposit and withdrawal in one
  -- transaction never deadlock with another withdrawal on the same invoice (review round 2, Minor 2: 40P01).
  IF party IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('money_trust:' || NEW.firm_id || ':' || party || ':' || NEW.currency, 0));
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

CREATE OR REPLACE FUNCTION money_credit_note_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE open_amount bigint; trust bigint;
BEGIN
  IF NEW.number IS NOT NULL THEN
    RAISE EXCEPTION 'money_credit_note: the number is the database''s' USING ERRCODE = 'check_violation';
  END IF;
  open_amount := money_issued_invoice(NEW.firm_id, NEW.invoice_id, NEW.currency, 'money_credit_note');
  trust := money_trust_paid(NEW.firm_id, NEW.invoice_id);
  IF NEW.amount_minor > open_amount - trust THEN
    IF NEW.amount_minor <= open_amount THEN
      RAISE EXCEPTION 'money_credit_note: % % of this invoice was paid from trust: return % % to trust first (a correction naming the withdrawal, AG-6-48 rule 4), then credit it',
        to_char(trust / 100.0, 'FM999,999,990.00'), NEW.currency, to_char((NEW.amount_minor - (open_amount - trust)) / 100.0, 'FM999,999,990.00'), NEW.currency USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'money_credit_note: % is more than is left to credit on the invoice (%)', NEW.amount_minor, open_amount - trust USING ERRCODE = 'check_violation';
  END IF;
  open_amount := open_amount - trust;
  IF NEW."full" AND NEW.amount_minor <> open_amount THEN
    RAISE EXCEPTION 'money_credit_note: a full credit note credits all that is left (%)', open_amount USING ERRCODE = 'check_violation';
  END IF;
  NEW.number := money_take_number(NEW.firm_id, 'CREDIT_NOTE');
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION money_write_off_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE open_amount bigint; trust bigint;
BEGIN
  open_amount := money_issued_invoice(NEW.firm_id, NEW.invoice_id, NEW.currency, 'money_write_off');
  trust := money_trust_paid(NEW.firm_id, NEW.invoice_id);
  IF NEW.amount_minor > open_amount - trust AND NEW.amount_minor <= open_amount THEN
    RAISE EXCEPTION 'money_write_off: % % of this invoice was paid from trust: only what trust has not paid is written off (% left)', to_char(trust / 100.0, 'FM999,999,990.00'), NEW.currency, open_amount - trust USING ERRCODE = 'check_violation';
  END IF;
  open_amount := open_amount - trust;
  IF NEW.amount_minor > open_amount THEN
    RAISE EXCEPTION 'money_write_off: % is more than is left on the invoice (%)', NEW.amount_minor, open_amount USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;

-- B-17: a payment reversed as "Returned" (it bounced) is never ticked cleared afterwards. Read after the party's lock is
-- not possible here (a tick takes none); at READ COMMITTED a "Returned" written first is seen.
CREATE OR REPLACE FUNCTION money_payment_returned_not_cleared() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cleared AND NOT OLD.cleared AND EXISTS (SELECT 1 FROM "money_trust_entry" d JOIN "money_trust_entry" r ON r.firm_id = d.firm_id AND r.corrects_entry_id = d.id
       WHERE d.firm_id = NEW.firm_id AND d.payment_id = NEW.id AND d.kind = 'DEPOSIT' AND r.correction_kind = 'RETURNED') THEN
    RAISE EXCEPTION 'money_payment: this payment was reversed as "Returned" (it bounced) and is never ticked cleared' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_payment_returned_not_cleared BEFORE UPDATE OF "cleared" ON "money_payment" FOR EACH ROW EXECUTE FUNCTION money_payment_returned_not_cleared();

-- AG-6-75 rule 4, AG-6-60 rule 7: each party below zero, per currency, with the reversal that took it below (the latest
-- reversal at or before the newest entry), for the case's red line, the monthly check and the Owner's item (screens later).
CREATE OR REPLACE VIEW "money_trust_shortfall" WITH (security_invoker = true) AS
  SELECT l.firm_id, l.person_id, l.company_id, l.currency, l.balance_after_minor AS balance_minor, l.seq,
         (SELECT r.id FROM "money_trust_entry" r WHERE r.firm_id = l.firm_id AND r.person_id IS NOT DISTINCT FROM l.person_id AND r.company_id IS NOT DISTINCT FROM l.company_id
            AND r.currency = l.currency AND r.kind = 'CORRECTION' AND r.correction_kind IN ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER') ORDER BY r.seq DESC LIMIT 1) AS reversal_entry_id
    FROM (SELECT DISTINCT ON (e.firm_id, e.person_id, e.company_id, e.currency) e.* FROM "money_trust_entry" e
            ORDER BY e.firm_id, e.person_id, e.company_id, e.currency, e.seq DESC) l
   WHERE l.balance_after_minor < 0;

-- PF-12: trigger functions on firm tables run as the wall reader (SECURITY DEFINER, search_path pinned); CREATE OR
-- REPLACE keeps the owner but resets these settings, so they are set again.
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['money_trust_entry_write()', 'money_credit_note_write()', 'money_write_off_write()', 'money_payment_returned_not_cleared()', 'money_trust_paid(uuid, uuid)'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
