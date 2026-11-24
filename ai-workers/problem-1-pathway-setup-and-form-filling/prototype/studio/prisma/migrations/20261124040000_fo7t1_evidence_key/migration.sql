-- FO-7t part 1 (R1.58; AG-6-63, AG-6-69 rule 1; FO-7t.md part 1: "an optional evidence file through FilesPort (the key on
-- money_payment.evidence_file_key)"): FO-7a's evidence check could never be evaluated. PostgreSQL's regular expressions
-- allow a repetition count of at most 255 (RE_DUP_MAX), and money_payment_evidence_check's '{0,299}' fails with "invalid
-- regular expression: invalid repetition count(s)" for every key that is not null, so no evidence key could be stored.
-- The same rule, written so PostgreSQL can evaluate it: at most 300 characters, the first a letter or digit, the rest
-- letters, digits, '/', '.', '_' or '-'. Same name, same meaning; no row holds a key today (none could be written).
-- Stamped 20261124040000, after #3225's 20261124030000 (Lead 17's re-stamp; main's newest today is 20261123220000_r190_signup_link_plan). No data statement (F7); no function changes owner (F4).
-- Rollback: rollback.sql in this folder (Prisma reads only migration.sql).
ALTER TABLE "money_payment" DROP CONSTRAINT "money_payment_evidence_check";
ALTER TABLE "money_payment" ADD CONSTRAINT "money_payment_evidence_check"
  CHECK ("evidence_file_key" IS NULL OR (char_length("evidence_file_key") <= 300 AND "evidence_file_key" ~ '^[A-Za-z0-9][A-Za-z0-9/._-]*$'));
