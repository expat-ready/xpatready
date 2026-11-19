-- FO-7ts part 2 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction, before any
-- MOVE_TO_CASE entry or credit entry exists that must be kept (it refuses otherwise):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261119080000_fo7ts_ledgers/rollback.sql
-- Restores money_trust_entry_write exactly as FO-7lk left it (by running FO-7lk's migration again), the two checks as FO-7a2 wrote them, and drops the rest.
-- The enum value MOVE_TO_CASE stays (PostgreSQL cannot drop one). Then delete this folder's row from _prisma_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "money_trust_entry" WHERE "kind"::text = 'MOVE_TO_CASE') THEN
    RAISE EXCEPTION 'FO-7ts part 2 rollback: moves to a case are recorded; they cannot be rolled back silently';
  END IF;
  IF EXISTS (SELECT 1 FROM "money_credit_entry") THEN  -- break R1 on 692ea4be: never drop a client's credit
    RAISE EXCEPTION 'FO-7ts part 2 rollback: credit entries are recorded; they cannot be rolled back silently';
  END IF;
END $$;
DROP TRIGGER money_refund_credit_kept ON "money_refund";
DROP TRIGGER money_refund_credit_lock ON "money_refund";
DROP TRIGGER money_trust_entry_credit_kept ON "money_trust_entry";
DROP TRIGGER money_invoice_line_credit ON "money_invoice_line";
DROP TRIGGER money_invoice_credit_pinned ON "money_invoice";
DROP FUNCTION money_refund_credit_kept(), money_trust_entry_credit_kept(), money_invoice_line_credit(), money_invoice_credit_pinned();
DROP TABLE "money_credit_entry";
DROP FUNCTION money_credit_entry_holds(), money_credit_kept_holds(uuid, uuid, text), money_invoice_credit(uuid, uuid, "MoneyCreditKind");
DROP FUNCTION money_credit_entry_write(), money_invoice_due(uuid, uuid);
DROP TYPE "MoneyCreditKind";
DROP TRIGGER money_trust_entry_move_paired ON "money_trust_entry";
DROP FUNCTION money_trust_entry_move_paired();
ALTER TABLE "money_trust_entry" DROP CONSTRAINT "money_trust_entry_move_check",
  DROP CONSTRAINT "money_trust_entry_sign_check",
  ADD CONSTRAINT "money_trust_entry_sign_check" CHECK (("kind" = 'DEPOSIT' AND "amount_minor" > 0) OR ("kind" IN ('WITHDRAWAL_TO_INVOICE', 'REFUND_TO_CLIENT') AND "amount_minor" < 0) OR ("kind" = 'CORRECTION' AND "amount_minor" <> 0)),
  DROP CONSTRAINT "money_trust_entry_balance_check",
  ADD CONSTRAINT "money_trust_entry_balance_check" CHECK ("seq" >= 1 AND ("balance_after_minor" >= 0 OR "amount_minor" > 0
    OR ("kind" = 'CORRECTION' AND "correction_kind" IN ('RETURNED', 'RECORDED_BY_MISTAKE', 'WRONG_CLIENT', 'OTHER')))),
  DROP COLUMN "moved_from_entry_id";

-- FO-7lk's text, exactly: its migration is CREATE OR REPLACE throughout, so running it again restores
-- money_trust_entry_write (and leaves its other functions as they are), PF-12's reader settings included.
\ir ../20261118210000_fo7lk_trust_lock/migration.sql
