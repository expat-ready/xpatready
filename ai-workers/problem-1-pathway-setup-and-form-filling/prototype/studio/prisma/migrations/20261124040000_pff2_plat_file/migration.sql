-- PF-F2 part 1 (BACKLOG row PF-F2, map row 64, R1.64; batch 5; P-600; schema file prisma/schema/platform-files.prisma, owner
-- platform): the record of a finished upload. One new type and one new table only; no existing row, table or column changes.
--   * new: plat_file_scan_state (SCANNING, SCAN_PENDING, CLEAN, QUARANTINED: PF-F3's four states, so PF-F3 needs no migration).
--   * new: plat_file (written once the last byte arrived, PF-F4 passed the bytes and FilesPort stored them; never a
--     half-finished file). No foreign key to the firm (as plat_legal_hold): PF-12's wall keeps each firm to its own rows.
--   * only the scan columns ever change (plat_file_write); rows are never deleted by the app (a dispose keeps its row, CS-D6).
--   * every function is plat_file_ (area prefix, rows rev 15.2).
-- Rollback (in this order): DROP TABLE "plat_file"; DROP FUNCTION plat_file_write(); DROP TYPE "PlatFileScanState"; delete this
--   folder's row from _prisma_migrations.
-- Prisma's DDL, then the rules.
CREATE TYPE "PlatFileScanState" AS ENUM ('SCANNING', 'SCAN_PENDING', 'CLEAN', 'QUARANTINED');
CREATE TABLE "plat_file" (
  "id" UUID NOT NULL, "firm_id" UUID NOT NULL, "key" TEXT NOT NULL, "door" TEXT NOT NULL, "sha256" TEXT NOT NULL, "size_bytes" INTEGER NOT NULL,
  "media_type" TEXT NOT NULL, "scan_state" "PlatFileScanState" NOT NULL DEFAULT 'SCANNING', "scanned_at" TIMESTAMPTZ, "signature_name" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plat_file_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plat_file_firm_id_key_key" ON "plat_file"("firm_id", "key");
CREATE INDEX "plat_file_scan_state_created_at_idx" ON "plat_file"("scan_state", "created_at");
-- ------------------------------------------------------------------------------------------------ rules Prisma cannot say
-- SQLSTATE 23514 (check_violation) for a broken rule.
ALTER TABLE "plat_file"
  ADD CONSTRAINT "plat_file_door_check" CHECK ("door" IN ('STAFF', 'CLIENT_LINK', 'CLIENT_PORTAL', 'SUPPORT')),
  ADD CONSTRAINT "plat_file_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  -- FILE_MAX_BYTES (ports/files.ts, SA-8-58: 25 MB), and never empty (PF-F4 refuses an empty file).
  ADD CONSTRAINT "plat_file_size_check" CHECK ("size_bytes" BETWEEN 1 AND 26214400),
  -- A FilesPort key (ports/files.ts FileKey): lower-case path segments.
  ADD CONSTRAINT "plat_file_key_check" CHECK (char_length("key") <= 300 AND "key" ~ '^[a-z0-9][a-z0-9._-]*(/[a-z0-9][a-z0-9._-]*)*$'),
  -- A signature name only on a quarantined file; a scan time once the scan has answered.
  ADD CONSTRAINT "plat_file_signature_check" CHECK ("signature_name" IS NULL OR "scan_state" = 'QUARANTINED'),
  ADD CONSTRAINT "plat_file_scanned_check" CHECK (("scan_state" IN ('CLEAN', 'QUARANTINED')) = ("scanned_at" IS NOT NULL));
-- A row stays its file: only the scan state, its time and the signature change; the creation time is the database's.
CREATE FUNCTION plat_file_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    IF NEW.scan_state <> 'SCANNING' THEN
      RAISE EXCEPTION 'plat_file: a new file starts SCANNING' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF (NEW.id, NEW.firm_id, NEW.key, NEW.door, NEW.sha256, NEW.size_bytes, NEW.media_type, NEW.created_at)
        IS DISTINCT FROM (OLD.id, OLD.firm_id, OLD.key, OLD.door, OLD.sha256, OLD.size_bytes, OLD.media_type, OLD.created_at) THEN
    RAISE EXCEPTION 'plat_file: only the scan state, scan time and signature of a file change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER plat_file_write BEFORE INSERT OR UPDATE ON "plat_file" FOR EACH ROW EXECUTE FUNCTION plat_file_write();
REVOKE UPDATE, DELETE, TRUNCATE ON "plat_file" FROM xr_data; GRANT UPDATE ("scan_state", "scanned_at", "signature_name") ON "plat_file" TO xr_data;
-- ------------------------------------------------------------------------------------------------------ PF-12's walls
ALTER TABLE "plat_file" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_file" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "plat_file" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER FUNCTION plat_file_write() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION plat_file_write() OWNER TO xr_wall_reader;
