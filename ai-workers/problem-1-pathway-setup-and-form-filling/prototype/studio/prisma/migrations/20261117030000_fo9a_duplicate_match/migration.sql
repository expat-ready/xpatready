-- FO-9a (BACKLOG row FO-9a; P-574 (2); AG-2-78, AG-2-96): the keys the duplicate warning reads, on FO-1a's tables only.
--   * pg_trgm, for the similar-name match (similarity at or above the Sample threshold 0.6, ports/matching.ts).
--   * fo_person.phone_e164: the phone in E.164 when FO-2 stored it as readable (FO-2 keeps a readable number in E.164,
--     sales/common.ts phone()), else empty; kept by the database on every write, backfilled here. The match normalises
--     what is typed with libphonenumber-js (default region CA) and compares it with this column.
--   * trigram indexes (within the firm) on a person's name and a company's normalised name. The email index is FO-1a's
--     (firm_id, email): fo_person.email is lower-cased by FO-1a's own check, so equality reads it.
--   * two narrow definer functions that run the match (break B1, below).
-- No row changes but the backfilled column; nothing is linked or merged (AG16-44).
-- In its own schema, not public: an extension's ~30 functions in public read to other rows' schema checks as functions
-- their migration added (check_fo7a_money_schema, CI shard 4 on ddd640fd). The match functions name it on their path.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO xr_data;

ALTER TABLE "fo_person" ADD COLUMN "phone_e164" TEXT;
ALTER TABLE "fo_person" ADD CONSTRAINT "fo_person_phone_e164_check" CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{6,14}$');

CREATE FUNCTION fo_sales_phone_e164(phone text, readable boolean) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN readable AND phone ~ '^\+[1-9][0-9]{6,14}$' THEN phone END
$$;
-- A person's name as the match reads it (break B2: the cloud and CI clusters have C ctype, where pg_trgm makes no trigram
-- of a non-ASCII letter, so 李明 never met 李明): decomposed (NFKD) and lower-cased by ICU, accents folded (combining
-- marks U+0300-036F dropped: José → jose), invisible and format marks dropped (zero-width, soft hyphen, line and
-- direction marks: break N2), every other character outside a-z and 0-9 spelled as 0 + its code point in hex (李 → 0674e),
-- punctuation as a space, spaces collapsed. A key with a digit came from such a letter (or a digit): it matches only
-- exactly, never by trigram, as hex digits are shared by unrelated letters (break N1: أحمد خالد met محمد خان at 0.69).
-- ports/matching.ts personNameKey is the same rule; the test pins them equal.
ALTER TABLE "fo_person" ADD COLUMN "name_key" TEXT;
CREATE FUNCTION fo_sales_name_key(given text, family text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $fn$
DECLARE s text := regexp_replace(regexp_replace(lower(normalize(coalesce(given, '') || ' ' || coalesce(family, ''), NFKD) COLLATE "und-x-icu"), '[\u0300-\u036f]', '', 'g'),
                   '[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f-\u1160\u17b4-\u17b5\u180b-\u180f\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]', '', 'g');
        out text := ''; ch text;
BEGIN
  FOREACH ch IN ARRAY regexp_split_to_array(s, '') LOOP
    out := out || CASE WHEN ch ~ '^[a-z0-9]$' THEN ch WHEN ascii(ch) > 127 AND ch !~ '^\s$' THEN '0' || to_hex(ascii(ch)) ELSE ' ' END;
  END LOOP;
  RETURN btrim(regexp_replace(out, ' +', ' ', 'g'));
END $fn$;
CREATE FUNCTION fo_sales_person_keys() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."phone_e164" := fo_sales_phone_e164(NEW."phone", NEW."phone_readable");   -- never set by a writer
  NEW."name_key" := fo_sales_name_key(NEW."given_names", NEW."family_name");
  RETURN NEW;
END $$;
CREATE TRIGGER "fo_person_keys" BEFORE INSERT OR UPDATE OF "phone", "phone_readable", "phone_e164", "given_names", "family_name", "name_key" ON "fo_person"
  FOR EACH ROW EXECUTE FUNCTION fo_sales_person_keys();
-- PF-12: a trigger function on a firm table runs as xr_wall_reader (tests/check_pf12_walls.ts).
ALTER FUNCTION fo_sales_person_keys() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION fo_sales_person_keys() OWNER TO xr_wall_reader;
-- PF-8b F7 (Amazon RDS: the admin is neither superuser nor BYPASSRLS): every person's keys are filled. Such a runner owns the walled tables but,
-- under FORCE ROW LEVEL SECURITY, would read and change none of their rows; it lifts FORCE on them inside this one statement
-- (ACCESS EXCLUSIVE first, so nobody sees the walls lifted) and puts it back after. A superuser or BYPASSRLS runner does
-- exactly what it did. tests/check_pf8b_f7_data_walls.ts fails when a data statement on a walled table runs without this.
DO $pf8b_f7$
DECLARE t text; lifted text[] := '{}'; walls text[] := ARRAY['fo_person']; gated text[] := '{}';
BEGIN
  IF NOT (SELECT pf8b_role.rolsuper OR pf8b_role.rolbypassrls FROM pg_roles pf8b_role WHERE pf8b_role.rolname = current_user) THEN
    EXECUTE (SELECT 'LOCK TABLE ' || string_agg(format('%I', pf8b_w), ', ') || ' IN ACCESS EXCLUSIVE MODE' FROM unnest(walls) pf8b_w);
    SELECT coalesce(array_agg(pf8b_c.relname::text ORDER BY pf8b_c.relname), '{}') INTO lifted FROM pg_class pf8b_c
      WHERE pf8b_c.relnamespace = 'public'::regnamespace AND pf8b_c.relname = ANY (walls) AND pf8b_c.relforcerowsecurity;
    FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t); END LOOP;
    -- …and PF-12's firm gate, which refuses a write by such a runner with no session firm and lets a superuser or
    -- BYPASSRLS one through (platform_firm_first), steps aside on them too while plainly enabled (an ALWAYS gate stays and
    -- refuses loudly; a REPLICA one does not fire): the runner then writes as those do, and each comes back as it was.
    SELECT coalesce(array_agg(pf8b_g.tgrelid::regclass::text ORDER BY 1), '{}') INTO gated FROM pg_trigger pf8b_g
      WHERE pf8b_g.tgname = '0_pf12_firm_first' AND pf8b_g.tgenabled = 'O' AND pf8b_g.tgrelid::regclass::text = ANY (walls);
    FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  END IF;
  UPDATE "fo_person" SET "phone_e164" = fo_sales_phone_e164("phone", "phone_readable"), "name_key" = fo_sales_name_key("given_names", "family_name");
  FOREACH t IN ARRAY gated LOOP EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "0_pf12_firm_first"', t); END LOOP;
  FOREACH t IN ARRAY lifted LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t); END LOOP;
