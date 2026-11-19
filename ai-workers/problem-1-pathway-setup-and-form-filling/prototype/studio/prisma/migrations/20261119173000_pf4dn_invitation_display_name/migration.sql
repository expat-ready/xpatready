-- PF-4dn (AG-1-10, AG-1-69): the invite carries the person's name. One nullable column on platform_invitation; the
-- accept uses it for the new staff member's display name and falls back to the part of the email before the @ when it is
-- empty. The table keeps its PF-12 forced policy (a new column needs no new policy). The API trims the name and refuses
-- 121+ characters or a control, format or line-break character; the check below is a backstop for the core of that
-- rule (trimmed of ASCII spaces, 1-120 characters, no control character): the API's rule is the stricter one.
ALTER TABLE "platform_invitation" ADD COLUMN "display_name" TEXT;
ALTER TABLE "platform_invitation" ADD CONSTRAINT "platform_invitation_display_name_check"
  CHECK ("display_name" IS NULL OR ("display_name" = btrim("display_name") AND char_length("display_name") BETWEEN 1 AND 120 AND "display_name" !~ '[[:cntrl:]]'));
