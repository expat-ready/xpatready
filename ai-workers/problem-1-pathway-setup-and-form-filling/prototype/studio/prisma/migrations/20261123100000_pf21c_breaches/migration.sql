-- PF-21c (map row 86; SA-11 §3.7, SA-11-14, SA-11-24, SA-11-25, SA-11-35, BR-11; SA7-D74 (b); P-600, P-601 (1)): ExpatReady's
-- breach register and the notices to affected firms. Additive: four enums, three tables, their indexes, checks and
-- triggers, six definers, two permission rows and one Sample platform email template. No existing table, function or
-- row is changed.
--
-- Walls: plat_breach, plat_breach_event and plat_breach_notice are our own registers (PF-12's OWN list,
-- tests/check_pf12_walls.ts): row-level security forced with no policy, so xr_app reads and writes nothing in them
-- directly. Narrow definers (owned by xr_wall_reader, search_path pinned, EXECUTE for xr_data's members only) are the only
-- ways in, as PF-21b's holds:
--   * plat_breach_open, plat_breach_change, plat_breach_list, plat_breach_events: our console's routes
--     (/api/system/register/breaches; @SystemKeys system/breach:manage or :read), which run with no firm. Each is refused
--     inside a firm's session. Who may call them with no firm is the code's gate (PF-4s's guard and the key).
--   * plat_breach_notice_ready and plat_breach_notice_record: the notice to one affected firm is written in THAT firm's own
--     transaction (its Owner and Admins are read and its outbox written there, under the firm's walls), so these two are
--     refused unless the session's firm is the firm named. They take the breach-and-firm lock, so two sends to one firm
--     wait for each other and the second finds the first's notice.
-- Rules: every breach is recorded (BR-11) and kept 7 years (SA-11-14): never deleted or truncated. A breach's discovery
-- time, origin and who opened it never change; a recorded breach never goes back to draft; a firm that was sent a notice
-- stays among the affected firms; the notification decision names who and why (SA-11-24 "notification decision"). Events
-- and notices are insert-only. A notice needs a recorded breach whose decision is to notify firms and that names the firm,
-- and one firm gets one notice per breach (unique). Times are the database's.
-- Seed (P-601 (1), read by the Lead before the label): system/breach:manage for the Platform Owner only and
-- system/breach:read for the Platform Owner and the Auditor (SA-07 v2.17 Appendix A row "ExpatReady's data-incident (breach)
-- register — Owner manages, Auditor read-only"; SA7-D74 (b); the read key's name is this row's mapping, SA-07 §10 "the
-- tech lead maps every Appendix A row to its system/* key"). One platform email template, the "Security incident notice"
-- (SA-11-25, SA-05 Appendix B.6), version 1 with Sample words: the wording is counsel's before the first real firm
-- (Unconfirmed: no counsel); the Platform Owner publishes later versions (PF-19c).
--
-- Rollback (by hand): DELETE the two permission rows and the template's version and row; DROP TABLE plat_breach_notice,
-- plat_breach_event, plat_breach (CASCADE drops their triggers); DROP the functions and the four enums.

-- CreateEnum
CREATE TYPE "PlatBreachStatus" AS ENUM ('DRAFT', 'RECORDED');
CREATE TYPE "PlatBreachSource" AS ENUM ('MANUAL', 'ALERT');
CREATE TYPE "PlatBreachDecision" AS ENUM ('UNDECIDED', 'NOTIFY_FIRMS', 'NO_NOTICE');
CREATE TYPE "PlatBreachEventKind" AS ENUM ('DRAFTED', 'RECORDED', 'CHANGED', 'NOTICE_SENT');

-- CreateTable
CREATE TABLE "plat_breach" (
    "id" UUID NOT NULL,
    "status" "PlatBreachStatus" NOT NULL,
    "source" "PlatBreachSource" NOT NULL,
    "source_alert" JSONB,
    "discovered_at" TIMESTAMPTZ NOT NULL,
    "description" TEXT NOT NULL,
    "affected_firms" UUID[] DEFAULT ARRAY[]::UUID[],
    "data_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "root_cause" TEXT,
    "containment" TEXT,
    "decision" "PlatBreachDecision" NOT NULL DEFAULT 'UNDECIDED',
    "decision_reason" TEXT,
    "decided_by" TEXT,
    "decided_at" TIMESTAMPTZ,
    "other_notifications" TEXT,
    "opened_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_breach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_breach_event" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "breach_id" UUID NOT NULL,
    "kind" "PlatBreachEventKind" NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "detail" JSONB NOT NULL,

    CONSTRAINT "plat_breach_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_breach_notice" (
    "id" UUID NOT NULL,
    "breach_id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "recipients" JSONB NOT NULL,
    "template_version_id" UUID NOT NULL,
    "sent_by" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_breach_notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plat_breach_status_discovered_at_idx" ON "plat_breach"("status", "discovered_at");
CREATE UNIQUE INDEX "plat_breach_event_breach_id_seq_key" ON "plat_breach_event"("breach_id", "seq");
CREATE UNIQUE INDEX "plat_breach_notice_breach_id_firm_id_key" ON "plat_breach_notice"("breach_id", "firm_id");
CREATE INDEX "plat_breach_notice_firm_id_idx" ON "plat_breach_notice"("firm_id");

-- AddForeignKey
ALTER TABLE "plat_breach_event" ADD CONSTRAINT "plat_breach_event_breach_id_fkey" FOREIGN KEY ("breach_id") REFERENCES "plat_breach"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "plat_breach_notice" ADD CONSTRAINT "plat_breach_notice_breach_id_fkey" FOREIGN KEY ("breach_id") REFERENCES "plat_breach"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Rules Prisma cannot say.
-- Texts are set and bounded; actors are AuditPort's actor words; the affected firms are distinct and not null; the data
-- categories come from the Sample list (BREACH_CATEGORIES in api/src/platform/register/breaches/service.ts), each once.
CREATE FUNCTION plat_breach_actor_ok(a text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
  SELECT a ~ '^(staff|seed|system):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
$fn$;
CREATE FUNCTION plat_breach_set_ok(a anyarray) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
  SELECT a IS NOT NULL AND array_position(a, NULL) IS NULL AND cardinality(a) = (SELECT count(DISTINCT x) FROM unnest(a) x) AND cardinality(a) <= 200
$fn$;
ALTER TABLE "plat_breach" ADD CONSTRAINT "plat_breach_facts_set" CHECK (
  btrim("description") <> '' AND char_length("description") <= 4000
  AND ("root_cause" IS NULL OR (btrim("root_cause") <> '' AND char_length("root_cause") <= 4000))
  AND ("containment" IS NULL OR (btrim("containment") <> '' AND char_length("containment") <= 4000))
  AND ("other_notifications" IS NULL OR (btrim("other_notifications") <> '' AND char_length("other_notifications") <= 4000))
  AND plat_breach_actor_ok("opened_by")
  AND plat_breach_set_ok("affected_firms") AND plat_breach_set_ok("data_categories")
  AND "data_categories" <@ ARRAY['identity_documents', 'contact_details', 'immigration_records', 'financial_details', 'sign_in_credentials', 'messages_and_files', 'other']::text[]
  AND (("source" = 'ALERT') = ("source_alert" IS NOT NULL)));
-- The decision: UNDECIDED names nobody; a decision names who, when and why (SA-11-24, BR-11).
ALTER TABLE "plat_breach" ADD CONSTRAINT "plat_breach_decision_whole" CHECK (
  ("decision" = 'UNDECIDED' AND "decided_by" IS NULL AND "decided_at" IS NULL AND "decision_reason" IS NULL)
  OR ("decision" <> 'UNDECIDED' AND plat_breach_actor_ok("decided_by") AND "decided_at" IS NOT NULL
      AND btrim("decision_reason") <> '' AND char_length("decision_reason") <= 2000));
ALTER TABLE "plat_breach_event" ADD CONSTRAINT "plat_breach_event_actor" CHECK (plat_breach_actor_ok("actor") AND jsonb_typeof("detail") = 'object');
ALTER TABLE "plat_breach_notice" ADD CONSTRAINT "plat_breach_notice_facts" CHECK (
  "channel" = 'EMAIL' AND plat_breach_actor_ok("sent_by") AND jsonb_typeof("recipients") = 'array' AND jsonb_array_length("recipients") BETWEEN 1 AND 200);

-- Each affected firm exists (PlatformFirm's file is not this row's: a check, not a relation; firms are never deleted).
CREATE FUNCTION plat_breach_firms_exist(p uuid[]) RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(p) f WHERE NOT EXISTS (SELECT 1 FROM platform_firm x WHERE x.id = f)) THEN
    RAISE EXCEPTION 'plat_breach: no such firm' USING ERRCODE = 'foreign_key_violation';
  END IF;
END $fn$;

-- At insert: the firms exist; the creation time is the database's; a discovery is not in the future.
CREATE FUNCTION plat_breach_opened() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_breach_firms_exist(NEW.affected_firms);
  NEW.created_at := clock_timestamp();
  NEW.updated_at := NEW.created_at;
  IF NEW.discovered_at > NEW.created_at + interval '5 minutes' THEN
    RAISE EXCEPTION 'plat_breach_opened: a breach is not discovered in the future' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.decision <> 'UNDECIDED' THEN NEW.decided_at := NEW.created_at; END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_breach_opened" BEFORE INSERT ON "plat_breach" FOR EACH ROW EXECUTE FUNCTION plat_breach_opened();

-- At update: the fixed facts never change; a recorded breach never goes back to draft; a notified firm stays affected.
CREATE FUNCTION plat_breach_changed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.id <> OLD.id OR NEW.source <> OLD.source OR NEW.source_alert IS DISTINCT FROM OLD.source_alert OR NEW.discovered_at <> OLD.discovered_at
     OR NEW.opened_by <> OLD.opened_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'plat_breach_changed: a breach''s discovery time, origin and opener never change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'RECORDED' AND NEW.status = 'DRAFT' THEN
    RAISE EXCEPTION 'plat_breach_changed: a recorded breach never goes back to draft' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM plat_breach_notice n WHERE n.breach_id = OLD.id AND NOT (n.firm_id = ANY (NEW.affected_firms))) THEN
    RAISE EXCEPTION 'plat_breach_changed: a firm that was sent a notice stays among the affected firms' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM plat_breach_notice n WHERE n.breach_id = OLD.id) AND NEW.decision <> 'NOTIFY_FIRMS' THEN
    RAISE EXCEPTION 'plat_breach_changed: notices were sent, so the decision stays "notify firms"' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM plat_breach_firms_exist(NEW.affected_firms);
  NEW.updated_at := clock_timestamp();
  IF NEW.decision IS DISTINCT FROM OLD.decision OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason THEN
    NEW.decided_at := CASE WHEN NEW.decision = 'UNDECIDED' THEN NULL ELSE NEW.updated_at END;
  ELSE
    NEW.decided_at := OLD.decided_at;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_breach_changed" BEFORE UPDATE ON "plat_breach" FOR EACH ROW EXECUTE FUNCTION plat_breach_changed();

-- Kept 7 years (SA-11-14): nothing deletes a breach; events and notices are insert-only.
CREATE FUNCTION plat_breach_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION 'plat_breach_kept: % is kept as written (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $fn$;
CREATE TRIGGER "plat_breach_kept" BEFORE DELETE ON "plat_breach" FOR EACH ROW EXECUTE FUNCTION plat_breach_kept();
CREATE TRIGGER "plat_breach_no_truncate" BEFORE TRUNCATE ON "plat_breach" FOR EACH STATEMENT EXECUTE FUNCTION plat_breach_kept();
CREATE TRIGGER "plat_breach_event_kept" BEFORE UPDATE OR DELETE ON "plat_breach_event" FOR EACH ROW EXECUTE FUNCTION plat_breach_kept();
CREATE TRIGGER "plat_breach_event_no_truncate" BEFORE TRUNCATE ON "plat_breach_event" FOR EACH STATEMENT EXECUTE FUNCTION plat_breach_kept();
CREATE TRIGGER "plat_breach_notice_kept" BEFORE UPDATE OR DELETE ON "plat_breach_notice" FOR EACH ROW EXECUTE FUNCTION plat_breach_kept();
CREATE TRIGGER "plat_breach_notice_no_truncate" BEFORE TRUNCATE ON "plat_breach_notice" FOR EACH STATEMENT EXECUTE FUNCTION plat_breach_kept();
REVOKE UPDATE, DELETE, TRUNCATE ON "plat_breach_event", "plat_breach_notice" FROM xr_data;
REVOKE DELETE, TRUNCATE ON "plat_breach" FROM xr_data;

-- Event and notice times are the database's; a notice needs a recorded breach decided "notify firms" that names its firm.
CREATE FUNCTION plat_breach_event_stamped() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  NEW.at := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_breach_event_stamped" BEFORE INSERT ON "plat_breach_event" FOR EACH ROW EXECUTE FUNCTION plat_breach_event_stamped();
CREATE FUNCTION plat_breach_notice_allowed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM plat_breach b WHERE b.id = NEW.breach_id AND b.status = 'RECORDED' AND b.decision = 'NOTIFY_FIRMS' AND NEW.firm_id = ANY (b.affected_firms)) THEN
    RAISE EXCEPTION 'plat_breach_notice_allowed: a notice needs a recorded breach, decided "notify firms", that names this firm' USING ERRCODE = 'check_violation';
  END IF;
  NEW.sent_at := clock_timestamp();
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_breach_notice_allowed" BEFORE INSERT ON "plat_breach_notice" FOR EACH ROW EXECUTE FUNCTION plat_breach_notice_allowed();

-- Our own registers: forced, no policy (PF-12's OWN list).
ALTER TABLE "plat_breach" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_breach" FORCE ROW LEVEL SECURITY;
ALTER TABLE "plat_breach_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_breach_event" FORCE ROW LEVEL SECURITY;
ALTER TABLE "plat_breach_notice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plat_breach_notice" FORCE ROW LEVEL SECURITY;

-- Seed (P-601 (1)): the two keys, and the Sample "Security incident notice" template (platform-owned, no firm). Run in its
-- own DO statement, lifting FORCE and PF-12's firm gate for the walled tables it writes when the runner is neither
-- superuser nor BYPASSRLS (PF-8b F7, #3068; the shape of 20261122180000_pf21b_legal_holds).
DO $$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['plat_system_role_permission', 'msg_template', 'msg_template_version']; gated text[] := '{}'; tpl uuid := gen_random_uuid();
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
  INSERT INTO "plat_system_role_permission" ("role_code", "permission_key") VALUES
    ('platform-owner', 'system/breach:manage'), ('platform-owner', 'system/breach:read'), ('platform-auditor', 'system/breach:read');
  INSERT INTO "msg_template" ("id", "firm_id", "owner", "key", "kind", "channel", "language", "updated_at")
    VALUES (tpl, NULL, 'PLATFORM', 'platform.security_incident_notice', 'security_incident_notice', 'EMAIL', 'en', now());
  INSERT INTO "msg_template_version" ("id", "firm_id", "template_id", "version", "subject", "body", "must_keep", "published_by")
    VALUES (gen_random_uuid(), NULL, tpl, 1, 'Security incident notice from ExpatReady',
      E'Sample wording (Unconfirmed: no counsel).\n\nTo the Owner and Admins of {{ firm_name }}:\n\nExpatReady found a security incident on {{ discovered_on }} that affects your firm''s account.\n\nWhat happened: {{ description }}\n\nData that may be affected: {{ data_categories }}\n\nWhat we have done: {{ containment }}\n\nYour firm decides whether and how to tell its clients; the template library has a starter, "Notice to clients about a data incident".\n\nBreach reference: {{ breach_ref }}',
      ARRAY['firm_name', 'discovered_on', 'description', 'data_categories', 'containment', 'breach_ref'], 'seed:pf21c');
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END $$;

-- Our console's writes and reads (system plane only: refused inside a firm's session).
CREATE FUNCTION plat_breach_system_only() RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF platform_session_firm() IS NOT NULL THEN
    RAISE EXCEPTION 'plat_breach: only ExpatReady''s own staff open, change or read the breach register' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $fn$;

-- One breach as our console shows it: its facts and its notices (never the recipients' addresses: staff ids only).
CREATE FUNCTION plat_breach_json(b plat_breach) RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
  SELECT to_jsonb(b) || jsonb_build_object('notices', coalesce((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'firm_id', n.firm_id, 'channel', n.channel,
    'recipients', n.recipients, 'template_version_id', n.template_version_id, 'sent_by', n.sent_by, 'sent_at', n.sent_at) ORDER BY n.sent_at, n.id)
    FROM plat_breach_notice n WHERE n.breach_id = b.id), '[]'::jsonb))
$fn$;

-- Opens a breach (DRAFT from an alert, or RECORDED by hand) and writes its first event. Returns the breach.
CREATE FUNCTION plat_breach_open(p_status text, p_source text, p_alert jsonb, p_discovered timestamptz, p_description text, p_firms uuid[],
                                 p_categories text[], p_root text, p_containment text, p_other text, p_by text) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE b plat_breach;
BEGIN
  PERFORM plat_breach_system_only();
  INSERT INTO plat_breach AS x (id, status, source, source_alert, discovered_at, description, affected_firms, data_categories, root_cause, containment, other_notifications, opened_by)
    VALUES (gen_random_uuid(), p_status::"PlatBreachStatus", p_source::"PlatBreachSource", p_alert, p_discovered, p_description, coalesce(p_firms, '{}'),
            coalesce(p_categories, '{}'), p_root, p_containment, p_other, p_by)
    RETURNING x.* INTO b;
  INSERT INTO plat_breach_event (id, breach_id, kind, actor, detail)
    VALUES (gen_random_uuid(), b.id, CASE WHEN b.status = 'DRAFT' THEN 'DRAFTED' ELSE 'RECORDED' END::"PlatBreachEventKind", p_by,
            jsonb_build_object('after', to_jsonb(b) - 'updated_at'));
  RETURN plat_breach_json(b);
END $fn$;

-- Changes a breach: the fields present in p_patch (status, description, affected_firms, data_categories, root_cause,
-- containment, decision with decision_reason, other_notifications), under the breach's row lock. One CHANGED event (or
-- RECORDED, when a draft is confirmed) with each changed field before and after. NULL: no such breach.
CREATE FUNCTION plat_breach_change(p_id uuid, p_patch jsonb, p_by text) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE o plat_breach; n plat_breach; before jsonb := '{}'; after jsonb := '{}'; k text;
BEGIN
  PERFORM plat_breach_system_only();
  SELECT * INTO o FROM plat_breach WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE plat_breach x SET
    status = CASE WHEN p_patch ? 'status' THEN (p_patch->>'status')::"PlatBreachStatus" ELSE x.status END,
    description = CASE WHEN p_patch ? 'description' THEN p_patch->>'description' ELSE x.description END,
    affected_firms = CASE WHEN p_patch ? 'affected_firms' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'affected_firms')::uuid) ELSE x.affected_firms END,
    data_categories = CASE WHEN p_patch ? 'data_categories' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'data_categories')) ELSE x.data_categories END,
    root_cause = CASE WHEN p_patch ? 'root_cause' THEN p_patch->>'root_cause' ELSE x.root_cause END,
    containment = CASE WHEN p_patch ? 'containment' THEN p_patch->>'containment' ELSE x.containment END,
    other_notifications = CASE WHEN p_patch ? 'other_notifications' THEN p_patch->>'other_notifications' ELSE x.other_notifications END,
    decision = CASE WHEN p_patch ? 'decision' THEN (p_patch->>'decision')::"PlatBreachDecision" ELSE x.decision END,
    decision_reason = CASE WHEN p_patch ? 'decision' THEN p_patch->>'decision_reason' ELSE x.decision_reason END,
    decided_by = CASE WHEN p_patch ? 'decision' THEN (CASE WHEN p_patch->>'decision' = 'UNDECIDED' THEN NULL ELSE p_by END) ELSE x.decided_by END,
    decided_at = CASE WHEN p_patch ? 'decision' AND p_patch->>'decision' <> 'UNDECIDED' THEN clock_timestamp() WHEN p_patch ? 'decision' THEN NULL ELSE x.decided_at END
  WHERE x.id = p_id RETURNING x.* INTO n;
  FOR k IN SELECT jsonb_object_keys(to_jsonb(n) - 'updated_at' - 'decided_at') LOOP
    IF to_jsonb(n)->k IS DISTINCT FROM to_jsonb(o)->k THEN
      before := before || jsonb_build_object(k, to_jsonb(o)->k);
      after := after || jsonb_build_object(k, to_jsonb(n)->k);
    END IF;
  END LOOP;
  IF after <> '{}'::jsonb THEN
    INSERT INTO plat_breach_event (id, breach_id, kind, actor, detail)
      VALUES (gen_random_uuid(), p_id, CASE WHEN o.status = 'DRAFT' AND n.status = 'RECORDED' THEN 'RECORDED' ELSE 'CHANGED' END::"PlatBreachEventKind", p_by,
              jsonb_build_object('before', before, 'after', after));
  END IF;
  RETURN plat_breach_json(n) || jsonb_build_object('changed', after <> '{}'::jsonb);
END $fn$;

-- Breaches newest discovered first (all, or one by p_id); at most p_limit (1 to 501).
CREATE FUNCTION plat_breach_list(p_id uuid, p_limit int) RETURNS SETOF jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_breach_system_only();
  RETURN QUERY SELECT plat_breach_json(b) FROM plat_breach b WHERE p_id IS NULL OR b.id = p_id
    ORDER BY b.discovered_at DESC, b.id LIMIT least(greatest(coalesce(p_limit, 501), 1), 501);
END $fn$;

-- A breach's events, oldest first.
CREATE FUNCTION plat_breach_events(p_id uuid) RETURNS TABLE (seq bigint, kind text, at timestamptz, actor text, detail jsonb)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM plat_breach_system_only();
  RETURN QUERY SELECT e.seq, e.kind::text, e.at, e.actor, e.detail FROM plat_breach_event e WHERE e.breach_id = p_id ORDER BY e.seq;
END $fn$;

-- The notice path, in the affected firm's own session only (its staff are read and its outbox written there).
CREATE FUNCTION plat_breach_own_firm(p_firm uuid) RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF p_firm IS NULL OR platform_session_firm() IS NULL OR p_firm <> platform_session_firm() THEN
    RAISE EXCEPTION 'plat_breach_notice: only in the notified firm''s own session' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $fn$;

-- Whether this firm may get this breach's notice now, under the breach-and-firm lock (held to the end of the caller's
-- transaction, so a parallel send waits and then finds this one's notice): READY with the breach's facts for the notice,
-- or NOT_FOUND, DRAFT, NOT_DECIDED_TO_NOTIFY, NOT_AFFECTED, ALREADY_SENT.
CREATE FUNCTION plat_breach_notice_ready(p_breach uuid, p_firm uuid) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE b plat_breach;
BEGIN
  PERFORM plat_breach_own_firm(p_firm);
  PERFORM pg_advisory_xact_lock(hashtext('breach-notice:' || lower(p_breach::text) || ':' || lower(p_firm::text)));
  SELECT * INTO b FROM plat_breach WHERE id = p_breach;
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'NOT_FOUND'); END IF;
  IF b.status <> 'RECORDED' THEN RETURN jsonb_build_object('state', 'DRAFT'); END IF;
  IF b.decision <> 'NOTIFY_FIRMS' THEN RETURN jsonb_build_object('state', 'NOT_DECIDED_TO_NOTIFY'); END IF;
  IF NOT (p_firm = ANY (b.affected_firms)) THEN RETURN jsonb_build_object('state', 'NOT_AFFECTED'); END IF;
  IF EXISTS (SELECT 1 FROM plat_breach_notice n WHERE n.breach_id = p_breach AND n.firm_id = p_firm) THEN RETURN jsonb_build_object('state', 'ALREADY_SENT'); END IF;
  RETURN jsonb_build_object('state', 'READY', 'discovered_at', b.discovered_at, 'description', b.description, 'data_categories', to_jsonb(b.data_categories),
    'containment', b.containment);
END $fn$;

-- Records the notice to one firm (insert-only; one per breach and firm) and its NOTICE_SENT event. p_by is one of our
-- staff (an existing plat_system_staff id), never a firm's.
CREATE FUNCTION plat_breach_notice_record(p_breach uuid, p_firm uuid, p_recipients jsonb, p_template_version uuid, p_by text)
  RETURNS TABLE (id uuid, sent_at timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE r plat_breach_notice;
BEGIN
  PERFORM plat_breach_own_firm(p_firm);
  IF p_by !~ '^staff:[0-9a-f-]{36}$' OR NOT EXISTS (SELECT 1 FROM plat_system_staff s WHERE s.id::text = substr(p_by, 7)) THEN
    RAISE EXCEPTION 'plat_breach_notice_record: a notice is sent by one of ExpatReady''s own staff' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('breach-notice:' || lower(p_breach::text) || ':' || lower(p_firm::text)));
  INSERT INTO plat_breach_notice AS n (id, breach_id, firm_id, recipients, template_version_id, sent_by)
    VALUES (gen_random_uuid(), p_breach, p_firm, p_recipients, p_template_version, p_by) RETURNING n.* INTO r;
  INSERT INTO plat_breach_event (id, breach_id, kind, actor, detail)
    VALUES (gen_random_uuid(), p_breach, 'NOTICE_SENT', p_by, jsonb_build_object('notice', r.id, 'firm', p_firm, 'recipients', jsonb_array_length(p_recipients), 'templateVersion', p_template_version));
  RETURN QUERY SELECT r.id, r.sent_at;
END $fn$;

-- PF-8b F4 (RDS): a non-superuser may hand a function to xr_wall_reader only while it holds CREATE on public; granted for
-- the hand-over and taken back after (a no-op pair on a superuser cluster; tests/check_pf8b_f4_migrations.ts).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $own$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['plat_breach_system_only()', 'plat_breach_json(plat_breach)',
                           'plat_breach_open(text, text, jsonb, timestamptz, text, uuid[], text[], text, text, text, text)',
                           'plat_breach_change(uuid, jsonb, text)', 'plat_breach_list(uuid, integer)', 'plat_breach_events(uuid)',
                           'plat_breach_own_firm(uuid)', 'plat_breach_notice_ready(uuid, uuid)',
                           'plat_breach_notice_record(uuid, uuid, jsonb, uuid, text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO xr_data', f);
  END LOOP;
END
$own$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
