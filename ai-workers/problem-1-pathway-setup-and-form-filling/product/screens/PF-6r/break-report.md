# PF-6r break report (PR #1951, commit 77e419b, branch claude/runtime-roles-read)

Breaker run, 16 Nov. Scope: the row's one route, `GET /api/platform/roles` (`staff-read/routes.ts:13-14`) and its one
method `StaffReads.roles()` (`staff-read/service.ts:62-77`), checked against Lead B's brief PF-6r. API only, no screen:
the screen attacks (keyboard, 1024 px, 200 % zoom, uploads, 100 programs) do not apply. No product code was edited.

How: the row's suite (`tests/check_pf6r_roles_read.ts`, 13 passed, 0 failed), PF-6b's (24 passed, 0 failed) and PF-4b's
(`check_pf4b_session_reads.ts`, 53 passed, 0 failed), all unchanged. A scratch script outside the repo
(`/tmp/claude-0/.../scratchpad/break_pf6r.mts`) built on the suite's harness: a scratch database on 127.0.0.1:54329 with
every migration and the Sample firms, a Nest test app (PF-4/PF-4b controllers, both guards), local sign-in. The database
was dropped at the end. No licence number was printed: the leak check counted matches only.

## Findings

**Minor 1. A catalogue row edited by hand changes the answer's class at once, with nothing catching it until a restart.**
`roles()` copies `k.class` from `platform_permission_key` as it is (`service.ts:66-74`). The guard checks the catalogue
against `classOf` only once, at start-up (`guard.ts:64-72`), and always adds the code's `LICENCE_KEYS` to the licence
set (`guard.ts:72`; the PF-6b break m1 fix). The roles read does neither.
Repro on the running app: `update platform_permission_key set class='GENERAL' where key in ('agent/invoice:create','agent/case:form-approve')`
and `set class='MONEY' where key='agent/staff:manage'`, then `GET /api/platform/roles` as user-R. Answer is **200**, with
invoice:create shown as `GENERAL`, form-approve as `GENERAL` and staff:manage as `MONEY`. Billing and finance moneyKeys
go from 12 to 11 and Owner licenceKeys from 3 to 2. `classOf` still says MONEY, LICENCE and GENERAL, and the guard still
enforces the licence check on form-approve. Expected: the role picker's "money and licence apart" (R1.6) agrees with
the rule the guard enforces, so either `classOf`/`LICENCE_KEYS` is applied or the mismatch is a 500, as with an
uncatalogued key. This needs a database write, and the next start-up refuses the edited catalogue, so it is Minor.
`moneyKeysOfRoles` reads the same rows, so the DW1 test cannot see this.

**Minor 2. Key order inside a role depends on the database's collation.**
`order by rp.permission_key` (`service.ts:70`) uses the database's default collation. The scratch cluster is `C`, so the
answer matched JS code-point order. With the same rows under `collate "en_US.utf8"` (glibc, a common default for
initdb and RDS) the order differs: `agent/billing:export` comes before `agent/billing-report:view`. The ICU collations
matched the answer. The brief fixes the role order only, not the key order, and order is stable within one database
(40 parallel calls gave one identical body). Still, Compare roles can list keys in a different order on different
machines, and the suite compares sorted lists, so it would not notice. `collate "C"` (or sorting in JS) fixes the order.

**Minor 3. One bad role-permission row takes the whole read down, including a row the guard itself ignores.**
The read keeps rows by `~ '^agent/'` (`service.ts:70`). The guard keeps keys by the stricter `FIRM_KEY`
(`identity/service.ts:112`). Repro: `insert into platform_role_permission values ('READ_ONLY','agent/Bad:Key')`.
That key can never get a catalogue row (the `platform_permission_key_shape` check refuses it), and the guard drops it.
Even so, `GET /api/platform/roles` answers **500** for every caller until the row is removed. `GET /api/platform/staff`
still answers 200. The same 500 for an uncatalogued well-formed key is the brief's intended design and is tested; the
mismatch between the two filters is the finding. Failing closed leaks nothing, so this is Minor.

