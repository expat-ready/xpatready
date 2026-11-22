-- PF-4s part 1 (map rows 5 and 93; SA-7-1, SA-7-2, SA-7-3, SA-7-11, SA-7-14, SA-7-20, SA7-D5, SA7-D8, Appendix A of
-- SA-07 v2.17, 17 Oct 2026; P-600): ExpatReady's own staff, their six fixed roles, the system/* keys each role holds and
-- the audit lines of their calls. Additive: two enums, five new tables, two functions, three triggers, five policies and
-- the seed; no existing table, function or row is changed. No table has a firm_id (SA-7-1).
--
-- Walls: none of these is under PF-12's firm policy (no firm_id). Each is instead closed to a session that acts for a
-- firm: FORCE row-level security with one policy, platform_session_firm() IS NULL, so a firm's request reads and writes
-- nothing here, whatever its code does. The bypass role (PF-12) passes, as everywhere.
-- Audit lines are insert-only at the database (no UPDATE, DELETE or TRUNCATE for anyone), as audit_event (AUD-1a), and
-- each names a real staff member (foreign key). The roles and keys are read-only to the app's roles (a release changes them).
--
-- Seed: the six roles with SA7-D8's codes and final display names, and for each system/* key a Release 1 route uses, the
-- roles Appendix A ticks on the row named beside it (columns Own · Adm · Sup · Bil · Con · Aud). The key-to-row mapping
-- is the tech lead's (SA-07 Appendix A: "The tech lead maps each row to the system/* keys"; Sample until confirmed).
-- A key with no Appendix A row is not seeded: the BACKLOG row's `system/support:reply` has none, so no role holds it.
-- The row's `system/security:lock` is seeded under SA-07's own names, system/firm:suspend and system/firm:reinstate.
--
-- Rollback (by hand): DROP the five tables (CASCADE drops their triggers and policies), the two functions and the two enums.

-- CreateEnum
CREATE TYPE "PlatSystemStaffStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PlatSystemAuditOutcome" AS ENUM ('ALLOWED', 'REFUSED');

