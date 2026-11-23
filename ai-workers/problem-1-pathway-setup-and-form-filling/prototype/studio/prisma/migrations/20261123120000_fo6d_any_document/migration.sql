-- FO-6d (BACKLOG row FO-6d; AG-5-61; P-564): send any document for signature. Schema file front-office-signing.prisma
-- (FO-6's area, this row's lines only). Every value is Sample. Legal points (e-signature identity): Unconfirmed: no counsel.
--   * FoSigningDocumentKind gains OTHER: a PDF the firm uploads (the case documents' read port is not built; uploads only).
--   * fo_signing_document (new): the uploaded PDF a request of kind OTHER names (document_id = document_version_id = its
--     id, version 1): its title, its FilesPort key under signing/ and sha256, the prospect it was sent from, who uploaded
--     it. Insert-only, never deleted; PF-12's wall. prospect_id and uploaded_by are plain uuids checked by the API (the
--     other areas' files are not edited), as fo_signature_request's document_id is.
--   * The firm signer is optional for OTHER (AG-5-61: "no firm signer unless added"): fo_signing_request_write and
--     fo_signing_evidence_write ask for the signed firm signer only when the kind is not OTHER. Every other rule of FO-6
--     part 1 is unchanged (the bodies below are part 1's, with that one condition). OTHER is usable only after this
--     commits: the bodies compare document_kind as text.
-- Rollback (by hand, before any OTHER row): the two functions from 20261122020000_fo6_signing_tables; drop table
-- fo_signing_document; the enum value stays (Postgres cannot drop one; nothing names it); delete this folder's row from
-- _prisma_migrations.

ALTER TYPE "FoSigningDocumentKind" ADD VALUE IF NOT EXISTS 'OTHER';

CREATE TABLE "fo_signing_document" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "prospect_id" UUID,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fo_signing_document_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fo_signing_document_firm_id_id_key" ON "fo_signing_document"("firm_id", "id");
CREATE INDEX "fo_signing_document_firm_id_prospect_id_idx" ON "fo_signing_document"("firm_id", "prospect_id");

ALTER TABLE "fo_signing_document"
  ADD CONSTRAINT "fo_signing_document_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200 AND "title" !~ '[[:cntrl:]]'),
  ADD CONSTRAINT "fo_signing_document_file_check" CHECK (fo_signing_key_ok("file_key") AND fo_signing_sha_ok("sha256")),
  ADD CONSTRAINT "fo_signing_document_created_at_check" CHECK (isfinite("created_at"));

CREATE FUNCTION fo_signing_document_write() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'fo_signing_document: an uploaded document never changes' USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER fo_signing_document_no_update BEFORE UPDATE ON "fo_signing_document" FOR EACH ROW EXECUTE FUNCTION fo_signing_document_write();
CREATE TRIGGER fo_signing_document_no_delete BEFORE DELETE ON "fo_signing_document" FOR EACH ROW EXECUTE FUNCTION fo_signing_no_delete();
CREATE TRIGGER fo_signing_document_no_truncate BEFORE TRUNCATE ON "fo_signing_document" FOR EACH STATEMENT EXECUTE FUNCTION fo_signing_no_delete();

ALTER TABLE "fo_signing_document" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_signing_document" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_signing_document" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');

-- Part 1's request rule, the firm signer asked for only when the kind is not OTHER.
CREATE OR REPLACE FUNCTION fo_signing_request_write() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE live constant text[] := ARRAY['SENT', 'VIEWED', 'CLIENT_SIGNED'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'SENT' OR NEW."ended_at" IS NOT NULL OR NEW."cancel_reason" IS NOT NULL THEN
      RAISE EXCEPTION 'fo_signature_request: a request starts SENT' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW."id", NEW."firm_id", NEW."document_kind", NEW."document_id", NEW."document_version_id", NEW."document_version", NEW."provider",
      NEW."provider_document_id", NEW."sent_by", NEW."sent_at", NEW."expires_at")
     IS DISTINCT FROM (OLD."id", OLD."firm_id", OLD."document_kind", OLD."document_id", OLD."document_version_id", OLD."document_version", OLD."provider",
      OLD."provider_document_id", OLD."sent_by", OLD."sent_at", OLD."expires_at") THEN
    RAISE EXCEPTION 'fo_signature_request: only the status and its end change' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT (OLD."status"::text = ANY (live)) THEN
    RAISE EXCEPTION 'fo_signature_request: a % request is final', OLD."status" USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."status" = OLD."status" THEN
    IF NEW."ended_at" IS DISTINCT FROM OLD."ended_at" OR NEW."cancel_reason" IS DISTINCT FROM OLD."cancel_reason" THEN
      RAISE EXCEPTION 'fo_signature_request: a live request has no end' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM "fo_signing_evidence" e WHERE e."firm_id" = NEW."firm_id" AND e."request_id" = NEW."id") AND NEW."status" <> 'SIGNED' THEN
    RAISE EXCEPTION 'fo_signature_request: the evidence is stored; only SIGNED follows' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ((OLD."status" = 'SENT' AND NEW."status" IN ('VIEWED', 'CLIENT_SIGNED', 'EXPIRED'))
       OR (OLD."status" = 'VIEWED' AND NEW."status" IN ('CLIENT_SIGNED', 'EXPIRED'))
       OR (OLD."status" = 'CLIENT_SIGNED' AND NEW."status" = 'SIGNED')
       OR NEW."status" IN ('DECLINED', 'CANCELLED')) THEN
    RAISE EXCEPTION 'fo_signature_request: % → % is not a signing move', OLD."status", NEW."status" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" IN ('CLIENT_SIGNED', 'SIGNED') AND (EXISTS (SELECT 1 FROM "fo_signer" s WHERE s."firm_id" = NEW."firm_id"
      AND s."request_id" = NEW."id" AND s."role" = 'CLIENT' AND s."signed_at" IS NULL)
      OR NOT EXISTS (SELECT 1 FROM "fo_signer" s WHERE s."firm_id" = NEW."firm_id" AND s."request_id" = NEW."id" AND s."role" = 'CLIENT')) THEN
    RAISE EXCEPTION 'fo_signature_request: % needs every client''s signature', NEW."status" USING ERRCODE = 'check_violation';
  END IF;
  -- SIGNED: every signer signed and the evidence stored; the one firm signer among them unless the kind is OTHER (FO-6d).
  IF NEW."status" = 'SIGNED' AND (EXISTS (SELECT 1 FROM "fo_signer" s WHERE s."firm_id" = NEW."firm_id" AND s."request_id" = NEW."id" AND s."signed_at" IS NULL)
      OR (NEW."document_kind"::text <> 'OTHER' AND NOT EXISTS (SELECT 1 FROM "fo_signer" s WHERE s."firm_id" = NEW."firm_id" AND s."request_id" = NEW."id" AND s."role" = 'FIRM' AND s."signed_at" IS NOT NULL))
      OR NOT EXISTS (SELECT 1 FROM "fo_signing_evidence" e WHERE e."firm_id" = NEW."firm_id" AND e."request_id" = NEW."id")) THEN
    RAISE EXCEPTION 'fo_signature_request: SIGNED needs every signature and the stored evidence' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" = 'EXPIRED' AND EXISTS (SELECT 1 FROM "fo_signer" s WHERE s."firm_id" = NEW."firm_id" AND s."request_id" = NEW."id"
      AND s."role" = 'CLIENT' AND s."signed_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'fo_signature_request: a request a client signed never expires' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" = 'DECLINED' AND NOT EXISTS (SELECT 1 FROM "fo_signer" s WHERE s."firm_id" = NEW."firm_id" AND s."request_id" = NEW."id" AND s."declined_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'fo_signature_request: DECLINED needs a signer who declined' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" IN ('SIGNED', 'DECLINED', 'EXPIRED', 'CANCELLED') THEN NEW."ended_at" := coalesce(NEW."ended_at", now()); END IF;
  RETURN NEW;
END $$;

-- Part 1's evidence rule, the signed firm signer asked for only when the request's kind is not OTHER.
CREATE OR REPLACE FUNCTION fo_signing_evidence_write() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'fo_signing_evidence: evidence never changes' USING ERRCODE = 'restrict_violation'; END IF;
  UPDATE "fo_signature_request" r SET "status" = r."status" WHERE r."firm_id" = NEW."firm_id" AND r."id" = NEW."request_id";
  IF NOT EXISTS (SELECT 1 FROM "fo_signature_request" r WHERE r."firm_id" = NEW."firm_id" AND r."id" = NEW."request_id" AND r."status" = 'CLIENT_SIGNED')
     OR EXISTS (SELECT 1 FROM "fo_signer" s WHERE s."firm_id" = NEW."firm_id" AND s."request_id" = NEW."request_id" AND s."signed_at" IS NULL)
     OR (EXISTS (SELECT 1 FROM "fo_signature_request" r WHERE r."firm_id" = NEW."firm_id" AND r."id" = NEW."request_id" AND r."document_kind"::text <> 'OTHER')
         AND NOT EXISTS (SELECT 1 FROM "fo_signer" s WHERE s."firm_id" = NEW."firm_id" AND s."request_id" = NEW."request_id" AND s."role" = 'FIRM' AND s."signed_at" IS NOT NULL)) THEN
    RAISE EXCEPTION 'fo_signing_evidence: stored only when every signer of a live request signed' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "fo_signer" s WHERE s."firm_id" = NEW."firm_id" AND s."request_id" = NEW."request_id" AND s."consent_text_version" IS DISTINCT FROM NEW."consent_text_version") THEN
    RAISE EXCEPTION 'fo_signing_evidence: the consent text version is the one every signer agreed to' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- PF-8b F4 (RDS): as part 1, CREATE on public for the hand-over to xr_wall_reader, taken back after.
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fo_signing_document_write()', 'fo_signing_request_write()', 'fo_signing_evidence_write()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
  END LOOP;
END
$readers$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
