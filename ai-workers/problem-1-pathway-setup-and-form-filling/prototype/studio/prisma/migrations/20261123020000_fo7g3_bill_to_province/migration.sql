-- FO-7g part 3 (R1.56; P-797, decided 22 Nov from CRA GST/HST Memorandum 3-3-6 "Place of Supply in a Province - General
-- Rules for Services", para 20 and Example 6; AG-6-4 rules 1, 4 and 7, edge case 12; Tax readings: Unconfirmed: no
-- accountant): the province an invoice's tax follows. A nullable Bill-to province on money_invoice, one of the 13 codes
-- or null; the route fills it on a new draft (the client's Canadian address when the record holds one, else the firm's
-- province) and a person may change it on a draft; it is fixed once the invoice is issued (as FO-7a's freeze fixes the
-- rest). Null on a draft written before this part is read as the firm's province (billToProvince's fallback), so no
-- existing row is written here. The stamp is after main's newest (20261122180000) and #3042's 20261123010000 (P-600).
-- Rollback: rollback.sql in this folder (Prisma reads only migration.sql).

-- Prisma's DDL.
-- AlterTable
ALTER TABLE "money_invoice" ADD COLUMN "bill_to_province" TEXT;

-- The 13 codes of api/src/client-money/tax/canada-gst-hst.ts (PROVINCE_CODES), or null.
ALTER TABLE "money_invoice" ADD CONSTRAINT "money_invoice_bill_to_province_check"
  CHECK ("bill_to_province" IS NULL OR "bill_to_province" IN ('AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'));

-- Frozen at issue (AG-6-4 rule 7): an issued invoice's Bill-to province never changes. money_invoice_write's own list
-- of fixed fields is left as it is (no function of another part is replaced); this one gate fixes the new column.
CREATE FUNCTION money_invoice_bill_to_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL AND NEW.bill_to_province IS DISTINCT FROM OLD.bill_to_province THEN
    RAISE EXCEPTION 'money_invoice: issued invoices can''t be edited — use a credit note (% is fixed)', OLD.number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_invoice_bill_to_frozen BEFORE UPDATE ON "money_invoice" FOR EACH ROW EXECUTE FUNCTION money_invoice_bill_to_frozen();

-- PF-12: every trigger function runs as the wall reader. PF-8b F4 (RDS): a non-superuser may hand a function to
-- xr_wall_reader only while it holds CREATE on public; granted for the hand-over and taken back after (a no-op pair on a
-- superuser cluster; tests/check_pf8b_f4_migrations.ts).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION money_invoice_bill_to_frozen() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_invoice_bill_to_frozen() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
REVOKE ALL ON FUNCTION money_invoice_bill_to_frozen() FROM PUBLIC;
