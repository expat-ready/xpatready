-- FO-3a part 1b-i (BACKLOG row FO-3a; brief lead-b-briefs/FO-3a.md "Part 1b", split by its P-610 line; AG-4-62 rules 1,
-- 1b, 1c, 2-8, §7): named sets of hours, each with its own IANA zone and weekly windows, one the person's default; a type
-- may name, per host, which set it uses (fo_type_host_set; none = the default; CASCADE from the set, so a deleted set
-- falls back to the default). fo_availability.set_id: a window belongs to one set of the same person (composite key,
-- CASCADE). Backfill: one "Normal hours" default set per person with windows, in their windows' zone (FO-1b had one zone
-- per person), so every slot offered today is offered unchanged. A window written without a set (FO-1b's seed, older
-- suites) goes to the default set, made when missing (fo_booking_set_default). No-overlap and one-zone now hold per set
-- (same names); a window's zone change is copied to its set. Both new tables walled (PF-12).
-- Rollback: DROP TABLE "fo_type_host_set"; ALTER TABLE "fo_availability" DROP CONSTRAINT "fo_availability_no_overlap",
--   DROP CONSTRAINT "fo_availability_one_zone", DROP COLUMN "set_id"; restore FO-1b's two exclusions on (firm_id, staff_id);
--   DROP TABLE "fo_availability_set"; DROP FUNCTION fo_booking_set_default(), fo_booking_set_zone(), fo_booking_set_zone_follow().

