-- Rollback of 20261125100000_pf20_automation_tables (PF-20 part 1, R1.36): the six new tables and their enums, in
-- reverse order; then delete this folder's row from _prisma_migrations. Nothing else was changed.
DROP TABLE IF EXISTS "auto_bulk_recipient", "auto_bulk_send", "auto_step_run", "auto_run", "auto_recipe_step", "auto_recipe";
DROP TYPE IF EXISTS "AutoBulkSendState", "AutoBulkEligibility", "AutoBulkState", "AutoStepState", "AutoRunState", "AutoStepMode";
