-- CS-K1 part 1 (BACKLOG CS-K1; brief design/build-lead-c-briefs/CS-K1.md on the draft design/briefs/CS-K1.md part 1;
-- case-side contract v0.1 §5, §0.3, §3.4; P-588 (2), P-560; AG-7-75 §7): the case side's client record, and a client on
-- every case. Owner: the release Lead (case side), area file cases.prisma. Every function is case_client_*.
--   * case_client: one row per client of a firm. Its firm is the case's: firm_key (as runtime_case) and firm_id, filled by
--     its own trigger case_client_firm_from_key through CS-W1's lookup (nullable until CS-W1 part 2, as on runtime_case). client_number per firm
--     from case_client_counter (case_client_next_number(), in the same transaction: never shared, never reused, a
--     rolled-back opening gives it back). display_name 1-200 characters, trimmed, no control characters; display_kind
--     PERSON | COMPANY; fo_person_id and fo_company_id at most one set; prospect_id unique per firm when given. No foreign
--     key into the front office's tables (contract §1 rule 4).
--   * runtime_case.client_id: NOT NULL, firm-matched twice: (client_id, workspace_id, firm_key) always, and (client_id,
--     firm_id) once both firm ids are filled (MATCH SIMPLE: CS-W1 part 1 leaves a case's firm_id null while its key has no
--     platform firm).
--   * case_client_for_case(): BEFORE INSERT on runtime_case, ENABLE ALWAYS (so a fixture or restore written with the
--     replica role gets one too): a case written without a client gets a new one of its own firm, named after the case
--     (the opening names it after the principal: api/src/clients.ts). A client given is kept.
--   * case_client_follow_firm(): BEFORE UPDATE OF firm_id on runtime_case: when CS-W1's backfill fills a case's firm_id
--     later (the Sample firms are seeded after the migrations), the case's client gets the same firm id first, so the
--     (client_id, firm_id) key holds. A client already in another firm is never changed: the key then refuses.
--   * backfill: one client per existing case (people stay per case, §5), in opening order per firm, named after the
--     principal's display name (party_profile; else the principal's label; else "Client of <case number>"), COMPANY when
--     the case's Pathway is CORPORATE (case_client_kind_of: the PATHWAY node above the combination in program_def, as
--     case-close.ts and case-count.ts read it). Then every case is checked to have one, in words, before SET NOT NULL.
-- Rollback (in this order): DROP TRIGGER case_client_for_case ON runtime_case; DROP TRIGGER case_client_follow_firm ON
--   runtime_case; ALTER TABLE runtime_case DROP CONSTRAINT runtime_case_client_id_workspace_id_firm_key_fkey, DROP
--   CONSTRAINT runtime_case_client_id_firm_id_fkey, DROP COLUMN client_id; DROP TABLE case_client, case_client_counter;
--   DROP FUNCTION case_client_for_case(), case_client_follow_firm(), case_client_firm_from_key(), case_client_next_number(uuid, text),
--   case_client_kind_of(uuid); then delete this folder's row from _prisma_migrations. Lost: the client numbers and names
--   (no other table reads them in part 1).

-- AlterTable (nullable until the backfill below)
ALTER TABLE "runtime_case" ADD COLUMN     "client_id" UUID;

-- CreateTable
CREATE TABLE "case_client" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "firm_key" TEXT NOT NULL,
    "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid,
    "client_number" INTEGER NOT NULL,
    "display_name" TEXT NOT NULL,
    "display_kind" TEXT NOT NULL,
    "fo_person_id" UUID,
    "fo_company_id" UUID,
    "prospect_id" UUID,
    "file_owner" TEXT,
    "contact" JSONB,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_client_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "case_client_display_name_check" CHECK (
      char_length("display_name") BETWEEN 1 AND 200 AND "display_name" = btrim("display_name") AND "display_name" !~ '[[:cntrl:]]'
      -- the contract's invisible characters (contracts/runtime.ts INVISIBLE), and a name of spaces alone (breaker 2a)
      AND "display_name" !~ '[\u200b\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]' AND "display_name" ~ '[^[:space:]\u00a0\u2000-\u200a\u3000]'),
    CONSTRAINT "case_client_display_kind_check" CHECK ("display_kind" IN ('PERSON', 'COMPANY')),
    CONSTRAINT "case_client_one_front_office_check" CHECK (num_nonnulls("fo_person_id", "fo_company_id") <= 1),
    CONSTRAINT "case_client_number_check" CHECK ("client_number" >= 1)
);