-- CreateTable
CREATE TABLE "plat_system_role" (
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,

    CONSTRAINT "plat_system_role_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "plat_system_staff" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "PlatSystemStaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "identity_subject" TEXT,
    "sessions_ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_system_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_system_role_grant" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "role_code" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,

    CONSTRAINT "plat_system_role_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_system_role_permission" (
    "role_code" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,

    CONSTRAINT "plat_system_role_permission_pkey" PRIMARY KEY ("role_code","permission_key")
);

-- CreateTable
CREATE TABLE "plat_system_audit" (
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_kind" TEXT NOT NULL DEFAULT 'expatready_staff',
    "staff_id" UUID NOT NULL,
    "staff_name" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "target" JSONB NOT NULL,
    "outcome" "PlatSystemAuditOutcome" NOT NULL,
    "code" TEXT,
    "reason" TEXT,
    "request_id" TEXT NOT NULL,
    "device" TEXT,

    CONSTRAINT "plat_system_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plat_system_staff_email_key" ON "plat_system_staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "plat_system_staff_identity_subject_key" ON "plat_system_staff"("identity_subject");

-- CreateIndex
CREATE INDEX "plat_system_role_grant_staff_id_idx" ON "plat_system_role_grant"("staff_id");

-- CreateIndex
CREATE INDEX "plat_system_audit_staff_id_at_idx" ON "plat_system_audit"("staff_id", "at");

-- AddForeignKey
ALTER TABLE "plat_system_role_grant" ADD CONSTRAINT "plat_system_role_grant_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "plat_system_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_system_role_grant" ADD CONSTRAINT "plat_system_role_grant_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "plat_system_role"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_system_role_permission" ADD CONSTRAINT "plat_system_role_permission_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "plat_system_role"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_system_audit" ADD CONSTRAINT "plat_system_audit_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "plat_system_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Rules Prisma cannot say.
-- The six role codes of SA7-D8, and no other.
ALTER TABLE "plat_system_role" ADD CONSTRAINT "plat_system_role_code_six" CHECK ("code" IN ('platform-owner', 'platform-admin', 'platform-support', 'platform-billing-ops', 'platform-content-publisher', 'platform-auditor'));
ALTER TABLE "plat_system_role" ADD CONSTRAINT "plat_system_role_name_set" CHECK (btrim("display_name") <> '');
-- Roles hold system/* keys only (SA-7-11, SA-6-4: the firm plane's agent/* keys never mix in).
ALTER TABLE "plat_system_role_permission" ADD CONSTRAINT "plat_system_role_permission_system_key" CHECK ("permission_key" ~ '^system/[a-z][a-z0-9-]*:[a-z][a-z0-9.-]*$');
-- An email is stored lower-case with no space; a name is never blank.
ALTER TABLE "plat_system_staff" ADD CONSTRAINT "plat_system_staff_email_shape" CHECK ("email" = lower("email") AND "email" ~ '^[^[:space:]@]+@[^[:space:]@]+$');
ALTER TABLE "plat_system_staff" ADD CONSTRAINT "plat_system_staff_name_set" CHECK (btrim("display_name") <> '');
-- One open grant per person and role; a grant ends after it starts.
CREATE UNIQUE INDEX "plat_system_role_grant_open_once" ON "plat_system_role_grant"("staff_id", "role_code") WHERE "ended_at" IS NULL;
ALTER TABLE "plat_system_role_grant" ADD CONSTRAINT "plat_system_role_grant_ends_later" CHECK ("ended_at" IS NULL OR "ended_at" >= "granted_at");
-- An audit line names ExpatReady staff, always (SA-7-3), with a request id (SA-7-20); a refusal carries its code.
ALTER TABLE "plat_system_audit" ADD CONSTRAINT "plat_system_audit_actor_kind" CHECK ("actor_kind" = 'expatready_staff');
ALTER TABLE "plat_system_audit" ADD CONSTRAINT "plat_system_audit_facts_set" CHECK (btrim("staff_name") <> '' AND btrim("request_id") <> '' AND btrim("route") <> '' AND btrim("method") <> '');
ALTER TABLE "plat_system_audit" ADD CONSTRAINT "plat_system_audit_refusal_code" CHECK (("outcome" = 'REFUSED') = ("code" IS NOT NULL));

-- Audit lines are insert-only.
CREATE FUNCTION plat_system_audit_insert_only() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'plat_system_audit_insert_only: an audit line of our staff is never changed or removed (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER "plat_system_audit_insert_only" BEFORE UPDATE OR DELETE ON "plat_system_audit" FOR EACH ROW EXECUTE FUNCTION plat_system_audit_insert_only();
CREATE TRIGGER "plat_system_audit_no_truncate" BEFORE TRUNCATE ON "plat_system_audit" FOR EACH STATEMENT EXECUTE FUNCTION plat_system_audit_insert_only();

-- A staff member is never deleted (SA7-D58: Deactivated is the end state, the name is kept for the audit trail).
CREATE FUNCTION plat_system_staff_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'plat_system_staff_kept: a staff member is deactivated, never deleted (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER "plat_system_staff_kept" BEFORE DELETE ON "plat_system_staff" FOR EACH ROW EXECUTE FUNCTION plat_system_staff_kept();

-- Closed to every session that acts for a firm (SA-7-1).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plat_system_role', 'plat_system_staff', 'plat_system_role_grant', 'plat_system_role_permission', 'plat_system_audit'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "plat_system_no_firm" ON %I USING (platform_session_firm() IS NULL) WITH CHECK (platform_session_firm() IS NULL)', t);
  END LOOP;
END $$;

-- The roles and their keys change only by a release (SA7-D2: no editor): the app's roles (xr_data: xr_app and the bypass
-- role) read them and never write them (breaker m3 on #2927). The migration role, which owns them, seeds them below.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "plat_system_role", "plat_system_role_permission" FROM xr_data;

-- Seed: the six roles (SA7-D8).
INSERT INTO "plat_system_role" ("code", "display_name") VALUES
  ('platform-owner', 'Platform Owner'), ('platform-admin', 'Admin'), ('platform-support', 'Support'),
  ('platform-billing-ops', 'Billing'), ('platform-content-publisher', 'Content publisher'), ('platform-auditor', 'Auditor');

-- Seed: each key's roles, from the Appendix A row named on its line.
INSERT INTO "plat_system_role_permission" ("permission_key", "role_code")
SELECT k.key, r.code FROM (VALUES
  -- Staff (SA-7): "Staff list and detail" — Own, Adm, Aud
  ('system/platform-user:list',   ARRAY['platform-owner', 'platform-admin', 'platform-auditor']),
  ('system/platform-user:show',   ARRAY['platform-owner', 'platform-admin', 'platform-auditor']),
  -- "Manage staff — invite, give / remove roles (not Owner), countries, reactivate, Reset MFA" — Own only (SA7-D5)
  ('system/platform-user:manage', ARRAY['platform-owner']),
  -- "Deactivate · require a password change · end another person's session — Admin not on an Owner or other privileged
  -- target" — Own, Adm (SA7-D5; the key name is the tech lead's mapping, SA-07 §10)
  ('system/platform-user:remove', ARRAY['platform-owner', 'platform-admin']),
  -- Firms (SA-2): "Firm list and detail (read-only)" — Own, Adm, Sup, Bil, Aud
  ('system/firm:read',            ARRAY['platform-owner', 'platform-admin', 'platform-support', 'platform-billing-ops', 'platform-auditor']),
  -- "Create firms · sign-up links (create, revoke, with approved discount) · edit contact, address, billing email, web
  -- address · resend owner invitation" — Own, Adm
  ('system/signup-link:manage',   ARRAY['platform-owner', 'platform-admin']),
  ('system/firm:address',         ARRAY['platform-owner', 'platform-admin']),
  -- "Apply and lift a security lock (SA7-D53)" — Own only (the row's system/security:lock, under SA-07's names)
  ('system/firm:suspend',         ARRAY['platform-owner']),
  ('system/firm:reinstate',       ARRAY['platform-owner']),
  -- Plans and billing (SA-3, SA-4): "For a firm: change plan or billing period, cancel / undo, apply or remove an approved
  -- discount (SA7-D50)" — Own, Bil
  ('system/billing:manage',       ARRAY['platform-owner', 'platform-billing-ops']),
  -- "Approved-discount list · refunds · monthly written-off report" — Own, Bil
  ('system/billing:refund',       ARRAY['platform-owner', 'platform-billing-ops'])
) AS k(key, roles) CROSS JOIN LATERAL unnest(k.roles) AS r(code);
