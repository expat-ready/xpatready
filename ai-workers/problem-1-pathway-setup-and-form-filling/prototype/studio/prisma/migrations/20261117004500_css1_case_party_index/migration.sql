-- CS-S1 part 1 (map row 102, the case half; brief design/briefs/CS-S1.md part 1; contract v0.1 §3.1; AG-7-88@c8e49d73,
-- AG-7-75@c1cc5ced rule 3): the case party index and the triggers that keep it. Owner: the release Lead (case side),
-- area file case-search.prisma. Every function is named case_party_index_*. Prisma's DDL first, then what Prisma cannot say:
--   * one row per case participant (case_participant.subject_id): the person roles from their current name, email and
--     phone answers; the "case" participant only while it has a current organisation.* name (an employer). A relative's
--     subject (no case_participant row) gets no row. The id is stable per subject: a refresh updates the row in place
--     (INSERT ... ON CONFLICT (subject_id) DO UPDATE), never deletes and re-inserts; the row goes with its participant.
--   * kind and role_on_case from main's roles: principal → CLIENT/PRINCIPAL; spouse_or_partner → FAMILY_MEMBER/
--     SPOUSE_OR_PARTNER; child → FAMILY_MEMBER/CHILD; case (employer) → EMPLOYER/EMPLOYER; any other → OTHER_PARTY with its
--     upper-cased role. CHECKs for the six kinds of FO-13's fo_compliance_matches_ok and its role pattern.
--   * the answer keys read (a key not listed is not indexed): person.given_names, person.family_name (the name; else the
--     party profile's display name, else the subject's label); person.email, else person.email_address; person.phone_number
--     (its parts {country_code, number}, or the number as text with person.phone_country_code); organisation.employer_name,
--     else organisation.name (the "case" participant only). Current = superseded_by_id null, row_key null; the latest
--     effective_at wins. The phone is built from the stored parts, never parsed: "+" with the country code's digits and the
--     number's digits; null when either part is missing or the number holds a letter, or outside E.164's 15 digits.
--   * name_norm: lower case, trimmed, inner spaces collapsed (unaccent is not enabled on main, so accents are kept);
--     email_norm: lower case, trimmed.
--   * firm_id is the case's firm (platform_firm by runtime_case.firm_key; ruled, Lead 61, #1869 comment 6900881924: no wait
--     on CS-W1). platform_firm is behind PF-12's forced wall, so the lookup is one narrow definer function owned by
--     xr_wall_reader (the PF-12 pattern of platform_web_address_taken): one case's firm id, nothing else. A case whose firm
--     has no platform_firm row (firms are seeded by the API at start) gets no row, and the answer write still succeeds.
--   * the triggers are SECURITY INVOKER (they write as the caller; xr_data holds the table rights by PF-12's default
--     privileges), AFTER, row level, on client_canonical_answer (the listed keys only), party_profile (display name) and
--     case_participant (insert, role or case change, removal). Each calls case_party_index_refresh(subject), which rebuilds
--     that subject's row from the current answers. They fire on any write of a listed key (also the UPDATE that sets
--     superseded_by_id), because the write sites supersede the old version and insert the new one in either order; the
--     refresh itself reads only the current versions. A rolled-back write rolls back its index change with it.
--   * backfill: one refresh per existing participant.
-- Rollback (in this order): DROP TRIGGER case_party_index_answer, case_party_index_answer_gone ON client_canonical_answer
--   (one statement each); DROP TRIGGER case_party_index_profile ON party_profile; DROP TRIGGER case_party_index_participant ON case_participant; DROP TABLE
--   "case_party_index"; DROP FUNCTION case_party_index_on_answer(), case_party_index_on_profile(),
--   case_party_index_on_participant(), case_party_index_refresh(uuid), case_party_index_firm_of(uuid),
--   case_party_index_phone(text, text), case_party_index_norm(text); then delete this folder's row from
--   _prisma_migrations. pg_trgm stays (FO-9a uses it too). Nothing else is lost: the index is derived from the answers.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "case_party_index" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "role_on_case" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "name_norm" TEXT NOT NULL,
    "email_norm" TEXT,
    "phone_e164" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_party_index_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_party_index_subject_id_key" ON "case_party_index"("subject_id");

