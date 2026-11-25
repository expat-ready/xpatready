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

## Round 2 (14c4b73)

**Verdict: Approve.** B1, M1 (as reported), M2 and m1 to m4 are closed or narrowed. Nothing new is Blocker or Major; the eight Minors below are rules parts 3 and 4 must know. Files came from `git archive 14c4b73` (migration sha256 `ae030e57…`); all 170 migrations applied with `psql -1` to a scratch database on :54329 and, as `xr_admin` (rolsuper f, BYPASSRLS), to a throwaway RDS-shaped cluster on 15481. Attacks ran as `xr_app` in one transaction with the firm set. `check_pf8b_f4_migrations.ts` 9/9 and `check_pf19m_mailbox_schema.ts` 44/44 pass on that copy. Scratch databases and the cluster were removed; :4400 was not used.

**Closed.** **B1:** the migration applies on the RDS shape (4 tables, 3 functions owned by `xr_wall_reader`, reader CREATE on public false after), and inserting, filing, purging and the Unmatched check all run there as xr_app. **M1:** the three-statement rewrite and the two-statement drop both stop at the DELETE (`email is purged only when its mailbox is disconnected`, migration.sql:207); the row still reads "Original". **M2:** an insert into a DISCONNECTED mailbox is refused (:212). Cursor, last checked and error code are frozen (:190). Race checks at READ COMMITTED: a sync insert that came first is purged by the waiting disconnect, a sync arriving mid-disconnect is refused (a REPEATABLE READ sync gets 40001), and a sync that holds the lock and then moves its cursor does not deadlock. **m1:** `sb1.v1.<raw token>`, a free-text cursor, `ya29.…` and `staff:<token>` in the three "by" columns give 23514; real `sb1` values from aes-gcm.ts are accepted. **m2:** an unfiled email of a live mailbox cannot be deleted. **m3:** U+200B, U+00A0, a trailing space and Cyrillic `а` are refused, and upper case in to/cc/via gives 23514. **m4:** an OPEN entry for a filed email, and 3 MB of suggestions, give 23514. **Still open by choice:** `fake1.v1.<base64url plaintext>` is accepted (the header keeps it for the fakes). `%@gmail.com` is still a valid link address, so matchers must compare by equality.

**n1 (Minor). A filed email can still be rewritten under its own id, at the cost of disconnecting its mailbox.** The header (line 13) says this is closed. As xr_app, firm A, in one transaction:
```sql
update msg_email set filed_kind=null, filed_id=null, filed_by=null, filed_rule=null, filed_at=null where id='<E3>';  -- in R's live mailbox
update msg_mailbox set status='DISCONNECTED', credential=null where id='<R mailbox>'; delete from msg_email where id='<E3>';
insert into msg_email (id, firm_id, mailbox_id, direction, provider_message_id, thread_key, from_address, subject, sent_at, filed_kind, filed_id, filed_by, filed_at)
  values ('<E3>','<A>','<main mailbox>','INBOUND','p3','t3','someone-else@example.com','REWRITTEN', now()-interval '30 days','fo-lead','<same lead>','STAFF', now());  -- COMMIT: E3 now reads REWRITTEN / someone-else@example.com, filed to the same lead, under info@
```
Minor, because a DISCONNECTED row is left behind, and xr_app can insert a made-up email anyway. Only the id (audit lines, links) carries over. A list of purged ids checked on insert would close it.

**n2 (Minor). A disconnect run at REPEATABLE READ or SERIALIZABLE leaves the late email.** Session 1 (sync, READ COMMITTED): insert an email into M, then `pg_sleep(2)`. Session 2, 0.5 s later: `begin isolation level repeatable read; update msg_mailbox set status='DISCONNECTED', credential=null, is_main=false where id='<M>'; delete from msg_email where mailbox_id='<M>' and filed_id is null; commit;`. The update waits for the sync. The delete then uses the snapshot taken before the sync committed, so the late email stays unfiled under a DISCONNECTED mailbox. SERIALIZABLE gives the same result. The code already uses RepeatableRead (client-money reads, case-prepare.ts:212). Part 3's purge must run at READ COMMITTED, with a test.

