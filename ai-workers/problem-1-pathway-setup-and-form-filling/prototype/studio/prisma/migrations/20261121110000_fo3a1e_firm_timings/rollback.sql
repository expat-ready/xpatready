-- FO-3a1e rollback (not a migration: Prisma reads only migration.sql). Run in one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261121110000_fo3a1e_firm_timings/rollback.sql
-- Run this BEFORE rolling the code back (review and break m5/m2): this PR's code reads filled timings as the type's own,
-- while the older code reads an empty timing as 0 (no times offered). Each empty timing is filled with the value the
-- type used: the firm's Timings value, else the default, so no slot or self-service limit changes. The firm values
-- (platform_firm_setting front_office.booking_*) are left as data; nothing reads them after the code rollback.
-- fo_booking_write goes back to FO-1b's text.
UPDATE "fo_consultation_type" t SET "gap_before_minutes" = COALESCE((SELECT (s.value #>> '{}')::int FROM "platform_firm_setting" s WHERE s.firm_id = t.firm_id AND jsonb_typeof(s.value) = 'number' AND (s.value #>> '{}') ~ '^[0-9]{1,6}$' AND s.key = 'front_office.booking_gap_before_minutes'), 0) WHERE t."gap_before_minutes" IS NULL;
UPDATE "fo_consultation_type" t SET "gap_after_minutes" = COALESCE((SELECT (s.value #>> '{}')::int FROM "platform_firm_setting" s WHERE s.firm_id = t.firm_id AND jsonb_typeof(s.value) = 'number' AND (s.value #>> '{}') ~ '^[0-9]{1,6}$' AND s.key = 'front_office.booking_gap_after_minutes'), 10) WHERE t."gap_after_minutes" IS NULL;
UPDATE "fo_consultation_type" t SET "min_notice_minutes" = COALESCE((SELECT (s.value #>> '{}')::int FROM "platform_firm_setting" s WHERE s.firm_id = t.firm_id AND jsonb_typeof(s.value) = 'number' AND (s.value #>> '{}') ~ '^[0-9]{1,6}$' AND s.key = 'front_office.booking_min_notice_minutes'), 240) WHERE t."min_notice_minutes" IS NULL;
UPDATE "fo_consultation_type" t SET "window_days" = COALESCE((SELECT (s.value #>> '{}')::int FROM "platform_firm_setting" s WHERE s.firm_id = t.firm_id AND jsonb_typeof(s.value) = 'number' AND (s.value #>> '{}') ~ '^[0-9]{1,6}$' AND s.key = 'front_office.booking_window_days'), 60) WHERE t."window_days" IS NULL;
UPDATE "fo_consultation_type" t SET "self_service_limit_minutes" = COALESCE((SELECT (s.value #>> '{}')::int FROM "platform_firm_setting" s WHERE s.firm_id = t.firm_id AND jsonb_typeof(s.value) = 'number' AND (s.value #>> '{}') ~ '^[0-9]{1,6}$' AND s.key = 'front_office.booking_self_service_minutes'), 240) WHERE t."self_service_limit_minutes" IS NULL;
ALTER TABLE "fo_consultation_type" ALTER COLUMN "gap_before_minutes" SET DEFAULT 0, ALTER COLUMN "gap_before_minutes" SET NOT NULL;
ALTER TABLE "fo_consultation_type" ALTER COLUMN "gap_after_minutes" SET DEFAULT 10, ALTER COLUMN "gap_after_minutes" SET NOT NULL;
ALTER TABLE "fo_consultation_type" ALTER COLUMN "min_notice_minutes" SET DEFAULT 240, ALTER COLUMN "min_notice_minutes" SET NOT NULL;
ALTER TABLE "fo_consultation_type" ALTER COLUMN "window_days" SET DEFAULT 60, ALTER COLUMN "window_days" SET NOT NULL;
ALTER TABLE "fo_consultation_type" ALTER COLUMN "self_service_limit_minutes" SET DEFAULT 240, ALTER COLUMN "self_service_limit_minutes" SET NOT NULL;

CREATE OR REPLACE FUNCTION fo_booking_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t record;
BEGIN
  IF NOT fo_zone_ok(NEW.visitor_time_zone) THEN
    RAISE EXCEPTION 'fo_booking: "%" is not an IANA time zone, e.g. America/Toronto', NEW.visitor_time_zone USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'SCHEDULED' THEN
      RAISE EXCEPTION 'fo_booking: a booking is written SCHEDULED, not %', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    NEW.sequence := 0;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status IN ('SCHEDULED', 'RESCHEDULED') AND NEW.status IN ('RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'))
      OR (OLD.status IN ('COMPLETED', 'NO_SHOW') AND NEW.status IN ('COMPLETED', 'NO_SHOW'))) THEN
      RAISE EXCEPTION 'fo_booking: status cannot move from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('COMPLETED', 'NO_SHOW') AND now() < NEW.starts_at THEN
      RAISE EXCEPTION 'fo_booking: attendance (%) is recorded once the meeting has started', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.starts_at, NEW.ends_at, NEW.staff_id, NEW.type_id, NEW.mode) IS DISTINCT FROM (OLD.starts_at, OLD.ends_at, OLD.staff_id, OLD.type_id, OLD.mode) THEN
      IF OLD.status NOT IN ('SCHEDULED', 'RESCHEDULED') THEN
        RAISE EXCEPTION 'fo_booking: a % booking is not moved or changed', OLD.status USING ERRCODE = 'check_violation';
      END IF;
      IF (NEW.starts_at, NEW.ends_at, NEW.staff_id) IS DISTINCT FROM (OLD.starts_at, OLD.ends_at, OLD.staff_id) AND NEW.status <> 'RESCHEDULED' THEN
        RAISE EXCEPTION 'fo_booking: a change of time or host is a reschedule (status RESCHEDULED)' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.sequence := OLD.sequence + CASE WHEN (NEW.starts_at, NEW.ends_at, NEW.staff_id, NEW.type_id, NEW.mode, NEW.status)
      IS DISTINCT FROM (OLD.starts_at, OLD.ends_at, OLD.staff_id, OLD.type_id, OLD.mode, OLD.status) THEN 1 ELSE 0 END;
  END IF;
  IF TG_OP = 'INSERT' OR (NEW.starts_at, NEW.ends_at, NEW.type_id, NEW.staff_id, NEW.mode) IS DISTINCT FROM (OLD.starts_at, OLD.ends_at, OLD.type_id, OLD.staff_id, OLD.mode) THEN
    SELECT tt.gap_before_minutes, tt.gap_after_minutes, tt.host_staff_ids, tt.modes INTO t FROM "fo_consultation_type" tt WHERE tt.firm_id = NEW.firm_id AND tt.id = NEW.type_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'fo_booking: consultation type % is not a type of firm %', NEW.type_id, NEW.firm_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF (TG_OP = 'INSERT' OR (NEW.staff_id, NEW.type_id) IS DISTINCT FROM (OLD.staff_id, OLD.type_id)) AND NOT (NEW.staff_id = ANY (t.host_staff_ids)) THEN
      RAISE EXCEPTION 'fo_booking: staff % is not a host of consultation type %', NEW.staff_id, NEW.type_id USING ERRCODE = 'check_violation';
    END IF;
    IF (TG_OP = 'INSERT' OR (NEW.mode, NEW.type_id) IS DISTINCT FROM (OLD.mode, OLD.type_id)) AND NOT (NEW.mode = ANY (t.modes)) THEN
      RAISE EXCEPTION 'fo_booking: mode % is not offered by consultation type %', NEW.mode, NEW.type_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR (NEW.starts_at, NEW.ends_at, NEW.type_id) IS DISTINCT FROM (OLD.starts_at, OLD.ends_at, OLD.type_id) THEN
    IF NOT (isfinite(NEW.starts_at) AND isfinite(NEW.ends_at) AND NEW.starts_at < NEW.ends_at) THEN
      RAISE EXCEPTION 'fo_booking: a booking has finite times and ends after it starts' USING ERRCODE = 'check_violation', CONSTRAINT = 'fo_booking_range_check';
    END IF;
    NEW.block_range := tstzrange(NEW.starts_at - make_interval(mins => t.gap_before_minutes), NEW.ends_at + make_interval(mins => t.gap_after_minutes), '[)');
  ELSE
    NEW.block_range := OLD.block_range;
  END IF;
  RETURN NEW;
END $$;
DO $readers$
BEGIN
  EXECUTE 'ALTER FUNCTION fo_booking_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp';
  EXECUTE 'ALTER FUNCTION fo_booking_write() OWNER TO xr_wall_reader';
END
$readers$;
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261121110000_fo3a1e_firm_timings';
