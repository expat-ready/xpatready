-- Our staff's actor word on a firm's audit trail (BACKLOG row AUD-3a; Lead 10, 23 Nov; SA-7-3: the actor is named as
-- ExpatReady staff from the sign-in group itself; SA-11-2: each line has its actor type). ExpatReady's own staff (PF-4s:
-- a separate sign-in group, no firm) act as `ourstaff:<staff id>`, mapped to OUR_STAFF. AUD-1a's mapping knew no word
-- for them, so a line by our staff could only be refused (audit-event.ts) or, worse, be read as a firm's staff member.
-- The function is replaced with one more WHEN, before its first; nothing else in it changes, and no stored line changes
-- (no audit_event row holds an ourstaff: word today: the adapter refused every line in our staff's request).
-- Rollback: CREATE OR REPLACE the function as 20261117124500_aud1a_audit_insert_only made it (the ourstaff: line out);
-- only after checking that no audit_event row holds an ourstaff: word, or those lines' inserts would have been refused.
CREATE OR REPLACE FUNCTION aud_event_actor_type(actor text) RETURNS "AuditActorType"
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT CASE
    WHEN actor ~ '^ourstaff:[A-Za-z0-9][A-Za-z0-9._:/-]*$' THEN 'OUR_STAFF'
    WHEN actor ~ '^staff:[A-Za-z0-9][A-Za-z0-9._:/-]*$' OR actor IN ('user-A', 'user-B', 'user-C', 'user-O', 'user-R', 'user-T', 'user-S') THEN 'FIRM_STAFF'
    WHEN actor ~ '^person:[A-Za-z0-9][A-Za-z0-9._:/-]*$' OR actor IN ('user-P', 'user-Q') THEN 'CLIENT'
    WHEN actor IN ('system', 'rules') OR actor ~ '^system:[A-Za-z0-9][A-Za-z0-9._:/-]*$' THEN 'SYSTEM'
    WHEN actor ~ '^seed:[A-Za-z0-9][A-Za-z0-9._:/-]*$' THEN 'SEED'
  END::"AuditActorType" $fn$;
