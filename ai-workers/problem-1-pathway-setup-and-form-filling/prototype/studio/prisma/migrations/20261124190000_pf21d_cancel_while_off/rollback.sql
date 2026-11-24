-- Rollback of 20261124190000_pf21d_cancel_while_off: the cancel definer as 20261124140000_pf21d_erasure left it
-- (on or after the day, WINDOW_ENDED whatever the switch says). Ownership and grants are kept by CREATE OR REPLACE.
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
