-- PF-21b part 3 (map row 85; SA-11 §3.8, SA-11-18, SA-11-40, NFR5-14; brief design/lead-b-briefs/PF-21b.md "Part 2", split
-- by design/briefs/track-b/PF-21b-2.md; P-600, P-601 (1)): the register of privacy requests made to ExpatReady itself.
-- Additive: three enums, two tables, three indexes, rule triggers, six functions (five definers) and one data row in
-- PF-4s's permission catalogue. No existing table, function or row is changed.
-- Walls: both tables are our own register (PF-12's OWN list names plat_data_request): forced, no policy; xr_app reaches
-- them only through the plat_data_request_* definers (xr_wall_reader's, search_path pinned, EXECUTE for xr_data only),
-- each refused inside a firm's session. With no firm, the gate is the code's (PF-4s's guard and dsr-manage).
-- Rules: never deleted or truncated; facts fixed; status moves only along MOVES (COMPLETED final; OVERDUE only by the
-- daily check's mark); completed_on set exactly when COMPLETED; steps insert-only; one NEAR_DATE_ALERTED and one
-- OVERDUE_ALERTED mark per request (NFR5-14: raised once). The target (received + 30 days) is the code's constant, a
-- reminder never enforced (§3.8); the database checks only that it is after the day received.
-- Seed (P-601 (1), read by the Lead before the label): system/compliance:dsr-manage (SA-11 v2.16 line 778) for the
-- Platform Owner only: Sample, SA-07 Appendix A names no role for it. Legal reading Unconfirmed: no counsel.
-- Rollback (by hand): DELETE the permission row; DROP both tables (CASCADE), the functions and the three enums.
CREATE TYPE "PlatDataRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'DELETION');
CREATE TYPE "PlatDataRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'HELD');
CREATE TYPE "PlatDataRequestEventKind" AS ENUM ('RECEIVED', 'STATUS_CHANGED', 'NOTE', 'NEAR_DATE_ALERTED', 'OVERDUE_ALERTED');
CREATE TABLE "plat_data_request" (
    "id" UUID NOT NULL,
    "type" "PlatDataRequestType" NOT NULL,
    "requester_name" TEXT NOT NULL,
    "requester_email" TEXT NOT NULL,
    "received_on" DATE NOT NULL,
    "target_date" DATE NOT NULL,
    "status" "PlatDataRequestStatus" NOT NULL DEFAULT 'PENDING',
    "actions_taken" TEXT,
    "completed_on" DATE,
    "firm_id" UUID,
    "person_id" UUID,
    "recorded_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plat_data_request_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "plat_data_request_event" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "request_id" UUID NOT NULL,
    "kind" "PlatDataRequestEventKind" NOT NULL,
    "from_status" "PlatDataRequestStatus",
    "to_status" "PlatDataRequestStatus",
    "note" TEXT,
    "actor" TEXT NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plat_data_request_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "plat_data_request_status_target_date_idx" ON "plat_data_request"("status", "target_date");
CREATE UNIQUE INDEX "plat_data_request_event_request_id_seq_key" ON "plat_data_request_event"("request_id", "seq");
ALTER TABLE "plat_data_request_event" ADD CONSTRAINT "plat_data_request_event_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "plat_data_request"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Rules Prisma cannot say.
ALTER TABLE "plat_data_request" ADD CONSTRAINT "plat_data_request_facts_set" CHECK (
  btrim("requester_name") <> '' AND char_length("requester_name") <= 200
  AND "requester_email" ~ '^[^@\s]+@[^@\s]+$' AND char_length("requester_email") <= 320
  AND "target_date" > "received_on"
  AND ("firm_id" IS NULL) = ("person_id" IS NULL)
  AND ("actions_taken" IS NULL OR (btrim("actions_taken") <> '' AND char_length("actions_taken") <= 2000))
  AND ("completed_on" IS NOT NULL) = ("status" = 'COMPLETED')
  AND "recorded_by" ~ '^(staff|seed|system):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$');
ALTER TABLE "plat_data_request_event" ADD CONSTRAINT "plat_data_request_event_facts_set" CHECK (
  "actor" ~ '^(staff|seed|system):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
  AND ("note" IS NULL OR (btrim("note") <> '' AND char_length("note") <= 2000))
  AND (("kind" = 'STATUS_CHANGED') = ("from_status" IS NOT NULL)) AND (("kind" IN ('STATUS_CHANGED', 'RECEIVED')) = ("to_status" IS NOT NULL)));
-- The alert is raised once: one mark of each kind per request.
CREATE UNIQUE INDEX "plat_data_request_event_one_mark" ON "plat_data_request_event"("request_id", "kind") WHERE "kind" IN ('NEAR_DATE_ALERTED', 'OVERDUE_ALERTED');
-- At insert: a request starts PENDING with nothing done, at the database's time.
CREATE FUNCTION plat_data_request_logged() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.status <> 'PENDING' OR NEW.actions_taken IS NOT NULL OR NEW.completed_on IS NOT NULL THEN
    RAISE EXCEPTION 'plat_data_request_logged: a request is logged PENDING with nothing done yet' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_data_request_logged" BEFORE INSERT ON "plat_data_request" FOR EACH ROW EXECUTE FUNCTION plat_data_request_logged();
-- An update moves the status along MOVES (or records the actions taken on an open request) and changes no fact.
CREATE FUNCTION plat_data_request_moved() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.id <> OLD.id OR NEW.type <> OLD.type OR NEW.requester_name <> OLD.requester_name OR NEW.requester_email <> OLD.requester_email
     OR NEW.received_on <> OLD.received_on OR NEW.target_date <> OLD.target_date OR NEW.firm_id IS DISTINCT FROM OLD.firm_id
     OR NEW.person_id IS DISTINCT FROM OLD.person_id OR NEW.recorded_by <> OLD.recorded_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'plat_data_request_moved: a request''s facts never change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'plat_data_request_moved: a completed request never changes' USING ERRCODE = 'check_violation';
  END IF;
  -- MOVES: PENDING → IN_PROGRESS, COMPLETED, HELD, OVERDUE; IN_PROGRESS → COMPLETED, HELD, OVERDUE; OVERDUE → COMPLETED,
  -- HELD; HELD → IN_PROGRESS, COMPLETED. (An overdue request stays Overdue until it is completed or held.)
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'PENDING' AND NEW.status IN ('IN_PROGRESS', 'COMPLETED', 'HELD', 'OVERDUE'))
    OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('COMPLETED', 'HELD', 'OVERDUE'))
    OR (OLD.status = 'OVERDUE' AND NEW.status IN ('COMPLETED', 'HELD'))
    OR (OLD.status = 'HELD' AND NEW.status IN ('IN_PROGRESS', 'COMPLETED'))) THEN
    RAISE EXCEPTION 'plat_data_request_moved: % cannot move to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_data_request_moved" BEFORE UPDATE ON "plat_data_request" FOR EACH ROW EXECUTE FUNCTION plat_data_request_moved();
-- Never deleted, never truncated; an event is never changed either (insert-only).
CREATE FUNCTION plat_data_request_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION 'plat_data_request_kept: the register keeps every request and every step (% on % refused)', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "plat_data_request_kept" BEFORE DELETE ON "plat_data_request" FOR EACH ROW EXECUTE FUNCTION plat_data_request_kept();
CREATE TRIGGER "plat_data_request_no_truncate" BEFORE TRUNCATE ON "plat_data_request" FOR EACH STATEMENT EXECUTE FUNCTION plat_data_request_kept();
CREATE TRIGGER "plat_data_request_event_kept" BEFORE UPDATE OR DELETE ON "plat_data_request_event" FOR EACH ROW EXECUTE FUNCTION plat_data_request_kept();
CREATE TRIGGER "plat_data_request_event_no_truncate" BEFORE TRUNCATE ON "plat_data_request_event" FOR EACH STATEMENT EXECUTE FUNCTION plat_data_request_kept();
REVOKE ALL ON "plat_data_request", "plat_data_request_event" FROM xr_data;   -- break m1: not even the bypass role; the definers are the way in
-- Our own register: forced, no policy (PF-12's OWN list); its events the same.
ALTER TABLE "plat_data_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_data_request" FORCE ROW LEVEL SECURITY;
ALTER TABLE "plat_data_request_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_data_request_event" FORCE ROW LEVEL SECURITY;
-- Seed (P-601 (1)): system/compliance:dsr-manage for the Platform Owner only (Sample). The seed runs in its own DO
-- statement in PF-8b F7's shape (as 20261122180000_pf21b_legal_holds): a runner that is neither superuser nor BYPASSRLS
-- lifts FORCE on the walled catalogue inside this statement only and puts it back at its end.
DO $$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['plat_system_role_permission']; gated text[] := '{}';
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
  INSERT INTO "plat_system_role_permission" ("role_code", "permission_key") VALUES ('platform-owner', 'system/compliance:dsr-manage');
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END $$;
-- The definers (system plane only: each refused inside a firm's session).
CREATE FUNCTION plat_data_request_system_only() RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF platform_session_firm() IS NOT NULL THEN
    RAISE EXCEPTION 'plat_data_request: only ExpatReady''s own staff read or work the register of requests made to ExpatReady' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $fn$;
-- Logs a request and its RECEIVED step; returns its id.
CREATE FUNCTION plat_data_request_log(p_type text, p_name text, p_email text, p_received date, p_target date, p_firm uuid, p_person uuid, p_by text) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE r uuid := gen_random_uuid();
BEGIN
  PERFORM plat_data_request_system_only();
  INSERT INTO plat_data_request (id, type, requester_name, requester_email, received_on, target_date, firm_id, person_id, recorded_by)
    VALUES (r, p_type::"PlatDataRequestType", p_name, p_email, p_received, p_target, p_firm, p_person, p_by);
  INSERT INTO plat_data_request_event (id, request_id, kind, to_status, actor) VALUES (gen_random_uuid(), r, 'RECEIVED', 'PENDING', p_by);
  RETURN r;
END $fn$;
-- Moves a request (our staff): 'NOT_FOUND', 'SAME', 'REFUSED' (not a move MOVES allows, or OVERDUE asked by hand) or
-- 'MOVED'. The row is locked first, so two moves of one request run one after the other. p_today is the clock's day.
CREATE FUNCTION plat_data_request_move(p_id uuid, p_to text, p_actions text, p_note text, p_by text, p_today date) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE s "PlatDataRequestStatus";
BEGIN
  PERFORM plat_data_request_system_only();
  SELECT r.status INTO s FROM plat_data_request r WHERE r.id = p_id FOR UPDATE;
  IF s IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF p_to = 'OVERDUE' THEN RETURN 'REFUSED'; END IF;
  IF s::text = p_to THEN RETURN 'SAME'; END IF;
  IF NOT ((s = 'PENDING' AND p_to IN ('IN_PROGRESS', 'COMPLETED', 'HELD')) OR (s = 'IN_PROGRESS' AND p_to IN ('COMPLETED', 'HELD'))
       OR (s = 'OVERDUE' AND p_to IN ('COMPLETED', 'HELD')) OR (s = 'HELD' AND p_to IN ('IN_PROGRESS', 'COMPLETED'))) THEN
    RETURN 'REFUSED';
  END IF;
  UPDATE plat_data_request r SET status = p_to::"PlatDataRequestStatus", actions_taken = coalesce(p_actions, r.actions_taken),
    completed_on = CASE WHEN p_to = 'COMPLETED' THEN p_today END WHERE r.id = p_id;
  INSERT INTO plat_data_request_event (id, request_id, kind, from_status, to_status, note, actor)
    VALUES (gen_random_uuid(), p_id, 'STATUS_CHANGED', s, p_to::"PlatDataRequestStatus", p_note, p_by);
  RETURN 'MOVED';
END $fn$;
-- The daily check's mark (NFR5-14), under the row's lock. 'NEAR': an open request (PENDING, IN_PROGRESS) not yet past its
-- target gets its one NEAR_DATE_ALERTED mark. 'OVERDUE': an open request past its target (p_today after target_date)
-- moves to OVERDUE (a STATUS_CHANGED step) and gets its one OVERDUE_ALERTED mark. Returns true only when a mark was added
-- now (the caller then raises the alert, in the same transaction: an alert that cannot be raised undoes the mark).
CREATE FUNCTION plat_data_request_mark(p_id uuid, p_kind text, p_today date, p_by text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE s "PlatDataRequestStatus"; t date; n int;
BEGIN
  PERFORM plat_data_request_system_only();
  SELECT r.status, r.target_date INTO s, t FROM plat_data_request r WHERE r.id = p_id FOR UPDATE;
  IF s IS NULL OR s NOT IN ('PENDING', 'IN_PROGRESS') THEN RETURN false; END IF;
  IF p_kind = 'NEAR' THEN
    IF p_today > t THEN RETURN false; END IF;
    INSERT INTO plat_data_request_event (id, request_id, kind, actor) VALUES (gen_random_uuid(), p_id, 'NEAR_DATE_ALERTED', p_by) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n = 1;
  ELSIF p_kind = 'OVERDUE' THEN
    IF p_today <= t THEN RETURN false; END IF;
    UPDATE plat_data_request r SET status = 'OVERDUE' WHERE r.id = p_id;
    INSERT INTO plat_data_request_event (id, request_id, kind, from_status, to_status, actor) VALUES (gen_random_uuid(), p_id, 'STATUS_CHANGED', s, 'OVERDUE', p_by);
    INSERT INTO plat_data_request_event (id, request_id, kind, actor) VALUES (gen_random_uuid(), p_id, 'OVERDUE_ALERTED', p_by) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n = 1;
  END IF;
  RAISE EXCEPTION 'plat_data_request_mark: unknown mark %', p_kind USING ERRCODE = 'invalid_parameter_value';
END $fn$;
-- Requests newest first: by status (p_status, null for all), one request (p_id), open ones due on or before a day
-- (p_due_by: PENDING and IN_PROGRESS only, oldest target first, for the daily check, break m2); at most p_limit rows (1 to 501).
CREATE FUNCTION plat_data_request_list(p_status text, p_id uuid, p_due_by date, p_limit int)
  RETURNS TABLE (id uuid, type text, requester_name text, requester_email text, received_on date, target_date date, status text, actions_taken text,
                 completed_on date, firm_id uuid, person_id uuid, recorded_by text, created_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_data_request_system_only();
  RETURN QUERY SELECT r.id, r.type::text, r.requester_name, r.requester_email, r.received_on, r.target_date, r.status::text, r.actions_taken,
                      r.completed_on, r.firm_id, r.person_id, r.recorded_by, r.created_at
    FROM plat_data_request r
   WHERE (p_status IS NULL OR r.status::text = p_status) AND (p_id IS NULL OR r.id = p_id)
     AND (p_due_by IS NULL OR (r.status IN ('PENDING', 'IN_PROGRESS') AND r.target_date <= p_due_by))
   ORDER BY CASE WHEN p_due_by IS NOT NULL THEN r.target_date END, r.received_on DESC, r.created_at DESC, r.id LIMIT least(greatest(coalesce(p_limit, 501), 1), 501);
END $fn$;
-- One request's steps, in order.
CREATE FUNCTION plat_data_request_steps(p_id uuid)
  RETURNS TABLE (seq bigint, kind text, from_status text, to_status text, note text, actor text, at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_data_request_system_only();
  RETURN QUERY SELECT e.seq, e.kind::text, e.from_status::text, e.to_status::text, e.note, e.actor, e.at
    FROM plat_data_request_event e WHERE e.request_id = p_id ORDER BY e.seq;
END $fn$;
-- PF-8b F4 (RDS): CREATE on public for xr_wall_reader only for the hand-over (as 20261122180000_pf21b_legal_holds).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $own$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['plat_data_request_system_only()', 'plat_data_request_log(text, text, text, date, date, uuid, uuid, text)',
                           'plat_data_request_move(uuid, text, text, text, text, date)', 'plat_data_request_mark(uuid, text, date, text)',
                           'plat_data_request_list(text, uuid, date, integer)', 'plat_data_request_steps(uuid)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO xr_data', f);
  END LOOP;
END
$own$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
