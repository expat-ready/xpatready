-- PF-19p (Lead B rev 16.62, ruled on #1955; AG-1-70): platform account messages. Sign-up's verification email goes to a
-- person before any firm exists (a pending sign-up gets its firm at verify, P-566), so an outbox row may be the
-- platform's own: audience PLATFORM_ACCOUNT, no firm. No reserved firm row (Lead B rejected it). Every existing row stays
-- FIRM (the default). Rules:
--  * firm_id is NULL exactly when audience = PLATFORM_ACCOUNT;
--  * a PLATFORM_ACCOUNT row is a system message: EMAIL, TRANSACTIONAL, no person, no consent (never marketing), and the
--    caller's own words, no template (msg_outbox_template_in_firm compares firms with <>, which a NULL firm would pass);
--  * it has an idempotency key, unique among platform rows (the (firm_id, idempotency_key) key treats NULL firms as
--    distinct, so a partial index over them treats NULLs as one).
-- PF-12's walls (firm_id = the session's firm) never match a NULL firm, so no firm's role reads or writes these rows;
-- only the bypass (system) role does. Down: delete PLATFORM_ACCOUNT rows, drop the index and checks, SET NOT NULL, drop
-- the column and the type.
CREATE TYPE "MsgAudience" AS ENUM ('FIRM', 'PLATFORM_ACCOUNT');

ALTER TABLE "msg_outbox"
  ADD COLUMN "audience" "MsgAudience" NOT NULL DEFAULT 'FIRM',
  ALTER COLUMN "firm_id" DROP NOT NULL,
  ADD CONSTRAINT "msg_outbox_audience_check" CHECK (("firm_id" IS NULL) = ("audience" = 'PLATFORM_ACCOUNT')),
  ADD CONSTRAINT "msg_outbox_platform_account_check" CHECK ("audience" <> 'PLATFORM_ACCOUNT' OR
    ("channel" = 'EMAIL' AND "class" = 'TRANSACTIONAL' AND "subject_kind" IS NULL AND "consent_id" IS NULL AND "template_version_id" IS NULL
    AND "idempotency_key" IS NOT NULL));

-- Led by firm_id like every msg_ index (PF-19a); NULLS NOT DISTINCT makes the NULL firm one key space.
CREATE UNIQUE INDEX "msg_outbox_platform_idempotency_key" ON "msg_outbox"("firm_id", "idempotency_key") NULLS NOT DISTINCT WHERE "audience" = 'PLATFORM_ACCOUNT';
