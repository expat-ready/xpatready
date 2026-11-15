-- PF-5 part 1 (contracts §7 §1.1; P-566; Lead B's rulings on #1815, comment 6891947481): self-serve sign-up's terms and
-- its pending row. Schema: prisma/schema/platform.prisma (PF-5's lines and its back-relation slot lines). Additive only:
-- three new tables, two enums and their rules; no existing table, column, trigger or row changes.
--   * platform_terms_version: the published versions of the terms of service, privacy notice and data-processing terms
--     (a catalogue, no firm_id); insert-only. Seeded with one Sample version of each (wording Sample; Unconfirmed: no
--     counsel).
--   * platform_terms_acceptance: who accepted which version when (A46 row 100), keyed on (firm_id, staff_id); insert-only.
--   * platform_signup_pending: a sign-up waiting for its email verification; no firm_id (no firm exists yet), no
--     password; one live row per email (partial unique index over the unused rows); its one change is used_at, set
--     once; a row is removed only after it expires (the sweep, or a new sign-up for the same email); it lives at most
--     24 hours (Sample); email lower case; the terms it names exist.
-- Every function carries the platform_ prefix (rows rev 15.2).
-- Rollback: DROP TABLE "platform_terms_acceptance", "platform_signup_pending", "platform_terms_version"; DROP TYPE
--   "PlatformTermsKind", "PlatformBillingPeriod"; DROP FUNCTION platform_terms_insert_only(),
--   platform_signup_pending_rules(); delete this folder's row from _prisma_migrations.

-- CreateEnum
CREATE TYPE "PlatformTermsKind" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_NOTICE', 'DATA_PROCESSING');

-- CreateEnum
CREATE TYPE "PlatformBillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');


-- CreateTable
CREATE TABLE "platform_terms_version" (
    "id" UUID NOT NULL,
    "kind" "PlatformTermsKind" NOT NULL,
    "version" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_terms_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_terms_acceptance" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_terms_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_signup_pending" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "firm_name" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "plan_code" TEXT NOT NULL,
    "period" "PlatformBillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "web_address" TEXT,
    "identity_subject" TEXT NOT NULL,
    "terms_version_ids" UUID[],
    "terms_accepted_at" TIMESTAMPTZ NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,

    CONSTRAINT "platform_signup_pending_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_terms_version_kind_published_at_idx" ON "platform_terms_version"("kind", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_terms_version_kind_version_key" ON "platform_terms_version"("kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "platform_terms_acceptance_firm_id_staff_id_version_id_key" ON "platform_terms_acceptance"("firm_id", "staff_id", "version_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_signup_pending_token_hash_key" ON "platform_signup_pending"("token_hash");

-- CreateIndex
CREATE INDEX "platform_signup_pending_expires_at_idx" ON "platform_signup_pending"("expires_at");

-- AddForeignKey
ALTER TABLE "platform_terms_acceptance" ADD CONSTRAINT "platform_terms_acceptance_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_terms_acceptance" ADD CONSTRAINT "platform_terms_acceptance_firm_id_staff_id_fkey" FOREIGN KEY ("firm_id", "staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "platform_terms_acceptance" ADD CONSTRAINT "platform_terms_acceptance_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "platform_terms_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One live (unused) sign-up per email: a second sign-up while one is live sends nothing new.
CREATE UNIQUE INDEX "platform_signup_pending_one_live" ON "platform_signup_pending" ("email") WHERE "used_at" IS NULL;
ALTER TABLE "platform_signup_pending" ADD CONSTRAINT "platform_signup_pending_email_lower" CHECK ("email" = lower("email"));
ALTER TABLE "platform_signup_pending" ADD CONSTRAINT "platform_signup_pending_country" CHECK ("country_code" ~ '^[A-Z]{2}$');
ALTER TABLE "platform_signup_pending" ADD CONSTRAINT "platform_signup_pending_life" CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + interval '24 hours');
ALTER TABLE "platform_signup_pending" ADD CONSTRAINT "platform_signup_pending_terms" CHECK (cardinality("terms_version_ids") >= 1);
ALTER TABLE "platform_terms_version" ADD CONSTRAINT "platform_terms_version_url" CHECK ("url" ~ '^(https://|/)');

-- The terms and their acceptances are never changed or removed.
CREATE FUNCTION platform_terms_insert_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'platform_terms_insert_only: % rows are never changed or removed (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER "platform_terms_version_insert_only" BEFORE UPDATE OR DELETE ON "platform_terms_version" FOR EACH ROW EXECUTE FUNCTION platform_terms_insert_only();
CREATE TRIGGER "platform_terms_version_no_truncate" BEFORE TRUNCATE ON "platform_terms_version" FOR EACH STATEMENT EXECUTE FUNCTION platform_terms_insert_only();
CREATE TRIGGER "platform_terms_acceptance_insert_only" BEFORE UPDATE OR DELETE ON "platform_terms_acceptance" FOR EACH ROW EXECUTE FUNCTION platform_terms_insert_only();
CREATE TRIGGER "platform_terms_acceptance_no_truncate" BEFORE TRUNCATE ON "platform_terms_acceptance" FOR EACH STATEMENT EXECUTE FUNCTION platform_terms_insert_only();

-- A pending sign-up: its terms exist; its one change is used_at, once; it is removed only once expired.
CREATE FUNCTION platform_signup_pending_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.expires_at > now() THEN RAISE EXCEPTION 'platform_signup_pending_rules: a sign-up is removed only after it expires' USING ERRCODE = 'insufficient_privilege'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.used_at IS NOT NULL OR NEW.used_at IS NULL OR (to_jsonb(NEW) - 'used_at') <> (to_jsonb(OLD) - 'used_at') THEN
      RAISE EXCEPTION 'platform_signup_pending_rules: a sign-up changes only once, when it is used' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (SELECT count(*) FROM platform_terms_version WHERE id = ANY (NEW.terms_version_ids)) <> cardinality(NEW.terms_version_ids) THEN
    RAISE EXCEPTION 'platform_signup_pending_rules: a sign-up names terms versions that do not exist' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "platform_signup_pending_rules" BEFORE INSERT OR UPDATE OR DELETE ON "platform_signup_pending" FOR EACH ROW EXECUTE FUNCTION platform_signup_pending_rules();

-- Sample terms (one version each; wording Sample until counsel reads it).
INSERT INTO "platform_terms_version" ("id", "kind", "version", "url", "published_at") VALUES
  (gen_random_uuid(), 'TERMS_OF_SERVICE', 'sample-2026-11-15', '/legal/terms', '2026-11-15T00:00:00Z'),
  (gen_random_uuid(), 'PRIVACY_NOTICE', 'sample-2026-11-15', '/legal/privacy', '2026-11-15T00:00:00Z'),
  (gen_random_uuid(), 'DATA_PROCESSING', 'sample-2026-11-15', '/legal/data-processing', '2026-11-15T00:00:00Z');
