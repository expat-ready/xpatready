-- migration · PF-15 part 1a (brief design/lead-b-briefs/PF-15.md; SA-3-4, SA-3-39, SA-3-40). Schema:
-- prisma/schema/platform-entitlements.prisma (+ two back-relations in platform.prisma). Additive only.
--   * platform_plan_limit: a catalogue (no firm_id, outside PF-12's walls like platform_plan), one row per plan and metric;
--     null = Unlimited, 0 = none, never negative; read by the app, never written by it (writes revoked from xr_data);
--     goes with its plan (cascade). Seats stay on platform_plan.seats_limit.
--   * platform_storage_over: a firm's storage-over mark (PF-12's wall); never deleted, never moves firm.
--   * Sample rows for every plan: solo 25 / 5 cases, 5 120 MB; team 150 / 30, 25 600 MB; firm 600 / 120, 102 400 MB; else 0.
-- Every function carries the platform_ prefix (rows rev 15.2).
-- Rollback (as the migration's owner; on a role that is not superuser, first ALTER FUNCTION platform_storage_over_kept()
--   OWNER TO CURRENT_USER, since PF-12's pattern gives it to xr_wall_reader): DROP TABLE "platform_storage_over", "platform_plan_limit"; DROP TYPE "platform_limit_metric"; DROP FUNCTION
--   platform_storage_over_kept(), platform_entitlement_limit(text, text, timestamptz); delete this folder's row from _prisma_migrations. No other table holds a reference to
--   either table, so nothing else changes.

CREATE TYPE "platform_limit_metric" AS ENUM ('ACTIVE_INDIVIDUAL_CASES', 'ACTIVE_CORPORATE_CASES', 'STORAGE_MB');

CREATE TABLE "platform_plan_limit" (
    "plan_id" UUID NOT NULL,
    "metric" "platform_limit_metric" NOT NULL,
    "limit_value" INTEGER,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_plan_limit_pkey" PRIMARY KEY ("plan_id","metric")
);

CREATE TABLE "platform_storage_over" (
    "firm_id" UUID NOT NULL,
    "first_over_at" TIMESTAMPTZ NOT NULL,
    "alerted_at" TIMESTAMPTZ,
    "back_under_at" TIMESTAMPTZ,
    "used_bytes" BIGINT NOT NULL,
    "limit_mb" INTEGER,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_storage_over_pkey" PRIMARY KEY ("firm_id")
);

ALTER TABLE "platform_plan_limit" ADD CONSTRAINT "platform_plan_limit_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "platform_plan"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "platform_storage_over" ADD CONSTRAINT "platform_storage_over_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ------------------------------------------------------------------------------------------ rules Prisma cannot say
ALTER TABLE "platform_plan_limit" ADD CONSTRAINT "platform_plan_limit_value_ok" CHECK ("limit_value" IS NULL OR "limit_value" >= 0);
ALTER TABLE "platform_storage_over" ADD CONSTRAINT "platform_storage_over_values_ok" CHECK ("used_bytes" >= 0 AND ("limit_mb" IS NULL OR "limit_mb" >= 0)
  AND ("alerted_at" IS NULL OR "alerted_at" >= "first_over_at") AND ("back_under_at" IS NULL OR "back_under_at" >= "first_over_at"));

-- A mark is never removed and never moves firm (SA-3-40: the history of an episode stays; a new episode updates it).
CREATE FUNCTION platform_storage_over_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."firm_id" = OLD."firm_id" THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'platform_storage_over: a storage mark is never removed and never moves firm' USING ERRCODE = '23514';
END $fn$;
CREATE TRIGGER "platform_storage_over_kept" BEFORE UPDATE OR DELETE ON "platform_storage_over" FOR EACH ROW EXECUTE FUNCTION platform_storage_over_kept();
CREATE TRIGGER "platform_storage_over_no_truncate" BEFORE TRUNCATE ON "platform_storage_over" FOR EACH STATEMENT EXECUTE FUNCTION platform_storage_over_kept();

-- The catalogue is read by the app, written only by migrations (and part 2's route, which grants what it needs).
REVOKE INSERT, UPDATE, DELETE ON "platform_plan_limit" FROM xr_data;

-- ------------------------------------------------------------------------------------------- PF-12's walls (#1910)
ALTER TABLE "platform_storage_over" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_storage_over" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_storage_over" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER FUNCTION platform_storage_over_kept() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION platform_storage_over_kept() OWNER TO xr_wall_reader;

-- The one limit read (review M1): a firm named by id or key, from any scope (the case side has no platform firm in
-- scope), so it crosses the walls in one narrow definer function: the firm's live plan, its limit on one metric, and
-- whether its storage is hard (over since p_hard_since, not back under). Owned by xr_wall_reader, callable by xr_app and xr_staff_bypass.
CREATE FUNCTION platform_entitlement_limit(p_firm text, p_metric text, p_hard_since timestamptz)
  RETURNS TABLE (firm_id uuid, plan_code text, plan_name text, seats integer, limit_value integer, has_row boolean, storage_hard boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT f.id, p.code, p.name, p.seats_limit, l.limit_value, l.plan_id IS NOT NULL,
            COALESCE((SELECT o.back_under_at IS NULL AND o.first_over_at <= p_hard_since FROM platform_storage_over o WHERE o.firm_id = f.id), false)
          FROM platform_firm f
          LEFT JOIN platform_subscription s ON s.firm_id = f.id AND s.status <> 'ENDED'
          LEFT JOIN platform_plan p ON p.id = s.plan_id
          LEFT JOIN platform_plan_limit l ON l.plan_id = p.id AND l.metric::text = p_metric
          WHERE f.id::text = lower(p_firm) OR f.key = p_firm
          ORDER BY (f.id::text = lower(p_firm)) DESC LIMIT 1 $fn$;
ALTER FUNCTION platform_entitlement_limit(text, text, timestamptz) OWNER TO xr_wall_reader;
REVOKE ALL ON FUNCTION platform_entitlement_limit(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_entitlement_limit(text, text, timestamptz) TO xr_app, xr_staff_bypass;   -- the bypass role: a suite or tool (direct mode)

-- ------------------------------------------------------------------------------------------------- Sample limits
INSERT INTO "platform_plan_limit" ("plan_id", "metric", "limit_value")
SELECT p."id", m.metric::"platform_limit_metric",
  CASE p."code"
    WHEN 'solo' THEN (ARRAY[25, 5, 5120])[m.n]
    WHEN 'team' THEN (ARRAY[150, 30, 25600])[m.n]
    WHEN 'firm' THEN (ARRAY[600, 120, 102400])[m.n]
    ELSE 0 END
FROM "platform_plan" p
CROSS JOIN (VALUES (1, 'ACTIVE_INDIVIDUAL_CASES'), (2, 'ACTIVE_CORPORATE_CASES'), (3, 'STORAGE_MB')) AS m(n, metric);
