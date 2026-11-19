# Break report: PF-15 part 1a (plan limits: seats and storage), PR #2130, head d8dc7be

Breaker, 18 Nov. Scope: the brief's part 1a (`design/lead-b-briefs/PF-15.md`: the port, seats, storage, the 14-day rule, the daily job, `checkDowngrade`'s return, `usedBytes`). The booked lower plan (part 1b) and the case metrics (part 2) are out of scope. The PR has no screen, so keyboard, 1024 px and 200 % zoom do not apply.
How: scratch databases on 127.0.0.1:54329 (every migration plus the Sample firms). The app ran as `xr_app` through `Db` (the walled pool, `wallUnscopedQueries()` as in the server). Seats went through the real routes in a Nest app, as in `tests/check_pf15_limits.ts`. The harness was in the gitignored `studio/var/` and has been removed, and so have the databases. Nothing in the repository was changed except this file.

## Breaks

**M1 (Major): if any Owner email fails, the storage-over mark never sticks, so the firm never goes hard, and the team inbox gets a new email every day.**
`StorageWatch.measure` sends the emails inside the same transaction that sets the mark (`api/src/platform/entitlements/storage.ts:61`, `alert` at `:73-82`). `MailPort.send` "throws when refused or not sent" (`ports/mail.ts`), so a throw rolls back `first_over_at` with everything else. The next attempt starts a new episode with `firstOverAt = now`. The idempotency key is `storage-over:<firstOverAt>:team`, so it changes on every attempt and the dedupe does not catch it.
Reproduction: Team plan, `STORAGE_MB` set to 0, `fakeMail({ failOn: m => m.templateKey === "platform.storage_over_limit" })`. Upload 10 bytes through `EntitledFiles` in firm A's scope, run `daily()` under `asJob`, move the clock 20 days, run `daily()` again, then upload again.
- Actual: the upload's measure and both daily runs fail (`{measured:1, failed:1}` each time). The mark stays at its earlier back-under state. The upload on day 21 is allowed (it should be refused 409). The team inbox got 2 emails on 2 different days (one per daily run while the failure lasts).
- Expected: the mark is kept and the 14 days start on day 1 even when a send fails. The emails go out after the commit or are retried once, as identity's `emailInvitation` does.
- Real trigger: an Owner whose address the sender refuses, or an outage of the email service. The longer the failure lasts, the longer the 14-day rule is held off. A failure that never ends holds it off forever.

**m1 (Minor): `usedBytes` throws ENOENT while another process puts or deletes in the same firm.**
`api/src/front-office/files.ts:98` calls `lstatSync(p)` on every name before the `.tmp` / `.meta` filter. A `.tmp` that another writer creates and then unlinks between `readdirSync` and `lstatSync` therefore throws.
Reproduction: two child processes run `LocalFiles.put` and `delete` in one firm's folder while the parent loops `usedBytes`. Result: 462 of 506 calls threw `ENOENT … lstat`. Inside one process it held (1 184 calls, 0 errors), because the walk is synchronous.
Effect with more than one API process, or a tool writing the same folder: `EntitledFiles.put` answers 500 on a new key (`storage.ts:106-108`), and the daily job counts that firm as failed.

**m2 (Minor): storage fails open when the firm's row cannot be read.**
`limitOf` returns `firmId: null` when `platform_firm` is invisible: no firm scope, another firm's scope, a key in the wrong case, or a uuid-shaped key read as an id (`limits.ts:30`). `check` then allows storage outright (`limits.ts:59`, `!firmId`). The header at `limits.ts:6` says "Fail closed".
Reproduction: firm A hard on day 15. `store.put(A, …)` in A's scope gives 409. The same call with no scope, or in firm B's scope, gives "ok", and the bytes are written into A's folder.
No route reaches `put` without its firm scope today, so this is latent. The seat metric fails closed on the same input (`limitOf` with no scope gives limit 0).

