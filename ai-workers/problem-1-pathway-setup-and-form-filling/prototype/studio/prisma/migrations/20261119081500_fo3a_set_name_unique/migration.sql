-- FO-3a part 1c (Lead B on #2243, 19 Nov; breaker M4 on FO-3st2; AG-4-62 rule 1a): a person's sets of hours have
-- different names, compared ignoring case and repeated spaces, so two saves at once cannot both win (the API checks first
-- and answers 409 on fields.name; this index is what holds).
-- Existing rows: where a person already has two sets whose names compare equal, the default (else the older) keeps its
-- name and each other one gets " (2)", " (3)"… (the first free; cut to 80 characters); one audit line per rename, in the
-- platform's audit workspace, the firm's trail. Nothing is deleted. Adds no table and no function.
-- Rollback: DROP INDEX "fo_availability_set_firm_id_staff_id_name_norm_key"; (the renamed sets keep their new names:
--   their audit lines name the old ones) and delete this folder's row from _prisma_migrations.

DO $$
DECLARE r record; n int; candidate text; ws uuid;
BEGIN
  PERFORM set_config('row_security', 'off', true);  -- a role that does not bypass the firm walls fails here
  FOR r IN
    SELECT s.id, s.firm_id, s.staff_id, s.name FROM (
      SELECT x.*, row_number() OVER (PARTITION BY x.firm_id, x.staff_id, lower(regexp_replace(btrim(x.name), '[[:space:]]+', ' ', 'g')) ORDER BY x.is_default DESC, x.created_at, x.id) AS rn
      FROM "fo_availability_set" x) s
    WHERE s.rn > 1 ORDER BY s.created_at, s.id
  LOOP
    n := 2;
    LOOP
      candidate := left(btrim(r.name), 80 - char_length(format(' (%s)', n))) || format(' (%s)', n);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "fo_availability_set" y WHERE y.firm_id = r.firm_id AND y.staff_id = r.staff_id AND y.id <> r.id
        AND lower(regexp_replace(btrim(y.name), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim(candidate), '[[:space:]]+', ' ', 'g')));
      n := n + 1;
    END LOOP;
    UPDATE "fo_availability_set" SET "name" = candidate, "version" = "version" + 1, "updated_at" = now() WHERE id = r.id;
    IF ws IS NULL THEN
      INSERT INTO "workspace" ("id", "key", "label") VALUES (gen_random_uuid(), 'platform-audit', 'Platform audit lines (firm staff, roles, settings; never reset)') ON CONFLICT ("key") DO NOTHING;
      SELECT w.id INTO ws FROM "workspace" w WHERE w.key = 'platform-audit';
    END IF;
    -- A name that looks like an email address is recorded by its length only, as the API's own lines do.
    INSERT INTO "audit_event" ("id", "workspace_id", "firm_id", "actor", "action", "entity", "entity_key", "summary", "detail")
    VALUES (gen_random_uuid(), ws, r.firm_id, 'system:migration', 'availability.set_renamed', 'fo_availability', r.staff_id::text,
      'Availability changed: a set of hours was renamed, because the person had two sets with the same name.',
      jsonb_build_object('migration', '20261119081500_fo3a_set_name_unique', 'firmId', r.firm_id, 'targetStaffId', r.staff_id, 'setId', r.id,
        'name_before', CASE WHEN r.name ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+' THEN format('(%s characters)', char_length(r.name)) ELSE r.name END,
        'name_after', CASE WHEN r.name ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+' THEN format('(%s characters)', char_length(candidate)) ELSE candidate END));
  END LOOP;
END $$;

CREATE UNIQUE INDEX "fo_availability_set_firm_id_staff_id_name_norm_key" ON "fo_availability_set" ("firm_id", "staff_id", lower(regexp_replace(btrim("name"), '[[:space:]]+', ' ', 'g')));
