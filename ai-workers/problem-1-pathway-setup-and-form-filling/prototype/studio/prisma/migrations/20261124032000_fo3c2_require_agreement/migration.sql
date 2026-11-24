-- FO-3c part 2 (R1.104; Lead 10's ruling W4b, 23 Nov; AG-4-15 rule 1 "requireAgreement"; Code SOR/2022-128 s. 23,
-- Unconfirmed: no counsel): whether a booking type needs the consultation agreement signed before the consultation
-- starts. Nullable: null is the default by the type's purpose (on for every purpose but FOLLOW_UP, a meeting after the
-- first consultation; consultation-agreement/gate.ts `needsAgreement`), so no existing row is written here and a type
-- made before this part keeps today's behaviour (part 1 sent the agreement for every type; a follow-up now gets none).
-- A person's choice on the type's settings stores true or false. The stamp is after main's newest (20261124030000; Lead 18, 24 Nov).
-- Rollback: rollback.sql in this folder (Prisma reads only migration.sql).

-- Prisma's DDL.
-- AlterTable
ALTER TABLE "fo_consultation_type" ADD COLUMN "require_agreement" BOOLEAN;
