# PF-8b-f8 review (runtime lane): the Sample seeds as Amazon RDS's owner, no bypass role

Reviewed: PR #3097, branch `claude/runtime-pf8bf8`, head `ebb81df963775fefcdfc0a5b93ba3f82f1a7a2f0`, diff `origin/main...HEAD` (4 files under `prototype/studio/`). I did not build this. It is not a screen, so the screen-only parts of the skill (concept, D1-D20, BIC table, keyboard and zoom, graph) do not apply. I reviewed the code (5) and the check's faithfulness.

**Verdict: Block** (Rework in the skill's terms). One Blocker. The fix is small and targeted, not a redesign.

## What I ran (PG 18.3, `/usr/lib/postgresql/18/bin`, ports 15741 and 15743 only, clusters removed afterwards)
- `npx tsx tests/check_pf8b_f8_seeds_nobypass.ts 15741`: **12/12, exit 0** (about 19 s).
- My own probe (scratchpad, not committed). I set up a cluster in the check's RDS state: migrated as `xr_admin` BYPASSRLS, then NOBYPASSRLS, with `log_error_verbosity=terse`. Results:
  - `seedCreatedFirms` with real `firm.created` events. Firms: X active and unseeded, Y DELETED, W ABANDONED, Z active and already seeded. Run as the owner on `xr_rds` and as the superuser on its twin: both returned the list `[X, seeded]`, with no failures. A second run returned 0 and 0. So the two paths give the same list.
  - The API's walled client (`walledPool`, `xr_app`, `wallUnscopedQueries()`), in a transaction scoped to firm A by `withFirm(A)`. See B1.
  - On the same pooled connection, the next query as A reads `app.firm_id = A`, so the local `set_config` reverts at commit as intended.
  - Plain `tsx` (without `--tsconfig`): `firm-seed.ts` exits 0 as the owner. `seed-sample-firms.ts` fails on decorators, as the new header line says.
- `tsc -p api/tsconfig.json`: no error in the four changed files.
- Not run: the 54329-bound suites (`check_fo1p_person_port`, `check_fo2p3b_arrival_port`, `check_pf12_walls`, …) hardcode a port outside my range. The builder reports pf12_walls 110/110, pf12b_bypass_audit 70/70, pf5t 42/42, fo9a 53/53 and pf3 75/75 at this head. The PR is a draft, so the full CI has not run.

## Blocker
**B1. `firmInTransaction` is called inside two shared app functions, so in the running app (`xr_app`) any caller now moves its own transaction to whichever firm it passes in. This weakens PF-12's walls for the app role.**
- Where: `api/src/front-office/firm-seed.ts:99` (`seedFirmFrontOffice`) and `:142` (`ensureBookingWording`).
- Both functions run inside request transactions:
  - `sales/arrival-port.ts:100-101,138`
  - `assignment/rules.ts:62`
  - `people/fo-person-port.ts:64`
  - `booking-seed.ts:92`
- Probe as `xr_app`, in a transaction where `withFirm(A)` is active:
  - Before the call, the transaction reads firm V's row as not found. The walls hold, and on main `seedFirmFrontOffice` would throw "is no platform firm" at that read.
  - `seedFirmFrontOffice(tx, V)` then returns `seeded: true, stages: 16, reasons: 14, webForms: 1`, and writes them into V. The superuser view confirms 16 stages and 1 setup row for V.
  - For the rest of the caller's transaction, `current_setting('app.firm_id')` is V. Firm A's own row now reads as not found.
  - With no firm scope at all (a door before it has resolved its firm), `ensureBookingWording(tx, V)` wrote V's wording (`true`).
- Why it matters:
  - The walls exist so that a wrong firm id in code is refused by the database (MODULE card: "each query runs as its caller's firm … crossing firms only through `asBypass`"; Do not: "set `app.firm_id` … outside `firm-scope.ts`").
  - The helper sits in `firm-scope.ts`, but the firm it sets comes from an arbitrary caller's parameter, not from the request, job or door scope.
  - Every caller passes its own firm today, so I found no exploitable path. But the safety net is gone for these four app paths.
  - The PR says "for a superuser or BYPASSRLS runner nothing changes", but says nothing about `xr_app`.
- Fix:
  - Keep `seedFirmFrontOffice` and `ensureBookingWording` as on main.
  - Set the firm only in the seed-command paths, each in its own fresh transaction: `seedSampleFirmsFrontOffice`, `onFirmCreated` (FO's, used only by `seedCreatedFirms` and the command), `seedSampleFirms` and `seedSampleSettings`.
  - Make `firmInTransaction` refuse (or do nothing) whenever a firm-scope store exists or `unscopedMode() === "walled"`. That way only a tool or seed process that holds the owner's address can use it. The demo reset under `asBypass` stays a no-op either way, because BYPASSRLS ignores `app.firm_id`.
  - Add a fail case to the F8 check: as `xr_app` in firm A's transaction, `seedFirmFrontOffice(tx, B)` and `ensureBookingWording(tx, B)` are still refused, and A's rows stay readable afterwards.

## Majors
None besides B1.

## Minors
- m1. The check never exercises `unseededAsEachFirm` with data. The Sample firms raise no `firm.created`, so the owner's `seedCreatedFirms` runs on an empty list. If that function returned every firm, or none, the check would still pass. My probe shows it is correct today. Add events for an active firm, a DELETED firm and an already-seeded firm, and compare the owner's run with the superuser's (`firm-seed.ts:162-198`).
- m2. `unmatchedCaseFirmKeys` runs with firm `''` as the owner (`seed-sample-firms.ts:110`). It reads no `platform_firm` row, so on RDS it would list every case firm key as unmatched (unless `runtime_case` is also walled). The output is wrong. The PR acknowledges this. Cheap fix: check each key through `platform_firm_of_key`.
- m3. As the owner, a Sample actor id held by another firm is invisible (`seed-sample-firms.ts:93`). The run then fails on the unique key, where the superuser's run skips that person. So the two paths diverge. Acknowledged in the PR. Sample data does not hit it.
- m4. In the demo reset, `ensureBookingWording` inside `then` sets `app.firm_id` back to the Sample firm, undoing line 108's reset for the rest of `then`. There is no effect under BYPASSRLS. B1's fix removes it.
- m5. `firm-scope.ts` gains two exported helpers, and the effective rule on who sets `app.firm_id` changes. The api-platform MODULE card is not updated, and the PR body has no `Card unchanged: <reason>` line (P-615). The module-cards job is still running.
- m6. This is outside the row's Done-when, noted for a later row. The start-up seed's third step, `seedSampleConsultationType` (`identity/sample-seed.ts:34` → `booking-seed.ts:81`), still reads `platform_firm` by key with no firm. As the RDS owner with `PLATFORM_SAMPLE_SEED=on` (staging), it would log "no firm sample-firm yet" instead of adding the type.

## What holds (independently checked)
- **seed-sample-firms:**
  - Each firm is found through the definer lookup before its context is set. A new firm gets its uuid first.
  - Every later read and write of that firm happens after `firmInTransaction` in the same `$transaction`. Prisma keeps one connection per interactive transaction, so the local setting applies.
  - The reads before any context are of tables with no wall: setting definitions, terms versions, `to_regprocedure`.
  - The context is cleared before `then`.
- `seedSampleSettings` sets one firm per transaction.
- `platform_firm_of_key` is executable by `xr_admin` through the INHERIT membership in `xr_wall_reader` that PF-12 grants. After F5 the RDS branch grants the same membership, so the check's state matches RDS for this point.
- **The superuser path:**
  - Same rows. The snapshot of natural keys and audit count is identical between the owner's run and the superuser's.
  - `seedCreatedFirms` keeps its cross-firm query unchanged.
  - The Sample lookup is in sorted key order, the same as `orderBy key asc`.
- `is_local` reverts to WalledPool's session value at commit, and the `c[SET]` cache stays true.
- **Idempotence:** a second run adds nothing and the snapshot is identical.
- **No bypass role:** the fail half shows the owner is still refused a firm row with no firm (42501) and reads no staff.
- **The check:** it migrates with BYPASSRLS and then removes it, which models RDS's admin after migrations. On main it fails 4/12 with the AWS error (builder's run; I did not repeat it).

## Journey test (reviewer role; the operator's journey, since there is no screen)
The journey: an operator runs `seed-sample-firms.ts` and then `firm-seed.ts` as the RDS-like owner, runs both again, and inspects the result. Accessibility, screen sizes and visual quality are N/A (command line).

| criterion | score | evidence |
|---|---|---|
| task completed | 1 | both exit 0, JSON summary |
| next step obvious | 1 | the header run line names `--tsconfig` |
| plain words | ½ | m2: the unmatched list is wrong as the owner |
| feedback and state | 1 | counts per kind; `missing` and `failed` named |
| correct data | 1 | snapshot identical to the superuser's |
| error recovery | 1 | re-run is a no-op; one firm's failure is named, the others run |
| speed | 1 | seconds per run |
| trust and sources | 1 | all values Sample |
| accessibility, screen sizes, visual | N/A | no UI |

**Score: 7.5/8 applicable = 9.4/10, pass.** This covers the operator's journey only. It does not offset B1, which a journey cannot see.

## Could not check
- Real RDS 18.3.
- The 54329-bound suites.
- Main's 4/12 failure (the builder's evidence).

