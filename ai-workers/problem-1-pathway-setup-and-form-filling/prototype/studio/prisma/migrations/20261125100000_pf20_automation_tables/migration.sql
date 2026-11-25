-- PF-20 part 1 + FO-12c's tables (R1.36 "simple automation, message many with consent"; map row 36; AG-2-31, -33, -90,
-- -91; P-584 (2); schema file prisma/schema/platform-automation.prisma, owner the platform (Lead B, P-559)): the
-- automation engine's recipes, steps, runs and step runs, and message many's sends and recipients, in one migration so
-- R1.36 holds one schema slot. Additive: six enums, six new tables, their keys and indexes, checks, one partial unique
-- index and PF-12's wall on each. No existing table, row or function is changed; no data statement runs.
--   * auto_recipe: one row per firm and registered recipe key (module + key); on/off is the firm's (AG-2-31 rule 1).
--   * auto_recipe_step: a step's class is SERVICE or MARKETING (the consent gate's purpose, AG-2-33 rule 3); its wait is
--     0 to 365 days in minutes; wording on one line for the subject, never empty.
--   * auto_run: at most one RUNNING run per firm, recipe and person (two triggers never make two runs: FO-12a's test);
--     an ENDED run names its reason and time, a RUNNING one neither.
--   * auto_step_run / auto_bulk_recipient: an outbox row only on a sent step or recipient; a reason on every skip.
--   * Keys are (firm_id, id) pairs, and the bulk send's sender is (firm_id, staff_id) → platform_staff(firm_id, id), so
--     nothing of firm A names anything of firm B.
--   * PF-12's wall on all six: a forced policy naming the session's firm and the firm-first gate.
-- Keys: agent/template:configure (switch a recipe on or off), agent/prospect:sequence (Add to follow-up) and
-- agent/communication:bulk-send (message many) are already catalogue rows (PF-3's seed): none is added here.
-- New, empty tables: no FORCE lift (PF-8b F7) is needed. Rollback: rollback.sql in this folder.

-- CreateEnum
CREATE TYPE "AutoStepMode" AS ENUM ('AUTO', 'ASK', 'OFF');

-- CreateEnum
CREATE TYPE "AutoRunState" AS ENUM ('RUNNING', 'ENDED');

-- CreateEnum
CREATE TYPE "AutoStepState" AS ENUM ('QUEUED', 'SUCCESS', 'SKIPPED', 'AWAITING_APPROVAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutoBulkState" AS ENUM ('SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutoBulkEligibility" AS ENUM ('ELIGIBLE', 'SKIPPED_NO_CONSENT', 'SKIPPED_OPTED_OUT', 'SKIPPED_QUIET', 'SKIPPED_NO_CHANNEL', 'SKIPPED_FREQUENCY_LIMIT');

-- CreateEnum
CREATE TYPE "AutoBulkSendState" AS ENUM ('QUEUED', 'SENT', 'SKIPPED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "auto_recipe" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "auto_recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_recipe_step" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "delay_minutes" INTEGER NOT NULL,
    "class" TEXT NOT NULL,
    "mode" "AutoStepMode" NOT NULL DEFAULT 'AUTO',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "auto_recipe_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_run" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "context_kind" TEXT,
    "context_id" UUID,
    "state" "AutoRunState" NOT NULL DEFAULT 'RUNNING',
    "exit_reason" TEXT,
    "enrolled_by" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,

    CONSTRAINT "auto_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_step_run" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "due_at" TIMESTAMPTZ NOT NULL,
    "state" "AutoStepState" NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "outbox_id" UUID,
    "done_at" TIMESTAMPTZ,

    CONSTRAINT "auto_step_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_bulk_send" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "created_by_staff_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "state" "AutoBulkState" NOT NULL DEFAULT 'SENDING',
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,

    CONSTRAINT "auto_bulk_send_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_bulk_recipient" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "bulk_send_id" UUID NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "address" TEXT,
    "eligibility" "AutoBulkEligibility" NOT NULL,
    "send_state" "AutoBulkSendState" NOT NULL,
    "reason" TEXT,
    "outbox_id" UUID,
    "sent_at" TIMESTAMPTZ,

    CONSTRAINT "auto_bulk_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_recipe_firm_id_key_key" ON "auto_recipe"("firm_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "auto_recipe_firm_id_id_key" ON "auto_recipe"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_recipe_step_firm_id_recipe_id_position_key" ON "auto_recipe_step"("firm_id", "recipe_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "auto_recipe_step_firm_id_id_key" ON "auto_recipe_step"("firm_id", "id");

-- CreateIndex
CREATE INDEX "auto_run_firm_id_subject_kind_subject_id_idx" ON "auto_run"("firm_id", "subject_kind", "subject_id");

-- CreateIndex
CREATE INDEX "auto_run_firm_id_recipe_id_state_idx" ON "auto_run"("firm_id", "recipe_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "auto_run_firm_id_id_key" ON "auto_run"("firm_id", "id");

-- CreateIndex
CREATE INDEX "auto_step_run_firm_id_state_due_at_idx" ON "auto_step_run"("firm_id", "state", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "auto_step_run_firm_id_run_id_position_key" ON "auto_step_run"("firm_id", "run_id", "position");

-- CreateIndex
CREATE INDEX "auto_bulk_send_firm_id_started_at_idx" ON "auto_bulk_send"("firm_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "auto_bulk_send_firm_id_id_key" ON "auto_bulk_send"("firm_id", "id");

-- CreateIndex
CREATE INDEX "auto_bulk_recipient_firm_id_bulk_send_id_send_state_idx" ON "auto_bulk_recipient"("firm_id", "bulk_send_id", "send_state");

-- CreateIndex
CREATE UNIQUE INDEX "auto_bulk_recipient_firm_id_bulk_send_id_subject_kind_subje_key" ON "auto_bulk_recipient"("firm_id", "bulk_send_id", "subject_kind", "subject_id");

-- AddForeignKey
ALTER TABLE "auto_recipe" ADD CONSTRAINT "auto_recipe_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auto_recipe_step" ADD CONSTRAINT "auto_recipe_step_firm_id_recipe_id_fkey" FOREIGN KEY ("firm_id", "recipe_id") REFERENCES "auto_recipe"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auto_run" ADD CONSTRAINT "auto_run_firm_id_recipe_id_fkey" FOREIGN KEY ("firm_id", "recipe_id") REFERENCES "auto_recipe"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auto_step_run" ADD CONSTRAINT "auto_step_run_firm_id_run_id_fkey" FOREIGN KEY ("firm_id", "run_id") REFERENCES "auto_run"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auto_bulk_send" ADD CONSTRAINT "auto_bulk_send_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auto_bulk_send" ADD CONSTRAINT "auto_bulk_send_firm_id_created_by_staff_id_fkey" FOREIGN KEY ("firm_id", "created_by_staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auto_bulk_recipient" ADD CONSTRAINT "auto_bulk_recipient_firm_id_bulk_send_id_fkey" FOREIGN KEY ("firm_id", "bulk_send_id") REFERENCES "auto_bulk_send"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Rules Prisma cannot say.
-- One RUNNING run per firm, recipe and person.
CREATE UNIQUE INDEX "auto_run_one_running" ON "auto_run" ("firm_id", "recipe_id", "subject_kind", "subject_id") WHERE "state" = 'RUNNING';
ALTER TABLE "auto_recipe" ADD CONSTRAINT "auto_recipe_names" CHECK ("module" ~ '^[a-z][a-z0-9_]{0,31}$' AND "key" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND length("key") <= 100 AND length("updated_by") BETWEEN 1 AND 200);
ALTER TABLE "auto_recipe_step" ADD CONSTRAINT "auto_recipe_step_shape" CHECK ("position" BETWEEN 1 AND 20 AND "delay_minutes" BETWEEN 0 AND 525600 AND "class" IN ('SERVICE', 'MARKETING') AND length(btrim("subject")) BETWEEN 1 AND 200 AND "subject" !~ '[\r\n]' AND length(btrim("body")) BETWEEN 1 AND 20000);
ALTER TABLE "auto_run" ADD CONSTRAINT "auto_run_shape" CHECK ("subject_kind" IN ('FO_PERSON', 'CASE_PARTY') AND "channel" IN ('EMAIL', 'WHATSAPP') AND length("address") BETWEEN 3 AND 320 AND ("context_kind" IS NULL) = ("context_id" IS NULL) AND length("enrolled_by") BETWEEN 1 AND 200);
ALTER TABLE "auto_run" ADD CONSTRAINT "auto_run_ended" CHECK (("state" = 'RUNNING' AND "exit_reason" IS NULL AND "ended_at" IS NULL) OR ("state" = 'ENDED' AND "exit_reason" IS NOT NULL AND "ended_at" IS NOT NULL));
ALTER TABLE "auto_step_run" ADD CONSTRAINT "auto_step_run_shape" CHECK ("position" BETWEEN 1 AND 20 AND ("outbox_id" IS NULL OR "state" = 'SUCCESS') AND ("state" NOT IN ('SKIPPED', 'FAILED', 'CANCELLED') OR "reason" IS NOT NULL) AND (("state" = 'QUEUED') = ("done_at" IS NULL)));
ALTER TABLE "auto_bulk_send" ADD CONSTRAINT "auto_bulk_send_shape" CHECK ("channel" IN ('EMAIL', 'WHATSAPP') AND length(btrim("subject")) BETWEEN 1 AND 200 AND "subject" !~ '[\r\n]' AND length(btrim("body")) BETWEEN 1 AND 20000 AND jsonb_typeof("filter") = 'object' AND "recipient_count" >= 0 AND "skipped_count" >= 0 AND "sent_count" >= 0 AND ("state" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));
ALTER TABLE "auto_bulk_recipient" ADD CONSTRAINT "auto_bulk_recipient_shape" CHECK ("subject_kind" IN ('FO_PERSON', 'CASE_PARTY') AND ("outbox_id" IS NULL OR "send_state" = 'SENT') AND ("send_state" <> 'SKIPPED' OR "reason" IS NOT NULL) AND ("eligibility" = 'ELIGIBLE' OR "send_state" = 'SKIPPED'));

-- PF-12's wall (forced policy naming the session's firm; the firm-first gate); tests/check_pf12_walls.ts.
ALTER TABLE "auto_recipe" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "auto_recipe" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "auto_recipe" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER TABLE "auto_recipe_step" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "auto_recipe_step" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "auto_recipe_step" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER TABLE "auto_run" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "auto_run" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "auto_run" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER TABLE "auto_step_run" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "auto_step_run" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "auto_step_run" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER TABLE "auto_bulk_send" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "auto_bulk_send" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "auto_bulk_send" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER TABLE "auto_bulk_recipient" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "auto_bulk_recipient" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "auto_bulk_recipient" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
