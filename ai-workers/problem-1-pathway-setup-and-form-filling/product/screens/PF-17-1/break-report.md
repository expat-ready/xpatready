# Break report: PF-17 part 1 (R1.93, our team's read-only firms list), head cb761f977792f5621c406bc41d8a4c3d7f133eed

Breaker, 23 Nov. Scope: brief `product/design/briefs/track-b/PF-17-1.md` "What to build (part 1)" (API only; no screen, so the
screen items of the standing list, i.e. keyboard, 1024 px, 200 % zoom, reload and back, uploads, do not apply). Harness: a scratch
copy of `tests/check_pf17_console.ts`'s setup (the real `FirmWallsInterceptor`, `SystemGuard`, `SystemPlaneWall`, `Db` on the
walled `xr_app` role), scratch databases `xr_studio_pf17brk_<pid>` on 127.0.0.1:54329, dropped after. No product edit, no port
4400. `check_pf17_console.ts` on this head: 22 passed, 0 failed.

## Findings

**B1 Blocker: the two uses are added to the frozen `BYPASS_USES`, and the freeze check fails.**
* Did: ran `tsx studio/tests/check_bypass_uses.ts` on this head and on the merge base 73455f04f (a scratch worktree, removed after).
* Expected: exit 0. P-785 (2) froze the list on 22 Nov (13:57 UTC, 573376a7b, an ancestor of this head). A new use goes in
  its module's own `<name>.bypass.ts` file through `defineBypassUse` (`firm-scope.ts:134-135`; `check_bypass_uses.ts` rule A).
* Actual: base 52 passed, 0 failed; this head 49 passed, 3 failed. Rule A: `"platform.console.firms-list" added to BYPASS_USES in
  firm-scope.ts`, the same for `"platform.console.firm-read"`; "pass (after)" and "D pass: a later import…" fail with it.
* Where: `api/src/platform/firm-scope.ts:152-153`, and the matching `PER_FIRM` / `PLATFORM` edits in
  `tests/check_pf12b_bypass_audit.ts:74-79`. The brief (14:35 IST, before the freeze landed) says "one BYPASS_USES entry", and
  Lead 9's ruling on #3155 says two uses; neither covers where they now have to be declared. The CI `ci` job is skipped while the
  PR is a draft, so this has not shown up yet. Changing `firm-scope.ts` boots every server suite and the api/src scanners.

**M1 Major: the list fails with a 500 once there are a few hundred firms, and every page, filter and search pays for all of them.**
* Did: grew the firm count and timed `GET /api/system/firms` (Support token). Then made `usedBytes` take 25 ms, about one S3
  ListObjectsV2 round trip: production's `boundFiles()` is `S3Files.usedBytes` (`platform/files/s3-files.ts:170-182`), which pages
  through every object under the firm's prefix.
* Actual, local adapter: 2 firms 60 ms · 100 firms 641 ms (`?q=` search 668 ms) · 400 firms 2,464 ms (search 2,347 ms) ·
  1,000 firms **500** after 5,029 ms. One-firm read stays at 15-19 ms.
* Actual, S3-like 25 ms: 60 firms 1,939 ms · 150 firms 4,724 ms · 200 firms **500** after 5,058 ms.
* Cause, captured: `Transaction API error: A query cannot be executed on an expired transaction. The timeout for this
  transaction was 5000 ms`. `firms.ts:85-91` puts the figures of **every** firm, about 7 queries plus one `usedBytes` each, into
  one Prisma interactive transaction (default 5 s), holding a pooled connection for the whole call. Only after that do
  `?health=`, `?q=` and paging run, in memory (`firms.ts:92-95`).
* Against: STANDARDS §5 ("no N+1; one request per screen view, not per row") and §9 (filter and search < 200 ms). §9 held with the
  2 Sample firms (60 ms). The brief requires PF-15's own reads; it does not require one transaction across all firms.

**m1 Minor: DELETED, ABANDONED and PROVISIONING firms show as `OK` with no reason, among the live firms.**
* `healthOf` (`firms.ts:60-69`) looks only at hold, lock, overdue, trial and over-limit. A DELETED firm with no subscription
  answers `health: "OK", reasons: []` (seen in the list). The `status` field is right, but the health word suggests a healthy
  customer.

