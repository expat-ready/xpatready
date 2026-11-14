-- FO-5 part 2 (review M1, break B-1 and B-5 on #1777; schema file prisma/schema/front-office-retainers.prisma, owner Lead B).
-- Changes only FO-5's own check constraints: no table, column, row or other area changes. Part 1 named each stored file
-- exactly by its row (retainer-templates/<id>/v<n>.docx, retainers/<id>/v<n>.docx, retainers/<id>/signed-offline.pdf).
-- Files are written to the write-once file store before the row's transaction commits, so a transaction that lost (a
-- race, a refused change) left a file under the one name its next attempt must use, and every later attempt was refused
-- for good. Each key may now carry one attempt suffix (a hyphen and 12 lower-case hex characters) after the part 1
-- name, so a lost attempt leaves only an unreferenced file and never blocks the next. Rows written by part 1 (no suffix)
-- stay valid; a key still names its own row, its version and nothing else (B-2, B-16 of part 1 hold).
-- Rollback: re-run part 1's four constraint definitions (migration 20261114210000_fo5_retainer_tables) after dropping these;
-- delete this folder's row from _prisma_migrations.

ALTER TABLE "fo_retainer_template" DROP CONSTRAINT "fo_retainer_template_file_key_check",
  ADD CONSTRAINT "fo_retainer_template_file_key_check" CHECK ("file_key" ~ ('^retainer-templates/' || "id"::text || '/v' || "version" || '(-[0-9a-f]{12})?\.docx$'));

ALTER TABLE "fo_retainer" DROP CONSTRAINT "fo_retainer_template_file_key_check",
  ADD CONSTRAINT "fo_retainer_template_file_key_check" CHECK ("template_file_key" ~ ('^retainer-templates/' || "template_id"::text || '/v' || "template_version" || '(-[0-9a-f]{12})?\.docx$'));

ALTER TABLE "fo_retainer_version" DROP CONSTRAINT "fo_retainer_version_file_key_check",
  ADD CONSTRAINT "fo_retainer_version_file_key_check" CHECK ("file_key" ~ ('^retainers/' || "retainer_id"::text || '/v' || "n" || '(-[0-9a-f]{12})?\.(docx|pdf)$'));

ALTER TABLE "fo_retainer" DROP CONSTRAINT "fo_retainer_offline_check",
  ADD CONSTRAINT "fo_retainer_offline_check" CHECK (
    ("status" = 'SIGNED_OFFLINE') = ("offline_at" IS NOT NULL)
    AND ("offline_at" IS NULL) = ("offline_reason" IS NULL) AND ("offline_at" IS NULL) = ("offline_by" IS NULL)
    AND ("offline_at" IS NULL) = ("offline_file_key" IS NULL) AND ("offline_at" IS NULL) = ("offline_file_sha256" IS NULL)
    AND ("offline_reason" IS NULL OR fo_retainer_text_ok("offline_reason", 200, true))
    AND ("offline_file_key" IS NULL OR "offline_file_key" ~ ('^retainers/' || "id"::text || '/signed-offline(-[0-9a-f]{12})?\.pdf$'))
    AND ("offline_file_sha256" IS NULL OR "offline_file_sha256" ~ '^[0-9a-f]{64}$'));
