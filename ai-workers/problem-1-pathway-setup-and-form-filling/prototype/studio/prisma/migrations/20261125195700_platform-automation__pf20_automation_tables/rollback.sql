-- Rollback of 20261125195700_platform-automation__pf20_automation_tables (PF-20 part 1, R1.36): the four new tables and their enums, in
-- reverse order; then delete this folder's row from _prisma_migrations. Nothing else was changed.
DROP TABLE IF EXISTS "auto_step_run", "auto_run", "auto_recipe_step", "auto_recipe";
DROP TYPE IF EXISTS "AutoStepState", "AutoRunState", "AutoStepMode";
