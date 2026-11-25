-- FO-5d (1) (BACKLOG row FO-5d; AG-5-68, AG05-D4(7); R1.55 W3): the client's own reason for declining, kept on their signer
-- row. Additive: one nullable column on fo_signer (FO-6's own table) and one check. No existing column, row, function or
-- trigger changes.
--   * decline_reason: 1-500 characters, no whitespace of any kind at either end and no control character (the app cleans
--     it the same way, signing/decline.ts cleanReason), and only beside declined_at (a reason never stands alone).
--   * "Never changes after": part 1's fo_signing_signer_write already refuses any change to a signer who signed or
--     declined (and any change once the request is final), so the reason can only be written in the same update that
--     writes declined_at, and never again. The row asked for that trigger to be replaced; this check plus the existing
--     trigger holds the same rule without touching the trigger (tests/check_fo5d_decline_withdraw.ts D-DB lines).
-- Rollback: rollback.sql.
ALTER TABLE "fo_signer" ADD COLUMN "decline_reason" TEXT;
ALTER TABLE "fo_signer" ADD CONSTRAINT "fo_signer_decline_reason_check" CHECK (
  "decline_reason" IS NULL OR ("declined_at" IS NOT NULL AND "decline_reason" !~ '^[[:space:]\u00a0]|[[:space:]\u00a0]$'
    AND "decline_reason" !~ '[[:cntrl:]]' AND char_length("decline_reason") BETWEEN 1 AND 500));
