-- FO-9b part 1 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction, after the code is
-- rolled back, and only while no merge stands (a standing merge's tombstone would lose its survivor; undo it first):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261123010000_fo9b_person_merge/rollback.sql
-- The merge records (fo_dup_merge) are dropped with their table: keep a copy first if any exist.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "fo_person" WHERE "merged_into_id" IS NOT NULL) OR EXISTS (SELECT 1 FROM "fo_company" WHERE "merged_into_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'FO-9b rollback: a merge still stands; undo it first';
  END IF;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['fo_lead', 'fo_note', 'fo_call', 'fo_arrival_receipt', 'fo_booking', 'fo_company_contact', 'fo_prospect'] LOOP
    EXECUTE format('DROP TRIGGER "fo_dup_live_party" ON %I', t);
  END LOOP;
END $$;
DROP FUNCTION fo_dup_live_party();
DROP POLICY "pf12_firm" ON "fo_dup_merge";
DROP INDEX "fo_dup_merge_one_standing";
DROP TABLE "fo_dup_merge";
DROP FUNCTION fo_dup_merge_write(), fo_dup_merge_no_delete();
DROP TYPE "FoDupKind";
ALTER TABLE "fo_person" DROP CONSTRAINT "fo_dup_person_tombstone", DROP CONSTRAINT "fo_person_firm_id_merged_into_id_fkey", DROP COLUMN "merged_into_id", DROP COLUMN "merged_at";
ALTER TABLE "fo_company" DROP CONSTRAINT "fo_dup_company_tombstone", DROP CONSTRAINT "fo_company_firm_id_merged_into_id_fkey", DROP COLUMN "merged_into_id", DROP COLUMN "merged_at";
ALTER TABLE "fo_arrival_receipt" DROP CONSTRAINT "fo_arrival_receipt_firm_id_lead_id_person_id_fkey";
ALTER TABLE "fo_call" DROP CONSTRAINT "fo_call_firm_id_lead_id_person_id_fkey";
ALTER TABLE "fo_note" DROP CONSTRAINT "fo_note_firm_id_lead_id_person_id_fkey";
ALTER TABLE "fo_arrival_receipt" ADD CONSTRAINT "fo_arrival_receipt_firm_id_lead_id_person_id_fkey" FOREIGN KEY ("firm_id", "lead_id", "person_id") REFERENCES "fo_lead"("firm_id", "id", "person_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "fo_call" ADD CONSTRAINT "fo_call_firm_id_lead_id_person_id_fkey" FOREIGN KEY ("firm_id", "lead_id", "person_id") REFERENCES "fo_lead"("firm_id", "id", "person_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "fo_note" ADD CONSTRAINT "fo_note_firm_id_lead_id_person_id_fkey" FOREIGN KEY ("firm_id", "lead_id", "person_id") REFERENCES "fo_lead"("firm_id", "id", "person_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE OR REPLACE FUNCTION fo_sales_insert_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%: rows are written once, never changed or removed (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION fo_sales_insert_only() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION fo_sales_insert_only() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261123010000_fo9b_person_merge';
