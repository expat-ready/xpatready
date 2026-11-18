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
