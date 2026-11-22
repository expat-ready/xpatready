# PF-8b F5 break report (PR #2968, head 3c0198ac3f452a46e9cc85ae2200f7219df577c7)

Scope: this change only touches migrations (role grants in `20261116013000_pf12_firm_walls` plus the checksum migration `20261122030000_pf8b_f5_grant_loop`). There is no UI or endpoint, so the screen attacks (duplicates, roles, uploads, text, budgets, reload, keyboard, 1024 px, 200 %) do not apply.

How I tested: throwaway PostgreSQL 18 clusters on ports 15470-15484, created with initdb run as postgres and removed at the end. Every run used `prisma migrate deploy` from studio/ at head. For main, I extracted main's `prisma/` into the scratchpad with a symlinked node_modules. The RDS shape is an admin that is NOSUPERUSER with CREATEROLE, CREATEDB and BYPASSRLS, is a member of rds_superuser, and runs on a server with log_error_verbosity=terse. I wrote "RDS 18.3 accepted the grant" into pg_auth_members as the cluster superuser, the same way the PR's test does. I changed no files except this report.

## Findings

Blocker: none.
Major: none.

**Minor 1: the drop path silently removes other roles' memberships in the reader, and any settings on it** (pf12 migration.sql:35-44).
- What I did: set up a reader that loops into xr_admin, then added `GRANT xr_wall_reader TO xr_app` and `ALTER ROLE xr_wall_reader SET work_mem`, and in another run `GRANT pg_read_all_data TO xr_wall_reader`.
- Expected: the comment says the reader is dropped only "when it holds nothing anywhere on the cluster".
- Actual: DROP ROLE succeeds. Memberships other roles hold in the reader, the reader's own memberships and its role settings all disappear, and nothing reports them.
- Effect: the result is safer, not weaker. xr_app cannot reach the reader afterwards (`false,false`), and the reader is recreated clean. But the same bad xr_app membership on a reader that does not loop stops PF-12 with "xr_app's role memberships are not as required". So the same bad state is cleaned silently on one path and stops the run on the other. This only matters for an operator reading the log: a membership someone granted on purpose to a person's role for diagnosis would vanish without a trace.

**Minor 2: when the drop is refused, the stop message does not say what holds the reader** (pf12 migration.sql:40-42).
- What I did: gave the reader a function in another database, default privileges, or a membership grant where it is the grantor.
- Actual: the message ends "…cannot be made afresh (role "xr_wall_reader" cannot be dropped because some objects depend on it)". SQLERRM leaves out PostgreSQL's DETAIL, for example "privileges for membership of role z in role y".
- Effect: the HINT (REVOKE as a superuser) can still be followed. The operator just cannot see what is holding the reader.

**Note (raw error, same as main, not caused by this PR):** I built the chain reader -> xr_data -> xr_admin. The migration stops with a raw 0LP01 at `GRANT xr_data TO xr_app`, not with a PF-12 message. The cause is the ADMIN-only row PostgreSQL 16+ gives the role that creates another role, which counts for loop checks. Main stops with the identical error at the same statement. Everything is rolled back and no wall is weakened.

**Note (residual risk, the PR states it too):** vanilla PostgreSQL 18 cannot reproduce RDS 18.3 accepting `GRANT xr_admin TO xr_wall_reader`. On vanilla, the ADMIN-only row from creating the reader would make that same grant a 0LP01 loop. So RDS evidently differs here in some way. The head path never issues that grant for a non-superuser, so the change stands. The real proof is still the AWS re-run of `migrate deploy`.

## What held

| # | Attack | Result |
|---|---|---|
| 1 | PR's own `tests/check_pf8b_f5_pg18_grants.ts 15470` and `check_pf8b_f4_migrations.ts` | 12/12 and 9/9 |
| 2 | Superuser `postgres`: migrate deploy on main and on head into fresh databases, then dump memberships (with grantor and options), role attributes, table/sequence ACLs, function owner/SECURITY DEFINER/ACL, default ACLs, schema ACL, policies, RLS flags, role settings | 971 lines each, `diff` empty. The superuser path is unchanged |
| 3 | Superuser database migrated on main, then deployed at head | pf12 checksum goes from 33d69f… to a120d4… (= sha256 of the file; a fresh head run stores the same value). `migrate status` reports "up to date". End state equals a fresh head run |
| 4 | Non-superuser database migrated on main (vanilla), then deployed at head | Exit 0, checksum a120d4…, status clean, end state equals a fresh non-superuser head run |
| 5 | Two databases, same non-superuser admin, run one after the other (second: reader already owns 122 functions in the first) | Both exit 0, the two dumps are identical, status clean |
| 6 | Three databases migrated at once by the non-superuser admin from empty, on head and on main | All exit 0 on both |
| 7 | Reader left over with a loop into xr_admin, three databases migrated at once, run twice | All exit 0. No loop afterwards. Reader keeps every table right (0 missing) and owns 122 functions |
| 8 | Shape B (reader in xr_admin, granted by xr_admin): end state after the drop path vs a fresh non-superuser run | Identical (BYPASSRLS, NOLOGIN, table/sequence rights, default privileges, function owners) |
| 9 | Drop path when the reader owns a function in another database / holds default privileges there / is grantor of a membership (PostgreSQL 16+ 2BP01) | PF-12 stops with its message. The function stays owned by the reader and the loop row is untouched (one statement, rolled back) |
| 10 | Drop path when the reader was created by the superuser (admin has no ADMIN OPTION) | PF-12 stops: "…cannot be made afresh (permission denied to drop role)" |
| 11 | Indirect loop reader -> x -> xr_admin (x unrelated) | Reader dropped and recreated, exit 0. x's own membership in xr_admin is left alone. The reader's pg_read_all_data membership and work_mem setting are gone |
| 12 | xr_app reaching the reader / BYPASSRLS leak after the drop path | xr_app has no SET and no USAGE on the reader, can SET ROLE only to xr_staff_bypass, and does not inherit it. Only xr_staff_bypass and xr_wall_reader are BYPASSRLS |
| 13 | RDS recovery: main fails at pf12 on shape B (P3018/0LP01), then head | `deploy` gives P3009 until `migrate resolve --rolled-back` is run. After that, exit 0. The old rolled-back row keeps checksum 33d69f…, the new row a120d4…, status clean |
| 14 | One cluster: superuser database first, then a non-superuser admin's database (head and main) | Both stop the same way ("permission denied to grant role"), as before. Head does not change this |

Port use: my clusters were on 15470-15484 only, and all are stopped and deleted. The shared demo database on :54329 was not touched.

Verdict: Approve