**m2 Minor: a firm with no live plan gets the wrong reason.**
* No subscription, one staff member: `plan: null`, every limit 0 (PF-15's "no live plan: none allowed", `limits.ts:38`), so
  `ATTENTION`, `["seats over the limit"]`. Nothing says "no live plan".
* An ENDED subscription only: `plan: Team (Sample)` is shown next to limits of 0. The LATERAL pick in `firms.ts:118` falls back
  to the newest ENDED row, but `limitOf` reads the live one. The figures equal PF-15's; the words around them mislead.

**m3 Minor: `?q=` does not match the decomposed form of accented text.**
* Name "École सैंपल Ünïcode": `?q=école` typed as NFC → 1 result, as NFD (`e` + U+0301) → 0.
* Hindi `?q=सैंपल` → 1. Upper case `ÜNÏCODE` → 1. There is no normalisation in `firms.ts:92-93`.

## What held
* **Forged claim:** a firm token with `plane:"system"` and the system issuer, with `system:true, keys:[system/firm:read]`, or
  `alg:none` → 401 TOKEN_REFUSED. The plain firm token → 403 FIRM_SESSION_REFUSED (list and one firm).
* **Mixed case:** `/API/System/Firms` → 200 for Support, 403 for a Content publisher, 403 for a firm token.
  `/API/SYSTEM/FIRMS/<UPPER-ID>` → 200, the same firm.
* **Wrong role:** a Content publisher → 403 MISSING_PERMISSION on the list, on one firm and with `?q=`. No token → 401.
  The service called without the key → MISSING_PERMISSION.
* **Methods and paths:** HEAD on the list and on one firm → 200, with one PF-4s line each (method HEAD) and one firm line for
  the one-firm HEAD. POST, DELETE and OPTIONS → 404. A trailing slash → 200 (routeOf trims it). `//`, an inner `//` and
  `/<id>/x` → 404.
* **Query:** repeated keys (`page`, `q`, `health`), `health[]`, `q[a]`, `?HEALTH=`, `health=ok`, `page=` 0, -1, 01, 1e3, 2.5,
  "%201" or 100000, `q` of 101 characters, an empty `page=` or `health=` → 422 FIRMS_QUERY with the field named.
  `page=99999` → 200, empty. A SQL-looking or `%_` `q` → 200, 0 rows (the firm table is intact). `q=%00` → 200, 0 rows.
* **Ids:** a nil uuid, all-f, a random uuid ("another environment"), leading space, `%00`, `%20`, a SQL tail, the firm key,
  no dashes, braces, `..%2Ffirms`, 5,000 characters → 404 "No such firm.", never 500. 20,000 characters → Node's 431.
* **Audit:**
  * Three list calls add 0 lines to any firm's trail, 3 PF-4s lines, and one firm-less `platform.bypass` line each.
  * Opening one firm adds exactly 1 line to that firm (`system:platform.console.firm-read`, method GET, our correlation id) and
    0 to any other.
  * A 404, a malformed id or a refused call adds 0 firm lines. A refused call writes one REFUSED PF-4s line.
* **Bypass reach:** under `inRequest` the service and raw `asBypass` of either use are refused (BypassRefused) on
  `/firms/x/staff`, `/firmsX`, POST `/firms`, `/api/system/plans/x` and `/api/demo/platform-inbox`. Nesting one use in the other
  is refused. The direct call after `wallUnscopedQueries` is refused. Only `SystemFirms` names the two uses (grep of `api/src`).
* **Figures:** for every firm in the list (the two Sample firms, a firm with no subscription, DELETED, ABANDONED, PROVISIONING,
  and storage set to 3 GB), used and limit equal `seatsUsed`, `PgEntitlements.limitOf`, `mbOf(FilesPort.usedBytes)` and
  `PgCaseCount` read by the test itself: 0 differences.
* **Health:**
  * TRIAL ending in 1 day → ATTENTION "trial ends within 3 days".
  * OVERDUE → ATTENTION "payment overdue", with `overdue: true`.
  * ENDED subscription with the firm on PAYMENT_HOLD → HELD, hold first.
* **Load and text:** 30 list calls at once → all 200. Hindi and upper-case `q` match.

Verdict: Block cb761f977792f5621c406bc41d8a4c3d7f133eed
