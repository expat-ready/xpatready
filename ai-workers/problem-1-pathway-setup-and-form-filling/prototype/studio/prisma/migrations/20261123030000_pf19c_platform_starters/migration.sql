-- PF-19c part 2 (R1.46; AG-12-44; SA-05 Appendix A.1 #1 to #3; Lead 1's ruling on #3179, 23 Nov: "seed the starters as
-- platform rows"). Data only, no table change. ExpatReady's three lead starters become PLATFORM templates (firm_id null),
-- version 1 each, so a firm that never edits a template still sends it: the send path takes the firm's newest version
-- first, else the platform's (api/src/platform/messages/send/messages.ts). The wording is the starters' word for word
-- (api/src/platform/messages/templates/registry.ts, from #3179) and is Sample: no counsel and no immigration expert has
-- written it (P-170). PF-12 lets firms only read firm-less rows; a rerun adds nothing.
-- PF-8b F7 (Amazon RDS: the admin is neither superuser nor BYPASSRLS): such a runner owns the walled tables but, under FORCE
-- ROW LEVEL SECURITY and PF-12's firm gate, could write none of these rows; it lifts both on the two tables inside this one
-- statement (ACCESS EXCLUSIVE first, so nobody sees the walls lifted) and puts them back after, as
-- 20261122000000_pf5p3_billing_period does. A superuser or BYPASSRLS runner writes as before. tests/check_pf8b_f7_data_walls.ts.
DO $pf8b_f7$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['msg_template', 'msg_template_version']; gated text[] := '{}';
BEGIN
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled = 'O' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  WITH s("key", "kind", "subject", "body") AS (VALUES
    ('lead.acknowledgement', 'automatic', 'Thank you for contacting {{ firm_name }}',
     E'Dear {{ lead_first_name }},\n\nThank you for contacting {{ firm_name }}. We have your enquiry (reference {{ lead_number }}) and a member of our team will be in touch soon.\n\nKind regards,\n{{ firm_name }}'),
    ('lead.follow_up', 'library', 'Following up on your enquiry',
     E'Dear {{ lead_first_name }},\n\nI am following up on your enquiry with {{ firm_name }}. Would you like to arrange a time to talk about your plans?\n\nKind regards,\n{{ owner_name }}\n{{ firm_name }}'),
    ('lead.going_cold', 'library', 'Are you still planning your move?',
     E'Dear {{ lead_first_name }},\n\nWe have not heard from you for a while. If you are still planning your move, reply to this email and we will pick up where we left off.\n\nKind regards,\n{{ owner_name }}\n{{ firm_name }}')
  ), t AS (
    INSERT INTO "msg_template" ("id", "firm_id", "owner", "key", "kind", "channel", "language", "updated_at")
    SELECT gen_random_uuid(), NULL, 'PLATFORM', s."key", s."kind", 'EMAIL', 'en', now() FROM s
    WHERE NOT EXISTS (SELECT 1 FROM "msg_template" m WHERE m."firm_id" IS NULL AND m."key" = s."key" AND m."channel" = 'EMAIL' AND m."language" = 'en')
    RETURNING "id", "key"
  )
  INSERT INTO "msg_template_version" ("id", "firm_id", "template_id", "version", "subject", "body", "published_by")
  SELECT gen_random_uuid(), NULL, t."id", 1, s."subject", s."body", 'seed:sa05-a1' FROM t JOIN s ON s."key" = t."key";
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END
$pf8b_f7$;