CREATE TABLE "fo_availability_set" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "time_zone" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fo_availability_set_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fo_availability_set_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX "fo_availability_set_firm_id_id_key" ON "fo_availability_set"("firm_id", "id");
CREATE UNIQUE INDEX "fo_availability_set_firm_id_staff_id_id_key" ON "fo_availability_set"("firm_id", "staff_id", "id");
-- AG-4-62 §7: exactly one default per person (the app moves the mark in one transaction; at most one here, at least one
-- because the default is never deleted: the API refuses it).
CREATE UNIQUE INDEX "fo_availability_set_one_default" ON "fo_availability_set"("firm_id", "staff_id", "is_default") WHERE "is_default";
ALTER TABLE "fo_availability_set" ADD CONSTRAINT "fo_availability_set_firm_id_staff_id_fkey" FOREIGN KEY ("firm_id", "staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "fo_type_host_set" (
    "firm_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "set_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fo_type_host_set_pkey" PRIMARY KEY ("firm_id", "type_id", "staff_id")
);
ALTER TABLE "fo_type_host_set" ADD CONSTRAINT "fo_type_host_set_firm_id_type_id_fkey" FOREIGN KEY ("firm_id", "type_id") REFERENCES "fo_consultation_type"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "fo_type_host_set" ADD CONSTRAINT "fo_type_host_set_firm_id_staff_id_set_id_fkey" FOREIGN KEY ("firm_id", "staff_id", "set_id") REFERENCES "fo_availability_set"("firm_id", "staff_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- Backfill (rule 1, test 3): each person with windows gets one default set "Normal hours" in their windows' zone.
ALTER TABLE "fo_availability" ADD COLUMN "set_id" UUID;
-- PF-8b F7 (Amazon RDS: the admin is neither superuser nor BYPASSRLS): every staff member's hours get their default set. Such a runner owns the walled tables but,
-- under FORCE ROW LEVEL SECURITY, would read and change none of their rows; it lifts FORCE on them inside this one statement
-- (ACCESS EXCLUSIVE first, so nobody sees the walls lifted) and puts it back after. A superuser or BYPASSRLS runner does
-- exactly what it did. tests/check_pf8b_f7_data_walls.ts fails when a data statement on a walled table runs without this.
DO $pf8b_f7$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['fo_availability']; gated text[] := '{}';
BEGIN
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    -- …and PF-12's firm gate, which refuses a write by such a runner with no session firm and lets a superuser or
    -- BYPASSRLS one through (platform_firm_first), steps aside on them too: the runner then writes as those do.
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled <> 'D' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  INSERT INTO "fo_availability_set" ("firm_id", "staff_id", "name", "is_default", "time_zone")
    SELECT "firm_id", "staff_id", 'Normal hours', true, min("time_zone") FROM "fo_availability" GROUP BY "firm_id", "staff_id";
  UPDATE "fo_availability" a SET "set_id" = s."id" FROM "fo_availability_set" s
    WHERE s."firm_id" = a."firm_id" AND s."staff_id" = a."staff_id" AND s."is_default";
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END
$pf8b_f7$;
ALTER TABLE "fo_availability" ALTER COLUMN "set_id" SET NOT NULL;
ALTER TABLE "fo_availability" ADD CONSTRAINT "fo_availability_firm_id_staff_id_set_id_fkey" FOREIGN KEY ("firm_id", "staff_id", "set_id") REFERENCES "fo_availability_set"("firm_id", "staff_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
CREATE INDEX "fo_availability_firm_id_set_id_idx" ON "fo_availability"("firm_id", "set_id");
-- The no-overlap and one-zone rules per set (same names, so FO-1b's checks still read them).
ALTER TABLE "fo_availability" DROP CONSTRAINT "fo_availability_no_overlap", DROP CONSTRAINT "fo_availability_one_zone";
ALTER TABLE "fo_availability"
  ADD CONSTRAINT "fo_availability_no_overlap" EXCLUDE USING gist ("firm_id" WITH =, "set_id" WITH =, "weekday" WITH =, int4range("start_minute", "end_minute") WITH &&),
  ADD CONSTRAINT "fo_availability_one_zone" EXCLUDE USING gist ("firm_id" WITH =, "set_id" WITH =, "time_zone" WITH <>) DEFERRABLE INITIALLY DEFERRED;

-- A window written without a set goes to the person's default set, made when missing (in the window's zone).
CREATE FUNCTION fo_booking_set_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.set_id IS NULL THEN
    -- A person not of the firm gets the window's own foreign-key answer (FO-1b's), never a set made for them.
    IF NOT EXISTS (SELECT 1 FROM "platform_staff" p WHERE p.firm_id = NEW.firm_id AND p.id = NEW.staff_id) THEN
      RAISE EXCEPTION 'insert or update on table "fo_availability" violates foreign key constraint "fo_availability_firm_id_staff_id_fkey"'
        USING ERRCODE = 'foreign_key_violation', DETAIL = 'Key (firm_id, staff_id) is not present in table "platform_staff" (checked before a default set is made).';
    END IF;
    SELECT s.id INTO NEW.set_id FROM "fo_availability_set" s WHERE s.firm_id = NEW.firm_id AND s.staff_id = NEW.staff_id AND s.is_default;
    IF NEW.set_id IS NULL THEN
      INSERT INTO "fo_availability_set" ("firm_id", "staff_id", "name", "is_default", "time_zone") VALUES (NEW.firm_id, NEW.staff_id, 'Normal hours', true, NEW.time_zone)
        ON CONFLICT ("firm_id", "staff_id", "is_default") WHERE "is_default" DO NOTHING;
      SELECT s.id INTO NEW.set_id FROM "fo_availability_set" s WHERE s.firm_id = NEW.firm_id AND s.staff_id = NEW.staff_id AND s.is_default;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fo_availability_set_default BEFORE INSERT ON "fo_availability" FOR EACH ROW EXECUTE FUNCTION fo_booking_set_default();

-- A window's zone is its set's: an insert or a zone change copies it (FO-1b's suites set a person's zone on the windows).
CREATE FUNCTION fo_booking_set_zone_follow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "fo_availability_set" SET "time_zone" = NEW.time_zone, "updated_at" = now() WHERE firm_id = NEW.firm_id AND id = NEW.set_id AND time_zone <> NEW.time_zone;
  RETURN NULL;
END $$;
CREATE TRIGGER fo_availability_zone_follow AFTER INSERT OR UPDATE OF time_zone ON "fo_availability" FOR EACH ROW EXECUTE FUNCTION fo_booking_set_zone_follow();

CREATE FUNCTION fo_booking_set_zone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT fo_zone_ok(NEW.time_zone) THEN
    RAISE EXCEPTION 'fo_availability_set: "%" is not an IANA time zone, e.g. America/Toronto', NEW.time_zone USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fo_availability_set_zone BEFORE INSERT OR UPDATE OF time_zone ON "fo_availability_set" FOR EACH ROW EXECUTE FUNCTION fo_booking_set_zone();
CREATE TRIGGER fo_availability_set_firm_fixed BEFORE UPDATE OF firm_id ON "fo_availability_set" FOR EACH ROW EXECUTE FUNCTION fo_firm_fixed();
CREATE TRIGGER fo_type_host_set_firm_fixed BEFORE UPDATE OF firm_id ON "fo_type_host_set" FOR EACH ROW EXECUTE FUNCTION fo_firm_fixed();

-- PF-12: both tables walled; the firm gate first; the trigger functions run as the wall reader.
ALTER TABLE "fo_availability_set" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_availability_set" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "fo_type_host_set" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_type_host_set" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_availability_set" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_type_host_set" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fo_booking_set_default()', 'fo_booking_set_zone_follow()', 'fo_booking_set_zone()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
