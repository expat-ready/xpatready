-- FO-9b part 1 (BACKLOG row FO-9b; brief design/lead-b-briefs/FO-9b.md "Part 1" and design/briefs/track-b/FO-9b-1.md;
-- P-574 (2); AG-2-16 rules 2, 5, 11, §10; schema files front-office-duplicates.prisma (new, this row's) and
-- front-office-sales.prisma (FO-1a's area: the two tombstone slot lines and three onUpdate changes, below)).
--   * fo_person / fo_company gain merged_into_id and merged_at (the tombstone: a merged-away record names its survivor,
--     never deleted; RESTRICT key to its own table in the same firm; both empty or both set; never itself).
--   * P-600 (b) exception, confirmed by Lead B 22 Nov 14:5x IST (brief FO-9b-1 "The schema enabler"):
--     (1) the lead-level keys (firm_id, lead_id, person_id) → fo_lead of fo_arrival_receipt, fo_call and fo_note become
--         ON UPDATE CASCADE, so moving a lead to the survivor moves its receipts, calls and notes with it (AG-2-16 rule 2
--         "Re-parent all, delete nothing"; rule 5 "No row ever points to a tombstone");
--     (2) FO-1a's fo_sales_insert_only lets exactly one kind of UPDATE through: on fo_note, a change of person_id alone,
--         while the merge transaction has set fo_dup.merging to 'on' with set_config(…, true) (transaction-local). Every
--         other update, every delete and truncate, and every update of fo_lead_attribution and fo_stage_move is still
--         refused; a note's text, author, time, lead and visibility never change (AG-13-21, -24).
--   * fo_dup_live_party: a row written or re-pointed onto a merged-away record is refused (rule 5), on the seven tables of
--     columns.ts's MOVE list (P-600 (b) exception too: new triggers on FO-1a's, FO-1b's and FO-2b's tables).
--   * fo_dup_merge: the merge record, written once; its only change is the Undo stamp (undone_at and undone_by from
--     empty, together, once); never deleted or truncated (fo_dup_merge_write, fo_dup_merge_no_delete). PF-12's wall.
-- Rollback: rollback.sql in this folder.

-- CreateEnum
CREATE TYPE "FoDupKind" AS ENUM ('PERSON', 'COMPANY');

-- (1) the three lead-level keys cascade on update: dropped here, re-added in the lifted block below
ALTER TABLE "fo_arrival_receipt" DROP CONSTRAINT "fo_arrival_receipt_firm_id_lead_id_person_id_fkey";
ALTER TABLE "fo_call" DROP CONSTRAINT "fo_call_firm_id_lead_id_person_id_fkey";
ALTER TABLE "fo_note" DROP CONSTRAINT "fo_note_firm_id_lead_id_person_id_fkey";

-- the tombstone (slot lines in front-office-sales.prisma)
ALTER TABLE "fo_person" ADD COLUMN "merged_at" TIMESTAMPTZ, ADD COLUMN "merged_into_id" UUID;
ALTER TABLE "fo_company" ADD COLUMN "merged_at" TIMESTAMPTZ, ADD COLUMN "merged_into_id" UUID;

-- PF-8b F7 (Amazon RDS: the admin is neither superuser nor BYPASSRLS; Lead 9 on #3042): adding a foreign key validates
-- the existing rows of a walled table, so the five keys are added with FORCE lifted inside this one statement (ACCESS
-- EXCLUSIVE first, so nobody sees the walls lifted) and put back after, in F7's lift shape. A superuser or BYPASSRLS
-- runner does exactly what it did. tests/check_pf8b_f7_data_walls.ts fails when a key on a walled table is added without
-- this. fo_lead is the referenced table of the three lead-level keys and is lifted with them.
DO $pf8b_f7$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['fo_arrival_receipt', 'fo_call', 'fo_company', 'fo_lead', 'fo_note', 'fo_person']; gated text[] := '{}';
BEGIN
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled = 'O' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  ALTER TABLE "fo_arrival_receipt" ADD CONSTRAINT "fo_arrival_receipt_firm_id_lead_id_person_id_fkey" FOREIGN KEY ("firm_id", "lead_id", "person_id") REFERENCES "fo_lead"("firm_id", "id", "person_id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "fo_call" ADD CONSTRAINT "fo_call_firm_id_lead_id_person_id_fkey" FOREIGN KEY ("firm_id", "lead_id", "person_id") REFERENCES "fo_lead"("firm_id", "id", "person_id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "fo_note" ADD CONSTRAINT "fo_note_firm_id_lead_id_person_id_fkey" FOREIGN KEY ("firm_id", "lead_id", "person_id") REFERENCES "fo_lead"("firm_id", "id", "person_id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "fo_person" ADD CONSTRAINT "fo_person_firm_id_merged_into_id_fkey" FOREIGN KEY ("firm_id", "merged_into_id") REFERENCES "fo_person"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
  ALTER TABLE "fo_company" ADD CONSTRAINT "fo_company_firm_id_merged_into_id_fkey" FOREIGN KEY ("firm_id", "merged_into_id") REFERENCES "fo_company"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END $pf8b_f7$;
ALTER TABLE "fo_person" ADD CONSTRAINT "fo_dup_person_tombstone" CHECK (("merged_into_id" IS NULL) = ("merged_at" IS NULL) AND "merged_into_id" IS DISTINCT FROM "id");
ALTER TABLE "fo_company" ADD CONSTRAINT "fo_dup_company_tombstone" CHECK (("merged_into_id" IS NULL) = ("merged_at" IS NULL) AND "merged_into_id" IS DISTINCT FROM "id");

-- CreateTable
CREATE TABLE "fo_dup_merge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "kind" "FoDupKind" NOT NULL,
    "survivor_id" UUID NOT NULL,
    "loser_id" UUID NOT NULL,
    "loser_snapshot" JSONB NOT NULL,
    "survivor_before" JSONB NOT NULL,
    "choices" JSONB NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "by" TEXT NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMPTZ,
    "undone_by" TEXT,

    CONSTRAINT "fo_dup_merge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fo_dup_merge_two" CHECK ("survivor_id" <> "loser_id"),
    CONSTRAINT "fo_dup_merge_undone" CHECK (("undone_at" IS NULL) = ("undone_by" IS NULL))
);
CREATE INDEX "fo_dup_merge_firm_id_survivor_id_idx" ON "fo_dup_merge"("firm_id", "survivor_id");
CREATE INDEX "fo_dup_merge_firm_id_loser_id_idx" ON "fo_dup_merge"("firm_id", "loser_id");
-- One standing merge per loser (break m4): a record is merged away once until that merge is undone, so a crafted second
-- record for a standing pair cannot be written (in the migration only: Prisma cannot write a partial unique index).
CREATE UNIQUE INDEX "fo_dup_merge_one_standing" ON "fo_dup_merge"("firm_id", "loser_id") WHERE "undone_at" IS NULL;

-- (2) FO-1a's insert-only rule with the merge's one exception. CREATE OR REPLACE resets SECURITY DEFINER and search_path,
-- so both are set again and the wall reader owns it (as 20261121110000_fo3a1e_firm_timings does).
CREATE OR REPLACE FUNCTION fo_sales_insert_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'fo_note' AND TG_OP = 'UPDATE' THEN   -- nested: only fo_note's row has these fields
    IF current_setting('fo_dup.merging', true) = 'on' AND NEW."person_id" IS DISTINCT FROM OLD."person_id"
       AND (NEW."id", NEW."firm_id", NEW."lead_id", NEW."prospect_id", NEW."visibility", NEW."text", NEW."by_actor", NEW."created_at")
           IS NOT DISTINCT FROM (OLD."id", OLD."firm_id", OLD."lead_id", OLD."prospect_id", OLD."visibility", OLD."text", OLD."by_actor", OLD."created_at") THEN
      RETURN NEW;   -- FO-9b: a merge (or its Undo) moves a note to the other person record, nothing else
    END IF;
  END IF;
  RAISE EXCEPTION '%: rows are written once, never changed or removed (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

-- the merge record: written once, the Undo stamp once, never deleted
CREATE FUNCTION fo_dup_merge_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."id", NEW."firm_id", NEW."kind", NEW."survivor_id", NEW."loser_id", NEW."loser_snapshot", NEW."survivor_before", NEW."choices", NEW."automatic", NEW."reason", NEW."by", NEW."at")
     IS DISTINCT FROM (OLD."id", OLD."firm_id", OLD."kind", OLD."survivor_id", OLD."loser_id", OLD."loser_snapshot", OLD."survivor_before", OLD."choices", OLD."automatic", OLD."reason", OLD."by", OLD."at")
     OR OLD."undone_at" IS NOT NULL OR NEW."undone_at" IS NULL THEN
    RAISE EXCEPTION 'fo_dup_merge: a merge record is written once; only its Undo stamp is added, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The stamp only after the tombstone has ended (break m4: no Undo stamp on a merge that still stands).
  IF EXISTS (SELECT 1 FROM "fo_person" WHERE "firm_id" = OLD."firm_id" AND "id" = OLD."loser_id" AND "merged_into_id" = OLD."survivor_id")
     OR EXISTS (SELECT 1 FROM "fo_company" WHERE "firm_id" = OLD."firm_id" AND "id" = OLD."loser_id" AND "merged_into_id" = OLD."survivor_id") THEN
    RAISE EXCEPTION 'fo_dup_merge: the Undo stamp is written only once the merge is undone (the record is still merged)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION fo_dup_merge_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fo_dup_merge: merge records are never removed (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER "fo_dup_merge_write" BEFORE UPDATE ON "fo_dup_merge" FOR EACH ROW EXECUTE FUNCTION fo_dup_merge_write();
CREATE TRIGGER "fo_dup_merge_no_delete" BEFORE DELETE ON "fo_dup_merge" FOR EACH ROW EXECUTE FUNCTION fo_dup_merge_no_delete();
CREATE TRIGGER "fo_dup_merge_no_truncate" BEFORE TRUNCATE ON "fo_dup_merge" FOR EACH STATEMENT EXECUTE FUNCTION fo_dup_merge_no_delete();

-- AG-2-16 rule 5 "No row ever points to a tombstone", held by the database (review and break M1): checked at commit
-- (a deferred constraint trigger), on the row as it stands then (a row written and moved again in one transaction is
-- judged where it ends), by a locking read of the record it names (FOR KEY SHARE): a merge in flight (which holds the
-- record FOR UPDATE) is waited for and its tombstone then refused; a writer that commits first is seen and moved by the
-- merge. Columns with a foreign key already lock the record at the statement; fo_booking.person_id has none. The guarded
-- columns are columns.ts's MOVE list (arguments: the table's person columns, then '|', then its company columns;
-- tests/check_fo9b_merge.ts ties the two).
CREATE FUNCTION fo_dup_live_party() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i int; col text; v uuid; m uuid; company boolean := false; cur jsonb;
BEGIN
  EXECUTE format('SELECT to_jsonb(x) FROM %I x WHERE x."id" = $1', TG_TABLE_NAME) INTO cur USING NEW."id";
  IF cur IS NULL THEN RETURN NULL; END IF;
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    col := TG_ARGV[i];
    IF col = '|' THEN company := true; CONTINUE; END IF;
    v := (cur ->> col)::uuid;
    CONTINUE WHEN v IS NULL;
    IF company THEN
      SELECT c."merged_into_id" INTO m FROM "fo_company" c WHERE c."firm_id" = (cur ->> 'firm_id')::uuid AND c."id" = v FOR KEY SHARE;
    ELSE
      SELECT p."merged_into_id" INTO m FROM "fo_person" p WHERE p."firm_id" = (cur ->> 'firm_id')::uuid AND p."id" = v FOR KEY SHARE;
    END IF;
    IF m IS NOT NULL THEN
      RAISE EXCEPTION '%: % names a merged-away record (merged into %): use that record', TG_TABLE_NAME, col, m USING ERRCODE = 'foreign_key_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "fo_dup_live_party" AFTER INSERT OR UPDATE OF "person_id", "possible_match_person_id" ON "fo_lead" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fo_dup_live_party('person_id', 'possible_match_person_id');
CREATE CONSTRAINT TRIGGER "fo_dup_live_party" AFTER INSERT OR UPDATE OF "person_id" ON "fo_note" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fo_dup_live_party('person_id');
CREATE CONSTRAINT TRIGGER "fo_dup_live_party" AFTER INSERT OR UPDATE OF "person_id" ON "fo_call" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fo_dup_live_party('person_id');
CREATE CONSTRAINT TRIGGER "fo_dup_live_party" AFTER INSERT OR UPDATE OF "person_id" ON "fo_arrival_receipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fo_dup_live_party('person_id');
CREATE CONSTRAINT TRIGGER "fo_dup_live_party" AFTER INSERT OR UPDATE OF "person_id" ON "fo_booking" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fo_dup_live_party('person_id');
CREATE CONSTRAINT TRIGGER "fo_dup_live_party" AFTER INSERT OR UPDATE OF "person_id", "company_id" ON "fo_company_contact" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fo_dup_live_party('person_id', '|', 'company_id');
CREATE CONSTRAINT TRIGGER "fo_dup_live_party" AFTER INSERT OR UPDATE OF "subject_person_id", "primary_contact_person_id", "subject_company_id" ON "fo_prospect" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fo_dup_live_party('subject_person_id', 'primary_contact_person_id', '|', 'subject_company_id');

-- PF-12's wall (forced policy naming the session's firm; the firm-first gate before the area's own triggers); the trigger
-- functions run as xr_wall_reader (tests/check_pf12_walls.ts).
ALTER TABLE "fo_dup_merge" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_dup_merge" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_dup_merge" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
-- PF-8b F4 (RDS): a non-superuser may hand a function to xr_wall_reader only while it holds CREATE on public; grant it
-- for the hand-over and take it back after (a no-op pair on a superuser cluster; tests/check_pf8b_f4_migrations.ts).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fo_sales_insert_only()', 'fo_dup_merge_write()', 'fo_dup_merge_no_delete()', 'fo_dup_live_party()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
