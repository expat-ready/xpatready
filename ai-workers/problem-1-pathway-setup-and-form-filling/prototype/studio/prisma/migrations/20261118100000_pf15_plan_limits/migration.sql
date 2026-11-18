-- migration · PF-15 part 1a (BACKLOG PF-15; brief design/lead-b-briefs/PF-15.md; SA-3-4, SA-3-5, SA-3-39, SA-3-40):
-- plan limits besides seats, and each firm's storage-over mark. Schema: prisma/schema/platform-entitlements.prisma, and
-- one back-relation each on platform_plan and platform_firm (PF-15's slot lines in platform.prisma; no column there
-- changes). Additive only: one enum, two new tables, their rules and Sample rows; no existing table, column or row changes.
--   * platform_plan_limit (the plan catalogue, no firm_id): one row per plan and metric (active individual cases, active
--     corporate cases, storage in MB). limit_value null = Unlimited, 0 = none allowed (SA-3-4); never negative. Seats keep
--     their one home, platform_plan.seats_limit (several suites set it directly). The app reads this table and never
--     writes it (writes are revoked from xr_data): the limits change only by a migration until PF-15 part 2's route for
--     our team (SA-3-43, SA-3-62). A plan with no row for a metric is read as 0 by the service (fail closed).
--   * platform_storage_over (a firm table, PF-12's wall): the firm's storage-over mark (SA-3-40): first_over_at,
--     alerted_at (once per episode), back_under_at, and the bytes and limit last measured. A row is never deleted (a
--     trigger refuses delete and truncate) and never moves firm.
--   * data: every plan that exists now gets its three rows, Sample values (the founder sets the real ones later):
--     solo 25 / 5 cases, 5 120 MB; team 150 / 30, 25 600 MB; firm 600 / 120, 102 400 MB; any other plan 0 (fail closed).
-- Every function carries the platform_ prefix (rows rev 15.2).
-- Rollback: DROP TABLE "platform_storage_over", "platform_plan_limit"; DROP TYPE "platform_limit_metric"; DROP FUNCTION
--   platform_storage_over_kept(); delete this folder's row from _prisma_migrations. No other table holds a reference to
--   either table, so nothing else changes.

-- CreateEnum
CREATE TYPE "platform_limit_metric" AS ENUM ('ACTIVE_INDIVIDUAL_CASES', 'ACTIVE_CORPORATE_CASES', 'STORAGE_MB');

-- CreateTable
CREATE TABLE "platform_plan_limit" (
    "plan_id" UUID NOT NULL,
    "metric" "platform_limit_metric" NOT NULL,
    "limit_value" INTEGER,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_plan_limit_pkey" PRIMARY KEY ("plan_id","metric")
);

-- CreateTable
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

-- AddForeignKey
ALTER TABLE "platform_plan_limit" ADD CONSTRAINT "platform_plan_limit_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "platform_plan"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
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