-- CreateIndex
CREATE INDEX "case_party_index_name_norm_trgm_idx" ON "case_party_index" USING GIN ("name_norm" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "case_party_index_firm_id_email_norm_idx" ON "case_party_index"("firm_id", "email_norm");

-- CreateIndex
CREATE INDEX "case_party_index_firm_id_phone_e164_idx" ON "case_party_index"("firm_id", "phone_e164");

-- CreateIndex
CREATE INDEX "case_party_index_case_id_idx" ON "case_party_index"("case_id");

ALTER TABLE "case_party_index"
  ADD CONSTRAINT "case_party_index_kind_check" CHECK ("kind" IN ('CLIENT', 'APPLICANT', 'FAMILY_MEMBER', 'SPONSOR', 'EMPLOYER', 'OTHER_PARTY')),
  ADD CONSTRAINT "case_party_index_role_check" CHECK ("role_on_case" ~ '^[A-Z][A-Z_]{0,39}$'),
  ADD CONSTRAINT "case_party_index_name_check" CHECK (btrim("display_name") <> '' AND "name_norm" <> ''),
  ADD CONSTRAINT "case_party_index_phone_check" CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[0-9]{2,15}$');

CREATE FUNCTION case_party_index_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS
  $$ SELECT NULLIF(lower(regexp_replace(btrim(t), '\s+', ' ', 'g')), '') $$;

-- "+" with the country code's digits and the number's digits; null when either is missing, the number holds anything but
-- digits, spaces and ( ) . - (a letter: never guessed), or the whole is outside E.164's 15 digits.
CREATE FUNCTION case_party_index_phone(cc text, num text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN c <> '' AND n <> '' AND btrim(num) ~ '^[0-9 ().-]+$' AND btrim(cc) ~ '^\+?[0-9]{1,3}$' AND length(c || n) <= 15
              THEN '+' || c || n END
  FROM (SELECT regexp_replace(coalesce(cc, ''), '[^0-9]', '', 'g') AS c, regexp_replace(coalesce(num, ''), '[^0-9]', '', 'g') AS n) x
$$;

-- One case's firm id, read past PF-12's wall on platform_firm; nothing else. Owned by xr_wall_reader (BYPASSRLS),
-- callable by xr_data's members (xr_app, xr_staff_bypass) only.
CREATE FUNCTION case_party_index_firm_of(p_case uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT f.id FROM runtime_case c JOIN platform_firm f ON f.key = c.firm_key WHERE c.id = p_case $fn$;
ALTER FUNCTION case_party_index_firm_of(uuid) OWNER TO xr_wall_reader;
REVOKE ALL ON FUNCTION case_party_index_firm_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION case_party_index_firm_of(uuid) TO xr_data;

CREATE FUNCTION case_party_index_refresh(p_subject uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  p record; a jsonb; v jsonb; firm uuid; k text; r text; nm text; em text; ph text; cc text;
BEGIN
  SELECT cp.case_id, cp.role, s.party_id, s.workspace_id, s.label INTO p
    FROM case_participant cp JOIN answer_subject s ON s.id = cp.subject_id WHERE cp.subject_id = p_subject;
  IF NOT FOUND THEN   -- a relative, or a participant removed: no row
    DELETE FROM case_party_index WHERE subject_id = p_subject; RETURN;
  END IF;
  firm := case_party_index_firm_of(p.case_id);
  -- The current single answers of the listed keys, as one object { key: value }.
  SELECT coalesce(jsonb_object_agg(x.canonical_field_key, x.value_json), '{}') INTO a FROM (
    SELECT DISTINCT ON (canonical_field_key) canonical_field_key, value_json FROM client_canonical_answer
     WHERE subject_id = p_subject AND superseded_by_id IS NULL AND row_key IS NULL
       AND canonical_field_key IN ('person.given_names', 'person.family_name', 'person.email', 'person.email_address',
         'person.phone_number', 'person.phone_country_code', 'organisation.employer_name', 'organisation.name')
     ORDER BY canonical_field_key, effective_at DESC, id DESC) x;
  r := upper(p.role);
  IF p.role = 'case' THEN
    k := 'EMPLOYER'; r := 'EMPLOYER';
    nm := coalesce(CASE WHEN jsonb_typeof(a->'organisation.employer_name') = 'string' THEN NULLIF(btrim(a->>'organisation.employer_name'), '') END,
                   CASE WHEN jsonb_typeof(a->'organisation.name') = 'string' THEN NULLIF(btrim(a->>'organisation.name'), '') END);
  ELSE
    k := CASE p.role WHEN 'principal' THEN 'CLIENT' WHEN 'spouse_or_partner' THEN 'FAMILY_MEMBER' WHEN 'child' THEN 'FAMILY_MEMBER' ELSE 'OTHER_PARTY' END;
    nm := NULLIF(btrim(concat_ws(' ', CASE WHEN jsonb_typeof(a->'person.given_names') = 'string' THEN NULLIF(btrim(a->>'person.given_names'), '') END,
                                      CASE WHEN jsonb_typeof(a->'person.family_name') = 'string' THEN NULLIF(btrim(a->>'person.family_name'), '') END)), '');
    IF nm IS NULL THEN SELECT NULLIF(btrim(pp.display_name), '') INTO nm FROM party_profile pp WHERE pp.party_id = p.party_id; END IF;
    IF nm IS NULL THEN nm := NULLIF(btrim(p.label), ''); END IF;
    em := CASE WHEN jsonb_typeof(a->'person.email') = 'string' AND btrim(a->>'person.email') <> '' THEN a->>'person.email'
               WHEN jsonb_typeof(a->'person.email_address') = 'string' THEN a->>'person.email_address' END;
    em := NULLIF(lower(btrim(em)), '');
    v := a->'person.phone_number';
    cc := CASE WHEN jsonb_typeof(a->'person.phone_country_code') IN ('string', 'number') THEN a->>'person.phone_country_code' END;
    ph := CASE jsonb_typeof(v)
            WHEN 'object' THEN case_party_index_phone(coalesce(NULLIF(btrim(CASE WHEN jsonb_typeof(v->'country_code') = 'string' THEN v->>'country_code' END), ''), cc),
                                                      CASE WHEN jsonb_typeof(v->'number') = 'string' THEN v->>'number' END)
            WHEN 'string' THEN case_party_index_phone(cc, v #>> '{}') END;
  END IF;
  -- role_on_case: upper case letters and _ only (FO-13's pattern); anything else in an open-vocabulary role becomes _.
  r := left(regexp_replace(r, '[^A-Z_]', '_', 'g'), 40);
  IF r !~ '^[A-Z]' THEN r := left('OTHER_' || r, 40); END IF;
  IF nm IS NULL OR firm IS NULL THEN   -- an employer with no name yet, or a case whose firm is not registered: no row
    DELETE FROM case_party_index WHERE subject_id = p_subject; RETURN;
  END IF;
  INSERT INTO case_party_index (firm_id, workspace_id, case_id, subject_id, party_id, kind, role_on_case, display_name, name_norm, email_norm, phone_e164, updated_at)
  VALUES (firm, p.workspace_id, p.case_id, p_subject, p.party_id, k, r, nm, case_party_index_norm(nm), em, ph, now())
  ON CONFLICT (subject_id) DO UPDATE SET firm_id = EXCLUDED.firm_id, workspace_id = EXCLUDED.workspace_id, case_id = EXCLUDED.case_id,
    party_id = EXCLUDED.party_id, kind = EXCLUDED.kind, role_on_case = EXCLUDED.role_on_case, display_name = EXCLUDED.display_name,
    name_norm = EXCLUDED.name_norm, email_norm = EXCLUDED.email_norm, phone_e164 = EXCLUDED.phone_e164, updated_at = EXCLUDED.updated_at;
END $fn$;

CREATE FUNCTION case_party_index_on_answer() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM case_party_index_refresh(OLD.subject_id); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.subject_id IS DISTINCT FROM OLD.subject_id) THEN PERFORM case_party_index_refresh(NEW.subject_id); END IF;
  RETURN NULL;
END $fn$;
-- Only the listed keys (the same list as the refresh's); a removed answer (a subject's cascade) by its own trigger.
CREATE TRIGGER case_party_index_answer AFTER INSERT OR UPDATE ON "client_canonical_answer" FOR EACH ROW
  WHEN (NEW.canonical_field_key IN ('person.given_names', 'person.family_name', 'person.email', 'person.email_address',
    'person.phone_number', 'person.phone_country_code', 'organisation.employer_name', 'organisation.name'))
  EXECUTE FUNCTION case_party_index_on_answer();
CREATE TRIGGER case_party_index_answer_gone AFTER DELETE ON "client_canonical_answer" FOR EACH ROW
  WHEN (OLD.canonical_field_key IN ('person.given_names', 'person.family_name', 'person.email', 'person.email_address',
    'person.phone_number', 'person.phone_country_code', 'organisation.employer_name', 'organisation.name'))
  EXECUTE FUNCTION case_party_index_on_answer();

CREATE FUNCTION case_party_index_on_profile() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.display_name IS NOT DISTINCT FROM OLD.display_name AND NEW.party_id IS NOT DISTINCT FROM OLD.party_id THEN RETURN NULL; END IF;
  PERFORM case_party_index_refresh(cp.subject_id) FROM case_participant cp JOIN answer_subject s ON s.id = cp.subject_id
    WHERE s.party_id IN (NEW.party_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.party_id END);
  RETURN NULL;
END $fn$;
CREATE TRIGGER case_party_index_profile AFTER INSERT OR UPDATE ON "party_profile" FOR EACH ROW
  EXECUTE FUNCTION case_party_index_on_profile();

CREATE FUNCTION case_party_index_on_participant() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.subject_id IS NOT DISTINCT FROM OLD.subject_id AND NEW.case_id IS NOT DISTINCT FROM OLD.case_id
     AND NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NULL; END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM case_party_index_refresh(OLD.subject_id); END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.subject_id IS DISTINCT FROM OLD.subject_id) THEN PERFORM case_party_index_refresh(NEW.subject_id); END IF;
  RETURN NULL;
END $fn$;
CREATE TRIGGER case_party_index_participant AFTER INSERT OR UPDATE OR DELETE ON "case_participant" FOR EACH ROW
  EXECUTE FUNCTION case_party_index_on_participant();

-- Backfill: one refresh per existing participant.
SELECT case_party_index_refresh(subject_id) FROM case_participant;
