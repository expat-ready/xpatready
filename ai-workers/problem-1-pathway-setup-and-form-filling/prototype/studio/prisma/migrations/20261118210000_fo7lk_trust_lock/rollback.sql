-- FO-7lk rollback (not a migration: Prisma reads only migration.sql). Restores FO-7a's money_issued_invoice and FO-7a2's
-- money_trust_entry_write, money_credit_note_write, money_move_batch_owed_back and money_move_line_write exactly as
-- they were before FO-7lk, then drops money_trust_lock. Run in one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261118210000_fo7lk_trust_lock/rollback.sql
-- tests/check_fo7lk_lock_order.ts runs it and compares each function's text with the database before FO-7lk.

-- The four lock lines back to the inline key: each function's own definition, with only that call replaced (its owner,
-- SECURITY DEFINER and search_path come back with it).
DO $back$
DECLARE r record; def text; fixed text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('money_issued_invoice(uuid,uuid,"MoneyCurrency",text)', 'PERFORM money_trust_lock(f, party, pcur);',
       'PERFORM pg_advisory_xact_lock(hashtextextended(''money_trust:'' || f || '':'' || party || '':'' || pcur, 0));'),
      ('money_trust_entry_write()', 'PERFORM money_trust_lock(NEW.firm_id, party, NEW.currency);',
       'PERFORM pg_advisory_xact_lock(hashtextextended(''money_trust:'' || NEW.firm_id || '':'' || party || '':'' || NEW.currency, 0));'),
      ('money_move_batch_owed_back()', 'PERFORM money_trust_lock(NEW.firm_id, l.party, l.currency);',
       'PERFORM pg_advisory_xact_lock(hashtextextended(''money_trust:'' || NEW.firm_id || '':'' || l.party || '':'' || l.currency, 0));'),
      ('money_move_line_write()', 'PERFORM money_trust_lock(NEW.firm_id, party, s.currency);',
       'PERFORM pg_advisory_xact_lock(hashtextextended(''money_trust:'' || NEW.firm_id || '':'' || party || '':'' || s.currency, 0));')
    ) AS v(fn, now_text, was_text) LOOP
    def := pg_get_functiondef(r.fn::regprocedure);
    fixed := replace(def, r.now_text, r.was_text);
    IF fixed = def THEN RAISE EXCEPTION 'FO-7lk rollback: % does not hold FO-7lk''s lock line', r.fn; END IF;
    EXECUTE fixed;
  END LOOP;
END
$back$;

-- FO-7a2's text, exactly.
CREATE OR REPLACE FUNCTION money_credit_note_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE open_amount bigint; trust bigint; w record; freed bigint := 0; whole bigint;
BEGIN
  IF NEW.number IS NOT NULL THEN
    RAISE EXCEPTION 'money_credit_note: the number is the database''s' USING ERRCODE = 'check_violation';
  END IF;
  IF num_nonnulls(NEW.overpaid_choice, NEW.overpaid_entry_id, NEW.overpaid_minor) NOT IN (0, 3) THEN
    RAISE EXCEPTION 'money_credit_note: a refund or move-back choice carries its amount and its trust application, all three (money_credit_note_overpaid_check)' USING ERRCODE = 'check_violation';
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

ALTER FUNCTION money_credit_note_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_credit_note_write() OWNER TO xr_wall_reader;

DROP FUNCTION money_trust_lock(uuid, uuid, "MoneyCurrency");
