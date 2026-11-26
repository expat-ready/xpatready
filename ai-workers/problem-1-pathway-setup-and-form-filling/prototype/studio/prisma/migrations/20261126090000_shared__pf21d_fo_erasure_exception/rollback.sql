-- Rollback of 20261126090000_shared__pf21d_fo_erasure_exception: the three trigger functions as they were before it (word
-- for word, from pg_get_functiondef on a database migrated up to the migration before), and the definer dropped.
-- Roll back this PR's app code with it (review m5): without the exception the eraser's INSERT_ONLY_SQL is refused inside a
-- claimed erasure, so the job fails and retries (nothing erased, never a false COMPLETED) until the code goes too.
CREATE OR REPLACE FUNCTION public.fo_sales_insert_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'fo_note' AND TG_OP = 'UPDATE' THEN   -- nested: only fo_note's row has these fields
    IF current_setting('fo_dup.merging', true) = 'on' AND NEW."person_id" IS DISTINCT FROM OLD."person_id"
       AND (NEW."id", NEW."firm_id", NEW."lead_id", NEW."prospect_id", NEW."visibility", NEW."text", NEW."by_actor", NEW."created_at")
           IS NOT DISTINCT FROM (OLD."id", OLD."firm_id", OLD."lead_id", OLD."prospect_id", OLD."visibility", OLD."text", OLD."by_actor", OLD."created_at") THEN
      RETURN NEW;   -- FO-9b: a merge (or its Undo) moves a note to the other person record, nothing else
    END IF;
  END IF;
  RAISE EXCEPTION '%: rows are written once, never changed or removed (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $function$

;
CREATE OR REPLACE FUNCTION public.fo_dup_merge_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
END $function$

;
CREATE OR REPLACE FUNCTION public.msg_write_once()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION '% is write-once: % refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END $function$

;
DROP FUNCTION fo_erasure_names(uuid, uuid);
