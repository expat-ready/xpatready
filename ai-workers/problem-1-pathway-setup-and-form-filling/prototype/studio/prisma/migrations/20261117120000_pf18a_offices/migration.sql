-- PF-18a part 1 (BACKLOG row PF-18a, brief design/lead-b-briefs/PF-18a.md; AG-1-74, AG-16-68, AG-16-59; P-600; schema file prisma/schema/platform-offices.prisma, owner
-- Lead B): a firm's offices with their own time zone, business hours and closed days, and which office a staff member works in. New tables only; no existing row, table
-- or column changes.
--   * new: platform_office, platform_staff_office.
--   * real keys on (firm, …) to platform_firm, platform_staff and platform_office; platform.prisma gets only the
--     back-relation lines under its slot `offices (PF-18a)` (Lead B on #2009).
--   * every function is platform_office_ / platform_staff_office_ (area prefix, rows rev 15.2).
-- Rollback (in this order): DROP TABLE "platform_staff_office", "platform_office"; DROP FUNCTION platform_office_write(),
--   platform_office_no_delete(); delete this folder's row from _prisma_migrations.
-- Prisma's DDL (prisma migrate diff), then the rules.
CREATE TABLE "platform_office" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "firm_id" UUID NOT NULL, "name" TEXT NOT NULL, "province" TEXT, "country_code" CHAR(2) NOT NULL DEFAULT 'CA', "time_zone" TEXT NOT NULL, "business_hours" JSONB NOT NULL, "closed_days" JSONB NOT NULL, "is_first" BOOLEAN NOT NULL DEFAULT false, "created_by" TEXT NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "platform_office_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "platform_staff_office" (
  "staff_id" UUID NOT NULL, "firm_id" UUID NOT NULL, "office_id" UUID NOT NULL, "set_by" TEXT NOT NULL, "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "platform_staff_office_pkey" PRIMARY KEY ("staff_id")
);
CREATE UNIQUE INDEX "platform_office_firm_id_id_key" ON "platform_office"("firm_id", "id");
CREATE UNIQUE INDEX "platform_office_firm_id_name_key" ON "platform_office"("firm_id", "name");
CREATE INDEX "platform_staff_office_firm_id_office_id_idx" ON "platform_staff_office"("firm_id", "office_id");
CREATE UNIQUE INDEX "platform_staff_office_firm_id_staff_id_key" ON "platform_staff_office"("firm_id", "staff_id");
ALTER TABLE "platform_office" ADD CONSTRAINT "platform_office_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "platform_staff_office" ADD CONSTRAINT "platform_staff_office_firm_id_office_id_fkey" FOREIGN KEY ("firm_id", "office_id") REFERENCES "platform_office"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "platform_staff_office" ADD CONSTRAINT "platform_staff_office_firm_id_staff_id_fkey" FOREIGN KEY ("firm_id", "staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- ------------------------------------------------------------------------------------------------ rules Prisma cannot say
-- SQLSTATE 23514 (check_violation) for a broken rule; the keys give 23503 for a firm, person or office that is not there.
ALTER TABLE "platform_office"
  -- A name a person typed: trimmed, 1 to 120 characters, no control character.
  ADD CONSTRAINT "platform_office_name_check" CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 120 AND "name" !~ '[[:cntrl:]]'),
  ADD CONSTRAINT "platform_office_country_check" CHECK ("country_code" ~ '^[A-Z]{2}$'),
  -- In Canada a province or territory from the pack list (samples/province-time-zones-ca.json), or none; abroad, none.
  ADD CONSTRAINT "platform_office_province_check" CHECK ("province" IS NULL OR ("country_code" = 'CA' AND "province" IN ('AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'))),
  -- Break B5: each open day an object with its day and HH:MM times, each closed day a YYYY-MM-DD string, the zone an IANA-shaped name ('Factory' refused).
  ADD CONSTRAINT "platform_office_hours_check" CHECK (jsonb_typeof("business_hours") = 'array' AND jsonb_array_length("business_hours") <= 7 AND NOT jsonb_path_exists("business_hours", '$[*] ? (@.type() != "object" || !(@.day like_regex "^(MON|TUE|WED|THU|FRI|SAT|SUN)$") || !(@.opens like_regex "^([01][0-9]|2[0-3]):[0-5][0-9]$") || !(@.closes like_regex "^([01][0-9]|2[0-3]):[0-5][0-9]$"))')),
  ADD CONSTRAINT "platform_office_closed_check" CHECK (jsonb_typeof("closed_days") = 'array' AND jsonb_array_length("closed_days") <= 366 AND NOT jsonb_path_exists("closed_days", '$[*] ? (@.type() != "string" || !(@ like_regex "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"))')),
  ADD CONSTRAINT "platform_office_zone_check" CHECK ("time_zone" ~ '^(UTC|[A-Z][A-Za-z]+(/[A-Za-z0-9_+-]+)+)$'),
  ADD CONSTRAINT "platform_office_by_check" CHECK ("created_by" ~ '^(staff|system|seed):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$');
ALTER TABLE "platform_staff_office"
  ADD CONSTRAINT "platform_staff_office_by_check" CHECK ("set_by" ~ '^(staff|system|seed):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$');
-- Names are unique per firm in any case (break B1; the code also checks, under the firm's lock).
CREATE UNIQUE INDEX "platform_office_firm_name_ci" ON "platform_office"("firm_id", lower("name"));
-- One first office per firm (the one the firm's own settings were copied into).
CREATE UNIQUE INDEX "platform_office_one_first" ON "platform_office"("firm_id") WHERE "is_first";
-- An office's zone is one PostgreSQL knows by that exact name (no space, no other case: the code checks the same with the firm setting's schema); the firm, the first
-- flag, who made it and when never change.
CREATE FUNCTION platform_office_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.firm_id, NEW.is_first, NEW.created_by, NEW.created_at) IS DISTINCT FROM (OLD.firm_id, OLD.is_first, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'platform_office: the firm, the first flag, who made it and when never change' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = NEW.time_zone) THEN
    RAISE EXCEPTION 'platform_office: "%" is not a time zone name', NEW.time_zone USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_office_write BEFORE INSERT OR UPDATE ON "platform_office" FOR EACH ROW EXECUTE FUNCTION platform_office_write();
-- An office is never removed here (a removal is its own later row, AG-1-74 §12).
CREATE FUNCTION platform_office_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'platform_office: an office is never removed here' USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER platform_office_no_delete BEFORE DELETE ON "platform_office" FOR EACH ROW EXECUTE FUNCTION platform_office_no_delete();
CREATE TRIGGER platform_office_no_truncate BEFORE TRUNCATE ON "platform_office" FOR EACH STATEMENT EXECUTE FUNCTION platform_office_no_delete();
-- A person's row is never moved to another person (break B9): the app may change only the office, who and when.
REVOKE UPDATE ON "platform_staff_office" FROM xr_data; GRANT UPDATE ("office_id", "set_by", "updated_at") ON "platform_staff_office" TO xr_data;
-- ------------------------------------------------------------------------------------------------------ PF-12's walls
-- PF-12's wall on both tables (forced policy, the firm gate first); the trigger functions run as xr_wall_reader, so they see every firm's rows, as PF-12 asks of every firm table's trigger function
-- (tests/check_pf12_walls.ts).
ALTER TABLE "platform_office" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_office" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_staff_office" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_staff_office" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_office" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_staff_office" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['platform_office_write()', 'platform_office_no_delete()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