Blockers: B1 · Majors: none · Minors: m1-m6

Reviewer: Block ebb81df963775fefcdfc0a5b93ba3f82f1a7a2f0

## Round 2: diff-only re-review, `ebb81df96..0528e40225e688535d6c0ab5460b37d54d449b3a`

**Verdict: Approve.** B1 is closed. No Blocker or Major is open.

### What I ran (PG 18.3, ports 15741 and 15743, clusters removed afterwards)
- `npx tsx tests/check_pf8b_f8_seeds_nobypass.ts 15741`: **15/15, exit 0.** The three new checks are the catch-up with data (m1) and the two B1 checks.
- I re-ran my round-1 probe on the new code, using the API's `walledPool` as `xr_app` with `wallUnscopedQueries()`:
  - `withFirm(A)` then `seedFirmFrontOffice(tx, V)` now throws `firm-seed: V is no platform firm`, and V has 0 stages and 0 setup rows (superuser view). The next pooled query as A reads A.
  - With no scope, `ensureBookingWording(tx, V)` is refused: 42501 on `msg_firm`.
  - The catch-up with firm X active, Y DELETED, W ABANDONED and Z already seeded gives the same list as owner and as superuser (`[X, seeded]`). A second run gives 0 and 0.

### B1: resolved
- `seedFirmFrontOffice` and `ensureBookingWording` are byte-identical to main again, so the four app paths keep their caller's firm and the walls catch a wrong firm id.
- The firm is now set only in fresh transactions opened by the seed paths:
  - `seedSampleFirmsFrontOffice`;
  - `seedCreatedFirms` through `seedAsFirm`;
  - `seedSampleFirms` and `seedSampleSettings`, unchanged from round 1.
