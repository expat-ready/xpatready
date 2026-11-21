# PF-18n part 1: break report (the notification store, the me routes, the deadline binding)

**Head attacked:** `ea830d41d` (branch `claude/loving-fermat-eyd2nq`, draft PR #2596). **Breaker:** a fresh Opus 5.5, 21 Nov (P-303: the row changes the schema).
**Scope:** brief `design/lead-b-briefs/PF-18n1.md` (at `093ded45e`). Part 2 (the 90-day job, the bell screens, the other callers) is out of scope.
**How:** scratch databases built with every migration plus `seedSampleFirms`, and a Nest app with LocalIdentity tokens behind the real guard and walls (throwaway script `/tmp/claude-0/pf18n-break/attack.mts`). psql connected **as `xr_app` itself** (not a superuser doing SET ROLE). A full isolated copy ran on :4477 (`tools/isolated.sh brk18n 4477`, `PLATFORM_IDENTITY=local`). Every database and copy I made is dropped or stopped. US$0, no repo code edited.
**Result:** no Blocker. 1 Major, 5 minor. The walls, the grants, the trigger and the routes held.

## Breaks

### M1 (Major): the "in the caller's transaction" claim covers only the insert. The preference and person check runs on a second pooled connection, so parallel callers deadlock the pool.
* **Where:** `api/src/platform/notifications/store.ts:27` calls `this.prefs.allows(...)`. That is `PrismaNotificationPrefs(db)`, built on the shared `Db` (`features/platform-settings-personal.ts:20`), not on `tx`. So every `notify` holds its transaction's connection and also needs a second one from the same pool (pg default `max` 10).
* **Repro (attack.mts C1):** 12 concurrent `withFirm(FA, () => db.$transaction(tx => port.notify(tx, …)))` calls. All 12 fail with **P2028 (transaction timeout) after 5.09 s**, and **0 rows** are written. With 6 concurrent calls (C2), all succeed in 38 ms with 1 row.
* **Effect today:** latent. The reminder jobs run one at a time (`pgboss-jobs.ts:268`, `batchSize: 1`). But this is the shared port's real adapter: when part 2's request-path callers (FO-10 and others) arrive, 10 concurrent requests that notify will stall the API. Each one fails and rolls back the caller's own business write.
* **The same root cause, seen as wrong answers:**
  * (P10) A person switches In-app off for MY_DEADLINES earlier in the same transaction, then is notified in it: **a row is written** (stale preference).
  * (P9) A person is added in the caller's transaction and then notified in it: `notify` returns ok and **no row** is written, a silent miss.
* **Fix:** read the preference and the person through the caller's `tx`. For example, build `new PrismaNotificationPrefs(tx)` inside `notify`, or give `allows` an optional client. Add a check that runs more than `max` concurrent notifies.

### m1 (minor): the table's text checks allow words, and group is not tied to kind
* **Repro (psql as xr_app, firm A; S8):** these inserts are **accepted**:
  * kind `client-jane-doe-overstayed-visa`;
  * item kind `invoice-from-client-jane` with group `PAYMENTS` on kind `case-stage-deadline`;
  * a row for a DEACTIVATED person.
* **Why it matters:** migration lines 35–38 only check for kebab-case and length ≤ 64. A name or a fact fits in kebab-case, which goes against the comment "ids only… never words" (AG-7-39 r10). The adapter's zod check is the only real guard.
* **Fix:** a catalogue table `msg_notification_kind(kind, group)` synced at start from `NOTIFICATION_KIND`/`NOTIFICATION_GROUP` (the `syncSettingDefinitions` pattern), with a foreign key on `(kind, "group")`. This keeps "a new kind is a line, no migration". Do the same for item kinds.

### m2 (minor): `created_at` can move backwards, or anywhere
* **Repro:**
  * (P8) Notify at 26 Nov, then notify again with the clock at 22 Nov: `created_at` becomes 22 Nov. The contract says "a time never older".
  * (S6) As xr_app, `update … set created_at = '2099-01-01', read_at = null` and `created_at = '1970-01-01'` both succeed. The column grant (migration line 50) allows any value, and the trigger checks only the identity columns.
* **Fix:** in the upsert, `created_at = greatest(msg_notification.created_at, excluded.created_at)` (`store.ts:31`). In `msg_notification_write()`, refuse `NEW.created_at < OLD.created_at`.

### m3 (minor): a read from a stale list consumes a later reminder
* **Repro (A7):**
  1. The officer's list shows the row with `createdAt` T.
  2. The 2-day reminder re-notifies the same row at T+46 ms.
  3. The officer clicks the row from the list drawn before the re-notify: `POST /:id/read` returns 200 and sets `read_at` after the new `created_at`.
* **Effect:** the re-surfaced reminder is gone without ever being shown. `read-all` does the same to anything that arrived after the list was drawn. This works against "duplicate beats a miss" (AG16-60).
* **Fix:** the client sends the `createdAt` it showed (`POST /:id/read?seen=…`, `read-all?before=…`), and the update adds `and created_at <= seen`.

### m4 (minor): the link for item kind `case` is built without a firm check
* **Repro (A1):** a firm-A row for item `{kind:"case", id:<firm B case>}` comes back with `link: "/cases/<firm B case id>"`, at `store.ts:43`. Case stages and milestones are looked up with `firmId`, so firm B's stage gives `null`. The adapter also stores another firm's item id without any check.
* **Effect:** no data leaks (the id came from the caller, and the case page is walled). But one item kind is treated differently from the others.
* **Fix:** look up `runtimeCase` with `firmId`, as for stages, or return `null` for `case`.

### m5 (minor): out-of-range paging values are accepted silently, and not consistently
* **Repro (A2):**
  * `page=999999` returns an empty page.
  * `page=9999999` (7 digits) silently returns **page 1**.
  * `size=0` returns 1 item; `size=100000` returns 100.
  * `page=0`, `-1`, `abc`, `1.5` all return page 1.
  * Nothing gives a 400.
* **Where:** `routes.ts:11` limits the regex to 1–6 digits. Values that fail fall back to the default instead of being clamped.
* **Fix:** clamp every numeric value (or answer 400 to a value that is not a number). Never fall back to page 1 for a large page.

## Held (attempt, then outcome)
* **No firm in scope (as xr_app):**
  * Reads return 0 rows; an insert gives 42501 from `platform_firm_first` (S1).
  * `app.firm_id = ''` returns 0 rows; a junk value raises a uuid error (S11).
  * `notify` with no firm is refused in words (P6).
* **Firm A against firm B's rows:**
  * Firm A reads firm B's row by id or by firm: 0 rows (X1).
  * Firm A marks it read, or re-notifies its key through ON CONFLICT: 0 rows touched (X2).
  * Firm A writes a firm B row: 42501 (S3).
  * A firm A row naming a firm B person: 23503 (S4).
* **Changing a row's identity:** updating firm, kind, item, staff, group or id as xr_app gives `permission denied` (column grant, S5). As `xr_staff_bypass`, an update of kind, or of firm, is also denied (S7).
* **read_at before created_at:** an update setting `read_at` earlier than `created_at` gives 23514, and so does moving `created_at` past `read_at` (S6). In 40 rounds of markRead, notify and markAllRead racing, no check failed (C3). `markRead`/`markAllRead` use `greatest(now, created_at)`.
* **Removal and tampering:**
  * DELETE and TRUNCATE are refused as xr_app, and also after `SET ROLE xr_staff_bypass` (S7).
  * xr_app cannot replace the trigger function, disable the trigger or drop the policy (S10).
* **Bad input to `notify`:**
  * An unknown, upper-case or free-text kind, an unknown item kind, a malformed id and an extra field are each refused before any write, with 0 rows (P1, P2).
  * An upper-case item id or staff id dedupes to one row (P3).
* **People who must not get a row:** a deactivated person, firm B's person under firm A, firm A's person under firm B, and a random uuid all give no row and no error (P4, P5). A transaction opened under B with notify under A gives 42501 and the caller rolls back (P7).
* **Concurrent notifies for one key:** 6 concurrent calls give 1 row (C2; the 12-call case is M1).
* **Rollback:** the suite's DW3 re-run passes. A rollback leaves no row.
* **Ids at the API:**
  * An upper-case id is marked read (200).
  * `{id}`, an id with a trailing space, `123`, and `' or 1=1--` all give 404.
  * DELETE or PUT on an id, and GET on `…/:id/read`, give 404.
* **Sessions at the API:**
  * Another person's id gives 404; a firm B session on firm A's id gives 404; firm B's own list is empty with count 0 (A3, A4).
  * No session, a garbage token, a deactivated person's token, a client actor's token and an unknown uuid's token all give 401.
* **Link builder:** firm B's case-stage id in a firm A row gives `link: null`. An unknown milestone gives `null` (A1).
* **Unscoped queries:** every `MyNotifications` query names firm and person (`firmScope`, raw `where firm_id … and staff_id …`). Under the walls they also run as xr_app with the request's firm.
* **Volume:** 300 rows for one person, `size=100&page=2`, answered in 20 ms (A8).
* **Schema and suites:**
  * `prisma migrate diff` from the migrated database to `prisma/schema` reports no difference.
  * Suites pass on the head: check_pf18n_notifications 26/26, check_pf12_walls 100/100, check_pf19a_messages_schema 94/94, check_pf3_platform_schema 75/75, check_pf18a_notifications 72/72, check_pf18bk_keys 25/25.
* **Full app (isolated copy on :4477):**
  * It boots with the binding, and its log has no `case_deadlines_waiting` line.
  * The routes answer 200 for the signed-in person's own rows, 404 for another person or another firm, and 401 without a session.

**Not a finding:** a primary-key insert with another firm's row id gives 23505 (X3). Every table with uuid primary keys behaves this way, and the ids are random.
