# PF-12 break report (database walls between firms)

Commit `5f22defa42ad90b8d5bc56e3dd29e6eb8cdca0af`, branch `claude/sweet-mccarthy-cnj9qn`. Isolated copy `brk12` on :4651 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`, then `firm-seed.ts` and `booking-seed.ts` as the owner). It has been stopped and its database dropped. Firm A = `sample-firm`, firm B = `sample-solo`. SQL ran as `psql postgresql://xr_app@127.0.0.1:54329/xr_studio_brk12`, with `select set_config('app.firm_id','<A>',false)` where a firm is named. US$0, localhost only, no code edited.
Note: during the run, something other than this breaker rewrote the working-tree `migration.sql` (unstaged, 02:54 UTC; the per-table lines became a `DO $walls$` loop). Everything below was tested on the committed file, applied at 02:47.

## Breaks

**1. Major: two PF-19a triggers are blind under the walls, so firm A can link its rows to firm B's templates.** `msg_template_version_in_firm` and `msg_outbox_template_in_firm` (migration `20261115004500_pf19a_platform_messages`:411, :423) look up the referenced row and raise only `IF FOUND AND …`. Under RLS, firm B's row is not found, so the check passes. The single-column FK still passes too, because RI checks ignore RLS.
Steps (as owner: `msg_firm` rows for A and B; template `TB` (firm B), version `VB` (firm B)). Then, as xr_app with firm A:
`insert into msg_template_version(id,firm_id,template_id,version,body,published_by) values (gen_random_uuid(),'<A>','<TB>',99,'A body','staff:x')` → **inserted**.
`insert into msg_outbox(id,firm_id,channel,address,template_version_id,rendered_hash,class,updated_at) values (gen_random_uuid(),'<A>','EMAIL','x@example.com','<VB>','<64 hex>','TRANSACTIONAL',now())` → **inserted**.
Control: the same two inserts as `xr_staff_bypass` are refused ("is not its template's firm", "is not the platform's or firm …'s").
Result: firm A's rows point at firm B's template and version. Because the keys are RESTRICT, firm B can no longer delete its own version. Expected (brief, FO-13 break 4/11 block): "every trigger and RESTRICT key on main holds against the app". These two only hold for a role that sees every firm. They need to be SECURITY DEFINER (narrow, owned by the bypass role) or compare against a composite key.

**2. Major: PF-25's "held for another firm's redirect" trigger is blind under the walls.** `platform_web_address_held_by_other` (migration `20261114230000_pf25_web_address`:106) is SECURITY INVOKER and reads `platform_firm_address_history`, which is now walled. Called from `platform_firm_web_address_rules` as firm B, it cannot see firm A's history.
Steps: as owner, move firm A from `sample-firm` to `sample-firm-two` (history row, `until` = +90 days). Control: as owner, give firm B `sample-firm` → refused "the address sample-firm is held for another firm's redirect". As xr_app with firm B, in one transaction: insert history (B, `sample-solo` → `sample-firm`), then `update platform_firm_web_address set address='sample-firm' where firm_id='<B>'` → **committed**. Firm B now owns firm A's held address.
The API path still holds: `WebAddresses` takes the lock, then checks through the definer `platform_web_address_taken`. But the database guard that the brief says must hold against the app no longer does. Same root cause as break 1.

**3. Minor: the doors answer 500 on HEAD and on a trailing slash.** `asBypass` tests each use's regex against the raw `req.path` (`firm-scope.ts`:142, :151; lists at :95–:100). Express routing is not strict and serves GET routes for HEAD, so the handler runs and then `BypassRefused` throws.
Results: `curl -I /api/public/forms/<token>` → 500. `GET /api/public/forms/<token>/` → 500. `POST /api/platform/session/local/` → 500. `GET /api/public/invitations/<x>/` → 500. `GET /api/public/firms/sample-firm/book/<slug>/slots/` → 500.
Before PF-12 these reached the handler and answered 200/404. Expected: "no route's answer changes for a correct caller" (link checkers and uptime probes send HEAD). The log line kept the route pattern only; no token was logged (checked).

**4. Minor: `module_event` and `webhook_receipt` carry `firm_id` but have no walls.** As xr_app with **no** firm: `select count(*) from module_event` → 4 (all rows). The payloads hold staff, invitation, complaint and booking ids for every firm. `GET /api/platform/events` relies on the code filter alone. Neither table is in the brief's prefix list, so this is not a missed table. The point is that the guard is prefix-only: a later firm table under any other name (as these two show) passes the guard unwalled.

**5. Minor: the missing-policy guard accepts any policy.** `tests/check_pf12_walls.ts`:52 checks only `exists (select 1 from pg_policy …)` plus FORCE. Two things pass it: a later table shipped with `create policy p on fo_x using (true)`, and an extra permissive `using (true)` policy added to `fo_lead` (policies OR together). Expected: "fails when a table has no policy". Today a wrong or extra policy is just as silent as a missing one. Comparing `polqual`/`polwithcheck` to `firm_id = platform_session_firm()`, and refusing any second permissive policy outside the named template case, would close it.

