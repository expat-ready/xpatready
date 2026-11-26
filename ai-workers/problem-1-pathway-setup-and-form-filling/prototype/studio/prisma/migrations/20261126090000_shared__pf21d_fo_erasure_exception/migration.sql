-- PF-21d part 2b-2 (R1.85; brief product/screens/PF-21d-2/brief.md "Part 2b", Lead 3's Q1 on #3583; SA-11-16, SA-11-40):
-- the narrow exception that lets the front office's eraser clear a person's words from four insert-only rows, and nothing
-- else, only while that person's erasure is really running.
--   * The erasure job (api/src/platform/erasure/service.ts) sets two transaction-local settings inside the erasers' firm
--     transaction: pf21d.erasing (the request id) and pf21d.claim (its claim time).
--   * fo_erasure_names(firm, person) is true only when those settings name a request claimed at exactly that time, of
--     the session's own firm (platform_session_firm()), about this person or a record merged into them (followed in a
--     chain). A firm's session can read neither the request id nor its claim time, so it cannot forge the pair; and the
--     pair only ever opens rows of the person already being erased.
--   * Each trigger lets an UPDATE through only then, and only when every other column is unchanged and the named columns
--     become their erased value: fo_note.text 'Erased.'; fo_lead_attribution's click_id, landing_page, referrer_url,
--     platform_lead_id and utm_* null; fo_dup_merge's loser_snapshot and survivor_before '{"erased": true}' (its Undo
--     then refuses); msg_event.detail null. Deletes and truncates stay refused. The merge's own fo_dup.merging exception
--     is kept as it was.
-- PF-12: a trigger function on a firm table runs as xr_wall_reader (CREATE OR REPLACE resets SECURITY DEFINER and
-- search_path, so both are set again). Rollback: rollback.sql in this folder.
CREATE FUNCTION fo_erasure_names(p_firm uuid, p_person uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE req uuid; at timestamptz; who uuid;
BEGIN
  BEGIN
    req := nullif(current_setting('pf21d.erasing', true), '')::uuid;
    at := nullif(current_setting('pf21d.claim', true), '')::timestamptz;
  EXCEPTION WHEN others THEN RETURN false;   -- a setting that is not a request id or a time opens nothing
  END;
  IF req IS NULL OR at IS NULL OR p_firm IS NULL OR p_person IS NULL OR p_firm IS DISTINCT FROM platform_session_firm() THEN RETURN false; END IF;
  -- Break m3: never while a merge runs in this transaction (a merge could first move another person's row onto this one).
  IF current_setting('fo_dup.merging', true) = 'on' THEN RETURN false; END IF;
  SELECT x.person_id INTO who FROM plat_data_request x WHERE x.id = req AND x.erasing_since = at AND x.firm_id = p_firm AND x.type = 'DELETION';
  IF who IS NULL THEN RETURN false; END IF;
  RETURN p_person = who OR EXISTS (
    WITH RECURSIVE gone AS (SELECT id FROM fo_person WHERE firm_id = p_firm AND merged_into_id = who
                            UNION SELECT p.id FROM fo_person p JOIN gone g ON p.merged_into_id = g.id WHERE p.firm_id = p_firm)
    SELECT 1 FROM gone WHERE id = p_person);
END $fn$;

CREATE OR REPLACE FUNCTION fo_sales_insert_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'fo_note' AND TG_OP = 'UPDATE' THEN   -- nested: only fo_note's row has these fields
    IF current_setting('fo_dup.merging', true) = 'on' AND NEW."person_id" IS DISTINCT FROM OLD."person_id"
       AND (NEW."id", NEW."firm_id", NEW."lead_id", NEW."prospect_id", NEW."visibility", NEW."text", NEW."by_actor", NEW."created_at")
           IS NOT DISTINCT FROM (OLD."id", OLD."firm_id", OLD."lead_id", OLD."prospect_id", OLD."visibility", OLD."text", OLD."by_actor", OLD."created_at") THEN
      RETURN NEW;   -- FO-9b: a merge (or its Undo) moves a note to the other person record, nothing else
    END IF;
    IF NEW."text" = 'Erased.' AND fo_erasure_names(OLD."firm_id", OLD."person_id")
       AND (NEW."id", NEW."firm_id", NEW."person_id", NEW."lead_id", NEW."prospect_id", NEW."visibility", NEW."by_actor", NEW."created_at")
           IS NOT DISTINCT FROM (OLD."id", OLD."firm_id", OLD."person_id", OLD."lead_id", OLD."prospect_id", OLD."visibility", OLD."by_actor", OLD."created_at") THEN
      RETURN NEW;   -- PF-21d 2b-2: the person's erasure clears the note's words, nothing else
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'fo_lead_attribution' AND TG_OP = 'UPDATE' THEN
    IF num_nonnulls(NEW."click_id", NEW."landing_page", NEW."referrer_url", NEW."platform_lead_id", NEW."utm_source", NEW."utm_medium", NEW."utm_campaign", NEW."utm_term", NEW."utm_content") = 0
       AND fo_erasure_names(OLD."firm_id", (SELECT l."person_id" FROM "fo_lead" l WHERE l."firm_id" = OLD."firm_id" AND l."id" = OLD."lead_id"))
       AND (NEW."firm_id", NEW."lead_id", NEW."click_id_kind", NEW."created_at", NEW."campaign_id", NEW."platform", NEW."platform_form_id", NEW."platform_page_id", NEW."ad_id", NEW."ad_set_id")
           IS NOT DISTINCT FROM (OLD."firm_id", OLD."lead_id", OLD."click_id_kind", OLD."created_at", OLD."campaign_id", OLD."platform", OLD."platform_form_id", OLD."platform_page_id", OLD."ad_id", OLD."ad_set_id") THEN
      RETURN NEW;   -- PF-21d 2b-2: the person's erasure clears what identifies them on the lead's attribution
    END IF;
  END IF;
  RAISE EXCEPTION '%: rows are written once, never changed or removed (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $fn$;
ALTER FUNCTION fo_sales_insert_only() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION fo_dup_merge_write() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  -- PF-21d 2b-2: the erasure of a person the merge names blanks both snapshots, nothing else (its Undo then refuses).
  IF OLD."kind" = 'PERSON' AND NEW."loser_snapshot" = '{"erased": true}'::jsonb AND NEW."survivor_before" = '{"erased": true}'::jsonb
     AND (fo_erasure_names(OLD."firm_id", OLD."survivor_id") OR fo_erasure_names(OLD."firm_id", OLD."loser_id"))
     AND (NEW."id", NEW."firm_id", NEW."kind", NEW."survivor_id", NEW."loser_id", NEW."choices", NEW."automatic", NEW."reason", NEW."by", NEW."at", NEW."undone_at", NEW."undone_by")
         IS NOT DISTINCT FROM (OLD."id", OLD."firm_id", OLD."kind", OLD."survivor_id", OLD."loser_id", OLD."choices", OLD."automatic", OLD."reason", OLD."by", OLD."at", OLD."undone_at", OLD."undone_by") THEN
    RETURN NEW;
  END IF;
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
END $fn$;
ALTER FUNCTION fo_dup_merge_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION msg_write_once() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  -- PF-21d 2b-2: the erasure of the person a message was sent to clears its events' detail, nothing else.
  -- Nested (review M1): PL/pgSQL resolves NEW's fields for a whole expression, so only msg_event's branch may name detail;
  -- the other tables using this function keep their own refusal and error code.
  IF TG_TABLE_NAME = 'msg_event' AND TG_OP = 'UPDATE' THEN
    IF NEW."detail" IS NULL
       AND (NEW."id", NEW."firm_id", NEW."outbox_id", NEW."kind", NEW."created_at", NEW."occurred_at", NEW."provider_event_id")
           IS NOT DISTINCT FROM (OLD."id", OLD."firm_id", OLD."outbox_id", OLD."kind", OLD."created_at", OLD."occurred_at", OLD."provider_event_id")
       AND fo_erasure_names(OLD."firm_id", (SELECT o."subject_id" FROM "msg_outbox" o WHERE o."id" = OLD."outbox_id" AND o."firm_id" = OLD."firm_id" AND o."subject_kind" = 'FO_PERSON')) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% is write-once: % refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END $fn$;
ALTER FUNCTION msg_write_once() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- PF-8b F4 (RDS): CREATE on public for the hand-over to xr_wall_reader, taken back after (as 20261124190000).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $own$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fo_erasure_names(uuid, uuid)', 'fo_sales_insert_only()', 'fo_dup_merge_write()', 'msg_write_once()'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$own$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
REVOKE ALL ON FUNCTION fo_erasure_names(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fo_erasure_names(uuid, uuid) TO xr_wall_reader;
