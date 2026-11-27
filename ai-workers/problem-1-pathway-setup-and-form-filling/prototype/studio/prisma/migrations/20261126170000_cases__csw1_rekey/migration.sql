-- CS-W1 part 2b (Release 1 row R1.3; BACKLOG CS-W1; brief design/briefs/CS-W1.md "Part 2"; contract v0.1 §8 step 1;
-- P-559 (4), P-575, P-588 (4)): with firm_id NOT NULL (part 2a, #3870), the case side's four unique rules move from the
-- text firm key to the platform firm id. Area file cases.prisma (the runtime lane's). firm_key stays beside firm_id
-- (P-559 (4)); the two are one-to-one (case_firm_from_key fills the id from the key; case_firm_fixed keeps both), so the
-- re-key changes which rows conflict for no existing data.
--   * runtime_case: (workspace_id, firm_id, idempotency_key), (…, reference), (…, case_number) replace the firm_key ones.
--   * firm_case_counter: its primary key becomes (workspace_id, firm_id, year).
--   * runtime_next_case_number(ws, firm, at) keeps its signature (runtime.ts unchanged there): it resolves the platform
--     firm of the key inside, refuses in words when the key has none (part 2a's breaker B8: it failed raw on the NOT
--     NULL), and counts on the new key.
-- Rollback (in this order): restore runtime_next_case_number from 20261112150000_a24_case_number; ALTER TABLE
--   firm_case_counter DROP CONSTRAINT firm_case_counter_pkey, ADD CONSTRAINT firm_case_counter_pkey PRIMARY KEY
--   (workspace_id, firm_key, year); DROP INDEX the three runtime_case_workspace_id_firm_id_* indexes; CREATE UNIQUE INDEX
--   the three runtime_case_workspace_id_firm_key_* ones (as in their earlier migrations); then delete this folder's row
--   from _prisma_migrations. Nothing is lost.

-- A duplicate under the new rules would only be a row whose firm id disagrees with its key (part 2a refuses those for new
-- rows); stop in words before any index changes (breaker m2), so the migration never stops half-way.
DO $chk$
DECLARE bad text;
BEGIN
  SELECT string_agg(x, ', ') INTO bad FROM (
    SELECT 'case number ' || case_number x FROM runtime_case WHERE case_number IS NOT NULL GROUP BY workspace_id, firm_id, case_number HAVING count(*) > 1
    UNION ALL SELECT 'reference ' || reference FROM runtime_case WHERE reference IS NOT NULL GROUP BY workspace_id, firm_id, reference HAVING count(*) > 1
    UNION ALL SELECT 'idempotency key ' || idempotency_key FROM runtime_case WHERE idempotency_key IS NOT NULL GROUP BY workspace_id, firm_id, idempotency_key HAVING count(*) > 1
    UNION ALL SELECT 'case counter ' || year FROM firm_case_counter GROUP BY workspace_id, firm_id, year HAVING count(*) > 1
    LIMIT 20) q;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'CS-W1 part 2b stopped: these would repeat within one firm once keyed by its platform id: % (fix the rows, then: npx prisma migrate resolve --rolled-back 20261126170000_cases__csw1_rekey, and migrate again)', bad USING ERRCODE = '23505';
  END IF;
END $chk$;

-- DropIndex
DROP INDEX "runtime_case_workspace_id_firm_key_case_number_key";

-- DropIndex
DROP INDEX "runtime_case_workspace_id_firm_key_idempotency_key_key";

-- DropIndex
DROP INDEX "runtime_case_workspace_id_firm_key_reference_key";

-- AlterTable
ALTER TABLE "firm_case_counter" DROP CONSTRAINT "firm_case_counter_pkey",
ADD CONSTRAINT "firm_case_counter_pkey" PRIMARY KEY ("workspace_id", "firm_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_case_workspace_id_firm_id_idempotency_key_key" ON "runtime_case"("workspace_id", "firm_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_case_workspace_id_firm_id_reference_key" ON "runtime_case"("workspace_id", "firm_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_case_workspace_id_firm_id_case_number_key" ON "runtime_case"("workspace_id", "firm_id", "case_number");

-- The next case number of a firm, taken inside the caller's transaction (the opening's): the same signature, counted on
-- the platform firm.
CREATE OR REPLACE FUNCTION runtime_next_case_number(ws uuid, firm text, at timestamptz) RETURNS text LANGUAGE plpgsql AS $$
DECLARE y integer := extract(year FROM at AT TIME ZONE 'America/Toronto')::integer; n integer; f uuid := case_lookup.case_firm_id_of_key(firm);
BEGIN
  IF f IS NULL THEN
    RAISE EXCEPTION 'runtime_next_case_number: the firm "%" has no account on the platform yet, so it cannot number a case', firm USING ERRCODE = 'P0001';   -- a raise in words (review nit: 23502 reads as a NOT NULL failure)
  END IF;
  INSERT INTO firm_case_counter (workspace_id, firm_key, firm_id, year, next_value) VALUES (ws, firm, f, y, 2)
    ON CONFLICT (workspace_id, firm_id, year) DO UPDATE SET next_value = firm_case_counter.next_value + 1
    RETURNING next_value - 1 INTO n;
  RETURN 'C-' || y || '-' || lpad(n::text, greatest(5, length(n::text)), '0');
END $$;
