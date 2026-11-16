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
--     privileges), AFTER, row level (deferred: below), on client_canonical_answer (the listed keys only), party_profile (display name) and
--     case_participant (insert, role or case change, removal). Each calls case_party_index_refresh(subject), which rebuilds
--     that subject's row from the current answers. They fire on any write of a listed key (also the UPDATE that sets
--     superseded_by_id), because the write sites supersede the old version and insert the new one in either order; the
--     refresh itself reads only the current versions. A rolled-back write rolls back its index change with it.
--   * the triggers are constraint triggers, DEFERRABLE INITIALLY DEFERRED: the refresh runs at commit, after every write
--     of the transaction (review M1, breaker M2-M5). There it first takes a transaction advisory lock on the subject, so
--     two writers (a name change and the participant's removal or move, two first answers, two keys) never leave a
--     stale, orphan or wrong-firm row, and no writer holds that lock while it still writes answers (no deadlock with the
--     answer rows' own locks). This relies on READ COMMITTED (the database default, and the API's): the waiter re-reads
--     the committed state after the lock. A transaction that runs SET CONSTRAINTS ALL IMMEDIATE refreshes at once.
--   * values: names and emails have every kind of space collapsed and trimmed, and are lower-cased by PostgreSQL 18's
--     built-in Unicode rules (pg_unicode_fast), whatever the cluster's collation; a blank name falls back as above. An
--     email over 254 characters, or with no "@", is not indexed. A role's digits become _ (FO-13's pattern has none).
--   * not covered by a trigger (no app path does any today): an answer_subject label edit (the last name fallback), a
--     runtime_case.firm_key change, and a platform_firm row added after its firm's cases (platform_ tables are PF-12's);
--     the next write of the person refreshes the row.
--   * hand-over to CS-W1/CS-W4: (1) the firm lookup should move to xr_case_lookup's ownership when CS-W1 gives that role
--     its platform_firm read, and once runtime_case is walled it must check the case is the session's firm's (it reads
--     runtime_case past the walls today, where every firm reads runtime_case anyway); (2) a forced policy on
--     case_party_index must let these INVOKER triggers write when the API saves an answer with no app.firm_id set, or
--     answer saves fail; today the app's role reads and writes every row of the table (the brief's INVOKER design).
--   * the EMPLOYER row's party_id is the party the "case" subject sits on (the principal's: runtime.ts, case-stages.ts):
--     part 2 reads the employer from display_name, never from party_id.
--   * backfill: one refresh per existing participant (no advisory lock: the triggers' own DDL locks keep writers out).
--   * two transactions committing at the same moment whose people fall in the same lock buckets in crossed order can
--     still deadlock at commit (one is refused; the caller retries); the window is the refresh time of their people.
-- Rollback (in this order): DROP TRIGGER case_party_index_answer ON client_canonical_answer; DROP TRIGGER
--   case_party_index_answer_gone ON client_canonical_answer; DROP TRIGGER case_party_index_profile ON party_profile;
--   DROP TRIGGER case_party_index_participant ON case_participant; DROP TABLE "case_party_index"; DROP FUNCTION case_party_index_on_answer(), case_party_index_on_profile(),
--   case_party_index_on_participant(), case_party_index_refresh(uuid, boolean), case_party_index_firm_of(uuid),
--   case_party_index_phone(text, text), case_party_index_norm(text), case_party_index_clean(text); then delete this folder's row from
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

-- Spaces of every kind (tab, newline, no-break, the U+2000 block, zero width, ideographic) collapsed to one and trimmed;
-- null when nothing is left (breaker m7). Lower case by PostgreSQL 18's built-in Unicode rules, whatever the cluster's
-- collation (breaker m6: a C cluster lower-cases ASCII only).
CREATE FUNCTION case_party_index_clean(t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS
  $$ SELECT NULLIF(btrim(regexp_replace(t, '[\s\u0085\u00A0\u1680\u180E\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\u3000\uFEFF]+', ' ', 'g'), ' '), '') $$;
CREATE FUNCTION case_party_index_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS
  $$ SELECT lower(case_party_index_clean(t) COLLATE pg_unicode_fast) $$;

-- "+" with the country code's digits and the number's digits; null when either is missing, the code is not 1 to 3 digits
-- starting 1-9, the number holds anything but digits, spaces and ( ) . - or starts with anything but a digit or ( (a
-- letter, a minus: never guessed), has under 4 digits or only zeros, or the whole is outside 7 to 15 digits. A JSON
-- number counts only when whole. A number written with its own "+<code>" in front is read whole when that code
-- is the given one (breaker m8); the length and all-zero checks read the subscriber digits after that code.
CREATE FUNCTION case_party_index_phone(cc text, num text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN c ~ '^[1-9][0-9]{0,2}$' AND btrim(coalesce(cc, '')) ~ '^\+?[0-9]{1,3}$' AND shape_ok
                   AND length(sub) >= 4 AND sub !~ '^0+$' AND length(c || sub) BETWEEN 7 AND 15
              THEN '+' || c || sub END
  FROM (SELECT c, CASE WHEN plus THEN substr(n, length(c) + 1) ELSE n END AS sub,   -- the subscriber digits (Devin review)
               CASE WHEN plus THEN left(n, length(c)) = c ELSE btrim(coalesce(num, '')) ~ '^[0-9(][0-9 ().-]*$' END AS shape_ok
        FROM (SELECT regexp_replace(coalesce(cc, ''), '[^0-9]', '', 'g') AS c, regexp_replace(coalesce(num, ''), '[^0-9]', '', 'g') AS n,
                     btrim(coalesce(num, '')) ~ '^\+[0-9 ().-]+$' AS plus) x) y
$$;

-- One case's firm id, read past PF-12's wall on platform_firm; nothing else. Owned by xr_wall_reader (BYPASSRLS),
-- callable by xr_data's members (xr_app, xr_staff_bypass) only.
CREATE FUNCTION case_party_index_firm_of(p_case uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT f.id FROM runtime_case c JOIN platform_firm f ON f.key = c.firm_key WHERE c.id = p_case $fn$;
ALTER FUNCTION case_party_index_firm_of(uuid) OWNER TO xr_wall_reader;
REVOKE ALL ON FUNCTION case_party_index_firm_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION case_party_index_firm_of(uuid) TO xr_data;

CREATE FUNCTION case_party_index_refresh(p_subject uuid, p_lock boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  p record; a jsonb; v jsonb; firm uuid; k text; r text; nm text; em text; ph text; cc text;
BEGIN
  -- One refresh of a subject at a time (review M1): a second writer waits here until the first commits, then reads the
  -- committed participant and answers afresh (READ COMMITTED: each statement below takes a new snapshot). The lock is
  -- one of 256 buckets of subjects, so one transaction holds at most 256 advisory locks however many people it touches
  -- (breaker round 2: one lock per subject ran out of shared lock memory past ~15 000 people in one transaction).
  IF p_lock THEN PERFORM pg_advisory_xact_lock(hashtext('case_party_index'), hashtext(p_subject::text) & 255); END IF;
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
    nm := coalesce(CASE WHEN jsonb_typeof(a->'organisation.employer_name') = 'string' THEN case_party_index_clean(a->>'organisation.employer_name') END,
                   CASE WHEN jsonb_typeof(a->'organisation.name') = 'string' THEN case_party_index_clean(a->>'organisation.name') END);
  ELSE
    k := CASE p.role WHEN 'principal' THEN 'CLIENT' WHEN 'spouse_or_partner' THEN 'FAMILY_MEMBER' WHEN 'child' THEN 'FAMILY_MEMBER' ELSE 'OTHER_PARTY' END;
    nm := case_party_index_clean(concat_ws(' ', CASE WHEN jsonb_typeof(a->'person.given_names') = 'string' THEN a->>'person.given_names' END,
                                                CASE WHEN jsonb_typeof(a->'person.family_name') = 'string' THEN a->>'person.family_name' END));
    IF nm IS NULL THEN SELECT case_party_index_clean(pp.display_name) INTO nm FROM party_profile pp WHERE pp.party_id = p.party_id; END IF;
    IF nm IS NULL THEN nm := case_party_index_clean(p.label); END IF;
    em := coalesce(CASE WHEN jsonb_typeof(a->'person.email') = 'string' THEN case_party_index_norm(a->>'person.email') END,
                   CASE WHEN jsonb_typeof(a->'person.email_address') = 'string' THEN case_party_index_norm(a->>'person.email_address') END);
    -- At most 254 characters (an address's limit): a longer value is not an email and is not indexed, so it can never
    -- overflow the btree on (firm_id, email_norm) and fail the answer save (breaker B1).
    IF length(em) > 254 OR em !~ '^[^ ]+@[^ ]+$' THEN em := NULL; END IF;
    v := a->'person.phone_number';
    cc := CASE WHEN jsonb_typeof(a->'person.phone_country_code') IN ('string', 'number') THEN a->>'person.phone_country_code' END;
    ph := CASE jsonb_typeof(v)
            WHEN 'object' THEN case_party_index_phone(coalesce(NULLIF(btrim(CASE WHEN jsonb_typeof(v->'country_code') IN ('string', 'number') THEN v->>'country_code' END), ''), cc),
                                                      CASE WHEN jsonb_typeof(v->'number') = 'string' OR (jsonb_typeof(v->'number') = 'number' AND (v->>'number') ~ '^[0-9]+$') THEN v->>'number' END)
            WHEN 'string' THEN case_party_index_phone(cc, v #>> '{}')
            WHEN 'number' THEN CASE WHEN (v #>> '{}') ~ '^[0-9]+$' THEN case_party_index_phone(cc, v #>> '{}') END END;
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
CREATE CONSTRAINT TRIGGER case_party_index_answer AFTER INSERT OR UPDATE ON "client_canonical_answer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.canonical_field_key IN ('person.given_names', 'person.family_name', 'person.email', 'person.email_address',
    'person.phone_number', 'person.phone_country_code', 'organisation.employer_name', 'organisation.name'))
  EXECUTE FUNCTION case_party_index_on_answer();
CREATE CONSTRAINT TRIGGER case_party_index_answer_gone AFTER DELETE ON "client_canonical_answer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.canonical_field_key IN ('person.given_names', 'person.family_name', 'person.email', 'person.email_address',
    'person.phone_number', 'person.phone_country_code', 'organisation.employer_name', 'organisation.name'))
  EXECUTE FUNCTION case_party_index_on_answer();

CREATE FUNCTION case_party_index_on_profile() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.display_name IS NOT DISTINCT FROM OLD.display_name AND NEW.party_id IS NOT DISTINCT FROM OLD.party_id THEN RETURN NULL; END IF;
  PERFORM case_party_index_refresh(cp.subject_id) FROM case_participant cp JOIN answer_subject s ON s.id = cp.subject_id
    WHERE s.party_id IN (CASE WHEN TG_OP <> 'DELETE' THEN NEW.party_id END, CASE WHEN TG_OP <> 'INSERT' THEN OLD.party_id END)
    ORDER BY cp.subject_id;   -- one order everywhere, so two refreshes of one party never wait on each other in a circle
  RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER case_party_index_profile AFTER INSERT OR UPDATE OR DELETE ON "party_profile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION case_party_index_on_profile();

CREATE FUNCTION case_party_index_on_participant() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.subject_id IS NOT DISTINCT FROM OLD.subject_id AND NEW.case_id IS NOT DISTINCT FROM OLD.case_id
     AND NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NULL; END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM case_party_index_refresh(OLD.subject_id); END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.subject_id IS DISTINCT FROM OLD.subject_id) THEN PERFORM case_party_index_refresh(NEW.subject_id); END IF;
  RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER case_party_index_participant AFTER INSERT OR UPDATE OR DELETE ON "case_participant" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION case_party_index_on_participant();

-- Backfill: one refresh per existing participant, with no advisory lock: CREATE TRIGGER above already holds a lock on
-- client_canonical_answer, party_profile and case_participant that blocks their writes until this migration commits.
SELECT case_party_index_refresh(subject_id, false) FROM case_participant;
