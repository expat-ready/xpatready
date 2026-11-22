# PF-21b part 2 — break report (legal-hold register, PgLegalHolds, /api/system/register/holds)

Commit 78861110ae7926c0d6cea7289112503c9012eae6, branch claude/runtime-pf21b-holds. Only the row's own change (`git diff HEAD~1 HEAD`) was attacked.
How: the row's suite run first, unchanged: 47 passed, 0 failed. Then my own scratch database `brk_pf21b` on 127.0.0.1:54329 (every migration
applied in order; dropped at the end), psql as xr_studio, xr_app and xr_app→xr_staff_bypass, and a scratch tsx script outside the repo that
reuses the suite's set-up (WalledPool as xr_app, the real PgLegalHolds, LegalHolds, KeepPeriods, and a Nest app on a random port with PF-4s's
guards). I did not use :4400 or the demo database. I changed no product code and committed nothing.

## Findings

**M1 — Major: a list capped at 500 rows hides active holds, and releasing an older hold commits but answers 404.**
`plat_legal_hold_list` keeps only the newest 500 rows of every hold, active or released (migration.sql:188). The `state` filter runs in
JS after that cap (service.ts:86), and nothing in the answer says rows were cut. The test firm had 1 active FIRM hold (the oldest) and
520 released ones. `list({firm, state:"active"})` returned **0 holds** while the database held 1 active. With no `firm` filter (the
default view) the same thing happens across all firms once the platform has 500 holds. Released holds are never deleted, so this
point always comes. Then `release(oldest)` committed (released_at set, audit line written) but answered **404 "No such legal hold"**,
because `one()` looks the hold up again among the same 500 rows (service.ts:76, :141). A retry then gives 409. The Platform Owner is
told "not held" on a held firm, and told "failed" for a release that went through.

**M2 — Major: DATE_RANGE input is read as instants, so a hold can say "held" and protect nothing.**
The route takes `HoldScope` with `z.coerce.date()` (service.ts:36, ports/legal-hold.ts:53):
- `{from:"2026-01-01", to:"2026-01-31"}` gives 201. The firm's audit line says "placed a legal hold on records dated 2026-01-01 to
  2026-01-31" (service.ts:43). But `to` is stored as 2026-01-31T00:00Z. A record dated 31 Jan 15:00Z: `isHeld` → `{held:false}`,
  and `KeepPeriods.check` → **OK**, so the delete goes ahead. This is a false "not held" for the last day the person named.
- `{from:null, to:null}` gives 201 with a hold on the single instant 1970-01-01T00:00Z. `{from:0, to:true}` gives 201 for 1970,
  0–1 ms. Empty date boxes sent as null "place" a hold that holds nothing, and the Platform Owner sees a success.
- `{from:"-271821-04-20T00:00:00Z"}` gives 500 "Internal server error" (PostgreSQL range). See m6.

**m1 — Minor: the database wall is "no firm in the session", not "our staff"; the definer release writes no audit line.**
- As xr_app with no `app.firm_id`: `plat_legal_hold_place` (any firm, any `placed_by`), `_list(null)` and `_release` all succeed. In a
  firm-A transaction, `set_config('app.firm_id','',true)` and then `plat_legal_hold_release(id,'staff:attacker',…)` → `RELEASED`.
  `audit_event` lines for that hold: **0**. The audit line exists only in LegalHolds.releaseAs/placeAs.
- As xr_app → `SET ROLE xr_staff_bypass`: a direct INSERT of a hold succeeds without the advisory lock (the insert trigger does not
  take it) and writes no line. A direct UPDATE release succeeds the same way.
- So the claim "no firm's request can place, release or read a hold, whatever its code does" (migration.sql:12–13), and the same claim
  in the suite's assertion name (check_pf21b_holds.ts:129), is stronger than what the database enforces. Every firmless xr_app path
  (public doors, case and configuration requests) passes the system-only check. This is the same model as PF-4s's tables, so I mark
  it Minor: fix the wording, and let the definers (or the triggers) take the lock and write the line themselves.

