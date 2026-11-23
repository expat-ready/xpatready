-- Rollback of 20261123030000_fo7t1_evidence_key: FO-7a's check as it was (which refuses every non-null key with an error).
ALTER TABLE "money_payment" DROP CONSTRAINT "money_payment_evidence_check";
ALTER TABLE "money_payment" ADD CONSTRAINT "money_payment_evidence_check" CHECK ("evidence_file_key" IS NULL OR "evidence_file_key" ~ '^[A-Za-z0-9][A-Za-z0-9/._-]{0,299}$');
DELETE FROM _prisma_migrations WHERE migration_name = '20261123030000_fo7t1_evidence_key';
