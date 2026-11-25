-- R1.96 part 2 (design/briefs/R1.96-shape.md part 2; BACKLOG FO-7p "payment plans for earned fees", P-574 (5), kept by the
-- founder as P-578, a recorded departure from AG-06 v2.0's withdrawal; ledger rules only: no pay link, no autopay, no
-- card, no Stripe). Add-only: two new tables, one enum, their functions and triggers; nothing existing is changed.
--   * money_payment_plan: one issued invoice's plan, the amount it covers (what was still due when it was made, written
--     by the database), ACTIVE or CANCELLED; at most one ACTIVE plan per invoice. Never deleted; the only change is
--     ACTIVE → CANCELLED, by a person, with a reason (paid money is never touched: payments are not the plan's).
--   * money_instalment: the plan's instalments, positions 1..n, at most 12 (Sample), each a whole positive amount in the
--     plan's currency with a due date; written only in the transaction that wrote their plan; insert-only.
--   * At commit (a deferred constraint trigger): a plan has 2 to 12 instalments, at positions 1..n, with dates strictly
--     rising, and their amounts sum exactly to the plan's amount. Instalments are never stored as paid: what is paid is
--     derived from the invoice (payments in order), so cancelling leaves every payment as it was.
--   * Never on a deposit (P-567): not on a trust request (another table) and not on a deposit invoice (money_invoice.deposit,
--     FO-7w1's "On signing" bill).
-- Rollback: DROP TABLE "money_instalment", "money_payment_plan"; DROP TYPE "MoneyPlanStatus"; DROP FUNCTION
--   money_payment_plan_write(), money_payment_plan_change(), money_instalment_write(), money_payment_plan_sums(),
--   money_plan_no_delete().
CREATE TYPE "MoneyPlanStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "money_payment_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "currency" "MoneyCurrency" NOT NULL,
    "amount_minor" INTEGER NOT NULL DEFAULT 0,
    "status" "MoneyPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "cancel_reason" TEXT,

    CONSTRAINT "money_payment_plan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "money_payment_plan_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "money_payment_plan_cancel_check" CHECK ((("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)) AND ("cancelled_at" IS NULL) = ("cancelled_by" IS NULL) AND ("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)),
    CONSTRAINT "money_payment_plan_text_check" CHECK (money_text_ok("created_by", 200) AND ("cancelled_by" IS NULL OR money_text_ok("cancelled_by", 200)) AND ("cancel_reason" IS NULL OR money_text_ok("cancel_reason", 200)))
);
CREATE UNIQUE INDEX "money_payment_plan_firm_id_id_key" ON "money_payment_plan"("firm_id", "id");
CREATE INDEX "money_payment_plan_firm_id_invoice_id_idx" ON "money_payment_plan"("firm_id", "invoice_id");
CREATE UNIQUE INDEX "money_payment_plan_one_active" ON "money_payment_plan"("firm_id", "invoice_id") WHERE "status" = 'ACTIVE';
ALTER TABLE "money_payment_plan" ADD CONSTRAINT "money_payment_plan_firm_id_invoice_id_fkey" FOREIGN KEY ("firm_id", "invoice_id") REFERENCES "money_invoice"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "money_instalment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" "MoneyCurrency" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "money_instalment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "money_instalment_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "money_instalment_position_check" CHECK ("position" BETWEEN 1 AND 12)
);
CREATE UNIQUE INDEX "money_instalment_firm_id_plan_id_position_key" ON "money_instalment"("firm_id", "plan_id", "position");
ALTER TABLE "money_instalment" ADD CONSTRAINT "money_instalment_firm_id_plan_id_fkey" FOREIGN KEY ("firm_id", "plan_id") REFERENCES "money_payment_plan"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A new plan: on an issued invoice that is not a deposit, in its currency, while something is due; the amount it covers is the database's
-- (what is due now, money_invoice_due), the time and the status too. The invoice row is locked first, so a payment or
-- credit note at the same moment waits for the plan or the plan for it.
CREATE FUNCTION money_payment_plan_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i record; due bigint;
BEGIN
  SELECT x.issued_at, x.currency, x.deposit INTO i FROM "money_invoice" x WHERE x.firm_id = NEW.firm_id AND x.id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'money_payment_plan: no such invoice in this firm' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF i.issued_at IS NULL THEN
    RAISE EXCEPTION 'money_payment_plan: a plan is only for an issued invoice' USING ERRCODE = 'check_violation';
  END IF;
  IF i.deposit THEN
    RAISE EXCEPTION 'money_payment_plan: a deposit invoice is never paid by a plan (P-567)' USING ERRCODE = 'check_violation';
  END IF;
  IF i.currency <> NEW.currency THEN
    RAISE EXCEPTION 'money_payment_plan: a plan is in its invoice''s currency (%)', i.currency USING ERRCODE = 'check_violation';
  END IF;
  due := money_invoice_due(NEW.firm_id, NEW.invoice_id);
  IF due <= 0 THEN
    RAISE EXCEPTION 'money_payment_plan: nothing is due on this invoice, so there is nothing to plan' USING ERRCODE = 'check_violation';
  END IF;
  NEW.amount_minor := due; NEW.status := 'ACTIVE'; NEW.created_at := now();
  NEW.cancelled_by := NULL; NEW.cancelled_at := NULL; NEW.cancel_reason := NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER "money_payment_plan_write" BEFORE INSERT ON "money_payment_plan" FOR EACH ROW EXECUTE FUNCTION money_payment_plan_write();

-- The only change: ACTIVE → CANCELLED with who, a reason and the database's time; every other column never changes.
CREATE FUNCTION money_payment_plan_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.firm_id, NEW.invoice_id, NEW.currency, NEW.amount_minor, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.firm_id, OLD.invoice_id, OLD.currency, OLD.amount_minor, OLD.created_by, OLD.created_at)
     OR OLD.status <> 'ACTIVE' OR NEW.status <> 'CANCELLED' OR NEW.cancelled_by IS NULL OR NEW.cancel_reason IS NULL THEN
    RAISE EXCEPTION 'money_payment_plan: a plan only changes once, from ACTIVE to CANCELLED, by a person with a reason' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.cancelled_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER "money_payment_plan_change" BEFORE UPDATE ON "money_payment_plan" FOR EACH ROW EXECUTE FUNCTION money_payment_plan_change();
