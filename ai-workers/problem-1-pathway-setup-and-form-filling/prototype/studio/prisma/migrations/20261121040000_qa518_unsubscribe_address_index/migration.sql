-- QA-518 (Release 1 row 49; review M1 on #2618): two read indexes for the address stop after a one-click unsubscribe.
-- ConsentStore.allows finds, for a marketing email, the firm's outbox rows to that address (msg_outbox by firm, channel,
-- address) and then whether one of them was unsubscribed from (msg_consent_withdrawal by firm and withdrawn_by, which the
-- door writes as system:unsubscribe:<outbox id>; it also serves the door's own "used before" lookup, unsubscribe.ts).
-- Indexes only: no table, column, row or policy changes. Owner: the platform messages area.
-- Rollback: rollback.sql in this folder (drops both indexes, then this folder's _prisma_migrations row). Nothing is lost.
CREATE INDEX "msg_outbox_firm_id_channel_address_idx" ON "msg_outbox"("firm_id", "channel", "address");
CREATE INDEX "msg_consent_withdrawal_firm_id_withdrawn_by_idx" ON "msg_consent_withdrawal"("firm_id", "withdrawn_by");
