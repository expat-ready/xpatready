-- FO-13i (P-579, P-600; brief lead-b-briefs/FO-13i.md, schema file prisma/schema/platform-permissions.prisma, owner Lead B
-- (platform)): the permission key that records a client identity check (Code SOR/2022-128 s. 24(2)(a); legal reading
-- Unconfirmed: no counsel). Added rows only, as PF-21's key migration: no table, column or other row changes.
--   * agent/identity-check:record for the roles that hold agent/prospect:edit (OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER):
--     Sample, until the founder or the immigration expert sets who records identity checks.
--   * its catalogue row (PF-6b): scope NONE (not a view.own/view.all key), class GENERAL.
-- Reading a check needs no new key: agent/prospect:show and the person visible to the reader; the copy's bytes need
-- agent/document:show (PF-3's key).
-- Rollback (in this order): DELETE FROM "platform_role_permission" WHERE permission_key = 'agent/identity-check:record';
--   DELETE FROM "platform_permission_key" WHERE key = 'agent/identity-check:record'; delete this folder's row from _prisma_migrations.

INSERT INTO "platform_role_permission" ("role", "permission_key") VALUES
  ('OWNER', 'agent/identity-check:record'), ('ADMIN', 'agent/identity-check:record'),
  ('CASE_MANAGER', 'agent/identity-check:record'), ('CASE_OFFICER', 'agent/identity-check:record');

INSERT INTO "platform_permission_key" ("key", "scope", "class") VALUES ('agent/identity-check:record', 'NONE', 'GENERAL');
