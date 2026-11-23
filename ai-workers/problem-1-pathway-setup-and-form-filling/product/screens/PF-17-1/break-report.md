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

## Round 2 (diff-only, 1d5c8d550)

Breaker, 23 Nov. Diff `508202bd2..1d5c8d550` only. Harness: a scratch copy of `check_pf17_console.ts`'s setup outside the repo
(real guards, `FirmWallsInterceptor`, walled `Db`), scratch databases `xr_studio_pf17brk2_<pid>` on 127.0.0.1:54329, dropped
after. No product edit, no port 4400. On this head: `check_pf17_console.ts` 35/0, `check_bypass_uses.ts` 52/0,
`check_pf12b_bypass_audit.ts` 70/0.

### Round-1 findings re-tried
* **B1 fixed.** Both uses are declared in `firms.bypass.ts`. `firm-scope.ts` and `check_pf12b_bypass_audit.ts` have no diff
  against the merge base 73455f04f. The freeze check passes.
* **M1 fixed.** `SystemFirmsDeps` has no FilesPort and the feature binds none, so a slow `usedBytes` can no longer be called.
  Medians of 3 calls, local store:

  | Firms | List p1 | Last page | `?q=` | `?health=HELD` | `?health=OK` | `?health=ATTENTION` | One firm |
  |---|---|---|---|---|---|---|---|
  | 400 | 372 ms | 336 ms | 68 ms | 20 ms | 838 ms | 805 ms | 23 ms |
  | 1,000 | 245 ms | 343 ms | 78 ms | 24 ms | 1,179 ms | 1,101 ms | 19 ms |

  No 500s. Lead 10's bar (400 firms under 2 s) holds. §9 (< 200 ms) is set on the Sample data, and scale is the team's work.
* **m1 fixed:** DELETED, ABANDONED and PROVISIONING firms now answer NOT_LIVE with "firm deleted", "sign-up abandoned" or "still
  being set up".
* **m2 fixed:**
  * A firm with no subscription → ATTENTION `["no live plan"]`, `plan: null`.
  * An ENDED-only firm → `plan: null` (also DW3).
* **m3 fixed:** `?q=` matches in each of these forms: NFC, NFD, upper-case NFD (`ÉCOLE`), `ÜNÏCODE`, Hindi, and with spaces around.

### New findings
**n1 Minor: under `?health=ATTENTION`, `total` changes from page to page, and page 1's total can hide a page.**
* Did: built 60 overdue firms (ATTENTION from their rows) and 300 firms that look OK from their rows, every third with no
  subscription (ATTENTION only once its figures are worked out). Ground truth from one-firm reads: 160 ATTENTION, 202 OK.
  Then read `?health=ATTENTION` and `?health=OK`, pages 1-7.
* Actual, ATTENTION:
  * `total` is 110, then 123, then 126 on pages 1-3; pages return 50, 50 and 26 firms.
  * No firm appears twice and none is wrong. 34 of the 160 can never be reached, but `complete:false` and the note say so.
* Actual, OK: `total` is 134 on every page. 68 of the 202 can never be reached, again flagged with `complete:false`.
* Cause (`firms.ts:128-135`): the figures checked are `open.slice(0, FIGURES_PER_CALL - found.length)`. Page 1 fills with
  row-ATTENTION firms, so it checks only 150 firms and its total is smaller.
* Worked case: 50 row-ATTENTION firms, 50 matches in the first 150, 60 in the first 200. Page 1 says `total` 100 (2 pages), but
  page 3 holds 10 firms. A screen that takes its page count from page 1 never shows them.
* A page past the end (`page=99999`) still works out 200 firms' figures (990 ms) to return nothing.
**n2 Minor: a firm's stored storage figure stops updating once it is back under its limit.**
* Did: ran StorageWatch on Sample firm A (limit 25,600 MB): 5 MB, then over (25,602), then 8 MB, then 25,599 MB.
* Actual:
  * The first under-limit measure stores nothing: `used: null`.
  * Over shows 25,602, with its date.
  * Back under shows 8 MB, with its date.
  * The last measure (25,599 MB, 1 MB under the limit) writes nothing (`mark: "none"`, `storage.ts:49`), so the console still
    shows **8 MB** as of the earlier date.
* Question 1 in the PR body names only the "never over" case. The comment at `firms.ts:9` ("written by its daily job and each
  upload") is wrong for every firm under its limit. Widen question 1 to cover a back-under firm's figure going stale.

### What held
* **Audit (counted per call):**
  * Each list call, `?health=ATTENTION` and `?health=OK&page=3` adds exactly 1 firm-less `platform.bypass` line (the list's use),
    0 firm lines and 1 PF-4s line, even though the filtered calls run up to 200 figure transactions.
  * Opening one firm adds 0 list lines and 1 line on that firm.
  * A 404 adds 0 bypass lines and 1 PF-4s line.
  * 30 calls at once add exactly 30 list lines and 0 firm lines.
* **Paging (unfiltered):** 362 firms over 8 pages, all unique. `page=99999` → 200, empty, 22 ms. HELD and NOT_LIVE totals are
  exact.
* **Order:** 100 firms that are ATTENTION only from their figures sort among the OK firms. The PR body names this (question 2).
* **Concurrency:** 30 calls at once, all 200, at 400 and 1,000 firms:
  * list: 4.9-6.2 s wall time;
  * `?health=ATTENTION` / `?health=OK`: 17-21 s wall time, with no pool timeout.
* **Firm changed mid-call** (the service's db wrapped so the change lands right after the rows transaction):
  * A firm hard-deleted at that point → 200, shown as its row was read, no 500.
  * A firm switched to DELETED with its subscription ENDED at that point → 200: status ACTIVE (the row as read), health
    "no live plan" (from the later figures). The two moments mix, but only in that race.
* **Bypass reach:** each of these, run under `inRequest`, is refused with BypassRefused:
  * either use run by its name on its own route;
  * the list use on the one-firm route, on `/firms/x/staff`, on POST, on `/firmsX` and on `/firms%2F..`;
  * the one-firm use on the list route;
  * `svc.list` on `/api/system/plans`;
  * one use nested in the other;
  * a spread or `Object.create` look-alike of the use.

  Assigning to `entry.audit`, `entry.inside` or `name`, or pushing onto `entry.routes`, throws a TypeError (frozen); the audit
  mode stays `platform`.

Verdict: Approve 1d5c8d55066aaae88ba7c98b2042d783a36c6209