**m2 — Minor: a placement waiting behind a deleter open longer than 5 s fails with a bare 500.**
placeAs and releaseAs use Prisma's default interactive timeout (5 s; service.ts:93, :116). Test: a deleter held its shared lock for
7 s. The placement waited, then failed with "expired transaction", and no hold was saved. Through the route: **500 with an empty
detail**, while PF-4s's guard line says ALLOWED. There is no false success, but a long purge (ALL_FIRM_DATA) blocks every placement
with a 500 for as long as it runs.

**m3 — Minor: duplicate holds.** Three identical parallel placements (FIRM, same reason) → three active holds. Nothing stops a double
click or a retry after a client timeout. Releasing one leaves the others active, which is the safe direction, but the console shows
copies.

**m4 — Minor: the reason accepts bidi and C1 characters.** Reason `Reason` (service.ts:35) refuses C0 controls only.
`"Sample court order ‮gnirut‬ \u0085 nel"` → 201 and is stored as typed. The firm's deleter is shown it as the hold's
reason. PF-4s's guard strips Cc/Cf for its own line, and AUD-5's reasonOf refuses C1, but this service keeps both.

**m5 — Minor: the port and the table disagree on actor words.** `AuditActor` (ports/audit.ts:13) allows `/` and up to 200
characters. The table's check (migration.sql:63, :67) allows `[A-Za-z0-9_.:-]{1,120}`. `placeAs("system:jobs/purge", …)` and a
150-character `staff:` id both fail with a raw 23514 constraint error, not a refusal in words. Not reachable from the routes, whose
actor is `staff:<uuid>`.

**m6 — Minor: an out-of-range date gives a 500.** Covered under M2: a year PostgreSQL cannot store gives 500, not 422.

**m7 — Minor: `placedBy` is `staff:<our staff id>`.** The service header (service.ts:9–11) says a `staff:` word "would be typed as
the firm's own staff", and so uses `system:` on the audit line. Yet the table's `placed_by` and `HoldMatch.placedBy`, which a firm's
"Why can't I delete this?" shows as the owner, still carry `staff:<system staff uuid>`.

## What held
- Wrong role: a firm token (user-R), Support, Admin, Auditor, Billing, Content publisher, and one person with all five non-Owner roles → 403 on place, list and release; mixed-case path and trailing slash → 403; `/api/%73ystem/…` → 404; no token → 401.
- A firm session (xr_app, `app.firm_id` set): `plat_legal_hold_active(other firm)`, place, release and list refused; direct SELECT 0 rows; INSERT, DELETE, TRUNCATE "permission denied"; UPDATE 0 rows. xr_app with no firm, or a cross-firm ask, through `isHeld`/`KeepPeriods.check` → refused (42501), never `{held:false}`.
- REPEATABLE READ, SERIALIZABLE, `SET TRANSACTION … REPEATABLE READ` inside the transaction, and the root client → LegalHoldTxRefused.
- Locking: a placement during an open deleter waits and the next deleter answers HELD; a deleter starting during an open placement waits 1.5 s, then HELD; a second deleter behind a queued placement queues too (pg_locks: Exclusive f, Share f), then HELD; release in progress + deleter + new hold on the same person → HELD before and after.
- Two parallel releases → 200 + 409. A release followed by a new hold holds again.
- DELETE and TRUNCATE refused for the bypass role and the owner; changing `placed_at` refused; `DISABLE TRIGGER` by the bypass role refused (not the owner).
- Unknown firm → 404 FIRM_NOT_FOUND. A firm with no hold, or only released holds, + ALL_FIRM_DATA → `{held:false}` (correct).
- Bodies: extra fields (`placedBy`, `placedAt`), an extra scope field, a release body naming `by`, a category outside LEGAL_HOLD_CATEGORY (incl. `case_documents'; drop table …`), `?firm=' or 1=1 --`, `firm[]=`, `state=ACTIVE` → 422; a SQL-looking reason is stored as text (parameterised); release id `x' or '1'='1` → 404.
- Text: zero-width-only and 501-character reasons → 400 (guard); French, Chinese, Arabic and emoji kept exactly; upper-case firm and case ids stored lower case and still match.
- Not applicable (no screen in this row): keyboard, 1024 px, 200 % zoom, uploads.

