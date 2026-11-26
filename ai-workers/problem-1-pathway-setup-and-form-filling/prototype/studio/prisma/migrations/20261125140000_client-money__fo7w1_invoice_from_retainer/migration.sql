-- FO-7w1 (R1.56 W1; AG-6-65 rule 1, AG-6-64 rules 2 and 6, AG-6-61): a draft invoice started from a signed retainer.
-- Two additive columns, no row written:
--   money_invoice_line.source_fee_row_id: the retainer fee row a line was billed from (the front office's
--     fo_retainer_fee_row id; no foreign key across the module wall). Unique per firm, so a row is billed once: two
--     drafts started at once from the same row leave one line (the second is refused). A deleted draft's lines go with
--     it, so the row is free again (AG-6-64 rule 6). Null on every line typed by hand.
--   money_invoice.deposit: the invoice bills an "On signing" row, a deposit (Code s. 32; AG-6-61): such an invoice never
--     carries a card pay link (P-567 (3); FO-7c reads it). Set when the draft is made, never changed after.
-- The stamp is after main's newest (20261124170000) and AUD-1c's in-flight 20261125113000 (P-600); both parts only add
-- columns, to different tables (P-228). Rollback: rollback.sql in this folder (Prisma reads only migration.sql).

-- Prisma's DDL.
-- AlterTable
ALTER TABLE "money_invoice_line" ADD COLUMN "source_fee_row_id" UUID;
ALTER TABLE "money_invoice" ADD COLUMN "deposit" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "money_invoice_line_firm_id_source_fee_row_id_key" ON "money_invoice_line"("firm_id", "source_fee_row_id");

-- A line's source and an invoice's deposit mark are written once, with the row, and never changed.
CREATE FUNCTION money_invoice_source_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Nested, never one AND: PL/pgSQL resolves NEW's field on either side, and each table has only its own column.
  IF TG_TABLE_NAME = 'money_invoice_line' THEN
    IF NEW.source_fee_row_id IS DISTINCT FROM OLD.source_fee_row_id THEN
      RAISE EXCEPTION 'money_invoice_line: a line''s retainer fee row is fixed when the line is made' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.deposit IS DISTINCT FROM OLD.deposit THEN
    RAISE EXCEPTION 'money_invoice: whether an invoice is a deposit is fixed when the draft is made' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_invoice_line_source_fixed BEFORE UPDATE ON "money_invoice_line" FOR EACH ROW EXECUTE FUNCTION money_invoice_source_fixed();
CREATE TRIGGER money_invoice_deposit_fixed BEFORE UPDATE ON "money_invoice" FOR EACH ROW EXECUTE FUNCTION money_invoice_source_fixed();

-- PF-12: every trigger function runs as the wall reader. PF-8b F4 (RDS): a non-superuser may hand a function to
-- xr_wall_reader only while it holds CREATE on public; granted for the hand-over and taken back after.
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION money_invoice_source_fixed() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_invoice_source_fixed() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
REVOKE ALL ON FUNCTION money_invoice_source_fixed() FROM PUBLIC;