**n3 (Minor). The share lock causes deadlocks (40P01).** (a) Two writers on one mailbox, each inserting an email and then updating the mailbox (sync and "check now", or sync and part 5's send recording `last_error_code`): `deadlock detected … while locking tuple (0,1) in relation "msg_mailbox"`. (b) A disconnect (update, then purge) racing a filing of an unfiled email in that mailbox: the filing holds the email row and waits for the mailbox, the purge waits for the email, and the disconnect is the one that aborts. Nothing is lost, but parts 3 to 5 should lock the mailbox first (`select … for no key update`) or retry on 40P01.

**n4 (Minor). In a DISCONNECTED mailbox, filed email can never be unfiled, refiled or erased.** `update msg_email set filed_id=…` or un-filing gives `a disconnected mailbox takes no email and changes none` (:212), and DELETE gives `a filed email is kept`. So a misfiling from a departed person's mailbox can never be corrected (SA-11-39 un-file), and PF-21d cannot erase it. The header's plan (line 16: erasure "through a function of part 4's, owned like these") cannot work as written: triggers fire for every owner, and inside this definer trigger `current_user` is always `xr_wall_reader`. Part 4 must replace `msg_email_write`.

**n5 (Minor). "Unmatched is never dropped" (AG-10-12) and the OPEN-means-unfiled rule have other ways in.** As xr_app, `delete from msg_unmatched where id='<OPEN entry, live mailbox>'` gives DELETE 1, because there is no DELETE trigger. The owner can `truncate msg_unmatched` and `truncate msg_address_link` (only mailbox and email have no-truncate triggers, :233-234). Filing the email after its entry exists leaves the entry OPEN on a filed email: `update msg_email set filed_kind='fo-lead', filed_id='<lead>', filed_by='STAFF', filed_at=now() where id='<E2>'` → OPEN|filed. An entry can be re-pointed (`update msg_unmatched set email_id='<other email>'` → UPDATE 1), moved from LINKED back to OPEN, or marked LINKED while its email stays unfiled.

**n6 (Minor). The "by" check is narrower than the house actor (ports/audit.ts:14; `msg_actor_ok`, pf19a:307).** `seed:pf19m-sample`, `ourstaff:<uuid>`, `system:platform.mailbox-sync` (the dotted form the code uses, e.g. `system:platform.register.erasure`) and `system:mail_match` give 23514, while `staff:` followed by 36 dashes is accepted (:160, :174, :178). A demo seed or a dotted job name in parts 3 to 7 will be refused.

**n7 (Minor). The 12000-character credential cap is below what the box seals.** aes-gcm.ts accepts up to 8192 characters of plaintext. 8192 × `é` seals to 21893 characters and is refused (23514). 8192 ASCII characters (10970) and a 2.5 KB token JSON (3415) fit.

**Held.** Firm walls and composite keys, as in round 1. Neither check looks across firms: an insert naming another firm's mailbox locks nothing and gets 23503. xr_staff_bypass cannot delete from a live mailbox. TRUNCATE is denied to xr_app, xr_data and xr_staff_bypass on all four tables, and `truncate msg_email|msg_mailbox cascade` as owner gives 23001. The share lock works as `xr_wall_reader` on the RDS shape. Cost: 20,000 inserts in 1.4 s and a 20,000-row purge in 0.34 s.

## Round 3 (9a4a104)

**Verdict: Approve.** Nothing is Blocker or Major. Round 2's n1, n3, n4, n5 (as reported), n6 and n7 are closed; n2 is still open as the header says. The four Minors below are gaps in the new rules. Files came from `git archive 9a4a104` (migration sha256 `8961b571…`). All 170 migrations applied with `psql -1` to scratch databases on :54329 and, as `xr_admin` (rolsuper f, BYPASSRLS), to a throwaway RDS-shaped cluster on 15491. Attacks ran as `xr_app` and as `xr_data` in one transaction with firm A set. `check_pf19m_mailbox_schema.ts` passes 52/52 and `check_pf8b_f4_migrations.ts` 9/9 on that copy. My scratch databases and the cluster were removed. Three `xr_studio_pf19m_*_5958` databases on :54329 are not this round's and were left alone. :4400 was not used.

**Closed.** **n1:** un-file, disconnect, delete and re-insert stops at the DELETE (`a filed email is kept`, :226). The row still reads "Personal filed". **n3:** (a) two writers that each insert and then update the mailbox both commit, no 40P01. (b) A disconnect and purge racing a filing (with no Unmatched entry) does not deadlock, and the filed email is kept. **n4:** in a DISCONNECTED mailbox a filed email can be moved (`fo-prospect`) and un-filed, and it stays (was_filed). **n5:** a direct DELETE of an OPEN entry, a re-point, LINKED back to OPEN, and filing while an entry is OPEN all give 23514. TRUNCATE of msg_unmatched or msg_address_link as owner gives 23001. **n6:** `seed:pf19m-sample`, `ourstaff:<uuid>`, `system:platform.mailbox-sync` and `system:mail_match` are accepted, and 36 dashes are refused. **n7:** sealed values of 78, 3415, 10970 and 21893 characters are accepted. **Still open:** n2, as assigned: a REPEATABLE READ or SERIALIZABLE purge still leaves the late email (`c2b|t`, DISCONNECTED). A LINKED entry whose email is unfiled is still accepted.

**r3-1 (Minor). An OPEN Unmatched entry can still be dropped from a live mailbox (:253, AG-10-12).** (a) `pg_trigger_depth() > 1` can be faked. xr_app (and xr_data) may make temp tables and pg_temp functions, so a trigger of its own runs the DELETE at depth 2:
```sql
create temp table tt (i int) on commit drop;
create function pg_temp.f() returns trigger language plpgsql as $$ begin delete from public.msg_unmatched where id='<U2>'; return new; end $$;
create trigger t after insert on tt for each row execute function pg_temp.f(); insert into tt values (1);
-- COMMIT: entry gone, mailbox CONNECTED; the email can then be filed with no trace. Same on the RDS shape.
```
A writable CTE, a rule on a temp table and an INSTEAD OF trigger on a temp view are refused: the first two run at depth 0, and the view trigger reaches only depth 1. (b) No trick is needed for a resolved entry: `update … set state='DISMISSED', resolved_by='staff:<R>', resolved_at=now(); delete from msg_unmatched where id='<U2>'` → DELETE 1. A new OPEN entry can then be inserted for the same email, so a resolved entry is re-opened by delete and insert, and the record of who resolved it is gone. As a check on the cause only, in a scratch copy, testing `EXISTS (select 1 from msg_email where id = OLD.email_id)` instead of the depth refused (a) and still let the purge's cascade through.

**r3-2 (Minor). Two sessions can still leave an OPEN entry on a filed email (write skew between :241 and :261).** Neither check locks the other's row. The foreign-key check's KEY SHARE on the email row does not conflict with a filing's NO KEY UPDATE. Both orders give `OPEN|t`:
```sql
-- S1: begin; update msg_email set filed_kind='fo-lead', filed_id='<lead>', filed_by='STAFF', filed_at=now() where id='<E5>'; select pg_sleep(1.5); commit;
-- S2 (0.5 s later): begin; insert into msg_unmatched (id, firm_id, email_id) values (gen_random_uuid(),'<A>','<E5>'); commit;
-- and the reverse (entry first, held open; filing second): both commit
```
This is what happens when a sync adds the entry while staff file the same new email. Locking the email row `FOR NO KEY UPDATE` in the Unmatched insert would make each session see the other's write.

**r3-3 (Minor). The new "by" pattern (:172, :186, :190) lets dotted tokens back in.** Round 2 refused these (m1); now they are accepted: `staff:ya29.a0AfB_byRawGoogleAccessToken0123456789-_abc`, a three-part JWT `system:eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflK…` (99 characters), `staff:mysecretapppass`, `staff:a:::::::`, and four 100-character parts (409 characters). The test checks only a four-dot value (tests/check_pf19m_mailbox_schema.ts:227), so `staff:plain.access.value.not` passes. Tokens with a part over 100 characters are still refused. There is no ReDoS: 10 MB is refused in 243 ms, 20,000 near-misses take 16 ms, and a trailing or inner newline is refused.

**r3-4 (Minor). Deadlocks the n3 note does not name.** (a) A writer that files an email of mailbox M and then inserts into M, racing a disconnect and purge of M: the disconnect gets 40P01 `while locking tuple … in relation "msg_email"`. The header (:29-30) names only "a writer that also updates the mailbox row". (b) Two batches inserting into mailboxes M1 and M2 in opposite orders get 40P01 on the `FOR NO KEY UPDATE` (:218). Nothing is lost in either case. Parts 3 to 5 should lock the mailbox first, take mailboxes in id order, or retry.

**Held.** **was_filed:** xr_app and xr_data cannot set or clear it by UPDATE, by INSERT (`true` on an unfiled email, `false` on a filed one), by `on conflict do update`, or from a depth-2 temp trigger. Each time it ends as the trigger sets it. **Insert lock:** it cannot be aimed at firm B's mailbox (23503; firm B's disconnect took 19 ms). A REPEATABLE READ sync after the disconnect gets 40001, and one arriving mid-disconnect gets 23514. **TRUNCATE:** each of the four tables, as owner, with ONLY, CASCADE or RESTART IDENTITY, gives 23001 (`truncate platform_firm cascade` stops too). xr_app, xr_data and xr_staff_bypass are denied. xr_wall_reader holds TRUNCATE, but the triggers still refuse it, and no login role can become it. **RDS shape:** every migration applies. The four functions are SECURITY DEFINER and owned by xr_wall_reader, and the reader has no CREATE on public afterwards. As xr_app, the insert (the reader's row lock), the was_filed rule, the purge and the TRUNCATE refusals all work. r3-1 (a) reproduces there too.