Verdict: Changes 78861110ae7926c0d6cea7289112503c9012eae6

## Round 2 — `git diff 78861110…5fda2566` (diff only)
New scratch databases `brk_pf21b` and `brk_pf21b_g` (all migrations, dropped after); the same scratch script plus new probes. Round-2 suite: 67 passed, 0 failed.

| Round-1 item | Retry | Result |
|---|---|---|
| M1 list cap / 404 after release | 1 active + 520 released holds | **Fixed.** `state=active` → 1 hold; all → 500 with `truncated`; releasing the oldest → 200 with the hold. `limit` 0, 501, `abc`, `1.5`, empty, twice → 422; `limit=1` → 1, truncated. xr_app `p_limit` -5 → 1 row, 2147483647 → capped at 501; firm session → refused. |
| M2 date ranges | `2026-01-01..2026-01-31`, record 31 Jan 15:00Z | **Fixed.** `to` = 23:59:59.999Z; `isHeld` held, `KeepPeriods.check` HELD. null, `0`/`true`, year 1, a time with no zone, an end before the start, 2026-02-30, 2026-02-29, a leading space, lower-case `t…z`, week and ordinal dates, `+0530` → 422. 2028-02-29 → 201. `+14:00`/`-12:00` ends → converted correctly. |
| m2 5 s timeout | deleter holds its lock 7 s | **Fixed.** placeAs waits about 7.2 s, then places; through the route → 201 and the hold is saved. |
| m4 bidi / C1 | `‮`, `\u0085`, `‎`, `⁦…⁩` | **Fixed** → 422. Residual: see r2-m2. |
| m5 actor words | `system:jobs/purge`, 150-character `staff:` id | **Fixed.** Both placed; the table's regex now equals AuditActor. |
| m6 out-of-range date | `-271821-…`, `1900-01-01T00:30+01:00` (UTC 1899), `9999-12-31T23:00-05:00` (UTC 10000) | **Fixed** → 422; `9999-12-31` → 201. |

Also checked:
- **Release audit line.** Before/after values carry the full release reason (500 characters, accented).
- **Upper-case id.** A second release with the hold's id in upper case → 409.
- **RDS GRANT/REVOKE CREATE pair.** Unchanged before and after: `has_schema_privilege('xr_wall_reader','public','CREATE')` is t, through membership of the superuser migration role, as pf8b_f4 documents.
- **Definer ownership.** All six definers are owned by xr_wall_reader, with EXECUTE for xr_data only.

New or remaining (all Minor):
- **r2-m1 — Minor: the port layer still turns null dates into 1970.** The port-level `LegalHolds.placeAs` still parses ports/legal-hold.ts's `HoldScope` (`z.coerce.date`). `placeAs(by, {scope:{kind:"DATE_RANGE", from:null, to:null}})` places a hold on 1970-01-01T00:00Z. Only the route got the strict `ScopeBody` (service.ts). No route reaches it today; the next caller of the port (PF-11, a job) would.
- **r2-m2 — Minor: two invisible characters still get through.** The reason accepts U+061C (ARABIC LETTER MARK, a direction mark) and U+2028 (LINE SEPARATOR): both → 201. The refused list names U+200E/F, U+202A–E and U+2066–9 only.
- **r2-m3 — Minor: the whole UTC day is not the firm's day, and nothing says so.**
  - "A calendar date is the whole UTC day" is documented. But the Sample firms are Canadian.
  - A hold "to 2026-03-31" does not cover a record from 21:00 Toronto time on 31 March, which is 01 Apr 02:00Z.
  - The audit summary (service.ts:67, "records dated 2026-01-01 to 2026-01-31") and the 201 answer do not say "UTC".
  - This is a wording point, not a false success on the dates actually given.