-- CreateTable
CREATE TABLE "case_client_counter" (
    "workspace_id" UUID NOT NULL,
    "firm_key" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL,

    CONSTRAINT "case_client_counter_pkey" PRIMARY KEY ("workspace_id","firm_key")
);

-- CreateIndex
CREATE INDEX "case_client_firm_id_client_number_idx" ON "case_client"("firm_id", "client_number");

-- CreateIndex
CREATE UNIQUE INDEX "case_client_id_workspace_id_firm_key_key" ON "case_client"("id", "workspace_id", "firm_key");

-- CreateIndex
CREATE UNIQUE INDEX "case_client_id_firm_id_key" ON "case_client"("id", "firm_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_client_workspace_id_firm_key_client_number_key" ON "case_client"("workspace_id", "firm_key", "client_number");

-- CreateIndex
CREATE UNIQUE INDEX "case_client_workspace_id_firm_key_prospect_id_key" ON "case_client"("workspace_id", "firm_key", "prospect_id");

-- CreateIndex
CREATE INDEX "runtime_case_client_id_idx" ON "runtime_case"("client_id");

-- A client's firm id is its key's platform firm, by CS-W1's one lookup (its own function, so CS-W1's triggers stay its own):
-- a null firm_id is filled; one that is not the key's platform firm is refused in plain words.
CREATE FUNCTION case_client_firm_from_key() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE f uuid := case_lookup.case_firm_id_of_key(NEW.firm_key);
BEGIN
  IF NEW.firm_id IS NULL THEN NEW.firm_id := f;
  ELSIF NEW.firm_id IS DISTINCT FROM f THEN
    RAISE EXCEPTION 'case_client_firm_from_key: the firm id given is not the platform firm of key "%"', NEW.firm_key USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_client_firm_from_key BEFORE INSERT ON "case_client" FOR EACH ROW EXECUTE FUNCTION case_client_firm_from_key();

-- A firm's next client number, inside the caller's transaction (an upsert: two at once wait on the row).
CREATE FUNCTION case_client_next_number(ws uuid, key text) RETURNS integer LANGUAGE sql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
  INSERT INTO case_client_counter AS c (workspace_id, firm_key, next_value) VALUES (ws, key, 2)
  ON CONFLICT (workspace_id, firm_key) DO UPDATE SET next_value = c.next_value + 1
  RETURNING c.next_value - 1
$fn$;

-- The display kind of a combination's cases: COMPANY under a CORPORATE Pathway, else PERSON (SA-3-4, Lead 60's ruling 4).
CREATE FUNCTION case_client_kind_of(combination uuid) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
  WITH RECURSIVE up AS (
    SELECT p.workspace_id, p.parent_node_key, p.node_kind, p.client_type, 0 AS depth
      FROM program_def p JOIN combination x ON x.program_def_id = p.id WHERE x.id = combination
    UNION ALL
    SELECT p.workspace_id, p.parent_node_key, p.node_kind, p.client_type, up.depth + 1
      FROM program_def p JOIN up ON p.workspace_id = up.workspace_id AND p.program_node_key = up.parent_node_key WHERE up.depth < 32)
  SELECT CASE WHEN (SELECT client_type FROM up WHERE node_kind = 'PATHWAY' ORDER BY depth LIMIT 1) = 'CORPORATE' THEN 'COMPANY' ELSE 'PERSON' END
$fn$;

