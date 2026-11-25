# PF-15 part 1a review: plan limits (schema + runtime), PR #2130

Reviewer (Opus, fresh context, did not build it). Commit reviewed: **d8dc7be198ae82aaa4e06f9c98d52fa3a687e00c**, branch `claude/runtime-pf15-limits`, diff `origin/main...d8dc7be`. Brief: `design/lead-b-briefs/PF-15.md` part 1, P-610 split 1a (DW1, DW2, DW3's return, DW6, DW7). Rules from `trace-requirements.py --brief PF-15` and SA-3-5 (SA-03 line 586). This is not a screen: D1-D20 and BIC-01..20 are N/A. The seat refusal is walked on PF-6's unchanged Team screen; see `journey-test-reviewer-2026-11-18.md`.

**Note on heads:** the PR head on GitHub is now 5fc5064 (two commits after d8dc7be: a BACKLOG revert, then a migration and walls-suite fix). Another session also has uncommitted edits in this clone (storage.ts, limits.ts, files.ts, migration, suite; made 14:03Z, after my runs). I reviewed d8dc7be: suites marked "at d8dc7be" were run from a `git archive` export of that commit.

## Checks run
* `tests/check_pf15_limits.ts`: **69 passed, 0 failed** (clone, and the d8dc7be export).
* Neighbours (clone, app code = d8dc7be): pf4c_batch_invite 24/0, pf6m2_invite_recheck 19/0, pffd_delete 24/0, fo5_retainers 248/0, pf4b_session_reads 53/0, pf5_signup_billing 53/0, pf19b_mail 28/0, pf14_jobs 92/0. pf4_identity 110/111 (the miss is part B: no copy on :4541, environment). csc1_count needs a running copy (environment); its DW11 line is compatible with the new fake.
* **At d8dc7be: `check_pf12_walls.ts` guard FAIL and `check_pf3_platform_schema.ts` 74/1 FAIL** (B1, B2). At 5fc5064 both pass (pf3 75/0; the walls guard passes; the five walls failures left are server starts that cannot resolve files outside the exported folder, and the d8dc7be export has the same five).
* `typecheck.mjs`: no new errors (15 known). `graph.mjs`: G1 0, G2 0; G6 lists `features/platform-entitlements.ts` as "nothing imports". That is expected for a feature file loaded by `registerFeatures`, so it is not a finding.
* CI `module-cards` is red on the PR. The cause is on main, not here: `front-office/MODULE.md` is already 42 lines (over 40) on `origin/main`, and this PR leaves the count unchanged.
* Walled probe (my script, scratch database, the real `Db` = xr_app pool, `wallUnscopedQueries()`):
  * firm scope: limits read; day 1 over → mark, team inbox and Owner emails; day 15 → 409.
  * job via `asJob`: measured 2, cleared the mark.
  * no scope: see M1 and m1.
* Isolated copy :4433 (`PLATFORM_IDENTITY=local`): journeys J1-J6.

## Done-when lines (part 1a)
- [x] DW1: real invite route, 409 PLAN_LIMIT_REACHED with metric, limit and upgradePath; one left → 201; no live plan → 409 limit 0; no row → 0. Null and 0 are tested on case and storage metrics, because PF-3's CHECK keeps seats at 1 or more and never null (deviation 1).
- [x] DW2: retainer upload. Day 1 allowed, 1 team email + 1 per Owner, none on day 2; 14 d − 1 min allowed; 14 d → 409, nothing saved; the old file reads; back under via the daily job; a new episode alerts once. Tested on an owner connection only (M1); I re-ran it walled and it held in firm scope.
- [x] DW3 return: `{seats, 8, 3, 5}` plus SA-4-56's sentence; a plan that fits → none; storage conflict; unknown plan → 404; features empty with a note.
- [x] DW6: two invites at the last seat → 201 + 409; with two seats left, both pass (real route, walled).
- [x] DW7: `usedBytes` contract case on the fake and LocalFiles; retired key, `.tmp` and missing `.meta` excluded.

## Deliberate deviations: judgement
1. **Seats stay on `platform_plan.seats_limit`. Sound.** There is still one home for seats, fail-closed holds (no live plan → 0), PF-3's CHECK forbids 0 and null, and three suites write the column. The PR raises it as a Question for the tech lead, so it is not silent. Leftover gap: SA-3-4's Unlimited tick box for seats is impossible under PF-3's CHECK. That comes from PF-3, and Lead B should confirm it.
2. **Port keeps CS-C1b's `check(firm, metric, used?)` returning a result. Sound for 1a.** It avoids breaking `runtime.ts:308`. Seats read limits in the caller's transaction (`new PgEntitlements(tx)`), and the race guard is the in-transaction count under `inFirm`'s lock, which DW6 shows. The cost: the case side binds one process-wide instance, so its limit read runs outside the case transaction. That is harmless for races, but see M1 for the firm-key lookup.
3. **Two back-relation lines in platform.prisma, one BYPASS_USES line, the check_pffd_delete edit. All needed and small.** The bypass use is `outside: true` with no routes, and each firm is measured in `withFirm`.

## Findings

**Blocker**
* **B1. A CI suite goes red: `platform_plan_limit` is a `platform_*` table with no RLS and is not on the walls suite's exception list.**
  * Where: `prisma/migrations/20261118100000_pf15_plan_limits/migration.sql:24`; `tests/check_pf12_walls.ts:31-34`.
  * Failing scenario: `tsx tests/check_pf12_walls.ts` at d8dc7be → `FAIL PF-12 guard pass … — ["platform_plan_limit"]`.
  * Fix: name it as a later catalogue in the guard, or wall it. 5fc5064 adds `LATER_CATALOGUES`.
* **B2. PF-3's suite goes red: the RESTRICT foreign key from `platform_plan_limit` blocks deleting a plan.**
  * Where: `migration.sql:47` (`ON DELETE RESTRICT`); `tests/check_pf3_platform_schema.ts:105-106` (`delete from platform_plan`, then expects "Sample plans are missing").
  * Failing scenario: at d8dc7be → `FAIL PF-3 fail: the seed into a database without the Sample plans is refused in words` (74/1).
  * Fix: `ON DELETE CASCADE`, which 5fc5064 does. The rollback header stays valid.

**Major**
* **M1. The real adapter's case-side firm-key path is certified only off the walls; on xr_app it refuses every case.**
  * Where: `api/src/platform/entitlements/limits.ts:37`, which looks the firm up by `key` in `platform_firm`, behind PF-12's wall.
  * The suite builds every PgEntitlements, EntitledFiles and Retainers on a plain owner-role PrismaClient: `tests/check_pf15_limits.ts:70`, `:126` ("takes the firm's id as well as its key (the platform side and the case side)"), `:178`, `:181`. So neither the shared contract nor DW2 ever runs as xr_app.
  * Failing scenario (walled probe, as a case route with no platform firm): `limitOf("sample-firm", "active_individual_cases")` → `{firmId: null, limit: 0}`, and `check(…, 0)` → refused. Once part 2 or CS-C1b binds `PgEntitlements` into `runtime.useEntitlements`, every case opening would answer 409.
  * Fix: either resolve the key through a wall-reader function (as CS-W1's `xr_case_lookup` does) or drop the key claim (accept a uuid only and say so in `ports/entitlement.ts` and MODULE.md). Also run the contract and DW2 on the real `Db` inside `withFirm`, so the wall is in the test.

**Minor**
* **m1. Storage fails open when the firm cannot be read.**
  * Where: `limits.ts:59` (`|| !firmId ||` → allowed). Seats and cases fail closed; storage does not.
  * Failing scenario (probe): with no firm scope on the walled pool, on day 15 `EntitledFiles.put` stores the file (`storageHard` reads false), and the measure after it logs an RLS refusal.
  * No server path has no scope today, but the brief says fail closed. Fix: refuse when `firmId` is null.
* **m2. Two shapes for "the one 409", and the upgrade path names a screen that does not exist.**
  * Where: `identity/service.ts:193` (type `…/plan-limit-reached`, "Change the plan in Settings, Billing.") vs `limits.ts:66-68` (type `…/plan-limit`, a different sentence). MODULE.md says "the one 409".
  * There is no Settings › Billing screen on main (grep of `web/src`). SA-3-5 asks for an upgrade path a person can follow.
  * Fix: use `planLimitReached` for seats too, and name a path that exists, or label the words Sample.
* **m3. The port's own sentence contradicts the real adapter.**
  * Where: `ports/entitlement.ts:7` says "without it [used] an adapter reads the usage itself"; `limits.ts:54` throws TypeError. The fake allows when `used` is missing, the real adapter throws, and the contract does not pin it.
  * Fix: one rule in the port comment, plus a contract case.
* **m4. A day-one email can repeat after a rollback.**
  * Where: `storage.ts:61-62` sends inside the transaction before `alertedAt` commits.
  * Failing scenario: the audit insert fails after `send` → the transaction rolls back, including a first-time mark → the next measure sets a new `first_over_at`, so the idempotency key changes and the team inbox and Owners get a second email.
  * Fix: send after commit, keyed on the committed episode.
* **m5. SA-3-40 says "or the firm moves to a plan with a higher limit", but a raised limit that is still exceeded keeps the old episode.**
  * Where: `storage.ts:52-54`.
  * Failing scenario: day 15 on 5 GB, the firm moves to 25 GB while using 30 GB → still hard at once.
  * This is an interpretation; it goes to Lead B or the founder, not to be settled silently. Record it on 1b.
* **m6. Every upload walks the firm folder synchronously twice.**
  * Where: `storage.ts:107` and `:112` via `measure`; `front-office/files.ts:91` (readdirSync, lstatSync, readFileSync).
  * Measured: 75 ms of event-loop block per walk at 5,000 files.
  * Fix: walk only when the mark is hard, or read the last measure from the mark row.

## Not checked
* A real mail provider: on the app, MAIL_PORT is the in-memory LocalMail, so the day-one emails are not visible in the demo inbox. The audit shows `storage.over, storage.alerted`, and the suite checks the mail content.
* The real 14-day wait on a live server (fake clock and a backdated mark only).
* Part 1b's booking, DW4 and DW5 (out of scope).

Verdict: Block
Fix list for d8dc7be: B1, B2 (both appear fixed in 5fc5064: re-review that head's diff), M1. The m-items are optional before merge, except that m1 is a one-line fail-closed fix.

## Re-review: 078c0d6fa44e288844e53dfd527d1eedc61a4eaa (P-277: diff d8dc7be..078c0d6 only)
* **Suites at 078c0d6 (clone at that head, clean tree):** pf15_limits 67/0, pf12_walls 100/0, pf3_platform_schema 75/0, pf4c 24/0, pf6m2 19/0, fo5_retainers 248/0, pffd 24/0. **B1 fixed:** `LATER_CATALOGUES` in `check_pf12_walls.ts:34`. **B2 fixed:** `ON DELETE CASCADE` on `platform_plan_limit_plan_id_fkey`, mirrored in the Prisma schema.
* **M1 fixed:** PgEntitlements reads only through `platform_entitlement_limit` (a definer function owned by xr_wall_reader, EXECUTE granted to xr_app; PUBLIC revoked). The new walled cases (`new Db()` after `wallUnscopedQueries()`) cover the case-side key with no scope (25 Sample cases, the 26th refused), firm-scope storage hard, a measure in `withFirm`, the shared contract on xr_app, and a direct no-scope read still returning 0.
* **m1 fixed:** `limits.ts` refuses storage for a firm it cannot find (test "no-such-firm"). **m3 fixed:** the port comment now matches the adapter.
* **m4 fixed:** the mark commits first; the emails go after it; `alertedAt` is set by a conditional `updateMany` on the same `first_over_at`, so a failed email retries next time without starting a new episode. Two measures racing past the lock both send, with the same keys, and MailPort's contract (`ports/mail.ts:33-35`) sends one email per firm and key. Sound.
* **Also checked:** the `known()` guard keeps FileKeyTaken for a retired key while hard; `usedBytes` skips a file removed meanwhile; an id wins over a key shaped like a uuid (`ORDER BY` in the function); the rollback names the new function and the owner step.
* **DW3 moved to part 1b** (806 > 800 lines). This departs from the brief's 1a split, but it is disclosed in the PR as a Question for Lead B. It is not a finding.
* **New Minor m7: the definer function reads another firm's row from inside a firm's session.**
  * Where: migration `platform_entitlement_limit`, `WHERE f.id::text = lower(p_firm) OR f.key = p_firm`.
  * Probe, as xr_app with `app.firm_id` = firm A: `platform_entitlement_limit('sample-solo', 'STORAGE_MB', now())` returns firm B's id, `solo`, `Solo (Sample)`, 5120 and its storage-hard flag. PF-12's precedent (`platform_web_address_taken`) returns a boolean and no firm id.
  * No route passes a caller-chosen firm (callers pass `ctx.firmId` or the case record's key), so it is reachable only through another bug.
  * Fix: add `AND (platform_session_firm() IS NULL OR f.id = platform_session_firm())`. The case side keeps working because it has no session firm.
* **Still open, not blocking:**
  * m2: the two type URLs are already on main (CS-C1b's `plan-limit`, identity's `plan-limit-reached`), so this PR need not settle them. The "Settings, Billing" upgrade path still names no screen.
  * m5 and the Unlimited-seats question are with Lead B; m6 is noted.

Verdict: Approve 078c0d6fa44e288844e53dfd527d1eedc61a4eaa

## Re-review: merge of main, 3f15a6be6fbd459830273e02aa8aab3284c9e38f (`git show --remerge-diff`)
* Hand resolution: `platform.prisma` keeps both `PlatformFirm` slots (entitlements, offices). `platform/MODULE.md` is main's card plus PF-15's lines in Purpose, Entry points, Tables and Tests; it is 38 lines. No other PF-15 file is touched by main's 72 files, and the PF-15 migration stamp is still the newest.
* Suites at this head (after `prisma generate`): pf15_limits 67/0, pf12_walls 100/0, pf3 75/0, pf18a_offices 87/0, pf4c 24/0, fo5_retainers 248/0, cssd1_no_drift 17/0 (own copy on :4434); typecheck reports no new errors.

Verdict: Approve 3f15a6be6fbd459830273e02aa8aab3284c9e38f

## Part 2 review (4c4e0f3d3)
Diff `origin/claude/runtime-pf15-limits..4c4e0f3d3` only (P-277). The brief is `PF-15.md` on main ("What to build, part 2", DW3, DW8, DW9) plus the "Part 2 also" lines on lead-b-front-office. The rules are SA-3-43, SA-3-58, SA-3-62 and SA-4-56. This part has no screen, so the browser, BIC and journey parts do not apply. Journey score: N/A (no screen; no journey-test report written).
* **Suites at 4c4e0f3d3:** pf15_cases 32/0, pf15_limits 67/0, pf12_walls 100/0, pf3_platform_schema 75/0.
* **Probes:** a scratch database with every migration, run as xr_studio and as xr_app. Then mutation runs on a scratch copy of the migration, with the repository left untouched.

### Blockers
None.

### Majors
* **M1. A firm's limit drops before its renewal after a lower, raise, lower sequence (SA-3-43: "until then the firm keeps its current plan version").**
  * Where: migration `kept` CTE (lines ~132-142). It uses `old_value` of the *oldest* pending lowering, then `greatest(current, that)`.
  * Probe: team plan, firm renews on the 30th.
    * 20 Nov: individual cases lowered 150 → 100. Effective 30 Dec.
    * 21 Nov: raised 100 → 200. The firm reads 200, correct.
    * 5 Dec: lowered 200 → 50. Effective 30 Jan.
    * Readings from 5 Dec: **150** on 6 Dec, 200 on 5 Jan, 50 on 31 Jan.
  * Effect: between the second lowering and the first renewal, the firm is cut from 200 to 150 with no renewal. A firm with 180 active cases is refused, although its notice says "Until then nothing changes". Seats use the same expression.
  * Fix: take the greatest `old_value` over *all* pending lowerings, with a null among them meaning Unlimited, then `greatest()` with the current value. This gives 200 / 200 / 50 above and keeps the two-lowering case (150 → 100 → 50) right. It also removes the dependence on `approved_at` order, which comes from the app clock.
  * Add a test for the brief's "raise after a pending lowering" on the same metric. The suite's only raise is on corporate cases, which has no pending lowering.
* **M2. The tests do not pin the kept-value rules.**
  * Each of these mutations left `check_pf15_cases.ts` at 32/0:
    * (a) the kept value replacing `greatest()`, so a raise is ignored while a lowering is pending;
    * (b) a pending Unlimited ignored (`OR kept IS NULL` removed);
    * (c) the newest pending lowering instead of the oldest;
    * (d) `WHILE at <= target`, which wrongly skips a renewal exactly 30 days on;
    * (e) the trigger's `FOR UPDATE` removed.
  * The cross-firm guard does fail when removed (good).
  * Fix: one case each for (a)–(d), with M1's fix in place: a lowering from Unlimited (kept null), two pending lowerings, and a renewal exactly at approval + 30 days. For (e), two concurrent inserts.
  * My manual race passed: the second change waited and stored `old_value` = the first change's new value, and a same-value twin got "already 15". It is untested.
* **M3. DW9 "every limit change audited" is not met for raises.**
  * `limit-changes.ts:64` writes an AuditPort line only per firm a *lowering* reaches.
  * No `audit_event` line is written for a raise (or Unlimited), or for a lowering on a plan with no live firm. Test line ~127 asserts that a raise writes no line.
  * The insert-only `platform_limit_change` row records who, when, why and the values, but the brief (part 1 "Every limit change … through `AuditPort.record`", DW9) asks for the trail.
  * Fix: one line per live firm for every change (`plan.limit.raised` / `plan.limit.lowered`), and say in the PR that a change reaching no firm is recorded only on `platform_limit_change`. The AuditPort needs a firm id, so a firmless line would need Lead B.
* **M4. Case limits are not in force in the app (SA-3-39 hard, DW8). This needs a recorded decision, not necessarily code.**
  * `runtime.ts:140` keeps `fakeEntitlements()` (allow-all), and nothing calls `runtime.useEntitlements(new PgEntitlements(…))`. So PF-15's case limits never refuse a case in the running product. DW8 is proved only against the CaseCountPort fake.
  * The builder's reason holds:
    * case-side workspaces whose firm key is not a `platform_firm` read limit 0, and would be refused on every opening;
    * Sample limits (solo 25) could break suites that open many cases.
  * So binding is a cross-module fail-open/fail-closed choice.
  * The part-1a review (B-section above, line ~47) expected "part 2 or CS-C1b" to bind it. Today nothing records who does.
  * Fix: either bind it in `features/platform-entitlements.ts` and run the case-opening suites, or put a "Question for the tech lead" in the PR and get a BACKLOG line naming the row that binds it. Merging without either leaves the gap silent.

* **M5. Any app session can rewrite a plan-wide limit through the definer trigger. This undoes 1a's revoke.**
  * `xr_data` keeps INSERT on `platform_limit_change` (migration ~line 106). The BEFORE trigger runs as xr_wall_reader and writes `platform_plan_limit` / `seats_limit` for every firm on the plan.
  * 1a revoked app writes on `platform_plan_limit` for exactly this ("read by the app, never written by it").
  * Probe: as xr_app in firm A's session (`app.firm_id` set, no bypass), one INSERT set solo's storage to 999999. A backdated `approved_at` (2020) gave firm B an effective date at its next anchor, about 12 days on instead of 30+.
  * Only the service's key check stands in the way, and PF-12's walls exist so the database holds when app code errs. The breaker reports the same independently (break-report.md, part 2 B1).
  * Fix: revoke INSERT from xr_data and grant it to `xr_staff_bypass` only, so only the named `asBypass` crossing can insert, or refuse in the trigger unless `current_user` passes the walls. Better still, the trigger should not trust a caller's `approved_at` far from `now()`.

### Minors
* m1. The rollback comment (line 14) omits `DROP FUNCTION platform_limit_change_firms()`. It also needs 1a's note: the functions are owned by xr_wall_reader, so a role that is not superuser first runs `ALTER FUNCTION … OWNER TO CURRENT_USER`.
* m2. (moved to M5.)
* m3. `platform_limit_change` is readable by every firm's session (a catalogue with no wall). Its free-text `reason` and `approved_by` (our staff ids) are internal. Either keep reasons firm-neutral (say so in MODULE.md) or wall the table as one of "our own registers".
* m4. In `limit-changes.ts:73` the emails go after the commit. One failing `send` stops the loop and throws to the caller although the change committed. A retry then answers 409 LIMIT_UNCHANGED, so the remaining Owners are never told (SA-3-43 notice). Catch per Owner and log, or queue the notices.
* m5. The `checkDowngrade` words: storage says "allows 100" with no unit, and cases say "Remove 2 active individual cases" (cases are closed or withdrawn, not removed). Seats match SA-4-56 exactly. Wording is Sample.
* m6. `checkDowngrade` takes `firmId` and a separately bound `CaseCountPort`, so a caller can pass the wrong firm's counter. Name the binding in the doc comment, or take the firm key and build `PgCaseCount` inside.
* m7. The renewal rule (monthly from `current_period_end`, `trial_ends_at` or `created_at`) is marked Unconfirmed and sent to Lead B. For a yearly subscriber it applies a lowering up to 11 months early. This is not a finding, but keep the question open in the PR.
* Not a finding: features are empty with `FEATURES_NOTE`. The "Part 2 also" line says part 2 checks features, but PF-17's list is not on main. Record it in the PR as still open.

### What held
* The BEFORE trigger locks the plan row, re-reads the value after the lock, keeps `old_value` and derives `lowered` itself (the caller cannot forge either). Null = Unlimited is handled in `lowered` and in the read. Seats can never be null (trigger + CHECK).
* Effective dates use whole months from the anchor (no day drift) and are stored, never recomputed. New firms on the plan get the new value at once. A firm that leaves the plan drops its kept value (joined by plan).
* The definer functions all pin `search_path` (pg_temp last) and are owned by xr_wall_reader. `platform_entitlement_limit` has PUBLIC revoked and EXECUTE for xr_app only.
* Cross-firm read, checked by probe: firm A's session gets 0 rows for firm B by id and by key, and 1 for itself. The test fails when the guard is removed.
* One live subscription: the existing `platform_subscription_one_live` index, tested, and an ENDED row is ignored.
* Both new tables are insert-only (rows and TRUNCATE). `platform_limit_change_firm` is behind PF-12's wall with the gate trigger. The BYPASS_USES line is named, and the walled-pool run passes.
* Scope: no route (waits on PF-4s), no runtime.ts edit, no booking (1b). The email follows SA-3-43. No creep beyond the brief.

### Not checked
* A live server route (none exists).
* A real mail provider.
* `prisma migrate diff`: I took the commit's word.
* The graph tool: not run, because it writes GRAPH.md and this part has no screen.

Reviewer: Changes requested
Fix list for 4c4e0f3d3: M1, M2, M3, M4 (M4 by code or by a recorded Lead decision), M5. m1 and m3-m6 are optional; m1 and m4 are one-liners.

## Part 2 re-review (ec04e138b)
Diff `4c4e0f3d3..ec04e138b` only (P-277), with the PF-15 reports left out: the migration, `limit-changes.ts`, `limits.ts` and `check_pf15_cases.ts`.
* **Suites at ec04e138b:** pf15_cases 51/0, pf15_limits 67/0, pf12_walls 100/0, pf3_platform_schema 75/0, pf4c 24/0. `tsc -p api/tsconfig.json` reports 0 errors.
* **Probes:** a scratch database with every migration, run as xr_studio, as xr_app in firm A's session, and as xr_app under `SET ROLE xr_staff_bypass`. Then mutation runs on a scratch copy. Both were removed afterwards.

### Earlier findings
* **M1 fixed.** The read now keeps the highest `old_value` over all pending lowerings (a null among them means Unlimited), then `greatest()` with today's value.
  * My earlier sequence (150→100, raise to 200, then 200→50 with a later renewal) now reads 200 at +1 day, 200 at +45 days and 50 at +51 days.
  * A lowering from Unlimited reads Unlimited, then 7.
  * A firm that left the plan and came back on a new subscription row reads today's value (`approved_at >= since`).
* **M2 fixed, with two small gaps.** Mutations now caught:
  * a kept value overriding a raise;
  * min instead of max;
  * the `since` filter dropped;
  * the seats guard off.
  * The two gaps are m8 and m9 below.
* **M3 fixed.** A raise writes `plan.limit.raised` once per firm live on the plan (tested). A plan with no live firm has only the change row as its record. The PR states this, and AuditPort needs a firm id, so this is acceptable.
* **M4: open as a "Question for the tech lead"**, recommending a separate small item. This is the resolution my finding allowed. No PR is open yet, so I could not see its body: the label step must check that the question is in it.
* **M5 fixed.**
  * xr_app in a firm session: INSERT and SELECT on `platform_limit_change` are denied, and a direct `seats_limit` update is refused. A same-value update still passes.
  * Under `SET ROLE xr_staff_bypass`: a direct seats update is refused, and a change row works.
  * A caller's `approved_at` of 2020 is replaced by `clock_timestamp()` after the plan lock.
  * Two changes at once: the second waited, and its `old_value` is the first change's `new_value`, in `approved_at` order.
  * The seats guard uses `session_user` or the `role` setting with `pg_trigger_depth() = 1`. Suites that write `seats_limit` connect as xr_studio, so they are unaffected.
* **m1 fixed:** the rollback note lists all four functions, the trigger and the owner step.
* **m3 fixed:** SELECT is revoked from the app.
* **m4 fixed:** `sendNotices` catches each send, lists failures, and is re-sendable under one idempotency key per change and Owner. Tested with mail down, then up.
* **m5 fixed:** per-metric words; the seats sentence is still SA-4-56's exactly.
* **m6 documented.** **m7 open** with Lead B (renewal question), as agreed.
* **The breaker's M2 and m2 hold.**
  * The renewal start (beginning near the target) matched the naive month loop on 200,000 random anchor and target pairs in UTC, month ends included: 0 mismatches.
  * Infinite dates fall back to `created_at`, and the functions pin `TimeZone = 'UTC'`.
* **`checkDowngrade`** now refuses a firm other than the session's (tested).

### New minors (not blocking)
* m8. The tests do not pin null dominance in a mixed set.
  * Removing `bool_or(old_value IS NULL)` leaves 51/0, because `max` over {null} is already null.
  * Fix: one case with Unlimited→100 and then 100→50 both pending. It must read Unlimited; without the rule it reads 100.
* m9. The "30 days to the second" test does not hit exact equality.
  * `approved_at` carries microseconds, so `WHILE at <= target` also passes. The code (`<`) is right; only the test name overstates.
  * Likewise, the parallel-changes test goes through the service, which takes the plan lock itself, so removing the trigger's own `FOR UPDATE` passes. My direct race at the role level held with the lock.

(ec04e138b on its own was ready for Approve. The verdict below is on the commit above it.)

### And 89ff016f1 (`git diff ec04e138b..89ff016f1`, the PF-15 reports left out)
* **The change:** one line in `platform_limit_change_firms`, `at := least(at, target + interval '1 month')`, plus one test.
  * It means a far-future anchor (the breaker's re-check: a firm's row set to `current_period_end = 9999-12-31`) can no longer keep the old value for ever.
  * It is applied before the millisecond rounding, and honest anchors at or before target + 1 month are unchanged.
* **Suites at 89ff016f1:** pf15_cases 52/0, pf15_limits 67/0, pf12_walls 100/0, pf3_platform_schema 75/0.
* **New minor m10 (with m7's renewal question to Lead B):** the cap also overrides a *genuine* later anchor.
  * A trial ending more than 60 days after approval (trials may run to 90 days), or a yearly period end, gets the lowering at approval + about 60 days.
  * That is before the firm's real first renewal.
  * This is consistent with the "monthly from the anchor" assumption already marked Unconfirmed, so it is not blocking. Name it in the same question.
  * Note: a firm session can write its own `current_period_end`. That is the root of the breaker's case, but it lies outside this diff.

Reviewer: Approve 89ff016f145e10227ae1dddde6cea41de4b0f59b
(One condition at the label step: the PR body carries M4's "Question for the tech lead". m8, m9 and m10 are optional.)

## Part 2 re-review on main (46f7e8b32)
Diff `89ff016f1..46f7e8b32` (P-277), with the PF-15 reports left out. Most of it is main's merge; I checked only part 2's own lines against `origin/main...46f7e8b32`.
* **m8 fixed (d3b376ee4).** The new case (Unlimited, then 3, then 2, both lowerings pending) fails when I remove the "any Unlimited wins" rule (52/1). Before, that mutation passed.
* **The re-stamp holds.**
  * Part 2's migration is now `20261119051500_pf15_limit_changes`, later than main's newest (`20261118230000`). The old `20261118200000_pf15_*` folder is gone.
  * Its content differs from 89ff016f1 in only two lines: the rollback note names 1a's new folder `20261118213000`, and EXECUTE on the 4-argument `platform_entitlement_limit` goes to `xr_app, xr_staff_bypass`.
  * That grant mirrors 1a's final grant on the 3-argument function. 1a's merged function changed only that grant since my last read, so the 4-argument replacement drops nothing.
* **The notice now names its Owner.** It passes `person: { kind: "STAFF", id }`, an optional `Subject` in `ports/mail.ts`, the PF-19r rule for a SERVICE email. check_pf19r_senders is 24/0.
* **MODULE.md:** part 2 has its own section after 1a's. The invariants it lists match the code reviewed.
* **Suites at 46f7e8b32:** pf15_cases 53/0, pf15_limits 69/0, pf12_walls 100/0, pf3_platform_schema 75/0, pf19r_senders 24/0.
* **No new findings.** M4 (the binding question in the PR body) remains the label-step condition. m9 and m10 are still optional.

Reviewer: Approve 46f7e8b3272657e0df279bdc092f5c9a111fe12e