- m1, m3 and m7 are with the Lead as documented or open questions (not re-raised).

Verdict: Approve 5fda25666d9937f65d2c8165b10655fef9673af0

## Round 3 — `git diff 5fda2566…16da2b10e` (re-stamp to 20261122180000; the seed INSERT inside a PF-8b F7 lifting DO)

**Set-up.** A throwaway PostgreSQL 18 cluster on port 15497 (initdb, `log_error_verbosity=terse`), removed at the end. `prisma migrate deploy` ran through a copy of `prisma/`, as in F7's own check. The runner was `xr_admin` (NOSUPERUSER, CREATEROLE, member of `rds_superuser`), or `postgres` for the superuser case. For each non-BYPASSRLS case, every migration up to `20261122060000_pf4s_system_identity` was deployed with BYPASSRLS, then `ALTER ROLE xr_admin NOBYPASSRLS`, then pf21b.

**Results.** The seed count is for `system/compliance:legal-hold`; FORCE is read from `relforcerowsecurity`.
- **Superuser, all migrations:** pf21b applied; 1 seed row; FORCE on for plat_system_role, plat_system_role_permission and plat_legal_hold.
- **BYPASSRLS admin, all migrations:** pf21b applied; 1 seed row; all three tables forced.
- **NOBYPASSRLS owner, pf21b alone:** pf21b applied; 1 seed row; all three forced. The owner sees all 24 permission rows even under FORCE, because the policy is "no firm".
- **NOBYPASSRLS owner whose role default sets `app.firm_id`:** this is the case where the lift matters.
  - Control: a bare INSERT under FORCE fails with "new row violates row-level security policy".
  - Migration: pf21b applied; 1 seed row; all three forced again.
- **The INSERT fails inside the DO** (the row was planted first, so the primary key refuses it): P3018, 23505.
  - FORCE is still on for both PF-4s tables. plat_legal_hold is absent: Prisma's single implicit transaction rolled back the whole file. No locks are left.
  - Recovery (delete the planted row, `migrate resolve --rolled-back`, deploy again) applied; all forced.
- **A failure after the DO**, at CREATE FUNCTION (`plat_legal_hold_firm` planted first): P3018, 42723. The seed row was **not** kept (0); FORCE is on; plat_legal_hold is absent.
- **Second apply:**
  - `migrate deploy` again: "No pending migrations".
  - The file again by hand with `psql -f` (each statement auto-committed, no stop on error), as the NOBYPASSRLS owner: 20 errors, starting at `CREATE TYPE … already exists`. The DO's INSERT fails on the key and its ALTERs roll back with it. Afterwards: 1 seed row; all three tables forced.
- **`psql -1 -f` (one transaction) on a fresh NOBYPASSRLS window:** applied; 1 seed row; all three forced.
- **`tests/check_pf8b_f7_data_walls.ts` at 16da2b10e:** 17/17 passed. Its text rule counts 33 guarded statements in 13 migrations (pf21b's DO among them), and it finds 90 forced tables.
- **`tests/check_pf21b_holds.ts` at 16da2b10e:** 67 passed, 0 failed (scratch databases dropped).

**Held:** the lock comes before the lift (ACCESS EXCLUSIVE, so no other session sees the table unforced). The lift and the way back sit in the same DO statement, so any error rolls FORCE back with it. A superuser or BYPASSRLS runner skips the lift; FORCE stays untouched. No new findings.

Verdict: Approve 16da2b10e1375193240ce0108479c53be44a4359
