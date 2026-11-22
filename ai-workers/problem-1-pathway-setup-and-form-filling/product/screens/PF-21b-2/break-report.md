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
- Wrong role: a firm token (user-R), Support, Admin, Auditor, Billing, Content publisher, and one person holding all five non-Owner
  roles → 403 on place, list and release. A mixed-case path and a trailing slash → 403. `/api/%73ystem/…` → 404. No token → 401.
- A firm session as xr_app with `app.firm_id` set: `plat_legal_hold_active(other firm)` refused; place, release and list refused;
  direct SELECT shows 0 rows; INSERT, DELETE and TRUNCATE get "permission denied"; UPDATE changes 0 rows.
- xr_app with no firm, through `isHeld` / `KeepPeriods.check` → refused (42501), never `{held:false}`. A cross-firm ask in firm A's
  transaction → refused.
- REPEATABLE READ, SERIALIZABLE, and `SET TRANSACTION … REPEATABLE READ` inside the transaction → LegalHoldTxRefused. The root
  client → refused.
- Locking:
  - a placement while a deleter is open waits, and the next deleter answers HELD;
  - a deleter that starts while a placement holds the lock waits 1.5 s, then answers HELD;
  - a second deleter that arrives behind a queued placement queues too (pg_locks: Exclusive f, Share f), then answers HELD;
  - a release in progress, plus a deleter, plus a new hold on the same person → HELD before and after.
- Two parallel releases → 200 + 409. A release followed by a new hold holds again.
- DELETE and TRUNCATE are refused for the bypass role and for the owner. Changing `placed_at` is refused ("facts never change").
  `ALTER TABLE … DISABLE TRIGGER` by the bypass role is refused (not the owner).
- A hold for a firm that does not exist → 404 FIRM_NOT_FOUND. A firm with no hold, or with only released holds, + ALL_FIRM_DATA →
  `{held:false}`, which is correct.
- Bodies:
  - extra body fields (`placedBy`, `placedAt`), an extra scope field, a release body naming `by` → 422;
  - a category outside LEGAL_HOLD_CATEGORY, including `case_documents'; drop table …` → 422;
  - `?firm=' or 1=1 --`, `firm[]=`, `state=ACTIVE` → 422;
  - a SQL-looking reason is stored as text (all queries are parameterised);
  - an id like `x' or '1'='1` on release → 404.
- Text: zero-width-only and 501-character reasons → 400 (guard). French, Chinese, Arabic and emoji reasons are kept exactly.
  Upper-case firm and case ids are stored in lower case and still match.
- Not applicable (no screen in this row): keyboard, 1024 px, 200 % zoom, uploads.

Verdict: Changes 78861110ae7926c0d6cea7289112503c9012eae6
