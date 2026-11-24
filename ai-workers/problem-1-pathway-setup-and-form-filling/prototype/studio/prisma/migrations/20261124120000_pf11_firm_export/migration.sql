-- PF-11 part 1 (map row 22; SA-2-33, AG-16-20, AG-16-22; brief lead-b-briefs/PF-11.md with Lead B's corrections on #1972,
-- comment 6916991708; schema file prisma/schema/platform-firm-export.prisma, owner Lead B (platform)): the firm's full
-- data download. Additive: one enum, one table, two indexes, two foreign keys, one check, PF-12's walls, and data rows
-- in PF-6b's catalogue. No existing table, function or row is changed.
--   * platform_firm_export: one request per (firm, operation_id); the requester is staff of the same firm (the
--     (firm_id, requested_by) key).
--   * PF-12's walls: forced policy (firm_id = the session's firm) and the firm-first gate.
--   * agent/firm-data-export:request is already seeded on OWNER by PF-3 (pf3_platform_tables): verified, not inserted.
--   * agent/firm-data-export:list (new; read by the Lead before the label, P-423): its catalogue row (scope NONE, class
--     GENERAL) and the OWNER and ADMIN role rows (P-601 (1); AG-16-20 names Owner for the request and leaves the list to
--     this row's brief: Owner and Admin, Sample).
-- Rollback (in this order): DELETE FROM "platform_role_permission" WHERE permission_key = 'agent/firm-data-export:list';
--   DELETE FROM "platform_permission_key" WHERE key = 'agent/firm-data-export:list'; DROP TABLE "platform_firm_export";
--   DROP TYPE "PlatformFirmExportState"; delete this folder's row from _prisma_migrations.
CREATE TYPE "PlatformFirmExportState" AS ENUM ('QUEUED', 'READY', 'DOWNLOADED', 'EXPIRED', 'FAILED');
CREATE TABLE "platform_firm_export" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "state" "PlatformFirmExportState" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "file_key" TEXT,
    "sha256" TEXT,
    "size_bytes" INTEGER,
    "row_counts" JSONB,
    "expires_at" TIMESTAMPTZ,
    "downloaded_at" TIMESTAMPTZ,
    "failed_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "platform_firm_export_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_firm_export_firm_id_created_at_idx" ON "platform_firm_export"("firm_id", "created_at");
CREATE UNIQUE INDEX "platform_firm_export_firm_id_operation_id_key" ON "platform_firm_export"("firm_id", "operation_id");
ALTER TABLE "platform_firm_export" ADD CONSTRAINT "platform_firm_export_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "platform_firm_export" ADD CONSTRAINT "platform_firm_export_firm_id_requested_by_fkey" FOREIGN KEY ("firm_id", "requested_by") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Rules Prisma cannot say: a READY or DOWNLOADED export has its file, hash, size and expiry; a FAILED one its reason (plain
-- words, at most 300 characters); the attempt counts from 0.
ALTER TABLE "platform_firm_export" ADD CONSTRAINT "platform_firm_export_facts_set" CHECK (
  "attempt" >= 0
  AND (("state" IN ('READY', 'DOWNLOADED', 'EXPIRED')) <= ("file_key" IS NOT NULL AND "sha256" ~ '^[0-9a-f]{64}$' AND "size_bytes" >= 0 AND "expires_at" IS NOT NULL))
  AND (("state" = 'FAILED') = ("failed_reason" IS NOT NULL))
  AND ("failed_reason" IS NULL OR (btrim("failed_reason") <> '' AND char_length("failed_reason") <= 300))
  AND (("state" = 'DOWNLOADED') <= ("downloaded_at" IS NOT NULL)));
-- PF-12: forced policy and the firm-first gate (tests/check_pf12_walls.ts). Table rights come by PF-12's default privileges.
ALTER TABLE "platform_firm_export" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "platform_firm_export" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "platform_firm_export" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
-- The keys (PF-6b's check fails a role key with no catalogue row).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "platform_role_permission" WHERE "role" = 'OWNER' AND "permission_key" = 'agent/firm-data-export:request') THEN
    RAISE EXCEPTION 'pf11: agent/firm-data-export:request is not on OWNER (PF-3 seeds it)';
  END IF;
END $$;
INSERT INTO "platform_permission_key" ("key", "scope", "class") VALUES ('agent/firm-data-export:list', 'NONE', 'GENERAL');
INSERT INTO "platform_role_permission" ("role", "permission_key") VALUES
  ('OWNER', 'agent/firm-data-export:list'), ('ADMIN', 'agent/firm-data-export:list');