**6. Minor: the bypass is one statement away for any xr_app session, and xr_app can alter a bypass-owned function.** The grant is `GRANT xr_staff_bypass TO xr_app … SET TRUE` (migration :49). `set role xr_staff_bypass; select count(distinct firm_id) from platform_staff` → 2, and no audit line, because the audit lives only in TS. Since the bypass role owns `platform_web_address_taken` (migration :64), xr_app can also run `set role xr_staff_bypass; alter function platform_web_address_taken(text[],timestamptz) security invoker;` → ALTER FUNCTION, and `grant execute … to public` → GRANT. `alter … set search_path = pg_temp, public` is also accepted. (All undone on the copy.)
The start-up check (`appRoleProblems`) does not look at roles xr_app can SET to, or at what they own. Accepted by the brief's design ("named list in code"), but one SQL-injection or raw-SQL bug means every firm. Have the owner own the function, and keep the bypass role owning nothing.

**7. Minor: xr_app may `setval` shared sequences.** The migration grants `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES` (:53), so `select setval('module_event_seq_seq', …)` works. Rewinding `module_event_seq_seq` or `fo_stage_move_seq_seq` makes every firm's next event or stage move fail on the unique `seq` (a cross-firm denial of service from raw SQL). USAGE alone is enough for `nextval`.

**8. Minor: "direct" bypass uses also run inside the API server.** `asBypass` allows a `direct: true` use whenever there is no scope (`firm-scope.ts`:142) and never consults `unscopedMode()`. So a timer callback or a recurring job outside the list that calls a door service in the server process runs on the bypass. Separately, the API's own log starts with `platform_bypass use=direct-process`: queries made before `FirmWallsInterceptor.onModuleInit` calls `wallUnscopedQueries()` ran on the bypass under no named use (the default is `"direct"`, :120).

**9. Minor (oracles): count and existence leaks across firms.**
- `pg_stat_user_tables.n_live_tup` gives every firm's total row count per table.
- `platform_web_address_taken(array['sample-solo'], now())` returns firm B's uuid.
- Global unique keys answer "exists" for other firms' values: `platform_staff.actor_id` (insert `user-S` as firm A → `platform_staff_actor_id_key`), `identity_subject`, `platform_firm.contact_email`.
None of these reaches rows, but "even by id through SQL" is not airtight for existence.

## What held
- **Reads with no firm, `''` or garbage.** No firm reads 0 everywhere walled. `''` → none. `'garbage'` or `'  '` → uuid error, never a match.
- **Firm A's session against firm B's rows (SQL).** By id → 0 rows. UPDATE/DELETE … RETURNING → 0. INSERT naming B, INSERT with null firm, and moving a row to B are refused by WITH CHECK. `COPY … TO` is filtered. TRUNCATE → permission denied. `set row_security=off` is refused.
- **Platform templates.** Firm A reads, but cannot change or delete, platform-owned (null-firm) templates. `platform_signup_pending` reads 0.
- **xr_app's own limits.** Cannot `set role xr_studio`/`xr_data`, set `session_replication_role` (even after SET ROLE bypass), create a table, function or schema, or change `log_error_verbosity` (terse confirmed).
- **Logins.** `xr_case_lookup`, `xr_staff_bypass` and `xr_data` cannot log in. `xr_case_lookup` owns nothing and has no grants.
- **No side doors.** No views or matviews. The only definer function is the one above (pinned search_path). All other FKs between walled tables carry `firm_id`. `pg_stats` hides walled tables.
- **Start-up check.** Restart with `APP_DATABASE_URL` = owner → refused: "xr_studio is a superuser; has BYPASSRLS; owns … 177 table(s)".
- **API, firm B against firm A by id: all 404 / "of your firm".** Leads: read, take, close, assign. Assigning A's lead to B's staff. Staff: read, roles, sign-out-everywhere. Complaints: read, acknowledge, and B's staff as A's handler. B's lead and complaint lists are empty.
- **Concurrency.** 300 mixed A/B requests (`/me`, `/staff`, `/staff/:id`) and 200 mixed lead list/by-id requests at once, over keep-alive connections: zero firm mix-ups (Prisma batching off outside transactions).
- **Logs.** Bypass log lines carry the use and method only: no path, token or email. 500s logged the route pattern only.
- **Jobs.** Jobs carry the firm (non-recurring jobs without one are refused). Sweeps run on named uses.

## Round 2 (against 9db6c475eca5df63bf96c65c0e81cf51ad114ade)
Not completed. I read the round 2 migration (`xr_wall_reader`, definer trigger functions, the three-argument `platform_web_address_taken` returning addresses only, sequences USAGE and SELECT only), but stopped before any re-test. No copy was started for round 2, and no round 1 break is confirmed fixed or still open from this round. The fixes still need a breaker pass.