- `seedAsFirm` drops `onFirmCreated`'s type check. That is equivalent, because `seedCreatedFirms` always passed `firm.created`. `onFirmCreated` itself is unchanged.
- `firmInTransaction` refuses when a firm-scope store exists without a bypass use. That covers a request, a job's `withFirm`, a door's `enterFirm` and the case opening.
  - The demo reset (`asBypass("platform.demo.reset")`) still passes. The breaker's demo run showed it unaffected.
  - The start-up seed (`main.ts:239`, its own owner client, no scope) still passes.
  - A heuristic search found no test that calls a seed inside `withFirm`, `inRequest` or `asJob`.
- The fail cases would fail on round 1:
  - `seedFirmFrontOffice(tx, NEW)` in A's scope returned seeded there; the check now expects "no platform firm".
  - `firmInTransaction` had no guard; the check now expects the refusal.
  - The test simulates `WalledPool` with a plain `xr_app` client plus a local `set_config`. For this purpose that is equivalent.

### Round-1 minors
- m1: closed. The check now has a `firm.created` firm seeded by the owner, then a second run that seeds nothing, with 16 stages counted.
- m5: closed. `MODULE.rows/PF-8b-f8.md` exists in both modules and states the helper's limits. This was also the breaker's M2.
- m2, m3, m6: open, as acknowledged in the PR. m3 is the breaker's m1. m6 is outside the row.
- m4: closed by the fix. The app's `ensureBookingWording` no longer sets the firm.

### New minor (non-blocking)
- **m7.** The guard reads only the JS scope. In the API process with no scope, `firmInTransaction` on the walled `xr_app` client still switches the firm. My probe: with `unscopedMode` walled and no store, `firmInTransaction(tx, X)` was followed by a read that found X's `platform_firm` row (`seesx: 1`, `current_user = xr_app`).
  - No caller reaches this today. Only the seed functions call it: the start-up seed uses the owner's client, and the demo runs under bypass.
  - Hardening, so it never depends on call sites: refuse in SQL when `current_user = 'xr_app'` (`APP_ROLE`). Under bypass, `current_user` is `xr_staff_bypass`; the owner and the superuser are unaffected. The builder's reason for not keying on `unscopedMode` (the start-up seed) does not apply to a role check.

### Could not check
The suites bound to port 54329. The PR is a draft, so the full CI runs when it is marked ready.

Blockers: none · Majors: none · Minors: m2, m3, m6, m7 open

Reviewer: Approve 0528e40225e688535d6c0ab5460b37d54d449b3a