CREATE FUNCTION money_plan_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%: payment plans and their instalments are never removed (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER "money_payment_plan_no_delete" BEFORE DELETE ON "money_payment_plan" FOR EACH ROW EXECUTE FUNCTION money_plan_no_delete();
CREATE TRIGGER "money_payment_plan_no_truncate" BEFORE TRUNCATE ON "money_payment_plan" FOR EACH STATEMENT EXECUTE FUNCTION money_plan_no_delete();
CREATE TRIGGER "money_instalment_no_change" BEFORE UPDATE OR DELETE ON "money_instalment" FOR EACH ROW EXECUTE FUNCTION money_plan_no_delete();
CREATE TRIGGER "money_instalment_no_truncate" BEFORE TRUNCATE ON "money_instalment" FOR EACH STATEMENT EXECUTE FUNCTION money_plan_no_delete();

-- An instalment: of an ACTIVE plan written in this same transaction (so a plan's instalments are fixed when it commits),
-- in the plan's currency, due today or later.
CREATE FUNCTION money_instalment_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p record;
BEGIN
  SELECT x.status, x.currency, x.created_at INTO p FROM "money_payment_plan" x WHERE x.firm_id = NEW.firm_id AND x.id = NEW.plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'money_instalment: no such plan in this firm' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF p.status <> 'ACTIVE' OR p.created_at <> now() THEN
    RAISE EXCEPTION 'money_instalment: instalments are written with their plan, never added later' USING ERRCODE = 'check_violation';
  END IF;
  IF p.currency <> NEW.currency THEN
    RAISE EXCEPTION 'money_instalment: an instalment is in its plan''s currency (%)', p.currency USING ERRCODE = 'check_violation';
  END IF;
  -- Today or later, by the UTC day the API uses too (Sample: the firm's own time zone is not read yet, facts.ts dayOf).
  IF NEW.due_date < (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'money_instalment: an instalment is due today or later (% given)', NEW.due_date USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER "money_instalment_write" BEFORE INSERT ON "money_instalment" FOR EACH ROW EXECUTE FUNCTION money_instalment_write();

-- At commit: 2 to 12 instalments at positions 1..n, dates strictly rising, summing exactly to the plan's amount.
CREATE FUNCTION money_payment_plan_sums() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid uuid; fid uuid; p record; n integer; maxpos integer; total bigint; rising boolean;
BEGIN
  IF TG_TABLE_NAME = 'money_payment_plan' THEN pid := NEW.id; ELSE pid := NEW.plan_id; END IF;
  fid := NEW.firm_id;
  SELECT x.amount_minor INTO p FROM "money_payment_plan" x WHERE x.firm_id = fid AND x.id = pid;
  SELECT count(*), coalesce(max(position), 0), coalesce(sum(amount_minor), 0) INTO n, maxpos, total FROM "money_instalment" WHERE firm_id = fid AND plan_id = pid;
  SELECT coalesce(bool_and(nxt IS NULL OR nxt > due_date), true) INTO rising FROM (SELECT due_date, lead(due_date) OVER (ORDER BY position) AS nxt FROM "money_instalment" WHERE firm_id = fid AND plan_id = pid) s;
  IF n < 2 OR n > 12 OR maxpos <> n THEN
    RAISE EXCEPTION 'money_payment_plan: a plan has 2 to 12 instalments, numbered 1 to n (% given)', n USING ERRCODE = 'check_violation';
  END IF;
  IF NOT rising THEN
    RAISE EXCEPTION 'money_payment_plan: each instalment is due after the one before it' USING ERRCODE = 'check_violation';
  END IF;
  IF total <> p.amount_minor THEN
    RAISE EXCEPTION 'money_payment_plan: the instalments add up to % but the plan covers % (difference %)', total, p.amount_minor, p.amount_minor - total USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "money_payment_plan_sums" AFTER INSERT ON "money_payment_plan" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION money_payment_plan_sums();
CREATE CONSTRAINT TRIGGER "money_instalment_sums" AFTER INSERT ON "money_instalment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION money_payment_plan_sums();

-- PF-12's wall on both (forced policy naming the session's firm; the firm-first gate before the area's own triggers);
-- every trigger function runs as xr_wall_reader (tests/check_pf12_walls.ts).
ALTER TABLE "money_payment_plan" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_payment_plan" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "money_payment_plan" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER TABLE "money_instalment" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "money_instalment" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "money_instalment" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION money_payment_plan_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_payment_plan_write() OWNER TO xr_wall_reader;
ALTER FUNCTION money_payment_plan_change() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_payment_plan_change() OWNER TO xr_wall_reader;
ALTER FUNCTION money_plan_no_delete() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_plan_no_delete() OWNER TO xr_wall_reader;
ALTER FUNCTION money_instalment_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_instalment_write() OWNER TO xr_wall_reader;
ALTER FUNCTION money_payment_plan_sums() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION money_payment_plan_sums() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
