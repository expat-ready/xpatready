# R1.52 part 1 (PF-19m mailbox tables): break report

PR #3653, head **ca2e17127b1830b458544077e39ec7c31705ab43**. Breaker, 25 Nov. Schema only: `prisma/migrations/20261125060000_pf19m_mailboxes/migration.sql`, `prisma/schema/platform-messages.prisma`.

**Verdict: Block.** One Blocker (the migration cannot be deployed on an RDS-shaped database) and two Majors (a filed email can be rewritten or removed; email can still arrive in a disconnected mailbox). The firm walls hold.

**How it was run.** The files came from the commit itself (`git archive <head>`, sha256 of the migration `872a82c8…`), not from the working tree. The shared checkout had an uncommitted staged rename of the folder to `…_platform-messages__pf19m_mailboxes`, and another process was changing files in the shared scratch folder while I worked, so a copy of my own was used. Every migration was applied with psql to a scratch database on 127.0.0.1:54329, seeded by direct inserts (firm A with staff R and T, firm B with staff S, mailboxes, filed and unfiled email, an Unmatched entry, a link), and attacked as `xr_app` (`begin; select set_config('app.firm_id', '<firm>', true); …; commit;`), as `xr_data` and as `xr_staff_bypass` (`-c role=`). An RDS-shaped cluster (non-superuser admin with CREATEROLE, CREATEDB and BYPASSRLS, terse logs, as `tools/rds-shape-check.sh` sets up) ran on its own port, 15471/15472. `tests/check_pf19m_mailbox_schema.ts` passes on the clean copy (35/35). All scratch databases and the cluster were dropped. :4400 was never touched.

## Blocker

**B1. On RDS the migration stops: `permission denied for schema public`.** At migration.sql:203-208 the two trigger functions are handed to `xr_wall_reader` (`ALTER FUNCTION … OWNER TO xr_wall_reader`) without first granting the reader CREATE on public and revoking it after. Since `20261121230000_pf8b_f4_reader_create` took that right back, every later migration does this pairing: fo9b_review:62-67, pf10a:314-326, pf21c:419-434 and pf21d_erasure:156-171. On a non-superuser migration role the ALTER fails, the whole migration rolls back (0 tables), and every later deploy stops with it. The guard test that catches this already fails at this head:
```
tsx studio/tests/check_pf8b_f4_migrations.ts
FAIL every migration after F4 that hands xr_wall_reader a function grants it CREATE on public first and revokes it after (32 later): ["20261125060000_pf19m_mailboxes"]
```
Reproduced on the RDS-shaped cluster. All 170 earlier migrations applied as `xr_admin` (rolsuper = f) with `psql -1 -f`, then:
`psql:20261125060000_pf19m_mailboxes/migration.sql:206: ERROR:  permission denied for schema public`.
In a scratch copy, adding `GRANT CREATE ON SCHEMA public TO xr_wall_reader;` before line 203 and the matching REVOKE at the end made it apply: 4 tables, and the reader ends with no CREATE. This only confirms the cause; the PR file was not changed. The superuser clusters (CI, demo, lane copies) hide this.

## Major

**M1. A filed email can be rewritten, or removed, in one transaction.** The trigger refuses a direct DELETE of a filed email and any change to its content. But un-filing is allowed, deleting an unfiled email is allowed, and inserting again with the same id is allowed. So both "the message never changes after insert, only its filing" and "a filed email is kept" fall to three statements. As xr_app, firm A:
```sql
update msg_email set filed_kind=null, filed_id=null, filed_by=null, filed_rule=null, filed_at=null where id='<E>';
delete from msg_email where id='<E>';
insert into msg_email (id, firm_id, mailbox_id, direction, provider_message_id, thread_key, from_address, subject, sent_at,
  filed_kind, filed_id, filed_by, filed_rule, filed_at)
values ('<E>','<A>','<mailbox>','INBOUND','pA1','tA1','someone-else@example.com','REWRITTEN', now()-interval '30 days',
  'fo-lead','<lead>','RULE','thread', now());
-- → UPDATE 1, DELETE 1, INSERT 0 1; the row now reads "REWRITTEN / someone-else@example.com"
```
The record's timeline (part 4) then shows a sender, subject and date the mailbox never received. With only the first two statements, a filed email is simply gone. Whatever closes this must still let PF-21d's erasure job remove a person's email (ports/erasure.ts rule 3); today the job could only do it through this same gap.

**M2. Email still lands in a DISCONNECTED mailbox, and its sync state still moves.** Nothing ties an insert into `msg_email`, or a cursor update, to the mailbox's status. Part 3's disconnect ("stops sync and purges unfiled stored email", AG-10-4) relies on this being impossible. Without a database rule, a sync job that started before the disconnect committed writes its batch after the purge, and that unfiled personal data stays, under a mailbox that can never sync or purge again.
```sql
insert into msg_mailbox (id, firm_id, provider, address, status, connected_by, updated_at)
  values ('<D>','<A>','GOOGLE','old@a.example','DISCONNECTED','x',now());
insert into msg_email (id, firm_id, mailbox_id, direction, provider_message_id, thread_key, from_address, subject, sent_at)
  values (gen_random_uuid(),'<A>','<D>','INBOUND','late1','t','late@example.com','after purge',now());   -- INSERT 0 1
update msg_mailbox set sync_cursor='999', last_checked_at=now() where id='<D>';                            -- UPDATE 1
```

