-- FO-5d part 1 (row FO-5d, Lead B's brief design/briefs/track-b/FO-5d.md, split approved by Lead 4 on 22 Nov 15:35 IST;
-- AG-5-68 r1 and §7 "Signer declineReason?, declinedAt"; AG05-D4(7): a reason box is optional; schema file
-- prisma/schema/front-office-signing.prisma, owner Lead B (front office)). One nullable column on FO-6's own fo_signer,
-- one check and one fo_signing_ function (P-600 (2), (3)); no other table, column, row or trigger changes.
--   * decline_reason: what the signer typed when declining, kept as typed after trimming: 1 to 500 characters, at least one
--     visible character, line breaks and tabs allowed, no other control character; NULL when no reason was given.
--   * It is set only together with declined_at and never changes after: the check below refuses a reason without
--     declined_at; FO-6 part 1's signer trigger (fo_signing_signer_write) already refuses a signer row added with a moment
--     and any change to a signer once declined_at is set, so the reason is written in the same update as declined_at and
--     is then fixed for good (tests/check_fo5d_decline.ts proves each case). Legal reading of a decline: Unconfirmed: no counsel.
-- Rollback (in this order): ALTER TABLE "fo_signer" DROP CONSTRAINT "fo_signer_decline_reason_check", DROP COLUMN
--   "decline_reason"; DROP FUNCTION fo_signing_reason_ok(text); delete this folder's row from _prisma_migrations.

-- A reason a person typed: trimmed (no space, tab or line break at either end), 1 to 500 characters, at least one
-- character that shows (not only spaces or characters that show nothing), line breaks and tabs allowed, no other control
-- character (C0, DEL, C1, bidirectional overrides and isolates). Explicit character lists, never [[:space:]], so the rule is
-- the same in every database locale (break m3) and the same as decline.ts's declineReasonOf (break m2).
CREATE FUNCTION fo_signing_reason_ok(t text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS
  $$ SELECT t IS NOT NULL AND char_length(t) BETWEEN 1 AND 500
       AND t !~ '^[\t\n\v\f\r ]' AND t !~ '[\t\n\v\f\r ]$'
       AND t ~ '[^\t\n\v\f\r \u00a0\u00ad\u034f\u115f\u1160\u1680\u17b4\u17b5\u180e\u2000-\u200f\u2028\u2029\u202f\u205f\u2060-\u2064\u2800\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0]'
       AND t !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]' $$;

-- AlterTable
ALTER TABLE "fo_signer" ADD COLUMN "decline_reason" TEXT;

ALTER TABLE "fo_signer"
  ADD CONSTRAINT "fo_signer_decline_reason_check" CHECK ("decline_reason" IS NULL OR ("declined_at" IS NOT NULL AND fo_signing_reason_ok("decline_reason")));
