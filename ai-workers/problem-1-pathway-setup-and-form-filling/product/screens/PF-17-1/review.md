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

## Round 2 (diff-only, 1d5c8d550)

Reviewer: Opus, fresh context, the same reviewer as round 1; I did not build this. I reviewed `git diff 508202bd2 1d5c8d550` only (P-303). Files: `firms.ts`, the new `firms.bypass.ts`, `features/platform-system-console.ts`, `tests/check_pf17_console.ts`, the two `MODULE.rows/PF-17-1.md` fragments. `firm-scope.ts` and `tests/check_pf12b_bypass_audit.ts` show no diff against `origin/main`. The rulings to meet are Lead 10 on #3155 (B1, M1, m2-m5, the breaker's three minors). Journey score for round 2: **8 / 10, pass** (`journey-test-reviewer-2026-11-23.md`, "Round 2").

### Checks run (local postgres 127.0.0.1:54329, scratch databases; port 4400 not used)
* `check_pf17_console.ts`: **35 passed, 0 failed**, two runs.
* `check_bypass_uses.ts`: **52/0** (it was 49/3 at cb761f977). `check_pf12b_bypass_audit.ts`: **70/0**.
* Mutations run on a scratch worktree, `firms.ts` only:
  * HELD sorted after ATTENTION: caught (DW8).
  * The `?health=` bound removed: caught (DW9, both checks).
  * NFC dropped from `fold`: caught (DW8, break m3).
  * Every firm's figures worked out before paging: caught (DW9, 2.3-2.5 s).
  * A `touchPlatform` in each firm's figures transaction: caught (DW5, +3 lines in place of +1).
  * SECURITY_LOCK not counted as held: caught (DW3; this survived in round 1).
  * "no live plan" removed: caught (DW3).
  * `from = start` in place of `max(0, start - sure.length)`: **not caught**.
  * `scan` with no `- found.length`, so 250 firms' figures in one call: **not caught**.
* Probes on the suite's own harness (the real controller, PF-4s's guard, FirmWallsInterceptor), 458 firms, each timing the average of 3 calls:
  * List 297 ms; page 5 292 ms; `?health=HELD` 33 ms; one firm 42 ms.
  * `?health=ATTENTION` 1,124 ms; `?health=OK` 1,152 ms; `?health=OK&page=99999` 1,223 ms. All are 200, and all are under Lead 10's 2 s.
  * 8 concurrent `?health=OK` calls: all 200, 5.96 s in total.
* Audit, on the bounded branch too: two calls (`?health=ATTENTION`, `?health=OK&page=2`) wrote exactly 2 firm-less `platform.bypass` lines and no per-firm line under the list use.

### What now holds
* **B1 fixed.** `firms.bypass.ts` declares both uses with `defineBypassUse` as plain literals. The `why` text carries Lead 9's ruling, and the routes and audit modes are unchanged. `firms.ts` passes the declared values to `asBypass`. DW6 reads `bypassUses()[name]` and checks it is `FIRMS_LIST.entry` and not on the frozen list. A new DW6 line shows that the name alone and a look-alike object are both refused. The PR's first line says "permissions change", and the touch-list change is stated.
* **M1, mostly fixed.**
  * One short transaction writes the list's line and reads the rows.
  * `?q=` and the order are applied to the rows. Figures are worked out for the page only, one short transaction per firm, 4 at a time.
  * Storage is `platform_storage_over`'s stored measure with `asOf`. No FilesPort is left in the feature or the service.
  * `?health=ATTENTION|OK` works out at most 200 firms' figures (found plus scan ≤ PAGE_SIZE × 4) and says `complete:false` with a note. The 400-firm test is in DW9.
  * Nothing crosses the walls outside the two declared routes. The per-firm figures transactions run inside the list use's own scope, on its own route, and write no line, which matches Lead 9's "one firm-less line per call".
* **Minors.**
  * m2 / break m1: `NOT_LIVE`.
  * m3: named in the PR.
  * m4: the HELD order, the lock, "trial ended", `?q` on a web address, and DW5 checked as exactly +1.
  * m5: `PlatformClock` is injected the same way the other features inject it.
  * Break m2: the plan shown is `limitOf`'s live plan, and "no live plan" comes first.
  * Break m3: NFC on both sides.
