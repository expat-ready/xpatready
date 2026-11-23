-- FO-13c (P-579, P-600; brief lead-b-briefs/FO-13c.md, schema file prisma/schema/platform-permissions.prisma, owner Lead B
-- (platform)): the permission key that runs, records and confirms a conflict-of-interest check (Code SOR/2022-128 s. 5,
-- 15, 16; legal reading Unconfirmed: no counsel). Added rows only, as FO-13i's key migration: no table, column or other
-- row changes (FO-13's fo_conflict_check and its triggers stay as they are).
--   * agent/conflict:check for the roles that hold agent/prospect:edit (OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER):
--     Sample, until the founder or the immigration expert sets who runs conflict checks.
--   * its catalogue row (PF-6b): scope NONE (not a view.own/view.all key), class GENERAL.
-- Reading a prospect's checks needs no new key: agent/prospect:show and the prospect visible to the reader.
-- Rollback (in this order): DELETE FROM "platform_role_permission" WHERE permission_key = 'agent/conflict:check';
--   DELETE FROM "platform_permission_key" WHERE key = 'agent/conflict:check'; delete this folder's row from _prisma_migrations.

INSERT INTO "platform_role_permission" ("role", "permission_key") VALUES
  ('OWNER', 'agent/conflict:check'), ('ADMIN', 'agent/conflict:check'),
  ('CASE_MANAGER', 'agent/conflict:check'), ('CASE_OFFICER', 'agent/conflict:check');

INSERT INTO "platform_permission_key" ("key", "scope", "class") VALUES ('agent/conflict:check', 'NONE', 'GENERAL');
