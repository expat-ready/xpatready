-- FO-3a part 1a (BACKLOG row FO-3a; brief lead-b-briefs/FO-3a.md with P-626-order.md amendment A2; AG-4-9 rules 1, 5, 7
-- and §7, AG-4-10 rules 1-5 and §7; concept fo-3-booking BR-19, "manage" reserved): what booking types need to be kept as
-- settings. Additive: new columns with defaults that leave every existing type as it is (colour C1, version 1, not
-- deleted, no description, no creator), three new purposes, and the slug's unique narrowed to the not-deleted rows (a
-- deleted type frees its slug, AG-4-9 rule 5). PAID_CONSULT is not added: it takes payment at booking (AG-4-10 rule 2),
-- held as map row 44 (BACKLOG X-22). created_by_staff_id carries no foreign key, as fo_time_off.created_by: staff rows
-- are never deleted, and it is history only.
-- Rollback: DROP INDEX "fo_consultation_type_firm_id_slug_key"; CREATE UNIQUE INDEX "fo_consultation_type_firm_id_slug_key"
--   ON "fo_consultation_type"("firm_id", "slug"); ALTER TABLE "fo_consultation_type" DROP CONSTRAINT
--   "fo_consultation_type_slug_reserved", DROP CONSTRAINT "fo_consultation_type_description_check", DROP CONSTRAINT
--   "fo_consultation_type_version_check", DROP COLUMN description, colour, version, deleted_at, created_by_staff_id;
--   DROP TYPE "FoTypeColour". (Enum values cannot be dropped; FOLLOW_UP, CASE_REVIEW and OTHER stay unused.)

-- AG-4-10 §7: the purposes of month one's settings (PAID_CONSULT waits on row 44).
ALTER TYPE "FoConsultationPurpose" ADD VALUE IF NOT EXISTS 'FOLLOW_UP';
ALTER TYPE "FoConsultationPurpose" ADD VALUE IF NOT EXISTS 'CASE_REVIEW';
ALTER TYPE "FoConsultationPurpose" ADD VALUE IF NOT EXISTS 'OTHER';

-- AG-4-9 rule 1: the closed palette of eight. The requirement names it only by a file of the team's code
-- (appointment-type-types.ts:101-110), which no capture readable here holds: the values are Sample (C1 … C8).
CREATE TYPE "FoTypeColour" AS ENUM ('C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8');

ALTER TABLE "fo_consultation_type"
  ADD COLUMN "description" text NULL,
  ADD COLUMN "colour" "FoTypeColour" NOT NULL DEFAULT 'C1',
  ADD COLUMN "version" integer NOT NULL DEFAULT 1,
  ADD COLUMN "deleted_at" timestamptz NULL,
  ADD COLUMN "created_by_staff_id" uuid NULL,
  ADD CONSTRAINT "fo_consultation_type_description_check" CHECK ("description" IS NULL OR char_length("description") <= 1000),
  ADD CONSTRAINT "fo_consultation_type_version_check" CHECK ("version" >= 1),
  -- The manage page lives at /book/<firmKey>/manage (concept fo-3-booking BR-19).
  ADD CONSTRAINT "fo_consultation_type_slug_reserved" CHECK ("slug" <> 'manage');

-- AG-4-9 rule 5 and §7: a slug is unique in the firm among the not-deleted types. Same name, so FO-1b's checks still
-- read it.
DROP INDEX "fo_consultation_type_firm_id_slug_key";
CREATE UNIQUE INDEX "fo_consultation_type_firm_id_slug_key" ON "fo_consultation_type"("firm_id", "slug") WHERE "deleted_at" IS NULL;
