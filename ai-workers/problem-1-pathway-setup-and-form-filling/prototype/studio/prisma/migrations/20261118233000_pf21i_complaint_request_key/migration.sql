-- PF-21i (BACKLOG row PF-21i rev 16.24; STANDARDS §4 "[M] Idempotent creates and job launches"; #1823 M1; map row
-- 109; schema file prisma/schema/platform-register.prisma, owner Lead B (platform)). Recording a complaint is idempotent:
-- POST /api/platform/complaints carries an Idempotency-Key; the complaint keeps the key and the SHA-256 of the canonical
-- request body, so a repeat with the same key and body answers the first complaint and writes nothing. Additive only:
-- two NULL columns on the row's own table (existing complaints keep NULL), one partial unique index, two checks and one
-- trigger (plat_ prefix). The complaint rules (Code SOR/2022-128 s. 24(3)(r), 29, 37; Unconfirmed: no counsel) are
-- unchanged: this adds no complaint rule, only the safe repeat.
--   * one complaint per (firm, key): the key is per firm (another firm's same key is another complaint);
--   * the key and its hash come together, the key 1-255 visible ASCII characters, the hash 64 lowercase hex;
--   * the key and its hash are set when the complaint is recorded and never change (a trigger, as the facts in PF-21).
-- Rollback (in this order): DROP TRIGGER "plat_complaint_request_kept" ON "plat_complaint"; DROP FUNCTION
--   plat_complaint_request_kept() (its owner and SECURITY DEFINER go with it); DROP INDEX "plat_complaint_firm_request_key"; ALTER TABLE "plat_complaint" DROP
--   CONSTRAINT "plat_complaint_request_shape", DROP COLUMN "request_hash", DROP COLUMN "request_key"; delete this
--   folder's row from _prisma_migrations.

-- AlterTable
ALTER TABLE "plat_complaint" ADD COLUMN "request_key" TEXT, ADD COLUMN "request_hash" TEXT;

ALTER TABLE "plat_complaint" ADD CONSTRAINT "plat_complaint_request_shape" CHECK (
  (request_key IS NULL AND request_hash IS NULL)
  OR (request_key IS NOT NULL AND request_hash IS NOT NULL AND request_key ~ '^[!-~]{1,255}$' AND request_hash ~ '^[0-9a-f]{64}$')   -- a NULL half would make the regex NULL, which a CHECK accepts
);

-- One complaint per firm and key; complaints recorded before PF-21i (no key) are outside the index.
CREATE UNIQUE INDEX "plat_complaint_firm_request_key" ON "plat_complaint" (firm_id, request_key) WHERE request_key IS NOT NULL;

-- The key and its hash never change once recorded (a repeat must always find the complaint it made).
CREATE FUNCTION plat_complaint_request_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.request_key IS DISTINCT FROM OLD.request_key OR NEW.request_hash IS DISTINCT FROM OLD.request_hash THEN
    RAISE EXCEPTION 'plat_complaint: the request key and its hash are set when the complaint is recorded and never change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "plat_complaint_request_kept" BEFORE UPDATE ON "plat_complaint" FOR EACH ROW EXECUTE FUNCTION plat_complaint_request_kept();
-- PF-12's wall (tests/check_pf12_walls.ts): a trigger function on a firm table runs as xr_wall_reader, search_path pinned.
ALTER FUNCTION plat_complaint_request_kept() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION plat_complaint_request_kept() OWNER TO xr_wall_reader;
