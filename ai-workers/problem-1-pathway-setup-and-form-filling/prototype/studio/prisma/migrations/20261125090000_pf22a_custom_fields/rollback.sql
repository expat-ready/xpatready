-- PF-22a part 1 rollback (not a migration: Prisma reads only migration.sql). Run in one transaction, after the code that
-- uses these tables (PF-22a part 2 onwards) is rolled back:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20261125090000_pf22a_custom_fields/rollback.sql
-- The fields, values and saved views are dropped with their tables: keep a copy first if any exist.
DROP TABLE "plat_custom_value";
DROP TABLE "plat_custom_field";
DROP TABLE "plat_saved_view";
DROP FUNCTION pf_custom_field_kept(), pf_custom_value_checked(), pf_custom_view_kept(),
  pf_custom_value_ok("PlatCustomFieldType", jsonb, jsonb), pf_custom_options_ok("PlatCustomFieldType", jsonb),
  pf_custom_names_ok(jsonb), pf_custom_label_ok(text, int), pf_custom_name_ok(text, int), pf_custom_trim(text);
DROP TYPE "PlatCustomFieldType";
DELETE FROM "platform_role_permission" WHERE "permission_key" = 'agent/custom-field:manage';
DELETE FROM "platform_permission_key" WHERE "key" = 'agent/custom-field:manage';
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261125090000_pf22a_custom_fields';
