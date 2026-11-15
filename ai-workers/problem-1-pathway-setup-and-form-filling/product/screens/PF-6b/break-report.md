# PF-6b break report (#1808, commit 4e2fddb)

Breaker run, 15 Nov. Scope: the four claims of the row (catalogue table and migration; licence guard and money-bundle
start-up check; money-keys audit line on PATCH roles; own/all on retainers). API only, no screen, so the screen
attacks (keyboard, 1024 px, 200 % zoom, uploads, 100 programs) do not apply. Nothing in product code was edited.

How: the row's suite (`tests/check_pf6b_permission_rules.ts`, 22 passed, 0 failed); an isolated copy
(`isolated.sh pf6bbrk 4434 … PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`, FO-1a seed, prospects added by SQL as the
suite does) driven over HTTP as user-R, user-T, user-O, user-S; a small Nest app on the same database with test-only
LICENCE routes (as the suite builds); scratch database `xr_studio_pf6bbrk_mig` for the migration. All stopped and dropped.
No licence number was printed: licences were moved aside inside the database, and leak checks counted matches only.

## Findings

**Minor 1. The licence rule fails open when the catalogue's class data is wrong or empty.**
The guard takes its LICENCE set only from the database (`guard.ts:64-68`, `rows.filter(r => r.class === "LICENCE")`).
The database checks scope but not class (`migration.sql:21-23`), and nothing at start-up compares the rows with
`classOf` / `LICENCE_KEYS` (`catalogueMismatches` runs only in the test).
Repro (test app, Case Manager user-T with the key, licence record moved aside):
`update platform_permission_key set class='GENERAL' where key='agent/case:form-approve'` is accepted, then a new start
answers **200** on a route declaring `agent/case:form-approve`. With `delete from platform_permission_key` the app still
**starts**, and the same route answers **200**. Expected: 403 NOT_LICENSED, or a refused start-up (the missing-table case
is refused). Today no live route declares a LICENCE key and this needs a database write, so Minor. Ways to fix: union
the code's `LICENCE_KEYS`, or run `catalogueMismatches` + `uncatalogued` in `onModuleInit`.

**Minor 2. The money-keys line names roles that bring no money key.**
`service.ts:239` writes `roles: added` and the summary "money permissions given with ${added.join(", ")}" for every
added role. Repro: as user-R, `PATCH /api/platform/staff/<user-O>/roles {"roles":["CASE_OFFICER","READ_ONLY","BILLING_FINANCE"]}`
gives summary `money permissions given with READ_ONLY, BILLING_FINANCE: 12 keys` and `detail.roles: ["READ_ONLY","BILLING_FINANCE"]`.
Read-only carries no money key. Expected: only the roles that carry the named keys (the key list itself is correct).

**Minor 3. Only GET is marked @OwnOrAll, so the sweep (DW6/DW7) cannot catch a regression on the other routes.**
PATCH `retainers/:id`, POST `send`, `withdraw`, `signed-offline`, `download-link`, GET `files/:token` and POST
`prospects/:id/retainers` all apply the same rule today (verified live, below), and most return the full record
(`this.read`). But they are not marked (`routes.ts:51-86`), so a later change that skips `visible()` on one of them
passes the suite. `keys.ts:31` says a route that returns an area's records marks the area.

**Minor 4. A migration that fails partway leaves its types and table behind, so a plain re-deploy cannot recover.**
Repro (scratch DB, `prisma migrate deploy` with every earlier migration, then
`insert into platform_role_permission values ('OWNER','system/platform:admin')`, then deploy again): P3018 with
`platform_permission_key_shape`; afterwards `platform_permission_key` and both enums **exist**. After fixing the key and
re-running: `type "PlatformPermissionScope" already exists`. The stated rollback line (`migration.sql:11`) recovers it.
No known database has such a key (both seeding migrations insert only `agent/*` keys; the copy had 0 that break the
shape), so Minor.

## What held
- **Own/all, every retainer route (live :4434).** With Case Officer's `agent/prospect:view.all` removed and the setting on,
  user-O (neither owner nor representative) got 404 NOT_FOUND on GET, PATCH, send, download-link and draft on R's
  prospect. A download link issued while O held view.all answered 404 after the key went. With Case Manager's view.all
  removed, representative user-T could still read and get a download link (200; BR-3) but got 404 on withdraw,
  signed-offline, edit and draft. Withdraw and signed-offline are already blocked for O by MISSING_PERMISSION.
- **Setting off.** O (holds view.all) got 404 on GET and download-link. The owner R got 200.
- **Ended grants.** O given READ_ONLY (holds view.all): 200. READ_ONLY removed (grant row ended, kept): 404.
- **Another firm.** A grant or licence record with another firm's `firm_id` is refused by the composite foreign keys
  (`platform_role_grant_firm_id_staff_id_fkey`, `platform_staff_credential_firm_id_staff_id_fkey`). Firm B's Owner
  user-S got 404 on firm A's retainer, in lower and upper case. No token: 401.
- **Letter case and paths.** `/API/FRONT-OFFICE/RETAINERS/:id`, an upper-case id, a trailing slash and a query string all
  behaved like the canonical path. Unlicensed T got 403 NOT_LICENSED on `/API/FRONT-OFFICE/…`, on the trailing slash, on
  `?x=1`, on HEAD, on a route with two keys and on a class-level `@PermissionKeys`. A doubled slash is 404 (no route).
- **Licence.** Licensed: 200. Licence record removed: 403 NOT_LICENSED with "Only a licensed consultant can do this".
  Without the key: MISSING_PERMISSION comes first.
- **Start-up.** With the catalogue table missing (database not ready), start-up is refused. On failure the cached promise
  is reset (`guard.ts:68`). The DW3 money-bundle check stops start-up in the suite.
- **Role arrays (claim c).** Lower case → 400 ROLE_UNKNOWN; duplicates → 400 ROLE_TWICE; a padded name → 400; none wrote a
  line. Removing and then re-adding BILLING_FINANCE wrote a second line. Swapping to roles already held wrote none. Five
  parallel identical PATCHes: one 200 changed, four 200 unchanged, one money line, one live grant. A cross-firm target
  got 404; an upper-case UUID target gave a line with the lower-case `entity_key`. O and T (no `staff:manage`) got 403.
  Every key named in a money line is MONEY class.
- **Scope CHECK.** `agent/x:view.allx` must be NONE (ALL is refused); `agent/x:a.view.all` with ALL is refused. Upper
  case, `_`, trailing space, `%` and `system/` keys are refused by the shape check. SQL and `scopeOf`/`classOf` agree on
  every key the shape allows.
- **No licence number leaked.** 0 matches in `api.log`, `audit_event` (detail and summary) and `module_event`. The retainer
  read still drops `representative.licence_number`.
- **Re-running** an applied migration is not possible through `prisma migrate deploy`, and main has no newer migration
  that conflicts.

## Not PF-6b (noted, not counted)
- `PATCH …/roles {"roles":["CASE_OFFICER",{"toString":1}]}` → 500. This comes from the earlier `rolesOf`
  (`service.ts:56`, `bad.map(String)`), not from this diff.
- Two databases named `xr_studio_pf6b_try` and `xr_studio_pf6b_6601` exist on :54329. They are not this run's; I left them.

Breaker: clean
