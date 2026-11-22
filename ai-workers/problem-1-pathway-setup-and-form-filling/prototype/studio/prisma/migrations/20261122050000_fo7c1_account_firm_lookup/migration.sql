-- FO-7c part 1 (R1.57; the row's contract gap 1; AG-16-14..18): the connected-account webhook door finds its firm. A Stripe
-- event names a connected account, not our firm, and money_payment_account and webhook_receipt are behind PF-12's walls,
-- so before the firm is known the door can read neither. One narrow definer lookup, as PF-12b part 2's doors
-- (platform_firm_of_key): the account id → the id of the firm that holds it, and nothing else; an unknown account → null.
-- The door then stores its receipt and changes the account as that firm, under the walls (no bypass use). Owned by
-- xr_wall_reader, SECURITY DEFINER, search_path pinned with pg_temp last; EXECUTE for xr_app and xr_staff_bypass only.
-- Additive (P-600): no table, column, index or row changes. Stamped after main's newest (20261122040000_pf8b_f6_pf18bk_checksum,
-- which shares this PR's earlier stamp and sorts after it by name).
-- Rollback: rollback.sql in this folder.
-- PF-8b F4 (review M1): on RDS the reader may be handed a function only while it holds CREATE on the schema; granted
-- for this hand-over only and taken back after the last grant.
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
CREATE FUNCTION money_firm_of_stripe_account(account text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT a.firm_id FROM money_payment_account a WHERE a.stripe_account_id = $1 $fn$;
ALTER FUNCTION money_firm_of_stripe_account(text) OWNER TO xr_wall_reader;
REVOKE ALL ON FUNCTION money_firm_of_stripe_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION money_firm_of_stripe_account(text) TO xr_app, xr_staff_bypass;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
