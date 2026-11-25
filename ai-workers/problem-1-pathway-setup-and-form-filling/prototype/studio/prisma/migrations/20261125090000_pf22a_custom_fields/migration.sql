-- PF-22a part 1 (R1.95, map row 95; Doc-1 "per-entity custom fields", ADR C1-2; AG-2-23; P-570, P-584 (2); schema file
-- prisma/schema/platform-custom.prisma, owner Lead B (platform)): the tables of a firm's own fields and of saved views
-- (PF-22v's table joins this migration so the area has one migration in flight, P-228). Additive: one enum, three new
-- tables, their keys and indexes, checks, pf_custom_ functions and triggers, PF-12's wall on each, and one permission key.
-- No existing table, row or function is changed.
--   * plat_custom_field: key and entity kind are names; label 1-80 characters, help text at most 300; options a JSON list
--     of 1-100 distinct labels (each 1-80) for a SELECT or MULTI_SELECT and [] for every other type
--     (pf_custom_options_ok). Never deleted or truncated (archive instead: archived_at; its values kept). Its firm, kind,
--     key, creator and created time never change; its type never changes once it has a value; an option a value uses is
--     never removed from its list (archive the field and add a new one, PF-22a's rule).
--   * plat_custom_value: the value is checked against its field's type and options (pf_custom_value_ok, the same rules as
--     the API's zod schema: TEXT 1-500 characters, LONG_TEXT 1-5000, NUMBER a finite JSON number, DATE an ISO calendar
--     day, SELECT one option, MULTI_SELECT 1+ distinct options, CHECKBOX true or false, EMAIL, PHONE and URL their plain
--     shapes); its entity kind is its field's; a value of an archived field is not written; its firm, field, kind and
--     record never change. A cleared value is a deleted row.
--   * plat_saved_view: name 1-80 characters, list kind a name, filter a JSON object, columns a list of at most 50 names,
--     sort null or an object; its firm, list kind, creator and created time never change. owner_staff_id null = shared.
--   * Staff keys are the pair (firm_id, staff_id) → platform_staff(firm_id, id) (PF-3's rule); a value's field is the
--     (firm_id, field_id) pair, so nothing of firm A names anything of firm B.
--   * PF-12's wall on all three: a forced policy naming the session's firm and the firm-first gate; the trigger functions
--     run as xr_wall_reader with EXECUTE revoked from PUBLIC (PF-10a's pattern, break R2-F1).
-- Keys: agent/custom-field:manage is added for OWNER and ADMIN (Sample, question 8; scope NONE, class GENERAL). Sharing a
-- front-office view uses agent/prospect:configure-pipeline, already a catalogue row (PF-3's seed).
-- New, empty tables: their keys validate no rows, so no FORCE lift (PF-8b F7) is needed; the only data statements are the
-- key's two catalogue inserts.
-- Rollback: rollback.sql in this folder.

-- CreateEnum
CREATE TYPE "PlatCustomFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'CHECKBOX', 'EMAIL', 'PHONE', 'URL');

-- CreateTable
CREATE TABLE "plat_custom_field" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "entity_kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "PlatCustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB NOT NULL DEFAULT '[]',
    "help_text" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "plat_custom_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_custom_value" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "entity_kind" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "plat_custom_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_saved_view" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "owner_staff_id" UUID,
    "list_kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "columns" JSONB NOT NULL DEFAULT '[]',
    "sort" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "plat_saved_view_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plat_custom_field_firm_id_entity_kind_position_idx" ON "plat_custom_field"("firm_id", "entity_kind", "position");

-- CreateIndex
CREATE UNIQUE INDEX "plat_custom_field_firm_id_id_key" ON "plat_custom_field"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_custom_field_firm_id_entity_kind_key_key" ON "plat_custom_field"("firm_id", "entity_kind", "key");

-- CreateIndex
CREATE INDEX "plat_custom_value_firm_id_entity_kind_entity_id_idx" ON "plat_custom_value"("firm_id", "entity_kind", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_custom_value_firm_id_field_id_entity_id_key" ON "plat_custom_value"("firm_id", "field_id", "entity_id");

-- CreateIndex
CREATE INDEX "plat_saved_view_firm_id_list_kind_owner_staff_id_idx" ON "plat_saved_view"("firm_id", "list_kind", "owner_staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_saved_view_firm_id_id_key" ON "plat_saved_view"("firm_id", "id");

-- AddForeignKey
ALTER TABLE "plat_custom_field" ADD CONSTRAINT "plat_custom_field_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "plat_custom_field" ADD CONSTRAINT "plat_custom_field_firm_id_created_by_fkey" FOREIGN KEY ("firm_id", "created_by") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "plat_custom_value" ADD CONSTRAINT "plat_custom_value_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "plat_custom_value" ADD CONSTRAINT "plat_custom_value_firm_id_field_id_fkey" FOREIGN KEY ("firm_id", "field_id") REFERENCES "plat_custom_field"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "plat_custom_value" ADD CONSTRAINT "plat_custom_value_firm_id_updated_by_fkey" FOREIGN KEY ("firm_id", "updated_by") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "plat_saved_view" ADD CONSTRAINT "plat_saved_view_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "platform_firm"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "plat_saved_view" ADD CONSTRAINT "plat_saved_view_firm_id_owner_staff_id_fkey" FOREIGN KEY ("firm_id", "owner_staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "plat_saved_view" ADD CONSTRAINT "plat_saved_view_firm_id_created_by_fkey" FOREIGN KEY ("firm_id", "created_by") REFERENCES "platform_staff"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- The shapes (immutable, no table read: usable in checks).
CREATE FUNCTION pf_custom_name_ok(n text, max_len int) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog AS $fn$ SELECT n ~ '^[a-z][a-z0-9_.]*$' AND length(n) <= max_len $fn$;

CREATE FUNCTION pf_custom_options_ok(t "PlatCustomFieldType", o jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog AS $fn$
DECLARE n int;
BEGIN
  IF o IS NULL OR jsonb_typeof(o) <> 'array' THEN RETURN false; END IF;
  n := jsonb_array_length(o);
  IF t NOT IN ('SELECT', 'MULTI_SELECT') THEN RETURN n = 0; END IF;
  IF n < 1 OR n > 100 THEN RETURN false; END IF;
  RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(o) e
                      WHERE jsonb_typeof(e) <> 'string' OR length(btrim(e #>> '{}')) < 1 OR length(e #>> '{}') > 80
                         OR e #>> '{}' <> btrim(e #>> '{}'))
     AND (SELECT count(DISTINCT lower(e #>> '{}')) FROM jsonb_array_elements(o) e) = n;
END $fn$;

CREATE FUNCTION pf_custom_value_ok(t "PlatCustomFieldType", o jsonb, v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog AS $fn$
DECLARE s text; d date; n int;
BEGIN
  IF v IS NULL THEN RETURN false; END IF;
  IF t = 'CHECKBOX' THEN RETURN jsonb_typeof(v) = 'boolean'; END IF;
  IF t = 'NUMBER' THEN RETURN jsonb_typeof(v) = 'number' AND abs((v #>> '{}')::numeric) < 1e15; END IF;
  IF t = 'MULTI_SELECT' THEN
    IF jsonb_typeof(v) <> 'array' THEN RETURN false; END IF;
    n := jsonb_array_length(v);
    RETURN n >= 1
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e) <> 'string' OR NOT (o @> jsonb_build_array(e)))
       AND (SELECT count(DISTINCT e) FROM jsonb_array_elements(v) e) = n;
  END IF;
  IF jsonb_typeof(v) <> 'string' THEN RETURN false; END IF;
  s := v #>> '{}';
  IF length(btrim(s)) < 1 THEN RETURN false; END IF;
  CASE t
    WHEN 'TEXT' THEN RETURN length(s) <= 500;
    WHEN 'LONG_TEXT' THEN RETURN length(s) <= 5000;
    WHEN 'SELECT' THEN RETURN o @> jsonb_build_array(s);
    WHEN 'EMAIL' THEN RETURN length(s) <= 254 AND s ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
    WHEN 'PHONE' THEN RETURN s ~ '^\+?[0-9(][0-9 ().-]{3,29}$';
    WHEN 'URL' THEN RETURN length(s) <= 2000 AND s ~* '^https?://[^[:space:]]+$';
    WHEN 'DATE' THEN
      IF s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
      BEGIN d := s::date; EXCEPTION WHEN others THEN RETURN false; END;
      RETURN to_char(d, 'YYYY-MM-DD') = s;
    ELSE RETURN false;
  END CASE;
END $fn$;

CREATE FUNCTION pf_custom_names_ok(a jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog AS $fn$
  SELECT jsonb_typeof(a) = 'array' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a) e
    WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') ~ '^[A-Za-z][A-Za-z0-9_.:-]*$' AND length(e #>> '{}') <= 64)) $fn$;

ALTER TABLE "plat_custom_field"
  ADD CONSTRAINT "plat_custom_field_shape" CHECK (
    pf_custom_name_ok("entity_kind", 64) AND "key" ~ '^[a-z][a-z0-9_]*$' AND length("key") <= 40
    AND length(btrim("label")) BETWEEN 1 AND 80 AND "label" = btrim("label")
    AND ("help_text" IS NULL OR length("help_text") <= 300) AND "position" >= 0),
  ADD CONSTRAINT "plat_custom_field_options" CHECK (pf_custom_options_ok("type", "options"));
ALTER TABLE "plat_custom_value"
  ADD CONSTRAINT "plat_custom_value_kind" CHECK (pf_custom_name_ok("entity_kind", 64));
ALTER TABLE "plat_saved_view"
  ADD CONSTRAINT "plat_saved_view_shape" CHECK (
    pf_custom_name_ok("list_kind", 64) AND length(btrim("name")) BETWEEN 1 AND 80 AND "name" = btrim("name")
    AND jsonb_typeof("filter") = 'object' AND ("sort" IS NULL OR jsonb_typeof("sort") = 'object')
    AND jsonb_typeof("columns") = 'array' AND jsonb_array_length("columns") <= 50),
  ADD CONSTRAINT "plat_saved_view_columns" CHECK (pf_custom_names_ok("columns"));

-- A field is never removed (archive instead); its firm, kind, key, creator and created time never change; its type never
-- changes once a value exists; an option a value uses stays in its list. The field's values are locked FOR SHARE meanwhile.
CREATE FUNCTION pf_custom_field_kept() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_RELID IS DISTINCT FROM 'public.plat_custom_field'::regclass THEN
    RAISE EXCEPTION 'pf_custom_field_kept: plat_custom_field''s own trigger only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'plat_custom_field: a field is archived, never removed (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."firm_id" IS DISTINCT FROM OLD."firm_id" OR NEW."entity_kind" IS DISTINCT FROM OLD."entity_kind"
     OR NEW."key" IS DISTINCT FROM OLD."key" OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'plat_custom_field: a field''s firm, record kind, key and creator never change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."type" IS DISTINCT FROM OLD."type" AND EXISTS (
       SELECT 1 FROM "plat_custom_value" v WHERE v."firm_id" = OLD."firm_id" AND v."field_id" = OLD."id" FOR SHARE) THEN
    RAISE EXCEPTION 'plat_custom_field: the type of a field with values never changes (archive it and add a new one)' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."options" IS DISTINCT FROM OLD."options" AND EXISTS (
       SELECT 1 FROM "plat_custom_value" v
        WHERE v."firm_id" = OLD."firm_id" AND v."field_id" = OLD."id"
          AND NOT pf_custom_value_ok(NEW."type", NEW."options", v."value") FOR SHARE) THEN
    RAISE EXCEPTION 'plat_custom_field: an option in use is never removed (archive the field and add a new one)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_custom_field_kept" BEFORE UPDATE OR DELETE ON "plat_custom_field" FOR EACH ROW EXECUTE FUNCTION pf_custom_field_kept();
CREATE TRIGGER "plat_custom_field_no_truncate" BEFORE TRUNCATE ON "plat_custom_field" FOR EACH STATEMENT EXECUTE FUNCTION pf_custom_field_kept();
REVOKE DELETE, TRUNCATE ON "plat_custom_field" FROM xr_data;

-- A value is checked against its field (read in the same firm, locked FOR SHARE so its type and options stay as read until
-- this write commits): the same record kind, a field not archived, a value of the field's type and options. Its firm,
-- field, kind and record never change.
CREATE FUNCTION pf_custom_value_checked() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE f record;
BEGIN
  IF TG_RELID IS DISTINCT FROM 'public.plat_custom_value'::regclass THEN
    RAISE EXCEPTION 'pf_custom_value_checked: plat_custom_value''s own trigger only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF platform_session_firm() IS NOT NULL AND NEW."firm_id" IS DISTINCT FROM platform_session_firm() THEN
    RAISE EXCEPTION 'pf_custom_value_checked: only the session''s own firm' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."firm_id" IS DISTINCT FROM OLD."firm_id" OR NEW."field_id" IS DISTINCT FROM OLD."field_id"
       OR NEW."entity_kind" IS DISTINCT FROM OLD."entity_kind" OR NEW."entity_id" IS DISTINCT FROM OLD."entity_id") THEN
    RAISE EXCEPTION 'plat_custom_value: a value''s firm, field and record never change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT c."entity_kind", c."type", c."options", c."archived_at" INTO f
    FROM "plat_custom_field" c WHERE c."firm_id" = NEW."firm_id" AND c."id" = NEW."field_id" FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;   -- no such field of this firm: the (firm_id, field_id) key refuses it
  IF f."entity_kind" IS DISTINCT FROM NEW."entity_kind" THEN
    RAISE EXCEPTION 'plat_custom_value: the value''s record kind is not its field''s' USING ERRCODE = 'check_violation';
  END IF;
  IF f."archived_at" IS NOT NULL THEN
    RAISE EXCEPTION 'plat_custom_value: the field is archived (un-archive it first)' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT pf_custom_value_ok(f."type", f."options", NEW."value") THEN
    RAISE EXCEPTION 'plat_custom_value: the value does not fit its field''s type (%)', f."type" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_custom_value_checked" BEFORE INSERT OR UPDATE ON "plat_custom_value" FOR EACH ROW EXECUTE FUNCTION pf_custom_value_checked();

-- A saved view's firm, list, creator and created time never change.
CREATE FUNCTION pf_custom_view_kept() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."firm_id" IS DISTINCT FROM OLD."firm_id" OR NEW."list_kind" IS DISTINCT FROM OLD."list_kind"
     OR NEW."created_by" IS DISTINCT FROM OLD."created_by" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'plat_saved_view: a view''s firm, list and creator never change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "plat_saved_view_kept" BEFORE UPDATE ON "plat_saved_view" FOR EACH ROW EXECUTE FUNCTION pf_custom_view_kept();

-- PF-12's wall (forced policy naming the session's firm; the firm-first gate before the area's own triggers); the trigger
-- functions run as xr_wall_reader (tests/check_pf12_walls.ts).
ALTER TABLE "plat_custom_field" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_custom_field" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "plat_custom_value" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_custom_value" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
ALTER TABLE "plat_saved_view" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "plat_saved_view" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "plat_custom_field" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "plat_custom_value" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "plat_saved_view" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
-- PF-8b F4 (RDS): a non-superuser may hand a function to xr_wall_reader only while it holds CREATE on public; grant it
-- for the hand-over and take it back after (a no-op pair on a superuser cluster; tests/check_pf8b_f4_migrations.ts).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
DO $readers$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['pf_custom_field_kept()', 'pf_custom_value_checked()', 'pf_custom_view_kept()'] LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp', f);
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', f);
    -- No one calls a trigger function directly; a trigger fires it without EXECUTE (PF-10a break R2-F1).
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END
$readers$;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;

-- The key (Sample, question 8): who adds, orders and archives a firm's fields.
INSERT INTO "platform_permission_key" ("key", "scope", "class") VALUES ('agent/custom-field:manage', 'NONE', 'GENERAL');
INSERT INTO "platform_role_permission" ("role", "permission_key") VALUES
  ('OWNER', 'agent/custom-field:manage'), ('ADMIN', 'agent/custom-field:manage');