**m3 (Minor): a firm key shaped like a uuid is read as a firm id.**
`platform_firm_key_check` (`^[a-z][a-z0-9-]{1,62}$`) accepts `abcdef01-2345-6789-abcd-ef0123456789`, and `limits.ts:30` then treats that key as an id. The case side passes firm keys (`ports/entitlement.ts`). Such a firm would read 0 for case limits, or, if its key equalled another firm's id, would point at that other firm's row (which the walls hide).
Sign-up keys cannot take this shape (`slug-` plus 8 hex, `firms/signup.ts:192`), so only a seed or a console could create one. This was read in the code, not run.

**m4 (Minor): a retired (tombstoned) key gets the plan-limit refusal while the firm is hard, and the key refusal otherwise.**
`exists` is false for a tombstone, so the hard check runs first (`storage.ts:106`). Reproduction: delete `t1/a.bin`, then put it again. While hard: `409 PLAN_LIMIT_REACHED` ("remove documents or change the plan"). Not hard: `FileKeyTaken` ("already holds other content").
A retry of a retired key is refused either way. While hard, the answer names the wrong cause and offers a way out that cannot work.

**m5 (Minor): the date in the email is the UTC date, not the firm's day.**
`hardOn` is `toISOString().slice(0,10)` (`storage.ts:73`), and the text reads "Uploads keep working until <date>". Example: first over at 20:30 Vancouver time on 20 Nov (04:30Z on 21 Nov). The email says "until 2026-12-05", but uploads are refused from 20:30 Vancouver time on 4 Dec. The date is one day late in the firm's own zone, and "until" does not say that the refusals start on that day.

**m6 (Minor): our own outbox writes count as the firm's documents, and they skip the storage check.**
`platform-messages.ts:22` gives MessagePort a plain `LocalFiles` with the same root. Every rendered email (`msg/<firm>/outbox/<id>.json`, `messages.ts:38`) and every attachment (`mail.ts:22`) lands in the firm's folder with a `.meta`, so `usedBytes` counts it. A firm can be pushed over by bytes it cannot remove, and the email still tells it to "remove documents you no longer need". This was read in the code, not run.

**m7 (Minor; rule question for Lead B, not a defect): a hard firm also cannot draft a retainer or record one as signed.**
`renderVersion` (`retainers/service.ts:344`, called at `:378`, `:474`) and the signed-offline copy (`:573`, `:581`) write new keys through `EntitledFiles`. So on day 15, drafting or recording a retainer fails with "new uploads are refused". SA-3-40 speaks of new uploads and "nothing … locked". The brief does say "refuse a new key", so whether this matches the rule needs a ruling.

**m8 (Minor): the hard check ignores the size of the upload.**
`check(…, mbOf(used))` uses the usage before the upload (`storage.ts:107`). A hard firm 1 byte under its limit can store a file of any size. What happens next depends on when the daily job last ran: if the mark was still open, the firm is hard again at once; if the job had cleared it, a new 14-day episode starts. The contract says this on purpose ("allowed only at or under"), so this is noted, not counted as a defect.

**m9 (Minor): `usedBytes` is a synchronous walk, run twice per upload.**
20 000 files took 403 ms on the event loop for each call. `EntitledFiles.put` calls it once for the check and once more in the measure, so roughly 0.8 s of blocking per upload at that size, for every firm on the server. The daily job walks every firm the same way. STANDARDS §9 leaves scale work to the team, so this is Minor.

**m10 (Minor; not run): the rollback text assumes the migration role is a superuser.**
`DROP FUNCTION platform_storage_over_kept()` comes after the function's owner was moved to `xr_wall_reader` (`migration.sql:74`). The migration role is not a member of `xr_wall_reader` (only the reverse is granted, in pf12). On a role that is not a superuser (a managed database), the drop is therefore refused unless the owner is moved back first, which is how PF-12's own "Down" note does it. As superuser `xr_studio` the text ran cleanly and the migration re-applied (9 rows). The `_prisma_migrations` step was not run (the scratch database had no such table).

## What held

