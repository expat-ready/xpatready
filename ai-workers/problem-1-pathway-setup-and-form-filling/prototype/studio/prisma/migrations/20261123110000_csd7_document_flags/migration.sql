-- CS-D7 (map row 70; AG-9-12, AG-9-29, AG-9-64): expiry, translation and notarisation flags on each case document.
-- All nullable (flags_version starts at 0): an existing document reads its type's defaults from the case's release.
ALTER TABLE "case_document"
  ADD COLUMN "language" VARCHAR(3),
  ADD COLUMN "translation" TEXT,
  ADD COLUMN "translation_detail" TEXT,
  ADD COLUMN "notarisation" TEXT,
  ADD COLUMN "notarisation_detail" TEXT,
  ADD COLUMN "expires_on" DATE,
  ADD COLUMN "flags_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "case_document"
  ADD CONSTRAINT "case_document_language_check" CHECK ("language" IS NULL OR "language" ~ '^[a-z]{2,3}$'),
  ADD CONSTRAINT "case_document_translation_check" CHECK ("translation" IS NULL OR "translation" IN ('NOT_REQUIRED', 'REQUIRED', 'PROVIDED')),
  ADD CONSTRAINT "case_document_notarisation_check" CHECK ("notarisation" IS NULL OR "notarisation" IN ('NOT_REQUIRED', 'REQUIRED', 'PROVIDED')),
  ADD CONSTRAINT "case_document_translation_provided_check" CHECK ("translation" IS DISTINCT FROM 'PROVIDED' OR length(btrim(coalesce("translation_detail", ''))) > 0),
  ADD CONSTRAINT "case_document_notarisation_provided_check" CHECK ("notarisation" IS DISTINCT FROM 'PROVIDED' OR length(btrim(coalesce("notarisation_detail", ''))) > 0);
