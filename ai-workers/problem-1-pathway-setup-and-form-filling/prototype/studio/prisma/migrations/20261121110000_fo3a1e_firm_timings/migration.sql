-- FO-3a1e (FO-3a part 1b-ii, brief lead-b-briefs/FO-3a.md "Firm timings"; AG-4-4, AG-4-5, AG-4-66 rules 1-2, §7): a booking
-- type's five timings become "empty = use the firm's value". Additive: no column, table or row is removed.
--   * The five per-type columns lose NOT NULL and their DEFAULT, so a new type uses the firm's Timings value
--     (front_office.booking_* in platform_firm_setting, registered in api/src/front-office/booking/settings/timings.ts),
--     else the default. The existing CHECKs stay (a NULL passes them).
--   * Backfill: a type's value equal to today's default becomes NULL (no firm has a front_office.booking_* value yet, so
--     each firm's value is the default and nothing a booker sees changes). Any other value is the type's own and stays.
--   * fo_booking_write (FO-1b) padded block_range by the type's gaps; an empty gap would make the padding NULL (an
--     unbounded range), so it now takes the firm's value, else the default (0 before, 10 after: the same defaults as the
--     registered settings; tests/check_fo3a_hours_timings.ts DW21 checks both). Only that one SELECT changes; the rest of
--     the function is FO-1b's text. A booking's block_range is still computed when it is written and never follows a
--     later change of the type's or the firm's gaps (AG-4-4 rule 8). PF-12: CREATE OR REPLACE resets SECURITY DEFINER
--     and search_path, so both are set again and the wall reader owns it (as 20261118200000_fo7ts_money_settings does).
-- Rollback: rollback.sql in this folder.
ALTER TABLE "fo_consultation_type" ALTER COLUMN "gap_before_minutes" DROP NOT NULL, ALTER COLUMN "gap_before_minutes" DROP DEFAULT;
ALTER TABLE "fo_consultation_type" ALTER COLUMN "gap_after_minutes" DROP NOT NULL, ALTER COLUMN "gap_after_minutes" DROP DEFAULT;
ALTER TABLE "fo_consultation_type" ALTER COLUMN "min_notice_minutes" DROP NOT NULL, ALTER COLUMN "min_notice_minutes" DROP DEFAULT;
ALTER TABLE "fo_consultation_type" ALTER COLUMN "window_days" DROP NOT NULL, ALTER COLUMN "window_days" DROP DEFAULT;
ALTER TABLE "fo_consultation_type" ALTER COLUMN "self_service_limit_minutes" DROP NOT NULL, ALTER COLUMN "self_service_limit_minutes" DROP DEFAULT;

-- PF-8b F7 (Amazon RDS: the admin is neither superuser nor BYPASSRLS): every booking type's default timings follow the firm. Such a runner owns the walled tables but,
-- under FORCE ROW LEVEL SECURITY, would read and change none of their rows; it lifts FORCE on them inside this one statement
-- (ACCESS EXCLUSIVE first, so nobody sees the walls lifted) and puts it back after. A superuser or BYPASSRLS runner does
-- exactly what it did. tests/check_pf8b_f7_data_walls.ts fails when a data statement on a walled table runs without this.
DO $pf8b_f7$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['fo_consultation_type']; gated text[] := '{}';
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
  UPDATE "fo_consultation_type" SET "gap_before_minutes" = NULL WHERE "gap_before_minutes" = 0;
  UPDATE "fo_consultation_type" SET "gap_after_minutes" = NULL WHERE "gap_after_minutes" = 10;
  UPDATE "fo_consultation_type" SET "min_notice_minutes" = NULL WHERE "min_notice_minutes" = 240;
  UPDATE "fo_consultation_type" SET "window_days" = NULL WHERE "window_days" = 60;
  UPDATE "fo_consultation_type" SET "self_service_limit_minutes" = NULL WHERE "self_service_limit_minutes" = 240;
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END
$pf8b_f7$;

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
    -- FO-3a1e: a type's empty gap is the firm's Timings value, else the default (AG-4-4 rule 2). Only a whole, non-negative
    -- JSON number of at most 6 digits is read (the settings home stores 0-1,440 only, by the key's schema); anything else
    -- (a string, 10.5, -600, 1e10) is treated as unset, so a bad stored value never stops a booking write.
    SELECT COALESCE(tt.gap_before_minutes, (SELECT (s.value #>> '{}')::int FROM "platform_firm_setting" s WHERE s.firm_id = NEW.firm_id AND s.key = 'front_office.booking_gap_before_minutes' AND jsonb_typeof(s.value) = 'number' AND (s.value #>> '{}') ~ '^[0-9]{1,6}$'), 0) AS gap_before_minutes,
           COALESCE(tt.gap_after_minutes, (SELECT (s.value #>> '{}')::int FROM "platform_firm_setting" s WHERE s.firm_id = NEW.firm_id AND s.key = 'front_office.booking_gap_after_minutes' AND jsonb_typeof(s.value) = 'number' AND (s.value #>> '{}') ~ '^[0-9]{1,6}$'), 10) AS gap_after_minutes,
           tt.host_staff_ids, tt.modes INTO t FROM "fo_consultation_type" tt WHERE tt.firm_id = NEW.firm_id AND tt.id = NEW.type_id;
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
