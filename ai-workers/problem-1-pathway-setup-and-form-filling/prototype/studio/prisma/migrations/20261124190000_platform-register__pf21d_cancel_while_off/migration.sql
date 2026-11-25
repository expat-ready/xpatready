-- PF-21d part 2a (brief product/screens/PF-21d-2/brief.md, "Carried from part 1b"; Lead 4 on #3235, rulings of 23 Nov;
-- round 7's Minors). Additive apart from three definer bodies (cancel, claim) and one check (re-added with its brackets).
-- Legal reading Unconfirmed: no counsel.
-- Item 2 (round 2 m1): the check as meant. AND bound before OR, so "a claim needs an erase day" was never checked.
ALTER TABLE "plat_data_request" DROP CONSTRAINT "plat_data_request_erase_on_set";
ALTER TABLE "plat_data_request" ADD CONSTRAINT "plat_data_request_erase_on_set" CHECK (("erase_on" IS NULL OR ("type" = 'DELETION' AND "person_id" IS NOT NULL AND "erase_on" > "received_on"))
  AND ("erasing_since" IS NULL OR "erase_on" IS NOT NULL) AND ("status" <> 'COMPLETED' OR "erase_on" IS NULL));
-- Item 8 (R7-1): once a run has retaken a claim, the data may be gone. The request remembers it for good: cancel refuses
-- (MAY_HAVE_ERASED) and every later run is treated as a retake (true words, never "nothing was erased").
ALTER TABLE "plat_data_request" ADD COLUMN "may_have_erased" BOOLEAN NOT NULL DEFAULT false;
-- Item 5 (round 2 m3, R7-2): each module's result, written inside the erasers' own firm transaction, so a mark exists
-- exactly when that run's erasers committed. A later run reads the earlier marks, and the register never understates.
CREATE TABLE "plat_data_request_erasure_mark" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "claim" TIMESTAMPTZ NOT NULL,
    "module" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "marked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- No foreign key on purpose: one would take a key-share lock on the request inside the erasers' transaction, and a cancel
    -- or a hand move mid-run (FOR UPDATE) would then wait for the erasers instead of answering at once. The mark's definer
    -- checks the request exists under that claim, and neither table ever deletes a row.
    CONSTRAINT "plat_data_request_erasure_mark_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plat_data_request_erasure_mark_outcome" CHECK ("outcome" IN ('ERASED', 'NOTHING', 'KEPT')),
    -- ErasurePort's own rules (ports/erasure.ts ModuleName, EraseOutcome.note; BR-16: ids, counts and class names only),
    -- held by the table too: whatever reaches the definer, no free text or address lands in the register's words.
    CONSTRAINT "plat_data_request_erasure_mark_rules" CHECK ("module" ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$' AND char_length("module") <= 60
      AND char_length("note") BETWEEN 1 AND 300 AND position('@' in "note") = 0)
);
CREATE UNIQUE INDEX "plat_data_request_erasure_mark_request_id_claim_module_key" ON "plat_data_request_erasure_mark"("request_id", "claim", "module");
CREATE TRIGGER "plat_data_request_erasure_mark_kept" BEFORE UPDATE OR DELETE ON "plat_data_request_erasure_mark" FOR EACH ROW EXECUTE FUNCTION plat_data_request_kept();
CREATE TRIGGER "plat_data_request_erasure_mark_no_truncate" BEFORE TRUNCATE ON "plat_data_request_erasure_mark" FOR EACH STATEMENT EXECUTE FUNCTION plat_data_request_kept();
REVOKE ALL ON "plat_data_request_erasure_mark" FROM xr_data;   -- as the register: the definers are the way in
ALTER TABLE "plat_data_request_erasure_mark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_data_request_erasure_mark" FORCE ROW LEVEL SECURITY;
-- The mark, from inside the order's firm transaction (the one definer a firm's session may call): only for a request of
-- the session's firm, under that run's own claim. Anything else is refused, never ignored.
CREATE FUNCTION plat_data_request_erasure_mark_add(p_id uuid, p_claim timestamptz, p_module text, p_outcome text, p_note text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM 1 FROM plat_data_request x WHERE x.id = p_id AND x.erasing_since = p_claim AND x.firm_id = platform_session_firm();   -- no row lock: the finish checks the claim again
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plat_data_request_erasure_mark_add: not an order of this firm under this claim' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO plat_data_request_erasure_mark (request_id, claim, module, outcome, note) VALUES (p_id, p_claim, p_module, p_outcome, p_note);
  RETURN true;   -- a value, not void: the app reads it through a raw query
END $fn$;
-- An earlier run's marks (another claim), ERASED or KEPT, oldest first: what the register must still say was done.
CREATE FUNCTION plat_data_request_erasure_marks(p_id uuid, p_claim timestamptz) RETURNS TABLE (module text, outcome text, note text)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_data_request_system_only();
  RETURN QUERY SELECT k.module, k.outcome, k.note FROM plat_data_request_erasure_mark k
   WHERE k.request_id = p_id AND k.claim <> p_claim AND k.outcome IN ('ERASED', 'KEPT') ORDER BY k.marked_at, k.module;
END $fn$;
-- Item 8: the claim marks a retake for good, and a request so marked is a retake from then on.
CREATE OR REPLACE FUNCTION plat_data_request_erasure_claim(p_id uuid, p_today date) RETURNS TABLE (claim timestamptz, retaken boolean)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE r plat_data_request%ROWTYPE; c timestamptz := date_trunc('milliseconds', clock_timestamp());   -- the app's Date carries milliseconds
BEGIN
  PERFORM plat_data_request_system_only();
  SELECT * INTO r FROM plat_data_request x WHERE x.id = p_id FOR UPDATE;
  IF r.id IS NULL OR r.erase_on IS NULL OR r.erase_on > p_today OR r.status = 'COMPLETED'
     OR (r.erasing_since IS NOT NULL AND r.erasing_since > c - interval '30 minutes') THEN RETURN; END IF;
  UPDATE plat_data_request x SET erasing_since = c, may_have_erased = x.may_have_erased OR r.erasing_since IS NOT NULL WHERE x.id = p_id;
  RETURN QUERY SELECT c, r.erasing_since IS NOT NULL OR r.may_have_erased;
END $fn$;
-- Item 1 (Lead 4, #3235 comment 7095583893; SA-11-16 (a), (d)): while the "Data erasure" switch is off (the
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
  IF r.may_have_erased THEN RETURN 'MAY_HAVE_ERASED'; END IF;   -- item 8 (R7-1): an earlier run may have erased
  -- An unknown switch reads as on (the stricter answer: the window has ended), never as a silent off.
  SELECT coalesce((SELECT s.is_on FROM plat_switch_list() s WHERE s.key = 'platform.data-erasure'), true) INTO switch_on;
  IF p_today >= r.erase_on AND r.status <> 'HELD' AND switch_on THEN RETURN 'WINDOW_ENDED'; END IF;
  UPDATE plat_data_request x SET erase_on = NULL, erasing_since = NULL WHERE x.id = p_id;
  INSERT INTO plat_data_request_event (id, request_id, kind, note, actor) VALUES (gen_random_uuid(), p_id, 'ERASURE_CANCELLED', p_note, p_by);
  RETURN 'CANCELLED';
END $fn$;
-- PF-8b F4 (RDS): as 20261124140000_pf21d_erasure, CREATE on public for the hand-over to xr_wall_reader, taken back after.
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $own$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['plat_data_request_erasure_cancel(uuid, text, text, date)', 'plat_data_request_erasure_claim(uuid, date)',
                           'plat_data_request_erasure_mark_add(uuid, timestamptz, text, text, text)', 'plat_data_request_erasure_marks(uuid, timestamptz)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO xr_data', f);
  END LOOP;
END
$own$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
