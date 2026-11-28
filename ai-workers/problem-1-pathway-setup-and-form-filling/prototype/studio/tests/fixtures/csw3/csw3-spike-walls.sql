-- CS-W3 part 0 (the walls spike, contract v0.1 §8 "The spike that decides step 5"): the walls on the case side, for a
-- SCRATCH COPY ONLY (an isolated.sh copy). Never a migration, never on main's demo database: tests/fixtures/csw3/csw3-spike.sh
-- applies it to a copy it made and drops with it. Run as the copy's owner (xr_studio).
--   * firm_id on filing and party (the two of contract §8's four representative tables that have none yet), backfilled
--     from the case (filing: its case; party: the case of a subject on that party); new rows filled the way CS-W2 will:
--     filing by CS-W1's case_firm_fill from its case, party by the column default (the session's firm).
--   * ENABLE + FORCE row-level security and one policy on every case-side table with firm_id: runtime_case, case_stage,
--     firm_case_counter, case_decision, case_party_index, filing, party. The policy is PF-12's (firm_id = the session's
--     firm) with one spike-only fallback: csw3_spike_firm() reads app.firm_id (PF-12's wrapper), else the setting
--     csw3.firm, which the script sets per database in mode B (ALTER ROLE xr_app IN DATABASE ... SET csw3.firm) to stand
--     in for part 1's middleware: every case-side query then runs as that one firm. Mode A leaves it unset: main as it is.
--   * The app's role is PF-12's xr_app (owns no table, no BYPASSRLS): the copy's API already connects as it.
CREATE FUNCTION csw3_spike_firm() RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog, public
  AS $fn$ SELECT coalesce(platform_session_firm(), nullif(current_setting('csw3.firm', true), '')::uuid) $fn$;

ALTER TABLE filing ADD COLUMN IF NOT EXISTS firm_id uuid;   -- CS-W2 part filings brings it on main (#3811)
UPDATE filing f SET firm_id = c.firm_id FROM runtime_case c WHERE c.id = f.case_id AND f.firm_id IS NULL;
CREATE TRIGGER csw3_spike_fill BEFORE INSERT ON filing FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');

ALTER TABLE party ADD COLUMN firm_id uuid DEFAULT csw3_spike_firm();
UPDATE party p SET firm_id = x.firm_id FROM (
  SELECT DISTINCT ON (s.party_id) s.party_id, c.firm_id FROM answer_subject s
    JOIN case_participant cp ON cp.subject_id = s.id JOIN runtime_case c ON c.id = cp.case_id ORDER BY s.party_id, c.created_at) x
  WHERE x.party_id = p.id;

DO $walls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['runtime_case', 'case_stage', 'firm_case_counter', 'case_decision', 'case_party_index', 'filing', 'party'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY csw3_spike ON %I USING (firm_id = csw3_spike_firm()) WITH CHECK (firm_id = csw3_spike_firm())', t);
  END LOOP;
END $walls$;
