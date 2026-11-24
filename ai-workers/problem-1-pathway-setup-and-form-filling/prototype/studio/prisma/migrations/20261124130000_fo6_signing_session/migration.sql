-- FO-6 part 4b (BACKLOG row FO-6; note product/screens/FO-6-4/note.md rule 6; plan product/screens/FO-6-4/plan-4b.md;
-- stamp given by Lead 24 on #3433, answer 1): the public signing door's session, bound to one browser. Additive: two
-- nullable columns on fo_signer (FO-6's own table) and one check. No existing column, row, function or trigger changes.
--   * session_sha256: the sha256 (64 lower-case hex, part 1's fo_signing_sha_ok) of the random token in the browser's
--     http-only cookie; the token itself is never stored. A new code check (or, with the code off, a consent) replaces it.
--   * session_expires_at: when that session ends (Sample 30 minutes after it started).
--   * Both or neither.
-- Part 1's fo_signing_signer_write already freezes a signer once they signed or declined and once their request is final,
-- so an ended signer's session can never be written again; no trigger change is needed.
-- Rollback: rollback.sql.
ALTER TABLE "fo_signer" ADD COLUMN "session_sha256" TEXT, ADD COLUMN "session_expires_at" TIMESTAMPTZ;
ALTER TABLE "fo_signer" ADD CONSTRAINT "fo_signer_session_check" CHECK (
  ("session_sha256" IS NULL) = ("session_expires_at" IS NULL)
  AND ("session_sha256" IS NULL OR fo_signing_sha_ok("session_sha256"))
  AND ("session_expires_at" IS NULL OR isfinite("session_expires_at")));