**Minor 4. A seventh role value is left out of the answer without any error.**
`STARTER_ROLES` is a hand-written list (`service.ts:15`) with no exhaustiveness tie to the Prisma enum `PlatformRole`
(`prisma/schema/platform.prisma:45`). Repro: `alter type "PlatformRole" add value 'AUDITOR'` plus two rows for it,
including `agent/invoice:create`. The answer is 200 and lists the six roles only. AUDITOR's keys, including a money key,
never appear and nothing is logged. The brief asks for the six starter roles, and adding a role needs a schema change
(a staff member holding only AUDITOR got 500 from the guard's Prisma read, which is outside this row), so this is low.

## Held (severity none)

| Attempt | Result |
|---|---|
| Route shadowing: every controller under `api/src` swept (83 classes, 79 files) with path-to-regexp against `/api/platform/roles` and `/roles/` | Only `StaffReadController.roles` matches. No `:id`/`:token` route takes it. `GET /api/platform/staff/roles` goes to `staff/:id` and returns 404 "No such staff member" (401 with no token) |
| Path variants: `/roles/`, `/ROLES`, `?role=OWNER&firm=x`, `?__proto__=1`, `/./roles`, `/x/../roles`, `#x` | No token gives 401. Owner gets 200 with a body identical to the reference. Query strings are ignored |
| `//roles`, `/roles/OWNER`, `/roles.json`, `/roles%2F` | 404, with or without a token |
| `/API/PLATFORM/Roles` | No token 401, owner 403 (the core ConfigReadGuard "Not for a link session"). Fails closed, and that guard is outside this row |
| HEAD | Express maps it to the GET handler and it stays guarded: no token 401, Case Officer 403, Owner 200 with an empty body |
| POST, PUT, PATCH, DELETE, OPTIONS | 404 for no token, Owner and Case Officer alike. No handler and no data |
| Each role alone (user-O's grants swapped live) | OWNER 200, ADMIN 200. CASE_MANAGER, CASE_OFFICER, BILLING_FINANCE and READ_ONLY each 403 |
| Several roles at once | CO+BF+CM+RO 403 MISSING_PERMISSION. RO+ADMIN 200. BF+OWNER 200. No grants 403. An ended OWNER grant 403 |
| Session state | Suspended 401 STAFF_NOT_ACTIVE. Deactivated 401. Revoked session 401 SESSION_REVOKED. No second step 401 TWO_STEP_REQUIRED. Token signed with another key 401. Unknown staff id with a valid signature 401. Expired token (clock +2 h) 401. `bearer` in lower case with extra spaces 200. `Bearer <t> extra` 401. `x-actor` header only 401 |
| Firm B (user-S, OWNER of sample-solo) | 200, with a body byte-identical to firm A's. The table has no firm column, so the answer is the same for every firm |
| Leaks | None of the 23 firm ids, firm keys, staff ids, emails, display names, actor ids or licence numbers appears in the body. The body's shape is exactly `{roles:[{role,keys:[{key,class,scope}],moneyKeys,licenceKeys}]}`, with no labels |
| Keys outside agent/* (`system/firm:manage` on OWNER, `agentx/foo:bar`) | Not shown, 200 |
| Uncatalogued well-formed key | 500, and the body is only `Internal server error` (it does not name the key) |
| A role with no rows (all READ_ONLY rows deleted) | 200. READ_ONLY still appears, sixth, with `keys: []` and both counts 0 |
| Order and concurrency | Roles always come in the order OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER, BILLING_FINANCE, READ_ONLY. 40 parallel calls all returned 200 with one distinct body |
| Load | 779 rows: p50 6.5 ms, p95 9.0 ms, 51.5 KB. With 400 more keys on every role (3,179 rows): p50 16 ms, max 23 ms, 219 KB, counts correct |
| Declaration | `assertEveryRouteDeclared` accepts the route. The PF-6b and PF-4b suites pass unchanged |

Observation, not a finding: `agent/role:assign` (PATCH roles) and `agent/staff:manage` (this read) are held by the same
roles today (OWNER, ADMIN), so everyone who can change roles can read them.
