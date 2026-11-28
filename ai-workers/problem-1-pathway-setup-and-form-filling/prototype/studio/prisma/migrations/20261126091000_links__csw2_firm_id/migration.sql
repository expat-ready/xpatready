-- CS-W2 part links (Release 1 row R1.3; BACKLOG CS-W2; brief design/briefs/CS-W2.md part 2; case-side contract v0.1 §8
-- steps 2 and 2a, conditions 1 and 3; P-575, P-588 (4), (5), P-600; AG-1-1@ca84eb07, AG-1-45@a4057ff0): the platform firm
-- on the three link tables. Area file links.prisma only (the runtime lane's). Every function is case_links_*, SECURITY
-- INVOKER, search_path pinned, pg_temp last. person_link_try is untouched: a named exception (P-588 (5); CS-W4's gate).
--   * firm_id uuid on person_link, person_link_session and demo_message, the session's firm as its default (CS-W1's text),
--     an index (firm_id, …) beside each (case_id / link_id, …) one; person_link gets the (id, firm_id) unique its
--     children's keys need.
--   * NULLABLE in this part, as in part filings (#3811): runtime_case.firm_id is nullable until CS-W1 part 2, and suites'
--     scratch databases make cases with no platform firm. The NOT NULL sweep lands with CS-W1 part 2.
--   * the fill: BEFORE INSERT case_links_firm_fill calling CS-W1's case_firm_fill(parent, column): the case for
--     person_link, the link for its sessions and demo messages; a different firm (named, or the session's through the
--     default) is refused (23514).
--   * the keys (§8 step 2a): person_link_session and demo_message (link_id, firm_id) → person_link (id, firm_id), ON UPDATE
--     RESTRICT. person_link → runtime_case (case_id, firm_id) and → answer_subject go to part "keys" (runtime_case's
--     (id, firm_id) unique comes with #3811 on cases.prisma, a file this part does not touch).
--   * supersededBy (an optional SetNull self-relation: a composite key would null firm_id on delete) is held by a match
--     trigger instead (brief point 2): case_links_firm_match refuses a link superseded by a link of another case
--     (so of another firm, even while a firm is still empty), from both ends.
--   * the keep: BEFORE UPDATE OF firm_id, case_links_firm_keep refuses a firm emptied or changed once set (the keys skip
--     a null firm; breaker M1 on #3811).
--   * the follow: AFTER UPDATE OF firm_id on runtime_case and person_link, case_links_firm_follow fills the children still
--     empty (a case whose key gets its platform firm after this migration; CS-W1's backfill runs after each seed).
-- Rollback (in this order): DROP TRIGGER case_links_firm_fill ON person_link, person_link_session, demo_message; DROP TRIGGER
--   case_links_firm_match ON person_link; DROP TRIGGER case_links_firm_follow ON runtime_case, person_link; DROP TRIGGER case_links_firm_keep ON
--   the three tables; DROP FUNCTION case_links_firm_keep(), case_links_firm_follow(), case_links_firm_match(), case_links_firm_backfill(); DROP the two *_link_id_firm_id_fkey
--   constraints; DROP INDEX each index below; ALTER TABLE person_link, person_link_session, demo_message DROP COLUMN firm_id;
--   then delete this folder's row from _prisma_migrations. Nothing is lost: firm_id is derived.

-- AlterTable
ALTER TABLE "demo_message" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "person_link" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- AlterTable
ALTER TABLE "person_link_session" ADD COLUMN     "firm_id" UUID DEFAULT (NULLIF(current_setting('app.firm_id'::text, true), ''::text))::uuid;

-- CreateIndex
CREATE INDEX "demo_message_firm_id_link_id_idx" ON "demo_message"("firm_id", "link_id");

-- CreateIndex
CREATE INDEX "person_link_firm_id_case_id_idx" ON "person_link"("firm_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_link_id_firm_id_key" ON "person_link"("id", "firm_id");

-- CreateIndex
CREATE INDEX "person_link_session_firm_id_link_id_idx" ON "person_link_session"("firm_id", "link_id");

-- The backfill, parents first; a second run changes nothing. Returns the number of rows filled.
CREATE FUNCTION case_links_firm_backfill() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE n integer; total integer := 0;
BEGIN
  UPDATE person_link l SET firm_id = k.firm_id FROM runtime_case k WHERE k.id = l.case_id AND l.firm_id IS NULL AND k.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE person_link_session s SET firm_id = l.firm_id FROM person_link l WHERE l.id = s.link_id AND s.firm_id IS NULL AND l.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE demo_message m SET firm_id = l.firm_id FROM person_link l WHERE l.id = m.link_id AND m.firm_id IS NULL AND l.firm_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  RETURN total;
END $fn$;
REVOKE ALL ON FUNCTION case_links_firm_backfill() FROM PUBLIC;
SELECT case_links_firm_backfill();

-- Stop with words, before the triggers and keys: a link superseded by a link of another case (breaker M-1 on #3823: the
-- firm follows the case, so the same case is the rule that holds whichever side's firm is still empty), and a session or
-- message whose link is missing, or a link whose case is missing (a forced restore; brief DW2.1).
DO $chk$
DECLARE bad text;
BEGIN
  SELECT string_agg(x, ', ') INTO bad FROM (
    SELECT 'person_link ' || l.id || ' (superseded by a link of another case)' x FROM person_link l JOIN person_link s ON s.id = l.superseded_by_id WHERE s.case_id <> l.case_id
    UNION ALL SELECT 'person_link ' || l.id || ' (no such case)' FROM person_link l WHERE NOT EXISTS (SELECT 1 FROM runtime_case k WHERE k.id = l.case_id)
    UNION ALL SELECT 'person_link_session ' || s.id || ' (no such link)' FROM person_link_session s WHERE NOT EXISTS (SELECT 1 FROM person_link l WHERE l.id = s.link_id)
    UNION ALL SELECT 'demo_message ' || d.id || ' (no such link)' FROM demo_message d WHERE NOT EXISTS (SELECT 1 FROM person_link l WHERE l.id = d.link_id)
    LIMIT 20) q;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'CS-W2 links stopped: %', bad USING ERRCODE = '23514';
  END IF;
END $chk$;

-- The fill on insert (CS-W1's generic function).
CREATE TRIGGER case_links_firm_fill BEFORE INSERT ON "person_link" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('runtime_case', 'case_id');
CREATE TRIGGER case_links_firm_fill BEFORE INSERT ON "person_link_session" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('person_link', 'link_id');
CREATE TRIGGER case_links_firm_fill BEFORE INSERT ON "demo_message" FOR EACH ROW EXECUTE FUNCTION case_firm_fill('person_link', 'link_id');

-- supersededBy: the link it names must be of the same case, so of the same firm whichever side's firm is still empty
-- (breaker M-1 on #3823: a firm check alone let a pair through while one side had no firm, and the follow then stored a
-- cross-firm pair). Checked from both ends: the row naming a link, and a link whose case changes while others name it.
-- A resend always supersedes the same person's link on the same case (C6.16), so the app is unchanged.
CREATE FUNCTION case_links_firm_match() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE other uuid;
BEGIN
  IF NEW.superseded_by_id IS NOT NULL THEN
    SELECT case_id INTO other FROM person_link WHERE id = NEW.superseded_by_id;
    IF other IS NOT NULL AND other IS DISTINCT FROM NEW.case_id THEN
      RAISE EXCEPTION 'case_links_firm_match: a link can only be superseded by a link of its own case' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.case_id IS DISTINCT FROM OLD.case_id
     AND EXISTS (SELECT 1 FROM person_link p WHERE (p.superseded_by_id = NEW.id OR p.id = NEW.superseded_by_id) AND p.id <> NEW.id AND p.case_id IS DISTINCT FROM NEW.case_id) THEN
    RAISE EXCEPTION 'case_links_firm_match: a link can only be superseded by a link of its own case' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_links_firm_match BEFORE INSERT OR UPDATE OF superseded_by_id, case_id ON "person_link" FOR EACH ROW EXECUTE FUNCTION case_links_firm_match();

-- A firm once set stays (breaker M1 on part filings, #3811): the keys skip a row whose firm_id is null (MATCH SIMPLE), so
-- emptying it would let one statement move a session or message under another firm's link; a change is refused too.
CREATE FUNCTION case_links_firm_keep() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF OLD.firm_id IS NOT NULL AND NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    RAISE EXCEPTION 'case_links_firm_keep: a % row keeps its firm', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER case_links_firm_keep BEFORE UPDATE OF firm_id ON "person_link" FOR EACH ROW EXECUTE FUNCTION case_links_firm_keep();
CREATE TRIGGER case_links_firm_keep BEFORE UPDATE OF firm_id ON "person_link_session" FOR EACH ROW EXECUTE FUNCTION case_links_firm_keep();
CREATE TRIGGER case_links_firm_keep BEFORE UPDATE OF firm_id ON "demo_message" FOR EACH ROW EXECUTE FUNCTION case_links_firm_keep();

-- The follow: when a parent's firm is filled later, its still-empty children take it (TG_ARGV: child table, its column, …).
CREATE FUNCTION case_links_firm_follow() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE i int := 0;
BEGIN
  IF NEW.firm_id IS NULL OR NEW.firm_id IS NOT DISTINCT FROM OLD.firm_id THEN RETURN NULL; END IF;
  WHILE i < TG_NARGS LOOP
    EXECUTE format('UPDATE %I SET firm_id = $1 WHERE %I = $2 AND firm_id IS NULL', TG_ARGV[i], TG_ARGV[i + 1]) USING NEW.firm_id, NEW.id;
    i := i + 2;
  END LOOP;
  RETURN NULL;
END $fn$;
CREATE TRIGGER case_links_firm_follow AFTER UPDATE OF firm_id ON "runtime_case" FOR EACH ROW EXECUTE FUNCTION case_links_firm_follow('person_link', 'case_id');
CREATE TRIGGER case_links_firm_follow AFTER UPDATE OF firm_id ON "person_link" FOR EACH ROW EXECUTE FUNCTION case_links_firm_follow('person_link_session', 'link_id', 'demo_message', 'link_id');

-- AddForeignKey
ALTER TABLE "person_link_session" ADD CONSTRAINT "person_link_session_link_id_firm_id_fkey" FOREIGN KEY ("link_id", "firm_id") REFERENCES "person_link"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "demo_message" ADD CONSTRAINT "demo_message_link_id_firm_id_fkey" FOREIGN KEY ("link_id", "firm_id") REFERENCES "person_link"("id", "firm_id") ON DELETE CASCADE ON UPDATE RESTRICT;
