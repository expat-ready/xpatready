-- CS-D7c (map row 70; AG-9-12, AG-9-29, AG-9-64): a document type's translation, notarisation and validity defaults.
-- All nullable: an existing type reads null and behaves as before. Only a draft may carry a value without its official
-- citation (AGENTS rule 4, P-170): a published, superseded or retired version with a value has its quote and file.
ALTER TABLE "document_type"
  ADD COLUMN "translation_rule" TEXT,
  ADD COLUMN "notarisation_rule" TEXT,
  ADD COLUMN "has_expiry" BOOLEAN,
  ADD COLUMN "max_age_days" INTEGER,
  ADD COLUMN "defaults_source_quote" TEXT,
  ADD COLUMN "defaults_source_file" TEXT;

ALTER TABLE "document_type"
  ADD CONSTRAINT "document_type_translation_rule_check" CHECK ("translation_rule" IS NULL OR "translation_rule" IN ('NOT_REQUIRED', 'REQUIRED_IF_NOT_EN_FR')),
  ADD CONSTRAINT "document_type_notarisation_rule_check" CHECK ("notarisation_rule" IS NULL OR "notarisation_rule" IN ('NOT_REQUIRED', 'REQUIRED')),
  ADD CONSTRAINT "document_type_max_age_days_check" CHECK ("max_age_days" IS NULL OR "max_age_days" BETWEEN 1 AND 36500),
  ADD CONSTRAINT "document_type_defaults_cited_check" CHECK (
    "status" = 'DRAFT'
    OR ("translation_rule" IS NULL AND "notarisation_rule" IS NULL AND "has_expiry" IS NULL AND "max_age_days" IS NULL)
    OR (length(btrim(coalesce("defaults_source_quote", ''))) > 0 AND length(btrim(coalesce("defaults_source_file", ''))) > 0)
  );
