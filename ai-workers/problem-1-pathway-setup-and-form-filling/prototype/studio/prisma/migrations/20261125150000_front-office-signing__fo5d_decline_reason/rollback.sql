-- Rollback of 20261125150000_front-office-signing__fo5d_decline_reason: the check, then the column (any reasons kept are lost with it).
ALTER TABLE "fo_signer" DROP CONSTRAINT IF EXISTS "fo_signer_decline_reason_check";
ALTER TABLE "fo_signer" DROP COLUMN IF EXISTS "decline_reason";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261125150000_front-office-signing__fo5d_decline_reason';
