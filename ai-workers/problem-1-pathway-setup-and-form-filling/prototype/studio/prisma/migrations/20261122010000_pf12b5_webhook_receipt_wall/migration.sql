-- PF-12b part 5 (QA-703, found by the fresh reader; Lead 17's row, 22 Nov): webhook_receipt has had a firm_id since PF-3,
-- and PF-5 part 2 (#1959) stores a handled receipt's firm and outcome in it, but no migration walled it: it is outside
-- PF-12's families, so neither PF-12's list nor its guard named it. Additive (P-600): ENABLE + FORCE row-level security
-- with PF-12's firm policy (firm_id = platform_session_firm(): a firm reads and writes only its own receipts; a receipt
-- matched to no firm, firm_id null, is read by no firm) and the first gate, as every walled table has. The Stripe door and
-- its sweep run on their bypass uses (platform.billing.stripe-webhook, job:platform.billing.webhook_sweep: the bypass role
-- passes the walls), so receiving, handling and the unmatched-customer path work as before. No row, column or index
-- changes. tests/check_pf12_walls.ts's guard now covers every table with a firm_id column.
-- Rollback: rollback.sql in this folder.
ALTER TABLE "webhook_receipt" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "webhook_receipt" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "webhook_receipt" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
