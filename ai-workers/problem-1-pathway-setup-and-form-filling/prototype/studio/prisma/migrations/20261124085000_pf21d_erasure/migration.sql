-- PF-21d part 1b (map row 85; SA-11-16, SA-11-18, SA-11-28, SA-11-40; brief product/screens/PF-21d/brief.md, accepted by
-- the tech lead on #3189, 23 Nov): an approved deletion request on the register (PF-21b part 3) carried out 7 days after
-- approval, behind part 1a's "Data erasure" switch.
-- Additive: five values on PlatDataRequestEventKind, two columns, one check and one guard trigger on plat_data_request,
-- and seven definers. No existing row or function changes. erase_on is set by approval (approval day + 7, the code's
-- constant) on a DELETION naming a firm's person, cleared by cancel or by the job's finish. erasing_since is the job's
-- claim while it erases (break B1, B2): the erasure and its record are two transactions (the erasers run in the firm's
-- scope, the register refuses a firm's session), so the claim ties them. While a request is claimed nothing but the
-- daily check's OVERDUE mark and the job's own finish changes it; while it is scheduled a hand move is refused (break M3:
-- cancel first). A claim older than 30 minutes (a job that died) may be taken again: erasers are idempotent (port rule 4). Each definer is refused in a firm's session (the
-- register's plat_data_request_system_only). Legal reading Unconfirmed: no counsel.
-- Rollback (by hand): DROP the guard trigger, the eight definers and both columns (the enum values stay, unused).
ALTER TYPE "PlatDataRequestEventKind" ADD VALUE IF NOT EXISTS 'ERASURE_APPROVED';
ALTER TYPE "PlatDataRequestEventKind" ADD VALUE IF NOT EXISTS 'ERASURE_CANCELLED';
ALTER TYPE "PlatDataRequestEventKind" ADD VALUE IF NOT EXISTS 'ERASURE_HELD';
ALTER TYPE "PlatDataRequestEventKind" ADD VALUE IF NOT EXISTS 'ERASURE_RESULT';
ALTER TYPE "PlatDataRequestEventKind" ADD VALUE IF NOT EXISTS 'ERASURE_SKIPPED';
ALTER TABLE "plat_data_request" ADD COLUMN "erase_on" DATE;
ALTER TABLE "plat_data_request" ADD COLUMN "erasing_since" TIMESTAMPTZ;
ALTER TABLE "plat_data_request" ADD CONSTRAINT "plat_data_request_erase_on_set" CHECK ("erase_on" IS NULL OR ("type" = 'DELETION' AND "person_id" IS NOT NULL AND "erase_on" > "received_on")
  AND ("erasing_since" IS NULL OR "erase_on" IS NOT NULL) AND ("status" <> 'COMPLETED' OR "erase_on" IS NULL));   -- review M3
-- The guard (break B1, B2, M3, m4). Claimed and still claimed (same claim): only the daily check's OVERDUE mark. Scheduled
-- and not claimed: the status moves only to OVERDUE (the daily check); the job's finish runs under its claim, approve sets
-- the status before the day, cancel clears the day.
CREATE FUNCTION plat_data_request_erasure_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF OLD.erasing_since IS NOT NULL AND NEW.erasing_since IS NOT DISTINCT FROM OLD.erasing_since
     AND ((NEW.status <> OLD.status AND NEW.status <> 'OVERDUE') OR NEW.erase_on IS DISTINCT FROM OLD.erase_on OR NEW.actions_taken IS DISTINCT FROM OLD.actions_taken) THEN
    RAISE EXCEPTION 'plat_data_request_erasure_guard: the erasure is running; nothing else changes this request until it ends' USING ERRCODE = 'object_in_use';
  END IF;
  IF OLD.erasing_since IS NULL AND NEW.erasing_since IS NULL AND OLD.erase_on IS NOT NULL AND NEW.erase_on IS NOT NULL
     AND NEW.status <> OLD.status AND NEW.status <> 'OVERDUE' THEN
    RAISE EXCEPTION 'plat_data_request_erasure_guard: an erasure is scheduled; cancel it before moving the request by hand' USING ERRCODE = 'object_in_use';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_data_request_erasure_guard" BEFORE UPDATE ON "plat_data_request" FOR EACH ROW EXECUTE FUNCTION plat_data_request_erasure_guard();

-- Approves a DELETION request naming a firm's person: 'NOT_FOUND', 'NOT_DELETION', 'NO_PERSON', 'ALREADY' (scheduled),
-- 'REFUSED' (completed) or 'APPROVED'. A PENDING or HELD request moves to IN_PROGRESS (a STATUS_CHANGED step).
CREATE FUNCTION plat_data_request_erasure_approve(p_id uuid, p_erase_on date, p_by text) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE r plat_data_request%ROWTYPE;
BEGIN
  PERFORM plat_data_request_system_only();
  SELECT * INTO r FROM plat_data_request x WHERE x.id = p_id FOR UPDATE;
  IF r.id IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF r.type <> 'DELETION' THEN RETURN 'NOT_DELETION'; END IF;
  IF r.person_id IS NULL THEN RETURN 'NO_PERSON'; END IF;
  IF r.status = 'COMPLETED' THEN RETURN 'REFUSED'; END IF;
  IF r.erase_on IS NOT NULL THEN RETURN 'ALREADY'; END IF;
  IF r.status IN ('PENDING', 'HELD') THEN
    UPDATE plat_data_request x SET status = 'IN_PROGRESS' WHERE x.id = p_id;
    INSERT INTO plat_data_request_event (id, request_id, kind, from_status, to_status, actor) VALUES (gen_random_uuid(), p_id, 'STATUS_CHANGED', r.status, 'IN_PROGRESS', p_by);
  END IF;
  UPDATE plat_data_request x SET erase_on = p_erase_on WHERE x.id = p_id;
  INSERT INTO plat_data_request_event (id, request_id, kind, note, actor) VALUES (gen_random_uuid(), p_id, 'ERASURE_APPROVED', 'Erasing on ' || p_erase_on::text, p_by);
  RETURN 'APPROVED';
END $fn$;
-- Cancels a scheduled erasure inside its window (before its day; SA-11-16 (a)), or one a legal hold keeps HELD:
-- 'NOT_FOUND', 'NOT_SCHEDULED', 'RUNNING' (claimed by the job), 'WINDOW_ENDED' or 'CANCELLED'.
CREATE FUNCTION plat_data_request_erasure_cancel(p_id uuid, p_note text, p_by text, p_today date) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE r plat_data_request%ROWTYPE;
BEGIN
  PERFORM plat_data_request_system_only();
  SELECT * INTO r FROM plat_data_request x WHERE x.id = p_id FOR UPDATE;
  IF r.id IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF r.erase_on IS NULL OR r.status = 'COMPLETED' THEN RETURN 'NOT_SCHEDULED'; END IF;
  IF r.erasing_since IS NOT NULL AND r.erasing_since > clock_timestamp() - interval '30 minutes' THEN RETURN 'RUNNING'; END IF;
  IF p_today >= r.erase_on AND r.status <> 'HELD' THEN RETURN 'WINDOW_ENDED'; END IF;
  UPDATE plat_data_request x SET erase_on = NULL, erasing_since = NULL WHERE x.id = p_id;
  INSERT INTO plat_data_request_event (id, request_id, kind, note, actor) VALUES (gen_random_uuid(), p_id, 'ERASURE_CANCELLED', p_note, p_by);
  RETURN 'CANCELLED';
END $fn$;
-- The orders due on a day (erase_on on or before it, not completed), oldest first, at most p_limit (1 to 501).
CREATE FUNCTION plat_data_request_erasure_due(p_today date, p_limit int)
  RETURNS TABLE (id uuid, firm_id uuid, person_id uuid, status text, erase_on date)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_data_request_system_only();
  RETURN QUERY SELECT r.id, r.firm_id, r.person_id, r.status::text, r.erase_on FROM plat_data_request r
   WHERE r.erase_on IS NOT NULL AND r.erase_on <= p_today AND r.status <> 'COMPLETED'
   ORDER BY (r.status = 'HELD'), r.erase_on, r.id LIMIT least(greatest(coalesce(p_limit, 501), 1), 501);
END $fn$;
-- One request's erasure state (the console's "Erasing on <date>").
CREATE FUNCTION plat_data_request_erasure_of(p_id uuid) RETURNS TABLE (status text, erase_on date)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_data_request_system_only();
  RETURN QUERY SELECT r.status::text, r.erase_on FROM plat_data_request r WHERE r.id = p_id;
END $fn$;
-- The job's claim (break B1, B2): a scheduled, due request not claimed (or claimed over 30 minutes ago, a job that died)
-- is claimed now; returns the claim, or null when it cannot be claimed (cancelled, completed, not due, running).
CREATE FUNCTION plat_data_request_erasure_claim(p_id uuid, p_today date) RETURNS timestamptz
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE r plat_data_request%ROWTYPE; c timestamptz := date_trunc('milliseconds', clock_timestamp());   -- the app's Date carries milliseconds
BEGIN
  PERFORM plat_data_request_system_only();
  SELECT * INTO r FROM plat_data_request x WHERE x.id = p_id FOR UPDATE;
  IF r.id IS NULL OR r.erase_on IS NULL OR r.erase_on > p_today OR r.status = 'COMPLETED'
     OR (r.erasing_since IS NOT NULL AND r.erasing_since > c - interval '30 minutes') THEN RETURN NULL; END IF;
  UPDATE plat_data_request x SET erasing_since = c WHERE x.id = p_id;
  RETURN c;
END $fn$;
-- Gives a claim back with nothing changed (an eraser failed: the order stays scheduled for the next run).
CREATE FUNCTION plat_data_request_erasure_release(p_id uuid, p_claim timestamptz) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_data_request_system_only();
  UPDATE plat_data_request x SET erasing_since = NULL WHERE x.id = p_id AND x.erasing_since = p_claim;
  RETURN FOUND;
END $fn$;
-- The job's steps: p_kind one of the erasure kinds only (never a mark or a move). With p_once, nothing is written when the
-- request's latest erasure step (status moves aside) is the same step (kind and note): a switch left off writes one
-- SKIPPED, a hold left on one HELD, not one a day; a new reason is a new step. True when written.
CREATE FUNCTION plat_data_request_erasure_step(p_id uuid, p_kind text, p_note text, p_by text, p_once boolean, p_claim timestamptz) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE last text; last_note text;
BEGIN
  PERFORM plat_data_request_system_only();
  IF p_kind NOT IN ('ERASURE_HELD', 'ERASURE_RESULT', 'ERASURE_SKIPPED') THEN
    RAISE EXCEPTION 'plat_data_request_erasure_step: % is not an erasure step', p_kind USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM 1 FROM plat_data_request x WHERE x.id = p_id AND x.erase_on IS NOT NULL AND x.status <> 'COMPLETED'
    AND (p_kind = 'ERASURE_SKIPPED' OR x.erasing_since = p_claim) FOR UPDATE;   -- a result or a hold only under the job's own claim
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT e.kind::text, e.note INTO last, last_note FROM plat_data_request_event e WHERE e.request_id = p_id AND e.kind::text LIKE 'ERASURE\_%' ORDER BY e.seq DESC LIMIT 1;
  IF p_once AND last = p_kind AND last_note IS NOT DISTINCT FROM p_note THEN RETURN false; END IF;   -- review r4 m1: a new reason is a new step
  INSERT INTO plat_data_request_event (id, request_id, kind, note, actor) VALUES (gen_random_uuid(), p_id, p_kind::"PlatDataRequestEventKind", p_note, p_by);
  RETURN true;
END $fn$;
-- The job's outcome. 'BLOCKED' (a legal hold): the request reads HELD and stays scheduled, so the run after the hold's
-- release erases. 'COMPLETED' or 'PARTIAL' (HELD: something kept, SA-11-28): the erasure is done, erase_on cleared, the
-- actions taken written; the claim ends. Returns 'NOT_CLAIMED' (not under this claim) or 'DONE'.
CREATE FUNCTION plat_data_request_erasure_finish(p_id uuid, p_outcome text, p_actions text, p_today date, p_by text, p_claim timestamptz) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE r plat_data_request%ROWTYPE; t "PlatDataRequestStatus";
BEGIN
  PERFORM plat_data_request_system_only();
  SELECT * INTO r FROM plat_data_request x WHERE x.id = p_id FOR UPDATE;
  IF r.id IS NULL OR r.erase_on IS NULL OR r.status = 'COMPLETED' OR r.erasing_since IS DISTINCT FROM p_claim THEN RETURN 'NOT_CLAIMED'; END IF;
  t := CASE p_outcome WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'PARTIAL' THEN 'HELD' WHEN 'BLOCKED' THEN 'HELD' END;
  IF t IS NULL THEN RAISE EXCEPTION 'plat_data_request_erasure_finish: unknown outcome %', p_outcome USING ERRCODE = 'invalid_parameter_value'; END IF;
  UPDATE plat_data_request x SET status = t, erasing_since = NULL,
    erase_on = CASE WHEN p_outcome = 'BLOCKED' THEN x.erase_on END,
    actions_taken = CASE WHEN p_outcome = 'BLOCKED' THEN x.actions_taken ELSE p_actions END,
    completed_on = CASE WHEN t = 'COMPLETED' THEN p_today END WHERE x.id = p_id;
  IF t <> r.status THEN
    INSERT INTO plat_data_request_event (id, request_id, kind, from_status, to_status, actor) VALUES (gen_random_uuid(), p_id, 'STATUS_CHANGED', r.status, t, p_by);
  END IF;
  RETURN 'DONE';
END $fn$;
-- PF-8b F4 (RDS): CREATE on public for xr_wall_reader only for the hand-over (as 20261123200000_pf21b_data_requests).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $own$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['plat_data_request_erasure_approve(uuid, date, text)', 'plat_data_request_erasure_cancel(uuid, text, text, date)',
                           'plat_data_request_erasure_claim(uuid, date)', 'plat_data_request_erasure_release(uuid, timestamptz)',
                           'plat_data_request_erasure_due(date, integer)', 'plat_data_request_erasure_of(uuid)',
                           'plat_data_request_erasure_step(uuid, text, text, text, boolean, timestamptz)',
                           'plat_data_request_erasure_finish(uuid, text, text, date, text, timestamptz)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO xr_data', f);
  END LOOP;
END
$own$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
