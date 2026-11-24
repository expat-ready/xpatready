-- PF-21d part 2a, item 1 (Lead 4, #3235 comment 7095583893; SA-11-16 (a), (d)): while the "Data erasure" switch is off (the
-- emergency stop), an approved erasure past its day can still be withdrawn: erasure cannot be undone. With the switch on, the
-- 7-day window has ended as before. A claim still refuses (RUNNING: its erasers may have committed). Only this body changes.
CREATE OR REPLACE FUNCTION plat_data_request_erasure_cancel(p_id uuid, p_note text, p_by text, p_today date) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE r plat_data_request%ROWTYPE; switch_on boolean;
BEGIN
  PERFORM plat_data_request_system_only();
  SELECT * INTO r FROM plat_data_request x WHERE x.id = p_id FOR UPDATE;
  IF r.id IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF r.erase_on IS NULL OR r.status = 'COMPLETED' THEN RETURN 'NOT_SCHEDULED'; END IF;
  IF r.erasing_since IS NOT NULL THEN RETURN 'RUNNING'; END IF;   -- Lead 26: any claim, however old: its erasers may have committed
  -- An unknown switch reads as on (the stricter answer: the window has ended), never as a silent off.
  SELECT coalesce((SELECT s.is_on FROM plat_switch_list() s WHERE s.key = 'platform.data-erasure'), true) INTO switch_on;
  IF p_today >= r.erase_on AND r.status <> 'HELD' AND switch_on THEN RETURN 'WINDOW_ENDED'; END IF;
  UPDATE plat_data_request x SET erase_on = NULL, erasing_since = NULL WHERE x.id = p_id;
  INSERT INTO plat_data_request_event (id, request_id, kind, note, actor) VALUES (gen_random_uuid(), p_id, 'ERASURE_CANCELLED', p_note, p_by);
  RETURN 'CANCELLED';
END $fn$;
-- PF-8b F4 (RDS): as 20261124140000_pf21d_erasure, CREATE on public for the hand-over to xr_wall_reader, taken back after.
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION plat_data_request_erasure_cancel(uuid, text, text, date) OWNER TO xr_wall_reader;
REVOKE ALL ON FUNCTION plat_data_request_erasure_cancel(uuid, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plat_data_request_erasure_cancel(uuid, text, text, date) TO xr_data;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