## Minor

**m1. The credential check checks the shape loosely and accepts token-bearing values.** It accepts `sb1.v1.<raw Google access token>` (the real adapter writes exactly `sb1.v<n>.<iv16>.<tag22>.<ct>`, aes-gcm.ts:8,50). It also accepts `fake1.v1.<base64url plaintext>`, the test-only box (ports/secret-box.ts:104-109, "never used by the running app"), whose value decodes straight to the token. Other columns that take a token unchecked: `sync_cursor`, `connected_by` (on insert), `msg_address_link.created_by`, `msg_unmatched.resolved_by`.
```sql
update msg_mailbox set credential='sb1.v1.ya29.a0AfB_byRawGoogleAccessToken0123456789-_abc' where id='<M>';   -- UPDATE 1
update msg_mailbox set credential='fake1.v1.eyJvIjoieCIsInAiOiIxLy8wZ1Jhd1JlZnJlc2hUb2tlblZhbHVlIn0' where id='<M>'; -- UPDATE 1, decodes to {"o":"x","p":"1//0gRawRefreshTokenValue"}
update msg_mailbox set sync_cursor='ya29.a0AfB_byRawGoogleAccessToken' where id='<M>';                         -- UPDATE 1
```
A bare token (`ya29.…`) is refused (23514).

**m2. An open Unmatched email can be deleted from a live mailbox, and its entry goes with it without a trace.** Deletion is gated only on "unfiled", not on the mailbox being DISCONNECTED (the purge). AG-10-12 says Unmatched is "never dropped".
`delete from msg_email where id='<unfiled email of a CONNECTED mailbox>';` → DELETE 1, `msg_unmatched` count 0.

**m3. "One live mailbox per firm and address" can be dodged with invisible characters.** The regex's `\s` does not cover U+200B or U+00A0, and a Cyrillic look-alike also passes. `to_addresses`, `cc_addresses` and `via_address` have no lower-case check, unlike `from_address`.
`insert … address values (E'info​@a.example'), (E'info@a.example '), (E'info@a.exаmple')` next to a live `info@a.example` → INSERT 0 3. Also `'%@gmail.com'` is accepted as a `msg_address_link.address`; later matchers must compare by equality, never with LIKE.

**m4. Unmatched rows can contradict their email or grow without limit.** An OPEN entry is accepted for an email that is already filed (`insert into msg_unmatched (id, firm_id, email_id) values (gen_random_uuid(),'<A>','<filed E>')` → OPEN). `suggestions` caps the number of entries (20) but not their size: `update msg_unmatched set suggestions = jsonb_build_array(jsonb_build_object('note', repeat('x',3000000)))` → 3 MB stored.

## What held

* **Walls.** Firm A's session reads 0 of firm B's mailboxes, emails, Unmatched entries and links, even by id, and its UPDATE or DELETE of them touches 0 rows. A row naming firm B, or moving firm_id, is refused by `platform_firm_first` (42501) before any msg_ trigger. With no firm set, xr_app sees nothing. `row_security = off` is refused.
* **Composite keys.** An email into another firm's mailbox, an Unmatched entry pointing at another firm's email, or a mailbox owned by another firm's staff member gives 23503, with no key values in DETAIL. The CASCADE reaches only the same firm's (firm_id, email_id).
* **Mailbox rules.** A second main address is refused (23505), also when two sessions race (one wins, one gets 23505). A personal mailbox cannot be main (23514), and neither can a DISCONNECTED one. Owner, address, provider, id and connected_by never change. DISCONNECTED never goes back to PENDING or CONNECTED and never holds a credential. DELETE is refused. The same live address twice gives 23505. Capitals and wordy error codes give 23514.
* **Email content.** UPDATE of subject, from or thread gives 23514. A half filing gives 23514. The same provider id twice in one mailbox gives 23505.
* **Privileges.** TRUNCATE on all four tables is denied to xr_app, xr_data and xr_staff_bypass. `DISABLE TRIGGER`, `DROP POLICY`, `ALTER FUNCTION … SECURITY INVOKER`, `CREATE OR REPLACE public.msg_email_write`, `session_replication_role = replica`, and `SET ROLE xr_wall_reader` or `xr_data` are all refused.
* **Definer functions.** They are pinned to `search_path = pg_catalog, public, pg_temp` and call nothing by name. Called directly, they refuse. Attached as a trigger to xr_app's own temp table, they only compare NEW and OLD, so nothing is gained (EXECUTE stays with PUBLIC, as for every other reader trigger).

Not findings (other parts or PF-12's design): `SET ROLE xr_staff_bypass` reads every firm's sealed credentials (PF-12's named bypass); AG-10-69 (a personal mailbox's unfiled mail visible only to its owner) is part 4's filter, not a database wall.