-- A case written without a client gets its own (named after the case; the opening names it after the principal). The
-- client takes its key's platform firm, never the case's firm_id as given (nor the session's default): a case whose given
-- firm id is wrong is then refused by CS-W1's own case_firm_from_key, which fires after this one, in its own words.
CREATE FUNCTION case_client_for_case() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.client_id IS NULL THEN
    INSERT INTO case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, created_by)
    VALUES (gen_random_uuid(), NEW.workspace_id, NEW.firm_key, case_lookup.case_firm_id_of_key(NEW.firm_key), case_client_next_number(NEW.workspace_id, NEW.firm_key),
            left('Client of ' || coalesce(NEW.case_number, NEW.reference, 'a case'), 200), case_client_kind_of(NEW.combination_id),
            coalesce(NEW.created_by, 'system:case_client_for_case'))
    RETURNING id INTO NEW.client_id;
  END IF;
  RETURN NEW;
END $fn$;

-- CS-W1's backfill fills a case's firm id after the Sample seed: the client follows, before the key is checked.
CREATE FUNCTION case_client_follow_firm() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF NEW.firm_id IS NOT NULL AND NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    UPDATE case_client SET firm_id = NEW.firm_id WHERE id = NEW.client_id AND firm_id IS NULL;
  END IF;
  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION case_client_next_number(uuid, text), case_client_kind_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION case_client_next_number(uuid, text), case_client_kind_of(uuid) TO xr_data;

-- Backfill: one client per existing case, in opening order per firm (numbers 1, 2, … with no gap).
DO $$
DECLARE k record; nm text; cid uuid;
BEGIN
  FOR k IN SELECT id, workspace_id, firm_key, firm_id, combination_id, case_number, created_by FROM runtime_case
            WHERE client_id IS NULL ORDER BY workspace_id, firm_key, created_at, id LOOP
    SELECT coalesce(nullif(btrim(regexp_replace(regexp_replace(pp.display_name, '[\u200b\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]+', '', 'g'), '[[:cntrl:][:space:]\u00a0\u2000-\u200a\u3000]+', ' ', 'g')), ''),
                    nullif(btrim(regexp_replace(regexp_replace(s.label, '[\u200b\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]+', '', 'g'), '[[:cntrl:][:space:]\u00a0\u2000-\u200a\u3000]+', ' ', 'g')), ''))
      INTO nm FROM case_participant cp JOIN answer_subject s ON s.id = cp.subject_id LEFT JOIN party_profile pp ON pp.party_id = s.party_id
     WHERE cp.case_id = k.id AND cp.role = 'principal' ORDER BY cp."order", cp.id LIMIT 1;
    nm := btrim(left(coalesce(nm, 'Client of ' || k.case_number), 200));
    INSERT INTO case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, created_by)
    VALUES (gen_random_uuid(), k.workspace_id, k.firm_key, k.firm_id, case_client_next_number(k.workspace_id, k.firm_key), nm,
            case_client_kind_of(k.combination_id), coalesce(k.created_by, 'system:csk1-backfill'))
    RETURNING id INTO cid;
    UPDATE runtime_case SET client_id = cid WHERE id = k.id;
  END LOOP;
END $$;

-- Every case has its client before the rule is set; else this stops here in words.
DO $$ DECLARE bad integer; BEGIN
  SELECT count(*) INTO bad FROM runtime_case WHERE client_id IS NULL;
  IF bad > 0 THEN RAISE EXCEPTION 'csk1_case_client: % case(s) have no client after the backfill; nothing was changed', bad; END IF;
END $$;
ALTER TABLE "runtime_case" ALTER COLUMN "client_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "runtime_case" ADD CONSTRAINT "runtime_case_client_id_workspace_id_firm_key_fkey" FOREIGN KEY ("client_id", "workspace_id", "firm_key") REFERENCES "case_client"("id", "workspace_id", "firm_key") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "runtime_case" ADD CONSTRAINT "runtime_case_client_id_firm_id_fkey" FOREIGN KEY ("client_id", "firm_id") REFERENCES "case_client"("id", "firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TRIGGER case_client_for_case BEFORE INSERT ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION case_client_for_case();
ALTER TABLE "runtime_case" ENABLE ALWAYS TRIGGER case_client_for_case;
CREATE TRIGGER case_client_follow_firm BEFORE UPDATE OF "firm_id" ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION case_client_follow_firm();
