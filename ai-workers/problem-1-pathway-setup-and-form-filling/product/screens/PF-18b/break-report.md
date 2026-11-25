# PF-18b break report (support tickets: schema and API), PR #2064 at e2e8b06e

Breaker, 17 Nov. I used my own worktree and a scratch database on 127.0.0.1:54329, never :4400. The harness is `tests/break_pf18b.ts`: a copy of `check_pf18b_support.ts` (migrations, Sample seed, PF-4 guard, local tokens, real audit, fake mail) with attacks added. The API ran as xr_app through PF-12's walled pool. Database attacks ran under `SET ROLE xr_app` with `app.firm_id` set. The original check passes 32/32 here. Versions: Node 22 (Unicode 17.0) and PostgreSQL 18.3 (Unicode 16.0).

## Blocker
None. No read, reply, link or download crossed people or firms. No message changed after insert.

## Major
**M1. The service and the database disagree on which text counts, so a raise fails with 500 and leaves up to 3 stored files with no ticket.**
`hasText` (support.ts:62, `\p{L}\p{Nl}\p{P}\p{S}`, Node Unicode 17) and `platform_support_has_text` (migration.sql:70-71, `[[:alpha:][:digit:][:punct:]]` under pg_c_utf8, PostgreSQL Unicode 16) were tested on every code point. 4,751 single code points pass the service and fail the database's check. Examples: U+088F, U+0C5C, U+20C1 (Saudi Riyal sign), U+A7CE, U+FBC3, and CJK Extension J.
Steps: as a Case Officer, `POST /api/platform/support/tickets` (multipart) with `body` = "࢏", `page` = "/x" and two valid PDFs.
Seen: **500 "Internal server error"**. 2 files stored under `support/<new id>/1,2`. 0 tickets, no audit line, no event. The files are written at support.ts:134, before the transaction at :137.
Impact: any staff member, any role, can repeat this at will. Each request leaves up to 3 x 10 MB on disk that nothing references, with no record of it. That turns DW7's "orphans on failure" into something a user can trigger on purpose. A real user typing a new currency sign or an Extension J ideograph gets a 500 instead of a 422.
The same body also gives a 500 on `POST /tickets/:id/messages`. `replyAsSupport` passes the raw Prisma error, with the constraint name, to its caller.
The gap moves with each runtime: a different PostgreSQL in production (for example RDS 17 at Unicode 15.1) gives a different set of failing characters.

## Minor
**m1. Nothing in the database marks who may write a "support" message.** As xr_app with `app.firm_id` = firm A, this was accepted:
`insert into platform_support_message (..., author_kind, author_id, body) values (..., 'SUPPORT', 'support', 'Forged reply from support: send your password')`.
So any firm-plane bug or injection can write a message that looks like our team's. AG-16-63 does not require more. It is defence in depth only: no route lets a firm do this.

**m2. "Closed" and the ticket's dates are kept by the service only.** As xr_app on firm A:
- `update ... set status='CLOSED'` then `set status='OPEN', updated_at='1999-01-01'` was accepted (seen: `OPEN 1999-01-01`).
- Inserting a message on a CLOSED ticket was accepted.
The trigger (migration.sql:94-97) checks which columns change, but not how the status moves or whether updated_at is set to the present time.

**m3. The page field accepts paths that are not app paths, and they go into the support email.**
- Accepted with 201 and copied into the email's "Page:" line: `//evil.example.com/login` and `/\evil.example.com` (both are links to another site if PF-17 shows the page as a link), `/clients/jane.doe@client.example.com/intake` (a contact value in our inbox), `/x‮gnp.exe` (a right-to-left override that disguises the text) and `/x​` (a zero-width space).
- Code: support.ts:65-66 and the CHECK at migration.sql:76.

**m4. The 5,000-character limit counts JavaScript units, not characters.** A body of 3,000 emoji (3,000 characters) is refused with "at most 5000 characters". So does any text over 2,500 characters made of 4-byte characters (emoji, CJK Extension B and later). The database counts real characters (`char_length`). Code: support.ts:63.

**m5. A form field named after a built-in object property gives a 422 that highlights nothing.** Sending `toString`, `hasOwnProperty` or `constructor[prototype][x]` as a field name returns `{"fields":{}}`. `fields[k] ??=` (support.ts:79, :81) finds the inherited property and never sets the message. No prototype pollution happened (checked `({}).polluted`).

