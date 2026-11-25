-- Rollback of 20261124190000_pf21d_cancel_while_off (PF-21d part 2a), by hand, in this order: the cancel and claim
-- definers as 20261124140000_pf21d_erasure left them, the two mark definers and their table, the flag, and the check
-- with its old brackets. Ownership and grants of the two replaced definers are kept by CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION plat_data_request_erasure_cancel(p_id uuid, p_note text, p_by text, p_today date) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE r plat_data_request%ROWTYPE;
BEGIN
  PERFORM plat_data_request_system_only();
  SELECT * INTO r FROM plat_data_request x WHERE x.id = p_id FOR UPDATE;
  IF r.id IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF r.erase_on IS NULL OR r.status = 'COMPLETED' THEN RETURN 'NOT_SCHEDULED'; END IF;
  IF r.erasing_since IS NOT NULL THEN RETURN 'RUNNING'; END IF;   -- Lead 26: any claim, however old: its erasers may have committed
  IF p_today >= r.erase_on AND r.status <> 'HELD' THEN RETURN 'WINDOW_ENDED'; END IF;
  UPDATE plat_data_request x SET erase_on = NULL, erasing_since = NULL WHERE x.id = p_id;
  INSERT INTO plat_data_request_event (id, request_id, kind, note, actor) VALUES (gen_random_uuid(), p_id, 'ERASURE_CANCELLED', p_note, p_by);
  RETURN 'CANCELLED';
END $fn$;
CREATE OR REPLACE FUNCTION plat_data_request_erasure_claim(p_id uuid, p_today date) RETURNS TABLE (claim timestamptz, retaken boolean)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE r plat_data_request%ROWTYPE; c timestamptz := date_trunc('milliseconds', clock_timestamp());   -- the app's Date carries milliseconds
BEGIN
  PERFORM plat_data_request_system_only();
  SELECT * INTO r FROM plat_data_request x WHERE x.id = p_id FOR UPDATE;
  IF r.id IS NULL OR r.erase_on IS NULL OR r.erase_on > p_today OR r.status = 'COMPLETED'
     OR (r.erasing_since IS NOT NULL AND r.erasing_since > c - interval '30 minutes') THEN RETURN; END IF;
  UPDATE plat_data_request x SET erasing_since = c WHERE x.id = p_id;
  -- retaken (review r6 M2): an earlier run's claim was still here, so its erasers may have committed unrecorded.
  RETURN QUERY SELECT c, r.erasing_since IS NOT NULL;
END $fn$;
DROP FUNCTION plat_data_request_erasure_marks(uuid, timestamptz);
DROP FUNCTION plat_data_request_erasure_mark_add(uuid, timestamptz, text, text, text);
DROP TABLE "plat_data_request_erasure_mark";
ALTER TABLE "plat_data_request" DROP COLUMN "may_have_erased";
ALTER TABLE "plat_data_request" DROP CONSTRAINT "plat_data_request_erase_on_set";
ALTER TABLE "plat_data_request" ADD CONSTRAINT "plat_data_request_erase_on_set" CHECK ("erase_on" IS NULL OR ("type" = 'DELETION' AND "person_id" IS NOT NULL AND "erase_on" > "received_on")
  AND ("erasing_since" IS NULL OR "erase_on" IS NOT NULL) AND ("status" <> 'COMPLETED' OR "erase_on" IS NULL));
