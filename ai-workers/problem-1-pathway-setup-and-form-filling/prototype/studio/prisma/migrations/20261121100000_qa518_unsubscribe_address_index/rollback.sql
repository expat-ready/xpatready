-- Rollback of 20261121100000_qa518_unsubscribe_address_index: the two read indexes only; nothing is lost.
DROP INDEX IF EXISTS "msg_outbox_firm_id_channel_address_idx";
DROP INDEX IF EXISTS "msg_consent_withdrawal_firm_id_withdrawn_by_idx";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261121100000_qa518_unsubscribe_address_index';
