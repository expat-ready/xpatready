-- FO-7ts part 1, step 2 (tech lead Lead 80 on #2106, 18 Nov, accepting the brief's proposal; Lead B's #2016 Q2 ruling
-- "card terminal is Operating only"; P-567 (3) "card only for invoiced fees into the operating account", legal reading
-- Unconfirmed: no counsel): a card terminal payment is never received into trust, at the database as well as at FO-7b's
-- route (defence in depth). FO-7a's money_payment_card_not_trust is widened from CARD to CARD and CARD_TERMINAL.
-- A step of its own: CARD_TERMINAL was added by the step before (20261117133000_fo7ts_money_settings), and a new enum
-- value is usable only after the transaction that added it commits.
-- Rollback: put back FO-7a's check, CHECK ("method" <> 'CARD' OR "received_into" = 'OPERATING'), and delete this
--   folder's row from _prisma_migrations.

-- A card terminal payment already recorded into trust stops the migration (none can exist outside a test database:
-- no route records CARD_TERMINAL yet).
DO $$
DECLARE p uuid;
BEGIN
  SELECT x.id INTO p FROM "money_payment" x WHERE x.method = 'CARD_TERMINAL' AND x.received_into <> 'OPERATING' ORDER BY x.id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'FO-7ts: payment % is a card terminal payment received into trust; card money goes to operating only: correct it by hand, then rerun', p USING ERRCODE = 'check_violation';
  END IF;
END $$;

ALTER TABLE "money_payment" DROP CONSTRAINT "money_payment_card_not_trust",
  ADD CONSTRAINT "money_payment_card_not_trust" CHECK ("method" NOT IN ('CARD', 'CARD_TERMINAL') OR "received_into" = 'OPERATING');
