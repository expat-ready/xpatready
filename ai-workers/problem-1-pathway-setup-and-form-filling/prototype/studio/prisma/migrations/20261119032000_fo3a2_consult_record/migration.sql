-- FO-3a part 2a (BACKLOG row FO-3a; AG-4-49 rules 1-9, §7, §8, §12; AG-4-50; concept fo-3-booking BR-15, BR-16, Q3):
-- the consult record of an attended booking, in its own area file (prisma/schema/front-office-consult.prisma, P-600).
--   * one record per booking, keyed on (firm_id, booking_id) to fo_booking (firm_id, id): never another firm's booking;
--   * Attended is the booking's own status (rule 2), never stored here; a later No-show keeps the record (§12);
--   * minutes 1-1,440 (pre-filled by the API with the booked length, rule 3), notes at most 10,000 characters, at most
--     20 recommended items of 1-120 characters each, a fee of 0 or more in minor units with its currency, and a
--     currency only with a fee (rule 6; CAD or USD only by the enum, X-6);
--   * a version for optimistic saves (STANDARDS §4: a stale save is refused by the API);
--   * PF-12's wall (forced policy on the session's firm, the firm gate first).
-- No row is written here. Rollback: DROP TABLE "fo_consult_record"; DROP FUNCTION fo_booking_consult_items_ok(text[]); DROP TYPE "FoConsultCurrency";
-- CreateEnum
CREATE TYPE "FoConsultCurrency" AS ENUM ('CAD', 'USD');

-- CreateTable
CREATE TABLE "fo_consult_record" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "time_spent_minutes" INTEGER NOT NULL,
    "notes" TEXT,
    "recommended" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "quoted_fee_minor" INTEGER,
    "quoted_fee_currency" "FoConsultCurrency",
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "fo_consult_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fo_consult_record_firm_id_booking_id_key" ON "fo_consult_record"("firm_id", "booking_id");

-- AddForeignKey
ALTER TABLE "fo_consult_record" ADD CONSTRAINT "fo_consult_record_firm_id_booking_id_fkey" FOREIGN KEY ("firm_id", "booking_id") REFERENCES "fo_booking"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- The rules Prisma cannot say (AG-4-49 rules 3-6).
ALTER TABLE "fo_consult_record" ADD CONSTRAINT "fo_consult_record_minutes_check" CHECK ("time_spent_minutes" BETWEEN 1 AND 1440);
ALTER TABLE "fo_consult_record" ADD CONSTRAINT "fo_consult_record_version_check" CHECK ("version" >= 1);
ALTER TABLE "fo_consult_record" ADD CONSTRAINT "fo_consult_record_notes_check" CHECK ("notes" IS NULL OR char_length("notes") <= 10000);
-- One dimension (break m3), at most 20 items, none empty or over 120 characters (a check cannot hold a subquery, so a small immutable function).
CREATE FUNCTION fo_booking_consult_items_ok(items text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT items IS NOT NULL AND coalesce(array_ndims(items), 1) = 1 AND cardinality(items) <= 20
    AND NOT EXISTS (SELECT 1 FROM unnest(items) AS r WHERE r IS NULL OR char_length(btrim(r)) NOT BETWEEN 1 AND 120)
$$;
ALTER TABLE "fo_consult_record" ADD CONSTRAINT "fo_consult_record_recommended_check" CHECK (fo_booking_consult_items_ok("recommended"));
ALTER TABLE "fo_consult_record" ADD CONSTRAINT "fo_consult_record_fee_check" CHECK (
  ("quoted_fee_minor" IS NULL AND "quoted_fee_currency" IS NULL)
  OR ("quoted_fee_minor" IS NOT NULL AND "quoted_fee_minor" >= 0 AND "quoted_fee_currency" IS NOT NULL));   -- NULL-safe (break m2)

-- PF-12's wall (forced policy on the session's firm, the firm gate first; tests/check_pf12_walls.ts).
ALTER TABLE "fo_consult_record" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_consult_record" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_consult_record" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