* **The builder's departures:**
  * `NOT_LIVE` as a fourth value: reasonable (a deleted firm is not "OK"), honest, and named in the PR and in the MODULE row.
  * Over-limit firms that only the figures reveal showing ATTENTION among the OK firms: reasonable for part 1 (the alternative is figures for every firm), and named as question 2.
  * `used: null` where StorageWatch has stored no row: honest (never a guessed 0), and named as question 1. See m2-r2 for the case it leaves out.
  * `complete:false` with a note: the right idea, and named. But see M1-r2.

### Findings

**Blocker**: none.

**Major**
* **M1-r2. `?health=ATTENTION` loses firms it has found, and a later page then says `complete: true`.**
  * Where: `firms.ts` `list()`, the ATTENTION/OK branch. `scan = open.slice(0, FIGURES_PER_CALL - found.length)` makes the scan length depend on the page, because `found.length` falls as the page moves past the row-ATTENTION firms (`sure`). But `from = max(0, start - sure.length)` assumes the earlier pages showed every match up to `from`. When an earlier page's shorter scan found fewer matches than its free slots, the matches a later, longer scan finds below `from` are never shown on any page.
  * Reproduced. The query `?health=ATTENTION&q=probe` matches 71 overdue firms plus 193 firms that are OK from their row. 13 of those 193 have no live plan: 3 near position 51, 10 at positions 184-193.
    * Page 1: 50 firms, total 74, `complete:false`.
    * Page 2: 24 firms (21 overdue + 3 no-plan), total 74, `complete:false`.
    * **Page 3: 0 firms, total 84, `complete:true`.**
    
    So 10 firms that need attention are on no page, and the answer says it is complete.
  * Without `q`, 1 overdue firm and more than 190 others is enough for `total` to differ from page to page and for a deep page to come back empty. That is the usual production shape: a few overdue firms among hundreds.
  * This is the attention filter, the list's main use ("which firms need us"), and Lead 10 asked for the bound to be stated truthfully. A `complete:true` that hides counted firms is a wrong answer, not a stated limit.
  * Fix (small):
    * Make the scan the same on every page, e.g. `open.slice(0, FIGURES_PER_CALL - PAGE_SIZE)`. Then every page sees the same `matches`, `total` is stable, `from` is right, and the bound still holds.
    * Optionally, skip the scan when `from ≥` the scan length (a deep page then costs nothing, where today `page=99999` works out 200 firms' figures).
    * Add the failing case to DW8/DW9: ATTENTION with row-ATTENTION firms running past page 1 and more OK-by-row firms than the scan covers. Check that `total` is the same on every page, that the pages together hold `total` firms with none on two pages, and that `complete` holds only when they do. That test also kills the two surviving mutations (`from`, `scan`).

**Minor (Should)**
* **m1-r2. Test gaps on the bounded branch.** Besides M1-r2's case:
  * the found-plus-scan ≤ 200 bound is checked only through the note's text, so the 250-firm mutation survives;
  * DW5's exact +1 covers only the unfiltered list, not `?health=ATTENTION|OK` (my probe shows it holds today).
* **m2-r2. Stored storage can stay stale for a long time, and the PR names only the never-measured case.**
  * StorageWatch rewrites `platform_storage_over` only while a firm is over or at the moment it goes back under (`storage.ts:48-60`). A firm that was once over keeps showing its back-under figure "as of" that date for as long as it stays under.
  * Probe: after back-under at 8 MB, the firm's files went to 1 MB and a fresh measure ran. The console still shows `used: 8`, `asOf` the back-under time, and the row is unchanged.
  * `asOf` keeps this honest, so it is not wrong data. But question 1 in the PR should name this case too, so the founder decides with both cases in view (the same PF-15 follow-up would fix both).
* **m3-r2. Speed against STANDARDS §9.**
  * At 458 firms the unfiltered list takes about 300 ms here, against §9's < 200 ms (the PR measured 173-192 ms on its machine).
  * Each bounded `?health=` call holds up to 4 pooled connections for about 1.1 s; 8 at once took 6 s.
  * This is within Lead 10's 2 s bar, and it is staff-only. Record it as accepted, or watch it when part 4 adds a screen. Not a change request.

### Could not check
* CI on 1d5c8d550: the PR is a draft, so most jobs show "skipped". `module-cards` shows a cancelled run beside a successful one.
* `check_pf12_walls`, `check_pf12b_doors`, `check_pf4s_system_signin`, `check_pf15_limits`, `check_features_registry`: not rerun by me in this round (the PR reports them green). The diff does not touch their files.
* A real S3 bucket. It is no longer read on this path.

To fix before Approve: M1-r2 (scan length independent of the page, plus its test). m1-r2 to m3-r2 are Should items.

Verdict: Block 1d5c8d55066aaae88ba7c98b2042d783a36c6209

## Round 3 (diff-only, 8b7b5c347)

Reviewer: Opus, fresh context, the same reviewer as rounds 1 and 2; I did not build this. Scope: `git diff 1d5c8d550 8b7b5c347 -- …/prototype/studio`, which touches 2 files: `firms.ts` (one line of code plus the comment) and `tests/check_pf17_console.ts` (+19). The journey score stays **8 / 10, pass**. The "correct data" criterion now meets the bar, but the 10-point total in the journey report has not been rescored; this round's evidence is the probe below.

### Checks run (local postgres 127.0.0.1:54329, scratch databases; port 4400 not used)
* `check_pf17_console.ts`: **38 passed, 0 failed**, two runs.
* Mutations on a scratch worktree, `firms.ts` only:
  * Round 2's scan (`FIGURES_PER_CALL - found.length`) put back: **caught**. The new M1-r2 check fails with totals 61, 81, 81, 81, as the builder reported.
  * A scan of `FIGURES_PER_CALL`, i.e. 250 firms' figures in one call: **caught** (the seat-over firms become visible). This mutation survived round 2.
  * `from = start` in place of `max(0, start - sure.length)`: **still not caught** (m1-r3).
* My round-2 probe again (`?health=ATTENTION&q=probe`: 71 overdue firms and 193 OK-by-row firms; 3 no-plan firms near position 51, 10 at positions 184-193):
  * Pages 1-4 show 50, 24, 0 and 0 firms. Every page says total 74 and `complete:false`; 74 firms are shown, none twice.
  * The 10 firms beyond the scan are honestly left out, and no page says complete any more. **M1-r2 is fixed.**
* A new probe for `from` across pages (`q=quill`: 71 overdue, 40 no-plan inside the scan, 60 OK):
  * Pages show 50, 50, 11 and 0 firms. Every page says total 111 and `complete:true`; 111 are shown, none twice.
  * The same probe with `from = start` shows only 71 of the 111. So the code is right today, and the suite does not guard it.

### What now holds
* **M1-r2:**
  * Every page now scans the same first 150 of the OK-by-row firms. So `matches`, `total` and `complete` are the same on every page, and `from` falls exactly where the previous page stopped.
  * A call still works out at most 50 + 150 = 200 firms' figures.
  * The new DW9 check holds all of this across 4 pages, with seat-over firms placed past the scan.
* **m1-r2:**
  * DW9 now checks exactly one firm-less line for each of 4 filtered calls.
  * The 250-firm mutation is now caught.
* **m2-r2:** the comment names the back-under case ("one back under keeps the figure of that measure, dated"), and points to the PR's question 1.
* **m3-r2:** accepted as recorded in round 2; no change asked.

### Findings

**Blocker**: none. **Major**: none.

**Minor (Should)**
* **m1-r3. `from` is still untested where the matches run past a page that holds row-ATTENTION firms.**
  * The new DW9 case has no matches inside the scan, and DW8's single match is on page 1. So `from = start` passes all 38 checks, although my probe shows it hides 40 of 111 firms.
  * Fix: one check like my `q=quill` probe, i.e. row-ATTENTION firms that end partway through a page, followed by more than one page of figure-ATTENTION firms inside the scan.
* **n1-r3 (nit). `?health=OK`'s note says "at most 200 a call" but checks 150.** It found 0 row-ATTENTION firms, so the scan's 150 is all it works out. The note says "Checked the figures of 150 of the 768 firms … (at most 200 a call)". The words are true but read oddly. Either name the 150 or let OK use the full 200.

### Could not check
* CI on 8b7b5c347: the PR is a draft.
* The other suites: not rerun. The diff touches only `firms.ts`'s list branch and its own suite.

Verdict: Approve 8b7b5c347f5b646df59a966c819a793e5d05826b
