# PF-17 part 1 review: our team's firms list with health and usage (R1.93), PR #3155

Reviewer: Opus, effort high, fresh context; I did not build this. Commit reviewed: **cb761f977792f5621c406bc41d8a4c3d7f133eed**, branch `claude/runtime-pf17-firms`, diff `origin/main...cb761f977` (merge base 73455f04f; 8 files, +387/-4). Spec: brief `design/briefs/track-b/PF-17-1.md` ("What to build", DW1-DW8, touch list) and Lead 9's rulings on #3155 (two uses; the pinned-list lines in `check_pf12b_bypass_audit.ts`). This part is an API with no screen, so D1-D20 and the BIC-01..20 scorecard are N/A (PF-15 precedent). The journey score is in `journey-test-reviewer-2026-11-23.md`: **8 / 10, pass**.

## Checks run (local postgres 127.0.0.1:54329, scratch databases; port 4400 not used)
* `tests/check_pf17_console.ts`: **22 passed, 0 failed** (two runs).
* Exit 0: `check_pf12b_bypass_audit` 70/0, `check_pf12b_doors` 33/0, `check_pf4s_system_signin`, `check_pf15_limits` 69/0, `check_features_registry` 27/0.
* **`tests/check_bypass_uses.ts` (P-785 (2), on main since #3032, 22 Nov 18:16Z, and in this branch's base): 49 passed, 3 failed.** The same check on the merge base 73455f04f gives 52/0. See B1.
* Mutations run on a scratch worktree, `firms.ts` only:
  * `>` changed to `>=` (over the limit): caught, 3 FAIL.
  * `touchFirm` removed from `one()`: caught, DW5 FAIL.
  * SECURITY_LOCK no longer counted as held: **not caught**.
  * HELD sorted after ATTENTION: **not caught** (m4).
* Breaker-style probes, run on the suite's own harness:
  * A Support token on `/API/System/Firms` and on `/API/SYSTEM/FIRMS/<UPPER-ID>`, and on the trailing slash `/api/system/firms/`: 200. HEAD: 200.
  * A firm token with a forged `system`/`keys` claim: 401 TOKEN_REFUSED.
  * `?health=OK&health=HELD`, `?q[a]=1` and a 101-character `?q`: 422. A Unicode `?q`: 200, 0 rows. `?page=99999`: 200, empty.
  * Id `%00` and an encoded `../` id: 404 "No such firm.".
  * 55 firms: the list takes 322 ms on average.
* `graph.mjs`: G1 0, G2 0. Only `GET /system/firms/:id` is in the routes table, with `testedBy: []`. The tool misses `@Get()` with no path and template-literal URLs; `POST /system/session/local` shows the same miss. This is a tool limit, not a finding.

## What holds
* **Figures:** each comes from PF-15's own reads, in the bypass transaction, with no second count (`firms.ts:127-131`):
  * `seatsUsed(tx, id)`;
  * `new PgEntitlements(tx, now).limitOf` for each of the 4 metrics;
  * `mbOf(files.usedBytes(id))` from the bound FilesPort (`boundFiles()`, as `platform-entitlements.ts` binds it);
  * `PgCaseCount(tx, firm.key).activeCounts(tx)`, the case side's adapter bound by the firm key.
  
  DW2 compares all 4 used and limit pairs with PF-15's reads, follows a seat change, and shows firm B unmoved.
* **Health rules** (`healthOf`, `firms.ts:61-69`):
  * HELD: the firm or its subscription is on PAYMENT_HOLD. SECURITY_LOCK also counts as held, a reasonable reading of "on hold".
  * ATTENTION: any metric strictly over its limit; subscription OVERDUE (PF-5's indicator, per the schema comment); a trial ending within 3 days or already ended.
  * OK otherwise. The reasons are plain words.
  * `TRIAL_ENDING_DAYS = 3` and `PAGE_SIZE = 50` are both labelled Sample (`firms.ts:26-29`).
  * Sort is HELD, ATTENTION, OK, then name, then id. `?health=`, `?q=` (name or address) and paging all work.
* **Key:** both routes declare `@SystemKeys("system/firm:read")` from PF-4s (`routes.ts:14,17`), and the service checks the key again. DW1 covers all 5 holders (200), the Content publisher, a firm token and no token.
* **Bypass routes:** `^GET \/api\/system\/firms$` and `^GET \/api\/system\/firms\/[^/]+$` (case-insensitive) cover exactly the two routes. DW6 refuses the service on any other route and on an unscoped call in the API server.
* **Audit (as ruled):** the list writes one firm-less `platform.bypass` line per call and nothing on any firm's trail. Opening one firm writes one line on that firm's trail, and only after the row is found, so an unknown id writes none. PF-4s's guard writes one `plat_system_audit` line per call, refused calls included.
* **Errors:** a malformed id gives 404 before any read; an unknown id gives 404 inside the transaction; neither gives 500. A bad query gives 422 FIRMS_QUERY with the field named (`z.strictObject`).
* **SQL:** `firms.ts:110-121` is a tagged `$queryRaw` with `${id}::uuid` as a bound parameter; `?q` is filtered in memory. No string building.
* **Departures:** the features `MODULE.rows/PF-17-1.md` fragment is needed by module-cards and is harmless. The two uses are ruled.

## Findings

**Blocker**
* **B1. The two uses are added to the frozen `BYPASS_USES`, so an existing CI suite goes red.**
  * Where: `api/src/platform/firm-scope.ts:152-153`. Since P-785 (2) step 2 (#3032, merged 22 Nov 18:16Z, after the brief was written), the list is frozen with its 15 uses. `firm-scope.ts:134` says "a new use is declared with defineBypassUse in its module's own `<name>.bypass.ts` file, never added here (tests/check_bypass_uses.ts refuses it)", and `DEVELOPING.md` "Bypass uses" says the same.
  * Failing scenario: `tsx tests/check_bypass_uses.ts` at cb761f977 gives these failures:
    * `FAIL A pass: BYPASS_USES ... holds exactly the 15 uses of the freeze — ["platform.console.firms-list" added ..., "platform.console.firm-read" added ...]`;
    * `FAIL pass (after): a new use is one new <name>.bypass.ts file beside its module, firm-scope.ts untouched`;
    * `FAIL D pass: a later import of a loaded file is the same declaration` (its count is ANCHOR + 2).
    
    The merge base gives 52/0. The hand-over's list of green suites leaves this one out, and CI has not run because the PR is a draft. The brief's "Done when" requires existing suites to pass and the full `ci` to be green.
  * Fix: the Lead's rulings stand; only the place changes.
    * Add `api/src/platform/system-console/firms.bypass.ts` that exports `FIRMS_LIST = defineBypassUse("platform.console.firms-list", { why, routes: [/^GET \/api\/system\/firms$/i], direct: true, audit: "platform" })` and `FIRM_READ = defineBypassUse("platform.console.firm-read", { ..., audit: "per-firm" })`. Write them as plain literals and keep the ruling in `why`.
    * In `firms.ts`, call `asBypass(FIRMS_LIST, …)` and `asBypass(FIRM_READ, …)` by value.
    * Revert `firm-scope.ts` and the `check_pf12b_bypass_audit.ts` lines. That suite pins `BYPASS_USES` only, so the ruled additions become unnecessary.
    * Point DW6 at the declared entries (`bypassUses()[name]`, or the exported value's `entry`), and add one DW6 line showing that the name alone is refused.
    * The touch list gains `firms.bypass.ts` and loses `firm-scope.ts`: state this in the PR body.
    * The first line of the PR says "permissions change" (P-423), because the Lead-read path list does not match `*.bypass.ts` yet.

**Major**: none.

**Minor (Should)**
* **m1.** The list holds one interactive transaction open across every firm's figures, `usedBytes` included (`firms.ts:85-91`, `130`). With S3 (`s3-files.ts:170`) that is one ListObjects per firm inside a Prisma transaction, which has a 5 s default timeout. At a few dozen production firms that turns into a 500. Locally it is already 322 ms for 55 firms, against STANDARDS §9's < 200 ms and "no request per row". The sample data (2 firms, about 25-90 ms) is within budget, and scale work is the team's. Fix: read `usedBytes` before or after the transaction, or say in the PR body that this is accepted.
* **m2.** A DELETED, ABANDONED or PROVISIONING firm reads `health: "OK"`, with `plan: null` and every limit at 0 (probe: "Paging firm 001" set to DELETED). This follows the brief's rules as written, but staff would read "OK" on a deleted firm. Record it for part 4's concept, or add a plain reason ("deleted", "no live plan") without changing the health value.
* **m3.** `firms.ts:117` reads `platform_firm_web_address` directly. The schema says "Read and written only through api/src/platform/web-address/", and this is the only reader outside that module. No by-firm read exists there, and the brief forbids edits outside its touch list. Name the departure in the PR body.
* **m4.** Test gaps; the mutations survive:
  * HELD sorting before ATTENTION is never tested (the list holds one ATTENTION firm and no HELD firm when it is sorted);
  * SECURITY_LOCK is not tested, nor are the "trial ended" reason and a match on `?q=` by web address (the `byAddr` case is actually the SQL-looking query);
  * DW5's firm-less line is checked as `>= 1` across the run, not +1 for this call.
* **m5.** `features/platform-system-console.ts:13` builds `SystemFirms` with no `now`, so it uses `Date.now`. PF-15's feature binds `PgEntitlements` to `PlatformClock`. A test or demo clock then moves PF-15's limits but not this list's trial window. Inject `PlatformClock` as `platform-entitlements.ts` does.

## Could not check
* CI: it has not run (the PR is a draft; `module-cards` was in progress).
* `check_pf12_walls.ts` and `check_pf15_booking.ts`: not run by me (the builder reports exit 0).
* No screen exists (part 4), so the keyboard, 1024 px and 200 % walks are N/A.
* A real S3 bucket.
* The breaker's report is separate (`break-report.md`, not read).

Verdict: Block cb761f977792f5621c406bc41d8a4c3d7f133eed
