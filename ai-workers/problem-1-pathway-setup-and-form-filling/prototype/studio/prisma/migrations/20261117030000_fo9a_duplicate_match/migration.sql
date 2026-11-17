-- FO-9a (BACKLOG row FO-9a; P-574 (2); AG-2-78, AG-2-96): the keys the duplicate warning reads, on FO-1a's tables only.
--   * pg_trgm, for the similar-name match (similarity at or above the Sample threshold 0.6, ports/matching.ts).
--   * fo_person.phone_e164: the phone in E.164 when FO-2 stored it as readable (FO-2 keeps a readable number in E.164,
--     sales/common.ts phone()), else empty; kept by the database on every write, backfilled here. The match normalises
--     what is typed with libphonenumber-js (default region CA) and compares it with this column.
--   * a lower-cased email index, and trigram indexes (within the firm) on a person's name and a company's normalised name.
-- No row changes but the backfilled column; nothing is linked or merged (AG16-44).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "fo_person" ADD COLUMN "phone_e164" TEXT;
ALTER TABLE "fo_person" ADD CONSTRAINT "fo_person_phone_e164_check" CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{6,14}$');

CREATE FUNCTION fo_sales_phone_e164(phone text, readable boolean) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN readable AND phone ~ '^\+[1-9][0-9]{6,14}$' THEN phone END
$$;
CREATE FUNCTION fo_sales_person_phone_e164() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."phone_e164" := fo_sales_phone_e164(NEW."phone", NEW."phone_readable");   -- never set by a writer
  RETURN NEW;
END $$;
CREATE TRIGGER "fo_person_phone_e164" BEFORE INSERT OR UPDATE OF "phone", "phone_readable", "phone_e164" ON "fo_person"
  FOR EACH ROW EXECUTE FUNCTION fo_sales_person_phone_e164();
-- PF-12: a trigger function on a firm table runs as xr_wall_reader (tests/check_pf12_walls.ts).
ALTER FUNCTION fo_sales_person_phone_e164() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION fo_sales_person_phone_e164() OWNER TO xr_wall_reader;
UPDATE "fo_person" SET "phone_e164" = fo_sales_phone_e164("phone", "phone_readable") WHERE "phone" IS NOT NULL;

-- A person's name as the match reads it: given and family names, lower-cased, one space (ports/matching.ts personNameKey).
CREATE FUNCTION fo_sales_person_name(given text, family text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(btrim(regexp_replace(coalesce(given, '') || ' ' || coalesce(family, ''), '\s+', ' ', 'g')))
$$;

CREATE INDEX "fo_person_firm_id_phone_e164_idx" ON "fo_person" ("firm_id", "phone_e164");
CREATE INDEX "fo_person_firm_id_email_lower_idx" ON "fo_person" ("firm_id", lower("email"));
-- Trigram indexes inside the firm (GiST on firm_id and the name; btree_gist is FO-1b's), so a match reads only its own
-- firm's similar names, never every firm's.
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- The person index is on fo_sales_person_name's own expression, written out (a SQL function in an index expression breaks
-- a cascade drop of the schema, "cache lookup failed", which Prisma's shadow reset does); the planner inlines the
-- function in a query, so the index answers it (tests/check_fo9a_duplicates.ts EXPLAIN).
CREATE INDEX "fo_person_name_trgm_idx" ON "fo_person" USING gist ("firm_id",
  (lower(btrim(regexp_replace(coalesce("given_names", '') || ' ' || coalesce("family_name", ''), '\s+', ' ', 'g')))) gist_trgm_ops);
-- (on lower(normalised_name), which equals it: an expression, so Prisma's own (firm_id, normalised_name) index stays its own)
CREATE INDEX "fo_company_normalised_name_trgm_idx" ON "fo_company" USING gist ("firm_id", lower("normalised_name") gist_trgm_ops);