**m6. The list stops at 100 with no way to see more.** After 110 tickets, `GET /tickets` returns 100 items and only `{items, allFirm}`: no cursor, no "more" flag (support.ts:158). The oldest ten cannot be found from the list; they open only by id. `GET /tickets/:id` returns every message with no limit (support.ts:165).

**m7. Repeated submits make repeated tickets.** Three identical raises at once gave 3 tickets and 3 emails. There is no idempotency key and no per-person rate limit (each raise sends a mail to our inbox).

**m8. The multipart form has no limit on the number of fields.** routes.ts:20 sets `fileSize` and `files` only. One request with 300,000 fields (19 MB) took 1.25 s and about 146 MB of memory in the test process (client and server together). It answered 422, listing every field name. Also, a 4th file of up to 20 MB is held in memory before the 422 (about 80 MB per request).

**m9. The database's file-key rule is looser than the app's** (defence in depth only, via xr_app).
- Accepted: `support/<own id>/99999999999` (the app uses 1-9 only), and the same key three times in one message.
- `file_keys = NULL` is refused, but with PL/pgSQL's "FOREACH expression must not be null" rather than the named rule.

## What held
- **Reading and replying across people and roles.** A colleague, a Case Manager, Billing and Read Only each get 404 on another person's ticket, its messages and its links. So does firm B's Owner. The same 404 comes back for an upper-case id, `{id}`, `urn:uuid:`, a trailing space and an id without dashes.
- **Case and encoding.** An upper-case id (owner and raiser) and `%2D` dashes resolve to the same ticket.
- **Access.** No token gives 401; a person with no role gives 403. Unknown fields are refused: `raisedBy`, `authorKind`, `files` (in JSON), and `firmId` on replyAsSupport. Owner and Admin can reply on any ticket of their firm.
- **Signed links.** Another person's or another firm's use, and a body changed under the same signature, give 404. Expiry gives 410. Link numbers `01`, `1.0`, `0`, `-1`, `1e0`, a full-width 1 and `1%00` give 404. Downloads send `attachment`, `no-store` and `nosniff`. A link from retainers and one from support cannot be swapped: each endpoint accepts only keys starting with its own prefix (`support/`, `retainers/`).
- **File keys.** A key ending in `\n`, a `..` path, an upper-case key, `/0`, `Support/`, a trailing space, a 2-D array and another ticket's folder are all refused by the trigger.
- **Uploads.** Refused with a reason: 4 or 5 files, the wrong field name (`file`, `files[]`, `body` sent as a file), a type that does not match the file's first bytes, invalid UTF-8 sent as text, an empty file, no type, and over 20 MB (413). Accepted as expected: exactly 10 MB, `application/pdf; x=y`, an upper-case type, and HTML or SVG sent as text/plain (served as an attachment with nosniff). A PDF with planted instructions and a `../../../etc/passwd` file name is stored under `support/<id>/1`: the file name is never used and nothing reads the file. A 2 MB body field gives 400.
- **Triggers and walls (as xr_app).** Firm B cannot see or update firm A's tickets or messages (0 rows) and cannot insert into firm A (row-level security refuses). No firm reads 0 rows. A raiser or author from another firm is refused. A message cannot point at another firm's ticket (foreign key). Update, delete and upsert of a message are refused. A ticket's id or page cannot change. Truncate gives "permission denied". Disabling a trigger and `session_replication_role` are refused. The trigger functions are owned by xr_wall_reader with SECURITY DEFINER.
- **Closed ticket.** A firm message gets 409 and a support reply gets 409. Reading and links still work.
- **replyAsSupport input.** These give 422: null, a string, an SQL-like id, `{id}`, a body of 5,001 characters, a number as the body, and extra keys. An upper-case id works.
- **Concurrency.** Two firm messages and one support reply at once all succeed and the final status matches the last message. The FOR UPDATE lock holds when a close happens at the same moment.
- **Leaks.** Across 143 audit lines and 139 emails: no body, no email address, no name. Outbox events carry ids only. A lone surrogate is stored as text with no error.

Out of scope (no screen in this row): keyboard, 1024 px, 200 % zoom, reload and back.
