# PF-21 break report: complaints register (schema + service), PR #1753 at `5eca107`

Breaker, 14 Nov 2026. Scope: the row PF-21 (= FO-13k rev 12's Done when, plus migration on empty and demo-data copies and `migrate diff` empty) and its brief. No screen and no route, so no UI attacks. Method: scratch databases `xr_studio_pf21brk_{a,bare,demo,deploy}` on :54329 (all dropped at the end). I drove the service through PF-0p's local fakes from scratch tsx scripts outside the repo, using two real `PrismaClient`s for the races and psql for direct SQL. For the demo-data copy I ran an API on :4493 against a database migrated up to before PF-21, loaded "Reset to the six" (17 programs, 6 combinations, 145 audit rows), then applied PF-21's migration. Paths are under `prototype/studio/`: `C` = `api/src/platform/complaints/complaints.ts`, `BD` = `…/business-days.ts`, `M` = `prisma/migrations/20261114200000_pf21_complaints/migration.sql`.

## Findings

**Blockers: none.**

**M1 (Major): the row's events `complaint.received` and `complaint.closed` are never published.**
* Did: grepped and drove every path.
* Expected (FO-13k "What": "events `complaint.received`, `complaint.closed`"; brief: names come from `ports/events.ts` `EVENT.*`): a module event on record and on close.
* Actual: only `plat_complaint_event` rows (kinds RECEIVED/CLOSED) and AuditPort lines (`complaint.record`, `complaint.close`). Nothing is published, and the PR plan does not list it as deferred.
* Where: C:151-153, C:259-261.

**m1 (Minor): a reminder can be lost for good.**
* (a) `JobPort.cancel` runs inside the transaction, before commit (C:187, C:207, C:261). I forced a commit failure on acknowledge (a deferred trigger in scratch). Expected: the reminder survives. Actual: `acknowledged_at` stays NULL, 0 jobs are queued, and 10 fake days later 0 reminder mails are sent.
* (b) `schedule` (C:153) happens before commit. I recorded a complaint received 3 business days ago (due already past) and had a worker run the due job before commit. Expected: one reminder. Actual: the job returned `skipped`, was consumed, and no reminder was ever sent.
* Both need a commit failure or a fast worker. The JobPort signature takes no `tx`.

**m2 (Minor): the received date is not fully checked.**
* `2026-02-31T10:00:00Z` is accepted and stored as 3 Mar (Date.parse rolls over; C:49).
* `0001-…`, `0000-…` and `0099-…` crash with `RangeError: Invalid time value`, a 500 instead of a 422. `localDate` builds an unpadded year (BD:322, BD:334).
* `1900-01-01` is accepted, so there is no plausibility floor.

**m3 (Minor): an id of 36 hex characters or dashes that is not a uuid crashes with a 500 instead of the 404.**
* Did: called `get`, `acknowledge` (and every `change`) with `"-"×36` or `"a"×36`.
* Actual: PrismaClientKnownRequestError / 22P02. The pre-check `/^[0-9a-f-]{36}$/i` is too loose (C:126, C:160).

**m4 (Minor): invisible or hostile text passes as "filled".**
* Did: tried summaries made only of RLO, LRM, U+2066/2069, the Hangul filler U+3164, the braille blank U+2800, a soft hyphen, CGJ or U+180E.
* Actual:
  * All are accepted. TEXT_FILLED is at C:42 and plat_has_text at M:107.
  * The C1 controls U+009B (CSI) and U+0085 (NEL) pass CONTROL (C:44).
  * U+2028 and NEL pass the "one line" rule for the name and contact (C:45, M:114).
* The database is weaker than the service: under the C collation `[:space:]` does not match U+3000 or U+2003, so an SQL insert of those is accepted where the service gives 422.

**m5 (Minor): the database lets through much of what the service refuses.** This contradicts C:11.
* Via SQL, all accepted: an OPEN complaint set CLOSED, or acknowledged, with no matching event; two ACKNOWLEDGED events; event `at` of 1900 or 3000; `acknowledged_at` = 3000-01-01; a complaint with no RECEIVED event at all.
* Two concurrent RECEIVED inserts (two psql sessions) gave **2 RECEIVED events**: the count at M:181 takes no lock that serialises inserts.

**m6 (Minor): app-level privileges bypass the "never deleted" and "insert-only" rules.**
* Did, as the app role `xr_studio` (superuser and table owner on this cluster): `SET session_replication_role = replica` (needs superuser or a SET grant), `ALTER TABLE … DISABLE TRIGGER USER` (owner), `DROP TRIGGER` (owner).
* Actual: each one deleted the complaint and its events, or changed a closed outcome (rolled back afterwards).
* This is a cluster-wide posture (module_event is the same), not PF-21's alone. M:132-140.

**m7 (Minor): the timeline is not ordered.**
* Did: closed a complaint at 17 Nov after acknowledging it at 19 Nov.
* Actual: accepted. Response-before-acknowledgement is also accepted. Each date is checked only against `receivedAt` (C:204, C:231, C:258).

**m8 (Minor): a closing time inside a daylight-saving gap gives an early deadline.**
* `zonedInstant` (BD:326-331): Toronto, open Sun 00:00-02:30, on 8 Mar 2026 → the deadline is 01:30 EST, an hour early; Havana, closes 00:30 on 8 Mar 2026 → Sat 7 Mar 23:30, the day before.
* Pacific/Apia counts the skipped 30 Dec 2011 as a business day.

**m9 (Minor): the list is capped at 500 with no sign of it.**
* Did: listed a firm with 600 complaints.
* Actual: `all`, `open` and `overdue` each return 500 and give no total or cursor. Because the order is newest first, the 100 **oldest overdue** are the ones dropped (C:174).

**m10 (Minor): the reminder goes to a deactivated handler.**
* Did: deactivated the handler after recording the complaint.
* Actual: the mail still went to that person's address, with no fallback to Owner or Admin. The handler lookup ignores status (C:281).
* The mail gives the deadline in UTC ISO, not the firm's zone (C:285).

**m11 (Minor): some choices are not in the row; they should be named in the PR.**
* A handler with **no** complaint keys can close with any outcome (C:107). The row says "visible … to the handler", not "acts".
* `subjectId` is never checked: any uuid is stored, including another firm's person id.
* The "never by anyone" triggers plus the fixed facts also block anonymisation at the end of row 105's keep period (M:133-170). PF-21b/21d will have to rewrite them.

**m12 (Minor), P-600:**
* `platform.prisma` gets **two** lines (86 and 210, firm and staff). The brief says "the one slot line".
* `plat_has_text` is a generic helper name in a prefix shared with the coming PF-21b/21c in the same file, so there is a later "already exists" and rollback clash risk (M:106).

## What held
* **Deletes and truncates:** delete, `MERGE … DELETE`, truncate of either table or both, `TRUNCATE platform_firm/platform_staff CASCADE` (the complaint trigger fires on the cascade), and deleting the firm or a handler (RESTRICT) are all refused.
* **Closed complaints:** reopen, outcome change, an `updated_at`-only or no-op update, any event but NOTE, a second CLOSED event, event update or reassign, and inserting a complaint already CLOSED are all refused. In the service, close again, step, acknowledge, response and handler change → 409; a second acknowledgement or response → 409, and the database refuses it too.
* **Races with two connections:** close‖close ×5 gives exactly one CLOSED and one 409; close‖step is always serialised, never a step after CLOSED (also at SQL level); ack‖ack gives one ACKNOWLEDGED; reminder‖reminder ×3 gives one mail and one REMINDER_SENT; reminder‖ack and close‖reminder never send a reminder after an acknowledgement or a close.
* **Firm walls:** firm B's Owner on firm A's ids → 404, upper case too; a firm-B handler → 422; a reminder payload naming firm A with firm B's id → skipped; a context with firm A plus a firm-B staff id → 404; mixed-case context ids, `subjectId` and handler ids are lowercased and work.
* **Roles:** a case officer who is not the handler → 404 on get and act, and empty lists; the read-only key reads everything, but close or handler change → 403 and delete → 405; the record-only key records, then gets 404 on its own record; a suspended handler → 422.
* **Text:** 4000 characters or 2000 emoji are accepted; 4001 characters or 2001 emoji → 422; NUL, ESC, zero-width-only and newline-in-name → 422; SQL-looking text is stored literally; RTL text is accepted.
* **Dates:** future dates, `24:00` past now, `+99:00`, `infinity` and date-only → 422; infinite values are refused by the database.
* **Business days:** Toronto across fall-back and spring-forward, Lord Howe, Chatham, Kiritimati, Kolkata, Santiago, Etc/GMT+12 and UTC are all correct. A firm with no business day, or with all 366 days closed, gets the 2-calendar-day fallback, never an endless walk.
* **No personal data leaks:** none in audit `detail`, the audit summary, event `detail` or the reminder mail (ids only, no summary, no name).
* **Demo-data copy:** the migration left every row of every table unchanged, including an md5 of `audit_event`. Reset to the six then ran green with 2 complaints present, and both were kept. `prisma migrate deploy` on an empty database is clean.
* **P-600:** every function, trigger and constraint is `plat_`. The stamp `20261114200000` is later than main's newest, `20261114120000_fo1b_booking_tables`. `migrate diff` shows nothing for plat_; the 5 remaining lines (fact_source, form_edition_accept, person_role, validated_copy, canonical_field_name) are identical on main's schema before PF-21, so they are pre-existing.

## Round 2 (540ebf88c)

Breaker, 14 Nov 2026. Scope: permissions and schema (the tech lead's ask), and whether round 1 is closed. I read only the commits since 5eca107 and PF-21's diff.
* **Method:** scratch databases `xr_studio_pf21brk2_{a,demo}` on :54329, both dropped. Contexts built from `platform_role_permission` joined to live grants (firm A got extra Admin, Billing / Finance and Read-only staff). Races on two `pg` connections and on two `PrismaClient`s.
* **Demo-data copy:** an API on :4494 ran "Reset to the six" before PF-21. `C`, `M` as in round 1; `E` = `ports/events.ts`.

**Blockers: none.**

**R2-M1 (Major): one failed mail loses the reminder for good, and the register says it was sent.**
* Did: `fakeMail({failOn})` failing on the first `runAckReminder`, then a retry with mail working. Expected: the retry sends.
* Actual: the first run committed `REMINDER_SENT` and the audit line "Acknowledgement reminder sent to the handler", then threw. The retry → `skipped`: 0 mails ever. With the Owner/Admin fallback, a failure on the first address also stops the rest.
* Where: the event and audit before commit (C:360-361), the mail after it (C:368). The comment at C:340-341 covers only a rollback.

**R2-m1 (Minor): a failing `schedule` throws after the commit.**
* Actual: `record` throws (a 500 on a route), but the complaint and its `complaint.received` row are committed with 0 jobs, so it never gets a reminder. A retry records a second complaint and a second outbox event.
* The same on close: a failing `cancel` throws after the close committed. C:176-181, C:201, C:327.

**R2-m2 (Minor): a `subjectId` that passes the service gives a 500 from the outbox shape.**
* `00000000-0000-0000-0000-000000000001` passes C:71, then `ComplaintReceived.parse` (zod 4's RFC `.uuid()`, E:25) throws a ZodError instead of a 422. C:200, C:329.

**R2-m3 (Minor): the year-2000 floor is checked on the local year.**
* `receivedAt "2000-01-01T00:30:00+05:00"` passes `isInstant` (C:66), then the database check (M:132) refuses it: a 500, not a 422.

**R2-m4 (Minor): under REPEATABLE READ, the one-time events happen twice (SQL-only; the service uses READ COMMITTED, where the race is refused).**
* Did: two REPEATABLE READ connections with snapshots taken; tx 1 inserts an event only and commits, then tx 2 inserts the same kind.
* Actual: 2× `ACKNOWLEDGED`, 2× `REMINDER_SENT`, 2× `CLOSED` (UPHELD and WITHDRAWN) on an OPEN complaint.
* Cause: `FOR UPDATE` is a lock, not an update, so there is no serialization error; `count`/`EXISTS` read the old snapshot (M:228-248).

**R2-m5 (Minor): an event without its row change is accepted, and can block a complaint for good (SQL-only).**
* A `CLOSED` event committed on an OPEN complaint leaves the row OPEN. `svc.close` then fails with an uncaught check_violation, so the complaint can never be closed.
* A stray `ACKNOWLEDGED` or `HANDLER_CHANGED` event can serve a later row update that writes no event. The rule runs one way only (M:156-206).

**R2-m6 (Minor): the timeline and dates can still be forged in SQL.**
* An explicit `seq = -1` puts a STEP before RECEIVED in `get` (C:211; M:71 takes a given seq).
* An event `at` or `acknowledged_at` of 3000-01-01 is accepted (no upper bound, M:131-136, M:143). This is the rest of round 1 m5; 1900 is now refused.

**R2-m7 (Minor): invisible-text gaps are still open.** The service and database lists are the same (M:112 = C:51).
* Both accept a summary or name made only of: tags U+E0001/E0041, U+1D173-1D17A, U+FFF9-FFFB, U+17B4/17B5, U+180B-180D/180F, U+E0100-E01EF, U+1BCA0-1BCA3, U+13430-13436, combining marks alone, U+FFFE.
* An unbalanced RLO inside a one-line name (`"Client ‮tnemyap"`) is accepted, so the name can be displayed spoofed.

**R2-m8 (Minor): a reminder with no recipient is recorded as sent.** In a solo firm, with the only Owner (also the handler) deactivated: `sent`, `REMINDER_SENT {recipients: 0}`, the audit line "sent to the firm's Owners and Admins", and 0 mails. No fallback to the firm's contact email (C:352-366).

**R2-m9 (Minor):** `list(…, {cursor: 123})` throws a TypeError (500) instead of the 422 (C:123).

### What held (round 2)
* **Roles, from the catalogue rows:**
  * Owner and Admin: record, read, step, handler change, close.
  * Case Manager (record only): records; 404 on another handler's complaint; sees only their own.
  * Case Officer, Billing / Finance, Read-only: record 403; read and act 404; empty list.
  * Read key only: reads; act → 403. A handler without keys: acts on their own; handler change → 403. Firm B's Owner: 404.
  * The catalogue holds exactly Lead 47's 5 rows.
* **Cursor:** firm A's cursor in firm B → only firm B's rows. Forged cursors (garbage, `x|y`, 31 Feb, 1999) → 422. Paging by 2 over ties in all four views misses and repeats nothing. Limit 0, 101 and "5" → 422.
* **Triggers under READ COMMITTED, on two connections:** ack against ack (event only, or event and row) → refused; close against handler change, in either order → serialised; a row update waiting on another's event insert → consistent; a REPEATABLE READ STEP after a close → serialization error.
* **Deferred RECEIVED:** refused for a complaint alone in its transaction, for `SET CONSTRAINTS ALL IMMEDIATE` before or after the insert, and for a savepoint rollback of the event. A REPEATABLE READ insert for a complaint committed after the snapshot → refused by the foreign key. An `id` change → refused. Only `session_replication_role = replica` (superuser, round 1 m6) gets past it.
* **Date order (round 1 m7):** close before ack, and ack after the response, are refused by the database and the service.
* **Outbox:** strict ids-only payloads (no name, contact or summary); a double close → 409, one `complaint.closed`. A forced audit failure, or a forced commit failure (a scratch deferred trigger) → rolled back, with no outbox row and no job change.
* **Reminder:** a forced audit failure → nothing committed, and the retry sends. Two workers on two clients, 5 times → always one sent and one skipped, 1 mail, 1 `REMINDER_SENT`.
* **Stress:** 40 rounds of 4 random service calls on two clients. No deadlock, no 500; the row, its events and the outbox always agree.
* **Round 1 closed:** M1; m1 (a) and (b); m2 except R2-m3; m3; m4 for its list; m5 except R2-m4 to m6; m7; m9; m10; m12. Not re-tested: m8 and m11.
* **The migration on the demo-data copy:**
  * Every table's row md5 was unchanged except `platform_role_permission`, which went from 774 to 779.
  * Reset to the six ran green again, keeping a closed complaint, its outbox rows and its audit lines.
  * `migrate diff` on both databases shows only the 5 lines already there before PF-21, nothing for `plat_`.