- **Last seat in parallel.** 5 rounds, each with 2 seats free and four requests at once (a single invite, a batch of 2, a reactivation, another single invite): exactly 2 seats were taken every time, and the firm was never over the limit. A resend on a full plan frees its own seat (200). A firm already over its limit: a batch of 1 gives "4 of 2 seats … Remove 2 people", and a single invite gives 409 with the right words.
- **Parallel measures.** Six `measure` calls on one firm at once gave one `set/alerted` and five `kept`: 2 emails in total (the team inbox plus the one Owner), one mark. The advisory lock serialises them.
- **14 days and rounding.** One minute before 14 days, uploads are allowed; at exactly 14 days they are refused (the PR's own check). `mbOf` uses ceil, and `bytes > limit·MiB` agrees with `ceil(bytes/MiB) > limit`.
- **Email keys across firms.** Both firms went over at the same fake instant and the team key `storage-over:<iso>:team` was identical for both. Two emails were still sent, because `LocalMail` and `fakeMail` scope keys by firm. Owner keys carry the staff id.
- **Subscriptions.** An ENDED subscription plus a live one: the live plan is read (`platform_subscription_one_live` allows only one). No live subscription: seats are refused, and storage gets limit 0 and the warn path. The email then says "your plan (none)", which is awkward but true.
- **PF-12 walls.** Firm B's scope reads nothing of A's (`limitOf` gives null and 0). Under `xr_app`, an update to another firm's mark changes 0 rows. The daily job lists firms through the bypass and measures each firm in its own `withFirm`. `tests/check_pf12_walls.ts` on this head: 100 passed, 0 failed. `check_pf3_platform_schema.ts`: 75 passed, 0 failed. `check_pf15_limits.ts`: 69 passed, 0 failed.
- **Migration.** `xr_app` gets permission denied for INSERT, UPDATE, DELETE and TRUNCATE on `platform_plan_limit`. On `platform_storage_over`, delete (as the app, as the bypass and as the owner), truncate (as the owner) and moving a mark to another firm are all refused by the trigger. Negative `limit_value`, `limit_mb` and `used_bytes` are refused by CHECK constraints. Migration diff is clean.
- **Retries.** A retry of a stored key while hard goes through, and an old file still reads (the PR's DW2). A retry with other bytes still gets `FileKeyTaken`.

## Part 2 break (4c4e0f3d3)
Breaker, 18 Nov. Scope: `git diff origin/claude/runtime-pf15-limits..4c4e0f3d3` (schema, triggers, `platform_entitlement_limit`, `PlanLimitChanges.change`, `checkDowngrade`); no screen. How: three scratch databases on :54329 (every migration plus `seedSampleFirms`), psql as `xr_app` with `app.firm_id` set and no bypass, and a tsx harness in `studio/var/` driving the services. The databases and the harness have been removed; only this file was changed.

**B1 (Blocker): any firm session can change any plan's limit, backdate it, and leave no audit line.** `xr_data` keeps INSERT on `platform_limit_change` (migration.sql:105-107); the CHECK tests only the shape (`:51-54`), and the triggers trust `approved_at` and `approved_by`. In firm B's session, `INSERT … (metric 'ACTIVE_INDIVIDUAL_CASES', new_value NULL, approved_by 'staff:nobody', approved_at now())` on `solo` gave 25 → Unlimited at once. The same insert on `team` with `new_value 0` and `approved_at now() - interval '10 years'` stored firm A's `effective_at` as its `created_at` (already past), so firm A read 0 at once. Neither insert wrote an audit line or sent a notice. Expected: only the staff crossing can insert (the trigger refuses when `platform_session_firm()` is set or the role is not the bypass role), and `approved_at` is the database clock.

**M1 (Major): seats still change with no record.** In firm B's session as `xr_app`, `UPDATE platform_plan SET seats_limit = 1 WHERE code='team'` gives `UPDATE 1`: no change row, no 30 days, no audit line. This goes against "Its insert is the ONLY way a limit changes" (migration.sql:4-6). Part 1a revoked writes on `platform_plan_limit` only.

**M2 (Major): a subscription date of `-infinity` hangs every lowering of the plan and blocks sign-ups to it.** Firm A's own session runs `UPDATE platform_subscription SET current_period_end='-infinity'` (`UPDATE 1`). A lowering on `team` then loops forever in `WHILE at < target` (migration.sql:96-98); only `statement_timeout` stopped it. While it ran, the plan's `FOR UPDATE` lock (`:72`) blocked any firm's `INSERT INTO platform_subscription` on `team` (timed out after 3 s). With `'infinity'`, `effective_at` is infinity, so that firm keeps its old value for ever. An `approved_at` of `'infinity'` failed with "timestamp out of range" after 1.5 s. Expected: non-finite anchors and approval times are refused, and the loop is capped.

**M3 (Major): one failed email loses every notice after it** (limit-changes.ts:73-78, an unguarded loop). Setup: two firms on `team` (2 Owners), `fakeMail({ failOn })` on the first Owner, then corporate cases lowered to 2. The change commits, but `change()` throws a raw Error (a 500 to the caller), and 0 of the 2 Owners are emailed. A retry gets 409 `LIMIT_UNCHANGED`, so the notice never goes out. Expected: each send is guarded and retried or put in an outbox, and the call returns the committed change.

**m1 (Minor): a firm loses its kept value before its date.** The clock is read before the plan lock (limit-changes.ts:50), and the oldest pending lowering is picked by `approved_at` (migration.sql:136). A clock returning .050Z and then .010Z, with two `change()` calls in parallel (150→10, then 10→5), made firm A read **10** on 1 Dec instead of 150 (the SQL repro is the same). Equal `approved_at` and `created_at` in one transaction leave the order undefined.

**m2 (Minor): the effective date depends on the session's TimeZone** (the functions pin only `search_path`). For anchor 2026-01-31 03:00Z and approval 2027-01-15, UTC gives 2027-02-28 03:00Z and Vancouver gives 2027-03-01 03:00Z. The tests pin UTC; `api/src/core.ts` does not, and this server's default is America/Toronto.

**m3 (Minor): a firm that leaves and comes back keeps the old value.** Firm A, with 150→10 pending, moved to `firm`, then took a new `team` subscription on 2 Dec, and read 150 on 3 Dec. A firm joining fresh reads 10. The `kept` step (migration.sql:133-136) matches firm and plan, not the subscription.

**m4 (Minor): the staff page shows the new seat limit at once.** A seats lowering writes `platform_plan.seats_limit` at approval, and `staff-read/service.ts:29-34` reads that column directly. The page shows "N of 1 seats used" while `limitOf` still allows 5 until the renewal.

**m5 (Minor): `checkDowngrade` says nothing is over when the firm id does not match the session.** Called in `withFirm(B)` for firm A against `solo` on the walled pool, it returns `conflicts: []`, although firm A has 3 staff against 1 seat. `seatsUsed` reads 0 through RLS, and the case count follows the client, not `firmId` (limits.ts:86-88).

**m6 (Minor, migration-only): Unlimited when a limit row is missing.** With `team`'s `STORAGE_MB` row deleted (as superuser), a firm with a pending lowering reads Unlimited with `has_row` true (migration.sql:141,143). Without the pending lowering it reads 0.

**m7 (Minor):** every firm session can SELECT all of `platform_limit_change`: every plan's history, the reasons and `approved_by` staff ids. A "catalogue" by design, but the free-text reason leaks. **m8 (Minor):** the rollback text (migration.sql:14-15) leaves out `platform_limit_change_firms()`.

**What held:**
- **Reading another firm.** The definer returns no row for another firm by upper-case id, key, `%` or NULL. A crafted metric (`SEATS' OR 1=1 --`) or a NULL metric reads nothing extra. A `pg_temp.platform_session_firm()` shadow and a temp `platform_plan` table had no effect. The caveat is PF-12's own model: clearing `app.firm_id` reads firm B.
- **Writes.** INSERT into firm rows, and UPDATE, DELETE or TRUNCATE on either table, are refused for `xr_app`. Forged `old_value` and `lowered` are overwritten. Seats NULL or 0 and a lowercase metric are refused.
- **Value sequences.** 150→10, →100, →5 reads 150, then 100, then 5 on the right dates. U→3 stays Unlimited until the renewal.
- **Renewal dates.** 31 Jan and 31 Mar anchors give 28 Feb. A late joiner gets the new value, and a move to another plan drops the pending one.
- **Concurrency.** Two `change()` calls at once serialise with no lost update.
- **`checkDowngrade`.** An inactive, unknown or empty target is refused. Storage rounds up (5120 MiB + 1 B gives 5121, reduce 1).
- **Existing checks.** `check_pf15_cases.ts` 32/0, `check_pf12_walls.ts` 100/0.

## Part 2 re-break (ec04e138b)
Breaker, 18 Nov. Same method: a fresh scratch database (removed afterwards) and a psql/tsx harness in `studio/var/` (removed). `check_pf15_cases.ts` 51/0, `check_pf12_walls.ts` 100/0, `check_pf15_limits.ts` 67/0.

**B1 fixed.** In firm B's session (`xr_app`), INSERT and SELECT on `platform_limit_change` both give "permission denied". Under `SET ROLE xr_staff_bypass`, `approved_at` and `created_at` given as `now() - 10 years` are overwritten with the database time, and firm A's date stays more than 29 days ahead. Caveat (PF-12's model, not this row): `xr_app` may still `SET ROLE xr_staff_bypass`.
**M1 fixed for UPDATE.** `UPDATE platform_plan SET seats_limit` as `xr_app`, and under `SET ROLE xr_staff_bypass`, gives "seats_limit changes only through platform_limit_change". A change row still writes it.
**M2 partly fixed.** `-infinity` and `infinity` anchors fall back to `created_at` (3.8 ms, no loop), and an anchor of 4713 BC takes 0.7 ms. The new month jump matches the plain loop in 64 128 anchor/target pairs, with no date before the target. Still open: firm A's own session sets `current_period_end='9999-12-31'` (finite), and the lowering stores `effective_at` 9999-12-31, so A keeps 25600 MB for ever. The root cause is N1. A cap such as "at most target + 1 month" would close it here.
**M3 fixed.** With the first Owner's send failing, `change()` returns `notices {sent:1, failed:[<owner id>]}` and the other Owner is emailed. `sendNotices(changeId)` then sends the missing one, and a second call sends nothing new (2 emails in total). A mail port that always throws gives `failed` with both ids, and the change is kept. Residual: the failed ids live only in the return value (no outbox, no job), so PF-17's route has to show them. Also, `sent` counts de-duplicated re-sends.
**m1 fixed.** Two parallel `change()` calls stamp 18:16:30.253Z and then .340Z, in lock order. Firm A reads 150 on day 1. "Kept" is now the highest value before any pending lowering: 10→5, then raise to 200, then →20 reads 200 until the second date and 20 after it.
**m2 fixed.** Anchor 2025-01-31 03:00Z gives 2026-12-31 03:00Z in both UTC and America/Vancouver sessions.
**m3 fixed for a new subscription row.** A firm that leaves and re-subscribes reads 10. Two residuals:
- A firm session can move `plan_id` on its live row away and back: it still reads 150 (N1 again).
- A TRIAL row replaced by a new ACTIVE row after the approval loses its kept value (reads 10). No conversion code on main does this today; the trial-conversion work must update the row in place.
**m4 not changed.** After seats go 5→2, `limitOf` gives 5 until the renewal, while `platform_plan.seats_limit` (read by `staff-read/service.ts:29-34`) is 2. In my view it need not block this PR, because no route can lower a limit before PF-4s/PF-17. It must be fixed (the page reading `limitOf`) before the change route ships, otherwise Owners see "N of 2 seats" and think they are over. Put it as a line on that row.
**m5 fixed.** `checkDowngrade` for firm A inside `withFirm(B)` gives 404 "No such firm". Firm A's own scope, an upper-case id in either place, and the bypass all still answer (seats 3 > 1).
**m6 fixed.** Pending lowering plus no limit row gives `limit U, has_row false`, which `limitOf` reads as 0.
**m7 fixed** (SELECT is denied to `xr_app`). **m8 fixed:** the rollback text names all four functions and the seats trigger.

**New:**
- **N1 (Major; outside this diff: grants from PF-3/PF-12, for the Lead).** Firm B's session can `INSERT INTO platform_plan (… 'mine', seats_limit 10000)` and `UPDATE platform_subscription SET plan_id = <mine>` on its own row. `platform_entitlement_limit` then gives 10000 seats. The same writable row lets a firm set its own renewal date (M2's residual) and move plans (m3's residual). The new seats trigger covers only UPDATE.
- No other new break was found.
