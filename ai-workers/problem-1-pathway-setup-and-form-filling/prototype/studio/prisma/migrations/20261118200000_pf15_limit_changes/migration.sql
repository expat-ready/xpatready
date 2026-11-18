-- migration · PF-15 part 2 (brief design/lead-b-briefs/PF-15.md part 2, DW9; SA-3-43, SA-3-62). Schema:
-- prisma/schema/platform-entitlements.prisma (+ one back-relation each in platform.prisma). Additive, plus one function
-- replaced (platform_entitlement_limit takes the clock). The stamp is set at PR time (P-600).
--   * platform_limit_change: our team's change of one plan's limit on one metric (a catalogue: no firm_id, read by every
--     firm). Insert-only. Its insert is the ONLY way a limit changes after a migration: a definer trigger writes the new
--     value to platform_plan_limit (or platform_plan.seats_limit) and keeps the old one on the row.
--   * platform_limit_change_firm: for a LOWER limit, each firm then live on the plan and the first renewal at least 30
--     days after approval (SA-3-43), stored, never recomputed. Behind PF-12's wall. Insert-only.
--   * platform_entitlement_limit(firm, metric, hard_since, now): as before, plus (a) until its effective_at a firm keeps
--     the value it had before the oldest lowering still pending for it (its plan version), and (b) a firm session asking
--     about another firm gets no row (the Lead's P-423 read of #2130: no cross-firm read from a firm's session).
-- Renewal (Unconfirmed, question to Lead B): platform_subscription keeps no billing period and no Stripe period end on
-- main, so a firm renews monthly from current_period_end, else trial_ends_at, else created_at.
-- Rollback (as the migration's owner): DROP TABLE "platform_limit_change_firm", "platform_limit_change"; DROP FUNCTION
--   platform_limit_change_apply(), platform_limit_change_kept(), platform_entitlement_limit(text, text, timestamptz, timestamptz);
--   re-run the CREATE FUNCTION platform_entitlement_limit(text, text, timestamptz) block of 20261118100000_pf15_plan_limits
--   with its OWNER, REVOKE and GRANT lines; delete this folder's row from _prisma_migrations. Limit values a change wrote
--   stay as written (the change rows hold each old value).

CREATE TABLE "platform_limit_change" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "old_value" INTEGER,
    "new_value" INTEGER,
    "lowered" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "approved_by" TEXT NOT NULL,
    "approved_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_limit_change_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_limit_change_firm" (
    "change_id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "effective_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_limit_change_firm_pkey" PRIMARY KEY ("change_id","firm_id")
);

CREATE INDEX "platform_limit_change_plan_id_metric_idx" ON "platform_limit_change"("plan_id", "metric");
CREATE INDEX "platform_limit_change_firm_firm_id_idx" ON "platform_limit_change_firm"("firm_id");

ALTER TABLE "platform_limit_change" ADD CONSTRAINT "platform_limit_change_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "platform_plan"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "platform_limit_change_firm" ADD CONSTRAINT "platform_limit_change_firm_change_id_fkey" FOREIGN KEY ("change_id") REFERENCES "platform_limit_change"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "platform_limit_change_firm" ADD CONSTRAINT "platform_limit_change_firm_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ------------------------------------------------------------------------------------------ rules Prisma cannot say
ALTER TABLE "platform_limit_change" ADD CONSTRAINT "platform_limit_change_values_ok" CHECK (
  "metric" IN ('SEATS', 'ACTIVE_INDIVIDUAL_CASES', 'ACTIVE_CORPORATE_CASES', 'STORAGE_MB')
  AND ("new_value" IS NULL OR "new_value" >= 0) AND ("metric" <> 'SEATS' OR "new_value" >= 1)
  AND length(btrim("reason")) BETWEEN 3 AND 500 AND "approved_by" ~ '^(staff|system|seed):');

-- Both are records: never changed, never removed.
CREATE FUNCTION platform_limit_change_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION '%: a limit change is a record, never changed or removed', TG_TABLE_NAME USING ERRCODE = '23514';
END $fn$;
CREATE TRIGGER "platform_limit_change_kept" BEFORE UPDATE OR DELETE ON "platform_limit_change" FOR EACH ROW EXECUTE FUNCTION platform_limit_change_kept();
CREATE TRIGGER "platform_limit_change_no_truncate" BEFORE TRUNCATE ON "platform_limit_change" FOR EACH STATEMENT EXECUTE FUNCTION platform_limit_change_kept();
CREATE TRIGGER "platform_limit_change_firm_kept" BEFORE UPDATE OR DELETE ON "platform_limit_change_firm" FOR EACH ROW EXECUTE FUNCTION platform_limit_change_kept();
CREATE TRIGGER "platform_limit_change_firm_no_truncate" BEFORE TRUNCATE ON "platform_limit_change_firm" FOR EACH STATEMENT EXECUTE FUNCTION platform_limit_change_kept();

-- The change itself (SA-3-43, SA-3-62): under the plan's row lock, keep the old value on the row, write the new one,
-- and for a lower limit store each live firm's effective date (its first monthly renewal at least 30 days after
-- approval). No downgrade check runs and nothing is deleted. Owned by xr_wall_reader (it writes every firm's row).
CREATE FUNCTION platform_limit_change_apply() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE cur integer;
BEGIN
  PERFORM 1 FROM platform_plan WHERE id = NEW.plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_limit_change: no such plan' USING ERRCODE = '23503'; END IF;
  IF NEW.metric = 'SEATS' THEN
    IF NEW.new_value IS NULL THEN RAISE EXCEPTION 'platform_limit_change: seats are never Unlimited' USING ERRCODE = '23514'; END IF;
    SELECT seats_limit INTO cur FROM platform_plan WHERE id = NEW.plan_id;
    UPDATE platform_plan SET seats_limit = NEW.new_value WHERE id = NEW.plan_id;
  ELSE
    SELECT limit_value INTO cur FROM platform_plan_limit WHERE plan_id = NEW.plan_id AND metric::text = NEW.metric;
    IF NOT FOUND THEN cur := 0; END IF;   -- no row reads as 0 (part 1a)
    INSERT INTO platform_plan_limit (plan_id, metric, limit_value, updated_at) VALUES (NEW.plan_id, NEW.metric::platform_limit_metric, NEW.new_value, NEW.approved_at)
      ON CONFLICT (plan_id, metric) DO UPDATE SET limit_value = EXCLUDED.limit_value, updated_at = EXCLUDED.updated_at;
  END IF;
  IF cur IS NOT DISTINCT FROM NEW.new_value THEN RAISE EXCEPTION 'platform_limit_change: the limit is already %', coalesce(cur::text, 'Unlimited') USING ERRCODE = '23514'; END IF;
  NEW.old_value := cur;
  NEW.lowered := NEW.new_value IS NOT NULL AND (cur IS NULL OR NEW.new_value < cur);
  RETURN NEW;
END $fn$;
CREATE TRIGGER "platform_limit_change_apply" BEFORE INSERT ON "platform_limit_change" FOR EACH ROW EXECUTE FUNCTION platform_limit_change_apply();

CREATE FUNCTION platform_limit_change_firms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE s record; at timestamptz; target timestamptz; n integer;
BEGIN
  IF NOT NEW.lowered THEN RETURN NULL; END IF;   -- a raise applies to every firm at once (SA-3-43: additions)
  target := NEW.approved_at + interval '30 days';
  FOR s IN SELECT firm_id, coalesce(current_period_end, trial_ends_at, created_at) AS anchor FROM platform_subscription WHERE plan_id = NEW.plan_id AND status <> 'ENDED' LOOP
    n := 0; at := s.anchor;   -- the anchor plus whole months (no day drift: 31 Jan, 28 Feb, 31 Mar)
    WHILE at < target LOOP n := n + 1; at := s.anchor + n * interval '1 month'; END LOOP;
    INSERT INTO platform_limit_change_firm (change_id, firm_id, effective_at) VALUES (NEW.id, s.firm_id, at);
  END LOOP;
  RETURN NULL;
END $fn$;
CREATE TRIGGER "platform_limit_change_firms" AFTER INSERT ON "platform_limit_change" FOR EACH ROW EXECUTE FUNCTION platform_limit_change_firms();

-- The app writes a change row only (it inserts; the triggers do the rest); it never writes a firm row itself.
REVOKE UPDATE, DELETE, TRUNCATE ON "platform_limit_change" FROM xr_data;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "platform_limit_change_firm" FROM xr_data;

-- ------------------------------------------------------------------------------------------- PF-12's walls (#1910)
ALTER TABLE "platform_limit_change_firm" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_limit_change_firm" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_limit_change_firm" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER FUNCTION platform_limit_change_kept() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION platform_limit_change_kept() OWNER TO xr_wall_reader;
ALTER FUNCTION platform_limit_change_apply() OWNER TO xr_wall_reader;
ALTER FUNCTION platform_limit_change_firms() OWNER TO xr_wall_reader;

-- ------------------------------------------------------------------------------------------- the one limit read
DROP FUNCTION platform_entitlement_limit(text, text, timestamptz);
CREATE FUNCTION platform_entitlement_limit(p_firm text, p_metric text, p_hard_since timestamptz, p_now timestamptz)
  RETURNS TABLE (firm_id uuid, plan_code text, plan_name text, seats integer, limit_value integer, has_row boolean, storage_hard boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ WITH f AS (
            SELECT f.id FROM platform_firm f
            WHERE (f.id::text = lower(p_firm) OR f.key = p_firm)
              AND (platform_session_firm() IS NULL OR platform_session_firm() = f.id)   -- a firm's session reads only itself
            ORDER BY (f.id::text = lower(p_firm)) DESC LIMIT 1
          ), cur AS (
            SELECT f.id, p.id AS plan_id, p.code, p.name, p.seats_limit, l.limit_value, l.plan_id IS NOT NULL AS has_row
            FROM f LEFT JOIN platform_subscription s ON s.firm_id = f.id AND s.status <> 'ENDED'   -- one live row (index platform_subscription_one_live)
            LEFT JOIN platform_plan p ON p.id = s.plan_id
            LEFT JOIN platform_plan_limit l ON l.plan_id = p.id AND l.metric::text = p_metric
          ), kept AS (   -- SA-3-43: the value before the oldest lowering not yet in effect for this firm on this plan
            SELECT c.old_value FROM cur JOIN platform_limit_change c ON c.plan_id = cur.plan_id AND c.metric = p_metric AND c.lowered
            JOIN platform_limit_change_firm r ON r.change_id = c.id AND r.firm_id = cur.id AND r.effective_at > p_now
            ORDER BY c.approved_at, c.created_at LIMIT 1
          )
          SELECT cur.id, cur.code, cur.name,
            CASE WHEN p_metric = 'SEATS' AND EXISTS (SELECT 1 FROM kept) THEN greatest(cur.seats_limit, (SELECT old_value FROM kept)) ELSE cur.seats_limit END,
            CASE WHEN p_metric <> 'SEATS' AND EXISTS (SELECT 1 FROM kept) THEN
              CASE WHEN cur.limit_value IS NULL OR (SELECT old_value FROM kept) IS NULL THEN NULL ELSE greatest(cur.limit_value, (SELECT old_value FROM kept)) END
            ELSE cur.limit_value END,
            cur.has_row OR (p_metric <> 'SEATS' AND EXISTS (SELECT 1 FROM kept)),
            COALESCE((SELECT o.back_under_at IS NULL AND o.first_over_at <= p_hard_since FROM platform_storage_over o WHERE o.firm_id = cur.id), false)
          FROM cur $fn$;
ALTER FUNCTION platform_entitlement_limit(text, text, timestamptz, timestamptz) OWNER TO xr_wall_reader;
REVOKE ALL ON FUNCTION platform_entitlement_limit(text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_entitlement_limit(text, text, timestamptz, timestamptz) TO xr_app;