END
$pf8b_f7$;

CREATE INDEX "fo_person_firm_id_phone_e164_idx" ON "fo_person" ("firm_id", "phone_e164");
-- Trigram indexes inside the firm (GiST on firm_id and the name; btree_gist is FO-1b's), so a match reads only its own
-- firm's similar names, never every firm's.
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- (on lower(name_key), which equals it: a plain expression, so Prisma reads no index of its own here and a cascade drop of
-- the schema stays clean; a SQL function in an index expression broke Prisma's shadow reset, "cache lookup failed")
CREATE INDEX "fo_person_name_trgm_idx" ON "fo_person" USING gist ("firm_id", lower("name_key") extensions.gist_trgm_ops);
-- (on lower(normalised_name), which equals it: an expression, so Prisma's own (firm_id, normalised_name) index stays its own)
CREATE INDEX "fo_company_normalised_name_trgm_idx" ON "fo_company" USING gist ("firm_id", lower("normalised_name") extensions.gist_trgm_ops);

-- The match itself (break B1): the API reads as xr_app under row-level security, where PostgreSQL never uses a
-- non-leakproof operator (pg_trgm's %, similarity) as an index condition, so the app role's own query would read the
-- whole table. Like PF-12's platform_web_address_taken, each is one narrow definer function owned by xr_wall_reader,
-- callable by xr_app only, that reads one firm: the session's firm, and a different firm asked for gets nothing. With no
-- session firm only a superuser session (the owner's jobs and tests) may name the firm. A person's `seen` follows the
-- leads' visibility rule (FO-2 common.ts sees(): all, the caller's own active-owned lead, or an unowned or inactively
-- owned lead when the caller sees Unassigned), so a match is named only where Add a lead accepts its person.
CREATE FUNCTION fo_sales_match_firm(p_firm uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT CASE WHEN platform_session_firm() IS NOT NULL THEN (CASE WHEN platform_session_firm() = p_firm THEN p_firm END)
                      WHEN (SELECT r.rolsuper FROM pg_roles r WHERE r.rolname = session_user) AND current_setting('role') = 'none' THEN p_firm END $fn$;
-- (a session that switched role, e.g. to xr_app, never names a firm: break N3)
CREATE FUNCTION fo_sales_person_matches(p_firm uuid, p_email text, p_phones text[], p_name text, p_staff uuid,
    p_sees_all boolean, p_sees_unassigned boolean, p_threshold real, p_limit integer)
  RETURNS TABLE (id uuid, given_names text, family_name text, by_email boolean, by_phone boolean, sim float8, seen boolean)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $fn$
DECLARE f uuid := fo_sales_match_firm(p_firm);
BEGIN
  IF f IS NULL THEN RETURN; END IF;
  PERFORM set_config('pg_trgm.similarity_threshold', p_threshold::text, true);
  RETURN QUERY
    SELECT p."id", p."given_names", p."family_name",
           coalesce(p."email" = p_email, false), coalesce(p."phone_e164" = ANY (p_phones), false),
           CASE WHEN coalesce(p_name, '') = '' THEN 0 WHEN p_name ~ '[0-9]' OR p."name_key" ~ '[0-9]' THEN (lower(p."name_key") = p_name)::int
                ELSE similarity(lower(p."name_key"), p_name) END::float8,
           EXISTS (SELECT 1 FROM "fo_lead" l LEFT JOIN "platform_staff" s ON s."firm_id" = l."firm_id" AND s."id" = l."owner_staff_id"
                    WHERE l."firm_id" = f AND l."person_id" = p."id"
                      AND (p_sees_all OR (s."status" = 'ACTIVE' AND l."owner_staff_id" = p_staff)
                           OR (p_sees_unassigned AND (l."owner_staff_id" IS NULL OR s."status" IS DISTINCT FROM 'ACTIVE'))))
      FROM "fo_person" p
     WHERE p."firm_id" = f
       AND ((p_email IS NOT NULL AND p."email" = p_email)
         OR (cardinality(p_phones) > 0 AND p."phone_e164" = ANY (p_phones))
         OR (coalesce(p_name, '') <> '' AND p_name !~ '[0-9]' AND lower(p."name_key") % p_name AND p."name_key" !~ '[0-9]')
         OR (coalesce(p_name, '') ~ '[0-9]' AND lower(p."name_key") = p_name))
     ORDER BY 7 DESC, 4 DESC, 5 DESC, 6 DESC, p."created_at", p."id"
     LIMIT p_limit;
END $fn$;
CREATE FUNCTION fo_sales_company_matches(p_firm uuid, p_name text, p_threshold real, p_limit integer)
  RETURNS TABLE (id uuid, operating_name text, sim float8)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $fn$
DECLARE f uuid := fo_sales_match_firm(p_firm);
BEGIN
  IF f IS NULL OR coalesce(p_name, '') = '' THEN RETURN; END IF;
  PERFORM set_config('pg_trgm.similarity_threshold', p_threshold::text, true);
  RETURN QUERY
    -- an identical normalised name always matches (it holds any script; the trigram match covers the Latin ones, B2)
    SELECT c."id", c."operating_name", CASE WHEN c."normalised_name" = p_name THEN 1 ELSE similarity(lower(c."normalised_name"), p_name) END::float8
      FROM "fo_company" c WHERE c."firm_id" = f AND (c."normalised_name" = p_name OR lower(c."normalised_name") % p_name)
     ORDER BY 3 DESC, c."created_at", c."id" LIMIT p_limit;
END $fn$;
DO $readers$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['fo_sales_match_firm(uuid)', 'fo_sales_person_matches(uuid, text, text[], text, uuid, boolean, boolean, real, integer)', 'fo_sales_company_matches(uuid, text, real, integer)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO xr_wall_reader', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO xr_app', fn);
  END LOOP;
END
$readers$;
