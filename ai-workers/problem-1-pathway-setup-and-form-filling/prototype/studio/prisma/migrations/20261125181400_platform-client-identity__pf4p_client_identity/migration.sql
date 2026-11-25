-- PF-4p part 1 (R1.62, map row 62; P-584 (4); AG-15-3, AG-15-38; schema file prisma/schema/platform-client-identity.prisma,
-- owner Lead B (platform), built by the screens lane): clients' own sign-in accounts and their invitations. Additive: one
-- enum, two new tables, their keys, checks, triggers, one definer lookup and PF-12's wall on both; nothing existing changes.
--   * platform_client_account: one per (firm, person) and one per (firm, email); the person is the firm's own fo_person
--     (trigger pf4p_client_person_ok: an account can never name another firm's person, and its person never changes). The email is
--     stored lower case, NFC, with no space or control character (a check). Never deleted: a revoked account is kept
--     (AG-15-6; delete and truncate refused by trigger pf4p_client_account_kept).
--   * platform_client_invitation: (firm_id, account_id) → the account; the token's SHA-256 only (64 lower-case hex),
--     expiring after its creation; used and voided at most once each (the code writes them, part 2).
--   * platform_client_account_firm(account): the client guard's one narrow lookup (as PF-12b part 2's doors): an account
--     id → its firm id, nothing else; the rest of the request then runs as that firm under PF-12's wall.
--   * PF-12's wall on both (forced policy naming the session's firm; the firm-first gate). New, empty tables: no data
--     statement runs. Rollback: rollback.sql in this folder.
CREATE TYPE "PlatClientAccountStatus" AS ENUM ('NOT_INVITED', 'PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TABLE "platform_client_account" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "status" "PlatClientAccountStatus" NOT NULL DEFAULT 'NOT_INVITED',
    "last_sign_in_at" TIMESTAMPTZ,
    "sessions_ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_client_account_pkey" PRIMARY KEY ("id"),
    -- Lower case, NFC, no space of any kind (a no-break space included) and no control character: one email, one spelling.
    CONSTRAINT "platform_client_account_email_ok" CHECK ("email" = lower("email") AND "email" IS NFC NORMALIZED AND "email" !~ '[[:space:][:cntrl:]\u00a0\u2007\u202f\u200b\ufeff]' AND "email" ~ '^[^@]+@[^@]+$' AND length("email") <= 320)
);
CREATE UNIQUE INDEX "platform_client_account_firm_id_id_key" ON "platform_client_account"("firm_id", "id");
CREATE UNIQUE INDEX "platform_client_account_firm_id_person_id_key" ON "platform_client_account"("firm_id", "person_id");
CREATE UNIQUE INDEX "platform_client_account_firm_id_email_key" ON "platform_client_account"("firm_id", "email");
-- The person is the firm's own fo_person, and never changes. A trigger, not a foreign key: a key into fo_person needs a
-- Prisma relation and a back-relation line in front-office-sales.prisma (another owner's file), and a key in SQL only
-- would be dropped by `prisma migrate diff` (check_pf0p_ports). fo_person rows are never deleted (FO-9b merges keep a
-- tombstone), so checking at insert holds (deleting an fo_person is the
-- front-office area's rule; an account outliving its person reads with no name: listed on PR #3647, breaker m1). Owned by xr_wall_reader (PF-12's rule for trigger functions; below), it checks the
-- person row's firm itself.
CREATE FUNCTION pf4p_client_person_ok() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.person_id IS DISTINCT FROM OLD.person_id OR NEW.firm_id IS DISTINCT FROM OLD.firm_id) THEN
    RAISE EXCEPTION 'platform_client_account_person_fixed: a client account''s firm and person never change' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM fo_person p WHERE p.id = NEW.person_id AND p.firm_id = NEW.firm_id) THEN
    RAISE EXCEPTION 'platform_client_account_person_fkey: the person is not one of this firm''s people' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "pf4p_client_person_ok" BEFORE INSERT OR UPDATE ON "platform_client_account" FOR EACH ROW EXECUTE FUNCTION pf4p_client_person_ok();
-- An account is never deleted: a revoked one is kept (AG-15-6). DELETE and TRUNCATE are refused (breaker m8).
CREATE FUNCTION pf4p_client_account_kept() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'platform_client_account_kept: a client account is never deleted; revoke it instead' USING ERRCODE = 'check_violation';
END $fn$;
CREATE TRIGGER "pf4p_client_account_kept" BEFORE DELETE ON "platform_client_account" FOR EACH ROW EXECUTE FUNCTION pf4p_client_account_kept();
CREATE TRIGGER "pf4p_client_account_no_truncate" BEFORE TRUNCATE ON "platform_client_account" FOR EACH STATEMENT EXECUTE FUNCTION pf4p_client_account_kept();
REVOKE ALL ON FUNCTION pf4p_client_account_kept() FROM PUBLIC;
REVOKE ALL ON FUNCTION pf4p_client_person_ok() FROM PUBLIC;
CREATE TABLE "platform_client_invitation" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "voided_at" TIMESTAMPTZ,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_client_invitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_client_invitation_hash_ok" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "platform_client_invitation_expiry_ok" CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "platform_client_invitation_token_hash_key" ON "platform_client_invitation"("token_hash");
CREATE INDEX "platform_client_invitation_firm_id_account_id_idx" ON "platform_client_invitation"("firm_id", "account_id");
ALTER TABLE "platform_client_invitation" ADD CONSTRAINT "platform_client_invitation_firm_id_account_id_fkey" FOREIGN KEY ("firm_id", "account_id") REFERENCES "platform_client_account"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- The client guard's door: an account id → its firm (firm id only; an unknown id is null). As PF-12b part 2's lookups.
CREATE FUNCTION platform_client_account_firm(account uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT a.firm_id FROM platform_client_account a WHERE a.id = $1 $fn$;
-- PF-12's wall (forced policy naming the session's firm; the firm-first gate).
ALTER TABLE "platform_client_account" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_client_account" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "platform_client_invitation" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_client_invitation" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_client_account" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_client_invitation" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
-- PF-8b F4 (RDS): a non-superuser may hand a function to xr_wall_reader only while it holds CREATE on public.
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION platform_client_account_firm(uuid) OWNER TO xr_wall_reader;
-- PF-12's rule for a firm table's trigger functions: they run as xr_wall_reader (tests/check_pf12_walls.ts).
ALTER FUNCTION pf4p_client_person_ok() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION pf4p_client_person_ok() OWNER TO xr_wall_reader;
ALTER FUNCTION pf4p_client_account_kept() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION pf4p_client_account_kept() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
REVOKE ALL ON FUNCTION platform_client_account_firm(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_client_account_firm(uuid) TO xr_app, xr_staff_bypass;
