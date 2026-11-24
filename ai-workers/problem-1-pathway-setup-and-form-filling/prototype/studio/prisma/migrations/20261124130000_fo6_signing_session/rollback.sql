-- Rollback of 20261124130000_fo6_signing_session (FO-6 part 4b): the check, then the two columns.
ALTER TABLE "fo_signer" DROP CONSTRAINT IF EXISTS "fo_signer_session_check";
ALTER TABLE "fo_signer" DROP COLUMN IF EXISTS "session_expires_at", DROP COLUMN IF EXISTS "session_sha256";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261124130000_fo6_signing_session';
